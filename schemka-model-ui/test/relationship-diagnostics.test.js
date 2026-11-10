import { propertyEntries } from '../../schemka-model-core/src/bulk-metadata.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { CURRENT_METAMODEL, CURRENT_CATALOG, createProject } from '../../schemka-model-core/src/index.js';
import { fixtureId } from '../../schemka-model-core/fixtures/relationship-project.js';
import { CURRENT_PROFILE, createRegistry, evaluateRelationship, assessProject, getVerifiedRelationshipDecision, getVerifiedRelationshipCoverage } from '../../schemka-model-profiles/src/index.js';
import { diagnosticPresentation, assessmentMessage, renderAssessmentEvidence } from '../src/relationship-diagnostics.js';
import { expectedEndpointDecision, verifiedElementTypes, verifiedRelationshipTypes, excludedElementTypes } from './endpoint-oracle.js';

const SOURCE_URL = 'https://publications.opengroup.org/standards/archimate/c260';
const ledger = JSON.parse(readFileSync(new URL('../../docs/ENDPOINT-RULES.json', import.meta.url), 'utf8'));
const registry = createRegistry([CURRENT_PROFILE]);
const coverage = getVerifiedRelationshipCoverage(registry, CURRENT_METAMODEL);
const cells = new Map(ledger.cells.map(cell => [JSON.stringify([cell.source, cell.target]), cell]));
const families = new Map(ledger.relationship_families.flatMap(family => family.relationship_ids.map(id => [id, family])));
const query = (sourceType = 'ApplicationComponent', relationshipType = 'Access', targetType = 'DataObject') => ({ sourceType, relationshipType, targetType, scope: 'direct' });
const evaluate = (q = query(), r = registry, reference = CURRENT_METAMODEL) => evaluateRelationship(r, reference, q);
const cases = CURRENT_CATALOG.elementTypes.flatMap(sourceType => CURRENT_CATALOG.elementTypes.flatMap(targetType =>
  verifiedRelationshipTypes.map(relationshipType => ({
    ...query(sourceType, relationshipType, targetType),
    expected: expectedEndpointDecision(sourceType, relationshipType, targetType),
    cell: cells.get(JSON.stringify([sourceType, targetType])),
  }))));
const checkedCases = cases.filter(item => item.cell);
const countsOf = items => items.reduce((counts, item) => {
  counts[item.expected.permissionClass ?? item.expected.status]++;
  return counts;
}, { direct: 0, derived: 0, FORBIDDEN: 0, UNKNOWN: 0 });
const summaries = {
  direct: 'ALLOWED · Допустимое сочетание типов концов · прямое разрешение.',
  derived: 'ALLOWED · Допустимо как производная связь. Можно изобразить напрямую.',
  FORBIDDEN: 'FORBIDDEN · Это сочетание типов концов недопустимо для выбранного типа отношения.',
  UNKNOWN: 'UNKNOWN · Сочетание типов концов пока не проверено.',
  unresolved: 'UNKNOWN · Область правила для этого сочетания требует уточнения.',
};
const expectedPresentation = ({ status, permissionClass, reason }) => ({
  status, permissionClass, summary: summaries[reason === 'source-scope-unresolved' ? 'unresolved' : status === 'ALLOWED' ? permissionClass : status],
});
const unknown = result => {
  assert.deepEqual(diagnosticPresentation(result), expectedPresentation({ status: 'UNKNOWN', permissionClass: null }));
  assert.equal(assessmentMessage(result), `${summaries.UNKNOWN} Нормативная оценка: UNKNOWN.`);
};
const caseQuery = item => query(item.sourceType, item.relationshipType, item.targetType);
const sample = kind => cases.find(item => kind === 'FORBIDDEN' ? item.expected.status === kind : item.expected.permissionClass === kind);
const genuine = kind => evaluate(caseQuery(sample(kind)));
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function domFixture(markup = '<details></details>') {
  const dom = new JSDOM(markup);
  const document = dom.window.document, host = document.querySelector('details');
  return { dom, document, host, render(result, context, snapshot = coverage) { renderAssessmentEvidence(document, host, result, context, snapshot); } };
}
function project(items = cases.slice(0, 512)) {
  const state = createProject('Endpoint formatter independent oracle');
  state.elements = CURRENT_CATALOG.elementTypes.map((type, index) => ({
    id: fixtureId('el', index + 1), type, name: type, documentation: '<inert>', properties: propertyEntries({}),
  }));
  const ids = new Map(state.elements.map(item => [item.type, item.id]));
  state.relationships = items.map((item, index) => ({
    id: fixtureId('rel', index + 1), type: item.relationshipType,
    source: { kind: 'element', id: ids.get(item.sourceType) }, target: { kind: 'element', id: ids.get(item.targetType) },
    label: '<inert> 😀', documentation: '', properties: propertyEntries({}),
  }));
  state.views = [];
  return state;
}

