import { expect, test } from '@playwright/test';
import { enterEditor } from './navigation';

test('keeps quick tools beside the canvas and changes each brush size with the vertical slider', async ({ page, isMobile }) => {
  await page.goto('.'); await enterEditor(page);
  await expect(page.locator('.tool-panel .brush-controls')).toHaveCount(0);
  for (const name of ['ペン', 'スポイト', '消しゴム']) {
    await expect(page.locator('.tool-panel').getByRole('button', { name, exact: true })).toHaveCount(0);
  }
  const pen = page.getByRole('slider', { name: 'ペンの太さ', exact: true });
  await pen.scrollIntoViewIfNeeded();
  const sliderBox = (await pen.boundingBox())!;
  const viewport = (await page.getByLabel('キャンバス表示領域', { exact: true }).boundingBox())!;
  const quick = page.getByRole('group', { name: 'キャンバス横のツール', exact: true });
  const tools = await quick.getByRole('button').evaluateAll(buttons => buttons.map(button => ({ label: button.getAttribute('aria-label'), x: button.getBoundingClientRect().x, y: button.getBoundingClientRect().y })));
  expect(tools.map(tool => tool.label)).toEqual(['ペン', 'スポイト', '消しゴム']);
  expect(sliderBox.x + sliderBox.width).toBeLessThanOrEqual(viewport.x);
  for (let i = 0; i < tools.length; i++) {
    expect(tools[i].x).toBeGreaterThanOrEqual(viewport.x + viewport.width);
    if (i) expect(tools[i].y).toBeGreaterThan(tools[i - 1].y);
  }
  const point = { x: sliderBox.x + sliderBox.width / 2, y: sliderBox.y + sliderBox.height * .2 };
  if (isMobile) await page.touchscreen.tap(point.x, point.y); else await page.mouse.click(point.x, point.y);
  const penSize = Number(await pen.inputValue());
  expect(penSize).toBeGreaterThan(20);
  await quick.getByRole('button', { name: '消しゴム', exact: true }).click();
  const eraser = page.getByRole('slider', { name: '消しゴムの太さ', exact: true });
  await expect(eraser).toHaveValue('1');
  await eraser.fill('3');
  await quick.getByRole('button', { name: 'ペン', exact: true }).click();
  await expect(pen).toHaveValue(String(penSize));
  await quick.getByRole('button', { name: 'スポイト', exact: true }).click();
  await expect(pen).toBeDisabled();
  await quick.getByRole('button', { name: '消しゴム', exact: true }).click();
  await expect(eraser).toHaveValue('3');
  await expect(eraser).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
