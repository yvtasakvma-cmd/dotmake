import { useEffect, useRef, useState } from 'react';
import { DEFAULT_WALK_FPS, WALK_CYCLE } from '../model/animation';
import { loadProjectPreview } from '../io/projectPreview';
import type { ProjectSummary } from '../io/storage';

export function CharacterPreview({ project }: { project: ProjectSummary }) {
  const figure = useRef<HTMLElement>(null);
  const loaded = useRef<ProjectSummary | null>(null);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);
  const [sources, setSources] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(figure.current!);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || loaded.current === project) return;
    const controller = new AbortController();
    setFailed(false);
    void loadProjectPreview(project.id, controller.signal).then((frames) => {
      if (controller.signal.aborted) return;
      loaded.current = project; setSources(frames);
    }).catch(() => {
      if (!controller.signal.aborted) { setSources(null); setFailed(true); }
    });
    return () => controller.abort();
  }, [project, visible]);

  useEffect(() => {
    if (!visible) return;
    const change = () => setPageVisible(!document.hidden);
    change();
    document.addEventListener('visibilitychange', change);
    return () => document.removeEventListener('visibilitychange', change);
  }, [visible]);

  useEffect(() => {
    if (!visible || !pageVisible || sources?.length !== 3) return;
    const timer = window.setInterval(() => setStep((value) => (value + 1) % WALK_CYCLE.length), 1000 / DEFAULT_WALK_FPS);
    return () => clearInterval(timer);
  }, [visible, pageVisible, sources?.length]);

  const source = sources?.length === 3 ? sources[WALK_CYCLE[step]] : sources?.[0];
  return <figure ref={figure} className="character-preview">
    <div className="character-preview-image">{source
      ? <img src={source} alt={`${project.name}の${project.kind === 'character' ? '正面歩行' : '画像'}プレビュー`} width={64} height={64} />
      : <span>{failed ? '表示不可' : sources ? '未描画' : '読込中…'}</span>}
    </div>
    <figcaption>{project.kind === 'character' ? '正面' : '画像'}</figcaption>
  </figure>;
}
