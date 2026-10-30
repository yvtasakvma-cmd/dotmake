import { drawLine } from '../drawing/stroke';
import { createDocument, type Color, type PixelDocument, type Point } from './document';

export const HISTORY_LIMIT = 50;
export interface EditorState {
  readonly document: PixelDocument;
  readonly past: readonly PixelDocument[];
  readonly future: readonly PixelDocument[];
  readonly stroke: { readonly before: PixelDocument; readonly last: Point; readonly color: Color } | null;
}

export type EditorAction =
  | { type: 'begin'; point: Point; color: Color }
  | { type: 'move'; point: Point }
  | { type: 'end' }
  | { type: 'undo' }
  | { type: 'redo' };

export function createEditor(): EditorState {
  return { document: createDocument(), past: [], future: [], stroke: null };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'begin':
      if (state.stroke) return state;
      return {
        ...state,
        document: drawLine(state.document, action.point, action.point, action.color),
        stroke: { before: state.document, last: action.point, color: action.color },
      };
    case 'move':
      if (!state.stroke) return state;
      return {
        ...state,
        document: drawLine(state.document, state.stroke.last, action.point, state.stroke.color),
        stroke: { ...state.stroke, last: action.point },
      };
    case 'end':
      if (!state.stroke) return state;
      if (state.document === state.stroke.before) return { ...state, stroke: null };
      return {
        ...state,
        stroke: null,
        past: [...state.past, state.stroke.before].slice(-HISTORY_LIMIT),
        future: [],
      };
    case 'undo': {
      if (state.stroke || !state.past.length) return state;
      return { ...state, document: state.past[state.past.length - 1], past: state.past.slice(0, -1), future: [...state.future, state.document] };
    }
    case 'redo': {
      if (state.stroke || !state.future.length) return state;
      return { ...state, document: state.future[state.future.length - 1], past: [...state.past, state.document], future: state.future.slice(0, -1) };
    }
  }
}
