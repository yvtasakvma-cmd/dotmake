import { useEffect, useRef, useState } from 'react';

export function ExportDialog({ blob, filename, onClose }: { blob: Blob; filename: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const file = new File([blob], filename, { type: 'image/png' });
  const canShare = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  useEffect(() => {
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    dialog.current?.showModal();
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="export-title">
    <h2 id="export-title">透過PNGを書き出し</h2>
    <p>元のサイズと透明度で出力します。</p>
    {url && <img className="export-preview" src={url} alt="書き出すPNG" />}
    <p className="hint">iPhoneでは画像を長押しして保存、または共有ボタンを使えます。</p>
    <div className="dialog-actions"><a className="action primary" href={url} download={filename}>PNGを保存</a>
      {canShare && <button onClick={() => { void navigator.share({ files: [file] }).catch((e: unknown) => { if (!(e instanceof DOMException && e.name === 'AbortError')) setError('共有できませんでした。画像を長押しして保存してください。'); }); }}>共有</button>}
      <button onClick={onClose}>閉じる</button></div>
    {error && <p role="alert">{error}</p>}
  </dialog>;
}
