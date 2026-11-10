import path from 'node:path';
import { createNetworkPolicy } from './git-network-policy.mjs';
import * as fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { LIMITS, exportFiles, importFiles } from '../schemka-model-core/src/index.js';

export const LOCAL_REF = 'refs/heads/arkita';
export const REMOTE_REF = 'refs/remotes/origin/arkita';
const BRANCH_ROOT = 'refs/heads/arkita-branches/';
const OID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
export const gitFail = (code, message) => { throw Object.assign(Error(message), { code }); };
const cleanText = (value, limit = 240) => String(value).replace(/[\p{Cc}\p{Cf}]/gu, ' ').slice(0, limit);
const utf8 = bytes => { try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); } catch { gitFail('GIT_MODEL', 'Запись модели содержит некорректный UTF-8.'); } };
export const sameFiles = (left, right) => Boolean(left && right && left.length === right.length && left.every((file, index) => file.path === right[index].path && file.content === right[index].content));

export function validateTarget(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) gitFail('GIT_TARGET', 'Укажите адрес репозитория, ветку и каталог модели.');
  const { remote, branch = 'main', directory = 'arkita', authorName = '', authorEmail = '' } = input;
  if (typeof remote !== 'string' || !remote || remote.length > 2048 || /[\s\p{Cc}\p{Cf}]/u.test(remote) && !path.isAbsolute(remote) || remote.startsWith('-') || /[\p{Cc}\p{Cf}]/u.test(remote)) gitFail('GIT_REMOTE', 'Некорректный адрес Git.');
  let allowed = path.isAbsolute(remote) || /^[A-Za-z]:[\\/]/.test(remote);
  if (!allowed && /^(https|ssh|file):\/\//.test(remote)) {
    let url; try { url = new URL(remote); } catch { gitFail('GIT_REMOTE', 'Некорректный адрес Git.'); }
    allowed = !url.password && !url.search && !url.hash && (url.protocol === 'https:' ? !url.username && Boolean(url.hostname) : url.protocol === 'ssh:' ? (Boolean(url.hostname) && (/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(url.hostname) || isIP(url.hostname.replace(/^\[|\]$/g, ''))) && (!url.username || /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(url.username))) : !url.username && (!url.hostname || url.hostname === 'localhost'));
  }
  if (!allowed && !remote.includes('://')) allowed = /^(?:[A-Za-z0-9_.-]+@)?[A-Za-z0-9][A-Za-z0-9.-]*:[^\s:?\x00-\x1f][^\s?\x00-\x1f]*$/.test(remote) && !remote.includes('::');
  if (!allowed) gitFail('GIT_REMOTE', 'Используйте HTTPS без учётных данных, SSH или абсолютный путь к Git-репозиторию.');
  if (typeof branch !== 'string' || branch.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch) || branch.includes('..') || branch.includes('//') || branch.endsWith('.') || branch.split('/').some(part => !part || part.startsWith('.') || part.endsWith('.lock'))) gitFail('GIT_BRANCH', 'Некорректное имя ветки.');
  if (typeof directory !== 'string' || directory.length > 180 || !/^[A-Za-z0-9_-][A-Za-z0-9._/-]*$/.test(directory) || directory.split('/').some(part => !part || part === '.' || part === '..' || part.toLowerCase() === '.git' || part.endsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) gitFail('GIT_DIRECTORY', 'Укажите относительный каталог модели, например arkita или models/main.');
  for (const value of [authorName, authorEmail]) if (typeof value !== 'string' || value.length > 200 || /[\p{Cc}\p{Cf}<>]/u.test(value)) gitFail('GIT_AUTHOR', 'Некорректное имя или почта автора.');
  return { remote, branch, directory, authorName: authorName.trim(), authorEmail: authorEmail.trim() };
}

export function validateRefName(name) {
  if (typeof name !== 'string' || name.length > 100 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes('..') || name.endsWith('.') || name.endsWith('.lock')) gitFail('GIT_NAME', 'Имя: до 100 латинских букв, цифр, точек, дефисов или подчёркиваний.');
  return name;
}

