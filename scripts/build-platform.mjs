import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { patchMermaidSource } from '../schemka-site-shell/mermaid-integration.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist=path.join(root,'dist');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const write=(name,value)=>{const target=path.join(dist,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,value);};
const nav=active=>'<nav class="platform-nav" aria-label="Разделы Схемки">'+[['/','Схемка'],['/mermaid/','Mermaid'],['/model/','ArchiMate 4'],['/catalog/','Каталог услуг']].map(([href,label])=>`<a data-mode-link href="${href}"${href===active?' aria-current="page"':''}>${label}</a>`).join('')+'</nav>';
const css='.platform-nav{flex:none;display:flex;flex-wrap:wrap;gap:8px 24px;padding:10px 22px;background:var(--surface,#fff);color:var(--ink,#132240);border-bottom:1px solid var(--line,#dbe3ef);font:13px/1.5 system-ui}.platform-nav a{color:var(--blue,#0866ff);text-decoration:none}.platform-nav a[aria-current]{font-weight:700;text-decoration:underline}.platform-nav a:focus-visible{outline:3px solid #87b8ff;outline-offset:3px}:root[data-theme="dark"] .platform-nav{background:#182338}';
// Output is generated from source. No runtime SDK, remote baseline or private data.
if(fs.existsSync(dist)&&fs.lstatSync(dist).isSymbolicLink())throw Error('Generated dist must not be a symlink');
fs.rmSync(dist,{recursive:true,force:true});
fs.mkdirSync(dist,{recursive:true});
execFileSync(process.execPath,['scripts/build.cjs'],{cwd:root,stdio:'inherit'});
let mermaid=read('dist/schemka.html');
const original=read('src/source-app.js');
if(!mermaid.includes(original))throw Error('Missing Mermaid source marker');
mermaid=mermaid.replace(original,()=>patchMermaidSource(original).source).replace('</head>',`<style>${css}</style></head>`).replace('</header>','</header>'+nav('/mermaid/'));
write('mermaid/index.html',mermaid);
// The model editor is a standalone product surface. The landing page may link
// into it, but its document and dependency graph do not include the site shell.
write('model/index.html',read('schemka-model-ui/index.html'));
fs.cpSync(path.join(root,'schemka-model-ui/src'),path.join(dist,'model/src'),{recursive:true});
write('model/style.css',read('schemka-model-ui/style.css'));
for(const name of ['palette.html','palette.css'])write('model/'+name,read('schemka-model-ui/'+name));
for(const name of ['schemka-model-core','schemka-model-io','schemka-model-profiles'])fs.cpSync(path.join(root,name,'src'),path.join(dist,name,'src'),{recursive:true});
write('schemka-site-shell/src/navigation.js',read('schemka-site-shell/src/navigation.js'));
write('shell/platform.css',css);
let home=read('schemka-site-shell/src/index.html').replace('</head>','<link rel="stylesheet" href="/shell/platform.css"></head>').replace('</header>','</header>'+nav('/'));
write('index.html',home);
for(const name of ['style.css','chooser.js','theme.js'])write('shell/'+name,read('schemka-site-shell/src/'+name));
for(const name of ['index.html','app.js','catalog.js','style.css','sample-catalog.js'])write('catalog/'+name,read('schemka-catalog/'+name));
for(const name of ['LICENSES.md','THIRD-PARTY-NOTICES.txt'])write(name,read(name));
console.log('Portable static platform built in dist/');
