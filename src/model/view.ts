export const MIN_ZOOM = 0.125;
export const MAX_ZOOM = 16;

export interface CanvasBackground {
  mode: 'checker' | 'solid';
  color: string;
}
export const DEFAULT_BACKGROUND: CanvasBackground = { mode: 'checker', color: '#ffffff' };
