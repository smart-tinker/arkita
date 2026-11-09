import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { CURRENT_METAMODEL, CURRENT_CATALOG, SchemkaError, validateProject } from '../../schemka-model-core/src/index.js';
import { exportMermaid, MERMAID_LIMITS } from '../src/mermaid.js';

const id = (prefix, number) => `${prefix}-00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
const node = (number) => `n_00000000000040008000${number.toString(16).padStart(12, '0')}`;
const selected = id('view', 1);
const element = (number, name) => ({ id: id('el', number), type: 'ApplicationComponent', name, documentation: '', properties: [] });
const occurrence = (number, elementNumber = number) => ({ id: id('occ', number), concept: { kind: 'element', id: id('el', elementNumber) },
  bounds: { x: 0, y: 0, width: 100, height: 50 }, parent: null, style: {}, zIndex: 0 });
const relationship = (number, source, target, label = '') => ({ id: id('rel', number), type: 'Association',
  source: { kind: 'element', id: id('el', source) }, target: { kind: 'element', id: id('el', target) }, label, documentation: '', properties: [] });
const connection = (number, relationshipNumber = 1, source = 1, target = 2) => ({ id: id('conn', number),
  relationshipId: id('rel', relationshipNumber), source: { kind: 'occurrence', id: id('occ', source) }, target: { kind: 'occurrence', id: id('occ', target) },
  routePoints: [], labelPosition: null, style: {} });
function fresh() {
  return {
    project: { format: 'schemka-project', formatVersion: 4, id: id('prj', 1), name: 'PRIVATE PROJECT', documentation: 'PRIVATE PROJECT DOC', properties: [{ key: 'private', value: 'MODEL PROPERTY' }], metamodel: { ...CURRENT_METAMODEL } },
    folders: [], assets: [], junctions: [], elements: [element(1, 'Alpha'), element(2, 'Beta'), element(3, 'UNSELECTED ELEMENT')],
    relationships: [relationship(1, 1, 2, 'uses'), relationship(2, 1, 3, 'UNSELECTED LABEL'), relationship(3, 2, 1, 'UNDRAWN LABEL')],
    views: [
      { view: { id: selected, name: 'PRIVATE VIEW', documentation: 'PRIVATE VIEW DOC', properties: [] },
        occurrences: [occurrence(1), occurrence(2)], connections: [connection(1)], visualNodes: [], visualConnectors: [] },
      { view: { id: id('view', 2), name: 'OTHER VIEW', documentation: '', properties: [] },
        occurrences: [occurrence(3, 1), occurrence(4, 3)], connections: [connection(2, 2, 3, 4)], visualNodes: [], visualConnectors: [] },
    ],
  };
}
const error = (code) => (value) => value instanceof SchemkaError && value.code === code;
const warning = '%% relationship semantics UNKNOWN; not normative notation\n';
const decode = (value) => value.replace(/#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
function inspect(source, retainTypes = false) {
  const caption = value => { const raw = decode(value); return retainTypes ? raw : raw.replace(/^(?:ApplicationComponent|Association)： /u, ''); };
  assert.match(source, /^flowchart (?:LR|RL|TB|BT)\n(?:.*\n)*$/);
  assert.equal(Buffer.byteLength(source), source.length);
  const nodes = [], edges = [];
  for (const line of source.trimEnd().split('\n').slice(1)) {
    if (line === warning.trimEnd() || line === '%% multiplicities are text annotations only; use native Schemka for exact data') continue;
    const vertex = /^  (n_[0-9a-f]{32})\["((?:[a-zA-Z0-9_.-]|#[0-9]+;)+)"\]$/.exec(line);
    const edge = /^  (n_[0-9a-f]{32}) -->(?:\|"((?:[a-zA-Z0-9_.-]|#[0-9]+;)+)"\|)? (n_[0-9a-f]{32})$/.exec(line);
    assert.ok(vertex || edge, `Unexpected generated statement: ${line}`);
    if (vertex) nodes.push({ id: vertex[1], label: caption(vertex[2]) });
    else edges.push({ source: edge[1], target: edge[3], label: edge[2] === undefined ? undefined : caption(edge[2]) });
  }
  for (const item of [...nodes, ...edges]) {
    if (item.label !== undefined) assert.doesNotMatch(item.label, /[<>&`$:\u0000-\u001f\u007f-\u009f\u2028\u2029]/u);
  }
  return { nodes, edges };
}
function withLabel(label) {
  const state = fresh();
  state.elements[0].name = label;
  state.relationships[0].label = label;
  return state;
}
function deepFreeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
  return value;
}
function withDuplicates() {
  const state = fresh();
  state.views[0].occurrences.push(occurrence(5, 1));
  state.relationships.push(relationship(4, 1, 1, 'self'));
  state.views[0].connections.push(connection(3), connection(4, 1, 5, 2), connection(5, 4, 1, 1), connection(6, 4, 1, 5));
  return state;
}

