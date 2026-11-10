import { canvasDropPoint } from './drag-drop.js';
import { creationTypes } from './profile-ui.js';

/** Disposable connector gesture. Only a completed, validated drop can edit the model. */
export function installSmartRelationship({ document, window, canvas, model, openLink, connect, blocked, beforeStart, status, readBehavior = () => ({}), openDialog = id => document.getElementById(id).showModal() }) {
  const button = document.getElementById('smart-link-tool');
  let enabled = false, relationshipType = null, profileId = null, gesture = null, generation = 0, choiceBoundary = null;
  const chooser = document.createElement('dialog'); chooser.id = 'magic-order-dialog'; chooser.setAttribute('aria-labelledby', 'magic-order-title');
  const heading = document.createElement('h2'); heading.id = 'magic-order-title'; heading.textContent = 'Сначала выберите отношение';
  const label = document.createElement('label'); label.textContent = 'Тип отношения'; const choice = document.createElement('select'); choice.id = 'magic-order-type'; label.append(choice);
  const note = document.createElement('p'); note.textContent = 'Затем протяните связь между объектами. Допустимость проверяется после выбора обоих концов. Alt при включении палочки временно меняет порядок.';
  const choose = document.createElement('button'); choose.type = 'button'; choose.textContent = 'Выбрать и протянуть'; choose.id = 'magic-order-apply';
  const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.textContent = 'Отмена'; dismiss.id = 'magic-order-cancel';
  chooser.append(heading, label, note, dismiss, choose); document.body.append(chooser);
  button.title = 'Создать связь · Alt: временно изменить порядок выбора';
  dismiss.addEventListener('click', cancel); chooser.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
  choice.addEventListener('change', () => { generation++; choose.disabled = !choice.value; });
  choose.addEventListener('click', () => { const captured = choiceBoundary, type = choice.value; cancel(); if (!captured || captured.store !== model.store || captured.revision !== model.store.revision || captured.viewId !== model.viewId) { status('Модель изменилась. Выберите отношение заново.'); return; } if (type) activate(type); });
  chooser.addEventListener('close', () => { choiceBoundary = null; generation++; });
  const activeButton = () => profileId ? document.querySelector(`[data-create-specialization="${profileId}"][data-kind="relationship"][data-type="${relationshipType}"]`) : relationshipType ? document.getElementById(`create-${relationshipType.toLowerCase()}`) : button;
  function cancel() {
    const prior = gesture, choosing = Boolean(choiceBoundary || chooser.open); gesture = null;
    choiceBoundary = null; if (chooser.open) chooser.close();
    if (enabled || prior || choosing) generation++;
    enabled = false; activeButton()?.setAttribute('aria-pressed', 'false'); relationshipType = null; profileId = null; canvas.classList.remove('smart-link-armed');
    prior?.line.remove();
    if (prior) { try { if (canvas.hasPointerCapture(prior.pointerId)) canvas.releasePointerCapture(prior.pointerId); } catch { /* Capture can already be gone. */ } }
  }
  function occurrence(node) {
    const item = node?.closest?.('[data-id]');
    if (!item || item.dataset.kind !== 'occurrence' || !canvas.contains(item) || !item.isConnected || !item.getClientRects().length) return null;
    const style = window.getComputedStyle(item);
    if (style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility)) return null;
    const record = model.view?.occurrences.find(o => o.id === item.dataset.id && (o.concept.kind === 'element' || (relationshipType && o.concept.kind === 'junction')));
    return record ? { node: item, id: record.id } : null;
  }
  function current() {
    return gesture && gesture.store === model.store && gesture.revision === model.store.revision && gesture.viewId === model.viewId
      && gesture.node.isConnected && canvas.contains(gesture.node) && occurrence(gesture.node)?.id === gesture.source.id;
  }
  function start(event) {
    if (!enabled || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    if (gesture || blocked()) { cancel(); return; }
    const source = occurrence(event.target), point = canvasDropPoint(canvas, event.clientX, event.clientY, window);
    if (!source || !point) { cancel(); return; }
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', 'smart-link-preview'); line.setAttribute('aria-hidden', 'true');
    for (const [name, value] of Object.entries({ x1: point.x, y1: point.y, x2: point.x, y2: point.y })) line.setAttribute(name, value);
    gesture = { pointerId: event.pointerId, source: { kind: 'occurrence', id: source.id }, node: source.node, line, relationshipType, profileId, store: model.store, revision: model.store.revision, viewId: model.viewId };
    generation++;
    try { canvas.append(line); source.node.focus({ preventScroll: true }); canvas.setPointerCapture(event.pointerId); }
    catch (error) { cancel(); status(`Магическая связь отменена: ${error.message}`); }
  }
  function move(event) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    try {
      if (!current()) { cancel(); return; }
      const point = canvasDropPoint(canvas, event.clientX, event.clientY, window);
      if (point) { gesture.line.setAttribute('x2', point.x); gesture.line.setAttribute('y2', point.y); }
    } catch (error) { cancel(); status(`Магическая связь отменена: ${error.message}`); }
  }
  function finish(event) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const prior = gesture; let target, failure;
    try {
      const valid = current() && canvasDropPoint(canvas, event.clientX, event.clientY, window);
      target = valid && occurrence(document.elementFromPoint?.(event.clientX, event.clientY));
    } catch (error) { failure = error; } finally { cancel(); } // Clear state/capture before every callback.
    if (failure) { status(`Магическая связь отменена: ${failure.message}`); return; }
    if (!target) return;
    const endpoints = { sourceEndpoint: prior.source, targetEndpoint: { kind: 'occurrence', id: target.id } };
    try {
      if (prior.relationshipType) connect(prior.relationshipType, { ...endpoints, profileId: prior.profileId });
      else openLink(null, { smart: true, fixedEndpoints: true, ...endpoints });
    } catch (error) { status(`Не удалось создать связь: ${error.message}`); }
  }
  function activate(type = null, { profileId: specializationId = null, alternate = false } = {}) {
    if (enabled && relationshipType === type && profileId === specializationId) { cancel(); return; }
    if (blocked()) return;
    if (!model.view || (type !== null && (model.typeVisible?.('relationship', type) === false || !creationTypes(model.store.snapshot.project.metamodel, 'relationship').includes(type)))) return;
    if (type === null && ((readBehavior().magicOrder === 'relation-first') !== alternate)) {
      beforeStart(); cancel(); choice.replaceChildren();
      for (const value of ['', ...creationTypes(model.store.snapshot.project.metamodel, 'relationship').filter(type => model.typeVisible?.('relationship', type) !== false)]) { const option = document.createElement('option'); option.value = value; option.textContent = value || 'Выберите тип'; choice.append(option); }
      choose.disabled = true; openDialog(chooser.id); choiceBoundary = { store: model.store, revision: model.store.revision, viewId: model.viewId }; generation++; choice.focus(); return;
    }
    beforeStart(); cancel(); enabled = true; relationshipType = type; profileId = specializationId; generation++; activeButton()?.setAttribute('aria-pressed', 'true'); canvas.classList.add('smart-link-armed');
    status(type ? `${type}: протяните от объекта к объекту.` : 'Магическая связь: протяните от элемента к элементу, затем выберите тип.');
  }
  button.addEventListener('click', event => activate(null, { alternate: event.altKey }));
  document.getElementById('smart-link-dialog').addEventListener('click', () => {
    if (blocked()) return;
    beforeStart(); cancel(); openLink(null, { smart: true });
  });
  return { get enabled() { return enabled; }, get active() { return Boolean(gesture) || chooser.open; }, get generation() { return generation; }, activate, start, move, finish, cancel };
}
