import { expect, test, type Page } from '@playwright/test';
import { enterLibrary } from './navigation';

async function create(page: Page, name: string, width = 24, height = 16) {
  await page.getByRole('button', { name: '新規キャラクター', exact: true }).click();
  await page.getByLabel('作品名', { exact: true }).fill(name);
  await page.getByLabel('幅', { exact: true }).fill(String(width));
  await page.getByLabel('高さ', { exact: true }).fill(String(height));
  await page.getByRole('button', { name: '描き始める', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}
async function back(page: Page) { await page.getByRole('button', { name: 'キャラクター一覧へ戻る', exact: true }).click(); }
async function draw(page: Page, color: string, waitForSave = true) {
  await page.getByLabel('自由な色', { exact: true }).fill(color);
  const c = page.locator('canvas'); await c.scrollIntoViewIfNeeded();
  const r = (await c.boundingBox())!;
  await page.mouse.click(r.x + r.width * 4.5 / Number(await c.getAttribute('width')), r.y + r.height * 4.5 / Number(await c.getAttribute('height')));
  if (waitForSave) await expect(page.getByText('この端末に保存済み', { exact: true })).toBeVisible();
}
async function rgba(page: Page, x: number, y: number) {
  return page.locator('canvas').evaluate((c: HTMLCanvasElement, p) => [...c.getContext('2d')!.getImageData(p.x,p.y,1,1).data], {x,y});
}
async function copy(page: Page, name: string) {
  await page.getByRole('button', { name: `${name}をコピー`, exact: true }).click();
  await expect(page.getByText('作品データをコピーしました。', { exact: false })).toBeVisible();
}
async function paste(page: Page, name: string) {
  await page.getByRole('button', { name: '貼り付けて新規作成', exact: true }).click();
  await expect(page.getByRole('heading', { name: `${name}のコピー`, exact: true })).toBeVisible();
}

test('root menu opens the saved list first, with new creation as a separate step', async ({ page }) => {
  await page.goto('.');
  await expect(page.getByRole('heading', { name: '何を作りますか？', exact: true })).toBeVisible();
  await expect(page.getByLabel('作品名', { exact: true })).toHaveCount(0);
  await enterLibrary(page);
  await expect(page.getByRole('heading', { name: 'キャラクター', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '貼り付けて新規作成', exact: true })).toBeDisabled();
  await expect(page.getByLabel('作品名', { exact: true })).toHaveCount(0);
  await create(page, '勇者'); await draw(page, '#ff0000'); await back(page);
  await page.getByRole('button', { name: 'メインメニューへ戻る', exact: true }).click();
  await expect(page.locator('.project-list')).toHaveCount(0);
  await enterLibrary(page);
  await page.getByRole('button', { name: '勇者を開く', exact: true }).click();
  expect(await rgba(page,4,4)).toEqual([255,0,0,255]);
});

test('copy and paste create an independent image with exact dimensions, pixels and transparency', async ({ page }) => {
  await page.goto('.'); await enterLibrary(page); await create(page, '勇者'); await draw(page, '#e77958'); await back(page);
  await copy(page,'勇者'); await paste(page,'勇者');
  await expect(page.locator('canvas')).toHaveAttribute('width','24');
  await expect(page.locator('canvas')).toHaveAttribute('height','16');
  expect(await rgba(page,4,4)).toEqual([231,121,88,255]);
  expect(await rgba(page,0,0)).toEqual([0,0,0,0]);
  await draw(page,'#0000ff'); await back(page);
  await expect(page.locator('.project-list li')).toHaveCount(2);
  await page.getByRole('button', { name:'勇者を開く', exact:true }).click();
  expect(await rgba(page,4,4)).toEqual([231,121,88,255]);
  await back(page); await paste(page,'勇者');
  expect(await rgba(page,4,4)).toEqual([231,121,88,255]);
  await back(page); await expect(page.locator('.project-list li')).toHaveCount(3);
});

test('cancelled deletion keeps data; confirmed active deletion stays deleted after reload and offline paste', async ({ page, context }) => {
  await page.goto('.'); await enterLibrary(page); await create(page,'元のキャラ'); await draw(page,'#ff0000'); await back(page);
  await copy(page,'元のキャラ');
  await page.getByRole('button',{name:'元のキャラを削除',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('元のキャラ');
  await page.getByRole('button',{name:'キャンセル',exact:true}).click();
  await expect(page.locator('.project-list li')).toHaveCount(1);
  await page.getByRole('button',{name:'元のキャラを削除',exact:true}).click();
  await page.getByRole('button',{name:'削除する',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.project-list li')).toHaveCount(0);
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.reload(); await enterLibrary(page);
  await context.setOffline(true); await page.reload(); await enterLibrary(page);
  await expect(page.locator('.project-list li')).toHaveCount(0);
  await paste(page,'元のキャラ');
  expect(await rgba(page,4,4)).toEqual([255,0,0,255]);
  await back(page); await expect(page.locator('.project-list li')).toHaveCount(1);
  await page.reload(); await enterLibrary(page);
  await expect(page.getByRole('button',{name:'元のキャラを開く',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'元のキャラのコピーを開く',exact:true}).click();
  expect(await rgba(page,4,4)).toEqual([255,0,0,255]);
  await context.setOffline(false);
});

test('delete failure retains the selected project and every other project', async ({page})=>{
  await page.goto('.'); await enterLibrary(page); await create(page,'A'); await draw(page,'#ff0000'); await back(page);
  await create(page,'B'); await back(page);
  await page.evaluate(()=>{IDBObjectStore.prototype.delete=()=>{throw new DOMException('Denied','UnknownError');};});
  await page.getByRole('button',{name:'Aを削除',exact:true}).click();
  await page.getByRole('button',{name:'削除する',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('削除できませんでした');
  await page.getByRole('button',{name:'キャンセル',exact:true}).click();
  await expect(page.locator('.project-list li')).toHaveCount(2);
  await page.reload(); await enterLibrary(page);
  await page.getByRole('button',{name:'Aを開く',exact:true}).click();
  expect(await rgba(page,4,4)).toEqual([255,0,0,255]);
});

test('clipboard write failure preserves the previous snapshot and all source images', async ({page})=>{
  await page.goto('.'); await enterLibrary(page); await create(page,'A'); await draw(page,'#ff0000'); await back(page); await copy(page,'A');
  await create(page,'B'); await draw(page,'#0000ff'); await back(page);
  await page.evaluate(()=>{
    const original=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value:unknown,key?:IDBValidKey){if(key==='project-clipboard')throw new DOMException('Full','QuotaExceededError');return original.call(this,value,key!);};
  });
  await page.getByRole('button',{name:'Bをコピー',exact:true}).click();
  await expect(page.getByText('コピーできませんでした。',{exact:false})).toBeVisible();
  await paste(page,'A');
  expect(await rgba(page,4,4)).toEqual([255,0,0,255]);
  await back(page); await expect(page.locator('.project-list li')).toHaveCount(3);
});

test('deleting a migrated legacy image also removes its backup without resurrection', async ({page,baseURL})=>{
  await page.goto(new URL('favicon.svg',baseURL).href);
  await page.evaluate(()=>new Promise<void>((resolve)=>{
    const r=indexedDB.open('pixel-studio',1);r.onupgradeneeded=()=>r.result.createObjectStore('documents');
    r.onsuccess=()=>{const db=r.result,tx=db.transaction('documents','readwrite');tx.objectStore('documents').put({version:1,width:16,height:16,name:'旧キャラ',kind:'character',pixels:new Uint8ClampedArray(1024)},'current');tx.oncomplete=()=>{db.close();resolve();};};
  }));
  await page.goto('.');await enterLibrary(page);
  await page.getByRole('button',{name:'旧キャラを削除',exact:true}).click();
  await page.getByRole('button',{name:'削除する',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();await enterLibrary(page);await expect(page.locator('.project-list li')).toHaveCount(0);
  const exists=await page.evaluate(()=>new Promise<boolean>((resolve)=>{const r=indexedDB.open('pixel-studio');r.onsuccess=()=>{const db=r.result,q=db.transaction('documents').objectStore('documents').get('current');q.onsuccess=()=>{resolve(q.result!==undefined);db.close();};};}));
  expect(exists).toBe(false);
});

test('deletion waits for a pending save and does not resurrect or remove other characters', async ({page})=>{
  await page.goto('.');await enterLibrary(page);await create(page,'A');await back(page);await create(page,'B');await back(page);
  await page.getByRole('button',{name:'Aを開く',exact:true}).click();
  await page.evaluate(()=>{
    const control={hold:true};(window as unknown as {deleteTestControl:typeof control}).deleteTestControl=control;
    const original=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(value:unknown,key?:IDBValidKey){
      const result=original.call(this,value,key!);
      if(this.name==='projects'&&control.hold){const keep=()=>{const r=this.get('hold');r.onsuccess=()=>{if(control.hold)keep();};};keep();}
      return result;
    };
  });
  await draw(page,'#ff0000',false);
  await expect(page.getByText('保存中…',{exact:true})).toBeVisible();
  await back(page);
  await page.getByRole('button',{name:'Aを削除',exact:true}).click();
  await page.getByRole('button',{name:'削除する',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.project-list li')).toHaveCount(2);
  await page.evaluate(()=>{(window as unknown as {deleteTestControl:{hold:boolean}}).deleteTestControl.hold=false;});
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.project-list li')).toHaveCount(1);
  await page.reload();await enterLibrary(page);
  await expect(page.getByRole('button',{name:'Aを開く',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Bを開く',exact:true}).click();
  expect(await rgba(page,4,4)).toEqual([0,0,0,0]);
});
