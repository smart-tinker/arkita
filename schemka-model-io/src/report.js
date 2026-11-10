import { validateProject } from '../../schemka-model-core/src/index.js';
import { id } from '../../schemka-model-core/src/format.js';
import { validateAsset } from '../../schemka-model-core/src/native-v4.js';
import { modelSearchRecords } from '../../schemka-model-core/src/model-search.js';
import { assertSvgExport } from './svg-export-profile.js';
import { escapeHtml as h, reportMarkdown } from './report-markdown.js';

const sections = Object.freeze(['summary', 'views', 'elements', 'relationships', 'folders', 'properties']);
export const DEFAULT_REPORT_TEMPLATE = Object.freeze({ format: 'arkita-report-template', version: 1, title: '${model.name}', locale: 'ru-RU', sections, footer: 'Arkita' });
export function readReportTemplate(text) {
  if (typeof text !== 'string' || text.length > 32768) throw new Error('Шаблон отчёта слишком велик.');
  const template = JSON.parse(text); if (!template || typeof template !== 'object' || Array.isArray(template) || Object.keys(template).some(key => !['format', 'version', 'title', 'locale', 'sections', 'footer', 'logoAssetId'].includes(key)) || Object.keys(DEFAULT_REPORT_TEMPLATE).some(key => !Object.hasOwn(template, key)) || template.format !== 'arkita-report-template' || template.version !== 1 || !['ru-RU', 'en-US'].includes(template.locale) || !Array.isArray(template.sections) || !template.sections.length || new Set(template.sections).size !== template.sections.length || template.sections.some(key => !sections.includes(key)) || ['title', 'footer'].some(key => typeof template[key] !== 'string' || template[key].length > 8192)) throw new Error('Неподдерживаемый шаблон отчёта Arkita v1.');
  if (Object.hasOwn(template, 'logoAssetId')) id(template.logoAssetId, 'ast');
  return structuredClone(template);
}

/** The template stores a model resource reference, never an external image URL. */
export function resolveReportLogo(state, template) {
  if (!Object.hasOwn(template, 'logoAssetId')) return null;
  id(template.logoAssetId, 'ast');
  const asset = state.assets.find(item => item.id === template.logoAssetId);
  if (!asset) throw new Error('Ресурс логотипа отсутствует в этой модели. Выберите другое изображение или «Без логотипа».');
  const size = validateAsset(asset), scale = Math.min(1, 160 / size.width, 64 / size.height);
  return { asset, width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) };
}

/** Exclusion is applied before rendering diagrams or serialising any report data. */
export function prepareReportProject(state, { excludeIds = [], excludeProperties = [], documentation = true } = {}) {
  validateProject(state); if (!Array.isArray(excludeIds) || !Array.isArray(excludeProperties) || [...excludeIds, ...excludeProperties].some(value => typeof value !== 'string') || typeof documentation !== 'boolean') throw new Error('Неверные параметры исключения.');
  const excluded = new Set(excludeIds), keys = new Set(excludeProperties), snapshot = structuredClone(state), warnings = [];
  if (excluded.has(state.project.id)) throw new Error('Нельзя исключить корень отчёта.');
  const original = new Map(state.folders.map(item => [item.id, item]));
  // Excluding a folder excludes its descendants and members; hiding navigation is separate.
  for (let changed = true; changed;) { changed = false; for (const folder of state.folders) if (excluded.has(folder.id) || excluded.has(folder.parentFolderId)) { for (const id of [folder.id, ...folder.members.map(ref => ref.id)]) if (!excluded.has(id)) { excluded.add(id); changed = true; } } }
  for (const name of ['elements', 'junctions']) snapshot[name] = snapshot[name].filter(item => !excluded.has(item.id));
  for (let changed = true; changed;) { changed = false; for (const item of snapshot.relationships) if (!excluded.has(item.id) && [item.source, item.target].some(ref => excluded.has(ref.id))) { excluded.add(item.id); changed = true; warnings.push(`Исключено зависимое отношение ${item.id}.`); } }
  snapshot.relationships = snapshot.relationships.filter(item => !excluded.has(item.id)); snapshot.views = snapshot.views.filter(entry => !excluded.has(entry.view.id));
  const viewIds = new Set(snapshot.views.map(entry => entry.view.id));
  for (const entry of snapshot.views) {
    entry.occurrences = entry.occurrences.filter(item => !excluded.has(item.id) && !excluded.has(item.concept.id));
    entry.visualNodes = entry.visualNodes.filter(item => !excluded.has(item.id) && (item.kind !== 'viewReference' || viewIds.has(item.targetViewId)));
    entry.connections = entry.connections.filter(item => !excluded.has(item.id) && !excluded.has(item.relationshipId)); entry.visualConnectors = entry.visualConnectors.filter(item => !excluded.has(item.id));
    for (let changed = true; changed;) {
      const available = new Set([...entry.occurrences, ...entry.visualNodes, ...entry.connections, ...entry.visualConnectors].map(item => item.id)); changed = false;
      for (const name of ['connections', 'visualConnectors']) { const before = entry[name].length; entry[name] = entry[name].filter(item => [item.source, item.target].every(ref => available.has(ref.id))); if (before !== entry[name].length) changed = true; }
    }
    const nodes = new Set([...entry.occurrences, ...entry.visualNodes].map(item => item.id)); for (const item of [...entry.occurrences, ...entry.visualNodes]) if (item.parent && !nodes.has(item.parent.id)) item.parent = null;
  }
  snapshot.folders = snapshot.folders.filter(item => !excluded.has(item.id)); const kept = new Set(snapshot.folders.map(item => item.id));
  for (const folder of snapshot.folders) { while (folder.parentFolderId && !kept.has(folder.parentFolderId)) folder.parentFolderId = original.get(folder.parentFolderId)?.parentFolderId ?? null; folder.members = folder.members.filter(ref => !excluded.has(ref.id)); }
  for (const { item } of modelSearchRecords(snapshot)) { item.properties = item.properties.filter(row => !keys.has(row.key)); if (!documentation) item.documentation = ''; }
  validateProject(snapshot); return { snapshot, warnings, excludedIds: [...excluded] };
}

