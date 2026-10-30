import { expect, type Page } from '@playwright/test';

export async function enterEditor(page: Page) {
  await expect(page.getByRole('button', { name: 'キャラクターを作る', exact: false })).toBeEnabled();
  const resume = page.getByRole('button', { name: '保存した作品を続ける', exact: true });
  if (await resume.count()) await resume.click();
  else {
    await page.getByRole('button', { name: 'キャラクターを作る', exact: false }).click();
    await page.getByRole('button', { name: '描き始める', exact: true }).click();
  }
  await expect(page.locator('canvas')).toBeVisible();
}
