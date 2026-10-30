import { expect, type Page } from '@playwright/test';

export async function holdBrush(page: Page, name: 'ペン' | '消しゴム') {
  const button = page.getByRole('button', { name, exact: true });
  await button.scrollIntoViewIfNeeded();
  const box = (await button.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 0 }] });
  await page.waitForTimeout(600);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.getByRole('dialog', { name: `${name}の太さ`, exact: true })).toBeVisible();
  await session.detach();
}
