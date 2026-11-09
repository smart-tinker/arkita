'use strict';

// These tests parse with the exact vendored Mermaid Tiny bytes. jsdom supplies
// its DOM dependency; no browser, SVG layout, renderer, or network is involved.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');
const edit = require('../src/object-edit.js');
const move = require('../src/group-move.js');
const objectSemantics = require('../src/object-semantics.js');
const groupSemantics = require('../src/group-semantics.js');

const dom = new JSDOM('', {runScripts: 'outside-only', url: 'https://schemka.invalid/'});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../vendor/mermaid.tiny.js'), 'utf8'), dom.getInternalVMContext(), {filename: 'mermaid.tiny.js'});
const engine = dom.window.mermaid;
test.after(() => dom.window.close());

// Entirely synthetic example. It exercises different shapes, nested scopes,
// classes, object and link styles, captions and accessibility metadata.
const SOURCE = 'flowchart LR\n' +
  'accTitle: Example system\naccDescr: Synthetic regression fixture\n' +
  'subgraph apps["Applications"]\n direction TB\n client(["Client"])\n' +
  ' subgraph service["Service"]\n  api("API"):::accent\n  queue["Queue"]\n end\nend\n' +
  'subgraph data["Data"]\n db[("Database")]\n worker{"Ready?"}\nend\n' +
  'client -->|request| api\napi --> db\nqueue -.-> worker\n' +
  'classDef accent fill:#edf5ff,stroke:#0866ff\nclass db accent\n' +
  'style client stroke-width:3px\nstyle apps fill:#fafafa\n' +
  'linkStyle 1 stroke:#a33,stroke-width:2px\nlinkStyle default color:#222\n';

async function capture(source) {
  engine.mermaidAPI.reset();
  engine.initialize({
    startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true,
    maxTextSize: 5 * 1024 * 1024, maxEdges: 10000, layout: 'dagre', look: 'classic',
    htmlLabels: true, flowchart: {htmlLabels: true, useMaxWidth: false, defaultRenderer: 'dagre-wrapper'},
    secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges', 'suppressErrorRendering', 'htmlLabels', 'theme']
  });
  const diagram = await engine.mermaidAPI.getDiagramFromText(source);
  assert.match(diagram.type, /^flowchart/);
  return objectSemantics.capture(diagram);
}

function accepted(result) {
  assert.equal(result.ok, true, result.diagnostics.join('\n'));
  assert.deepEqual(result.diagnostics, []);
}

function denied(result) {
  assert.equal(result.ok, false, 'the guard must reject an unrelated semantic mutation');
  assert.ok(result.diagnostics.length);
}

function planned(plan) {
  assert.equal(plan.ok, true, JSON.stringify(plan.diagnostics));
  assert.equal(plan.requiresSemanticValidation, true);
  return plan;
}

const clone = value => structuredClone(value);
const node = (snapshot, id) => snapshot.nodes.find(([key]) => key === id)[1];
const group = (snapshot, id) => snapshot.groups.find(([key]) => key === id)[1];
let baseline;
test.before(async () => { baseline = await capture(SOURCE); });

test('real Tiny snapshot retains exact synthetic IDs, captions, shapes, nesting and styles', () => {
  assert.deepEqual(baseline.nodes.map(([id, value]) => [id, value.text, value.type]), [
    ['api', 'API', 'round'], ['client', 'Client', 'stadium'], ['db', 'Database', 'cylinder'],
    ['queue', 'Queue', 'square'], ['worker', 'Ready?', 'diamond']
  ]);
  assert.deepEqual({...baseline.parents}, {client: 'apps', api: 'service', queue: 'service', db: 'data', worker: 'data'});
  assert.deepEqual({...baseline.groupParents}, {service: 'apps', apps: null, data: null});
  assert.deepEqual(Array.from(baseline.edges, e => [e.id, e.start, e.end, e.text]), [
    ['L_client_api_0', 'client', 'api', 'request'], ['L_api_db_0', 'api', 'db', ''], ['L_queue_worker_0', 'queue', 'worker', '']
  ]);
  assert.deepEqual(Array.from(baseline.edges[1].style), ['stroke:#a33', 'stroke-width:2px', 'fill:none']);
  assert.deepEqual(Array.from(baseline.edgeDefaults.defaultStyle), ['color:#222']);
  assert.deepEqual(Array.from(baseline.groupVertices[0][1].styles), ['fill:#fafafa']);
  assert.equal(baseline.accessibility.title, 'Example system');
});

