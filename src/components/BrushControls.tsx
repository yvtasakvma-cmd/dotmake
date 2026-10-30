interface Props {
  penSize: number;
  eraserSize: number;
  onPenSize: (size: number) => void;
  onEraserSize: (size: number) => void;
  disabled: boolean;
}

export function BrushControls({ penSize, eraserSize, onPenSize, onEraserSize, disabled }: Props) {
  const sizes = Array.from({ length: 32 }, (_, i) => i + 1);
  return <fieldset className="brush-controls" disabled={disabled}>
    <legend>太さ</legend>
    <div className="setting-fields"><label>ペン<select aria-label="ペンの太さ" value={penSize} onChange={(event) => onPenSize(Number(event.target.value))}>{sizes.map((size) => <option key={size} value={size}>{size} px</option>)}</select></label>
      <label>消しゴム<select aria-label="消しゴムの太さ" value={eraserSize} onChange={(event) => onEraserSize(Number(event.target.value))}>{sizes.map((size) => <option key={size} value={size}>{size} px</option>)}</select></label></div>
  </fieldset>;
}
