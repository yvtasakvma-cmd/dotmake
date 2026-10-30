import type { Color, PixelDocument, Point } from '../model/document';

// Integer Bresenham interpolation keeps fast pointer movements connected.
// Out-of-bounds pixels are ignored, so captured pointers can leave/re-enter.
export function drawLine(document: PixelDocument, from: Point, to: Point, color: Color, brushSize = 1): PixelDocument {
  if (!Number.isInteger(brushSize) || brushSize < 1 || brushSize > 32) throw new RangeError('太さは1〜32 pxの整数にしてください。');
  // Even sizes extend one extra pixel to the right and bottom of the anchor.
  const offset = Math.floor((brushSize - 1) / 2);
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
    for (let py = Math.max(0, y - offset); py < Math.min(document.height, y - offset + brushSize); py++) {
      for (let px = Math.max(0, x - offset); px < Math.min(document.width, x - offset + brushSize); px++) {
        const index = (py * document.width + px) * 4;
        const current = pixels ?? document.pixels;
        if (color.some((channel, channelOffset) => channel !== current[index + channelOffset])) {
          pixels ??= document.pixels.slice();
          pixels.set(color, index);
        }
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
