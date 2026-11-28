import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { deserializeProjectFile, serializeProjectFile } from '../../schemka-model-io/src/index.js';
import { generateHtmlReport } from '../../schemka-model-io/src/report.js';
import { readTemplate } from '../../schemka-model-io/src/templates.js';
import { EXAMPLE_AUTOMATION } from '../../schemka-model-io/src/automation.js';
import { openFileDialog } from './browser-files.mjs';

class BlockedError extends Error {}

function canvasFixture() {
  const store = createStore(createProject('Canvas browser smoke'));
  const run = command => store.execute(command, store.revision).created;
  const { viewId } = run({ type: 'createView', name: 'Canvas' });
  const block = run({
    type: 'createVisualNode', viewId, kind: 'note', name: 'Instruction block', text: 'Card',
    instruction: '**Purpose**\n\n<script>window.canvasPwned = true</script>',
    bounds: { x: 40, y: 40, width: 220, height: 120 }
  }).visualNodeId;
  const target = run({
    type: 'createVisualNode', viewId, kind: 'group', name: 'Target',
    bounds: { x: 440, y: 40, width: 220, height: 120 }
  }).visualNodeId;
  run({
    type: 'createVisualConnector', viewId, name: 'Source label',
    properties: [{ key: 'owner', value: 'Team A' }],
    source: { kind: 'visualNode', id: block }, target: { kind: 'visualNode', id: target },
    style: { labelTemplate: '${name} · ${property:owner}' }
  });
  return { block, bytes: Buffer.from(serializeProjectFile(store.snapshot)) };
}

async function verifyReportPdf(browser) {
  const store = createStore(createProject('Synthetic print report'));
  const execute = command => store.execute(command, store.revision).created;
  const { viewId } = execute({ type: 'createView', name: 'Print view' });
  for (let index = 0; index < 30; index += 1) {
    execute({
      type: 'createElementAndOccurrence',
      viewId,
      elementType: 'Role',
      name: 'Print item ' + (index + 1),
      bounds: { x: 20, y: 20 + index * 10, width: 220, height: 80 },
      documentation: 'Synthetic printable content for A4 pagination. '.repeat(12)
    });
  }

  const modelBytes = Buffer.from(serializeProjectFile(store.snapshot));
  const html = generateHtmlReport(store.snapshot, {
    revision: store.revision,
    generatedAt: '2026-01-01T00:00:00.000Z'
  });
  assert.deepEqual(Buffer.from(serializeProjectFile(store.snapshot)), modelBytes, 'report generation preserves model bytes');

  const reportPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const externalRequests = [], pageErrors = [];
  reportPage.on('request', request => {
    if (request.url().startsWith('http:') || request.url().startsWith('https:')) externalRequests.push(request.url());
  });
  reportPage.on('pageerror', error => pageErrors.push(error.message));
  reportPage.on('console', message => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });
  let parsed;
  try {
    await reportPage.setContent(html, { waitUntil: 'load' });
    const headings = await reportPage.locator('h1, h2').allTextContents();
    assert.deepEqual(headings, [
      'Synthetic print report', 'Модель', 'Представления', 'Объекты',
      'Отношения', 'Папки', 'Свойства'
    ], 'screen report keeps its title and all six sections');

    const screenBefore = await reportPage.screenshot();
    await reportPage.emulateMedia({ media: 'print' });
    const pdf = await reportPage.pdf({
      format: 'A4',
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      printBackground: true
    });
    await reportPage.emulateMedia({ media: 'screen' });
    assert.deepEqual(await reportPage.screenshot(), screenBefore, 'printing leaves the screen rendering unchanged');

    const readback = spawnSync('pdftotext', ['-bbox', '-', '-'], {
      input: pdf,
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024
    });
    if (readback.error?.code === 'ENOENT') {
      throw new BlockedError('pdftotext is unavailable. Install poppler-utils in the Ubuntu renderer smoke job.');
    }
    assert.equal(readback.error, undefined, 'pdftotext starts successfully');
    assert.equal(readback.status, 0, 'pdftotext reads the generated PDF: ' + readback.stderr);

    parsed = new JSDOM(readback.stdout, { contentType: 'application/xhtml+xml' });
    const pages = Array.from(parsed.window.document.getElementsByTagName('page'));
    assert.ok(pages.length >= 2, 'A4 report spans multiple pages');
    const marginPt = 12 * 72 / 25.4;
    const tolerancePt = 2;
    const a4WidthPt = 210 * 72 / 25.4;
    const a4HeightPt = 297 * 72 / 25.4;
    let minimumInsetPt = Infinity;
    const pdfWords = [];

    pages.forEach((page, pageIndex) => {
      const width = Number(page.getAttribute('width'));
      const height = Number(page.getAttribute('height'));
      assert.ok(Math.abs(width - a4WidthPt) < 1, 'PDF page width is A4');
      assert.ok(Math.abs(height - a4HeightPt) < 1, 'PDF page height is A4');
      const words = Array.from(page.getElementsByTagName('word')).map(word => ({
        text: word.textContent.trim(),
        xMin: Number(word.getAttribute('xMin')),
        yMin: Number(word.getAttribute('yMin')),
        xMax: Number(word.getAttribute('xMax')),
        yMax: Number(word.getAttribute('yMax'))
      }));
      const counters = words.filter(word =>
        /^[0-9]+$/.test(word.text) &&
        Math.abs((word.xMin + word.xMax) / 2 - width / 2) <= 12 &&
        word.yMin >= height - marginPt - tolerancePt
      );
      assert.equal(counters.length, 1, 'PDF page ' + (pageIndex + 1) + ' has one centered bottom counter');
      assert.equal(counters[0].text, String(pageIndex + 1), 'PDF counter is sequential on page ' + (pageIndex + 1));

      for (const word of words) {
        if (word === counters[0]) continue;
        const insetPt = Math.min(word.xMin, word.yMin, width - word.xMax, height - word.yMax);
        minimumInsetPt = Math.min(minimumInsetPt, insetPt);
        assert.ok(insetPt >= marginPt - tolerancePt, 'text stays within the 12 mm print margins with 2 pt tolerance');
        pdfWords.push(word.text);
      }
    });

    const pdfText = pdfWords.join(' ');
    for (const heading of headings) assert.ok(pdfText.includes(heading), 'PDF preserves heading: ' + heading);
    assert.deepEqual(Buffer.from(serializeProjectFile(store.snapshot)), modelBytes, 'PDF generation preserves model bytes');
    assert.deepEqual(externalRequests, [], 'offline report makes no external requests');
    assert.deepEqual(pageErrors, [], 'report browser has no uncaught errors');
    const minimumInsetMm = (minimumInsetPt * 25.4 / 72).toFixed(2);
    console.log('PASS: report PDF smoke · A4 · ' + pages.length + ' pages · counters 1-' + pages.length +
      ' · minimum text inset ' + minimumInsetMm + ' mm · screen/model unchanged');
  } finally {
    parsed?.window.close();
    await reportPage.close();
  }
}

