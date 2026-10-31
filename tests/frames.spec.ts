import { expect, test, type Page } from '@playwright/test';
import { enterEditor } from './navigation';

async function paint(page: Page, x: number, y: number) {
  const canvas = page.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + (x + .5) * box.width / 32, box.y + (y + .5) * box.height / 32);
}
async function pixel(page: Page, x: number, y: number) {
  return page.locator('canvas').evaluate((c: HTMLCanvasElement, p) => [...c.getContext('2d')!.getImageData(p.x, p.y, 1, 1).data], { x, y });
}
const directions = ['正面', '左向き', '右向き', '後ろ'];
const poses = ['左足', '直立', '右足'];
async function choose(page: Page, index: number) {
  const details = page.locator('.frame-navigation details');
  if (!await details.getAttribute('open').then(value => value !== null)) await details.locator('summary').click();
  await page.getByRole('button', { name: `${directions[Math.floor(index / 3)]}・${poses[index % 3]}を編集`, exact: true }).click();
}

test.beforeEach(async ({ page }) => { await page.goto('.'); await enterEditor(page); });

test('switches directions and poses and copies a complete frame with transparency and undo', async ({ page, isMobile }) => {
  await expect(page.getByLabel('編集中のコマ')).toHaveText('正面・直立');
  for (const [column, pose] of poses.entries()) {
    await choose(page, column);
    const up = page.getByRole('button', { name: '前の向き', exact: true });
    if (isMobile) await up.tap(); else await up.click();
    await expect(page.getByLabel('編集中のコマ')).toHaveText(`後ろ・${pose}`);
    const down = page.getByRole('button', { name: '次の向き', exact: true });
    if (isMobile) await down.tap(); else await down.click();
    await expect(page.getByLabel('編集中のコマ')).toHaveText(`正面・${pose}`);
  }
  await choose(page, 1);
  await expect(page.getByRole('button', { name: '1コマ全体貼り付け', exact: true })).toBeDisabled();
  await paint(page, 3, 4);
  await page.getByRole('button', { name: '1コマ全体コピー', exact: true }).click();
  await page.getByRole('button', { name: '次のポーズ', exact: true }).click();
  await expect(page.getByLabel('編集中のコマ')).toHaveText('正面・右足');
  expect(await pixel(page, 3, 4)).toEqual([0, 0, 0, 0]);
  await paint(page, 6, 7);
  await page.getByRole('button', { name: '1コマ全体貼り付け', exact: true }).click();
  expect(await pixel(page, 3, 4)).toEqual([0, 0, 0, 255]);
  expect(await pixel(page, 6, 7)).toEqual([0, 0, 0, 0]);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  expect(await pixel(page, 6, 7)).toEqual([0, 0, 0, 255]);
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  await page.getByRole('button', { name: '次の向き', exact: true }).click();
  await expect(page.getByLabel('編集中のコマ')).toHaveText('左向き・右足');
  expect(await pixel(page, 3, 4)).toEqual([0, 0, 0, 0]);
  await page.getByRole('button', { name: '前の向き', exact: true }).click();
  await page.getByRole('button', { name: '前のポーズ', exact: true }).click();
  expect(await pixel(page, 3, 4)).toEqual([0, 0, 0, 255]);
  expect(await pixel(page, 6, 7)).toEqual([0, 0, 0, 0]);
});

test('persists all twelve independent frames and exports their exact 3 by 4 layout', async ({ page }) => {
  for (let index = 0; index < 12; index++) {
    await choose(page, index);
    await expect(page.locator('.frame-thumbnail')).toHaveCount(12);
    await paint(page, index, index);
  }
  await expect(page.getByText('この端末に保存済み', { exact: true })).toBeVisible();
  await page.reload(); await enterEditor(page);
  await expect(page.getByLabel('編集中のコマ')).toHaveText('後ろ・右足');
  for (let index = 0; index < 12; index++) {
    await choose(page, index);
    expect(await pixel(page, index, index)).toEqual([0, 0, 0, 255]);
    expect(await pixel(page, (index + 1) % 12, (index + 1) % 12)).toEqual([0, 0, 0, 0]);
  }
  await page.getByRole('button', { name: 'PNG出力', exact: true }).click();
  const image = page.getByRole('img', { name: '書き出すPNG' });
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(96);
  const output = await image.evaluate((img: HTMLImageElement) => {
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0);
    return { width: canvas.width, height: canvas.height, pixels: Array.from({ length: 12 }, (_, index) => [...ctx.getImageData(index % 3 * 32 + index, Math.floor(index / 3) * 32 + index, 1, 1).data]), transparent: [...ctx.getImageData(31, 31, 1, 1).data] };
  });
  expect(output).toEqual({ width: 96, height: 128, pixels: Array.from({ length: 12 }, () => [0, 0, 0, 255]), transparent: [0, 0, 0, 0] });
});

