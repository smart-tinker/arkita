import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

async function start() {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../serve.mjs', import.meta.url))], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] });
  const url = await new Promise((resolve, reject) => {
    let text = '';
    child.stdout.on('data', chunk => { text += chunk; const match = text.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) resolve(match[0]); });
    child.on('error', reject); child.on('exit', code => reject(new Error(`Server stopped: ${code}`)));
  });
  return { url, async close() { child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); } };
}
test('localhost server serves exact native-module graph, safe headers and refuses workspace paths', async () => {
  const server = await start();
  try {
    const root = await fetch(server.url); assert.equal(root.status, 200); assert.equal(root.url, `${server.url}/schemka-model-ui/index.html`);
    const html = await root.text(); assert.match(html, /Arkita/); assert.match(html, /Content-Security-Policy/); assert.match(html, /connect-src 'none'/);
    for (const path of ['/schemka-model-ui/style.css', '/schemka-model-ui/src/leave-state.js', '/schemka-site-shell/src/navigation.js', '/schemka-model-ui/src/app.js', '/schemka-model-ui/src/context-menu.js', '/schemka-model-ui/src/context-actions.js', '/schemka-model-ui/src/drag-drop.js', '/schemka-model-ui/src/profile-ui.js', '/schemka-model-ui/src/palette-actions.js', '/schemka-model-ui/src/typed-actions.js', '/schemka-model-core/src/current-catalog.js', '/schemka-model-profiles/src/index.js', '/schemka-model-profiles/src/descriptor.js', '/schemka-model-profiles/src/current.js', '/schemka-model-ui/src/view-actions.js', '/schemka-model-ui/src/project-session.js', '/schemka-model-ui/src/file-actions.js', '/schemka-model-ui/src/browser-files.js', '/schemka-model-io/src/index.js', '/schemka-model-io/src/project-file.js', '/schemka-model-io/src/mermaid.js', '/schemka-model-ui/src/controller.js', '/schemka-model-ui/src/demo.js', '/schemka-model-ui/src/theme.js', '/schemka-model-ui/src/rename.js', '/schemka-model-ui/src/inline-editor.js', '/schemka-model-core/src/index.js', '/schemka-model-core/src/format.js', '/schemka-model-core/src/json.js', '/schemka-model-core/src/store.js']) {
      const response = await fetch(`${server.url}${path}`); assert.equal(response.status, 200, path);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); assert.equal(response.headers.get('cache-control'), 'no-store');
      if (path.endsWith('.js')) { assert.match(response.headers.get('content-type'), /javascript/); assert.doesNotMatch(await response.text(), /from ['"]node:/); }
    }
    for (const path of ['/etc/passwd', '/schemka-model-ui/test/current-fixture.js', '/schemka-model-profiles/README.md', '/schemka-model-ui/package.json', '/schemka-model-ui/serve.mjs', '/schemka-model-core/test/core.test.js', '/schemka-model-io/test/project-file.test.js', '/schemka-model-io/README.md', '/schemka-model-profiles/README.md', '/schemka-model-profiles/test/profiles.test.js', '/schemka-model-ui/../README.md', '/%2e%2e%2fpackage.json', '/%ZZ']) assert.equal((await fetch(`${server.url}${path}`)).status, 404, path);
  } finally { await server.close(); }
});
