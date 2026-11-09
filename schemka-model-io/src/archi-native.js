import { createProject, validateProject, CURRENT_CATALOG, validateDrawingStyle } from '../../schemka-model-core/src/index.js';
import { newId, bounds as validateBounds, text } from '../../schemka-model-core/src/format.js';
import { LIMITS } from '../../schemka-model-core/src/json.js';
import { createRegistry, CURRENT_PROFILE, assessRelationshipCreation } from '../../schemka-model-profiles/src/index.js';
import { readXmlTree, importLegacyElementType } from './exchange-xml.js';
import { xmlFailure } from './xml-safety.js';
import { collectArchiMappings } from './archi-provenance.js';
export { collectArchiMappings } from './archi-provenance.js';
export const ARCHI_NAMESPACE = 'http://www.archimatetool.com/archimate';
export const ARCHI_NATIVE_VERSION = '5.0.0';
const XSI = 'http://www.w3.org/2001/XMLSchema-instance';
const registry = createRegistry([CURRENT_PROFILE]);
const domains = ['Business', 'Application', 'Technology'];
const domainTypes = { Strategy: ['Resource', 'Capability', 'ValueStream', 'CourseOfAction'], Motivation: ['Stakeholder', 'Driver', 'Assessment', 'Goal', 'Outcome', 'Principle', 'Requirement', 'Constraint', 'Meaning', 'Value'], Implementation: ['WorkPackage', 'Deliverable', 'Plateau', 'Gap'], Physical: ['Equipment', 'Facility', 'DistributionNetwork', 'Material'], Technology: ['Node', 'Device', 'SystemSoftware', 'CommunicationNetwork', 'Path', 'Artifact'], Common: ['Grouping', 'Location'] };
const round = value => Math.round(value * 10) / 10 || 0;
const center = bounds => ({ x: bounds.x + Math.floor(bounds.width / 2), y: bounds.y + Math.floor(bounds.height / 2) });
const fail = message => { throw xmlFailure('ARCHI_CONVERSION', message); };

