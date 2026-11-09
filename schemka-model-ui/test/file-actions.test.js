import test from 'node:test';
import assert from 'node:assert/strict';
import { createCurrentFixture as createDemo } from './current-fixture.js';
import { createController } from '../src/controller.js';
import { createProjectSession } from '../src/project-session.js';
import { installFileActions } from '../src/file-actions.js';
import { serializeProjectFile } from '../../schemka-model-io/src/index.js';
import { metadataFixture } from '../../schemka-model-core/fixtures/metadata-compatibility.js';

// Event harness tests policy and async boundaries, not rendered browser behavior.
const deferred = () => { let resolve,reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };
function setup(desktop, options = {}) {
  const elements = new Map(), handlers = new Map(), downloads = [], revoked=[], timers=new Map(); let failDownload=false,failAfterLoad=false;
  class Element {
    constructor() { this.listeners={}; this.dataset={}; this.value=''; this.files=[]; this.open=false; this.textContent=''; }
    setAttribute(name,value) { this[name]=value; }
    focus() { if (!this.disabled) this.focused=true; }
    addEventListener(name,fn) { (this.listeners[name] ||= []).push(fn); }
    async event(name) { for(const fn of this.listeners[name]||[]) await fn({target:this}); }
    click() { if(failDownload) throw Error('download blocked'); downloads.push({name:this.download,url:this.href}); }
    remove() {}
    close() { this.open=false; for(const fn of this.listeners.close||[]) fn(); }
  }
  const document={addEventListener(type,fn){handlers.set('document:'+type,fn);},getElementById(id){if(!elements.has(id)) elements.set(id,new Element()); return elements.get(id);},createElement(){return new Element();},body:{append(){}}};
  const $=document.getElementById;
  const window={schemkaDesktop:desktop,Blob,URL:{createObjectURL(){return 'blob:test';},revokeObjectURL(url){revoked.push(url);}},navigator:{clipboard:{writeText:async()=>{}}},
    setTimeout(fn){const id=timers.size; timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);},
    addEventListener(type,fn){handlers.set(type,fn);},removeEventListener(type){handlers.delete(type);}};
  const model=createController(createDemo()),session=createProjectSession(model.store),inline={generation:0,cancel(){}};
  const statuses=[]; let rendered=0,afterLoads=0,interactionGeneration=0;
  const actions=installFileActions({document,window,model,session,inline,cancelGesture(){},readInteractionGeneration:()=>interactionGeneration,render(){rendered++;actions.refresh();},status(text){statuses.push(text);},openDialog(id){$(id).open=true;},afterLoad(){afterLoads++;model.afterLoad();if(failAfterLoad)throw Error('render failed');},...options});
  actions.refresh();
  const rename=name=>{model.execute({type:'renameProject',name});actions.refresh();};
  const choose=async file=>{$('project-file').files=[file];$('project-file').value='same-file';await $('project-file').event('change');};
  return { $,model,session,inline,actions,get interactionGeneration(){return interactionGeneration;},set interactionGeneration(value){interactionGeneration=value;},window,handlers,downloads,revoked,statuses,rename,choose,set failDownload(value){failDownload=value;},set failAfterLoad(value){failAfterLoad=value;},get rendered(){return rendered;},get afterLoads(){return afterLoads;} };
}
function file(name='import.schemka.json') { const store=createDemo(); store.execute({type:'renameProject',name:'Opened'},store.revision); return new File([serializeProjectFile(store.snapshot)],name); }

const staticSvg = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 -20 100 80"><text x="0" y="10">Снимок &amp; 日本語</text></svg>';
test('SVG download is repeatable and preserves dirty, selection, native bytes and both histories', async () => {
  const h = setup(undefined, { svgSnapshot: () => staticSvg }); h.rename('Unsaved'); h.rename('Redo'); h.model.undo(); h.actions.refresh();
  h.model.select({ kind: 'occurrence', id: h.model.view.occurrences[0].id });
  const bytes = h.model.store.exportFiles(), history = h.model.store.history, selection = h.model.selection, revision = h.model.store.revision;
  await h.$('file-button').event('click');
  await h.$('download-svg').event('click'); await h.$('download-svg').event('click');
  assert.equal(h.downloads.length, 2); assert.ok(h.downloads.every(item => item.name.endsWith('.svg')));
  assert.match(h.statuses.at(-1), /SVG передан браузеру/); assert.equal(h.session.dirty, true);
  assert.deepEqual(h.model.store.exportFiles(), bytes); assert.deepEqual(h.model.store.history, history); assert.deepEqual(h.model.selection, selection); assert.equal(h.model.store.revision, revision);
  assert.equal(h.actions.transient, false);
  h.failDownload = true; await h.$('download-svg').event('click'); assert.match(h.statuses.at(-1), /SVG не выгружен/); assert.equal(h.session.dirty, true);
});

test('native SVG cancellation and error preserve state and never claim successful save', async () => {
  for (const result of [{ status: 'cancelled' }, { status: 'error', message: 'disk full' }]) {
    let received;
    const h = setup({ saveSvg: async (...args) => { received = args; return result; } }, { svgSnapshot: () => staticSvg });
    h.rename('Keep'); h.rename('Redo'); h.model.undo(); h.actions.refresh();
    const before = h.model.store.exportFiles(), history = h.model.store.history;
    await h.$('file-button').event('click'); await h.$('download-svg').event('click');
    assert.deepEqual(received, [staticSvg, h.model.view.view.name]);
    assert.match(h.statuses.at(-1), result.status === 'cancelled' ? /Экспорт SVG отменён/ : /SVG не выгружен: disk full/);
    assert.equal(h.session.dirty, true); assert.deepEqual(h.model.store.exportFiles(), before); assert.deepEqual(h.model.store.history, history); assert.equal(h.actions.transient, false);
  }
});

test('SVG waits for native write, blocks repeats, and ignores late feedback after closing or reopening the dialog', async () => {
  const pending = deferred(); let calls = 0;
  const h = setup({ saveSvg: () => { calls++; return pending.promise; } }, { svgSnapshot: () => staticSvg });
  await h.$('file-button').event('click'); const exporting = h.$('download-svg').event('click');
  assert.equal(h.actions.transient, true); assert.equal(h.$('download-svg').disabled, true);
  await h.$('download-svg').event('click'); assert.equal(calls, 1);
  assert.doesNotMatch(h.statuses.at(-1) || '', /SVG.*записан/);
  h.$('file-dialog').close(); await h.$('file-button').event('click'); const count = h.statuses.length;
  pending.resolve({ status: 'saved', name: 'view.svg' }); await exporting;
  assert.equal(h.statuses.length, count); assert.equal(h.actions.transient, false); assert.equal(h.session.dirty, false);
});

test('SVG refuses active editing or invalid markup before side effects and labels an obsolete native snapshot honestly', async () => {
  let captures = 0, editable = false;
  const h = setup(undefined, { canSave: () => editable, svgSnapshot: () => { captures++; return '<svg onload="x"/>'; } });
  await h.$('file-button').event('click'); await h.$('download-svg').event('click');
  assert.equal(captures, 0); assert.match(h.statuses.at(-1), /Завершите или отмените/); assert.equal(h.downloads.length, 0);
  editable = true; await h.$('download-svg').event('click'); assert.equal(captures, 1); assert.equal(h.downloads.length, 0); assert.match(h.statuses.at(-1), /SVG не выгружен/);
  const pending = deferred(), native = setup({ saveSvg: () => pending.promise }, { svgSnapshot: () => staticSvg });
  await native.$('file-button').event('click'); const exporting = native.$('download-svg').event('click');
  native.model.switchView(native.model.store.snapshot.views[1].view.id); pending.resolve({ status: 'saved' }); await exporting;
  assert.match(native.statuses.at(-1), /SVG прежнего представления/); assert.equal(native.session.dirty, false);
});

