import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const port=Number(process.env.PORT??4173);
if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid PORT');
if(!fs.existsSync(path.join(root,'index.html')))throw Error('Run npm run build first');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain','.md':'text/plain'};
export const server=http.createServer((req,res)=>{
 try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});return res.end();}
  const url=new URL(req.url,'http://localhost');
  let pathname=decodeURIComponent(url.pathname);
  if(['/mermaid','/model','/catalog'].includes(pathname)){res.writeHead(308,{'Location':pathname+'/'+url.search});return res.end();}
  if(pathname.endsWith('/'))pathname+='index.html';
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)||!Object.hasOwn(mime,path.extname(file)))throw Error('Not found');
  // realpath prevents any accidental symlink escape from the generated directory.
  if(!fs.realpathSync(file).startsWith(fs.realpathSync(root)+path.sep))throw Error('Not found');
  const data=fs.readFileSync(file);
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]+'; charset=utf-8','X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log('Schemka: http://127.0.0.1:'+server.address().port+'/'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
