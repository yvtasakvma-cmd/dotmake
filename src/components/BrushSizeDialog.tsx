import { useEffect, useRef } from 'react';
import { BrushControls } from './BrushControls';

export function BrushSizeDialog({ tool, penSize, eraserSize, onPenSize, onEraserSize, onClose }: {
  tool: 'pen' | 'eraser'; penSize: number; eraserSize: number;
  onPenSize: (size: number) => void; onEraserSize: (size: number) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => element.close(); }, []);
  return <dialog ref={dialog} className="brush-size-dialog" aria-labelledby="brush-size-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <h2 id="brush-size-title">{tool === 'pen' ? 'ペン' : '消しゴム'}の太さ</h2>
    <BrushControls tool={tool} penSize={penSize} eraserSize={eraserSize} onPenSize={onPenSize} onEraserSize={onEraserSize} disabled={false} />
    <div className="dialog-actions"><button className="primary" onClick={onClose}>閉じる</button></div>
  </dialog>;
}
