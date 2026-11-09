import { readFileSync } from 'node:fs';

// Fixed native-v2 input, independent of future createProject/serializer defaults.
const original = readFileSync(new URL('./metadata-v2.arkita', import.meta.url));
const envelope = JSON.parse(original.toString('utf8'));
export const metadataFixture = () => ({ bytes: Uint8Array.from(original), files: structuredClone(envelope.files) });
const upgraded = readFileSync(new URL('./metadata-v3.arkita', import.meta.url));
export const metadataV3Fixture = () => ({ bytes: Uint8Array.from(upgraded), files: JSON.parse(upgraded.toString('utf8')).files });
export function metadataV2State() {
  const { files } = metadataFixture(), collection = prefix => files.filter(file => file.path.startsWith(prefix)).map(file => JSON.parse(file.content));
  return { project: JSON.parse(files.find(file => file.path === 'schemka.json').content),
    elements: collection('model/elements/'), junctions: collection('model/junctions/'), relationships: collection('model/relationships/'),
    views: files.filter(file => file.path.endsWith('/view.json')).map(file => {
      const prefix = file.path.slice(0, -'view.json'.length);
      return { view: JSON.parse(file.content), occurrences: collection(prefix + 'occurrences/'), connections: collection(prefix + 'connections/') };
    }) };
}
export const metadataEnvelope = files => new TextEncoder().encode(JSON.stringify({ format: 'schemka-project-file', formatVersion: 1, files }));

/** Deliberately incompatible inputs; every boundary must refuse the same records. */
export function incompatibleMetadata() {
  const cases = [];
  function change(name, prefix, update, code = 'SCHEMA') {
    const { files } = metadataFixture();
    const file = files.find(item => item.path.startsWith(prefix));
    const record = JSON.parse(file.content); update(record); file.content = JSON.stringify(record);
    cases.push({ name, files, code });
  }
  change('unsupported core v1', 'schemka.json', record => { record.formatVersion = 1; }, 'VERSION');
  const future = metadataFixture().files;
  for (const file of future) {
    const record = JSON.parse(file.content);
    if (file.path === 'schemka.json') Object.assign(record, { formatVersion: 5, documentation: '', properties: {} });
    if (file.path.startsWith('model/relationships/')) record.documentation = '';
    if (file.path.endsWith('/view.json')) record.properties = {};
    file.content = JSON.stringify(record);
  }
  cases.push({ name: 'unsupported future metadata v5', files: future, code: 'VERSION' });
  change('unsupported metamodel', 'schemka.json', record => { record.metamodel.version = 3; }, 'VERSION');
  change('unguarded project documentation in v2', 'schemka.json', record => { record.documentation = ''; });
  change('unguarded project properties in v2', 'schemka.json', record => { record.properties = {}; });
  change('unguarded relationship documentation in v2', 'model/relationships/', record => { record.documentation = ''; });
  const viewPath = metadataFixture().files.find(file => file.path.endsWith('/view.json')).path;
  change('unguarded view properties in v2', viewPath, record => { record.properties = {}; });
  change('missing required documentation', 'model/elements/', record => { delete record.documentation; });
  change('non-string documentation', 'model/elements/', record => { record.documentation = null; });
  change('non-string property value', 'model/junctions/', record => { record.properties = { count: 3 }; });
  change('external duplicate property rows', 'model/relationships/', record => { record.properties = [['owner', 'first'], ['owner', 'second']]; });
  for (const [name, entries] of [
    ['duplicate decoded property key', '"owner":"first","\\u006fwner":"second"'],
    ['duplicate empty property key', '"":"first","":"second"'],
  ]) {
    const { files } = metadataFixture(), file = files.find(item => item.path.startsWith('model/elements/'));
    const record = JSON.parse(file.content); delete record.properties;
    file.content = JSON.stringify(record).slice(0, -1) + `,"properties":{${entries}}}`;
    cases.push({ name, files, code: 'DUPLICATE_KEY' });
  }
  return cases;
}