test('all 26,460 catalogue triples match the independent ledger, with normative UNKNOWN', () => {
  assert.equal(ledger.schema, 'schemka-endpoint-rule-facts@1');
  assert.equal(ledger.comparison_gate.result, 'PASS');
  assert.deepEqual(ledger.matrix_orientation, { source: 'column', target: 'row' });
  assert.equal(ledger.cells.length, 1764);
  assert.equal(cells.size, 1764);
  assert.deepEqual(new Set(cells.keys()),
    new Set(verifiedElementTypes.flatMap(source => verifiedElementTypes.map(target => JSON.stringify([source, target])))));
  assert.equal(verifiedElementTypes.length, 42);
  assert.deepEqual(excludedElementTypes, []);
  assert.deepEqual(new Set([...verifiedElementTypes, ...excludedElementTypes]), new Set(CURRENT_CATALOG.elementTypes));
  assert.equal(verifiedRelationshipTypes.length, 15);
  assert.deepEqual(new Set(verifiedRelationshipTypes), new Set(CURRENT_CATALOG.relationshipTypes));
  for (const item of cases) {
    const result = evaluate(caseQuery(item));
    const expected = expectedPresentation(item.expected);
    assert.deepEqual(diagnosticPresentation(result), expected, JSON.stringify(caseQuery(item)));
    assert.equal(assessmentMessage(result), `${expected.summary} Нормативная оценка: UNKNOWN.`);
  }
  assert.equal(cases.length, 26460);
  assert.equal(checkedCases.length, 26460);
  assert.deepEqual(countsOf(cases), { direct: 4443, derived: 2935, FORBIDDEN: 19074, UNKNOWN: 8 });
});

test('all 735 previous seven-type cases retain their independent source facts and classifications', () => {
  const previous = JSON.parse(readFileSync(new URL('../../schemka-model-profiles/test/fixtures/seven-type-endpoint-cells.json', import.meta.url), 'utf8'));
  const previousTypes = ['ApplicationComponent', 'ApplicationInterface', 'DataObject', 'Service', 'Process', 'Function', 'Event'];
  const previousCases = cases.filter(item => previousTypes.includes(item.sourceType) && previousTypes.includes(item.targetType));
  assert.equal(previous.cells.length, 49);
  for (const oldCell of previous.cells) {
    const current = cells.get(JSON.stringify([oldCell.source, oldCell.target]));
    for (const key of ['source', 'target', 'letters', 'printed_page', 'pdf_page']) assert.equal(current[key], oldCell[key]);
  }
  for (const item of previousCases) assert.deepEqual(diagnosticPresentation(evaluate(caseQuery(item))), expectedPresentation(item.expected));
  assert.equal(previousCases.length, 735);
  assert.deepEqual(countsOf(previousCases), { direct: 171, derived: 98, FORBIDDEN: 466, UNKNOWN: 0 });
});

