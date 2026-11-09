import { DRAWING_COLLECTIONS } from '../../schemka-model-core/src/native-v4.js';
import { crossingPaths, clippingPath } from './connection-presentation.js';
import { legendLayout, legendColor } from './visual-layout.js';
import { connectionGeometry, sampleRoute } from './connection-geometry.js';
import { createNotationPaletteGlyph, notationElement, notationRelationship, cornerGlyphLayout } from './notation.js';

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const captionState = new WeakMap();
const labelOffsets = new WeakMap();
const decoratedPaths = new WeakMap();
const lineKindForStyle = kind => ['connection', 'visualConnector'].includes(kind);
const NS = 'http://www.w3.org/2000/svg';
const round = value => Math.round(value * 10) / 10 || 0;
const vector = (document, tag, attrs = {}, text) => {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
};
export const drawingFor = (view, ref) => view?.[DRAWING_COLLECTIONS[ref?.kind]]?.find(item => item.id === ref.id);
const endpoint = ref => ({ ...ref, kind: ref.kind === 'visualNode' ? 'occurrence' : ref.kind === 'visualConnector' ? 'connection' : ref.kind });

/** Visual connectors share the existing geometry engine, with no semantic concept invented. */
export function visualGeometry(line, view, radiusFor = () => 0, storedGeometry = false) {
  const nodes = [...view.occurrences, ...view.visualNodes];
  const lines = [...view.connections, ...view.visualConnectors].map(item => ({ ...item, source: endpoint(item.source), target: endpoint(item.target) }));
  const copy = lines.find(item => item.id === line.id);
  return connectionGeometry(copy, nodes, item => item.concept ? radiusFor(item) : item.style.shape === 'rounded' ? 8 : item.style.shape === 'ellipse' ? 'ellipse' : 0,
    storedGeometry, lines);
}

export function captionText(template, item, state) {
  return template.replace(/\$\{([^}]+)\}/g, (original, key) => {
    if (key === 'name') return item.name ?? item.label ?? '';
    if (key === 'type') return item.type ?? item.kind ?? '';
    if (key === 'id') return item.id;
    if (key === 'documentation') return item.documentation ?? '';
    if (key === 'model.name') return state.project.name;
    if (key.startsWith('property:')) return (item.properties ?? []).filter(row => row.key === key.slice(9)).map(row => row.value).join(', ');
    return original;
  });
}

export function occurrenceImageLayout(bounds,position='center'){
 const width=Math.max(1,bounds.width),height=Math.max(1,bounds.height),gap=Math.min(8,width/8,height/8),header=Math.min(18,height/5),innerW=Math.max(1,width-gap*2),innerH=Math.max(1,height-header-gap*2),horizontal=['left','right'].includes(position),iw=horizontal?innerW*.45:innerW,ih=horizontal?innerH:innerH*.5,x=position==='right'?width-gap-iw:gap,y=position==='bottom'?height-gap-ih:header+gap;
 return{image:{x,y,width:iw,height:ih},text:horizontal?{x:position==='left'?gap+iw:gap,y:header,width:Math.max(1,innerW-iw),height:innerH}:{x:gap,y:position==='bottom'?header:header+gap+ih,width:innerW,height:Math.max(1,innerH-ih)}};
}

function image(document, asset, bounds, settings = {}) {
  const alignment = { center: 'xMidYMid', top: 'xMidYMin', bottom: 'xMidYMax', left: 'xMinYMid', right: 'xMaxYMid' }[settings.position ?? 'center'];
  return vector(document, 'image', { class: 'drawing-image', x: 0, y: 0, width: bounds.width, height: bounds.height,
    href: `data:${asset.mediaType};base64,${asset.data}`,
    preserveAspectRatio: settings.fit === 'stretch' ? 'none' : `${alignment} ${settings.fit === 'cover' ? 'slice' : 'meet'}` });
}

function shape(document, bounds, variant = 'rectangle') {
  const { width, height } = bounds;
  if (variant === 'actor') {
    const group = vector(document, 'g', { class: 'node-box actor-card-shape' }), cx = width / 2, head = Math.min(width / 8, height / 10);
    group.append(vector(document, 'circle', { cx, cy: height * .16, r: head }), vector(document, 'path', { d: `M${cx} ${height * .16 + head} V${height * .52} M${width * .2} ${height * .34} H${width * .8} M${cx} ${height * .52} L${width * .28} ${height * .75} M${cx} ${height * .52} L${width * .72} ${height * .75}`, fill: 'none' })); return group;
  }
  if (variant === 'ellipse') return vector(document, 'ellipse', { cx: width / 2, cy: height / 2, rx: width / 2, ry: height / 2, class: 'node-box' });
  if (variant === 'folded') {
    const fold = Math.min(14, width / 4, height / 4);
    return vector(document, 'path', { d: `M0 0 H${width - fold} L${width} ${fold} V${height} H0 Z M${width - fold} 0 V${fold} H${width}`, class: 'node-box' });
  }
  return vector(document, 'rect', { width, height, rx: variant === 'rounded' ? Math.min(10, width / 4, height / 4) : 0, class: 'node-box' });
}

