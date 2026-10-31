import { createDocument, FRAME_COUNT, type PixelDocument } from '../model/document';

export const MAX_SYNC_BYTES = 20 * 1024 * 1024;
export interface SyncProject {
  id: string;
  name: string;
  kind?: 'character';
  width: number;
  height: number;
  updatedAt: number;
  frameIndex?: number;
  frames: string[];
}
export interface SyncSnapshot { version: 1; projects: SyncProject[]; palette: string[] }
export const emptySnapshot = (): SyncSnapshot => ({ version: 1, projects: [], palette: [] });

export function bytesToBase64(bytes: Uint8Array | Uint8ClampedArray): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
export function base64ToBytes(value: string): Uint8ClampedArray {
  return Uint8ClampedArray.from(atob(value.replace(/\s/g, '')), (char) => char.charCodeAt(0));
}
export function encodeProject(project: PixelDocument & { id: string; updatedAt: number }): SyncProject {
  return {
    id: project.id, name: project.name || '保存した作品', ...(project.kind ? { kind: project.kind } : {}),
    width: project.width, height: project.height, updatedAt: project.updatedAt,
    ...(project.frames ? { frameIndex: project.frameIndex } : {}),
    frames: (project.frames || [project.pixels]).map(bytesToBase64),
  };
}
export function decodeProject(project: SyncProject): PixelDocument & { id: string; updatedAt: number; version: 1 | 2 } {
  const frames = project.frames.map(base64ToBytes);
  const character = frames.length === FRAME_COUNT;
  return {
    id: project.id, name: project.name, kind: project.kind, width: project.width, height: project.height,
    updatedAt: project.updatedAt, version: character ? 2 : 1,
    pixels: frames[character ? project.frameIndex! : 0],
    ...(character ? { frames, frameIndex: project.frameIndex } : {}),
  };
}

export function parseSnapshot(text: string): SyncSnapshot {
  const invalid = () => new Error('GitHubの保存データを読み取れません。端末とGitHubのデータは上書きしていません。');
  if (new TextEncoder().encode(text).byteLength > MAX_SYNC_BYTES) throw new Error('同期データが20MBを超えています。端末の作品は保持しています。');
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw invalid(); }
  if (!value || typeof value !== 'object') throw invalid();
  const snapshot = value as Partial<SyncSnapshot>;
  if (snapshot.version !== 1 || !Array.isArray(snapshot.projects) || snapshot.projects.length > 2000 || !Array.isArray(snapshot.palette) || snapshot.palette.length > 4096 || !snapshot.palette.every((color) => typeof color === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(color))) throw invalid();
  const ids = new Set<string>();
  for (const item of snapshot.projects) {
    if (!item || typeof item !== 'object') throw invalid();
    const p = item as Partial<SyncProject>;
    if (typeof p.id !== 'string' || !/^[a-z0-9_-]{1,128}$/i.test(p.id) || ids.has(p.id) || typeof p.name !== 'string' || !p.name.trim() || p.name.length > 40 || (p.kind !== undefined && p.kind !== 'character') || !Number.isFinite(p.updatedAt) || p.updatedAt! < 0 || p.updatedAt! > 8640000000000000) throw invalid();
    ids.add(p.id);
    let pixels: number;
    try { pixels = createDocument(p.width!, p.height!).pixels.length; } catch { throw invalid(); }
    if (!Array.isArray(p.frames) || (p.frames.length !== 1 && p.frames.length !== FRAME_COUNT)) throw invalid();
    if (p.frames.length === FRAME_COUNT && (p.kind !== 'character' || !Number.isInteger(p.frameIndex) || p.frameIndex! < 0 || p.frameIndex! >= FRAME_COUNT)) throw invalid();
    // Character projects always contain all twelve frames, never a partial character.
    if (p.kind === 'character' && p.frames.length !== FRAME_COUNT) throw invalid();
    for (const frame of p.frames) {
      if (typeof frame !== 'string' || frame.length !== Math.ceil(pixels / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(frame)) throw invalid();
      try { if (base64ToBytes(frame).length !== pixels) throw invalid(); } catch { throw invalid(); }
    }
  }
  // Rebuild the shape: neither credentials nor arbitrary extra fields enter storage.
  return {
    version: 1,
    projects: snapshot.projects.map((p) => encodeProject(decodeProject(p))),
    palette: [...new Set(snapshot.palette.map((color) => color.toLowerCase()))],
  };
}

// Timestamps and the selected editing frame are view metadata, not image conflicts.
export function sameProject(a?: SyncProject, b?: SyncProject): boolean {
  if (!a || !b) return a === b;
  return a.name === b.name && a.kind === b.kind && a.width === b.width && a.height === b.height && a.frames.length === b.frames.length && a.frames.every((frame, i) => frame === b.frames[i]);
}
export function sameSnapshot(a: SyncSnapshot, b: SyncSnapshot): boolean {
  const projects = new Map(b.projects.map((project) => [project.id, project]));
  return a.projects.length === b.projects.length && a.projects.every((p) => sameProject(p, projects.get(p.id))) && a.palette.length === b.palette.length && a.palette.every((color) => b.palette.includes(color));
}

export function mergeSnapshots(base: SyncSnapshot, local: SyncSnapshot, remote: SyncSnapshot, newId: () => string = () => crypto.randomUUID()): { snapshot: SyncSnapshot; conflicts: number } {
  const maps = [base, local, remote].map((s) => new Map(s.projects.map((p) => [p.id, p])));
  const ids = new Set(maps.flatMap((map) => [...map.keys()]));
  const projects: SyncProject[] = [];
  let conflicts = 0;
  for (const id of [...ids].sort()) {
    const [b, l, r] = maps.map((map) => map.get(id));
    if (sameProject(l, r)) { if (l) projects.push(l); }
    else if (sameProject(l, b)) { if (r) projects.push(r); }
    else if (sameProject(r, b)) { if (l) projects.push(l); }
    else {
      conflicts++;
      if (r) projects.push(r);
      if (l && r) {
        const copyId = newId();
        if (ids.has(copyId)) throw new Error('競合作品のIDを作れませんでした。もう一度同期してください。');
        ids.add(copyId);
        projects.push({ ...l, id: copyId, name: l.name.slice(0, 30) + '（端末の変更）' });
      } else if (l) projects.push(l); // Edit versus deletion: keep the edited work.
    }
  }
  const palette = [...new Set([...local.palette, ...remote.palette])].filter((color) => base.palette.includes(color) ? local.palette.includes(color) && remote.palette.includes(color) : true);
  return { snapshot: { version: 1, projects: projects.sort((a, b) => a.id.localeCompare(b.id)), palette }, conflicts };
}