test('dirty drives warning listener; undo to canonical baseline removes listener; failed download stays dirty', async () => {
  const h=setup(); assert.equal(h.handlers.has('beforeunload'),false); h.rename('Changed'); assert.equal(h.handlers.has('beforeunload'),true);
  const event={preventDefault(){this.prevented=true;}};h.handlers.get('beforeunload')(event); assert.equal(event.prevented,true);
  h.model.undo();h.actions.refresh();assert.equal(h.session.dirty,false);assert.equal(h.handlers.has('beforeunload'),false);
  h.model.redo();h.actions.refresh();h.failDownload=true;await h.$('save-project').event('click'); assert.equal(h.session.dirty,true); assert.match(h.statuses.at(-1),/не выполнено/);
  h.failDownload=false;await h.$('save-project').event('click'); assert.equal(h.session.dirty,false); assert.match(h.statuses.at(-1),/Файл передан браузеру; проверьте загрузку/);assert.equal(h.handlers.has('beforeunload'),false);
  h.model.undo();h.actions.refresh();assert.equal(h.session.dirty,true);
});
test('picker cancellation and invalid file preserve full state/history, and same file selection can be retried', async()=>{
  const h=setup();h.rename('Keep');const before=h.model.store.exportFiles(),history=h.model.store.history;
  await h.$('file-button').event('click');await h.choose(file());assert.equal(h.$('project-file').value,'');await h.$('cancel-load').event('click');
  assert.deepEqual(h.model.store.exportFiles(),before);assert.deepEqual(h.model.store.history,history);assert.equal(h.session.dirty,true);
  await h.choose(new File(['bad utf8:','\u0000'],'bad.json'));await h.$('load-project').event('click');
  assert.deepEqual(h.model.store.exportFiles(),before);assert.deepEqual(h.model.store.history,history);assert.match(h.statuses.at(-1),/Файл не открыт/);assert.equal(h.session.dirty,true);assert.equal(h.$('project-file').focused,true);
  await h.choose(file());await h.$('load-project').event('click');assert.equal(h.model.store.snapshot.project.name,'Opened');assert.deepEqual(h.model.store.history,{undo:0,redo:0});assert.equal(h.session.dirty,false);assert.equal(h.afterLoads,1);assert.equal(h.$('file-dialog').open,false);
});
test('late load after Close or newer file never overwrites model or status', async()=>{
  const h=setup();const read=deferred(),bytes=serializeProjectFile(createDemo().snapshot);await h.$('file-button').event('click');
  await h.choose({name:'old',size:bytes.length,arrayBuffer:()=>read.promise});const pending=h.$('load-project').event('click');
  h.$('file-dialog').close();await h.$('file-button').event('click');await h.choose(file('new.schemka.json'));const label=h.$('replace-description').textContent;
  read.resolve(bytes.buffer);await pending;assert.equal(h.afterLoads,0);assert.equal(h.model.store.snapshot.project.name,'Учебная модель');assert.equal(h.$('replace-description').textContent,label);assert.equal(h.$('load-project').disabled,false);
  await h.$('load-project').event('click');assert.equal(h.model.store.snapshot.project.name,'Opened');
});
test('late document acknowledgment cannot consume a newer proposal or adopt a replaced document', async () => {
  for (const newer of ['proposal', 'loaded']) for (const outcome of ['resolve', 'reject']) {
    const acknowledgment = deferred(), requested = deferred(), adopted = [];
    let acknowledgments = 0;
    const h = setup({ documentChanged: async () => {
      if (++acknowledgments === 1) { requested.resolve(); return acknowledgment.promise; }
      return { status: 'detached' };
    } });
    h.actions.proposeExternal({ bytes: new Uint8Array(await file().arrayBuffer()), name: 'A',
      afterCommit: token => adopted.push(token) });
    const loading = h.$('load-project').event('click'); await requested.promise;
    const committedToken = h.session.documentToken;
    h.$('file-dialog').close();
    assert.equal(h.actions.proposeExternal({ bytes: serializeProjectFile(createDemo().snapshot), name: 'B', source: 'template' }), true);
    if (newer === 'loaded') { await h.$('load-project').event('click'); await h.$('file-button').event('click'); }
    const before = { token: h.session.documentToken, files: h.model.store.exportFiles(), history: h.model.store.history,
      source: h.actions.sourceLabel, status: [...h.statuses], description: h.$('replace-description').textContent,
      disabled: h.$('load-project').disabled, hidden: h.$('replace-project').hidden, afterLoads: h.afterLoads, warning: h.actions.directoryWarning };
    if (outcome === 'resolve') acknowledgment.resolve({ status: 'detached', ...(newer === 'loaded' ? { directory: { generation: 99,
      binding: null, issues: [{ id: 'obsolete', name: 'A-root', status: 'recovery-required' }] } } : {}) });
    else acknowledgment.reject(Error('A binding failed'));
    await loading;
    assert.deepEqual(adopted, outcome === 'resolve' && newer === 'proposal' ? [committedToken] : []);
    assert.deepEqual({ token: h.session.documentToken, files: h.model.store.exportFiles(), history: h.model.store.history,
      source: h.actions.sourceLabel, status: [...h.statuses], description: h.$('replace-description').textContent,
      disabled: h.$('load-project').disabled, hidden: h.$('replace-project').hidden, afterLoads: h.afterLoads, warning: h.actions.directoryWarning }, before);
    assert.equal(h.$('file-dialog').open, true);
    if (newer === 'proposal') await h.$('load-project').event('click');
    assert.equal(h.model.store.snapshot.project.name, 'Учебная модель');
    assert.equal(h.actions.sourceLabel, 'Модель из шаблона'); assert.equal(h.afterLoads, 2);
  }
});

test('late afterCommit success or failure cannot reset a newer file dialog or model', async () => {
  for (const newer of ['proposal', 'loaded']) for (const outcome of ['resolve', 'reject']) {
    const adoption = deferred(), requested = deferred(), adopted = [];
    const h = setup({ documentChanged: async () => ({ status: 'detached' }) });
    h.actions.proposeExternal({ bytes: new Uint8Array(await file().arrayBuffer()), name: 'A',
      afterCommit: token => { adopted.push(token); requested.resolve(); return adoption.promise; } });
    const loading = h.$('load-project').event('click'); await requested.promise;
    const committedToken = h.session.documentToken;
    h.$('file-dialog').close();
    h.actions.proposeExternal({ bytes: serializeProjectFile(createDemo().snapshot), name: 'B', source: 'import' });
    if (newer === 'loaded') { await h.$('load-project').event('click'); await h.$('file-button').event('click'); }
    const before = { token: h.session.documentToken, files: h.model.store.exportFiles(), history: h.model.store.history,
      source: h.actions.sourceLabel, status: [...h.statuses], disabled: h.$('load-project').disabled,
      hidden: h.$('replace-project').hidden, afterLoads: h.afterLoads };
    if (outcome === 'resolve') adoption.resolve(); else adoption.reject(Error('A adoption failed'));
    await loading;
    assert.deepEqual(adopted, [committedToken]);
    assert.deepEqual({ token: h.session.documentToken, files: h.model.store.exportFiles(), history: h.model.store.history,
      source: h.actions.sourceLabel, status: [...h.statuses], disabled: h.$('load-project').disabled,
      hidden: h.$('replace-project').hidden, afterLoads: h.afterLoads }, before);
    assert.equal(h.$('file-dialog').open, true);
    if (newer === 'proposal') await h.$('load-project').event('click');
    assert.equal(h.actions.sourceLabel, 'Импортированная модель'); assert.equal(h.afterLoads, 2);
  }
});

test('Cancel or Close during acknowledgment preserves the committed model and finishes its interface once', async () => {
  for (const cancel of ['cancel', 'close']) {
    const acknowledgment = deferred(), requested = deferred(), adopted = []; let cancelled = 0;
    const h = setup({ documentChanged: async () => { requested.resolve(); return acknowledgment.promise; } });
    h.model.select({ kind: 'occurrence', id: h.model.view.occurrences[0].id });
    h.model.beginDrag(h.model.view.occurrences[0].id);
    h.actions.proposeExternal({ bytes: new Uint8Array(await file().arrayBuffer()), name: 'A',
      afterCommit: token => adopted.push(token), onCancel: () => cancelled++ });
    const loading = h.$('load-project').event('click'); await requested.promise;
    const token = h.session.documentToken;
    assert.equal(h.afterLoads, 1); assert.equal(h.model.selection, null); assert.equal(h.model.drag, null);
    assert.equal(h.actions.sourceLabel, 'Модель из Git');
    if (cancel === 'cancel') await h.$('cancel-load').event('click'); else h.$('file-dialog').close();
    assert.equal(cancelled, 0); assert.equal(h.rendered, 1);
    if (cancel === 'cancel') assert.match(h.statuses.at(-1), /Модель уже загружена/);
    const statuses = [...h.statuses];
    h.model.select({ kind: 'occurrence', id: h.model.view.occurrences[0].id });
    const selection = h.model.selection;
    acknowledgment.resolve({ status: 'detached' }); await loading;
    assert.deepEqual(adopted, [token]); assert.equal(h.afterLoads, 1); assert.equal(h.rendered, 1); assert.deepEqual(h.model.selection, selection);
    assert.deepEqual(h.statuses, statuses); assert.equal(h.model.store.snapshot.project.name, 'Opened');
    assert.equal(h.actions.transient, false); assert.equal(h.$('file-dialog').open, cancel === 'cancel');
  }
});

