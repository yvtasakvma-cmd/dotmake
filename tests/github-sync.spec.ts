import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { enterEditor, enterLibrary } from './navigation';

const fakeToken = 'github_pat_fake_browser_test_token';
function gitHubServer() {
  const state = { text: null as string | null, revision: 0, commits: 0, requests: 0, status: 0, private: true, hold: false, waiting: false, conflictOnce: false, networkDown: false };
  const sha = () => state.revision.toString(16).padStart(40, '0');
  const install = async (context: BrowserContext) => context.route('https://api.github.com/**', async (route) => {
    const request = route.request();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,PUT,OPTIONS' };
    const reply = (value: unknown, status = 200) => route.fulfill({ status, headers, json: value });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    state.requests++;
    expect(request.headers().authorization).toBe(`Bearer ${fakeToken}`);
    if (state.networkDown) return route.abort('internetdisconnected');
    if (state.status) return reply({}, state.status);
    if (request.url().endsWith('/repos/test-owner/artwork')) return reply({ private: state.private, default_branch: 'main', permissions: { push: true } });
    if (request.method() === 'GET') {
      if (state.text === null) return reply({}, 404);
      return reply({ type: 'file', sha: sha(), size: Buffer.byteLength(state.text), encoding: 'base64', content: Buffer.from(state.text).toString('base64') });
    }
    if (request.method() === 'PUT') {
      state.waiting = true;
      while (state.hold) await new Promise(resolve => setTimeout(resolve, 20));
      if (state.conflictOnce) { state.conflictOnce = false; return reply({}, 409); }
      const body = request.postDataJSON() as { sha?: string; content: string };
      if (state.text !== null && body.sha !== sha()) return reply({}, 409);
      state.text = Buffer.from(body.content, 'base64').toString('utf8');
      expect(state.text).not.toContain(fakeToken);
      state.revision++; state.commits++;
      return reply({ content: { sha: sha() } }, 201);
    }
    return reply({}, 404);
  });
  return { state, install };
}
async function connect(page: Page, remember = false) {
  await page.getByRole('button', { name: 'GitHub保存の設定', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'GitHub保存の設定' });
  await dialog.getByLabel('保存先（所有者/リポジトリ）', { exact: true }).fill('test-owner/artwork');
  await dialog.getByLabel('アクセストークン', { exact: true }).fill(fakeToken);
  if (remember) await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: '接続して同期', exact: true }).click();
  return dialog;
}
async function connected(page: Page, remember = false) {
  const dialog = await connect(page, remember);
  await expect(dialog.getByRole('status')).toContainText('GitHubに同期済み');
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
}
async function sync(page: Page) {
  await page.getByRole('button', { name: '今すぐ同期', exact: true }).click();
  await expect(page.getByRole('button', { name: '今すぐ同期', exact: true })).toBeEnabled();
}
async function paint(page: Page, x: number, y: number) {
  const canvas = page.locator('canvas'); await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + (x + .5) * box.width / 32, box.y + (y + .5) * box.height / 32);
  await expect(page.getByText('この端末に保存済み', { exact: true })).toBeVisible();
}
async function pixel(page: Page, x: number, y: number) {
  return page.locator('canvas').evaluate((canvas: HTMLCanvasElement, point) => [...canvas.getContext('2d')!.getImageData(point.x, point.y, 1, 1).data], { x, y });
}

