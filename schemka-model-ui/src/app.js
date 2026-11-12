import { reportMarkdown } from '../../schemka-model-io/src/report-markdown.js';
import { installCatalogSelection } from './catalog-selection.js';
import { installSemanticEditing } from './semantic-editing-ui.js';
import { installHostPolicyUI } from './host-policy-ui.js';
import { installAutomationUI } from './automation-ui.js';
import { installRelatedDrawingsUI } from './related-drawings-ui.js';
import { installModelGallery } from './model-gallery.js';
import { installRelationshipReference } from './relationship-reference.js';
import { capturePreferenceMotion, animatePreferenceMotion, cancelPreferenceMotion } from './preferences-motion.js';
import { installDetachedPalette } from './detached-palette.js';
import { installDetachedCatalog } from './detached-catalog.js';
import { installSpecializationTools } from './specialization-tools.js';
import { createLocalPreferences, applyPreferencePresentation, applyPreferenceView, prepareCreationCommand } from './preferences.js';
import { installPreferencesUI } from './preferences-ui.js';
import { installViewTabs } from './view-tabs.js';
import { installInterchangeUI } from './interchange-ui.js';
import { installTemplatesUI } from './templates-ui.js';
import { installExportReportUI } from './export-report-ui.js';
import { rasterizeViewSvg } from './raster-export.js';
import { layoutVisualView } from './visual-layout.js';
import { installGestureTools } from './gesture-tools.js';
import { installEditingTools } from './editing-tools.js';
import { installVisualsUI } from './visuals-ui.js';
import { installCatalogFolders } from './catalog-folders.js';
import { DRAWING_COLLECTIONS } from '../../schemka-model-core/src/native-v4.js';
import { drawingFor, visualGeometry, visualBounds, renderVisualNode, renderVisualConnector, applyDrawingStyles, applyDrawingGeometryStyles, refreshDrawingTextColors } from './visual-drawings.js';
import { createCustomizationResolver, projectView, drawingSelectionDeletionImpact } from '../../schemka-model-core/src/index.js';
import { installViewpointUI } from './viewpoint-ui.js';
import { installObjectProperties } from './object-properties.js';
import { installMetadataUI } from './metadata-ui.js';
import { installWhereUsed } from './where-used-ui.js';
import { installModelAnalysis } from './model-analysis-ui.js';
import { installContextHints } from './context-hints-ui.js';
import { installAlignmentUI } from './alignment-ui.js';
import { installFragmentClipboard } from './fragment-clipboard.js';
import { installViewport } from './viewport.js';
import { installMinimap } from './minimap.js';
import { installWorkbench, shortcutKey } from './workbench.js';
import { installWorkspace } from './workspace-ui.js';
import { installCustomizationUI } from './customization-ui.js';
import { nextElementBounds, nextJunctionBounds } from './junction-placement.js';
import { conceptRecord, conceptName } from './concepts.js';
import { createModelLeaveState, installModelUnloadGuard } from './leave-state.js';
import { createElementCaption, fitElementCaption } from './element-captions.js';
import { createDemo } from './demo.js';
import { createController, orderedViews, snap } from './controller.js';
import { installTheme } from './theme.js';
import { createInlineEditor } from './inline-editor.js';
import { createProjectSession } from './project-session.js';
import { installFileActions } from './file-actions.js';
import { exportViewSvg } from './svg-export.js';
import { installGitActions } from './git-actions.js';
import { installViewActions } from './view-actions.js';
import { installProfileUI, modelProfiles, renderGraphIssues, relationshipAssessment, relationshipTypeContext, relationshipCoverage, assessmentMessage, diagnosticPresentation, renderAssessmentEvidence } from './profile-ui.js';

import { multiplicityLabels } from './multiplicity-geometry.js';
import { installDocumentationEditor } from './documentation-editor.js';
import { installModelSearch } from './model-search.js';
import { installMultiplicityEditor } from './multiplicity-editor.js';
import { assessMultiplicity, assessProject } from '../../schemka-model-profiles/src/index.js';
import { installPaletteActions } from './palette-actions.js';
import { installSmartRelationship } from './smart-relationship.js';
import { installTypedActions } from './typed-actions.js';
import { installInternalDrag, canvasDropPoint, inverseScreenPoint } from './drag-drop.js';
import { marqueeRectangle, marqueeDrawings } from './drawing-selection.js';
import { installContextMenu } from './context-menu.js';
import { installLayoutEditor } from './layout-editor.js';
import { contextActions } from './context-actions.js';
import { connectionGeometry, viewGeometryBounds, routePointAt, nearestRoutePoint } from './connection-geometry.js';
import { DRAFT_NOTATION, UNKNOWN_NOTATION, notationElement, notationJunction, notationRelationship, notationDefs, notationLine, notationBox, installNotationUI } from './notation.js';

let readLeaveState = null;
installModelUnloadGuard({ window, readState: () => readLeaveState?.() });

const $ = id => document.getElementById(id);
let preferenceStorageError = '';
let teamProfile = null, teamProfileError = '';
if (window.schemkaDesktop?.readTeamProfile) {
  try { const result = await window.schemkaDesktop.readTeamProfile(); if (result.status === 'ok') teamProfile = result.profile; else if (result.status !== 'absent') teamProfileError = result.message || 'Командный профиль не прочитан.'; }
  catch (error) { teamProfileError = `Командный профиль не применён: ${error.message}`; }
}
const preferences = createLocalPreferences(window.localStorage, { baseSettings: teamProfile?.preferences ?? null, onStorageError: error => { preferenceStorageError = `Настройки действуют в этом окне, но не сохранены: ${error.message}`; } });
let preferenceState = preferences.snapshot;
let semanticEditing = null;
const model = createController(createDemo(), { interceptPlacement: (command, revision) => semanticEditing?.interceptPlacement(command, revision) ?? null, displayView: view => applyPreferenceView(view, preferenceState), prepareCommand: command => prepareCreationCommand(command, preferenceState) });
const projectSession = createProjectSession(model.store);
const svg = $('canvas');
const NS = 'http://www.w3.org/2000/svg';
installTheme(document, window, preferences, () => { if (model.view) refreshDrawingTextColors(svg, model.view); });
applyPreferencePresentation(document, window, preferenceState);
document.body.dataset.preferenceQuickAdd = String(preferenceState.behavior.quickAdd); document.body.dataset.preferenceViewpointHints = String(preferenceState.behavior.viewpointHints);
const inline = createInlineEditor({ document, read: () => model.store.snapshot, revision: () => model.store.revision,
  execute: command => model.execute(command), render: () => render(), report: text => status(text), restore: bookmark => restoreFocus(bookmark) });
