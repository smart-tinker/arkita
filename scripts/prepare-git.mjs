import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import extract from '@electron-internal/extract-zip';

// Official application-oriented distribution, pinned independently of installed Git.
const version = '2.56.0.2';
const name = `MinGit-${version}-64-bit.zip`;
const url = `https://github.com/git-for-windows/git/releases/download/v2.56.0.windows.2/${name}`;
const sha256 = 'da35e72aa21c005a5a0d298cfbae110bc1609a815730ea0dde84b01a1b3cd3be';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'release', 'git-runtime');
const archive = path.join(root, name), destination = path.join(root, 'windows-x64');
await fs.mkdir(root, { recursive: true });
let bytes;
try { bytes = await fs.readFile(archive); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw Error(`MinGit download failed: HTTP ${response.status}`);
  const chunks = []; let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 64 * 1024 * 1024) throw Error('MinGit archive exceeded its download limit');
    chunks.push(chunk);
  }
  bytes = Buffer.concat(chunks);
}
if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw Error('MinGit SHA-256 mismatch; nothing extracted');
await fs.writeFile(archive, bytes);
const staging = await fs.mkdtemp(path.join(root, '.extract-'));
try {
  await extract(archive, { dir: staging });
  for (const file of ['cmd/git.exe', 'usr/bin/ssh.exe']) {
    if (!(await fs.stat(path.join(staging, file))).isFile()) throw Error(`MinGit is incomplete: ${file}`);
  }
  await fs.writeFile(path.join(staging, 'ARKITA-DISTRIBUTION.txt'),
    `Unmodified official MinGit ${version} Windows x64\n${url}\nSHA256 ${sha256}\n` +
    'Upstream source and component information: https://github.com/git-for-windows/git/tree/v2.56.0.windows.2\nhttps://gitforwindows.org/\n');
  // Re-extract verified bytes every build so a stale or altered cache cannot ship.
  await fs.rm(destination, { recursive: true, force: true });
  await fs.rename(staging, destination);
} finally { await fs.rm(staging, { recursive: true, force: true }); }
console.log(`Prepared official MinGit ${version} Windows x64 (${sha256})`);
