import { enterEditor } from './navigation';
import { expect, test, type Page } from '@playwright/test';

async function point(page: Page, x: number, y: number) {
  const canvas = page.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  return { x: box.x + (x + .5) * box.width / Number(await canvas.getAttribute('width')), y: box.y + (y + .5) * box.height / Number(await canvas.getAttribute('height')) };
}
async function tap(page: Page, x: number, y: number) {
  const p = await point(page, x, y); await page.mouse.click(p.x, p.y);
}
async function rgba(page: Page, x: number, y: number) {
  return page.locator('canvas').evaluate((c: HTMLCanvasElement, p) => [...c.getContext('2d')!.getImageData(p.x, p.y, 1, 1).data], { x, y });
}
async function addColor(page: Page, hex: string) {
  await page.getByLabel('自由な色', { exact: true }).fill(hex);
  await page.getByRole('button', { name: 'パレットに追加', exact: true }).click();
  await expect(page.getByRole('button', { name: `追加色 ${hex}`, exact: true })).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.goto('.');
  await enterEditor(page);
  await expect(page.getByRole('button', { name: '新規作成', exact: true })).toBeEnabled();
});

test('adds and removes saved colours, rejects duplicates, restores offline without altering the document', async ({ page, context }) => {
  await expect(page.getByRole('button', { name: 'パレットに追加', exact: true })).toBeDisabled();
  await addColor(page, '#fa1267');
  await expect(page.getByRole('button', { name: 'パレットに追加', exact: true })).toBeDisabled();
  await tap(page, 8, 8);
  await addColor(page, '#1256fa');
  await expect(page.getByText('この端末に保存済み', { exact: true })).toBeVisible();
  expect(await rgba(page, 8, 8)).toEqual([250, 18, 103, 255]);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await enterEditor(page);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await enterEditor(page);
  await expect(page.getByRole('button', { name: '追加色 #fa1267', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '追加色 #1256fa', exact: true })).toBeVisible();
  expect(await rgba(page, 8, 8)).toEqual([250, 18, 103, 255]);
  await page.getByRole('button', { name: '追加色 #fa1267', exact: true }).click();
  await tap(page, 9, 9);
  expect(await rgba(page, 9, 9)).toEqual([250, 18, 103, 255]);
  await page.getByRole('button', { name: '新規作成', exact: true }).click();
  await page.getByRole('button', { name: '48 × 48', exact: true }).click();
  await page.getByRole('button', { name: '作成する' }).click();
  await expect(page.locator('canvas')).toHaveAttribute('width', '48');
  await page.getByRole('button', { name: '追加色 #fa1267', exact: true }).click();
  await page.getByRole('button', { name: '選択した追加色を削除', exact: true }).click();
  await expect(page.getByRole('button', { name: '追加色 #fa1267', exact: true })).toHaveCount(0);
  await expect(page.getByText('この端末に保存済み', { exact: true })).toBeVisible();
  await page.reload();
  await enterEditor(page);
  await expect(page.getByRole('button', { name: '追加色 #1256fa', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '追加色 #fa1267', exact: true })).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveAttribute('width', '48');
  await context.setOffline(false);
});

test('keeps independent pen/eraser sizes and one undo step for a wide stroke', async ({ page, isMobile }) => {
  await page.getByLabel('ペンの太さ', { exact: true }).selectOption('4');
  const start = await point(page, 6, 8), end = await point(page, 14, 8);
  if (isMobile) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 0 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: 0 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y); await page.mouse.up();
  }
  expect(await rgba(page, 5, 7)).toEqual([0, 0, 0, 255]);
  expect(await rgba(page, 16, 10)).toEqual([0, 0, 0, 255]);
  expect(await rgba(page, 17, 8)).toEqual([0, 0, 0, 0]);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  expect(await rgba(page, 10, 8)).toEqual([0, 0, 0, 0]);
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  await page.getByLabel('消しゴムの太さ', { exact: true }).selectOption('2');
  await page.getByRole('button', { name: '消しゴム', exact: true }).click();
  await tap(page, 8, 8);
  expect(await rgba(page, 8, 8)).toEqual([0, 0, 0, 0]);
  expect(await rgba(page, 9, 9)).toEqual([0, 0, 0, 0]);
  expect(await rgba(page, 7, 8)).toEqual([0, 0, 0, 255]);
  expect(await rgba(page, 10, 8)).toEqual([0, 0, 0, 255]);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  expect(await rgba(page, 8, 8)).toEqual([0, 0, 0, 255]);
  await page.getByRole('button', { name: 'ペン', exact: true }).click();
  await expect(page.getByLabel('ペンの太さ', { exact: true })).toHaveValue('4');
  await expect(page.getByLabel('消しゴムの太さ', { exact: true })).toHaveValue('2');
});

test('switches directional grids and centre lines without changing pixels or the PNG', async ({ page }) => {
  await tap(page, 8, 8);
  const before = await page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.getByText('補助線の設定', { exact: true }).click();
  await page.getByLabel('グリッドの向き', { exact: true }).selectOption('vertical');
  await page.getByLabel('中心線', { exact: true }).selectOption('horizontal');
  await expect(page.locator('[data-guide="grid-vertical"]')).toHaveCount(1);
  await expect(page.locator('[data-guide="grid-horizontal"]')).toHaveCount(0);
  await expect(page.locator('[data-guide="center-horizontal"]')).toHaveAttribute('d', 'M0 16H32');
  await expect(page.locator('[data-guide="center-vertical"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'グリッド表示', exact: true }).click();
  await expect(page.locator('[data-guide^="grid-"]')).toHaveCount(0);
  await expect(page.locator('[data-guide="center-horizontal"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'グリッド表示', exact: true }).click();
  await expect(page.getByLabel('グリッドの向き', { exact: true })).toHaveValue('vertical');
  await page.getByLabel('グリッドの向き', { exact: true }).selectOption('horizontal');
  await page.getByLabel('中心線', { exact: true }).selectOption('vertical');
  await expect(page.locator('[data-guide="grid-vertical"]')).toHaveCount(0);
  await expect(page.locator('[data-guide="grid-horizontal"]')).toHaveCount(1);
  await expect(page.locator('[data-guide="center-vertical"]')).toHaveAttribute('d', 'M16 0V32');
  await page.getByLabel('中心線', { exact: true }).selectOption('both');
  expect(await page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(before);
  await page.getByRole('button', { name: 'PNG出力', exact: true }).click();
  const image = page.getByRole('img', { name: '書き出すPNG' });
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const result = await image.evaluate((img: HTMLImageElement) => {
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    c.getContext('2d')!.drawImage(img, 0, 0);
    return c.toDataURL();
  });
  expect(result).toBe(before);
});

test('palette write failures retain the last saved colours and the drawing', async ({ page }) => {
  await addColor(page, '#fa1267');
  await tap(page, 8, 8);
  await expect(page.getByText('この端末に保存済み', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value: unknown, key?: IDBValidKey) {
      if (key === 'palette') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, value, key!);
    };
  });
  await page.getByLabel('自由な色', { exact: true }).fill('#1256fa');
  await page.getByRole('button', { name: 'パレットに追加', exact: true }).click();
  await expect(page.getByText('パレットを保存できませんでした。', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: '追加色 #1256fa', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '追加色 #fa1267', exact: true })).toBeVisible();
  expect(await rgba(page, 8, 8)).toEqual([250, 18, 103, 255]);
});
