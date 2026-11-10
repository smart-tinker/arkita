import { createProject, createStore } from '../../schemka-model-core/src/index.js';

/** Synthetic example, rebuilt on reload or explicit confirmed reset. No user data or storage. */
export function createDemo() {
  const store = createStore(createProject('Учебная модель'));
  const run = command => store.execute(command, store.revision).created;
  const { viewId: overview } = run({ type: 'createView', name: 'Обзор системы' });
  const { viewId: detail } = run({ type: 'createView', name: 'Поток заявки' });
  const first = run({ type: 'createElementAndOccurrence', viewId: overview, elementType: 'Service', name: 'Обработка заявки', bounds: { x: 100, y: 150, width: 210, height: 90 } });
  const second = run({ type: 'createElementAndOccurrence', viewId: overview, elementType: 'Process', name: 'Проверка заявки', bounds: { x: 530, y: 330, width: 210, height: 90 } });
  const { relationshipId } = run({ type: 'createRelationshipAndConnection', relationshipType: 'Serving', viewId: overview, source: { kind: 'occurrence', id: first.occurrenceId }, target: { kind: 'occurrence', id: second.occurrenceId }, label: 'обслуживает' });
  const firstDetail = run({ type: 'addOccurrence', viewId: detail, concept: { kind: 'element', id: first.elementId }, bounds: { x: 90, y: 90, width: 210, height: 90 } });
  const secondDetail = run({ type: 'addOccurrence', viewId: detail, concept: { kind: 'element', id: second.elementId }, bounds: { x: 490, y: 230, width: 210, height: 90 } });
  const third = run({ type: 'createElementAndOccurrence', viewId: detail, elementType: 'Function', name: 'Подготовка результата', bounds: { x: 160, y: 450, width: 210, height: 90 } });
  run({ type: 'addConnection', viewId: detail, relationshipId, source: { kind: 'occurrence', id: firstDetail.occurrenceId }, target: { kind: 'occurrence', id: secondDetail.occurrenceId } });
  run({ type: 'createRelationshipAndConnection', relationshipType: 'Flow', viewId: detail, source: { kind: 'occurrence', id: secondDetail.occurrenceId }, target: { kind: 'occurrence', id: third.occurrenceId }, label: 'результат проверки' });
  // Keep this newly generated example in teaching order under canonical ID display.
  const state = store.snapshot, viewIds = state.views.map(entry => entry.view.id).sort();
  state.views.forEach((entry, index) => { entry.view.id = viewIds[index]; });
  return createStore(state);
}

/** A detached blank current model; replacement still requires the File confirmation. */
export function createBlankModel() {
  const store = createStore(createProject('Новая модель'));
  store.execute({ type: 'createView', name: 'Представление' }, store.revision);
  return createStore(store.snapshot);
}