function textBlock(document, text, bounds, style, className = 'node-title', captionMode = 'wrap') {
  const size = style.fontSize ?? 14, lineHeight = size * 1.3;
  const count = Math.min(captionMode === 'ellipsis' ? 1 : Infinity,Math.max(0,Math.floor((bounds.height-16)/lineHeight)));
  const width = Math.max(1, bounds.width - 20), capacity = Math.max(1, Math.floor(width / (size * .65)));
  const lines = [];
  for (const raw of (captionMode === 'ellipsis' ? text.replace(/\r\n|\r|\n/g,' ') : text).split(/\r\n|\r|\n/)) {
    const chars = [...graphemes.segment(raw)].map(item => item.segment);
    if (!chars.length) lines.push('');
    for (let at = 0; at < chars.length && lines.length <= count; at += capacity) lines.push(chars.slice(at, at + capacity).join(''));
    if (lines.length > count) break;
  }
  const visible = lines.slice(0, count);
  if (lines.length > count && count) visible[count - 1] = Array.from(visible[count - 1]).slice(0, Math.max(0, capacity - 1)).join('') + '…';
  const align = style.textAlign ?? 'left', anchor = { left: 'start', center: 'middle', right: 'end' }[align];
  const x = align === 'center' ? bounds.width / 2 : align === 'right' ? bounds.width - 10 : 10;
  const height = visible.length * lineHeight;
  const y = style.verticalAlign === 'bottom' ? bounds.height - height - 8 : style.verticalAlign === 'middle' ? (bounds.height - height) / 2 : 8;
  return visible.map((line, at) => vector(document, 'text', { class: className, x, y: round(y + (at + 1) * lineHeight), 'text-anchor': anchor, 'font-size': size }, line));
}

