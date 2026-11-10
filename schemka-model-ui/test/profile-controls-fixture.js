const click = (host,label) => [...host.querySelectorAll('button')].find(item => item.textContent === label).click();
const emit = input => input.dispatchEvent(new input.ownerDocument.defaultView.Event('change',{bubbles:true}));
export function fillBasicValue(host,value) {
  const input = host.querySelector('textarea,select,input'); if (!input) throw Error('No basic typed control');
  input.value = input.tagName === 'SELECT' ? typeof value === 'boolean' ? String(value) : '' : String(value); emit(input);
}
export function setProfileAttributes(document,attributes) {
  const host = document.getElementById('customization-attributes');
  for (const button of [...host.querySelectorAll('button')].filter(item => item.textContent === 'Удалить атрибут')) button.click();
  for (const [key,definition] of Array.isArray(attributes) ? attributes : Object.entries(attributes)) {
    document.getElementById('profile-add-attribute').click(); const row = [...host.querySelectorAll(':scope > .typed-attributes > fieldset')].at(-1);
    row.querySelector('[data-attribute-name]').value = key; const type = row.querySelector('[data-attribute-type]'); type.value = definition.type; emit(type);
    const use = row.querySelector('input[type=checkbox]'); use.checked = Object.hasOwn(definition,'default'); emit(use); if (use.checked) fillBasicValue(row.querySelector('.typed-value'),definition.default);
  }
}
export function setProfileValues(document,values) {
  for (const row of document.querySelectorAll('#customization-value-hints [data-attribute-key]')) {
    const use = row.querySelector('[data-override]'); use.checked = Object.hasOwn(values,row.dataset.attributeKey); emit(use); if (use.checked) fillBasicValue(row.querySelector('.typed-value'),values[row.dataset.attributeKey]);
  }
}

export function setViewpointList(document,field,values) {
  const host = document.getElementById(`viewpoint-${field}`); for (const button of [...host.querySelectorAll('button')].filter(item => item.textContent === 'Удалить строку')) button.click();
  for (const value of values) { click(host,'Добавить строку'); const input = [...host.querySelectorAll('textarea')].at(-1); input.value = value; input.dispatchEvent(new document.defaultView.Event('input',{bubbles:true})); }
}
