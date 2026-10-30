import { useEffect, useReducer, useState } from 'react';
import { Icon } from './components/Icon';
import { PixelCanvas } from './components/PixelCanvas';
import { NewCanvasDialog } from './components/NewCanvasDialog';
import { ExportDialog } from './components/ExportDialog';
import { PwaStatus } from './components/PwaStatus';
import { colorToHex, createDocument, hexToColor, TRANSPARENT, type Tool } from './model/document';
import { createEditor, editorReducer } from './model/editor';
import { useAutosave } from './io/useAutosave';
import { encodePng } from './io/png';

const PALETTE = [
  { hex: '#303b32', name: 'フォレスト' }, { hex: '#f6f4ee', name: 'ミルク' },
  { hex: '#e77958', name: 'コーラル' }, { hex: '#efc66c', name: 'サンシャイン' },
  { hex: '#81a987', name: 'セージ' }, { hex: '#83b5c5', name: 'スカイ' },
  { hex: '#9386b5', name: 'ラベンダー' }, { hex: '#d8a2b5', name: 'ローズ' },
];
const TOOLS: { tool: Tool; label: string; key: string }[] = [
  { tool: 'pen', label: 'ペン', key: 'B' }, { tool: 'eraser', label: '消しゴム', key: 'E' },
  { tool: 'fill', label: '塗りつぶし', key: 'F' }, { tool: 'picker', label: 'スポイト', key: 'I' }, { tool: 'pan', label: '表示を移動', key: 'H' },
];

export default function App() {
  const [state, dispatch] = useReducer(editorReducer, undefined, createEditor);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState(PALETTE[0].hex);
  const [grid, setGrid] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [newCanvas, setNewCanvas] = useState(false);
  const [png, setPng] = useState<Blob | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const autosave = useAutosave(state, dispatch);
  const drawing = state.stroke !== null;
  const locked = drawing || !autosave.ready;
  const { width, height } = state.document;
  const selectColor = (value: string) => { setColor(value); setTool((current) => current === 'fill' ? 'fill' : 'pen'); };

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target;
      if (document.querySelector('dialog[open]') || (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable))) return;
      if (event.metaKey || event.ctrlKey) {
        if (event.key.toLowerCase() === 'z') { event.preventDefault(); dispatch({ type: event.shiftKey ? 'redo' : 'undo' }); }
        if (event.key.toLowerCase() === 'y') { event.preventDefault(); dispatch({ type: 'redo' }); }
      } else if (!event.altKey) {
        const selected = TOOLS.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
        if (selected) setTool(selected.tool);
        if (event.key.toLowerCase() === 'g') setGrid((value) => !value);
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, []);

  return <div className="app-shell">
    <main aria-label="Pixel Studio">
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
            <PixelCanvas document={state.document} color={tool === 'eraser' ? TRANSPARENT : hexToColor(color)} grid={grid} tool={tool} zoom={zoom} disabled={!autosave.ready} dispatch={dispatch}
              onPick={(sampled) => { if (sampled[3] === 0) setTool('eraser'); else { setColor(colorToHex(sampled)); setTool('pen'); } }} />
            <div className="view-controls"><span>{TOOLS.find((item) => item.tool === tool)?.label}</span><div><button aria-label="縮小" disabled={zoom === 1 || locked} onClick={() => setZoom(zoom / 2)}>−</button><output aria-label="拡大率">{zoom}倍</output><button aria-label="拡大" disabled={zoom === 16 || locked} onClick={() => setZoom(zoom * 2)}>＋</button><button disabled={locked} onClick={() => setZoom(1)}>全体表示</button></div></div>
          </div>
          <aside className="tool-panel" aria-label="描画ツール">
            <section className="tools-section" aria-labelledby="tools-heading">
              <div className="section-label"><h2 id="tools-heading">ツール</h2></div>
              <div className="tool-buttons">{TOOLS.map((item) => <button key={item.tool} className={`tool-button ${tool === item.tool ? 'selected' : ''}`} aria-label={item.label} aria-pressed={tool === item.tool} disabled={locked} onClick={() => setTool(item.tool)}><Icon name={item.tool} size={22} /><span>{item.tool === 'pan' ? '移動' : item.label}</span><kbd>{item.key}</kbd></button>)}</div>
            </section>
            <section className="palette-section" aria-labelledby="palette-heading">
              <div className="section-label"><h2 id="palette-heading">色</h2><label className="custom-color">自由な色<input aria-label="自由な色" type="color" value={color} disabled={locked} onChange={(event) => selectColor(event.target.value)} /></label></div>
              <div className="palette">{PALETTE.map(({ hex, name }) => <button key={hex} className={`swatch ${color === hex ? 'selected' : ''}`} style={{ backgroundColor: hex }} aria-label={`${name} ${hex}`} aria-pressed={color === hex} title={name} disabled={locked} onClick={() => selectColor(hex)} />)}</div>
              <div className="current-color"><span className="current-color-chip" style={{ backgroundColor: color }} /><span><span className="color-label">選択中の色</span><strong>{color.toUpperCase()}</strong></span><span className="pixel-size">1<span>PX</span></span></div>
            </section>
          </aside>
        </div>
      </section>
      <p className={`save-status ${autosave.failed ? 'error' : ''}`} role="status">{autosave.status}</p>
      {error && <p role="alert">{error}</p>}
      <PwaStatus canUpdate={autosave.status === 'この端末に保存済み' && !drawing} />
    </main>
    {newCanvas && <NewCanvasDialog onClose={() => setNewCanvas(false)} onCreate={(w, h) => {
      try { dispatch({ type: 'replace', document: createDocument(w, h) }); autosave.restart(); setZoom(1); setNewCanvas(false); setError(''); }
      catch { setError('幅・高さは1〜256の整数で指定してください。'); }
    }} />}
    {png && <ExportDialog blob={png} filename={`pixel-studio-${width}x${height}.png`} onClose={() => setPng(null)} />}
  </div>;
}
