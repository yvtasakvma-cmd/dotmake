import { useEffect, useReducer, useState } from 'react';
import { Icon } from './components/Icon';
import { PixelCanvas } from './components/PixelCanvas';
import { NewCanvasDialog } from './components/NewCanvasDialog';
import { ExportDialog } from './components/ExportDialog';
import { PwaStatus } from './components/PwaStatus';
import { PalettePanel } from './components/PalettePanel';
import { BrushControls } from './components/BrushControls';
import { SelectionControls } from './components/SelectionControls';
import { GuideControls } from './components/GuideControls';
import { StartMenu } from './components/StartMenu';
import { CharacterLibrary } from './components/CharacterLibrary';
import { DeleteProjectDialog } from './components/DeleteProjectDialog';
import type { ProjectSummary } from './io/storage';
import { CharacterSetup } from './components/CharacterSetup';
import type { GuideMode } from './drawing/guides';
import { colorToHex, createDocument, hexToColor, TRANSPARENT, type Tool } from './model/document';
import { createEditor, editorReducer } from './model/editor';
import { useAutosave } from './io/useAutosave';
import { encodePng } from './io/png';
import { usePalette } from './io/usePalette';

const PALETTE = [
  { hex: '#000000', name: '黒' }, { hex: '#f6f4ee', name: 'ミルク' },
  { hex: '#e77958', name: 'コーラル' }, { hex: '#efc66c', name: 'サンシャイン' },
  { hex: '#81a987', name: 'セージ' }, { hex: '#83b5c5', name: 'スカイ' },
  { hex: '#9386b5', name: 'ラベンダー' }, { hex: '#d8a2b5', name: 'ローズ' },
];
const TOOLS: { tool: Tool; label: string; key: string }[] = [
  { tool: 'pen', label: 'ペン', key: 'B' }, { tool: 'eraser', label: '消しゴム', key: 'E' },
  { tool: 'fill', label: '塗りつぶし', key: 'F' }, { tool: 'picker', label: 'スポイト', key: 'I' }, { tool: 'pan', label: '表示を移動', key: 'H' },
  { tool: 'select', label: '範囲選択', key: 'S' },
];

