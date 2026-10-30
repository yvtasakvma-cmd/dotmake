export function StartMenu({ ready, onCharacter }: { ready: boolean; onCharacter: () => void }) {
  return <section className="start-menu" aria-labelledby="menu-title">
    <h1 id="menu-title">何を作りますか？</h1>
    <div className="menu-options">
      <button className="menu-card available" disabled={!ready} onClick={onCharacter}><strong>キャラクターを作る</strong><span>保存したキャラクターの一覧へ</span><span aria-hidden="true">→</span></button>
      <button className="menu-card" disabled><strong>敵キャラを作る</strong><span>準備中</span></button>
      <button className="menu-card" disabled><strong>マップチップセットを作る</strong><span>準備中</span></button>
    </div>
  </section>;
}
