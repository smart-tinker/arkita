'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const move = require('../src/group-move.js');
const edit = require('../src/object-edit.js');

function success(plan, source) {
  assert.equal(plan.ok, true, JSON.stringify(plan.diagnostics));
  assert.equal(plan.requiresSemanticValidation, true);
  assert.equal(move.applyEdits(source, plan.edits), plan.source);
  assert.deepEqual(plan.diagnostics, []);
  return plan;
}

function rejected(plan, source, code) {
  assert.equal(plan.ok, false);
  assert.deepEqual(plan.edits, [], 'a rejected operation must not leak partial edits');
  assert.equal(move.applyEdits(source, plan.edits), source);
  assert.ok(plan.diagnostics.length);
  if (code) assert.ok(plan.diagnostics.some(d => d.code === code), JSON.stringify(plan.diagnostics));
}

test('node caption changes preserve BOM, CRLF, comments, shape, class and every other byte', () => {
  const source = '\uFEFFflowchart LR\r\n  A(("Старое")):::accent  %% keep ; this\r\n  B["Other"]\r\n  A --> B\r\n  classDef accent fill:#fff,stroke:#123\r\n';
  const plan = success(edit.planRename(source, {kind: 'node', id: 'A'}, 'Новое'), source);
  assert.equal(plan.source, source.replace('"Старое"', '"Новое"'));
  assert.equal(plan.edits.length, 1);
  assert.equal(plan.edgeCountBefore, 1);
  assert.equal(plan.edgeCountAfter, 1);
  assert.equal(edit.caption(plan.source, plan.target).caption, 'Новое');
});

test('same caption is an exact no-op, including unquoted source form', () => {
  const source = 'flowchart LR\nA[Old] %% leave syntax\n';
  const plan = success(edit.planRename(source, {kind: 'node', id: 'A'}, 'Old'), source);
  assert.equal(plan.changed, false);
  assert.equal(plan.source, source);
  assert.deepEqual(plan.edits, []);
});

