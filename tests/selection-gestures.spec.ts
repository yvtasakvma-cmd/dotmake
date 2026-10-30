import { expect, test, type Page } from '@playwright/test';
import { enterEditor } from './navigation';

async function cell(page: Page, x: number, y: number) {
  const c = page.locator('canvas'); await c.scrollIntoViewIfNeeded();
  const box = (await c.boundingBox())!;
  return { x: box.x + (x + .5) * box.width / Number(await c.getAttribute('width')), y: box.y + (y + .5) * box.height / Number(await c.getAttribute('height')) };
}
async function rgba(page: Page, x: number, y: number) {
  return page.locator('canvas').evaluate((c: HTMLCanvasElement, p) => [...c.getContext('2d')!.getImageData(p.x,p.y,1,1).data], {x,y});
}
async function draw(page: Page, x: number, y: number, color: string) {
  await page.getByLabel('自由な色', {exact:true}).fill(color);
  const p = await cell(page,x,y); await page.mouse.click(p.x,p.y);
}
async function drag(page: Page, from: [number,number], to: [number,number]) {
  const a = await cell(page,...from), b = await cell(page,...to);
  await page.mouse.move(a.x,a.y); await page.mouse.down(); await page.mouse.move(b.x,b.y); await page.mouse.up();
}
async function pattern(page: Page) {
  await draw(page,4,4,'#ff0000');await draw(page,5,4,'#0000ff');await draw(page,4,5,'#00ff00');
  await page.getByRole('button',{name:'範囲選択',exact:true}).click();
  await drag(page,[4,4],[5,5]);
  await expect(page.locator('.selection-outline')).toHaveAttribute('data-selection','4,4,2,2');
}
test.beforeEach(async ({page})=>{await page.goto('.');await enterEditor(page);});

test('default ink and preset are pure black',async({page})=>{
  await expect(page.getByLabel('自由な色',{exact:true})).toHaveValue('#000000');
  await expect(page.getByRole('button',{name:'黒 #000000',exact:true})).toHaveAttribute('aria-pressed','true');
  const p=await cell(page,1,1);await page.mouse.click(p.x,p.y);expect(await rgba(page,1,1)).toEqual([0,0,0,255]);
});

test('selection flips and overlapping moves are exact and undoable',async({page})=>{
  await pattern(page);
  await page.getByRole('button',{name:'左右反転',exact:true}).click();
  expect(await rgba(page,4,4)).toEqual([0,0,255,255]);expect(await rgba(page,5,5)).toEqual([0,255,0,255]);
  await page.getByRole('button',{name:'元に戻す',exact:true}).click();
  await drag(page,[4,4],[5,5]);
  await page.getByRole('button',{name:'上下反転',exact:true}).click();
  expect(await rgba(page,4,4)).toEqual([0,255,0,255]);expect(await rgba(page,5,5)).toEqual([0,0,255,255]);
  await page.getByRole('button',{name:'元に戻す',exact:true}).click();
  await drag(page,[4,4],[5,5]);
  await drag(page,[4,4],[5,4]);
  expect(await rgba(page,4,4)).toEqual([0,0,0,0]);expect(await rgba(page,5,4)).toEqual([255,0,0,255]);expect(await rgba(page,6,4)).toEqual([0,0,255,255]);
  await page.getByRole('button',{name:'元に戻す',exact:true}).click();
  expect(await rgba(page,4,4)).toEqual([255,0,0,255]);expect(await rgba(page,6,4)).toEqual([0,0,0,0]);
});

test('floating copy moves independently, stays unsaved until confirmed, then restores after reload',async({page})=>{
  await pattern(page);
  await expect(page.getByText('この端末に保存済み',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'範囲をコピー',exact:true}).click();
  await page.getByRole('button',{name:'範囲を貼り付け',exact:true}).click();
  await drag(page,[4,4],[8,4]);
  expect(await rgba(page,4,4)).toEqual([255,0,0,255]);expect(await rgba(page,8,4)).toEqual([255,0,0,255]);
  await expect(page.getByRole('button',{name:'PNG出力',exact:true})).toBeDisabled();
  const persisted=await page.evaluate(()=>new Promise<number[]>((resolve)=>{
    const r=indexedDB.open('pixel-studio');r.onsuccess=()=>{const db=r.result,q=db.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>{resolve([...q.result[0].pixels.slice((4*32+8)*4,(4*32+8)*4+4)]);db.close();};};
  }));
  expect(persisted).toEqual([0,0,0,0]);
  await page.getByRole('button',{name:'貼り付けを確定',exact:true}).click();
  await expect(page.getByText('この端末に保存済み',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'元に戻す',exact:true}).click();
  expect(await rgba(page,8,4)).toEqual([0,0,0,0]);expect(await rgba(page,4,4)).toEqual([255,0,0,255]);
  await page.getByRole('button',{name:'やり直す',exact:true}).click();
  await expect(page.getByText('この端末に保存済み',{exact:true})).toBeVisible();
  await page.reload();await enterEditor(page);
  expect(await rgba(page,8,4)).toEqual([255,0,0,255]);expect(await rgba(page,9,5)).toEqual([0,0,0,0]);
});