let gesture = null;
let pendingDelete = null;
let fit = false;
let files;
let git;
let profileUI;
let typedActions;
let smartRelationship;
let paletteUI;
let internalDrag;
let contextMenu;
let notationUI;
let layoutEditor;
let multiplicityEditor;
let documentationEditor;
let metadataUI;
let catalogFolders;
let visualsUI;
let editingTools;
let gestureTools;
let exportReportUI;
let interchangeUI;
let templatesUI;
let automationUI;
let catalogSelection;
let hostPolicyUI;
let preferencesUI;
let relatedDrawingsUI;
let modelGallery;
let relationshipReference;
let catalogUsedConcepts = new Set();
let viewTabs;
let detachedPalette;
let detachedCatalog;
let specializationTools;
let modelSearch;
let customizationUI;
let viewpointUI;
let objectProperties;
let whereUsed;
let modelAnalysis;
let contextHints;
let alignmentUI;
let fragmentClipboard;
let viewport;
let minimap;
let workspace;
const multiplicityBounds = new WeakMap();
let contourCache = null;
let relationshipCache = null;
let graphCache = null;
const short = (value, max = 26) => { const chars = Array.from(value); return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : value; };
const displayName = item => item?.name || item?.label || '(без названия)';
const linkName = item => item?.label || '(без подписи)';
function node(tag, text, className) {
  const item = document.createElement(tag);
  if (text !== undefined) item.textContent = text;
  if (className) item.className = className;
  return item;
}
function vector(tag, attrs = {}, text) {
  const item = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) item.setAttribute(key, String(value));
  if (text !== undefined) item.textContent = text;
  return item;
}
function button(text, action, className) {
  const item = node('button', text, className);
  item.type = 'button'; item.addEventListener('click', action); return item;
}
let operationStatus = $('status').textContent, captionWarning = '', pendingCaptions = [];
const captionMetricWarning = 'Не удалось измерить подписи: показан предварительный текст, он может выходить за границы. Полные имена доступны в свойствах.';
function paintStatus() { $('status').textContent = [operationStatus, captionWarning].filter(Boolean).join(' · '); }
function status(text) { operationStatus = text; paintStatus(); }
function clearPendingCaptions() { pendingCaptions = []; captionWarning = ''; paintStatus(); }
function fitPendingCaptions() {
  if (!pendingCaptions.length || ![...svg.getClientRects()].some(rect => rect.width > 0 && rect.height > 0)) return;
  let completed = 0;
  for (const job of pendingCaptions) {
    if (job.nodes.some(node => !node.isConnected)) { completed++; continue; }
    if (!fitElementCaption(job).available) { captionWarning = captionMetricWarning; break; }
    completed++;
  }
  pendingCaptions.splice(0, completed);
  if (!pendingCaptions.length) captionWarning = '';
  paintStatus();
}
function safe(action) { try { return action(); } catch (error) { status(`Не выполнено: ${error.message}`); return null; } }
function renameAt(target, anchor) {
  whereUsed?.cancel();
  documentationEditor?.cancel();
  cancelGesture();
  const bookmark = focusBookmark();
  let bounds = null;
  if (anchor.matches('.node')) bounds = { x: 9, y: 32, width: 220, height: 82 };
  if (anchor.matches('.connection')) {
    const view = model.view;
    const geometry = target.kind === 'visualConnector'
      ? visualGeometry(view.visualConnectors.find(item => item.id === anchor.dataset.id), view, occurrenceContourFor(), notationUI.storedGeometry)
      : connectionGeometry(view.connections.find(item => item.id === anchor.dataset.id), view.occurrences, occurrenceContourFor(), notationUI.storedGeometry, view.connections);
    bounds = { x: geometry.x - 110, y: geometry.y - 14, width: 220, height: 82 };
  }
  if (anchor.id === 'project-tree') anchor = $('project-tree-name');
  inline.start(target, anchor, bookmark, bounds);
}
function renameFrom(element) {
  const anchor = element.closest('[data-rename-kind]');
  if (!anchor) return false;
  safe(() => renameAt({ kind: anchor.dataset.renameKind, id: anchor.dataset.renameId, ...(anchor.dataset.renameViewId ? { viewId: anchor.dataset.renameViewId } : {}) }, anchor));
  return true;
}
function focusBookmark() {
  const active = document.activeElement;
  if (!active || active === document.body) return null;
  const fallbackId = active.closest('#model-search-region') ? 'model-search' : null;
  for (const key of ['data-focus-key', 'data-id', 'data-element-id', 'data-relationship-id', 'data-inspector-action']) {
    if (active.hasAttribute(key)) return { active, selector: `[${key}="${active.getAttribute(key)}"]`, fallbackId };
  }
  return { active, id: active.id, fallbackId };
}
function focusVisiblePanel() {
  const mobile = window.matchMedia('(max-width: 850px)').matches;
  const region = mobile ? document.body.dataset.mobilePanel : 'canvas';
  const candidates = region === 'inspector'
    ? [...$('inspector-content').querySelectorAll('button'), ...document.querySelectorAll('.toolbox button,.toolbox summary')]
    : region === 'catalog' ? [$('tree-model').querySelector('summary')] : [svg];
  candidates.find(item => !item.matches(':disabled,[inert]') && item.getClientRects().length)?.focus({ preventScroll: true });
}
function restoreFocus(bookmark) {
  if (!bookmark) return;
  const target = bookmark.active.isConnected ? bookmark.active
    : bookmark.selector ? document.querySelector(bookmark.selector) : bookmark.id ? $(bookmark.id) : null;
  if (target && !target.matches(':disabled,[inert]') && target.getClientRects().length) target.focus({ preventScroll: true });
  else if (bookmark.fallbackId) $(bookmark.fallbackId)?.focus({ preventScroll: true });
  else focusVisiblePanel();
}
function panel(name) {
  if (name === 'catalog' && document.body.dataset.catalogDetached === 'true') name = 'canvas';
  workspace?.revealPanel(name);
  document.body.dataset.mobilePanel = name;
  for (const item of document.querySelectorAll('[data-panel]')) item.setAttribute('aria-pressed', String(item.dataset.panel === name));
  if (name === 'canvas') { fitPendingCaptions(); minimap?.refresh(); }
  if (document.activeElement !== document.body && !document.activeElement.getClientRects().length) focusVisiblePanel();
}
function selectedObjects() {
  const state = model.store.snapshot;
  const selected = model.selection;
  if (!selected) return { state };
  const occurrence = selected.kind === 'occurrence' ? (model.view?.occurrences || []).find(item => item.id === selected.id) : null;
  const connection = selected.kind === 'connection' ? (model.view?.connections || []).find(item => item.id === selected.id) : null;
  const concept = occurrence?.concept || (['element', 'junction'].includes(selected.kind) ? { kind: selected.kind, id: selected.id } : null);
  const element = concept && conceptRecord(state, concept);
  const relationship = state.relationships.find(item => item.id === (connection?.relationshipId || (selected.kind === 'relationship' ? selected.id : null)));
  return { state, occurrence, connection, element, relationship, concept };
}
function closeInspector() {
  const dialog = $('inspector-panel');
  if (!dialog.open) return;
  inline.cancel(false);
  dialog.close();
  if (document.activeElement === document.body || !document.activeElement?.getClientRects().length) focusVisiblePanel();
}
function openInspector(selection = model.selection) {
  if (workbenchBlocked()) return;
  if (catalogSelection?.count > 1 && catalogSelection.owners.some(ref => ref.kind === selection?.kind && ref.id === selection?.id)) { catalogSelection.openProperties(); return; }
  if (!selection) return;
  catalogSelection?.reset();
  if (['project', 'view', 'folder'].includes(selection.kind)) { metadataUI.open(selection); return; }
  select(selection, false);
  const { element, relationship } = selectedObjects();
  if (['visualNode', 'visualConnector'].includes(selection.kind)) visualsUI?.editSelected();
  else if (element || relationship) openDialog('inspector-panel');
}
function select(selection, announce = true, mode = 'replace') {
  whereUsed?.cancel();
  closeInspector();
  objectProperties?.cancel();
  documentationEditor?.cancel();
  customizationUI?.cancel();
  inline.cancel(false);
  layoutEditor?.cancel();
  if (mode === 'toggle') model.toggleSelection(selection);
  else if (mode === 'anchor') model.selectMany(model.selections, selection);
  else model.select(selection);
  paintSelection();
  renderCatalog(); renderInspector(); layoutEditor?.refresh(); alignmentUI?.refresh();
  modelAnalysis?.refresh();
  contextHints?.refresh({ selectionChanged: true });
  if (announce) status(model.selections.length > 1 ? `Выбрано рисунков: ${model.selections.length}. Опора: ${model.selection.id.slice(-8)}` : model.selection ? 'Объект выбран' : 'Выделение снято');
}
function paintSelection(view = model.view) {
  svg.dataset.selectionEffect = String(preferenceState.behavior.selectionEffect);
  for (const item of svg.querySelectorAll('[data-id]')) {
    const ref = { kind: item.dataset.kind, id: item.dataset.id }, active = model.isSelected(ref);
    item.classList.toggle('selected', active);
    item.setAttribute('aria-pressed', String(active));
    item.classList.toggle('selection-anchor', active && ref.kind === model.selection?.kind && ref.id === model.selection?.id);
  }
  svg.querySelector('.selection-anchor-outline')?.remove();
  if (model.selections.length > 1) {
    const ref = model.selection;
    const drawing = drawingFor(view, ref);
    const bounds = drawing?.bounds ?? (drawing && (ref.kind === 'visualConnector' ? visualGeometry(drawing, view, occurrenceContourFor(), notationUI.storedGeometry) : connectionGeometry(drawing, view.occurrences, occurrenceContourFor(), notationUI.storedGeometry, view.connections)).bounds);
    if (bounds) svg.append(vector('rect', { class: 'selection-anchor-outline', x: bounds.x - 5, y: bounds.y - 5, width: bounds.width + 10, height: bounds.height + 10, 'aria-hidden': 'true' }));
  }
  $('selection-summary').textContent = model.selections.length > 1 ? `Выбрано: ${model.selections.length} · опора ${model.selection.id.slice(-8)}` : '';
  fragmentClipboard?.refresh();
}
function selectCatalogConcept(concept) {
  const view = model.view;
  const drawing = concept.kind === 'relationship' ? view?.connections.find(item => item.relationshipId === concept.id)
    : view?.occurrences.find(item => item.concept.kind === concept.kind && item.concept.id === concept.id);
  select(drawing ? { kind: concept.kind === 'relationship' ? 'connection' : 'occurrence', id: drawing.id } : concept);
  panel(detachedCatalog?.detached ? 'canvas' : 'catalog');
}
function activateView(viewId) {
  whereUsed?.cancel();
  closeInspector();
  objectProperties?.cancel();
  documentationEditor?.cancel();
  viewpointUI?.cancel();
  customizationUI?.cancel();
  inline.cancel(false);
  cancelGesture();
  viewTabs?.beforeActivate(viewId);
  if (model.viewId !== viewId) { model.switchView(viewId); fit = false; }
  viewTabs?.afterActivate(viewId);
  render(); status(`Открыто: ${displayName(model.view.view)}`); panel('canvas');
}
$('view-tabs').addEventListener('keydown', event => {
  const current = event.target.closest('[data-view-scope="tabs"]');
  if (!current || event.altKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  const views = viewTabs.ids;
  const index = views.indexOf(current.dataset.viewId);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? views.length - 1
    : (index + (event.key === 'ArrowRight' ? 1 : -1) + views.length) % views.length;
  activateView(views[next]);
  $('view-tabs').querySelector(`[data-view-id="${views[next]}"]`).focus();
});
function makeCatalogMemberRow(ref, item, { state, view, selected, records, catalogLabel }) {
  const { kind, id } = ref;
  const row = node('div', undefined, 'catalog-member-row element-row');
  row.dataset.focusKey = `row-${kind}-${id}`;
  row.dataset.catalogKind = kind; row.dataset.catalogId = id;
  const label = catalogLabel ?? (kind === 'relationship' ? linkName(item) : displayName(item));
  const choose = button('', () => { cancelGesture(); if (kind === 'view') activateView(id); else selectCatalogConcept(ref); }, kind === 'view' ? 'view-button' : kind === 'relationship' ? 'relationship-button' : 'element-button');
  choose.dataset[`${kind}Id`] = id; choose.dataset.focusKey = `${kind === 'view' ? 'tree' : kind}-${id}`;
  choose.dataset.renameKind = kind; choose.dataset.renameId = id;
  choose.setAttribute('aria-pressed', String(kind === 'view' ? model.viewId === id : selected?.kind === kind && selected.id === id));
  if (kind === 'view') {
    choose.dataset.viewScope = 'tree'; choose.append(node('span', '▧', 'view-symbol'), node('span', label, 'element-name'));
    choose.title = `${label} · двойной щелчок / F2: имя`;
  } else {
    choose.append(node('span', kind === 'relationship' ? '↗' : '', kind === 'relationship' ? 'relationship-icon' : 'element-icon'), node('span', label, 'element-name'));
    if (kind === 'relationship') {
      const source = records.get(`${item.source.kind}:${item.source.id}`), target = records.get(`${item.target.kind}:${item.target.id}`);
      choose.title = `${displayName(source)} → ${displayName(target)} · ${id}`;
      choose.setAttribute('aria-label', `${item.type}: ${label}. ${displayName(source)} → ${displayName(target)}. ${id.slice(-8)}`);
    } else {
      const count = (view?.occurrences || []).filter(occurrence => occurrence.concept.kind === kind && occurrence.concept.id === id).length;
      const badge = node('span', String(count), 'occurrence-count'); badge.title = 'Экземпляров в текущем представлении'; choose.append(badge);
      choose.title = `${item.type} · ${label} · двойной щелчок / F2: имя`;
      choose.setAttribute('aria-label', `${item.type}: ${label}. Экземпляров в текущем виде: ${count}`);
    }
    const unused = !catalogUsedConcepts.has(`${kind}:${id}`); choose.dataset.unused = String(unused);
    if (unused) { const badge = node('span', '∅', 'unused-marker'); badge.title = 'Не используется ни в одном представлении'; badge.setAttribute('aria-hidden', 'true'); choose.append(badge); choose.setAttribute('aria-label', `${choose.getAttribute('aria-label')}. Не используется ни в одном представлении`); }
  }
  row.append(choose);
  if (['element', 'junction'].includes(kind)) {
    const add = button('＋', () => {
      if (!model.view) return;
      const result = safe(() => perform({ type: 'addOccurrence', viewId: model.viewId, concept: ref, bounds: nextBounds(kind) }, 'Экземпляр общего элемента добавлен в текущий вид', 'occurrenceId'));
      if (result) { panel('canvas'); focusSelected(); }
    }, 'tree-add-element');
    add.dataset.focusKey = `add-${kind}-${id}`; add.dataset[kind === 'junction' ? 'addJunctionId' : 'addElementId'] = id;
    add.disabled = !view || !model.conceptVisible(ref);
    add.setAttribute('aria-label', `Добавить экземпляр: ${label} · ${id.slice(-8)}`);
    add.title = view ? `Добавить в «${displayName(view.view)}»` : 'Сначала создайте представление кнопкой ＋ над полотном'; row.append(add);
  }
  return row;
}
function renderCatalog() {
  const bookmark = focusBookmark(), state = model.store.snapshot;
  catalogUsedConcepts = new Set(state.views.flatMap(entry => [...entry.occurrences.map(item => `${item.concept.kind}:${item.concept.id}`), ...entry.connections.map(item => `relationship:${item.relationshipId}`)]));
  viewTabs?.render();
  if (model.viewId) $('view-panel').setAttribute('aria-labelledby', `tab-${model.viewId}`);
  else $('view-panel').removeAttribute('aria-labelledby');
  $('project-name').textContent = state.project.name || '(без названия)';
  $('project-name').dataset.renameKind = 'project'; $('project-name').dataset.renameId = state.project.id;
  $('project-tree-name').textContent = state.project.name || '(без названия)';
  $('project-tree').dataset.renameId = state.project.id;
  $('project-tree-name').dataset.renameKind = 'project'; $('project-tree-name').dataset.renameId = state.project.id;
  $('model-origin').textContent = files?.sourceLabel || 'Синтетический пример';
  $('model-count').textContent = `${state.elements.length} / ${state.junctions.length} / ${state.relationships.length}`;
  catalogFolders?.refresh();
  modelSearch?.refresh();
  catalogSelection?.refresh(); detachedCatalog?.refresh();
  restoreFocus(bookmark);
}
function appendGraphIssues(container, state, filter) {
  if (graphCache?.revision !== model.store.revision) graphCache = { revision: model.store.revision, report: assessProject(state, modelProfiles).junctionAssessment };
  renderGraphIssues(document, container, graphCache.report, filter);
}
function renderInspector() {
  const bookmark = focusBookmark();
  const container = $('inspector-content');
  const advancedOpen = container.querySelector('.inspector-advanced')?.open ?? false;
  container.replaceChildren();
  if (catalogSelection?.renderInspector(container)) { $('inspector-button').disabled = false; restoreFocus(bookmark); return; }
  const { state, occurrence, connection, element, relationship, concept } = selectedObjects();
  const visual = ['visualNode', 'visualConnector'].includes(model.selection?.kind) && drawingFor(model.view, model.selection);
  $('inspector-button').disabled = !element && !relationship && !visual;
  if (visual) {
    container.append(node('h3', displayName(visual)), node('p', 'Рисунок текущего представления', 'inspector-note'),
      button('Изменить…', () => visualsUI.editSelected()), button('Оформление…', () => visualsUI.styleSelected()),
      button('Документация и свойства…', () => metadataUI.open({ ...model.selection, viewId: model.viewId })));
    if (visual.instruction) {
      const instructions = node('section', undefined, 'documentation-preview'); instructions.setAttribute('aria-label', 'Инструкция'); instructions.innerHTML = reportMarkdown(visual.instruction);
      container.append(node('h4', 'Инструкция'), instructions);
    }
    restoreFocus(bookmark); return;
  }
  if (!element && !relationship) {
    const empty = node('div', undefined, 'empty-state');
    if (model.view) empty.append(node('div', '↖', 'empty-icon'), node('h3', 'Начните с элемента'), node('p', 'Выберите объект на полотне или в каталоге. Здесь появятся его имя, положение и действия.'), node('p', 'Переименование меняет общую модель. Перемещение — только этот вид.'));
    else empty.append(node('h3', state.views.length ? 'Все вкладки закрыты' : 'В модели нет представлений'), node('p', state.views.length ? 'Откройте представление в каталоге. Закрытие вкладок сохраняет модель.' : 'Создайте первый вид кнопкой ＋ над полотном.'));
    container.append(empty); restoreFocus(bookmark); return;
  }
  const object = element || relationship;
  const title = button(element ? displayName(element) : linkName(relationship), () => renameAt({ kind: element ? concept.kind : 'relationship', id: object.id }, title), 'object-name editable-name');
  title.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.key !== 'F2' || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.keyCode === 229) return;
    event.preventDefault(); title.click();
  });
  title.dataset.focusKey = `inspector-title-${object.id}`; title.dataset.renameKind = element ? concept.kind : 'relationship'; title.dataset.renameId = object.id;
  title.title = 'Нажмите имя, Enter или F2, чтобы изменить';
  title.setAttribute('aria-label', `Изменить имя: ${title.textContent}`);
  container.append(node('span', `${object.type} · общая модель`, 'object-kind'), node('h3', 'Имя'), title);
  const identity = node('details', undefined, 'object-identity'); identity.append(node('summary', 'Идентификатор'), node('p', object.id, 'object-id')); container.append(identity);
  objectProperties?.appendInspector(container, { concept: concept || { kind: 'relationship', id: relationship.id }, occurrence });
  const usages = button('Где используется…', () => whereUsed.open(concept || { kind: 'relationship', id: relationship.id }));
  usages.dataset.inspectorAction = 'where-used'; container.append(usages);
  const analysis = button('Исследовать связи', () => { closeInspector(); modelAnalysis.open(concept || { kind: 'relationship', id: relationship.id }); });
  analysis.dataset.inspectorAction = 'analysis'; container.append(analysis);
  const actions = node('div', undefined, 'inspector-actions');
  container.append(node('h3', 'Документация'), node('p', object.documentation, 'documentation-text'));
  const editDocumentation = button('Изменить документацию…', () => documentationEditor.open(concept || { kind: 'relationship', id: relationship.id }));
  editDocumentation.dataset.inspectorAction = 'documentation'; container.append(editDocumentation);
  if (element) {
    const count = state.views.reduce((sum, entry) => sum + entry.occurrences.filter(item => item.concept.kind === concept.kind && item.concept.id === element.id).length, 0);
    container.append(node('p', `Это общий элемент: ${count} экз. в ${state.views.filter(entry => entry.occurrences.some(item => item.concept.kind === concept.kind && item.concept.id === element.id)).length} видах. Имя меняется везде.`, 'inspector-note'));
    actions.append(button('Добавить экземпляр в этот вид', () => safe(() => perform({ type: 'addOccurrence', viewId: model.viewId, concept: { ...concept }, bounds: nextBounds(concept.kind) }, 'Экземпляр добавлен', 'occurrenceId'))));
    if (occurrence) actions.append(button('Убрать экземпляр из вида', () => askDelete('occurrence', occurrence.id)));
    actions.append(button(concept.kind === 'junction' ? 'Удалить junction из модели…' : 'Удалить элемент из модели…', () => askDelete(concept.kind, element.id), 'danger'));
    if (concept.kind === 'junction') {
      const changeKind = button(`Изменить на ${element.type === 'AndJunction' ? 'OrJunction' : 'AndJunction'}`, () => perform({ type: 'updateJunctionType', junctionId: element.id, junctionType: element.type === 'AndJunction' ? 'OrJunction' : 'AndJunction' }, 'Тип общего junction изменён'));
      actions.append(changeKind);
      container.append(node('p', 'Junction: общий концепт с отдельными экземплярами. Круг центрирован в сохранённых границах; якорь на линии является только точкой вида.', 'inspector-note'));
      appendGraphIssues(container, state, { junctionId: element.id });
    }
    if (occurrence) {
      const details = node('div', undefined, 'details');
      const position = node('div'); position.append(node('span', 'Положение в этом виде'), node('strong', `${occurrence.bounds.x} : ${occurrence.bounds.y}`));
      details.append(position, node('p', `Экземпляр ${occurrence.id.slice(-8)}. Стрелки перемещают выбранный блок; Shift — точный шаг.`)); container.append(details);
    }
  } else {
    const from = conceptRecord(state, relationship.source);
    const to = conceptRecord(state, relationship.target);
    const count = state.views.reduce((sum, entry) => sum + entry.connections.filter(item => item.relationshipId === relationship.id).length, 0);
    container.append(node('p', `${relationship.source.kind}: ${conceptName(state, relationship.source)} → ${relationship.target.kind}: ${conceptName(state, relationship.target)}`, 'inspector-note'), node('p', `Общее отношение показано ${count} раз. Удаление соединения оставляет отношение в модели.`, 'inspector-note'));
    const assessment = relationshipAssessment(state, relationship), diagnostic = diagnosticPresentation(assessment);
    const assessmentText = node('p', assessmentMessage(assessment), 'profile-unknown relationship-assessment');
    assessmentText.dataset.assessment = diagnostic.status; container.append(assessmentText);
    const evidence = node('details', undefined, 'assessment-evidence');
    renderAssessmentEvidence(document, evidence, assessment, relationshipTypeContext(state, relationship), relationshipCoverage(state.project.metamodel));
    evidence.querySelector('summary').dataset.focusKey = `inspector-assessment-${relationship.id}`; container.append(evidence);
    for (const [end, caption] of [['source', 'Откуда'], ['target', 'Куда']]) {
      const key = `${end}Multiplicity`, present = Object.hasOwn(relationship, key);
      const summary = node('p', `${caption}${relationship[end].kind === 'junction' ? ' (junction: неприменима)' : ''}: ${present ? relationship[key] === '' ? '⟨пусто⟩' : relationship[key] : 'не задана'} · ${({ ABSENT: 'не задана', CONFIRMED_SYNTAX: 'запись подтверждена', UNVERIFIED: 'запись не проверена', INVALID_SYNTAX: 'ошибка записи; текст сохранён' })[assessMultiplicity(relationship[key], present).status]}`, 'multiplicity-summary');
      summary.dataset.multiplicitySummary = end; summary.title = present ? relationship[key] : 'Кратность не задана'; container.append(summary);
    }
    appendGraphIssues(container, state, { relationshipId: relationship.id });
    if (relationship.source.kind === 'junction' || relationship.target.kind === 'junction') {
      actions.append(button(relationship.junctionRole === 'container' ? 'Снять роль container' : 'Указать роль container', () => perform({ type: 'updateRelationshipJunctionRole', relationshipId: relationship.id, junctionRole: relationship.junctionRole === 'container' ? null : 'container' }, 'Роль отношения изменена; применимость проверяется отдельно')));
      container.append(node('p', 'container — явная аннотация намерения, не разрешение и не вложенность. Применимость исключения и границы источника проверяются отдельно.', 'inspector-note'));
    }
    const editMultiplicity = button('Кратности концов…', () => multiplicityEditor.open(relationship.id));
    editMultiplicity.dataset.inspectorAction = 'multiplicity'; actions.append(editMultiplicity);
    actions.append(button('Показать это отношение в виде', () => { typedActions.openLink(null, { relationshipId: relationship.id }); }));
    if (connection) actions.append(button('Убрать соединение из вида', () => askDelete('connection', connection.id)));
    actions.append(button('Удалить отношение из модели…', () => askDelete('relationship', relationship.id), 'danger'));
  }
  if (!model.view) {
    for (const action of actions.children) if (!action.classList.contains('danger') && !['multiplicity', 'documentation'].includes(action.dataset.inspectorAction)) action.disabled = true;
    container.append(node('p', 'В модели нет видов. Общие объекты сохранены; создайте первый вид кнопкой ＋ над полотном.', 'inspector-note'));
  }
  for (const [index, action] of [...actions.children].entries()) action.dataset.inspectorAction ??= String(index);
  container.append(actions);
  if (connection) {
    const geometry = connectionGeometry(connection, model.view.occurrences, occurrenceContourFor(), notationUI.storedGeometry, model.view.connections);
    for (const issue of geometry.diagnostics || []) container.append(node('p', `Геометрия · ${issue.ruleId}: ${issue.ruleId === 'anchor-occluded' ? 'Якорь скрыт под узлом; его положение сохранено, ручка доступна для перемещения.' : issue.ruleId === 'degenerate-route' ? 'У маршрута нет ненулевого участка; точки сохранены.' : 'Конец маршрута перекрыт узлом; координаты сохранены.'}`, 'inspector-note'));
  }
  customizationUI?.appendInspector(container, state, concept || { kind: 'relationship', id: relationship.id });
  layoutEditor?.appendInspector(container);
  const advanced = node('details', undefined, 'inspector-advanced');
  advanced.open = advancedOpen;
  advanced.append(node('summary', 'Дополнительно'));
  for (const child of [...container.children]) {
    if (child.matches('.object-identity,.inspector-note:not(.relationship-assessment),.inspector-actions,.customization-inspector,.layout-editor-controls,.assessment-evidence,.details,.graph-issue,.multiplicity-summary')) advanced.append(child);
  }
  container.append(advanced); restoreFocus(bookmark);
}
function occurrenceContourFor(state) {
  const revision = model.store.revision;
  if (!state && contourCache?.revision === revision) return contourCache.read;
  state ??= model.store.snapshot;
  const contours = new Map(state.elements.map(element => {
    const appearance = notationElement(state.project.metamodel, element.type);
    return [element.id, ['box3d', 'octagon', 'ellipse', 'folder', 'cloud', 'wavy'].includes(appearance.contour) ? appearance.contour : appearance.radius];
  }));
  contourCache = { revision, read: occurrence => occurrence.concept.kind === 'junction' ? 'circle' : contours.get(occurrence.concept.id) ?? 0 };
  return contourCache.read;
}
function relationshipsFor(state) {
  const store = model.store, revision = store.revision;
  if (relationshipCache?.store === store && relationshipCache.revision === revision) return relationshipCache.values;
  state ??= store.snapshot;
  relationshipCache = { store, revision, values: new Map(state.relationships.map(item => [item.id, item])) };
  return relationshipCache.values;
}
function updateGeometry(view, radiusFor = occurrenceContourFor(), state = null, isolated = false) {
  if (!view) return;
  const drawings = new Map();
  for (const item of svg.querySelectorAll('[data-id]')) if (!drawings.has(item.dataset.id)) drawings.set(item.dataset.id, item);
  let routes = 0, labels = 0, fallbacks = 0, geometryWarnings = 0;
  const relationships = state ? new Map(state.relationships.map(item => [item.id, item])) : relationshipsFor();
  for (const occurrence of [...view.occurrences, ...view.visualNodes]) {
    const item = drawings.get(occurrence.id);
    item?.setAttribute('transform', `translate(${occurrence.bounds.x} ${occurrence.bounds.y})`);
  }
  for (const connection of view.connections) {
    const group = drawings.get(connection.id);
    if (!group) continue;
    const geometry = connectionGeometry(connection, view.occurrences, radiusFor, notationUI.storedGeometry, view.connections);
    group.dataset.routeMode = geometry.routeMode || 'automatic';
    group.dataset.routeFallback = geometry.fallbackReason || '';
    if (geometry.routeMode === 'stored-polyline' || geometry.routeMode === 'pinned-polyline') routes++;
    group.dataset.geometryDiagnostics = (geometry.diagnostics || []).map(item => item.ruleId).join(' ');
    geometryWarnings += geometry.diagnostics?.length || 0;
    const stereotype = group.querySelector('.stereotype-label');
    group.querySelector('title').textContent = `${linkName(relationships.get(connection.relationshipId))}${stereotype ? ' · ' + stereotype.getAttribute('aria-label') : ''}${geometry.diagnostics?.length ? ' · Геометрия: ' + geometry.diagnostics.map(item => item.ruleId).join(', ') : ''}`;
    if (geometry.routeMode === 'automatic-fallback') fallbacks++;
    if (connection.labelPosition !== null) labels++;
    for (const path of group?.querySelectorAll('path') || []) path.setAttribute('d', geometry.d);
    const label = group?.querySelector('.relationship-label'); label?.setAttribute('x', geometry.x); label?.setAttribute('y', geometry.y);
    stereotype?.setAttribute('x', geometry.x); stereotype?.setAttribute('y', geometry.y - 20);
    for (const prior of group.querySelectorAll('.multiplicity-label')) prior.remove();
    const source = view.occurrences.find(item => connection.source.kind === 'occurrence' && item.id === connection.source.id);
    const target = view.occurrences.find(item => connection.target.kind === 'occurrence' && item.id === connection.target.id);
    for (const value of multiplicityLabels(relationships.get(connection.relationshipId), geometry, source?.bounds, target?.bounds)) {
      const text = vector('text', { class: 'multiplicity-label', 'data-multiplicity-end': value.end, x: value.x, y: value.y, 'text-anchor': value.anchor, 'aria-label': `${value.end === 'source' ? 'Откуда' : 'Куда'}: ${value.raw}` }, value.text);
      text.append(vector('title', {}, value.raw)); multiplicityBounds.set(text, value.bounds); group.append(text);
    }
  }
  for (const connection of view.visualConnectors) {
    const group = drawings.get(connection.id);
    if (!group) continue;
    const geometry = visualGeometry(connection, view, radiusFor, notationUI.storedGeometry);
    for (const path of group.querySelectorAll('path')) path.setAttribute('d', geometry.d);
    const label = group.querySelector('.relationship-label'); label?.setAttribute('x', geometry.x); label?.setAttribute('y', geometry.y);
  }
  $('stored-geometry-status').textContent = notationUI.storedGeometry
    ? `Локальная v2: сохранённых ломаных ${routes}; заданных подписей ${labels}; автоматических замен ${fallbacks} (нет видимого участка сохранённого маршрута).`
    : `Автоматические изгибы; закреплённых маршрутов ${routes}. Якоря присоединения обязательны и сохраняют координаты.`;
  for (const connection of view.connections) for (const anchor of connection.routePoints.filter(point => point.kind === 'anchor')) {
    const handle = svg.querySelector(`[data-anchor-id="${anchor.id}"]`);
    for (const circle of handle?.querySelectorAll('circle') || []) { circle.setAttribute('cx', anchor.point.x); circle.setAttribute('cy', anchor.point.y); }
  }
  if (geometryWarnings) $('stored-geometry-status').textContent += ` Предупреждений геометрии: ${geometryWarnings}; якоря сохранены. Выберите соединение для подробностей.`;
  applyDrawingGeometryStyles(svg, view);
  if (!isolated) layoutEditor?.update(view);
}
function displayedLabelBounds(connection) {
  const label = svg.querySelector(`[data-id="${connection.id}"] .relationship-label`);
  if (!label) return null;
  try {
    const box = label.getBBox();
    if ([box.x, box.y, box.width, box.height].every(Number.isFinite) && box.width >= 0 && box.height >= 0 &&
        (!label.textContent.length || (box.width > 0 && box.height > 0))) {
      return { x: box.x - 4, y: box.y - 4, width: box.width + 8, height: box.height + 8 };
    }
  } catch { /* Unavailable in DOM-only test environments; use a conservative bound. */ }
  const width = Array.from(label.textContent).length * 22 + 8;
  return { x: Number(label.getAttribute('x')) - width / 2, y: Number(label.getAttribute('y')) - 18, width, height: 30 };
}
function appendStereotype(group, label, x, y, limit) {
  if (!label) return;
  const text = vector('text', { class: 'stereotype-label', x, y, 'text-anchor': 'middle', 'aria-label': label }, short(label, limit));
  text.append(vector('title', {}, label)); group.append(text);
  group.setAttribute('aria-label', `${group.getAttribute('aria-label')} · ${label}`);
  group.querySelector('title').textContent += ` · ${label}`;
}
function renderCanvas(snapshot = null, entry = null, isolated = false) {
  clearPendingCaptions();
  smartRelationship?.cancel();
  // Only called with no pointer capture. Gesture previews update existing nodes in place.
  const state = snapshot ?? model.store.snapshot, view = entry ?? model.view;
  svg.dataset.notation = DRAFT_NOTATION;
  svg.dataset.geometry = notationUI.storedGeometry ? 'schemka-stored-geometry@2' : 'automatic';
  if (!view) {
    $('selection-summary').textContent = '';
    $('stored-geometry-status').textContent = 'Нет представления для отображения маршрутов.';
    svg.replaceChildren(vector('text', { x: 450, y: 280, 'text-anchor': 'middle', class: 'empty-canvas-title' }, state.views.length ? 'Все вкладки закрыты' : 'В модели нет представлений'),
      vector('text', { x: 450, y: 312, 'text-anchor': 'middle', class: 'empty-canvas-note' }, state.views.length ? 'Откройте представление из каталога слева.' : 'Создайте первый вид кнопкой ＋ над полотном или откройте файл с видами.'));
    svg.setAttribute('viewBox', '0 0 900 640'); svg.classList.remove('fitted'); viewport?.restore(); minimap?.refresh(); return;
  }
  const { labelFor } = createCustomizationResolver(state);
  // Match native ID order before the first save, including keyboard/anchor order.
  const connections = [...view.connections].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const children = [notationDefs(document)];
  if (!isolated && view.view.viewpointId && !view.occurrences.length && !view.connections.length) children.push(vector('text', { x: 450, y: 280, 'text-anchor': 'middle', class: 'empty-canvas-title' }, `Пустая проекция · скрыто рисунков: ${model.projection.excludedDrawings.length}`));
  for (const connection of connections) {
    const relationship = state.relationships.find(item => item.id === connection.relationshipId);
    const appearance = notationRelationship(state.project.metamodel, relationship.type);
    const typeLabel = appearance.notation === UNKNOWN_NOTATION ? appearance.badge : relationship.type;
    const group = vector('g', { class: appearance.className, tabindex: 0, role: 'button', 'aria-label': `${typeLabel}: ${linkName(relationship)}. Соединение ${connection.id.slice(-8)}`, 'data-id': connection.id, 'data-notation': appearance.notation, 'data-kind': 'connection', 'data-rename-kind': 'relationship', 'data-rename-id': relationship.id });
    group.append(vector('title', {}, linkName(relationship)), vector('path', { class: 'hit' }), notationLine(document, appearance), vector('text', { class: 'relationship-label', 'text-anchor': 'middle' }, short(`${typeLabel} · ${relationship.label || 'UNKNOWN'}`, 36)));
    appendStereotype(group, labelFor(relationship.id), 0, -20, 36);
    children.push(group);
  }
  // Entity-array order is not persistent: file IO canonicalizes it by ID.
  // Paint low-to-high zIndex, with a stable tie-break, without mutating the view.
  const orderedOccurrences = view.occurrences.map((occurrence, index) => ({ occurrence, index }))
    .sort(({ occurrence: a }, { occurrence: b }) => a.zIndex - b.zIndex || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  orderedOccurrences.forEach(({ occurrence, index }) => {
    const element = conceptRecord(state, occurrence.concept);
    const junction = occurrence.concept.kind === 'junction';
    const appearance = junction ? notationJunction(state.project.metamodel, element.type) : notationElement(state.project.metamodel, element.type);
    const typeLabel = appearance.notation === UNKNOWN_NOTATION ? appearance.badge : element.type;
    const group = vector('g', { class: appearance.className, tabindex: 0, role: 'button', 'aria-label': `${typeLabel}: ${displayName(element)}. Экземпляр ${index + 1}`, 'data-id': occurrence.id, 'data-notation': appearance.notation, 'data-kind': 'occurrence', 'data-rename-kind': occurrence.concept.kind, 'data-rename-id': element.id });
    if (junction) {
      const radius = Math.min(occurrence.bounds.width, occurrence.bounds.height) / 2;
      const caption = appearance.notation === UNKNOWN_NOTATION ? appearance.badge : element.type === 'AndJunction' ? 'AND' : 'OR';
      group.append(vector('title', {}, `${typeLabel}: ${displayName(element)} · экземпляр ${index + 1}`), vector('circle', { class: 'junction-hit', cx: occurrence.bounds.width / 2, cy: occurrence.bounds.height / 2, r: Math.max(radius, 12) }), vector('circle', { class: 'node-box', cx: occurrence.bounds.width / 2, cy: occurrence.bounds.height / 2, r: radius }), vector('text', { class: 'junction-caption', x: occurrence.bounds.width / 2, y: occurrence.bounds.height / 2 + radius + 18, 'text-anchor': 'middle' }, `${caption} · ${short(displayName(element), 22)}`));
      appendStereotype(group, labelFor(element.id), occurrence.bounds.width / 2, occurrence.bounds.height / 2 + radius + 38, 28);
      children.push(group); return;
    }
    const caption = createElementCaption(document, appearance, occurrence.bounds, displayName(element), index + 1);
    group.append(vector('title', {}, `${displayName(element)} · экземпляр ${index + 1}`), notationBox(document, appearance, occurrence.bounds), vector('rect', { class: 'node-accent', x: 0, y: 14, width: 4, height: Math.max(0, occurrence.bounds.height - 28), rx: 2 }), ...caption.nodes);
    pendingCaptions.push(caption);
    appendStereotype(group, labelFor(element.id), occurrence.bounds.width / 2, -9, Math.max(8, Math.floor(occurrence.bounds.width / 8)));
    children.push(group);
  });
  for (const connection of connections) for (const anchor of connection.routePoints.filter(point => point.kind === 'anchor')) {
    const join = vector('g', { class: 'view-anchor', tabindex: 0, role: 'button', 'aria-label': `Якорь присоединения вида ${anchor.id.slice(-8)}. Соединение ${connection.id.slice(-8)}`, 'data-id': connection.id, 'data-kind': 'connection', 'data-anchor-id': anchor.id });
    join.append(vector('circle', { class: 'view-anchor-hit', cx: anchor.point.x, cy: anchor.point.y, r: 10 }), vector('circle', { class: 'view-anchor-mark', cx: anchor.point.x, cy: anchor.point.y, r: 3 }), vector('title', {}, 'Якорь присоединения вида; не ArchiMate junction')); children.push(join);
  }
  const radiusForVisuals = occurrenceContourFor(state);
  for (const item of view.visualConnectors) children.push(renderVisualConnector(document, item, view, radiusForVisuals, notationUI.storedGeometry));
  for (const item of view.visualNodes) children.push(renderVisualNode(document, item, state, view));
  // A container paints behind its descendants; z-order remains stable among siblings.
  const layers = children.filter(item => ['occurrence', 'visualNode'].includes(item.dataset.kind));
  const byRef = new Map(layers.map(item => [`${item.dataset.kind}:${item.dataset.id}`, item])), siblings = new Map();
  for (const item of layers) {
    const parent = drawingFor(view, { kind: item.dataset.kind, id: item.dataset.id }).parent;
    const key = parent && byRef.has(`${parent.kind}:${parent.id}`) ? `${parent.kind}:${parent.id}` : 'root';
    if (!siblings.has(key)) siblings.set(key, []); siblings.get(key).push(item);
  }
  for (const group of siblings.values()) group.sort((a, b) => drawingFor(view, { kind: a.dataset.kind, id: a.dataset.id }).zIndex - drawingFor(view, { kind: b.dataset.kind, id: b.dataset.id }).zIndex || a.dataset.id.localeCompare(b.dataset.id));
  const pending = [...(siblings.get('root') ?? [])].reverse(), orderedLayers = [];
  while (pending.length) { const item = pending.pop(); orderedLayers.push(item); pending.push(...[...(siblings.get(`${item.dataset.kind}:${item.dataset.id}`) ?? [])].reverse()); }
  const nodeIds = new Set(layers), container = item => siblings.has(`${item.dataset.kind}:${item.dataset.id}`);
  // Opaque containers must not cover their internal or cross-container lines.
  svg.replaceChildren(children[0], ...orderedLayers.filter(container),
    ...children.slice(1).filter(item => !nodeIds.has(item)), ...orderedLayers.filter(item => !container(item)));
  fitPendingCaptions();
  const radiusFor = occurrenceContourFor(state); relationshipsFor(state);
  updateGeometry(view, radiusFor, isolated ? state : null, isolated);
  applyDrawingStyles(svg, state, view);
  if (!isolated) { const warning = $('connection-decoration-warning'); warning.textContent = [svg.dataset.connectionDecorationWarning, svg.dataset.semanticStyleWarning].filter(Boolean).join(' · '); warning.hidden = !warning.textContent; }
  paintSelection(view);
  if (fit && (view.occurrences.length || view.connections.length || view.visualNodes.length || view.visualConnectors.length)) {
    const bounds = viewGeometryBounds(view.occurrences, view.connections, radiusFor, notationUI.storedGeometry, displayedLabelBounds);
    const rectangles = [bounds, ...visualBounds(view, radiusFor, notationUI.storedGeometry)];
    for (const occurrence of view.occurrences.filter(item => labelFor(item.concept.id))) {
      rectangles.push({ x: occurrence.bounds.x - 40, y: occurrence.bounds.y - 45, width: occurrence.bounds.width + 80, height: occurrence.bounds.height + 90 });
    }
    for (const label of svg.querySelectorAll('.connection .stereotype-label')) {
      const width = Array.from(label.firstChild?.textContent || '').length * 14 + 30;
      rectangles.push({ x: Number(label.getAttribute('x')) - width / 2, y: Number(label.getAttribute('y')) - 30, width, height: 50 });
    }
    for (const occurrence of view.occurrences.filter(item => item.concept.kind === 'junction')) rectangles.push({ x: occurrence.bounds.x + occurrence.bounds.width / 2 - 230, y: occurrence.bounds.y, width: 460, height: occurrence.bounds.height + 110 });
    for (const label of svg.querySelectorAll('.multiplicity-label')) {
      const fallback = multiplicityBounds.get(label);
      if (fallback) rectangles.push({ x: fallback.x - 70, y: fallback.y - 90, width: fallback.width + 140, height: fallback.height + 160 });
      try {
        const box = label.getBBox();
        if ([box.x, box.y, box.width, box.height].every(Number.isFinite) && box.width > 0 && box.height > 0) rectangles.push({ x: box.x - 74, y: box.y - 94, width: box.width + 148, height: box.height + 168 });
      } catch { /* The shared conservative label box remains available. */ }
    }
    const left = Math.min(...rectangles.map(item => item.x)), top = Math.min(...rectangles.map(item => item.y));
    const right = Math.max(...rectangles.map(item => item.x + item.width)), bottom = Math.max(...rectangles.map(item => item.y + item.height));
    const margin = preferenceState.gestures.margin;
    svg.setAttribute('viewBox', `${left - margin} ${top - margin} ${right - left + margin * 2} ${bottom - top + margin * 2}`);
  } else svg.setAttribute('viewBox', '0 0 900 640');
  svg.classList.toggle('fitted', fit);
  if (!isolated) { viewport?.restore(); layoutEditor?.refresh(); gestureTools?.paintGrid(); minimap?.refresh(); }
}
function snapshotViewSvg(state, viewId, { includeHidden = false } = {}) {
  cancelPreferenceMotion(svg);
  const source = includeHidden ? state.views.find(entry => entry.view.id === viewId) : projectView(state, viewId);
  if (!source) throw new Error('Представление не найдено.');
  const view = layoutVisualView(state, applyPreferenceView(structuredClone({ view: source.view, occurrences: source.occurrences, connections: source.connections, visualNodes: source.visualNodes, visualConnectors: source.visualConnectors }), preferenceState));
  try {
    renderCanvas(state, view, true);
    const bounds = [viewGeometryBounds(view.occurrences, view.connections, occurrenceContourFor(state), notationUI.storedGeometry, displayedLabelBounds), ...visualBounds(view, occurrenceContourFor(state), notationUI.storedGeometry)];
    const x = Math.min(...bounds.map(item => item.x)), y = Math.min(...bounds.map(item => item.y));
    const right = Math.max(...bounds.map(item => item.x + item.width)), bottom = Math.max(...bounds.map(item => item.y + item.height));
    return exportViewSvg({ canvas: svg, title: view.view.name, bounds: { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) } });
  } finally { contourCache = null; relationshipCache = null; renderCanvas(); }
}
function render() {
  const motion = capturePreferenceMotion(svg);
  model.sanitizeSelection();
  internalDrag?.cancel(); contextMenu?.close(true);
  inline.cancel(false);
  const bookmark = focusBookmark();
  renderCatalog(); renderCanvas(); renderInspector();
  animatePreferenceMotion(svg, motion, preferenceState, { window });
  $('view-title').textContent = model.view ? displayName(model.view.view) : model.store.snapshot.views.length ? 'Вкладки закрыты' : 'Нет представлений';
  for (const id of ['fit-button', 'duplicate-view']) $(id).disabled = !model.view;
  metadataUI?.refresh(); files?.refresh(); git?.refresh(); profileUI?.refresh(); customizationUI?.refresh(); viewpointUI?.refresh(); paletteUI?.refresh(); notationUI?.refresh(); alignmentUI?.refresh(); fragmentClipboard?.refresh(); visualsUI?.refresh(); editingTools?.refresh(); exportReportUI?.refresh(); interchangeUI?.refresh(); templatesUI?.refresh(); automationUI?.refresh(); semanticEditing?.refresh(); hostPolicyUI?.refresh(); relatedDrawingsUI?.refresh(); modelGallery?.refresh(); relationshipReference?.refresh(); specializationTools?.refresh(); detachedPalette?.refresh();
  $('view-count').textContent = `${(model.view?.occurrences || []).length} экз. · ${(model.view?.connections || []).length} соед.`;
  $('undo').disabled = !model.store.history.undo;
  $('redo').disabled = !model.store.history.redo;
  $('history-state').textContent = `Единая история · ${model.store.history.undo} действий`;
  modelAnalysis?.refresh();
  contextHints?.refresh();
  restoreFocus(bookmark);
}
function focusSelected() {
  const target = model.selection && svg.querySelector(`[data-id="${model.selection.id}"]`);
  (target || svg).focus({ preventScroll: true });
}
function nextBounds(kind = 'element') {
  if (kind === 'junction') {
    const bounds = nextJunctionBounds(model.view);
    if (!bounds) throw new Error('Нет свободного места для junction в области автоматического размещения 900 × 640. Отмените создание и перетащите junction из палитры или дерева в выбранное место на полотне.');
    return bounds;
  }
  const [x, y, width, height] = svg.getAttribute('viewBox').split(/\s+/).map(Number);
  const bounds = nextElementBounds(model.view, { x, y, width, height }, preferenceState.defaults);
  if (!bounds) throw new Error('Нет свободного места для элемента в допустимой области модели. Освободите место или перетащите элемент в выбранное положение.');
  return bounds;
}
function perform(command, message, selectCreated) {
  whereUsed?.cancel();
  documentationEditor?.cancel();
  inline.cancel(false);
  cancelGesture();
  const result = safe(() => model.execute(command));
  if (!result || result.deferred) return;
  try {
    if (selectCreated) model.select({ kind: selectCreated === 'occurrenceId' ? 'occurrence' : 'connection', id: result.created[selectCreated] });
    render();
    if (command.type === 'addOccurrence' && command.concept.kind === 'element') viewport?.reveal(command.bounds);
    status(message);
  } catch (error) { status(`Изменение уже сохранено, но интерфейс не обновлён полностью: ${error.message}`); }
  return result;
}
function openDialog(id) { if (id !== 'catalog-selection-dialog') catalogSelection?.cancel(); if (id !== 'semantic-editing-dialog') semanticEditing?.cancel(); if (id !== 'host-policy-dialog') hostPolicyUI?.cancel(); if (id !== 'automation-dialog') automationUI?.cancel(); if (id !== 'related-drawings-dialog') relatedDrawingsUI?.cancel(); if (id !== 'model-gallery-dialog') modelGallery?.cancel(); if (id !== 'relationship-reference-dialog') relationshipReference?.cancel(); if (id !== 'preferences-dialog') preferencesUI?.cancel(); if (id !== 'interchange-dialog') interchangeUI?.cancel(); if (id !== 'templates-dialog') templatesUI?.cancel(); if (id !== 'export-report-dialog') exportReportUI?.cancel(); if (id !== 'fragment-dialog') fragmentClipboard?.cancel(); if (id !== 'gesture-settings-dialog') gestureTools?.cancel(); if (id !== 'diagram-tools-dialog') editingTools?.cancel(); if (id !== 'visual-dialog') visualsUI?.cancel(); if (id !== 'catalog-folder-dialog') catalogFolders?.cancel(); if (id !== 'alignment-dialog') alignmentUI?.cancel(); if (id !== 'where-used-dialog') whereUsed?.cancel(); if (id !== 'inspector-panel') closeInspector(); if (!['object-properties-dialog', 'occurrence-size-dialog'].includes(id)) objectProperties?.cancel(); if (id !== 'documentation-dialog') documentationEditor?.cancel(); if (id !== 'viewpoint-dialog') viewpointUI?.cancel(); if (id !== 'customization-dialog') customizationUI?.cancel(); if (id !== 'multiplicity-dialog') multiplicityEditor?.cancel(); inline.cancel(false); viewport?.cancel(); gestureTools?.stop(); cancelEditingGestures(); $(id).showModal(); }
function askDelete(kind, id) {
  cancelGesture();
  const global = ['element', 'junction', 'relationship'].includes(kind);
  let lines, command;
  if (global) {
    const impact = model.impact({ kind, id });
    const views = model.store.snapshot.views.filter(entry => impact.viewIds.includes(entry.view.id)).map(entry => displayName(entry.view));
    lines = [`Элементов: ${impact.elementIds.length}`, `Junctions: ${impact.junctionIds.length}`, `Отношений: ${impact.relationshipIds.length}`, `Экземпляров: ${impact.occurrenceIds.length}`, `Соединений: ${impact.connectionIds.length}`, `Затронутые виды: ${views.join(', ') || 'нет'}`];
    command = kind === 'junction' ? { type: 'deleteJunctionFromModel', junctionId: id } : kind === 'element' ? { type: 'deleteElementFromModel', elementId: id } : { type: 'deleteRelationshipFromModel', relationshipId: id };
    $('delete-title').textContent = kind === 'junction' ? 'Удалить junction из всей модели?' : kind === 'element' ? 'Удалить элемент из всей модели?' : 'Удалить отношение из всей модели?';
    $('delete-description').textContent = 'Будут удалены объект и все перечисленные зависимости во всех представлениях.';
  } else {
    const impact = model.drawingImpact({ kind, id });
    lines = [`Представление: ${displayName(model.view.view)}`, `Экземпляров: ${impact.occurrenceIds.length}`, `Соединений: ${impact.connectionIds.length}`, 'Общие элементы, junctions и отношения останутся в модели'];
    command = kind === 'occurrence' ? { type: 'removeOccurrence', viewId: model.viewId, occurrenceId: id } : { type: 'removeConnection', viewId: model.viewId, connectionId: id };
    $('delete-title').textContent = kind === 'occurrence' ? 'Убрать экземпляр из вида?' : 'Убрать соединение из вида?';
    $('delete-description').textContent = 'Изменится только текущее представление. Остальные виды сохранятся.';
  }
  if (global && !preferenceState.behavior.deleteWarning) { perform(command, 'Удалено из модели · можно восстановить через «Отменить»'); return; }
  pendingDelete = { command, revision: model.store.revision, store: model.store, documentToken: projectSession.documentToken };
  $('delete-impact').replaceChildren(...lines.map(text => node('li', text)));
  $('delete-confirm').textContent = global ? 'Удалить из модели' : 'Убрать из вида';
  openDialog('delete-dialog');
}
function askDeleteSelection() {
  cancelGesture();
  const drawings = model.selections.map(({ kind, id }) => ({ kind, id }));
  const impact = drawingSelectionDeletionImpact(model.store.snapshot, { viewId: model.viewId, drawings });
  pendingDelete = { command: { type: 'removeDrawings', viewId: model.viewId, drawings }, revision: model.store.revision, store: model.store, documentToken: projectSession.documentToken };
  $('delete-title').textContent = 'Убрать выбранные рисунки из вида?';
  $('delete-description').textContent = 'Зависимые линии также будут убраны. Дочерние рисунки сохранят положение. Изменение можно отменить одним действием.';
  $('delete-impact').replaceChildren(...[
    `Представление: ${displayName(model.view.view)}`, `Выбрано: ${drawings.length}`,
    `Экземпляров: ${impact.occurrenceIds.length}`, `Соединений: ${impact.connectionIds.length}`,
    `Визуальных объектов: ${(impact.visualNodeIds ?? []).length}`, `Визуальных линий: ${(impact.visualConnectorIds ?? []).length}`,
    'Общие концепты и остальные виды сохранятся',
  ].map(text => node('li', text)));
  $('delete-confirm').textContent = 'Убрать из вида';
  openDialog('delete-dialog');
}
$('delete-confirm').addEventListener('click', () => {
  if (!pendingDelete) return;
  if (pendingDelete.store !== model.store || pendingDelete.documentToken !== projectSession.documentToken || pendingDelete.revision !== model.store.revision) { $('delete-dialog').close(); status('Модель изменилась. Повторите проверку зависимостей.'); return; }
  const result = perform(pendingDelete.command, 'Удалено · можно восстановить через «Отменить»');
  if (result) { $('delete-dialog').close(); panel('canvas'); focusSelected(); }
});
for (const item of document.querySelectorAll('[data-close]')) item.addEventListener('click', () => item.closest('dialog').close());
$('delete-dialog').addEventListener('close', () => { pendingDelete = null; });

