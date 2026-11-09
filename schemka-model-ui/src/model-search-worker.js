import { searchModel, planNameReplacement } from '../../schemka-model-core/src/model-search.js';

self.addEventListener('message', event => {
  const { state, options, replacement, owners } = event.data;
  try { self.postMessage({ result: replacement === null ? searchModel(state, options) : planNameReplacement(state, options, replacement, owners) }); }
  catch (error) { self.postMessage({ error: { message: error.message } }); }
});
