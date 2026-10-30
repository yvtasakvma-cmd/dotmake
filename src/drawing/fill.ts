import type { Color, PixelDocument, Point } from '../model/document';
import { withPixels } from '../model/document';

export function sampleColor(document: PixelDocument, point: Point): Color | null {
  const { x, y } = point;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= document.width || y >= document.height) return null;
  const i = (y * document.width + x) * 4;
  return [document.pixels[i], document.pixels[i + 1], document.pixels[i + 2], document.pixels[i + 3]];
}

// Iterative four-neighbour flood fill. Mark on enqueue to keep memory bounded.
export function floodFill(document: PixelDocument, point: Point, color: Color): PixelDocument {
  const target = sampleColor(document, point);
  if (!target || target.every((value, i) => value === color[i])) return document;
  const pixels = document.pixels.slice();
  const queue = new Int32Array(document.width * document.height);
  let head = 0, tail = 0;
  const add = (index: number) => {
    const offset = index * 4;
    if (!target.every((value, i) => pixels[offset + i] === value)) return;
    pixels.set(color, offset);
    queue[tail++] = index;
  };
  add(point.y * document.width + point.x);
  while (head < tail) {
    const index = queue[head++];
    const x = index % document.width;
    if (x > 0) add(index - 1);
    if (x < document.width - 1) add(index + 1);
    if (index >= document.width) add(index - document.width);
    if (index < document.width * (document.height - 1)) add(index + document.width);
  }
  return withPixels(document, pixels);
}
