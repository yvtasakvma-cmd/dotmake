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

test('switches directions and poses and copies a complete frame with transparency and undo', async ({ page }) => {
  await expect(page.getByLabel('編集中のコマ')).toHaveText('正面・直立');
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
