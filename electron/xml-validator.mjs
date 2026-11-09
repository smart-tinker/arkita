import { Worker } from 'node:worker_threads';
import { safeXmlText, xmlFailure } from '../schemka-model-io/src/xml-safety.js';
export async function validateExchangeXml(bytes,{signal}={}) {
  const text=safeXmlText(bytes);
  if(signal?.aborted) throw xmlFailure('XML_CANCELLED','Проверка XML отменена.');
  return new Promise((resolve,reject)=>{
    // V8 limits do not constrain WASM linear memory; lexical budgets and termination also bound the operation.
    const worker=new Worker(new URL('./xml-worker.mjs',import.meta.url),{workerData:text,resourceLimits:{maxOldGenerationSizeMb:64,maxYoungGenerationSizeMb:16,stackSizeMb:4},execArgv:[]});
    let finished=false;
    const finish=(error,result)=>{ if(finished)return; finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);void worker.terminate().then(()=>error?reject(error):resolve(result),reject); };
    const abort=()=>finish(xmlFailure('XML_CANCELLED','Проверка XML отменена.'));
    const timer=setTimeout(()=>finish(xmlFailure('XML_TIMEOUT','Проверка XML превысила 5 секунд.')),5000);
    signal?.addEventListener('abort',abort,{once:true});
    worker.once('message',result=>result.status==='ok'?finish(null,result):finish(Object.assign(xmlFailure(result.code,result.message),{diagnostics:result.diagnostics??[]})));
    worker.once('error',()=>finish(xmlFailure('XML_ENGINE','Изолированная проверка XML завершилась ошибкой.')));
    worker.once('exit',code=>{if(!finished)finish(xmlFailure('XML_ENGINE',`Проверка XML прервана (${code}).`));});
    if(signal?.aborted) abort();
  });
}
