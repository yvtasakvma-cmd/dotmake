type IconName = 'pen' | 'eraser' | 'undo' | 'redo' | 'grid' | 'fill' | 'picker' | 'pan';
const paths: Record<IconName, string> = {
  pen: 'm15 5 4 4M4 20l4-1L20 7a2.83 2.83 0 0 0-4-4L4 15v5Z',
  eraser: 'm9 19-5-5a2 2 0 0 1 0-3l8-8a2 2 0 0 1 3 0l6 6a2 2 0 0 1 0 3l-7 7H9Zm-2-8 8 8M9 19h12',
  undo: 'M8 5 3 10l5 5M3 10h10a7 7 0 0 1 7 7v2',
  redo: 'm16 5 5 5-5 5m5-5H11a7 7 0 0 0-7 7v2',
  grid: 'M3 3h18v18H3V3Zm6 0v18m6-18v18M3 9h18M3 15h18',
  fill: 'm9 3 9 9-7 7a2 2 0 0 1-3 0l-5-5a2 2 0 0 1 0-3l7-7M3 12h15m1 3s-2 3-2 4a2 2 0 0 0 4 0c0-1-2-4-2-4Z',
  picker: 'm14 4 6 6M5 16l-1 4 4-1L20 7a2 2 0 0 0-3-3L5 16Z',
  pan: 'M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4m10-8 4 4-4 4',
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
