import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent } from 'react';
import type { Color, PixelDocument, Point, Tool } from '../model/document';
import type { EditorAction, EditorState } from '../model/editor';
import { clientToPixel } from '../drawing/stroke';
import { sampleColor } from '../drawing/fill';
import { renderDocument } from '../drawing/render';
import { guidePaths, type GuideMode } from '../drawing/guides';
import { contains, moveRegion, placeRegion, rectangle, translated, type Rect } from '../drawing/selection';

interface Props {
  state: EditorState;
  document: PixelDocument;
  color: Color;
  gridMode: GuideMode;
  centerMode: GuideMode;
  brushSize: number;
  tool: Tool;
  zoom: number;
  onZoom: (zoom: number) => void;
  onInteraction: (active: boolean) => void;
  disabled: boolean;
  onPick: (color: Color) => void;
  dispatch: Dispatch<EditorAction>;
}
type Pointer = { id: number; mode: 'draw' | 'pan' | 'single' | 'select' | 'move-selection'; x: number; y: number; start: Point; rect: Rect | null };
type Preview = { kind: 'select'; rect: Rect } | { kind: 'move'; rect: Rect };
type Gesture = { zoom: number; distance: number; anchor: Point };
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Point, b: Point) => Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));

export function PixelCanvas({ state, document, color, gridMode, centerMode, brushSize, tool, zoom, onZoom, onInteraction, disabled, onPick, dispatch }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const activePointer = useRef<Pointer | null>(null);
  const touches = useRef(new Map<number, Point>());
  const gesture = useRef<Gesture | null>(null);
  const gestureSeen = useRef(false);
  const pendingAnchor = useRef<{ anchor: Point; midpoint: Point } | null>(null);
  const [size, setSize] = useState({ width: 320, height: 320 });
  const [hover, setHover] = useState<Point | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const fitCell = Math.max(1, Math.floor(Math.min((size.width - 24) / document.width, (size.height - 24) / document.height)));
  const cellSize = fitCell * zoom;
  const width = document.width * cellSize, height = document.height * cellSize;

  const visibleSelection = preview?.rect ?? state.selection;
  let displayed = document;
  if (preview?.kind === 'move' && state.selection) {
    displayed = state.floating ? placeRegion(state.floating.base, state.floating.region, preview.rect) : moveRegion(document, state.selection, preview.rect);
  }
  useLayoutEffect(() => {
    if (canvasRef.current) renderDocument(canvasRef.current, displayed);
  }, [displayed]);
  useLayoutEffect(() => {
    const element = viewport.current!;
    const observer = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const applyAnchor = (anchor: Point, mid: Point, nextZoom: number) => {
    const element = viewport.current!;
    const cell = fitCell * nextZoom;
    const offsetX = Math.max(12, (element.clientWidth - document.width * cell) / 2);
    const offsetY = Math.max(12, (element.clientHeight - document.height * cell) / 2);
    element.scrollLeft = offsetX + anchor.x * cell - mid.x;
    element.scrollTop = offsetY + anchor.y * cell - mid.y;
  };
  useLayoutEffect(() => {
    const element = viewport.current!;
    const pending = pendingAnchor.current;
    if (pending) { applyAnchor(pending.anchor, pending.midpoint, zoom); pendingAnchor.current = null; }
    else {
      element.scrollLeft = Math.max(0, (width + 24 - element.clientWidth) / 2);
      element.scrollTop = Math.max(0, (height + 24 - element.clientHeight) / 2);
    }
  }, [width, height]);

  useEffect(() => {
    const finish = () => {
      const pointer = activePointer.current;
      activePointer.current = null;
      if (pointer?.mode === 'draw') dispatch({ type: 'end' });
      const ids = new Set([...touches.current.keys(), ...(pointer ? [pointer.id] : [])]);
      touches.current.clear(); gesture.current = null; gestureSeen.current = false;
      pendingAnchor.current = null; setHover(null); setPreview(null); onInteraction(false);
      for (const id of ids) if (viewport.current?.hasPointerCapture(id)) viewport.current.releasePointerCapture(id);
    };
    const hide = () => { if (globalThis.document.hidden) finish(); };
    window.addEventListener('blur', finish);
    window.addEventListener('resize', finish);
    globalThis.document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('blur', finish);
      window.removeEventListener('resize', finish);
      globalThis.document.removeEventListener('visibilitychange', hide);
      finish();
    };
  }, [dispatch, onInteraction]);

  const point = (event: { clientX: number; clientY: number }) => clientToPixel(event.clientX, event.clientY, canvasRef.current!.getBoundingClientRect(), document.width, document.height);
  const beginGesture = () => {
    const [a, b] = [...touches.current.values()];
    if (!a || !b) return;
    if (activePointer.current?.mode === 'draw') dispatch({ type: 'cancel-stroke' });
    activePointer.current = null; setHover(null); setPreview(null); gestureSeen.current = true;
    const mid = midpoint(a, b), rect = canvasRef.current!.getBoundingClientRect();
    gesture.current = { zoom, distance: distance(a, b), anchor: { x: (mid.x - rect.left) / cellSize, y: (mid.y - rect.top) / cellSize } };
  };
  const updateGesture = () => {
    const [a, b] = [...touches.current.values()];
    const start = gesture.current;
    if (!a || !b || !start) return;
    const rect = viewport.current!.getBoundingClientRect();
    const mid = midpoint(a, b);
    const localMid = { x: mid.x - rect.left - viewport.current!.clientLeft, y: mid.y - rect.top - viewport.current!.clientTop };
    const nextZoom = Math.max(1, Math.min(16, start.zoom * distance(a, b) / start.distance));
    pendingAnchor.current = { anchor: start.anchor, midpoint: localMid };
    if (Math.abs(nextZoom - zoom) < .00001) { applyAnchor(start.anchor, localMid, zoom); pendingAnchor.current = null; }
    // Both fingers can move in the same React batch. Always publish the final
    // distance, even if it matches the zoom from before the first event.
    onZoom(nextZoom);
  };
  const updatePreview = (pointer: Pointer, p: Point) => {
    if (pointer.mode === 'select') setPreview({ kind: 'select', rect: rectangle(pointer.start, p, document.width, document.height) });
    if (pointer.mode === 'move-selection' && pointer.rect) setPreview({ kind: 'move', rect: translated(pointer.rect, p.x - pointer.start.x, p.y - pointer.start.y, document.width, document.height) });
  };
  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    if (event.pointerType === 'touch') {
      event.preventDefault(); touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      event.currentTarget.setPointerCapture(event.pointerId); onInteraction(true);
      if (touches.current.size >= 2) { beginGesture(); return; }
      if (gestureSeen.current) return;
    } else if (activePointer.current || !event.isPrimary) return;
    if (tool !== 'pan' && event.target !== canvasRef.current) return;
    if (state.floating && tool !== 'select') return;
    const p = point(event);
    if (state.floating && state.selection && !contains(state.selection, p)) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); onInteraction(true);
    const mode = tool === 'pan' ? 'pan' : tool === 'select' ? state.selection && contains(state.selection, p) ? 'move-selection' : 'select' : tool === 'pen' || tool === 'eraser' ? 'draw' : 'single';
    const pointer: Pointer = { id: event.pointerId, mode, x: event.clientX, y: event.clientY, start: p, rect: state.selection };
    activePointer.current = pointer;
    if (mode === 'draw') { setHover(p); dispatch({ type: 'begin', point: p, color, brushSize }); }
    updatePreview(pointer, p);
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch' && touches.current.has(event.pointerId)) {
      touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (gestureSeen.current) { updateGesture(); return; }
    }
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
    } else updatePreview(pointer, point(event));
  };
  const end = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') {
      const known = touches.current.delete(event.pointerId);
      if (gestureSeen.current && known) {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (touches.current.size >= 2) beginGesture(); else gesture.current = null;
        if (!touches.current.size) { gestureSeen.current = false; onInteraction(false); }
        return;
      }
    }
    const pointer = activePointer.current;
    if (pointer?.id === event.pointerId) {
      activePointer.current = null;
      if (pointer.mode === 'draw') {
        if (event.type === 'pointerup') dispatch({ type: 'move', point: point(event) });
        dispatch({ type: 'end' });
      } else if (event.type === 'pointerup') {
        const p = point(event);
        if (pointer.mode === 'select') dispatch({ type: 'selection', rect: rectangle(pointer.start, p, document.width, document.height) });
        if (pointer.mode === 'move-selection') dispatch({ type: 'move-region', dx: p.x - pointer.start.x, dy: p.y - pointer.start.y });
        if (pointer.mode === 'single' && tool === 'fill') dispatch({ type: 'fill', point: p, color });
        if (pointer.mode === 'single' && tool === 'picker') { const sampled = sampleColor(document, p); if (sampled) onPick(sampled); }
      }
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setPreview(null);
    if (!touches.current.size) onInteraction(false);
    if (event.pointerType !== 'mouse') setHover(null);
  };
  const gridPaths = guidePaths(document.width, document.height, cellSize >= 4 ? gridMode : 'off');
  const centerPaths = guidePaths(document.width, document.height, centerMode, true);
  const outline = hover && (tool === 'pen' || tool === 'eraser') && hover.x >= 0 && hover.y >= 0 && hover.x < document.width && hover.y < document.height;
  const brushOffset = Math.floor((brushSize - 1) / 2);

  return <div ref={viewport} className={`canvas-viewport tool-${tool}`} aria-label="キャンバス表示領域"
    onContextMenu={(event) => {
      event.preventDefault();
      if (disabled || event.button !== 2 || event.target !== canvasRef.current || activePointer.current || touches.current.size || state.stroke || state.floating) return;
      const sampled = sampleColor(document, point(event));
      if (sampled) onPick(sampled);
    }} onPointerLeave={() => setHover(null)}
    onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end}>
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
        {tool === 'select' && visibleSelection && <div className="selection-outline" data-selection={`${visibleSelection.x},${visibleSelection.y},${visibleSelection.width},${visibleSelection.height}`} style={{ left: visibleSelection.x * cellSize, top: visibleSelection.y * cellSize, width: visibleSelection.width * cellSize, height: visibleSelection.height * cellSize }} />}
        {outline && !gestureSeen.current && <div className="brush-outline" style={{ left: (hover.x - brushOffset) * cellSize, top: (hover.y - brushOffset) * cellSize, width: brushSize * cellSize, height: brushSize * cellSize }} />}
      </div>
    </div>
  </div>;
}
