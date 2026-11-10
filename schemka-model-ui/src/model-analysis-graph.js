import { assertSvgExport } from './svg-export.js';

const NS = 'http://www.w3.org/2000/svg';
const key = ref => `${ref.kind}:${ref.id}`;
const short = (text, max = 29) => Array.from(text).length > max ? `${Array.from(text).slice(0, max - 1).join('')}…` : text;
const vector = (document, tag, attributes = {}, text) => {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Incidence visualization: relationships have their own cards so relationship endpoints stay visible. */
export function renderAnalysisGraph({ document, canvas, result, layout = 'columns', orthogonal = false, navigate }) {
  const create = (tag, attrs, text) => vector(document, tag, attrs, text), positions = new Map(), levels = new Map();
  const style = document.defaultView.getComputedStyle(document.documentElement);
  const color = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  const ink = color('--ink', '#172b47'), background = color('--surface', '#ffffff'), border = color('--line', '#738298'), accent = color('--accent', '#386cc9');
  let right = 360, bottom = 140;
  for (const item of result.nodes) {
    const level = item.depth, at = levels.get(level) ?? 0; levels.set(level, at + 1);
    const point = layout === 'rows' ? { x: 40 + at * 280, y: 40 + level * 120 } : { x: 40 + level * 280, y: 40 + at * 120 };
    positions.set(key(item), point); right = Math.max(right, point.x + 280); bottom = Math.max(bottom, point.y + 120);
  }
  const bounds = { x: 0, y: 0, width: right, height: bottom };
  canvas.replaceChildren(); canvas.setAttribute('viewBox', `0 0 ${right} ${bottom}`);
  const defs = create('defs'), marker = create('marker', { id: 'notation-canvas-analysis-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
  marker.append(create('path', { d: 'M0 0 L10 5 L0 10 z', fill: ink })); defs.append(marker); canvas.append(defs);
  canvas.append(create('rect', { x: 0, y: 0, width: right, height: bottom, fill: background }));
  function edge(from, to, relationshipId, side) {
    if (!positions.has(key(from)) || !positions.has(key(to))) return;
    const a = positions.get(key(from)), b = positions.get(key(to));
    let path;
    if (key(from) === key(to)) {
      const offset = side === 'source' ? 0 : 8;
      path = `M${a.x + 160} ${a.y} C${a.x + 160} ${a.y - 30 - offset} ${a.x + 230} ${a.y - 30 - offset} ${a.x + 218} ${a.y}`;
    } else if (Math.abs(a.x - b.x) >= Math.abs(a.y - b.y)) {
      const forward = b.x > a.x, x1 = a.x + (forward ? 220 : 0), x2 = b.x + (forward ? 0 : 220), y1 = a.y + 34, y2 = b.y + 34;
      path = orthogonal ? `M${x1} ${y1} H${(x1 + x2) / 2} V${y2} H${x2}` : `M${x1} ${y1} L${x2} ${y2}`;
    } else {
      const forward = b.y > a.y, x1 = a.x + 110, x2 = b.x + 110, y1 = a.y + (forward ? 68 : 0), y2 = b.y + (forward ? 0 : 68);
      path = orthogonal ? `M${x1} ${y1} V${(y1 + y2) / 2} H${x2} V${y2}` : `M${x1} ${y1} L${x2} ${y2}`;
    }
    canvas.append(create('path', { d: path, fill: 'none', stroke: ink, 'stroke-width': 1.5, 'marker-end': 'url(#notation-canvas-analysis-arrow)', 'data-analysis-edge': relationshipId, 'data-analysis-side': side }));
  }
  for (const item of result.relationships) {
    const relationship = { kind: 'relationship', id: item.id };
    edge(item.source, relationship, item.id, 'source'); edge(relationship, item.target, item.id, 'target');
  }
  for (const item of result.nodes) {
    const point = positions.get(key(item)), full = `${item.kind} · ${item.type} · ${item.name || '(без имени)'} · ${item.id}`;
    const node = create('g', { transform: `translate(${point.x} ${point.y})`, 'data-analysis-kind': item.kind, 'data-analysis-id': item.id, tabindex: 0, role: 'button', 'aria-label': `Сделать центром: ${full}` });
    node.append(create('title', {}, full), create('rect', { x: 0, y: 0, width: 220, height: 68, rx: item.kind === 'relationship' ? 18 : 5, fill: background, stroke: item.root ? accent : border, 'stroke-width': item.root ? 3 : 1.5, 'stroke-dasharray': item.kind === 'junction' ? '4 2' : 'none' }));
    node.append(create('text', { x: 10, y: 18, 'font-family': 'Segoe UI, sans-serif', 'font-size': 11, fill: ink }, short(`${item.kind === 'relationship' ? '↔ ' : item.kind === 'junction' ? '◇ ' : ''}${item.type}`, 29)),
      create('text', { x: 10, y: 38, 'font-family': 'Segoe UI, sans-serif', 'font-size': 13, 'font-weight': 600, fill: ink }, short(item.name || '(без имени)', 25)),
      create('text', { x: 10, y: 56, 'font-family': 'Segoe UI, sans-serif', 'font-size': 10, fill: ink }, `${item.id.slice(-12)} · шаг ${item.depth}`));
    node.addEventListener('click', () => navigate({ kind: item.kind, id: item.id }));
    node.addEventListener('keydown', event => { if (['Enter', ' '].includes(event.key) && !event.isComposing) { event.preventDefault(); event.stopPropagation(); navigate({ kind: item.kind, id: item.id }); } });
    canvas.append(node);
  }
  for (const text of canvas.querySelectorAll('text')) {
    const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text.textContent)].map(item => item.segment), size = Number(text.getAttribute('font-size'));
    const measuredWidth = () => { try { const box = text.getBBox(); if (Number.isFinite(box.x + box.width) && box.width > 0) return box.x + box.width - 10; } catch { /* DOM tests use a conservative width. */ } return [...text.textContent].length * size; };
    while (segments.length > 1 && measuredWidth() > 200) { segments.pop(); text.textContent = `${segments.join('')}…`; }
  }
  return bounds;
}

export function exportAnalysisSvg({ canvas, bounds, title, description }) {
  if (!canvas.isConnected || !bounds || bounds.width <= 0 || bounds.height <= 0) throw Error('Граф ещё не построен.');
  const document = canvas.ownerDocument, svg = vector(document, 'svg', { viewBox: `0 0 ${bounds.width} ${bounds.height}`, width: bounds.width, height: bounds.height, role: 'img', 'aria-labelledby': 'svg-title svg-description' });
  svg.append(vector(document, 'title', { id: 'svg-title' }, title), vector(document, 'desc', { id: 'svg-description' }, description));
  for (const child of canvas.children) svg.append(child.cloneNode(true));
  for (const node of svg.querySelectorAll('*')) for (const attribute of [...node.attributes]) if (attribute.name.startsWith('data-') || ['tabindex', 'aria-label', 'class', 'style'].includes(attribute.name)) node.removeAttribute(attribute.name);
  return assertSvgExport('<?xml version="1.0" encoding="UTF-8"?>\n' + new document.defaultView.XMLSerializer().serializeToString(svg));
}

/** Rasterization is bounded independently from model data; errors never become clipboard success. */
export async function copyAnalysisImage(window, svgText, bounds) {
  if (!window.navigator.clipboard?.write || !window.ClipboardItem) throw Error('Буфер изображений недоступен. Сохраните SVG.');
  const scale = Math.min(1, 4096 / bounds.width, 4096 / bounds.height), width = Math.max(1, Math.ceil(bounds.width * scale)), height = Math.max(1, Math.ceil(bounds.height * scale));
  // The renderer's CSP permits inert data images, not blob image URLs.
  const image = new window.Image(), url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
  try {
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(Error('Не удалось подготовить изображение графа.')); image.src = url; });
    const canvas = window.document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d'); if (!context) throw Error('Растровый вывод недоступен.');
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(Error('Не удалось получить PNG.')), 'image/png'));
    await window.navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
    return { width, height, scale };
  } finally { image.onload = null; image.onerror = null; }
}
