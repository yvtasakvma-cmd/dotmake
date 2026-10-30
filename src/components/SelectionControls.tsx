import type { Dispatch } from 'react';
import type { EditorAction, EditorState } from '../model/editor';

export function SelectionControls({ state, disabled, dispatch }: { state: EditorState; disabled: boolean; dispatch: Dispatch<EditorAction> }) {
  const rect = state.selection;
  return <fieldset className="selection-controls" disabled={disabled}>
    <legend>選択範囲</legend>
    <p className="palette-hint">{rect ? `${rect.width} × ${rect.height} px ／ 左 ${rect.x}・上 ${rect.y}` : 'キャンバスをドラッグして矩形選択します。'}</p>
    <div className="selection-actions">
      <button disabled={!rect} onClick={() => dispatch({ type: 'copy-region' })}>範囲をコピー</button>
      <button disabled={!state.regionClipboard || !!state.floating} onClick={() => dispatch({ type: 'paste-region' })}>範囲を貼り付け</button>
      <button disabled={!rect} onClick={() => dispatch({ type: 'flip-region', axis: 'horizontal' })}>左右反転</button>
      <button disabled={!rect} onClick={() => dispatch({ type: 'flip-region', axis: 'vertical' })}>上下反転</button>
    </div>
    <p className="palette-hint">選択の中をドラッグして移動。矢印は1 pxずつ動かします。</p>
    <div className="selection-nudges">{[
      { label: '範囲を左へ', text: '←', dx: -1, dy: 0, blocked: !rect || rect.x === 0 },
      { label: '範囲を上へ', text: '↑', dx: 0, dy: -1, blocked: !rect || rect.y === 0 },
      { label: '範囲を下へ', text: '↓', dx: 0, dy: 1, blocked: !rect || rect.y + rect.height >= state.document.height },
      { label: '範囲を右へ', text: '→', dx: 1, dy: 0, blocked: !rect || rect.x + rect.width >= state.document.width },
    ].map((item) => <button key={item.label} aria-label={item.label} disabled={item.blocked} onClick={() => dispatch({ type: 'move-region', dx: item.dx, dy: item.dy })}>{item.text}</button>)}</div>
    {state.floating ? <>
      <p className="palette-hint">貼り付け位置を調整し、確定してください。元の画像はそのまま残ります。</p>
      <div className="selection-actions"><button className="primary" onClick={() => dispatch({ type: 'commit-region' })}>貼り付けを確定</button><button onClick={() => dispatch({ type: 'cancel-region' })}>貼り付けを取消</button></div>
    </> : <button className="clear-selection" disabled={!rect} onClick={() => dispatch({ type: 'selection', rect: null })}>選択を解除</button>}
  </fieldset>;
}
