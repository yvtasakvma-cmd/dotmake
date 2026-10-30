import type { Tool } from '../model/document';

interface Props {
  tool: Tool;
  penSize: number;
  eraserSize: number;
  onPenSize: (size: number) => void;
  onEraserSize: (size: number) => void;
  disabled: boolean;
}

export function BrushControls({ tool, penSize, eraserSize, onPenSize, onEraserSize, disabled }: Props) {
  const erasing = tool === 'eraser';
  const size = erasing ? eraserSize : penSize;
  const label = erasing ? '消しゴムの太さ' : 'ペンの太さ';
  const available = tool === 'pen' || erasing;
  return <div className="brush-slider" aria-label="ブラシの太さ">
    <span aria-hidden="true">{erasing ? '消' : 'ペン'}</span>
    <span className="brush-slider-limit" aria-hidden="true">32</span>
    <input type="range" min="1" max="32" step="1" value={size} aria-label={label} aria-valuetext={`${size} px`} disabled={disabled || !available}
      onChange={(event) => (erasing ? onEraserSize : onPenSize)(Number(event.target.value))} />
    <span className="brush-slider-limit" aria-hidden="true">1</span>
    <output aria-label="現在の太さ">{size} px</output>
  </div>;
}
