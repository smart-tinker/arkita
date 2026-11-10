import { MAX_FILE_BYTES, parseCatalog, validateCatalog, serializeCatalog, filterServices, getServiceDetails, describeBinding } from './catalog.js';
import { SAMPLE_CATALOG } from './sample-catalog.js';

const $ = id => document.getElementById(id);
let catalog = validateCatalog(structuredClone(SAMPLE_CATALOG));
let sourceName = '';
let selectedId = catalog.services[0]?.id ?? '';
let section = 'offers';
let imported = false;
let unsaved = false;
let reading = false;

function element(tag, value, className) {
  const node = document.createElement(tag);
  if (value !== undefined) node.textContent = String(value);
  if (className) node.className = className;
  return node;
}
function message(value, error = false) {
  const node = $('message'); node.textContent = value;
  node.className = error ? 'message error' : 'message'; node.hidden = !value;
  node.setAttribute('role', error ? 'alert' : 'status');
}
function showValue(value) { return value === undefined || value === null || value === '' ? 'Не указано' : typeof value === 'boolean' ? (value ? 'Да' : 'Нет') : String(value); }
function fields(values) {
  const dl = element('dl');
  for (const [label, value] of values) {
    const row = element('div', undefined, 'field');
    row.append(element('dt', label), element('dd', showValue(value))); dl.append(row);
  }
  return dl;
}
function bullets(items, empty = 'Не указано') {
  if (!items?.length) return element('p', empty, 'notice');
  const ul = element('ul'); items.forEach(item => ul.append(element('li', item))); return ul;
}
function record(title, values) {
  const article = element('article', undefined, 'record');
  article.append(element('h4', title), fields(values)); return article;
}
function metadata(values) {
  const result = element('div', undefined, 'metadata');
  values.forEach(([label, value]) => result.append(element('span', `${label}: ${showValue(value)}`)));
  return result;
}
function renderSession() {
  $('session-kind').textContent = imported ? 'Локальный файл' : 'Учебный пример';
  $('session-description').textContent = imported
    ? `${sourceName} · только в этой вкладке${unsaved ? ' · экспорт этого сеанса ещё не создан' : ' · загрузка JSON запрошена'}`
    : 'Синтетические данные. Откройте свой JSON для локального просмотра.';
  $('catalog-summary').textContent = `${catalog.services.length} сервисов · ${catalog.offers.length} предложений · ${catalog.requests.length} запросов`;
}
function renderDirections() {
  const select = $('direction');
  const all = element('option', 'Все направления'); all.value = '';
  select.replaceChildren(all);
  for (const direction of catalog.directions) {
    const option = element('option', direction.name); option.value = direction.id; select.append(option);
  }
}
function renderList() {
  const matches = filterServices(catalog, $('search').value, $('direction').value);
  if (!matches.some(item => item.id === selectedId)) selectedId = matches[0]?.id ?? '';
  $('result-count').textContent = `Найдено: ${matches.length} из ${catalog.services.length}`;
  const buttons = matches.map(service => {
    const button = element('button', undefined, 'service-card'); button.type = 'button';
    button.setAttribute('aria-pressed', String(service.id === selectedId));
    button.append(element('strong', service.name), element('span', service.value ?? 'Описание результата не указано'), element('span', `${service.offer_ids.length} предложений · ${service.system_ids.length} систем`));
    button.addEventListener('click', () => { selectedId = service.id; section = 'offers'; renderList(); renderDetail(); });
    return button;
  });
  $('service-list').replaceChildren(...(buttons.length ? buttons : [element('p', 'Нет совпадений. Измените запрос или направление.', 'empty')]));
}
function renderOffers(details) {
  const root = element('div');
  root.append(element('h3', 'Что можно получить'));
  if (!details.offers.length) root.append(element('p', 'Предложения для этого сервиса ещё не описаны.', 'empty'));
  for (const offer of details.offers) {
    const article = element('article', undefined, 'offer');
    article.append(element('h4', offer.name), element('p', offer.result ?? 'Результат не указан'));
    if (offer.historical_only) article.append(element('span', 'Только историческое описание', 'badge'));
    if (offer.automatic_fulfilment) article.append(element('p', 'В файле заявлено автоматическое исполнение. В этом приложении исполнение не подключено.', 'connection-note'));
    if (!offer.requests.length) article.append(element('p', 'Шаблоны запросов пока не указаны.', 'notice'));
    for (const request of offer.requests) {
      const disclosure = element('details', undefined, 'request');
      disclosure.append(element('summary', request.name));
      const body = element('div', undefined, 'request-body');
      body.append(fields([
        ['Тип из файла', request.type],
        ['Доступные типы', request.allowed_types?.join(', ')],
        ['Область', request.scope],
        ['Точка входа из файла', request.handling?.entry]
      ]));
      if (request.type_is_suggestion) body.append(element('p', 'Тип запроса указан как подсказка; классификация требует проверки.', 'notice'));
      const columns = element('div', undefined, 'columns');
      const input = element('section'); input.append(element('h4', 'Что нужно на входе'), bullets(request.required_inputs));
      const done = element('section'); done.append(element('h4', 'Критерии завершения'), bullets(request.completion_criteria));
      columns.append(input, done); body.append(columns);
      body.append(element('p', 'Это описание запроса. Он не отправлен; выполнение и изменение систем не разрешены выбором в каталоге.', 'notice'));
      disclosure.append(body); article.append(disclosure);
    }
    root.append(article);
  }
  return root;
}
function renderSystems(details) {
  const root = element('div'); root.append(element('h3', 'Системы сервиса'), element('p', 'Сведения из каталога. Проверка доступности и мониторинг здесь не выполняются.', 'notice'));
  if (!details.systems.length) root.append(element('p', 'Системы не указаны.', 'empty'));
  for (const system of details.systems) root.append(record(system.name, [['Тип', system.kind], ['Фактический статус', system.fact_status], ['Состояние из файла', system.current_health], ['Примечание', system.note]]));
  return root;
}
function renderKnowledge(details) {
  const root = element('div'); const knowledge = details.service.knowledge ?? {};
  root.append(element('h3', 'Знания и ограничения'));
  root.append(record('Справочные материалы', [['Инструкция', knowledge.instruction_ref], ['Runbook', knowledge.runbook_ref]]));
  root.append(element('p', 'Ссылки показаны как текст. Их доступность, актуальность и содержимое не проверены.', 'notice'));
  root.append(element('h4', 'Известные ограничения'), bullets(knowledge.known_limits, 'Ограничения не описаны; это не подтверждение их отсутствия.'));
  root.append(element('h4', 'Источники утверждений'));
  if (!details.evidence.length) root.append(element('p', 'Подтверждающие источники для сервиса не приложены.', 'notice'));
  for (const evidence of details.evidence) root.append(record(evidence.label ?? evidence.id, [
    ['Вид', evidence.kind], ['Проверка', evidence.verification], ['Дата источника', evidence.source_date], ['Дата просмотра', evidence.reviewed_at], ['Ссылка из файла', evidence.source_url], ['Ограничение', evidence.limitation]
  ]));
  return root;
}
function renderBindings(details) {
  const root = element('div'); root.append(element('h3', 'Связи с архитектурой'), element('p', 'Каталог описывает связи, но не загружает модель ArchiMate и не подтверждает ID её элементов.', 'notice'));
  const names = new Map([...catalog.services, ...catalog.systems, ...catalog.offers, ...catalog.requests, ...catalog.directions, ...(catalog.capabilities ?? [])].map(item => [item.id, item.name ?? item.id]));
  if (!details.links.length) root.append(element('p', 'Архитектурные связи для сервиса не описаны.', 'empty'));
  for (const link of details.links) {
    const article = record(`${names.get(link.from.id) ?? link.from.id} → ${names.get(link.to.id) ?? link.to.id}`, [
      ['Отношение', link.relation], ['Статус утверждения', link.assertion_status], ['Статус из файла', link.binding_status], ['ID элемента модели', link.architecture_element_id]
    ]);
    article.append(element('p', describeBinding(link), 'connection-note')); root.append(article);
  }
  return root;
}
function renderScope(details) {
  const root = element('div'); const service = details.service;
  root.append(element('h3', 'Границы сервиса'), fields([['Для кого', service.audience], ['Область', service.scope], ['Статус структуры', service.structure_status]]));
  const columns = element('div', undefined, 'columns');
  const yes = element('section'); yes.append(element('h4', 'Входит'), bullets(service.included));
  const no = element('section'); no.append(element('h4', 'Не входит'), bullets(service.excluded)); columns.append(yes, no); root.append(columns);
  root.append(element('h4', 'Поддержка'), fields([['Точка входа', service.support?.entry], ['Режим', service.support?.mode]]));
  for (const person of service.support?.participants ?? []) root.append(record(person.agent ?? 'Участник', [['Роль', person.role], ['Область', person.scope], ['Статус назначения', person.assignment_status]]));
  root.append(element('p', 'Участники и роли приведены из файла. Приложение никого не назначает и не связывается с поддержкой.', 'notice'));
  if (catalog.handoffs?.length) {
    root.append(element('h4', 'Переходы каталога'));
    for (const handoff of catalog.handoffs) root.append(record(handoff.label ?? handoff.id, [['Назначение', handoff.destination], ['Область', handoff.scope], ['Вид', handoff.kind], ['Адрес из файла', handoff.url]]));
    root.append(element('p', 'Переходы не выполняются; автоматическая передача данных отсутствует.', 'notice'));
  }
  return root;
}
const sections = [ ['offers', 'Предложения', renderOffers], ['systems', 'Системы', renderSystems], ['knowledge', 'Знания', renderKnowledge], ['bindings', 'ArchiMate', renderBindings], ['scope', 'Границы', renderScope] ];
function renderDetail() {
  const root = $('detail'); const details = getServiceDetails(catalog, selectedId);
  if (!details) { root.replaceChildren(element('h2', 'Выберите сервис'), element('p', 'Откройте каталог или измените условия поиска.', 'empty')); return; }
  const service = details.service;
  const direction = catalog.directions.find(item => item.id === service.direction_id);
  const heading = element('h2', service.name);
  const tabs = element('nav', undefined, 'sections'); tabs.setAttribute('aria-label', 'Разделы сервиса');
  for (const [key, label] of sections) {
    const button = element('button', label); button.type = 'button'; button.setAttribute('aria-pressed', String(section === key));
    button.addEventListener('click', () => { section = key; renderDetail(); $('detail').querySelector(`[data-section="${key}"]`)?.focus(); });
    button.dataset.section = key; tabs.append(button);
  }
  const content = sections.find(item => item[0] === section)[2](details); content.classList.add('tab-content');
  root.replaceChildren(element('p', direction?.name ?? 'Без направления', 'eyebrow'), heading, element('p', service.value ?? '', 'lead'), metadata([['Готовность работ', service.availability_of_work], ['Состояние', service.current_health]]), tabs, content);
}
function render() { renderSession(); renderList(); renderDetail(); }
function confirmDiscard() { return !unsaved || window.confirm('Импортированный каталог хранится только в этой вкладке. Продолжить без скачивания JSON?'); }
function replaceCatalog(next, filename, isImport) {
  catalog = next; sourceName = filename; imported = isImport; unsaved = isImport;
  selectedId = catalog.services[0]?.id ?? ''; section = 'offers'; $('search').value = '';
  renderDirections(); render();
}
$('search').addEventListener('input', () => { renderList(); renderDetail(); });
$('direction').addEventListener('change', () => { renderList(); renderDetail(); });
$('import-button').addEventListener('click', () => { if (!reading) $('file-input').click(); });
$('file-input').addEventListener('change', async event => {
  const file = event.target.files?.[0]; event.target.value = '';
  if (!file || reading) return;
  if (file.size > MAX_FILE_BYTES) { message('Файл больше 2 МиБ. Выберите меньший JSON.', true); return; }
  reading = true; $('import-button').disabled = true; $('sample-button').disabled = true;
  try {
    const next = parseCatalog(await file.text());
    if (!confirmDiscard()) return;
    replaceCatalog(next, file.name, true);
    message('Каталог открыт в памяти вкладки. Данные никуда не отправлялись.');
  } catch (error) { message(`Не удалось открыть каталог. ${error.message}`, true); }
  finally { reading = false; $('import-button').disabled = false; $('sample-button').disabled = false; }
});
$('export-button').addEventListener('click', () => {
  let url; let link;
  try {
    const blob = new Blob([serializeCatalog(catalog)], { type: 'application/json;charset=utf-8' });
    url = URL.createObjectURL(blob);
    link = document.createElement('a'); link.href = url; link.download = 'schemka-catalog.json'; document.body.append(link); link.click(); link.remove();
    // A browser download is requested, not proof that the operating system saved it.
    unsaved = false; renderSession(); message('Загрузка JSON запрошена. Проверьте, что файл сохранён в загрузках браузера.');
  } catch (error) { message(`Не удалось подготовить JSON. ${error.message}`, true); }
  finally { link?.remove(); if (url) setTimeout(() => URL.revokeObjectURL(url), 30000); }
});
$('sample-button').addEventListener('click', () => {
  if (confirmDiscard()) { replaceCatalog(structuredClone(SAMPLE_CATALOG), '', false); message('Открыт синтетический учебный пример.'); }
});
// Pending imports cannot be interrupted by same-tab mode navigation. Dirty
// navigation uses native beforeunload, so cancelled navigation never consumes consent.
document.addEventListener('click', event => {
  const link = event.target.closest?.('a[data-mode-link]');
  if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === '_blank') return;
  if (reading) {
    event.preventDefault(); event.stopImmediatePropagation();
    message('Дождитесь завершения чтения файла перед переходом.');
  }
}, { capture: true });
window.addEventListener('beforeunload', event => {
  if (!unsaved && !reading) return;
  event.preventDefault(); event.returnValue = '';
});
renderDirections(); render();
