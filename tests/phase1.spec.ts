import { enterEditor } from './navigation';
import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function point(page: Page, x: number, y: number) {
  const canvas = page.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const width = Number(await canvas.getAttribute('width'));
  const height = Number(await canvas.getAttribute('height'));
  return { x: box.x + (x + .5) * box.width / width, y: box.y + (y + .5) * box.height / height };
}
async function tap(page: Page, x: number, y: number) {
  const p = await point(page, x, y);
  await page.mouse.click(p.x, p.y);
}
async function rgba(page: Page, x: number, y: number) {
  return page.locator('canvas').evaluate((c: HTMLCanvasElement, p) => Array.from(c.getContext('2d')!.getImageData(p.x, p.y, 1, 1).data), { x, y });
}
async function create(page: Page, width: number, height: number) {
  await page.getByRole('button', { name: '新規作成', exact: true }).click();
  await page.getByLabel('幅', { exact: true }).fill(String(width));
  await page.getByLabel('高さ', { exact: true }).fill(String(height));
  await page.getByRole('button', { name: '作成して置き換える' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveAttribute('width', String(width));
  await expect(page.locator('canvas')).toHaveAttribute('height', String(height));
}
test.beforeEach(async ({ page }) => {
  await page.goto('.');
  await enterEditor(page);
  await expect(page.getByRole('button', { name: '新規作成', exact: true })).toBeEnabled();
});

test('creates preset and rectangular canvases, validates sizes, and allows cancellation', async ({ page }) => {
  await tap(page, 4, 4);
  await page.getByRole('button', { name: '新規作成', exact: true }).click();
  await page.getByRole('button', { name: 'キャンセル' }).click();
  expect(await rgba(page, 4, 4)).toEqual([48, 59, 50, 255]);
  await page.getByRole('button', { name: '新規作成', exact: true }).click();
  await page.getByRole('button', { name: '48 × 48', exact: true }).click();
  await page.getByRole('button', { name: '作成して置き換える' }).click();
  await expect(page.locator('canvas')).toHaveAttribute('width', '48');
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '新規作成', exact: true }).click();
  await page.getByLabel('幅', { exact: true }).fill('0');
  await page.getByRole('button', { name: '作成して置き換える' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('幅', { exact: true }).fill('24');
  await page.getByLabel('高さ', { exact: true }).fill('16');
  await page.getByRole('button', { name: '作成して置き換える' }).click();
  await expect(page.locator('canvas')).toHaveAttribute('width', '24');
  await expect(page.locator('canvas')).toHaveAttribute('height', '16');
  expect(await rgba(page, 23, 15)).toEqual([0, 0, 0, 0]);
});

test('fills a bounded region, undoes the fill, and picks opaque and transparent colours', async ({ page }) => {
  const from = await point(page, 16, 0), to = await point(page, 16, 31);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x, to.y); await page.mouse.up();
  await page.getByLabel('自由な色', { exact: true }).fill('#ff007f');
  await page.getByRole('button', { name: '塗りつぶし', exact: false }).click();
  await tap(page, 2, 2);
  expect(await rgba(page, 15, 31)).toEqual([255, 0, 127, 255]);
  expect(await rgba(page, 17, 31)).toEqual([0, 0, 0, 0]);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  expect(await rgba(page, 15, 31)).toEqual([0, 0, 0, 0]);
  await page.getByRole('button', { name: 'やり直す', exact: true }).click();
  await page.getByLabel('自由な色', { exact: true }).fill('#83b5c5');
  await page.getByRole('button', { name: 'スポイト', exact: false }).click();
  await tap(page, 1, 1);
  await expect(page.getByLabel('自由な色', { exact: true })).toHaveValue('#ff007f');
  await page.getByRole('button', { name: 'スポイト', exact: false }).click();
  await tap(page, 20, 20);
  await expect(page.getByRole('button', { name: '消しゴム', exact: false })).toHaveAttribute('aria-pressed', 'true');
});

test('restores completed strokes and rectangular dimensions from IndexedDB', async ({ page }) => {
  await create(page, 24, 16);
  await tap(page, 23, 15);
  await expect(page.getByText('この端末に保存済み', { exact: true })).toBeVisible();
  await page.reload();
  await enterEditor(page);
  await expect(page.getByRole('button', { name: '新規作成', exact: true })).toBeEnabled();
  await expect(page.locator('canvas')).toHaveAttribute('width', '24');
  await expect(page.locator('canvas')).toHaveAttribute('height', '16');
  expect(await rgba(page, 23, 15)).toEqual([48, 59, 50, 255]);
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeDisabled();
});

test('exports an actual transparent PNG with exact dimensions and RGBA values', async ({ page }) => {
  await create(page, 24, 16);
  await page.getByRole('button', { name: 'コーラル #e77958' }).click();
  await tap(page, 23, 15);
  await page.getByRole('button', { name: '拡大', exact: true }).click();
  await page.getByRole('button', { name: 'PNG出力', exact: true }).click();
  const img = page.getByRole('img', { name: '書き出すPNG' });
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  const result = await img.evaluate((image: HTMLImageElement) => {
    const c = document.createElement('canvas'); c.width = image.naturalWidth; c.height = image.naturalHeight;
    const ctx = c.getContext('2d')!; ctx.drawImage(image, 0, 0);
    return { width: c.width, height: c.height, empty: [...ctx.getImageData(0, 0, 1, 1).data], ink: [...ctx.getImageData(23, 15, 1, 1).data] };
  });
  expect(result).toEqual({ width: 24, height: 16, empty: [0, 0, 0, 0], ink: [231, 121, 88, 255] });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'PNGを保存', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('pixel-studio-24x16.png');
  const bytes = await readFile((await download.path())!);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([24, 16]);
});

test('zoom and pan change only the view and keep pointer coordinates accurate', async ({ page, isMobile }) => {
  await tap(page, 16, 16);
  const before = await page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.getByRole('button', { name: '拡大', exact: true }).click();
  await expect(page.getByLabel('拡大率')).toHaveText('2倍');
  await page.getByRole('button', { name: '表示を移動', exact: false }).click();
  const viewport = page.getByLabel('キャンバス表示領域', { exact: true });
  await viewport.scrollIntoViewIfNeeded();
  const beforeScroll = await viewport.evaluate((e) => [e.scrollLeft, e.scrollTop]);
  const box = (await viewport.boundingBox())!;
  if (isMobile) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2, id: 0 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width / 2 - 40, y: box.y + box.height / 2 - 30, id: 0 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2 - 30); await page.mouse.up();
  }
  const afterScroll = await viewport.evaluate((e) => [e.scrollLeft, e.scrollTop]);
  expect(afterScroll[0]).toBeGreaterThan(beforeScroll[0]);
  expect(afterScroll[1]).toBeGreaterThan(beforeScroll[1]);
  expect(await page.locator('canvas').evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(before);
  await page.getByRole('button', { name: 'ペン', exact: false }).click();
  await viewport.scrollIntoViewIfNeeded();
  // Pick a visible pixel after zoom and pan; do not scroll the canvas itself.
  const hit = await page.locator('canvas').evaluate((c: HTMLCanvasElement) => {
    const r = c.getBoundingClientRect(), v = c.closest('.canvas-viewport')!.getBoundingClientRect();
    const x = Math.floor((v.left + v.width / 2 - r.left) / r.width * c.width);
    const y = Math.floor((v.top + v.height / 2 - r.top) / r.height * c.height);
    return { x, y, clientX: r.left + (x + .5) * r.width / c.width, clientY: r.top + (y + .5) * r.height / c.height };
  });
  await page.mouse.click(hit.clientX, hit.clientY);
  expect(await rgba(page, hit.x, hit.y)).toEqual([48, 59, 50, 255]);
  await page.getByRole('button', { name: '全体表示', exact: true }).click();
  await expect(page.getByLabel('拡大率')).toHaveText('1倍');
});

