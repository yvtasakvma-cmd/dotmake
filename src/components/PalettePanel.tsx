import type { usePalette } from '../io/usePalette';

interface Props {
  presets: readonly { hex: string; name: string }[];
  palette: ReturnType<typeof usePalette>;
  color: string;
  disabled: boolean;
  onSelect: (color: string) => void;
}

export function PalettePanel({ presets, palette, color, disabled, onSelect }: Props) {
  const registered = presets.some((item) => item.hex === color) || palette.colors.includes(color);
  const paletteLocked = disabled || !palette.ready || palette.busy;
  return <section className="palette-section" aria-labelledby="palette-heading">
    <div className="section-label"><h2 id="palette-heading">色</h2><label className="custom-color">自由な色<input aria-label="自由な色" type="color" value={color} disabled={disabled} onChange={(event) => onSelect(event.target.value)} /></label></div>
    <div className="palette">{presets.map(({ hex, name }) => <button key={hex} className={`swatch ${color === hex ? 'selected' : ''}`} style={{ backgroundColor: hex }} aria-label={`${name} ${hex}`} aria-pressed={color === hex} title={name} disabled={disabled} onClick={() => onSelect(hex)} />)}</div>
    <div className="current-color"><span className="current-color-chip" style={{ backgroundColor: color }} /><span><span className="color-label">選択中の色</span><strong>{color.toUpperCase()}</strong></span></div>
    <div className="palette-actions"><button aria-label="パレットに追加" disabled={paletteLocked || registered} onClick={() => palette.add(color)}>＋ 色を追加</button><button aria-label="選択した追加色を削除" disabled={paletteLocked || !palette.colors.includes(color)} onClick={() => palette.remove(color)}>追加色を削除</button></div>
    {registered && <p className="palette-hint">選択中の色は登録済みです。</p>}
    {palette.colors.length > 0 && <div className="saved-palette" aria-label="追加した色">{palette.colors.map((hex) => <button key={hex} className={`swatch ${color === hex ? 'selected' : ''}`} style={{ backgroundColor: hex }} aria-label={`追加色 ${hex}`} aria-pressed={color === hex} disabled={disabled} onClick={() => onSelect(hex)} />)}</div>}
    {palette.message && <p className={`palette-hint ${palette.failed ? 'error' : ''}`} role={palette.failed ? 'alert' : 'status'}>{palette.message}</p>}
  </section>;
}