test('native load resets immediately and renders once after acknowledgment with file controls released', async () => {
  const acknowledgment = deferred(), requested = deferred();
  const h = setup({ documentChanged: async () => { requested.resolve(); return acknowledgment.promise; } });
  h.actions.proposeExternal({ bytes: new Uint8Array(await file().arrayBuffer()), name: 'A' });
  const loading = h.$('load-project').event('click'); await requested.promise;
  assert.equal(h.afterLoads, 1); assert.equal(h.actions.transient, true);
  acknowledgment.resolve({ status: 'detached' }); await loading;
  assert.equal(h.rendered, 1); assert.equal(h.actions.transient, false);
  assert.equal(h.$('save-project').disabled, false); assert.equal(h.$('desktop-open-project').disabled, false);
  assert.equal(h.$('file-dialog').open, false);
});

test('final render failure reports the committed model and releases file controls', async () => {
  const h = setup({ documentChanged: async () => ({ status: 'detached' }) }, { render() { throw Error('canvas render failed'); } });
  h.actions.proposeExternal({ bytes: new Uint8Array(await file().arrayBuffer()), name: 'A' });
  await h.$('load-project').event('click');
  assert.equal(h.model.store.snapshot.project.name, 'Opened'); assert.equal(h.afterLoads, 1);
  assert.equal(h.actions.transient, false); assert.equal(h.$('save-project').disabled, false);
  assert.equal(h.$('file-dialog').open, false);
  assert.match(h.statuses.at(-1), /Модель уже загружена.*canvas render failed/);
});

test('Cancel and Close catch render failure without hiding it behind cancellation or late acknowledgment', async () => {
  for (const cancel of ['cancel', 'close']) {
    const acknowledgment = deferred(), requested = deferred();
    const h = setup({ documentChanged: async () => { requested.resolve(); return acknowledgment.promise; } },
      { render() { throw Error('canvas render failed'); } });
    h.actions.proposeExternal({ bytes: new Uint8Array(await file().arrayBuffer()), name: 'A' });
    const loading = h.$('load-project').event('click'); await requested.promise;
    if (cancel === 'cancel') await h.$('cancel-load').event('click'); else h.$('file-dialog').close();
    assert.match(h.statuses.at(-1), /Модель уже загружена.*canvas render failed/);
    assert.equal(h.actions.transient, false); assert.equal(h.$('save-project').disabled, false);
    const statuses = [...h.statuses];
    acknowledgment.resolve({ status: 'detached' }); await loading;
    assert.deepEqual(h.statuses, statuses); assert.equal(h.afterLoads, 1);
    assert.equal(h.model.store.snapshot.project.name, 'Opened');
  }
});

test('render opening a newer proposal preserves its feedback after binding failure or Cancel', async () => {
  for (const action of ['failure', 'cancel']) {
    const acknowledgment = deferred(), requested = deferred();
    const h = setup({ documentChanged: async () => { requested.resolve(); return acknowledgment.promise; } },
      { render() { h.actions.proposeExternal({ bytes: serializeProjectFile(createDemo().snapshot), name: 'New B', source: 'template' }); } });
    h.actions.proposeExternal({ bytes: new Uint8Array(await file().arrayBuffer()), name: 'A' });
    const loading = h.$('load-project').event('click'); await requested.promise;
    if (action === 'cancel') await h.$('cancel-load').event('click');
    acknowledgment.resolve(action === 'failure' ? { status: 'error', message: 'A native binding failed' } : { status: 'detached' });
    await loading;
    assert.match(h.$('replace-description').textContent, /New B/); assert.equal(h.$('file-feedback').textContent, '');
    assert.equal(h.$('load-project').disabled, false); assert.equal(h.$('file-dialog').open, true);
  }
});

test('committed model still acknowledges its exact native and Git token when interface reset fails', async () => {
  const acknowledged = [], adopted = [];
  const h = setup({ documentChanged: async (previous, current) => { acknowledged.push({ previous, current }); return { status: 'detached' }; } });
  const previous = h.session.documentToken;
  h.actions.proposeExternal({ bytes: new Uint8Array(await file().arrayBuffer()), name: 'A', afterCommit: token => adopted.push(token) });
  h.failAfterLoad = true; await h.$('load-project').event('click');
  assert.deepEqual(acknowledged, [{ previous, current: h.session.documentToken }]);
  assert.deepEqual(adopted, [h.session.documentToken]); assert.equal(h.afterLoads, 1);
  assert.equal(h.model.store.snapshot.project.name, 'Opened'); assert.equal(h.actions.transient, false);
  assert.match(h.statuses.at(-1), /Модель уже загружена.*render failed/);
});

test('newer inline draft with unchanged store revision rejects pending import without cancelling draft', async()=>{
  const h=setup();const read=deferred(),bytes=serializeProjectFile(createDemo().snapshot);await h.$('file-button').event('click');
  await h.choose({name:'old',size:bytes.length,arrayBuffer:()=>read.promise});const pending=h.$('load-project').event('click');h.inline.generation++;h.inline.active=true;
  read.resolve(bytes.buffer);await pending;assert.equal(h.afterLoads,0);assert.equal(h.model.store.revision,0);assert.equal(h.inline.active,true);assert.match(h.statuses.at(-1),/Файл не открыт/);
});
test('Mermaid download/copy never clear dirty; clipboard success is awaited and closed dialogs ignore late errors',async()=>{
  const h=setup();h.rename('Dirty');await h.$('file-button').event('click');await h.$('download-mermaid').event('click');assert.equal(h.session.dirty,true);assert.match(h.downloads[0].name,/\.mmd$/);
  const write=deferred();let payload;h.window.navigator.clipboard.writeText=text=>{payload=text;return write.promise;};const copying=h.$('copy-mermaid').event('click');
  assert.match(payload,/^flowchart LR/);assert.match(h.statuses.at(-1),/Копирование/);assert.equal(h.$('copy-mermaid').disabled,true);write.resolve();await copying;
  assert.match(h.statuses.at(-1),/скопирован/);assert.equal(h.session.dirty,true);
  const late=deferred();h.window.navigator.clipboard.writeText=()=>late.promise;const attempt=h.$('copy-mermaid').event('click');h.$('file-dialog').close();await h.$('file-button').event('click');const count=h.statuses.length;late.reject(Error('denied'));await attempt;assert.equal(h.statuses.length,count);assert.equal(h.$('copy-mermaid').disabled,false);
});
test('clipboard rejection and changed-view completions never report a fresh-view copy',async()=>{
  const h=setup();await h.$('file-button').event('click');h.window.navigator.clipboard.writeText=async()=>{throw Error('denied');};await h.$('copy-mermaid').event('click');assert.match(h.statuses.at(-1),/Не скопировано/);
  const write=deferred();h.window.navigator.clipboard.writeText=()=>write.promise;const attempt=h.$('copy-mermaid').event('click');h.model.switchView(h.model.store.snapshot.views[1].view.id);write.resolve();await attempt;assert.match(h.statuses.at(-1),/снимок прежнего вида/);assert.equal(h.session.dirty,false);
});


test('post-commit UI callback failure never claims the old model/history survived',async()=>{
  const h=setup();h.rename('Old');await h.$('file-button').event('click');await h.choose(file());h.failAfterLoad=true;
  await h.$('load-project').event('click');assert.equal(h.model.store.snapshot.project.name,'Opened');assert.equal(h.model.store.history.undo,0);
  assert.match(h.statuses.at(-1),/Модель уже загружена/);assert.doesNotMatch(h.statuses.at(-1),/Текущая модель и история сохранены/);
});


test('file picker is disabled during an active read, with explicit Cancel restoring it',async()=>{
  const h=setup(),read=deferred(),bytes=serializeProjectFile(createDemo().snapshot);await h.$('file-button').event('click');
  await h.choose({name:'A',size:bytes.length,arrayBuffer:()=>read.promise});const load=h.$('load-project').event('click');
  assert.equal(h.$('project-file').disabled,true);assert.equal(h.$('cancel-load').disabled,undefined);
  await h.$('cancel-load').event('click');assert.equal(h.$('project-file').disabled,false);assert.equal(h.$('project-file').focused,true);
  read.resolve(bytes.buffer);await load;assert.equal(h.afterLoads,0);assert.equal(h.model.store.revision,0);
});


test('older clipboard completion cannot overwrite a newer import failure message',async()=>{
  const h=setup(),write=deferred();await h.$('file-button').event('click');h.window.navigator.clipboard.writeText=()=>write.promise;
  const copying=h.$('copy-mermaid').event('click');await h.choose(new File(['invalid'],'invalid.json'));await h.$('load-project').event('click');
  const message=h.statuses.at(-1);assert.match(message,/Файл не открыт/);write.resolve();await copying;
  assert.equal(h.statuses.at(-1),message);assert.equal(h.$('copy-mermaid').disabled,false);
});

