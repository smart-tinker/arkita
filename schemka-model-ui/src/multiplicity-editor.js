import { LIMITS } from '../../schemka-model-core/src/index.js';
import { assessMultiplicity } from '../../schemka-model-profiles/src/index.js';

const syntaxReasons = Object.freeze({
  'not-specified': 'значение не задано',
  unbounded: 'форма неограниченной кратности подтверждена',
  'one-or-more-example': 'форма «один или более» подтверждена примером',
  'positive-integer': 'форма положительного целого числа подтверждена',
  'ascending-bounded-range': 'форма возрастающего диапазона подтверждена',
  'equal-range': 'границы диапазона равны',
  'descending-range': 'верхняя граница меньше нижней',
  'negative-number': 'отрицательное число не соответствует проверяемой форме',
  'fractional-number': 'дробное число не соответствует проверяемой форме',
  'zero-singleton-not-established': 'отдельный ноль не подтверждён имеющимися сведениями',
  'unverified-numeric-spelling': 'такое написание числа не подтверждено',
  'local-unbounded-generalization': 'такая неограниченная форма не подтверждена',
  'empty-text': 'пустой текст не подтверждён как форма кратности',
  'unrecognized-text': 'форма этого текста не подтверждена',
  'non-string-input': 'ожидается текст',
  'local-input-limit': 'превышен локальный предел длины',
});

/** An explicit shared-relationship edit; syntax evidence never blocks raw data.
 * Presence and textarea text are independent. The original raw value and its
 * initial native DOM value are both retained, so untouched or reverted CR/CRLF
 * is not silently normalized into LF by HTMLTextAreaElement.value.
 */
