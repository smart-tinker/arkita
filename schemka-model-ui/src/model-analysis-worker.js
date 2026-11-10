// Import the read-only graph module directly; the store/profile command graph is unnecessary here.
import { queryModelGraph } from '../../schemka-model-core/src/model-graph.js';

// One immutable request per worker. Termination cancels validation and traversal together.
self.addEventListener('message', event => {
  try { self.postMessage({ result: queryModelGraph(event.data.state, event.data.options) }); }
  catch (error) { self.postMessage({ error: { message: error.message } }); }
});