test('readonly navigation transient includes pending selection, read and clipboard without changing history', async()=>{
  const h=setup(),read=deferred(),bytes=serializeProjectFile(createDemo().snapshot);
  const before=h.model.store.exportFiles();assert.equal(h.actions.transient,false);
  await h.$('file-button').event('click');await h.choose({name:'pending',size:bytes.length,arrayBuffer:()=>read.promise});
  assert.equal(h.actions.transient,true);const load=h.$('load-project').event('click');assert.equal(h.actions.transient,true);
  await h.$('cancel-load').event('click');assert.equal(h.actions.transient,false);read.resolve(bytes.buffer);await load;
  const copy=deferred();h.window.navigator.clipboard.writeText=()=>copy.promise;
  const copying=h.$('copy-mermaid').event('click');assert.equal(h.actions.transient,true);copy.resolve();await copying;assert.equal(h.actions.transient,false);
  assert.deepEqual(h.model.store.exportFiles(),before);assert.deepEqual(h.model.store.history,{undo:0,redo:0});assert.equal(h.session.dirty,false);
});


test('a newer layout gesture generation rejects a pending import without replacing state or clearing redo',async()=>{
  const h=setup(),read=deferred(),bytes=serializeProjectFile(createDemo().snapshot);
  h.rename('Committed');h.rename('Redo');h.model.undo();h.actions.refresh();
  const before=h.model.store.exportFiles(),history=h.model.store.history,revision=h.model.store.revision;
  await h.$('file-button').event('click');await h.choose({name:'old',size:bytes.length,arrayBuffer:()=>read.promise});
  const pending=h.$('load-project').event('click');h.interactionGeneration++;
  read.resolve(bytes.buffer);await pending;
  assert.equal(h.afterLoads,0);assert.equal(h.model.store.revision,revision);assert.equal(h.session.dirty,true);
  assert.deepEqual(h.model.store.exportFiles(),before);assert.deepEqual(h.model.store.history,history);
  assert.match(h.statuses.at(-1),/Файл не открыт/);
});

test('new model and reset example prepare detached replacements; Cancel and Close preserve data and both histories', async()=>{
  for(const action of ['new-project','reset-example'])for(const cancel of ['cancel','close']){
    const h=setup();h.rename('Keep committed');h.rename('Keep redo');h.model.undo();h.actions.refresh();
    const before=h.model.store.exportFiles(),history=h.model.store.history,revision=h.model.store.revision;
    await h.$('file-button').event('click');await h.$(action).event('click');
    assert.equal(h.actions.transient,true);assert.equal(h.$('replace-project').hidden,false);assert.match(h.$('replace-description').textContent,/изменения будут потеряны/);
    assert.deepEqual(h.model.store.exportFiles(),before);assert.deepEqual(h.model.store.history,history);assert.equal(h.model.store.revision,revision);assert.equal(h.session.dirty,true);
    if(cancel==='cancel')await h.$('cancel-load').event('click');else h.$('file-dialog').close();
    await h.$('load-project').event('click');assert.equal(h.actions.transient,false);assert.equal(h.afterLoads,0);
    assert.deepEqual(h.model.store.exportFiles(),before);assert.deepEqual(h.model.store.history,history);assert.equal(h.session.dirty,true);
  }
});

test('confirmed new model has one empty view and reset example has only current typed data, each loading once', async()=>{
  for(const action of ['new-project','reset-example']){
    const h=setup();h.rename('Unsaved model');h.model.select({kind:'occurrence',id:h.model.view.occurrences[0].id});h.model.beginDrag(h.model.view.occurrences[0].id);
    const revision=h.model.store.revision;
    await h.$('file-button').event('click');await h.$(action).event('click');await h.$('load-project').event('click');await h.$('load-project').event('click');
    const state=h.model.store.snapshot;
    assert.deepEqual(state.project.metamodel,{id:'schemka-archimate4',version:2});assert.equal(h.model.store.revision,revision+1);assert.deepEqual(h.model.store.history,{undo:0,redo:0});
    assert.equal(h.afterLoads,1);assert.equal(h.model.selection,null);assert.equal(h.model.drag,null);assert.equal(h.session.dirty,false);assert.equal(h.handlers.has('beforeunload'),false);assert.equal(h.$('file-dialog').open,false);
    if(action==='new-project'){
      assert.equal(state.project.name,'Новая модель');assert.equal(state.views.length,1);assert.equal(state.elements.length,0);assert.equal(state.relationships.length,0);
      assert.deepEqual(state.views[0].occurrences,[]);assert.deepEqual(state.views[0].connections,[]);assert.equal(h.model.viewId,state.views[0].view.id);
      assert.match(h.$('file-state').textContent,/Новая модель · файл не скачан/);assert.equal(h.actions.sourceLabel,'Новая модель');
    }else{
      assert.equal(state.project.name,'Учебная модель');assert.equal(state.views.length,2);assert.equal(state.elements.length,3);assert.equal(state.relationships.length,2);
      assert.deepEqual(state.elements.map(item=>item.type).sort(),['Function','Process','Service']);assert.deepEqual(state.relationships.map(item=>item.type).sort(),['Flow','Serving']);
      assert.match(h.$('file-state').textContent,/Учебный пример · файл не скачан/);assert.equal(h.actions.sourceLabel,'Синтетический пример');
    }
  }
});

test('prepared new/reset replacements reject later revisions, drafts and gesture generations without data loss', async()=>{
  for(const action of ['new-project','reset-example'])for(const change of ['revision','draft','gesture']){
    const h=setup();h.rename('Committed');h.rename('Redo');h.model.undo();h.actions.refresh();
    await h.$('file-button').event('click');await h.$(action).event('click');
    if(change==='revision')h.rename('Newer model');else if(change==='draft'){h.inline.generation++;h.inline.active=true;}else h.interactionGeneration++;
    const before=h.model.store.exportFiles(),history=h.model.store.history,revision=h.model.store.revision;
    await h.$('load-project').event('click');assert.equal(h.afterLoads,0);assert.match(h.statuses.at(-1),/Файл не открыт/);
    assert.deepEqual(h.model.store.exportFiles(),before);assert.deepEqual(h.model.store.history,history);assert.equal(h.model.store.revision,revision);assert.equal(h.session.dirty,true);
    if(change==='draft')assert.equal(h.inline.active,true);
  }
});

test('new/reset and imported file proposals supersede each other; only the latest confirmed choice replaces the model', async()=>{
  const h=setup();await h.$('file-button').event('click');await h.choose(file());await h.$('new-project').event('click');
  await h.$('load-project').event('click');assert.equal(h.model.store.snapshot.project.name,'Новая модель');
  await h.$('file-button').event('click');await h.$('reset-example').event('click');await h.choose(file());
  await h.$('load-project').event('click');assert.equal(h.model.store.snapshot.project.name,'Opened');assert.equal(h.afterLoads,2);
});

test('busy imports cannot be replaced by synthetic new/reset clicks; cancellation restores those controls', async()=>{
  const h=setup(),read=deferred(),bytes=serializeProjectFile(createDemo().snapshot);await h.$('file-button').event('click');
  await h.choose({name:'Pending import',size:bytes.length,arrayBuffer:()=>read.promise});const pending=h.$('load-project').event('click'),description=h.$('replace-description').textContent;
  for(const action of ['new-project','reset-example']){assert.equal(h.$(action).disabled,true);await h.$(action).event('click');assert.equal(h.$('replace-description').textContent,description);}
  await h.$('cancel-load').event('click');for(const action of ['new-project','reset-example'])assert.equal(h.$(action).disabled,false);
  read.resolve(bytes.buffer);await pending;assert.equal(h.afterLoads,0);assert.equal(h.model.store.revision,0);
});

test('profiled selected-view Mermaid download/copy fails without output, state/history mutation or cleaning the native baseline', async () => {
  for (const kind of ['element', 'relationship']) for (const purpose of ['attributes', 'specialization']) {
    const h = setup(), state = h.model.store.snapshot;
    const object = kind === 'element' ? state.elements[0] : state.relationships[0];
    const created = h.model.execute({ type: 'createCustomizationProfile', definition: { name: 'Synthetic inert profile', purpose, targets: [{ kind, type: object.type }], attributes: {} } });
    h.model.execute({ type: 'setProfileApplication', concept: { kind, id: object.id }, profileId: created.created.profileId, values: {} });
    h.rename('Past'); h.rename('Future'); h.model.undo();
    const capture = () => ({ files: h.model.store.exportFiles(), revision: h.model.store.revision, history: h.model.store.history, dirty: h.session.dirty });
    const before = capture(); assert.ok(before.history.undo && before.history.redo); assert.equal(before.dirty, true);
    let copies = 0; h.window.navigator.clipboard.writeText = async () => { copies++; };
    await h.$('file-button').event('click'); await h.$('download-mermaid').event('click'); await h.$('copy-mermaid').event('click');
    assert.equal(copies, 0); assert.equal(h.downloads.length, 0); assert.deepEqual(capture(), before);
    assert.match(h.statuses.at(-1), /native Schemka/);
  }
});

