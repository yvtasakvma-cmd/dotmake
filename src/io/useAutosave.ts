import { useEffect, useRef, useState, type Dispatch } from 'react';
import type { EditorAction, EditorState } from '../model/editor';
import { loadDocument, saveDocument } from './storage';

export function useAutosave(state: EditorState, dispatch: Dispatch<EditorAction>) {
  const [ready, setReady] = useState(false);
  const [hasProject, setHasProject] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState('読み込み中…');
  const [failed, setFailed] = useState(false);
  const chain = useRef(Promise.resolve());
  const sequence = useRef(0);

  useEffect(() => {
    let active = true;
    void loadDocument().then((document) => {
      if (!active) return;
      if (document) { dispatch({ type: 'replace', document }); setHasProject(true); setEnabled(true); }
      else setStatus('作るものを選んでください');
      setReady(true);
    }).catch(() => {
      if (!active) return;
      // Do not overwrite data whose initial read failed.
      setStatus('保存データを読めません。PNGで保存するか、新規作成で保存を再開してください。');
      setFailed(true);
      setReady(true);
    });
    return () => { active = false; };
  }, [dispatch]);

  useEffect(() => {
    if (!ready || !enabled) return;
    const current = ++sequence.current;
    if (state.stroke) { setStatus('編集中…'); return; }
    setStatus('保存中…');
    chain.current = chain.current.catch(() => {}).then(() => saveDocument(state.document));
    void chain.current.then(() => {
      if (sequence.current === current) { setStatus('この端末に保存済み'); setFailed(false); }
    }).catch(() => {
      if (sequence.current === current) { setStatus('自動保存できません。PNGで保存してください。'); setFailed(true); }
    });
  }, [ready, enabled, state.document, state.stroke]);

  useEffect(() => {
    if (!ready || !hasProject || status === 'この端末に保存済み') return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [ready, hasProject, status]);

  return { ready, status, failed, hasProject, restart: () => { setHasProject(true); setEnabled(true); } };
}
