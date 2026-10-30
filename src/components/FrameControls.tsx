import { useMemo, type Dispatch } from 'react';
import { DIRECTIONS, POSES } from '../model/document';
import type { EditorAction, EditorState } from '../model/editor';

function FrameThumbnail({ pixels, width, height }: { pixels: Uint8ClampedArray; width: number; height: number }) {
  const source = useMemo(() => {
    const canvas = window.document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d')!;
    const image = context.createImageData(width, height);
    image.data.set(pixels); context.putImageData(image, 0, 0);
    return canvas.toDataURL('image/png');
  }, [pixels, width, height]);
  return <img className="frame-thumbnail" src={source} alt="" width={width} height={height} />;
}

export function FrameControls({ state, disabled, dispatch, onPlay }: { state: EditorState; disabled: boolean; dispatch: Dispatch<EditorAction>; onPlay: () => void }) {
  const { document, frameClipboard } = state;
  if (!document.frames) return null;
  const index = document.frameIndex!;
  const row = Math.floor(index / 3), column = index % 3;
  const sameSize = frameClipboard?.width === document.width && frameClipboard.height === document.height;
  return <section className="frame-navigation" aria-label="歩行グラフィックのコマ切り替え">
    <div className="frame-nav-row">
      <div className="direction-buttons"><button aria-label="前の向き" disabled={disabled || row === 0} onClick={() => dispatch({ type: 'frame', index: index - 3 })}>↑</button><button aria-label="次の向き" disabled={disabled || row === 3} onClick={() => dispatch({ type: 'frame', index: index + 3 })}>↓</button></div>
      <button aria-label="前のポーズ" disabled={disabled || column === 0} onClick={() => dispatch({ type: 'frame', index: index - 1 })}>←</button>
      <output aria-label="編集中のコマ">{DIRECTIONS[row]}・{POSES[column]}</output>
      <button aria-label="次のポーズ" disabled={disabled || column === 2} onClick={() => dispatch({ type: 'frame', index: index + 1 })}>→</button>
    </div>
    <button className="walk-preview-button" disabled={disabled} onClick={onPlay}>▶ 歩行を再生</button>
    <div className="frame-copy-actions"><button disabled={disabled} onClick={() => dispatch({ type: 'copy-frame' })}>1コマ全体コピー</button><button disabled={disabled || !sameSize} onClick={() => dispatch({ type: 'paste-frame' })}>1コマ全体貼り付け</button></div>
    {frameClipboard && <p className="palette-hint">コピー中：{frameClipboard.width} × {frameClipboard.height} px。貼り付けは今のコマを置き換えます。Undoできます。{!sameSize && '同じサイズのコマで貼り付けできます。'}</p>}
    <details><summary>12コマ一覧・出力の並び</summary><div className="frame-table-wrap"><table className="frame-table"><thead><tr><th scope="col">向き</th>{POSES.map((pose) => <th key={pose} scope="col">{pose}</th>)}</tr></thead><tbody>{DIRECTIONS.map((direction, y) => <tr key={direction}><th scope="row">{direction}</th>{POSES.map((pose, x) => <td key={pose}><button aria-label={`${direction}・${pose}を編集`} aria-pressed={index === y * 3 + x} className={index === y * 3 + x ? 'selected' : ''} disabled={disabled} onClick={() => dispatch({ type: 'frame', index: y * 3 + x })}><FrameThumbnail pixels={document.frames![y * 3 + x]} width={document.width} height={document.height} /><span>{pose}</span></button></td>)}</tr>)}</tbody></table></div><p className="palette-hint">PNG：{document.width * 3} × {document.height * 4} px（透明背景・余白なし）</p></details>
  </section>;
}
