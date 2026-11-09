import { validateAsset } from '../../schemka-model-core/src/native-v4.js';
import { assertSvgExport } from '../../schemka-model-io/src/svg-export-profile.js';
const HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';
export function rasterDimensions(svg, scale = 1) {
  assertSvgExport(svg); if (!Number.isFinite(scale) || scale < .25 || scale > 4) throw new Error('Масштаб PNG: от 25% до 400%.');
  const root = /<svg\s[^>]*>/.exec(svg)?.[0], width = Number(/\bwidth="([\d.]+)"/.exec(root)?.[1]), height = Number(/\bheight="([\d.]+)"/.exec(root)?.[1]);
  const dimensions = { width: Math.ceil(width * scale), height: Math.ceil(height * scale) };
  if (!width || !height || !Object.values(dimensions).every(Number.isSafeInteger) || dimensions.width > 16384 || dimensions.height > 16384 || dimensions.width * dimensions.height > 32 * 1024 * 1024) throw new Error('PNG превышает 16384 px по стороне или 32 MiPixel. Уменьшите масштаб.');
  return dimensions;
}
const cancelled = () => Object.assign(new Error('Экспорт отменён.'), { code: 'EXPORT_CANCELLED' });
function waitFor(promise,{window,signal},message) {
  if(signal?.aborted)return Promise.reject(cancelled());
  return new Promise((resolve,reject)=>{
    let done=false;const finish=(error,value)=>{if(done)return;done=true;window.clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);},abort=()=>finish(cancelled()),timer=window.setTimeout(()=>finish(new Error(message)),15000);
    signal?.addEventListener('abort',abort,{once:true});Promise.resolve(promise).then(value=>finish(null,value),error=>finish(error));
  });
}
export async function rasterizeViewSvg(svg, { document, window, scale = 1, transparent = false, signal } = {}) {
  const dimensions = rasterDimensions(svg, scale); if (signal?.aborted) throw cancelled();
  if (transparent) {
    const parsed = new window.DOMParser().parseFromString(svg, 'image/svg+xml'), root = parsed.documentElement, background = root.children[2];
    if (root.children[0]?.localName !== 'title' || root.children[1]?.localName !== 'desc' || background?.localName !== 'rect') throw new Error('Фон этого SVG нельзя безопасно отделить.');
    background.setAttribute('fill', 'none'); svg = assertSvgExport(HEADER + new window.XMLSerializer().serializeToString(root));
  }
  return rasterizeSvgData(svg, dimensions, { document, window, signal });
}
export async function rasterizeEmbeddedSvg(svg, { document, window, signal } = {}) {
  const bytes = new TextEncoder().encode(svg); let binary = ''; for (let at = 0; at < bytes.length; at += 16384) binary += String.fromCharCode(...bytes.subarray(at, at + 16384));
  const size = validateAsset({ id: 'export', name: '', mediaType: 'image/svg+xml', encoding: 'base64', data: window.btoa(binary) });
  return rasterizeSvgData(svg, { width: Math.ceil(size.width), height: Math.ceil(size.height) }, { document, window, signal });
}
async function rasterizeSvgData(svg, dimensions, { document, window, signal }) {
  const bytes = new TextEncoder().encode(svg); let binary = ''; for (let at = 0; at < bytes.length; at += 16384) binary += String.fromCharCode(...bytes.subarray(at, at + 16384));
  await waitFor(document.fonts?.ready,{window,signal},'Шрифты не загрузились за 15 секунд. Повторите экспорт.'); if (signal?.aborted) throw cancelled();
  const image = new window.Image();
  await new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error('Не удалось отрисовать SVG за 15 секунд.')), 15000);
    const abort = () => finish(cancelled());
    function finish(error) { window.clearTimeout(timer); image.onload = image.onerror = null; signal?.removeEventListener('abort', abort); if (error) { image.src = ''; reject(error); } else resolve(); }
    image.onload = () => finish(); image.onerror = () => finish(new Error('SVG не удалось отрисовать для PNG.')); signal?.addEventListener('abort', abort, { once: true }); image.src = `data:image/svg+xml;base64,${window.btoa(binary)}`;
  });
  if (signal?.aborted) throw cancelled(); const canvas = document.createElement('canvas'); Object.assign(canvas, dimensions);
  try {
    const context = canvas.getContext('2d'); if (!context) throw new Error('Растровый renderer недоступен.'); context.drawImage(image, 0, 0, dimensions.width, dimensions.height);
    const blob = await waitFor(new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('PNG encoder не создал изображение.')), 'image/png')),{window,signal},'PNG encoder не завершил работу за 15 секунд.');
    if (signal?.aborted) throw cancelled();if(blob.size>64*1024*1024)throw new Error('PNG превышает 64 MiB.'); const result = new Uint8Array(await waitFor(blob.arrayBuffer(),{window,signal},'PNG не прочитан за 15 секунд.'));
    if (!result.length || result.length > 64 * 1024 * 1024) throw new Error('PNG превышает 64 MiB.'); return result;
  } finally { canvas.width = canvas.height = 0; image.src = ''; }
}