test('shares twelve-frame RGBA artwork and palette across devices, resolves two offline edits, and propagates deletion', async ({ page, browser }) => {
  const server = gitHubServer(); await server.install(page.context());
  await page.goto('.'); await enterEditor(page);
  await page.getByLabel('自由な色', { exact: true }).fill('#ff0000');
  await page.getByRole('slider', { name: '不透明度', exact: true }).fill('50');
  await page.getByRole('button', { name: 'パレットに追加', exact: true }).click();
  await paint(page, 3, 3); await connected(page);
  expect(server.state.commits).toBe(1);
  const context = await browser.newContext(); await server.install(context);
  const peer = await context.newPage();
  try {
    await peer.goto(page.url());
    await expect(peer.getByRole('button', { name: 'GitHub保存の設定' })).toBeEnabled();
    await connected(peer); await enterEditor(peer);
    expect(await pixel(peer, 3, 3)).toEqual([255, 0, 0, 128]);
    await expect(peer.getByRole('button', { name: '追加色 #ff000080', exact: true })).toBeVisible();
    expect(JSON.parse(server.state.text!).projects[0].frames).toHaveLength(12);
    // Both devices edit from the same base before either sees the other edit.
    await paint(page, 4, 4);
    await paint(peer, 5, 5);
    await sync(page); await sync(peer);
    await expect(peer.locator('.github-sync-bar')).toContainText('競合');
    const saved = JSON.parse(server.state.text!) as { projects: { name: string; id: string; frames: string[] }[] };
    expect(saved.projects).toHaveLength(2);
    expect(saved.projects.some(p => p.name.includes('端末の変更'))).toBe(true);
    const alphas = saved.projects.map(p => {
      const pixels = Buffer.from(p.frames[1], 'base64');
      return [pixels[(4 * 32 + 4) * 4 + 3], pixels[(5 * 32 + 5) * 4 + 3]];
    });
    expect(alphas).toContainEqual([128, 0]); expect(alphas).toContainEqual([0, 255]);
    await peer.getByRole('button', { name: 'キャラクター一覧へ戻る', exact: true }).click();
    const first = peer.locator('.project-list li').first();
    const deletedId = await first.getAttribute('data-project-id');
    await first.getByRole('button', { name: /を削除$/ }).click();
    await peer.getByRole('dialog').getByRole('button', { name: '削除する', exact: true }).click();
    await sync(peer); await sync(page);
    expect(JSON.parse(server.state.text!).projects).toHaveLength(1);
    expect(JSON.parse(server.state.text!).projects[0].id).not.toBe(deletedId);
  } finally { await context.close(); }
});

test('keeps local work through rejected credentials, corrupt remote data and a concurrent commit', async ({ page }) => {
  const server = gitHubServer(); await server.install(page.context());
  await page.goto('.'); await enterEditor(page); await paint(page, 1, 1); await connected(page);
  await paint(page, 2, 2);
  server.state.status = 401; await sync(page);
  await expect(page.locator('.github-sync-bar')).toContainText('トークンが無効');
  expect(await pixel(page, 2, 2)).toEqual([0, 0, 0, 255]);
  server.state.status = 0;
  const good = server.state.text; const commits = server.state.commits;
  server.state.text = '{broken'; await sync(page);
  await expect(page.locator('.github-sync-bar')).toContainText('読み取れません');
  expect(server.state.commits).toBe(commits);
  expect(await pixel(page, 2, 2)).toEqual([0, 0, 0, 255]);
  server.state.text = good; server.state.conflictOnce = true; await sync(page);
  await expect(page.locator('.github-sync-bar')).toContainText('GitHubに同期済み');
  expect(server.state.commits).toBe(commits + 1);
  expect(await pixel(page, 2, 2)).toEqual([0, 0, 0, 255]);
  server.state.networkDown = true;
  await page.context().setOffline(true); await paint(page, 3, 3); await sync(page);
  await expect(page.locator('.github-sync-bar')).toContainText('接続できません');
  expect(await pixel(page, 3, 3)).toEqual([0, 0, 0, 255]);
  server.state.networkDown = false;
  await page.context().setOffline(false);
  await sync(page);
  await expect(page.locator('.github-sync-bar')).toContainText('GitHubに同期済み');
  const stored = JSON.parse(server.state.text!);
  expect(Buffer.from(stored.projects[0].frames[1], 'base64')[(3 * 32 + 3) * 4 + 3]).toBe(255);
});

test('refuses public repositories and keeps credentials in this device only; disconnect preserves works', async ({ page }, testInfo) => {
  const server = gitHubServer(); await server.install(page.context());
  await page.goto('.'); await enterEditor(page); await paint(page, 1, 1);
  server.state.private = false;
  const dialog = await connect(page);
  await expect(dialog.getByRole('alert')).toContainText('非公開');
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await dialog.screenshot({ path: testInfo.outputPath('github-settings.png') });
  expect(server.state.commits).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem('pixel-studio-github'))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('pixel-studio-github'))).toContain(fakeToken);
  server.state.private = true;
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: '接続して同期', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('GitHubに同期済み');
  expect(await page.evaluate(() => localStorage.getItem('pixel-studio-github'))).toContain(fakeToken);
  expect(await page.evaluate(() => sessionStorage.getItem('pixel-studio-github'))).toBeNull();
  await dialog.getByRole('button', { name: '接続を解除', exact: true }).click();
  expect(await page.evaluate(() => [localStorage.getItem('pixel-studio-github'), sessionStorage.getItem('pixel-studio-github')])).toEqual([null, null]);
  await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  expect(await pixel(page, 1, 1)).toEqual([0, 0, 0, 255]);
  await page.reload(); await enterEditor(page);
  expect(await pixel(page, 1, 1)).toEqual([0, 0, 0, 255]);
});