$('clear-selection').addEventListener('click', () => { cancelGesture(); select(null); });
let aboutGeneration = 0;
$('about-dialog').addEventListener('close', () => {
  document.querySelector('[data-command="about-button"]').closest('.app-menu').querySelector('summary').focus({ preventScroll: true });
});
$('about-button').addEventListener('click', async () => {
  const generation = ++aboutGeneration, desktop = window.schemkaDesktop;
  $('about-version').textContent = desktop ? 'Версия приложения…' : 'Браузерный просмотр';
  openDialog('about-dialog');
  if (!desktop) return;
  let text = 'Версия приложения недоступна';
  try {
    const info = await desktop.getAppInfo();
    if (info?.status === 'ok' && typeof info.version === 'string' && info.version.trim()) text = `Версия ${info.version}`;
  } catch { /* Keep About usable if the desktop bridge is unavailable. */ }
  if (generation === aboutGeneration && $('about-dialog').open) $('about-version').textContent = text;
});
$('fit-button').addEventListener('click', () => { cancelGesture(); viewport?.reset(); fit = true; const bookmark = focusBookmark(); renderCanvas(); restoreFocus(bookmark); status('Все элементы вписаны в полотно'); });
for (const item of document.querySelectorAll('[data-panel]')) item.addEventListener('click', () => { inline.cancel(false); cancelGesture(); panel(item.dataset.panel); });
function history(action) {
  if (workspace?.active) return;
  whereUsed?.cancel();
  objectProperties?.cancel();
  documentationEditor?.cancel();
  inline.cancel(false);
  cancelGesture();
  if (!model.store.history[action]) return;
  const result = safe(() => model[action]());
  if (!result) return;
  render();
  const names = model.store.snapshot.views.filter(entry => result.affectedViewIds.includes(entry.view.id)).map(entry => displayName(entry.view));
  status(`${action === 'undo' ? 'Отменено' : 'Повторено'} · ${names.join(', ') || 'общая модель'}`);
}
$('undo').addEventListener('click', () => history('undo'));
$('redo').addEventListener('click', () => history('redo'));
function localPoint(event, matrix = svg.getScreenCTM()) { return inverseScreenPoint(matrix, event.clientX, event.clientY); }
function cancelGesture() {
  catalogSelection?.cancel();
  semanticEditing?.cancel();
  hostPolicyUI?.cancel();
  automationUI?.cancel();
  relatedDrawingsUI?.cancel();
  modelGallery?.cancel();
  relationshipReference?.cancel();
  preferencesUI?.cancel();
  interchangeUI?.cancel();
  templatesUI?.cancel();
  exportReportUI?.cancel();
  fragmentClipboard?.cancel();
  gestureTools?.stop();
  editingTools?.cancel();
  visualsUI?.cancel();
  viewport?.cancel();
  cancelEditingGestures();
}
function cancelEditingGestures() {
  semanticEditing?.clearPreview();
  cancelPreferenceMotion(svg);
  gestureTools?.stop(); smartRelationship?.cancel(); layoutEditor?.cancel(); internalDrag?.cancel(); contextMenu?.close(true); cancelCanvasMove();
}
function cancelCanvasMove() {
  gestureTools?.stop();
  if (!gesture) { model.cancelDrag(); return; }
  const prior = gesture; gesture = null; model.cancelDrag();
  if (svg.hasPointerCapture(prior.pointerId)) svg.releasePointerCapture(prior.pointerId);
  prior.rectangle?.remove();
  for (const item of svg.querySelectorAll('.dragging,.marquee-preview')) item.classList.remove('dragging', 'marquee-preview');
  semanticEditing?.clearPreview(); updateGeometry(model.view); paintSelection();
  status(prior.type === 'marquee' ? 'Выбор рамкой отменён' : 'Перемещение отменено');
}
function previewMarquee(event) {
  const point = localPoint(event, gesture.matrix), rectangle = marqueeRectangle(gesture.start, point);
  if (!rectangle) return;
  for (const [key, value] of Object.entries(rectangle)) gesture.rectangle.setAttribute(key, value);
  const view = model.view;
  gesture.matches = marqueeDrawings(view, rectangle, (connection, kind) => kind === 'visualConnector' ? visualGeometry(connection, view, occurrenceContourFor(), notationUI.storedGeometry).bounds : connectionGeometry(connection, view.occurrences, occurrenceContourFor(), notationUI.storedGeometry, view.connections).bounds, gestureTools?.options);
  const selected = new Set([...gesture.base, ...gesture.matches].map(ref => `${ref.kind}:${ref.id}`));
  for (const item of svg.querySelectorAll('[data-id]')) item.classList.toggle('marquee-preview', selected.has(`${item.dataset.kind}:${item.dataset.id}`));
}
svg.addEventListener('pointerdown', event => {
  if (workspace?.active) return;
  if (smartRelationship?.enabled) { smartRelationship.start(event); return; }
  if (event.target.closest('.inline-editor')) return;
  if (event.button !== 0 || gesture || !event.isPrimary) return;
  if (document.querySelector('dialog[open]') || files?.transient || git?.transient || !model.view) return;
  cancelPreferenceMotion(svg);
  const target = event.target.closest('[data-id]');
  const matrix = svg.getScreenCTM(), start = localPoint(event, matrix);
  if (!start) return;
  event.preventDefault();
  if (!target) {
    if (!canvasDropPoint(svg, event.clientX, event.clientY, window)) return;
    closeInspector(); whereUsed?.cancel(); inline.cancel(false); layoutEditor?.cancel();
    const rectangle = vector('rect', { class: 'selection-marquee', x: start.x, y: start.y, width: 0, height: 0, 'aria-hidden': 'true' });
    svg.append(rectangle);
    gesture = { type: 'marquee', pointerId: event.pointerId, matrix, start, rectangle, matches: [],
      base: event.shiftKey ? model.selections : [], anchor: event.shiftKey ? model.selection : null,
      revision: model.store.revision, viewId: model.viewId };
    svg.setPointerCapture(event.pointerId); svg.focus({ preventScroll: true }); return;
  }
  const ref = { kind: target.dataset.kind, id: target.dataset.id };
  select(ref, true, event.shiftKey ? 'toggle' : model.isSelected(ref) ? 'anchor' : 'replace');
  target.focus({ preventScroll: true });
  if (event.shiftKey || !['occurrence', 'visualNode'].includes(target.dataset.kind)) return;
  if (!safe(() => { model.beginDrag(target.dataset.id, target.dataset.kind); return true; })) return;
  gesture = { type: 'move', pointerId: event.pointerId, node: target, matrix, start, view: model.view, revision: model.store.revision, viewId: model.viewId };
  svg.setPointerCapture(event.pointerId);
});
function previewMove(event) {
  if (!gesture || gesture.type !== 'move') return;
  if (gesture.revision !== model.store.revision || gesture.viewId !== model.viewId) { cancelCanvasMove(); return; }
  gesture.matrix = svg.getScreenCTM() || gesture.matrix;
  const point = localPoint(event, gesture.matrix);
  if (!point) { cancelCanvasMove(); return; }
  const constrained = gestureTools?.constrain(gesture.view, model.selections, model.selection, point.x - gesture.start.x, point.y - gesture.start.y, event) ?? { dx: point.x - gesture.start.x, dy: point.y - gesture.start.y };
  const next = safe(() => model.previewDrag(constrained.dx, constrained.dy));
  const view = next ? model.previewView : model.view;
  for (const item of svg.querySelectorAll('.selected[data-kind="occurrence"],.selected[data-kind="visualNode"]')) item.classList.toggle('dragging', Boolean(next));
  updateGeometry(view); paintSelection(view);
  semanticEditing?.preview(view, model.drag?.command.drawings ?? []);
}
svg.addEventListener('pointermove', event => {
  if (smartRelationship?.active) { gestureTools?.track(event); smartRelationship.move(event); return; }
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  if (gesture.revision !== model.store.revision || gesture.viewId !== model.viewId) { cancelCanvasMove(); return; }
  if (gesture.type === 'marquee') { previewMarquee(event); return; }
  gestureTools?.track(event);
  previewMove(event);
});
svg.addEventListener('pointerup', event => {
  if (smartRelationship?.active) { gestureTools?.stop(); smartRelationship.finish(event); return; }
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  if (gesture.revision !== model.store.revision || gesture.viewId !== model.viewId || !canvasDropPoint(svg, event.clientX, event.clientY, window)) { cancelCanvasMove(); return; }
  if (gesture.type === 'marquee') previewMarquee(event);
  else {
    previewMove(event);
    if (!gesture) return;
  }
  const prior = gesture; gesture = null; gestureTools?.stop();
  if (svg.hasPointerCapture(prior.pointerId)) svg.releasePointerCapture(prior.pointerId);
  if (prior.type === 'marquee') {
    prior.rectangle.remove();
    for (const item of svg.querySelectorAll('.marquee-preview')) item.classList.remove('marquee-preview');
    model.selectMany([...prior.base, ...prior.matches], prior.anchor || undefined);
    paintSelection(); renderCatalog(); renderInspector(); alignmentUI?.refresh();
    modelAnalysis?.refresh(); contextHints?.refresh({ selectionChanged: true });
    status(model.selections.length ? `Выбрано рисунков: ${model.selections.length}. Опора: ${model.selection.id.slice(-8)}` : 'В рамке нет целых рисунков');
    return;
  }
  const result = safe(() => model.commitDrag());
  semanticEditing?.clearPreview();
  if (result && !result.deferred) { render(); focusSelected(); status('Положение изменено только в текущем представлении'); }
  else { for (const item of svg.querySelectorAll('.dragging')) item.classList.remove('dragging'); updateGeometry(model.view); paintSelection(); }
});
svg.addEventListener('pointercancel', cancelGesture);
svg.addEventListener('lostpointercapture', () => { if (gesture || smartRelationship?.active) cancelGesture(); });
window.addEventListener('blur', () => {
  // Native file pickers blur the owner while its modal request is still pending.
  if (document.querySelector('dialog[open]')) { cancelCanvasMove(); viewport?.cancel(); }
  else cancelGesture();
  inline.cancel(false);
});
window.addEventListener('resize', () => {
  cancelGesture(); inline.cancel(false);
  fitPendingCaptions();
  minimap?.refresh();
  if (document.activeElement === document.body || !document.activeElement?.getClientRects().length) focusVisiblePanel();
});
svg.addEventListener('keydown', event => {
  const target = event.target.closest('[data-id]');
  if (target && !event.isComposing && !event.ctrlKey && !event.metaKey && !event.altKey && (event.key === 'Enter' || event.key === ' ')) {
    if (event.shiftKey) event.stopPropagation();
    event.preventDefault(); select({ kind: target.dataset.kind, id: target.dataset.id }, true, event.shiftKey ? 'toggle' : 'replace');
  }
});
document.addEventListener('keydown', event => {
  const editing = event.target.closest('input,select,textarea,[contenteditable=true],[data-catalog-section] > summary,[data-folder-id] > summary,[data-palette-group] > summary');
  if (event.key === 'Escape' && (gesture || smartRelationship?.enabled || visualsUI?.enabled || visualsUI?.active || editingTools?.active)) { event.preventDefault(); cancelGesture(); return; }
  if (document.querySelector('dialog[open]') || editing || contextMenu?.active || internalDrag?.active) return;
  const key = shortcutKey(event);
  if ((event.ctrlKey || event.metaKey) && (key === 'z' || key === 'y')) { event.preventDefault(); history(key === 'y' || event.shiftKey ? 'redo' : 'undo'); return; }
  if (smartRelationship?.enabled) return;
  // Search results are navigation controls, not commands on the old canvas selection.
  if (event.target.closest('#model-search-region') && ['Escape', 'F2', 'Delete'].includes(event.key)) return;
  if (event.key === 'Escape') { select(null); return; }
  const { element, occurrence, connection } = selectedObjects();
  if (event.key === 'F2' && !event.isComposing) {
    if (renameFrom(event.target)) { event.preventDefault(); return; }
    const anchor = model.selection && svg.querySelector(`[data-id="${model.selection.id}"]`);
    if (anchor && renameFrom(anchor)) { event.preventDefault(); return; }
  }
  if (event.key === 'Delete') {
    if (['visualNode', 'visualConnector'].includes(model.selection?.kind) && model.selections.length === 1) { event.preventDefault(); visualsUI.removeSelected(); return; }
    if (model.selections.length > 1) { event.preventDefault(); safe(askDeleteSelection); return; }
    if (occurrence || connection) { event.preventDefault(); askDelete(occurrence ? 'occurrence' : 'connection', (occurrence || connection).id); }
  }
  if (model.selections.some(ref => ['occurrence', 'visualNode'].includes(ref.kind)) && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && event.target.closest('#canvas') && !event.ctrlKey && !event.metaKey && !event.altKey && !event.isComposing) {
    event.preventDefault(); const step = event.shiftKey ? 1 : 10;
    const dx = event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0;
    const dy = event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0;
    cancelGesture();
    const result = safe(() => model.moveSelection(dx, dy));
    if (result && !result.deferred) { render(); focusSelected(); status('Выбранные экземпляры перемещены в этом виде'); }
  }
});
function resolveContext(target, event) {
  if (workspace?.active) return null;
  const canvasItem = target.closest('#canvas [data-id]');
  if (canvasItem) { catalogSelection?.scopeFromCanvas(); return { kind: canvasItem.dataset.kind, id: canvasItem.dataset.id, anchorId: canvasItem.dataset.anchorId || null, point: event.type === 'contextmenu' && event.button === 2 ? canvasDropPoint(svg, event.clientX, event.clientY, window) : null }; }
  if (target.closest('#canvas')) {
    catalogSelection?.scopeFromCanvas();
    const rect = svg.getBoundingClientRect();
    const pointer = event.type === 'contextmenu' && event.button === 2;
    const point = canvasDropPoint(svg, pointer ? event.clientX : rect.left + rect.width / 2, pointer ? event.clientY : rect.top + rect.height / 2, window);
    return { kind: 'canvas', point };
  }
  const section = target.closest('[data-catalog-section] > summary');
  if (section) return { kind: 'catalogSection', id: section.parentElement.dataset.catalogSection };
  const row = target.closest('[data-search-kind][data-search-id],[data-catalog-kind][data-catalog-id]');
  if (row) return { kind: row.dataset.searchKind || row.dataset.catalogKind, id: row.dataset.searchId || row.dataset.catalogId, sectionId: row.closest('[data-folder-section]')?.dataset.folderSection };
  const tree = target.closest('[data-element-id],[data-add-element-id],[data-junction-id],[data-add-junction-id],[data-relationship-id],[data-view-id],[data-rename-kind="project"]');
  if (!tree) return null;
  if (tree.dataset.junctionId || tree.dataset.addJunctionId) return { kind: 'junction', id: tree.dataset.junctionId || tree.dataset.addJunctionId };
  if (tree.dataset.elementId || tree.dataset.addElementId) return { kind: 'element', id: tree.dataset.elementId || tree.dataset.addElementId };
  if (tree.dataset.relationshipId) return { kind: 'relationship', id: tree.dataset.relationshipId };
  if (tree.dataset.viewId) return { kind: 'view', id: tree.dataset.viewId, scope: tree.dataset.viewScope };
  if (tree.dataset.renameKind === 'project') return { kind: 'project', id: model.store.snapshot.project.id };
  return null;
}
function anchorPlanFor(connection, view, point = null) {
  const geometry = connectionGeometry(connection, view.occurrences, occurrenceContourFor(), notationUI.storedGeometry, view.connections);
  const selected = nearestRoutePoint(geometry, point || routePointAt(geometry, .5));
  return { index: selected.afterIndex + 1, point: { x: snap(selected.point.x), y: snap(selected.point.y) } };
}
function previewEndpoints(view, endpoints) {
  const preview = $('link-anchor-preview');
  const planned = endpoints.filter(endpoint => endpoint?.insertAnchor);
  preview.hidden = !planned.length;
  preview.replaceChildren();
  if (!view || !planned.length) return;
  const candidate = structuredClone(view), children = [];
  // Preview IDs exist only in this detached drawing; core allocates real IDs.
  for (const [index, endpoint] of planned.entries()) {
    const host = candidate.connections.find(item => item.id === endpoint.id);
    const offset = planned.slice(0, index).filter(prior => prior.id === endpoint.id && prior.insertAnchor.index <= endpoint.insertAnchor.index).length;
    host.routePoints.splice(endpoint.insertAnchor.index + offset, 0, { kind: 'anchor', id: `preview-${index}`, point: endpoint.insertAnchor.point });
  }
  for (const connection of candidate.connections) {
    const geometry = connectionGeometry(connection, candidate.occurrences, occurrenceContourFor(), notationUI.storedGeometry, candidate.connections);
    children.push(vector('path', { class: 'anchor-preview-route', d: geometry.d }));
  }
  for (const occurrence of candidate.occurrences) children.push(vector('rect', { class: 'anchor-preview-node', ...occurrence.bounds }));
  for (const endpoint of planned) children.push(vector('circle', { class: 'anchor-preview-point', cx: endpoint.insertAnchor.point.x, cy: endpoint.insertAnchor.point.y, r: 7 }));
  const bounds = viewGeometryBounds(candidate.occurrences, candidate.connections, occurrenceContourFor(), notationUI.storedGeometry);
  preview.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
  preview.replaceChildren(...children);
}
const menuActions = {
  openProperties: openInspector,
  moveConcept: ref => catalogFolders.chooseDestination(ref),
  cutConcept: ref => catalogFolders.cut(ref),
  duplicateConcept: ref => catalogFolders.duplicate(ref),
  changeConceptType: ref => catalogFolders.changeType(ref),
  editFolder: id => catalogFolders.folderEditor(id),
  drillInto: (id, sectionId) => catalogFolders.drillInto(id, sectionId),
  newFolder: (destination, sectionId) => catalogFolders.folderEditor(null, destination, sectionId),
  deleteFolder: id => catalogFolders.deleteFolder(id),
  pasteConcepts: (id, sectionId) => catalogFolders.paste(id, sectionId),
  hasCut: () => catalogFolders.hasCut,
  removeVisual(ref) { select(ref, false); visualsUI.removeSelected(); },
  anchorPlan(connection, point) { return anchorPlanFor(connection, model.view, point); },
  rename(kind, id, context) {
    if (context.kind === 'occurrence' || context.kind === 'connection') select({ kind: context.kind, id: context.id }, false);
    else if (['element', 'junction', 'relationship'].includes(kind)) select({ kind, id }, false);
    const anchor = context.kind === 'occurrence' || context.kind === 'connection' ? svg.querySelector(`[data-id="${context.id}"]`)
      : kind === 'project' ? $('project-name') : kind === 'view' ? document.querySelector(`[data-view-scope="${context.scope || 'tree'}"][data-view-id="${id}"]`)
        : document.querySelector(`[data-${kind}-id="${id}"]`);
    if (anchor) renameAt({ kind, id }, anchor);
  },
  addOccurrence(concept) {
    const result = safe(() => perform({ type: 'addOccurrence', viewId: model.viewId, concept, bounds: nextBounds(concept.kind) }, 'Экземпляр добавлен; общий объект не изменён', 'occurrenceId'));
    if (result) { panel('canvas'); focusSelected(); }
  },
  remove: askDelete,
  reuseRelationship(id) { showExistingRelationship(id); },
  openView: activateView,
  duplicateView(id) { if (model.viewId !== id) activateView(id); $('duplicate-view').click(); },
  newView() { $('new-view').click(); },
  createElement(type, context) { const junction = ['AndJunction', 'OrJunction'].includes(type), width = junction ? 36 : 210, height = junction ? 36 : 90; typedActions.openEdit(type, context.point ? { x: snap(context.point.x - width / 2), y: snap(context.point.y - height / 2), width, height } : null); },
  createRelationship(type, sourceEndpoint = null) { typedActions.openLink(type, { sourceEndpoint }); },
  fit() { $('fit-button').click(); },
  undo() { history('undo'); }, redo() { history('redo'); },
};
notationUI = installNotationUI({ document, readReference: () => model.store.snapshot.project.metamodel, readViews: () => model.store.snapshot.views,
  renderCanvas() { const bookmark = focusBookmark(); renderCanvas(); renderInspector(); restoreFocus(bookmark); },
  blocked: () => Boolean(inline.active || gesture || smartRelationship?.enabled || layoutEditor?.active || internalDrag?.active || model.drag || files?.transient || git?.transient || contextMenu?.active || document.querySelector('dialog[open]')), report: status });
