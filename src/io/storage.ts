import { createDocument, type PixelDocument } from '../model/document';

interface StoredDocument { version: 1; width: number; height: number; pixels: Uint8ClampedArray; name?: string; kind?: 'character' }
let database: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('pixel-studio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('別のタブを閉じてから開き直してください。'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); database = undefined; };
      resolve(db);
    };
  }).catch((error: unknown) => { database = undefined; throw error; });
  return database;
}

export async function loadDocument(): Promise<PixelDocument | null> {
  const db = await open();
  const value = await new Promise<StoredDocument | undefined>((resolve, reject) => {
    const tx = db.transaction('documents', 'readonly');
    const request = tx.objectStore('documents').get('current');
    tx.oncomplete = () => resolve(request.result as StoredDocument | undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  if (value === undefined) return null;
  if (value.version !== 1 || !(value.pixels instanceof Uint8ClampedArray)) throw new Error('保存データの形式を読み取れません。');
  const document = createDocument(value.width, value.height);
  if (document.pixels.length !== value.pixels.length) throw new Error('保存データの画素数が正しくありません。');
  document.pixels.set(value.pixels);
  return { ...document, name: typeof value.name === 'string' && value.name.trim() ? value.name.slice(0, 40) : '保存した作品', ...(value.kind === 'character' ? { kind: 'character' as const } : {}) };
}

export async function saveDocument(document: PixelDocument): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    tx.objectStore('documents').put({ version: 1, ...document } satisfies StoredDocument, 'current');
  });
}

export async function loadPalette(): Promise<string[]> {
  const db = await open();
  const value = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction('documents', 'readonly');
    const request = tx.objectStore('documents').get('palette');
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  if (value === undefined) return [];
  if (!Array.isArray(value) || !value.every((color: unknown) => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))) {
    throw new Error('パレットの形式を読み取れません。');
  }
  return [...new Set((value as string[]).map((color) => color.toLowerCase()))];
}

export async function savePalette(colors: readonly string[]): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    tx.objectStore('documents').put([...colors], 'palette');
  });
}
