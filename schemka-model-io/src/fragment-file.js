import { exportFiles, readPortableFragment, SchemkaError } from '../../schemka-model-core/src/index.js';
import { readProjectFile, serializeProjectFile, PROJECT_FILE_LIMITS } from './project-file.js';

export const FRAGMENT_FILE_PREFIX = 'ARKITA-FRAGMENT/1\n';
export const FRAGMENT_TEXT_LIMIT = PROJECT_FILE_LIMITS.bytes + 128;
const id = /^view-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Only a marked V4 native envelope is a model fragment; ordinary clipboard text stays text. */
export function serializeFragmentText(fragment) {
  const { state } = readPortableFragment(fragment);
  return FRAGMENT_FILE_PREFIX + fragment.viewId + '\n' + new TextDecoder().decode(serializeProjectFile(state));
}
export function deserializeFragmentText(text) {
  const fail = () => { throw new SchemkaError('FRAGMENT_VERSION', 'Буфер не содержит поддерживаемый переносимый фрагмент Arkita.'); };
  if (typeof text !== 'string' || !text.startsWith(FRAGMENT_FILE_PREFIX) || text.length > FRAGMENT_TEXT_LIMIT || new TextEncoder().encode(text).length > FRAGMENT_TEXT_LIMIT) fail();
  const end = text.indexOf('\n',FRAGMENT_FILE_PREFIX.length), viewId = text.slice(FRAGMENT_FILE_PREFIX.length,end);
  if (end < 0 || !id.test(viewId)) fail();
  const { state, sourceVersion } = readProjectFile(text.slice(end+1)); if (sourceVersion !== 4) fail();
  const fragment = { format: 'arkita-portable-fragment', version: 1, viewId, files: exportFiles(state) }; readPortableFragment(fragment); return fragment;
}
