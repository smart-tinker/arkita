import { Worker } from 'node:worker_threads';
import { validateTextRuns } from '../schemka-model-io/src/text-outline-profile.js';
const fail=(code,message)=>Object.assign(Error(message),{code});
/** Parsing system fonts happens off the main thread, with a finite lifetime and heap. */
export function outlineTextRuns(runs,{signal,timeout=10000,platform=process.platform,fontsDir}={}) {
  validateTextRuns(runs);if(signal?.aborted)return Promise.reject(fail('EXPORT_CANCELLED','Перевод текста в контуры отменён.'));
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./text-outline-worker.mjs',import.meta.url),{workerData:{runs,platform,fontsDir},resourceLimits:{maxOldGenerationSizeMb:128,maxYoungGenerationSizeMb:32,stackSizeMb:4}});let done=false;
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);void worker.terminate();error?reject(error):resolve(value);};
    const cancel=()=>finish(fail('EXPORT_CANCELLED','Перевод текста в контуры отменён.'));const timer=setTimeout(()=>finish(fail('FONT_TIMEOUT','Перевод текста в контуры занял слишком много времени. Выберите текстовый режим или меньший вид.')),timeout);
    signal?.addEventListener('abort',cancel,{once:true});worker.once('message',message=>message.status==='ok'?finish(null,message):finish(fail(message.code||'FONT_OUTLINE',String(message.message).slice(0,1000))));worker.once('error',error=>finish(fail('FONT_OUTLINE',error.message.slice(0,1000))));worker.once('exit',code=>{if(!done)finish(fail('FONT_OUTLINE',`Обработчик шрифтов завершился: ${code}.`));});
  });
}
