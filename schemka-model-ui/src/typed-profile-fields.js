import { CUSTOMIZATION_BASIC_TYPES, LIMITS } from '../../schemka-model-core/src/index.js';

const clone = value => value === undefined ? undefined : structuredClone(value);
const labelFor = type => typeof type === 'string' ? type : type.kind;

/** Typed inert controls keep absent/default/false/zero/empty distinct, including compound values. */
export function typedValueControl(document, type, value) {
  const host = document.createElement('div'); host.className = 'typed-value';
  function field(title, tag = 'input') { const label = document.createElement('label'), input = document.createElement(tag); label.append(document.createTextNode(title),input); host.append(label); return input; }
  function raw(input, value) { input.value = value; const initial = input.value; return () => input.value === initial ? value : input.value; }
  if (type?.kind === 'Structure') {
    const editors = Object.entries(type.fields).map(([key,fieldType]) => { const section = document.createElement('fieldset'), legend = document.createElement('legend'), editor = typedValueControl(document,fieldType,value?.[key]); legend.textContent = key; section.append(legend,editor.element); host.append(section); return [key,editor]; });
    return { element:host,read:() => Object.fromEntries(editors.map(([key,editor]) => [key,editor.read()])) };
  }
  if (type?.kind === 'List') {
    const list = document.createElement('div'), more = document.createElement('button'), add = document.createElement('button'); host.append(list,more,add); more.type = add.type = 'button'; more.textContent = 'Показать ещё 64 значения'; add.textContent = 'Добавить значение';
    const rows = (value ?? []).map(value => ({ value:clone(value),editor:null,row:null }));
    function append(row) { const item = document.createElement('fieldset'), editor = typedValueControl(document,type.itemType,row.value), remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Удалить значение'; row.editor = editor; row.row = item; item.append(editor.element,remove); list.append(item); remove.addEventListener('click',() => { rows.splice(rows.indexOf(row),1); item.remove(); more.hidden = rows.every(row => row.editor); host.dispatchEvent(new document.defaultView.Event('input',{bubbles:true})); }); }
    function next() { rows.filter(row => !row.editor).slice(0,64).forEach(append); more.hidden = rows.every(row => row.editor); }
    more.addEventListener('click',next); add.addEventListener('click',() => { const row = {value:undefined}; rows.push(row); append(row); host.dispatchEvent(new document.defaultView.Event('input',{bubbles:true})); }); next();
    return { element:host,read:() => rows.map(row => row.editor ? row.editor.read() : clone(row.value)) };
  }
  if (type === 'Boolean') { const input = field('Значение','select'); for (const [value,text] of [['false','Нет'],['true','Да']]) { const option = document.createElement('option'); option.value = value; option.textContent = text; input.append(option); } input.value = String(value ?? false); return {element:host,read:() => { if (!['true','false'].includes(input.value)) throw Error('Некорректное Boolean значение.'); return input.value === 'true'; }}; }
  if (type === 'Currency') { const amount = field('Сумма'), currency = field('Код валюты'); amount.type = currency.type = 'text'; amount.maxLength = LIMITS.string; currency.maxLength = 3; const readAmount = raw(amount,value?.amount ?? ''), readCurrency = raw(currency,value?.currency ?? ''); return {element:host,read:() => ({amount:readAmount(),currency:readCurrency()})}; }
  const input = field(type === 'Date' ? 'Дата (ГГГГ-ММ-ДД)' : type === 'URL' ? 'Адрес' : 'Значение',type === 'String' ? 'textarea' : 'input');
  input.maxLength = LIMITS.string; if (type === 'String') input.rows = 2; else input.type = 'text';
  const original = value ?? (['Integer','Real'].includes(type) ? 0 : ''), read = raw(input,String(original));
  return {element:host,read:() => { const result = read(); if (!['Integer','Real'].includes(type)) return result; if (!result.trim()) throw Error('Заполните числовое значение.'); const number = Number(result); if (!Number.isFinite(number) || Object.is(number,-0) || type === 'Integer' && !Number.isSafeInteger(number)) throw Error('Некорректное числовое значение.'); return number; }};
}

export function attributeDefinitionControl(document, attributes) {
  const host = document.createElement('div'); host.className = 'typed-attributes';
  const rows = [], add = document.createElement('button'); add.type = 'button'; add.textContent = 'Добавить атрибут'; add.id = 'profile-add-attribute'; host.append(add);
  function select(values,selected) { const input = document.createElement('select'); for (const value of values) { const option = document.createElement('option'); option.value = option.textContent = value; input.append(option); } input.value = selected; return input; }
  function fieldsControl(fields = {}) {
    const host = document.createElement('div'), rows = [], add = document.createElement('button'); add.type = 'button'; add.textContent = 'Добавить поле структуры'; host.append(add);
    function append(key='',type='String') { const row = document.createElement('div'), name = document.createElement('input'), choice = select(CUSTOMIZATION_BASIC_TYPES,type), remove = document.createElement('button'); name.placeholder = 'Имя поля'; name.setAttribute('aria-label','Имя поля структуры'); name.maxLength = LIMITS.string; name.value = key; remove.type = 'button'; remove.textContent = 'Удалить поле'; row.append(name,choice,remove); host.insertBefore(row,add); const record = {row,name,choice}; rows.push(record); remove.addEventListener('click',() => { rows.splice(rows.indexOf(record),1); row.remove(); host.dispatchEvent(new document.defaultView.Event('input',{bubbles:true})); }); }
    for (const [key,type] of Object.entries(fields)) append(key,type); add.addEventListener('click',() => { if (rows.length < LIMITS.properties) { append(); host.dispatchEvent(new document.defaultView.Event('input',{bubbles:true})); } });
    return {element:host,read:() => { const entries = rows.map(row => [row.name.value,row.choice.value]); if (new Set(entries.map(([key]) => key)).size !== entries.length) throw Error('Имена полей структуры повторяются.'); return Object.fromEntries(entries); }};
  }
  function append(key='',definition={type:'String'}) {
    const row = document.createElement('fieldset'), legend = document.createElement('legend'), name = document.createElement('input'), type = select([...CUSTOMIZATION_BASIC_TYPES,'Structure','List'],labelFor(definition.type)), details = document.createElement('div'), defaultLabel = document.createElement('label'), useDefault = document.createElement('input'), defaults = document.createElement('div'), remove = document.createElement('button');
    legend.textContent = 'Атрибут'; name.placeholder = 'Имя атрибута'; name.setAttribute('aria-label','Имя атрибута'); name.maxLength = LIMITS.string; name.value = key; name.dataset.attributeName = ''; type.setAttribute('aria-label','Тип атрибута'); type.dataset.attributeType = ''; useDefault.type = 'checkbox'; useDefault.checked = Object.hasOwn(definition,'default'); defaultLabel.append(useDefault,document.createTextNode('Значение по умолчанию')); remove.type = 'button'; remove.textContent = 'Удалить атрибут'; row.append(legend,name,type,details,defaultLabel,defaults,remove); host.insertBefore(row,add);
    let structure = null,itemType = null,editor = null;
    const record = {row,name,type,read:() => { const result = {type:readType()}; if (useDefault.checked) result.default = editor.read(); return result; }}; rows.push(record);
    function readType() { return type.value === 'Structure' ? {kind:'Structure',fields:structure.read()} : type.value === 'List' ? {kind:'List',itemType:itemType.value === 'Structure' ? {kind:'Structure',fields:structure.read()} : itemType.value} : type.value; }
    function updateDefault(value) { defaults.replaceChildren(); editor = typedValueControl(document,readType(),value); defaults.append(editor.element); defaults.hidden = !useDefault.checked; }
    function updateDetails(original=definition.type) {
      details.replaceChildren(); structure = null; itemType = null;
      if (type.value === 'List') { itemType = select([...CUSTOMIZATION_BASIC_TYPES,'Structure'],original?.kind === 'List' ? labelFor(original.itemType) : 'String'); itemType.setAttribute('aria-label','Тип значения списка'); details.append(itemType); itemType.addEventListener('change',() => { const remembered = itemType.value; updateDetails({kind:'List',itemType:remembered === 'Structure' ? {kind:'Structure',fields:{}} : remembered}); useDefault.checked = false; defaults.hidden = true; }); }
      if (type.value === 'Structure' || itemType?.value === 'Structure') { const fields = original?.kind === 'Structure' ? original.fields : original?.itemType?.fields; structure = fieldsControl(fields); details.append(structure.element); structure.element.addEventListener('change',() => { useDefault.checked = false; defaults.hidden = true; }); }
      updateDefault(Object.hasOwn(definition,'default') && labelFor(original) === type.value ? definition.default : undefined);
    }
    updateDetails(); type.addEventListener('change',() => { useDefault.checked = false; updateDetails(type.value); }); useDefault.addEventListener('change',() => { updateDefault(useDefault.checked ? clone(definition.default) : undefined); });
    remove.addEventListener('click',() => { rows.splice(rows.indexOf(record),1); row.remove(); host.dispatchEvent(new document.defaultView.Event('input',{bubbles:true})); });
  }
  for (const [key,value] of Object.entries(attributes)) append(key,value);
  add.addEventListener('click',() => { if (rows.length < LIMITS.properties) append(); host.dispatchEvent(new document.defaultView.Event('input',{bubbles:true})); });
  return {element:host,read:() => { const entries = rows.map(row => [row.name.value,row.read()]); if (new Set(entries.map(([key]) => key)).size !== entries.length) throw Error('Имена атрибутов повторяются.'); return Object.fromEntries(entries); }};
}
