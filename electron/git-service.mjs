import path from 'node:path';
import * as fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { modelChanges as changes, conflictContext } from './git-changes.mjs';
import { trustedSender } from './boundary.mjs';
import { exportFiles, importFiles, mergeProjectFiles } from '../schemka-model-core/src/index.js';
import { deserializeProjectFile, serializeNativeFiles } from '../schemka-model-io/src/project-file.js';
import { discoverGit, gitCommand, openGitRepository, validateTarget, gitFail, sameFiles, LOCAL_REF, REMOTE_REF } from './git-repository.mjs';

const tokenOK = token => typeof token === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(token);
const snapshot = bytes => { try { const state = deserializeProjectFile(bytes); return { state, files: exportFiles(state) }; } catch { gitFail('GIT_MODEL', 'Открытая модель не прошла проверку. Сохраните отдельную копию и проверьте модель.'); } };
const projectId = files => files ? importFiles(files).project.id : null;
const errorResult = error => ({ status: 'error', code: /^GIT_[A-Z_]+$/.test(error.code) ? error.code : 'GIT_IO', message: /^GIT_[A-Z_]+$/.test(error.code) ? error.message : 'Не удалось выполнить операцию Git. Локальные версии сохранены.' });
/** Renderer receives models and opaque tickets, never disk paths or a general Git command API. */
export function createGitService({ window, storagePath, isFileBusy = () => false, gitPath }) {
  let busy = false, repository = null, executable = null, initialized = false, documentToken = null, binding = null, candidate = null, plan = null, review = null;
  const settingsPath = path.join(storagePath, 'connection.json');
  function session(token) {
    if (!tokenOK(token)) gitFail('GIT_SESSION', 'Некорректная сессия модели.');
    if (documentToken === null) documentToken = token;
    if (documentToken !== token) gitFail('GIT_SESSION', 'Открытая модель уже изменилась.');
  }
  function requireRepository() { if (!repository) gitFail('GIT_CONNECTION', 'Сначала подключите Git-репозиторий.'); return repository; }
  async function initialize() {
    if (initialized) return;
    executable = await discoverGit(gitPath);
    await fs.mkdir(storagePath, { recursive: true, mode: 0o700 });
    try {
      const stat = await fs.lstat(settingsPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096) gitFail('GIT_STORAGE', 'Сохранённое подключение Git повреждено.');
      repository = await openGitRepository(storagePath, validateTarget(JSON.parse(await fs.readFile(settingsPath, 'utf8'))), executable);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    initialized = true;
  }
  async function persist(target) {
    const temporary = `${settingsPath}.${randomUUID()}.tmp`;
    try { await fs.writeFile(temporary, JSON.stringify(target) + '\n', { mode: 0o600, flag: 'wx' }); await fs.rename(temporary, settingsPath); }
    finally { await fs.rm(temporary, { force: true }); }
  }
  async function run(event, action) {
    if (!trustedSender(event, window)) return { status: 'error', code: 'IPC_SENDER', message: 'Недопустимый источник запроса.' };
    if (busy || isFileBusy()) return { status: 'error', code: 'GIT_BUSY', message: 'Дождитесь текущей файловой операции.' };
    busy = true;
    try { await initialize(); return await action(); }
    catch (error) { return errorResult(error); }
    finally { busy = false; }
  }
  async function defaults() {
    const read = async key => (await gitCommand(executable, storagePath, ['config', '--get', key], { allowFailure: true, maxBytes: 1024 })).stdout.toString().trim();
    return { authorName: await read('user.name'), authorEmail: await read('user.email') };
  }
  async function status(bytes, token) {
    if (token !== undefined) session(token);
    const version = (await gitCommand(executable, storagePath, ['--version'])).stdout.toString().trim();
    if (!repository) return { status: 'ok', available: true, version, target: null, head: null, remoteHead: null, hasModel: false, attached: false, changes: [], ahead: 0, behind: 0, history: [], ...await defaults() };
    const repo = repository, head = await repo.ref(LOCAL_REF), remoteHead = await repo.ref(REMOTE_REF), files = await repo.files(head), author = await repo.author();
    const localBranch = await repo.currentBranch();
    const attached = Boolean(binding && binding.repository === repo && binding.token === documentToken && binding.head === head && binding.branch === localBranch);
    return { status: 'ok', available: true, version, target: { ...repo.target, ...author }, ...author, head, remoteHead, hasModel: Boolean(files), attached, localBranch, openRevision: attached ? binding.head : null, branches: await repo.branches(), milestones: await repo.milestones(),
      changes: bytes === undefined ? [] : changes(files || [], snapshot(bytes).files), ...await repo.counts(head, remoteHead), history: await repo.history(head) };
  }
  function propose(repo, head, files, token, replacement = false) {
    session(token); candidate = { id: randomUUID(), repository: repo, head, files, token, replacement };
    return { status: 'ready', bytes: serializeNativeFiles(files), candidate: candidate.id };
  }
  async function attached(repo, token) {
    session(token);
    const head = await repo.ref(LOCAL_REF);
    if (candidate?.pending || !binding || binding.repository !== repo || binding.token !== token || binding.head !== head || binding.branch !== await repo.currentBranch()) gitFail('GIT_SESSION', 'Сначала откройте версию из Git. Привязка модели к версии больше не актуальна.');
    return head;
  }
  async function mergePlan(id, resolution, token) {
    session(token);
    if (!plan || plan.id !== id || plan.token !== token || plan.repository !== repository) gitFail('GIT_PLAN', 'План получения изменений устарел. Получите изменения заново.');
    if (await repository.ref(LOCAL_REF) !== plan.head || await repository.ref(REMOTE_REF) !== plan.remoteHead || await repository.currentBranch() !== plan.branch) gitFail('GIT_PLAN', 'Версии изменились. Получите изменения заново.');
    let merged;
    try { merged = mergeProjectFiles(plan.baseFiles, plan.localFiles, plan.remoteFiles, resolution); }
    catch { gitFail('GIT_RESOLUTION', 'Некорректное решение конфликтов. Повторите выбор.'); }
    return merged;
  }
  return Object.freeze({
    get busy() { return busy; },
    documentChanged(event, previous, current) {
      if (!trustedSender(event, window)) return { status: 'error', code: 'IPC_SENDER' };
      try {
        session(previous); if (!tokenOK(current)) gitFail('GIT_SESSION', 'Некорректная сессия модели.');
        if (previous !== current) {
          binding = null; plan = null; review = null;
          if (candidate?.token === previous && candidate.replacement) { candidate.token = current; candidate.replacement = false; } else candidate = null;
        }
        documentToken = current; return { status: 'ok' };
      } catch (error) { return errorResult(error); }
    },
    status: (event, bytes, token) => run(event, () => status(bytes, token)).then(result => result.code === 'GIT_MISSING' ? { ...result, available: false } : result),
    networkPolicy: (event, token, target) => run(event, async () => {
      session(token); const repo = target ? await openGitRepository(storagePath, validateTarget(target), executable) : requireRepository();
      return { status: 'ok', target: repo.target, policy: await repo.networkPolicy.get() };
    }),
    setNetworkPolicy: (event, target, policy, token) => run(event, async () => {
      session(token); const repo = target ? await openGitRepository(storagePath, validateTarget(target), executable) : requireRepository();
      return { status: 'ok', target: repo.target, policy: await repo.networkPolicy.set(policy) };
    }),
    connect: (event, target) => run(event, async () => {
      const next = await openGitRepository(storagePath, validateTarget(target), executable);
      const remote = await next.fetch(); await next.fetchMilestones(); const head = await next.ref(LOCAL_REF);
      if (!head && remote) await next.update(remote, null);
      await persist(next.target);
      repository = next; binding = null; candidate = null; plan = null; review = null;
      return status();
    }),
    open: (event, token) => run(event, async () => {
      session(token); const repo = requireRepository(), head = await repo.ref(LOCAL_REF), files = await repo.files(head, { preserveSource: true });
      if (!files) gitFail('GIT_EMPTY', 'В выбранном каталоге пока нет модели. Создайте первую локальную версию открытой модели.');
      return propose(repo, head, files, token, true);
    }),
    adopt: (event, id, token) => run(event, async () => {
      session(token);
      if (!candidate || candidate.id !== id || candidate.token !== token || candidate.repository !== repository || candidate.head !== await repository.ref(LOCAL_REF)) gitFail('GIT_SESSION', 'Выбранная версия больше не актуальна. Откройте её заново.');
      binding = { repository, head: candidate.head, branch: await repository.currentBranch(), token, projectId: projectId(candidate.files) }; candidate = null; plan = null;
      return status();
    }),
    commit: (event, bytes, token, message) => run(event, async () => {
      session(token); const repo = requireRepository(), head = await repo.ref(LOCAL_REF), before = await repo.files(head), current = snapshot(bytes);
      if (before) {
        await attached(repo, token);
        if (current.state.project.id !== binding.projectId) gitFail('GIT_PROJECT', 'Эта модель не относится к открытому репозиторию. Откройте модель из Git.');
      } else if (candidate?.pending) gitFail('GIT_SESSION', 'Сначала подтвердите полученную модель.');
      session(token);
      if (!sameFiles(before, current.files)) {
        const next = await repo.commit(current.files, message, head ? [head] : [], head);
        if (documentToken === token) binding = { repository: repo, head: next, branch: await repo.currentBranch(), token, projectId: current.state.project.id };
      }
      plan = null; candidate = null;
      return status();
    }),
    push: (event, token) => run(event, async () => {
      const repo = requireRepository(), head = await attached(repo, token); if (!head) gitFail('GIT_EMPTY', 'Сначала создайте локальную версию.');
      await repo.push(head); return status();
    }),
    receive: (event, bytes, token) => run(event, async () => {
      const repo = requireRepository(), head = await attached(repo, token), branch = binding.branch, localFiles = await repo.files(head), current = snapshot(bytes);
      if (!sameFiles(localFiles, current.files)) gitFail('GIT_DIRTY', 'Сначала сохраните изменения как локальную версию Git.');
      const remoteHead = await repo.fetch(); await repo.fetchMilestones(); session(token);
      if (!remoteHead) gitFail('GIT_REMOTE_EMPTY', 'Ветка на сервере отсутствует. Локальные версии сохранены.');
      const base = await repo.base(head, remoteHead); if (!base) gitFail('GIT_UNRELATED', 'У веток нет общей истории. Выберите другой каталог или репозиторий; локальная модель сохранена.');
      const baseFiles = await repo.files(base), remoteFiles = await repo.files(remoteHead);
      if (!remoteFiles || !baseFiles) gitFail('GIT_MODEL', 'В истории отсутствует общая модель. Автоматическое получение невозможно.');
      if (projectId(localFiles) !== projectId(remoteFiles)) gitFail('GIT_PROJECT', 'На сервере другая модель. Откройте её отдельным подключением.');
      const merged = mergeProjectFiles(baseFiles, localFiles, remoteFiles);
      plan = { id: randomUUID(), repository: repo, token, head, branch, remoteHead, base, baseFiles, localFiles, remoteFiles };
      return { status: 'ready', plan: plan.id, conflicts: conflictContext(merged.conflicts, baseFiles, localFiles, remoteFiles), structuralError: merged.structuralError, files: merged.files, changes: merged.files ? changes(localFiles, merged.files) : [] };
    }),
    apply: (event, id, resolution, token) => run(event, async () => {
      const merged = await mergePlan(id, resolution, token);
      if (!merged.files || merged.structuralError) gitFail('GIT_MODEL_CONFLICT', 'Решите все конфликты. Если выбранные записи несовместимы, выберите целую локальную или серверную модель.');
      const current = plan, repo = current.repository;
      let head = current.head;
      if (current.head !== current.remoteHead) {
        if (current.base === current.head && sameFiles(merged.files, current.remoteFiles)) { await repo.update(current.remoteHead, current.head); head = current.remoteHead; }
        else if (current.base !== current.remoteHead || !sameFiles(merged.files, current.localFiles)) head = await repo.commit(merged.files, 'Объединение изменений модели', [current.head, current.remoteHead], current.head);
      }
      const result = propose(repo, head, merged.files, token); candidate.pending = true; binding = null; plan = null; review = null;
      return result;
    }),
    inspect: (event, oid, bytes, token) => run(event, async () => {
      session(token); const repo = requireRepository(); await repo.revision(oid);
      const selected = await repo.files(oid), current = snapshot(bytes), head = await repo.ref(LOCAL_REF);
      if (!selected) gitFail('GIT_EMPTY', 'В этой версии ещё нет модели.');
      const parents = (await repo.run(['show', '-s', '--format=%P', oid])).stdout.toString().trim().split(' ').filter(Boolean);
      const before = parents[0] ? await repo.files(parents[0]) : [];
      session(token); review = { id: randomUUID(), kind: 'revision', repository: repo, token, head, branch: await repo.currentBranch(), oid, files: selected, currentFiles: current.files };
      return { status: 'ready', inspection: review.id, oid, parents, entry: (await repo.history(oid))[0],
        changes: changes(before || [], selected), workingChanges: changes(current.files, selected),
        records: selected.map(file => ({ path: file.path, record: JSON.parse(file.content) })),
        canRestore: current.state.project.id === projectId(selected) && Boolean(binding && binding.head === head && binding.token === token && binding.repository === repo) };
    }),
    restore: (event, id, bytes, token) => run(event, async () => {
      const repo = requireRepository(); await attached(repo, token);
      if (!review || review.kind !== 'revision' || review.id !== id || review.repository !== repo || review.token !== token || review.head !== await repo.ref(LOCAL_REF) || review.branch !== await repo.currentBranch() || !sameFiles(review.currentFiles, snapshot(bytes).files)) gitFail('GIT_PLAN', 'Просмотр устарел. Откройте версию заново.');
      if (projectId(review.files) !== binding.projectId) gitFail('GIT_PROJECT', 'В этой версии другая модель.');
      // Restoration edits the open document only. A later explicit commit records the restoration.
      const result = { status: 'ready', bytes: serializeNativeFiles(review.files) }; review = null; return result;
    }),
    createBranch: (event, name, token) => run(event, async () => {
      const repo = requireRepository(), head = await attached(repo, token);
      if (!head) gitFail('GIT_EMPTY', 'Сначала создайте локальную версию.');
      session(token); await repo.createBranch(name, head); return status();
    }),
    prepareBranch: (event, name, bytes, token) => run(event, async () => {
      const repo = requireRepository(), head = await attached(repo, token), oid = await repo.branchHead(name), selected = await repo.files(oid), current = snapshot(bytes);
      if (!selected) gitFail('GIT_EMPTY', 'В выбранной локальной ветке нет модели.');
      if (projectId(selected) !== binding.projectId || current.state.project.id !== binding.projectId) gitFail('GIT_PROJECT', 'В выбранной ветке другая модель.');
      session(token); review = { id: randomUUID(), kind: 'branch', repository: repo, token, head, branch: await repo.currentBranch(), name, oid, files: selected, currentFiles: current.files };
      return { status: 'ready', inspection: review.id, oid, name, changes: changes(current.files, selected), dirty: !sameFiles(await repo.files(head), current.files) };
    }),
    switchBranch: (event, id, bytes, token) => run(event, async () => {
      const repo = requireRepository(); await attached(repo, token);
      if (!review || review.kind !== 'branch' || review.id !== id || review.repository !== repo || review.token !== token || !sameFiles(review.currentFiles, snapshot(bytes).files)) gitFail('GIT_PLAN', 'Переключение устарело. Подготовьте его заново.');
      session(token); await repo.switchBranch(review.name, review.branch, review.head, review.oid);
      const result = propose(repo, review.oid, review.files, token); candidate.pending = true; binding = null; plan = null; review = null; return result;
    }),
    createMilestone: (event, name, oid, token) => run(event, async () => {
      const repo = requireRepository(); await attached(repo, token); await repo.revision(oid);
      const selected = await repo.files(oid);
      if (!selected || projectId(selected) !== binding.projectId) gitFail('GIT_PROJECT', 'В этой версии другая модель.');
      session(token); await repo.createMilestone(name, oid); return status();
    }),
    publishMilestone: (event, name, oid, token) => run(event, async () => {
      const repo = requireRepository(); await attached(repo, token); await repo.publishMilestone(name, oid); return status();
    }),
    deleteMilestone: (event, name, oid, token) => run(event, async () => {
      const repo = requireRepository(); await attached(repo, token); await repo.deleteMilestone(name, oid); return status();
    }),
    disconnect: event => run(event, async () => {
      await fs.rm(settingsPath, { force: true }); repository = null; binding = null; candidate = null; plan = null; review = null; return status();
    }),
  });
}
