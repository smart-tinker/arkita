import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { serializeProjectFile, deserializeProjectFile, exportMermaid } from '../../schemka-model-io/src/index.js';

export async function openFileDialog(page) {
  await page.locator('.app-menu').filter({has:page.locator('[data-command="open"]')}).locator(':scope > summary').click();
  const chooser=page.waitForEvent('filechooser');
  await page.locator('[data-command="open"]').click();
  await (await chooser).setFiles([]);
  await page.locator('#file-dialog').waitFor({state:'visible'});
}

/** Prepared real-browser assertions; run only through browser.mjs in a permitted runtime. */
export async function exerciseFileFlows(page, checks) {
  const open = () => openFileDialog(page);
  const close = async () => { await page.locator('#file-dialog [data-close]').click(); };
  const download = async id => {
    const result = page.waitForEvent('download'); await page.locator(`#${id}`).click();
    const file = await result; assert.equal(await file.failure(),null);
    return { name:file.suggestedFilename(), bytes:await readFile(await file.path()) };
  };
  const choose = bytes => page.locator('#project-file').setInputFiles({name:'model.arkita',mimeType:'application/json',buffer:Buffer.from(bytes)});
  const rename = async name => { await page.locator('#project-name').click(); await page.locator('.inline-editor input').fill(name); await page.keyboard.press('Enter'); };
  const viewId = await page.locator('#view-tabs [aria-selected=true]').getAttribute('data-view-id');
  await open(); const original=await download('save-project'); assert.match(original.name,/\.arkita$/);
  const state=deserializeProjectFile(original.bytes); assert.equal(state.views.length,2);assert.deepEqual(state.project.metamodel,{id:'schemka-archimate4',version:2});
  assert.match(await page.locator('#file-feedback').innerText(),/Файл передан браузеру; проверьте загрузку/);
  assert.equal(await page.locator('#file-state').getAttribute('data-dirty'),'false'); await close();
  await rename('Файловая модель <img src=x onerror=alert(1)>');
  assert.equal(await page.locator('#file-state').getAttribute('data-dirty'),'true');
  await page.locator('#undo').click();assert.equal(await page.locator('#file-state').getAttribute('data-dirty'),'false');
  await page.locator('#redo').click(); await open();
  await page.evaluate(()=>{ window.originalObjectURL=URL.createObjectURL; URL.createObjectURL=()=>{throw Error('test download failure');}; });
  await page.locator('#save-project').click();assert.match(await page.locator('#file-feedback').innerText(),/не выполнено/);assert.equal(await page.locator('#file-state').getAttribute('data-dirty'),'true');
  await page.evaluate(()=>{URL.createObjectURL=window.originalObjectURL;delete window.originalObjectURL;});
  const saved=await download('save-project');const savedState=deserializeProjectFile(saved.bytes);assert.equal(savedState.project.name,'Файловая модель <img src=x onerror=alert(1)>');
  assert.deepEqual(savedState.views,state.views);assert.deepEqual(savedState.elements,state.elements);
  await close();await rename('Not yet saved');await open();
  await page.locator('#mermaid-export > summary').click();
  const mmd=await download('download-mermaid');assert.match(mmd.name,/\.mmd$/);assert.equal(mmd.bytes.toString(),exportMermaid(savedState,viewId));
  assert.equal(await page.locator('#file-state').getAttribute('data-dirty'),'true');
  // Stub only the clipboard API to exercise UI completion/rejection without granting permissions.
  await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copiedMermaid=text;}}});});
  await page.locator('#copy-mermaid').click();await page.waitForFunction(()=>document.querySelector('#file-feedback').textContent.includes('скопирован'));
  assert.equal(await page.evaluate(()=>window.copiedMermaid),mmd.bytes.toString());assert.equal(await page.locator('#file-state').getAttribute('data-dirty'),'true');
  await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw Error('denied');};});await page.locator('#copy-mermaid').click();await page.waitForFunction(()=>document.querySelector('#file-feedback').textContent.includes('Не скопировано'));
  const history=await page.locator('#history-state').innerText();
  await choose(saved.bytes);assert.match(await page.locator('#replace-description').innerText(),/изменения будут потеряны/);await page.locator('#cancel-load').click();
  assert.equal(await page.locator('#history-state').innerText(),history);assert.equal(await page.locator('#project-name').innerText(),'Not yet saved');
  for(const invalid of [new Uint8Array([0xc0,0xaf]),Buffer.from('{"format":"bad"}'),new Uint8Array(18*1024*1024+1)]) {
    await choose(invalid);await page.locator('#load-project').click();await page.waitForFunction(()=>document.querySelector('#file-feedback').textContent.includes('Файл не открыт'));
    assert.equal(await page.locator('#project-name').innerText(),'Not yet saved');assert.equal(await page.locator('#history-state').innerText(),history);assert.equal(await page.locator('#file-state').getAttribute('data-dirty'),'true');
  }
  await choose(saved.bytes);await page.locator('#load-project').click();await page.waitForFunction(()=>!document.querySelector('#file-dialog').open);
  assert.equal(await page.locator('#project-name').innerText(),savedState.project.name);assert.equal(await page.locator('#file-state').getAttribute('data-dirty'),'false');assert.equal(await page.locator('#undo').isDisabled(),true);assert.equal(await page.locator('#redo').isDisabled(),true);
  await open();const roundtrip=await download('save-project');assert.deepEqual(roundtrip.bytes,saved.bytes);await close();
  const tiny=structuredClone(savedState);tiny.views[0].occurrences[0].bounds.height=.1;
  await open();await choose(serializeProjectFile(tiny));await page.locator('#load-project').click();await page.waitForFunction(()=>!document.querySelector('#file-dialog').open);
  assert.ok((await page.locator('#canvas .node-accent').evaluateAll(nodes=>nodes.map(n=>Number(n.getAttribute('height'))))).every(height=>height>=0));
  await open();const tinySaved=await download('save-project');assert.deepEqual(deserializeProjectFile(tinySaved.bytes),tiny);await close();
  const noViews=structuredClone(savedState);noViews.views=[];await open();await choose(serializeProjectFile(noViews));await page.locator('#load-project').click();await page.waitForFunction(()=>!document.querySelector('#file-dialog').open);
  assert.equal(await page.locator('.view-tab').count(),0);assert.equal(await page.locator('.element-button').count(),noViews.elements.length);assert.equal(await page.locator('#create-button,#link-button').count(),0);assert.equal(await page.locator('#catalogue-tools button:enabled').count(),0);assert.match(await page.locator('#canvas').textContent(),/нет представлений/);
  const noViewsHistory=await page.locator('#history-state').innerText();
  const relationshipTree=page.locator('#tree-relationships');
  if(!await relationshipTree.evaluate(el=>el.open))await relationshipTree.locator(':scope > summary').click();
  await page.locator('.catalog [data-relationship-id]').first().click({button:'right'});
  assert.equal(await page.locator('#context-menu [data-context-action="reuse-relationship"]').getAttribute('aria-disabled'),'true');
  assert.equal(await page.locator('#link-dialog').isVisible(),false);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#context-menu').isVisible(),false);
  assert.equal(await page.locator('#history-state').innerText(),noViewsHistory);
  await page.setViewportSize({width:390,height:844});await page.locator('[data-panel=inspector]').click();await page.setViewportSize({width:1440,height:900});await page.locator('#tree-model > summary').focus();await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.activeElement.closest('.toolbox')!==null && !document.activeElement.matches(':disabled') && document.activeElement.getClientRects().length>0);
  assert.equal(await page.evaluate(()=>document.activeElement.closest('.toolbox')!==null && !document.activeElement.matches(':disabled') && document.activeElement.getClientRects().length>0),true);
  await page.setViewportSize({width:1440,height:900});
  await open();assert.equal(await page.locator('#download-mermaid').isDisabled(),true);assert.equal(await page.locator('#copy-mermaid').isDisabled(),true);const empty=await download('save-project');assert.deepEqual(deserializeProjectFile(empty.bytes),noViews);
  await choose(original.bytes);await page.locator('#load-project').click();await page.waitForFunction(()=>!document.querySelector('#file-dialog').open);
  await rename('Preserve before new model');const beforeNewHistory=await page.locator('#history-state').innerText();
  await open();await page.locator('#new-project').click();assert.match(await page.locator('#replace-description').innerText(),/изменения будут потеряны/);
  assert.equal(await page.locator('#project-name').innerText(),'Preserve before new model');assert.equal(await page.locator('#history-state').innerText(),beforeNewHistory);
  await page.locator('#cancel-load').click();assert.equal(await page.locator('#file-state').getAttribute('data-dirty'),'true');
  await page.locator('#new-project').click();await page.locator('#load-project').click();await page.waitForFunction(()=>!document.querySelector('#file-dialog').open);
  assert.equal(await page.locator('.view-tab').count(),1);assert.equal(await page.locator('.element-button').count(),0);assert.equal(await page.locator('#canvas .node').count(),0);
  assert.equal(await page.locator('#undo').isDisabled(),true);assert.equal(await page.locator('#redo').isDisabled(),true);assert.match(await page.locator('#file-state').innerText(),/Новая модель · файл не скачан/);
  await open();const blank=deserializeProjectFile((await download('save-project')).bytes);
  assert.deepEqual(blank.project.metamodel,{id:'schemka-archimate4',version:2});assert.equal(blank.views.length,1);assert.deepEqual(blank.elements,[]);assert.deepEqual(blank.relationships,[]);
  assert.deepEqual(blank.views[0].occurrences,[]);assert.deepEqual(blank.views[0].connections,[]);
  await page.locator('#file-format-details > summary').click();
  await page.locator('#reset-example').click();await page.locator('#cancel-load').click();assert.equal(await page.locator('.element-button').count(),0);
  await page.locator('#reset-example').click();await page.locator('#load-project').click();await page.waitForFunction(()=>!document.querySelector('#file-dialog').open);
  assert.equal(await page.locator('.view-tab').count(),2);assert.equal(await page.locator('.element-button').count(),3);assert.equal(await page.locator('#undo').isDisabled(),true);assert.match(await page.locator('#file-state').innerText(),/Учебный пример · файл не скачан/);
  await open();const reset=deserializeProjectFile((await download('save-project')).bytes);
  assert.deepEqual(reset.project.metamodel,{id:'schemka-archimate4',version:2});assert.equal(reset.relationships.length,2);assert.deepEqual(reset.relationships.map(item=>item.type).sort(),['Flow','Serving']);
  await choose(original.bytes);await page.locator('#load-project').click();await page.waitForFunction(()=>!document.querySelector('#file-dialog').open);
  await page.setViewportSize({width:390,height:844});await open();assert.equal(await page.locator('#save-project').isVisible(),true);assert.equal(await page.locator('#project-file').isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await close();await page.setViewportSize({width:1440,height:900});
  checks.push('full model native download/reopen byte roundtrip; canonical undo baseline; failed dispatch/UTF8/size/cancel preservation; same-file retry; zero-view safe import; confirmed new/reset models with cancellation preservation; Mermaid download and mocked clipboard resolve/reject do not save model; narrow file controls');
}
