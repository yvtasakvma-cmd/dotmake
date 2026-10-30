export type Color = readonly [number, number, number, number];
export type Point = Readonly<{ x: number; y: number }>;
export type Tool = 'pen' | 'eraser' | 'fill' | 'picker' | 'pan' | 'select';

export function colorToHex(color: Color): string {
  return '#' + color.slice(0, 3).map((channel) => channel.toString(16).padStart(2, '0')).join('');
}

// Keep opaque palette entries compatible with the original six-digit format.
export function colorToPaintHex(color: Color): string {
  return colorToHex(color) + (color[3] === 255 ? '' : color[3].toString(16).padStart(2, '0'));
}

export interface PixelDocument {
  readonly name?: string;
  readonly kind?: 'character';
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
  readonly frames?: readonly Uint8ClampedArray[];
  readonly frameIndex?: number;
}

export const TRANSPARENT: Color = [0, 0, 0, 0];

export function copiedCharacter(document: PixelDocument): PixelDocument {
  const character = asCharacter(document);
  const frames = character.frames!.map((frame) => frame.slice());
  return { ...character, name: (document.name || 'キャラクター').slice(0, 36) + 'のコピー', frames, pixels: frames[character.frameIndex!] };
}

export const DIRECTIONS = ['正面', '左向き', '右向き', '後ろ'] as const;
export const POSES = ['左足', '直立', '右足'] as const;
export const FRAME_COUNT = 12;
export const DEFAULT_FRAME = 1;

export function asCharacter(document: PixelDocument): PixelDocument {
  if (document.frames) return document;
  const frames = Array.from({ length: FRAME_COUNT }, () => new Uint8ClampedArray(document.width * document.height * 4));
  frames[DEFAULT_FRAME] = document.pixels.slice();
  return { ...document, kind: 'character', frames, frameIndex: DEFAULT_FRAME, pixels: frames[DEFAULT_FRAME] };
}

export function createCharacter(width = 32, height = 32, name = '新しいキャラクター'): PixelDocument {
  return asCharacter({ ...createDocument(width, height), name });
}

export function withPixels(document: PixelDocument, pixels: Uint8ClampedArray): PixelDocument {
  if (pixels === document.pixels) return document;
  if (!document.frames) return { ...document, pixels };
  const frames = [...document.frames];
  frames[document.frameIndex!] = pixels;
  return { ...document, pixels, frames };
}

export function selectFrame(document: PixelDocument, frameIndex: number): PixelDocument {
  if (!document.frames || !Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= FRAME_COUNT || frameIndex === document.frameIndex) return document;
  return { ...document, frameIndex, pixels: document.frames[frameIndex] };
}

export function spriteSheet(document: PixelDocument): PixelDocument {
  if (!document.frames) return document;
  const width = document.width * 3, height = document.height * 4;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < FRAME_COUNT; index++) {
    const left = index % 3 * document.width, top = Math.floor(index / 3) * document.height;
    for (let y = 0; y < document.height; y++) {
      const start = y * document.width * 4;
      pixels.set(document.frames[index].subarray(start, start + document.width * 4), ((top + y) * width + left) * 4);
    }
  }
  return { width, height, pixels };
}

export function createDocument(width = 32, height = 32): PixelDocument {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 256 || height > 256) {
    throw new RangeError('キャンバスの幅・高さは1〜256の整数にしてください。');
  }
  return { width, height, pixels: new Uint8ClampedArray(width * height * 4) };
}

export function hexToColor(hex: string): Color {
  if (!/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) throw new TypeError('6桁または8桁のHEXカラーが必要です。');
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), hex.length === 9 ? parseInt(hex.slice(7, 9), 16) : 255];
}
