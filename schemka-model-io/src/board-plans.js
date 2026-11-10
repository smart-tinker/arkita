import { createStore, validateProject } from '../../schemka-model-core/src/index.js';
import { fail } from '../../schemka-model-core/src/json.js';
import { transferChanges, checkImportedRelationships } from './model-transfer.js';

export function createBoardPlan(source, { name, kind = 'canvas', background = null }) {
  if (!['canvas', 'sketch'].includes(kind)) fail('BOARD_KIND', 'Выберите Canvas или эскиз.');
  const store = createStore(source), created = store.execute({ type: 'createView', name }, store.revision), viewId = created.created.viewId;
  store.execute({ type: 'setViewPresentation', viewId, kind, background }, store.revision);
  return { snapshot: store.snapshot, viewId, changes: transferChanges(source, store.snapshot), losses: [] };
}
/** An explicit total map. Omitted cards/lines remain in the original sketch. */
export function sketchConversionPlan(source, viewId, { name, nodes, connectors }) {
  validateProject(source); const entry = source.views.find(item => item.view.id === viewId);
  if (!entry || !['canvas', 'sketch'].includes(entry.view.kind)) fail('SKETCH_VIEW', 'Выберите неформальную доску.');
  const cards = entry.visualNodes.filter(item => item.kind === 'note' || item.style.shape === 'actor');
  if (!cards.length) fail('SKETCH_EMPTY', 'На доске нет карточек для преобразования.');
  const expectedNodes = new Set(cards.map(item => item.id)), expectedLines = new Set(entry.visualConnectors.map(item => item.id));
  if (!nodes || !connectors || Object.keys(nodes).some(id => !expectedNodes.has(id)) || Object.keys(connectors).some(id => !expectedLines.has(id))) fail('SKETCH_MAP', 'Карта содержит неизвестные объекты.');
  const store = createStore(source), run = command => store.execute(command, store.revision), next = run({ type: 'createView', name }), targetViewId = next.created.viewId, mapped = new Map(), losses = [];
  for (const card of cards) {
    const choice = nodes[card.id]; if (!choice) fail('SKETCH_MAP', `Выберите тип, повторное использование или пропуск: ${card.name || card.text || card.id}.`);
    if (choice.skip === true) { losses.push(`Карточка ${card.name || card.id} остаётся только на исходной доске.`); continue; }
    let result;
    if (choice.reuse) {
      if (!source.elements.some(item => item.id === choice.reuse)) fail('SKETCH_MAP', 'Выбранный концепт больше не существует.');
      result = run({ type: 'addOccurrence', viewId: targetViewId, concept: { kind: 'element', id: choice.reuse }, bounds: card.bounds });
      losses.push(`Карточка ${card.name || card.id}: использован существующий концепт без замены его метаданных. Исходный текст и свойства остаются на доске.`);
    } else result = run({ type: 'createElementAndOccurrence', viewId: targetViewId, elementType: choice.type, name: card.text || card.name, documentation: card.documentation, properties: card.properties, bounds: card.bounds });
    mapped.set(card.id, { kind: 'occurrence', id: result.created.occurrenceId });
  }
  if (!mapped.size) fail('SKETCH_MAP', 'Нужно преобразовать хотя бы одну карточку.');
  for (const line of entry.visualConnectors) {
    const choice = connectors[line.id]; if (!choice) fail('SKETCH_MAP', `Выберите тип отношения или пропуск для линии ${line.name || line.id}.`);
    if (choice === 'skip') { losses.push(`Линия ${line.name || line.id} остаётся только на исходной доске.`); continue; }
    if (line.source.kind !== 'visualNode' || line.target.kind !== 'visualNode' || !mapped.has(line.source.id) || !mapped.has(line.target.id)) fail('SKETCH_ENDPOINT', `Линия ${line.name || line.id}: для преобразования нужны две выбранные карточки. Линии к якорям следует явно пропустить.`);
    run({ type: 'createRelationshipAndConnection', viewId: targetViewId, source: mapped.get(line.source.id), target: mapped.get(line.target.id), relationshipType: choice, label: line.name, documentation: line.documentation, properties: line.properties, routePoints: line.routePoints.map(point => ({kind:'bend', point:point.point})), labelPosition:line.labelPosition });
  }
  if (entry.visualNodes.length !== cards.length) losses.push('Группы, ссылки, легенды и изображения остаются в исходном эскизе. Архитектурные отношения из вложения не создаются.');
  checkImportedRelationships(source, store.snapshot);
  return { snapshot: store.snapshot, viewId: targetViewId, changes: transferChanges(source, store.snapshot), losses };
}
