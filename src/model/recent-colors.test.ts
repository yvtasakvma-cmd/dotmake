import { expect, it } from 'vitest';
import { createEditor, editorReducer, type EditorState } from './editor';
import { hexToColor, TRANSPARENT } from './document';

function paint(state: EditorState, hex: string, x = 0) {
  state = editorReducer(state, { type: 'begin', point: { x, y: 0 }, color: hexToColor(hex) });
  return editorReducer(state, { type: 'end' });
}

it('remembers only the five most recently used distinct drawing colours', () => {
  let state = createEditor();
  for (const hex of ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666']) state = paint(state, hex);
  expect(state.recentColors).toEqual(['#666666', '#555555', '#444444', '#333333', '#222222']);
  state = paint(state, '#333333');
  expect(state.recentColors).toEqual(['#333333', '#666666', '#555555', '#444444', '#222222']);
});

it('excludes cancelled strokes, erasing and no-op painting, and keeps history across undo', () => {
  let state = paint(createEditor(), '#123456');
  state = paint(state, '#abcdef', 1);
  state = paint(state, '#123456'); // Same colour already at this pixel.
  expect(state.recentColors).toEqual(['#abcdef', '#123456']);
  state = editorReducer(state, { type: 'begin', point: { x: 0, y: 0 }, color: hexToColor('#ffffff') });
  state = editorReducer(state, { type: 'cancel-stroke' });
  state = editorReducer(state, { type: 'begin', point: { x: 0, y: 0 }, color: TRANSPARENT });
  state = editorReducer(state, { type: 'end' });
  state = editorReducer(state, { type: 'undo' });
  expect(state.recentColors).toEqual(['#abcdef', '#123456']);
});

it('includes successful fills without adding transparent fills', () => {
  let state = editorReducer(createEditor(), { type: 'fill', point: { x: 0, y: 0 }, color: hexToColor('#123456') });
  state = editorReducer(state, { type: 'fill', point: { x: 0, y: 0 }, color: TRANSPARENT });
  expect(state.recentColors).toEqual(['#123456']);
});
