import { expect, test, type Page } from '@playwright/test';
import { enterEditor, enterLibrary } from './navigation';

const originalName = '新しいキャラクター';
async function draw(page: Page, x: number, y: number) {
  const c = page.locator('canvas'); await c.scrollIntoViewIfNeeded();
  const box = (await c.boundingBox())!;
  await page.mouse.click(box.x + (x + .5) * box.width / 32, box.y + (y + .5) * box.height / 32);
  await expect(page.getByText('この端末に保存済み', { exact: true })).toBeVisible();
}
const pixel = (page: Page, x: number, y: number) => page.locator('canvas').evaluate((c: HTMLCanvasElement, point) => [...c.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data], { x, y });
const back = (page: Page) => page.getByRole('button', { name: 'キャラクター一覧へ戻る', exact: true }).click();
async function openRename(page: Page, name: string) {
  await page.getByRole('button', { name: `${name}の名前を変更`, exact: true }).click();
  return page.getByRole('dialog', { name: 'キャラクターの名前を変更', exact: true });
}
async function stored(page: Page) {
  return page.evaluate(() => new Promise<{ id: string; name: string; width: number; height: number; frameIndex: number; frames: string[]; pixels: string }[]>((resolve, reject) => {
    const request = indexedDB.open('pixel-studio', 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result; const tx = db.transaction('projects'); const all = tx.objectStore('projects').getAll();
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => {
        const base64 = (bytes: Uint8ClampedArray) => btoa(String.fromCharCode(...bytes));
        resolve(all.result.map((p) => ({ id: p.id, name: p.name, width: p.width, height: p.height, frameIndex: p.frameIndex, frames: p.frames.map(base64), pixels: base64(p.pixels) })));
        db.close();
      };
    };
  }));
}
test.beforeEach(async ({ page }) => { await page.goto('.'); await enterEditor(page); });

