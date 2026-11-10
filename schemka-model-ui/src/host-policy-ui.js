export function installHostPolicyUI({ document, window, session, status, openDialog, blocked = () => false }) {
  const desktop = window.schemkaDesktop;
  if (!desktop?.gitNetworkPolicy) return { refresh() {}, cancel() {}, get active() { return false; }, get transient() { return false; }, get generation() { return 0; } };
  const node = (tag, text, id) => { const item = document.createElement(tag); if (text !== undefined) item.textContent = text; if (id) item.id = id; return item; };
  const dialog = node('dialog', undefined, 'host-policy-dialog'), title = node('h2', 'Подключения и внешние ресурсы', 'host-policy-title'); dialog.setAttribute('aria-labelledby', title.id); dialog.append(title);
  function field(label, id, tag = 'input') { const wrapper = node('label', label), input = node(tag, undefined, id); wrapper.append(input); dialog.append(wrapper); return input; }
  function button(text, id, action, parent = dialog) { const item = node('button', text, id); item.type = 'button'; item.addEventListener('click', action); parent.append(item); return item; }
  const targetText = node('p', '', 'host-policy-target'); dialog.append(targetText);
  const mode = field('Proxy для этого HTTPS-подключения', 'host-proxy-mode', 'select'); for (const [value, text] of [['system', 'Системная конфигурация Git'], ['direct', 'Прямое подключение'], ['manual', 'Указанный proxy']]) { const option = node('option', text); option.value = value; mode.append(option); }
  const proxy = field('HTTP/HTTPS proxy: только сервер и порт, без пароля', 'host-proxy-url'); proxy.placeholder = 'http://proxy.example:8080';
  const authorization = field('Разрешить этому подключению Arkita обращаться к репозиторию', 'host-authorization'); authorization.type = 'checkbox';
  dialog.append(node('p', 'Отключение блокирует получение и отправку для этого репозитория, ветки и каталога во всех окнах Arkita. Локальные модели и история сохраняются. Оно не удаляет общие учётные данные Windows. SSH использует системную конфигурацию SSH.'));
  button('Сохранить политику подключения', 'host-policy-save', save);
  dialog.append(node('p', 'Для удаления сохранённого доступа откройте диспетчер Windows и выберите нужную запись вручную. Общая запись может использоваться другими репозиториями и программами. Arkita не читает пароли.'));
  button('Открыть диспетчер учётных данных Windows', 'host-credentials', () => perform(() => desktop.openCredentialManager(session.documentToken)));
  const link = field('Внешняя HTTP/HTTPS ссылка', 'host-external-url'); link.placeholder = 'https://…';
  button('Открыть в системном браузере…', 'host-external-open', () => perform(() => desktop.openExternalLink(link.value.trim(), session.documentToken)));
  dialog.append(node('p', 'Справка Arkita работает локально. Сетевые материалы открываются отдельно после подтверждения. Текст и ссылки модели не исполняются автоматически.'));
  const feedback = node('p', '', 'host-policy-feedback'); feedback.setAttribute('role', 'status'); dialog.append(feedback); button('Закрыть', 'host-policy-close', cancel); document.body.append(dialog);
  button('Подключения и внешние ресурсы…', 'host-policy-button', open, document.getElementById('git-dialog') || document.body);
  let target = null, busy = false, generation = 0;
  const notify = text => { feedback.textContent = text; status(text); };
  function refresh() { for (const button of dialog.querySelectorAll('button')) button.disabled = busy; document.getElementById('host-policy-close').disabled = false; mode.disabled = busy || !target; proxy.disabled = busy || !target || mode.value !== 'manual'; authorization.disabled = busy || !target; document.getElementById('host-policy-save').disabled = busy || !target; }
  async function perform(action, apply) { if (busy) return; busy = true; const ticket = ++generation, token = session.documentToken; refresh(); try { const result = await action(); if (ticket !== generation || !dialog.open || token !== session.documentToken) return; if (result.status === 'error') throw Error(`${result.code}: ${result.message}`); apply?.(result); notify(result.status === 'cancelled' ? 'Действие отменено.' : result.status === 'opened' ? 'Запрос передан системному приложению.' : 'Политика прочитана или сохранена.'); } catch (error) { if (ticket === generation) notify(error.message); } finally { busy = false; refresh(); } }
  async function open() {
    if (busy || blocked()) return; target = null; document.getElementById('git-dialog')?.close(); openDialog(dialog.id); refresh();
    await perform(async () => {
      const state = await desktop.gitStatus(undefined, session.documentToken); if (state.status !== 'ok') return state;
      target = state.target || { remote: document.getElementById('git-remote')?.value.trim() || '', branch: document.getElementById('git-branch')?.value.trim() || 'main', directory: document.getElementById('git-directory')?.value.trim() || 'arkita' };
      if (!target.remote) { target = null; targetText.textContent = 'Сначала укажите адрес, ветку и каталог в окне Git. Системные действия доступны ниже.'; return { status: 'ok' }; }
      return desktop.gitNetworkPolicy(session.documentToken, target);
    }, result => { if (!result.policy) return; target = result.target; targetText.textContent = `${target.remote}\nВетка: ${target.branch} · каталог: ${target.directory}`; mode.value = result.policy.mode; proxy.value = result.policy.proxy; authorization.checked = result.policy.authorization; });
  }
  function save() { if (!target) return; const policy = { mode: mode.value, proxy: mode.value === 'manual' ? proxy.value.trim() : '', authorization: authorization.checked }; perform(() => desktop.gitSetNetworkPolicy(target, policy, session.documentToken), result => { mode.value = result.policy.mode; proxy.value = result.policy.proxy; authorization.checked = result.policy.authorization; }); }
  function cancel() { generation++; dialog.close(); }
  dialog.addEventListener('input', () => { generation++; refresh(); }); dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); }); dialog.addEventListener('close', () => { generation++; }); mode.addEventListener('change', refresh);
  return { open, refresh, cancel, get active() { return dialog.open; }, get transient() { return busy; }, get generation() { return generation; } };
}
