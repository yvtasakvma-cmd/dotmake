import { enterLibrary } from './navigation';
import { expect, test, type Page } from '@playwright/test';

async function create(page: Page, name: string, width = 32) {
  await page.getByRole('button', { name: '新規キャラクター', exact: true }).click();
  await page.getByLabel('作品名', { exact: true }).fill(name);
  await page.getByLabel('幅', { exact: true }).fill(String(width));
  await page.getByRole('button', { name: '描き始める', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}
async function back(page: Page) { await page.getByRole('button', { name: 'キャラクター一覧へ戻る', exact: true }).click(); }
async function draw(page: Page, x: number, y: number, color?: string) {
  if (color) await page.getByLabel('自由な色', { exact: true }).fill(color);
  const c = page.locator('canvas'); await c.scrollIntoViewIfNeeded();
  const b = (await c.boundingBox())!;
  await page.mouse.click(b.x + (x + .5) * b.width / Number(await c.getAttribute('width')), b.y + (y + .5) * b.height / Number(await c.getAttribute('height')));
}
async function pixel(page: Page, x: number, y: number) {
  return page.locator('canvas').evaluate((c: HTMLCanvasElement, p) => [...c.getContext('2d')!.getImageData(p.x, p.y, 1, 1).data], { x, y });
}
async function saved(page: Page) { await expect(page.getByText('この端末に保存済み', { exact: true })).toBeVisible(); }
async function ready(page: Page) { await enterLibrary(page); }

test('several characters survive reload and offline editing without crossing saves', async ({ page, context }) => {
  await page.goto('.'); await ready(page);
  await create(page, '剣士', 16); await draw(page, 3, 3, '#ff0000'); await saved(page); await back(page);
  await create(page, '魔法使い', 24); await draw(page, 4, 4, '#0000ff'); await saved(page); await back(page);
  await create(page, '僧侶', 48); await draw(page, 5, 5, '#00ff00'); await saved(page); await back(page);
  await expect(page.locator('.project-list li')).toHaveCount(3);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload(); await ready(page);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true); await page.reload(); await ready(page);
  for (const [name, width, x, rgba] of [
    ['剣士', 16, 3, [255,0,0,255]], ['魔法使い', 24, 4, [0,0,255,255]], ['僧侶', 48, 5, [0,255,0,255]],
  ] as const) {
    await page.getByRole('button', { name: `${name}を開く`, exact: true }).click();
    await expect(page.locator('canvas')).toHaveAttribute('width', String(width));
    expect(await pixel(page, x, x)).toEqual(rgba);
    await back(page);
  }
  await page.getByRole('button', { name: '剣士を開く', exact: true }).click();
  await draw(page, 6, 6, '#ffff00'); await saved(page); await back(page);
  await page.getByRole('button', { name: '魔法使いを開く', exact: true }).click();
  expect(await pixel(page, 6, 6)).toEqual([0,0,0,0]); await back(page);
  await page.reload(); await ready(page);
  await page.getByRole('button', { name: '剣士を開く', exact: true }).click();
  expect(await pixel(page, 6, 6)).toEqual([255,255,0,255]);
  await context.setOffline(false);
});

test('identical names and editor new creation produce separate saved IDs', async ({ page }) => {
  await page.goto('.'); await ready(page); await create(page, '同じ名前');
  await draw(page, 3, 3, '#ff0000'); await saved(page);
  await page.getByRole('button', { name: '新規作成', exact: true }).click();
  await page.getByLabel('作品名', { exact: true }).fill('同じ名前');
  await page.getByRole('button', { name: '16 × 16', exact: true }).click();
  await page.getByRole('button', { name: '作成する', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await draw(page, 3, 3, '#0000ff'); await saved(page); await back(page);
  const rows = page.locator('.project-list li'); await expect(rows).toHaveCount(2);
  const ids = await rows.evaluateAll((items) => items.map((item) => item.getAttribute('data-project-id')));
  expect(new Set(ids).size).toBe(2);
  const results: number[][] = [];
  for (const id of ids) {
    await page.locator(`[data-project-id="${id}"]`).getByRole('button', { name: '同じ名前を開く', exact: true }).click();
    results.push(await pixel(page, 3, 3)); await back(page);
  }
  expect(results).toContainEqual([255,0,0,255]); expect(results).toContainEqual([0,0,255,255]);
});

test('failed saves block project changes and keep unsaved pixels available for PNG', async ({ page }) => {
  await page.goto('.'); await ready(page);
  await create(page, 'A'); await draw(page, 3, 3); await saved(page); await back(page);
  await create(page, 'B'); await saved(page); await back(page);
  await page.getByRole('button', { name: 'Aを開く', exact: true }).click();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value: unknown, key?: IDBValidKey) {
      if (this.name === 'projects') throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, value, key!);
    };
  });
  await draw(page, 7, 7, '#ff0000');
  await expect(page.getByText('自動保存できません。', { exact: false })).toBeVisible();
  await back(page);
  await page.getByRole('button', { name: 'Bを開く', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'キャラクター', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '新規キャラクター', exact: true }).click();
  await page.getByLabel('作品名', { exact: true }).fill('失敗するC');
  await page.getByRole('button', { name: '描き始める', exact: true }).click();
  await expect(page.getByLabel('作品名', { exact: true })).toBeEnabled();
  await back(page); await expect(page.locator('.project-list li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Aを開く', exact: true }).click();
  expect(await pixel(page, 7, 7)).toEqual([255,0,0,255]);
  await page.getByRole('button', { name: 'PNG出力', exact: true }).click();
  await expect(page.getByRole('img', { name: '書き出すPNG' })).toBeVisible();
});