export default function App() {
  const [state, dispatch] = useReducer(editorReducer, undefined, createEditor);
  const [canvasInteraction, setCanvasInteraction] = useState(false);
  const [screen, setScreen] = useState<'menu' | 'library' | 'character' | 'editor'>('menu');
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(PALETTE[0].hex);
  const [grid, setGrid] = useState(true);
  const [gridDirection, setGridDirection] = useState<Exclude<GuideMode, 'off'>>('both');
  const [centerMode, setCenterMode] = useState<GuideMode>('off');
  const [penSize, setPenSize] = useState(1);
  const [eraserSize, setEraserSize] = useState(1);
  const palette = usePalette();
  const [zoom, setZoom] = useState(1);
  const [newCanvas, setNewCanvas] = useState(false);
  const [png, setPng] = useState<Blob | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const autosave = useAutosave(state, dispatch);
  const drawing = state.stroke !== null || state.floating !== null;
  const locked = drawing || canvasInteraction || !autosave.ready || autosave.busy;
  const { width, height } = state.document;
  const gridMode = grid ? gridDirection : 'off';
  const brushSize = tool === 'eraser' ? eraserSize : penSize;
  const selectColor = (value: string) => { setColor(value); setTool((current) => current === 'fill' ? 'fill' : 'pen'); };
  const projectName = state.document.name || '保存した作品';
  const openEditor = (id: string) => { void autosave.open(id).then((opened) => { if (opened) { setScreen('editor'); setZoom(1); setError(''); } }); };
  useEffect(() => { setCenterMode(state.document.kind === 'character' ? 'vertical' : 'off'); }, [state.document.kind]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (screen !== 'editor' || canvasInteraction) return;
      const target = event.target;
      if (document.querySelector('dialog[open]') || (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable))) return;
      if (event.metaKey || event.ctrlKey) {
        if (event.key.toLowerCase() === 'z') { event.preventDefault(); dispatch({ type: event.shiftKey ? 'redo' : 'undo' }); }
        if (event.key.toLowerCase() === 'y') { event.preventDefault(); dispatch({ type: 'redo' }); }
        if (tool === 'select' && event.key.toLowerCase() === 'c') { event.preventDefault(); dispatch({ type: 'copy-region' }); }
        if (tool === 'select' && event.key.toLowerCase() === 'v') { event.preventDefault(); dispatch({ type: 'paste-region' }); }
      } else if (!event.altKey) {
        if (event.key === 'Escape') { if (state.floating) dispatch({ type: 'cancel-region' }); else dispatch({ type: 'selection', rect: null }); return; }
        if (event.key === 'Enter' && state.floating) { event.preventDefault(); dispatch({ type: 'commit-region' }); return; }
        if (tool === 'select' && state.selection && event.key.startsWith('Arrow')) {
          event.preventDefault(); dispatch({ type: 'move-region', dx: event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0, dy: event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0 }); return;
        }
        const selected = TOOLS.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
        if (selected && !state.floating && !state.stroke) setTool(selected.tool);
        if (event.key.toLowerCase() === 'g') setGrid((value) => !value);
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [screen, tool, state.selection, state.floating, state.stroke, canvasInteraction]);

  return <div className="app-shell">
    <main aria-label="Pixel Studio">
      {screen === 'menu' && <StartMenu ready={autosave.ready && !autosave.busy} onCharacter={() => setScreen('library')} />}
      {screen === 'library' && <CharacterLibrary ready={autosave.ready && !autosave.busy} projects={autosave.projects} activeId={autosave.activeId} clipboardName={autosave.clipboard?.name} message={autosave.libraryMessage}
        onBack={() => setScreen('menu')} onNew={() => setScreen('character')} onOpen={openEditor} onCopy={(id) => { void autosave.copy(id); }} onDelete={setDeleting}
        onPaste={() => { void autosave.paste().then((created) => { if (created) { setCenterMode('vertical'); setZoom(1); setTool('pen'); setScreen('editor'); setError(''); } }); }} />}
      {screen === 'character' && <CharacterSetup disabled={autosave.busy} onBack={() => setScreen('library')} onCreate={(name, w, h) => {
        try {
          void autosave.create({ ...createDocument(w, h), name, kind: 'character' }).then((created) => {
            if (created) { setCenterMode('vertical'); setZoom(1); setTool('pen'); setScreen('editor'); setError(''); }
          });
        } catch { setError('幅・高さは1〜256の整数で指定してください。'); }
      }} />}
      {screen === 'editor' && <>
      <div className="project-bar"><button disabled={locked} onClick={() => setScreen('library')}>キャラクター一覧へ戻る</button><h1>{projectName}</h1><span>{state.document.kind === 'character' ? 'キャラクター' : '保存した作品'}</span></div>
      <section className="editor" aria-label="ドット絵エディタ">
        <div className="workspace-toolbar">
          <div className="file-actions"><button disabled={locked} onClick={() => setNewCanvas(true)}>新規作成</button><button className="primary" disabled={locked || exporting} onClick={() => {
            setExporting(true); setError('');
            void encodePng(state.document).then(setPng).catch(() => setError('PNGを作成できませんでした。もう一度お試しください。')).finally(() => setExporting(false));
          }}>{exporting ? '作成中…' : 'PNG出力'}</button></div>
          <div className="history-buttons">
            <button className="icon-button" aria-label="元に戻す" title="元に戻す (Ctrl / ⌘ Z)" disabled={!state.past.length || locked} onClick={() => dispatch({ type: 'undo' })}><Icon name="undo" /></button>
            <button className="icon-button" aria-label="やり直す" title="やり直す (Ctrl / ⌘ Shift Z)" disabled={!state.future.length || locked} onClick={() => dispatch({ type: 'redo' })}><Icon name="redo" /></button>
          </div>
        </div>
        <div className="editor-body">
          <div className="canvas-workspace">
            <div className="canvas-meta"><strong>{width} × {height} px</strong><button className={`grid-button ${grid ? 'active' : ''}`} aria-label="グリッド表示" aria-pressed={grid} onClick={() => setGrid(!grid)}><Icon name="grid" size={15} />グリッド<span className="grid-state">{grid ? 'ON' : 'OFF'}</span></button></div>
            <PixelCanvas state={state} document={state.document} color={tool === 'eraser' ? TRANSPARENT : hexToColor(color)} gridMode={gridMode} centerMode={centerMode} brushSize={brushSize} tool={tool} zoom={zoom} onZoom={setZoom} onInteraction={setCanvasInteraction} disabled={!autosave.ready || autosave.busy} dispatch={dispatch}
              onPick={(sampled) => { if (sampled[3] === 0) setTool('eraser'); else { setColor(colorToHex(sampled)); setTool('pen'); } }} />
            <div className="view-controls"><span>{TOOLS.find((item) => item.tool === tool)?.label}</span><div><button aria-label="縮小" disabled={zoom <= 1 || locked} onClick={() => setZoom(Math.max(1, zoom / 2))}>−</button><output aria-label="拡大率">{Number(zoom.toFixed(2))}倍</output><button aria-label="拡大" disabled={zoom >= 16 || locked} onClick={() => setZoom(Math.min(16, zoom * 2))}>＋</button><button disabled={locked} onClick={() => setZoom(1)}>全体表示</button></div></div>
          </div>
          <aside className="tool-panel" aria-label="描画ツール">
            <section className="tools-section" aria-labelledby="tools-heading">
              <div className="section-label"><h2 id="tools-heading">ツール</h2></div>
              <div className="tool-buttons">{TOOLS.map((item) => <button key={item.tool} className={`tool-button ${tool === item.tool ? 'selected' : ''}`} aria-label={item.label} aria-pressed={tool === item.tool} disabled={locked} onClick={() => setTool(item.tool)}><Icon name={item.tool} size={22} /><span>{item.tool === 'pan' ? '移動' : item.label}</span><kbd>{item.key}</kbd></button>)}</div>
            </section>
            {tool === 'select' && <SelectionControls state={state} disabled={!!state.stroke || canvasInteraction || autosave.busy || !autosave.ready} dispatch={dispatch} />}
            <BrushControls penSize={penSize} eraserSize={eraserSize} onPenSize={setPenSize} onEraserSize={setEraserSize} disabled={locked} />
            <GuideControls gridMode={gridMode} centerMode={centerMode} onCenter={setCenterMode} onGrid={(mode) => { setGrid(mode !== 'off'); if (mode !== 'off') setGridDirection(mode); }} />
            <PalettePanel presets={PALETTE} palette={palette} color={color} disabled={locked} onSelect={selectColor} />
          </aside>
        </div>
      </section>
      </>}
      <p className={`save-status ${autosave.failed ? 'error' : ''}`} role="status">{autosave.status}</p>
      {autosave.warning && <p role="alert">{autosave.warning}</p>}
      {error && <p role="alert">{error}</p>}
      <PwaStatus canUpdate={(!autosave.hasProject || autosave.status === 'この端末に保存済み') && !drawing && !palette.busy && !autosave.busy} />
    </main>
    {deleting && <DeleteProjectDialog name={deleting.name} disabled={autosave.busy} onClose={() => setDeleting(null)} onDelete={() => autosave.remove(deleting.id)} />}
    {newCanvas && <NewCanvasDialog disabled={autosave.busy} onClose={() => setNewCanvas(false)} onCreate={(w, h, name) => {
      try { void autosave.create({ ...createDocument(w, h), name, kind: 'character' }).then((created) => { if (created) { setTool('pen'); setCenterMode('vertical'); setZoom(1); setNewCanvas(false); setError(''); } }); }
      catch { setError('幅・高さは1〜256の整数で指定してください。'); }
    }} />}
    {png && <ExportDialog blob={png} filename={`pixel-studio-${width}x${height}.png`} onClose={() => setPng(null)} />}
  </div>;
}
