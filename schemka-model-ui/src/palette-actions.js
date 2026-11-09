import { CURRENT_CATALOG, CURRENT_METAMODEL } from '../../schemka-model-core/src/index.js';
import { creationTypes } from './profile-ui.js';
import { notationElement } from './notation.js';

const QUERY_LIMIT = 128;
const normalized = value => value.toLowerCase().replace(/\s+/gu, ' ').trim();

/** Current catalogue only. Filtering changes existing controls, never model data.
 * Domain membership uses the trusted notation descriptors, independent of the
 * current display mode. No imported name, property or SVG supplies a group.
 */
export function installPaletteActions({ document, model, beforeFilter = () => {} }) {
  const $ = id => document.getElementById(id), input = $('palette-search'), clear = $('palette-clear');
  const wand = $('smart-link-tool');
  const groups = new Map([...document.querySelectorAll('[data-palette-group]')].map(group => [group.dataset.paletteGroup, group]));
  const entries = [];
  let composing = false, lastQuery = '';
  let beforeSearch = null;
  for (const group of groups.values()) {
    const summary = group.querySelector('summary');
    // Native Enter/Space/Tab remain intact; disclosure keys must never edit the
    // previously selected model object through the document's global shortcuts.
    summary.addEventListener('keydown', event => event.stopPropagation());
    group.addEventListener('toggle', () => {
      if (!group.open && group.contains(document.activeElement) && document.activeElement !== summary) summary.focus({ preventScroll: true });
    });
  }
  for (const [kind, types] of [['element', CURRENT_CATALOG.elementTypes], ['junction', CURRENT_CATALOG.junctionTypes], ['relationship', CURRENT_CATALOG.relationshipTypes]]) {
    for (const type of types) {
      const button = $(`create-${type.toLowerCase()}`);
      const family = kind === 'junction' ? 'junctions' : kind === 'element' ? notationElement(CURRENT_METAMODEL, type).family : 'relationships';
      // Relocate once, retaining the original button, focus identity and all
      // existing click/drag listeners; later refreshes only change attributes.
      $(`palette-items-${family}`).append(button);
      const description = $(button.getAttribute('aria-describedby'));
      button.title = description.textContent;
      description.classList.add('sr-only');
      description.removeAttribute('role');
      button.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !event.isComposing && event.keyCode !== 229) event.stopPropagation();
      });
      entries.push({ kind, type, button, family, terms: [normalized(type), normalized(button.querySelector('strong').textContent)] });
    }
  }
  function refresh() {
    const state = model.store.snapshot, activeViewId = model.viewId;
    const reference = state.project.metamodel;
    const hasView = (state.views || []).some(entry => entry.view.id === activeViewId);
    $('smart-link-tool').disabled = !hasView;
    const allowed = { junction: new Set(creationTypes(reference, 'junction')), element: new Set(creationTypes(reference, 'element')), relationship: new Set(creationTypes(reference, 'relationship')) };
    const query = normalized(input.value.slice(0, QUERY_LIMIT));
    // Searching temporarily reveals matching categories. Clearing it restores
    // exactly the pre-search folds; model renders never reset disclosure state.
    if (query !== lastQuery) {
      if (query && !lastQuery) beforeSearch = new Map([...groups].map(([family, group]) => [family, group.open]));
      for (const [family, group] of groups) group.open = query ? true : beforeSearch?.get(family) ?? group.open;
      if (!query) beforeSearch = null;
      lastQuery = query;
    }
    const counts = { element: 0, junction: 0, relationship: 0 }, totals = { element: 0, junction: 0, relationship: 0 }, groupCounts = new Map();
    const active = document.activeElement;
    for (const entry of entries) {
      const known = allowed[entry.kind].has(entry.type) && (model.typeVisible?.(entry.kind, entry.type) ?? true), visible = known && entry.terms.some(term => term.includes(query));
      entry.button.hidden = !visible; entry.button.disabled = !hasView || !known;
      if (known) totals[entry.kind]++;
      if (visible) counts[entry.kind]++;
      if (visible) groupCounts.set(entry.family, (groupCounts.get(entry.family) || 0) + 1);
    }
    wand.hidden = Boolean(query && !counts.relationship && !['магическая палочка', 'magic connector', 'связь'].some(term => term.includes(query)));
    for (const [family, group] of groups) {
      group.hidden = !groupCounts.get(family) && (family !== 'relationships' || wand.hidden);
    }
    const text = `Элементы: ${counts.element} из ${totals.element} · Отношения: ${counts.relationship} из ${totals.relationship} · Junctions: ${counts.junction} из ${totals.junction}`;
    if ($('palette-results').textContent !== text) $('palette-results').textContent = text;
    $('palette-empty').hidden = !wand.hidden || counts.element + counts.relationship + counts.junction > 0;
    clear.disabled = input.value.length === 0;
    if ((wand.contains(active) && wand.hidden) || entries.some(({ button }) => button.contains(active) && (button.hidden || button.disabled))) input.focus({ preventScroll: true });
  }
  function filter() { beforeFilter(); refresh(); }
  function reset() { beforeFilter(); input.value = ''; refresh(); input.focus({ preventScroll: true }); }
  input.addEventListener('input', filter);
  input.addEventListener('search', filter); // native search-field clear controls
  input.addEventListener('compositionstart', () => { composing = true; });
  input.addEventListener('compositionend', () => { composing = false; });
  input.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || composing || event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey || !input.value) return;
    event.preventDefault(); event.stopPropagation(); reset();
  });
  clear.addEventListener('keydown', event => {
    // These controls own their keyboard interaction; Delete/F2 must never act
    // on a previously selected model object. Native Tab/Enter/Space still work.
    event.stopPropagation();
    if (event.key === 'Escape' && !composing && !event.isComposing && event.keyCode !== 229 && !event.altKey && !event.ctrlKey && !event.metaKey && input.value) {
      event.preventDefault(); reset();
    }
  });
  for (const control of [input, clear]) control.addEventListener('focus', () => {
    beforeFilter();
    if (document.activeElement !== control && !control.disabled) control.focus({ preventScroll: true });
  });
  clear.addEventListener('click', reset);
  return { refresh };
}
