import { useEffect, useRef, useState, type Dispatch } from 'react';
import type { EditorAction, EditorState } from '../model/editor';
import type { PixelDocument } from '../model/document';
import { loadLibrary, loadProject, saveProject, type ProjectSummary } from './storage';

export function useAutosave(state: EditorState, dispatch: Dispatch<EditorAction>) {
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('読み込み中…');
  const [failed, setFailed] = useState(false);
  const [warning, setWarning] = useState('');
  const documentRef = useRef(state.document);
  documentRef.current = state.document;
  const activeRef = useRef<string | null>(null);
  const switching = useRef(false);
  const chain = useRef(Promise.resolve());
  const sequence = useRef(0);
  const pending = useRef(0);
  const saved = useRef<{ id: string; document: PixelDocument } | null>(null);

  useEffect(() => {
    let active = true;
    void loadLibrary().then((library) => {
      if (!active) return;
      setProjects(library.projects); setWarning(library.warning);
      setStatus('作品を選ぶか、新しく作成してください'); setReady(true);
    }).catch(() => {
      if (!active) return;
      setStatus('保存データを読めません。別のタブを閉じて開き直してください。');
      setFailed(true); setReady(true);
    });
    return () => { active = false; };
  }, []);

  const remember = (project: ProjectSummary) => setProjects((previous) => [project, ...previous.filter((item) => item.id !== project.id)]);
  // Capture both ID and pixels here, never look up the active project later
  // when a queued write completes after a navigation event.
  const commit = (id: string, document: PixelDocument) => {
    pending.current++;
    const current = ++sequence.current;
    setStatus('保存中…');
    const write = chain.current.catch(() => {}).then(async () => {
      if (saved.current?.id === id && saved.current.document === document) return;
      const project = await saveProject(id, document);
      saved.current = { id, document }; remember(project);
    }).finally(() => { pending.current--; });
    chain.current = write;
    return write.then(() => {
      if (sequence.current === current) { setStatus('この端末に保存済み'); setFailed(false); }
      return true;
    }).catch(() => {
      if (sequence.current === current) { setStatus('自動保存できません。PNGで保存してください。作品の切り替えは保存できるまで停止します。'); setFailed(true); }
      return false;
    });
  };

  useEffect(() => {
    if (!ready || !activeId || busy) return;
    if (state.stroke) { ++sequence.current; setStatus('編集中…'); return; }
    if (pending.current === 0 && saved.current?.id === activeId && saved.current.document === state.document) {
      if (status === '編集中…') { setStatus('この端末に保存済み'); setFailed(false); }
      return;
    }
    void commit(activeId, state.document);
    // commit intentionally runs only for actual editor changes.
  }, [ready, activeId, busy, state.document, state.stroke]);

  const flush = async () => !activeRef.current || await commit(activeRef.current, documentRef.current);
  const open = async (id: string) => {
    if (!ready || switching.current || state.stroke) return false;
    if (activeRef.current === id) return true;
    switching.current = true; setBusy(true);
    try {
      if (!await flush()) return false;
      const document = await loadProject(id);
      activeRef.current = id; saved.current = { id, document };
      dispatch({ type: 'replace', document }); setActiveId(id);
      setStatus('この端末に保存済み'); setFailed(false);
      return true;
    } catch { setStatus('選択した作品を読めません。現在の作品は保持しています。'); setFailed(true); return false; }
    finally { switching.current = false; setBusy(false); }
  };
  const create = async (document: PixelDocument) => {
    if (!ready || switching.current || state.stroke) return false;
    switching.current = true; setBusy(true);
    try {
      if (!await flush()) return false;
      const id = crypto.randomUUID();
      const project = await saveProject(id, document);
      activeRef.current = id; saved.current = { id, document };
      remember(project); setActiveId(id); dispatch({ type: 'replace', document });
      setStatus('この端末に保存済み'); setFailed(false);
      return true;
    } catch { setStatus('新しい作品を保存できません。既存の作品は変更していません。'); setFailed(true); return false; }
    finally { switching.current = false; setBusy(false); }
  };

  useEffect(() => {
    if (!activeId || status === 'この端末に保存済み') return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [activeId, status]);

  return { ready, busy, status, failed, warning, projects, activeId, hasProject: activeId !== null, open, create };
}
