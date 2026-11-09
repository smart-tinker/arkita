import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openFileDialog } from './browser-files.mjs';

/** Prepared profile diagnostics browser coverage; no normative conformance claims. */
export async function exerciseProfileFlows(page, checks) {
  const openProfile = async () => {
    await page.locator('#help-button').click();assert.equal(await page.locator('#help-dialog').isVisible(),true);
    await page.locator('#profile-button').click();
    assert.equal(await page.locator('#help-dialog').isVisible(),false);
    assert.equal(await page.locator('#profile-dialog').isVisible(),true);
  };
  const download=async()=>{await openFileDialog(page);const pending=page.waitForEvent('download');await page.locator('#save-project').click();const file=await pending;const bytes=await readFile(await file.path());await page.locator('#file-dialog [data-close]').click();return bytes;};
  const before=await download(),history=await page.locator('#history-state').innerText();
  await openProfile();assert.equal(await page.locator('#profile-dialog').isVisible(),true);
  assert.match(await page.locator('#profile-reference').innerText(),/schemka-archimate4@2/);assert.match(await page.locator('#profile-structure').innerText(),/VALID/);assert.match(await page.locator('#profile-normative').innerText(),/UNKNOWN/);
  assert.equal(await page.locator('#profile-catalog li').count(),59);assert.equal(await page.locator('#profile-dialog select').count(),0);assert.equal(await page.locator('#profile-dialog input').count(),0);
  assert.match(await page.locator('#profile-catalog').innerText(),/System Software/);assert.match(await page.locator('#profile-catalog').innerText(),/Communication Network/);assert.match(await page.locator('#profile-catalog').innerText(),/Association/);assert.match(await page.locator('#profile-catalog').innerText(),/Flow/);
  await page.locator('#profile-dialog [data-close]').click();assert.equal(await page.locator('#help-button').evaluate(el=>document.activeElement===el),true);assert.equal(await page.locator('#history-state').innerText(),history);assert.equal(await page.locator('#file-state').getAttribute('data-dirty'),'false');
  assert.deepEqual(await download(),before);
  await page.locator('#theme-mode').selectOption('dark');await openProfile();assert.equal(await page.locator('#profile-dialog').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(27, 42, 65)');await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});await page.locator('[data-panel=inspector]').click();await openProfile();assert.match(await page.locator('#profile-normative').innerText(),/UNKNOWN/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.keyboard.press('Escape');await page.setViewportSize({width:1440,height:900});
  checks.push('read-only exact current profile dialog, explicit normative UNKNOWN, catalog and model byte/history identity, Help-to-diagnostics routing, keyboard focus return to visible Help, dark and narrow surfaces');
}
