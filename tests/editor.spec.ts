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
  for (let x = 1; x <= 30; x++) expect(await rgba(page, x, 5)).toEqual([0, 0, 0, 255]);
  expect(await rgba(page, 15, 6)).toEqual([0, 0, 0, 0]);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  expect(await rgba(page, 15, 5)).toEqual([0, 0, 0, 0]);
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  expect(await rgba(page, 15, 5)).toEqual([0, 0, 0, 255]);
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
  await page.getByRole('button', { name: 'グリッド設定', exact: true }).click();
  await page.getByLabel('グリッドの向き', { exact: true }).selectOption('off');
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(page.locator('.grid-state')).toHaveText('OFF');
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
  expect(await rgba(page, 31, 16)).toEqual([0, 0, 0, 255]);
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeEnabled();
  await line(page, [0, 0], [0, 0]);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  expect(await rgba(page, 0, 0)).toEqual([0, 0, 0, 0]);
  expect(await rgba(page, 31, 16)).toEqual([0, 0, 0, 255]);
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
  expect(await rgba(page, 4, 4)).toEqual([0, 0, 0, 255]);
});

test('supports keyboard history and tool shortcuts', async ({ page }) => {
  await line(page, [5, 5], [5, 5]);
  await page.keyboard.press('Control+z');
  expect(await rgba(page, 5, 5)).toEqual([0, 0, 0, 0]);
  await page.keyboard.press('Control+Shift+z');
  expect(await rgba(page, 5, 5)).toEqual([0, 0, 0, 255]);
  await page.keyboard.press('e');
  await expect(page.getByRole('button', { name: '消しゴム', exact: false })).toHaveAttribute('aria-pressed', 'true');
  await line(page, [5, 5], [5, 5]);
  expect(await rgba(page, 5, 5)).toEqual([0, 0, 0, 0]);
});

test('two-finger navigation cancels the first drawing touch without scrolling the page', async ({ page, isMobile }) => {
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
  expect(await rgba(page, 15, 10)).toEqual([0, 0, 0, 0]);
  expect(await rgba(page, 16, 24)).toEqual([0, 0, 0, 0]);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeDisabled();
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

test('right click picks the pixel colour or selects eraser on transparency without drawing', async ({ page }) => {
  await page.getByLabel('自由な色', { exact: true }).fill('#e77958');
  await line(page, [8, 8], [9, 8]);
  const before = await canvas(page).evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.getByLabel('自由な色', { exact: true }).fill('#1256fa');
  await page.getByRole('button', { name: '塗りつぶし', exact: true }).click();
  let p = await cell(page, 8, 8);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await expect(page.getByLabel('自由な色', { exact: true })).toHaveValue('#e77958');
  await expect(page.getByRole('button', { name: 'ペン', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await canvas(page).evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(before);
  p = await cell(page, 15, 15);
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await expect(page.getByRole('button', { name: '消しゴム', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await canvas(page).evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(before);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  expect(await rgba(page, 8, 8)).toEqual([0, 0, 0, 0]);
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  p = await cell(page, 8, 8); await page.mouse.click(p.x, p.y);
  expect(await rgba(page, 8, 8)).toEqual([0, 0, 0, 0]);
  expect(await rgba(page, 9, 8)).toEqual([231, 121, 88, 255]);
});

test('right click samples the visible pixel correctly after zoom and pan and ignores the canvas margin', async ({ page }) => {
  await page.getByLabel('自由な色', { exact: true }).fill('#123abc');
  await line(page, [16, 16], [16, 16]);
  await page.getByRole('button', { name: '拡大', exact: true }).click();
  const viewport = page.getByLabel('キャンバス表示領域', { exact: true });
  await viewport.scrollIntoViewIfNeeded();
  await viewport.evaluate(element => { element.scrollLeft += 12; element.scrollTop += 12; });
  await page.getByLabel('自由な色', { exact: true }).fill('#ffffff');
  await page.getByRole('button', { name: '表示を移動', exact: true }).click();
  await viewport.scrollIntoViewIfNeeded();
  const p = await canvas(page).evaluate((c: HTMLCanvasElement) => {
    const box = c.getBoundingClientRect(); return { x: box.x + 16.5 * box.width / 32, y: box.y + 16.5 * box.height / 32 };
  });
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await expect(page.getByLabel('自由な色', { exact: true })).toHaveValue('#123abc');
  await expect(page.getByRole('button', { name: 'ペン', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '全体表示', exact: true }).click();
  await viewport.scrollIntoViewIfNeeded();
  const box = (await viewport.boundingBox())!;
  await page.mouse.click(box.x + 2, box.y + 2, { button: 'right' });
  await expect(page.getByRole('button', { name: 'ペン', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await rgba(page, 16, 16)).toEqual([18, 58, 188, 255]);
});
