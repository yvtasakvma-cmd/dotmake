import { renderDocument } from '../drawing/render';
import { POSES } from '../model/document';
import { loadProject } from './storage';

export async function loadProjectPreview(id: string, signal: AbortSignal): Promise<string[]> {
  const project = await loadProject(id);
  if (signal.aborted) throw new DOMException('Preview cancelled', 'AbortError');
  // The front row is independent of the frame the user last edited.
  const frames = project.frames?.slice(0, POSES.length) || [project.pixels];
  if (!frames.some((frame) => frame.some((value, i) => i % 4 === 3 && value > 0))) return [];
  const canvas = document.createElement('canvas');
  canvas.width = project.width; canvas.height = project.height;
  return frames.map((pixels) => {
    renderDocument(canvas, { ...project, pixels });
    return canvas.toDataURL('image/png');
  });
}
