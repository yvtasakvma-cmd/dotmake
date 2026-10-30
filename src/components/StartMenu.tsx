export function StartMenu({ ready, hasProject, name, onCharacter, onResume }: {
  ready: boolean; hasProject: boolean; name: string;
  onCharacter: () => void; onResume: () => void;
}) {
  return <section className="start-menu" aria-labelledby="menu-title">
    <h1 id="menu-title">何を作りますか？</h1>
    <div className="menu-options">
      <button className="menu-card available" disabled={!ready} onClick={onCharacter}><strong>キャラクターを作る</strong><span>主人公や仲間の、1枚のドット絵</span><span aria-hidden="true">→</span></button>
      <button className="menu-card" disabled><strong>敵キャラを作る</strong><span>準備中</span></button>
      <button className="menu-card" disabled><strong>マップチップセットを作る</strong><span>準備中</span></button>
    </div>
    {hasProject && <div className="resume-project"><h2>前の作品</h2><p>{name}</p><button className="primary" disabled={!ready} onClick={onResume}>保存した作品を続ける</button></div>}
  </section>;
}
