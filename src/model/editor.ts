import { drawLine } from '../drawing/stroke';
import { floodFill } from '../drawing/fill';
import { colorToPaintHex, createDocument, selectFrame, withPixels, type Color, type PixelDocument, type Point } from './document';
import { copyRegion, flipRegion, moveRegion, placeRegion, rectangle, translated, type PixelRegion, type Rect } from '../drawing/selection';

export const HISTORY_LIMIT = 50;
export interface EditorState {
  readonly document: PixelDocument;
  readonly recentColors: readonly string[];
  readonly past: readonly PixelDocument[];
  readonly future: readonly PixelDocument[];
  readonly selection: Rect | null;
  readonly regionClipboard: PixelRegion | null;
  readonly frameClipboard: PixelRegion | null;
  readonly floating: { base: PixelDocument; region: PixelRegion } | null;
  readonly stroke: { readonly before: PixelDocument; readonly last: Point; readonly color: Color; readonly brushSize: number } | null;
}

export type EditorAction =
  | { type: 'frame'; index: number }
  | { type: 'copy-frame' }
  | { type: 'paste-frame' }
  | { type: 'selection'; rect: Rect | null }
  | { type: 'copy-region' }
  | { type: 'paste-region' }
  | { type: 'flip-region'; axis: 'horizontal' | 'vertical' }
  | { type: 'move-region'; dx: number; dy: number }
  | { type: 'commit-region' }
  | { type: 'cancel-region' }
  | { type: 'cancel-stroke' }
  | { type: 'replace'; document: PixelDocument }
  | { type: 'fill'; point: Point; color: Color }
  | { type: 'begin'; point: Point; color: Color; brushSize?: number }
  | { type: 'move'; point: Point }
  | { type: 'end' }
  | { type: 'undo' }
  | { type: 'redo' };

export function createEditor(): EditorState {
  return { document: createDocument(), recentColors: [], past: [], future: [], stroke: null, selection: null, regionClipboard: null, frameClipboard: null, floating: null };
}

function rememberColor(colors: readonly string[], color: Color): readonly string[] {
  if (color[3] === 0) return colors;
  const hex = colorToPaintHex(color);
  return [hex, ...colors.filter(item => item !== hex)].slice(0, 5);
}

function commitImage(state: EditorState, document: PixelDocument, before = state.document): EditorState {
  return document === before ? { ...state, document, floating: null } : {
    ...state, document, past: [...state.past, before].slice(-HISTORY_LIMIT), future: [], floating: null,
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'frame':
      return state.stroke || state.floating ? state : { ...state, document: selectFrame(state.document, action.index), selection: null };
    case 'copy-frame':
      return state.stroke || state.floating ? state : { ...state, frameClipboard: { width: state.document.width, height: state.document.height, pixels: state.document.pixels.slice() } };
    case 'paste-frame': {
      const source = state.frameClipboard;
      if (state.stroke || state.floating || !source || source.width !== state.document.width || source.height !== state.document.height) return state;
      if (source.pixels.every((value, i) => value === state.document.pixels[i])) return { ...state, selection: null };
      return { ...commitImage(state, withPixels(state.document, source.pixels.slice())), selection: null };
    }
    case 'cancel-stroke':
      return state.stroke ? { ...state, document: state.stroke.before, stroke: null } : state;
    case 'selection': {
      if (state.stroke || state.floating) return state;
      const r = action.rect;
      return { ...state, selection: r ? rectangle(r, { x: r.x + r.width - 1, y: r.y + r.height - 1 }, state.document.width, state.document.height) : null };
    }
    case 'copy-region':
      return !state.selection || state.stroke ? state : { ...state, regionClipboard: copyRegion(state.document, state.selection) };
    case 'paste-region': {
      if (!state.regionClipboard || state.stroke || state.floating) return state;
      const source = state.regionClipboard;
      const region = copyRegion({ ...source }, { x: 0, y: 0, width: Math.min(source.width, state.document.width), height: Math.min(source.height, state.document.height) });
      const selection = translated({ x: state.selection?.x ?? 0, y: state.selection?.y ?? 0, width: region.width, height: region.height }, 0, 0, state.document.width, state.document.height);
      return { ...state, floating: { base: state.document, region }, selection, document: placeRegion(state.document, region, selection) };
    }
    case 'move-region': {
      if (!state.selection || state.stroke) return state;
      const selection = translated(state.selection, action.dx, action.dy, state.document.width, state.document.height);
      if (state.floating) return { ...state, selection, document: placeRegion(state.floating.base, state.floating.region, selection) };
      return { ...commitImage(state, moveRegion(state.document, state.selection, selection)), selection };
    }
    case 'flip-region': {
      if (!state.selection || state.stroke) return state;
      if (state.floating) {
        const region = flipRegion(state.floating.region, action.axis);
        return { ...state, floating: { ...state.floating, region }, document: placeRegion(state.floating.base, region, state.selection) };
      }
      return commitImage(state, placeRegion(state.document, flipRegion(copyRegion(state.document, state.selection), action.axis), state.selection));
    }
    case 'commit-region':
      return state.floating ? commitImage(state, state.document, state.floating.base) : state;
    case 'cancel-region':
      return state.floating ? { ...state, document: state.floating.base, floating: null, selection: null } : state;
    case 'replace':
      if (state.stroke || state.floating) return state;
      return { ...state, document: action.document, past: [], future: [], stroke: null, selection: null, floating: null };
    case 'fill': {
      if (state.stroke || state.floating) return state;
      const document = floodFill(state.document, action.point, action.color);
      if (document === state.document) return state;
      return { ...state, document, recentColors: rememberColor(state.recentColors, action.color), past: [...state.past, state.document].slice(-HISTORY_LIMIT), future: [], stroke: null };
    }
    case 'begin':
      if (state.stroke || state.floating) return state;
      return {
        ...state,
        document: drawLine(state.document, action.point, action.point, action.color, action.brushSize),
        stroke: { before: state.document, last: action.point, color: action.color, brushSize: action.brushSize ?? 1 },
      };
    case 'move':
      if (!state.stroke) return state;
      return {
        ...state,
        document: drawLine(state.document, state.stroke.last, action.point, state.stroke.color, state.stroke.brushSize),
        stroke: { ...state.stroke, last: action.point },
      };
    case 'end':
      if (!state.stroke) return state;
      if (state.document === state.stroke.before) return { ...state, stroke: null };
      return {
        ...state,
        stroke: null,
        recentColors: rememberColor(state.recentColors, state.stroke.color),
        past: [...state.past, state.stroke.before].slice(-HISTORY_LIMIT),
        future: [],
      };
    case 'undo': {
      if (state.floating) return { ...state, document: state.floating.base, floating: null, selection: null };
      if (state.stroke || !state.past.length) return state;
      return { ...state, selection: null, document: state.past[state.past.length - 1], past: state.past.slice(0, -1), future: [...state.future, state.document] };
    }
    case 'redo': {
      if (state.stroke || state.floating || !state.future.length) return state;
      return { ...state, selection: null, document: state.future[state.future.length - 1], past: [...state.past, state.document], future: state.future.slice(0, -1) };
    }
  }
}
