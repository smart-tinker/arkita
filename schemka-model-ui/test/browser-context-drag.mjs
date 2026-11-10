import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deserializeProjectFile } from '../../schemka-model-io/src/index.js';
import { openFileDialog } from './browser-files.mjs';

/**
 * Real-browser flows for browser.mjs; execution is recorded by its caller.
 * This module uses the existing page and never launches or installs a browser.
 *
 * Flow: clean current typed demo -> palette Pointer Events and native tree drags ->
 * hit-specific menu actions -> keyboard/focus/viewport checks -> narrow buttons.
 * Real mouse drags exercise the palette pointer path and catalogue HTML5 path.
 */
export async function contextDragFlows(page, checks) {
  const desktop = { width: 1440, height: 900 };
  const menu = page.locator('#context-menu');
  const nodes = page.locator('#canvas .node');
  const activeView = () => page.locator('#view-tabs [aria-selected="true"]').getAttribute('data-view-id');
  const occurrence = id => page.locator(`#canvas [data-kind="occurrence"][data-id="${id}"]`);
  const menuItem = id => menu.locator(`[data-context-action="${id}"]`);
  const history = async () => {
    const text = await page.locator('#history-state').innerText();
    const match = text.match(/·\s*(\d+)\s+действий/);
    assert.ok(match, `Expected numeric history state, got: ${text}`); return Number(match[1]);
  };
  const reset = async () => {
    await page.setViewportSize(desktop); await page.reload(); await nodes.first().waitFor();
    assert.equal(await page.locator('#catalogue-tools').isVisible(), true);
    assert.equal(await page.locator('#create-node').isEnabled(), true);
    assert.equal(await history(), 0); assert.equal(await page.locator('#file-state').getAttribute('data-dirty'), 'false');
  };
  const snapshot = async () => {
    await openFileDialog(page);
    const pending = page.waitForEvent('download'); await page.locator('#save-project').click();
    const download = await pending; assert.equal(await download.failure(), null);
    const path = await download.path(); assert.ok(path, 'Project download must have readable bytes');
    const state = deserializeProjectFile(await readFile(path));
    await page.locator('#file-dialog [data-close]').click();
    await page.locator('#file-dialog').waitFor({ state: 'hidden' }); return state;
  };
  const focused = locator => locator.evaluate(element => document.activeElement === element);
  const assertNoDraft = async () => {
    assert.equal(await page.locator('.internal-drag-ghost').count(), 0);
    assert.equal(await page.locator('.inline-editor').count(), 0);
    assert.equal(await page.locator('dialog[open]').count(), 0);
    assert.equal(await page.locator('body').evaluate(element => element.classList.contains('is-dragging')), false);
  };
  // Select a currently exposed point by actual SVG screen geometry. This handles
  // a scrolled/clipped canvas and rejects preserveAspectRatio letterboxes.
  const canvasPoint = async (fractionX = 0.7, fractionY = 0.65, backgroundOnly = false) => {
    const point = await page.locator('#canvas').evaluate((canvas, options) => {
      const scroll = document.querySelector('#canvas-scroll');
      const rect = canvas.getBoundingClientRect(), clip = scroll.getBoundingClientRect();
      const left = Math.max(rect.left, clip.left + scroll.clientLeft, 0) + 8;
      const top = Math.max(rect.top, clip.top + scroll.clientTop, 0) + 8;
      const right = Math.min(rect.right, clip.left + scroll.clientLeft + scroll.clientWidth, innerWidth) - 8;
      const bottom = Math.min(rect.bottom, clip.top + scroll.clientTop + scroll.clientHeight, innerHeight) - 8;
      if (right <= left || bottom <= top) return null;
      const inverse = canvas.getScreenCTM()?.inverse(), box = canvas.viewBox.baseVal;
      if (!inverse) return null;
      const choices = [[options.x, options.y], [0.85, 0.85], [0.5, 0.7], [0.7, 0.3], [0.25, 0.8], [0.5, 0.5]];
      for (const [xFraction, yFraction] of choices) {
        const x = left + (right - left) * xFraction, y = top + (bottom - top) * yFraction;
        const hit = document.elementFromPoint(x, y);
        if (!hit || !canvas.contains(hit) || (options.backgroundOnly && hit.closest('[data-id]'))) continue;
        const model = new DOMPoint(x, y).matrixTransform(inverse);
        if (model.x < box.x || model.y < box.y || model.x > box.x + box.width || model.y > box.y + box.height) continue;
        return { x, y, modelX: model.x, modelY: model.y };
      }
      return null;
    }, { x: fractionX, y: fractionY, backgroundOnly });
    assert.ok(point, 'Expected a visible, unobscured SVG drop point'); return point;
  };
  const beginDrag = async (source, point, preview = true) => {
    await source.scrollIntoViewIfNeeded(); const box = await source.boundingBox(); assert.ok(box, 'Visible drag source');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down({ button: 'left' });
    try {
      await page.mouse.move(point.x, point.y, { steps: 12 });
      if (preview) await page.locator('.internal-drag-ghost').waitFor({ state: 'visible' });
    } catch (error) { await page.mouse.up({ button: 'left' }); throw error; }
  };
  const drop = async (source, point) => {
    const beforeCount = await nodes.count(), beforeHistory = await history();
    const beforeElements = await page.locator('.catalog .element-button').count();
    const retained = await nodes.first().elementHandle(); assert.ok(retained);
    const palette = await source.getAttribute('data-drag-type') !== null;
    await beginDrag(source, point, palette);
    try {
      if (palette) assert.equal(await page.locator('.internal-drag-ghost').getAttribute('data-valid'), 'true');
      assert.equal(await nodes.count(), beforeCount); assert.equal(await history(), beforeHistory);
      assert.equal(await page.locator('.catalog .element-button').count(), beforeElements);
      assert.equal(await retained.evaluate(element => element.isConnected), true, 'Preview must retain the existing SVG node');
    } finally { await page.mouse.up({ button: 'left' }); await retained.dispose(); }
    await page.waitForFunction(count => document.querySelectorAll('#canvas .node').length === count, beforeCount + 1);
    assert.equal(await history(), beforeHistory + 1); await assertNoDraft();
    const selected = page.locator('#canvas .node[aria-pressed="true"]'); assert.equal(await selected.count(), 1);
    const result = { occurrenceId: await selected.getAttribute('data-id'), elementId: await selected.getAttribute('data-rename-id') };
    assert.ok(result.occurrenceId && result.elementId); return result;
  };
  const assertBounds = (record, point, centered = true) => {
    assert.equal(record.bounds.width, 210); assert.equal(record.bounds.height, 90);
    assert.ok(Math.abs(record.bounds.x - Math.round((point.modelX - (centered ? 105 : 0)) * 10) / 10) < 0.001);
    assert.ok(Math.abs(record.bounds.y - Math.round((point.modelY - (centered ? 45 : 0)) * 10) / 10) < 0.001);
  };
  const assertMenuInViewport = async () => {
    const box = await menu.boundingBox(); assert.ok(box);
    const viewport = page.viewportSize(); assert.ok(viewport);
    assert.ok(box.x >= 0 && box.y >= 0, `Menu starts outside viewport: ${JSON.stringify(box)}`);
    assert.ok(box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1,
      `Menu extends outside viewport: ${JSON.stringify(box)}`);
    assert.equal(await menu.evaluate(element => getComputedStyle(element).overflowY), 'auto');
  };

  await reset();
  const baseline = await snapshot(), viewId = await activeView();
  assert.equal(baseline.project.metamodel.version, 2);
  assert.equal(baseline.project.metamodel.id, 'schemka-archimate4');
  const palettePoint = await canvasPoint(0.65, 0.75);
  const added = await drop(page.locator('#create-node'), palettePoint);
  const withNode = await snapshot(), addedElement = withNode.elements.find(item => item.id === added.elementId);
  assert.equal(addedElement.type, 'Node'); assert.equal(addedElement.name, 'Новый Node');
  assert.equal(withNode.elements.length, baseline.elements.length + 1);
  assert.deepEqual(withNode.elements.filter(item => item.id !== added.elementId), baseline.elements);
  assert.deepEqual(withNode.relationships, baseline.relationships);
  const firstAddedOccurrence = withNode.views.find(entry => entry.view.id === viewId).occurrences.find(item => item.id === added.occurrenceId);
  assert.equal(firstAddedOccurrence.concept.id, added.elementId); assertBounds(firstAddedOccurrence, palettePoint);
  assert.deepEqual(withNode.views.filter(entry => entry.view.id !== viewId), baseline.views.filter(entry => entry.view.id !== viewId));
  checks.push('physical palette→canvas Node drag: transient preview, retained SVG DOM, exact transformed drop bounds, one new shared element/occurrence and one history step');

  const treeSource = () => page.locator(`.catalog [data-element-id="${added.elementId}"]`);
  const reused = [];
  for (const [x, y] of [[0.35, 0.65], [0.75, 0.35]]) {
    const point = await canvasPoint(x, y); const result = await drop(treeSource(), point);
    assert.equal(result.elementId, added.elementId); assert.notEqual(result.occurrenceId, added.occurrenceId); reused.push(result.occurrenceId);
    const state = await snapshot(), record = state.views.find(entry => entry.view.id === viewId).occurrences.find(item => item.id === result.occurrenceId);
    assert.equal(record.concept.id, added.elementId); assertBounds(record, point, false);
    assert.deepEqual(state.elements, withNode.elements); assert.deepEqual(state.relationships, withNode.relationships);
    assert.deepEqual(state.views.filter(entry => entry.view.id !== viewId), withNode.views.filter(entry => entry.view.id !== viewId));
  }
  assert.notEqual(reused[0], reused[1]);
  assert.equal(await page.locator(`#canvas .node[data-rename-id="${added.elementId}"]`).count(), 3);
  checks.push('two physical tree→canvas drags reuse the same downloaded element ID, create distinct occurrence IDs and preserve shared model/other views');

  for (const cancel of ['Escape', 'outside']) {
    const before = await snapshot(), beforeHistory = await history(), beforeCount = await nodes.count();
    await beginDrag(page.locator('#create-device'), await canvasPoint(0.5, 0.55));
    try {
      if (cancel === 'Escape') await page.keyboard.press('Escape');
      else {
        const header = await page.locator('#project-name').boundingBox(); assert.ok(header);
        await page.mouse.move(header.x + header.width / 2, header.y + header.height / 2, { steps: 8 });
        assert.equal(await page.locator('.internal-drag-ghost').getAttribute('data-valid'), 'false');
      }
    } finally { await page.mouse.up({ button: 'left' }); }
    await assertNoDraft(); assert.equal(await nodes.count(), beforeCount); assert.equal(await history(), beforeHistory);
    assert.deepEqual(await snapshot(), before);
  }
  checks.push('physical palette drags cancelled by Escape or release outside the canvas leave downloaded model/history unchanged and open no synthetic click dialog');

  await reset(); const initial = await snapshot(), contextViewId = await activeView();
  const ids = await nodes.evaluateAll(elements => elements.map(element => ({ occurrenceId: element.dataset.id, elementId: element.dataset.renameId })));
  assert.ok(ids.length >= 2); const selectedA = ids[0], hitB = ids[1];
  const selectA = async () => { await occurrence(selectedA.occurrenceId).focus(); await page.keyboard.press('Enter'); };
  await selectA(); await occurrence(hitB.occurrenceId).click({ button: 'right' }); await menu.waitFor({ state: 'visible' });
  assert.equal(await occurrence(selectedA.occurrenceId).getAttribute('aria-pressed'), 'true');
  assert.equal(await occurrence(hitB.occurrenceId).getAttribute('aria-pressed'), 'false'); assert.equal(await history(), 0);
  assert.equal(await menuItem('remove-occurrence').isVisible(), true); assert.equal(await menuItem('delete-element').isVisible(), true);
  assert.equal(await menu.locator('[data-context-action^="relation-"]').count(),0);
  await menuItem('remove-occurrence').hover(); assert.equal(await focused(menuItem('remove-occurrence')),true);
  assert.equal(await menu.locator('[role="menuitem"]:focus').count(),1); assert.equal(await history(),0);
  await menuItem('properties').click();
  assert.equal(await page.locator('#inspector-panel').isVisible(),true);
  assert.equal(await page.locator('#inspector-content .object-name').innerText(),initial.elements.find(item=>item.id===hitB.elementId).name);
  await page.keyboard.press('Escape'); assert.equal(await page.locator('#inspector-panel').isVisible(),false);
  assert.equal(await history(),0); assert.deepEqual(await snapshot(),initial);
  await selectA(); await occurrence(hitB.occurrenceId).click({button:'right'});
  await menuItem('rename').click();
  assert.equal(await page.locator('.inline-editor input').inputValue(), initial.elements.find(item => item.id === hitB.elementId).name);
  await page.locator('.inline-editor input').fill('Context hit target only'); await page.keyboard.press('Enter');
  assert.equal(await menu.isVisible(), false); assert.equal(await history(), 1);
  const renamed = await snapshot(), expectedRename = structuredClone(initial);
  expectedRename.elements.find(item => item.id === hitB.elementId).name = 'Context hit target only'; assert.deepEqual(renamed, expectedRename);
  await page.locator('#undo').click(); assert.deepEqual(await snapshot(), initial);
  await selectA(); await occurrence(hitB.occurrenceId).click({ button: 'right' }); await menuItem('remove-occurrence').click();
  await page.locator('#delete-dialog [data-close]').click(); assert.equal(await history(), 0); assert.deepEqual(await snapshot(), initial);
  await selectA(); await occurrence(hitB.occurrenceId).click({ button: 'right' }); await menuItem('remove-occurrence').click();
  await page.locator('#delete-confirm').click();
  assert.equal(await occurrence(hitB.occurrenceId).count(), 0); assert.equal(await occurrence(selectedA.occurrenceId).count(), 1);
  const removed = await snapshot(), expectedRemoval = structuredClone(initial), changedView = expectedRemoval.views.find(entry => entry.view.id === contextViewId);
  changedView.occurrences = changedView.occurrences.filter(item => item.id !== hitB.occurrenceId);
  changedView.connections = changedView.connections.filter(item => item.source.id !== hitB.occurrenceId && item.target.id !== hitB.occurrenceId);
  assert.deepEqual(removed, expectedRemoval); assert.equal(await history(), 1);
  await page.locator('#undo').click(); assert.deepEqual(await snapshot(), initial);
  checks.push('right-click hit B preserves selection A until an action; hover follows one item; properties/rename/remove target B exactly; no create-from relation entries; cancel/undo preserve shared IDs and other views');

  await reset();
  const keyboardTarget = nodes.nth(1); await keyboardTarget.focus(); await page.keyboard.press('Shift+F10');
  await menu.waitFor({ state: 'visible' }); assert.equal(await focused(menu.locator('[role="menuitem"]').first()), true);
  const itemCount = await menu.locator('[role="menuitem"]').count(); assert.ok(itemCount > 2);
  await page.keyboard.press('ArrowUp'); assert.equal(await focused(menu.locator('[role="menuitem"]').last()), true);
  await page.keyboard.press('ArrowDown'); assert.equal(await focused(menu.locator('[role="menuitem"]').first()), true);
  await page.keyboard.press('ArrowDown'); assert.equal(await focused(menu.locator('[role="menuitem"]').nth(1)), true);
  await page.keyboard.press('End'); assert.equal(await focused(menuItem('redo')), true);
  assert.equal(await menuItem('redo').getAttribute('aria-disabled'), 'true'); assert.equal(await menuItem('redo').evaluate(element => element.disabled), false);
  await page.keyboard.press('Enter'); assert.equal(await menu.isVisible(), true); assert.equal(await history(), 0);
  await page.keyboard.press('Home'); assert.equal(await focused(menu.locator('[role="menuitem"]').first()), true);
  await page.keyboard.press('Escape'); assert.equal(await menu.isVisible(), false); assert.equal(await focused(keyboardTarget), true);
  for (const tab of ['Tab', 'Shift+Tab']) {
    await keyboardTarget.focus(); await page.keyboard.press('Shift+F10'); await menu.waitFor({ state: 'visible' });
    await page.keyboard.press(tab); assert.equal(await menu.isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement !== document.body && document.activeElement.isConnected &&
      !document.activeElement.closest('#context-menu') && document.activeElement.getClientRects().length > 0), true);
    assert.equal(await focused(keyboardTarget), false, `${tab} should continue normal traversal beyond the invoking target`);
  }
  await keyboardTarget.focus(); await page.keyboard.press('Shift+F10'); await page.keyboard.press('Space');
  await page.locator('#inspector-panel').waitFor({state:'visible'}); await page.keyboard.press('Escape'); assert.equal(await history(),0);
  await keyboardTarget.focus(); await page.keyboard.press('Shift+F10'); await menuItem('rename').focus(); await page.keyboard.press('Space');
  await page.locator('.inline-editor input').waitFor(); await page.keyboard.press('Escape'); assert.equal(await history(), 0);
  const edge = await canvasPoint(0.98, 0.98, true);
  await page.mouse.click(edge.x, edge.y, { button: 'right' }); await menu.waitFor({ state: 'visible' });
  assert.deepEqual(await menu.locator('[data-context-action]').evaluateAll(items => items.map(item => item.dataset.contextAction)), ['new-view', 'duplicate-view', 'fit', 'undo', 'redo']);
  assert.equal(await menuItem('fit').isVisible(), true); await assertMenuInViewport();
  await page.keyboard.press('End'); assert.equal(await focused(menu.locator('[role="menuitem"]').last()), true);
  await page.keyboard.press('Escape'); await assertNoDraft();
  checks.push('Shift+F10 menu, first focus, arrow wrap/Home/End, focusable disabled commands, Enter/Space/Escape and untrapped Tab/Shift+Tab; measured desktop edge clamp');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-panel="inspector"]').click();
  const create = page.locator('#create-device'); await create.scrollIntoViewIfNeeded(); await create.focus(); await page.keyboard.press('Enter');
  await page.locator('#element-name').fill('Narrow button-created Device'); await page.locator('#edit-submit').click();
  assert.equal(await page.locator('.canvas-panel').isVisible(), true); assert.equal(await history(), 1); await assertNoDraft();
  const mobileSelected = page.locator('#canvas .node[aria-pressed="true"]');
  const mobileElementId = await mobileSelected.getAttribute('data-rename-id'); assert.ok(mobileElementId);
  const mobileCount = await nodes.count(), mobileElementCount = await page.locator('.catalog .element-button').count();
  await page.locator('[data-panel="catalog"]').click();
  const addButton = page.locator(`.catalog .tree-add-element[data-add-element-id="${mobileElementId}"]`);
  await addButton.scrollIntoViewIfNeeded(); await addButton.focus(); await page.keyboard.press('Enter');
  assert.equal(await nodes.count(), mobileCount + 1); assert.equal(await page.locator('.catalog .element-button').count(), mobileElementCount);
  assert.equal(await page.locator(`#canvas .node[data-rename-id="${mobileElementId}"]`).count(), 2); assert.equal(await history(), 2);
  await page.locator('[data-panel="catalog"]').click();
  const mobileTree = page.locator(`.catalog .element-button[data-element-id="${mobileElementId}"]`);
  await mobileTree.scrollIntoViewIfNeeded(); await mobileTree.focus(); await page.keyboard.press('Shift+F10');
  await menu.waitFor({ state: 'visible' }); assert.equal(await menuItem('reuse-element').isVisible(), true); await assertMenuInViewport();
  await page.keyboard.press('Escape'); assert.equal(await focused(mobileTree), true); await assertNoDraft();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  checks.push('390×844 button/keyboard alternatives create Device and reuse its shared ID; tree menu stays within viewport, restores focus and causes no horizontal overflow (no touch-drag claim)');

  await reset();
}
