import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const fail = (message, code = 'GIT_NETWORK_POLICY') => { throw Object.assign(Error(message), { code }); };
export const DEFAULT_NETWORK_POLICY = Object.freeze({ mode: 'system', proxy: '', authorization: true });
export function validateNetworkPolicy(value, remote) {
  if (!value || Object.keys(value).some(key => !['mode', 'proxy', 'authorization'].includes(key)) || !['system', 'direct', 'manual'].includes(value.mode) || typeof value.authorization !== 'boolean' || typeof value.proxy !== 'string') fail('Некорректная политика подключения.');
  if (value.mode !== 'system' && !remote.startsWith('https://')) fail('Настройка HTTP proxy доступна только HTTPS-подключениям. SSH использует собственную системную конфигурацию.');
  let proxy = '';
  if (value.mode === 'manual') {
    let url; try { url = new URL(value.proxy); } catch { fail('Укажите URL HTTP/HTTPS proxy без учётных данных.'); }
    if (value.proxy.length > 2048 || /[\s\p{Cc}\p{Cf}]/u.test(value.proxy) || !['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash || url.pathname !== '/') fail('Proxy: только HTTP/HTTPS адрес сервера и порт, без пароля, пути и параметров.');
    proxy = url.origin;
  } else if (value.proxy) fail('Адрес proxy допустим только в ручном режиме.');
  return { mode: value.mode, proxy, authorization: value.authorization };
}
export function createNetworkPolicy(root, remote) {
  const filename = path.join(root, 'arkita-network.json');
  async function get() { try { const stat = await fs.lstat(filename); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) fail('Файл политики подключения повреждён.', 'GIT_STORAGE'); return validateNetworkPolicy(JSON.parse(await fs.readFile(filename, 'utf8')), remote); } catch (error) { if (error.code === 'ENOENT') return { ...DEFAULT_NETWORK_POLICY }; throw error; } }
  async function set(input) {
    const value = validateNetworkPolicy(input, remote), temporary = `${filename}.${randomUUID()}.tmp`;
    try { await fs.writeFile(temporary, JSON.stringify(value) + '\n', { flag: 'wx', mode: 0o600 }); await fs.rename(temporary, filename); } finally { await fs.rm(temporary, { force: true }); }
    return get();
  }
  async function options() {
    const value = await get();
    if (!value.authorization) fail('Доступ этого подключения в Arkita отключён. Локальная модель и история сохранены. Включите подключение явно.', 'GIT_AUTH_DISABLED');
    if (value.mode === 'system') return {};
    const proxy = value.mode === 'manual' ? value.proxy : '';
    return { config: [`http.proxy=${proxy}`, `http.${remote}.proxy=${proxy}`], removeProxyEnvironment: true };
  }
  return { get, set, options };
}