layoutEditor = installLayoutEditor({ document, window, canvas: svg, model,
  enabled: () => notationUI.storedGeometry || Boolean(selectedObjects().connection?.routePoints.some(point => point.kind === 'anchor')) || selectedObjects().connection?.source.kind === 'connection' || selectedObjects().connection?.target.kind === 'connection',
  blocked: () => Boolean(inline.active || gesture || smartRelationship?.enabled || internalDrag?.active || model.drag || files?.transient || git?.transient || contextMenu?.active || document.querySelector('dialog[open]')),
  storedGeometry: () => notationUI.storedGeometry,
  constrainLayout(layout, target, event) {
    if (!gestureTools) return layout;
    if (target.kind === 'label' && layout.labelPosition) layout.labelPosition = gestureTools.snapPoint(layout.labelPosition, event.altKey);
    else if (layout.routePoints[target.index]) layout.routePoints[target.index].point = gestureTools.snapPoint(layout.routePoints[target.index].point, event.altKey);
    return layout;
  },
  geometryFor: (connection, view) => connectionGeometry(connection, view.occurrences, occurrenceContourFor(), notationUI.storedGeometry, view.connections),
  preview: view => { if (view) updateGeometry(view); }, redraw: render, status });
internalDrag = installInternalDrag({ document, window, canvas: svg, model, readCreationSize: () => preferenceState.defaults, previewPlacement: bounds => semanticEditing?.previewPlacement(bounds), clearPlacementPreview: () => semanticEditing?.clearPreview(), onRelationshipDrop: (id, point) => relatedDrawingsUI.open(id, point),
  beforeStart(source) { if (source.draggable && source.closest('.catalog')) return false; smartRelationship?.cancel(); if (window.matchMedia('(max-width: 850px)').matches || document.querySelector('dialog[open]')) return false; layoutEditor.cancel(); inline.cancel(false); contextMenu?.close(false); cancelCanvasMove(); },
  onCommitted(result, command) { render(); panel('canvas'); focusSelected(); if (preferenceState.behavior.renameAfterCreate && ['createElementAndOccurrence','createJunctionAndOccurrence'].includes(command.type)) renameFrom(svg.querySelector(`[data-id="${result.created.occurrenceId}"]`)); }, status });
