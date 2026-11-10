import { applyViewRouter } from './view-routing.js';
import { layoutVisualView } from './visual-layout.js';
import { DRAWING_COLLECTIONS } from '../../schemka-model-core/src/native-v4.js';
import { deletionImpact, drawingDeletionImpact, projectView, CURRENT_CATALOG, moveDrawingGeometry, alignDrawingGeometry, applyDrawingGeometry } from '../../schemka-model-core/src/index.js';

export const snap = value => Math.round(Math.min(1000000, Math.max(-1000000, value)) * 10) / 10 || 0;

// Native file order is canonical by ID; array insertion order is not persisted.
export const orderedViews = views => [...views].sort((a, b) => a.view.id < b.view.id ? -1 : a.view.id > b.view.id ? 1 : 0);

/** One command boundary for all views. Drag is a disposable preview until commit. */
export function createController(store, { displayView = view => view, prepareCommand = command => command, interceptPlacement = () => null } = {}) {
  let viewId = orderedViews(store.snapshot.views)[0]?.view.id ?? null;
  let previousViewId = null, viewClosed = false;
  let selection = null;
  let selections = [];
  let drag = null;
  let projectionCache = null;
  function projection() {
    if (projectionCache?.revision !== store.revision || projectionCache?.viewId !== viewId) {
      const state = store.snapshot, entry = state.views.find(entry => entry.view.id === viewId);
      projectionCache = { revision: store.revision, viewId, result: entry ? projectView(state, viewId) : null,
        definition: state.viewpoints?.find(item => item.id === entry?.view.viewpointId) };
    }
    return projectionCache;
  }
  function currentView() {
    const result = projection().result;
    if (!result) return undefined;
    const view = applyViewRouter(displayView(structuredClone({ view: result.view, occurrences: result.occurrences, connections: result.connections, visualNodes: result.visualNodes, visualConnectors: result.visualConnectors })));
    return view.visualNodes.some(item => item.kind === 'legend' && item.legend.autoSize) ? layoutVisualView(store.snapshot, view) : view;
  }
  function typeVisible(kind, type) { return (projection().definition?.selection[`${kind}Types`] ?? CURRENT_CATALOG[`${kind}Types`] ?? []).includes(type); }
  function conceptVisible(ref) { return Boolean(projection().result?.[`${ref.kind}Ids`]?.includes(ref.id)); }
  function drawingVisible(endpoint) {
    const view = projection().result;
    return Boolean(view?.[DRAWING_COLLECTIONS[endpoint.kind]]?.some(item => item.id === endpoint.id));
  }
  // UI scope only: the core continues to store all structurally valid model data.
  function checkScope(command) {
    if (!projection().definition) return;
    let visible = true;
    if (command.viewId && command.viewId !== viewId) return;
    if (command.type === 'createElementAndOccurrence') visible = typeVisible('element', command.elementType);
    if (command.type === 'createJunctionAndOccurrence') visible = typeVisible('junction', command.junctionType);
    if (command.type === 'addOccurrence') visible = conceptVisible(command.concept);
    if (command.type === 'addConnection') visible = conceptVisible({ kind: 'relationship', id: command.relationshipId });
    if (command.type === 'createRelationshipAndConnection') visible = typeVisible('relationship', command.relationshipType);
    if (['addConnection', 'createRelationshipAndConnection'].includes(command.type)) visible &&= drawingVisible(command.source) && drawingVisible(command.target);
    if (command.occurrenceId) visible &&= drawingVisible({ kind: 'occurrence', id: command.occurrenceId });
    if (command.connectionId) visible &&= drawingVisible({ kind: 'connection', id: command.connectionId });
    if (command.nodeId) visible &&= drawingVisible({ kind: 'visualNode', id: command.nodeId });
    if (command.connectorId) visible &&= drawingVisible({ kind: 'visualConnector', id: command.connectorId });
    if (command.drawing) visible &&= drawingVisible(command.drawing);
    if (command.endpoint) visible &&= drawingVisible(command.endpoint);
    if (command.drawings) visible &&= command.drawings.every(drawingVisible);
    if (command.connectionIds) visible &&= command.connectionIds.every(id => drawingVisible({ kind: 'connection', id }) || drawingVisible({ kind: 'visualConnector', id }));
    if (!visible) throw new Error('Этот объект или рисунок исключён viewpoint текущего вида. Измените выбор типов или явно снимите привязку.');
  }
  function sanitizeSelection() {
    if (drag && drag.revision !== store.revision) drag = null;
    const views = orderedViews(store.snapshot.views);
    if (!viewClosed && (viewId !== null || views.length) && !views.some(entry => entry.view.id === viewId)) {
      viewId = views.some(entry => entry.view.id === previousViewId) ? previousViewId : views[0]?.view.id ?? null;
      previousViewId = null; selection = null; selections = []; drag = null;
    }
    if (selections.length) {
      selections = selections.filter(drawingVisible);
      if (!selections.some(item => same(item, selection))) selection = selections[0] ?? null;
      return;
    }
    if (!selection) return;
    const state = store.snapshot;
    const items = DRAWING_COLLECTIONS[selection.kind] ? (currentView()?.[DRAWING_COLLECTIONS[selection.kind]] || [])
        : selection.kind === 'element' ? state.elements : selection.kind === 'junction' ? state.junctions : selection.kind === 'relationship' ? state.relationships : [];
    if (!items.some(item => item.id === selection.id)) selection = null;
  }
  const same = (a, b) => a?.kind === b?.kind && a?.id === b?.id;
  function selectMany(values, anchor = values[0]) {
    drag = null;
    const view = projection().result, visible = new Set(Object.entries(DRAWING_COLLECTIONS).flatMap(([kind, collection]) => (view?.[collection] ?? []).map(item => `${kind}:${item.id}`))), seen = new Set();
    selections = values.filter(ref => {
      const key = `${ref?.kind}:${ref?.id}`;
      if (!visible.has(key) || seen.has(key)) return false;
      seen.add(key); return true;
    }).map(ref => ({ kind: ref.kind, id: ref.id }));
    selection = selections.find(ref => same(ref, anchor)) ?? selections[0] ?? null;
  }
  function moveCommand(dx, dy) {
    return { type: 'moveDrawings', viewId, drawings: selections.map(ref => ({ ...ref })), dx, dy, connectionIds: [...(currentView()?.connections ?? []), ...(currentView()?.visualConnectors ?? [])].map(item => item.id) };
  }
  function execute(command, baseRevision = store.revision) {
    drag = null;
    command = prepareCommand(command);
    checkScope(command);
    if (['createElementAndOccurrence', 'createJunctionAndOccurrence', 'addOccurrence', 'moveDrawings'].includes(command.type)) {
      const handled = interceptPlacement(command, baseRevision);
      if (handled) { sanitizeSelection(); return handled; }
    }
    const result = store.execute(command, baseRevision);
    sanitizeSelection();
    return result;
  }
  return {
    store,
    get viewId() { return viewId; },
    get view() { return currentView(); },
    get projection() { return structuredClone(projection().result); },
    typeVisible, conceptVisible, sanitizeSelection,
    get selection() { return selection && { ...selection }; },
    get selections() { return selections.map(item => ({ ...item })); },
    isSelected(ref) { return selections.some(item => same(item, ref)); },
    get drag() { return drag && structuredClone(drag); },
    get previewView() {
      if (!drag?.geometry) return currentView();
      const view = structuredClone(drag.view); applyDrawingGeometry(view, structuredClone(drag.geometry)); return view;
    },
    select(value) {
      drag = null;
      if (DRAWING_COLLECTIONS[value?.kind]) selectMany([value]);
      else { selections = []; selection = value && { ...value }; sanitizeSelection(); }
    },
    selectMany,
    toggleSelection(value) {
      const values = selections.some(ref => same(ref, value)) ? selections.filter(ref => !same(ref, value)) : [...selections, value];
      selectMany(values, selection);
    },
    closeView() { drag = null; selection = null; selections = []; viewId = null; viewClosed = true; },
    switchView(id) {
      if (!store.snapshot.views.some(entry => entry.view.id === id)) throw new Error('Представление не найдено');
      if (viewId !== id) previousViewId = viewId;
      viewClosed = false; drag = null; selection = null; selections = []; viewId = id;
    },
    afterLoad() {
      viewClosed = false; drag = null; selection = null; selections = []; previousViewId = null; viewId = orderedViews(store.snapshot.views)[0]?.view.id ?? null;
    },
    execute,
    undo() { drag = null; const result = store.undo(store.revision); sanitizeSelection(); return result; },
    redo() { drag = null; const result = store.redo(store.revision); sanitizeSelection(); return result; },
    beginDrag(occurrenceId, kind = 'occurrence') {
      if (!['occurrence', 'visualNode'].includes(kind)) throw new Error('Перемещать можно только узлы');
      const view = currentView(), item = (view?.[DRAWING_COLLECTIONS[kind]] || []).find(value => value.id === occurrenceId);
      if (!item) throw new Error('Экземпляр не найден');
      if (!selections.some(ref => ref.kind === kind && ref.id === occurrenceId)) selectMany([{ kind, id: occurrenceId }]);
      drag = { viewId, view, command: moveCommand(0, 0), occurrenceId, revision: store.revision,
        start: { x: item.bounds.x, y: item.bounds.y }, next: { x: item.bounds.x, y: item.bounds.y }, geometry: null, invalid: false };
    },
    previewDrag(dx, dy) {
      if (!drag) return null;
      drag.invalid = true; drag.geometry = null;
      const x = Math.round(dx * 10) / 10 || 0, y = Math.round(dy * 10) / 10 || 0;
      if (![dx, dy].every(Number.isFinite)) throw new Error('Некорректное положение указателя');
      drag.geometry = moveDrawingGeometry(drag.view, drag.command.drawings, x, y, drag.command.connectionIds);
      drag.command.dx = x; drag.command.dy = y;
      drag.next = { x: Math.round((drag.start.x + x) * 10) / 10 || 0, y: Math.round((drag.start.y + y) * 10) / 10 || 0 };
      drag.invalid = false;
      return { ...drag.next };
    },
    cancelDrag() { drag = null; },
    commitDrag() {
      const pending = drag; drag = null;
      if (!pending || pending.invalid || (!pending.command.dx && !pending.command.dy)) return null;
      return execute(pending.command, pending.revision);
    },
    moveSelection(dx, dy) {
      if (!dx && !dy) return null;
      const command = moveCommand(dx, dy);
      if (!command.drawings.some(ref => ['occurrence', 'visualNode'].includes(ref.kind))) return null;
      return execute(command);
    },
    alignSelection(operation) {
      drag = null;
      const command = { type: 'alignDrawings', viewId, drawings: selections.map(ref => ({ ...ref })), anchor: selection && { ...selection }, operation,
        connectionIds: [...(currentView()?.connections ?? []), ...(currentView()?.visualConnectors ?? [])].map(item => item.id) };
      const geometry = alignDrawingGeometry(currentView(), command.drawings, command.anchor, operation, command.connectionIds);
      return geometry.occurrences.length || geometry.visualNodes.length ? execute(command) : null;
    },
    impact(target) { return deletionImpact(store.snapshot, target); },
    drawingImpact(target) { return drawingDeletionImpact(store.snapshot, { viewId, ...target }); },
  };
}