const words = {
  'ru-RU': { summary: 'Модель', views: 'Представления', elements: 'Объекты', relationships: 'Отношения', folders: 'Папки', properties: 'Свойства', search: 'Поиск в отчёте', reset: 'Сбросить', navigation: 'Фильтр навигации (данные остаются в отчёте)', query: 'Запрос к данным', contains: 'Содержит', run: 'Выполнить', stop: 'Остановить', name: 'Название', documentation: 'Документация', type: 'Тип', id: 'ID', revision: 'Ревизия', empty: '(без названия)', key: 'Ключ', value: 'Значение', zoomOut: 'Уменьшить', zoomIn: 'Увеличить', table: 'Таблица', field: 'Поле' },
  'en-US': { summary: 'Model', views: 'Views', elements: 'Concepts', relationships: 'Relationships', folders: 'Folders', properties: 'Properties', search: 'Search report', reset: 'Reset', navigation: 'Navigation filter (data stays in the report)', query: 'Query report data', contains: 'Contains', run: 'Run', stop: 'Stop', name: 'Name', documentation: 'Documentation', type: 'Type', id: 'ID', revision: 'Revision', empty: '(unnamed)', key: 'Key', value: 'Value', zoomOut: 'Zoom out', zoomIn: 'Zoom in', table: 'Table', field: 'Field' },
};
const css = 'body{font:15px/1.55 "Segoe UI",system-ui,sans-serif;margin:0;color:#172033;background:#fff}header,main,footer{max-width:1100px;margin:auto;padding:24px}nav{display:flex;gap:12px;flex-wrap:wrap}a{color:#1559ad}section{margin:32px 0}article{border-top:1px solid #d9e0eb;padding:16px 0;break-inside:avoid}table{border-collapse:collapse;max-width:100%;overflow-wrap:anywhere}td,th{border:1px solid #d9e0eb;padding:6px 10px;text-align:left}pre{white-space:pre-wrap;background:#f3f5f8;padding:12px}.diagram{overflow:auto;max-width:100%;border:1px solid #d9e0eb}.diagram img{display:block;max-width:none;height:auto}button,input,select{font:inherit;padding:6px;margin:4px}button:focus-visible,a:focus-visible{outline:3px solid #3877bf}small{color:#5b6578}.excluded{padding:10px;background:#fff3d6}[hidden]{display:none!important}@media print{header form,.report-tools,nav{display:none}header,main,footer{padding:0}section{break-before:page}.diagram{overflow:visible;border:0}.diagram img{max-width:100%;width:100%!important}a{color:inherit}}';
/** The same fixed navigation runs in the offline artifact and the in-app preview. */
export function installReportNavigation(root, data) {
  const document = root.ownerDocument ?? root, $ = id => root.querySelector(`[id="${id}"]`), search = $('report-search'), hidden = new Set(), byId = new Map(data.map(row => [row.id, row]));
  const articles = [...root.querySelectorAll('article[data-owner]')]; let task = 0;
  function refresh() {
    const query = search.value.toLocaleLowerCase();
    for (const article of articles) { const row = byId.get(article.dataset.owner); article.hidden = hidden.has(row.kind) || row.folderIds.some(id => hidden.has(id)) || Boolean(query && !row.search.includes(query)); }
  }
  root.addEventListener('click', event => {
    const anchor = event.target.closest('a[href^="#"]'); if (!anchor || !root.contains(anchor)) return;
    const target = $(anchor.getAttribute('href').slice(1)); if (target) { event.preventDefault(); target.scrollIntoView?.({ block: 'start' }); }
  });
  search.addEventListener('input', refresh);
  $('report-reset').onclick = () => { search.value = ''; hidden.clear(); for (const input of root.querySelectorAll('[data-filter]')) input.checked = true; refresh(); };
  for (const input of root.querySelectorAll('[data-filter]')) input.onchange = () => { if (input.checked) hidden.delete(input.dataset.filter); else hidden.add(input.dataset.filter); refresh(); };
  for (const button of root.querySelectorAll('[data-zoom]')) button.onclick = () => {
    const image = $(button.dataset.view), zoom = Math.max(.1, Math.min(8, Number(image.dataset.zoom || 1) * Number(button.dataset.zoom)));
    image.dataset.zoom = zoom; image.style.width = `${Math.round(Number(image.dataset.width) * zoom)}px`;
  };
  $('query-stop').onclick = () => { task++; $('query-status').textContent = (root.lang || document.documentElement.lang).startsWith('ru') ? 'Отменено' : 'Cancelled'; };
  $('query-form').onsubmit = event => {
    event.preventDefault(); const token = ++task, kind = $('query-table').value, field = $('query-field').value, query = $('query-value').value.toLocaleLowerCase(), result = $('query-result'), status = $('query-status');
    result.replaceChildren(); let index = 0, count = 0;
    function step() {
      if (token !== task) return; const end = Math.min(data.length, index + 100);
      for (; index < end; index++) {
        const row = data[index]; if (kind !== 'all' && row.kind !== kind) continue;
        const text = field === 'properties' ? row.properties.map(item => `${item.key} ${item.value}`).join(' ') : String(row[field] ?? ''); if (!text.toLocaleLowerCase().includes(query)) continue;
        const link = document.createElement('a'); link.href = `#${row.id}`; link.textContent = `${row.name} · ${row.id}`; const li = document.createElement('li'); li.append(link); result.append(li); count++;
      }
      status.textContent = `${count} / ${index}`; if (index < data.length) setTimeout(step, 0);
    }
    step();
  };
  return { dispose() { task++; } };
}