// Injected preload and dialog results exercise the renderer policy, not native Electron UI.
const opened = async () => { const f = file(); return { status: 'opened', name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }; };
test('disk-only native recovery keeps the current document, migration flag, selection, redo and prepared save', async () => {
  for (const migrated of [false, true]) {
    let acknowledgments = 0;
    const h = setup({ openProject: async () => ({ status: 'recovered', name: 'view.svg',
      message: 'Файл восстановлен на диске, но не открыт в редакторе. Открытая модель и история не изменены.', warning: 'Копии восстановления сохранены.' }),
      documentChanged: async () => { acknowledgments++; return { status: 'bound' }; } });
    if (migrated) { await h.session.loadFile(h.session.beginLoad(), new File([metadataFixture().bytes], 'v2.arkita')); h.model.afterLoad(); }
    h.rename('Keep'); h.rename('Redo'); h.model.undo(); h.actions.refresh();
    h.model.select({ kind: 'occurrence', id: h.model.view.occurrences[0].id });
    const capture = () => ({ files: h.model.store.exportFiles(), history: h.model.store.history, revision: h.model.store.revision,
      selection: h.model.selection, token: h.session.documentToken, dirty: h.session.dirty, requiresSaveAs: h.session.requiresSaveAs });
    const before = capture(), ticket = h.session.prepareSave();
    await h.$('file-button').event('click'); await h.$('desktop-open-project').event('click'); await h.$('load-project').event('click');
    assert.deepEqual(capture(), before); assert.equal(acknowledgments, 0); assert.equal(h.afterLoads, 0);
    assert.equal(h.actions.transient, false); assert.equal(h.$('replace-project').hidden, true); assert.equal(h.$('desktop-open-project').focused, true);
    assert.match(h.statuses.at(-1), /восстановлен на диске, но не открыт/); assert.match(h.statuses.at(-1), /Копии восстановления сохранены/);
    assert.doesNotMatch(h.statuses.at(-1), /Восстановление.*не выполнено/);
    assert.doesNotThrow(() => h.session.completeSave(ticket, { saveAs: true }));
  }
});

test('a recovered model still requires guarded Open; cancellation or newer edits keep current history and never acknowledge it', async () => {
  for (const action of ['cancel', 'stale', 'confirm']) {
    const acknowledgments = [], result = { ...await opened(), candidate: 'recovered-candidate', recovered: true, warning: 'Копии восстановления сохранены.' };
    const h = setup({ openProject: async () => result, documentChanged: async (...args) => { acknowledgments.push(args); return { status: 'bound' }; } });
    h.rename('Keep'); h.rename('Redo'); h.model.undo(); h.actions.refresh();
    await h.$('file-button').event('click'); await h.$('desktop-open-project').event('click');
    assert.equal(h.model.store.snapshot.project.name, 'Keep'); assert.equal(h.afterLoads, 0); assert.deepEqual(acknowledgments, []);
    assert.equal(h.$('replace-project').hidden, false); assert.match(h.statuses.at(-1), /восстановлен на диске.*Подтвердите открытие/);
    if (action === 'stale') h.rename('Newer');
    const before = { files: h.model.store.exportFiles(), history: h.model.store.history, token: h.session.documentToken };
    if (action === 'cancel') await h.$('cancel-load').event('click');
    await h.$('load-project').event('click');
    if (action === 'confirm') {
      assert.equal(h.model.store.snapshot.project.name, 'Opened'); assert.equal(h.afterLoads, 1); assert.equal(h.session.dirty, false);
      assert.deepEqual(acknowledgments, [[before.token, h.session.documentToken, 'recovered-candidate']]);
      assert.match(h.statuses.at(-1), /Копии восстановления сохранены/);
    } else {
      assert.deepEqual({ files: h.model.store.exportFiles(), history: h.model.store.history, token: h.session.documentToken }, before);
      assert.equal(h.session.dirty, true); assert.equal(h.afterLoads, 0); assert.deepEqual(acknowledgments, []);
      assert.match(h.statuses.at(-1), action === 'cancel' ? /Восстановленный файл остаётся на диске/ : /восстановлен на диске, но не открыт/);
    }
  }
});

test('native retained-copy notices survive Save As, current Save and both exports without changing their dirty semantics', async () => {
  const warning = 'Копии восстановления сохранены.', saved = { status: 'saved', name: 'model.arkita', warning };
  const h = setup({ saveProject: async () => ({ ...saved, candidate: 'save' }),
    documentChanged: async (_previous, current) => ({ status: 'bound', directory: { generation: 1, issues: [], binding: null,
      file: { id: 'saved-file', name: 'model.arkita', documentToken: current, blocked: false } } }),
    saveCurrentProject: async () => saved, saveSvg: async () => saved, saveMermaid: async () => saved }, { svgSnapshot: () => staticSvg });
  await h.$('file-button').event('click'); h.rename('Save As');
  await h.$('save-project').event('click'); assert.match(h.statuses.at(-1), /Копии восстановления сохранены/); assert.equal(h.session.dirty, false);
  h.rename('Current save'); await h.actions.save(); assert.match(h.statuses.at(-1), /Копии восстановления сохранены/); assert.equal(h.session.dirty, false);
  h.rename('Unsaved export'); const history = h.model.store.history;
  for (const id of ['download-svg', 'download-mermaid']) {
    await h.$(id).event('click'); assert.match(h.statuses.at(-1), /Копии восстановления сохранены/);
    assert.equal(h.session.dirty, true); assert.deepEqual(h.model.store.history, history);
  }
});

