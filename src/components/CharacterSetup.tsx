import { useState } from 'react';

export function CharacterSetup({ replacing, onBack, onCreate }: {
  replacing: boolean; onBack: () => void;
  onCreate: (name: string, width: number, height: number) => void;
}) {
  const [name, setName] = useState('新しいキャラクター');
  const [width, setWidth] = useState('32');
  const [height, setHeight] = useState('32');
  return <section className="character-setup" aria-labelledby="character-title">
    <button onClick={onBack}>メニューへ戻る</button>
    <h1 id="character-title">キャラクターを作る</h1>
    <form onSubmit={(event) => { event.preventDefault(); onCreate(name.trim() || '新しいキャラクター', Number(width), Number(height)); }}>
      <label className="project-name-input">作品名<input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} /></label>
      <div className="preset-buttons">{[16, 32, 48].map((size) => <button type="button" key={size} onClick={() => { setWidth(String(size)); setHeight(String(size)); }}>{size} × {size}</button>)}</div>
      <div className="size-inputs"><label>幅<input type="number" inputMode="numeric" min="1" max="256" step="1" required value={width} onChange={(event) => setWidth(event.target.value)} /></label><span>×</span><label>高さ<input type="number" inputMode="numeric" min="1" max="256" step="1" required value={height} onChange={(event) => setHeight(event.target.value)} /></label></div>
      <p className="setup-hint">自由設定：各1〜256 px。透明背景で始めます。</p>
      {replacing && <div className="replace-warning"><p>現在の作品と履歴を置き換えます。必要なら戻って、作品をPNGで保存してください。</p><label><input type="checkbox" required />現在の作品を置き換える</label></div>}
      <button type="submit" className="primary create-character">描き始める</button>
    </form>
  </section>;
}
