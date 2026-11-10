import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).filter(e=>!['node_modules','.git','dist','vendor','release'].includes(e.name)).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
let count=0;for(const file of walk(root).filter(x=>/\.(js|mjs|cjs)$/.test(x))){const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(r.status!==0){console.error(`Syntax check failed: ${file}: ${r.error?.message || r.signal || `exit ${r.status}`}`);process.exit(r.status??1);}count++;}console.log(`${count} JavaScript files passed syntax checks`);
