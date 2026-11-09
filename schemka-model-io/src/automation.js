import { parseJSON, canonicalJSON } from '../../schemka-model-core/src/json.js';
import { validateAutomation } from '../../schemka-model-core/src/automation.js';
export const AUTOMATION_FILE_LIMIT = 64 * 1024;
export function readAutomation(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > AUTOMATION_FILE_LIMIT) throw Object.assign(Error('Пакет автоматизации должен быть не больше 64 KiB.'), { code: 'AUTOMATION_SIZE' });
  try { return validateAutomation(parseJSON(text)); }
  catch (error) { const position = /at character (\d+)/.exec(error.message); if (position) error.line = text.slice(0, Number(position[1])).split('\n').length; const matches = [...text.matchAll(/"action"\s*:/g)]; if (error.step && matches[error.step - 1]) error.line = text.slice(0, matches[error.step - 1].index).split('\n').length; throw error; }
}
export const serializeAutomation = value => canonicalJSON(validateAutomation(value));
export const EXAMPLE_AUTOMATION = Object.freeze({ format: 'arkita-automation', version: 1, id: 'arkita.unused-concepts', name: 'Концепты без рисунков', packageVersion: '1.0.0', description: 'Показывает элементы, не нарисованные ни в одном представлении. Только чтение.', engineVersion: 1, capabilities: ['model.read'], steps: [{ action: 'query', query: { kind: 'element', unused: true } }] });
