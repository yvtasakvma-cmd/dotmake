import type { ProjectSummary } from '../io/storage';

export function StartMenu({ ready, projects, activeId, onCharacter, onOpen }: {
  ready: boolean; projects: readonly ProjectSummary[]; activeId: string | null;
  onCharacter: () => void; onOpen: (id: string) => void;
}) {
  const resumeId = activeId || projects[0]?.id;
  return <section className="start-menu" aria-labelledby="menu-title">
    <h1 id="menu-title">何を作りますか？</h1>
    <div className="menu-options">
      <button className="menu-card available" disabled={!ready} onClick={onCharacter}><strong>キャラクターを作る</strong><span>新しい作品として保存します</span><span aria-hidden="true">→</span></button>
      <button className="menu-card" disabled><strong>敵キャラを作る</strong><span>準備中</span></button>
      <button className="menu-card" disabled><strong>マップチップセットを作る</strong><span>準備中</span></button>
    </div>
    {projects.length > 0 && <section className="resume-project" aria-label="作品一覧">
      <h2>保存した作品 <span>（{projects.length}件）</span></h2>
      {resumeId && <button className="primary" disabled={!ready} onClick={() => onOpen(resumeId)}>保存した作品を続ける</button>}
      <ul className="project-list">{projects.map((project) => <li key={project.id} data-project-id={project.id}>
        <article><h3>{project.name}</h3><p>{project.kind === 'character' ? 'キャラクター' : '既存の画像'} · {project.width} × {project.height} px</p><time dateTime={new Date(project.updatedAt).toISOString()}>更新 {new Date(project.updatedAt).toLocaleString('ja-JP')}</time>
          <button disabled={!ready} aria-label={`${project.name}を開く`} onClick={() => onOpen(project.id)}>開く</button></article>
      </li>)}</ul>
      <p className="setup-hint">作品はこの端末に保存されます。作成数の固定制限はなく、端末の空き容量に依存します。</p>
    </section>}
  </section>;
}
