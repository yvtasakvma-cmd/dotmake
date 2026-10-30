import { expect, test, type Page } from '@playwright/test';
import { enterEditor } from './navigation';

async function clickPixel(page: Page, x: number, y: number, button: 'left' | 'right' = 'left') {
  const canvas = page.locator('canvas'); await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + (x + .5) * box.width / 32, box.y + (y + .5) * box.height / 32, { button });
}
async function pixel(page: Page, x: number, y: number) {
  return page.locator('canvas').evaluate((c: HTMLCanvasElement, p) => [...c.getContext('2d')!.getImageData(p.x, p.y, 1, 1).data], { x, y });
}
test.beforeEach(async ({ page }) => { await page.goto('.'); await enterEditor(page); });

test('creates semi-transparent colours, saves them in the palette and restores their alpha after reload and picking', async ({ page }) => {
  const opacity = page.getByRole('slider', { name: '不透明度', exact: true });
  await page.getByLabel('自由な色', { exact: true }).fill('#ff0000');
  await opacity.fill('50');
  await expect(page.locator('.opacity-control output')).toHaveText('50%');
  await page.getByRole('button', { name: 'パレットに追加', exact: true }).click();
  await expect(page.getByRole('button', { name: '追加色 #ff000080', exact: true })).toBeVisible();
  await clickPixel(page, 4, 4); await clickPixel(page, 4, 4);
  expect(await pixel(page, 4, 4)).toEqual([255, 0, 0, 128]);
  await expect(page.getByRole('button', { name: '最近使った色 #ff000080', exact: true })).toHaveCount(1);
  await page.getByLabel('自由な色', { exact: true }).fill('#0000ff');
  await expect(opacity).toHaveValue('50');
  await clickPixel(page, 5, 5);
  expect(await pixel(page, 5, 5)).toEqual([0, 0, 255, 128]);
  await opacity.fill('100'); await clickPixel(page, 4, 4, 'right');
  await expect(opacity).toHaveValue('50');
  await expect(page.getByLabel('自由な色', { exact: true })).toHaveValue('#ff0000');
  await opacity.fill('0'); await clickPixel(page, 4, 4);
  expect((await pixel(page, 4, 4))[3]).toBe(0);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  expect(await pixel(page, 4, 4)).toEqual([255, 0, 0, 128]);
  await expect(page.getByText('この端末に保存済み', { exact: true })).toBeVisible();
  await page.reload(); await enterEditor(page);
  expect(await pixel(page, 4, 4)).toEqual([255, 0, 0, 128]);
  await page.getByRole('button', { name: '追加色 #ff000080', exact: true }).click();
  await expect(opacity).toHaveValue('50');
  await expect(page.getByLabel('自由な色', { exact: true })).toHaveValue('#ff0000');
  await page.getByRole('button', { name: 'スポイト', exact: true }).click(); await clickPixel(page, 5, 5);
  await expect(page.getByLabel('自由な色', { exact: true })).toHaveValue('#0000ff');
  await expect(opacity).toHaveValue('50');
});

test('fills and exports a PNG containing half opacity, quarter opacity and fully transparent pixels', async ({ page }) => {
  await page.getByLabel('自由な色', { exact: true }).fill('#ff0000');
  await page.getByRole('slider', { name: '不透明度', exact: true }).fill('50');
  await clickPixel(page, 4, 4);
  await page.getByLabel('自由な色', { exact: true }).fill('#0000ff');
  await page.getByRole('slider', { name: '不透明度', exact: true }).fill('25');
  await page.getByRole('button', { name: '塗りつぶし', exact: true }).click(); await clickPixel(page, 0, 0);
  expect(await pixel(page, 0, 0)).toEqual([0, 0, 255, 64]);
  expect(await pixel(page, 4, 4)).toEqual([255, 0, 0, 128]);
  await page.getByRole('button', { name: '消しゴム', exact: true }).click(); await clickPixel(page, 5, 5);
  await page.getByRole('button', { name: 'PNG出力', exact: true }).click();
  const image = page.getByRole('img', { name: '書き出すPNG', exact: true });
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(96);
  expect(await image.evaluate((img: HTMLImageElement) => {
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0);
    return [ctx.getImageData(36, 4, 1, 1), ctx.getImageData(32, 0, 1, 1), ctx.getImageData(37, 5, 1, 1)].map(pixel => [...pixel.data]);
  })).toEqual([[255, 0, 0, 128], [0, 0, 255, 64], [0, 0, 0, 0]]);
});