test('authentic assessment rows cover every catalogue triple in bounded 512-edge projects', () => {
  const totals = { ALLOWED: 0, FORBIDDEN: 0, UNKNOWN: 0 };
  let direct = 0, derived = 0, inspected = 0, batchCount = 0;
  const claims = { status: 'ALLOWED', permissionClass: 'direct', reason: 'verified-table-direct', sourceEvidence: JSON.stringify(genuine('direct').sourceEvidence) };
  for (let offset = 0; offset < cases.length; offset += 512) {
    const batch = cases.slice(offset, offset + 512), state = project(batch);
    assert.ok(state.relationships.length <= 512);
    state.project.name = JSON.stringify(claims);
    for (const element of state.elements) { element.name = 'FORBIDDEN'; element.documentation = JSON.stringify(claims); element.properties = propertyEntries({ ...claims }); }
    for (const relationship of state.relationships) { relationship.label = 'ALLOWED'; relationship.properties = propertyEntries({ ...claims }); }
    const before = structuredClone(state), report = assessProject(state, registry);
    assert.equal(report.relationships.length, batch.length);
    for (const [index, row] of report.relationships.entries()) {
      assert.deepEqual(diagnosticPresentation(row), expectedPresentation(batch[index].expected));
      assert.equal(Boolean(getVerifiedRelationshipDecision(row)), Boolean(batch[index].cell));
      unknown({ ...row }); unknown(structuredClone(row));
      unknown(JSON.parse(JSON.stringify(row))); unknown(Object.create(row));
      inspected++;
    }
    for (const status of Object.keys(totals)) totals[status] += report.counts[status];
    direct += report.verifiedDirect; derived += report.verifiedDerived; batchCount++;
    assert.equal(report.normative.status, 'UNKNOWN');
    assert.deepEqual(state, before);
  }
  assert.equal(batchCount, 52); assert.equal(inspected, 26460);
  assert.deepEqual(totals, { ALLOWED: 7378, FORBIDDEN: 19074, UNKNOWN: 8 });
  assert.equal(direct, 4443); assert.equal(derived, 2935);
});

test('all out-of-bound element endpoints and unsupported queries stay UNKNOWN', () => {
  for (const type of CURRENT_CATALOG.elementTypes.filter(type => !verifiedElementTypes.includes(type))) {
    for (const relationshipType of verifiedRelationshipTypes) {
      unknown(evaluate(query(type, relationshipType, 'Service')));
      unknown(evaluate(query('Service', relationshipType, type)));
    }
  }
  for (const result of [null, undefined, false, 1, 'ALLOWED', Symbol('ALLOWED'), [], {}, () => {},
    evaluate({ ...query(), scope: 'derived' }), evaluate(query(), createRegistry([])),
    evaluate(query('Missing')), evaluate(query('Service', 'Missing', 'Process')), evaluate(null)]) unknown(result);
});

test('copies, forged results, inherited fields and matching evidence cannot transfer decision authority', () => {
  for (const kind of ['direct', 'derived', 'FORBIDDEN']) {
    const original = genuine(kind);
    for (const copy of [structuredClone(original), JSON.parse(JSON.stringify(original)), { ...original },
      Object.create(original), Object.create(null, Object.getOwnPropertyDescriptors(original)),
      { ...original, ruleId: 'synthetic-test-fixture' },
      { status: original.status, permissionClass: original.permissionClass, reason: original.reason, sourceEvidence: original.sourceEvidence }]) unknown(copy);
    for (const status of ['ALLOWED', 'FORBIDDEN', 'UNKNOWN']) for (const permissionClass of ['direct', 'derived', null]) {
      unknown({ ...original, status, permissionClass });
    }
    const alteredEvidence = structuredClone(original);
    alteredEvidence.sourceEvidence.matrix.printedPage = 1;
    alteredEvidence.sourceEvidence.url = 'javascript:alert(1)';
    unknown(alteredEvidence);
  }
  const copyRegistry = createRegistry([structuredClone(CURRENT_PROFILE)]);
  unknown(evaluate(query(), copyRegistry));
  for (const status of ['ALLOWED', 'FORBIDDEN']) {
    const local = structuredClone(CURRENT_PROFILE);
    local.metadata.status = 'local';
    local.rules = [{ id: 'explicit-local-fixture', ...query(), status, evidence: 'local' }];
    const localResult = evaluate(query(), createRegistry([local]));
    assert.equal(localResult.status, status); assert.equal(localResult.reason, 'explicit-local-rule');
    unknown(localResult);
    unknown({ ...localResult, sourceEvidence: genuine('derived').sourceEvidence });
  }
});

