import { useEffect, useRef, useState } from 'react';

export function NewCanvasDialog({ disabled, onCreate, onClose }: { disabled: boolean; onCreate: (width: number, height: number, name: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('新しいキャラクター');
  const [width, setWidth] = useState('32');
  const [height, setHeight] = useState('32');
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} onCancel={(event) => { if (disabled) event.preventDefault(); else onClose(); }} aria-labelledby="new-title">
    <form onSubmit={(event) => { event.preventDefault(); onCreate(Number(width), Number(height), name.trim() || '新しいキャラクター'); }}>
      <h2 id="new-title">新しい作品</h2><fieldset className="setup-fields" disabled={disabled}>
      <label className="project-name-input">作品名<input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} /></label>
      <p>別の作品として保存します。今の作品はそのまま残ります。</p>
      <div className="preset-buttons">{[16, 32, 48].map((size) => <button type="button" key={size} onClick={() => { setWidth(String(size)); setHeight(String(size)); }}>{size} × {size}</button>)}</div>
      <div className="size-inputs"><label>幅<input type="number" min="1" max="256" step="1" required value={width} onChange={(e) => setWidth(e.target.value)} /></label><span>×</span><label>高さ<input type="number" min="1" max="256" step="1" required value={height} onChange={(e) => setHeight(e.target.value)} /></label></div>
      <p className="hint">自由設定：幅・高さそれぞれ1〜256 px</p>
      <div className="dialog-actions"><button type="button" onClick={onClose}>キャンセル</button><button className="primary" type="submit">作成する</button></div></fieldset>
    </form>
  </dialog>;
}
