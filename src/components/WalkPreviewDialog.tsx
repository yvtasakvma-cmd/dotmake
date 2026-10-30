import { useEffect, useRef, useState } from 'react';
import { DIRECTIONS, POSES, type PixelDocument } from '../model/document';
import { renderDocument } from '../drawing/render';

// Standing between the two steps makes a three-pose walk loop smoothly.
const WALK_CYCLE = [1, 0, 1, 2] as const;

export function WalkPreviewDialog({ document, onClose }: { document: PixelDocument; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [fps, setFps] = useState(6);
  const row = Math.floor(document.frameIndex! / 3);
  const direction = DIRECTIONS[row];
  const pose = WALK_CYCLE[step];

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setStep(value => (value + 1) % WALK_CYCLE.length), 1000 / fps);
    return () => window.clearInterval(timer);
  }, [playing, fps]);

  useEffect(() => {
    if (canvas.current) renderDocument(canvas.current, { ...document, pixels: document.frames![row * 3 + pose] });
  }, [document, row, pose]);

  return <dialog ref={dialog} className="walk-preview-dialog" aria-labelledby="walk-preview-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <h2 id="walk-preview-title">{direction}の歩行プレビュー</h2>
    <div className="walk-preview-stage"><canvas ref={canvas} width={document.width} height={document.height} aria-label={`${direction}の歩行アニメーション`} /></div>
    <p><output aria-label="再生中のポーズ">{POSES[pose]}</output> · {document.width} × {document.height} px</p>
    <label className="walk-preview-speed">再生速度<select aria-label="再生速度" value={fps} onChange={(event) => setFps(Number(event.target.value))}>{[2, 4, 6, 8, 10, 12].map(value => <option key={value} value={value}>{value} コマ/秒</option>)}</select></label>
    <p className="hint">直立 → 左足 → 直立 → 右足を繰り返します。まだ描いていないコマは透明で表示されます。</p>
    <div className="dialog-actions"><button onClick={() => setPlaying(value => !value)}>{playing ? '一時停止' : '再生を続ける'}</button><button className="primary" onClick={onClose}>閉じる</button></div>
  </dialog>;
}
