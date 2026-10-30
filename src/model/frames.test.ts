import { describe, expect, it } from 'vitest';
import { asCharacter, copiedCharacter, createCharacter, createDocument, selectFrame, spriteSheet, withPixels } from './document';
import { createEditor, editorReducer } from './editor';
import { drawLine } from '../drawing/stroke';
import { floodFill } from '../drawing/fill';
import { moveRegion } from '../drawing/selection';

describe('12-frame character', () => {
  it('keeps old pixels in front-standing and creates independent transparent frames', () => {
    const old = createDocument(16, 16); old.pixels.set([1, 2, 3, 255]);
    const character = asCharacter(old);
    expect(character.frameIndex).toBe(1);
    expect(character.frames).toHaveLength(12);
    expect(new Set(character.frames).size).toBe(12);
    expect(character.pixels).not.toBe(old.pixels);
    expect([...character.pixels.slice(0, 4)]).toEqual([1, 2, 3, 255]);
    expect(character.frames![0].every(value => value === 0)).toBe(true);
  });

  it('synchronizes strokes, fills and region movement with only the selected frame', () => {
    let character = selectFrame(createCharacter(4, 4), 10);
    character = drawLine(character, { x: 0, y: 0 }, { x: 0, y: 0 }, [1, 2, 3, 255]);
    character = moveRegion(character, { x: 0, y: 0, width: 1, height: 1 }, { x: 2, y: 2, width: 1, height: 1 });
    expect(character.frames![10]).toBe(character.pixels);
    expect([...selectFrame(character, 10).pixels.slice(40, 44)]).toEqual([1, 2, 3, 255]);
    character = floodFill(selectFrame(character, 3), { x: 0, y: 0 }, [9, 8, 7, 255]);
    expect([...character.frames![3].slice(0, 4)]).toEqual([9, 8, 7, 255]);
    expect([...character.frames![10].slice(40, 44)]).toEqual([1, 2, 3, 255]);
    expect(character.frames![1].every(value => value === 0)).toBe(true);
  });

  it('copies and replaces the whole frame including transparency, with undo and size protection', () => {
    let state = editorReducer(createEditor(), { type: 'replace', document: createCharacter(2, 2) });
    state = editorReducer(state, { type: 'fill', point: { x: 0, y: 0 }, color: [1, 2, 3, 255] });
    state = editorReducer(state, { type: 'begin', point: { x: 1, y: 1 }, color: [0, 0, 0, 0] });
    state = editorReducer(state, { type: 'end' });
    state = editorReducer(state, { type: 'copy-frame' });
    const source = state.document.pixels;
    state = editorReducer(state, { type: 'frame', index: 2 });
    state = editorReducer(state, { type: 'fill', point: { x: 0, y: 0 }, color: [9, 9, 9, 255] });
    state = editorReducer(state, { type: 'paste-frame' });
    expect(state.document.pixels).toEqual(source);
    expect(state.document.pixels).not.toBe(source);
    expect(state.document.pixels).not.toBe(state.frameClipboard!.pixels);
    expect([...state.document.pixels.slice(12)]).toEqual([0, 0, 0, 0]);
    state = editorReducer(state, { type: 'undo' });
    expect([...state.document.pixels.slice(12)]).toEqual([9, 9, 9, 255]);
    expect(state.document.frames![1]).toEqual(source);
    state = editorReducer(state, { type: 'redo' });
    expect(state.document.pixels).toEqual(source);
    state = editorReducer(state, { type: 'replace', document: createCharacter(3, 3) });
    expect(editorReducer(state, { type: 'paste-frame' })).toBe(state);
  });

  it('exports all 12 frames in 3 columns and 4 rows without scaling or losing alpha', () => {
    let character = createCharacter(32, 32);
    for (let index = 0; index < 12; index++) {
      const pixels = new Uint8ClampedArray(32 * 32 * 4);
      pixels.set([index + 1, 99, 88, 255]);
      character = withPixels(selectFrame(character, index), pixels);
    }
    const sheet = spriteSheet(character);
    expect([sheet.width, sheet.height]).toEqual([96, 128]);
    for (let index = 0; index < 12; index++) {
      const offset = ((Math.floor(index / 3) * 32) * 96 + index % 3 * 32) * 4;
      expect([...sheet.pixels.slice(offset, offset + 4)]).toEqual([index + 1, 99, 88, 255]);
      expect(sheet.pixels[offset + 7]).toBe(0);
    }
    const copy = copiedCharacter(character);
    for (let index = 0; index < 12; index++) {
      expect(copy.frames![index]).toEqual(character.frames![index]);
      expect(copy.frames![index]).not.toBe(character.frames![index]);
    }
    expect(copy.pixels).toBe(copy.frames![copy.frameIndex!]);
    expect(spriteSheet(createCharacter(256, 256)).pixels.length).toBe(768 * 1024 * 4);
  });
});
