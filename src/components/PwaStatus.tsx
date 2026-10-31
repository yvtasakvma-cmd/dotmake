import { useRegisterSW } from 'virtual:pwa-register/react';
import { useState } from 'react';

export function PwaStatus({ canUpdate }: { canUpdate: boolean }) {
  const [error, setError] = useState(false);
  const { needRefresh: [needRefresh], offlineReady: [offlineReady], updateServiceWorker } = useRegisterSW({ onRegisterError: () => setError(true) });
  return <div className="pwa-status">
    {needRefresh && <p role="status">新しいバージョンがあります。<button disabled={!canUpdate} onClick={() => { void updateServiceWorker(true).catch(() => setError(true)); }}>保存して更新</button></p>}
    {offlineReady && <p role="status">オフラインで使用できます。</p>}
    {error && <p role="alert">オフライン機能を準備できませんでした。オンラインで開き直してください。</p>}
    <details><summary>アプリとして使う</summary><p>iPhone：Safariの共有メニューから「ホーム画面に追加」。Windows：Edge／Chromeのインストール操作を使用します。初回は通信が必要です。</p></details>
    <p className="app-version">Pixel Studio v{__APP_VERSION__}</p>
  </div>;
}
