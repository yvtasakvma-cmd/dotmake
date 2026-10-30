import { expect, it } from 'vitest';
import { copiedCharacter, createDocument } from './document';

it('copies dimensions, all RGBA bytes and a bounded name into independent pixels', () => {
  const source = { ...createDocument(24, 16), name: '勇者' };
  source.pixels.set([231, 121, 88, 255], 16);
  const result = copiedCharacter(source);
  expect([result.width, result.height, result.kind, result.name]).toEqual([24, 16, 'character', '勇者のコピー']);
  expect(result.pixels).toEqual(source.pixels);
  expect(result.pixels).not.toBe(source.pixels);
  result.pixels[16] = 0;
  expect(source.pixels[16]).toBe(231);
  expect(copiedCharacter({ ...source, name: 'あ'.repeat(40) }).name).toHaveLength(40);
});
