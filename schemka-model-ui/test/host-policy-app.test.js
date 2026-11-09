import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, production } from './app-test-fixture.js';
const tick = () => new Promise(resolve => setTimeout(resolve, 10));
test(`${production ? 'production' : 'source'} host policy opens from live Git dialog and preserves model across proxy/auth/external actions`, async t => {
 const calls = [], target = { remote: 'https://example.invalid/team/repo.git', branch: 'main', directory: 'arkita' }, policy = { mode: 'system', proxy: '', authorization: true };
 const h = await setup(t, { gitStatus: async () => ({ status: 'ok', available: true, target, changes: [], history: [], branches: [], milestones: [] }), gitNetworkPolicy: async (...args) => { calls.push(['read', ...args]); return { status: 'ok', target, policy }; }, gitSetNetworkPolicy: async (...args) => { calls.push(['save', ...args]); return { status: 'ok', target, policy: args[1] }; }, openExternalLink: async (...args) => { calls.push(['external', ...args]); return { status: 'cancelled' }; }, openCredentialManager: async (...args) => { calls.push(['credentials', ...args]); return { status: 'opened' }; } });
 h.$('git-button').click(); await tick(); assert.equal(h.$('git-dialog').open, true); h.$('host-policy-button').click(); await tick(); assert.equal(h.$('git-dialog').open, false); assert.equal(h.$('host-policy-dialog').open, true); assert.match(h.$('host-policy-target').textContent, /example.invalid/);
 h.change('host-proxy-mode', 'manual'); h.$('host-proxy-url').value = 'http://proxy.invalid:8080'; h.$('host-authorization').checked = false; h.$('host-policy-save').click(); await tick(); const saved = calls.find(call => call[0] === 'save'); assert.deepEqual(saved[2], { mode: 'manual', proxy: 'http://proxy.invalid:8080', authorization: false }); assert.match(saved[3], /^[0-9a-f-]{36}$/);
 h.$('host-external-url').value = 'https://example.invalid/help'; h.$('host-external-open').click(); await tick(); assert.ok(calls.some(call => call[0] === 'external')); h.$('host-policy-close').click(); assert.equal(h.$('host-policy-dialog').open, false); assert.equal(h.$('undo').disabled, true);
});
