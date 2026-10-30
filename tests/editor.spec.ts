import { enterEditor } from './navigation';
import { expect, test, type Page } from '@playwright/test';

const canvas = (page: Page) => page.getByLabel('32×32の描画キャンバス', { exact: false });
async function cell(page: Page, x: number, y: number) {
  await canvas(page).scrollIntoViewIfNeeded();
  const box = (await canvas(page).boundingBox())!;
  return { x: box.x + (x + .5) * box.width / 32, y: box.y + (y + .5) * box.height / 32 };
}
async function rgba(page: Page, x: number, y: number) {
  return canvas(page).evaluate((element, point) => Array.from((element as HTMLCanvasElement).getContext('2d')!.getImageData(point.x, point.y, 1, 1).data), { x, y });
}
async function line(page: Page, from: [number, number], to: [number, number]) {
  const start = await cell(page, ...from);
  const end = await cell(page, ...to);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y); // Deliberately one jump: interpolation must fill the gap.
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('.');
  await enterEditor(page);
  await expect(canvas(page)).toBeVisible();
  await expect(page.getByRole('button', { name: '新規作成', exact: true })).toBeEnabled();
});

test('starts transparent and paints continuous pixels, undoing the whole stroke', async ({ page }) => {
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeDisabled();
  expect(await rgba(page, 0, 0)).toEqual([0, 0, 0, 0]);
  await line(page, [1, 5], [30, 5]);
  for (let x = 1; x <= 30; x++) expect(await rgba(page, x, 5)).toEqual([48, 59, 50, 255]);
  expect(await rgba(page, 15, 6)).toEqual([0, 0, 0, 0]);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  expect(await rgba(page, 15, 5)).toEqual([0, 0, 0, 0]);
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  expect(await rgba(page, 15, 5)).toEqual([48, 59, 50, 255]);
});

test('selects colours, erases true alpha, and restores erased pixels', async ({ page }) => {
  await page.getByRole('button', { name: 'コーラル #e77958' }).click();
  await line(page, [2, 2], [8, 2]);
  expect(await rgba(page, 4, 2)).toEqual([231, 121, 88, 255]);
  await page.getByRole('button', { name: '消しゴム', exact: false }).click();
  await line(page, [4, 2], [6, 2]);
  expect(await rgba(page, 4, 2)).toEqual([0, 0, 0, 0]);
  expect(await rgba(page, 3, 2)).toEqual([231, 121, 88, 255]);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  expect(await rgba(page, 4, 2)).toEqual([231, 121, 88, 255]);
});

test('grid and viewport changes preserve pixels and history', async ({ page }) => {
  await line(page, [0, 31], [31, 0]);
  await page.getByRole('button', { name: 'グリッド表示' }).click();
  await expect(page.getByRole('button', { name: 'グリッド表示' })).toHaveAttribute('aria-pressed', 'false');
  const before = await canvas(page).evaluate((element) => (element as HTMLCanvasElement).toDataURL());
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(canvas(page)).toHaveAttribute('width', '32');
  expect(await canvas(page).evaluate((element) => (element as HTMLCanvasElement).toDataURL())).toBe(before);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  expect(await rgba(page, 0, 31)).toEqual([0, 0, 0, 0]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('captures the pointer outside the canvas and ends its stroke on release', async ({ page }) => {
  const start = await cell(page, 28, 16);
  const box = (await canvas(page).boundingBox())!;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 8, start.y);
  await page.mouse.up();
  expect(await rgba(page, 31, 16)).toEqual([48, 59, 50, 255]);
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeEnabled();
  await line(page, [0, 0], [0, 0]);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  expect(await rgba(page, 0, 0)).toEqual([0, 0, 0, 0]);
  expect(await rgba(page, 31, 16)).toEqual([48, 59, 50, 255]);
});

test('cancellation leaves the editor usable and the partial stroke undoable', async ({ page }) => {
  const position = await cell(page, 10, 10);
  await page.mouse.move(position.x, position.y);
  await page.mouse.down();
  await canvas(page).dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  expect(await rgba(page, 10, 10)).toEqual([0, 0, 0, 0]);
  await line(page, [4, 4], [4, 4]);
  expect(await rgba(page, 4, 4)).toEqual([48, 59, 50, 255]);
});

test('supports keyboard history and tool shortcuts', async ({ page }) => {
  await line(page, [5, 5], [5, 5]);
  await page.keyboard.press('Control+z');
  expect(await rgba(page, 5, 5)).toEqual([0, 0, 0, 0]);
  await page.keyboard.press('Control+Shift+z');
  expect(await rgba(page, 5, 5)).toEqual([48, 59, 50, 255]);
  await page.keyboard.press('e');
  await expect(page.getByRole('button', { name: '消しゴム', exact: false })).toHaveAttribute('aria-pressed', 'true');
  await line(page, [5, 5], [5, 5]);
  expect(await rgba(page, 5, 5)).toEqual([0, 0, 0, 0]);
});

test('real touch events draw without scrolling and ignore a second finger', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Touch behaviour is exercised in the mobile project.');
  const session = await page.context().newCDPSession(page);
  const start = await cell(page, 2, 10);
  const end = await cell(page, 25, 10);
  const second = await cell(page, 16, 24);
  const scrollY = await page.evaluate(() => window.scrollY);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 0 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 0 }, { ...second, id: 1 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...end, id: 0 }, { ...second, id: 1 }] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await rgba(page, 15, 10)).toEqual([48, 59, 50, 255]);
  expect(await rgba(page, 16, 24)).toEqual([0, 0, 0, 0]);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeEnabled();
});

test('portrait controls fit without horizontal page overflow', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const name of ['ペン', '消しゴム']) {
    const box = (await page.getByRole('button', { name, exact: false }).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: testInfo.outputPath('portrait.png'), fullPage: true });
});
