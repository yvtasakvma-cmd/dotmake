import { applySyncState, readSyncState } from './storage';
import { base64ToBytes, bytesToBase64, emptySnapshot, MAX_SYNC_BYTES, mergeSnapshots, parseSnapshot, sameSnapshot, type SyncSnapshot } from './syncSnapshot';

export interface GitHubConfig { repository: string; token: string; remember: boolean }
export const SYNC_PATH = 'pixel-studio/library.json';
const SETTINGS_KEY = 'pixel-studio-github';
export function validateGitHubConfig(repository: string, token: string, remember: boolean): GitHubConfig {
  const repo = repository.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9_.-]{1,100}$/.test(repo) || ['.', '..'].includes(repo.split('/')[1])) throw new Error('保存先を「所有者/リポジトリ名」の形で入力してください。');
  if (!/^[a-zA-Z0-9_]{10,255}$/.test(token.trim())) throw new Error('GitHubのアクセストークンを入力してください。');
  return { repository: repo, token: token.trim(), remember };
}
export function loadGitHubConfig(): GitHubConfig | null {
  try {
    const raw = sessionStorage.getItem(SETTINGS_KEY) || localStorage.getItem(SETTINGS_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as GitHubConfig;
    return validateGitHubConfig(value.repository, value.token, value.remember === true);
  } catch { return null; }
}
export function storeGitHubConfig(config: GitHubConfig | null) {
  // Remove a remembered credential when the user switches to session-only mode.
  localStorage.removeItem(SETTINGS_KEY);
  sessionStorage.removeItem(SETTINGS_KEY);
  if (config) (config.remember ? localStorage : sessionStorage).setItem(SETTINGS_KEY, JSON.stringify(config));
}

class GitHubRequestError extends Error {
  constructor(readonly status: number) {
    super(status === 401 ? 'トークンが無効か期限切れです。GitHub保存の設定を確認してください。'
      : status === 403 ? 'GitHubへのアクセスが制限されています。トークンのContents読み書き権限・承認・API利用上限を確認してください。'
      : status === 404 ? '保存先に接続できません。リポジトリ名とトークンの対象リポジトリを確認してください。'
      : `GitHub保存に失敗しました（${status}）。端末の作品は保持しています。`);
  }
}

async function request(config: GitHubConfig, path: string, init: RequestInit = {}) {
  try {
    const response = await fetch(`https://api.github.com/repos/${config.repository}${path}`, {
      ...init,
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${config.token}`, 'X-GitHub-Api-Version': '2022-11-28', ...init.headers },
      cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new GitHubRequestError(response.status);
    return response;
  } catch (error) {
    if (error instanceof GitHubRequestError) throw error;
    throw new Error('GitHubに接続できません。端末には保存されています。通信が戻ったら再同期してください。');
  }
}

async function readRemote(config: GitHubConfig, branch: string): Promise<{ snapshot: SyncSnapshot; sha?: string }> {
  let response: Response;
  try { response = await request(config, `/contents/${SYNC_PATH}?ref=${encodeURIComponent(branch)}`, { headers: { Accept: 'application/vnd.github.object+json' } }); }
  catch (error) { if (error instanceof GitHubRequestError && error.status === 404) return { snapshot: emptySnapshot() }; throw error; }
  const file = await response.json() as { type?: string; sha?: string; size?: number; content?: string; encoding?: string };
  if (file.type !== 'file' || !file.sha || !/^[a-f0-9]{40,64}$/.test(file.sha) || !Number.isFinite(file.size) || file.size! > MAX_SYNC_BYTES) throw new Error('GitHubの保存ファイルの形式またはサイズを確認してください。同期上限は20MBです。');
  // Contents omits base64 data above 1MB. Read the immutable blob by its SHA,
  // never a moving branch URL, so this snapshot matches the optimistic lock.
  const text = file.encoding === 'base64' && typeof file.content === 'string'
    ? new TextDecoder('utf-8', { fatal: true }).decode(base64ToBytes(file.content))
    : await (await request(config, `/git/blobs/${file.sha}`, { headers: { Accept: 'application/vnd.github.raw+json' } })).text();
  return { snapshot: parseSnapshot(text), sha: file.sha };
}

export async function synchronizeGitHub(config: GitHubConfig): Promise<{ conflicts: number; projects: number }> {
  const repository = await (await request(config, '')).json() as { private?: boolean; default_branch?: string; permissions?: { push?: boolean } };
  if (repository.private !== true) throw new Error('作品の保存先には非公開（Private）のリポジトリを指定してください。公開リポジトリには保存しません。');
  if (repository.permissions?.push === false) throw new Error('保存先の書き込み権限がありません。ContentsをRead and writeに設定してください。');
  const branch = repository.default_branch;
  if (!branch) throw new Error('保存先にREADMEを作成してから再接続してください。');
  const local = await readSyncState(config.repository);
  // Retry only GitHub optimistic-lock conflicts. Never blindly overwrite a
  // concurrent commit, and never advance the local base before a successful PUT.
  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = await readRemote(config, branch);
    if (!remote.sha && (local.base.projects.length || local.base.palette.length)) throw new Error('GitHubの同期ファイルが見つかりません。削除やブランチ変更を確認してください。端末の作品は保持しています。');
    const merged = mergeSnapshots(local.base, local.snapshot, remote.snapshot);
    const snapshot = parseSnapshot(JSON.stringify(merged.snapshot));
    const { conflicts } = merged;
    const text = JSON.stringify(snapshot);
    if (new TextEncoder().encode(text).byteLength > MAX_SYNC_BYTES) throw new Error('同期データが20MBを超えています。端末の作品は保持しています。');
    if (!remote.sha || !sameSnapshot(snapshot, remote.snapshot)) {
      try {
        await request(config, `/contents/${SYNC_PATH}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: 'Save Pixel Studio artwork', branch, ...(remote.sha ? { sha: remote.sha } : {}), content: bytesToBase64(new TextEncoder().encode(text)) }),
        });
      } catch (error) {
        if (error instanceof GitHubRequestError && [409, 422].includes(error.status)) continue;
        throw error;
      }
    }
    await applySyncState(config.repository, local.revision, local.snapshot, snapshot);
    return { conflicts, projects: snapshot.projects.length };
  }
  throw new Error('別の端末の保存と重なりました。端末の作品は保持しています。少し待って再同期してください。');
}
