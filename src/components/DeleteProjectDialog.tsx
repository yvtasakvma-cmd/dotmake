import { useEffect, useRef, useState } from 'react';

export function DeleteProjectDialog({ name, disabled, onClose, onDelete }: {
  name: string; disabled: boolean; onClose: () => void; onDelete: () => Promise<boolean>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} aria-labelledby="delete-title" onCancel={(event) => { if (disabled) event.preventDefault(); else onClose(); }}>
    <h2 id="delete-title">キャラクターを削除</h2>
    <p>「{name}」を削除します。この操作は元に戻せません。他のキャラクターは削除されません。</p>
    <div className="dialog-actions"><button disabled={disabled} onClick={onClose}>キャンセル</button><button className="danger-button" disabled={disabled} onClick={() => {
      setError(''); void onDelete().then((deleted) => { if (deleted) onClose(); else setError('削除できませんでした。作品は保持しています。保存状態を確認してからもう一度お試しください。'); });
    }}>{disabled ? '処理中…' : '削除する'}</button></div>
    {error && <p role="alert">{error}</p>}
  </dialog>;
}
