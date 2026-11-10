import test from 'node:test';
import {mkdtemp,writeFile,rm,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import { outlineTextRuns } from '../text-outline-service.mjs';
import { validateTextRuns } from '../../schemka-model-io/src/text-outline-profile.js';
const run={text:'Кириллица Arkita — AV',family:'Segoe UI',size:14,weight:400,italic:false,letterSpacing:0};
test('actual system glyph outlines preserve Cyrillic shaping without modifying input or returning font files',async()=>{const before=structuredClone(run),result=await outlineTextRuns([run]);assert.equal(result.status,'ok');assert.ok(result.runs[0].paths.length>5);assert.ok(result.runs[0].paths.some(item=>/[CQ]/.test(item.d)));assert.ok(result.runs[0].advance>0);assert.deepEqual(run,before);assert.deepEqual(Object.keys(result.runs[0]).sort(),['advance','font','paths','unitsPerEm']);});
test('font parser bounds, missing fonts and cancellation fail explicitly',async()=>{assert.throws(()=>validateTextRuns([{...run,filename:'/secret'}]));assert.throws(()=>validateTextRuns([{...run,text:'a'.repeat(100001)}]));await assert.rejects(outlineTextRuns([run],{platform:'win32',fontsDir:'/definitely-absent-arkita-fonts'}),{code:'FONT_MISSING'});const controller=new AbortController();controller.abort();await assert.rejects(outlineTextRuns([run],{signal:controller.signal}),{code:'EXPORT_CANCELLED'});});

test('native font worker runs from node --test even when the host has flags unsupported by explicit worker execArgv',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'arkita-font-flags-'));try{const file=path.join(directory,'worker.test.mjs'),service=new URL('../text-outline-service.mjs',import.meta.url).href;await writeFile(file,`import test from 'node:test';import assert from 'node:assert/strict';import {outlineTextRuns} from ${JSON.stringify(service)};test('actual glyph worker',async()=>{const result=await outlineTextRuns([${JSON.stringify(run)}]);assert.equal(result.status,'ok');assert.ok(result.runs[0].paths.length>5);});`);const result=spawnSync(process.execPath,['--tls-cipher-list=DEFAULT','--test',file],{encoding:'utf8',timeout:15000,maxBuffer:1024*1024});assert.equal(result.status,0,result.stderr+result.stdout);}finally{await rm(directory,{recursive:true,force:true});}
});

test('Windows Segoe UI 600 uses its actual Semibold face, rather than silently selecting Bold', {skip:process.platform==='win32'},async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'arkita-font-face-'));try{await copyFile('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',path.join(directory,'seguisb.ttf'));const result=await outlineTextRuns([{...run,weight:600}],{platform:'win32',fontsDir:directory});assert.equal(result.status,'ok');assert.ok(result.runs[0].paths.length>5);}finally{await rm(directory,{recursive:true,force:true});}
});
