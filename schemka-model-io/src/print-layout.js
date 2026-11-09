import { assertSvgExport } from './svg-export-profile.js';
const paperSizes = { A4: [210, 297], A3: [297, 420], Letter: [215.9, 279.4] };
export function calculatePrintLayout(svg, options = {}) {
  assertSvgExport(svg); if (!options || typeof options !== 'object' || Array.isArray(options) || Object.keys(options).some(key => !['paper', 'landscape', 'scale'].includes(key))) throw new Error('Неверные настройки печати.');
  const { paper = 'A4', landscape = false, scale = 100 } = options;
  if (!Object.hasOwn(paperSizes, paper) || typeof landscape !== 'boolean' || !Number.isFinite(scale) || scale < 25 || scale > 200) throw new Error('Печать: A4, A3 или Letter; масштаб относительно вписывания 25–200%.');
  const root = /<svg\s[^>]*>/.exec(svg)?.[0], width = Number(/\bwidth="([\d.]+)"/.exec(root)?.[1]), height = Number(/\bheight="([\d.]+)"/.exec(root)?.[1]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || width > 4000000 || height > 4000000) throw new Error('Недопустимый размер диаграммы.');
  let [pageWidthMm, pageHeightMm] = paperSizes[paper]; if (landscape) [pageWidthMm, pageHeightMm] = [pageHeightMm, pageWidthMm];
  const marginMm = 10, contentWidthPx = (pageWidthMm - marginMm * 2) * 96 / 25.4, contentHeightPx = (pageHeightMm - marginMm * 2) * 96 / 25.4;
  const ratio = Math.min(contentWidthPx / width, contentHeightPx / height) * scale / 100, renderWidthPx = width * ratio, renderHeightPx = height * ratio;
  const columns = Math.max(1, Math.ceil(renderWidthPx / contentWidthPx - 1e-9)), rows = Math.max(1, Math.ceil(renderHeightPx / contentHeightPx - 1e-9));
  return { paper, landscape, scale, marginMm, pageWidthMm, pageHeightMm, contentWidthPx, contentHeightPx, renderWidthPx, renderHeightPx, columns, rows, pages: columns * rows,
    tiles: Array.from({ length: columns * rows }, (_value, index) => ({ number: index + 1, column: index % columns, row: Math.floor(index / columns), x: index % columns * contentWidthPx, y: Math.floor(index / columns) * contentHeightPx })) };
}
export function buildPrintDocument(svg, options = {}) {
  const layout = calculatePrintLayout(svg, options);
  // Set the original root's sizes once; duplicated attributes are never accepted as caller input.
  const source = svg.replace(/^<\?xml[^>]*>\s*/, '').replace(/(<svg\s[^>]*?)\bwidth="[\d.]+"/, `$1width="${layout.renderWidthPx}"`).replace(/(<svg\s[^>]*?)\bheight="[\d.]+"/, `$1height="${layout.renderHeightPx}"`);
  const css = `@page{size:${layout.pageWidthMm}mm ${layout.pageHeightMm}mm;margin:${layout.marginMm}mm}html,body{margin:0;padding:0}section{position:relative;width:${layout.contentWidthPx}px;height:${layout.contentHeightPx}px;overflow:hidden;break-after:page}section:last-child{break-after:auto}section>svg{position:absolute;display:block;max-width:none}`;
  const tileSource = tile => source.replace(/\bid="([^"]+)"/g, (_match, id) => `id="page-${tile.number}-${id}"`).replace(/url\(#([^)]+)\)/g, (_match, id) => `url(#page-${tile.number}-${id})`).replace(/aria-labelledby="([^"]+)"/g, (_match, ids) => `aria-labelledby="${ids.split(' ').map(id => `page-${tile.number}-${id}`).join(' ')}"`);
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; object-src 'none'; base-uri 'none'; form-action 'none'"><style>${css}</style></head><body>${layout.tiles.map(tile => `<section aria-label="${tile.number}/${layout.pages}">${tileSource(tile).replace('<svg ', `<svg style="left:${-tile.x}px;top:${-tile.y}px" `)}</section>`).join('')}</body></html>`;
  if (new TextEncoder().encode(html).length > 80 * 1024 * 1024) throw new Error('Документ печати превышает 80 MiB. Уменьшите масштаб или размер представления.'); return { html, layout };
}
