import { useEffect, useRef, useState } from 'react';

export function RenameProjectDialog({ name: originalName, disabled, onRename, onClose }: {
  name: string; disabled: boolean; onRename: (name: string) => Promise<boolean>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(originalName);
  const [error, setError] = useState('');
  useEffect(() => {
    const element = dialog.current!; element.showModal(); input.current?.select();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} className="rename-project-dialog" aria-labelledby="rename-title" onCancel={(event) => { event.preventDefault(); if (!disabled) onClose(); }}>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (disabled) return;
      const next = name.trim();
      if (!next || next.length > 40) { setError('名前は1〜40文字で入力してください。'); return; }
      setError('');
      void onRename(next).then((renamed) => {
        if (renamed) onClose();
        else setError('名前を変更できませんでした。元の名前と作品は保持しています。もう一度お試しください。');
      }).catch(() => setError('名前を変更できませんでした。もう一度お試しください。'));
    }}>
      <h2 id="rename-title">キャラクターの名前を変更</h2>
      <label className="project-name-input">キャラクター名<input ref={input} value={name} maxLength={40} disabled={disabled} onChange={(event) => setName(event.target.value)} /></label>
      <p className="hint">40文字まで。絵と12コマはそのまま保持します。</p>
      {error && <p role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" disabled={disabled} onClick={onClose}>キャンセル</button><button type="submit" className="primary" disabled={disabled || name.trim() === originalName}>{disabled ? '保存中…' : '変更を保存'}</button></div>
    </form>
  </dialog>;
}