test('untrusted result getters and Proxy traps are never executed during formatting or evidence rendering', () => {
  let reads = 0;
  const original = genuine('direct'), accessor = {};
  for (const key of ['status', 'permissionClass', 'reason', 'ruleId', 'sourceEvidence']) {
    Object.defineProperty(accessor, key, { enumerable: true, get() { reads++; throw new Error('Do not inspect'); } });
  }
  const traps = Object.fromEntries(['get', 'getOwnPropertyDescriptor', 'ownKeys', 'getPrototypeOf', 'has'].map(name => [name, () => {
    reads++; throw new Error(`Do not invoke ${name}`);
  }]));
  const revoked = Proxy.revocable(original, {}); revoked.revoke();
  const h = domFixture();
  try {
    for (const result of [accessor, new Proxy({}, traps), new Proxy(original, traps), new Proxy(() => {}, traps), revoked.proxy]) {
      unknown(result); h.render(result);
      assert.ok(h.host.textContent.includes(summaries.UNKNOWN));
      assert.match(h.host.textContent, /нет подтверждённой проверки/);
      assert.doesNotMatch(h.host.textContent, /Проверенная ячейка|Матрица B\.5/);
    }
    assert.equal(reads, 0);
  } finally { h.dom.window.close(); }
});

// Keep exhaustive classification checks pure. Native DOM rendering uses the
// first deterministic case for each page/family/class plus every identifier's
// available classes, and the exact reverse endpoint direction of each case.
function representativeCases() {
  const representatives = new Map(), dimensions = new Set();
  const byTriple = new Map(checkedCases.map(item => [JSON.stringify(caseQuery(item)), item]));
  const add = item => representatives.set(JSON.stringify(caseQuery(item)), item);
  for (const item of checkedCases) {
    const kind = item.expected.permissionClass ?? item.expected.status;
    const keys = [`${item.cell.printed_page}/${families.get(item.relationshipType).letter}/${kind}`, `${item.relationshipType}/${kind}`];
    if (keys.some(key => !dimensions.has(key))) add(item);
    for (const key of keys) dimensions.add(key);
  }
  for (const item of [...representatives.values()]) add(byTriple.get(JSON.stringify(query(item.targetType, item.relationshipType, item.sourceType))));
  return [...representatives.values()];
}

test('bounded DOM representatives cover every page, family, class, identifier and reverse direction', () => {
  const representatives = representativeCases();
  assert.ok(representatives.length < 512, `DOM sample must remain bounded: ${representatives.length}`);
  const dimension = item => `${item.cell.printed_page}/${families.get(item.relationshipType).letter}/${item.expected.permissionClass ?? item.expected.status}`;
  assert.deepEqual(new Set(representatives.map(dimension)), new Set(checkedCases.map(dimension)));
  assert.deepEqual(new Set(representatives.map(item => item.cell.printed_page)), new Set([140, 141, 142, 143, 144, 145]));
  assert.deepEqual(new Set(representatives.map(item => item.relationshipType)), new Set(verifiedRelationshipTypes));
  const selected = new Set(representatives.map(item => JSON.stringify(caseQuery(item))));
  for (const item of representatives) assert.ok(selected.has(JSON.stringify(query(item.targetType, item.relationshipType, item.sourceType))));
  const h = domFixture();
  try {
    for (const item of representatives) {
      const result = evaluate(caseQuery(item));
      h.render(result, caseQuery(item));
      const text = h.host.textContent, evidence = getVerifiedRelationshipDecision(result).sourceEvidence;
      assert.ok(text.includes(expectedPresentation(item.expected).summary));
      assert.ok(text.includes(`Матрица B.5: стр. ${item.cell.printed_page} (PDF ${item.cell.pdf_page})`));
      assert.match(text, /легенда: стр\. 139 \(PDF 157\)/);
      assert.ok(text.includes(`столбец (источник) ${item.sourceType}; строка (цель) ${item.targetType}`));
      assert.ok(text.includes(`Отношение: ${item.relationshipType}; обозначения ячейки: ${item.cell.letters || 'нет'}`));
      const family = families.get(item.relationshipType);
      const matched = item.expected.permissionClass === 'direct' ? family.letter.toUpperCase()
        : item.expected.permissionClass === 'derived' ? family.letter.toLowerCase() : null;
      assert.ok(text.includes(`код семейства: ${family.letter}; найденное обозначение: ${matched ?? 'нет'}; `
        + `класс таблицы: ${item.expected.permissionClass ?? 'not-listed'}`));
      if (item.expected.permissionClass === 'derived') {
        assert.match(text, /Правило derived: § 5\.8, стр\. 49–50 \(PDF 67–68\)/);
        assert.match(text, /derived допускает прямое проведение отношения без промежуточной цепочки/);
        assert.match(text, /это не классификация direct/);
      } else assert.doesNotMatch(text, /Правило derived|Класс derived/);
      assert.equal(evidence.cell.sourceType, item.sourceType);
      assert.equal(evidence.cell.targetType, item.targetType);
      assert.match(text, /Подтверждённо запрещённое новое отношение создать нельзя/);
      assert.match(text, /Нормативная оценка всей модели: UNKNOWN/);
      assert.equal(h.host.querySelectorAll('a').length, 1);
      assert.equal(h.host.querySelector('a').href, SOURCE_URL);
    }
    for (const q of [query('Unsupported'), { ...query(), scope: 'nesting' }]) {
      h.render(evaluate(q), q);
      assert.match(h.host.textContent, /нет подтверждённой проверки/);
      assert.doesNotMatch(h.host.textContent, /Проверенная ячейка|Матрица B\.5/);
      assert.match(h.host.textContent, /1764 упорядоченных сочетаний/);
      assert.match(h.host.textContent, /42 типов-источников, 42 типов-целей/);
      assert.match(h.host.textContent, /15 обозначений отношений: просмотрены 26460 из 26460; определено 26452 решений; 8 остаются UNKNOWN/);
      assert.match(h.host.querySelector('.assessment-coverage').textContent, /Охвачены все типы элементов текущего каталога/);
      assert.match(h.host.textContent, /Неподдерживаемые запросы остаются UNKNOWN/);
      assert.match(h.host.textContent, /Состав групп, экземпляры и вложенность не проверяются/);
    }
  } finally { h.dom.window.close(); }
});

