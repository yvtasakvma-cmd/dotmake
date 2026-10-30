import type { Color, PixelDocument, Point } from '../model/document';

// Integer Bresenham interpolation keeps fast pointer movements connected.
// Out-of-bounds pixels are ignored, so captured pointers can leave/re-enter.
export function drawLine(document: PixelDocument, from: Point, to: Point, color: Color): PixelDocument {
  let x = Math.floor(from.x);
  let y = Math.floor(from.y);
  const endX = Math.floor(to.x);
  const endY = Math.floor(to.y);
  const dx = Math.abs(endX - x);
  const dy = -Math.abs(endY - y);
  const sx = x < endX ? 1 : -1;
  const sy = y < endY ? 1 : -1;
  let error = dx + dy;
  let pixels: Uint8ClampedArray | undefined;

  while (true) {
    if (x >= 0 && x < document.width && y >= 0 && y < document.height) {
      const index = (y * document.width + x) * 4;
      const current = pixels ?? document.pixels;
      if (color.some((channel, offset) => channel !== current[index + offset])) {
        pixels ??= document.pixels.slice();
        pixels.set(color, index);
      }
    }
    if (x === endX && y === endY) break;
    const twiceError = error * 2;
    if (twiceError >= dy) { error += dy; x += sx; }
    if (twiceError <= dx) { error += dx; y += sy; }
  }
  return pixels ? { ...document, pixels } : document;
}

export function clientToPixel(clientX: number, clientY: number, rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>, width: number, height: number): Point {
  return {
    x: Math.floor((clientX - rect.left) / rect.width * width),
    y: Math.floor((clientY - rect.top) / rect.height * height),
  };
}
