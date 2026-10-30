import { useEffect, useRef } from 'react';
import type { GuideMode } from '../drawing/guides';

const MODES: { value: GuideMode; label: string }[] = [
  { value: 'off', label: '非表示' }, { value: 'both', label: '縦・横' },
  { value: 'vertical', label: '縦のみ' }, { value: 'horizontal', label: '横のみ' },
];

export function GuideDialog({ gridMode, centerMode, onGrid, onCenter, onClose }: {
  gridMode: GuideMode; centerMode: GuideMode;
  onGrid: (mode: GuideMode) => void; onCenter: (mode: GuideMode) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="guide-dialog" aria-labelledby="guide-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <h2 id="guide-title">補助線の設定</h2>
    <div className="setting-fields">{[
      { label: 'グリッドの向き', value: gridMode, onChange: onGrid },
      { label: '中心線', value: centerMode, onChange: onCenter },
    ].map(({ label, value, onChange }) => <label key={label}>{label}<select aria-label={label} value={value} onChange={(event) => onChange(event.target.value as GuideMode)}>{MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select></label>)}</div>
    <p className="palette-hint">補助線はPNGに含まれません。</p>
    <div className="dialog-actions"><button className="primary" onClick={onClose}>閉じる</button></div>
  </dialog>;
}