test('coverage is an immutable core snapshot authorized only by the original current profile', () => {
  assert.ok(coverage);
  assert.deepEqual(new Set(coverage.sourceTypeIds), new Set(verifiedElementTypes));
  assert.deepEqual(new Set(coverage.targetTypeIds), new Set(verifiedElementTypes));
  assert.deepEqual(new Set(coverage.relationshipTypeIds), new Set(verifiedRelationshipTypes));
  assert.deepEqual(new Set(coverage.excludedTypeIds), new Set(excludedElementTypes));
  assert.equal(coverage.verifiedPairCount, cells.size);
  assert.equal(coverage.reviewedTripleCount, checkedCases.length);
  assert.equal(coverage.verifiedTripleCount, checkedCases.filter(item => item.expected.status !== 'UNKNOWN').length);
  assert.equal(coverage.sourceUnresolvedTripleCount, 8);
  assert.equal(coverage.unknownTripleCount, 8);
  assert.equal(coverage.totalTripleCount, cases.length);
  assert.ok(Object.isFrozen(coverage));
  for (const key of ['sourceTypeIds', 'targetTypeIds', 'relationshipTypeIds', 'excludedTypeIds']) {
    assert.ok(Object.isFrozen(coverage[key]));
    assert.throws(() => coverage[key].push('Forged'), TypeError);
  }
  assert.throws(() => { coverage.verifiedPairCount = 1; }, TypeError);
  const before = structuredClone(coverage), h = domFixture();
  try {
    const references = [
      [createRegistry([structuredClone(CURRENT_PROFILE)]), CURRENT_METAMODEL],
      [createRegistry([]), CURRENT_METAMODEL],
      [registry, { ...CURRENT_METAMODEL, version: 'unverified-version' }],
    ];
    for (const [r, reference] of references) {
      const snapshot = getVerifiedRelationshipCoverage(r, reference);
      assert.equal(snapshot, null);
      h.render(evaluate(query(), r, reference), query(), snapshot);
      assert.match(h.host.textContent, /Покрытие проверки не подтверждено для выбранного профиля/);
      assert.doesNotMatch(h.host.textContent, /1764|26460|Проверены 49|42 типов|Grouping, Location/);
      assert.ok(h.host.textContent.includes(summaries.UNKNOWN));
    }
    // Omitting the fifth argument must never advertise the current profile.
    renderAssessmentEvidence(h.document, h.host, genuine('direct'));
    assert.match(h.host.textContent, /Покрытие проверки не подтверждено/);
    assert.doesNotMatch(h.host.textContent, /1764|26460|Проверены 49/);
    h.render(genuine('direct'), query());
    assert.deepEqual(coverage, before);
  } finally { h.dom.window.close(); }
});

