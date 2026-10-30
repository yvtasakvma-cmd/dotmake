import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent } from 'react';
import type { Color, PixelDocument, Point, Tool } from '../model/document';
import type { EditorAction } from '../model/editor';
import { clientToPixel } from '../drawing/stroke';
import { sampleColor } from '../drawing/fill';
import { renderDocument } from '../drawing/render';
import { guidePaths, type GuideMode } from '../drawing/guides';

interface Props {
  document: PixelDocument;
  color: Color;
  gridMode: GuideMode;
  centerMode: GuideMode;
  brushSize: number;
  tool: Tool;
  zoom: number;
  disabled: boolean;
  onPick: (color: Color) => void;
  dispatch: Dispatch<EditorAction>;
}
type Pointer = { id: number; mode: 'draw' | 'pan' | 'single'; x: number; y: number };

export function PixelCanvas({ document, color, gridMode, centerMode, brushSize, tool, zoom, disabled, onPick, dispatch }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const activePointer = useRef<Pointer | null>(null);
  const [size, setSize] = useState({ width: 320, height: 320 });
  const [hover, setHover] = useState<Point | null>(null);
  const cellSize = Math.max(1, Math.floor(Math.min((size.width - 24) / document.width, (size.height - 24) / document.height))) * zoom;
  const width = document.width * cellSize;
  const height = document.height * cellSize;

  useLayoutEffect(() => {
    if (canvasRef.current) renderDocument(canvasRef.current, document);
  }, [document]);
  useLayoutEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = viewport.current!;
    element.scrollLeft = Math.max(0, (width + 24 - element.clientWidth) / 2);
    element.scrollTop = Math.max(0, (height + 24 - element.clientHeight) / 2);
  }, [width, height]);

  useEffect(() => {
    const finish = () => {
      setHover(null);
      const pointer = activePointer.current;
      activePointer.current = null;
      if (pointer) {
        if (pointer.mode === 'draw') dispatch({ type: 'end' });
        if (viewport.current?.hasPointerCapture(pointer.id)) viewport.current.releasePointerCapture(pointer.id);
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

  const point = (event: { clientX: number; clientY: number }) => clientToPixel(event.clientX, event.clientY, canvasRef.current!.getBoundingClientRect(), document.width, document.height);
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool === 'pen' || tool === 'eraser') setHover(point(event));
    const pointer = activePointer.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (pointer.mode === 'pan') {
      event.currentTarget.scrollLeft -= event.clientX - pointer.x;
      event.currentTarget.scrollTop -= event.clientY - pointer.y;
      pointer.x = event.clientX; pointer.y = event.clientY;
    } else if (pointer.mode === 'draw') {
      for (const sample of event.nativeEvent.getCoalescedEvents?.() ?? []) dispatch({ type: 'move', point: point(sample) });
      dispatch({ type: 'move', point: point(event) });
    }
  };
  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointer = activePointer.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    activePointer.current = null;
    if (pointer.mode === 'draw') {
      if (event.type === 'pointerup') dispatch({ type: 'move', point: point(event) });
      dispatch({ type: 'end' });
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (event.pointerType !== 'mouse') setHover(null);
  };
  const gridPaths = guidePaths(document.width, document.height, cellSize >= 4 ? gridMode : 'off');
  const centerPaths = guidePaths(document.width, document.height, centerMode, true);
  const outline = hover && (tool === 'pen' || tool === 'eraser') && hover.x >= 0 && hover.y >= 0 && hover.x < document.width && hover.y < document.height;
  const brushOffset = Math.floor((brushSize - 1) / 2);

  return <div ref={viewport} className={`canvas-viewport tool-${tool}`} aria-label="キャンバス表示領域"
    onContextMenu={(event) => event.preventDefault()} onPointerLeave={() => setHover(null)}
    onPointerDown={(event) => {
      if (disabled || activePointer.current || !event.isPrimary || event.button !== 0) return;
      if (tool !== 'pan' && event.target !== canvasRef.current) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const mode = tool === 'pan' ? 'pan' : tool === 'pen' || tool === 'eraser' ? 'draw' : 'single';
      activePointer.current = { id: event.pointerId, mode, x: event.clientX, y: event.clientY };
      if (mode === 'draw') { setHover(point(event)); dispatch({ type: 'begin', point: point(event), color, brushSize }); }
      if (tool === 'fill') dispatch({ type: 'fill', point: point(event), color });
      if (tool === 'picker') { const sampled = sampleColor(document, point(event)); if (sampled) onPick(sampled); }
    }} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
    <div className="canvas-stage" style={{ width: width + 24, height: height + 24 }}>
      <div className={`canvas-frame ${tool === 'eraser' ? 'is-erasing' : ''}`} style={{ width, height, aspectRatio: 'auto', backgroundSize: `${Math.max(8, cellSize * 4)}px ${Math.max(8, cellSize * 4)}px` }}>
        <canvas ref={canvasRef} width={document.width} height={document.height}
          aria-label={`${document.width}×${document.height}の描画キャンバス。指またはマウスで描画できます`}>Canvasに対応したブラウザで開いてください。</canvas>
        <svg className="canvas-grid" viewBox={`0 0 ${document.width} ${document.height}`} aria-hidden="true">
          {(['vertical', 'horizontal'] as const).map((axis) => <g key={axis}>
            {gridPaths[axis] && <path data-guide={`grid-${axis}`} d={gridPaths[axis]} vectorEffect="non-scaling-stroke" />}
            {centerPaths[axis] && <path className="center-guide" data-guide={`center-${axis}`} d={centerPaths[axis]} vectorEffect="non-scaling-stroke" />}
          </g>)}
        </svg>
        {outline && <div className="brush-outline" style={{ left: (hover.x - brushOffset) * cellSize, top: (hover.y - brushOffset) * cellSize, width: brushSize * cellSize, height: brushSize * cellSize }} />}
      </div>
    </div>
  </div>;
}
