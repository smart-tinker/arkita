import { conceptRecord } from './concepts.js';
import { CATALOG_SECTIONS } from './catalog-tree.js';
import { CURRENT_CATALOG } from '../../schemka-model-core/src/index.js';
import { notationElement } from './notation.js';

/** Build trusted actions from an ID-only hit context, never from current selection. */
export function contextActions(context, model, actions) {
  const state = model.store.snapshot;
  const entry = model.view;
  const items = [];
  const add = (id, label, action, disabled = false) => items.push({ id, label, action, disabled });
  const properties = () => add('properties', 'Свойства…', () => actions.openProperties({ kind: context.kind, id: context.id }), typeof actions.openProperties !== 'function');
  const createElement = (destination, sectionId) => {
    if (CURRENT_CATALOG.elementTypes.some(type => notationElement(state.project.metamodel, type).family === sectionId)) {
      add('new-element', 'Создать элемент…', () => actions.createElementInCatalog(destination, sectionId), typeof actions.createElementInCatalog !== 'function');
    }
  };
  function catalogActions(ref, { duplicate = false, type = false } = {}) {
    add('move-concept', 'Переместить в папку…', () => actions.moveConcept(ref), typeof actions.moveConcept !== 'function');
    add('cut-concept', 'Вырезать для перемещения', () => actions.cutConcept(ref), typeof actions.cutConcept !== 'function');
    if (duplicate) add('duplicate-concept', 'Дублировать объект', () => actions.duplicateConcept(ref), typeof actions.duplicateConcept !== 'function');
    if (type) add('change-concept-type', 'Изменить тип…', () => actions.changeConceptType(ref), typeof actions.changeConceptType !== 'function');
  }
  function paste(folderId, sectionId) {
    if (actions.hasCut?.()) add('paste-concepts', 'Поместить вырезанное…', () => actions.pasteConcepts(folderId, sectionId), typeof actions.pasteConcepts !== 'function');
  }
  let element, relationship, occurrence, connection, concept;
  if (context.kind === 'occurrence') {
    occurrence = entry?.occurrences.find(item => item.id === context.id);
    concept = occurrence?.concept; element = conceptRecord(state, concept);
  } else if (context.kind === 'connection') {
    connection = entry?.connections.find(item => item.id === context.id);
    relationship = state.relationships.find(item => item.id === connection?.relationshipId);
    if (context.anchorId && !connection?.routePoints.some(point => point.kind === 'anchor' && point.id === context.anchorId)) return [];
  } else if (['element', 'junction'].includes(context.kind)) { concept = { kind: context.kind, id: context.id }; element = conceptRecord(state, concept); }
  else if (context.kind === 'relationship') relationship = state.relationships.find(item => item.id === context.id);
  if (['occurrence', 'element', 'junction'].includes(context.kind) && !element) return [];
  if (['connection', 'relationship'].includes(context.kind) && !relationship) return [];
  if (element || relationship) properties();
  if (element) {
    add('rename', 'Переименовать', () => actions.rename(concept.kind, element.id, context));
    add('reuse-element', 'Добавить ещё экземпляр', () => actions.addOccurrence({ ...concept }), !entry || model.conceptVisible?.(concept) === false);
    if (occurrence) add('remove-occurrence', 'Убрать из вида…', () => actions.remove('occurrence', occurrence.id));
    else catalogActions(concept, { duplicate: true, type: true });
    add('delete-element', 'Удалить из модели…', () => actions.remove(concept.kind, element.id));
  } else if (relationship) {
    add('rename', 'Переименовать', () => actions.rename('relationship', relationship.id, context));
    add('reuse-relationship', 'Показать в этом виде…', () => actions.reuseRelationship(relationship.id), !entry || model.conceptVisible?.({ kind: 'relationship', id: relationship.id }) === false);
    if (connection) add('remove-connection', 'Убрать из вида…', () => actions.remove('connection', connection.id));
    else catalogActions({ kind: 'relationship', id: relationship.id }, { duplicate: true, type: true });
    add('delete-relationship', 'Удалить из модели…', () => actions.remove('relationship', relationship.id));
  } else if (context.kind === 'view') {
    const view = state.views.find(item => item.view.id === context.id);
    if (!view) return [];
    properties();
    add('open-view', 'Открыть представление', () => actions.openView(view.view.id));
    add('rename', 'Переименовать', () => actions.rename('view', view.view.id, context));
    add('duplicate-view', 'Дублировать…', () => actions.duplicateView(view.view.id));
    catalogActions({ kind: 'view', id: view.view.id });
  } else if (context.kind === 'folder') {
    const folder = state.folders.find(item => item.id === context.id);
    if (!folder) return [];
    createElement(folder.id, context.sectionId);
    properties();
    add('drill-into', 'Перейти внутрь', () => actions.drillInto(folder.id, context.sectionId), typeof actions.drillInto !== 'function');
    add('new-folder', 'Создать папку…', () => actions.newFolder(folder.id, context.sectionId), typeof actions.newFolder !== 'function');
    add('edit-folder', 'Переименовать…', () => actions.editFolder(folder.id), typeof actions.editFolder !== 'function');
    catalogActions({ kind: 'folder', id: folder.id }); paste(folder.id, context.sectionId);
    add('delete-folder', 'Удалить папку…', () => actions.deleteFolder(folder.id), typeof actions.deleteFolder !== 'function');
  } else if (context.kind === 'catalogSection') {
    if (!CATALOG_SECTIONS.some(section => section.id === context.id)) return [];
    createElement(`@${context.id}`, context.id);
    add('new-folder', 'Создать папку…', () => actions.newFolder(`@${context.id}`), typeof actions.newFolder !== 'function');
    paste(`@${context.id}`, context.id);
  } else if (['visualNode', 'visualConnector'].includes(context.kind)) {
    const visual = entry?.[context.kind === 'visualNode' ? 'visualNodes' : 'visualConnectors'].find(item => item.id === context.id);
    if (!visual) return [];
    properties();
    add('remove-visual', 'Убрать из вида…', () => actions.removeVisual({ kind: context.kind, id: visual.id }), typeof actions.removeVisual !== 'function');
  } else if (context.kind === 'project' && context.id === state.project.id) {
    properties();
    add('rename', 'Переименовать', () => actions.rename('project', state.project.id, context));
    add('new-view', 'Создать представление…', actions.newView); paste(null);
  } else if (context.kind === 'canvas') {
    add('new-view', 'Создать представление…', actions.newView);
    add('duplicate-view', 'Дублировать текущее представление…', () => actions.duplicateView(model.viewId), !entry);
    add('fit', 'Вписать представление', actions.fit, !entry);
  } else return [];
  add('undo', 'Отменить действие', actions.undo, !model.store.history.undo);
  add('redo', 'Повторить действие', actions.redo, !model.store.history.redo);
  return items;
}