contextMenu = installContextMenu({ document, window, host: $('context-menu'), resolveContext,
  buildItems: context => contextActions(context, model, menuActions), readBoundary: () => ({ revision: model.store.revision, viewId: model.viewId }),
  beforeOpen() { smartRelationship?.cancel(); layoutEditor.cancel(); inline.cancel(false); internalDrag.cancel(); cancelCanvasMove(); }, status,
  restoreFocus() { focusVisiblePanel(); } });
paletteUI = installPaletteActions({ document, model, beforeFilter: cancelGesture });
typedActions = installTypedActions({ document, model, openDialog, render, nextBounds, panel, focusSelected, status, anchorPlanFor, previewEndpoints,
  revealOccurrence: bounds => viewport?.reveal(bounds),
  drawRelationship: type => smartRelationship.activate(type) });
smartRelationship = installSmartRelationship({ document, window, canvas: svg, model, readBehavior: () => preferenceState.behavior, openDialog,
  connect: (...args) => typedActions.connect(...args),
  openLink: (...args) => typedActions.openLink(...args), beforeStart: cancelGesture, status,
  blocked: () => Boolean(inline.active || gesture || layoutEditor?.active || internalDrag?.active || files?.transient || git?.transient || document.querySelector('dialog[open]')) });
documentationEditor = installDocumentationEditor({ document, model, session: projectSession, openDialog, render, status,
  blocked: propertyEditorBlocked });
