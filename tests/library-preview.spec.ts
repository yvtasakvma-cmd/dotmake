import { expect, test, type Locator, type Page } from '@playwright/test';
import { enterLibrary } from './navigation';

async function prepare(page: Page, count = 1, emptyLast = false) {
  await page.goto('.'); await enterLibrary(page);
  await page.evaluate(async ({ count, emptyLast }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('pixel-studio', 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result; const tx = db.transaction('projects', 'readwrite');
      for (let i = 0; i < count; i++) {
        const frames = Array.from({ length: 12 }, () => new Uint8ClampedArray(32 * 32 * 4));
        if (!(emptyLast && i === count - 1)) {
          frames[0].set([255, 0, 0, 255], 0);
          frames[1].set([0, 255, 0, 128], 4);
          frames[2].set([0, 0, 255, 255], 8);
        }
        frames[10].set([255, 255, 0, 255], 0);
        tx.objectStore('projects').put({ id: `preview-${i}`, name: `キャラ${i + 1}`, version: 2, kind: 'character', width: 32, height: 32, frameIndex: 10, frames, pixels: frames[10], updatedAt: Date.now() + count - i });
      }
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), { count, emptyLast });
  await page.reload(); await enterLibrary(page);
}
async function imagePixels(image: Locator, points = [[0, 0], [1, 0], [2, 0]]) {
  return image.evaluate((img: HTMLImageElement, points) => {
    if (!img.complete || !img.naturalWidth) return null;
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0);
    return points.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
  }, points);
}
async function expectPose(image: Locator, pose: number) {
  const colours = [[255, 0, 0, 255], [0, 255, 0, 128], [0, 0, 255, 255]];
  await expect.poll(() => imagePixels(image)).toEqual(colours.map((colour, i) => i === pose ? colour : [0, 0, 0, 0]));
}
async function signature(page: Page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('pixel-studio', 2);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result; const tx = db.transaction('projects'); const get = tx.objectStore('projects').get('preview-0');
      tx.oncomplete = () => {
        const p = get.result;
        resolve({ ...p, pixels: Array.from(p.pixels), frames: p.frames.map((frame: Uint8ClampedArray) => btoa(String.fromCharCode(...frame))) });
        db.close();
      };
      tx.onerror = () => reject(tx.error);
    };
  }));
}

test('animates the front row in the card even when the last edited frame is the back, without changing saved artwork', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-31T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-31T00:00:01Z'));
  await prepare(page);
  const card = page.locator('[data-project-id="preview-0"]');
  const image = card.getByRole('img', { name: 'キャラ1の正面歩行プレビュー', exact: true });
  await expect(image).toBeVisible();
  const before = await signature(page);
  await expectPose(image, 1);
  for (const pose of [0, 1, 2, 1]) { await page.clock.runFor(167); await expectPose(image, pose); }
  expect(await signature(page)).toEqual(before);
  await card.getByRole('button', { name: 'キャラ1を開く', exact: true }).click();
  await expect(page.getByLabel('編集中のコマ')).toHaveText('後ろ・直立');
  expect(await page.locator('canvas').evaluate((c: HTMLCanvasElement) => [...c.getContext('2d')!.getImageData(0, 0, 1, 1).data])).toEqual([255, 255, 0, 255]);
});

test('loads visible cards lazily and pauses animation outside the viewport and while the page is hidden', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-31T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-10-31T00:00:01Z'));
  await prepare(page, 8);
  const first = page.locator('[data-project-id="preview-0"] .character-preview img');
  const lastCard = page.locator('[data-project-id="preview-7"]');
  await expectPose(first, 1);
  await expect(lastCard.locator('img')).toHaveCount(0);
  await lastCard.scrollIntoViewIfNeeded();
  const last = lastCard.locator('img'); await expectPose(last, 1);
  const firstSource = await first.getAttribute('src');
  await page.clock.runFor(167); await expectPose(last, 0);
  await expect(first).toHaveAttribute('src', firstSource!);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => page.evaluate(() => document.hidden)).toBe(true);
  await page.clock.runFor(167); await expectPose(last, 0);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => page.evaluate(() => document.hidden)).toBe(false);
  await page.clock.runFor(167); await expectPose(last, 1);
});

test('refreshes saved front frames, shows empty fronts honestly, and keeps the thumbnail clear of names and buttons on small screens', async ({ page, isMobile }, testInfo) => {
  await prepare(page, 2, true);
  const card = page.locator('[data-project-id="preview-0"]');
  await expect(card.locator('.character-preview img')).toBeVisible();
  const empty = page.locator('[data-project-id="preview-1"]');
  await empty.scrollIntoViewIfNeeded();
  await expect(empty.locator('.character-preview')).toContainText('未描画');
  await expect(empty.locator('img')).toHaveCount(0);
  await card.getByRole('button', { name: 'キャラ1を開く', exact: true }).click();
  for (const pose of ['左足', '直立', '右足']) {
    await page.locator('.frame-navigation summary').click();
    await page.getByRole('button', { name: `正面・${pose}を編集`, exact: true }).click();
    const canvas = page.locator('canvas'); await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + 8.5 * box.width / 32, box.y + 8.5 * box.height / 32);
  }
  await expect(page.getByText('この端末に保存済み', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'キャラクター一覧へ戻る', exact: true }).click();
  const image = card.locator('.character-preview img');
  await expect.poll(() => imagePixels(image, [[8, 8]])).toEqual([[0, 0, 0, 255]]);
  await card.getByRole('button', { name: 'キャラ1の名前を変更', exact: true }).click();
  await page.getByLabel('キャラクター名', { exact: true }).fill('村人'.repeat(20));
  await page.getByRole('button', { name: '変更を保存', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  if (isMobile) await page.setViewportSize({ width: 320, height: 740 });
  await card.scrollIntoViewIfNeeded();
  const thumbnail = (await card.locator('.character-preview').boundingBox())!;
  const details = (await card.locator('.project-card-header > div').boundingBox())!;
  const actions = (await card.locator('.project-actions').boundingBox())!;
  const bounds = (await card.boundingBox())!;
  expect(thumbnail.x).toBeGreaterThanOrEqual(details.x + details.width);
  expect(thumbnail.x + thumbnail.width).toBeLessThanOrEqual(bounds.x + bounds.width);
  expect(actions.y).toBeGreaterThanOrEqual(thumbnail.y + thumbnail.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await card.screenshot({ path: testInfo.outputPath('library-walk-preview.png') });
});
