/** Synthetic fixtures follow the writer; captured V2/V3 fixtures never use this helper. */
export function completeCurrentFixture(state) {
  state.folders ??= []; state.assets ??= [];
  for (const item of [state.project, ...state.elements, ...state.junctions, ...state.relationships, ...state.views.map(entry => entry.view)]) {
    if (!Array.isArray(item.properties)) item.properties = Object.entries(item.properties).map(([key, value]) => ({ key, value }));
  }
  for (const entry of state.views) {
    entry.visualNodes = []; entry.visualConnectors = [];
    for (const item of entry.occurrences) { delete item.parentOccurrenceId; item.parent = null; item.style = {}; }
    for (const item of entry.connections) item.style = {};
  }
  return state;
}
