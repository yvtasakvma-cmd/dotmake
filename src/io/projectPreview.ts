import { renderDocument } from '../drawing/render';
import { POSES } from '../model/document';
import { loadProject } from './storage';

export async function loadProjectPreview(id: string, signal: AbortSignal): Promise<string[][]> {
  const project = await loadProject(id);
  if (signal.aborted) throw new DOMException('Preview cancelled', 'AbortError');
  // Read each direction independently of the last edited frame.
  const rows = project.frames
    ? Array.from({ length: project.frames.length / POSES.length }, (_, direction) => project.frames!.slice(direction * POSES.length, (direction + 1) * POSES.length))
    : [[project.pixels]];
  const canvas = document.createElement('canvas');
  canvas.width = project.width; canvas.height = project.height;
  return rows.map((frames) => {
    if (!frames.some((frame) => frame.some((value, i) => i % 4 === 3 && value > 0))) return [];
    return frames.map((pixels) => {
      renderDocument(canvas, { ...project, pixels });
      return canvas.toDataURL('image/png');
    });
  });
}
