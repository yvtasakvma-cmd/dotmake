import { useEffect, useReducer, useState } from 'react';
import { Icon } from './components/Icon';
import { PixelCanvas } from './components/PixelCanvas';
import { hexToColor, TRANSPARENT } from './model/document';
import { createEditor, editorReducer } from './model/editor';

const PALETTE = [
  { hex: '#303b32', name: 'フォレスト' }, { hex: '#f6f4ee', name: 'ミルク' },
  { hex: '#e77958', name: 'コーラル' }, { hex: '#efc66c', name: 'サンシャイン' },
  { hex: '#81a987', name: 'セージ' }, { hex: '#83b5c5', name: 'スカイ' },
  { hex: '#9386b5', name: 'ラベンダー' }, { hex: '#d8a2b5', name: 'ローズ' },
];

export default function App() {
  const [state, dispatch] = useReducer(editorReducer, undefined, createEditor);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState(PALETTE[0].hex);
  const [grid, setGrid] = useState(true);
  const drawing = state.stroke !== null;

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && (target.matches('input, textarea, select') || target.isContentEditable)) return;
      if (event.metaKey || event.ctrlKey) {
        if (event.key.toLowerCase() === 'z') { event.preventDefault(); dispatch({ type: event.shiftKey ? 'redo' : 'undo' }); }
        if (event.key.toLowerCase() === 'y') { event.preventDefault(); dispatch({ type: 'redo' }); }
      } else if (!event.altKey) {
        if (event.key.toLowerCase() === 'b') setTool('pen');
        if (event.key.toLowerCase() === 'e') setTool('eraser');
        if (event.key.toLowerCase() === 'g') setGrid((value) => !value);
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    if (state.past.length || state.future.length || drawing) window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state.past.length, state.future.length, drawing]);

  return <div className="app-shell">
    <main aria-label="Pixel Studio">
      <section className="editor" aria-label="ドット絵エディタ">
        <div className="workspace-toolbar">
          <div className="document-info"><span className="document-dot" /><strong>はじめてのキャンバス</strong><span className="dimension">32 × 32</span></div>
          <div className="history-buttons">
            <button className="icon-button" aria-label="元に戻す" title="元に戻す (Ctrl / ⌘ Z)" disabled={!state.past.length || drawing} onClick={() => dispatch({ type: 'undo' })}><Icon name="undo" /></button>
            <button className="icon-button" aria-label="やり直す" title="やり直す (Ctrl / ⌘ Shift Z)" disabled={!state.future.length || drawing} onClick={() => dispatch({ type: 'redo' })}><Icon name="redo" /></button>
          </div>
        </div>

        <div className="editor-body">
          <div className="canvas-workspace">
            <div className="canvas-meta"><span><span className="tiny-cross">＋</span> CANVAS / 01</span><button className={`grid-button ${grid ? 'active' : ''}`} aria-label="グリッド表示" aria-pressed={grid} onClick={() => setGrid(!grid)}><Icon name="grid" size={15} />グリッド<span className="grid-state">{grid ? 'ON' : 'OFF'}</span></button></div>
            <div className="canvas-wrap"><PixelCanvas document={state.document} color={tool === 'eraser' ? TRANSPARENT : hexToColor(color)} grid={grid} erasing={tool === 'eraser'} dispatch={dispatch} /></div>
            <div className="canvas-caption"><span className="status-dot" />{tool === 'pen' ? 'ペンで描画' : '消しゴムで消去'}<span className="canvas-resolution">32 × 32 px<span>RGBA</span></span></div>
          </div>

          <aside className="tool-panel" aria-label="描画ツール">
            <section className="tools-section" aria-labelledby="tools-heading">
              <div className="section-label"><h2 id="tools-heading">ツール</h2><span>TOOLS</span></div>
              <div className="tool-buttons">
                <button className={`tool-button ${tool === 'pen' ? 'selected' : ''}`} aria-pressed={tool === 'pen'} onClick={() => setTool('pen')}><Icon name="pen" size={22} /><span>ペン</span><kbd>B</kbd></button>
                <button className={`tool-button ${tool === 'eraser' ? 'selected' : ''}`} aria-pressed={tool === 'eraser'} onClick={() => setTool('eraser')}><Icon name="eraser" size={22} /><span>消しゴム</span><kbd>E</kbd></button>
              </div>
            </section>

            <section className="palette-section" aria-labelledby="palette-heading">
              <div className="section-label"><h2 id="palette-heading">パレット</h2><span>PALETTE</span></div>
              <div className="palette">{PALETTE.map(({ hex, name }) => <button key={hex} className={`swatch ${color === hex ? 'selected' : ''}`} style={{ backgroundColor: hex }} aria-label={`${name} ${hex}`} aria-pressed={color === hex} title={name} onClick={() => { setColor(hex); setTool('pen'); }} />)}</div>
              <div className="current-color"><span className="current-color-chip" style={{ backgroundColor: color }} /><span><span className="color-label">選択中の色</span><strong>{color.toUpperCase()}</strong></span><span className="pixel-size">1<span>PX</span></span></div>
            </section>

            <div className="tool-note"><span aria-hidden="true"><Icon name="arrow" /></span><p>ひと筆ずつ、気軽に。<br />描き直しは上の矢印から。</p></div>
          </aside>
        </div>
      </section>

      <div className="session-note"><span className="note-icon" aria-hidden="true">i</span><p>おためし版：作品は保存されません。ページを閉じると消えます。</p></div>
    </main>

    <footer className="app-footer"><span>MADE FOR YOUR LITTLE WORLDS.</span><span>ひとマスに、想像を。<span className="footer-pixels" aria-hidden="true">▪ ▪ ▪</span></span></footer>
  </div>;
}
