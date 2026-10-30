import { describe, expect, it } from 'vitest';
import { createDocument, hexToColor, TRANSPARENT } from '../model/document';
import { editorReducer, createEditor } from '../model/editor';
import { drawLine } from './stroke';
import { floodFill, sampleColor } from './fill';

const red = hexToColor('#ff0000');
const blue = hexToColor('#0000ff');

describe('four-neighbour fill and eyedropper', () => {
  it('fills only the connected area and leaves its source unchanged', () => {
    const divided = drawLine(createDocument(16, 16), { x: 8, y: 0 }, { x: 8, y: 15 }, red);
    const result = floodFill(divided, { x: 0, y: 0 }, blue);
    expect(sampleColor(result, { x: 7, y: 15 })).toEqual(blue);
    expect(sampleColor(result, { x: 8, y: 15 })).toEqual(red);
    expect(sampleColor(result, { x: 9, y: 15 })).toEqual(TRANSPARENT);
    expect(sampleColor(divided, { x: 0, y: 0 })).toEqual(TRANSPARENT);
  });
  it('does not connect through a diagonal corner', () => {
    let document = createDocument(2, 2);
    document = drawLine(document, { x: 1, y: 0 }, { x: 0, y: 1 }, red);
    document = floodFill(document, { x: 0, y: 0 }, blue);
    expect(sampleColor(document, { x: 1, y: 1 })).toEqual(TRANSPARENT);
  });
  it('handles the largest supported document without recursion', () => {
    const result = floodFill(createDocument(256, 256), { x: 255, y: 255 }, red);
    expect(result.pixels.filter((_, i) => i % 4 === 3 && result.pixels[i] === 255)).toHaveLength(65536);
  });
  it('treats same-colour and outside fills as no-ops', () => {
    const document = createDocument();
    expect(floodFill(document, { x: 0, y: 0 }, TRANSPARENT)).toBe(document);
    expect(floodFill(document, { x: -1, y: 0 }, red)).toBe(document);
    expect(sampleColor(document, { x: 32, y: 0 })).toBeNull();
  });
  it('records each fill as one undoable operation and clears redo on new fills', () => {
    let state = createEditor();
    const empty = state.document;
    state = editorReducer(state, { type: 'fill', point: { x: 0, y: 0 }, color: red });
    expect(state.past).toHaveLength(1);
    const filled = state.document;
    state = editorReducer(state, { type: 'undo' });
    expect(state.document).toBe(empty);
    state = editorReducer(state, { type: 'redo' });
    expect(state.document).toBe(filled);
    state = editorReducer(state, { type: 'undo' });
    state = editorReducer(state, { type: 'fill', point: { x: 0, y: 0 }, color: blue });
    expect(state.future).toHaveLength(0);
  });
});