export async function discoverGit(gitPath) {
  const candidates = gitPath ? [gitPath] : process.platform === 'win32' ? [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'cmd', 'git.exe'),
    path.join(process.env.LOCALAPPDATA || 'C:\\Users\\Default\\AppData\\Local', 'Programs', 'Git', 'cmd', 'git.exe'),
  ] : ['/usr/bin/git', '/bin/git'];
  for (const candidate of candidates) {
    if (!path.isAbsolute(candidate)) continue;
    try { if ((await fs.stat(candidate)).isFile()) return candidate; } catch { /* Try the next known installation. */ }
  }
  gitFail('GIT_MISSING', 'Установите Git for Windows и настройте доступ по SSH или через Git Credential Manager. Затем повторите подключение.');
}

// Repository data never becomes command text, a checkout, a hook, or a filter input.
export function gitCommand(executable, directory, args, { input, timeout = 60000, maxBytes = 10 * 1024 * 1024, allowFailure = false, env: additions = {}, config = [], removeProxyEnvironment = false } = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key)));
  if (removeProxyEnvironment) for (const key of Object.keys(env)) if (/^(https?_proxy|all_proxy|no_proxy)$/i.test(key)) delete env[key];
  if (process.platform === 'win32') {
    const root = path.dirname(path.dirname(executable)), key = Object.keys(env).find(name => name.toUpperCase() === 'PATH') || 'PATH';
    env[key] = [path.dirname(executable), path.join(root, 'ucrt64', 'bin'), path.join(root, 'mingw64', 'bin'), path.join(root, 'usr', 'bin'), env[key] || ''].join(path.delimiter);
  }
  Object.assign(env, { GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1', GIT_LITERAL_PATHSPECS: '1' }, additions);
  const fixed = ['--no-pager', '-c', `core.hooksPath=${path.join(directory, 'arkita-no-hooks')}`, '-c', 'core.fsmonitor=false', '-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always', '-c', 'protocol.ssh.allow=always', '-c', 'protocol.file.allow=always', '-c', 'credential.interactive=true', '-c', 'maintenance.auto=false', '-c', 'gc.auto=0', '-c', 'commit.gpgSign=false', '-c', 'push.gpgSign=false', '-c', 'transfer.fsckObjects=true', '-c', 'fetch.fsckObjects=true'];
  for (const setting of config) fixed.push('-c', setting);
  if (directory) fixed.push(`--git-dir=${directory}`);
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [...fixed, ...args], { env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = []; let size = 0, errorSize = 0, failure = null, stopping = Promise.resolve();
    const stop = (code, message) => {
      if (failure) return; failure = Object.assign(Error(message), { code });
      if (!child.pid) return;
      if (process.platform === 'win32') stopping = new Promise(done => {
        const killer = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
        killer.on('error', () => { child.kill(); done(); }); killer.on('close', done);
      });
      else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill(); } }
    };
    const timer = setTimeout(() => stop('GIT_TIMEOUT', 'Git не завершил операцию вовремя. Локальные версии сохранены; проверьте состояние сервера перед повторной отправкой.'), timeout);
    child.on('error', () => stop('GIT_EXEC', 'Не удалось запустить Git. Проверьте его установку.'));
    child.stdout.on('data', chunk => { size += chunk.length; if (size > maxBytes) stop('GIT_LIMIT', 'Ответ Git превышает допустимый размер.'); else chunks.push(chunk); });
    child.stderr.on('data', chunk => { errorSize += chunk.length; if (errorSize > 1024 * 1024) stop('GIT_LIMIT', 'Ответ Git превышает допустимый размер.'); });
    child.stdin.on('error', () => {});
    child.on('close', async code => {
      clearTimeout(timer); await stopping; if (failure) { reject(failure); return; }
      if (code !== 0 && !allowFailure) reject(Object.assign(Error('Git не выполнил операцию. Проверьте адрес, доступ и состояние репозитория; локальные версии сохранены.'), { code: 'GIT_COMMAND' }));
      else resolve({ code, stdout: Buffer.concat(chunks) });
    });
    child.stdin.end(input);
  });
}

