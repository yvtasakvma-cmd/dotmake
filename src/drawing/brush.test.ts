import { describe, expect, it } from 'vitest';
import { createDocument, hexToColor, TRANSPARENT } from '../model/document';
import { createEditor, editorReducer } from '../model/editor';
import { sampleColor } from './fill';
import { drawLine } from './stroke';

const ink = hexToColor('#e77958');
const count = (pixels: Uint8ClampedArray) => pixels.filter((value, i) => i % 4 === 3 && value === 255).length;

describe('square pixel brushes', () => {
  it('centres an odd-sized brush and keeps its source immutable', () => {
    const source = createDocument(8, 8);
    const drawn = drawLine(source, { x: 4, y: 4 }, { x: 4, y: 4 }, ink, 3);
    expect(count(drawn.pixels)).toBe(9);
    expect(sampleColor(drawn, { x: 3, y: 3 })).toEqual(ink);
    expect(sampleColor(drawn, { x: 5, y: 5 })).toEqual(ink);
    expect(sampleColor(drawn, { x: 6, y: 4 })).toEqual(TRANSPARENT);
    expect(count(source.pixels)).toBe(0);
  });
  it('places even-sized brushes consistently, biased right and down', () => {
    const drawn = drawLine(createDocument(8, 8), { x: 4, y: 4 }, { x: 4, y: 4 }, ink, 4);
    expect(count(drawn.pixels)).toBe(16);
    expect(sampleColor(drawn, { x: 3, y: 3 })).toEqual(ink);
    expect(sampleColor(drawn, { x: 6, y: 6 })).toEqual(ink);
    expect(sampleColor(drawn, { x: 2, y: 4 })).toEqual(TRANSPARENT);
  });
  it('clips a brush at corners without wrapping to another row', () => {
    const drawn = drawLine(createDocument(8, 8), { x: 0, y: 0 }, { x: 0, y: 0 }, ink, 4);
    expect(count(drawn.pixels)).toBe(9);
    expect(sampleColor(drawn, { x: 2, y: 2 })).toEqual(ink);
    expect(sampleColor(drawn, { x: 7, y: 0 })).toEqual(TRANSPARENT);
    expect(sampleColor(drawn, { x: 0, y: 7 })).toEqual(TRANSPARENT);
  });
  it('interpolates a fast wide stroke and erases only the specified footprint', () => {
    const drawn = drawLine(createDocument(16, 16), { x: 8, y: 0 }, { x: 8, y: 15 }, ink, 3);
    expect(count(drawn.pixels)).toBe(48);
    const erased = drawLine(drawn, { x: 8, y: 8 }, { x: 8, y: 8 }, TRANSPARENT, 3);
    expect(count(erased.pixels)).toBe(39);
    expect(sampleColor(erased, { x: 7, y: 7 })).toEqual(TRANSPARENT);
    expect(sampleColor(erased, { x: 7, y: 6 })).toEqual(ink);
    expect(count(drawn.pixels)).toBe(48);
  });
  it('undoes and redoes the complete thick stroke as one operation', () => {
    let state = createEditor();
    const empty = state.document;
    state = editorReducer(state, { type: 'begin', point: { x: 4, y: 4 }, color: ink, brushSize: 4 });
    state = editorReducer(state, { type: 'move', point: { x: 20, y: 4 } });
    state = editorReducer(state, { type: 'end' });
    const drawn = state.document;
    expect(count(drawn.pixels)).toBe(80);
    expect(state.past).toHaveLength(1);
    state = editorReducer(state, { type: 'undo' });
    expect(state.document).toBe(empty);
    expect(editorReducer(state, { type: 'redo' }).document).toBe(drawn);
  });
  it('accepts the maximum size and rejects invalid sizes', () => {
    expect(count(drawLine(createDocument(8, 8), { x: 4, y: 4 }, { x: 4, y: 4 }, ink, 32).pixels)).toBe(64);
    for (const size of [0, -1, 1.5, 33, NaN]) expect(() => drawLine(createDocument(), { x: 0, y: 0 }, { x: 0, y: 0 }, ink, size)).toThrow(RangeError);
  });
});