test('desktop picker cancellation/error/malformed bytes preserve model, dirty baseline and both histories', async () => {
  let result = { status: 'cancelled' };
  const h = setup({ openProject: async () => result }); h.rename('Keep'); h.rename('Redo'); h.model.undo();
  const before = h.model.store.exportFiles(), history = h.model.store.history;
  await h.$('file-button').event('click');
  for (const next of [{ status: 'cancelled' }, { status: 'error', message: 'Too large' }, { status: 'opened', name: 'bad', bytes: new Uint8Array([42]) }]) {
    result = next; await h.$('desktop-open-project').event('click'); await h.$('load-project').event('click');
    assert.deepEqual(h.model.store.exportFiles(), before); assert.deepEqual(h.model.store.history, history); assert.equal(h.session.dirty, true);
  }
  result = await opened(); await h.$('desktop-open-project').event('click'); await h.$('load-project').event('click');
  assert.equal(h.model.store.snapshot.project.name, 'Opened'); assert.equal(h.session.dirty, false); assert.deepEqual(h.model.store.history, { undo: 0, redo: 0 });
});
test('desktop picker captures session before async native selection; newer edit/draft/gesture prevents replacement', async () => {
  for (const change of [h => h.rename('Newer'), h => h.inline.generation++, h => h.interactionGeneration++]) {
    const pick = deferred(), h = setup({ openProject: () => pick.promise }); await h.$('file-button').event('click');
    const picking = h.$('desktop-open-project').event('click'); assert.equal(h.actions.transient, true);
    change(h); const before = h.model.store.exportFiles(), history = h.model.store.history;
    pick.resolve(await opened()); await picking; await h.$('load-project').event('click');
    assert.deepEqual(h.model.store.exportFiles(), before); assert.deepEqual(h.model.store.history, history); assert.match(h.statuses.at(-1), /Файл не открыт/);
  }
});
test('desktop close/cancel invalidates pending picker; duplicate invocation is ignored and next picker can succeed', async () => {
  const pick = deferred(); let calls = 0, result = pick.promise;
  const h = setup({ openProject: () => { calls++; return result; } }); await h.$('file-button').event('click');
  const pending = h.$('desktop-open-project').event('click'); await h.$('desktop-open-project').event('click'); assert.equal(calls, 1);
  h.$('file-dialog').close(); await h.$('file-button').event('click'); const statuses = h.statuses.length;
  pick.resolve(await opened()); await pending; assert.equal(h.statuses.length, statuses); assert.equal(h.afterLoads, 0); assert.equal(h.actions.transient, false);
  result = opened(); await h.$('desktop-open-project').event('click'); await h.$('cancel-load').event('click'); await h.$('load-project').event('click'); assert.equal(h.afterLoads, 0);
  await h.$('desktop-open-project').event('click'); await h.$('load-project').event('click'); assert.equal(h.afterLoads, 1);
});
test('desktop save waits for actual acknowledgment; cancellation/failure stays dirty; duplicate save is ignored', async () => {
  let result = { status: 'cancelled' }, calls = 0;
  const h = setup({ saveProject: async () => { calls++; return result; } }); h.rename('Dirty');
  await h.$('save-project').event('click'); assert.equal(h.session.dirty, true);
  result = { status: 'error', message: 'ENOSPC' }; await h.$('save-project').event('click'); assert.equal(h.session.dirty, true); assert.match(h.statuses.at(-1), /ENOSPC/);
  const write = deferred(); result = write.promise; const saving = h.$('save-project').event('click');
  assert.equal(h.session.dirty, true); assert.equal(h.actions.transient, true); await h.$('save-project').event('click'); assert.equal(calls, 3);
  write.resolve({ status: 'saved' }); await saving; assert.equal(h.session.dirty, false); assert.equal(h.actions.transient, false); assert.match(h.statuses.at(-1), /записана на диск/); assert.equal(h.downloads.length, 0);
});
test('desktop Save As acknowledges its exact file candidate before ordinary Save reuses the binding without a picker', async () => {
  const acknowledgment = deferred(), requested = deferred(), picks = [], currentWrites = [], acknowledgments = [];
  let fileState;
  const h = setup({
    saveProject: async (bytes, token) => { picks.push({ bytes: bytes.slice(), token }); return { status: 'saved', name: 'model.arkita', candidate: 'saved-candidate' }; },
    documentChanged: async (previous, current, candidate) => {
      acknowledgments.push({ previous, current, candidate }); requested.resolve(); return acknowledgment.promise;
    },
    saveCurrentProject: async (bytes, token) => { currentWrites.push({ bytes: bytes.slice(), token }); return { status: 'saved', name: 'model.arkita', directory: fileState }; },
  });
  h.rename('Save As snapshot'); const token = h.session.documentToken, expected = serializeProjectFile(h.model.store.snapshot);
  const saving = h.$('save-project').event('click'); await requested.promise;
  assert.deepEqual(acknowledgments, [{ previous: token, current: token, candidate: 'saved-candidate' }]);
  assert.deepEqual(picks, [{ bytes: expected, token }]); assert.equal(h.actions.transient, true);
  await h.actions.save(); assert.equal(picks.length, 1); assert.equal(currentWrites.length, 0);
  fileState = { generation: 1, binding: null, issues: [], file: { id: 'file-1', name: 'model.arkita', documentToken: token, blocked: false } };
  acknowledgment.resolve({ status: 'bound', directory: fileState }); await saving;
  assert.equal(h.actions.transient, false); assert.equal(h.session.dirty, false);
  h.rename('Normal Save snapshot'); const newer = serializeProjectFile(h.model.store.snapshot), history = h.model.store.history;
  await h.actions.save();
  assert.deepEqual(currentWrites, [{ bytes: newer, token }]); assert.equal(picks.length, 1); assert.equal(acknowledgments.length, 1);
  assert.equal(h.session.dirty, false); assert.deepEqual(h.model.store.history, history); assert.equal(h.downloads.length, 0);
});
test('desktop ordinary Save conflict keeps model, redo and dirty baseline and retains the bound-file warning', async () => {
  let pickerCalls = 0, writeCalls = 0;
  const summary = blocked => ({ generation: blocked ? 2 : 1, binding: null, issues: [], file: { id: 'file-1', name: 'shared.arkita', documentToken: h.session.documentToken, blocked } });
  const h = setup({
    saveProject: async () => { pickerCalls++; return { status: 'saved', name: 'shared.arkita', candidate: 'save' }; },
    documentChanged: async () => ({ status: 'bound', directory: summary(false) }),
    saveCurrentProject: async () => { writeCalls++; return { status: 'error', code: 'CONFLICT', message: 'File changed externally', directory: summary(true) }; },
  });
  await h.$('save-project').event('click'); h.rename('Keep current edit'); h.rename('Keep redo'); h.model.undo(); h.actions.refresh();
  const before = { files: h.model.store.exportFiles(), revision: h.model.store.revision, history: h.model.store.history };
  await h.actions.save();
  assert.equal(writeCalls, 1); assert.equal(pickerCalls, 1); assert.equal(h.session.dirty, true); assert.equal(h.actions.directoryWarning, true);
  assert.deepEqual({ files: h.model.store.exportFiles(), revision: h.model.store.revision, history: h.model.store.history }, before);
  assert.match(h.statuses.at(-1), /File changed externally/); assert.equal(h.actions.transient, false);
  h.model.undo(); h.actions.refresh(); assert.equal(h.session.dirty, false); assert.equal(h.actions.directoryWarning, true); assert.equal(h.handlers.has('beforeunload'), true);
});
test('desktop cancelled Save As invalidates a proposed open before native candidate consumption without replacing the model', async () => {
  const acknowledgments = []; let candidate = null, pickNumber = 0, saves = 0;
  const h = setup({
    openProject: async () => ({ ...await opened(), candidate: candidate = `open-${++pickNumber}` }),
    saveProject: async () => { saves++; candidate = null; return { status: 'cancelled' }; },
    documentChanged: async (previous, current, accepted) => {
      acknowledgments.push({ previous, current, accepted });
      return accepted === candidate ? { status: 'bound' } : { status: 'error', message: 'Stale native candidate' };
    },
  });
  h.rename('Preserved current'); h.rename('Preserved redo'); h.model.undo(); h.actions.refresh();
  const before = { files: h.model.store.exportFiles(), revision: h.model.store.revision, history: h.model.store.history, token: h.session.documentToken };
  await h.$('file-button').event('click'); await h.$('desktop-open-project').event('click');
  assert.equal(h.actions.transient, true); assert.equal(h.$('replace-project').hidden, false);
  await h.$('save-project').event('click'); assert.equal(saves, 1); assert.equal(candidate, null);
  assert.equal(h.actions.transient, false); assert.equal(h.$('replace-project').hidden, true); assert.equal(h.$('load-project').disabled, true);
  await h.$('load-project').event('click');
  assert.deepEqual({ files: h.model.store.exportFiles(), revision: h.model.store.revision, history: h.model.store.history, token: h.session.documentToken }, before);
  assert.equal(h.session.dirty, true); assert.equal(h.afterLoads, 0); assert.deepEqual(acknowledgments, []);
  await h.$('desktop-open-project').event('click'); await h.$('load-project').event('click');
  assert.equal(h.afterLoads, 1); assert.equal(acknowledgments.length, 1); assert.equal(acknowledgments[0].accepted, 'open-2');
});
test('desktop late saved snapshot does not clean newer edits or overwrite a newer dialog feedback', async () => {
  const write = deferred(); let captured;
  const h = setup({ saveProject: bytes => { captured = bytes; return write.promise; } }); h.rename('Captured'); await h.$('file-button').event('click');
  const saving = h.$('save-project').event('click'); h.rename('Newer');
  write.resolve({ status: 'saved' }); await saving; assert.equal(h.session.dirty, true); assert.match(h.statuses.at(-1), /Более новые изменения/);
  assert.notDeepEqual(captured, serializeProjectFile(h.model.store.snapshot));
  const late = deferred(); h.window.schemkaDesktop.saveProject = () => late.promise;
  const second = h.$('save-project').event('click'); h.$('file-dialog').close(); await h.$('file-button').event('click'); const count = h.statuses.length;
  late.resolve({ status: 'saved' }); await second; assert.equal(h.statuses.length, count); assert.equal(h.session.dirty, false);
});
test('desktop save acknowledgment for replaced session never changes new model baseline', async () => {
  const write = deferred(), h = setup({ saveProject: () => write.promise }); h.rename('Old');
  const saving = h.$('save-project').event('click');
  await h.session.loadFile(h.session.beginLoad(), file()); h.rename('New document edit');
  write.resolve({ status: 'saved' }); await saving;
  assert.equal(h.model.store.snapshot.project.name, 'New document edit'); assert.equal(h.session.dirty, true);
  assert.match(h.statuses.at(-1), /Файл записан, но открытая модель уже изменилась/);
});
test('desktop Mermaid save uses native bridge and never marks model clean', async () => {
  let text; const h = setup({ saveMermaid: async value => { text = value; return { status: 'saved' }; } }); h.rename('Dirty');
  await h.$('download-mermaid').event('click'); assert.match(text, /^flowchart LR/); assert.equal(h.session.dirty, true); assert.equal(h.downloads.length, 0);
  assert.match(h.statuses.at(-1), /Mermaid записан на диск/);
});

