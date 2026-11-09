import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deserializeProjectFile, serializeProjectFile } from '../../schemka-model-io/src/index.js';
import { openFileDialog } from './browser-files.mjs';

/** Prepared only: browser execution requires an environment that can launch it. */
export async function exerciseViewFlows(page, checks) {
  const activeId=()=>page.locator('#view-tabs [aria-selected=true]').getAttribute('data-view-id');
  const originalViewId=await activeId(), originalViews=await page.locator('.view-tab').count();
  const originalElements=await page.locator('.element-button').count();
  const snapshot=async()=>{
    await openFileDialog(page);const pending=page.waitForEvent('download');await page.locator('#save-project').click();const download=await pending;
    const state=deserializeProjectFile(await readFile(await download.path()));await page.locator('#file-dialog [data-close]').click();return state;
  };
  await page.locator('#new-view').click();await page.locator('#new-view-name').fill('Cancelled');await page.keyboard.press('Escape');
  assert.equal(await page.locator('.view-tab').count(),originalViews);
  await page.locator('#new-view').click();await page.locator('#new-view-name').fill('Новый вид <safe>');await page.locator('#view-submit').click();
  const createdViewId=await activeId();assert.notEqual(createdViewId,originalViewId);assert.equal(await page.locator('#canvas .node').count(),0);assert.equal(await page.locator('.view-tab').count(),originalViews+1);
  assert.equal(await page.locator('#file-state').getAttribute('data-dirty'),'true');
  const add=page.locator('.tree-add-element').first();await add.focus();await page.keyboard.press('Enter');
  assert.equal(await page.locator('#canvas .node').count(),1);assert.equal(await page.locator('.element-button').count(),originalElements);
  assert.equal(await page.locator('.inline-editor').count(),0);assert.equal(await page.locator('#canvas .node').evaluate(el=>document.activeElement===el),true);
  await add.click();assert.equal(await page.locator('#canvas .node').count(),2);assert.equal(await page.locator('.element-button').count(),originalElements);
  await page.locator('#undo').click();await page.locator('#undo').click();await page.locator('#undo').click();
  assert.equal(await page.locator('.view-tab').count(),originalViews);assert.equal(await activeId(),originalViewId);assert.equal(await page.locator('#canvas').isVisible(),true);
  await page.locator('#redo').click();assert.equal(await page.locator('.view-tab').count(),originalViews+1);
  await page.locator(`[data-view-scope=tabs][data-view-id="${createdViewId}"]`).dblclick();await page.locator('.inline-editor input').fill('Inline remains');await page.keyboard.press('Enter');
  assert.equal(await activeId(),createdViewId);assert.match(await page.locator('#view-tabs [aria-selected=true]').innerText(),/Inline remains/);
  await page.locator(`[data-view-scope=tabs][data-view-id="${originalViewId}"]`).click();const before=await snapshot();
  const source=before.views.find(v=>v.view.id===originalViewId);await page.locator('#duplicate-view').click();await page.locator('#new-view-name').fill('Копия вида');await page.locator('#view-submit').click();
  const copyViewId=await activeId();assert.notEqual(copyViewId,originalViewId);const copied=await snapshot(),copy=copied.views.find(v=>v.view.id===copyViewId);
  assert.deepEqual(copied.elements,before.elements);assert.deepEqual(copied.relationships,before.relationships);assert.equal(copy.occurrences.length,source.occurrences.length);assert.equal(copy.connections.length,source.connections.length);
  assert.ok(copy.occurrences.every(o=>!source.occurrences.some(old=>old.id===o.id)));assert.ok(copy.connections.every(c=>!source.connections.some(old=>old.id===c.id)));
  const occurrence=page.locator('#canvas .node').first();await occurrence.focus();await page.keyboard.press('Enter');const position=await occurrence.getAttribute('transform');await page.keyboard.press('ArrowRight');assert.notEqual(await occurrence.getAttribute('transform'),position);
  const moved=await snapshot();assert.deepEqual(moved.views.find(v=>v.view.id===originalViewId),source);
  await page.setViewportSize({width:390,height:844});await page.locator('[data-panel=catalog]').click();await page.locator('.tree-add-element').first().click();assert.equal(await page.locator('.canvas-panel').isVisible(),true);assert.equal(await page.locator('.inline-editor').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.setViewportSize({width:1440,height:900});
  const empty=structuredClone(before);empty.views=[];await openFileDialog(page);await page.locator('#project-file').setInputFiles({name:'empty.arkita',mimeType:'application/json',buffer:Buffer.from(serializeProjectFile(empty))});await page.locator('#load-project').click();await page.waitForFunction(()=>!document.querySelector('#file-dialog').open);
  assert.equal(await page.locator('#new-view').isEnabled(),true);assert.equal(await page.locator('#duplicate-view').isDisabled(),true);assert.equal(await page.locator('#catalogue-tools button:enabled').count(),0);assert.equal(await page.locator('.tree-add-element').first().isDisabled(),true);
  await page.locator('#new-view').click();await page.locator('#view-submit').click();assert.equal(await page.locator('.view-tab').count(),1);assert.equal(await page.locator('#create-service').isEnabled(),true);assert.equal(await page.locator('#create-device').isEnabled(),true);assert.equal(await page.locator('.tree-add-element').first().isEnabled(),true);
  await page.locator('#undo').click();assert.equal(await page.locator('.view-tab').count(),0);assert.match(await page.locator('#canvas').textContent(),/нет представлений/);await page.locator('#redo').click();assert.equal(await page.locator('.view-tab').count(),1);
  checks.push('new/cancel/first view; create undo/redo fallback; duplicate new local IDs/shared model; independent movement; tree reuse keyboard/mobile distinct from inline rename; file persistence of all views');
}
