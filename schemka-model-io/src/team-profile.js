import { parseJSON, record, text, fail } from '../../schemka-model-core/src/json.js';
import { serializePreferences, deserializePreferences } from './preferences-profile.js';
import { serializeTemplate, readTemplate } from './templates.js';
export const TEAM_PROFILE_LIMIT = 32 * 1024 * 1024;
const utf8 = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
function metadata(value) {
  if (typeof value.id !== 'string' || !/^[a-z][a-z0-9.-]{0,79}$/.test(value.id)) fail('TEAM_PROFILE', 'Некорректный ID командного профиля.');
  text(value.name); text(value.revision);
  if (!value.name.trim() || value.name.length > 200 || !value.revision.trim() || value.revision.length > 80) fail('TEAM_PROFILE', 'Укажите название и ревизию командного профиля.');
  if (!Array.isArray(value.templates) || value.templates.length > 16) fail('TEAM_PROFILE', 'В командном профиле допускается до 16 шаблонов.');
}
/** Strings preserve the existing closed preferences/template parsers at every nested boundary. */
export function readTeamProfile(input) {
  if (typeof input !== 'string' && !(input instanceof Uint8Array)) fail('TEAM_PROFILE', 'Ожидается JSON командного профиля.');
  if ((typeof input === 'string' ? utf8.encode(input).length : input.byteLength) > TEAM_PROFILE_LIMIT) fail('TEAM_PROFILE_LIMIT', 'Командный профиль превышает 32 MiB.');
  let source; try { source = typeof input === 'string' ? input : decoder.decode(input); } catch { fail('TEAM_PROFILE', 'Командный профиль должен быть UTF-8.'); }
  const value = parseJSON(source); record(value, ['format', 'version', 'id', 'name', 'revision', 'preferences', 'templates']);
  if (value.format !== 'arkita-team-profile' || value.version !== 1) fail('TEAM_PROFILE_VERSION', 'Поддерживается командный профиль Arkita v1.');
  metadata(value);
  const preferences = deserializePreferences(value.preferences), templates = value.templates.map(readTemplate), ids = new Set(templates.map(item => item.metadata.id));
  if (ids.size !== templates.length) fail('TEAM_PROFILE', 'ID шаблонов командного профиля должны быть уникальны.');
  return { id: value.id, name: value.name, revision: value.revision, preferences, templates };
}
export function serializeTeamProfile(value) {
  metadata(value);
  const result = JSON.stringify({ format: 'arkita-team-profile', version: 1, id: value.id, name: value.name, revision: value.revision, preferences: serializePreferences(value.preferences), templates: value.templates.map(item => decoder.decode(serializeTemplate(item))) }) + '\n';
  readTeamProfile(result); return result;
}
