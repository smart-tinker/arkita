import test from 'node:test';
import assert from 'node:assert/strict';
import { archiReportFiles } from '../src/archi-report.js';
import { parseCSV } from '../src/csv.js';

test('Archi reports contain every diagnostic and mapping as inert quoted UTF-8 spreadsheet text', () => {
 const mappings = Array.from({ length: 5016 }, (_, index) => ({ sourceModelId: '=SOURCE()', sourceId: `source-${index}`, sourceType: 'ApplicationService', sourceVersion: '5.0.0', sourceDomain: 'Application', targetId: `target-${index}`, targetType: 'Service', kind: 'element', name: 'Имя, "кавычки"\nСтрока' }));
 const diagnostics = { errors: [{ sourceId: '=1+1', code: 'UNMAPPED', message: '@danger\r\n"quoted"', affectedViews: [{ id: 'view-a', name: 'Первый' }, { id: 'view-b', name: 'Второй' }] }], transformations: [{ sourceId: 'source', message: 'Превращение' }], losses: [{ sourceId: 'source', message: 'Потеря' }] };
 const before = structuredClone({ mappings, diagnostics }), files = archiReportFiles(before);
 assert.deepEqual(before, { mappings, diagnostics }); assert.equal(files.length, 2);
 const problems = parseCSV(files[0].bytes), ids = parseCSV(files[1].bytes);
 assert.equal(problems.length, 4); assert.equal(ids.length, 5017);
 assert.equal(problems[1].values[2], "'=1+1"); assert.equal(problems[1].values[7], "'@danger\r\n\"quoted\"");
 assert.equal(problems[1].values[4], "'view-a\nview-b"); assert.equal(problems[1].values[5], "'Первый\nВторой");
 assert.equal(ids.at(-1).values[1], "'source-5015"); assert.equal(ids[1].values[0], "'=SOURCE()");
 assert.ok(ids[1].values.includes("'Имя, \"кавычки\"\nСтрока"));
});
