import { asCharacter, createDocument, FRAME_COUNT, type PixelDocument } from '../model/document';
import { decodeProject, emptySnapshot, encodeProject, parseSnapshot, sameSnapshot, type SyncSnapshot } from './syncSnapshot';

export const STORAGE_CHANGED = 'pixel-studio-storage-changed';
function bumpRevision(store: IDBObjectStore) {
  const request = store.get('library-revision');
  request.onsuccess = () => store.put((Number(request.result) || 0) + 1, 'library-revision');
}
function notifyChange() { window.dispatchEvent(new Event(STORAGE_CHANGED)); }

export interface ProjectSummary {
  id: string;
  name: string;
  kind?: 'character';
  width: number;
  height: number;
  updatedAt: number;
  frameCount: number;
}
interface StoredProject extends PixelDocument { id: string; version: 1 | 2; updatedAt: number }
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
  if ((record.version !== 1 && record.version !== 2) || !(record.pixels instanceof Uint8ClampedArray)) throw new Error('保存データの形式を読み取れません。');
  const document = createDocument(record.width!, record.height!);
  if (document.pixels.length !== record.pixels.length) throw new Error('保存データの画素数が正しくありません。');
  document.pixels.set(record.pixels);
  const named = { ...document, name: typeof record.name === 'string' && record.name.trim() ? record.name.slice(0, 40) : '保存した作品', ...(record.kind === 'character' ? { kind: 'character' as const } : {}) };
  if (record.version === 2) {
    if (record.kind !== 'character' || !Array.isArray(record.frames) || record.frames.length !== FRAME_COUNT || !Number.isInteger(record.frameIndex) || record.frameIndex! < 0 || record.frameIndex! >= FRAME_COUNT || !record.frames.every((frame: unknown) => frame instanceof Uint8ClampedArray && frame.length === document.pixels.length)) throw new Error('12コマの保存データを読み取れません。');
    const frames = record.frames.map((frame: Uint8ClampedArray) => frame.slice());
    if (!record.pixels.every((value, i) => value === frames[record.frameIndex!][i])) throw new Error('編集中のコマの保存データが一致しません。');
    return { ...named, frames, frameIndex: record.frameIndex!, pixels: frames[record.frameIndex!] };
  }
  return record.kind === 'character' ? asCharacter(named) : named;
}
function summary(record: StoredProject): ProjectSummary {
  return { id: record.id, name: record.name || '保存した作品', kind: record.kind, width: record.width, height: record.height, updatedAt: record.updatedAt, frameCount: record.frames ? FRAME_COUNT : 1 };
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
          if (existing.result === undefined) projects.put({ ...document, id: 'legacy-current', version: document.frames ? 2 : 1, updatedAt: Date.now() } satisfies StoredProject);
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
        items.push(summary({ ...document, id: record.id, version: document.frames ? 2 : 1, updatedAt: record.updatedAt }));
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
    tx.objectStore('documents').put({ ...document, version: document.frames ? 2 : 1 }, 'project-clipboard');
  });
}

export async function deleteProject(id: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['projects', 'documents'], 'readwrite');
    tx.oncomplete = () => { notifyChange(); resolve(); };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    try {
      tx.objectStore('projects').delete(id);
      bumpRevision(tx.objectStore('documents'));
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
  const record: StoredProject = { ...document, id, version: document.frames ? 2 : 1, updatedAt: Date.now() };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['projects', 'documents'], 'readwrite');
    tx.oncomplete = () => { notifyChange(); resolve(); };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    tx.objectStore('projects').put(record);
    bumpRevision(tx.objectStore('documents'));
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
  if (!Array.isArray(value) || !value.every((color: unknown) => typeof color === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(color))) {
    throw new Error('パレットの形式を読み取れません。');
  }
  return [...new Set((value as string[]).map((color) => color.toLowerCase()))];
}

export async function savePalette(colors: readonly string[]): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('documents', 'readwrite');
    tx.oncomplete = () => { notifyChange(); resolve(); };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    tx.objectStore('documents').put([...colors], 'palette');
    bumpRevision(tx.objectStore('documents'));
  });
}

export class LocalSyncChanged extends Error {}
export async function readSyncState(repository: string): Promise<{ snapshot: SyncSnapshot; base: SyncSnapshot; revision: number }> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['projects', 'documents'], 'readonly');
    const records = tx.objectStore('projects').getAll();
    const documents = tx.objectStore('documents');
    const palette = documents.get('palette');
    const base = documents.get(`github-sync-base:${repository}`);
    const revision = documents.get('library-revision');
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    tx.oncomplete = () => {
      try {
        const snapshot = parseSnapshot(JSON.stringify({
          version: 1,
          projects: (records.result as StoredProject[]).map((record) => encodeProject({ ...decode(record), id: record.id, updatedAt: record.updatedAt })),
          palette: palette.result ?? [],
        }));
        resolve({ snapshot, base: base.result ? parseSnapshot(JSON.stringify(base.result)) : emptySnapshot(), revision: Number(revision.result) || 0 });
      } catch (error) { reject(error); }
    };
  });
}

// The revision check and library replacement commit in one transaction. A save
// from another tab during the network request can never be silently overwritten.
export async function applySyncState(repository: string, expected: number, before: SyncSnapshot, snapshot: SyncSnapshot): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['projects', 'documents'], 'readwrite');
    const documents = tx.objectStore('documents');
    const revision = documents.get('library-revision');
    let changed = false;
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(changed ? new LocalSyncChanged('別のタブで作品が変更されました。作品は保持しています。タブを一つにして再同期してください。') : tx.error);
    revision.onsuccess = () => {
      if ((Number(revision.result) || 0) !== expected) { changed = true; tx.abort(); return; }
      if (!sameSnapshot(before, snapshot)) {
        documents.put({ repository, savedAt: Date.now(), snapshot: before }, 'github-sync-backup');
        const projects = tx.objectStore('projects');
        projects.clear();
        for (const project of snapshot.projects) projects.put(decodeProject(project));
        documents.put(snapshot.palette, 'palette');
        documents.put(expected + 1, 'library-revision');
      }
      documents.put(snapshot, `github-sync-base:${repository}`);
    };
  });
}
