import { useEffect, useRef } from 'react';
import type { CanvasBackground } from '../model/view';

export function BackgroundDialog({ background, warning, onChange, onClose }: {
  background: CanvasBackground; warning: string;
  onChange: (background: CanvasBackground) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={dialog} className="background-dialog" aria-labelledby="background-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <h2 id="background-title">背景の設定</h2>
    <div className="background-options" role="group" aria-label="背景の表示">
      <button aria-pressed={background.mode === 'checker'} onClick={() => onChange({ ...background, mode: 'checker' })}><span className="background-swatch checker-background" aria-hidden="true" />市松模様</button>
      <button aria-pressed={background.mode === 'solid'} onClick={() => onChange({ ...background, mode: 'solid' })}><span className="background-swatch" style={{ backgroundColor: background.color }} aria-hidden="true" />単色</button>
    </div>
    <label className="background-color-field">背景色<input aria-label="背景色" type="color" value={background.color} disabled={background.mode !== 'solid'} onChange={(event) => onChange({ ...background, color: event.target.value })} /><output>{background.color.toUpperCase()}</output></label>
    <p className="palette-hint">描画画面と歩行プレビューの表示に使います。PNGには背景色を含めず、透明・半透明をそのまま出力します。</p>
    {warning && <p role="alert">{warning}</p>}
    <div className="dialog-actions"><button className="primary" onClick={onClose}>閉じる</button></div>
  </dialog>;
}
