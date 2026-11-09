import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile } from '../../schemka-model-io/src/project-file.js';
import { runCLI } from '../../scripts/arkita-cli.mjs';
const cli = path.resolve('scripts/arkita-cli.mjs');
test('CLI validates and exports Unicode fresh paths with structured codes; invalid input and existing output are preserved', async t => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arkita-cli-')); t.after(() => fs.rm(root, { recursive: true, force: true })); const input = path.join(root, 'Модель Эльдара.arkita'), store = createStore(createProject('Модель'));
 await fs.writeFile(input, serializeProjectFile(store.snapshot)); const before = await fs.readFile(input);
 let result = await runCLI(['validate', '--input', input]); assert.equal(result.exitCode, 0); assert.equal(result.model.name, 'Модель');
 store.execute({ type: 'createView', name: 'Представление' }, store.revision); await fs.writeFile(input, serializeProjectFile(store.snapshot));
 const output = path.join(root, 'Экспорт'); result = await runCLI(['export-csv', '--input', input, '--output', output]); assert.equal(result.exitCode, 2); assert.ok(result.files.length); const files = await fs.readdir(output); const evidence = await Promise.all(files.map(name => fs.readFile(path.join(output, name))));
 assert.equal((await runCLI(['export-csv', '--input', input, '--output', output])).code, 'EEXIST'); assert.deepEqual(await Promise.all(files.map(name => fs.readFile(path.join(output, name)))), evidence);
 const bad = path.join(root, 'Ошибка.arkita'); await fs.writeFile(bad, 'bad'); const never = path.join(root, 'Не создавать'); assert.equal((await runCLI(['export-csv', '--input', bad, '--output', never])).exitCode, 1); await assert.rejects(fs.stat(never), { code: 'ENOENT' });
 const child = spawnSync(process.execPath, [cli, 'validate', '--input', bad], { encoding: 'utf8' }); assert.equal(child.status, 1); assert.equal(JSON.parse(child.stdout).status, 'error'); assert.equal(child.stderr, ''); assert.ok(before.length);
 const outside = path.join(root, 'Ссылка'); await fs.symlink(output, outside); assert.equal((await runCLI(['export-csv', '--input', input, '--output', path.join(outside, 'child')])).exitCode, 1);
});
test('installed Electron entry dispatches CLI without importing GUI or claiming single-instance lock', async () => {
 const child = spawnSync(process.execPath, ['--experimental-vm-modules', 'electron/test/helpers/cli-entry-harness.mjs'], { encoding: 'utf8' }); assert.equal(child.status, 0, child.stderr);
 const packaged = JSON.parse(await fs.readFile('package.json', 'utf8')); assert.equal(packaged.main, 'electron/entry.mjs'); assert.ok(packaged.build.files.includes('scripts/arkita-cli.mjs'));
});
