import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProject, createStore } from '../../schemka-model-core/src/index.js';
import { serializeProjectFile } from '../../schemka-model-io/src/project-file.js';

const fixtureOnly = process.argv.includes('--fixture-only');
const appSourceSha = process.env.ARKITA_APP_SOURCE_SHA || 'fe1245a3d61612b15b78270e9f49fe9dc6467988';
if (!fixtureOnly) assert.equal(appSourceSha, 'fe1245a3d61612b15b78270e9f49fe9dc6467988');
const branchSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const changed = execFileSync('git', ['diff', '--name-only', appSourceSha, branchSha], { encoding: 'utf8' }).trim().split(/\r?\n/).filter(Boolean);
const allowed = new Set([
  '.github/workflows/ci.yml',
  'tools/qa/a-editor-075-windows-clipboard.mjs',
  'tools/qa/a-editor-075-paint-readback.ps1',
]);
if (!fixtureOnly) {
  assert.equal(branchSha, process.env.GITHUB_SHA);
  assert.ok(changed.length && changed.every(file => allowed.has(file)), `Unexpected files differ from app source: ${changed.join(', ')}`);
}

function fixture() {
  const projectName = 'A-EDITOR-075 — синтетическая диаграмма';
  const store = createStore(createProject(projectName));
  const run = command => store.execute(command, store.revision).created;
  const fullView = run({ type: 'createView', name: 'Полные границы и оформление' }).viewId;
  const leftTop = run({ type: 'createElementAndOccurrence', viewId: fullView, elementType: 'ApplicationComponent', name: 'Левый верхний', bounds: { x: -500, y: -350, width: 220, height: 150 }, style: { fill: '#F18F01', stroke: '#102A43', strokeWidth: 4, textColor: '#FFFFFF', fontSize: 20, fontWeight: 'bold', textAlign: 'center', verticalAlign: 'middle', shape: 'rounded' } });
  const rightTop = run({ type: 'createElementAndOccurrence', viewId: fullView, elementType: 'Service', name: 'Правый верхний', bounds: { x: 500, y: -350, width: 260, height: 150 }, style: { fill: '#2081C3', fillOpacity: 0.55, stroke: '#F4D35E', strokeWidth: 4, textColor: '#FFFFFF', fontSize: 18, fontWeight: 'bold', textAlign: 'center', verticalAlign: 'middle' } });
  run({ type: 'createElementAndOccurrence', viewId: fullView, elementType: 'BusinessActor', name: 'Левый нижний', bounds: { x: -500, y: 380, width: 220, height: 160 }, style: { fill: '#238636', stroke: '#FFFFFF', strokeWidth: 4, textColor: '#FFFFFF', fontSize: 18, fontWeight: 'bold', textAlign: 'center', verticalAlign: 'middle', shape: 'ellipse' } });
  run({ type: 'createElementAndOccurrence', viewId: fullView, elementType: 'ApplicationComponent', name: 'Правый нижний', bounds: { x: 500, y: 370, width: 260, height: 170 }, style: { fill: '#D14679', stroke: '#102A43', strokeWidth: 4, textColor: '#FFFFFF', fontSize: 18, fontWeight: 'bold', textAlign: 'center', verticalAlign: 'middle', shape: 'folded' } });
  run({ type: 'createRelationshipAndConnection', viewId: fullView, relationshipType: 'Association', source: { kind: 'occurrence', id: leftTop.occurrenceId }, target: { kind: 'occurrence', id: rightTop.occurrenceId }, label: 'Сквозная связь', labelPosition: { x: 0, y: -260 }, style: { stroke: '#F4D35E', strokeWidth: 4, strokeDash: 'dash', textColor: '#FFFFFF', fontSize: 16 } });

  const alphaView = run({ type: 'createView', name: 'Прозрачный фон' }).viewId;
  run({ type: 'createElementAndOccurrence', viewId: alphaView, elementType: 'ApplicationComponent', name: 'Альфа слоя', bounds: { x: -100, y: -50, width: 180, height: 120 }, style: { fill: '#F18F01', fillOpacity: 0.75, stroke: '#102A43', strokeWidth: 4, textColor: '#102A43', fontSize: 18, fontWeight: 'bold' } });

  const largeView = run({ type: 'createView', name: 'Большой размер — отказ' }).viewId;
  run({ type: 'createElementAndOccurrence', viewId: largeView, elementType: 'ApplicationComponent', name: 'Проверка лимита', bounds: { x: -1000, y: -1000, width: 6000, height: 6000 }, style: { fill: '#445566', stroke: '#112233', strokeWidth: 4 } });

  const state = structuredClone(store.snapshot);
  for (const entry of state.views) {
    if (entry.view.id === fullView) entry.view.background = '#1D3557';
    if (entry.view.id === alphaView) entry.view.background = '#00000000';
    if (entry.view.id === largeView) entry.view.background = '#FFFFFF';
  }
  return {
    bytes: serializeProjectFile(state),
    manifest: {
      projectName,
      initialView: state.views.map(entry => entry.view.id).sort()[0],
      fullView,
      alphaView,
      largeView,
      labels: ['Левый верхний', 'Правый верхний', 'Левый нижний', 'Правый нижний', 'Сквозная связь'],
      expectedFullSize: { widthMin: 1440, widthMax: 1480, heightMin: 1090, heightMax: 1130 },
      samples: [
        { name: 'left-top', x: 200, y: 222, rgb: [241, 143, 1] },
        { name: 'right-top-translucent', x: 1220, y: 222, rgb: [31, 95, 146] },
        { name: 'left-bottom', x: 150, y: 965, rgb: [35, 134, 54] },
        { name: 'right-bottom', x: 1220, y: 960, rgb: [209, 70, 121] },
      ],
    },
  };
}

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function readTail(filename) {
  try { return fs.readFileSync(filename, 'utf8').slice(-4000); }
  catch (error) { return `[unavailable: ${error.message}]`; }
}
const temp = process.env.RUNNER_TEMP || os.tmpdir();
const fixturePath = path.join(temp, 'a-editor-075-cyrillic.arkita');
const appExe = path.resolve('release/windows/win-unpacked/Arkita.exe');
const powerShell = path.resolve('tools/qa/a-editor-075-paint-readback.ps1');
const cdpPort = 9337;
const cdpBase = `http://127.0.0.1:${cdpPort}`;

