import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createCharacter } from '../model/document';
import { applySyncState, readSyncState } from './storage';
import { synchronizeGitHub, type GitHubConfig } from './githubSync';
import { bytesToBase64, emptySnapshot, encodeProject, type SyncSnapshot } from './syncSnapshot';

vi.mock('./storage', () => ({ readSyncState: vi.fn(), applySyncState: vi.fn() }));
const config: GitHubConfig = { repository: 'owner/artwork', token: 'github_pat_fake_token_for_tests', remember: false };
const sha = 'a'.repeat(40);
const fetchMock = vi.fn<typeof fetch>();
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function remote(snapshot: SyncSnapshot) {
  return json({ type: 'file', sha, size: JSON.stringify(snapshot).length, encoding: 'base64', content: bytesToBase64(new TextEncoder().encode(JSON.stringify(snapshot))) });
}
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(readSyncState).mockResolvedValue({ snapshot: emptySnapshot(), base: emptySnapshot(), revision: 7 });
  vi.mocked(applySyncState).mockResolvedValue();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); fetchMock.mockReset(); });

it('creates a missing snapshot with only artwork and no credentials', async () => {
  fetchMock.mockResolvedValueOnce(json({ private: true, default_branch: 'main' })).mockResolvedValueOnce(json({}, 404)).mockResolvedValueOnce(json({}, 201));
  await synchronizeGitHub(config);
  const [url, options] = fetchMock.mock.calls[2];
  expect(url).toContain('/contents/pixel-studio/library.json');
  const body = JSON.parse(options!.body as string);
  expect(body.sha).toBeUndefined();
  expect(atob(body.content)).toBe(JSON.stringify(emptySnapshot()));
  expect(JSON.stringify(body)).not.toContain(config.token);
  expect(applySyncState).toHaveBeenCalledWith(config.repository, 7, emptySnapshot(), emptySnapshot());
});

it('refuses a public repository before reading or uploading artwork', async () => {
  fetchMock.mockResolvedValueOnce(json({ private: false, default_branch: 'main' }));
  await expect(synchronizeGitHub(config)).rejects.toThrow('非公開');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(applySyncState).not.toHaveBeenCalled();
});

it.each([401, 403, 500])('retains the local library and base after HTTP %s', async (status) => {
  fetchMock.mockResolvedValueOnce(json({}, status));
  await expect(synchronizeGitHub(config)).rejects.toThrow();
  expect(applySyncState).not.toHaveBeenCalled();
});

it('never advances the base if an upload fails', async () => {
  fetchMock.mockResolvedValueOnce(json({ private: true, default_branch: 'main' })).mockResolvedValueOnce(json({}, 404)).mockResolvedValueOnce(json({}, 500));
  await expect(synchronizeGitHub(config)).rejects.toThrow();
  expect(applySyncState).not.toHaveBeenCalled();
});

it('re-reads after a concurrent commit and preserves the other device artwork', async () => {
  const local = { ...emptySnapshot(), projects: [encodeProject({ ...createCharacter(2, 2, '端末'), id: 'local', updatedAt: 1 })] };
  const other = { ...emptySnapshot(), projects: [encodeProject({ ...createCharacter(2, 2, '別端末'), id: 'remote', updatedAt: 2 })] };
  vi.mocked(readSyncState).mockResolvedValue({ snapshot: local, base: emptySnapshot(), revision: 7 });
  fetchMock.mockResolvedValueOnce(json({ private: true, default_branch: 'main' }))
    .mockResolvedValueOnce(remote(emptySnapshot())).mockResolvedValueOnce(json({}, 409))
    .mockResolvedValueOnce(remote(other)).mockResolvedValueOnce(json({}, 200));
  await synchronizeGitHub(config);
  expect(fetchMock).toHaveBeenCalledTimes(5);
  expect(applySyncState).toHaveBeenCalledWith(config.repository, 7, local, expect.objectContaining({ projects: [...local.projects, ...other.projects] }));
  expect(JSON.parse(fetchMock.mock.calls[4][1]!.body as string).sha).toBe(sha);
});

it('reads a large file via immutable blob SHA and avoids a no-op upload', async () => {
  fetchMock.mockResolvedValueOnce(json({ private: true, default_branch: 'main' }))
    .mockResolvedValueOnce(json({ type: 'file', sha, size: 1200000, encoding: 'none' }))
    .mockResolvedValueOnce(new Response(JSON.stringify(emptySnapshot())));
  await synchronizeGitHub(config);
  expect(fetchMock.mock.calls[2][0]).toContain(`/git/blobs/${sha}`);
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

it('refuses malformed remote data before any upload or local replacement', async () => {
  fetchMock.mockResolvedValueOnce(json({ private: true, default_branch: 'main' })).mockResolvedValueOnce(remote({ ...emptySnapshot(), version: 99 } as unknown as SyncSnapshot));
  await expect(synchronizeGitHub(config)).rejects.toThrow('読み取れません');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(applySyncState).not.toHaveBeenCalled();
});

it('does not interpret disappearance of an established sync file as mass deletion', async () => {
  vi.mocked(readSyncState).mockResolvedValue({ snapshot: emptySnapshot(), base: { ...emptySnapshot(), palette: ['#000000'] }, revision: 7 });
  fetchMock.mockResolvedValueOnce(json({ private: true, default_branch: 'main' })).mockResolvedValueOnce(json({}, 404));
  await expect(synchronizeGitHub(config)).rejects.toThrow('見つかりません');
  expect(applySyncState).not.toHaveBeenCalled();
});
