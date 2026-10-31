import { describe, expect, it } from 'vitest';
import { createCharacter } from '../model/document';
import { decodeProject, emptySnapshot, encodeProject, mergeSnapshots, parseSnapshot, sameSnapshot, type SyncProject, type SyncSnapshot } from './syncSnapshot';

function project(id = 'hero', pixel = 0): SyncProject {
  const document = createCharacter(2, 2, '勇者');
  document.frames![11].set([255, 0, 0, pixel]);
  return encodeProject({ ...document, id, updatedAt: 1 });
}
const library = (...projects: SyncProject[]): SyncSnapshot => ({ version: 1, projects, palette: [] });

describe('portable GitHub library', () => {
  it('round trips all twelve frames, Unicode names, and exact alpha', () => {
    const original = project('hero', 128);
    const result = parseSnapshot(JSON.stringify(library(original)));
    expect(result.projects[0]).toEqual(original);
    const restored = decodeProject(result.projects[0]);
    expect(restored.frames).toHaveLength(12);
    expect([...restored.frames![11].slice(0, 4)]).toEqual([255, 0, 0, 128]);
    expect(restored.pixels).toBe(restored.frames![1]);
  });
  it('refuses duplicate IDs, missing frames, invalid pixels and unsupported versions', () => {
    const good = library(project());
    for (const bad of [
      { ...good, version: 9 }, library(project(), project()),
      library({ ...project(), frames: ['AAAA'] }),
      library({ ...project(), frameIndex: 12 }),
      library({ ...project(), frames: Array(12).fill('!!!!!!!!') }),
      library({ ...project(), width: 257 }),
    ]) expect(() => parseSnapshot(JSON.stringify(bad))).toThrow();
  });
});
describe('three way library merge', () => {
  it('pulls a first device and combines independently created works', () => {
    expect(mergeSnapshots(emptySnapshot(), emptySnapshot(), library(project())).snapshot).toEqual(library(project()));
    expect(mergeSnapshots(emptySnapshot(), library(project('a')), library(project('b'))).snapshot.projects.map(p => p.id)).toEqual(['a', 'b']);
  });
  it('keeps both edits of the same character as independent works', () => {
    const merged = mergeSnapshots(library(project()), library(project('hero', 64)), library(project('hero', 128)), () => 'conflict-copy');
    expect(merged.conflicts).toBe(1);
    expect(merged.snapshot.projects).toHaveLength(2);
    expect(merged.snapshot.projects.find(p => p.id === 'hero')?.frames).toEqual(project('hero', 128).frames);
    expect(merged.snapshot.projects.find(p => p.id === 'conflict-copy')).toMatchObject({ name: '勇者（端末の変更）', frames: project('hero', 64).frames });
  });
  it('propagates deletions while preserving edits made offline against a deletion', () => {
    const base = library(project());
    expect(mergeSnapshots(base, base, emptySnapshot()).snapshot.projects).toHaveLength(0);
    expect(mergeSnapshots(base, emptySnapshot(), base).snapshot.projects).toHaveLength(0);
    expect(mergeSnapshots(base, library(project('hero', 128)), emptySnapshot()).snapshot.projects).toEqual([project('hero', 128)]);
    expect(mergeSnapshots(base, emptySnapshot(), library(project('hero', 128))).snapshot.projects).toEqual([project('hero', 128)]);
  });
  it('does not invent conflicts or writes for timestamps or selected editing frames', () => {
    const initial = library(project());
    const viewed = library({ ...project(), frameIndex: 11, updatedAt: 999 });
    expect(sameSnapshot(initial, viewed)).toBe(true);
    expect(mergeSnapshots(initial, viewed, initial).conflicts).toBe(0);
  });
  it('merges added and removed palette entries, preserving opacity', () => {
    const base = { ...emptySnapshot(), palette: ['#000000', '#ff000080'] };
    const local = { ...emptySnapshot(), palette: ['#000000', '#0000ff40'] };
    const remote = { ...emptySnapshot(), palette: ['#ff000080', '#ffffff'] };
    expect(mergeSnapshots(base, local, remote).snapshot.palette.sort()).toEqual(['#0000ff40', '#ffffff']);
  });
});
