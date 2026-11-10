#!/usr/bin/env node
import path from 'node:path';
import * as fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { FORMAT_VERSION } from '../schemka-model-core/src/index.js';
import { readProjectSnapshot } from '../electron/project-files.mjs';
import { directoryBoundary } from '../electron/project-files.mjs';
import { readProjectFile } from '../schemka-model-io/src/project-file.js';
import { exportCSV } from '../schemka-model-io/src/csv.js';

/** No executable plugins, implicit network, or overwrite; stdout contains one JSON result. */
export async function runCLI(args) {
  let created = null;
  try {
    const [command, ...options] = args, parsed = {};
    if (!['validate', 'export-csv'].includes(command)) throw Object.assign(Error('Используйте validate --input model.arkita или export-csv --input model.arkita --output новый-каталог.'), { code: 'CLI_ARGUMENTS' });
    for (let index = 0; index < options.length; index += 2) {
      const key = options[index]; if (!['--input', '--output'].includes(key) || parsed[key] !== undefined || !options[index + 1] || options[index + 1].startsWith('--')) throw Object.assign(Error('Некорректные параметры CLI.'), { code: 'CLI_ARGUMENTS' }); parsed[key] = options[index + 1];
    }
    if (!parsed['--input'] || (command === 'export-csv') !== Boolean(parsed['--output'])) throw Object.assign(Error('Укажите входную модель и, для экспорта, новый каталог вывода.'), { code: 'CLI_ARGUMENTS' });
    const opened = await readProjectSnapshot(parsed['--input']), result = readProjectFile(opened.bytes), warnings = [...(result.warnings || [])];
    if (result.sourceVersion < FORMAT_VERSION) warnings.push('Модель прочитана с миграцией в текущий формат; входной файл не изменён.');
    let files = [];
    if (command === 'export-csv') {
      const output = path.resolve(parsed['--output']), parent = await directoryBoundary(path.dirname(output), fs), exported = exportCSV(result.snapshot || result.state);
      await parent.verify(); await fs.mkdir(output, { mode: 0o700 }); created = output; const outputGuard = await directoryBoundary(output, fs);
      for (const file of exported.files) { await parent.verify(); await outputGuard.verify(); await fs.writeFile(path.join(output, file.name), file.bytes, { flag: 'wx', mode: 0o600 }); if (!Buffer.from(await fs.readFile(path.join(output, file.name))).equals(Buffer.from(file.bytes))) throw Object.assign(Error('Проверка записанного файла не пройдена.'), { code: 'CLI_VERIFY' }); }
      await outputGuard.verify(); files = exported.files.map(file => file.name); warnings.push(...exported.losses);
    }
    const state = result.snapshot || result.state;
    return { exitCode: warnings.length ? 2 : 0, status: warnings.length ? 'warning' : 'ok', code: warnings.length ? 'CLI_WARNINGS' : 'CLI_OK', command, model: { id: state.project.id, name: state.project.name }, sourceVersion: result.sourceVersion, warnings, files };
  } catch (error) { return { exitCode: 1, status: 'error', code: error.code || 'CLI_ERROR', message: error.message, ...(created ? { incompleteOutput: created } : {}) }; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await runCLI(process.argv.slice(2)); process.stdout.write(JSON.stringify(result) + '\n'); process.exitCode = result.exitCode;
}