/** Conversion is detached; no partial candidate is returned when any record needs a decision or repair. */
export function previewArchiXml(bytes, { DOMParser, decisions: choices = {}, ids: suppliedIds = {} } = {}) {
  const diagnostics = { errors: [], transformations: [], losses: [] }, decisions = [], ids = new Map(), sourceViews = new Map();
  let r, root, version = '', state, modelId = '';
  const consumed = new WeakSet(), consumedAttrs = new WeakMap(), types = new WeakMap(), contexts = new WeakMap();
  function context(n) {
    let owner = n; while (owner?.parentElement && !owner.getAttribute('id')) owner = owner.parentElement;
    const view = contexts.get(n) || contexts.get(owner);
    return { sourceId: owner?.getAttribute('id') || '', sourceType: types.get(owner) || owner?.getAttributeNS(XSI, 'type')?.split(':').at(-1) || (owner === root ? 'ArchimateModel' : owner?.localName || 'document'),
      ...(view ? { viewId: view.id, viewName: view.name } : {}) };
  }
  function issue(level, n, code, message, field) {
    const owner = context(n), affectedViews = !owner.viewId && sourceViews.get(owner.sourceId);
    diagnostics[level].push({ ...owner, ...(affectedViews?.size ? { affectedViews: [...affectedViews.values()] } : {}), ...(field ? { field } : {}), code, message });
  }
  function check(n, field, operation, fallback = '') {
    try { return operation(); } catch (error) { issue('errors', n, error.code || 'ARCHI_CONVERSION', error.message, field); return fallback; }
  }
  function attr(n, name, ns = null) {
    const a = ns ? n.getAttributeNodeNS(ns, name) : n.getAttributeNode(name);
    if (!a) return '';
    let set = consumedAttrs.get(n); if (!set) consumedAttrs.set(n, set = new Set()); set.add(a);
    return a.value;
  }
  function children(n, name) { const found = [...n.children].filter(child => child.namespaceURI === null && child.localName === name); for (const child of found) consumed.add(child); return found; }
  function type(n) {
    if (types.has(n)) return types.get(n);
    const value = attr(n, 'type', XSI), parts = value.split(':'), result = parts.at(-1);
    if (parts.length > 1 && n.lookupNamespaceURI(parts[0]) !== ARCHI_NAMESPACE) issue('errors', n, 'ARCHI_NAMESPACE', `Неизвестный namespace типа ${value}.`, 'xsi:type');
    types.set(n, result || n.localName); return result;
  }
  function bounded(n, field, value) { check(n, field, () => text(value)); return value; }
  function doc(n, key = 'documentation') {
    const list = children(n, key);
    if (list.length > 1) issue('errors', n, 'ARCHI_METADATA', `Повторный ${key} в Archi XML.`, key);
    for (const item of list) for (const child of item.children) issue('errors', n, 'ARCHI_METADATA', `Текст ${key} содержит неизвестную разметку ${child.localName}.`, key);
    return bounded(n, key, list[0]?.textContent || '');
  }
  function props(n) {
    const rows = children(n, 'property').map(p => ({ key: bounded(n, 'property/key', attr(p, 'key')), value: bounded(n, 'property/value', attr(p, 'value')) }));
    if (rows.length > LIMITS.properties) issue('errors', n, 'LIMIT', `Слишком много свойств: ${rows.length}; предел ${LIMITS.properties}.`, 'properties');
    return rows;
  }
  const meta = n => ({ name: bounded(n, 'name', attr(n, 'name')), documentation: doc(n), properties: props(n) });
  function identity(n, prefix) {
    const old = attr(n, 'id'); bounded(n, 'id', old);
    if (!old) { issue('errors', n, 'ARCHI_ID', 'Пустой Archi id.', 'id'); return newId(prefix); }
    if (ids.has(old)) return ids.get(old);
    const supplied = Object.hasOwn(suppliedIds, old) ? suppliedIds[old] : undefined;
    const pattern = new RegExp(`^${prefix}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`);
    if (supplied !== undefined && !pattern.test(supplied)) issue('errors', n, 'ARCHI_ID_MAP', 'Некорректный сохранённый целевой ID.', 'id');
    const id = typeof supplied === 'string' && pattern.test(supplied) ? supplied : newId(prefix); ids.set(old, id); return id;
  }
  function source(n) {
    const t = n === root ? 'ArchimateModel' : type(n) || n.localName, domain = domains.find(domain => t.startsWith(domain)) || Object.keys(domainTypes).find(domain => domainTypes[domain].includes(t));
    return { modelId, id: attr(n, 'id'), type: t, version: ARCHI_NATIVE_VERSION, ...(domain ? { domain } : {}) };
  }
  function integer(n, field, fallback = 0) {
    const value = attr(n, field);
    if (!value) return fallback;
    if (!/^[+-]?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) { issue('errors', n, 'ARCHI_NUMBER', `Ожидается целое число: ${field}=${value}.`, field); return fallback; }
    return Number(value) || 0;
  }
  function style(n, line = false) {
    const out = {};
    for (const [from, to] of [['fillColor', 'fill'], ['lineColor', 'stroke'], ['fontColor', 'textColor']]) { const value = attr(n, from); if (value) out[to] = value; }
    const width = attr(n, 'lineWidth'); if (width) out.strokeWidth = integer(n, 'lineWidth', 1);
    const alpha = attr(n, 'alpha'); if (alpha) out.fillOpacity = integer(n, 'alpha', 255) / 255;
    const alignment = attr(n, 'textAlignment'); if (alignment) {
      const selected = { 1: 'left', 2: 'center', 4: 'right' }[alignment];
      if (selected) out.textAlign = selected; else issue('errors', n, 'ARCHI_STYLE', `Неизвестное выравнивание ${alignment}.`, 'textAlignment');
    }
    if (!line) { const position = attr(n, 'textPosition'); if (position) { const selected = { 0: 'top', 1: 'middle', 2: 'bottom' }[position]; if (selected) out.verticalAlign = selected; else issue('errors', n, 'ARCHI_STYLE', `Неизвестная позиция текста ${position}.`, 'textPosition'); } }
    const font = attr(n, 'font');
    if (font) {
      const parts = font.split('|'), height = Number(parts[2]), flags = Number(parts[3]), size = round(height * 4 / 3);
      if (parts[0] === '1' && /^[\p{L}\p{N} ,_-]{1,120}$/u.test(parts[1]) && Number.isFinite(height) && Number.isInteger(flags) && flags >= 0 && flags <= 3 && size >= 6 && size <= 96) {
        out.fontFamily = parts[1]; out.fontSize = size; out.fontWeight = flags & 1 ? 'bold' : 'normal';
        issue('transformations', n, 'ARCHI_FONT', `Шрифт ${parts[1]}: ${height} pt → ${size} px (96 DPI).`, 'font');
        if (flags & 2) issue('losses', n, 'ARCHI_FONT_ITALIC', 'Курсив не поддерживается текущим стилем Arkita; семейство, размер и жирность сохранены.', 'font');
      } else issue('losses', n, 'ARCHI_FONT', `Формат/размер шрифта не поддерживается; используется шрифт Arkita: ${font}.`, 'font');
    }
    for (const [key, value] of Object.entries(out)) check(n, key, () => validateDrawingStyle({ [key]: value }, line, line));
    return out;
  }
  function lock(n, target) {
    const value = attr(n, 'locked'); if (!value) return;
    if (!['true', 'false', '1', '0'].includes(value)) issue('errors', n, 'ARCHI_LOCK', 'locked должен быть boolean.', 'locked');
    else target.locked = ['true', '1'].includes(value);
  }
  function finish() {
    function walk(n) {
      for (const a of n.attributes) if (a.namespaceURI !== 'http://www.w3.org/2000/xmlns/' && !consumedAttrs.get(n)?.has(a)) issue('losses', n, 'ARCHI_ATTRIBUTE', `Атрибут ${a.name} не перенесён: ${a.value.slice(0, 160)}.`, a.name);
      for (const child of n.children) {
        if (!contexts.has(child) && contexts.has(n)) contexts.set(child, contexts.get(n));
        if (!consumed.has(child)) { issue('losses', n, 'ARCHI_EXTENSION', `Узел ${child.localName} и его содержимое не перенесены: ${child.textContent.slice(0, 160)}.`, child.localName); }
        else walk(child);
      }
    }
    walk(root);
  }
  const result = () => {
    for (const rows of Object.values(diagnostics)) for (const row of rows) if (!row.viewId && sourceViews.has(row.sourceId)) row.affectedViews = [...sourceViews.get(row.sourceId).values()];
    return { snapshot: diagnostics.errors.length ? null : state, diagnostics, decisions, ids: Object.fromEntries(ids), mappings: state ? collectArchiMappings(state) : [], losses: [...diagnostics.transformations, ...diagnostics.losses].map(item => `${item.sourceId || 'Документ'}: ${item.message}`), version };
  };
  try {
    const prefix = typeof bytes === 'string' ? bytes.slice(0, 2) : new TextDecoder().decode(bytes instanceof ArrayBuffer ? new Uint8Array(bytes).slice(0, 2) : bytes?.slice(0, 2));
    if (prefix === 'PK') fail('Archi ZIP с ресурсами не поддерживается: экспортируйте native XML 5.0.0. Исходник не изменён.');
    r = readXmlTree(bytes, DOMParser); root = r.root; consumed.add(root); modelId = attr(root, 'id');
    if (root.namespaceURI !== ARCHI_NAMESPACE || root.localName !== 'model') fail('Ожидается native Archi .archimate XML, не Open Exchange.');
    version = attr(root, 'version'); if (version !== ARCHI_NATIVE_VERSION) fail(`Версия Archi native ${version || '(нет)'} не поддерживается; закреплён контракт ${ARCHI_NATIVE_VERSION}.`);
    if (!choices || typeof choices !== 'object' || Array.isArray(choices) || !suppliedIds || typeof suppliedIds !== 'object' || Array.isArray(suppliedIds)) fail('Решения и карта ID должны быть объектами.');
    const seenIds = new Set();
    function scan(n, view) {
      if (view) contexts.set(n, view);
      const old = n.getAttribute('id');
      if (old) { if (seenIds.has(old)) issue('errors', n, 'ARCHI_ID', `Повторный Archi id: ${old}.`, 'id'); seenIds.add(old); }
      if (n.localName === 'element' && ['ArchimateDiagramModel', 'SketchModel'].includes(type(n))) { view = { id: old, name: n.getAttribute('name') || '' }; contexts.set(n, view); }
      if (view) for (const field of ['archimateElement', 'archimateRelationship']) {
        const referenced = n.getAttribute(field); if (!referenced) continue;
        if (!sourceViews.has(referenced)) sourceViews.set(referenced, new Map()); sourceViews.get(referenced).set(view.id, view);
      }
      for (const child of n.children) scan(child, view);
    }
    scan(root);
    state = createProject('');
    Object.assign(state.project, { id: identity(root, 'prj'), name: bounded(root, 'name', attr(root, 'name')), documentation: doc(root, 'purpose'), properties: props(root), archiSource: source(root) });
    const nodes = [], views = [], refs = new Map(), owner = new Map(), nodeById = new Map();
    function folders(n, parent = null) {
      for (const f of children(n, 'folder')) {
        const id = identity(f, 'fld'), item = { id, ...meta(f), parentFolderId: parent, members: [], archiSource: source(f) }; state.folders.push(item);
        const category = attr(f, 'type'); if (category) issue('transformations', f, 'ARCHI_FOLDER', `Классификация папки «${category}» заменена обычной папкой; имя, членство и иерархия сохранены.`, 'type');
        for (const e of children(f, 'element')) { nodes.push(e); owner.set(e, item); nodeById.set(attr(e, 'id'), e); }
        folders(f, id);
      }
    }
    folders(root);
    for (const n of children(root, 'element')) { nodes.push(n); nodeById.set(attr(n, 'id'), n); }
    for (const n of nodes) {
      const t = type(n); let ref;
      if (['ArchimateDiagramModel', 'SketchModel'].includes(t)) {
        const id = identity(n, 'view'), entry = { view: { id, ...meta(n), ...(t === 'SketchModel' ? { kind: 'sketch' } : {}), archiSource: source(n) }, occurrences: [], connections: [], visualNodes: [], visualConnectors: [] };
        state.views.push(entry); views.push([n, entry]); ref = { kind: 'view', id };
      } else if (t.endsWith('Relationship')) ref = { kind: 'relationship', id: identity(n, 'rel') };
      else {
        const junction = ['AndJunction', 'OrJunction'].includes(t), id = identity(n, junction ? 'jct' : 'el'); let target = t;
        if (!junction) {
          if (t === 'Gap') {
            const selected = Object.hasOwn(choices, attr(n, 'id')) ? choices[attr(n, 'id')] : '';
            decisions.push({ sourceId: attr(n, 'id'), sourceType: t, name: attr(n, 'name'), options: ['Assessment'], selected: selected || '' });
            if (selected !== 'Assessment') { issue('errors', n, 'ARCHI_MAPPING_REQUIRED', 'Gap требует явного решения Gap → Assessment для этого объекта.', 'type'); target = null; }
            else { target = 'Assessment'; issue('transformations', n, 'ARCHI_GAP', 'Gap → Assessment: явное решение пользователя; исходный тип сохранён в archiSource.', 'type'); }
          } else {
            const messages = []; target = check(n, 'type', () => importLegacyElementType(t, messages, attr(n, 'id')), null);
            for (const message of messages) issue('transformations', n, 'ARCHI_TYPE', `${message} Исходные тип и домен сохранены в archiSource.`, 'type');
          }
        }
        const metadata = meta(n);
        if (target) { state[junction ? 'junctions' : 'elements'].push({ id, type: target, ...metadata, archiSource: source(n) }); ref = { kind: junction ? 'junction' : 'element', id }; }
      }
      if (ref) { refs.set(attr(n, 'id'), ref); owner.get(n)?.members.push(ref); }
    }
    for (const n of nodes) {
      let t = type(n); if (!t.endsWith('Relationship')) continue;
      t = t.replace(/Relationship$/, '');
      if (t === 'Access') { const access = attr(n, 'accessType') || '0'; t = { 0: 'WriteAccess', 1: 'ReadAccess', 2: 'Access', 3: 'ReadWriteAccess' }[access]; if (!t) issue('errors', n, 'ARCHI_ACCESS', `Неизвестный accessType: ${access}.`, 'accessType'); }
      if (t === 'Association') { const directed = attr(n, 'directed'); if (['true', '1'].includes(directed)) t = 'DirectedAssociation'; else if (directed && !['false', '0'].includes(directed)) issue('errors', n, 'ARCHI_DIRECTION', 'directed должен быть boolean.', 'directed'); }
      if (t === 'Influence' && attr(n, 'strength')) issue('errors', n, 'ARCHI_INFLUENCE', 'Archi Influence strength не имеет однозначного поля в Arkita 4.', 'strength');
      if (!CURRENT_CATALOG.relationshipTypes.includes(t)) issue('errors', n, 'ARCHI_RELATIONSHIP_TYPE', `Отношение ${t || type(n)} не поддерживается.`, 'type');
      const sourceRef = refs.get(attr(n, 'source')), targetRef = refs.get(attr(n, 'target'));
      for (const [field, ref] of [['source', sourceRef], ['target', targetRef]]) if (!ref || ref.kind === 'view') issue('errors', n, 'ARCHI_REFERENCE', `Отношение Archi ссылается на неизвестный концепт ${field}=${attr(n, field)}.`, field);
      const { name, ...metadata } = meta(n);
      if (sourceRef && targetRef && sourceRef.kind !== 'view' && targetRef.kind !== 'view' && CURRENT_CATALOG.relationshipTypes.includes(t)) state.relationships.push({ id: ids.get(attr(n, 'id')), type: t, source: sourceRef, target: targetRef, label: name, ...metadata, archiSource: source(n) });
    }
    for (const [viewNode, entry] of views) {
      const drawings = new Map(), connectionNodes = [], router = attr(viewNode, 'connectionRouterType') || '0';
      if (!['0', '2'].includes(router)) issue('errors', viewNode, 'ARCHI_ROUTER', `Неизвестный маршрутизатор ${router}.`, 'connectionRouterType');
      if (router === '2') { entry.view.router = 'orthogonal'; issue('losses', viewNode, 'ARCHI_ROUTER', 'Маршруты Manhattan вычисляются Archi при отображении и отсутствуют в XML; Arkita построит ортогональные маршруты заново.', 'connectionRouterType'); }
      function drawingNodes(parent, parentRef = null, offset = { x: 0, y: 0 }) {
        for (const [index, n] of children(parent, 'child').entries()) {
          const t = type(n), semantic = t === 'DiagramObject', id = identity(n, semantic ? 'occ' : 'vnd'), ref = { kind: semantic ? 'occurrence' : 'visualNode', id };
          const accepted = ['DiagramObject', 'Note', 'Group', 'SketchModelSticky', 'SketchModelActor'].includes(t);
          if (!accepted) issue('errors', n, 'ARCHI_DRAWING_TYPE', `Archi drawing ${t} не поддерживается; ресурсы/ссылки на виды не будут молча удалены.`, 'type');
          const b = children(n, 'bounds'); if (b.length !== 1) issue('errors', n, 'ARCHI_BOUNDS', 'Archi drawing должен иметь один bounds.', 'bounds');
          const bounds = b[0] ? { x: integer(b[0], 'x') + offset.x, y: integer(b[0], 'y') + offset.y, width: integer(b[0], 'width', -1), height: integer(b[0], 'height', -1) } : { x: offset.x, y: offset.y, width: 1, height: 1 };
          check(n, 'bounds', () => validateBounds(bounds));
          const base = { id, bounds, parent: parentRef, zIndex: index, style: style(n), archiSource: source(n) }; lock(n, base);
          let kept = accepted;
          if (semantic) {
            const concept = refs.get(attr(n, 'archimateElement'));
            if (!concept || !['element', 'junction'].includes(concept.kind)) { issue('errors', n, 'ARCHI_REFERENCE', 'Archi drawing ссылается на неизвестный элемент.', 'archimateElement'); kept = false; }
            else entry.occurrences.push({ ...base, concept });
          } else if (accepted) {
            const content = ['Note', 'SketchModelSticky'].includes(t) ? doc(n, 'content') : attr(n, 'name'), metadata = meta(n), group = t === 'Group';
            entry.visualNodes.push({ ...base, ...metadata, kind: group ? 'group' : 'note', ...(group ? {} : { text: content }), ...(t === 'SketchModelActor' ? { style: { ...base.style, shape: 'actor' } } : {}) });
          }
          if (kept) drawings.set(attr(n, 'id'), { ref, bounds });
          connectionNodes.push(...children(n, 'sourceConnection')); attr(n, 'targetConnections');
          drawingNodes(n, kept ? ref : parentRef, { x: bounds.x, y: bounds.y });
        }
      }
      drawingNodes(viewNode);
      for (const n of connectionNodes) {
        const t = type(n), id = identity(n, 'conn'), from = drawings.get(attr(n, 'source')), to = drawings.get(attr(n, 'target')), relationship = refs.get(attr(n, 'archimateRelationship'));
        if (t !== 'Connection') issue('errors', n, 'ARCHI_CONNECTION_TYPE', `Тип Archi connector ${t} не поддерживается.`, 'type');
        if (relationship?.kind !== 'relationship' || from?.ref.kind !== 'occurrence' || to?.ref.kind !== 'occurrence') issue('errors', n, 'ARCHI_REFERENCE', 'Archi connection требует известные семантические вхождения и отношение.', 'endpoints');
        const lineStyle = style(n, true), label = attr(n, 'textPosition') || '0';
        if (!['0', '1', '2'].includes(label)) issue('errors', n, 'ARCHI_LABEL', `Неизвестная позиция подписи ${label}.`, 'textPosition');
        else lineStyle.labelAnchor = { 0: 'source', 1: 'middle', 2: 'target' }[label];
        const features = children(n, 'feature');
        for (const f of features) {
          const name = attr(f, 'name'), value = attr(f, 'value');
          if (name === 'nameVisible' && ['true', 'false'].includes(value)) lineStyle.labelVisible = value === 'true';
          else issue('losses', n, 'ARCHI_CONNECTION_FEATURE', `Особенность линии ${name}=${value} не перенесена.`, name);
        }
        const bends = children(n, 'bendpoint'), routePoints = [];
        if (bends.length > LIMITS.routePoints) issue('errors', n, 'LIMIT', `Слишком много изгибов: ${bends.length}.`, 'bendpoint');
        for (const [index, b] of bends.entries()) {
          const delta = Object.fromEntries(['startX', 'startY', 'endX', 'endY'].map(key => [key, integer(b, key)]));
          if (!from || !to || router !== '0') continue;
          const a = center(from.bounds), z = center(to.bounds), weight = Math.fround((index + 1) / (bends.length + 1));
          const point = { x: (a.x + delta.startX) * (1 - weight) + (z.x + delta.endX) * weight, y: (a.y + delta.startY) * (1 - weight) + (z.y + delta.endY) * weight };
          const normalized = { x: round(point.x), y: round(point.y) };
          if (normalized.x !== point.x || normalized.y !== point.y) issue('losses', n, 'ARCHI_ROUTE_GRID', `Изгиб ${index + 1}: (${point.x}, ${point.y}) округлён до (${normalized.x}, ${normalized.y}) по сетке 0,1.`, 'bendpoint');
          routePoints.push({ kind: 'bend', point: normalized });
        }
        if (bends.length && router === '0') issue('transformations', n, 'ARCHI_ROUTE', `${bends.length} relative bendpoints → абсолютные точки по формуле Draw2D; порядок сохранён.`, 'bendpoint');
        const note = doc(n), properties = props(n); if (note || properties.length) issue('losses', n, 'ARCHI_CONNECTION_METADATA', 'Документация/свойства рисунка линии не имеют отдельных полей; метаданные общего отношения сохранены.', 'metadata');
        if (relationship?.kind === 'relationship' && from?.ref.kind === 'occurrence' && to?.ref.kind === 'occurrence') {
          const connection = { id, relationshipId: relationship.id, source: from.ref, target: to.ref, routePoints, labelPosition: null, style: lineStyle, archiSource: source(n) }; lock(n, connection); entry.connections.push(connection);
          const semantic = state.relationships.find(item => item.id === relationship.id), sourceConcept = entry.occurrences.find(item => item.id === from.ref.id)?.concept, targetConcept = entry.occurrences.find(item => item.id === to.ref.id)?.concept;
          if (semantic && (semantic.source.id !== sourceConcept?.id || semantic.target.id !== targetConcept?.id)) issue('errors', n, 'ARCHI_CONNECTION_DIRECTION', 'Концы/направление рисунка не совпадают с исходным отношением после преобразования.', 'endpoints');
          issue('losses', n, 'ARCHI_LABEL_METRICS', 'Позиция подписи source/middle/target сохранена; точные отступы и метрики Draw2D заменены отрисовкой Arkita.', 'textPosition');
        }
      }
    }
    finish();
    try { validateProject(state); } catch (error) { if (!diagnostics.errors.length) issue('errors', root, error.code || 'ARCHI_CONVERSION', error.message, 'model'); }
    // Invalid drawing geometry or text cannot hide independent semantic blockers. This projection is never applied.
    const semantic = createProject(''), counts = new Map(), relationshipNodes = new Map();
    for (const item of [...state.elements, ...state.junctions, ...state.relationships]) counts.set(item.id, (counts.get(item.id) || 0) + 1);
    const metadata = { name: '', documentation: '', properties: [] };
    for (const key of ['elements', 'junctions']) semantic[key] = state[key].filter(item => counts.get(item.id) === 1).map(item => ({ id: item.id, type: item.type, ...metadata }));
    const relations = new Map(state.relationships.filter(item => counts.get(item.id) === 1).map(item => { relationshipNodes.set(item.id, nodeById.get(item.archiSource.id)); return [item.id, { id: item.id, type: item.type, source: item.source, target: item.target, label: '', documentation: '', properties: [] }]; }));
    const live = new Set([...semantic.elements.map(item => `element:${item.id}`), ...semantic.junctions.map(item => `junction:${item.id}`), ...Array.from(relations.keys(), id => `relationship:${id}`)]);
    let removed; do { removed = false; for (const [id, item] of relations) if ([item.source, item.target].some(ref => !live.has(`${ref.kind}:${ref.id}`))) { relations.delete(id); live.delete(`relationship:${id}`); removed = true; } } while (removed);
    semantic.relationships = [...relations.values()];
    const analysisValid = check(root, 'relationships', () => { validateProject(semantic); return true; }, false);
    if (analysisValid) for (const relationship of semantic.relationships) {
      const n = relationshipNodes.get(relationship.id), blocker = check(n, 'relationship', () => assessRelationshipCreation(semantic, registry, relationship.id), null);
      if (blocker) issue('errors', n, 'IMPORT_RELATIONSHIP', `Отношение ${attr(n, 'id')} недопустимо после преобразования: ${blocker.reason}.`, 'relationship');
    }
    issue('transformations', root, 'ARCHI_IDS', `Archi native ${version}: все ID заменены независимыми UUID; исходные ID сохранены в archiSource. Структурная проверка не гарантирует семантическую эквивалентность 3.2→4.`);
  } catch (error) { issue('errors', root, error.code || 'ARCHI_CONVERSION', error.message); }
  return result();
}

/** Strict legacy entry point; UI uses previewArchiXml to display every discovered blocker. */
export function importArchiXml(bytes, options = {}) {
  const result = previewArchiXml(bytes, options);
  if (!result.snapshot) throw Object.assign(xmlFailure('ARCHI_CONVERSION', result.diagnostics.errors.map(item => `${item.sourceId ? `${item.sourceId}: ` : ''}${item.message}`).join('\n')), { diagnostics: result.diagnostics });
  return result;
}
