import { useEffect, useReducer, useState } from 'react';
import { Icon } from './components/Icon';
import { PixelCanvas } from './components/PixelCanvas';
import { NewCanvasDialog } from './components/NewCanvasDialog';
import { ExportDialog } from './components/ExportDialog';
import { PwaStatus } from './components/PwaStatus';
import { RecentColors } from './components/RecentColors';
import { PalettePanel } from './components/PalettePanel';
import { QuickTools } from './components/QuickTools';
import { BrushSizeDialog } from './components/BrushSizeDialog';
import { BrushControls } from './components/BrushControls';
import { WalkPreviewDialog } from './components/WalkPreviewDialog';
import { FrameControls } from './components/FrameControls';
import { SelectionControls } from './components/SelectionControls';
import { GuideDialog } from './components/GuideDialog';
import { StartMenu } from './components/StartMenu';
import { CharacterLibrary } from './components/CharacterLibrary';
import { DeleteProjectDialog } from './components/DeleteProjectDialog';
import type { ProjectSummary } from './io/storage';
import { CharacterSetup } from './components/CharacterSetup';
import type { GuideMode } from './drawing/guides';
import { colorToPaintHex, createCharacter, hexToColor, TRANSPARENT, type Tool } from './model/document';
import { MIN_ZOOM, MAX_ZOOM } from './model/view';
import { createEditor, editorReducer } from './model/editor';
import { useAutosave } from './io/useAutosave';
import { encodePng } from './io/png';
import { usePalette } from './io/usePalette';
import { useGitHubSync } from './io/useGitHubSync';
import { GitHubSyncDialog } from './components/GitHubSyncDialog';
import { BackgroundDialog } from './components/BackgroundDialog';
import { useCanvasBackground } from './io/useCanvasBackground';
import { RenameProjectDialog } from './components/RenameProjectDialog';

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
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(PALETTE[0].hex);
  const [guidesVisible, setGuidesVisible] = useState(true);
  const [gridMode, setGridMode] = useState<GuideMode>('both');
  const [centerMode, setCenterMode] = useState<GuideMode>('off');
  const [penSize, setPenSize] = useState(1);
  const [eraserSize, setEraserSize] = useState(1);
  const [mobileTools, setMobileTools] = useState(() => matchMedia('(pointer: coarse) and (max-width: 1024px)').matches);
  const [brushPopup, setBrushPopup] = useState<'pen' | 'eraser' | null>(null);
  useEffect(() => {
    const media = matchMedia('(pointer: coarse) and (max-width: 1024px)');
    const change = () => { setMobileTools(media.matches); setBrushPopup(null); };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const palette = usePalette();
  const { background, update: setBackground, warning: backgroundWarning } = useCanvasBackground();
  const [zoom, setZoom] = useState(1);
  const [newCanvas, setNewCanvas] = useState(false);
  const [png, setPng] = useState<Blob | null>(null);
  const [exporting, setExporting] = useState(false);
  const [walkPreview, setWalkPreview] = useState(false);
  const [previewScale, setPreviewScale] = useState<number | null>(null);
  const [guidesOpen, setGuidesOpen] = useState(false);
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const [error, setError] = useState('');
  const [syncOpen, setSyncOpen] = useState(false);
  const autosave = useAutosave(state, dispatch);
  const drawing = state.stroke !== null || state.floating !== null;
  const canSync = autosave.ready && !autosave.busy && !autosave.failed && palette.ready && !palette.busy && !drawing && !canvasInteraction && !deleting && !renaming && !newCanvas && !walkPreview && !guidesOpen && !backgroundOpen && !brushPopup && !png && !exporting && screen !== 'character';
  const github = useGitHubSync({ enabled: canSync, automatic: screen === 'menu' || screen === 'library', paused: syncOpen, execute: async (operation) => {
    const result = await autosave.synchronize(operation);
    await palette.reload();
    return result;
  } });
  const locked = drawing || canvasInteraction || !autosave.ready || autosave.busy || github.busy;
  useEffect(() => {
    if (screen === 'editor' && autosave.ready && !autosave.busy && !github.busy && !autosave.hasProject) setScreen('library');
  }, [screen, autosave.ready, autosave.busy, autosave.hasProject, github.busy]);
  const { width, height } = state.document;
  const brushSize = tool === 'eraser' ? eraserSize : penSize;
  const paintColor = hexToColor(color);
  const selectColor = (value: string) => { setColor(value); setTool((current) => current === 'fill' ? 'fill' : 'pen'); };
  const projectName = state.document.name || '保存した作品';
  const openEditor = (id: string) => { void autosave.open(id).then((opened) => { if (opened) { setScreen('editor'); setZoom(1); setError(''); } }); };
  useEffect(() => { setCenterMode(state.document.kind === 'character' ? 'vertical' : 'off'); }, [state.document.kind]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (screen !== 'editor' || canvasInteraction || autosave.busy || github.busy || !autosave.ready) return;
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
        if (event.key.toLowerCase() === 'g') setGuidesVisible((value) => !value);
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [screen, tool, state.selection, state.floating, state.stroke, canvasInteraction, autosave.busy, autosave.ready, github.busy]);

  const quickTools = <QuickTools tool={tool} disabled={locked} mobile={mobileTools} onSelect={setTool} onSize={(value) => { setTool(value); setBrushPopup(value); }} />;
  return <div className="app-shell">
    <main aria-label="Pixel Studio">
      {screen === 'menu' && <StartMenu ready={autosave.ready && !autosave.busy && !github.busy} onCharacter={() => setScreen('library')} />}
      {screen === 'library' && <CharacterLibrary ready={autosave.ready && !autosave.busy && !github.busy} projects={autosave.projects} activeId={autosave.activeId} clipboardName={autosave.clipboard?.name} message={autosave.libraryMessage}
        onBack={() => setScreen('menu')} onNew={() => setScreen('character')} onOpen={openEditor} onCopy={(id) => { void autosave.copy(id); }} onDelete={setDeleting} onRename={setRenaming}
        onPaste={() => { void autosave.paste().then((created) => { if (created) { setCenterMode('vertical'); setZoom(1); setTool('pen'); setScreen('editor'); setError(''); } }); }} />}
      {screen === 'character' && <CharacterSetup disabled={autosave.busy || github.busy} onBack={() => setScreen('library')} onCreate={(name, w, h) => {
        try {
          void autosave.create(createCharacter(w, h, name)).then((created) => {
            if (created) { setCenterMode('vertical'); setZoom(1); setTool('pen'); setScreen('editor'); setError(''); }
          });
        } catch { setError('幅・高さは1〜256の整数で指定してください。'); }
      }} />}
      {screen === 'editor' && <>
      <section className="editor" aria-label="ドット絵エディタ">
        <div className="workspace-toolbar">
          <div className="file-actions"><button aria-label="キャラクター一覧へ戻る" disabled={locked} onClick={() => setScreen('library')}><span className="library-label-full">キャラクター一覧へ戻る</span><span className="library-label-short">一覧へ</span></button><button disabled={locked} onClick={() => setNewCanvas(true)}>新規作成</button><button className="primary" disabled={locked || exporting} onClick={() => {
            setExporting(true); setError('');
            void encodePng(state.document).then(setPng).catch(() => setError('PNGを作成できませんでした。もう一度お試しください。')).finally(() => setExporting(false));
          }}>{exporting ? '作成中…' : 'PNG出力'}</button></div>
          <h1 className="toolbar-project-name" title={projectName}>{projectName}</h1>
          <div className="history-buttons">
            <button className="icon-button" aria-label="元に戻す" title="元に戻す (Ctrl / ⌘ Z)" disabled={!state.past.length || locked} onClick={() => dispatch({ type: 'undo' })}><Icon name="undo" /></button>
            <button className="icon-button" aria-label="やり直す" title="やり直す (Ctrl / ⌘ Shift Z)" disabled={!state.future.length || locked} onClick={() => dispatch({ type: 'redo' })}><Icon name="redo" /></button>
          </div>
        </div>
        <div className="editor-body">
          <div className="canvas-workspace">
            <FrameControls state={state} disabled={locked} dispatch={dispatch} onPlay={() => setWalkPreview(true)} metadata={<> <strong>{width}×{height}px</strong><div className="grid-controls" role="group" aria-label="グリッド"><button className="grid-button" aria-label="グリッド設定" aria-haspopup="dialog" aria-expanded={guidesOpen} disabled={locked} onClick={() => setGuidesOpen(true)}><Icon name="grid" size={15} />グリッド</button><button className={`grid-toggle ${guidesVisible ? 'active' : ''}`} aria-label="グリッドの表示" aria-pressed={guidesVisible} title="グリッドと中心線をまとめてON/OFF (G)" disabled={locked} onClick={() => setGuidesVisible((value) => !value)}><span className="grid-state">{guidesVisible ? 'ON' : 'OFF'}</span></button></div> </>} />
            <div className={`canvas-drawing-row ${mobileTools ? 'mobile-drawing-row' : ''}`}>
              {!mobileTools && <BrushControls tool={tool} penSize={penSize} eraserSize={eraserSize} onPenSize={setPenSize} onEraserSize={setEraserSize} disabled={locked} />}
            <PixelCanvas state={state} document={state.document} color={tool === 'eraser' || paintColor[3] === 0 ? TRANSPARENT : paintColor} gridMode={guidesVisible ? gridMode : 'off'} centerMode={guidesVisible ? centerMode : 'off'} background={background} brushSize={brushSize} tool={tool} zoom={zoom} onZoom={setZoom} onInteraction={setCanvasInteraction} disabled={!autosave.ready || autosave.busy} dispatch={dispatch}
              onPick={(sampled) => { if (sampled[3] === 0) setTool('eraser'); else { setColor(colorToPaintHex(sampled)); setTool('pen'); } }} />
              {!mobileTools && quickTools}
            </div>
            <div className="view-controls"><span>{TOOLS.find((item) => item.tool === tool)?.label}</span><RecentColors colors={state.recentColors} color={color} disabled={locked} onSelect={selectColor} /><div className="zoom-controls"><button aria-label="背景設定" aria-haspopup="dialog" aria-expanded={backgroundOpen} disabled={locked} onClick={() => setBackgroundOpen(true)}><span className={`background-swatch ${background.mode === 'checker' ? 'checker-background' : ''}`} style={background.mode === 'solid' ? { backgroundColor: background.color } : undefined} aria-hidden="true" />背景</button><button aria-label="縮小" disabled={zoom <= MIN_ZOOM || locked} onClick={() => setZoom(Math.max(MIN_ZOOM, zoom / 2))}>−</button><output aria-label="拡大率">{Number(zoom.toFixed(3))}倍</output><button aria-label="拡大" disabled={zoom >= MAX_ZOOM || locked} onClick={() => setZoom(Math.min(MAX_ZOOM, zoom * 2))}>＋</button><button disabled={locked} onClick={() => setZoom(1)}>全体表示</button></div></div>
          </div>
          <aside className="tool-panel" aria-label="描画ツール">
            <section className="tools-section" aria-labelledby="tools-heading">
              <div className="section-label"><h2 id="tools-heading">ツール</h2></div>
              <div className="tool-buttons">{TOOLS.filter(item => !['pen', 'picker', 'eraser'].includes(item.tool)).map((item) => <button key={item.tool} className={`tool-button ${tool === item.tool ? 'selected' : ''}`} aria-label={item.label} aria-pressed={tool === item.tool} disabled={locked} onClick={() => setTool(item.tool)}><Icon name={item.tool} size={22} /><span>{item.tool === 'pan' ? '移動' : item.label}</span><kbd>{item.key}</kbd></button>)}</div>
            </section>
            {tool === 'select' && <SelectionControls state={state} disabled={!!state.stroke || canvasInteraction || autosave.busy || !autosave.ready} dispatch={dispatch} />}
            {mobileTools && <div className="mobile-tools-above-palette">{quickTools}<p className="palette-hint">ペン・消しゴムは長押しで太さを変更</p></div>}
            <PalettePanel presets={PALETTE} palette={palette} color={color} disabled={locked} onSelect={selectColor} />
          </aside>
        </div>
      </section>
      </>}
      <p className={`save-status ${autosave.failed ? 'error' : ''}`} role="status">{autosave.status}</p>
      {autosave.warning && <p role="alert">{autosave.warning}</p>}
      {error && <p role="alert">{error}</p>}
      <section className="github-sync-bar" aria-label="GitHub保存">
        <button disabled={!canSync || github.busy} onClick={() => setSyncOpen(true)}>GitHub保存の設定</button>
        {github.config && <button disabled={!canSync || github.busy} onClick={() => { void github.run(); }}>{github.busy ? '同期中…' : '今すぐ同期'}</button>}
        <p role="status" className={github.failed ? 'error' : ''}>{github.config ? github.busy || github.failed ? github.message : github.pending ? screen === 'editor' ? '端末に保存済み・一覧に戻るとGitHubに同期します' : '端末に保存済み・GitHubは同期待ち' : github.message : 'GitHub保存は未設定です'}</p>
      </section>
      <PwaStatus canUpdate={(!autosave.hasProject || autosave.status === 'この端末に保存済み') && !drawing && !palette.busy && !autosave.busy && !github.busy && !syncOpen && !renaming && !walkPreview && !guidesOpen && !backgroundOpen && !brushPopup} />
    </main>
    {syncOpen && <GitHubSyncDialog config={github.config} busy={github.busy} message={github.message} failed={github.failed} onConfigure={github.configure} onDisconnect={github.disconnect} onClose={() => setSyncOpen(false)} />}
    {deleting && <DeleteProjectDialog name={deleting.name} disabled={autosave.busy} onClose={() => setDeleting(null)} onDelete={() => autosave.remove(deleting.id)} />}
    {renaming && <RenameProjectDialog name={renaming.name} disabled={autosave.busy} onClose={() => setRenaming(null)} onRename={(name) => autosave.rename(renaming.id, name)} />}
    {newCanvas && <NewCanvasDialog disabled={autosave.busy} onClose={() => setNewCanvas(false)} onCreate={(w, h, name) => {
      try { void autosave.create(createCharacter(w, h, name)).then((created) => { if (created) { setTool('pen'); setCenterMode('vertical'); setZoom(1); setNewCanvas(false); setError(''); } }); }
      catch { setError('幅・高さは1〜256の整数で指定してください。'); }
    }} />}
    {brushPopup && <BrushSizeDialog tool={brushPopup} penSize={penSize} eraserSize={eraserSize} onPenSize={setPenSize} onEraserSize={setEraserSize} onClose={() => setBrushPopup(null)} />}
    {guidesOpen && <GuideDialog gridMode={gridMode} centerMode={centerMode} onCenter={setCenterMode} onGrid={setGridMode} onClose={() => setGuidesOpen(false)} />}
    {backgroundOpen && <BackgroundDialog background={background} warning={backgroundWarning} onChange={setBackground} onClose={() => setBackgroundOpen(false)} />}
    {walkPreview && state.document.frames && <WalkPreviewDialog document={state.document} background={background} previewScale={previewScale} onScale={setPreviewScale} onClose={() => setWalkPreview(false)} />}
    {png && <ExportDialog blob={png} filename={`pixel-studio-${width * (state.document.frames ? 3 : 1)}x${height * (state.document.frames ? 4 : 1)}.png`} onClose={() => setPng(null)} />}
  </div>;
}