test('new project write failure does not create a phantom entry or lose the previous image', async ({ page }) => {
  await page.goto('.'); await ready(page); await create(page, '保存済み'); await draw(page, 3, 3); await saved(page); await back(page);
  await page.evaluate(() => { IDBObjectStore.prototype.put = () => { throw new DOMException('Full', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: '新規キャラクター', exact: true }).click();
  await page.getByRole('button', { name: '描き始める', exact: true }).click();
  await expect(page.getByText('新しい作品を保存できません。', { exact: false })).toBeVisible();
  await back(page); await expect(page.locator('.project-list li')).toHaveCount(1);
  await page.getByRole('button', { name: '保存済みを開く', exact: true }).click();
  expect(await pixel(page, 3, 3)).toEqual([48,59,50,255]);
});

test('single-slot version 1 data and palette migrate once, remain editable and retain a backup', async ({ page, baseURL }) => {
  await page.goto(new URL('favicon.svg', baseURL).href);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const r = indexedDB.open('pixel-studio', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('documents');
    r.onerror = () => reject(r.error);
    r.onsuccess = () => {
      const db = r.result, tx = db.transaction('documents', 'readwrite'), store = tx.objectStore('documents');
      const pixels = new Uint8ClampedArray(16*16*4); pixels.set([231,121,88,255], (3*16+3)*4);
      store.put({ version: 1, width: 16, height: 16, name: '以前の勇者', kind: 'character', pixels }, 'current');
      store.put(['#ab12cd'], 'palette');
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => reject(tx.error);
    };
  }));
  await page.goto('.'); await ready(page); await expect(page.locator('.project-list li')).toHaveCount(1);
  await page.getByRole('button', { name: '以前の勇者を開く', exact: true }).click();
  expect(await pixel(page, 3, 3)).toEqual([231,121,88,255]);
  await expect(page.getByRole('button', { name: '追加色 #ab12cd', exact: true })).toBeVisible();
  await draw(page, 4, 4); await saved(page); await back(page); await create(page, '新しい仲間'); await back(page);
  await page.reload(); await ready(page); await expect(page.locator('.project-list li')).toHaveCount(2);
  await page.getByRole('button', { name: '以前の勇者を開く', exact: true }).click();
  expect(await pixel(page, 4, 4)).toEqual([48,59,50,255]);
  await back(page); await page.reload(); await ready(page); await expect(page.locator('.project-list li')).toHaveCount(2);
  const backup = await page.evaluate(() => new Promise<number>((resolve) => {
    const r = indexedDB.open('pixel-studio');
    r.onsuccess = () => { const db=r.result, tx=db.transaction('documents'), item=tx.objectStore('documents').get('current'); item.onsuccess=()=>{ resolve(item.result.pixels[(3*16+3)*4]); db.close(); }; };
  }));
  expect(backup).toBe(231);
});

test('no-op strokes return to saved status without inventing a history entry', async ({ page }) => {
  await page.goto('.'); await ready(page); await create(page, '状態確認');
  await page.getByRole('button', { name: '消しゴム', exact: true }).click();
  await draw(page, 3, 3); await saved(page);
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'ペン', exact: true }).click();
  await draw(page, 3, 3); await saved(page);
  await draw(page, 3, 3); await saved(page);
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  await saved(page); expect(await pixel(page, 3, 3)).toEqual([0,0,0,0]);
});

test('undo during a pending transaction persists the final image rather than an older queued stroke', async ({ page }) => {
  await page.goto('.'); await ready(page); await create(page, '保存順序');
  await page.evaluate(() => {
    const control = { hold: true };
    (window as unknown as { saveTestControl: typeof control }).saveTestControl = control;
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value: unknown, key?: IDBValidKey) {
      const result = original.call(this, value, key!);
      if (this.name === 'projects' && control.hold) {
        const keepAlive = () => {
          const request = this.get('keep-transaction-active');
          request.onsuccess = () => { if (control.hold) keepAlive(); };
        };
        keepAlive();
      }
      return result;
    };
  });
  await draw(page, 3, 3);
  await expect(page.getByText('保存中…', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  expect(await pixel(page, 3, 3)).toEqual([0,0,0,0]);
  await page.evaluate(() => { (window as unknown as { saveTestControl: { hold: boolean } }).saveTestControl.hold = false; });
  await saved(page); await page.reload(); await ready(page);
  await page.getByRole('button', { name: '保存順序を開く', exact: true }).click();
  expect(await pixel(page, 3, 3)).toEqual([0,0,0,0]);
});