test('selected view only; occurrence UUIDs, typed labels and neutral arrows; LF and no private metadata', () => {
  const state = fresh();
  state.elements[0].documentation = 'PRIVATE ELEMENT DOC';
  state.elements[0].properties = [{ key: 'secretKey', value: 'PRIVATE PROPERTY' }];
  state.relationships[0].properties = [{ key: 'privateKey', value: 'PRIVATE RELATIONSHIP PROPERTY' }];
  const source = exportMermaid(state, selected);
  assert.equal(source, `flowchart LR\n${warning}  ${node(1)}["ApplicationComponent#65306;#32;Alpha"]\n  ${node(2)}["ApplicationComponent#65306;#32;Beta"]\n  ${node(1)} -->|"Association#65306;#32;uses"| ${node(2)}\n`);
  assert.doesNotMatch(source, /PRIVATE|UNSELECTED|UNDRAWN|OTHER|prj-|view-|el-|rel-|conn-/);
  assert.deepEqual(inspect(source), { nodes: [{ id: node(1), label: 'Alpha' }, { id: node(2), label: 'Beta' }],
    edges: [{ source: node(1), target: node(2), label: 'uses' }] });
});

test('repeated elements, parallel duplicate connections and true self-edges stay distinct', () => {
  const source = exportMermaid(withDuplicates(), selected);
  const { nodes, edges } = inspect(source);
  assert.equal(nodes.length, 3);
  assert.equal(nodes.filter((item) => item.label === 'Alpha').length, 2);
  assert.equal(new Set(nodes.map((item) => item.id)).size, 3);
  assert.equal(edges.length, 5);
  assert.equal(edges.filter((item) => item.source === node(1) && item.target === node(2)).length, 2);
  assert.equal(edges.filter((item) => item.source === node(1) && item.target === node(1)).length, 1);
  assert.equal(edges.filter((item) => item.source === node(1) && item.target === node(5)).length, 1);
});

test('determinism, stable node identity, immutable inputs and no layout dependence', () => {
  const state = withDuplicates();
  const expected = exportMermaid(deepFreeze(structuredClone(state)), selected);
  const original = structuredClone(state);
  for (const list of [state.elements, state.relationships, state.views, ...state.views.flatMap((v) => [v.occurrences, v.connections])]) list.reverse();
  assert.equal(exportMermaid(state, selected), expected);
  for (const entry of state.views) for (const item of entry.occurrences) { item.bounds.x = 12.3; item.zIndex = 50; }
  state.views.find((v) => v.view.id === selected).connections[0].routePoints = [{ kind: 'bend', point: { x: 10, y: 20 } }];
  assert.equal(exportMermaid(state, selected), expected);
  state.elements.find((item) => item.id === id('el', 1)).name = 'Renamed';
  assert.deepEqual(inspect(exportMermaid(state, selected)).nodes.map((v) => v.id), inspect(expected).nodes.map((v) => v.id));
  assert.deepEqual(original, withDuplicates());
});

test('empty view, unnamed nodes, empty edge labels and significant whitespace', () => {
  const state = withLabel('');
  assert.equal(inspect(exportMermaid(state, selected)).nodes[0].label, '');
  assert.equal(inspect(exportMermaid(state, selected)).edges[0].label, '');
  const white = inspect(exportMermaid(withLabel('  a \t b\r\nc\rd\ne\u0085f\u2028g\u2029 '), selected));
  assert.equal(white.nodes[0].label, '  a   b c d e f g  ');
  assert.equal(white.edges[0].label, white.nodes[0].label);
  state.views[0].occurrences = [];
  state.views[0].connections = [];
  assert.equal(exportMermaid(state, selected), `flowchart LR\n${warning}`);
});

