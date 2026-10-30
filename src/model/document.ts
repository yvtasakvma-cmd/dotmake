export type Color = readonly [number, number, number, number];
export type Point = Readonly<{ x: number; y: number }>;
export type Tool = 'pen' | 'eraser' | 'fill' | 'picker' | 'pan';

export function colorToHex(color: Color): string {
  return '#' + color.slice(0, 3).map((channel) => channel.toString(16).padStart(2, '0')).join('');
}

export interface PixelDocument {
  readonly name?: string;
  readonly kind?: 'character';
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
}

export const TRANSPARENT: Color = [0, 0, 0, 0];

export function createDocument(width = 32, height = 32): PixelDocument {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 256 || height > 256) {
    throw new RangeError('キャンバスの幅・高さは1〜256の整数にしてください。');
  }
  return { width, height, pixels: new Uint8ClampedArray(width * height * 4) };
}

export function hexToColor(hex: string): Color {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new TypeError('6桁のHEXカラーが必要です。');
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 255];
}
