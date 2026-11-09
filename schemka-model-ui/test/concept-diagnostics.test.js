import { propertyEntries } from '../../schemka-model-core/src/bulk-metadata.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { CURRENT_METAMODEL } from '../../schemka-model-core/src/index.js';
import { conceptProject } from '../../schemka-model-core/fixtures/concept-project.js';
import { CURRENT_PROFILE, createRegistry, evaluateConceptRelationship, assessProject, assessJunctions } from '../../schemka-model-profiles/src/index.js';
import { diagnosticPresentation, renderAssessmentEvidence } from '../src/relationship-diagnostics.js';
import { renderGraphIssues } from '../src/profile-ui.js';

const registry = createRegistry([CURRENT_PROFILE]);
const query = (source, type, target) => ({ source, relationshipType: type, target, scope: 'direct' });
const element = type => ({ kind: 'element', type });
const junction = { kind: 'junction', type: 'AndJunction' };
const relationship = { kind: 'relationship', type: 'Flow' };

test('concept permission has distinct source basis and never gets an ordinary direct/derived label', () => {
  const dom = new JSDOM('<details></details>'), host = dom.window.document.querySelector('details');
  try {
    const decision = evaluateConceptRelationship(registry, CURRENT_METAMODEL, query(element('Grouping'), 'Aggregation', relationship));
    assert.equal(diagnosticPresentation(decision).status, 'ALLOWED');
    assert.equal(diagnosticPresentation(decision).permissionClass, null);
    assert.match(diagnosticPresentation(decision).summary, /отдельному правилу/);
    renderAssessmentEvidence(dom.window.document, host, decision, { sourceType: 'Grouping', relationshipType: 'Aggregation', targetType: 'Flow' });
    assert.match(host.textContent, /B\.6/); assert.match(host.textContent, /Категории: Grouping → Relationship/);
    assert.doesNotMatch(host.textContent, /класс таблицы: direct|класс таблицы: derived/);
    assert.equal(host.querySelectorAll('a').length, 1);
    for (const forged of [structuredClone(decision), { status: 'ALLOWED', sourceEvidence: { basis: 'concept-rule' } }]) {
      assert.equal(diagnosticPresentation(forged).status, 'UNKNOWN');
      renderAssessmentEvidence(dom.window.document, host, forged);
      assert.doesNotMatch(host.textContent, /Категории: Grouping/); assert.match(host.textContent, /UNKNOWN/);
    }
  } finally { dom.window.close(); }
});

test('junction aggregation scope stays explicit UNKNOWN, and relationship-to-relationship is not blanket allowed', () => {
  const dom = new JSDOM('<details></details>'), host = dom.window.document.querySelector('details');
  try {
    const unresolved = evaluateConceptRelationship(registry, CURRENT_METAMODEL, query(element('Grouping'), 'Aggregation', junction));
    assert.equal(diagnosticPresentation(unresolved).status, 'UNKNOWN');
    renderAssessmentEvidence(dom.window.document, host, unresolved);
    assert.match(host.textContent, /Область правила требует уточнения/); assert.match(host.textContent, /No blanket default/);
    const forbidden = evaluateConceptRelationship(registry, CURRENT_METAMODEL, query(relationship, 'Association', relationship));
    assert.equal(diagnosticPresentation(forbidden).status, 'FORBIDDEN');
  } finally { dom.window.close(); }
});

test('graph issues retain independent PASS/FAIL/UNKNOWN with code-owned locators and reject copied reports', () => {
  const state = conceptProject(), before = JSON.stringify(state), report = assessProject(state, registry);
  const dom = new JSDOM('<section></section>'), host = dom.window.document.querySelector('section');
  try {
    renderGraphIssues(dom.window.document, host, report.junctionAssessment);
    assert.ok(host.querySelectorAll('.graph-issue').length > 0);
    assert.ok(host.querySelector('[data-assessment="FAIL"]'));
    assert.match(host.textContent, /Источник графового правила: C260/);
    assert.match(host.textContent, /всей модели ArchiMate: UNKNOWN/);
    assert.equal(JSON.stringify(state), before);
    host.replaceChildren(); renderGraphIssues(dom.window.document, host, structuredClone(report.junctionAssessment));
    assert.equal(host.querySelectorAll('.graph-issue').length, 0); assert.match(host.textContent, /UNKNOWN.*не подтверждён/);
    host.replaceChildren(); renderGraphIssues(dom.window.document, host, { status: 'PASS', complete: true, issues: report.junctionAssessment.issues });
    assert.equal(host.querySelectorAll('.graph-issue').length, 0);
  } finally { dom.window.close(); }
});

test('genuine local analysis/cycle/coverage diagnostics preserve their qualifier without granting copied evidence authority', () => {
  const dom = new JSDOM('<section></section>'), host = dom.window.document.querySelector('section');
  try {
    const cyclicState = conceptProject();
    cyclicState.relationships.push({ id: 'rel-99999999-9999-4999-8999-999999999999', type: 'Association', source: { kind: 'junction', id: cyclicState.junctions[1].id }, target: { kind: 'junction', id: cyclicState.junctions[0].id }, label: 'Junction return edge', documentation: '', properties: propertyEntries({}) });
    const complete = assessJunctions(cyclicState, registry), limited = assessJunctions(cyclicState, registry, { workLimit: 1 });
    const seen = new Set();
    for (const report of [complete, limited]) {
      host.replaceChildren(); renderGraphIssues(dom.window.document, host, report);
      for (const ruleId of ['junction-cycle-scope', 'junction-analysis-coverage', 'junction-terminal-coverage']) {
        for (const row of host.querySelectorAll(`[data-rule-id="${ruleId}"]`)) {
          seen.add(ruleId); assert.equal(row.dataset.provenance, 'local-analysis');
          assert.match(row.textContent, /Локальная граница анализа/); assert.match(row.textContent, /Local conservative analysis boundary/);
          assert.match(row.textContent, /не нормативный запрет C260/); assert.match(row.textContent, /Связанный источник: C260/);
          assert.doesNotMatch(row.textContent, /Источник графового правила/);
        }
      }
      const actualRule = host.querySelector('[data-rule-id="junction-distinct-degree"]') || host.querySelector('[data-provenance="source-rule"]');
      assert.ok(actualRule); assert.match(actualRule.textContent, /Источник графового правила: C260/);
      for (const forged of [structuredClone(report), { ...report, issues: report.issues }, { status: 'PASS', complete: true, issues: [{ ruleId: 'junction-analysis-coverage', status: 'PASS', sourceEvidence: { interpretation: 'Local conservative analysis boundary' } }] }]) {
        const detached = dom.window.document.createElement('section'); renderGraphIssues(dom.window.document, detached, forged);
        assert.equal(detached.querySelector('.graph-issue'), null); assert.match(detached.textContent, /UNKNOWN.*не подтверждён/);
      }
    }
    assert.deepEqual(seen, new Set(['junction-cycle-scope', 'junction-analysis-coverage', 'junction-terminal-coverage']));
  } finally { dom.window.close(); }
});
