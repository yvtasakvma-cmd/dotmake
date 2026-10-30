import { expect, type Page } from '@playwright/test';

export async function enterLibrary(page: Page) {
  const menu = page.getByRole('heading', { name: '何を作りますか？', exact: true });
  await expect(menu.or(page.getByRole('heading', { name: 'キャラクター', exact: true }))).toBeVisible();
  if (await menu.count()) await page.getByRole('button', { name: 'キャラクターを作る', exact: false }).click();
  await expect(page.getByRole('heading', { name: 'キャラクター', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '新規キャラクター', exact: true })).toBeEnabled();
}
export async function enterEditor(page: Page) {
  await enterLibrary(page);
  const resume = page.getByRole('button', { name: '保存した作品を続ける', exact: true });
  if (await resume.count()) await resume.click();
  else {
    await page.getByRole('button', { name: '新規キャラクター', exact: true }).click();
    await page.getByRole('button', { name: '描き始める', exact: true }).click();
  }
  await expect(page.locator('canvas')).toBeVisible();
}
