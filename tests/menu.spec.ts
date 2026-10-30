import { expect, test, type Page } from '@playwright/test';

async function menu(page: Page) {
  await expect(page.getByRole('heading', { name: '何を作りますか？' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'キャラクターを作る', exact: false })).toBeEnabled();
}
async function start(page: Page) {
  await page.getByRole('button', { name: 'キャラクターを作る', exact: false }).click();
}
async function pixel(page: Page, x: number, y: number) {
  return page.locator('canvas').evaluate((c: HTMLCanvasElement, p) => [...c.getContext('2d')!.getImageData(p.x, p.y, 1, 1).data], { x, y });
}
async function draw(page: Page) {
  const c = page.locator('canvas'); await c.scrollIntoViewIfNeeded();
  const r = (await c.boundingBox())!;
  const w = Number(await c.getAttribute('width')), h = Number(await c.getAttribute('height'));
  await page.mouse.click(r.x + r.width * 4.5 / w, r.y + r.height * 4.5 / h);
  await expect(page.getByText('この端末に保存済み', { exact: true })).toBeVisible();
}

test('first menu has one available category and does not autosave a blank image', async ({ page }) => {
  await page.goto('.'); await menu(page);
  await expect(page.getByRole('button', { name: '敵キャラを作る', exact: false })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'マップチップセットを作る', exact: false })).toBeDisabled();
  await expect(page.getByRole('button', { name: '保存した作品を続ける' })).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  const exists = await page.evaluate(() => new Promise<boolean>((resolve) => {
    const r = indexedDB.open('pixel-studio', 1);
    r.onsuccess = () => { const db = r.result, tx = db.transaction('documents'); const q = tx.objectStore('documents').get('current'); q.onsuccess = () => { resolve(q.result !== undefined); db.close(); }; };
  }));
  expect(exists).toBe(false);
  await start(page);
  await expect(page.getByLabel('作品名', { exact: true })).toHaveValue('新しいキャラクター');
  await expect(page.getByLabel('幅', { exact: true })).toHaveValue('32');
  await page.getByRole('button', { name: 'メニューへ戻る' }).click();
  await menu(page);
  await expect(page.getByRole('button', { name: '保存した作品を続ける' })).toHaveCount(0);
});

test('named character creation, menu resume and reload preserve image and metadata', async ({ page }) => {
  await page.goto('.'); await menu(page); await start(page);
  await page.getByLabel('作品名', { exact: true }).fill('旅人');
  await page.getByRole('button', { name: '48 × 48', exact: true }).click();
  await page.getByRole('button', { name: '描き始める' }).click();
  await expect(page.getByRole('heading', { name: '旅人', exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toHaveAttribute('width', '48');
  await expect(page.locator('[data-guide="center-vertical"]')).toHaveAttribute('d', 'M24 0V48');
  await draw(page);
  await page.getByRole('button', { name: 'メニューへ戻る' }).click();
  await menu(page);
  await page.getByRole('button', { name: '保存した作品を続ける' }).click();
  expect(await pixel(page, 4, 4)).toEqual([48, 59, 50, 255]);
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeEnabled();
  await page.reload(); await menu(page);
  await expect(page.getByText('旅人', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '保存した作品を続ける' }).click();
  await expect(page.getByRole('heading', { name: '旅人', exact: true })).toBeVisible();
  expect(await pixel(page, 4, 4)).toEqual([48, 59, 50, 255]);
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeDisabled();
});

test('replacement needs confirmation and cancelling keeps the previous character', async ({ page }) => {
  await page.goto('.'); await menu(page); await start(page);
  await page.getByRole('button', { name: '描き始める' }).click(); await draw(page);
  await page.getByRole('button', { name: 'メニューへ戻る' }).click();
  await start(page);
  await page.getByLabel('作品名', { exact: true }).fill('魔法使い');
  await page.getByLabel('幅', { exact: true }).fill('0');
  await page.getByRole('button', { name: '描き始める' }).click();
  await expect(page.getByLabel('作品名', { exact: true })).toBeVisible();
  await page.getByLabel('幅', { exact: true }).fill('24');
  await page.getByLabel('高さ', { exact: true }).fill('48');
  await page.getByRole('button', { name: '描き始める' }).click();
  await expect(page.getByRole('checkbox', { name: '現在の作品を置き換える' })).not.toBeChecked();
  await page.getByRole('button', { name: 'メニューへ戻る' }).click();
  await page.getByRole('button', { name: '保存した作品を続ける' }).click();
  expect(await pixel(page, 4, 4)).toEqual([48, 59, 50, 255]);
  await page.getByRole('button', { name: 'メニューへ戻る' }).click(); await start(page);
  await page.getByLabel('作品名', { exact: true }).fill('魔法使い');
  await page.getByLabel('幅', { exact: true }).fill('24');
  await page.getByLabel('高さ', { exact: true }).fill('48');
  await page.getByRole('checkbox', { name: '現在の作品を置き換える' }).check();
  await page.getByRole('button', { name: '描き始める' }).click();
  await expect(page.locator('canvas')).toHaveAttribute('width', '24');
  await expect(page.getByRole('heading', { name: '魔法使い', exact: true })).toBeVisible();
  expect(await pixel(page, 4, 4)).toEqual([0, 0, 0, 0]);
});

test('legacy pixels without character metadata remain accessible', async ({ page }) => {
  await page.goto('.'); await menu(page);
  await page.evaluate(() => new Promise<void>((resolve) => {
    const request = indexedDB.open('pixel-studio', 1);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('documents', 'readwrite');
      const pixels = new Uint8ClampedArray(24 * 16 * 4); pixels.set([231,121,88,255], (4 * 24 + 4) * 4);
      tx.objectStore('documents').put({ version: 1, width: 24, height: 16, pixels }, 'current');
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  }));
  await page.reload(); await menu(page);
  await page.getByRole('button', { name: '保存した作品を続ける' }).click();
  await expect(page.locator('canvas')).toHaveAttribute('width', '24');
  await expect(page.locator('canvas')).toHaveAttribute('height', '16');
  await expect(page.getByRole('heading', { name: '保存した作品', exact: true })).toBeVisible();
  expect(await pixel(page, 4, 4)).toEqual([231,121,88,255]);
  await expect(page.locator('[data-guide^="center-"]')).toHaveCount(0);
});