test('renames the active character without changing its ID or twelve frames and keeps the name across drawing history and reload', async ({ page }) => {
  await page.getByLabel('自由な色', { exact: true }).fill('#ff0000');
  await page.getByRole('slider', { name: '不透明度', exact: true }).fill('50');
  await draw(page, 4, 4);
  await page.getByRole('button', { name: '次のポーズ', exact: true }).click();
  await page.getByLabel('自由な色', { exact: true }).fill('#0000ff');
  await page.getByRole('slider', { name: '不透明度', exact: true }).fill('75');
  await draw(page, 5, 5);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await expect(page.getByText('この端末に保存済み', { exact: true })).toBeVisible();
  const before = (await stored(page))[0];
  await back(page);
  const dialog = await openRename(page, originalName);
  await expect(dialog.getByLabel('キャラクター名', { exact: true })).toHaveValue(originalName);
  await dialog.getByLabel('キャラクター名', { exact: true }).fill('  主人公・アルファ  ');
  await dialog.getByRole('button', { name: '変更を保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '主人公・アルファ', exact: true })).toBeVisible();
  expect((await stored(page))[0]).toEqual({ ...before, name: '主人公・アルファ' });
  await page.getByRole('button', { name: '主人公・アルファを開く', exact: true }).click();
  await expect(page.getByRole('button', { name: 'やり直す', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  expect(await pixel(page, 5, 5)).toEqual([0, 0, 255, 191]);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  expect(await pixel(page, 4, 4)).toEqual([0, 0, 0, 0]);
  await expect(page.getByRole('heading', { name: '主人公・アルファ', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  await page.getByRole('button', { name: '前のポーズ', exact: true }).click();
  expect(await pixel(page, 4, 4)).toEqual([255, 0, 0, 128]);
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  await expect(page.getByText('この端末に保存済み', { exact: true })).toBeVisible();
  await page.reload(); await enterLibrary(page);
  await expect(page.locator('.project-list li')).toHaveCount(1);
  expect(await page.locator('.project-list li').getAttribute('data-project-id')).toBe(before.id);
  await page.getByRole('button', { name: '主人公・アルファを開く', exact: true }).click();
  expect(await pixel(page, 5, 5)).toEqual([0, 0, 255, 191]);
  await page.getByRole('button', { name: '前のポーズ', exact: true }).click();
  expect(await pixel(page, 4, 4)).toEqual([255, 0, 0, 128]);
});

test('cancels, rejects blank names, and renames an inactive character to a duplicate name without changing the other work', async ({ page, isMobile }, testInfo) => {
  await back(page);
  const original = (await stored(page))[0];
  let dialog = await openRename(page, originalName);
  await dialog.getByLabel('キャラクター名', { exact: true }).fill('キャンセルする名前');
  await dialog.getByRole('button', { name: 'キャンセル', exact: true }).click();
  expect((await stored(page))[0]).toEqual(original);
  await page.getByRole('button', { name: '新規キャラクター', exact: true }).click();
  await page.getByLabel('作品名', { exact: true }).fill('別のキャラ');
  await page.getByRole('button', { name: '描き始める', exact: true }).click();
  await draw(page, 3, 3); await back(page);
  const other = (await stored(page)).find((p) => p.id !== original.id)!;
  dialog = await openRename(page, originalName);
  await expect(dialog.getByLabel('キャラクター名', { exact: true })).toHaveAttribute('maxlength', '40');
  await dialog.getByLabel('キャラクター名', { exact: true }).fill('   ');
  await dialog.getByRole('button', { name: '変更を保存', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('1〜40文字');
  await dialog.getByLabel('キャラクター名', { exact: true }).fill('別のキャラ');
  await dialog.getByRole('button', { name: '変更を保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await stored(page)).find((p) => p.id === other.id)).toEqual(other);
  await expect(page.locator('.project-list li')).toHaveCount(2);
  await expect(page.locator('.project-list h3').filter({ hasText: '別のキャラ' })).toHaveCount(2);
  if (isMobile) await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.project-list').screenshot({ path: testInfo.outputPath('rename-actions.png') });
  await page.getByRole('button', { name: '保存した作品を続ける', exact: true }).click();
  expect(await pixel(page, 3, 3)).toEqual([0, 0, 0, 255]);
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeEnabled();
});

test('retains the original name and images after a failed write and can retry', async ({ page }) => {
  await draw(page, 4, 4); await back(page);
  const before = (await stored(page))[0];
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value: unknown, key?: IDBValidKey) {
      if (this.name === 'projects' && (value as { name?: string }).name === '失敗する名前') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, value, key!);
    };
  });
  const dialog = await openRename(page, originalName);
  await dialog.getByLabel('キャラクター名', { exact: true }).fill('失敗する名前');
  await dialog.getByRole('button', { name: '変更を保存', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('元の名前と作品は保持');
  expect((await stored(page))[0]).toEqual(before);
  await dialog.getByLabel('キャラクター名', { exact: true }).fill('再試行した名前');
  await dialog.getByRole('button', { name: '変更を保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect((await stored(page))[0]).toEqual({ ...before, name: '再試行した名前' });
  await page.reload(); await enterLibrary(page);
  await page.getByRole('button', { name: '再試行した名前を開く', exact: true }).click();
  expect(await pixel(page, 4, 4)).toEqual([0, 0, 0, 255]);
});

test('waits for a pending artwork save before renaming, so a late write cannot restore the old name', async ({ page }) => {
  await page.evaluate(() => {
    const control = { hold: true };
    (window as unknown as { renameSaveControl: typeof control }).renameSaveControl = control;
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value: unknown, key?: IDBValidKey) {
      const request = original.call(this, value, key!);
      if (this.name === 'projects' && control.hold) {
        const keepAlive = () => {
          const read = this.get('keep-transaction-active');
          read.onsuccess = () => { if (control.hold) keepAlive(); };
        };
        keepAlive();
      }
      return request;
    };
  });
  const canvas = page.locator('canvas'); await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + 4.5 * box.width / 32, box.y + 4.5 * box.height / 32);
  await expect(page.getByText('保存中…', { exact: true })).toBeVisible();
  await back(page);
  const dialog = await openRename(page, originalName);
  await dialog.getByLabel('キャラクター名', { exact: true }).fill('保存待ち後の名前');
  await dialog.getByRole('button', { name: '変更を保存', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '保存中…', exact: true })).toBeDisabled();
  await page.evaluate(() => { (window as unknown as { renameSaveControl: { hold: boolean } }).renameSaveControl.hold = false; });
  await expect(dialog).toHaveCount(0);
  await page.reload(); await enterLibrary(page);
  await expect(page.locator('.project-list li')).toHaveCount(1);
  await page.getByRole('button', { name: '保存待ち後の名前を開く', exact: true }).click();
  expect(await pixel(page, 4, 4)).toEqual([0, 0, 0, 255]);
});
