import { metadataRecord } from '../../schemka-model-core/src/index.js';

/** Project/view metadata has its own owner; opening this panel never selects a concept. */
export function installMetadataUI({ document, model, openDialog, documentationEditor, objectProperties, blocked, status, readLocation = () => null }) {
  const $ = id => document.getElementById(id), dialog = $('metadata-dialog'), content = $('metadata-content');
  let owner = null, trigger = null;
  const node = (tag, text, className) => {
    const item = document.createElement(tag); if (text !== undefined) item.textContent = text;
    if (className) item.className = className; return item;
  };
  function close() { if (dialog.open) dialog.close(); }
  function refresh() {
    $('view-metadata').disabled = !model.view;
    if (!dialog.open || !owner) return;
    let item;
    try { item = metadataRecord(model.store.snapshot, owner); }
    catch { close(); status('Владелец метаданных уже изменился.'); return; }
    $('metadata-title').textContent = ({ project: 'Свойства модели', view: 'Свойства представления', folder: 'Свойства папки', visualNode: 'Свойства аннотации', visualConnector: 'Свойства визуального соединителя' })[owner.kind];
    content.replaceChildren(node('h3', item.name || '(без названия)'), node('p', item.id, 'object-id'), node('h4', 'Документация'), node('p', item.documentation || 'Документация пока не задана', 'documentation-text'));
    if (owner.kind === 'project') {
      const label = node('label', 'Путь модели'), location = node('input'), currentOwner = owner, store = model.store; location.id = 'metadata-location'; location.readOnly = true; location.value = 'Чтение пути…'; label.append(location); content.append(label);
      Promise.resolve().then(readLocation).then(path => { if (dialog.open && owner === currentOwner && model.store === store && location.isConnected) location.value = path || 'Файл ещё не выбран'; }).catch(() => { if (location.isConnected) location.value = 'Путь недоступен'; });
    }
    content.append(node('h4', 'Пользовательские свойства'));
    const table = node('table', undefined, 'property-table'), head = node('thead'), body = node('tbody'), heading = node('tr');
    for (const name of ['Имя', 'Значение']) { const cell = node('th', name); cell.scope = 'col'; heading.append(cell); }
    head.append(heading); table.append(head, body);
    for (const { key, value } of item.properties) {
      const row = node('tr'), cell = node('th', key || '⟨пустое имя⟩'), text = node('td', value); cell.scope = 'row';
      if (/^(?:https?|file):\/\/\S+$/iu.test(value)) {
        const link = node('button', 'Открыть ссылку…'); link.type = 'button'; link.addEventListener('click', () => documentationEditor.openLink(value)); text.append(link);
      }
      row.append(cell, text); body.append(row);
    }
    content.append(body.children.length ? table : node('p', 'Свойства пока не заданы', 'inspector-note'));
  }
  function open(reference, source = document.activeElement) {
    if (blocked() || !['project', 'view', 'folder', 'visualNode', 'visualConnector'].includes(reference?.kind)) return false;
    try { metadataRecord(model.store.snapshot, reference); }
    catch { status('Владелец метаданных не найден.'); return false; }
    owner = { ...reference }; trigger = source;
    openDialog('metadata-dialog'); refresh(); $('metadata-documentation').focus(); return true;
  }
  $('project-metadata').addEventListener('click', event => open({ kind: 'project', id: model.store.snapshot.project.id }, event.currentTarget));
  $('view-metadata').addEventListener('click', event => { if (model.view) open({ kind: 'view', id: model.view.view.id }, event.currentTarget); });
  $('metadata-documentation').addEventListener('click', () => { const selected = owner; close(); if (selected) documentationEditor.open(selected); });
  $('metadata-properties').addEventListener('click', () => { const selected = owner; close(); if (selected) objectProperties.openProperties(selected); });
  $('metadata-close').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('close', () => {
    // Menu actions use hidden command buttons; return to the visible menu. A
    // queued close event must not move focus out of the editor opened next.
    const visible = trigger?.isConnected && !trigger.closest('[hidden], details:not([open])');
    const target = visible ? trigger : document.querySelector('[data-command="project-metadata"]')?.closest('details')?.querySelector('summary');
    if (!document.querySelector('dialog[open]')) target?.focus();
    owner = null;
  });
  return { open, refresh };
}