class DevTools {
  nextId = 0;
  pending = new Map();
  constructor(socket) {
    this.socket = socket;
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message)); else pending.resolve(message.result);
    });
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    return new DevTools(socket);
  }
  send(method, params = {}) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`DevTools timeout: ${method}`)); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Renderer evaluation failed');
    return result.result.value;
  }
  close() { this.socket.close(); }
}

async function waitFor(callback, message, timeout = 90000) {
  const end = Date.now() + timeout;
  let lastError;
  while (Date.now() < end) {
    try { const value = await callback(); if (value) return value; } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`${message}${lastError ? `: ${lastError.message}` : ''}`);
}

async function clickSelector(cdp, expression) {
  const target = await cdp.evaluate(`(() => { const item = ${expression}; if (!item) return null; const rect = item.getBoundingClientRect(); return { disabled: Boolean(item.disabled), x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, width: rect.width, height: rect.height }; })()`);
  assert.ok(target && !target.disabled && target.width > 0 && target.height > 0, `Action is unavailable: ${expression}`);
  const point = { x: target.x, y: target.y, button: 'left', clickCount: 1 };
  await cdp.send('Input.dispatchMouseEvent', { ...point, type: 'mouseMoved' });
  await cdp.send('Input.dispatchMouseEvent', { ...point, type: 'mousePressed' });
  await cdp.send('Input.dispatchMouseEvent', { ...point, type: 'mouseReleased' });
}

