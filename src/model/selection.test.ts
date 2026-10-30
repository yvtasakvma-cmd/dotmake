import { describe, expect, it } from 'vitest';
import { createDocument } from './document';
import { createEditor, editorReducer, type EditorState } from './editor';
import { copyRegion, flipRegion, moveRegion, rectangle, translated } from '../drawing/selection';
import { sampleColor } from '../drawing/fill';

const red = [255,0,0,255] as const, blue = [0,0,255,255] as const, green = [0,255,0,255] as const, empty = [0,0,0,0] as const;
function example(): EditorState {
  const document = createDocument(8, 8);
  document.pixels.set(red, (1 * 8 + 1) * 4); document.pixels.set(blue, (1 * 8 + 2) * 4); document.pixels.set(green, (2 * 8 + 1) * 4);
  return { ...createEditor(), document, selection: { x: 1, y: 1, width: 2, height: 2 } };
}
const pixel = (state: EditorState, x: number, y: number) => sampleColor(state.document, {x,y});

describe('rectangular editing', () => {
  it('normalizes reverse drags, clips endpoints and bounds translation', () => {
    expect(rectangle({x:6,y:5},{x:-2,y:-3},8,8)).toEqual({x:0,y:0,width:7,height:6});
    expect(translated({x:1,y:1,width:2,height:3},100,-100,8,8)).toEqual({x:6,y:0,width:2,height:3});
  });
  it('copies exact RGBA bytes into an independent buffer', () => {
    const state=example(), region=copyRegion(state.document,state.selection!);
    expect([...region.pixels]).toEqual([...red,...blue,...green,...empty]);
    region.pixels[0]=0; expect(pixel(state,1,1)).toEqual(red);
  });
  it('flips only selected pixels, preserving transparent cells and the surrounding image', () => {
    const original=example();
    let state=editorReducer(original,{type:'flip-region',axis:'horizontal'});
    expect(pixel(state,1,1)).toEqual(blue);expect(pixel(state,2,1)).toEqual(red);
    expect(pixel(state,1,2)).toEqual(empty);expect(pixel(state,2,2)).toEqual(green);
    state=editorReducer(state,{type:'undo'});expect(state.document).toBe(original.document);
    state=editorReducer({...state,selection:original.selection},{type:'flip-region',axis:'vertical'});
    expect(pixel(state,1,1)).toEqual(green);expect(pixel(state,2,2)).toEqual(blue);
    expect(pixel(state,0,0)).toEqual(empty);
  });
  it('moves overlapping pixels from a snapshot without smearing and records one undo', () => {
    const source=example();
    const state=editorReducer(source,{type:'move-region',dx:1,dy:0});
    expect(pixel(state,1,1)).toEqual(empty);expect(pixel(state,2,1)).toEqual(red);expect(pixel(state,3,1)).toEqual(blue);
    expect(state.past).toHaveLength(1);
    expect(editorReducer(state,{type:'undo'}).document).toBe(source.document);
  });
  it('pastes as a floating copy, keeps the original while moving, then commits as one edit', () => {
    const source=example();
    let state=editorReducer(source,{type:'copy-region'});
    state=editorReducer(state,{type:'paste-region'});expect(state.floating).not.toBeNull();expect(state.past).toHaveLength(0);
    state=editorReducer(state,{type:'move-region',dx:3,dy:0});
    expect(pixel(state,1,1)).toEqual(red);expect(pixel(state,4,1)).toEqual(red);expect(pixel(state,5,1)).toEqual(blue);
    state=editorReducer(state,{type:'flip-region',axis:'horizontal'});expect(pixel(state,4,1)).toEqual(blue);
    state=editorReducer(state,{type:'commit-region'});expect(state.floating).toBeNull();expect(state.past).toHaveLength(1);
    state=editorReducer(state,{type:'undo'});expect(state.document).toBe(source.document);
    state=editorReducer(state,{type:'redo'});expect(pixel(state,4,1)).toEqual(blue);
  });
  it('cancels pasted pixels and touch strokes without modifying history or redo', () => {
    const source=example();let state=editorReducer(source,{type:'copy-region'});
    state=editorReducer(state,{type:'paste-region'});state=editorReducer(state,{type:'move-region',dx:4,dy:4});
    expect(editorReducer(state,{type:'cancel-region'}).document).toBe(source.document);
    expect(editorReducer(state,{type:'undo'}).document).toBe(source.document);
    state=editorReducer(source,{type:'begin',point:{x:5,y:5},color:blue});
    state=editorReducer(state,{type:'cancel-stroke'});expect(state.document).toBe(source.document);expect(state.past).toHaveLength(0);
  });
  it('retains a copied region when switching documents and clips it to a smaller destination', () => {
    let state=editorReducer(example(),{type:'copy-region'});
    state=editorReducer(state,{type:'replace',document:createDocument(1,1)});
    state=editorReducer(state,{type:'paste-region'});expect(state.selection).toEqual({x:0,y:0,width:1,height:1});
    expect(pixel(state,0,0)).toEqual(red);
    expect(state.regionClipboard?.width).toBe(2);
  });
  it('does not record empty transforms and never mutates the source region', () => {
    const source=example(), region=copyRegion(source.document,source.selection!);
    const flipped=flipRegion(region,'horizontal');expect(flipped.pixels).not.toBe(region.pixels);
    expect(moveRegion(source.document,source.selection!,source.selection!)).toBe(source.document);
    const state=editorReducer(source,{type:'move-region',dx:0,dy:0});expect(state.past).toHaveLength(0);
  });
});