for (const [kind, target, caption] of [
  ['node', {kind: 'node', id: 'api'}, 'Новый API'],
  ['edge', {kind: 'edge', index: 0}, 'Запрос'],
  ['group', {kind: 'group', id: 'service'}, 'Новый сервис']
]) {
  test('real Tiny accepts ' + kind + ' caption edit while preserving all other semantics', async () => {
    const plan = planned(edit.planRename(SOURCE, target, caption));
    const after = await capture(plan.source);
    accepted(objectSemantics.validate(baseline, after, plan));
    assert.deepEqual(after.nodes.map(([id]) => id), baseline.nodes.map(([id]) => id));
    assert.deepEqual(after.edges.map(e => e.id), baseline.edges.map(e => e.id));
  });
}

test('special captions are decoded exactly once by the real Tiny semantic check', async () => {
  const captions = ['  a & "x" | [y] #59; 🚀\nnext  ', '#quot;', '<b>literal text</b>'];
  for (const target of [{kind: 'node', id: 'api'}, {kind: 'edge', index: 0}, {kind: 'group', id: 'service'}]) {
    for (const caption of captions) {
      const plan = planned(edit.planRename(SOURCE, target, caption));
      accepted(objectSemantics.validate(baseline, await capture(plan.source), plan));
    }
  }
});

test('real Tiny validates edge caption clearing', async () => {
  const plan = planned(edit.planRename(SOURCE, {kind: 'edge', index: 0}, ''));
  const after = await capture(plan.source);
  accepted(objectSemantics.validate(baseline, after, plan));
  assert.equal(after.edges[0].text, '');
});

test('real Tiny validates BOM and CRLF source without changing unaffected text', async () => {
  const source = '\uFEFF' + SOURCE.replaceAll('\n', '\r\n');
  const before = await capture(source);
  const plan = planned(edit.planRename(source, {kind: 'node', id: 'api'}, 'New API'));
  assert.equal(plan.source, source.replace('api("API")', 'api("New API")'));
  accepted(objectSemantics.validate(before, await capture(plan.source), plan));
});

for (const [name, target] of [
  ['node and its incident edges', {kind: 'node', id: 'api'}],
  ['styled edge', {kind: 'edge', index: 1}],
  ['nested group', {kind: 'group', id: 'service'}],
  ['outer styled group', {kind: 'group', id: 'apps'}]
]) {
  test('real Tiny accepts deletion of ' + name + ' with exact surviving properties', async () => {
    const plan = planned(edit.planDelete(SOURCE, target));
    const after = await capture(plan.source);
    accepted(objectSemantics.validate(baseline, after, plan));
    if (target.kind === 'group') {
      assert.deepEqual(after.nodes, baseline.nodes);
      assert.equal(after.groups.some(([id]) => id === target.id), false);
      if (target.id === 'service') {
        assert.equal(after.parents.api, 'apps');
        assert.equal(after.parents.queue, 'apps');
      } else {
        assert.equal(after.parents.client, null);
        assert.equal(after.groupParents.service, null);
        assert.equal(after.parents.api, 'service');
      }
    }
  });
}