async function copyCurrentView(cdp) {
  await clickSelector(cdp, `([...document.querySelectorAll('.app-menu summary')].find(item => item.textContent.trim() === 'Правка'))`);
  const before = await cdp.evaluate(`(() => ({
    disabled: document.querySelector('[data-command="fragment-copy-image"]')?.disabled,
    labels: [...document.querySelectorAll('#canvas text')].map(item => item.textContent.trim()).filter(Boolean),
    history: document.querySelector('#history-state')?.textContent,
    dirty: document.querySelector('#file-state')?.dataset.dirty
  }))()`);
  assert.equal(before.disabled, false, 'Copy diagram as image must be enabled in the packaged Windows app');
  await clickSelector(cdp, `document.querySelector('[data-command="fragment-copy-image"]')`);
  const status = await waitFor(() => cdp.evaluate(`document.querySelector('#status')?.textContent || ''`).then(value => /скопировано в системный буфер|Не выполнено:/.test(value) ? value : ''), 'Copy action did not complete');
  const after = await cdp.evaluate(`(() => ({ history: document.querySelector('#history-state')?.textContent, dirty: document.querySelector('#file-state')?.dataset.dirty }))()`);
  assert.equal(after.history, before.history, 'Copy must not change model history');
  assert.equal(after.dirty, before.dirty, 'Copy must not dirty the model');
  return { status, labels: before.labels, history: before.history, dirty: before.dirty };
}

function readback(mode, outputs, samplePoints = []) {
  const env = {
    ...process.env,
    ARKITA_QA_MODE: mode,
    ARKITA_QA_CLIPBOARD_PNG: outputs.clipboard,
    ARKITA_QA_PAINT_PNG: outputs.paint || '',
    ARKITA_QA_SAMPLE_POINTS: JSON.stringify(samplePoints),
  };
  const result = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-File', powerShell], { env, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Windows clipboard/Paint readback failed: ${(result.stderr || result.stdout).trim()}`);
  const line = result.stdout.trim().split(/\r?\n/).at(-1);
  return JSON.parse(line);
}

