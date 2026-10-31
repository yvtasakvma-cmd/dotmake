import type { ProjectSummary } from '../io/storage';

export function CharacterLibrary({ ready, projects, activeId, clipboardName, message, onBack, onNew, onOpen, onCopy, onPaste, onDelete }: {
  ready: boolean; projects: readonly ProjectSummary[]; activeId: string | null;
  clipboardName?: string; message: string;
  onBack: () => void; onNew: () => void; onOpen: (id: string) => void;
  onCopy: (id: string) => void; onPaste: () => void; onDelete: (project: ProjectSummary) => void;
}) {
  const resumeId = activeId || projects[0]?.id;
  return <section className="character-library" aria-labelledby="library-title">
    <button disabled={!ready} onClick={onBack}>メインメニューへ戻る</button>
    <h1 id="library-title">キャラクター</h1>
    <div className="library-toolbar"><button className="primary" disabled={!ready} onClick={onNew}>新規キャラクター</button><button disabled={!ready || !clipboardName} onClick={onPaste}>貼り付けて新規作成</button></div>
    {clipboardName && <p className="setup-hint">コピー中：{clipboardName}（このアプリ内のコピー）</p>}
    {message && <p role="status">{message}</p>}
    <section className="resume-project" aria-label="作品一覧">
      <h2>保存したキャラクター（{projects.length}件）</h2>
      {!projects.length && <p>まだキャラクターがありません。「新規キャラクター」から作れます。</p>}
      {resumeId && <button disabled={!ready} onClick={() => onOpen(resumeId)}>保存した作品を続ける</button>}
      <ul className="project-list">{projects.map((project) => <li key={project.id} data-project-id={project.id}>
        <article><h3>{project.name}</h3><p>{project.kind === 'character' ? 'キャラクター' : '以前の画像'} · {project.width} × {project.height} px{project.frameCount === 12 && ' · 12コマ'}</p><time dateTime={new Date(project.updatedAt).toISOString()}>更新 {new Date(project.updatedAt).toLocaleString('ja-JP')}</time>
          <div className="project-actions"><button className="primary" disabled={!ready} aria-label={`${project.name}を開く`} onClick={() => onOpen(project.id)}>続きから編集</button><button disabled={!ready} aria-label={`${project.name}をコピー`} onClick={() => onCopy(project.id)}>コピー</button><button className="danger-button" disabled={!ready} aria-label={`${project.name}を削除`} onClick={() => onDelete(project)}>削除</button></div></article>
      </li>)}</ul>
      <p className="setup-hint">作品はこの端末に保存します。GitHub保存を設定すると他の端末とも同期できます。コピーは元の作品を消しても貼り付けられます。</p>
    </section>
  </section>;
}