const attacks = [
  '"]\nEVIL["owned"]\nclick EVIL "javascript:alert(1)"',
  '"| EVIL\nstyle EVIL fill:red\nlinkStyle default stroke:red\nclassDef exploit fill:red',
  '%%{init: {"securityLevel": "loose", "flowchart": {"htmlLabels": true}}}%%',
  '---\nconfig:\n  securityLevel: loose\n---\nflowchart TD\nEVIL --> OTHER',
  '<img src="https://example.invalid/leak" onerror="alert(1)"><script>alert(1)</script>',
  '</text><a href="javascript:alert(1)">click</a><foreignObject>owned</foreignObject>',
  '&lt;img onerror=&quot;alert(1)&quot;&gt; &#60;script&#62; &#x3c;script&#x3e; #60;script#62;',
  '&amp;#x3c;img src=x&amp;#x3e; #amp;lt; #quot; &#00000000060;',
  '`[click](javascript:alert(1))` ![image](https://example.invalid/image) <https://example.invalid>',
  '$$\\href{javascript:alert(1)}{click}$$ fa:fa-car fab:fa-github icon:mdi-home',
  'end subgraph click classDef style linkStyle accTitle accDescr call href stroke callback',
  '#34;#10;flowchart TD#59;#35;#amp; ﬂ°°60¶ß ﬂ°lt¶ß',
  'quote " apostrophe \' slash / backslash \\ pipe | [ ] { } ( ) = + % # ; @ ! ?',
];

