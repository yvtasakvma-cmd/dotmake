import { useEffect, useRef, useState } from 'react';
import { loadPalette, savePalette } from './storage';

export function usePalette() {
  const [colors, setColors] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('追加色を読み込み中…');
  const [failed, setFailed] = useState(false);
  const writing = useRef(false);

  useEffect(() => {
    let active = true;
    void loadPalette().then((saved) => {
      if (active) { setColors(saved); setReady(true); setMessage(''); }
    }).catch(() => {
      if (active) { setFailed(true); setMessage('追加色を読めません。既存のパレットを保護するため追加・削除を停止しています。'); }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  const update = async (next: string[]) => {
    if (!ready || writing.current) return;
    writing.current = true; setBusy(true); setMessage('パレットを保存中…');
    try {
      await savePalette(next);
      setColors(next); setFailed(false); setMessage('パレットを保存しました');
    } catch {
      setFailed(true); setMessage('パレットを保存できませんでした。もう一度お試しください。');
    } finally { writing.current = false; setBusy(false); }
  };
  return {
    colors, ready, busy, message, failed,
    reload: async () => { const saved = await loadPalette(); setColors(saved); setFailed(false); setReady(true); setMessage(''); },
    add: (color: string) => {
      const hex = color.toLowerCase();
      if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(hex) && !colors.includes(hex)) void update([...colors, hex]);
    },
    remove: (color: string) => { void update(colors.filter((item) => item !== color.toLowerCase())); },
  };
}
