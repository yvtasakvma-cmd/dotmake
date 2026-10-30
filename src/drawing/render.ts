import type { PixelDocument } from '../model/document';

export function renderDocument(canvas: HTMLCanvasElement, document: PixelDocument) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('このブラウザではCanvasを使用できません。');
  const image = context.createImageData(document.width, document.height);
  image.data.set(document.pixels);
  context.putImageData(image, 0, 0);
}
