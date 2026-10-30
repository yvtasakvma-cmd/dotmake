import { describe, expect, it } from 'vitest';
import { createDocument, hexToColor, TRANSPARENT, type PixelDocument } from '../model/document';
import { clientToPixel, drawLine } from './stroke';

const ink = hexToColor('#e77958');
const pixel = (document: PixelDocument, x: number, y: number) => Array.from(document.pixels.slice((y * document.width + x) * 4, (y * document.width + x) * 4 + 4));

describe('pixel drawing', () => {
  it('starts with a completely transparent 32×32 RGBA document', () => {
    const document = createDocument();
    expect([document.width, document.height, document.pixels.length]).toEqual([32, 32, 4096]);
    expect(document.pixels.every((channel) => channel === 0)).toBe(true);
  });

  it('writes exact RGBA channels without mutating the original', () => {
    const original = createDocument();
    const drawn = drawLine(original, { x: 2, y: 3 }, { x: 2, y: 3 }, ink);
    expect(pixel(drawn, 2, 3)).toEqual([231, 121, 88, 255]);
    expect(pixel(original, 2, 3)).toEqual([0, 0, 0, 0]);
    expect(pixel(drawn, 3, 3)).toEqual([0, 0, 0, 0]);
  });

  it.each([
    [31, 0], [0, 31], [31, 31], [8, 31], [31, 8],
  ])('interpolates a fast stroke to (%i, %i) in both directions', (x, y) => {
    for (const reverse of [false, true]) {
      const from = reverse ? { x, y } : { x: 0, y: 0 };
      const to = reverse ? { x: 0, y: 0 } : { x, y };
      const result = drawLine(createDocument(), from, to, ink);
      const points: { x: number; y: number }[] = [];
      for (let py = 0; py < 32; py++) for (let px = 0; px < 32; px++) {
        if (pixel(result, px, py)[3]) points.push({ x: px, y: py });
      }
      expect(points).toHaveLength(Math.max(x, y) + 1);
      expect(pixel(result, from.x, from.y)).toEqual(ink);
      expect(pixel(result, to.x, to.y)).toEqual(ink);
      for (const point of points) {
        if (point.x === to.x && point.y === to.y) continue;
        // Every pixel has a connected neighbour towards the endpoint.
        const distance = (p: { x: number; y: number }) => Math.max(Math.abs(to.x - p.x), Math.abs(to.y - p.y));
        expect(points.some((other) => Math.abs(point.x - other.x) <= 1 && Math.abs(point.y - other.y) <= 1 && distance(other) < distance(point))).toBe(true);
      }
    }
  });

  it('ignores out-of-bounds pixels but draws a stroke crossing the canvas', () => {
    const result = drawLine(createDocument(), { x: -10, y: 15 }, { x: 42, y: 15 }, ink);
    for (let x = 0; x < 32; x++) expect(pixel(result, x, 15)).toEqual(ink);
    expect(result.pixels.filter((_, i) => i % 4 === 3 && result.pixels[i] === 255)).toHaveLength(32);
    expect(pixel(result, 0, 14)).toEqual(TRANSPARENT);
  });

  it('erases to true transparency and preserves neighbouring pixels', () => {
    const drawn = drawLine(createDocument(), { x: 0, y: 0 }, { x: 31, y: 0 }, ink);
    const erased = drawLine(drawn, { x: 5, y: 0 }, { x: 15, y: 0 }, TRANSPARENT);
    for (let x = 5; x <= 15; x++) expect(pixel(erased, x, 0)).toEqual(TRANSPARENT);
    expect(pixel(erased, 4, 0)).toEqual(ink);
    expect(pixel(erased, 16, 0)).toEqual(ink);
  });

  it('preserves object identity for no-op edits', () => {
    const document = createDocument();
    expect(drawLine(document, { x: 1, y: 1 }, { x: 20, y: 20 }, TRANSPARENT)).toBe(document);
  });

  it('maps CSS coordinates independently of display size and device pixel ratio', () => {
    const rect = { left: 30, top: 80, width: 320, height: 320 };
    expect(clientToPixel(35, 85, rect, 32, 32)).toEqual({ x: 0, y: 0 });
    expect(clientToPixel(345, 395, rect, 32, 32)).toEqual({ x: 31, y: 31 });
    expect(clientToPixel(29, 79, rect, 32, 32)).toEqual({ x: -1, y: -1 });
    expect(clientToPixel(350, 400, rect, 32, 32)).toEqual({ x: 32, y: 32 });
  });

  it('rejects malformed documents and colours', () => {
    expect(() => createDocument(0, 32)).toThrow(RangeError);
    expect(() => createDocument(32.5, 32)).toThrow(RangeError);
    expect(() => createDocument(257, 32)).toThrow(RangeError);
    expect(() => hexToColor('transparent')).toThrow(TypeError);
  });
});
