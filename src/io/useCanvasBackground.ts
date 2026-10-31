import { useState } from 'react';
import { DEFAULT_BACKGROUND, type CanvasBackground } from '../model/view';

const KEY = 'pixel-studio-canvas-background';
function load(): CanvasBackground {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (value && typeof value === 'object') {
      const saved = value as Partial<CanvasBackground>;
      if ((saved.mode === 'checker' || saved.mode === 'solid') && typeof saved.color === 'string' && /^#[0-9a-f]{6}$/i.test(saved.color)) return { mode: saved.mode, color: saved.color.toLowerCase() };
    }
  } catch { /* View preferences never block opening the artwork. */ }
  return { ...DEFAULT_BACKGROUND };
}

export function useCanvasBackground() {
  const [background, setBackground] = useState(load);
  const [warning, setWarning] = useState('');
  return {
    background, warning,
    update: (next: CanvasBackground) => {
      setBackground(next);
      try { localStorage.setItem(KEY, JSON.stringify(next)); setWarning(''); }
      catch { setWarning('背景設定をこの端末に保存できませんでした。今回の表示には反映しています。'); }
    },
  };
}
