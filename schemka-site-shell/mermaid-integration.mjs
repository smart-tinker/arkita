import fs from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('./', import.meta.url);
const baseline = JSON.parse(fs.readFileSync(new URL('mermaid-source-manifest.json', root), 'utf8'));
const sha = text => createHash('sha256').update(text).digest('hex');
const fail = message => { throw Object.assign(new Error(message), { code: 'PATCH_ANCHOR' }); };

/** Hosted-only, pinned source patch. The original standalone is never patched. */
export function patchMermaidSource(source) {
  if (sha(source) !== baseline.files['src/source-app.js']) fail('Unexpected Mermaid source hash');
  const anchors = [];
  const once = (before, after, label) => {
    if (source.split(before).length !== 2) fail(`Expected one ${label}`);
    anchors.push(label); source = source.replace(before, () => after);
  };
  const line = (prefix, after, label) => {
    const matches = source.split('\n').filter(value => value.startsWith(prefix));
    if (matches.length !== 1) fail(`Expected one ${label} line`);
    once(matches[0], after(matches[0]), label);
  };
  once("    $('fileState').classList.toggle('changed',dirty);\n    $('fileState').textContent=dirty?'Есть изменения':lastExportedText===exactText?'Экспорт подготовлен':'Пример / загруженный файл';", '    updateLeaveIndicator();', 'file indicator');
  line('  function applyView(){', value => value.slice(0, -1) + ';updateLeaveIndicator()}', 'view indicator');
  line('  function download(name,text,type){', () => `  function download(name,text,type){let url;try{url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click()}catch(error){if(url){try{URL.revokeObjectURL(url)}catch{}}throw error}try{setTimeout(()=>URL.revokeObjectURL(url),2000)}catch{try{URL.revokeObjectURL(url)}catch{}}}`, 'download cleanup');
  line("  $('saveMmd').onclick=", () => `  function handoffDocument(format){let dispatched=false;try{const ticket=shellState.captureDownload(),captured=ticket.snapshot;const isJSON=format==='json';download(isJSON?'skhemka-mermaid.json':captured.filename.replace(/\\.json$/i,'')+'.mmd'.repeat(!/\\.mmd$/i.test(captured.filename)),isJSON?JSON.stringify({format:'skhemka-source',version:1,source:captured.text,view:captured.view,filename:captured.filename},null,2):captured.text,isJSON?'application/json':'text/plain');dispatched=true;const accepted=shellState.acceptDownload(ticket,format);if(accepted){dirty=accepted.sourceDirty;lastExportedText=captured.text}updateControls();notify(isJSON?'Файл передан браузеру; проверьте загрузку':'Исходник передан браузеру; вид сохраняется только в JSON')}catch(error){notify(dispatched?'Файл передан браузеру; интерфейс обновлён не полностью. Проверьте загрузку.':'Не удалось передать файл браузеру. Изменения сохранены в этой вкладке.')}}
  $('saveMmd').onclick=()=>handoffDocument('mmd');$('saveJSON').onclick=()=>handoffDocument('json');`, 'download baseline');
  line("  $('copy').onclick=async()=>{", value => value.replace("async()=>{", "async()=>{shellCopies++;try{").replace(/};$/, '}finally{shellCopies--}};'), 'clipboard pending');
  line('  async function readFile(input){', value => value.replace("try{return new TextDecoder", "shellReads++;try{return new TextDecoder").replace(/}}$/, '}finally{shellReads--}}'), 'file read pending');
  line("  document.addEventListener('click',e=>{if(panel==='object'", value => value.replace('#objectPanel,#nodeToolbar,', '.more-wrap,#objectPanel,#nodeToolbar,').replace('#movePanel,#nodeToolbar,', '.more-wrap,#movePanel,#nodeToolbar,'), 'file menu draft preservation');
  const inlineModule = name => {
    const text = fs.readFileSync(new URL(`src/${name}`, root), 'utf8');
    if (/<\/script|\bimport\s|\bexport\b(?! function)/i.test(text) || (text.match(/export function/g) || []).length !== 1) fail(`Unsafe inline helper ${name}`);
    return text.replace('export function', 'function');
  };
  const helpers = inlineModule('mermaid-state.js') + '\n' + inlineModule('navigation.js');
  once("(() => {", "(() => {\n" + helpers + "\n  let shellState=null, shellReads=0, shellCopies=0, shellInteractions=0, shellReady=false;\n  installNavigationGuard({document,window,readState:()=>shellState?.read(),report:notify});", 'early fail-closed guard');
  line("  window.addEventListener('beforeunload'", () => `  // BEGIN audited hosted-only navigation bridge (source and standalone remain pinned).
  function updateLeaveIndicator(){const changed=shellState?shellState.read().dirty:dirty;$('fileState').classList.toggle('changed',changed);$('fileState').textContent=changed?(dirty?'Есть изменения':'Изменён вид / имя · скачайте JSON'):lastExportedText===exactText?'Файл передан браузеру':'Пример / загруженный файл'}
  shellState=createMermaidState({ready:()=>shellReady,snapshot:()=>({text:exactText,view:{...view},filename}),sourceDirty:()=>dirty,transient:()=>Boolean(busy||gesture||resizing||pending||panel!=='none'||connecting||sourceNode||shellReads||shellCopies||$('help').open||$('licenses').open)});
  for(const eventName of ['pointerdown','keydown','input','wheel','change'])window.addEventListener(eventName,()=>{shellInteractions++},true);
  const initialViewTicket=shellState.captureInitialView();setText(SAMPLE);syncCodeVisibility();applyView();const initialRender=renderSource({fitView:true}),initialRenderGeneration=generation;shellReady=true;
  initialRender.then(()=>{shellState.acceptInitialView(initialViewTicket,generation===initialRenderGeneration&&shellInteractions===0&&!dirty);updateLeaveIndicator()});
  // END audited hosted-only navigation bridge`, 'startup bridge');
  return Object.freeze({ source, anchors: Object.freeze(anchors), originalSha256: baseline.files['src/source-app.js'], patchedSha256: sha(source) });
}
