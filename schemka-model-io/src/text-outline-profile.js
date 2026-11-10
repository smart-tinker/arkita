const fail=message=>{throw Object.assign(Error(message),{code:'FONT_OUTLINE'});};
/** Closed IPC text runs; filenames and executable font content never come from the renderer. */
export function validateTextRuns(runs) {
  if(!Array.isArray(runs)||runs.length>5000)fail('Для контуров поддерживается до 5000 строк текста.');let characters=0;
  for(const run of runs){if(!run||Object.getPrototypeOf(run)!==Object.prototype||Object.keys(run).sort().join(',')!=='family,italic,letterSpacing,size,text,weight'||typeof run.text!=='string'||typeof run.family!=='string'||run.family.length>200||/[\x00-\x1f]/.test(run.family)||typeof run.italic!=='boolean'||!Number.isFinite(run.size)||run.size<1||run.size>192||!Number.isInteger(run.weight)||run.weight<100||run.weight>900||!Number.isFinite(run.letterSpacing)||run.letterSpacing< -20||run.letterSpacing>100)fail('Некорректная строка для перевода текста в контуры.');characters+=run.text.length;if(characters>100000)fail('В контурах поддерживается до 100000 знаков.');}
  if(new TextEncoder().encode(JSON.stringify(runs)).length>256*1024)fail('Запрос контуров превышает 256 KiB.');return runs;
}