test('does not overwrite a local save made in another tab while GitHub is writing', async ({ page }) => {
  const server = gitHubServer(); await server.install(page.context());
  await page.goto('.'); await enterEditor(page); await connected(page); await paint(page, 1, 1);
  server.state.hold = true; server.state.waiting = false;
  await page.getByRole('button', { name: '今すぐ同期', exact: true }).click();
  await expect.poll(() => server.state.waiting).toBe(true);
  await page.keyboard.press('Control+z');
  expect(await pixel(page, 1, 1)).toEqual([0, 0, 0, 255]);
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('pixel-studio', 2);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result; const tx = db.transaction(['projects', 'documents'], 'readwrite');
        const docs = tx.objectStore('documents'); const revision = docs.get('library-revision');
        revision.onsuccess = () => docs.put((revision.result || 0) + 1, 'library-revision');
        const projects = tx.objectStore('projects'); const all = projects.getAll();
        all.onsuccess = () => {
          const p = all.result[0]; p.frames[1][(6 * 32 + 6) * 4 + 3] = 255; p.pixels = p.frames[p.frameIndex]; projects.put(p);
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  server.state.hold = false;
  await expect(page.locator('.github-sync-bar')).toContainText('別のタブ');
  await page.reload(); await enterEditor(page);
  expect(await pixel(page, 6, 6)).toEqual([0, 0, 0, 255]);
});

test('keeps the editor uninterrupted across timer and wake events, syncs on return to the library, and restores settings', async ({ page }) => {
  const server = gitHubServer(); await server.install(page.context());
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await page.clock.pauseAt(new Date('2026-01-01T00:00:01Z'));
  await page.goto('.'); await enterEditor(page); await connected(page, true);
  const requests = server.state.requests;
  await paint(page, 7, 7);
  await page.clock.runFor(61000);
  expect(server.state.requests).toBe(requests);
  await expect(page.getByRole('button', { name: 'ペン', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '元に戻す', exact: true }).click();
  expect(await pixel(page, 7, 7)).toEqual([0, 0, 0, 0]);
  await paint(page, 8, 8);
  await page.clock.runFor(61000);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.clock.runFor(2000);
  expect(server.state.requests).toBe(requests);
  expect(server.state.commits).toBe(1);
  await expect(page.locator('.github-sync-bar')).toContainText('一覧に戻ると');
  expect(await pixel(page, 8, 8)).toEqual([0, 0, 0, 255]);
  await page.getByRole('button', { name: 'キャラクター一覧へ戻る', exact: true }).click();
  await page.clock.runFor(1000);
  await expect(page.locator('.github-sync-bar')).toContainText('GitHubに同期済み');
  expect(server.state.commits).toBe(2);
  const snapshot = JSON.parse(server.state.text!);
  const pixels = Buffer.from(snapshot.projects[0].frames[1], 'base64');
  expect(pixels[(7 * 32 + 7) * 4 + 3]).toBe(0);
  expect(pixels[(8 * 32 + 8) * 4 + 3]).toBe(255);
  await page.reload(); await enterLibrary(page);
  await page.clock.runFor(1000);
  await expect(page.locator('.github-sync-bar')).toContainText('GitHubに同期済み');
  expect(server.state.commits).toBe(2); // No commit for an unchanged library.
});

test('refreshes an active work changed on another device and never resurrects a remotely deleted work', async ({ page }) => {
  const server = gitHubServer(); await server.install(page.context());
  await page.goto('.'); await enterEditor(page); await paint(page, 1, 1); await connected(page);
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeEnabled();
  await sync(page);
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeEnabled();
  const stored = JSON.parse(server.state.text!);
  const pixels = Buffer.from(stored.projects[0].frames[1], 'base64');
  pixels.set([0, 0, 255, 128], (7 * 32 + 7) * 4);
  stored.projects[0].frames[1] = pixels.toString('base64');
  server.state.text = JSON.stringify(stored); server.state.revision++;
  await sync(page);
  expect(await pixel(page, 7, 7)).toEqual([0, 0, 255, 128]);
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeDisabled();
  server.state.text = JSON.stringify({ ...stored, projects: [] }); server.state.revision++;
  await sync(page);
  await expect(page.getByRole('heading', { name: '保存したキャラクター（0件）' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await page.reload(); await enterLibrary(page);
  await expect(page.locator('.project-list li')).toHaveCount(0);
  expect(server.state.commits).toBe(1);
});