test('caption entity encoding round-trips special characters, edge spaces and astral Unicode', () => {
  const source = 'flowchart LR\nA[Old]\n';
  const caption = '  Привет | "[x]"; & #59; 🚀\nnext  ';
  const plan = success(edit.planRename(source, {kind: 'node', id: 'A'}, caption), source);
  assert.equal(edit.caption(plan.source, plan.target).caption, caption);
  assert.equal(edit.analyze(plan.source).declarations.length, 1);
  assert.equal(edit.analyze(plan.source).edgeCount, 0);
  assert.match(plan.source, /#128640;/);
});

test('bare node caption insertion retains suffix classes', () => {
  const source = 'flowchart LR\nA:::accent\nclassDef accent fill:#eee\n';
  const plan = success(edit.planRename(source, {kind: 'node', id: 'A'}, 'Named'), source);
  assert.equal(plan.source, source.replace('A:::accent', 'A["Named"]:::accent'));
});

test('edge caption can be inserted, changed and cleared without rewriting the connector', () => {
  const source = 'flowchart LR\nA[Alpha]\nB[Beta]\n  A -.-> B %% keep\n';
  const target = {kind: 'edge', index: 0};
  const added = success(edit.planRename(source, target, 'Да | нет'), source);
  assert.equal(added.source, source.replace('-.->', '-.->|"Да #124; нет"|'));
  const renamed = success(edit.planRename(added.source, target, 'Ready'), added.source);
  assert.equal(edit.caption(renamed.source, target).caption, 'Ready');
  const cleared = success(edit.planRename(renamed.source, target, ''), renamed.source);
  assert.equal(cleared.source, source);
});

test('group caption changes only the selected nested header', () => {
  const source = 'flowchart LR\nsubgraph outer["Outer"]\n subgraph inner["Inner"]\n  A[Alpha]\n end\nend\n';
  const target = {kind: 'group', id: 'inner'};
  const plan = success(edit.planRename(source, target, 'Внутри'), source);
  assert.equal(plan.source, source.replace('inner["Inner"]', 'inner["Внутри"]'));
  assert.deepEqual(edit.analyze(plan.source).groups.map(g => [g.id, g.parentId]), [['outer', null], ['inner', 'outer']]);
});

test('node delete removes only incident edges and object directives, remapping remaining linkStyle indexes', () => {
  const source = 'flowchart LR\n A[Alpha]\n B[Beta]\n C[Gamma]\n A --> B\n B --> C\n A --> C\n classDef accent fill:#eef\n class A,B accent\n style B fill:#f00\n click B "https://example.test/b"\n linkStyle 0,2 stroke:#123\n linkStyle 1 stroke:#456\n linkStyle default stroke-width:2px\n';
  const plan = success(edit.planDelete(source, {kind: 'node', id: 'B'}), source);
  const expected = 'flowchart LR\n A[Alpha]\n \n C[Gamma]\n \n \n A --> C\n classDef accent fill:#eef\n class A accent\n \n \n linkStyle 0 stroke:#123\n \n linkStyle default stroke-width:2px\n';
  assert.equal(plan.source, expected);
  assert.deepEqual(plan.removedEdgeIndexes, [0, 1]);
  assert.deepEqual(plan.edgeIndexMap, [null, null, 0]);
  assert.equal(plan.edgeCountAfter, 1);
});

test('edge delete materializes inline endpoints at their original scope and preserves authored properties', () => {
  const source = 'flowchart LR\nsubgraph box["Box"]\n  A(("Alpha")):::accent --> B{"Beta"} %% endpoints survive\nend\nclassDef accent fill:#efe\n';
  const plan = success(edit.planDelete(source, {kind: 'edge', index: 0}), source);
  assert.equal(plan.source, source.replace('A(("Alpha")):::accent --> B{"Beta"}', 'A(("Alpha")):::accent; B{"Beta"}'));
  const parsed = edit.analyze(plan.source);
  assert.deepEqual(parsed.declarations.map(n => [n.id, n.groupId]), [['A', 'box'], ['B', 'box']]);
  assert.deepEqual(plan.edgeIndexMap, [null]);
});

test('deleting the only bare edge retains both implied vertices', () => {
  const source = 'flowchart LR\n  A --> B\n';
  const plan = success(edit.planDelete(source, {kind: 'edge', index: 0}), source);
  assert.equal(plan.source, 'flowchart LR\n  A; B\n');
});

test('deleting a node preserves an implied neighbor and its group', () => {
  const source = 'flowchart LR\nsubgraph box[Box]\n A --> B\nend\n';
  const plan = success(edit.planDelete(source, {kind: 'node', id: 'A'}), source);
  assert.equal(plan.source, source.replace('A --> B', 'B'));
  assert.equal(edit.analyze(plan.source).declarations[0].groupId, 'box');
});

test('nested group delete unwraps children, drops local direction and incident links, retains comments and grandchildren', () => {
  const source = 'flowchart LR\nsubgraph outer[Outer]\n subgraph inner[Inner] %% open\n  direction TB\n  A[Alpha]\n  subgraph child[Child]\n   B[Beta]\n  end\n end %% close\n C[Gamma]\nend\ninner --> C\nA --> B\nstyle inner fill:#eee\n';
  const plan = success(edit.planDelete(source, {kind: 'group', id: 'inner'}), source);
  const expected = 'flowchart LR\nsubgraph outer[Outer]\n  %% open\n  \n  A[Alpha]\n  subgraph child[Child]\n   B[Beta]\n  end\n  %% close\n C[Gamma]\nend\n\nA --> B\n\n';
  assert.equal(plan.source, expected);
  assert.equal(plan.parentGroupId, 'outer');
  const parsed = edit.analyze(plan.source);
  assert.deepEqual(parsed.groups.map(g => [g.id, g.parentId]), [['outer', null], ['child', 'outer']]);
  assert.deepEqual(parsed.declarations.map(n => [n.id, n.groupId]), [['A', 'outer'], ['B', 'child'], ['C', 'outer']]);
  assert.deepEqual(plan.removedEdgeIndexes, [0]);
});

test('move transfers the exact declaration statement, including CRLF and comment, into a nested group', () => {
  const source = '\uFEFFflowchart LR\r\n  A(["Alpha"]):::accent %% move me\r\nsubgraph outer[Outer]\r\n subgraph inner[Inner]\r\n  B[Beta]\r\n end\r\nend\r\nA --> B\r\n';
  const line = '  A(["Alpha"]):::accent %% move me\r\n';
  const plan = success(move.planMove(source, 'A', 'inner'), source);
  assert.equal(plan.source, source.replace(line, '').replace(' end\r\n', line + ' end\r\n'));
  assert.equal(plan.fromGroupId, null);
  assert.equal(plan.targetGroupId, 'inner');
});

test('move to root preserves indentation and adds only the necessary final line boundary', () => {
  const source = 'flowchart LR\nsubgraph box[Box]\n  A[Alpha]\nend';
  const plan = success(move.planMove(source, 'A', null), source);
  assert.equal(plan.source, 'flowchart LR\nsubgraph box[Box]\nend\n  A[Alpha]\n');
});

test('unterminated final declaration can move into an earlier group', () => {
  const source = 'flowchart LR\nsubgraph box[Box]\n B[Beta]\nend\nA[Alpha]';
  const plan = success(move.planMove(source, 'A', 'box'), source);
  assert.equal(plan.source, 'flowchart LR\nsubgraph box[Box]\n B[Beta]\nA[Alpha]\nend\n');
});

test('moving to the current group leaves source byte-identical', () => {
  const source = 'flowchart LR\nsubgraph box[Box]\n A[Alpha]\nend\n';
  const plan = success(move.planMove(source, 'A', 'box'), source);
  assert.equal(plan.changed, false);
  assert.equal(plan.source, source);
  assert.deepEqual(plan.edits, []);
});

test('YAML, init directives and syntax-looking label/comment text remain opaque', () => {
  const preamble = '\uFEFF---\r\ntitle: source\r\nconfig:\r\n  theme: default\r\n---\r\n%%{init: {"theme":"default"}}%%\r\n';
  const source = preamble + 'flowchart LR\r\n%% subgraph fake; end\r\nA["subgraph fake; end | [x]"]\r\nsubgraph real[Real]\r\n B[Beta]\r\nend\r\n';
  const plan = success(move.planMove(source, 'A', 'real'), source);
  assert.ok(plan.source.startsWith(preamble));
  assert.deepEqual(move.analyze(plan.source).groups.map(g => g.id), ['real']);
  assert.ok(plan.source.includes('%% subgraph fake; end\r\n'));
});

const captionFailures = [
  ['repeated declaration', 'flowchart LR\nA[One]\nA[Two]\n', {kind: 'node', id: 'A'}, 'REPEATED_NODE_DECLARATION'],
  ['inline declaration', 'flowchart LR\nA[One] --> B\n', {kind: 'node', id: 'A'}, 'INLINE_NODE_DECLARATION'],
  ['implied-only node', 'flowchart LR\nA --> B\n', {kind: 'node', id: 'A'}, 'IMPLIED_ONLY_NODE'],
  ['chain edge', 'flowchart LR\nA --> B --> C\n', {kind: 'edge', index: 0}, 'CHAIN_EDGE_UNSUPPORTED'],
  ['parallel edges', 'flowchart LR\nA --> B\nA --> B\n', {kind: 'edge', index: 1}, 'PARALLEL_EDGE_AMBIGUOUS'],
  ['markdown caption', 'flowchart LR\nA["`**bold**`"]\n', {kind: 'node', id: 'A'}, 'MARKDOWN_CAPTION_UNSUPPORTED'],
  ['metadata caption', 'flowchart LR\nA@{ shape: rect, label: "Alpha" }\n', {kind: 'node', id: 'A'}, 'METADATA_CAPTION_UNSUPPORTED'],
  ['node/group ID collision', 'flowchart LR\nsubgraph A[Group]\n B[Beta]\nend\nA[Alpha]\n', {kind: 'node', id: 'A'}, 'NODE_GROUP_ID_COLLISION']
];
for (const [name, source, target, code] of captionFailures) {
  test('caption planner rejects ' + name + ' atomically', () => rejected(edit.planRename(source, target, 'New'), source, code));
}

for (const [name, source, code] of [
  ['repeated declaration', 'flowchart LR\nA[One]\nA[Two]\n', 'REPEATED_NODE_DECLARATION'],
  ['inline declaration', 'flowchart LR\nA[One] --> B\n', 'INLINE_NODE_DECLARATION'],
  ['implied declaration', 'flowchart LR\nA --> B\n', 'IMPLIED_ONLY_NODE'],
  ['conflicting scoped reference', 'flowchart LR\nA[Alpha]\nsubgraph g[Group]\n A --> B\nend\n', 'CONFLICTING_SCOPED_REFERENCE']
]) {
  test('move planner rejects ' + name + ' atomically', () => rejected(move.planMove(source, 'A', null), source, code));
}

for (const [name, source, code] of [
  ['unclosed label', 'flowchart LR\nA["Alpha]\n', 'UNCLOSED_LABEL'],
  ['unbalanced label', 'flowchart LR\nA[Alpha)\n', 'UNBALANCED_LABEL'],
  ['unclosed group', 'flowchart LR\nsubgraph g[Group]\nA[Alpha]\n', 'UNCLOSED_GROUP'],
  ['unmatched end', 'flowchart LR\nA[Alpha]\nend\n', 'UNMATCHED_END'],
  ['duplicate group IDs', 'flowchart LR\nsubgraph g[One]\nA[Alpha]\nend\nsubgraph g[Two]\nB[Beta]\nend\n', 'DUPLICATE_GROUP_ID'],
  ['unclosed front matter', '---\ntitle: test\nflowchart LR\nA[Alpha]\n', 'UNCLOSED_FRONT_MATTER'],
  ['lone CR', 'flowchart LR\rA[Alpha]\r', 'UNSUPPORTED_LINE_ENDINGS'],
  ['fanout', 'flowchart LR\nA & B --> C\n', 'UNSUPPORTED_STATEMENT'],
  ['explicit edge ID grammar', 'flowchart LR\nA e1@--> B\n', 'UNSUPPORTED_STATEMENT']
]) {
  test('all planners reject ' + name + ' without partial edits', () => {
    rejected(move.planMove(source, 'A', null), source, code);
    rejected(edit.planRename(source, {kind: 'node', id: 'A'}, 'New'), source, code);
    rejected(edit.planDelete(source, {kind: 'node', id: 'A'}), source, code);
  });
}

test('deletion rejects ambiguous chain and parallel incident edges', () => {
  for (const source of ['flowchart LR\nA --> B --> C\n', 'flowchart LR\nA --> B\nA --> B\n']) {
    rejected(edit.planDelete(source, {kind: 'edge', index: 0}), source);
    rejected(edit.planDelete(source, {kind: 'node', id: 'A'}), source);
  }
});

test('invalid linkStyle references reject the whole deletion instead of shifting a bad index', () => {
  const source = 'flowchart LR\nA --> B\nlinkStyle 7 stroke:#123\n';
  rejected(edit.planDelete(source, {kind: 'edge', index: 0}), source, 'INVALID_LINK_STYLE_INDEX');
});

test('invalid targets and unsafe captions leave the source unchanged', () => {
  const source = 'flowchart LR\nA[Alpha]\n';
  rejected(edit.planRename(source, {kind: 'node', id: 'A'}, ''), source, 'EMPTY_CAPTION');
  for (const caption of ['bad\0caption', '\ud800', '\udc00', 42]) rejected(edit.planRename(source, {kind: 'node', id: 'A'}, caption), source, 'INVALID_CAPTION');
  rejected(edit.planDelete(source, {kind: 'edge', index: -1}), source, 'INVALID_EDGE_INDEX');
  rejected(edit.planDelete(source, {kind: 'node', id: 'missing'}), source, 'NODE_NOT_FOUND');
  rejected(move.planMove(source, 'A', 'missing'), source, 'TARGET_NOT_FOUND');
});
