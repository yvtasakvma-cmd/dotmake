import { useEffect, useRef, useState } from 'react';
import { loadGitHubConfig, storeGitHubConfig, synchronizeGitHub, type GitHubConfig } from './githubSync';
import { STORAGE_CHANGED } from './storage';

export function useGitHubSync({ enabled, paused, execute }: {
  enabled: boolean; paused: boolean;
  execute: (operation: () => ReturnType<typeof synchronizeGitHub>) => ReturnType<typeof synchronizeGitHub>;
}) {
  const [config, setConfig] = useState(loadGitHubConfig);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(true);
  const running = useRef(false);
  const dirty = useRef(true);
  const dirtyAt = useRef(Date.now());
  const pollAt = useRef(0);
  const blocked = useRef(false);

  const run = async (candidate = config) => {
    if (!candidate || running.current || !enabled) return false;
    running.current = true; setBusy(true); setFailed(false); setMessage('GitHubと同期中…');
    try {
      const result = await execute(() => synchronizeGitHub(candidate));
      dirty.current = false; blocked.current = false; pollAt.current = Date.now() + 60000;
      setPending(false);
      setMessage(result.conflicts ? `同期しました。${result.conflicts}件の競合があり、変更された作品を保持しました。両方を編集した作品は「（端末の変更）」付きのコピーも一覧にあります。` : `GitHubに同期済み（${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}）`);
      return true;
    } catch (error) {
      blocked.current = true; setFailed(true); setPending(true);
      setMessage(error instanceof Error ? error.message : 'GitHub保存に失敗しました。端末の作品は保持しています。');
      return false;
    } finally { running.current = false; setBusy(false); }
  };
  const latest = useRef({ enabled, paused, run });
  latest.current = { enabled, paused, run };

  useEffect(() => {
    dirty.current = true; blocked.current = false; pollAt.current = 0; setPending(true);
    if (!config) return;
    const changed = () => { dirty.current = true; dirtyAt.current = Date.now(); setPending(true); };
    const wake = () => { pollAt.current = 0; blocked.current = false; };
    const tick = () => {
      const current = latest.current;
      if (!current.enabled || current.paused || running.current || blocked.current || document.visibilityState !== 'visible' || !navigator.onLine) return;
      if (Date.now() >= pollAt.current || (dirty.current && Date.now() - dirtyAt.current >= 15000)) void current.run(config);
    };
    const timer = window.setInterval(tick, 1000);
    window.addEventListener(STORAGE_CHANGED, changed);
    window.addEventListener('online', wake);
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      clearInterval(timer);
      window.removeEventListener(STORAGE_CHANGED, changed);
      window.removeEventListener('online', wake);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [config]);

  return {
    config, busy, failed, pending, message, run,
    configure: async (candidate: GitHubConfig) => {
      storeGitHubConfig(candidate); setConfig(candidate);
      return run(candidate);
    },
    disconnect: () => { storeGitHubConfig(null); setConfig(null); setMessage('GitHubとの接続を解除しました。作品は端末とGitHubに残っています。'); setFailed(false); },
  };
}
