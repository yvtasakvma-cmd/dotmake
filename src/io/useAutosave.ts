import { useEffect, useRef, useState, type Dispatch } from 'react';
import type { EditorAction, EditorState } from '../model/editor';
import { copiedCharacter, createDocument, type PixelDocument } from '../model/document';
import { deleteProject, loadLibrary, loadProject, saveProject, saveProjectClipboard, type ProjectSummary } from './storage';
import { encodeProject, sameProject } from './syncSnapshot';

export function useAutosave(state: EditorState, dispatch: Dispatch<EditorAction>) {
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('読み込み中…');
  const [failed, setFailed] = useState(false);
  const [warning, setWarning] = useState('');
  const [clipboard, setClipboard] = useState<PixelDocument | null>(null);
  const [libraryMessage, setLibraryMessage] = useState('');
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
      setClipboard(library.clipboard);
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
    if (state.stroke || state.floating) { ++sequence.current; setStatus('編集中…'); return; }
    if (pending.current === 0 && saved.current?.id === activeId && saved.current.document === state.document) {
      if (status === '編集中…') { setStatus('この端末に保存済み'); setFailed(false); }
      return;
    }
    void commit(activeId, state.document);
    // commit intentionally runs only for actual editor changes.
  }, [ready, activeId, busy, state.document, state.stroke, state.floating]);

  const flush = async () => !activeRef.current || await commit(activeRef.current, documentRef.current);
  const open = async (id: string) => {
    if (!ready || switching.current || state.stroke || state.floating) return false;
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
    if (!ready || switching.current || state.stroke || state.floating) return false;
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

  const copy = async (id: string) => {
    if (!ready || switching.current || state.stroke || state.floating) return false;
    switching.current = true; setBusy(true); setLibraryMessage('');
    try {
      if (!await flush()) return false;
      const document = await loadProject(id);
      await saveProjectClipboard(document);
      setClipboard(document); setLibraryMessage('作品データをコピーしました。「貼り付けて新規作成」で別のキャラクターを作れます。');
      return true;
    } catch { setLibraryMessage('コピーできませんでした。前のコピーと保存済み作品は保持しています。'); return false; }
    finally { switching.current = false; setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!ready || switching.current || state.stroke || state.floating) return false;
    switching.current = true; setBusy(true); setLibraryMessage('');
    try {
      // Wait for queued writes before deletion, so a late autosave cannot
      // recreate a deleted project.
      if (!await flush()) return false;
      await deleteProject(id);
      if (activeRef.current === id) {
        activeRef.current = null; saved.current = null; setActiveId(null);
        dispatch({ type: 'replace', document: createDocument() });
        ++sequence.current; setStatus('作品を選ぶか、新しく作成してください'); setFailed(false);
      }
      setProjects((previous) => previous.filter((project) => project.id !== id));
      setLibraryMessage('作品を削除しました。');
      return true;
    } catch { setLibraryMessage('削除できませんでした。作品は一覧に残しています。'); return false; }
    finally { switching.current = false; setBusy(false); }
  };
  const paste = () => clipboard ? create(copiedCharacter(clipboard)) : Promise.resolve(false);

  const synchronize = async <T,>(operation: () => Promise<T>): Promise<T> => {
    if (!ready || switching.current || state.stroke || state.floating) throw new Error('編集中の操作が終わってから同期してください。');
    switching.current = true; setBusy(true);
    try {
      if (!await flush()) throw new Error('端末への保存が完了していません。先に保存エラーを確認してください。');
      const result = await operation();
      const library = await loadLibrary();
      setProjects(library.projects); setWarning(library.warning);
      const id = activeRef.current;
      if (id && !library.projects.some((project) => project.id === id)) {
        activeRef.current = null; saved.current = null; setActiveId(null);
        dispatch({ type: 'replace', document: createDocument() });
        ++sequence.current; setStatus('作品を選ぶか、新しく作成してください');
      } else if (id) {
        const document = await loadProject(id);
        if (!sameProject(encodeProject({ ...documentRef.current, id, updatedAt: 0 }), encodeProject({ ...document, id, updatedAt: 0 }))) {
          saved.current = { id, document };
          documentRef.current = document;
          dispatch({ type: 'replace', document });
        }
        setStatus('この端末に保存済み');
      }
      return result;
    } finally { switching.current = false; setBusy(false); }
  };

  // A document can change before its autosave effect runs. Never show the
  // previous image's saved status while the current image is still unsaved.
  const currentStatus = activeId && !busy && !failed
    ? state.stroke || state.floating ? '編集中…'
      : saved.current?.id !== activeId || saved.current.document !== state.document || pending.current > 0 ? '保存中…' : status
    : status;

  useEffect(() => {
    if (!activeId || currentStatus === 'この端末に保存済み') return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [activeId, currentStatus]);

  return { ready, busy, status: currentStatus, failed, warning, projects, activeId, hasProject: activeId !== null, open, create, copy, remove, paste, synchronize, clipboard, libraryMessage };
}