test('variant and composition locators appear only for their verified relationship families', () => {
  const locators = new Map([
    ...['Access', 'ReadAccess', 'WriteAccess', 'ReadWriteAccess'].map(id => [id, 'Семейство Access: § 5.2.2, стр. 38 (PDF 56).']),
    ...['Association', 'DirectedAssociation'].map(id => [id, 'Семейство Association: § 5.2.4, стр. 40 (PDF 58).']),
    ['Composition', 'Семейство Composition: § 5.1.2, стр. 31 (PDF 49).'],
  ]);
  const h = domFixture();
  try {
    for (const relationshipType of verifiedRelationshipTypes) {
      const result = evaluate(query('Service', relationshipType, 'Process'));
      h.render(result, query('DataObject', 'ReadAccess', 'ApplicationInterface'));
      const text = h.host.textContent;
      if (locators.has(relationshipType)) assert.ok(text.includes(locators.get(relationshipType)));
      else assert.doesNotMatch(text, /Семейство (Access|Association|Composition):/);
      assert.ok(text.includes(`Отношение: ${relationshipType};`));
      assert.match(text, /столбец \(источник\) Service; строка \(цель\) Process/);
      assert.match(text, /Матрица B\.5: стр\. 142 \(PDF 160\)/);
    }
    for (const q of [query('Service', 'Realization', 'Process'), query('Process', 'Realization', 'Function')]) {
      h.render(evaluate(q));
      assert.ok(h.host.textContent.includes(summaries.FORBIDDEN));
      assert.doesNotMatch(h.host.textContent, /Access-варианта/);
    }
  } finally { h.dom.window.close(); }
});

test('hostile context and forged URLs stay inert and cannot supply classification or cell provenance', () => {
  const h = domFixture(), original = genuine('direct');
  const payload = '<img src=x onerror="alert(1)">';
  const context = {
    sourceType: payload, relationshipType: 'javascript:alert(1)', targetType: '<script>alert(1)</script>',
    sourceEvidence: original.sourceEvidence, status: 'FORBIDDEN', permissionClass: 'derived',
    href: 'javascript:alert(1)', url: 'https://untrusted.example', metadata: { source: 'https://untrusted.example' },
  };
  try {
    for (const result of [null, { ...original, url: 'javascript:alert(1)' },
      { ...original, sourceEvidence: { ...original.sourceEvidence, href: 'javascript:alert(1)' } }, original]) {
      h.render(result, context);
      assert.ok(h.host.textContent.includes(payload));
      assert.ok(h.host.textContent.includes('<script>alert(1)</script>'));
      assert.ok(h.host.textContent.includes(result === original ? summaries.direct : summaries.UNKNOWN));
      assert.equal(h.host.querySelectorAll('img, script, iframe, [onerror], [onclick], button, input, select, textarea').length, 0);
      assert.deepEqual([...h.host.querySelectorAll('[href]')].map(node => node.getAttribute('href')), [SOURCE_URL]);
    }
    let reads = 0;
    h.render(null, { sourceType: '😀'.repeat(1000), get targetType() { reads++; throw new Error('Do not invoke'); },
      relationshipType: { toString() { reads++; throw new Error('Do not coerce'); } } });
    assert.ok(h.host.textContent.includes(`${'😀'.repeat(120)}… → не указан → не указан`));
    assert.ok(h.host.textContent.length < 1600); assert.equal(reads, 0);
    h.render(null, new Proxy({}, { getOwnPropertyDescriptor() { throw new Error('No labels'); } }));
    assert.match(h.host.textContent, /не указан → не указан → не указан/);
  } finally { h.dom.window.close(); }
});

