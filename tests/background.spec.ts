import { expect, test, type Page } from '@playwright/test';
import { enterEditor } from './navigation';

async function clickPixel(page: Page, x: number, y: number, button: 'left' | 'right' = 'left') {
  const canvas = page.locator('canvas'); await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + (x + .5) * box.width / 32, box.y + (y + .5) * box.height / 32, { button });
}
async function openBackground(page: Page, mobile: boolean) {
  const button = page.getByRole('button', { name: '背景設定', exact: true });
  await button.scrollIntoViewIfNeeded();
  if (mobile) await button.tap(); else await button.click();
  return page.getByRole('dialog', { name: '背景の設定', exact: true });
}
test.beforeEach(async ({ page }) => { await page.goto('.'); await enterEditor(page); });

test('changes the display and walk preview background while preserving exact pixels, eyedropper alpha, undo and transparent PNG output', async ({ page, isMobile }) => {
  await page.getByLabel('自由な色', { exact: true }).fill('#ff0000');
  await page.getByRole('slider', { name: '不透明度', exact: true }).fill('50');
  await clickPixel(page, 4, 4);
  await expect(page.getByText('この端末に保存済み', { exact: true })).toBeVisible();
  const before = await page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const dialog = await openBackground(page, isMobile);
  await expect(dialog.getByRole('button', { name: '市松模様', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByLabel('背景色', { exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: '単色', exact: true }).click();
  await dialog.getByLabel('背景色', { exact: true }).fill('#123456');
  await expect(page.locator('.canvas-frame')).toHaveCSS('background-image', 'none');
  await expect(page.locator('.canvas-frame')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  expect(await page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(before);
  await expect(page.getByLabel('自由な色', { exact: true })).toHaveValue('#ff0000');
  await expect(page.getByRole('slider', { name: '不透明度', exact: true })).toHaveValue('50');

  await clickPixel(page, 0, 0, 'right');
  await expect(page.getByRole('button', { name: '消しゴム', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await clickPixel(page, 4, 4, 'right');
  await expect(page.getByLabel('自由な色', { exact: true })).toHaveValue('#ff0000');
  await expect(page.getByRole('slider', { name: '不透明度', exact: true })).toHaveValue('50');

  await page.getByRole('button', { name: '歩行を再生', exact: true }).click();
  await expect(page.locator('.walk-preview-stage')).toHaveCSS('background-image', 'none');
  await expect(page.locator('.walk-preview-stage')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await page.getByRole('dialog').getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('button', { name: 'PNG出力', exact: true }).click();
  const image = page.getByRole('img', { name: '書き出すPNG', exact: true });
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(96);
  expect(await image.evaluate((img: HTMLImageElement) => {
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0);
    return [[36, 4], [32, 0], [0, 0]].map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
  })).toEqual([[255, 0, 0, 128], [0, 0, 0, 0], [0, 0, 0, 0]]);
  await page.getByRole('dialog').getByRole('button', { name: '閉じる', exact: true }).click();

  await openBackground(page, isMobile);
  await page.getByRole('button', { name: '市松模様', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '閉じる', exact: true }).click();
  await expect(page.locator('.canvas-frame')).toHaveCSS('background-image', /conic-gradient/);
  expect(await page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(before);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  expect(await page.locator('canvas').evaluate((c: HTMLCanvasElement) => [...c.getContext('2d')!.getImageData(4, 4, 1, 1).data])).toEqual([0, 0, 0, 0]);
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeDisabled();
});

test('remembers both the background mode and chosen colour after reopening and fits a narrow touch screen', async ({ page, isMobile }, testInfo) => {
  let dialog = await openBackground(page, isMobile);
  await dialog.getByRole('button', { name: '単色', exact: true }).click();
  await dialog.getByLabel('背景色', { exact: true }).fill('#fedcba');
  await dialog.screenshot({ path: testInfo.outputPath('background-settings.png') });
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.reload(); await enterEditor(page);
  await expect(page.locator('.canvas-frame')).toHaveCSS('background-image', 'none');
  await expect(page.locator('.canvas-frame')).toHaveCSS('background-color', 'rgb(254, 220, 186)');
  dialog = await openBackground(page, isMobile);
  await expect(dialog.getByRole('button', { name: '単色', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByLabel('背景色', { exact: true })).toHaveValue('#fedcba');
  await dialog.getByRole('button', { name: '市松模様', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.reload(); await enterEditor(page);
  await expect(page.locator('.canvas-frame')).toHaveCSS('background-image', /conic-gradient/);
  dialog = await openBackground(page, isMobile);
  await expect(dialog.getByRole('button', { name: '市松模様', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: '単色', exact: true }).click();
  await expect(dialog.getByLabel('背景色', { exact: true })).toHaveValue('#fedcba');
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  if (isMobile) {
    await page.setViewportSize({ width: 320, height: 740 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const backgroundButton = page.getByRole('button', { name: '背景設定', exact: true });
    await backgroundButton.scrollIntoViewIfNeeded();
    const box = (await backgroundButton.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
    await backgroundButton.tap();
    await expect(page.getByRole('dialog', { name: '背景の設定', exact: true })).toBeVisible();
  }
});
