import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFileSync} from 'node:child_process';
import {JSDOM} from 'jsdom';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist');
const read=f=>fs.readFileSync(path.join(dist,f),'utf8');
const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
test('clean build removes stale generated files instead of retaining retired modules',()=>{
 const stale=path.join(dist,'retired-output','stale.js');fs.mkdirSync(path.dirname(stale),{recursive:true});fs.writeFileSync(stale,'throw Error("stale runtime")');
 execFileSync(process.execPath,['scripts/build-platform.mjs'],{cwd:root,stdio:'pipe'});assert.equal(fs.existsSync(stale),false);
});
test('landing links into the standalone editor without editor links back to sibling products',()=>{
 for(const route of ['index.html','mermaid/index.html','catalog/index.html']){
  const html=read(route);for(const href of ['/','/mermaid/','/model/','/catalog/'])assert.ok(html.includes(`href="${href}"`),`${route}: ${href}`);
 }
 const model=read('model/index.html');
 assert.equal(model,fs.readFileSync(path.join(root,'schemka-model-ui/index.html'),'utf8'));
 const dom=new JSDOM(model),document=dom.window.document;
 assert.equal(document.querySelector('.platform-nav,[data-mode-link]'),null);
 for(const anchor of document.querySelectorAll('a[href]'))assert.ok(!['/','/mermaid/','/model/','/catalog/'].includes(anchor.getAttribute('href')));
 assert.equal(document.querySelector('[href="/shell/platform.css"]'),null);dom.window.close();
});

test('standalone editor runtime dependency closure needs no landing, shell or sibling product assets',()=>{
 const visited=new Set(),queue=['model/index.html'];
 while(queue.length){const relative=queue.pop();if(visited.has(relative))continue;visited.add(relative);
  assert.doesNotMatch(relative,/^(?:index\.html|shell\/|schemka-site-shell\/|mermaid\/|catalog\/)/);
  const source=read(relative);let refs=[];
  if(relative.endsWith('.js'))refs=[...source.matchAll(/(?:from\s*|import\s*)['"]([./][^'"]+)['"]/g)].map(m=>m[1]);
  if(relative.endsWith('.html')){const dom=new JSDOM(source);refs=[...dom.window.document.querySelectorAll('[src],link[href]')].map(n=>n.getAttribute('src')??n.getAttribute('href'));dom.window.close();}
  for(const ref of refs){if(!ref||/^(?:https?:|data:|blob:|#)/.test(ref))continue;const target=ref.startsWith('/')?path.resolve(dist,'.'+ref):path.resolve(dist,path.dirname(relative),ref);assert.ok(target.startsWith(dist+path.sep));assert.ok(fs.existsSync(target));queue.push(path.relative(dist,target).split(path.sep).join('/'));}
 }
 assert.ok(visited.has('model/src/app.js'));assert.ok(visited.has('model/src/leave-state.js'));assert.ok([...visited].some(p=>p.startsWith('schemka-model-core/')));
});
test('all static module dependencies and linked local assets resolve inside dist',()=>{
 for(const file of walk(dist)){
  if(!/\.(js|html|css)$/.test(file))continue;
  const source=fs.readFileSync(file,'utf8');
  const refs=file.endsWith('.js')?[...source.matchAll(/(?:from\s*|import\s*)['"]([./][^'"]+)['"]/g)].map(m=>m[1]):file.endsWith('.html')?[...new JSDOM(source).window.document.querySelectorAll('[src],[href]')].map(e=>e.getAttribute('src')??e.getAttribute('href')).filter(ref=>ref&&!ref.startsWith('#')):[];
  for(const ref of refs){if(/^(data:|blob:|https?:)/.test(ref))continue;let target=ref.startsWith('/')?path.resolve(dist,'.'+ref):path.resolve(path.dirname(file),ref);if(ref.endsWith('/'))target=path.join(target,'index.html');assert.ok(target.startsWith(dist+path.sep));assert.ok(fs.existsSync(target),`${file} -> ${ref}`);}
 }
});
test('unimplemented integrations are disabled and truthful',()=>{
 const capabilities=JSON.parse(fs.readFileSync(path.join(root,'platform/capabilities.json')));assert.equal(capabilities.auth.available,false);assert.equal(capabilities.repositorySync.available,false);
 assert.match(read('index.html'),/disabled[^>]*>Войти/);assert.match(read('index.html'),/нет собственного контроля доступа/);
});
test('runtime contains no host SDK or user infrastructure identifiers',()=>{
 for(const file of walk(dist)){assert.doesNotMatch(file,/\.env|private-data|\.openai|node_modules/);if(/\.(html|js)$/.test(file)&&!file.endsWith('schemka.html')&&!file.endsWith('mermaid/index.html'))assert.doesNotMatch(fs.readFileSync(file,'utf8'),/@openai\/sites|sites-runtime/);}
});
test('HTTP routes, redirects, methods, MIME and source isolation',async t=>{
 const child=spawn(process.execPath,['scripts/serve.mjs'],{cwd:root,env:{...process.env,PORT:'0'},stdio:['ignore','pipe','pipe']});t.after(()=>child.kill());
 const base=await new Promise((resolve,reject)=>{let out='';child.stdout.on('data',x=>{out+=x;const match=out.match(/http:\/\/127\.0\.0\.1:\d+/);if(match)resolve(match[0]);});child.once('error',reject);child.once('exit',()=>reject(Error('server exited')));});
 for(const route of ['/','/mermaid/','/model/','/catalog/','/schemka.html']){const response=await fetch(base+route);assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/text\/html/);}
 for(const route of ['/mermaid','/model','/catalog'])assert.equal((await fetch(base+route,{redirect:'manual'})).status,308);
 for(const route of ['/model/legacy/','/model/legacy','/package.json','/.env','/../README.md','/missing','/%2e%2e%2fpackage.json'])assert.equal((await fetch(base+route)).status,404);
 assert.equal((await fetch(base+'/',{method:'POST'})).status,405);assert.equal((await fetch(base+'/',{method:'HEAD'})).status,200);
 assert.match((await fetch(base+'/model/src/app.js')).headers.get('content-type'),/text\/javascript/);
});

test('generated runtime has no retired profiles, activation modules or projection route',()=>{
 for(const file of walk(dist)){const relative=path.relative(dist,file);assert.doesNotMatch(relative,/(?:preview-v[1-7]|legacy|(?:common|application|domain|extended|relationship|preview)-actions)/);}
 const page=read('model/index.html');assert.doesNotMatch(page,/(?:common|application|domain|extended|relationship|preview)-(?:enable|confirm|dialog)/);
 const caps=JSON.parse(fs.readFileSync(path.join(root,'platform/capabilities.json')));assert.equal(caps.archimate.profile,'schemka-archimate4@2');assert.equal('legacyProjection' in caps,false);
 assert.equal(caps.archimate.coreFormatVersion,4);assert.equal(caps.archimate.transportEnvelopeVersion,1);
 assert.equal(caps.archimate.legacyReader,true);assert.equal(caps.archimate.migrationConverter,true);
 assert.deepEqual(caps.archimate.junctionTypes,['AndJunction','OrJunction']);
});
