import { assertJSON, fail, record } from './json.js';
import { conceptRecord, projectIndex } from './format.js';

/** A metadata owner includes project/view IDs; it is never a model ConceptRef. */
export function metadataRecord(state, owner) {
  assertJSON(owner); record(owner, ['kind', 'id'], ['viewId']);
  if (['visualNode', 'visualConnector'].includes(owner.kind)) {
    if (typeof owner.viewId !== 'string') fail('REFERENCE', 'Visual metadata needs its view ID');
    const entry = state.views.find(item => item.view.id === owner.viewId);
    const item = entry?.[owner.kind === 'visualNode' ? 'visualNodes' : 'visualConnectors']?.find(item => item.id === owner.id);
    if (!item) fail('REFERENCE', 'Visual metadata owner does not exist in its named view');
    return item;
  }
  if (Object.hasOwn(owner, 'viewId')) fail('SCHEMA', 'Only visual metadata owners carry a view ID');
  if (owner.kind === 'folder') {
    const item = state.folders.find(item => item.id === owner.id);
    if (!item) fail('REFERENCE', 'Metadata folder does not exist');
    return item;
  }
  if (owner.kind === 'project') {
    if (state.project.id !== owner.id) fail('REFERENCE', 'Metadata project does not exist');
    return state.project;
  }
  if (owner.kind === 'view') {
    const entry = state.views.find(item => item.view.id === owner.id);
    if (!entry) fail('REFERENCE', 'Metadata view does not exist');
    return entry.view;
  }
  return conceptRecord(projectIndex(state), owner);
}
