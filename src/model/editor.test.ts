import { describe, expect, it } from 'vitest';
import { hexToColor, TRANSPARENT } from './document';
import { createEditor, editorReducer, HISTORY_LIMIT, type EditorState } from './editor';

const ink = hexToColor('#303b32');
function tap(state: EditorState, x = 1, color = ink) {
  return editorReducer(editorReducer(state, { type: 'begin', point: { x, y: 1 }, color }), { type: 'end' });
}

describe('stroke history', () => {
  it('keeps the new name through drawing undo and redo without changing pixels or history length', () => {
    let state = createEditor();
    state = { ...state, document: { ...state.document, name: '元の名前' } };
    state = tap(tap(state, 1), 2);
    state = editorReducer(state, { type: 'undo' });
    const before = state;
    state = editorReducer(state, { type: 'rename', document: { ...state.document, name: '新しい名前' } });
    expect(state.document.pixels).toBe(before.document.pixels);
    expect(state.past).toHaveLength(1); expect(state.future).toHaveLength(1);
    expect(before.document.name).toBe('元の名前');
    state = editorReducer(state, { type: 'undo' });
    expect(state.document.name).toBe('新しい名前');
    expect(state.document.pixels).toBe(before.past[0].pixels);
    state = editorReducer(state, { type: 'redo' });
    expect(state.document.name).toBe('新しい名前');
    expect(state.document.pixels).toBe(before.document.pixels);
    state = editorReducer(state, { type: 'redo' });
    expect(state.document.name).toBe('新しい名前');
    expect(state.document.pixels).toBe(before.future[0].pixels);
  });

  it('undoes and redoes an entire multi-event stroke as one operation', () => {
    const empty = createEditor();
    let state = editorReducer(empty, { type: 'begin', point: { x: 0, y: 0 }, color: ink });
    for (let x = 1; x < 32; x++) state = editorReducer(state, { type: 'move', point: { x, y: x } });
    state = editorReducer(state, { type: 'end' });
    const drawn = state.document;
    expect(state.past).toHaveLength(1);
    state = editorReducer(state, { type: 'undo' });
    expect(state.document).toBe(empty.document);
    state = editorReducer(state, { type: 'redo' });
    expect(state.document).toBe(drawn);
  });

  it('invalidates redo only when a new stroke changes pixels', () => {
    let state = tap(createEditor());
    state = editorReducer(state, { type: 'undo' });
    state = tap(state, 1, TRANSPARENT);
    expect(state.future).toHaveLength(1);
    state = tap(state, 8);
    expect(state.future).toHaveLength(0);
  });

  it('does not record drawing with the same colour or erasing an empty pixel', () => {
    let state = tap(createEditor(), 1, TRANSPARENT);
    expect(state.past).toHaveLength(0);
    state = tap(state);
    state = tap(state);
    expect(state.past).toHaveLength(1);
  });

  it('restores erased pixels with undo', () => {
    let state = tap(createEditor());
    const drawn = state.document;
    state = tap(state, 1, TRANSPARENT);
    expect(state.document.pixels.every((value) => value === 0)).toBe(true);
    expect(editorReducer(state, { type: 'undo' }).document).toBe(drawn);
  });

  it('ignores extra starts and undo/redo during a stroke', () => {
    const state = editorReducer(createEditor(), { type: 'begin', point: { x: 0, y: 0 }, color: ink });
    expect(editorReducer(state, { type: 'undo' })).toBe(state);
    expect(editorReducer(state, { type: 'redo' })).toBe(state);
    expect(editorReducer(state, { type: 'begin', point: { x: 4, y: 4 }, color: ink })).toBe(state);
  });

  it('retains the latest 50 completed edits', () => {
    let state = createEditor();
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) state = tap(state, 1, i % 2 ? ink : hexToColor('#e77958'));
    expect(state.past).toHaveLength(HISTORY_LIMIT);
    for (let i = 0; i < HISTORY_LIMIT; i++) state = editorReducer(state, { type: 'undo' });
    expect(state.past).toHaveLength(0);
    expect(state.future).toHaveLength(HISTORY_LIMIT);
    expect(editorReducer(state, { type: 'undo' })).toBe(state);
    for (let i = 0; i < HISTORY_LIMIT; i++) state = editorReducer(state, { type: 'redo' });
    expect(state.past).toHaveLength(HISTORY_LIMIT);
    expect(state.future).toHaveLength(0);
  });
});
