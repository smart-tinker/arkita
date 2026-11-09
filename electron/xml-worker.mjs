import { parentPort,workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { XmlDocument,XsdValidator,XmlParseError,ParseOption,xmlCleanupInputProvider,xmlRegisterInputProvider,XmlBufferInputProvider } from 'libxml2-wasm';
const directory=new URL('../schemka-model-io/schemas/exchange-3.1/',import.meta.url);
let schema,validator,document;
try {
  const manifest=JSON.parse(await readFile(new URL('source.json',directory),'utf8')), buffers={},schemas=[];
  for(const entry of manifest.files) {
    const name=entry.path.split('/').at(-1),bytes=await readFile(new URL(name,directory));
    if(createHash('sha256').update(bytes).digest('hex')!==entry.sha256) throw Object.assign(Error('Нарушена целостность встроенных XML схем.'),{code:'XML_ENGINE'});
    if(name==='Exchange-LICENSE.txt')schemas.push({name,bytes:new Uint8Array(bytes)});
    if(!name.endsWith('.xsd'))continue;
    buffers[name]=bytes; buffers[`arkita-schema:///${name}`]=bytes; if(entry.url)buffers[entry.url]=bytes;
    if(entry.url?.startsWith('https:'))buffers[entry.url.replace('https:','http:')]=bytes;
    schemas.push({name,bytes:new Uint8Array(bytes)});
  }
  schemas.push({name:'Exchange-sources.json',bytes:new Uint8Array(await readFile(new URL('source.json',directory)))});
  // Remove native filesystem/network loaders, then allow only the pinned in-memory schemas.
  xmlCleanupInputProvider();
  const provider=new XmlBufferInputProvider(buffers); xmlRegisterInputProvider({match:()=>true,open:path=>provider.open(path),read:(fd,buffer)=>provider.read(fd,buffer),close:fd=>provider.close(fd)});
  const options={option:ParseOption.XML_PARSE_NONET|ParseOption.XML_PARSE_NO_XXE};
  schema=XmlDocument.fromBuffer(buffers['arkita-exchange.xsd'],{...options,url:'arkita-schema:///arkita-exchange.xsd'});
  validator=XsdValidator.fromDoc(schema);
  document=XmlDocument.fromString(workerData,options);
  validator.validate(document);
  parentPort.postMessage({status:'ok',schema:{version:manifest.version,status:manifest.status,namespace:manifest.namespace},schemas});
} catch(error) {
  const code=error.code??(error instanceof XmlParseError?'XML_SYNTAX':'XML_XSD');
  parentPort.postMessage({status:'error',code,message:code==='XML_ENGINE'?error.message:code==='XML_SYNTAX'?'XML не является корректным документом.':'XML не соответствует закреплённой Exchange XSD 3.1.',diagnostics:(error.details??[]).slice(0,30).map(item=>({line:item.line,column:item.col,message:String(item.message).slice(0,1000)}))});
} finally { document?.dispose();validator?.dispose();schema?.dispose();xmlCleanupInputProvider(); }
