// Manual, synthetic defect control. Pass a frozen source checkout; no user model is opened.
// node scripts/probe-persistence-clobber.mjs /absolute/path/to/frozen-checkout
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const source = path.resolve(process.argv[2] || '.'), load = relative => import(pathToFileURL(path.join(source, relative)));
const [{ readProjectSnapshot, writeBoundProject }, { createNativeDirectory }, { updateNativeDirectory }, { createProject, exportFiles }, { serializeProjectFile }] = await Promise.all([
  load('electron/project-files.mjs'), load('electron/native-directory.mjs'), load('electron/directory-update.mjs'),
  load('schemka-model-core/src/index.js'), load('schemka-model-io/src/project-file.js'),
]);
const encode = state => Buffer.from(serializeProjectFile(state)), results = [];
for (const scenario of ['file-replace', 'native-replace', 'native-delete']) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'arkita-clobber-control-'));
  try {
    const before = createProject('Before');
    before.elements = [{ id: 'el-00000000-0000-4000-8000-000000000001', type: 'Role', name: 'Before', documentation: '', properties: {} }];
    const after = structuredClone(before); after.project.name = 'After!'; after.elements[0].name = 'After!';
    let target, write;
    if (scenario === 'file-replace') {
      target = path.join(parent, 'model.arkita'); await fs.writeFile(target, encode(before));
      const { snapshot } = await readProjectSnapshot(target); write = io => writeBoundProject(snapshot, encode(after), io);
    } else {
      const created = await createNativeDirectory(parent, encode(before)), root = path.join(parent, created.name);
      target = path.join(root, exportFiles(before).find(file => file.path.startsWith('model/')).path);
      if (scenario === 'native-delete') after.elements = [];
      write = io => updateNativeDirectory(created.snapshot, encode(after), io);
    }
    const external = Buffer.from((await fs.readFile(target, 'utf8')).replace('Before', 'Other!'));
    let injectionFired = false, saveAcknowledged = false, errorCode;
    const inject = async () => { if (!injectionFired) { injectionFired = true; await fs.writeFile(target, external); } };
    try {
      await write({ ...fs,
        rename: async (from, to) => { if (from === target || to === target) await inject(); return fs.rename(from, to); },
        unlink: async file => { if (file === target) await inject(); return fs.unlink(file); },
      }); saveAcknowledged = true;
    } catch (error) { errorCode = error.code || error.name; }
    const externalExactSurvivors = [];
    async function scan(directory) {
      for (const item of await fs.readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, item.name);
        if (item.isDirectory()) await scan(file);
        else if (item.isFile() && (await fs.readFile(file)).equals(external)) externalExactSurvivors.push(path.relative(parent, file).split(path.sep).join('/'));
      }
    }
    await scan(parent); results.push({ scenario, injectionFired, saveAcknowledged, ...(errorCode ? { errorCode } : {}), externalExactSurvivors });
  } finally { await fs.rm(parent, { recursive: true, force: true }); }
}
process.stdout.write(JSON.stringify({ source, node: process.version, platform: process.platform, results }, null, 2) + '\n');
