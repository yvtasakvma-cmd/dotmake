type IconName = 'pen' | 'eraser' | 'undo' | 'redo' | 'grid' | 'arrow';
const paths: Record<IconName, string> = {
  pen: 'm15 5 4 4M4 20l4-1L20 7a2.83 2.83 0 0 0-4-4L4 15v5Z',
  eraser: 'm9 19-5-5a2 2 0 0 1 0-3l8-8a2 2 0 0 1 3 0l6 6a2 2 0 0 1 0 3l-7 7H9Zm-2-8 8 8M9 19h12',
  undo: 'M8 5 3 10l5 5M3 10h10a7 7 0 0 1 7 7v2',
  redo: 'm16 5 5 5-5 5m5-5H11a7 7 0 0 0-7 7v2',
  grid: 'M3 3h18v18H3V3Zm6 0v18m6-18v18M3 9h18M3 15h18',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