async function verifyReportQueryNavigation(browser) {
  const store = createStore(createProject('Synthetic report query navigation'));
  const execute = command => store.execute(command, store.revision).created;
  const folderId = execute({ type: 'createFolder', name: 'Hidden report folder' }).folderId;
  const targetId = execute({ type: 'createElementInModel', elementType: 'Role', name: 'Query-linked hidden target', documentation: 'analytic-only-marker', folderId }).elementId;
  const matchingId = execute({ type: 'createElementInModel', elementType: 'Role', name: 'Ordinary search match', documentation: 'ordinary-match' }).elementId;
  const otherId = execute({ type: 'createElementInModel', elementType: 'Role', name: 'Other hidden row', documentation: 'different text' }).elementId;
  const modelBytes = Buffer.from(serializeProjectFile(store.snapshot));
  const html = generateHtmlReport(store.snapshot, { revision: store.revision, generatedAt: '2026-01-01T00:00:00.000Z' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.setDefaultTimeout(10_000);
  const externalRequests = [];
  page.on('request', request => {
    if (request.url().startsWith('http:') || request.url().startsWith('https:')) externalRequests.push(request.url());
  });
  try {
    await page.setContent(html, { waitUntil: 'load' });
    const target = page.locator('article[data-owner="' + targetId + '"]');
    const matching = page.locator('article[data-owner="' + matchingId + '"]');
    const other = page.locator('article[data-owner="' + otherId + '"]');
    const folderFilter = page.locator('input[data-filter="' + folderId + '"]');
    const search = page.locator('#report-search');
    const rowStates = () => page.locator('article[data-owner]').evaluateAll(rows =>
      rows.map(row => ({ id: row.dataset.owner, hidden: row.hidden }))
    );
    const filterStates = () => page.locator('[data-filter]').evaluateAll(inputs =>
      inputs.map(input => ({ filter: input.dataset.filter, checked: input.checked }))
    );

    const navigationDetails = page.locator('header details').filter({ has: folderFilter });
    await navigationDetails.locator(':scope > summary').click();
    assert.equal(await navigationDetails.evaluate(details => details.open), true, 'folder filters open through their visible summary');
    await folderFilter.uncheck();
    await search.fill('ordinary-match');
    assert.equal(await target.isVisible(), false, 'folder filter and ordinary search hide the target');
    assert.equal(await matching.isVisible(), true, 'ordinary search preserves its matching row');
    assert.equal(await other.isVisible(), false, 'ordinary search hides a nonmatching row');
    const rowsBeforeClick = await rowStates(), filtersBeforeClick = await filterStates();

    const queryDetails = page.locator('header details').filter({ has: page.locator('#query-form') });
    await queryDetails.locator(':scope > summary').click();
    assert.equal(await queryDetails.evaluate(details => details.open), true, 'query controls open through their visible summary');
    await page.locator('#query-table').selectOption('element');
    await page.locator('#query-field').selectOption('documentation');
    await page.locator('#query-value').fill('analytic-only-marker');
    await page.locator('#query-form button').first().click();
    const resultLinks = page.locator('#query-result a');
    await resultLinks.first().waitFor({ state: 'visible' });
    assert.equal(await resultLinks.count(), 1, 'analytical query finds only the hidden target');
    assert.equal(await resultLinks.getAttribute('href'), '#' + targetId, 'query result links to the exact saved record');
    assert.equal(await resultLinks.textContent(), 'Query-linked hidden target · ' + targetId);

    await resultLinks.click();
    assert.equal(await target.isVisible(), true, 'real query-result click reveals the hidden target');
    assert.equal(await target.getAttribute('id'), targetId);
    assert.equal(await target.locator('h3').textContent(), 'Query-linked hidden target');
    assert.deepEqual(await rowStates(), rowsBeforeClick.map(row =>
      row.id === targetId ? { ...row, hidden: false } : row
    ), 'the link changes only its target row');
    assert.deepEqual(await filterStates(), filtersBeforeClick, 'navigation filters remain unchanged');
    assert.equal(await search.inputValue(), 'ordinary-match', 'ordinary search remains unchanged');
    assert.equal(await folderFilter.isChecked(), false, 'hidden-folder filter remains active');
    assert.deepEqual(Buffer.from(serializeProjectFile(store.snapshot)), modelBytes, 'report navigation preserves source model bytes');
    assert.deepEqual(externalRequests, [], 'offline report makes no external requests');
    console.log('PASS: report query navigation smoke · hidden target revealed; other rows, filters, search and model bytes unchanged');
  } finally {
    await page.close();
  }
}
async function run() {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new BlockedError('Playwright is not installed. Run npm ci --ignore-scripts, then npm exec playwright install chromium.');
  }

  const server = spawn(process.execPath, [fileURLToPath(new URL('../serve.mjs', import.meta.url))], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit']
  });
  let browser;
  try {
    const url = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Renderer server did not become ready within 10 seconds.')), 10_000);
      server.stdout.setEncoding('utf8');
      server.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/schemka-model-ui\/index\.html/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      server.once('error', error => { clearTimeout(timer); reject(error); });
      server.once('exit', code => { clearTimeout(timer); reject(new Error(`Renderer server exited before ready (${code}).`)); });
    });

    try {
      browser = await chromium.launch({ headless: true });
    } catch (error) {
      throw new BlockedError(`Chromium runtime is unavailable: ${error.message}. Run npm exec playwright install chromium and install the documented Linux system dependencies.`);
    }
    const page = await browser.newPage({ acceptDownloads: true, viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(10_000);
    const pageErrors = [], failedRequests = [], watch = target => {
      target.on('pageerror', error => pageErrors.push(error.message));
      target.on('console', message => { if (message.type() === 'error') pageErrors.push(message.text()); });
      target.on('requestfailed', request => failedRequests.push(request.url()));
      target.on('response', response => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`); });
    };
    watch(page);

    const saveThroughBrowser = async () => {
      await openFileDialog(page);
      const pending = page.waitForEvent('download');
      await page.locator('#save-project').click();
      const download = await pending;
      const bytes = await readFile(await download.path());
      await page.locator('#file-dialog [data-close]').click();
      return bytes;
    };

    await page.goto(url);
    await page.locator('#canvas .node').first().waitFor();
    await page.waitForFunction(() => document.querySelector('#file-state')?.dataset.dirty === 'false');
    assert.equal(await page.locator('#file-state').textContent(), 'Учебный пример · файл не скачан');

    const initialBytes = await saveThroughBrowser();
    const initial = deserializeProjectFile(initialBytes);
    assert.equal(initial.views.length, 2, 'synthetic demo starts with two views');
    assert.ok(initial.relationships.length > 0, 'synthetic demo contains relationships');
    const firstConcepts = new Set(initial.views[0].occurrences.map(item => item.concept.id));
    assert.ok(initial.views[1].occurrences.some(item => firstConcepts.has(item.concept.id)), 'both views share a concept');
    const initialViewIds = initial.views.map(item => item.view.id);
    const initialHistory = await page.locator('#history-state').textContent();

    const templateMenu = page.locator('.app-menu').filter({ has: page.locator('#templates-button') });
    if (!(await templateMenu.evaluate(menu => menu.open))) await templateMenu.locator(':scope > summary').click();
    await page.locator('#templates-button').click();
    await page.locator('#templates-dialog').waitFor({ state: 'visible' });
    await page.getByText('Сохранить и изменить шаблон', { exact: true }).click();
    await page.locator('#template-name').fill('Browser smoke template');
    const keyViewId = initialViewIds[1];
    await page.locator('#template-key-view').selectOption(keyViewId);
    await page.locator('#template-save-current').click();

    const templateLibraryBytes = await page.evaluate(() => localStorage.getItem('arkita.templates.v1'));
    assert.ok(templateLibraryBytes, 'saved template is present in the local library');
    const templateLibrary = JSON.parse(templateLibraryBytes);
    assert.equal(templateLibrary.templates.length, 1);
    const savedTemplate = readTemplate(templateLibrary.templates[0]);
    assert.equal(savedTemplate.metadata.keyViewId, keyViewId);
    assert.deepEqual(savedTemplate.snapshot.views.map(item => item.view.id), initialViewIds);

    const previewView = page.locator('#template-preview-view');
    const preview = page.locator('#template-preview');
    const previewSnapshot = async () => {
      const source = await preview.getAttribute('src');
      assert.ok(source?.startsWith('data:image/svg+xml;charset=utf-8,'));
      return page.evaluate(encoded => {
        const svg = new DOMParser().parseFromString(decodeURIComponent(encoded), 'image/svg+xml').documentElement;
        return {
          title: svg.children[0]?.localName === 'title' ? svg.children[0].textContent : null,
          transforms: Array.from(svg.querySelectorAll(':scope > g[transform]')).map(group => group.getAttribute('transform')),
          text: Array.from(svg.querySelectorAll('text')).map(item => item.textContent).join(' ')
        };
      }, source.slice(source.indexOf(',') + 1));
    };
    const detailOnly = initial.views[1].occurrences.find(item =>
      !initial.views[0].occurrences.some(other => other.concept.id === item.concept.id)
    );
    assert.ok(detailOnly, 'synthetic detail view has a unique concept');
    const detailConcept = initial.elements.find(item => item.id === detailOnly.concept.id);
    assert.ok(detailConcept);
    const detailLabel = detailOnly.text ?? detailOnly.name ?? detailConcept.name;
    assert.ok(detailLabel, 'detail-only concept has visible text');
    const firstView = savedTemplate.snapshot.views.find(item => item.view.id === initialViewIds[0]);
    const detailView = savedTemplate.snapshot.views.find(item => item.view.id === initialViewIds[1]);
    assert.ok(firstView && detailView);
    const firstBounds = firstView.occurrences[0].bounds;
    const detailBounds = detailView.occurrences.find(item => item.concept.id === detailOnly.concept.id).bounds;
    const firstTransform = 'translate(' + firstBounds.x + ' ' + firstBounds.y + ')';
    const detailTransform = 'translate(' + detailBounds.x + ' ' + detailBounds.y + ')';
    assert.deepEqual(
      await previewView.locator('option').evaluateAll(options => options.map(option => option.value)),
      initialViewIds
    );
    assert.equal(await previewView.inputValue(), keyViewId, 'key view ID selects the initial preview');
    assert.equal(await preview.getAttribute('alt'), 'Предпросмотр: ' + initial.views[1].view.name);
    const keyViewSVG = await previewSnapshot();
    assert.equal(keyViewSVG.title, initial.views[1].view.name, 'decoded SVG root title follows the key view');
    assert.ok(keyViewSVG.transforms.includes(detailTransform), 'detail preview SVG includes its drawing group geometry');
    assert.ok(keyViewSVG.text.includes(detailLabel), 'detail preview SVG renders its unique concept');

    const previewPanel = await previewView.locator('xpath=ancestor::details[1]').boundingBox();
    const title = await page.locator('#templates-title').boundingBox();
    assert.ok(previewPanel && title, 'preview panel and dialog title are visible');
    const outside = { x: title.x + title.width / 2, y: title.y + title.height / 2 };
    assert.ok(
      outside.x < previewPanel.x || outside.x > previewPanel.x + previewPanel.width ||
        outside.y < previewPanel.y || outside.y > previewPanel.y + previewPanel.height,
      'keyboard navigation is exercised with the pointer outside the preview panel'
    );

    await previewView.focus();
    await page.mouse.move(outside.x, outside.y);
    await page.keyboard.press('ArrowUp');
    await page.waitForFunction(viewId => document.querySelector('#template-preview-view')?.value === viewId, initialViewIds[0]);
    assert.equal(await preview.getAttribute('alt'), 'Предпросмотр: ' + initial.views[0].view.name);
    const firstViewSVG = await previewSnapshot();
    assert.equal(firstViewSVG.title, initial.views[0].view.name, 'decoded SVG root title follows the selected view');
    assert.ok(firstViewSVG.transforms.includes(firstTransform), 'first-view SVG includes its drawing group geometry');
    assert.ok(!firstViewSVG.text.includes(detailLabel), 'first-view SVG excludes the detail-only concept');
    assert.notDeepEqual(firstViewSVG, keyViewSVG, 'view selection changes rendered SVG content');

    const previewSize = page.locator('#template-preview-size');
    const widthBefore = await preview.evaluate(image => image.width);
    await previewSize.focus();
    await page.mouse.move(outside.x, outside.y);
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(width => document.querySelector('#template-preview')?.width === width, widthBefore + 1);

    await page.locator('#templates-close').click();
    await page.locator('#templates-dialog').waitFor({ state: 'hidden' });
    if (await templateMenu.evaluate(menu => menu.open)) await templateMenu.locator(':scope > summary').click();
    assert.deepEqual(await saveThroughBrowser(), initialBytes, 'template preview leaves model bytes unchanged');
    assert.equal(await page.locator('#file-state').getAttribute('data-dirty'), 'false');
    assert.equal(await page.locator('#history-state').textContent(), initialHistory);

    await page.locator('#new-view').click();
    await page.locator('#new-view-name').fill('Cancelled view');
    await page.keyboard.press('Escape');
    await page.locator('#view-dialog').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement?.id === 'new-view');
    assert.equal(await page.locator('.view-tab').count(), 1);
    assert.equal(await page.locator('#file-state').getAttribute('data-dirty'), 'false');
    assert.equal(await page.locator('#history-state').textContent(), initialHistory);

    await page.locator('#new-view').click();
    await page.locator('#new-view-name').fill('Browser smoke view');
    await page.locator('#view-submit').click();
    const addExisting = page.locator('.tree-add-element').first();
    await addExisting.waitFor({ state: 'visible' });
    await addExisting.click();
    assert.equal(await page.locator('.view-tab').count(), 2);

    const savedBytes = await saveThroughBrowser();
    const saved = deserializeProjectFile(savedBytes);
    assert.equal(saved.views.length, 3);
    assert.deepEqual(saved.views.filter(item => initialViewIds.includes(item.view.id)), initial.views);
    assert.deepEqual(saved.elements, initial.elements, 'adding a shared occurrence does not duplicate concepts');
    assert.deepEqual(saved.relationships, initial.relationships, 'existing relationships retain their IDs and data');
    const newView = saved.views.find(item => !initialViewIds.includes(item.view.id));
    assert.ok(newView, 'new view has a stable ID');
    assert.equal(newView.occurrences.length, 1);
    assert.ok(initial.elements.some(item => item.id === newView.occurrences[0].concept.id), 'new view reuses an existing concept ID');

    await openFileDialog(page);
    await page.locator('#project-file').setInputFiles({ name: 'browser-smoke.arkita', mimeType: 'application/json', buffer: savedBytes });
    await page.locator('#load-project').waitFor({ state: 'visible' });
    await page.locator('#load-project').click();
    await page.locator('#file-dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.view-tab').count(), 1);
    assert.equal(await page.locator('#file-state').getAttribute('data-dirty'), 'false');

    const reopenedBytes = await saveThroughBrowser();
    assert.deepEqual(reopenedBytes, savedBytes, 'browser save → open → save preserves exact model bytes');
    const incoming = createStore(createProject('Incoming scope model'));
    const sourceProjectId = incoming.snapshot.project.id;
    const sourceFolderId = incoming.execute({ type: 'createFolder', name: 'Incoming-only folder' }, incoming.revision).created.folderId;
    const scopeBytes = serializeProjectFile(incoming.snapshot), scopePage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    scopePage.setDefaultTimeout(10_000); watch(scopePage);
    await scopePage.addInitScript(bytes => { window.schemkaDesktop = { readExternalFiles: async () => ({ status: 'opened', files: [{ name: 'scope.arkita', bytes: Uint8Array.from(bytes) }] }) }; }, Array.from(scopeBytes));
    await scopePage.goto(url); await scopePage.locator('#canvas .node').first().waitFor();
    const scopeHistory = await scopePage.locator('#history-state').textContent();
    await scopePage.locator('.app-menu summary').first().click(); await scopePage.locator('#interchange-button').click(); await scopePage.locator('#interchange-action').selectOption('native');
    await scopePage.locator('#interchange-folders').uncheck(); await scopePage.locator('#interchange-prepare').click();
    const scopeReport = scopePage.locator('#interchange-report'), scopeText = await scopeReport.textContent();
    assert.match(scopeText, /Сохранённые записи целевой модели/); assert.match(scopeText, /Пропущенные входящие записи/);
    assert.match(scopeText, /Incoming scope model/); assert.match(scopeText, /Incoming-only folder/);
    assert.ok(scopeText.includes(sourceProjectId)); assert.ok(scopeText.includes(sourceFolderId)); assert.match(scopeText, /целевой записи нет/);
    assert.equal(await scopePage.locator('#interchange-apply').isDisabled(), true, 'scope-only identical import stays a no-op');
    const summary = scopeReport.locator('details > summary'); await summary.focus(); await scopePage.keyboard.press('Enter');
    assert.equal(await scopeReport.locator('details').getAttribute('open'), '');
    assert.equal(await scopePage.evaluate(() => document.activeElement?.tagName.toLowerCase()), 'summary', 'keyboard expansion keeps focus on the scope control');
    const applyButton = scopePage.locator('#interchange-apply'); await applyButton.evaluate(element => element.scrollIntoView({ block: 'nearest' }));
    const applyRect = await applyButton.evaluate(element => { const button = element.getBoundingClientRect(), dialog = document.querySelector('#interchange-dialog').getBoundingClientRect(); return { top: button.top, bottom: button.bottom, dialogTop: dialog.top, dialogBottom: dialog.bottom }; });
    assert.ok(applyRect.top >= applyRect.dialogTop && applyRect.bottom <= applyRect.dialogBottom, 'preview scroll keeps dialog actions reachable');
    await scopePage.keyboard.press('Escape'); await scopePage.locator('#interchange-dialog').waitFor({ state: 'hidden' });
    assert.equal(await scopePage.locator('#history-state').textContent(), scopeHistory); assert.equal(await scopePage.locator('#file-state').getAttribute('data-dirty'), 'false');
    const [{ createStore }, { serializeProjectFile }] = await Promise.all([
      import('../../schemka-model-core/src/index.js'),
      import('../../schemka-model-io/src/index.js')
    ]);
    const imageStore = createStore(initial), runImageCommand = command => imageStore.execute(command, imageStore.revision);
    const originalSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="#123456"/></svg>';
    const sharedAssetId = runImageCommand({ type: 'createAsset', name: 'Shared.svg', mediaType: 'image/svg+xml', data: Buffer.from(originalSvg).toString('base64') }).created.assetId;
    const sharedDrawings = initial.views.slice(0, 2).map(({ view }, index) => ({
      viewId: view.id,
      drawingId: runImageCommand({ type: 'createVisualNode', viewId: view.id, kind: 'image', assetId: sharedAssetId, bounds: { x: 100 + index * 120, y: 100, width: 100, height: 80 } }).created.visualNodeId
    }));
    const imageFixtureBytes = Buffer.from(serializeProjectFile(imageStore.snapshot));
    await openFileDialog(page);
    await page.locator('#project-file').setInputFiles({ name: 'shared-image.arkita', mimeType: 'application/json', buffer: imageFixtureBytes });
    await page.locator('#load-project').waitFor({ state: 'visible' });
    await page.locator('#load-project').click();
    await page.locator('#file-dialog').waitFor({ state: 'hidden' });

    const visualTools = page.locator('#visual-tools');
    if (!(await visualTools.evaluate(details => details.open))) await visualTools.locator(':scope > summary').click();
    await page.locator('#visual-assets-button').click();
    const replacementSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="10" fill="#abcdef"/></svg>';
    const replacementFile = page.waitForEvent('filechooser');
    await page.locator(`#visual-replace-asset-${sharedAssetId}`).click();
    await (await replacementFile).setFiles({ name: 'Replacement.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(replacementSvg) });
    await page.locator('#visual-apply').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#visual-apply').textContent(), 'Заменить для всех использований');
    await page.locator('#visual-apply').click();
    await page.locator('#visual-cancel').click();
    await page.locator('#visual-dialog').waitFor({ state: 'hidden' });

    const replacedBytes = await saveThroughBrowser();
    const replaced = deserializeProjectFile(replacedBytes), asset = replaced.assets.find(item => item.id === sharedAssetId);
    assert.deepEqual({ id: asset?.id, name: asset?.name, mediaType: asset?.mediaType, data: asset?.data }, {
      id: sharedAssetId, name: 'Shared.svg', mediaType: 'image/svg+xml', data: Buffer.from(replacementSvg).toString('base64')
    });
    for (const { viewId, drawingId } of sharedDrawings) {
      const drawing = replaced.views.find(entry => entry.view.id === viewId)?.visualNodes.find(item => item.id === drawingId);
      assert.equal(drawing?.assetId, sharedAssetId, 'both original drawings still reference the same asset ID');
    }
    await openFileDialog(page);
    await page.locator('#project-file').setInputFiles({ name: 'shared-image.arkita', mimeType: 'application/json', buffer: replacedBytes });
    await page.locator('#load-project').waitFor({ state: 'visible' });
    await page.locator('#load-project').click();
    await page.locator('#file-dialog').waitFor({ state: 'hidden' });
    assert.deepEqual(await saveThroughBrowser(), replacedBytes, 'ordinary Save → Open → Save preserves the replaced shared image bytes, ID and references');
    await verifyReportPdf(browser);
    await verifyReportQueryNavigation(browser);

    const { endpointFixture } = await import('./endpoint-fixture.js');
    const endpoint = endpointFixture(), endpointStore = createStore(endpoint.state);
    const group = endpointStore.execute({ type: 'createVisualNode', viewId: endpoint.viewId, kind: 'group', name: 'Chromium Shift-drop target', bounds: { x: 600, y: 250, width: 350, height: 300 } }, endpointStore.revision).created;
    const endpointBytes = Buffer.from(serializeProjectFile(endpointStore.snapshot)), beforeEndpoint = deserializeProjectFile(endpointBytes);
    await openFileDialog(page);
    await page.locator('#project-file').setInputFiles({ name: 'magic-connector-group.arkita', mimeType: 'application/json', buffer: endpointBytes });
    await page.locator('#load-project').waitFor({ state: 'visible' });
    await page.locator('#load-project').click();
    await page.locator('#file-dialog').waitFor({ state: 'hidden' });
    await page.locator('[data-view-scope="tree"][data-view-id="' + endpoint.viewId + '"]').click();
    const sourceId = endpoint.items[0].occurrenceId;
    const sourceShape = page.locator('#canvas [data-kind="occurrence"][data-id="' + sourceId + '"] .node-box');
    const groupShape = page.locator('#canvas [data-kind="visualNode"][data-id="' + group.visualNodeId + '"] .node-box');
    await sourceShape.waitFor({ state: 'visible' });
    await groupShape.waitFor({ state: 'visible' });
    assert.equal(await page.locator('#undo').isDisabled(), true, 'opening the synthetic fixture starts with empty history');
    const relationshipPalette = page.locator('[data-palette-group="relationships"]');
    if (!(await relationshipPalette.evaluate(details => details.open))) await page.locator('#palette-relationships-title').click();
    const sourceBox = await sourceShape.boundingBox(), groupBox = await groupShape.boundingBox();
    assert.ok(sourceBox && groupBox, 'source and target visual group have real Chromium bounds after opening the relationship palette');

    await page.locator('#smart-link-tool').click();
    if (await page.locator('#magic-order-dialog').isVisible()) {
      await page.locator('#magic-order-type').selectOption('Access');
      await page.locator('#magic-order-apply').click();
    }
    await page.locator('#canvas.smart-link-armed').waitFor();
    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.locator('#canvas .smart-link-preview').waitFor({ state: 'attached' });
    await page.keyboard.down('Shift');
    const dropPoint = { x: groupBox.x + groupBox.width / 2, y: groupBox.y + groupBox.height / 2 };
    await page.mouse.move(dropPoint.x, dropPoint.y);
    const actualHit = await page.evaluate(({ x, y }) => {
      const target = document.elementFromPoint(x, y)?.closest('[data-id]');
      return target ? { kind: target.dataset.kind, id: target.dataset.id } : null;
    }, dropPoint);
    assert.deepEqual(actualHit, { kind: 'visualNode', id: group.visualNodeId }, 'real Chromium elementFromPoint hits the requested visual group');
    await page.mouse.up();
    await page.keyboard.up('Shift');

    await page.locator('#diagram-tools-dialog').waitFor({ state: 'visible' });
    await page.locator('#diagram-search').fill('DataObject');
    await page.locator('#diagram-type').selectOption('DataObject');
    await page.locator('#diagram-relationship-search').fill('Access');
    await page.locator('#diagram-relationship').selectOption('Access');
    assert.equal(await page.locator('#diagram-source').inputValue(), sourceId);
    assert.equal(await page.locator('#diagram-source').isDisabled(), true);
    await page.locator('#diagram-name').fill('Chromium created endpoint');
    await page.locator('#diagram-relationship-label').fill('Uses');
    assert.equal(await page.locator('#diagram-tools-apply').isDisabled(), false, 'the allowed atomic creation can be applied');
    await page.locator('#diagram-tools-apply').click();
    await page.locator('#diagram-tools-dialog').waitFor({ state: 'hidden' });

    const endpointCreatedBytes = await saveThroughBrowser();
    const endpointCreated = deserializeProjectFile(endpointCreatedBytes);
    const endpointElement = endpointCreated.elements.find(item => !beforeEndpoint.elements.some(old => old.id === item.id));
    assert.ok(endpointElement, 'atomic create adds an element');
    assert.equal(endpointElement.type, 'DataObject');
    assert.equal(endpointElement.name, 'Chromium created endpoint');
    const endpointRelationship = endpointCreated.relationships.find(item => !beforeEndpoint.relationships.some(old => old.id === item.id));
    assert.ok(endpointRelationship, 'atomic create adds a relationship');
    assert.equal(endpointRelationship.type, 'Access');
    assert.equal(endpointRelationship.label, 'Uses');
    const endpointView = endpointCreated.views.find(item => item.view.id === endpoint.viewId);
    const endpointDrawing = endpointView.occurrences.find(item => item.concept.id === endpointElement.id);
    assert.deepEqual(endpointDrawing.parent, { kind: 'visualNode', id: group.visualNodeId }, 'saved occurrence keeps the exact visual group hit as its parent');
    const endpointConnection = endpointView.connections.find(item => item.relationshipId === endpointRelationship.id);
    assert.ok(endpointConnection, 'atomic relationship has a connection in the selected view');
    assert.deepEqual(endpointConnection.source, { kind: 'occurrence', id: sourceId });
    assert.deepEqual(endpointConnection.target, { kind: 'occurrence', id: endpointDrawing.id });
    assert.equal(await page.locator('#undo').isDisabled(), false, 'the atomic edit creates one undoable action');
    await page.locator('#undo').click();
    assert.deepEqual(await saveThroughBrowser(), endpointBytes, 'one Undo restores the exact synthetic input bytes');
    assert.equal(await page.locator('#undo').isDisabled(), true);
    assert.equal(await page.locator('#redo').isDisabled(), false);
    const automationBaselineBytes = await saveThroughBrowser();
    const automationBaseline = deserializeProjectFile(automationBaselineBytes);
    const automationTarget = automationBaseline.elements[0];
    assert.ok(automationTarget, 'synthetic model provides an element for the batch property change');
    const automationPropertyKey = 'qaSmoke';
    const automationPropertyValue = 'applied';
    const automationPrefix = 'Automation smoke · ';
    const automationHistory = await page.locator('#history-state').textContent();
    const additionalMenu = page.locator('.app-menu').filter({ has: page.locator('#automation-button') });
    if (!(await additionalMenu.evaluate(menu => menu.open))) await additionalMenu.locator(':scope > summary').click();
    await page.locator('#automation-button').click();
    await page.locator('#automation-dialog').waitFor({ state: 'visible' });
    const installDetails = page.locator('#automation-dialog details').filter({ hasText: 'Установить или обновить пакет' });
    if (!(await installDetails.evaluate(section => section.open))) await installDetails.locator(':scope > summary').click();
    const automationManifest = {
      ...EXAMPLE_AUTOMATION,
      id: 'arkita.smoke-batch',
      name: 'Chromium batch smoke',
      capabilities: ['model.read', 'model.write'],
      steps: [
        { action: 'rename', query: { kind: 'project' }, prefix: automationPrefix },
        { action: 'setProperty', query: { kind: 'element', ids: [automationTarget.id] }, key: automationPropertyKey, value: automationPropertyValue }
      ]
    };
    await page.locator('#automation-editor').fill(JSON.stringify(automationManifest));
    await page.locator('#automation-inspect').click();
    await page.locator('#automation-install-consent').check();
    await page.locator('#automation-install').click();
    await page.locator('#automation-enabled').check();
    await page.locator('#automation-run').click();
    await page.waitForFunction(() => document.querySelector('#automation-feedback')?.textContent.includes('Проверьте изменения'));
    const automationPreview = JSON.parse(await page.locator('#automation-report').textContent());
    assert.equal(automationPreview.changes.length, 2, 'preview lists both batch changes');
    const projectPreview = automationPreview.changes[0].owners.find(change => change.kind === 'project' && change.id === automationBaseline.project.id);
    assert.ok(projectPreview, 'preview identifies the project by stable ID');
    assert.equal(projectPreview.before.name, automationBaseline.project.name);
    assert.equal(projectPreview.after.name, automationPrefix + automationBaseline.project.name);
    const propertyPreview = automationPreview.changes[1].owners.find(change => change.kind === 'element' && change.id === automationTarget.id);
    assert.ok(propertyPreview, 'preview identifies the target element by stable ID');
    const propertyValue = properties => Array.isArray(properties)
      ? properties.find(entry => entry.key === automationPropertyKey)?.value
      : properties?.[automationPropertyKey];
    assert.equal(propertyValue(propertyPreview.after.properties), automationPropertyValue);
    assert.equal(await page.locator('#project-name').textContent(), automationBaseline.project.name, 'preview has not changed the project');
    assert.equal(await page.locator('#file-state').getAttribute('data-dirty'), 'false');
    assert.equal(await page.locator('#history-state').textContent(), automationHistory);
    assert.equal(await page.locator('#undo').isDisabled(), true, 'preview adds no history entry');
    assert.equal(await page.locator('#automation-apply').isDisabled(), true, 'Apply requires explicit consent');
    await page.locator('#automation-apply-consent').check();
    await page.locator('#automation-apply').click();
    assert.equal(await page.locator('#project-name').textContent(), automationPrefix + automationBaseline.project.name);
    assert.equal(await page.locator('#file-state').getAttribute('data-dirty'), 'true');
    assert.equal(await page.locator('#undo').isDisabled(), false, 'the applied batch is undoable');
    await page.locator('#automation-close').click();
    await page.locator('#automation-dialog').waitFor({ state: 'hidden' });
    if (await additionalMenu.evaluate(menu => menu.open)) await additionalMenu.locator(':scope > summary').click();

    const appliedBytes = await saveThroughBrowser();
    assert.equal(await page.locator('#file-state').getAttribute('data-dirty'), 'false', 'ordinary Save marks the applied state clean');
    const applied = deserializeProjectFile(appliedBytes);
    assert.equal(applied.project.name, automationPrefix + automationBaseline.project.name);
    const appliedElement = applied.elements.find(item => item.id === automationTarget.id);
    assert.ok(appliedElement, 'ordinary Save preserves the target element ID');
    assert.equal(propertyValue(appliedElement.properties), automationPropertyValue);
    await page.locator('#undo').click();
    await page.waitForFunction(() => document.querySelector('#file-state')?.dataset.dirty === 'true');
    assert.equal(await page.locator('#project-name').textContent(), automationBaseline.project.name, 'one Undo restores the baseline project name');
    assert.equal(await page.locator('#redo').isDisabled(), false, 'the applied batch remains available to Redo');
    assert.deepEqual(await saveThroughBrowser(), automationBaselineBytes, 'one Undo restores baseline bytes before reopen');

    await openFileDialog(page);
    await page.locator('#project-file').setInputFiles({ name: 'automation-applied.arkita', mimeType: 'application/json', buffer: appliedBytes });
    await page.locator('#load-project').waitFor({ state: 'visible' });
    await page.locator('#load-project').click();
    await page.locator('#file-dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#file-state').getAttribute('data-dirty'), 'false');
    assert.equal(await page.locator('#undo').isDisabled(), true, 'reopen starts a fresh history');
    assert.deepEqual(await saveThroughBrowser(), appliedBytes, 'ordinary Save → reopen → Save preserves exact applied bytes');
const canvas = canvasFixture();
    await openFileDialog(page);
    await page.locator('#project-file').setInputFiles({ name: 'canvas-smoke.arkita', mimeType: 'application/json', buffer: canvas.bytes });
    await page.locator('#load-project').click();
    await page.locator('#file-dialog').waitFor({ state: 'hidden' });
    const line = page.locator('[data-kind="visualConnector"]');
    await line.waitFor();
    assert.equal(await line.locator('.relationship-label').textContent(), 'Source label · Team A');
    if (!(await visualTools.evaluate(details => details.open))) await visualTools.locator(':scope > summary').click();
    await line.focus();
    await page.keyboard.press('Enter');
    assert.equal(await line.getAttribute('aria-pressed'), 'true', 'keyboard selection exposes the drawing actions');
    assert.equal(await page.locator('#visual-style').isEnabled(), true, 'selection enables drawing style actions');
    await page.locator('#visual-style').click();
    const template = page.locator('#visual-labelTemplate');
    await template.fill('${missing}');
    assert.match(await page.locator('#visual-label-template-diagnostic').textContent(), /Неизвестное поле/);
    await page.locator('#visual-apply').click();
    assert.equal(await line.locator('.relationship-label').textContent(), 'Source label');
    assert.match(await line.getAttribute('aria-description'), /Неизвестное поле/);
    await page.locator('#undo').click();
    assert.equal(await line.locator('.relationship-label').textContent(), 'Source label · Team A');

    const block = page.locator(`[data-kind="visualNode"][data-id="${canvas.block}"]`);
    await page.evaluate(() => document.activeElement?.blur());
    let tabCount = 0;
    for (; tabCount < 160; tabCount++) {
      await page.keyboard.press('Tab');
      if (await block.evaluate(item => item === document.activeElement)) break;
    }
    assert.ok(tabCount < 160, 'Tab traversal reaches the Canvas instruction block');
    assert.equal(await page.locator('#context-hints-panel').isVisible(), false, 'hints start closed in the fresh browser profile');
    await page.keyboard.press('Enter');
    assert.equal(await block.getAttribute('aria-pressed'), 'true');
    const instruction = page.locator('#context-hints-instruction');
    assert.equal(await instruction.isVisible(), true);
    assert.equal(await block.evaluate(item => item === document.activeElement), true, 'showing the instruction preserves keyboard focus');
    assert.match(await instruction.textContent(), /Purpose/);
    assert.ok(await instruction.locator('strong').count());
    assert.equal(await instruction.locator('script').count(), 0);
    assert.equal(await page.evaluate(() => window.canvasPwned), undefined);
    assert.deepEqual(await saveThroughBrowser(), canvas.bytes, 'Canvas hints and Undo leave portable model bytes intact');
    assert.deepEqual(deserializeProjectFile(canvas.bytes).views[0].visualNodes.find(item => item.id === canvas.block).instruction, '**Purpose**\n\n<script>window.canvasPwned = true</script>');

    assert.deepEqual(pageErrors, [], 'renderer reports no uncaught errors');
    assert.deepEqual(failedRequests, [], 'renderer reports no failed or HTTP error requests');
    console.log(`PASS: browser renderer smoke · Chromium ${browser.version()} · shared-image Save/Open/Save, A4 report PDF, query navigation, Magic Connector Shift-drop/hit/exact-parent/Undo, Automation batch preview/Apply/Save/Open/Save/Undo, Canvas line-label diagnostics/Undo, keyboard Canvas instructions, native scope details, keyboard/focus`);
  } finally {
    await browser?.close();
    if (server.exitCode === null) {
      server.kill('SIGTERM');
      await new Promise(resolve => server.once('exit', resolve));
    }
  }
}

try {
  await run();
} catch (error) {
  const blocked = error instanceof BlockedError;
  console.error(`${blocked ? 'BLOCKED' : 'FAIL'}: ${error.message}`);
  if (!blocked && error.stack) console.error(error.stack);
  process.exitCode = blocked ? 2 : 1;
}