test('rerender preserves native details open state, summary identity, keyboard focus and listeners', () => {
  const h = domFixture('<details><summary tabindex="0">Old summary</summary><p>Stale evidence</p></details>');
  try {
    const summary = h.host.querySelector('summary'); let clicks = 0;
    summary.addEventListener('click', () => { clicks++; });
    summary.focus(); assert.equal(h.document.activeElement, summary);
    for (const open of [false, true, true, false]) for (const result of [genuine('direct'), genuine('derived'), genuine('FORBIDDEN'), null]) {
      h.host.open = open; h.render(result);
      assert.equal(h.host.open, open);
      assert.equal(h.host.querySelector('summary'), summary);
      assert.equal(h.document.activeElement, summary);
      assert.equal(summary.textContent, 'Основание и границы проверки');
      assert.equal(h.host.querySelectorAll('summary').length, 1);
      assert.equal(h.host.querySelectorAll('.assessment-evidence-content').length, 1);
      assert.equal(h.host.querySelectorAll('.assessment-coverage').length, 1);
      assert.equal(h.host.querySelectorAll('a').length, 1);
      assert.doesNotMatch(h.host.textContent, /Stale evidence/);
    }
    summary.click(); assert.equal(clicks, 1); assert.equal(h.host.open, true);
    h.render(genuine('direct')); assert.equal(h.host.open, true);
  } finally { h.dom.window.close(); }
});

test('presentation and repeated rendering never mutate trusted frozen decisions, report rows or model context', () => {
  const h = domFixture();
  try {
    const rows = assessProject(project(), registry).relationships;
    for (const result of [genuine('direct'), genuine('derived'), genuine('FORBIDDEN'), rows[0], rows.at(-1)]) {
      const context = freeze({ ...query(), properties: propertyEntries({ sourceEvidence: result.sourceEvidence, url: 'https://untrusted.example', diagnostic: 'preserve' }) });
      const beforeResult = structuredClone(result), beforeContext = structuredClone(context);
      for (let i = 0; i < 3; i++) { diagnosticPresentation(result); assessmentMessage(result); h.render(result, context); }
      assert.deepEqual(result, beforeResult); assert.deepEqual(context, beforeContext);
      assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.sourceEvidence));
      assert.ok(Object.isFrozen(result.sourceEvidence.cell)); assert.ok(Object.isFrozen(result.sourceEvidence.matrix));
    }
  } finally { h.dom.window.close(); }
});


test('all eight source-qualified UNKNOWN cases render authentic scoped evidence and reject copied or forged ambiguity', () => {
  const h = domFixture();
  try {
    const selected = cases.filter(item => item.expected.reason === 'source-scope-unresolved');
    assert.equal(selected.length, 8);
    for (const item of selected) {
      const result = evaluate(caseQuery(item));
      assert.equal(getVerifiedRelationshipDecision(result), result);
      h.render(result, caseQuery(item));
      assert.ok(h.host.textContent.includes(summaries.unresolved));
      assert.doesNotMatch(h.host.textContent, /пока не проверено|нет подтверждённой проверки/);
      assert.match(h.host.textContent, /Ячейка B\.5 проверена: G\/g отсутствует/);
      assert.match(h.host.textContent, /§ 12\.4, стр\. 104 \(PDF 122\)/);
      assert.match(h.host.textContent, /§ B\.4, стр\. 139 \(PDF 157\)/);
      assert.match(h.host.textContent, /найденное обозначение: нет; класс таблицы: not-listed/);
      assert.match(h.host.textContent, /не утверждение о противоречии стандарта/);
      assert.match(h.host.textContent, /официальное уточнение, применимое erratum или проверенная новая редакция спецификации/);
      assert.match(h.host.textContent, /Затем нужны независимая проверка и запись публикации/);
      assert.doesNotMatch(h.host.textContent, /или независимо проверенное толкование/);
      assert.match(h.host.textContent, /Нормативная оценка всей модели: UNKNOWN/);
      assert.match(h.host.textContent, /определено 26452 решений; 8 остаются UNKNOWN/);
      for (const fake of [{ ...result }, structuredClone(result), JSON.parse(JSON.stringify(result)), Object.create(result),
        { status: 'UNKNOWN', reason: 'source-scope-unresolved', sourceEvidence: result.sourceEvidence }]) {
        unknown(fake); h.render(fake, caseQuery(item));
        assert.match(h.host.textContent, /нет подтверждённой проверки/);
        assert.doesNotMatch(h.host.textContent, /Ячейка B\.5 проверена|§ 12\.4|Область правила для этого сочетания/);
      }
    }
  } finally { h.dom.window.close(); }
});
