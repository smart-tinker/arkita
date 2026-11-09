import { parentPort, workerData } from 'node:worker_threads';
import { readFile,lstat } from 'node:fs/promises';
import path from 'node:path';
import { create } from 'fontkit';
import { validateTextRuns } from '../schemka-model-io/src/text-outline-profile.js';
const fail=message=>{throw Object.assign(Error(message),{code:'FONT_OUTLINE'});};
const families={
  'segoe ui':['segoeui.ttf','segoeuib.ttf','segoeuii.ttf','segoeuiz.ttf'],arial:['arial.ttf','arialbd.ttf','ariali.ttf','arialbi.ttf'],calibri:['calibri.ttf','calibrib.ttf','calibrii.ttf','calibriz.ttf'],tahoma:['tahoma.ttf','tahomabd.ttf',null,null],verdana:['verdana.ttf','verdanab.ttf','verdanai.ttf','verdanaz.ttf'],
};
const linux=['DejaVuSans.ttf','DejaVuSans-Bold.ttf','DejaVuSans-Oblique.ttf','DejaVuSans-BoldOblique.ttf'];
try {
  const {runs,platform}=workerData;validateTextRuns(runs);const windows=platform==='win32',directory=workerData.fontsDir||(windows?path.join(process.env.WINDIR||'C:\\Windows','Fonts'):'/usr/share/fonts/truetype/dejavu'),cache=new Map(),warnings=new Set(),results=[];let outputBytes=0;
  for(const run of runs){
    const requested=run.family.split(',').map(value=>value.trim().replace(/^['"]|['"]$/g,'').toLowerCase()),family=requested.find(value=>families[value]||['system-ui','sans-serif'].includes(value));if(!family)fail(`Нет безопасного системного шрифта для ${run.family}. Выберите текстовый режим.`);
    const mapped=family==='system-ui'?'segoe ui':family==='sans-serif'?'arial':family,index=(run.weight>=600?1:0)+(run.italic?2:0),filename=windows?(mapped==='segoe ui'&&run.weight===600?(run.italic?'seguisbi.ttf':'seguisb.ttf'):families[mapped][index]):linux[index];if(!filename)fail(`Начертание ${mapped} недоступно. Выберите текстовый режим.`);
    if(!windows&&mapped!=='dejavu sans')warnings.add(`Подстановка ${mapped} → DejaVu Sans (система без Windows).`);
    if(!cache.has(filename)){const file=path.join(directory,filename),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32*1024*1024)fail('Системный файл шрифта недоступен или слишком велик.');cache.set(filename,create(await readFile(file)));}
    const font=cache.get(filename);if(!font.unitsPerEm||font.unitsPerEm>16384)fail('Шрифт имеет неподдерживаемые метрики.');
    for(const char of run.text)if(!font.hasGlyphForCodePoint(char.codePointAt(0))&&!/[\u200c\u200d\ufe00-\ufe0f]/u.test(char))fail(`В ${font.familyName} нет знака U+${char.codePointAt(0).toString(16).toUpperCase()}. Выберите текстовый режим.`);
    const layout=font.layout(run.text),paths=[];let x=0,y=0;
    for(let i=0;i<layout.glyphs.length;i++){const glyph=layout.glyphs[i],position=layout.positions[i],d=glyph.path.toSVG();if(d&&(!/^[MLCQZmlcqz0-9eE+.,\s-]+$/.test(d)||d.length>500000))fail('Контур глифа не поддерживается.');if(!d&&glyph.codePoints?.some(point=>!/[\s\u200c\u200d\ufe00-\ufe0f]/u.test(String.fromCodePoint(point))))fail('Цветной или растровый глиф нельзя сохранить векторным контуром. Выберите текстовый режим.');if(d)paths.push({d,x:x+position.xOffset,y:y+position.yOffset});x+=position.xAdvance+run.letterSpacing*font.unitsPerEm/run.size;y+=position.yAdvance;}
    const result={paths,unitsPerEm:font.unitsPerEm,advance:x,font:font.fullName||font.familyName};outputBytes+=Buffer.byteLength(JSON.stringify(result));if(outputBytes>16*1024*1024)fail('Контуры превышают 16 MiB. Выберите меньший вид или текстовый режим.');results.push(result);
  }
  parentPort.postMessage({status:'ok',runs:results,warnings:[...warnings]});
}catch(error){parentPort.postMessage({status:'error',code:error.code==='ENOENT'?'FONT_MISSING':error.code||'FONT_OUTLINE',message:error.code==='ENOENT'?'Системный шрифт не найден. Выберите текстовый режим.':String(error.message).slice(0,1000)});}