test('deleting the first link preserves the surviving styled link after index remapping', async () => {
  const plan = planned(edit.planDelete(SOURCE, {kind: 'edge', index: 0}));
  assert.match(plan.source, /linkStyle 0 stroke:#a33,stroke-width:2px/);
  const after = await capture(plan.source);
  accepted(objectSemantics.validate(baseline, after, plan));
  assert.deepEqual(after.edges[0], baseline.edges[1]);
  assert.deepEqual(after.edgeDefaults, baseline.edgeDefaults);
});

test('inline endpoint materialization retains shape, classes and scoped membership in Tiny', async () => {
  const source = 'flowchart LR\nsubgraph box[Box]\n A(("Alpha")):::accent --> B{"Beta"}\nend\nclassDef accent fill:#eef\n';
  const before = await capture(source);
  const plan = planned(edit.planDelete(source, {kind: 'edge', index: 0}));
  const after = await capture(plan.source);
  accepted(objectSemantics.validate(before, after, plan));
  assert.deepEqual(after.nodes, before.nodes);
  assert.deepEqual(after.parents, before.parents);
});

test('group unwrap preserves nested child membership and drops only links to the removed group', async () => {
  const source = 'flowchart LR\nsubgraph outer[Outer]\n subgraph middle[Middle]\n  direction TB\n  A[Alpha]\n  subgraph child[Child]\n   B[Beta]\n  end\n end\n C[Gamma]\nend\nmiddle --> C\nA --> B\nstyle middle fill:#eee\n';
  const before = await capture(source);
  const plan = planned(edit.planDelete(source, {kind: 'group', id: 'middle'}));
  const after = await capture(plan.source);
  accepted(objectSemantics.validate(before, after, plan));
  assert.deepEqual(after.nodes, before.nodes);
  assert.equal(after.parents.A, 'outer');
  assert.equal(after.parents.B, 'child');
  assert.equal(after.groupParents.child, 'outer');
  assert.deepEqual(Array.from(after.edges, e => [e.start, e.end]), [['A', 'B']]);
});

for (const destination of ['data', 'apps', null]) {
  test('real Tiny validates moving a nested node to ' + (destination || 'root'), async () => {
    const plan = planned(move.planMove(SOURCE, 'queue', destination));
    const after = await capture(plan.source);
    accepted(groupSemantics.validate(baseline, after, 'queue', destination));
    assert.equal(after.parents.queue, destination);
    assert.deepEqual(after.nodes, baseline.nodes);
    assert.deepEqual(after.edges, baseline.edges);
  });
}

test('group options expose stable IDs and readable complete ancestor paths', () => {
  const options = groupSemantics.groupOptions(baseline);
  assert.deepEqual(options.map(o => [o.id, o.path, o.parent]), [
    ['apps', 'Applications', null], ['service', 'Applications / Service', 'apps'], ['data', 'Data', null]
  ]);
});

test('rename guard rejects unrelated semantic changes to a real parsed candidate', async t => {
  const plan = planned(edit.planRename(SOURCE, {kind: 'node', id: 'api'}, 'New API'));
  const candidate = await capture(plan.source);
  accepted(objectSemantics.validate(baseline, candidate, plan));
  const mutations = [
    ['another caption', s => { node(s, 'queue').text = 'Unexpected'; }],
    ['selected shape', s => { node(s, 'api').type = 'diamond'; }],
    ['another node style', s => { node(s, 'client').styles.push('fill:red'); }],
    ['another node class', s => { node(s, 'queue').classes.push('accent'); }],
    ['node property', s => { node(s, 'queue').props.unexpected = true; }],
    ['node link', s => { node(s, 'queue').link = 'https://example.test/changed'; }],
    ['group caption', s => { group(s, 'data').title = 'Unexpected'; }],
    ['group direction', s => { group(s, 'apps').dir = 'LR'; }],
    ['group vertex style', s => { s.groupVertices[0][1].styles.push('stroke:red'); }],
    ['edge caption', s => { s.edges[0].text = 'Unexpected'; }],
    ['edge arrow type', s => { s.edges[0].type = 'arrow_circle'; }],
    ['edge endpoint', s => { s.edges[0].end = 'queue'; }],
    ['edge ID', s => { s.edges[0].id = 'another_id'; }],
    ['edge explicit-ID flag', s => { s.edges[0].isUserDefinedId = true; }],
    ['edge style', s => { s.edges[1].style.push('stroke:red'); }],
    ['global edge style', s => { s.edgeDefaults.defaultStyle.push('stroke:red'); }],
    ['class definition', s => { s.classes[0][1].styles.push('fill:red'); }],
    ['diagram direction', s => { s.direction = 'TB'; }],
    ['accessibility metadata', s => { s.accessibility.description = 'Unexpected'; }],
    ['node membership', s => { s.parents.queue = 'data'; }],
    ['group nesting', s => { s.groupParents.service = 'data'; }],
    ['unknown future property', s => { s.newProperty = {unsafe: true}; }]
  ];
  for (const [name, mutate] of mutations) {
    await t.test(name, () => {
      const changed = clone(candidate);
      mutate(changed);
      denied(objectSemantics.validate(baseline, changed, plan));
    });
  }
});

test('caption guard rejects a parser result that did not apply the requested caption', async () => {
  const plan = planned(edit.planRename(SOURCE, {kind: 'node', id: 'api'}, 'New API'));
  denied(objectSemantics.validate(baseline, baseline, plan));
  const actual = await capture(plan.source);
  denied(objectSemantics.validate(baseline, actual, {...plan, desiredCaption: 'Different'}));
});

test('edge and group renames do not authorize changing their other properties', async () => {
  const edgePlan = planned(edit.planRename(SOURCE, {kind: 'edge', index: 1}, 'New'));
  const edgeAfter = await capture(edgePlan.source);
  edgeAfter.edges[1].id = 'unexpected';
  denied(objectSemantics.validate(baseline, edgeAfter, edgePlan));
  const groupPlan = planned(edit.planRename(SOURCE, {kind: 'group', id: 'service'}, 'New'));
  const groupAfter = await capture(groupPlan.source);
  group(groupAfter, 'service').dir = 'BT';
  denied(objectSemantics.validate(baseline, groupAfter, groupPlan));
});

test('delete guard verifies the planned index map, removed indexes and before/after edge counts', async () => {
  const plan = planned(edit.planDelete(SOURCE, {kind: 'node', id: 'api'}));
  const after = await capture(plan.source);
  accepted(objectSemantics.validate(baseline, after, plan));
  for (const override of [
    {removedEdgeIndexes: [0]}, {edgeIndexMap: [null, 0, null]},
    {edgeCountBefore: 99}, {edgeCountAfter: 99}
  ]) denied(objectSemantics.validate(baseline, after, {...plan, ...override}));
});

test('delete guard protects every surviving caption, shape, style, ID and membership', async () => {
  const plan = planned(edit.planDelete(SOURCE, {kind: 'node', id: 'api'}));
  const candidate = await capture(plan.source);
  for (const mutate of [
    s => { node(s, 'queue').text = 'Unexpected'; },
    s => { node(s, 'queue').type = 'diamond'; },
    s => { node(s, 'client').styles.push('fill:red'); },
    s => { s.edges[0].id = 'looks_generated_but_is_wrong'; },
    s => { s.edges[0].isUserDefinedId = true; },
    s => { s.parents.queue = 'data'; },
    s => { s.edgeDefaults.defaultStyle = []; }
  ]) {
    const changed = clone(candidate);
    mutate(changed);
    denied(objectSemantics.validate(baseline, changed, plan));
  }
});

test('semantic comparison keeps explicit edge IDs even when they resemble generated IDs', async () => {
  // Planner intentionally refuses explicit edge-ID syntax. This tests the
  // independent semantic boundary with a hand-built plan and actual Tiny data.
  const source = 'flowchart LR\nA[Alpha]\nB[Beta]\nC[Gamma]\nA --> B\nB L_B_C_0@--> C\n';
  const before = await capture(source);
  const after = await capture(source.replace('A --> B\n', ''));
  const plan = {ok: true, operation: 'delete', target: {kind: 'edge', index: 0}, removedEdgeIndexes: [0], edgeIndexMap: [null, 0]};
  assert.equal(before.edges[1].id, 'L_B_C_0');
  assert.equal(before.edges[1].isUserDefinedId, true);
  accepted(objectSemantics.validate(before, after, plan));
  after.edges[0].id = 'changed';
  denied(objectSemantics.validate(before, after, plan));
});

test('move guard rejects wrong target, collateral membership, shape, edge and hierarchy changes', async () => {
  const plan = planned(move.planMove(SOURCE, 'queue', 'data'));
  const candidate = await capture(plan.source);
  accepted(groupSemantics.validate(baseline, candidate, 'queue', 'data'));
  for (const mutate of [
    s => { s.parents.queue = 'apps'; },
    s => { s.parents.api = 'data'; },
    s => { node(s, 'queue').type = 'diamond'; },
    s => { s.edges[0].text = 'Unexpected'; },
    s => { s.groupParents.service = 'data'; },
    s => { s.classes[0][1].styles.push('fill:red'); },
    s => { s.accessibility.title = 'Unexpected'; }
  ]) {
    const changed = clone(candidate);
    mutate(changed);
    denied(groupSemantics.validate(baseline, changed, 'queue', 'data'));
  }
  denied(groupSemantics.validate(baseline, candidate, 'missing', 'data'));
  denied(groupSemantics.validate(baseline, candidate, 'queue', 'missing'));
});

test('invalid snapshots fail closed: duplicate IDs, missing parents, cycles and unknown edge endpoints', () => {
  const plan = {ok: true, operation: 'rename', target: {kind: 'node', id: 'api'}, desiredCaption: 'API'};
  accepted(objectSemantics.validate(baseline, baseline, plan));
  for (const mutate of [
    s => { s.nodes.push(clone(s.nodes[0])); },
    s => { delete s.parents.api; },
    s => { s.parents.api = 'missing'; },
    s => { s.groupParents.apps = 'service'; },
    s => { s.edges[0].end = 'missing'; },
    s => { delete s.edges[0].isUserDefinedId; },
    s => { s.groupVertices.push(clone(s.groupVertices[0])); }
  ]) {
    const changed = clone(baseline);
    mutate(changed);
    denied(objectSemantics.validate(baseline, changed, plan));
  }
  denied(objectSemantics.validate(null, baseline, plan));
  denied(objectSemantics.validate(baseline, null, plan));
});

test('unknown operations, false plans and invalid selected objects fail closed', () => {
  for (const plan of [
    null,
    {ok: false, operation: 'rename', target: {kind: 'node', id: 'api'}, desiredCaption: 'API'},
    {operation: 'unknown', target: {kind: 'node', id: 'api'}},
    {operation: 'delete', target: {kind: 'unknown', id: 'api'}},
    {operation: 'delete', target: {kind: 'node', id: 'missing'}},
    {operation: 'delete', target: {kind: 'edge', index: -1}},
    {operation: 'delete', target: {kind: 'edge', index: 0.5}}
  ]) denied(objectSemantics.validate(baseline, baseline, plan));
});
