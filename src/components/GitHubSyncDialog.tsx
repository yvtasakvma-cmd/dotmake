import { useEffect, useRef, useState } from 'react';
import { validateGitHubConfig, type GitHubConfig } from '../io/githubSync';

export function GitHubSyncDialog({ config, busy, message, failed, onConfigure, onDisconnect, onClose }: {
  config: GitHubConfig | null; busy: boolean; message: string; failed: boolean;
  onConfigure: (config: GitHubConfig) => Promise<boolean>; onDisconnect: () => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [repository, setRepository] = useState(config?.repository || 'yvtasakvma-cmd/pixel-studio-data');
  const [token, setToken] = useState(config?.token || '');
  const [remember, setRemember] = useState(config?.remember || false);
  const [error, setError] = useState('');
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={dialog} className="github-dialog" aria-labelledby="github-title" onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <h2 id="github-title">GitHub保存の設定</h2>
    <p>同じ保存先をiPhoneとPCに設定すると、キャラクター全12コマと追加色を共有できます。</p>
    <details className="github-help"><summary>初回の設定手順</summary>
      <ol>
        <li><a href="https://github.com/new" target="_blank" rel="noreferrer">GitHubで保存用リポジトリを作成</a>。「Private」を選び、「Add README」を有効にしてください。名前の例：pixel-studio-data。</li>
        <li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">Fine-grained tokenを作成</a>。「Only select repositories」で保存用リポジトリだけを選び、Repository permissionsの「Contents」を「Read and write」にします。有効期限も設定してください。</li>
        <li>下の欄に保存先とトークンを入力して「接続して同期」。他の端末でも同じ保存先を設定します。トークンは端末ごとに作っても構いません。</li>
      </ol>
      <p>トークンはこの画面に入力してください。チャットや公開コードには貼り付けないでください。</p>
    </details>
    <form onSubmit={(event) => {
      event.preventDefault(); setError('');
      try { const candidate = validateGitHubConfig(repository, token, remember); void onConfigure(candidate).catch(() => setError('接続設定をこのブラウザに保存できませんでした。ストレージ設定を確認してください。')); }
      catch (failure) { setError(failure instanceof Error ? failure.message : '入力を確認してください。'); }
    }}>
      <label>保存先（所有者/リポジトリ）<input autoCapitalize="none" autoCorrect="off" spellCheck={false} required value={repository} disabled={busy} onChange={(e) => setRepository(e.target.value)} /></label>
      <label>アクセストークン<input type="password" autoComplete="new-password" autoCapitalize="none" spellCheck={false} required value={token} disabled={busy} onChange={(e) => setToken(e.target.value)} /></label>
      <label className="github-remember"><input type="checkbox" checked={remember} disabled={busy} onChange={(e) => setRemember(e.target.checked)} />この端末にトークンを保存する</label>
      <p className="palette-hint">チェックしない場合は、このタブを閉じると再入力が必要です。保存した場合も、トークンはこのブラウザ内だけに保持します。</p>
      <p className="palette-hint">編集画面では自動同期しません。一覧・メニューに戻ると同期します。編集画面から送る場合や、端末を切り替える前は「今すぐ同期」で完了を確認してください。端末内への自動保存は続きます。</p>
      {(error || message) && <p className={error || failed ? 'error' : ''} role={error || failed ? 'alert' : 'status'}>{error || message}</p>}
      <div className="dialog-actions"><button type="submit" className="primary" disabled={busy}>{busy ? '同期中…' : '接続して同期'}</button>{config && <button type="button" disabled={busy} onClick={() => { onDisconnect(); setToken(''); }}>接続を解除</button>}<button type="button" disabled={busy} onClick={onClose}>閉じる</button></div>
    </form>
  </dialog>;
}
