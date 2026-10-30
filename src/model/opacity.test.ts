import { expect, it } from 'vitest';
import { colorToPaintHex, createCharacter, hexToColor } from './document';
import { createEditor, editorReducer } from './editor';
import { drawLine } from '../drawing/stroke';
import { floodFill, sampleColor } from '../drawing/fill';

it('round trips opacity while keeping old opaque colours in their existing format', () => {
  for (const hex of ['#ff000080', '#12345601', '#abcdef00', '#000000']) expect(colorToPaintHex(hexToColor(hex))).toBe(hex);
  expect(colorToPaintHex(hexToColor('#abcdefFF'))).toBe('#abcdef');
  for (const hex of ['#12345', '#1234567', '#123456789', '#123456zz']) expect(() => hexToColor(hex)).toThrow(TypeError);
});

it('replaces RGBA without building up opacity on repeated strokes and preserves alpha in frame storage', () => {
  const ink = hexToColor('#ff000080'), point = { x: 1, y: 1 };
  const painted = drawLine(createCharacter(4, 4), point, point, ink);
  expect(drawLine(painted, point, point, ink)).toBe(painted);
  expect(sampleColor(painted, point)).toEqual([255, 0, 0, 128]);
  expect(painted.frames![1]).toBe(painted.pixels);
  const filled = floodFill(painted, { x: 0, y: 0 }, hexToColor('#0000ff40'));
  expect(sampleColor(filled, point)).toEqual(ink);
  expect(sampleColor(filled, { x: 0, y: 0 })).toEqual([0, 0, 255, 64]);
});

it('remembers different opacities of one colour separately and undoes alpha edits', () => {
  let state = createEditor();
  for (const hex of ['#ff0000', '#ff000080', '#ff000040']) {
    state = editorReducer(state, { type: 'begin', point: { x: 0, y: 0 }, color: hexToColor(hex) });
    state = editorReducer(state, { type: 'end' });
  }
  expect(state.recentColors).toEqual(['#ff000040', '#ff000080', '#ff0000']);
  state = editorReducer(state, { type: 'undo' });
  expect(state.document.pixels[3]).toBe(128);
  state = editorReducer(state, { type: 'redo' });
  expect(state.document.pixels[3]).toBe(64);
});
