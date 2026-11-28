import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { APP_URL, createAssetHandler } from '../boundary.mjs';

async function bundle(t) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'arkita-asset-root-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'arkita'), assets = new Map();
  for (const pkg of ['schemka-model-ui', 'schemka-model-core', 'schemka-model-io', 'schemka-model-profiles']) {
    await fs.mkdir(path.join(root, pkg, 'src'), { recursive: true });
    assets.set(`${pkg}/src/index.js`, `export const packageName = '${pkg}';`);
  }
  for (const name of ['index.html', 'style.css', 'palette.html', 'palette.css', 'catalog.html', 'catalog.css']) assets.set(`schemka-model-ui/${name}`, `bundled ${name}`);
  for (const [name, content] of assets) await fs.writeFile(path.join(root, name), content, { flag: 'wx' });
  const alias = path.join(temp, 'bundle-alias');
  await fs.symlink(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  return { root, alias, temp, assets };
}

async function assertAssets(root, assets) {
  const handle = await createAssetHandler(root);
  for (const [name, content] of assets) {
    const response = handle({ url: `schemka://app/${name}`, method: 'GET' });
    assert.equal(response.status, 200, name);
    assert.equal(await response.text(), content, name);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }
  assert.equal(handle({ url: 'schemka://app/outside.html', method: 'GET' }).status, 403);
  assert.equal(handle({ url: APP_URL, method: 'POST' }).status, 403);
}

test('trusted bundle directory alias serves only the bundled assets', async t => {
  const fixture = await bundle(t);
  assert.notEqual(await fs.realpath(fixture.alias), path.resolve(fixture.alias));
  await assertAssets(fixture.alias, fixture.assets);
});

test('canonicalizing the bundle root still rejects an embedded asset file symlink', async t => {
  const { root, alias, temp } = await bundle(t);
  const target = path.join(temp, 'outside.html'), asset = path.join(root, 'schemka-model-ui', 'index.html');
  await fs.writeFile(target, 'outside the bundle', { flag: 'wx' });
  await fs.unlink(asset);
  try { await fs.symlink(target, asset, 'file'); }
  catch (error) {
    if (process.platform === 'win32' && error.code === 'EPERM') return t.skip('Creating file symlinks requires Windows privileges');
    throw error;
  }
  await assert.rejects(createAssetHandler(alias), /Bundled asset may not be a symbolic link: \/schemka-model-ui\/index\.html/);
});

test('Windows case alias of the trusted bundle directory serves the same assets', { skip: process.platform !== 'win32' }, async t => {
  const { root, assets } = await bundle(t);
  const alias = path.join(path.dirname(root), 'ARKITA');
  assert.notEqual(path.resolve(alias), await fs.realpath(root));
  assert.equal(await fs.realpath(alias), await fs.realpath(root));
  await assertAssets(alias, assets);
});
