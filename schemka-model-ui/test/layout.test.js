import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import {setup} from './app-test-fixture.js';
import {conceptProject} from '../../schemka-model-core/fixtures/concept-project.js';
import {serializeProjectFile} from '../../schemka-model-io/src/index.js';
import {reportMarkdown} from '../../schemka-model-io/src/report-markdown.js';
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');

test('prepared browser checks follow the current standalone controls rather than removed selectors', async () => {
  const directory = new URL('./', import.meta.url);
  const scripts = (await readdir(directory)).filter(name => /^browser(?:-[a-z-]+)?\.mjs$/.test(name));
  assert.equal(scripts.length, 9);
  for (const name of scripts) {
    const source = await readFile(new URL(name, directory), 'utf8');
    assert.doesNotMatch(source, /#(?:reuse-link-button|view-name|notation-mode|notation-status)(?![\w-])|#catalogue-palette\s*>\s*summary/, name);
    assert.doesNotMatch(source, /\.palette-group[^'"\n]*summary/, name);
  }
  const profileChecks = await readFile(new URL('browser-profiles.mjs', directory), 'utf8');
  assert.match(profileChecks, /#help-button[\s\S]*?\.click\(\)[\s\S]*?#profile-button[\s\S]*?\.click\(\)/);
  assert.match(profileChecks, /#help-button['"]\)\.evaluate\(el\s*=>\s*document\.activeElement\s*===\s*el\)/);
});

test('workbench has static native hierarchy, central tablist and narrow grouped palette', () => {
  assert.match(html, /<details id="tree-model"[^>]* open>/);
  assert.match(html, /id="catalog-folders-host"/);
  assert.doesNotMatch(html, /id="(?:tree-elements|tree-junctions|catalog-folder-back|catalog-folder-home)"/);
  assert.match(html, /id="view-tabs" role="tablist" aria-label="Открытые представления"/);
  assert.match(html, /id="view-panel" role="tabpanel"/);
  assert.match(html, /<aside class="toolbox" aria-label="Палитра">/);
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.getElementById('inspector-panel').tagName, 'DIALOG');
  assert.equal(doc.querySelector('.toolbox #inspector-panel'), null);
  const magic = doc.querySelector('#palette-items-relationships > #smart-link-tool');
  assert.equal(magic?.tagName, 'BUTTON');
  assert.equal(magic.closest('[data-palette-group]').dataset.paletteGroup, 'relationships');
  assert.equal(magic.parentElement.firstElementChild, magic);
  assert.equal(doc.getElementById('inspector-button').hidden, true);
  assert.equal(doc.querySelector('[data-command="inspector-button"]').textContent, 'Свойства объекта…');
  assert.equal(doc.querySelector('[data-palette-group="relationships"]').open, false);
  assert.equal(doc.querySelector('[data-palette-group="junctions"]').open, false);
  for (const id of ['create-service', 'create-realization']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
    assert.ok(html.indexOf(`id="${id}"`) > html.indexOf('<section class="palette"'));
  }
  assert.ok(html.indexOf('id="inspector-panel"') > html.indexOf('id="catalogue-palette"'));
  assert.match(css, /grid-template-columns:220px minmax\(0,1fr\) 226px/);
});
test('rendering retains tree groups; exact view IDs have scope-qualified focus keys and keyboard tab navigation',async t=>{
  const h=await setup(t),state=conceptProject();await h.load(serializeProjectFile(state));const groups=['tree-model','tree-common','tree-relationships','tree-views'].map(id=>h.$(id));groups[1].open=false;
  for(const entry of state.views){const button=h.$('views').querySelector(`[data-view-id="${entry.view.id}"]`);assert.ok(button);button.click();}
  for(const group of groups)assert.equal(h.$(group.id),group);assert.equal(groups[1].open,false);
  for(const entry of state.views){const tree=h.$('views').querySelector(`[data-view-id="${entry.view.id}"]`),tab=h.$('view-tabs').querySelector(`[data-view-id="${entry.view.id}"][role="tab"]`);assert.ok(tree);assert.ok(tab);assert.notEqual(tree.dataset.focusKey,tab.dataset.focusKey);assert.equal(tab.getAttribute('aria-controls'),'view-panel');assert.equal(tab.tabIndex,tab.getAttribute('aria-selected')==='true'?0:-1);}
  const current=h.$('view-tabs').querySelector('[aria-selected="true"]'),event=new h.window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true});current.dispatchEvent(event);assert.equal(event.defaultPrevented,true);const active=h.$('view-tabs').querySelector('[aria-selected="true"]');assert.notEqual(active.dataset.viewId,current.dataset.viewId);assert.equal(h.document.activeElement,active);assert.equal(h.$('view-title').textContent,state.views.find(entry=>entry.view.id===active.dataset.viewId).view.name);
});
test('ArchiMate palette, manual-save information and safe IO UI remain', () => {
  assert.match(html, /<div id="catalogue-palette"/);
  assert.doesNotMatch(html, /class="experiment"|id="experiment-description"|id="preview-active"/);
  const dom = new JSDOM(html), palette = dom.window.document.getElementById('catalogue-palette').textContent;
  assert.doesNotMatch(palette, /Эксперимент|UNKNOWN|не подтверждены/);
  assert.match(html, /Учебный пример · файл не скачан/);
  const saveNote = dom.window.document.getElementById('save-project-note').textContent;
  assert.match(saveNote, /После передачи файла браузеру проверьте загрузки/);
  assert.match(saveNote, /Автосохранения нет/);
  const safeInstruction = 'instructions.innerHTML = reportMarkdown(visual.instruction);';
  assert.ok(app.includes(safeInstruction), 'Visual instructions use the closed Markdown renderer');
  // Exempt only this exact first assignment; any other HTML insertion still fails.
  assert.doesNotMatch(app.replace(safeInstruction, ''), /innerHTML|mermaid\.render|Math\.random|sessionStorage|eval\s*\(|new Function\s*\(/);
  const instruction = dom.window.document.createElement('section');
  instruction.innerHTML = reportMarkdown('**Instruction**\n<img src="https://example.test/a" onerror="bad()"><script>bad()</script>\n[External](https://example.test)');
  assert.equal(instruction.querySelector('strong').textContent, 'Instruction');
  assert.equal(instruction.querySelector('img,script,a,iframe,object'), null, 'Instruction Markdown keeps HTML and external resources inert');
  assert.equal((app.match(/window\.localStorage/g)||[]).length,1,'one local preferences authority');
  assert.match(app,/createLocalPreferences\(window\.localStorage/);
  assert.doesNotMatch(html, /id="(?:reuse-link-button|view-name|notation-mode|notation-status)"/);
  const help = dom.window.document.getElementById('help-dialog');
  assert.equal(help.querySelector('#profile-button').textContent, 'Проверка модели');
  assert.ok(help.querySelector('#notation-legend'));
  assert.equal(dom.window.document.querySelectorAll('.palette h2').length, 1);
  dom.window.close();
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, 'Static IDs are unique');
});

test('CSS has no variable expression in declaration names after token migration', () => {
  assert.doesNotMatch(css, /var\([^)]*\)[\w-]*\s*:/);
  assert.match(css, /white-space:nowrap/);
});


test('imported tiny bounds cannot create a negative decorative SVG height', () => {
  assert.match(app, /height: Math\.max\(0, occurrence\.bounds\.height - 28\)/);
});


test('view create/duplicate controls and separate tree reuse buttons have distinct accessible scopes', () => {
  assert.match(html, /id="new-view" aria-label="Новое представление"/);
  assert.match(html, /id="duplicate-view" aria-label="Дублировать текущее представление"/);
  assert.match(html, /id="view-dialog" aria-labelledby="view-dialog-title"/);
  assert.match(app, /row\.append\(choose\)/);
  assert.match(app, /add\.dataset\.focusKey = `add-\$\{kind\}/);
  assert.match(app, /add\.setAttribute\('aria-label', `Добавить экземпляр:/);
  assert.doesNotMatch(app, /item\.append\(add\)/);
});


test('profile inspection is read-only, names explicit UNKNOWN and uses trusted presentation mappings', () => {
  assert.match(html, /id="profile-button"/);assert.match(html, /id="profile-dialog" aria-labelledby="profile-title"/);
  assert.match(html, /UNKNOWN означает «не проверено», а не «разрешено»/);
  assert.match(app, /notationElement\(state.project.metamodel/);assert.match(app, /notationRelationship\(state.project.metamodel/);
  const dialog=html.split('id="profile-dialog"')[1].split('</dialog>')[0];assert.doesNotMatch(dialog, /<(input|select|textarea)/);
});



test('typed drag sources, separate reuse and contextual menu preserve explicit keyboard alternatives', () => {
  for(const type of ['Service','Process','Function','Event','Node','Device','SystemSoftware','CommunicationNetwork','Path']) assert.match(html,new RegExp(`data-drag-type="${type}"`));
  assert.match(html,/id="context-menu"[^>]*role="menu"[^>]*hidden/);
  assert.match(app,/makeMemberRow: makeCatalogMemberRow/);
  assert.doesNotMatch(app,/choose\.dataset\.dragElementId/);
  assert.match(app,/readBoundary: \(\) => \(\{ revision: model\.store\.revision, viewId: model\.viewId \}\)/);
  assert.match(app,/contextMenu\?\.close\(true\)/);
  assert.match(css,/\[hidden\] \{\s*display:none!important/);
  assert.match(css,/\.context-menu/);assert.match(css,/\.internal-drag-ghost/);
});

test('the full current catalogue is available without activation controls or historical versions', () => {
  assert.doesNotMatch(html, /id="(?:preview|common|application|domain|extended|relationship)-(?:enable|dialog|confirm)"/);
  assert.match(html, /id="catalogue-tools"/); assert.match(html, /id="link-assessment" class="profile-unknown" role="status"/);
  assert.doesNotMatch(app, /install(?:Preview|Common|Application|Domain|Extended|Relationship)Actions/);
  assert.match(html, /id="new-project"/); assert.match(html, /id="reset-example"/);
});

test('palette search keeps accessible labels and live status without repeated visible instructions', () => {
  assert.doesNotMatch(html, /Добавить в этот вид · нажмите или перетащите/);
  assert.match(html, /<label for="palette-search" class="sr-only">Найти тип<\/label>/);
  assert.match(html, /id="palette-search" type="search" maxlength="128"/);
  assert.match(html, /id="palette-results"[^>]*role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /id="palette-empty" hidden/);
  assert.equal((html.match(/data-palette-group=/g) || []).length, 9);
  assert.match(css, /\.palette-search-controls\s*\{[^}]*flex-wrap:wrap[^}]*min-width:0/);
  assert.match(css, /#palette-search\s*\{[^}]*min-width:0[^}]*max-width:100%/);
  assert.match(css, /input:focus-visible[^}]*outline:3px solid var\(--focus\)/);
});


test('multiplicity copy distinguishes syntax checks from endpoint types and whole-model conformance', () => {
  assert.ok(html.includes('Проверка записи не определяет допустимость типов концов; соответствие всей модели стандарту остаётся UNKNOWN.'));
  assert.ok(!html.includes('Проверка допустимости отношения остаётся UNKNOWN.'));
});


test('help describes the bounded current check without claiming most endpoint combinations are unknown', () => {
  assert.ok(html.includes('границы проверки типов концов указаны в диагностике. Соответствие всей модели стандарту не проверено (UNKNOWN).'));
  assert.doesNotMatch(html, /для большинства сочетаний типов концов проверка пока UNKNOWN|49 упорядоченных|735 проверок/);
});
