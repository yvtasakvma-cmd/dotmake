import type { PixelDocument, Point } from '../model/document';

export interface Rect { x: number; y: number; width: number; height: number }
export interface PixelRegion { width: number; height: number; pixels: Uint8ClampedArray }

export function rectangle(from: Point, to: Point, width: number, height: number): Rect {
  const x1 = Math.max(0, Math.min(width - 1, from.x));
  const y1 = Math.max(0, Math.min(height - 1, from.y));
  const x2 = Math.max(0, Math.min(width - 1, to.x));
  const y2 = Math.max(0, Math.min(height - 1, to.y));
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1) + 1, height: Math.abs(y2 - y1) + 1 };
}
export function contains(rect: Rect, point: Point) {
  return point.x >= rect.x && point.y >= rect.y && point.x < rect.x + rect.width && point.y < rect.y + rect.height;
}
export function translated(rect: Rect, dx: number, dy: number, width: number, height: number): Rect {
  return { ...rect, x: Math.max(0, Math.min(width - rect.width, rect.x + dx)), y: Math.max(0, Math.min(height - rect.height, rect.y + dy)) };
}
export function copyRegion(document: PixelDocument, rect: Rect): PixelRegion {
  const pixels = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y++) {
    const start = ((rect.y + y) * document.width + rect.x) * 4;
    pixels.set(document.pixels.subarray(start, start + rect.width * 4), y * rect.width * 4);
  }
  return { width: rect.width, height: rect.height, pixels };
}
export function flipRegion(region: PixelRegion, axis: 'horizontal' | 'vertical'): PixelRegion {
  const pixels = new Uint8ClampedArray(region.pixels.length);
  for (let y = 0; y < region.height; y++) for (let x = 0; x < region.width; x++) {
    const sx = axis === 'horizontal' ? region.width - 1 - x : x;
    const sy = axis === 'vertical' ? region.height - 1 - y : y;
    const offset = (sy * region.width + sx) * 4;
    pixels.set(region.pixels.subarray(offset, offset + 4), (y * region.width + x) * 4);
  }
  return { ...region, pixels };
}
export function placeRegion(document: PixelDocument, region: PixelRegion, at: Point, clear?: Rect): PixelDocument {
  const pixels = document.pixels.slice();
  if (clear) for (let y = clear.y; y < clear.y + clear.height; y++) {
    pixels.fill(0, (y * document.width + clear.x) * 4, (y * document.width + clear.x + clear.width) * 4);
  }
  for (let y = 0; y < region.height; y++) for (let x = 0; x < region.width; x++) {
    const dx = at.x + x, dy = at.y + y;
    if (dx < 0 || dy < 0 || dx >= document.width || dy >= document.height) continue;
    const offset = (y * region.width + x) * 4;
    pixels.set(region.pixels.subarray(offset, offset + 4), (dy * document.width + dx) * 4);
  }
  return pixels.every((value, i) => value === document.pixels[i]) ? document : { ...document, pixels };
}
export function moveRegion(document: PixelDocument, rect: Rect, target: Rect): PixelDocument {
  if (rect.x === target.x && rect.y === target.y) return document;
  return placeRegion(document, copyRegion(document, rect), target, rect);
}