const base64 = text => { const bytes = new TextEncoder().encode(text); let out = ''; for (let at = 0; at < bytes.length; at += 16384) out += String.fromCharCode(...bytes.subarray(at, at + 16384)); return btoa(out); };

/** diagrams must be produced from this already filtered project by the real renderer. */
export function generateHtmlReport(state, { revision, diagrams = {}, template = DEFAULT_REPORT_TEMPLATE, externalLinks = false, generatedAt = new Date().toISOString() } = {}) {
  validateProject(state); template = readReportTemplate(JSON.stringify(template)); const w = words[template.locale], logo = resolveReportLogo(state, template);
  if (!Number.isSafeInteger(revision) || revision < 0 || typeof externalLinks !== 'boolean' || !Number.isFinite(Date.parse(generatedAt))) throw new Error('Неверная ревизия или дата отчёта.');
  const parent = new Map(state.folders.flatMap(folder => folder.members.map(ref => [ref.id, folder.id]))), byFolder = new Map(state.folders.map(folder => [folder.id, folder]));
  const allowedKinds = new Set(template.sections.flatMap(section => ({summary:['project'],views:['view','visualNode','visualConnector'],elements:['element','junction'],relationships:['relationship'],folders:['folder'],properties:[]})[section]));
  const records = modelSearchRecords(state).filter(record => allowedKinds.has(record.owner.kind)).map(({ owner, item, name, type, path }) => {
    const folderIds = []; let folder = owner.kind === 'folder' ? item.parentFolderId : parent.get(owner.viewId ?? owner.id); while (folder) { folderIds.push(folder); folder = byFolder.get(folder)?.parentFolderId; }
    const properties = structuredClone(item.properties); return { ...owner, name: name || w.empty, type, path, folderIds, documentation: item.documentation, properties, search: `${name}\n${item.documentation}\n${properties.map(row => `${row.key}\n${row.value}`).join('\n')}`.toLocaleLowerCase() };
  });
  const views = new Set(state.views.map(entry => entry.view.id)); for (const [id, svg] of Object.entries(diagrams)) { if (!views.has(id)) throw new Error('Диаграмма не входит в выбранный набор отчёта.'); assertSvgExport(svg); }
  const title = template.title.replaceAll('${model.name}', state.project.name), renderProperties = rows => rows.length ? `<table><thead><tr><th>${h(w.key)}</th><th>${h(w.value)}</th></tr></thead><tbody>${rows.map(row => `<tr><td>${h(row.key)}</td><td>${h(row.value)}</td></tr>`).join('')}</tbody></table>` : '';
  const article = row => {
    const svg = diagrams[row.id], size = svg && /<svg\s[^>]*\bwidth="([\d.]+)"/.exec(svg), width = Number(size?.[1]) || 900;
    return `<article id="${h(row.id)}" data-owner="${h(row.id)}"><h3>${h(row.name)}</h3><small>${h(row.type)} · ${h(row.id)} · ${h(row.path)}</small>${svg ? `<div class="report-tools"><button data-view="image-${h(row.id)}" data-zoom="0.8" aria-label="${h(w.zoomOut)}">−</button><button data-view="image-${h(row.id)}" data-zoom="1.25" aria-label="${h(w.zoomIn)}">＋</button></div><div class="diagram"><img id="image-${h(row.id)}" alt="${h(row.name)}" data-width="${width}" src="data:image/svg+xml;base64,${base64(svg)}" style="width:${width}px"></div>` : ''}${reportMarkdown(row.documentation, { externalLinks })}${renderProperties(row.properties)}</article>`;
  };
  const groups = { summary: records.filter(row => row.kind === 'project'), views: records.filter(row => ['view', 'visualNode', 'visualConnector'].includes(row.kind)), elements: records.filter(row => ['element', 'junction'].includes(row.kind)), relationships: records.filter(row => row.kind === 'relationship'), folders: records.filter(row => row.kind === 'folder'), properties: [] };
  const queryKinds = ['all', ...new Set(records.map(row => row.kind))];
  const html = `<!doctype html><html lang="${template.locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>${h(title)}</title><style>${css}</style></head><body><header>${logo ? `<img class="report-logo" alt="${h(logo.asset.name)}" src="data:${logo.asset.mediaType};base64,${logo.asset.data}" width="${logo.width}" height="${logo.height}">` : ''}<h1>${h(title)}</h1><p>${h(w.revision)} ${revision} · ${h(new Intl.DateTimeFormat(template.locale, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(generatedAt)))} UTC</p><nav>${template.sections.map(name => `<a href="#section-${name}">${h(w[name])}</a>`).join('')}</nav><label>${h(w.search)}<input id="report-search" type="search"></label><button id="report-reset">${h(w.reset)}</button><details><summary>${h(w.navigation)}</summary>${[...new Set(records.map(row => row.kind))].map(kind => `<label><input type="checkbox" data-filter="${kind}" checked>${h(kind)}</label>`).join('')}${state.folders.map(folder => `<label><input type="checkbox" data-filter="${folder.id}" checked>${h(folder.name)}</label>`).join('')}</details><details><summary>${h(w.query)}</summary><form id="query-form"><select id="query-table" aria-label="${h(w.table)}">${queryKinds.map(kind => `<option>${h(kind)}</option>`).join('')}</select><select id="query-field" aria-label="${h(w.field)}">${['name', 'documentation', 'type', 'id', 'properties'].map(field => `<option value="${field}">${h(w[field])}</option>`).join('')}</select><label>${h(w.contains)}<input id="query-value"></label><button>${h(w.run)}</button><button id="query-stop" type="button">${h(w.stop)}</button></form><output id="query-status"></output><ol id="query-result"></ol></details></header><main>${template.sections.map(name => `<section id="section-${name}"><h2>${h(w[name])}</h2>${name === 'properties' ? `<p>${h(w.properties)}: ${new Intl.NumberFormat(template.locale).format(records.reduce((sum, row) => sum + row.properties.length, 0))}</p>` : groups[name].map(article).join('')}</section>`).join('')}</main><footer>${h(template.footer)}</footer><script type="application/json" id="report-data">${JSON.stringify(records).replaceAll('<', '\\u003c')}</script><script>(${installReportNavigation.toString()})(document, JSON.parse(document.getElementById('report-data').textContent));</script></body></html>`;
  if (new TextEncoder().encode(html).length > 64 * 1024 * 1024) throw new Error('Отчёт превышает 64 MiB. Выберите меньше представлений.');
  return html;
}