test('PWA manifest is scoped correctly and a cached app restores and draws offline', async ({ page, context, baseURL }) => {
  await tap(page, 7, 7);
  await expect(page.getByText('この端末に保存済み', { exact: true })).toBeVisible();
  const manifestURL = await page.locator('link[rel="manifest"]').evaluate((e: HTMLLinkElement) => e.href);
  const manifest = await (await page.request.get(manifestURL)).json();
  const root = new URL(baseURL!).pathname;
  expect(manifest.start_url).toBe(root);
  expect(manifest.scope).toBe(root);
  expect(manifest.display).toBe('standalone');
  for (const icon of manifest.icons) {
    const response = await page.request.get(new URL(icon.src, manifestURL).href);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('image/png');
  }
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await enterEditor(page);
  await expect(page.getByRole('button', { name: '新規作成', exact: true })).toBeEnabled();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await enterEditor(page);
  await expect(page.getByRole('button', { name: '新規作成', exact: true })).toBeEnabled();
  expect(await rgba(page, 7, 7)).toEqual([48, 59, 50, 255]);
  await tap(page, 8, 8);
  expect(await rgba(page, 8, 8)).toEqual([48, 59, 50, 255]);
  await expect(page.getByText('この端末に保存済み', { exact: true })).toBeVisible();
  await context.setOffline(false);
});

test('a corrupt saved project is not silently replaced by a blank document', async ({ page }) => {
  await expect(page.getByText('この端末に保存済み', { exact: true })).toBeVisible();
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('pixel-studio', 1);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('documents', 'readwrite');
        tx.objectStore('documents').put({ version: 99 }, 'current');
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.reload();
  await expect(page.getByText('保存データを読めません。', { exact: false })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  const savedVersion = await page.evaluate(async () => new Promise<number>((resolve) => {
    const r = indexedDB.open('pixel-studio', 1);
    r.onsuccess = () => {
      const db = r.result, tx = db.transaction('documents'); const item = tx.objectStore('documents').get('current');
      item.onsuccess = () => { resolve(item.result.version); db.close(); };
    };
  }));
  expect(savedVersion).toBe(99);
});

test('reports storage write failures while keeping PNG export available', async ({ page }) => {
  await expect(page.getByText('この端末に保存済み', { exact: true })).toBeVisible();
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = () => { throw new DOMException('Storage is full', 'QuotaExceededError'); };
  });
  await tap(page, 3, 3);
  await expect(page.getByText('自動保存できません。PNGで保存してください。', { exact: true })).toBeVisible();
  expect(await rgba(page, 3, 3)).toEqual([48, 59, 50, 255]);
  await page.getByRole('button', { name: 'PNG出力', exact: true }).click();
  await expect(page.getByRole('img', { name: '書き出すPNG' })).toBeVisible();
});