/** Store bounded raw blobs; branch/tree/commit publication remains with the caller. */
export async function writeGitBlobs(files, run) {
  if (!Array.isArray(files) || !files.length || files.length > LIMITS.files) gitFail('GIT_LIMIT', 'Недопустимое число записей Git.');
  const chunks = [], sizes = [], contents = []; let total = 0;
  for (const [index, file] of files.entries()) {
    if (typeof file.content !== 'string' || Buffer.byteLength(file.content) > LIMITS.fileBytes) gitFail('GIT_LIMIT', 'Превышен размер записи Git.');
    const raw = Buffer.from(file.content, 'utf8'), mark = index + 1;
    if ((total += raw.length) > LIMITS.totalBytes) gitFail('GIT_LIMIT', 'Превышен размер модели Git.');
    sizes.push(raw.length); contents.push(raw);
    chunks.push(Buffer.from(`blob\nmark :${mark}\ndata ${raw.length}\n`), raw, Buffer.from(`\nget-mark :${mark}\n`));
  }
  chunks.push(Buffer.from('done\n'));
  const result = await run(['fast-import', '--quiet', '--done'], { input: Buffer.concat(chunks), maxBytes: files.length * 65 });
  const oids = utf8(result.stdout).split('\n');
  if (oids.pop() !== '' || oids.length !== files.length || oids.some(oid => !OID.test(oid)) || new Set(oids.map(oid => oid.length)).size !== 1) {
    gitFail('GIT_MODEL', 'Некорректный ответ записи Git.');
  }
  if (oids.some((oid, index) => createHash(oid.length === 40 ? 'sha1' : 'sha256').update(`blob ${sizes[index]}\0`).update(contents[index]).digest('hex') !== oid)) {
    gitFail('GIT_MODEL', 'Содержимое записей Git не совпадает с моделью.');
  }
  const checked = await run(['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], {
    input: oids.join('\n') + '\n', maxBytes: files.length * 100,
  });
  const expected = oids.map((oid, index) => `${oid} blob ${sizes[index]}\n`).join('');
  if (!checked.stdout.equals(Buffer.from(expected))) gitFail('GIT_MODEL', 'Записи Git не прошли проверку.');
  return oids;
}