test('region clipboard can be pasted in another project and cancelled without altering either image',async({page})=>{
  await pattern(page);await page.getByRole('button',{name:'範囲をコピー',exact:true}).click();
  await page.getByRole('button',{name:'新規作成',exact:true}).click();
  await page.getByRole('button',{name:'16 × 16',exact:true}).click();
  await page.getByRole('button',{name:'作成する',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'範囲選択',exact:true}).click();
  await page.getByRole('button',{name:'範囲を貼り付け',exact:true}).click();
  expect(await rgba(page,0,0)).toEqual([255,0,0,255]);
  await page.getByRole('button',{name:'貼り付けを取消',exact:true}).click();
  expect(await rgba(page,0,0)).toEqual([0,0,0,0]);
  await page.getByRole('button',{name:'範囲を貼り付け',exact:true}).click();
  await page.getByRole('button',{name:'範囲を右へ',exact:true}).click();
  await page.getByRole('button',{name:'貼り付けを確定',exact:true}).click();
  expect(await rgba(page,1,0)).toEqual([255,0,0,255]);
});

test.describe('native touch navigation',()=>{
  test.use({hasTouch:true});
  test('two-finger pan and pinch preserve pixels, anchor, page scale and single-finger drawing',async({page,context})=>{
    await draw(page,2,2,'#000000');
    const before=await page.locator('canvas').evaluate((c:HTMLCanvasElement)=>c.toDataURL());
    await page.getByRole('button',{name:'拡大',exact:true}).click();
    const viewport=page.getByLabel('キャンバス表示領域',{exact:true});await viewport.scrollIntoViewIfNeeded();
    const r=(await viewport.boundingBox())!, mx=r.x+r.width/2,my=r.y+r.height/2;
    const initial=await viewport.evaluate((e)=>[e.scrollLeft,e.scrollTop]);
    const scrollY=await page.evaluate(()=>window.scrollY),scale=await page.evaluate(()=>visualViewport!.scale);
    const session=await context.newCDPSession(page);
    const a={x:mx-40,y:my,id:0},b={x:mx+40,y:my,id:1};
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a,b]});
    const a2={x:a.x-30,y:a.y-20,id:0},b2={x:b.x-30,y:b.y-20,id:1};
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[a2,b2]});
    await expect(page.getByLabel('拡大率')).toHaveText('2倍');
    const pan=await viewport.evaluate((e)=>[e.scrollLeft,e.scrollTop]);
    expect(pan[0]-initial[0]).toBeCloseTo(30,0);expect(pan[1]-initial[1]).toBeCloseTo(20,0);
    const anchor=async()=>page.locator('canvas').evaluate((c:HTMLCanvasElement,mid)=>{const r=c.getBoundingClientRect();return[(mid.x-r.left)/r.width*c.width,(mid.y-r.top)/r.height*c.height];},{x:mx-30,y:my-20});
    const atStart=await anchor();
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:mx-110,y:my-20,id:0},{x:mx+50,y:my-20,id:1}]});
    await expect(page.getByLabel('拡大率')).toHaveText('4倍');
    const atEnd=await anchor();expect(atEnd[0]).toBeCloseTo(atStart[0],1);expect(atEnd[1]).toBeCloseTo(atStart[1],1);
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:mx-50,y:my-20,id:0},{x:mx-10,y:my-20,id:1}]});
    await expect(page.getByLabel('拡大率')).toHaveText('1倍');
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{x:mx-50,y:my-20,id:0}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:mx,y:my,id:0}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    expect(await page.locator('canvas').evaluate((c:HTMLCanvasElement)=>c.toDataURL())).toBe(before);
    expect(await page.evaluate(()=>window.scrollY)).toBe(scrollY);expect(await page.evaluate(()=>visualViewport!.scale)).toBe(scale);
    const p=await cell(page,3,3);
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:0}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    expect(await rgba(page,3,3)).toEqual([0,0,0,255]);
  });

  test('pinch cancels a fill tap and a selection drag instead of changing image data',async({page,context})=>{
    const session=await context.newCDPSession(page);
    for(const tool of ['塗りつぶし','範囲選択']){
      await page.getByRole('button',{name:tool,exact:true}).click();
      const viewport=page.getByLabel('キャンバス表示領域',{exact:true});await viewport.scrollIntoViewIfNeeded();
      const r=(await viewport.boundingBox())!,a={x:r.x+r.width/2-35,y:r.y+r.height/2,id:0},b={x:r.x+r.width/2+35,y:r.y+r.height/2,id:1};
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a,b]});
      await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...a,x:a.x-15},{...b,x:b.x+15}]});
      await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
      const alpha=await page.locator('canvas').evaluate((c:HTMLCanvasElement)=>[...c.getContext('2d')!.getImageData(0,0,c.width,c.height).data].filter((_,i)=>i%4===3).some(Boolean));
      expect(alpha).toBe(false);await expect(page.locator('.selection-outline')).toHaveCount(0);
    }
  });
});