test('library copy duplicates all frames and edits stay independent', async ({ page }) => {
  await paint(page, 1, 1);
  await choose(page, 10); await paint(page, 10, 10);
  await page.getByRole('button', { name: 'キャラクター一覧へ戻る', exact: true }).click();
  await page.getByRole('button', { name: '新しいキャラクターをコピー', exact: true }).click();
  await page.getByRole('button', { name: '貼り付けて新規作成', exact: true }).click();
  expect(await pixel(page, 10, 10)).toEqual([0, 0, 0, 255]);
  await choose(page, 1);
  expect(await pixel(page, 1, 1)).toEqual([0, 0, 0, 255]);
  await paint(page, 2, 2);
  await page.getByRole('button', { name: 'キャラクター一覧へ戻る', exact: true }).click();
  await page.getByRole('button', { name: '新しいキャラクターを開く', exact: true }).click();
  await choose(page, 1);
  expect(await pixel(page, 2, 2)).toEqual([0, 0, 0, 0]);
  await choose(page, 10);
  expect(await pixel(page, 10, 10)).toEqual([0, 0, 0, 255]);
});

test('corrupt frame arrays are retained and reported without replacing the saved character', async ({ page }) => {
  await expect(page.getByText('この端末に保存済み', { exact: true })).toBeVisible();
  await page.evaluate(async () => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('pixel-studio');
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('projects', 'readwrite'), store = tx.objectStore('projects');
      const all = store.getAll();
      all.onsuccess = () => store.put({ ...all.result[0], frames: all.result[0].frames.slice(0, 11) });
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
  }));
  await page.reload();
  await expect(page.getByText('一部の作品を読めません。', { exact: false })).toBeVisible();
  expect(await page.evaluate(async () => new Promise<number>((resolve) => {
    const request = indexedDB.open('pixel-studio');
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('projects'), all = tx.objectStore('projects').getAll();
      all.onsuccess = () => resolve(all.result[0].frames.length); tx.oncomplete = () => db.close();
    };
  }))).toBe(11);
});

test('previews only the selected direction, loops its poses and leaves the artwork unchanged', async ({ page }) => {
  const colours = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
  const rgba = [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255], [255, 255, 0, 255]];
  for (let row = 0; row < 4; row++) {
    await page.getByLabel('自由な色', { exact: true }).fill(colours[row]);
    for (let column = 0; column < 3; column++) {
      await choose(page, row * 3 + column); await paint(page, column, 0);
    }
  }
  await expect(page.getByText('この端末に保存済み', { exact: true })).toBeVisible();
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  const editor = page.locator('.canvas-workspace canvas');
  for (let row = 0; row < 4; row++) {
    await choose(page, row * 3 + 2);
    const before = await editor.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
    await page.getByRole('button', { name: '歩行を再生', exact: false }).click();
    const dialog = page.getByRole('dialog', { name: `${directions[row]}の歩行プレビュー`, exact: true });
    await expect(dialog).toBeVisible();
    const preview = dialog.locator('canvas');
    const scale = dialog.getByLabel('プレビューの表示倍率', { exact: true });
    await expect(scale).toHaveValue(row === 0 ? '8' : '4');
    async function assertPose(column: number) {
      await expect(dialog.getByLabel('再生中のポーズ')).toHaveText(poses[column]);
      expect(await preview.evaluate((canvas: HTMLCanvasElement) => {
        const context = canvas.getContext('2d')!;
        return Array.from({ length: 3 }, (_, x) => [...context.getImageData(x, 0, 1, 1).data]);
      })).toEqual(Array.from({ length: 3 }, (_, x) => x === column ? rgba[row] : [0, 0, 0, 0]));
    }
    await assertPose(1);
    if (row === 0) {
      for (const zoom of [0.25, 0.5, 1, 2, 4, 8, 16]) {
        await scale.selectOption(String(zoom));
        await expect(preview).toHaveCSS('width', `${32 * zoom}px`);
        await expect(preview).toHaveCSS('height', `${32 * zoom}px`);
        await expect(preview).toHaveAttribute('width', '32');
        await expect(preview).toHaveAttribute('height', '32');
        await assertPose(1);
      }
      expect(await dialog.locator('.walk-preview-stage').evaluate((element) => element.scrollWidth > element.clientWidth && element.scrollHeight > element.clientHeight)).toBe(true);
      await scale.selectOption('4');
    }
    for (const column of [0, 1, 2, 1]) { await page.clock.runFor(167); await assertPose(column); }
    await dialog.getByRole('button', { name: '一時停止', exact: true }).click();
    await page.clock.runFor(2000); await assertPose(1);
    await dialog.getByLabel('再生速度', { exact: true }).selectOption('2');
    await dialog.getByRole('button', { name: '再生を続ける', exact: true }).click();
    await page.clock.runFor(500); await assertPose(0);
    if (row % 2) await page.keyboard.press('Escape');
    else await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await editor.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(before);
    await expect(page.getByLabel('編集中のコマ')).toHaveText(`${directions[row]}・右足`);
    // A closed popup must stop its timer and allow drawing immediately.
    await page.clock.runFor(1000);
  }
});
