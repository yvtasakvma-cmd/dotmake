import { useEffect, useRef, useState } from 'react';

export function NewCanvasDialog({ onCreate, onClose }: { onCreate: (width: number, height: number) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [width, setWidth] = useState('32');
  const [height, setHeight] = useState('32');
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} onCancel={onClose} aria-labelledby="new-title">
    <form onSubmit={(event) => { event.preventDefault(); onCreate(Number(width), Number(height)); }}>
      <h2 id="new-title">新規キャンバス</h2>
      <p>今の作品と履歴を置き換えます。必要なら先にPNGで保存してください。</p>
      <div className="preset-buttons">{[16, 32, 48].map((size) => <button type="button" key={size} onClick={() => { setWidth(String(size)); setHeight(String(size)); }}>{size} × {size}</button>)}</div>
      <div className="size-inputs"><label>幅<input type="number" min="1" max="256" step="1" required value={width} onChange={(e) => setWidth(e.target.value)} /></label><span>×</span><label>高さ<input type="number" min="1" max="256" step="1" required value={height} onChange={(e) => setHeight(e.target.value)} /></label></div>
      <p className="hint">自由設定：幅・高さそれぞれ1〜256 px</p>
      <div className="dialog-actions"><button type="button" onClick={onClose}>キャンセル</button><button className="primary" type="submit">作成して置き換える</button></div>
    </form>
  </dialog>;
}