test('adversarial Mermaid, directive, frontmatter, HTML, entity, link and Markdown content remains label data', () => {
  for (const attack of attacks) {
    const source = exportMermaid(withLabel(attack), selected);
    const { nodes, edges } = inspect(source);
    assert.equal(nodes.length, 2, attack);
    assert.equal(edges.length, 1, attack);
    assert.equal(nodes[0].label, edges[0].label, attack);
    assert.equal(source.split('\n').length, 6, attack);
    assert.doesNotMatch(source.replace(warning, '').replaceAll('-->', ''), /[<>&`$%:\u0080-\uffff]/u);
  }
  assert.equal(inspect(exportMermaid(withLabel('" & < > ` $ : #60; &lt;'), selected)).nodes[0].label,
    '" ＆ ＜ ＞ ｀ ＄ ： #60; ＆lt;');
});

test('ordinary Unicode, astral symbols, combining sequences and literal entities retain their text', () => {
  const label = 'Привет 日本語 Ελληνικά العربية 😀 🧑‍💻 e\u0301 café #34; #amp; ﬂ°°60¶ß';
  const result = inspect(exportMermaid(withLabel(label), selected));
  assert.equal(result.nodes[0].label, label);
  assert.equal(result.edges[0].label, label);
});

test('malformed UTF-16, controls, bidi formatting and noncharacters have explicit replacements', () => {
  const label = '\ud800X\udc00\ud83d\ude00\u0000\u0001\u007f\u009f\ufdd0\ufffe\uffff\u{1fffe}\u061c\u200e\u202e\u2066';
  const output = inspect(exportMermaid(withLabel(label), selected)).nodes[0].label;
  assert.equal(output, '�X�😀' + '�'.repeat(12));
  assert.equal(output.isWellFormed(), true);
});

test('every BMP code unit and deterministic supplementary/adversarial fuzz obey the output grammar', () => {
  for (let start = 0; start <= 0xffff; start += 1024) {
    const state = withLabel(String.fromCharCode(...Array.from({ length: 1024 }, (_, i) => start + i)));
    assert.equal(inspect(exportMermaid(state, selected)).nodes.length, 2);
  }
  let seed = 0x7c31a581;
  for (let sample = 0; sample < 100; sample++) {
    let label = attacks[sample % attacks.length];
    for (let i = 0; i < 64; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; label += String.fromCodePoint(seed % 0x110000); }
    const source = exportMermaid(withLabel(label), selected);
    assert.deepEqual(inspect(source).nodes.map((n) => n.id), [node(1), node(2)]);
    assert.equal(exportMermaid(withLabel(label), selected), source);
  }
});

test('all input models validate before projection, including errors outside selected view', () => {
  for (const mutate of [
    (s) => { s.elements[2].type = 'UnknownElement'; },
    (s) => { s.views[1].connections[0].target.id = id('occ', 99); },
    (s) => { s.elements[2].id = s.elements[0].id; },
    (s) => { s.relationships[2].target.kind = 'relationship'; },
    (s) => { s.views[1].occurrences[0].bounds.x = NaN; },
  ]) {
    const state = fresh(); mutate(state);
    assert.throws(() => exportMermaid(state, selected), SchemkaError);
  }
  const state = fresh();
  let reads = 0;
  Object.defineProperty(state.elements[0], 'name', { enumerable: true, get() { reads++; return 'bad'; } });
  assert.throws(() => exportMermaid(state, selected), error('JSON_VALUE'));
  assert.equal(reads, 0);
  for (const bad of [undefined, null, 'LR', {}, id('view', 3), `${selected}\nclick bad`]) {
    assert.throws(() => exportMermaid(fresh(), bad), error('MERMAID_VIEW'));
  }
});

test('the only option is a small direction whitelist; no getters or coercion', () => {
  for (const direction of ['LR', 'RL', 'TB', 'BT']) assert.ok(exportMermaid(fresh(), selected, { direction }).startsWith(`flowchart ${direction}\n`));
  assert.ok(exportMermaid(fresh(), selected, Object.create(null)).startsWith('flowchart LR\n'));
  for (const options of [null, [], 'LR', 1, { direction: 'TD' }, { direction: 'LR\nEVIL' }, { direction: undefined },
    { direction: { toString() { throw new Error('Must not coerce'); } } }, { extra: true }, { htmlLabels: true },
    { [Symbol('direction')]: 'LR' }, Object.create({ direction: 'TB' }), Object.defineProperty({}, 'direction', { value: 'LR' })]) {
    assert.throws(() => exportMermaid(fresh(), selected, options), error('MERMAID_OPTION'));
  }
  let reads = 0;
  assert.throws(() => exportMermaid(fresh(), selected, { get direction() { reads++; return 'LR'; } }), error('MERMAID_OPTION'));
  assert.equal(reads, 0);
});

test('occurrence and drawn connection budgets are exact and independent of unselected views', () => {
  const state = fresh();
  state.views[0].occurrences = Array.from({ length: 256 }, (_, i) => occurrence(i + 10, 1));
  state.views[0].connections = [];
  assert.equal(inspect(exportMermaid(state, selected)).nodes.length, MERMAID_LIMITS.occurrences);
  state.views[0].occurrences.push(occurrence(266, 1));
  assert.throws(() => exportMermaid(state, selected), error('MERMAID_LIMIT'));
  state.views[0] = fresh().views[0];
  state.views[1].occurrences = Array.from({ length: 257 }, (_, i) => occurrence(i + 10, 1));
  state.views[1].connections = [];
  assert.equal(inspect(exportMermaid(state, selected)).nodes.length, 2);
  state.views[0].connections = Array.from({ length: 256 }, (_, i) => connection(i + 10));
  assert.equal(inspect(exportMermaid(state, selected)).edges.length, MERMAID_LIMITS.connections);
  state.views[0].connections.push(connection(266));
  assert.throws(() => exportMermaid(state, selected), error('MERMAID_LIMIT'));
});

test('ASCII output budget is checked incrementally, never silently truncates, and leaves state unchanged', () => {
  const state = fresh();
  state.elements = Array.from({ length: 6 }, (_, i) => element(i + 1, 'x'.repeat(7000)));
  state.relationships = [];
  state.views = [state.views[0]];
  state.views[0].occurrences = Array.from({ length: 6 }, (_, i) => occurrence(i + 1));
  state.views[0].connections = [];
  const needed = MERMAID_LIMITS.outputBytes - exportMermaid(state, selected).length;
  // Spread the remaining budget over names, keeping the core's 8,192 limit.
  for (let i = 0, remaining = needed; remaining > 0; i++) {
    const add = Math.min(1192, remaining); state.elements[i].name += 'x'.repeat(add); remaining -= add;
  }
  assert.equal(exportMermaid(state, selected).length, MERMAID_LIMITS.outputBytes);
  state.elements[5].name += 'x';
  const before = structuredClone(state);
  assert.throws(() => exportMermaid(state, selected), error('MERMAID_LIMIT'));
  assert.deepEqual(state, before);
  const expanded = withLabel('😀'.repeat(4096));
  validateProject(expanded);
  assert.throws(() => exportMermaid(expanded, selected), error('MERMAID_LIMIT'));
});

const runtimePath = process.env.SCHEMKA_MERMAID_RUNTIME;
test('optional official Mermaid Tiny 12.1.0 generated flowchart grammar verification (not render QA)',
  { skip: !runtimePath && 'Set SCHEMKA_MERMAID_RUNTIME to the existing verified Mermaid Tiny 12.1.0 bundle' }, async () => {
    const runtime = await readFile(runtimePath, 'utf8');
    assert.equal(createHash('sha256').update(runtime).digest('hex'), '143c1b9345c45963ff429da4bdcd9051316a43522ea9edd7ccb7a87ff947a804');
    const context = vm.createContext({ console, TextEncoder, TextDecoder, setTimeout, clearTimeout });
    vm.runInContext(runtime, context, { timeout: 10000 });
    context.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', flowchart: { htmlLabels: false } });
    // An empty diagram loads the official generated grammar without requiring
    // DOMPurify/DOM. Capture semantic actions; do not render or claim full API,
    // DOM sanitization or browser coverage from this grammar-only harness.
    const diagram = await context.mermaid.mermaidAPI.getDiagramFromText('flowchart LR\n');
    const currentComment = warning;
    // Comments are removed by official preprocessing, before the generated
    // grammar runs. Verify that public path on an empty diagram without DOM.
    for (const direction of ['LR', 'RL', 'TB', 'BT']) {
      for (const annotation of ['', '%% multiplicities are text annotations only; use native Schemka for exact data\n']) {
        const parsed = await context.mermaid.mermaidAPI.getDiagramFromText(`flowchart ${direction}\n${currentComment}${annotation}`);
        assert.equal(parsed.db.getVertices().size, 0);
        assert.equal(parsed.db.getEdges().length, 0);
      }
    }
    const cases = [fresh(), withDuplicates(), withLabel(''), withLabel('  '), ...attacks.map(withLabel),
      withLabel('Привет 日本語 😀 🧑‍💻 e\u0301'), withLabel('\ud800\u0000\u202e\uffff')];
    for (const raw of ['', '*', '1..*', '2..*', ' \r\n<svg>\ud800 ', ...attacks.slice(0, 3)]) {
      const annotated = fresh(); annotated.relationships[0].sourceMultiplicity = raw.slice(0, 128); annotated.relationships[0].targetMultiplicity = ''; cases.push(annotated);
    }
    const empty = fresh(); empty.views[0].occurrences = []; empty.views[0].connections = []; cases.push(empty);
    // Verify new type prefixes with the real grammar, including hostile/empty
    // captions and repeated edges. The one fixed comment is verified above.
    for (const state of [...cases]) for (const profile of [CURRENT_CATALOG]) {
      for (const type of profile.elementTypes) for (const relationshipType of profile.relationshipTypes) {
        const typed = structuredClone(state);
        typed.project.metamodel = { id: profile.id, version: profile.version };
        typed.elements.forEach((item) => { item.type = type; });
        typed.relationships.forEach((item) => { item.type = relationshipType; });
        cases.push(typed);
      }
    }
    for (const state of cases) for (const direction of ['LR', 'RL', 'TB', 'BT']) {
      diagram.db.clear();
      const vertices = new Map(), links = [], directions = [];
      const yy = { ...diagram.db };
      for (const key of Object.keys(yy)) if (typeof yy[key] === 'function' && !['firstGraph', 'destructLink'].includes(key)) {
        yy[key] = () => { throw new Error(`Unexpected grammar action: ${key}`); };
      }
      yy.setDirection = (value) => directions.push(value.trim());
      yy.addVertex = (name, text, shape) => {
        if (text) { assert.equal(shape, 'square'); assert.equal(text.type, 'string'); assert.ok(!vertices.has(name)); vertices.set(name, text.text); }
        else assert.ok(vertices.has(name), `Undeclared vertex: ${name}`);
      };
      yy.addLink = (sources, targets, link) => {
        assert.equal(sources.length, 1); assert.equal(targets.length, 1);
        assert.equal(link.type, 'arrow_point'); assert.equal(link.stroke, 'normal'); assert.equal(link.length, 1);
        if (link.text) assert.equal(link.text.type, 'string');
        links.push({ source: sources[0], target: targets[0], label: link.text ? decode(link.text.text) : undefined });
      };
      diagram.parser.parser.yy = yy;
      const source = exportMermaid(state, selected, { direction });
      const grammarSource = source.replace(currentComment, '').replace('%% multiplicities are text annotations only; use native Schemka for exact data\n', '');
      diagram.parser.parser.parse(grammarSource);
      assert.deepEqual(directions, [direction]);
      const expected = inspect(grammarSource, true);
      assert.deepEqual([...vertices].map(([name, text]) => ({ id: name, label: decode(text) })), expected.nodes);
      assert.deepEqual(links, expected.edges);
    }
  });
