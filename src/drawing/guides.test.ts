import { describe, expect, it } from 'vitest';
import { guidePaths } from './guides';

describe('directional guides', () => {
  it('draws only internal grid boundaries in the selected direction', () => {
    expect(guidePaths(4, 3, 'vertical')).toEqual({ vertical: 'M1 0V3 M2 0V3 M3 0V3', horizontal: '' });
    expect(guidePaths(4, 3, 'horizontal')).toEqual({ vertical: '', horizontal: 'M0 1H4 M0 2H4' });
    expect(guidePaths(4, 3, 'off')).toEqual({ vertical: '', horizontal: '' });
  });
  it('places centre lines at the geometric middle of even and odd canvases', () => {
    expect(guidePaths(32, 16, 'both', true)).toEqual({ vertical: 'M16 0V16', horizontal: 'M0 8H32' });
    expect(guidePaths(5, 3, 'both', true)).toEqual({ vertical: 'M2.5 0V3', horizontal: 'M0 1.5H5' });
    expect(guidePaths(5, 3, 'vertical', true).horizontal).toBe('');
    expect(guidePaths(5, 3, 'horizontal', true).vertical).toBe('');
  });
  it('supports a single-pixel canvas without generating extra grid lines', () => {
    expect(guidePaths(1, 1, 'both')).toEqual({ vertical: '', horizontal: '' });
    expect(guidePaths(1, 1, 'both', true)).toEqual({ vertical: 'M0.5 0V1', horizontal: 'M0 0.5H1' });
  });
});