function marker(document, defs, line, end, ending) {
  const id = `notation-canvas-visual-${line.id}-${end}`;
  const result = vector(document, 'marker', { id, viewBox: '0 0 12 12', refX: end === 'source' ? 1 : 11, refY: 6,
    markerWidth: 12, markerHeight: 12, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse' });
  const attrs = { fill: line.style.stroke ?? '#64748b', stroke: line.style.stroke ?? '#64748b', 'stroke-width': 1.2 };
  if (ending === 'circle') result.append(vector(document, 'circle', { ...attrs, cx: 6, cy: 6, r: 4 }));
  else if (ending === 'diamond') result.append(vector(document, 'polygon', { ...attrs, points: '1,6 6,2 11,6 6,10' }));
  else result.append(vector(document, 'path', { ...attrs, fill: ending === 'arrow' ? 'none' : attrs.fill, d: 'M2 2 L10 6 L2 10' + (ending === 'triangle' ? ' Z' : '') }));
  defs.querySelector(`[id="${id}"]`)?.remove(); defs.append(result); return `url(#${id})`;
}

export function renderVisualNode(document, node, state, view) {
  if (node.kind === 'legend' && node.legend.autoSize) node = { ...node, bounds: legendLayout(state, view, node).bounds };
  const group = vector(document, 'g', { class: `node visual-node visual-${node.kind}`, transform: `translate(${node.bounds.x} ${node.bounds.y})`,
    tabindex: 0, role: 'button', 'aria-label': `${node.name || node.kind}. Аннотация`, 'data-kind': 'visualNode', 'data-id': node.id, 'data-rename-kind':'visualNode','data-rename-id':node.id,'data-rename-view-id':view.view.id });
  const text = node.style.labelTemplate ? captionText(node.style.labelTemplate,node.kind==='viewReference'?state.views.find(entry=>entry.view.id===node.targetViewId)?.view??node:node,state) : node.kind === 'note' ? node.text : node.name;
  group.append(vector(document, 'title', {}, `${text || node.name || node.kind}${node.instruction ? '\n' + node.instruction : ''}`));
  group.append(shape(document, node.bounds, node.style.shape === 'default' || !node.style.shape ? node.kind === 'note' ? 'folded' : 'rectangle' : node.style.shape));
  if (node.kind === 'image') {
    const asset = state.assets.find(asset => asset.id === (node.style.image?.assetId ?? node.assetId));
    if (asset&&node.style.imageVisible!==false) group.append(image(document, asset, node.bounds, node.style.image));
    if (text) group.append(...textBlock(document,text,node.bounds,{...node.style,verticalAlign:node.style.verticalAlign ?? 'bottom'},'node-title',view.captionMode));
  } else if (node.kind === 'legend') {
    const { entries, rows,columns,cell, rowHeight, start, offset } = legendLayout(state, view, node), align = node.style.textAlign ?? 'left', anchor = {left:'start',center:'middle',right:'end'}[align];
    if (node.name) {
      const clipId = `notation-canvas-visual-${node.id}-legend-title`, clip = vector(document,'clipPath',{id:clipId}); clip.append(vector(document,'rect',{x:8,y:offset+2,width:Math.max(0,node.bounds.width-16),height:(node.style.fontSize ?? 12)*1.5}));
      group.append(clip,vector(document, 'text', { x: align === 'center' ? node.bounds.width/2 : align === 'right' ? node.bounds.width-10 : 10, y: (node.style.fontSize ?? 12) + 6 + offset, 'text-anchor':anchor, 'clip-path':`url(#${clipId})`, 'font-size': node.style.fontSize ?? 12, class: 'legend-title' }, text));
    }
    entries.forEach((item, at) => {
      const column=node.legend.rowsPerColumn?Math.floor(at/rows):at%columns,row=node.legend.rowsPerColumn?at%rows:Math.floor(at/columns),x = 10 + column * cell, y = start + row * rowHeight;
      if (y > node.bounds.height - 5) return;
      const clipId = `notation-canvas-visual-${node.id}-legend-${at}`, clip = vector(document, 'clipPath', { id: clipId });
      clip.append(vector(document, 'rect', { x, y: y - rowHeight + 2, width: Math.max(0, Math.min(cell - 6, node.bounds.width - x - 4)), height: rowHeight + 2 }));
      const entry = vector(document, 'g', { class: 'legend-entry', 'clip-path': `url(#${clipId})` });
      const glyph=createNotationPaletteGlyph(document,item.type,state.project.metamodel,'canvas'),symbol=vector(document,'g',{class:'legend-type-symbol legend-swatch',fill:legendColor(item,node.legend.colorScheme),transform:`translate(${x} ${y-14}) scale(0.4)`});for(const child of [...glyph.children])if(child.localName!=='defs')symbol.append(child);for(const shape of symbol.querySelectorAll('.node-box')){shape.setAttribute('fill',legendColor(item,node.legend.colorScheme));if(item.type!=='OrJunction')shape.style.fill=legendColor(item,node.legend.colorScheme);else shape.style.fill='#ffffff';}if(item.profileId)symbol.append(vector(document,'circle',{cx:38,cy:5,r:4,fill:legendColor(item,node.legend.colorScheme),stroke:'#334155'}));
      entry.append(vector(document, 'title', {}, item.name),symbol,
        vector(document, 'text', { x: align === 'center' ? x+(cell+12)/2 : align === 'right' ? x+cell-8 : x+18, y, 'text-anchor':anchor, 'font-size': node.style.fontSize ?? 12, class: 'legend-label' }, item.name)); group.append(clip, entry);
    });
  } else {
    const target = node.kind === 'viewReference' ? state.views.find(entry => entry.view.id === node.targetViewId)?.view : null;
    const caption = node.kind === 'viewReference' ? `↗ ${node.name || target?.name || 'Представление'}` : text;
    group.append(...textBlock(document,caption,node.bounds,node.style,'node-title',view.captionMode));
  }
  return group;
}

export function renderVisualConnector(document, line, view, radiusFor, storedGeometry) {
  const geometry = visualGeometry(line, view, radiusFor, storedGeometry);
  const group = vector(document, 'g', { class: 'connection visual-connector', tabindex: 0, role: 'button',
    'aria-label': `${line.name || 'Визуальный соединитель'}. Не отношение ArchiMate`, 'data-kind': 'visualConnector', 'data-id': line.id, 'data-rename-kind':'visualConnector','data-rename-id':line.id,'data-rename-view-id':view.view.id });
  group.append(vector(document, 'title', {}, line.name || 'Визуальный соединитель'), vector(document, 'path', { class: 'hit', d: geometry.d }),
    vector(document, 'path', { class: 'line', d: geometry.d, fill: 'none' }),
    vector(document, 'text', { class: 'relationship-label', x: geometry.x, y: geometry.y, 'text-anchor': 'middle' }, line.name));
  return group;
}

function styledCaption(document,group,item,style,raw,defs,header='',captionMode='wrap',corner=null) {
  const signature = JSON.stringify([item.bounds.width,item.bounds.height,style,raw,header,captionMode,corner]);
  if (captionState.get(group) === signature) return;
  captionState.set(group, signature);
  const title = group.querySelector('title'); if (title) title.textContent = `${raw}${item.instruction ? '\n' + item.instruction : ''}`;
  for (const old of group.querySelectorAll('.node-type,.node-title,.visual-caption')) old.remove();
  const font = style.fontSize ?? 14, top = header ? Math.min(18, item.bounds.height / 3) : 0;
  const available = { ...item.bounds, height: Math.max(0, item.bounds.height - top) };
  const texts = textBlock(document,raw,available,style,'node-title',captionMode);
  if (header && top >= 12) group.append(vector(document, 'text', { class: 'node-type visual-caption-header', x: 10, y: 12, 'font-size': 10 }, header));
  const clipId = `notation-canvas-visual-${item.id}-caption`;
  if (defs) {
    defs.querySelector(`[id="${clipId}"]`)?.remove();
    const clip = vector(document, 'clipPath', { id: clipId }); clip.append(vector(document, 'rect', { x: 4, y: 3, width: Math.max(0, item.bounds.width - 8), height: Math.max(0, item.bounds.height - 6) })); defs.append(clip);
  }
  const wrapper = vector(document, 'g', { class: 'visual-caption', ...(defs ? { 'clip-path': `url(#${clipId})` } : {}) }); group.append(wrapper);
  const align = style.textAlign ?? 'left';
  for (const text of texts) {
    text.setAttribute('y', Number(text.getAttribute('y')) + top); text.classList.add('visual-caption-text');
    if (style.fontFamily) text.style.fontFamily = style.fontFamily;
    if (style.fontWeight) text.style.fontWeight = style.fontWeight;
    text.style.fontSize = `${font}px`; if (style.textColor) text.style.fill = style.textColor;
    wrapper.append(text);
    try {
      const full = text.textContent, characters = Array.from(graphemes.segment(full), item => item.segment);
      let box = text.getBBox();
      if (![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.height <= 0) continue;
      let right = item.bounds.width - 10;
      if (corner && box.y < corner.y + corner.height && box.y + box.height > corner.y) right = Math.min(right, corner.x - 3);
      const width = Math.max(0, right - 10);
      if (box.width > width) {
        let low = 0, high = characters.length, best = '';
        while (low <= high) { const middle = Math.floor((low + high) / 2); text.textContent = characters.slice(0, middle).join('') + '…'; const trial = text.getBBox(); if (Number.isFinite(trial.width) && trial.width <= width) { best = text.textContent; low = middle + 1; } else high = middle - 1; }
        text.textContent = best; box = text.getBBox();
      }
      if (text.textContent) {
        const left = align === 'center' ? (10 + right - box.width) / 2 : align === 'right' ? right - box.width : 10;
        text.setAttribute('x', 0); text.setAttribute('text-anchor', 'start'); const zero = text.getBBox(); text.setAttribute('x', left - zero.x);
      }
    } catch { /* A clip contains the readable provisional caption when font metrics are unavailable. */ }
  }
}

function nestedConnection(view, connection) {
  if (connection.source.kind !== 'occurrence' || connection.target.kind !== 'occurrence') return false;
  const contains = (child, parent) => {
    const a = child.bounds, b = parent.bounds;
    if (a.x < b.x || a.y < b.y || a.x + a.width > b.x + b.width || a.y + a.height > b.y + b.height) return false;
    let ref = child.parent;
    while (ref) { if (ref.kind === 'occurrence' && ref.id === parent.id) return true; ref = drawingFor(view, ref)?.parent; }
    return false;
  };
  const a = drawingFor(view, connection.source), b = drawingFor(view, connection.target);
  return a && b && (contains(a, b) || contains(b, a));
}

function drawingDOMGroups(canvas) {
  const result=new Map();
  for(const group of canvas.querySelectorAll('[data-kind][data-id]')){const key=`${group.dataset.kind}:${group.dataset.id}`;if(!result.has(key))result.set(key,group);}
  return result;
}

const automaticTextColors = new WeakSet();
const luminance = rgb => rgb.slice(0, 3).map(value => { value /= 255; return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
/** Resolve only the saved hex colors and browser-computed RGB paints used by drawings. */
function paintColor(value, rootStyle) {
  value = (value || '').trim();
  for (let i = 0; value.includes('var(') && i < 8; i++) value = value.replace(/var\((--[\w-]+)\)/g, (_, key) => rootStyle.getPropertyValue(key).trim());
  if (value === 'none' || value === 'transparent') return [0, 0, 0, 0];
  if (/^#[\da-f]{3}$/i.test(value)) value = '#' + [...value.slice(1)].map(char => char + char).join('');
  if (/^#[\da-f]{6}(?:[\da-f]{2})?$/i.test(value)) { const rgb = value.slice(1, 7).match(/../g).map(channel => parseInt(channel, 16)); return [...rgb, value.length === 9 ? parseInt(value.slice(7), 16) / 255 : 1]; }
  if (/^rgba?\(/.test(value)) { const channels = value.match(/[\d.]+/g)?.map(Number); if (channels?.length >= 3) return [channels[0], channels[1], channels[2], channels[3] ?? 1]; }
  return null;
}
/** Color-only refresh keeps active editing, selection and the persisted model intact. */
export function refreshDrawingTextColors(canvas, view, groups = drawingDOMGroups(canvas)) {
  const window = canvas.ownerDocument.defaultView, nodes = new Map();
  for (const [kind, items] of [['occurrence', view.occurrences], ['visualNode', view.visualNodes]]) for (const item of items) nodes.set(`${kind}:${item.id}`, item);
  const targets = [...nodes].filter(([key, item]) => item.style.textColor === undefined && item.kind !== 'image' && item.style.shape !== 'actor' && (item.parent || ['fill', 'fillOpacity', 'gradient'].some(name => Object.hasOwn(item.style, name)) || key.startsWith('visualNode:') && item.kind === 'group' && view.view.background));
  if (!targets.length) return;
  const rootStyle = window.getComputedStyle(canvas.ownerDocument.documentElement), color = value => paintColor(value, rootStyle), backgrounds = new Map();
  const scroll = canvas.closest('.canvas-scroll'), underneath = color(scroll && window.getComputedStyle(scroll).backgroundColor) ?? color(rootStyle.getPropertyValue('--canvas')) ?? [255, 255, 255, 1];
  const canvasPaint = color(window.getComputedStyle(canvas).backgroundColor) ?? [0, 0, 0, 0], base = canvasPaint.slice(0, 3).map((channel, i) => channel * canvasPaint[3] + underneath[i] * (1 - canvasPaint[3]));
  function background(key) {
    if (backgrounds.has(key)) return backgrounds.get(key);
    const item = nodes.get(key), group = groups.get(key);
    if (!item || !group) return [base];
    const behind = item.parent ? background(`${item.parent.kind}:${item.parent.id}`) : [base];
    const shape = item.style.fill === undefined && [...group.querySelectorAll('.custom-drawing-shape,.node-box,.junction-core')].find(node => node.style.display !== 'none'), computed = shape && window.getComputedStyle(shape);
    const paints = item.style.gradient ? [item.style.fill ?? '#ffffff', item.style.gradient.color] : [item.style.fill ?? computed?.fill];
    const computedOpacity = Number.parseFloat(computed?.fillOpacity), opacity = item.style.fillOpacity ?? (Number.isFinite(computedOpacity) ? computedOpacity : 1);
    const mixed = paints.flatMap(value => { const paint = color(value); if (!paint) return behind; const alpha = paint[3] * opacity; return behind.map(back => paint.slice(0, 3).map((channel, i) => channel * alpha + back[i] * (1 - alpha))); });
    mixed.sort((a, b) => luminance(a) - luminance(b)); const result = [mixed[0], mixed.at(-1)]; backgrounds.set(key, result); return result;
  }
  const captions = targets.map(([key]) => ({ key, texts: [...(groups.get(key)?.querySelectorAll('text:not(.stereotype-label):not(.junction-caption)') ?? [])] })), changes = [];
  for (const { texts } of captions) for (const text of texts) if (automaticTextColors.has(text)) { text.style.removeProperty('fill'); automaticTextColors.delete(text); }
  for (const { key, texts } of captions) {
    const light = background(key).map(luminance), ratio = rgb => { const value = luminance(rgb); return Math.min(...light.map(back => (Math.max(value, back) + .05) / (Math.min(value, back) + .05))); };
    for (const text of texts) {
      const foreground = color(window.getComputedStyle(text).fill);
      if (foreground && foreground[3] === 1 && ratio(foreground) >= 4.5) continue;
      changes.push([text, ratio([0, 0, 0]) >= ratio([255, 255, 255]) ? '#000000' : '#ffffff']);
    }
  }
  for (const [text, fill] of changes) { text.style.fill = fill; automaticTextColors.add(text); }
}

/** Apply only validated saved fields. Empty styles retain the established notation. */
export function applyDrawingStyles(canvas, state, view) {
  canvas.style.backgroundColor = view.view.background ?? '';
  const document = canvas.ownerDocument, defs = canvas.querySelector('defs'),groups=drawingDOMGroups(canvas),records={element:new Map(state.elements.map(item=>[item.id,item])),junction:new Map(state.junctions.map(item=>[item.id,item])),relationship:new Map(state.relationships.map(item=>[item.id,item]))},profiles=new Map((state.customizationProfiles??[]).map(item=>[item.id,item])),assets=new Map(state.assets.map(item=>[item.id,item])),views=new Map(state.views.map(item=>[item.view.id,item.view]));
  const ignoredSemantic=[];
  for (const [kind, collection] of Object.entries(DRAWING_COLLECTIONS)) for (const item of view[collection] ?? []) {
    const group = groups.get(`${kind}:${item.id}`);
    if (!group) continue;
    const style = item.style;
    group.querySelector('[data-semantic-line-style-warning]')?.remove();
    if(kind==='connection'&&['strokeDash','sourceEnding','targetEnding'].some(key=>Object.hasOwn(style,key))){ignoredSemantic.push(item.id);group.append(vector(document,'desc',{'data-semantic-line-style-warning':'true'},'Пользовательские пунктир и окончания сохранены, но не применяются: обозначения определяет тип отношения Arkita.'));}
    const record = kind === 'occurrence' ? records[item.concept.kind].get(item.concept.id)
      : kind === 'connection' ? records.relationship.get(item.relationshipId) : item;
    const corner = kind === 'occurrence' && item.concept.kind !== 'junction' && style.iconVisible !== false ? cornerGlyphLayout(notationElement(state.project.metamodel, record.type), item.bounds) : null;
    if (kind === 'occurrence' && style.shape && style.shape !== 'default') {
      for (const old of group.querySelectorAll('.custom-drawing-shape')) old.remove();
      for (const old of group.querySelectorAll('.node-box,.node-band,.node-tab')) old.style.display = 'none';
      const outline = shape(document, item.bounds, style.shape); outline.classList.add('custom-drawing-shape'); group.insertBefore(outline, group.querySelector('text,.visual-caption'));
    }
    if (!lineKindForStyle(kind) && (kind === 'visualNode' && item.kind !== 'legend' || kind === 'occurrence' && item.concept.kind !== 'junction' && (view.captionMode === 'ellipsis' || ['fontFamily','fontSize','fontWeight','textAlign','verticalAlign','labelTemplate','shape','image','imageVisible'].some(key => Object.hasOwn(style,key))))) {
      const template = style.labelTemplate, raw = template ? captionText(template, kind==='visualNode'&&item.kind==='viewReference'?views.get(item.targetViewId):record, state) : kind === 'visualNode' ? item.kind === 'note' ? item.text : item.kind === 'viewReference' ? `↗ ${item.name || views.get(item.targetViewId)?.name || 'Представление'}` : item.name : record.name;
      styledCaption(document, group, item, style.shape === 'actor' || item.kind === 'image' ? { ...style, verticalAlign: style.verticalAlign ?? 'bottom' } : style, raw, defs, kind === 'occurrence' ? notationElement(state.project.metamodel, record.type).badge.toUpperCase() : '',view.captionMode,corner);
    }
    const shapes = group.querySelectorAll('.node-box,.junction-core,.line');
    for (const shape of shapes) {
      if(shape.closest('.legend-type-symbol'))continue;
      if (style.fill !== undefined) shape.style.fill = style.fill;
      if (style.fillOpacity !== undefined) shape.style.fillOpacity = style.fillOpacity;
      if (style.stroke !== undefined || style.strokeFromFill) shape.style.stroke = style.strokeFromFill ? style.fill ?? document.defaultView.getComputedStyle(shape).fill ?? 'currentColor' : style.stroke;
      if (style.strokeWidth !== undefined) shape.style.strokeWidth = style.strokeWidth;
      if(kind==='connection')shape.style.strokeDasharray='';
      else if (style.strokeDash !== undefined) shape.style.strokeDasharray = { solid: 'none', dash: '8 4', dot: '2 4' }[style.strokeDash];
      if (style.gradient && defs) {
        const id = `notation-canvas-visual-${item.id}-gradient`, horizontal = style.gradient.direction === 'horizontal';
        const gradient = vector(document, 'linearGradient', { id, x1: '0%', y1: '0%', x2: horizontal ? '100%' : '0%', y2: horizontal ? '0%' : '100%' });
        gradient.append(vector(document, 'stop', { offset: '0%', 'stop-color': style.fill ?? '#ffffff' }), vector(document, 'stop', { offset: '100%', 'stop-color': style.gradient.color }));
        defs.querySelector(`[id="${id}"]`)?.remove(); defs.append(gradient);
        shape.style.fill = `url(#${id})`;
      }
    }
    for (const text of group.querySelectorAll('text')) {
      if (style.textColor !== undefined) text.style.fill = style.textColor;
      if (style.fontFamily !== undefined) text.style.fontFamily = style.fontFamily;
      if (style.fontSize !== undefined && !text.classList.contains('visual-caption-header')) text.style.fontSize = `${style.fontSize}px`;
      if (style.fontWeight !== undefined) text.style.fontWeight = style.fontWeight;
    }
    for (const glyph of group.querySelectorAll('.node-glyph,.node-detail,.junction-symbol')) {
      if (style.iconColor !== undefined) { glyph.style.stroke = style.iconColor; if (glyph.classList.contains('node-detail-solid')) glyph.style.fill = style.iconColor; }
      glyph.style.display=style.iconVisible===false?'none':'';
    }
    if (['occurrence', 'visualNode'].includes(kind) && !(kind === 'visualNode' && item.kind === 'image')) {
      const profileImage = kind === 'occurrence' ? (record.profileApplications ?? []).map(application => profiles.get(application.profileId)).find(profile => profile?.purpose==='specialization'&&profile.imageAssetId)?.imageAssetId : null;
      const settings = style.imageVisible===false?null:style.image ?? (profileImage ? { assetId: profileImage, fit: 'contain', position: 'center' } : null);
      for (const old of group.querySelectorAll('.drawing-image')) old.remove();
      if (settings) { const asset = assets.get(settings.assetId); if (asset) { const icon = image(document,asset,item.bounds,settings); if (kind === 'occurrence') {const size=Math.min(32,item.bounds.width/4,item.bounds.height/3),inherited=!style.image,box=inherited?{x:item.bounds.width-size-6,y:6,width:size,height:size}:occurrenceImageLayout(item.bounds,settings.position).image;for(const[key,value]of Object.entries(box))icon.setAttribute(key,value);icon.classList.add('specialization-icon');if(!inherited){const area=occurrenceImageLayout(item.bounds,settings.position).text,raw=style.labelTemplate?captionText(style.labelTemplate,record,state):record.name;styledCaption(document,group,{...item,bounds:{...item.bounds,width:area.width,height:area.height}},style,raw,defs,notationElement(state.project.metamodel,record.type).badge.toUpperCase(),view.captionMode,corner && {...corner,x:corner.x-area.x,y:corner.y-area.y});group.querySelector('.visual-caption')?.setAttribute('transform',`translate(${area.x} ${area.y})`);}}  group.insertBefore(icon,group.querySelector('text,.visual-caption')); } }
    }
    if(style.iconVisible===undefined&&group.querySelector('.drawing-image'))for(const glyph of group.querySelectorAll('.node-glyph,.node-detail'))glyph.style.display='none';
    if (['occurrence','visualNode'].includes(kind) && style.labelVisible === false) for (const label of group.querySelectorAll('text,.visual-caption')) label.style.display = 'none';
    if (['connection', 'visualConnector'].includes(kind)) {
      const label = group.querySelector('.relationship-label');
      if (label && style.labelTemplate) label.textContent = captionText(style.labelTemplate, record, state);
      if (label && style.labelVisible === false) label.style.display = 'none';
      const path = group.querySelector('.line');
      for (const end of ['source', 'target']) if (kind === 'visualConnector' && style[`${end}Ending`] !== undefined && path) {
        if (style[`${end}Ending`] === 'none') path.removeAttribute(end === 'source' ? 'marker-start' : 'marker-end');
        else if (defs) path.setAttribute(end === 'source' ? 'marker-start' : 'marker-end', marker(document, defs, item, end, style[`${end}Ending`]));
      }
    }
  }
  canvas.querySelector('[data-semantic-style-warning]')?.remove();if(ignoredSemantic.length){const message=`У ${ignoredSemantic.length} семантических линий сохранены пользовательские значения пунктира или окончаний. Они сохранены в модели, но не применяются: обозначения определяет тип отношения Arkita.`;canvas.dataset.semanticStyleWarning=message;const description=vector(document,'desc',{id:'notation-canvas-ignored-semantic-style','data-semantic-style-warning':'true'},message);canvas.append(description);}else delete canvas.dataset.semanticStyleWarning;
  refreshDrawingTextColors(canvas, view, groups);
  applyDrawingGeometryStyles(canvas, view,groups,defs);
}

/** Refresh geometry-dependent styling during a preview without cloning the project. */
export function applyDrawingGeometryStyles(canvas, view,groups = drawingDOMGroups(canvas),defs = [...canvas.children].find(item=>item.localName==='defs')) {
  const document = canvas.ownerDocument,lines=[],clipping=[];
  for (const [kind, collection] of [['connection','connections'], ['visualConnector','visualConnectors']]) for (const item of view[collection]) {
    const group = groups.get(`${kind}:${item.id}`); if (!group) continue;
    const style = item.style;
    if (kind === 'connection') group.style.display = item.hidden || style.hideWhenNested && nestedConnection(view, item) ? 'none' : '';
    const label = group.querySelector('.relationship-label'),path=group.querySelector('.line');
    if(path){const prior=decoratedPaths.get(path),shown=path.getAttribute('d'),raw=prior&&prior.display===shown?prior.raw:shown;path.setAttribute('d',raw);path.removeAttribute('clip-path');decoratedPaths.set(path,{raw,display:raw});if(group.style.display!=='none')lines.push({key:`${kind}:${item.id}`,d:raw,crossing:style.crossing,anchors:(item.routePoints??[]).filter(point=>point.kind==='anchor').map(point=>point.point),path});}
    if (label && style.labelOffset) { const previous = labelOffsets.get(label); const x = Number(label.getAttribute('x')), y = Number(label.getAttribute('y')); const base = previous && previous.x === x && previous.y === y ? previous.base : { x, y }; const next = { x: base.x + style.labelOffset.x, y: base.y + style.labelOffset.y }; label.setAttribute('x', next.x); label.setAttribute('y', next.y); labelOffsets.set(label, { ...next, base }); }
    for (const prior of group.querySelectorAll('.line-label-background')) prior.remove();
    const mode=style.labelBackgroundMode??(style.labelBackground?'opaque':null);
    if(label&&mode&&style.labelVisible!==false&&group.style.display!=='none'&&label.textContent){
      label.style.stroke='none';const box=connectionLabelBox(label,style);
      if(mode==='clip')clipping.push(box);
      else if(mode==='opaque'){const background=style.labelBackground??view.view.background??document.defaultView.getComputedStyle(canvas).backgroundColor;group.insertBefore(vector(document,'rect',{class:'line-label-background',...box,fill:background&&background!=='rgba(0, 0, 0, 0)'?background:'#ffffff',stroke:'none'}),label);}
    }
  }
  const jump=crossingPaths(lines);
  for(const item of lines){const displayed=jump.paths.get(item.key)??item.d;item.path.setAttribute('d',displayed);decoratedPaths.set(item.path,{raw:item.d,display:displayed});}
  canvas.dataset.connectionDecorationWarning=jump.limited?'Мостики не показаны: достигнут предел сложности отображения. Сохранённые линии и модель не изменены.':'';
  const warningId='notation-canvas-connection-decoration-warning';for(const child of [...canvas.children])if(child.id===warningId)child.remove();if(jump.limited)canvas.append(vector(document,'desc',{id:warningId},canvas.dataset.connectionDecorationWarning));
  const clipId='notation-canvas-connection-label-clip';if(defs){for(const prior of [...defs.children])if(prior.id===clipId)prior.remove();if(clipping.length){const clip=vector(document,'clipPath',{id:clipId});clip.append(vector(document,'path',{d:clippingPath(clipping),'clip-rule':'evenodd'}));defs.append(clip);for(const item of lines)item.path.setAttribute('clip-path',`url(#${clipId})`);}}
}

function connectionLabelBox(label,style){
  try{const box=label.getBBox();if([box.x,box.y,box.width,box.height].every(Number.isFinite)&&box.width>0&&box.height>0)return{x:box.x-3,y:box.y-2,width:box.width+6,height:box.height+4};}catch{/* Detached exporters and metric-free DOMs use the same conservative fallback. */}
  const size=style.fontSize??12,width=[...graphemes.segment(label.textContent)].length*size*.8+8,x=Number(label.getAttribute('x')),y=Number(label.getAttribute('y')),anchor=label.getAttribute('text-anchor')||'middle';return{x:x-(anchor==='start'?0:anchor==='end'?width:width/2),y:y-size,width,height:size*1.5};
}

export function visualBounds(view, radiusFor, storedGeometry) {
  const boxes = view.visualNodes.map(item => item.bounds);
  for (const line of view.visualConnectors) boxes.push(visualGeometry(line, view, radiusFor, storedGeometry).bounds);
  return boxes;
}