multiplicityEditor = installMultiplicityEditor({ document, model, openDialog, render, status,
  blocked: propertyEditorBlocked });
customizationUI = installCustomizationUI({ document, model, openDialog, render, status,
  blocked: propertyEditorBlocked, openAssets: () => visualsUI?.assets() });
viewpointUI = installViewpointUI({ document, model, openDialog, render, status,
  beforeChange() { objectProperties?.cancel(); documentationEditor?.cancel(); inline.cancel(false); cancelGesture(); multiplicityEditor?.cancel(); customizationUI?.cancel(); model.select(null); },
  addConcept(concept) { if (concept.kind === 'relationship') showExistingRelationship(concept.id); else menuActions.addOccurrence(concept); },
  blocked: () => Boolean(files?.transient || git?.transient || document.querySelector('dialog[open]')) });
profileUI = installProfileUI({ document, model, openDialog });
installViewActions({ document, model, openDialog, render, panel, status, setFit(value) { fit = value; } });
files = installFileActions({ document, window, model, readDirtyMarker: () => preferenceState.display.dirtyMarker, session: projectSession, inline, cancelGesture,
  svgSnapshot: () => exportViewSvg({ canvas: svg, title: model.view.view.name,
    bounds: viewGeometryBounds(model.view.occurrences, model.view.connections, occurrenceContourFor(), notationUI.storedGeometry, displayedLabelBounds) }),
  blocked: () => Boolean(git?.transient),
  canSave: () => !workspace?.active && !hostPolicyUI?.transient && !automationUI?.transient && !git?.transient && !inline.active && !gesture && !internalDrag.active && !smartRelationship.enabled && !layoutEditor.active && !fragmentClipboard?.active && !exportReportUI?.active && !interchangeUI?.transient && !templatesUI?.transient && !editingTools?.active && !visualsUI?.enabled && !model.drag && !objectProperties?.active && !document.querySelector('dialog[open]:not(#file-dialog)'),
  readInteractionGeneration: readEditingGeneration,
  render, status, openDialog, afterLoad() { catalogSelection?.reset(); whereUsed?.cancel(); viewport?.clear(); objectProperties?.cancel(); clearPendingCaptions(); documentationEditor.cancel(); viewpointUI.cancel(); customizationUI.cancel(); multiplicityEditor.cancel(); model.afterLoad(); viewTabs?.reset(); modelAnalysis?.reset(); contextHints?.reset(); fragmentClipboard?.refresh(); notationUI.resetStoredGeometry(); layoutEditor.reset(); fit = false; pendingDelete = null; panel('canvas'); } });

