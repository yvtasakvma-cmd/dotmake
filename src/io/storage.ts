import { createDocument, type PixelDocument } from '../model/document';

export interface ProjectSummary {
  id: string;
  name: string;
  kind?: 'character';
  width: number;
  height: number;
  updatedAt: number;
}
interface StoredProject extends PixelDocument { id: string; version: 1; updatedAt: number }
let database: Promise<IDBDatabase> | undefined;
function open(): Promise<IDBDatabase> {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('pixel-studio', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents');
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
    };
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

function decode(value: unknown): PixelDocument {
  if (!value || typeof value !== 'object') throw new Error('保存データの形式を読み取れません。');
  const record = value as Partial<StoredProject>;
  if (record.version !== 1 || !(record.pixels instanceof Uint8ClampedArray)) throw new Error('保存データの形式を読み取れません。');
  const document = createDocument(record.width!, record.height!);
  if (document.pixels.length !== record.pixels.length) throw new Error('保存データの画素数が正しくありません。');
  document.pixels.set(record.pixels);
  return { ...document, name: typeof record.name === 'string' && record.name.trim() ? record.name.slice(0, 40) : '保存した作品', ...(record.kind === 'character' ? { kind: 'character' as const } : {}) };
}
function summary(record: StoredProject): ProjectSummary {
  return { id: record.id, name: record.name || '保存した作品', kind: record.kind, width: record.width, height: record.height, updatedAt: record.updatedAt };
}

// Copy the old single-slot image exactly once. Keep its original as a backup.
// The marker and copied project commit together, even with two startup readers.
async function migrateLegacy(db: IDBDatabase): Promise<string> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['documents', 'projects'], 'readwrite');
    const documents = tx.objectStore('documents');
    let warning = '';
    tx.oncomplete = () => resolve(warning);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    const marker = documents.get('projects-migrated');
    marker.onsuccess = () => {
      if (marker.result === true) return;
      const old = documents.get('current');
      old.onsuccess = () => {
        if (old.result === undefined) { documents.put(true, 'projects-migrated'); return; }
        let document: PixelDocument;
        try { document = decode(old.result); }
        catch { warning = '以前の保存データを読めません。元データは保持しています。'; return; }
        const projects = tx.objectStore('projects');
        const existing = projects.get('legacy-current');
        existing.onsuccess = () => {
          if (existing.result === undefined) projects.put({ ...document, id: 'legacy-current', version: 1, updatedAt: Date.now() } satisfies StoredProject);
          documents.put(true, 'projects-migrated');
        };
      };
    };
  });
}

export async function loadLibrary(): Promise<{ projects: ProjectSummary[]; warning: string; clipboard: PixelDocument | null }> {
  const db = await open();
  let warning = await migrateLegacy(db);
  const projects = await new Promise<ProjectSummary[]>((resolve, reject) => {
    const items: ProjectSummary[] = [];
    const tx = db.transaction('projects', 'readonly');
    const request = tx.objectStore('projects').openCursor();
    tx.oncomplete = () => resolve(items);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      try {
        const document = decode(cursor.value);
        const record = cursor.value as StoredProject;
        if (typeof record.id !== 'string' || !record.id || !Number.isFinite(record.updatedAt) || record.updatedAt < 0 || record.updatedAt > 8640000000000000) throw new Error('Invalid project');
        items.push(summary({ ...document, id: record.id, version: 1, updatedAt: record.updatedAt }));
      } catch { warning = '一部の作品を読めません。元データは保持しています。他の作品は編集できます。'; }
      cursor.continue();
    };
  });
  projects.sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  let clipboard: PixelDocument | null = null;
  try {
    const value = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction('documents', 'readonly');
      const request = tx.objectStore('documents').get('project-clipboard');
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    if (value !== undefined) clipboard = decode(value);
  } catch { warning = [warning, 'コピーしたデータを読めません。保存済みの作品は利用できます。'].filter(Boolean).join(' '); }
  return { projects, warning, clipboard };
}

export async function saveProjectClipboard(document: PixelDocument): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    tx.objectStore('documents').put({ ...document, version: 1 }, 'project-clipboard');
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['projects', 'documents'], 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    try {
      tx.objectStore('projects').delete(id);
      if (id === 'legacy-current') {
        tx.objectStore('documents').delete('current');
        tx.objectStore('documents').put(true, 'projects-migrated');
      }
    } catch (error) { tx.abort(); reject(error); }
  });
}

export async function loadProject(id: string): Promise<PixelDocument> {
  const db = await open();
  const record = await new Promise<unknown>((resolve, reject) => {
    const tx = db.transaction('projects', 'readonly');
    const request = tx.objectStore('projects').get(id);
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  return decode(record);
}

export async function saveProject(id: string, document: PixelDocument): Promise<ProjectSummary> {
  const db = await open();
  const record: StoredProject = { ...document, id, version: 1, updatedAt: Date.now() };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('projects', 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    tx.objectStore('projects').put(record);
  });
  return summary(record);
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
