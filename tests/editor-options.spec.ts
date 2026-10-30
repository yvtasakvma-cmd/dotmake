import { holdBrush } from './brush-size';
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
  if (isMobile) await holdBrush(page, 'ペン');
  await page.getByRole('slider', { name: 'ペンの太さ', exact: true }).fill('4');
  if (isMobile) await page.getByRole('button', { name: '閉じる', exact: true }).click();
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
  await page.getByRole('button', { name: '消しゴム', exact: true }).click();
  if (isMobile) await holdBrush(page, '消しゴム');
  await page.getByRole('slider', { name: '消しゴムの太さ', exact: true }).fill('2');
  if (isMobile) await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await tap(page, 8, 8);
  expect(await rgba(page, 8, 8)).toEqual([0, 0, 0, 0]);
  expect(await rgba(page, 9, 9)).toEqual([0, 0, 0, 0]);
  expect(await rgba(page, 7, 8)).toEqual([0, 0, 0, 255]);
  expect(await rgba(page, 10, 8)).toEqual([0, 0, 0, 255]);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  expect(await rgba(page, 8, 8)).toEqual([0, 0, 0, 255]);
  await page.getByRole('button', { name: 'ペン', exact: true }).click();
  if (isMobile) await holdBrush(page, 'ペン');
  await expect(page.getByRole('slider', { name: 'ペンの太さ', exact: true })).toHaveValue('4');
  if (isMobile) await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('button', { name: '消しゴム', exact: true }).click();
  if (isMobile) await holdBrush(page, '消しゴム');
  await expect(page.getByRole('slider', { name: '消しゴムの太さ', exact: true })).toHaveValue('2');
  if (isMobile) await page.getByRole('button', { name: '閉じる', exact: true }).click();
});

test('switches directional grids and centre lines without changing pixels or the PNG', async ({ page, isMobile }) => {
  await tap(page, 8, 8);
  const before = await page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await expect(page.locator('.tool-panel .guide-controls')).toHaveCount(0);
  await expect(page.getByLabel('グリッドの向き', { exact: true })).toHaveCount(0);
  const gridButton = page.getByRole('button', { name: 'グリッド設定', exact: true });
  await gridButton.scrollIntoViewIfNeeded();
  if (isMobile) await gridButton.tap(); else await gridButton.click();
  const dialog = page.getByRole('dialog', { name: '補助線の設定', exact: true });
  await expect(dialog).toBeVisible();
  await expect(gridButton).toHaveAttribute('aria-expanded', 'true');
  await page.getByLabel('グリッドの向き', { exact: true }).selectOption('vertical');
  await page.getByLabel('中心線', { exact: true }).selectOption('horizontal');
  await expect(page.locator('[data-guide="grid-vertical"]')).toHaveCount(1);
  await expect(page.locator('[data-guide="grid-horizontal"]')).toHaveCount(0);
  await expect(page.locator('[data-guide="center-horizontal"]')).toHaveAttribute('d', 'M0 16H32');
  await expect(page.locator('[data-guide="center-vertical"]')).toHaveCount(0);
  await page.getByLabel('グリッドの向き', { exact: true }).selectOption('off');
  await expect(page.locator('[data-guide^="grid-"]')).toHaveCount(0);
  await expect(page.locator('[data-guide="center-horizontal"]')).toHaveCount(1);
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(gridButton).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('g');
  await gridButton.click();
  await expect(page.getByLabel('グリッドの向き', { exact: true })).toHaveValue('vertical');
  await page.getByLabel('グリッドの向き', { exact: true }).selectOption('horizontal');
  await page.getByLabel('中心線', { exact: true }).selectOption('vertical');
  await expect(page.locator('[data-guide="grid-vertical"]')).toHaveCount(0);
  await expect(page.locator('[data-guide="grid-horizontal"]')).toHaveCount(1);
  await expect(page.locator('[data-guide="center-vertical"]')).toHaveAttribute('d', 'M16 0V32');
  await page.getByLabel('中心線', { exact: true }).selectOption('both');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await gridButton.click();
  await expect(page.getByLabel('グリッドの向き', { exact: true })).toHaveValue('horizontal');
  await expect(page.getByLabel('中心線', { exact: true })).toHaveValue('both');
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  expect(await page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(before);
  await page.getByRole('button', { name: 'PNG出力', exact: true }).click();
  const image = page.getByRole('img', { name: '書き出すPNG' });
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  const result = await image.evaluate((img: HTMLImageElement) => {
    const c = document.createElement('canvas'); c.width = 32; c.height = 32;
    c.getContext('2d')!.drawImage(img, 32, 0, 32, 32, 0, 0, 32, 32);
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

test('shows five recent drawing colours below the canvas and reuses them by touch or mouse', async ({ page, isMobile }) => {
  const history = page.getByRole('region', { name: '最近使った色', exact: true });
  await expect(history.locator('.recent-color-empty')).toHaveCount(5);
  for (const hex of ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666']) {
    await page.getByLabel('自由な色', { exact: true }).fill(hex);
    await tap(page, 0, 0);
  }
  const labels = () => history.getByRole('button').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')));
  expect(await labels()).toEqual(['#666666', '#555555', '#444444', '#333333', '#222222'].map(hex => `最近使った色 ${hex}`));
  await page.getByRole('button', { name: '消しゴム', exact: true }).click();
  await tap(page, 0, 0);
  const recent = history.getByRole('button', { name: '最近使った色 #333333', exact: true });
  await recent.scrollIntoViewIfNeeded();
  if (isMobile) await recent.tap(); else await recent.click();
  await expect(page.getByLabel('自由な色', { exact: true })).toHaveValue('#333333');
  await expect(page.getByRole('button', { name: 'ペン', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await tap(page, 1, 1);
  expect(await rgba(page, 1, 1)).toEqual([51, 51, 51, 255]);
  expect(await labels()).toEqual(['#333333', '#666666', '#555555', '#444444', '#222222'].map(hex => `最近使った色 ${hex}`));
  expect(await history.getByRole('button').count()).toBe(5);
  const position = await history.evaluate(element => {
    const canvas = document.querySelector('.canvas-viewport')!.getBoundingClientRect();
    return { top: element.getBoundingClientRect().top, canvasBottom: canvas.bottom, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  expect(position.top).toBeGreaterThanOrEqual(position.canvasBottom);
  expect(position.overflow).toBe(false);
});
