import { useEffect, useRef, type Dispatch, type PointerEvent as ReactPointerEvent } from 'react';
import type { Color, PixelDocument } from '../model/document';
import type { EditorAction } from '../model/editor';
import { clientToPixel } from '../drawing/stroke';
import { renderDocument } from '../drawing/render';

interface Props {
  document: PixelDocument;
  color: Color;
  grid: boolean;
  erasing: boolean;
  dispatch: Dispatch<EditorAction>;
}

export function PixelCanvas({ document, color, grid, erasing, dispatch }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activePointer = useRef<number | null>(null);

  useEffect(() => {
    if (canvasRef.current) renderDocument(canvasRef.current, document);
  }, [document]);

  // Pointer cancellation, tab switching and rotation all finish the current
  // stroke, preserving it as a single undoable operation.
  useEffect(() => {
    const finish = () => {
      const id = activePointer.current;
      activePointer.current = null;
      if (id !== null) {
        dispatch({ type: 'end' });
        const canvas = canvasRef.current;
        if (canvas?.hasPointerCapture(id)) canvas.releasePointerCapture(id);
      }
    };
    const hide = () => { if (globalThis.document.hidden) finish(); };
    window.addEventListener('blur', finish);
    window.addEventListener('resize', finish);
    globalThis.document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('blur', finish);
      window.removeEventListener('resize', finish);
      globalThis.document.removeEventListener('visibilitychange', hide);
    };
  }, [dispatch]);

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => clientToPixel(
    event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), document.width, document.height,
  );
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointer.current !== event.pointerId) return;
    // Use coalesced stylus/touch samples where available; interpolate all others.
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    const rect = event.currentTarget.getBoundingClientRect();
    for (const sample of samples) {
      dispatch({ type: 'move', point: clientToPixel(sample.clientX, sample.clientY, rect, document.width, document.height) });
    }
    dispatch({ type: 'move', point: point(event) });
  };
  const end = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (activePointer.current !== event.pointerId) return;
    if (event.type === 'pointerup') dispatch({ type: 'move', point: point(event) });
    activePointer.current = null;
    dispatch({ type: 'end' });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const gridPath = Array.from({ length: document.width - 1 }, (_, i) => `M${i + 1} 0V${document.height}`).join(' ') + ' ' +
    Array.from({ length: document.height - 1 }, (_, i) => `M0 ${i + 1}H${document.width}`).join(' ');

  return <div className={`canvas-frame ${erasing ? 'is-erasing' : ''}`}>
    <canvas
      ref={canvasRef}
      width={document.width}
      height={document.height}
      aria-label="32×32の描画キャンバス。指またはマウスで描画できます"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (activePointer.current !== null || !event.isPrimary || event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        activePointer.current = event.pointerId;
        dispatch({ type: 'begin', point: point(event), color });
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >Canvasに対応したブラウザで開いてください。</canvas>
    {grid && <svg className="canvas-grid" viewBox={`0 0 ${document.width} ${document.height}`} aria-hidden="true"><path d={gridPath} vectorEffect="non-scaling-stroke" /></svg>}
  </div>;
}
