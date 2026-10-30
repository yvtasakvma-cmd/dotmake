import type { PixelDocument } from '../model/document';
import { spriteSheet } from '../model/document';
import { renderDocument } from '../drawing/render';

export function encodePng(document: PixelDocument): Promise<Blob> {
  document = spriteSheet(document);
  const canvas = globalThis.document.createElement('canvas');
  canvas.width = document.width;
  canvas.height = document.height;
  renderDocument(canvas, document);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNGを作成できませんでした。')), 'image/png'));
}
