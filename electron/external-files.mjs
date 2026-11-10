import path from 'node:path';
import { assertSvgExport, SVG_EXPORT_LIMIT } from '../schemka-model-io/src/svg-export-profile.js';
import * as fs from 'node:fs/promises';
import { directoryBoundary } from './project-files.mjs';
import { readRegular, exclusiveFile } from './native-directory.mjs';
import { readAutomation } from '../schemka-model-io/src/automation.js';
import { deserializePreferences, deserializeColorScheme } from '../schemka-model-io/src/preferences-profile.js';
import { readReportTemplate } from '../schemka-model-io/src/report.js';
import { readProjectFile } from '../schemka-model-io/src/project-file.js';
const MiB = 1024 * 1024;
const formats = Object.freeze({ csv: ['csv'], xml: ['xml', 'xsd'], template: ['arkita-template.json'], native: ['arkita'], xlsx: ['xlsx'], png: ['png'], svg: ['svg'], html: ['html'], 'report-template': ['arkita-report.json'], pdf: ['pdf'], preferences: ['json'], colors: ['json'], automation: ['arkita-automation.json'] });
const readable = new Set(['csv', 'xml', 'template', 'native', 'report-template', 'preferences', 'colors', 'automation']);
const fail = (code, message) => { throw Object.assign(Error(message), { code }); };
function extensions(kind) { if (!Object.hasOwn(formats, kind)) fail('EXTERNAL_FORMAT', 'Неизвестный формат обмена.'); return formats[kind]; }
function validName(name, kind) {
  if (typeof name !== 'string' || !name || name.length > 180 || /[<>:"/\\|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) || !(kind === 'xml' && ['Exchange-LICENSE.txt', 'Exchange-sources.json'].includes(name)) && !extensions(kind).some(ext => name.toLowerCase().endsWith(`.${ext}`))) fail('EXTERNAL_NAME', 'Недопустимое имя файла экспорта.');
  return name;
}
const limit = kind => kind === 'svg' ? SVG_EXPORT_LIMIT : ['preferences', 'colors', 'automation'].includes(kind) ? 64 * 1024 : kind === 'report-template' ? 32 * 1024 : ['png', 'html', 'pdf'].includes(kind) ? 64 * MiB : 18 * MiB;
function validate(kind, bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > limit(kind)) fail('EXTERNAL_SIZE', 'Файл обмена превышает допустимый размер.');
  if (kind === 'svg') assertSvgExport(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
  if (kind === 'automation') readAutomation(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (kind === 'native') readProjectFile(bytes);
  if (['preferences', 'colors'].includes(kind)) (kind === 'preferences' ? deserializePreferences : deserializeColorScheme)(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (kind === 'report-template') {
    readReportTemplate(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  }
  return Buffer.from(bytes);
}
export function externalRecords(kind, input) {
  extensions(kind);
  if (kind === 'native' || !Array.isArray(input) || !input.length || input.length > 32) fail('EXTERNAL_COUNT', 'Выберите от 1 до 32 файлов экспорта.');
  const seen = new Set(); let total = 0;
  return input.map(item => {
    if (!item || typeof item !== 'object' || Object.keys(item).some(k => !['name', 'bytes'].includes(k))) fail('EXTERNAL_FILE', 'Некорректный файл экспорта.');
    const name = validName(item.name, kind), bytes = validate(kind, item.bytes), key = name.toLowerCase();
    if (kind === 'xml' && ['Exchange-LICENSE.txt', 'Exchange-sources.json'].includes(name) && bytes.length > 64 * 1024) fail('EXTERNAL_SIZE', 'Приложение к XML больше 64 KiB.');
    if (seen.has(key)) fail('EXTERNAL_NAME', 'Имена файлов экспорта должны быть различными.'); seen.add(key);
    total += bytes.length; if (total > 64 * MiB) fail('EXTERNAL_SIZE', 'Набор экспорта больше 64 MiB.');
    return { name, bytes };
  });
}
export async function readExternalFiles({ window, dialog, kind, current, io = fs }) {
  if (!readable.has(kind)) fail('EXTERNAL_FORMAT', 'Этот формат недоступен для импорта.');
  const result = await dialog.showOpenDialog(window, { title: 'Открыть файл обмена', filters: [{ name: kind, extensions: [...extensions(kind), ...(kind === 'xml' ? ['archimate'] : [])] }], properties: ['openFile', 'dontAddToRecent', ...(kind === 'csv' ? ['multiSelections'] : [])] });
  current();
  if (result.canceled || !result.filePaths?.length) return { status: 'cancelled' };
  if (result.filePaths.length > (kind === 'csv' ? 32 : 1)) fail('EXTERNAL_COUNT', 'Слишком много выбранных файлов.');
  const files = []; let total = 0;
  for (const selected of result.filePaths) {
    const basename = path.basename(selected);
    if (kind === 'xml' && ['Exchange-LICENSE.txt', 'Exchange-sources.json'].includes(basename)) fail('EXTERNAL_NAME', 'Выберите XML или Archi native файл.');
    const name = kind === 'xml' && basename.toLowerCase().endsWith('.archimate') ? validName(basename.replace(/\.archimate$/i, '.xml'), kind).replace(/\.xml$/, '.archimate') : validName(basename, kind), guard = await directoryBoundary(path.dirname(selected), io);
    const read = await readRegular(selected, limit(kind), guard, io), bytes = validate(kind, read.bytes);
    total += bytes.length; if (total > 64 * MiB) fail('EXTERNAL_SIZE', 'Набор импорта больше 64 MiB.');
    current(); files.push({ name, bytes: Uint8Array.from(bytes) });
  }
  return { status: 'opened', files };
}
export async function saveExternalFiles({ window, dialog, kind, records, current, protect, io = fs }) {
  const files = externalRecords(kind, records);
  if (files.length === 1) {
    const result = await dialog.showSaveDialog(window, { title: 'Экспортировать', defaultPath: files[0].name, filters: [{ name: kind, extensions: extensions(kind) }], properties: ['showOverwriteConfirmation', 'dontAddToRecent'] });
    current(); if (result.canceled || !result.filePath) return { status: 'cancelled' };
    validName(path.basename(result.filePath), kind); await protect(result.filePath); current();
    const guard = await directoryBoundary(path.dirname(result.filePath), io);
    await exclusiveFile(result.filePath, files[0].bytes, guard, io);
    const verified = await readRegular(result.filePath, limit(kind), guard, io);
    if (!verified.bytes.equals(files[0].bytes)) fail('EXTERNAL_IO', 'Экспорт не прошёл проверку.');
    return { status: 'saved', name: path.basename(result.filePath), files: [{ name: path.basename(result.filePath) }], count: 1 };
  }
  const result = await dialog.showOpenDialog(window, { title: 'Каталог для нового набора экспорта', properties: ['openDirectory', 'createDirectory', 'dontAddToRecent'] });
  current(); if (result.canceled || !result.filePaths?.length) return { status: 'cancelled' };
  if (result.filePaths.length !== 1) fail('EXTERNAL_COUNT', 'Выберите один каталог.');
  const parent = result.filePaths[0], guard = await directoryBoundary(parent, io);
  await protect(path.join(parent, 'Arkita-export')); current();
  const destination = await io.mkdtemp(path.join(parent, 'Arkita-export-'));
  try {
    await guard.check(destination); await protect(destination); current();
    for (const file of files) { await exclusiveFile(path.join(destination, file.name), file.bytes, guard, io); current(); }
    for (const file of files) { const read = await readRegular(path.join(destination, file.name), limit(kind), guard, io); if (!read.bytes.equals(file.bytes)) fail('EXTERNAL_IO', 'Экспорт не прошёл проверку.'); }
    return { status: 'saved', name: path.basename(destination), files: files.map(({ name }) => ({ name })), count: files.length };
  } catch (error) {
    // A failed bundle is never advertised as ready. Keep evidence rather than recursively deleting a path whose ownership may have changed.
    throw Object.assign(Error(`Набор экспорта не завершён: ${destination}. ${error.message}`), { code: error.code || 'EXTERNAL_IO' });
  }
}
