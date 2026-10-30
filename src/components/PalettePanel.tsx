import { colorToPaintHex, hexToColor } from '../model/document';
import type { usePalette } from '../io/usePalette';

interface Props {
  presets: readonly { hex: string; name: string }[];
  palette: ReturnType<typeof usePalette>;
  color: string;
  disabled: boolean;
  onSelect: (color: string) => void;
}

export function PalettePanel({ presets, palette, color, disabled, onSelect }: Props) {
  const rgba = hexToColor(color);
  const opacity = Math.round(rgba[3] / 255 * 100);
  const registered = presets.some((item) => item.hex === color) || palette.colors.includes(color);
  const paletteLocked = disabled || !palette.ready || palette.busy;
  return <section className="palette-section" aria-labelledby="palette-heading">
    <div className="section-label palette-heading-row"><h2 id="palette-heading">色</h2><div className="current-color"><span className="current-color-chip alpha-checker"><span style={{ backgroundColor: color }} /></span><span><span className="color-label">選択中の色</span><strong>{color.toUpperCase()}</strong></span></div><label className="custom-color">自由な色<input aria-label="自由な色" type="color" value={color.slice(0, 7)} disabled={disabled} onChange={(event) => onSelect(event.target.value + (color.length === 9 ? color.slice(7) : ''))} /></label></div>
    <label className="opacity-control">不透明度 <output>{opacity}%</output><input aria-label="不透明度" type="range" min="0" max="100" step="1" value={opacity} disabled={disabled}
      onChange={(event) => onSelect(colorToPaintHex([rgba[0], rgba[1], rgba[2], Math.round(Number(event.target.value) * 255 / 100)]))} /></label>
    <p className="palette-hint opacity-hint">0%：透明 ／ 100%：不透明。描いた画素の色と透明度を置き換えます。</p>
    <div className="palette">{presets.map(({ hex, name }) => <button key={hex} className={`swatch ${color === hex ? 'selected' : ''}`} style={{ backgroundColor: hex }} aria-label={`${name} ${hex}`} aria-pressed={color === hex} title={name} disabled={disabled} onClick={() => onSelect(hex)} />)}</div>
    <div className="palette-actions"><button aria-label="パレットに追加" disabled={paletteLocked || registered} onClick={() => palette.add(color)}>＋ 色を追加</button><button aria-label="選択した追加色を削除" disabled={paletteLocked || !palette.colors.includes(color)} onClick={() => palette.remove(color)}>追加色を削除</button></div>
    {registered && <p className="palette-hint">選択中の色は登録済みです。</p>}
    {palette.colors.length > 0 && <div className="saved-palette" aria-label="追加した色">{palette.colors.map((hex) => <button key={hex} className={`swatch alpha-checker ${color === hex ? 'selected' : ''}`} aria-label={`追加色 ${hex}`} aria-pressed={color === hex} disabled={disabled} onClick={() => onSelect(hex)}><span className="swatch-alpha" style={{ backgroundColor: hex }} /></button>)}</div>}
    {palette.message && <p className={`palette-hint ${palette.failed ? 'error' : ''}`} role={palette.failed ? 'alert' : 'status'}>{palette.message}</p>}
  </section>;
}