async function main() {
  assert.equal(process.platform, 'win32', 'This focused acceptance must execute on Windows');
  assert.ok(fs.existsSync(appExe), `Packaged Arkita executable is missing: ${appExe}`);
  const { bytes, manifest } = fixture();
  fs.writeFileSync(fixturePath, bytes);
  const fixtureSha256 = hash(bytes);
  const profile = path.join(temp, 'a-editor-075-app-profile');
  const stdoutPath = path.join(temp, 'a-editor-075-app.stdout.log');
  const stderrPath = path.join(temp, 'a-editor-075-app.stderr.log');
  const appArgs = [`--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, fixturePath];
  const appProcess = spawn(appExe, appArgs, { cwd: path.dirname(appExe), windowsHide: false, stdio: ['ignore', fs.openSync(stdoutPath, 'w'), fs.openSync(stderrPath, 'w')] });
  let cdp;
  const reportFixtureFailure = async error => {
    const renderer = await cdp.evaluate(`(() => ({
      title: document.title,
      projectName: document.querySelector('#project-name')?.textContent.trim() || '',
      fileState: document.querySelector('#file-state')?.textContent.trim() || '',
      status: document.querySelector('#status')?.textContent.trim() || '',
      activeViewId: document.querySelector('#view-tabs [role="tab"][aria-selected="true"]')?.dataset.viewId || null,
      viewIds: [...document.querySelectorAll('#view-tabs [role="tab"]')].map(tab => tab.dataset.viewId),
    }))()`).catch(readError => ({ error: readError.message }));
    console.error(`A_EDITOR_075_FIXTURE_LOAD_DIAGNOSTIC ${JSON.stringify({
      fixture: { path: fixturePath, sha256: fixtureSha256, bytes: bytes.byteLength, projectName: manifest.projectName,
        expectedViewIds: [manifest.fullView, manifest.alphaView, manifest.largeView], initialViewId: manifest.initialView },
      launch: { route: 'packaged CLI startup .arkita argument', executable: appExe, argv: appArgs,
        processId: appProcess.pid, exitCode: appProcess.exitCode, signalCode: appProcess.signalCode },
      fileOpenObservation: { projectNameMatched: renderer.projectName === manifest.projectName, renderer },
      stdoutTail: readTail(stdoutPath), stderrTail: readTail(stderrPath),
    })}`);
    throw error;
  };
  try {
    const targets = await waitFor(async () => {
      const response = await fetch(`${cdpBase}/json/list`);
      if (!response.ok) return null;
      const pages = await response.json(); return pages.find(item => item.type === 'page' && item.webSocketDebuggerUrl) || null;
    }, 'Packaged Arkita did not expose its renderer');
    cdp = await DevTools.connect(targets.webSocketDebuggerUrl);
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Page.bringToFront');
    try {
      await waitFor(() => cdp.evaluate(`(() => {
        const projectName = document.querySelector('#project-name')?.textContent.trim();
        const status = document.querySelector('#status')?.textContent.trim() || '';
        const active = document.querySelector('#view-tabs [role="tab"][aria-selected="true"]')?.dataset.viewId;
        return projectName === ${JSON.stringify(manifest.projectName)} && status.startsWith('Модель открыта.') && active === ${JSON.stringify(manifest.initialView)};
      })()`), 'Synthetic fixture model did not load in Arkita');
    } catch (error) { await reportFixtureFailure(error); }
    const active = await cdp.evaluate(`document.querySelector('#view-tabs [role="tab"][aria-selected="true"]')?.dataset.viewId`);
    assert.equal(active, manifest.initialView);
    await clickSelector(cdp, `document.querySelector('#open-all-views')`);
    await waitFor(() => cdp.evaluate(`document.querySelector('#open-views-dialog')?.open === true`), 'Open all views dialog did not open');
    await clickSelector(cdp, `document.querySelector('#open-views-dialog [data-confirm]')`);
    try {
      await waitFor(() => cdp.evaluate(`(() => {
        const ids = ${JSON.stringify([manifest.fullView, manifest.alphaView, manifest.largeView])};
        const tabs = new Set([...document.querySelectorAll('#view-tabs [role="tab"]')].map(tab => tab.dataset.viewId));
        return ids.every(id => tabs.has(id));
      })()`), 'All synthetic fixture views were not opened');
    } catch (error) { await reportFixtureFailure(error); }
    await clickSelector(cdp, `document.querySelector('#view-tabs [data-view-id="${manifest.fullView}"]')`);
    await waitFor(() => cdp.evaluate(`document.querySelector('#view-tabs [data-view-id="${manifest.fullView}"]')?.getAttribute('aria-selected') === 'true'`), 'Full fixture view was not activated');
    const renderedLabels = await cdp.evaluate(`(() => [...document.querySelectorAll('#canvas text')].map(item => item.textContent.trim()).filter(Boolean))()`);
    for (const label of manifest.labels) assert.ok(renderedLabels.includes(label), `Canvas is missing Cyrillic label: ${label}`);

    const full = await copyCurrentView(cdp);
    assert.match(full.status, /Изображение представления скопировано в системный буфер\./);
    const clipboardPath = path.join(temp, 'a-editor-075-clipboard-full.png');
    const paintPath = path.join(temp, 'a-editor-075-paint-readback.png');
    const painted = readback('paint', { clipboard: clipboardPath, paint: paintPath }, manifest.samples);
    assert.ok(painted.clipboardFormats.some(value => /PNG|Bitmap|Image/i.test(value)), `Windows clipboard exposed no image format: ${painted.clipboardFormats.join(', ')}`);
    assert.ok(painted.clipboard.width >= manifest.expectedFullSize.widthMin && painted.clipboard.width <= manifest.expectedFullSize.widthMax, `Unexpected full-view width: ${painted.clipboard.width}`);
    assert.ok(painted.clipboard.height >= manifest.expectedFullSize.heightMin && painted.clipboard.height <= manifest.expectedFullSize.heightMax, `Unexpected full-view height: ${painted.clipboard.height}`);
    assert.deepEqual(painted.clipboard.background.rgb, [29, 53, 87]);
    assert.equal(painted.clipboard.background.a, 255);
    assert.deepEqual(painted.paint.background.rgb, [29, 53, 87]);
    assert.equal(painted.paint.background.a, 255);
    for (const sample of manifest.samples) {
      for (const source of ['clipboard', 'paint']) {
        const actual = painted[source].samples[sample.name].rgb;
        assert.ok(actual.every((channel, index) => Math.abs(channel - sample.rgb[index]) <= 4), `${source} ${sample.name} style pixel mismatch: expected ${sample.rgb}, got ${actual}`);
      }
    }
    assert.ok(painted.paint.cyrillicWhitePixels > 10, 'Paint readback contains no visible Cyrillic label pixels');

    await clickSelector(cdp, `document.querySelector('#view-tabs [data-view-id="${manifest.alphaView}"]')`);
    await waitFor(() => cdp.evaluate(`document.querySelector('#view-tabs [data-view-id="${manifest.alphaView}"]')?.getAttribute('aria-selected') === 'true'`), 'Transparent view was not activated');
    const alpha = await copyCurrentView(cdp);
    assert.match(alpha.status, /Изображение представления скопировано в системный буфер\./);
    const alphaPath = path.join(temp, 'a-editor-075-clipboard-alpha.png');
    const transparent = readback('clipboard', { clipboard: alphaPath }, [{ name: 'outside', x: 0, y: 0 }, { name: 'translucent-fill', x: 250, y: 200 }]);
    assert.equal(transparent.pixels.outside.a, 0, `Transparent view background lost alpha: ${transparent.pixels.outside.a}`);
    assert.ok(transparent.pixels['translucent-fill'].a >= 180 && transparent.pixels['translucent-fill'].a <= 205, `Translucent drawing alpha mismatch: ${transparent.pixels['translucent-fill'].a}`);

    await clickSelector(cdp, `document.querySelector('#view-tabs [data-view-id="${manifest.largeView}"]')`);
    await waitFor(() => cdp.evaluate(`document.querySelector('#view-tabs [data-view-id="${manifest.largeView}"]')?.getAttribute('aria-selected') === 'true'`), 'Large view was not activated');
    const largeStart = Date.now();
    const large = await copyCurrentView(cdp);
    const largeMs = Date.now() - largeStart;
    assert.match(large.status, /Не выполнено:.*(?:32 MiPixel|16384 px)/, `Large case did not give a clear refusal: ${large.status}`);
    assert.ok(largeMs < 10000, `Large case did not terminate promptly: ${largeMs} ms`);

    const result = {
      status: 'PASS',
      issue: 17,
      criterion: 'A-EDITOR-075',
      appSourceSha,
      qaBranchSha: branchSha,
      workflowRunId: process.env.GITHUB_RUN_ID,
      runner: 'windows-2025',
      app: 'Arkita 0.7.0 packaged Electron x64 (release/windows/win-unpacked/Arkita.exe)',
      consumer: painted.consumer,
      fixtureSha256,
      fixtureBytes: bytes.byteLength,
      normalView: { action: full.status, renderedLabels, history: full.history, dirty: full.dirty, clipboard: painted.clipboard, paint: painted.paint, clipboardPngSha256: hash(fs.readFileSync(clipboardPath)), paintPngSha256: hash(fs.readFileSync(paintPath)) },
      transparentView: { action: alpha.status, formats: transparent.clipboardFormats, pixels: transparent.pixels, pngSha256: hash(fs.readFileSync(alphaPath)) },
      largeView: { refusal: large.status, elapsedMs: largeMs },
      limitation: 'Clipboard and Paint evidence is from a GitHub-hosted Windows runner, not a userVM or installed-user acceptance; no Actions artifacts were uploaded.',
    };
    console.log(`A_EDITOR_075_RECEIPT ${JSON.stringify(result)}`);
  } finally {
    cdp?.close();
    if (appProcess.exitCode === null) appProcess.kill();
  }
}

if (fixtureOnly) {
  const { bytes, manifest } = fixture();
  console.log(JSON.stringify({ bytes: bytes.byteLength, sha256: hash(bytes), manifest }));
} else {
  await main();
}
