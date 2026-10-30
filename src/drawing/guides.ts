export type GuideMode = 'off' | 'both' | 'vertical' | 'horizontal';

export function guidePaths(width: number, height: number, mode: GuideMode, center = false) {
  const vertical = mode === 'both' || mode === 'vertical';
  const horizontal = mode === 'both' || mode === 'horizontal';
  return {
    vertical: !vertical ? '' : center ? `M${width / 2} 0V${height}` : Array.from({ length: width - 1 }, (_, i) => `M${i + 1} 0V${height}`).join(' '),
    horizontal: !horizontal ? '' : center ? `M0 ${height / 2}H${width}` : Array.from({ length: height - 1 }, (_, i) => `M0 ${i + 1}H${width}`).join(' '),
  };
}
