import type { GuideMode } from '../drawing/guides';

const MODES: { value: GuideMode; label: string }[] = [
  { value: 'off', label: '非表示' }, { value: 'both', label: '縦・横' },
  { value: 'vertical', label: '縦のみ' }, { value: 'horizontal', label: '横のみ' },
];

export function GuideControls({ gridMode, centerMode, onGrid, onCenter }: {
  gridMode: GuideMode; centerMode: GuideMode;
  onGrid: (mode: GuideMode) => void; onCenter: (mode: GuideMode) => void;
}) {
  return <details className="guide-controls"><summary>補助線の設定</summary>
    <div className="setting-fields">{[
      { label: 'グリッドの向き', value: gridMode, onChange: onGrid },
      { label: '中心線', value: centerMode, onChange: onCenter },
    ].map(({ label, value, onChange }) => <label key={label}>{label}<select aria-label={label} value={value} onChange={(event) => onChange(event.target.value as GuideMode)}>{MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select></label>)}</div>
    <p className="palette-hint">補助線はPNGに含まれません。</p>
  </details>;
}