test('desktop cancelled or invalid open returns focus to the visible native picker', async () => {
  const h = setup({ openProject: async () => ({ ...await opened() }) });
  await h.$('file-button').event('click'); await h.$('desktop-open-project').event('click');
  await h.$('cancel-load').event('click');
  assert.equal(h.$('desktop-open-project').focused, true); assert.equal(h.$('project-file').focused, undefined);
  h.$('desktop-open-project').focused = false;
  h.window.schemkaDesktop.openProject = async () => ({ status: 'opened', name: 'bad.arkita', bytes: new Uint8Array([0]) });
  await h.$('desktop-open-project').event('click'); await h.$('load-project').event('click');
  assert.equal(h.$('desktop-open-project').focused, true); assert.match(h.statuses.at(-1), /Файл не открыт/);
});

test('directory recovery warnings expand advanced actions without changing the model', async () => {
  const h = setup({ openDirectory: async () => ({ status: 'error', message: 'Recovery required', directory: {
    binding: null, issues: [{ id: 'r', name: 'root', status: 'recovery-required' }],
  } }), saveDirectory: async () => ({ status: 'cancelled' }) });
  const before = h.model.store.exportFiles();
  assert.equal(h.$('desktop-directory-actions').open, false);
  await h.$('file-button').event('click'); await h.$('desktop-open-directory').event('click');
  assert.equal(h.$('desktop-directory-actions').open, true); assert.equal(h.$('directory-recovery-actions').hidden, false);
  assert.deepEqual(h.model.store.exportFiles(), before); assert.equal(h.session.dirty, false);
});

test('fresh incomplete warning offers rescue without recovery calls or changes to model/history', async () => {
  let recoveryCalls = 0;
  const directory = { generation: 1, binding: null, issues: [{ id: 'fresh', name: 'incomplete-root', status: 'incomplete' }] };
  let saveResult = { status: 'error', message: 'Fresh payload write failed', directory };
  const h = setup({
    openDirectory: async () => ({ status: 'error', code: 'DIRECTORY_INCOMPLETE', message: 'Incomplete fresh save', directory }),
    saveDirectory: async () => saveResult, saveProject: async () => ({ status: 'saved', directory }),
    recoverDirectory: async () => { recoveryCalls++; return { status: 'error', message: 'No journal' }; },
    documentChanged: async (_previous, current) => ({ status: 'bound', directory: { ...directory, generation: 2,
      binding: { id: 'new', name: 'rescued-root', documentToken: current, blocked: false } } }),
  });
  h.rename('Keep'); h.rename('Redo'); h.model.undo(); h.actions.refresh();
  const files = h.model.store.exportFiles(), history = h.model.store.history;
  await h.$('file-button').event('click'); await h.$('desktop-save-directory').event('click');
  assert.equal(h.$('desktop-directory-actions').open, true); assert.equal(h.$('directory-recovery-actions').hidden, true);
  assert.equal(h.$('directory-restore-before').disabled, true); assert.equal(h.$('directory-finish-after').disabled, true);
  assert.match(h.$('directory-status').textContent, /первое сохранение не завершено/);
  assert.match(h.$('directory-status').textContent, /Сохраните открытую модель в другой файл или новый каталог/);
  assert.doesNotMatch(h.$('directory-status').textContent, /требуется восстановление|внешнее изменение/);
  await h.$('desktop-open-directory').event('click');
  await h.$('directory-restore-before').event('click'); await h.$('directory-finish-after').event('click');
  assert.equal(recoveryCalls, 0); assert.equal(h.session.dirty, true); assert.equal(h.actions.transient, false);
  assert.equal(h.$('save-project').disabled, false); assert.equal(h.$('desktop-save-directory').disabled, false);
  assert.deepEqual(h.model.store.exportFiles(), files); assert.deepEqual(h.model.store.history, history);
  await h.$('save-project').event('click'); assert.equal(h.session.dirty, false); assert.equal(h.actions.directoryWarning, true);
  saveResult = { status: 'saved', name: 'rescued-root', candidate: 'rescued', directory };
  await h.$('desktop-save-directory').event('click');
  assert.equal(h.$('desktop-save-bound-directory').disabled, false); assert.equal(h.actions.directoryMismatch, false);
  assert.equal(h.$('directory-recovery-actions').hidden, true); assert.equal(h.handlers.has('beforeunload'), true);
  assert.match(h.$('directory-status').textContent, /incomplete-root.*первое сохранение не завершено/);
  assert.deepEqual(h.model.store.exportFiles(), files); assert.deepEqual(h.model.store.history, history);
});

test('directory picker cancel/close/stale draft/gesture/revision never acknowledges binding or replaces history', async () => {
  for (const change of ['cancel', 'close', 'draft', 'gesture', 'revision']) {
    const pick = deferred(), acknowledgments = [], h = setup({ openDirectory: () => pick.promise, saveDirectory: async () => ({}), documentChanged: async (...args) => { acknowledgments.push(args); return { status: 'bound' }; } });
    h.rename('Keep'); h.rename('Redo'); h.model.undo(); await h.$('file-button').event('click');
    const selecting = h.$('desktop-open-directory').event('click');
    if (change === 'cancel') await h.$('cancel-load').event('click'); else if (change === 'close') h.$('file-dialog').close(); else if (change === 'draft') h.inline.generation++; else if (change === 'gesture') h.interactionGeneration++; else h.rename('Newer');
    const before = h.model.store.exportFiles(), history = h.model.store.history;
    pick.resolve({ ...await opened(), candidate: 'pending', directory: { binding: null, issues: [] } }); await selecting; await h.$('load-project').event('click');
    assert.deepEqual(h.model.store.exportFiles(), before); assert.deepEqual(h.model.store.history, history); assert.equal(acknowledgments.length, 0);
  }
});

test('directory saved baseline is separate from export dirty; older save and restore-before preserve newer model/history and root mismatch', async () => {
  const write = deferred(); let captured, beforeBytes, issue = false;
  const desktop = { saveDirectory: bytes => { captured = bytes.slice(); return write.promise; },
    documentChanged: async (_previous, token) => ({ status: 'bound', directory: { binding: { name: 'native-root', documentToken: token, blocked: false }, issues: [] } }),
    saveProject: async () => ({ status: 'saved' }), saveBoundDirectory: async () => ({ status: 'error', message: 'Needs recovery', directory: { binding: { name: 'native-root', documentToken: h.session.documentToken, blocked: true }, issues: [{ id: 'r', name: 'native-root', status: 'recovery-required' }] } }),
    recoverDirectory: async () => ({ status: 'recovered', name: 'native-root', boundToken: h.session.documentToken, boundBytes: beforeBytes,
      directory: { binding: { name: 'native-root', documentToken: h.session.documentToken, blocked: false }, issues: [] } }) };
  const h = setup(desktop); h.rename('Captured'); const saving = h.$('desktop-save-directory').event('click'); h.rename('Newer');
  write.resolve({ status: 'saved', name: 'native-root', candidate: 'candidate' }); await saving;
  assert.equal(h.session.dirty, true); assert.equal(h.actions.directoryMismatch, true); assert.equal(h.actions.transient, false);
  beforeBytes = captured; await h.$('save-project').event('click'); assert.equal(h.session.dirty, false); assert.equal(h.actions.directoryWarning, true); assert.equal(h.actions.directoryMismatch, true);
  await h.$('desktop-save-bound-directory').event('click'); assert.equal(h.actions.transient, false); assert.equal(h.$('save-project').disabled, false); assert.equal(h.$('desktop-save-directory').disabled, false);
  const before = h.model.store.exportFiles(), history = h.model.store.history;
  await h.$('directory-restore-before').event('click'); assert.deepEqual(h.model.store.exportFiles(), before); assert.deepEqual(h.model.store.history, history);
  assert.equal(h.session.dirty, false); assert.equal(h.actions.directoryMismatch, true); assert.equal(h.actions.directoryWarning, true); assert.equal(h.handlers.has('beforeunload'), true);
});

test('late fresh-directory save for replaced document cannot bind or clean it', async () => {
  const write = deferred(); let acknowledgments = 0;
  const h = setup({ saveDirectory: () => write.promise, documentChanged: async () => { acknowledgments++; return { status: 'bound' }; } });
  h.rename('Old'); const saving = h.$('desktop-save-directory').event('click');
  await h.session.loadFile(h.session.beginLoad(), file()); h.rename('New document');
  write.resolve({ status: 'saved', candidate: 'old', name: 'old-root' }); await saving;
  assert.equal(acknowledgments, 0); assert.equal(h.session.dirty, true); assert.equal(h.model.store.snapshot.project.name, 'New document');
});

