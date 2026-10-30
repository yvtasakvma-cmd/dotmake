import { useEffect, useRef } from 'react';
import { Icon } from './Icon';
import type { Tool } from '../model/document';

export function QuickTools({ tool, disabled, mobile, onSelect, onSize }: {
  tool: Tool; disabled: boolean; mobile: boolean; onSelect: (tool: Tool) => void; onSize: (tool: 'pen' | 'eraser') => void;
}) {
  const hold = useRef<{ timer: number; x: number; y: number; ready: boolean } | null>(null);
  const held = useRef(false);
  const opening = useRef<number | null>(null);
  const cancel = () => { if (hold.current) window.clearTimeout(hold.current.timer); hold.current = null; };
  useEffect(() => {
    const clear = () => { cancel(); if (opening.current !== null) window.clearTimeout(opening.current); opening.current = null; };
    if (disabled) clear();
    return clear;
  }, [disabled, mobile]);
  return <div className={`canvas-quick-tools ${mobile ? 'mobile-quick-tools' : ''}`} role="group" aria-label={mobile ? 'パレット上のツール' : 'キャンバス横のツール'}>
    {(['pen', 'picker', 'eraser'] as const).map(value => {
      const label = value === 'pen' ? 'ペン' : value === 'picker' ? 'スポイト' : '消しゴム';
      return <button key={value} className={`tool-button ${tool === value ? 'selected' : ''}`} aria-label={label} aria-pressed={tool === value} disabled={disabled}
        title={mobile && value !== 'picker' ? `${label}（長押しで太さ）` : label}
        onContextMenu={event => event.preventDefault()}
        onPointerDown={event => {
          cancel(); held.current = false;
          if (!mobile || disabled || value === 'picker' || event.button !== 0) return;
          hold.current = { x: event.clientX, y: event.clientY, ready: false, timer: window.setTimeout(() => {
            if (hold.current) hold.current.ready = true;
          }, 500) };
        }}
        onPointerMove={event => { if (hold.current && Math.hypot(event.clientX - hold.current.x, event.clientY - hold.current.y) > 10) cancel(); }}
        onPointerUp={event => {
          const ready = hold.current?.ready; cancel();
          if (ready && value !== 'picker') {
            event.preventDefault(); held.current = true;
            // Let the touch's compatibility click finish before mounting a dialog under it.
            opening.current = window.setTimeout(() => { opening.current = null; onSize(value); }, 100);
          }
        }} onPointerCancel={cancel} onPointerLeave={cancel}
        onClick={() => { if (!held.current) onSelect(value); held.current = false; }}>
        <Icon name={value} size={22} /><span>{label}</span>
      </button>;
    })}
  </div>;
}