function readEditingGeneration() {
  return `${inline.generation}:${smartRelationship.generation}:${layoutEditor.generation}:${multiplicityEditor.generation}:${documentationEditor.generation}:${customizationUI.generation}:${viewpointUI.generation}:${objectProperties?.generation ?? 0}:${whereUsed?.generation ?? 0}:${alignmentUI?.generation ?? 0}:${catalogFolders?.generation ?? 0}:${visualsUI?.generation ?? 0}:${editingTools?.generation ?? 0}:${gestureTools?.generation ?? 0}:${fragmentClipboard?.generation ?? 0}:${exportReportUI?.generation ?? 0}:${preferencesUI?.generation ?? 0}:${preferences.revision}:${relatedDrawingsUI?.generation ?? 0}:${modelGallery?.generation ?? 0}:${relationshipReference?.generation ?? 0}:${interchangeUI?.generation ?? 0}:${templatesUI?.generation ?? 0}:${automationUI?.generation ?? 0}:${hostPolicyUI?.generation ?? 0}:${semanticEditing?.generation ?? 0}:${catalogSelection?.generation ?? 0}`;
}
git = installGitActions({ document, window, model, session: projectSession, files, openDialog, render, status,
  readInteractionGeneration: readEditingGeneration,
  blocked: () => Boolean(inline.active || gesture || files.transient || document.querySelector('dialog[open]')) });

// A native Git write may finish after its dialog closes; protect the editor until it settles.
for (const type of ['pointerdown', 'click', 'keydown']) document.addEventListener(type, event => {
  if (git?.transient && !event.target.closest?.('#git-dialog')) {
    event.preventDefault(); event.stopImmediatePropagation();
    status('Дождитесь завершения операции Git.');
  }
}, true);

const workbenchBlocked = (except = '') => Boolean(workspace?.active || catalogSelection?.active || semanticEditing?.active || hostPolicyUI?.active || hostPolicyUI?.transient || (except !== 'automation' && automationUI?.active) || automationUI?.transient || preferencesUI?.active || detachedPalette?.transient || detachedCatalog?.transient || (except !== 'interchange' && (interchangeUI?.active || interchangeUI?.transient)) || (except !== 'templates' && (templatesUI?.active || templatesUI?.transient)) || (except !== 'clipboard' && fragmentClipboard?.active) || (except !== 'export' && exportReportUI?.active) || inline.active || gesture || smartRelationship.enabled || layoutEditor.active || internalDrag.active || catalogFolders?.active || visualsUI?.active || visualsUI?.enabled || editingTools?.active || gestureTools?.active || model.drag || files.transient || git?.transient || viewport?.active || document.querySelector(except === 'host' ? 'dialog[open]:not(#git-dialog)' : except === 'automation' ? 'dialog[open]:not(#automation-dialog)' : 'dialog[open]'));
function propertyEditorBlocked() {
  return Boolean(workspace?.active || inline.active || gesture || smartRelationship?.enabled || layoutEditor?.active || internalDrag?.active || model.drag || files?.transient || git?.transient || fragmentClipboard?.active || viewport?.active || document.querySelector('dialog[open]:not(#inspector-panel)'));
}
objectProperties = installObjectProperties({ document, model, openLink: url => documentationEditor.openLink(url), readResizeBehavior: () => preferenceState.behavior.resizeChildren, openDialog, render, status, blocked: propertyEditorBlocked });
metadataUI = installMetadataUI({ document, model, readLocation: async () => { const token = projectSession.documentToken, result = await window.schemkaDesktop?.documentLocation?.(token); if (result?.status === 'error') throw Error(result.message || 'Путь недоступен'); return token === projectSession.documentToken && result?.status === 'ok' ? result.path : null; }, openDialog, documentationEditor, objectProperties, blocked: workbenchBlocked, status });
catalogFolders = installCatalogFolders({ document, window, preferences, model, readSelection: () => catalogSelection?.owners ?? [], canvas: svg, render, status, openDialog, blocked: workbenchBlocked, selectConcept: selectCatalogConcept,
  activateView, makeMemberRow: makeCatalogMemberRow,
  addConcept(concept, point = null) {
    if (concept.kind === 'relationship') relatedDrawingsUI.open(concept.id, point);
    else if (model.view && model.conceptVisible(concept)) perform({ type: 'addOccurrence', viewId: model.viewId, concept,
      bounds: point ? { x: snap(point.x), y: snap(point.y), width: concept.kind === 'junction' ? 36 : preferenceState.defaults.width, height: concept.kind === 'junction' ? 36 : preferenceState.defaults.height } : nextBounds(concept.kind) }, 'Экземпляр добавлен в представление', 'occurrenceId');
  } });