test('successful guarded directory load binds once; New and envelope imports detach only after committed replacement', async () => {
  const acknowledgments = [], desktop = { openDirectory: async () => ({ ...await opened(), candidate: 'root' }), saveDirectory: async () => ({}),
    documentChanged: async (previous, current, candidate) => { acknowledgments.push({ previous, current, candidate }); return { status: candidate ? 'bound' : 'detached', directory: { binding: candidate ? { name: 'root', documentToken: current } : null, issues: [] } }; } };
  const h = setup(desktop); await h.$('file-button').event('click'); await h.$('desktop-open-directory').event('click'); assert.equal(acknowledgments.length, 0);
  await h.$('load-project').event('click'); assert.equal(acknowledgments.length, 1); assert.notEqual(acknowledgments[0].previous, acknowledgments[0].current); assert.equal(h.actions.directoryMismatch, false);
  await h.$('file-button').event('click'); await h.$('new-project').event('click'); await h.$('cancel-load').event('click'); assert.equal(acknowledgments.length, 1);
  await h.$('new-project').event('click'); await h.$('load-project').event('click'); assert.equal(acknowledgments.length, 2); assert.equal(acknowledgments[1].candidate, null); assert.equal(h.$('desktop-save-bound-directory').disabled, true);
});

test('finish-after recovery preserves newer renderer edits, undo/redo and dirty state while updating only the bound disk baseline', async () => {
  let afterBytes;
  const binding = () => ({ id: 'root-id', name: 'root', documentToken: h.session.documentToken });
  const h = setup({ saveDirectory: async () => ({ status: 'saved', name: 'root', candidate: 'c' }), documentChanged: async () => ({ status: 'bound', directory: { generation: 1, binding: binding(), issues: [] } }),
    saveBoundDirectory: async bytes => { afterBytes = bytes.slice(); return { status: 'error', message: 'interrupted', directory: { generation: 2, binding: { ...binding(), blocked: true }, issues: [{ id: 'r', name: 'root', status: 'recovery-required' }] } }; },
    recoverDirectory: async () => ({ status: 'recovered', name: 'root', boundToken: h.session.documentToken, boundId: 'root-id', boundBytes: afterBytes,
      directory: { generation: 3, binding: binding(), issues: [] } }) });
  h.rename('Before'); await h.$('desktop-save-directory').event('click'); h.rename('After snapshot'); await h.$('desktop-save-bound-directory').event('click');
  h.rename('Newer edit'); h.rename('Redo'); h.model.undo(); h.actions.refresh(); const files = h.model.store.exportFiles(), history = h.model.store.history;
  await h.$('directory-finish-after').event('click'); assert.deepEqual(h.model.store.exportFiles(), files); assert.deepEqual(h.model.store.history, history);
  assert.equal(h.session.dirty, true); assert.equal(h.actions.directoryMismatch, true); assert.equal(h.actions.transient, false);
});

test('canceled/failed rescue keeps quarantine and history; late old picker summaries cannot hide a newer root or the retained issue', async () => {
  let saveResult = { status: 'saved', name: 'old-root', candidate: 'old' }, exportResult = { status: 'cancelled' };
  const old = () => ({ id: 'old-id', name: 'old-root', documentToken: h.session.documentToken, blocked: true });
  const issues = [{ id: 'r', name: 'old-root', status: 'recovery-required' }], pick = deferred();
  const h = setup({ openDirectory: () => pick.promise, saveDirectory: async () => saveResult, saveProject: async () => exportResult,
    documentChanged: async (_before, current, candidate) => ({ status: 'bound', directory: { generation: candidate === 'old' ? 1 : 4,
      binding: candidate === 'old' ? { ...old(), blocked: false } : { id: 'new-id', name: 'new-root', documentToken: current, blocked: false }, issues: candidate === 'old' ? [] : issues } }),
    saveBoundDirectory: async () => ({ status: 'error', message: 'interrupted', directory: { generation: 2, binding: old(), issues } }) });
  h.rename('Before'); await h.$('desktop-save-directory').event('click'); h.rename('Keep edits'); await h.$('desktop-save-bound-directory').event('click');
  const files = h.model.store.exportFiles(), history = h.model.store.history;
  for (const response of [{ status: 'cancelled' }, { status: 'error', message: 'failed rescue' }]) {
    saveResult = response; exportResult = response; await h.$('desktop-save-directory').event('click'); await h.$('save-project').event('click');
    assert.equal(h.actions.directoryWarning, true); assert.equal(h.session.dirty, true); assert.deepEqual(h.model.store.exportFiles(), files); assert.deepEqual(h.model.store.history, history); assert.equal(h.actions.transient, false);
  }
  exportResult = { status: 'saved' }; await h.$('save-project').event('click'); assert.equal(h.session.dirty, false); assert.equal(h.actions.directoryWarning, true);
  await h.$('file-button').event('click'); const picking = h.$('desktop-open-directory').event('click'); await h.$('cancel-load').event('click');
  saveResult = { status: 'saved', name: 'new-root', candidate: 'new' }; await h.$('desktop-save-directory').event('click');
  pick.resolve({ ...await opened(), candidate: 'obsolete', directory: { generation: 2, binding: old(), issues: [] } }); await picking;
  assert.match(h.$('directory-status').textContent, /Каталог: new-root/); assert.match(h.$('directory-status').textContent, /old-root.*требуется восстановление/);
  assert.equal(h.actions.directoryWarning, true); assert.equal(h.actions.directoryMismatch, false); assert.equal(h.$('desktop-save-bound-directory').disabled, false);
});


test('template/import replacement stays unsaved and has an honest source label; cancellation keeps current model', async () => {
  for (const source of ['template', 'import']) {
    const h = setup(); const before = h.model.store.exportFiles(), input = serializeProjectFile(createDemo().snapshot);
    assert.equal(h.actions.proposeExternal({ bytes: input, name: source, source, unsaved: true }), true);
    await h.$('cancel-load').event('click'); assert.deepEqual(h.model.store.exportFiles(), before);
    h.actions.proposeExternal({ bytes: input, name: source, source, unsaved: true }); await h.$('load-project').event('click');
    assert.equal(h.session.dirty, true); assert.equal(h.session.requiresSaveAs, false); assert.match(h.actions.sourceLabel, source === 'template' ? /шаблона/ : /Импортированная/); assert.doesNotMatch(h.statuses.at(-1), /Git/);
    await h.$('save-project').event('click'); assert.equal(h.session.dirty, false);
  }
});
test('native template/import requests a new window and leaves original dirty model, selection and history intact', async () => {
  let received; const h = setup({ newDocument: async options => { received = options; return { status: 'opened-window' }; } }); h.rename('Keep');
  const before = h.model.store.exportFiles(), history = h.model.store.history, token = h.session.documentToken, input = serializeProjectFile(createDemo().snapshot);
  h.actions.proposeExternal({ bytes: input, name: 'From template', source: 'template', unsaved: true }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(received.source, 'template'); assert.deepEqual(received.bytes, input); assert.deepEqual(h.model.store.exportFiles(), before); assert.deepEqual(h.model.store.history, history); assert.equal(h.session.documentToken, token); assert.equal(h.session.dirty, true); assert.equal(h.actions.transient, false);
});

test('initial native document waits for synchronous editor assembly before capturing generation, then rejects a later edit', async () => {
  const bytes = serializeProjectFile(createDemo().snapshot), ready = deferred(); let calls = 0;
  const h = setup({ documentReady: async () => { calls++; return ready.promise; }, documentChanged: async () => ({ status: 'detached' }) });
  h.interactionGeneration++;
  await Promise.resolve(); assert.equal(calls, 1);
  ready.resolve({ status: 'opened', name: 'Native', bytes });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.afterLoads, 1, h.statuses.join('\n'));
  assert.equal(h.session.dirty, false);
  const late = deferred(), other = setup({ documentReady: async () => late.promise, documentChanged: async () => ({ status: 'detached' }) });
  await Promise.resolve(); other.interactionGeneration++;
  late.resolve({ status: 'opened', name: 'Native', bytes }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(other.afterLoads, 0); assert.match(other.statuses.join('\n'), /editor changed/);
});


test('dirty circle/asterisk is presentation only and refreshes native title even without a model revision',()=>{
 let marker='circle';const titles=[],h=setup({setDocumentTitle:async(...args)=>titles.push(args)},{readDirtyMarker:()=>marker});h.rename('Dirty');assert.match(h.$('file-state').textContent,/^● /);const files=h.model.store.exportFiles(),history=h.model.store.history;marker='asterisk';h.actions.refresh();assert.match(h.$('file-state').textContent,/^\* /);assert.deepEqual(titles.at(-1),['Dirty',true,'asterisk']);assert.deepEqual(h.model.store.exportFiles(),files);assert.deepEqual(h.model.store.history,history);
 const ticket=h.session.prepareSave();h.session.completeSave(ticket);h.actions.refresh();assert.equal(h.$('file-state').textContent.startsWith('*'),false);assert.deepEqual(titles.at(-1),['Dirty',false,'asterisk']);assert.equal(h.session.dirty,false);
});