export async function openGitRepository(storagePath, input, executable) {
  const target = validateTarget(input);
  const key = createHash('sha256').update(JSON.stringify([target.remote, target.branch, target.directory])).digest('hex');
  const root = path.join(storagePath, 'repositories', key);
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  if ((await fs.lstat(root)).isSymbolicLink()) gitFail('GIT_STORAGE', 'Служебный каталог Git не должен быть ссылкой.');
  const networkPolicy = createNetworkPolicy(root, target.remote);
  const run = async (args, options = {}) => gitCommand(executable, root, args, { ...options, ...(['ls-remote', 'fetch', 'push'].includes(args[0]) ? await networkPolicy.options() : {}) });
  try { await fs.access(path.join(root, 'HEAD')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; await run(['init', '--bare', '--template=', '--initial-branch=arkita', root]); }
  if ((await run(['rev-parse', '--is-bare-repository'])).stdout.toString().trim() !== 'true') gitFail('GIT_STORAGE', 'Служебный репозиторий Arkita повреждён.');
  const text = async (args, options) => (await run(args, options)).stdout.toString('utf8').trim();
  async function ref(name) {
    const result = await run(['rev-parse', '--verify', '--quiet', `${name}^{commit}`], { allowFailure: true });
    if (result.code === 1) return null;
    const oid = result.stdout.toString().trim(); if (result.code || !OID.test(oid)) gitFail('GIT_REF', 'Не удалось прочитать версию Git.'); return oid;
  }
  async function currentBranch() {
    const symbolic = await run(['symbolic-ref', '--quiet', LOCAL_REF], { allowFailure: true });
    if (symbolic.code || !symbolic.stdout.toString().trim().startsWith(BRANCH_ROOT)) gitFail('GIT_STORAGE', 'Локальная ветка Arkita повреждена.');
    return validateRefName(symbolic.stdout.toString().trim().slice(BRANCH_ROOT.length));
  }
  // Preserve the original commit and author bytes when adopting pre-branch Arkita storage.
  const symbolic = await run(['symbolic-ref', '--quiet', LOCAL_REF], { allowFailure: true });
  if (symbolic.code === 1) {
    const previous = await ref(LOCAL_REF), first = `${BRANCH_ROOT}main`, existing = await ref(first);
    if (existing && existing !== previous) gitFail('GIT_STORAGE', 'Неоднозначная локальная история; сохранённые ветви не изменены.');
    if (previous && !existing) await run(['update-ref', first, previous, '0'.repeat(previous.length)]);
    await run(['symbolic-ref', LOCAL_REF, first]);
  }
  await currentBranch();
  const milestoneRoot = `refs/tags/arkita/${createHash('sha256').update(target.directory).digest('hex').slice(0, 16)}/`;
  const remoteMilestoneRoot = 'refs/remotes/arkita-milestones/';
  async function refs(prefix) {
    const output = await text(['for-each-ref', '--format=%(refname) %(objectname)', prefix]);
    const result = output ? output.split('\n').map(line => {
      const [name, oid] = line.split(' ');
      if (!name.startsWith(prefix) || !OID.test(oid)) gitFail('GIT_REF', 'Некорректная ссылка Git.');
      return { name: validateRefName(name.slice(prefix.length)), oid };
    }) : [];
    if (result.length > 200) gitFail('GIT_LIMIT', 'Слишком много ветвей или вех модели (максимум 200).');
    return result;
  }
  async function revision(oid) {
    if (typeof oid !== 'string' || !OID.test(oid) || await ref(oid) !== oid) gitFail('GIT_REVISION', 'Выберите существующую версию модели.');
    return oid;
  }
  async function milestones() {
    const local = await refs(milestoneRoot), remote = await refs(remoteMilestoneRoot);
    return [...new Set([...local.map(item => item.name), ...remote.map(item => item.name)])].sort().map(name => ({ name,
      oid: local.find(item => item.name === name)?.oid || null, remoteOid: remote.find(item => item.name === name)?.oid || null }));
  }
  async function fetchMilestones() {
    const advertised = await text(['ls-remote', '--tags', '--refs', '--', target.remote, `${milestoneRoot}*`]);
    const entries = advertised ? advertised.split('\n').map(line => {
      const [oid, name] = line.split('\t');
      if (!OID.test(oid) || !name?.startsWith(milestoneRoot)) gitFail('GIT_REF', 'Некорректная веха на сервере.');
      return { oid, name: validateRefName(name.slice(milestoneRoot.length)) };
    }) : [];
    if (entries.length > 200) gitFail('GIT_LIMIT', 'Слишком много вех модели на сервере (максимум 200).');
    // Mirror server observations separately; fetching never publishes or overwrites local milestones.
    if (entries.length) await run(['fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', '--refmap=', '--', target.remote,
      ...entries.map(entry => `+${milestoneRoot}${entry.name}:${remoteMilestoneRoot}${entry.name}`)]);
    for (const entry of entries) {
      const head = await ref(`${remoteMilestoneRoot}${entry.name}`);
      if (head !== entry.oid) gitFail('GIT_REF', 'Веха изменилась на сервере. Повторите получение.');
      await files(head);
    }
    for (const old of await refs(remoteMilestoneRoot)) if (!entries.some(item => item.name === old.name)) await run(['update-ref', '-d', `${remoteMilestoneRoot}${old.name}`, old.oid]);
  }
  async function author() {
    const get = async key => cleanText(await text(['config', '--get', key], { allowFailure: true }), 200);
    return { authorName: target.authorName || await get('user.name'), authorEmail: target.authorEmail || await get('user.email') };
  }
  async function treeEntries(tree) {
    if (!tree) return [];
    const output = (await run(['ls-tree', '-z', tree])).stdout;
    return utf8(output).split('\0').filter(Boolean).map(row => {
      const match = /^(\d{6}) (blob|tree|commit) ([0-9a-f]{40}(?:[0-9a-f]{24})?)\t([^\0]+)$/.exec(row);
      if (!match) gitFail('GIT_TREE', 'Некорректное дерево Git.');
      return { mode: match[1], type: match[2], oid: match[3], name: match[4] };
    });
  }
  async function modelTree(head) {
    if (!head) return null;
    let tree = head;
    for (const part of target.directory.split('/')) {
      const entry = (await treeEntries(tree)).find(item => item.name === part);
      if (!entry) return null;
      if (entry.type !== 'tree' || entry.mode !== '040000') gitFail('GIT_TREE', 'Каталог модели занят файлом, ссылкой или подмодулем.');
      tree = entry.oid;
    }
    return tree;
  }
  async function files(head, { preserveSource = false } = {}) {
    const tree = await modelTree(head); if (!tree) return null;
    const rows = (await run(['ls-tree', '-r', '-t', '-z', '-l', tree], { maxBytes: LIMITS.files * 4 * 256 })).stdout.toString('utf8').split('\0').filter(Boolean);
    if (!rows.length || rows.length > LIMITS.files * 4) gitFail('GIT_MODEL', 'Каталог Git должен содержать полную модель Arkita.');
    let total = 0;
    const trees = rows.filter(row => row.startsWith('040000 tree ')).map(row => row.slice(row.indexOf('\t') + 1));
    const entries = rows.filter(row => !row.startsWith('040000 tree ')).map(row => {
      const match = /^100644 blob ([0-9a-f]{40}(?:[0-9a-f]{24})?) +([0-9]+)\t(.+)$/.exec(row);
      if (!match || Number(match[2]) > LIMITS.fileBytes || (total += Number(match[2])) > LIMITS.totalBytes) gitFail('GIT_MODEL', 'В каталоге модели есть недопустимые записи или превышен размер модели.');
      return { oid: match[1], size: Number(match[2]), path: match[3] };
    });
    if (entries.length > LIMITS.files) gitFail('GIT_MODEL', 'Слишком много записей модели.');
    if (trees.some(treePath => !entries.some(entry => entry.path.startsWith(treePath + '/')))) gitFail('GIT_MODEL', 'В каталоге модели есть посторонний пустой каталог.');
    const output = (await run(['cat-file', '--batch'], { input: entries.map(item => item.oid).join('\n') + '\n', maxBytes: LIMITS.totalBytes + LIMITS.files * 120 })).stdout;
    let at = 0;
    const result = entries.map(entry => {
      const end = output.indexOf(10, at), header = output.subarray(at, end).toString();
      if (end < at || header !== `${entry.oid} blob ${entry.size}`) gitFail('GIT_MODEL', 'Некорректная запись Git.');
      at = end + 1; const content = utf8(output.subarray(at, at + entry.size)); at += entry.size;
      if (output[at++] !== 10) gitFail('GIT_MODEL', 'Неполная запись Git.');
      return { path: entry.path, content };
    });
    try { const state = importFiles(result); return preserveSource ? result : exportFiles(state); }
    catch { gitFail('GIT_MODEL', 'Каталог Git содержит посторонние файлы или некорректную модель Arkita. Выберите отдельный каталог модели.'); }
  }
  async function fetch() {
    const remoteRef = `refs/heads/${target.branch}`;
    const advertised = await text(['ls-remote', '--heads', '--', target.remote, remoteRef]);
    if (!advertised) { const before = await ref(REMOTE_REF); if (before) await run(['update-ref', '-d', REMOTE_REF, before]); return null; }
    if (!new RegExp(`^[0-9a-f]{40}(?:[0-9a-f]{24})?\\t${remoteRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`).test(advertised)) gitFail('GIT_REF', 'Сервер вернул неоднозначную ветку.');
    await run(['fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', '--refmap=', '--', target.remote, `+${remoteRef}:${REMOTE_REF}`]);
    const head = await ref(REMOTE_REF); await files(head); return head;
  }
  async function makeTree(entries) {
    return text(['mktree', '-z'], { input: entries.map(entry => `${entry.mode} ${entry.type} ${entry.oid}\t${entry.name}\0`).join('') });
  }
  async function writeFiles(records) {
    const files = exportFiles(importFiles(records)), oids = await writeGitBlobs(files, run), rootNode = new Map();
    for (const [index, file] of files.entries()) {
      const parts = file.path.split('/'); let node = rootNode;
      for (const name of parts.slice(0, -1)) { if (!node.has(name)) node.set(name, new Map()); node = node.get(name); }
      node.set(parts.at(-1), oids[index]);
    }
    async function writeNode(node) {
      const entries = [];
      for (const [name, value] of node) entries.push({ name, mode: typeof value === 'string' ? '100644' : '040000', type: typeof value === 'string' ? 'blob' : 'tree', oid: typeof value === 'string' ? value : await writeNode(value) });
      return makeTree(entries);
    }
    return writeNode(rootNode);
  }
  async function commit(records, message, parents, expected) {
    if (typeof message !== 'string' || !message.trim() || message.length > 2000 || /[\x00-\x08\x0b-\x1f\x7f]/.test(message)) gitFail('GIT_MESSAGE', 'Введите сообщение версии длиной до 2000 символов.');
    const identity = await author();
    if (!identity.authorName || !identity.authorEmail) gitFail('GIT_AUTHOR', 'Укажите имя и почту автора в подключении или настройте user.name и user.email в Git.');
    validateTarget({ ...target, ...identity });
    const model = await writeFiles(records), parts = target.directory.split('/');
    // The remote tree supplies every path outside the explicitly owned model folder.
    async function replace(tree, index) {
      const entries = await treeEntries(tree), name = parts[index], existing = entries.find(entry => entry.name === name);
      if (existing && existing.type !== 'tree') gitFail('GIT_TREE', 'Путь каталога модели занят.');
      const oid = index === parts.length - 1 ? model : await replace(existing?.oid, index + 1);
      return makeTree([...entries.filter(entry => entry.name !== name), { name, type: 'tree', mode: '040000', oid }]);
    }
    const tree = await replace(parents.at(-1), 0);
    const args = ['commit-tree', tree, ...parents.flatMap(parent => ['-p', parent]), '-F', '-'];
    const oid = await text(args, { input: message.trim() + '\n', env: { GIT_AUTHOR_NAME: identity.authorName, GIT_AUTHOR_EMAIL: identity.authorEmail, GIT_COMMITTER_NAME: identity.authorName, GIT_COMMITTER_EMAIL: identity.authorEmail } });
    await update(oid, expected); return oid;
  }
  async function update(oid, expected) { await run(['update-ref', LOCAL_REF, oid, expected || '0'.repeat(oid.length)]); }
  return {
    target, networkPolicy, run, ref, files, author, fetch, commit, update, currentBranch, revision, milestones, fetchMilestones,
    async branches() { const items = await refs(BRANCH_ROOT), current = await currentBranch(); return items.length ? items : [{ name: current, oid: null }]; },
    branchHead: name => ref(`${BRANCH_ROOT}${validateRefName(name)}`),
    async createBranch(name, head) {
      validateRefName(name); await revision(head);
      if ((await refs(BRANCH_ROOT)).length >= 200) gitFail('GIT_LIMIT', 'Достигнут предел локальных ветвей.');
      if (await ref(`${BRANCH_ROOT}${name}`)) gitFail('GIT_EXISTS', 'Такая локальная ветка уже существует.');
      await run(['update-ref', `${BRANCH_ROOT}${name}`, head, '0'.repeat(head.length)]);
    },
    async switchBranch(name, expectedBranch, expectedHead, nextHead) {
      validateRefName(name);
      if (await currentBranch() !== expectedBranch || await ref(LOCAL_REF) !== expectedHead || await ref(`${BRANCH_ROOT}${name}`) !== nextHead) gitFail('GIT_PLAN', 'Ветки изменились. Подготовьте переключение заново.');
      await revision(nextHead); await run(['symbolic-ref', LOCAL_REF, `${BRANCH_ROOT}${name}`]);
    },
    async createMilestone(name, head) {
      validateRefName(name); await revision(head);
      if ((await milestones()).length >= 200) gitFail('GIT_LIMIT', 'Достигнут предел вех модели.');
      if (await ref(`${milestoneRoot}${name}`)) gitFail('GIT_EXISTS', 'Такая локальная веха уже существует.');
      await run(['update-ref', `${milestoneRoot}${name}`, head, '0'.repeat(head.length)]);
    },
    async publishMilestone(name, expected) {
      validateRefName(name); await revision(expected);
      if (await ref(`${milestoneRoot}${name}`) !== expected) gitFail('GIT_PLAN', 'Веха изменилась. Обновите статус.');
      const result = await run(['push', '--porcelain', '--no-verify', '--no-follow-tags', '--recurse-submodules=no', '--', target.remote, `${expected}:${milestoneRoot}${name}`], { allowFailure: true });
      if (result.code) gitFail('GIT_PUSH', 'Веха не опубликована: имя занято на сервере или нет доступа. Локальная веха сохранена.');
      await run(['update-ref', `${remoteMilestoneRoot}${name}`, expected]);
    },
    async deleteMilestone(name, expected) {
      validateRefName(name); await revision(expected);
      if (await ref(`${milestoneRoot}${name}`) !== expected) gitFail('GIT_PLAN', 'Веха изменилась. Обновите статус.');
      await run(['update-ref', '-d', `${milestoneRoot}${name}`, expected]);
    },
    version: () => text(['--version']),
    async base(left, right) { const result = await run(['merge-base', '--all', left, right], { allowFailure: true }); const oid = result.stdout.toString().trim(); if (result.code === 1) return null; if (!result.code && oid.includes('\n')) gitFail('GIT_HISTORY', 'История имеет несколько общих предков. Автоматическое объединение невозможно; локальные версии сохранены.'); if (result.code || !OID.test(oid)) gitFail('GIT_HISTORY', 'Не удалось прочитать общую историю.'); return oid; },
    async push(head) {
      const result = await run(['push', '--porcelain', '--no-verify', '--no-follow-tags', '--recurse-submodules=no', '--', target.remote, `${head}:refs/heads/${target.branch}`], { allowFailure: true });
      if (result.code) gitFail('GIT_PUSH', 'Отправка не подтверждена: возможны новые версии на сервере или ошибка доступа. Локальные версии сохранены. Получите изменения и повторите отправку.');
      await run(['update-ref', REMOTE_REF, head]);
    },
    async counts(head, remoteHead) { if (!head) return { ahead: 0, behind: remoteHead ? Number(await text(['rev-list', '--count', remoteHead])) : 0 }; if (!remoteHead) return { ahead: Number(await text(['rev-list', '--count', head])), behind: 0 }; const [ahead, behind] = (await text(['rev-list', '--left-right', '--count', `${head}...${remoteHead}`])).split(/\s+/).map(Number); return { ahead, behind }; },
    async history(head) { if (!head) return []; const parts = (await run(['log', '-20', '-z', '--format=%H%x00%s%x00%an%x00%aI', head], { maxBytes: 1024 * 1024 })).stdout.toString().split('\0'); const records = []; for (let i = 0; i + 3 < parts.length; i += 4) records.push({ oid: parts[i], message: cleanText(parts[i + 1]), author: cleanText(parts[i + 2]), date: cleanText(parts[i + 3], 40) }); return records; },
  };
}