export function installMultiplicityEditor({ document, model, openDialog, render, status, blocked = () => false }) {
  const $ = id => document.getElementById(id), dialog = $('multiplicity-dialog');
  const form = $('multiplicity-form'), error = $('multiplicity-error'), apply = $('multiplicity-apply');
  const fields = Object.fromEntries(['source', 'target'].map(end => [end, {
    value: $(`multiplicity-${end}-value`), presence: $(`multiplicity-${end}-presence`),
    diagnostic: $(`multiplicity-${end}-diagnostic`), set: $(`multiplicity-${end}-set`), remove: $(`multiplicity-${end}-remove`),
  }]));
  let pending = null, generation = 0;
  const report = text => { try { status(text); } catch { /* Feedback cannot repeat a commit. */ } };
  const rawValue = (state, field) => state.initialDefined && field.value.value === state.initialDOMValue
    ? state.initialRaw : field.value.value;

  function refresh() {
    let overLimit = false;
    for (const [end, field] of Object.entries(fields)) {
      const state = pending?.ends[end], defined = state?.defined === true;
      const raw = state ? rawValue(state, field) : '';
      field.value.disabled = !defined || state?.junction; field.set.disabled = !pending || defined || state?.junction; field.remove.disabled = !pending || !defined;
      field.presence.textContent = defined ? raw === '' ? 'Задано: пустая строка' : 'Значение задано' : 'Значение отсутствует';
      const assessment = assessMultiplicity(raw, defined);
      const tooLong = defined && raw.length > LIMITS.multiplicity;
      overLimit ||= tooLong;
      field.diagnostic.dataset.status = assessment.status;
      field.diagnostic.textContent = state?.junction
        ? 'Junction: кратность неприменима. Импортированный исходный текст сохранён; его можно явно удалить. ArchiMate 4 C260, § 5.6, стр. 47 (PDF 65).'
        : tooLong
        ? `Локальный предел: ${LIMITS.multiplicity} единиц UTF-16; сейчас ${raw.length}. Сократите текст перед сохранением.`
        : `Синтаксис: ${syntaxReasons[assessment.reason] || 'форма не подтверждена'}.` +
          (['UNVERIFIED', 'INVALID_SYNTAX'].includes(assessment.status) ? ' Исходный текст можно сохранить.' : '');
    }
    apply.disabled = !pending || overLimit;
  }

  function clearPending() {
    const existed = pending !== null;
    pending = null; apply.disabled = true;
    if (existed) generation++;
    return existed;
  }

  function closeDialog() { if (dialog.open) dialog.close(); }
  function cancel() {
    const wasOpen = dialog.open, existed = clearPending();
    if (!existed && wasOpen) generation++;
    try { closeDialog(); } catch (failure) { report(`Правка отменена, но диалог не закрыт: ${failure.message}`); }
    return existed || wasOpen;
  }

  function open(relationshipId) {
    if (pending || blocked()) return false;
    const store = model.store, relationship = store.snapshot.relationships.find(item => item.id === relationshipId);
    if (!relationship) { report('Отношение для изменения кратности не найдено'); return false; }
    const request = { relationshipId, store, revision: store.revision, viewId: model.viewId, ends: {} };
    for (const [end, field] of Object.entries(fields)) {
      const key = `${end}Multiplicity`, defined = Object.hasOwn(relationship, key), raw = defined ? relationship[key] : '';
      field.value.maxLength = LIMITS.multiplicity; field.value.value = raw;
      request.ends[end] = { junction: relationship[end].kind === 'junction', defined, initialDefined: defined, initialRaw: raw, initialDOMValue: field.value.value };
    }
    error.textContent = '';
    $('multiplicity-reference').textContent = `Общее отношение «${relationship.label || '(без подписи)'}» (${relationshipId}). ` +
      'Изменения видны во всех его соединениях. Нормативное соответствие модели: UNKNOWN.';
    try {
      // The app may cancel earlier gestures while opening any modal. Install
      // this request afterward so that its cleanup cannot cancel the new edit.
      openDialog('multiplicity-dialog');
      if (!dialog.open) throw new Error('Диалог не открыт');
      pending = request; generation++; refresh();
      (request.ends.source.defined ? fields.source.value : fields.source.set).focus();
      return true;
    } catch (failure) {
      clearPending();
      report(`Не удалось открыть правку кратности: ${failure.message}`);
      return false;
    }
  }

  for (const [end, field] of Object.entries(fields)) {
    field.value.addEventListener('input', () => { if (pending) { error.textContent = ''; refresh(); } });
    field.set.addEventListener('click', event => {
      event.preventDefault();
      if (!pending || pending.ends[end].defined || pending.ends[end].junction) return;
      pending.ends[end].defined = true; field.value.value = ''; error.textContent = ''; refresh(); field.value.focus();
    });
    field.remove.addEventListener('click', event => {
      event.preventDefault();
      if (!pending || !pending.ends[end].defined) return;
      pending.ends[end].defined = false; field.value.value = ''; error.textContent = ''; refresh(); field.set.focus();
    });
  }
  dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
  dialog.addEventListener('close', () => {
    // Native close is queued. An old close notification must not cancel a new
    // request that has already reopened this same dialog.
    if (!dialog.open) clearPending();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!pending) return;
    generation++;
    if (!dialog.open) { clearPending(); return; }
    const request = pending;
    if (model.store !== request.store || model.store.revision !== request.revision || model.viewId !== request.viewId) {
      clearPending(); error.textContent = 'Модель или представление изменились. Закройте диалог и начните правку заново.'; return;
    }
    const command = { type: 'updateRelationshipMultiplicity', relationshipId: request.relationshipId };
    for (const [end, field] of Object.entries(fields)) {
      const state = request.ends[end], key = `${end}Multiplicity`;
      if (!state.defined) { if (state.initialDefined) command[key] = null; continue; }
      const raw = state.junction ? state.initialRaw : rawValue(state, field);
      if (raw.length > LIMITS.multiplicity) {
        refresh(); error.textContent = `Текст кратности не должен превышать ${LIMITS.multiplicity} единиц UTF-16.`; field.value.focus(); return;
      }
      if (!state.initialDefined || raw !== state.initialRaw) command[key] = raw;
    }
    const changed = Object.keys(command).length > 2;
    // Clear before execution and every post-commit UI callback: reentrant or
    // duplicate submission can never repeat an accepted operation.
    clearPending();
    let committed = false;
    try {
      if (changed) { request.store.execute(command, request.revision); committed = true; }
      closeDialog();
      if (committed) render();
      report(committed ? 'Кратность общего отношения сохранена · нормативное соответствие: UNKNOWN' : 'Кратность не изменена');
    } catch (failure) {
      if (committed) report(`Кратность сохранена, но интерфейс не обновлён полностью: ${failure.message}`);
      else error.textContent = changed ? `Кратность не изменена: ${failure.message}. Закройте диалог и повторите правку.`
        : `Кратность не изменена, но диалог не закрыт: ${failure.message}`;
    }
  });
  refresh();
  return { open, cancel, get active() { return pending !== null; }, get generation() { return generation; } };
}