visualsUI = installVisualsUI({ document, window, model, readResizeBehavior: () => preferenceState.behavior.resizeChildren, readDefaults: () => preferenceState.defaults, canvas: svg, render, status, openDialog, blocked: workbenchBlocked,
  beforeChange: () => { viewport?.cancel(); cancelEditingGestures(); }, nextBounds,
  openMetadata: owner => metadataUI.open(owner), activateView });

editingTools = installEditingTools({ document, window, model, readResizeBehavior: () => preferenceState.behavior.resizeChildren, readQuickAdd: () => preferenceState.behavior.quickAdd, readMagicOrder: () => preferenceState.behavior.magicOrder, readDefaults: () => preferenceState.defaults, canvas: svg, openDialog, render, status, blocked: workbenchBlocked,
  beforeChange: () => { viewport?.cancel(); cancelEditingGestures(); }, nextBounds,
  preview: view => { updateGeometry(view); paintSelection(view); },
  selectMany: refs => { model.selectMany(refs); render(); focusSelected(); } });

alignmentUI = installAlignmentUI({ document, window, model, openDialog, render, status, blocked: workbenchBlocked });
whereUsed = installWhereUsed({ document, preferences, model, openDialog, status, blocked: propertyEditorBlocked,
  navigate(usage, concept) {
    activateView(usage.viewId);
    select(usage.hidden ? concept : { kind: usage.kind, id: usage.id }, false);
    if (!usage.hidden) {
      const view = model.view;
      const bounds = usage.kind === 'occurrence' ? view.occurrences.find(item => item.id === usage.id).bounds
        : connectionGeometry(view.connections.find(item => item.id === usage.id), view.occurrences, occurrenceContourFor(), notationUI.storedGeometry, view.connections).bounds;
      viewport?.reveal(bounds);
    }
    focusSelected();
  },
  restoreFocus(unchanged) {
    if (unchanged) { openInspector(); $('inspector-content').querySelector('[data-inspector-action="where-used"]')?.focus(); }
    else focusSelected();
  } });
viewport = installViewport({ document, window, readMargin: () => preferenceState.gestures.margin, readZoomAtPointer: () => preferenceState.behavior.zoomAtPointer, canvas: svg, viewId: () => model.viewId, revision: () => model.store.revision, blocked: workbenchBlocked, beforeChange: cancelEditingGestures, status });
viewTabs = installViewTabs({ document, window, model, activateView, render, blocked: workbenchBlocked, status });
gestureTools = installGestureTools({ document, window, preferences, model, canvas: svg, viewport: () => viewport, openDialog, blocked: workbenchBlocked, status,
  redraw: render, onScroll: event => { if (smartRelationship?.active) smartRelationship.move(event); else if (gesture?.type === 'move') previewMove(event); else gestureTools.stop(); } });
minimap = installMinimap({ document, window, canvas: svg, viewport, viewId: () => model.viewId, blocked: workbenchBlocked, status,
  fallbackBounds() {
    const view = model.view;
    return view && viewGeometryBounds(view.occurrences, view.connections, occurrenceContourFor(), notationUI.storedGeometry, displayedLabelBounds);
  } });
contextHints = installContextHints({ document, window, model, readEnabled: () => preferenceState.display.hints, blocked: workbenchBlocked, status });
modelAnalysis = installModelAnalysis({ document, window, preferences, model, openDialog, render, panel, status, blocked: propertyEditorBlocked,
  setFit(value) { fit = value; },
  chooseTarget(target) {
    if (target.kind === 'view') activateView(target.id);
    else {
      select(target, false); panel('catalog');
      const item = catalogFolders.reveal(target);
      for (let ancestor = item?.parentElement; ancestor; ancestor = ancestor.parentElement) if (ancestor.tagName === 'DETAILS') ancestor.open = true;
      item?.scrollIntoView?.({ block: 'nearest' }); item?.focus();
    }
  },
  addConcept(concept) {
    if (concept.kind === 'relationship') relatedDrawingsUI.open(concept.id);
    else {
      const result = safe(() => perform({ type: 'addOccurrence', viewId: model.viewId, concept, bounds: nextBounds(concept.kind) }, 'Экземпляр из навигатора добавлен; общий концепт сохранён', 'occurrenceId'));
      if (result) { panel('canvas'); focusSelected(); }
    }
  } });
installWorkbench({ document, window, preferences, onDefaultPaste: () => fragmentClipboard?.run('paste'), onHelp: target => workspace?.openContextHelp(target), onHistory: action => { if (workspace?.active || inline.active || files.transient || git?.transient || document.querySelector('dialog[open]')) { status('Завершите или отмените текущую правку перед историей.'); return; } history(action); }, files, blocked: workbenchBlocked, status });
workspace = installWorkspace({ document, window, preferences, blocked: workbenchBlocked, status, openDialog, panel, beforeHelp: cancelGesture,
  canHelp: () => !inline.active && !files.transient && !git?.transient && !gesture && !model.drag && !internalDrag?.active && !viewport?.active });
detachedCatalog = installDetachedCatalog({ document, window, model, session: projectSession, preferences, status,
  activate(ref, action) { if (action === 'add') menuActions.addOccurrence(ref); else if (ref.kind === 'view') activateView(ref.id); else selectCatalogConcept(ref); } });
modelSearch = installModelSearch({ document, preferences, model, panel, selectConcept: selectCatalogConcept, openConcept: openInspector, openMetadata: owner => metadataUI.open(owner), activateView, blocked: workbenchBlocked, status, openDialog, render,
  revealDrawing(ref) {
    if (model.viewId !== ref.viewId) activateView(ref.viewId);
    select({ kind: ref.kind, id: ref.id }, false);
    const drawing = drawingFor(model.view, ref);
    const bounds = drawing?.bounds ?? (drawing && (ref.kind === 'visualConnector' ? visualGeometry(drawing, model.view, occurrenceContourFor(), notationUI.storedGeometry) : connectionGeometry(drawing, model.view.occurrences, occurrenceContourFor(), notationUI.storedGeometry, model.view.connections)).bounds);
    if (bounds) viewport?.reveal(bounds);
    if (!document.querySelector('dialog[open]')) focusSelected();
  } });
catalogSelection = installCatalogSelection({ document, model, openDialog, status, blocked: workbenchBlocked, onPrimary: selectCatalogConcept, editProperties: owners => modelSearch.advanced.open({ owners }) });
svg.addEventListener('pointerdown', () => catalogSelection.scopeFromCanvas(), true);
fragmentClipboard = installFragmentClipboard({ document, model, readPasteMode: () => preferenceState.behavior.pasteMode, session: projectSession, desktop: window.schemkaDesktop, openDialog, blocked: () => workbenchBlocked('clipboard'), perform, render, status, focus: focusSelected,
  imageSnapshot: () => rasterizeViewSvg(snapshotViewSvg(model.store.snapshot, model.viewId), { document, window }),
  readPastePoint() { const [x, y] = svg.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number); return { x: x + 40, y: y + 40 }; } });
interchangeUI = installInterchangeUI({ document, window, model, session: projectSession, files, openDialog, render, status, blocked: () => workbenchBlocked('interchange') });
templatesUI = installTemplatesUI({ document, window, model, teamTemplates: teamProfile?.templates ?? [], session: projectSession, files, openDialog, render, status, blocked: () => workbenchBlocked('templates'), activateView, previewView: snapshotViewSvg });
exportReportUI = installExportReportUI({ document, window, model, session: projectSession, openDialog,
  blocked: () => workbenchBlocked('export'), status, snapshotViewSvg, readInteractionGeneration: readEditingGeneration });
hostPolicyUI = installHostPolicyUI({ document, window, session: projectSession, openDialog, status, blocked: () => workbenchBlocked('host') });
automationUI = installAutomationUI({ document, window, model, session: projectSession, openDialog, render, status, blocked: () => workbenchBlocked('automation') });
semanticEditing = installSemanticEditing({ document, model, session: projectSession, canvas: svg, openDialog, render, status, readBehavior: () => preferenceState.behavior, readDefaults: () => preferenceState.defaults, beforeChange: cancelEditingGestures, focusSelected, blocked: workbenchBlocked });
relatedDrawingsUI = installRelatedDrawingsUI({ document, window, model, readDefaults: () => preferenceState.defaults, openDialog, blocked: workbenchBlocked, render, status });
modelGallery = installModelGallery({ document, window, model, openDialog, blocked: workbenchBlocked, status, activateView, snapshotViewSvg });
relationshipReference = installRelationshipReference({ document, model, openDialog, blocked: workbenchBlocked, status });
function showExistingRelationship(id) {
  const state = model.store.snapshot, relation = state.relationships.find(item => item.id === id), view = model.view;
  const shown = ref => ref.kind === 'relationship' ? view?.connections.some(item => item.relationshipId === ref.id) : view?.occurrences.some(item => item.concept.kind === ref.kind && item.concept.id === ref.id);
  if (relation && shown(relation.source) && shown(relation.target)) typedActions.openLink(null, { relationshipId: id });
  else relatedDrawingsUI.open(id);
}
function activatePaletteEntry(entry, point = null) {
  if (workbenchBlocked()) return;
  cancelGesture();
  if (entry.kind === 'tool') { if (entry.type === 'smart-link') smartRelationship.activate(); else if (entry.type === 'visual-connector') $('visual-connector-tool').click(); }
  else if (entry.kind === 'visualNode') visualsUI.create(entry.type, point);
  else if (entry.kind === 'relationship') smartRelationship.activate(entry.type, { profileId: entry.profileId ?? null });
  else { const defaults = preferenceState.defaults, junction = entry.kind === 'junction', width = junction ? 36 : defaults.width, height = junction ? 36 : defaults.height;
    typedActions.openEdit(entry.type, point ? { x: snap(point.x - width / 2), y: snap(point.y - height / 2), width, height } : null, { profileId: entry.profileId ?? null }); }
}
specializationTools = installSpecializationTools({ document, model, enabled: () => preferenceState.behavior.specializations, activate: activatePaletteEntry });
detachedPalette = installDetachedPalette({ document, window, model, session: projectSession, canvas: svg, blocked: workbenchBlocked, status, activate: activatePaletteEntry, readSpecializations: () => preferenceState.behavior.specializations });
preferencesUI = installPreferencesUI({ document, window, preferences, session: projectSession, openDialog, blocked: workbenchBlocked, status,
  capabilities: ['roundedLines','dirtyMarker','lazyTree','treePageSize','resizeChildren','pasteMode','viewLabelTemplate','viewNames','explainTypeChange','animateGraph','renameAfterCreate','magicOrder','proposeNestingCreate','proposeNestingReuse','proposeNestingMove','nestingParentTypes','nestingChildTypes','selectionEffect','width','height','nodeStyle','lineStyle','legend','zoomAtPointer','motion','duration','deleteWarning','quickAdd','viewpointHints','specializations','statusBar','hints','uiFont','diagramFont','diagramFontSize','borderFromFill','colors','searchTrigger','naturalSort','captionWrap'] });
if (teamProfile || teamProfileError) { const note = document.createElement('p'); note.className = 'inspector-note'; note.textContent = teamProfileError || `Командный профиль: ${teamProfile.name} · ${teamProfile.revision}. Личные сохранённые настройки имеют приоритет.`; $('preferences-dialog').append(note); }
preferences.subscribe(settings => { preferenceState = settings; cancelGesture(); applyPreferencePresentation(document, window, settings); document.body.dataset.preferenceQuickAdd = String(settings.behavior.quickAdd); document.body.dataset.preferenceViewpointHints = String(settings.behavior.viewpointHints); contourCache = null; render(); if (preferenceStorageError) status(preferenceStorageError); });
$('inspector-button').addEventListener('click', () => openInspector(catalogSelection?.count > 1 ? catalogSelection.primary : model.selection));
$('inspector-close').addEventListener('click', closeInspector);
$('inspector-panel').addEventListener('cancel', event => { event.preventDefault(); closeInspector(); });
$('inspector-content').addEventListener('click', event => {
  if (!event.target.closest('.layout-editor-controls button')) return;
  if (inline.active) { event.preventDefault(); event.stopImmediatePropagation(); return; }
  closeInspector();
}, true);

render();
if (preferenceStorageError) status(preferenceStorageError);
readLeaveState = createModelLeaveState({ model, session: projectSession, inline,
  directoryWarning: () => Boolean(files?.directoryWarning),
  transient: () => Boolean(workspace?.active || catalogSelection?.active || semanticEditing?.active || hostPolicyUI?.active || hostPolicyUI?.transient || automationUI?.active || automationUI?.transient || preferencesUI?.active || detachedPalette?.transient || detachedCatalog?.transient || objectProperties?.active || documentationEditor?.active || catalogFolders?.active || visualsUI?.active || visualsUI?.enabled || editingTools?.active || interchangeUI?.transient || templatesUI?.transient || exportReportUI?.active || fragmentClipboard?.active || smartRelationship?.enabled || gesture || layoutEditor?.active || internalDrag?.active || model.drag || files?.transient || git?.transient || document.querySelector('dialog[open]')) });

for (const id of ['project-name', 'project-tree-name']) $(id).addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); renameFrom(event.currentTarget); });
document.addEventListener('dblclick', event => {
  if (workspace?.active || event.target.closest('.inline-editor') || document.querySelector('dialog[open]')) return;
  if (renameFrom(event.target)) event.preventDefault();
});
document.addEventListener('pointerdown', event => {
  if (!event.defaultPrevented && inline.active && !event.target.closest('.inline-editor')) inline.cancel(false);
}, true);
