import { FORMAT_VERSION } from '../schemka-model-core/src/index.js';
import path from 'node:path';
import * as fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { trustedSender } from './boundary.mjs';
import { atomicWrite, directoryBoundary, projectBytes, readProject, readProjectSnapshot, writeBoundProject, inspectProjectFileRecovery, recoverProjectFile } from './project-files.mjs';
import { createNativeDirectory, readNativeDirectory, INCOMPLETE_MARKER, RECOVERY_MARKER } from './native-directory.mjs';
import { updateNativeDirectory, recoverNativeDirectory } from './directory-update.mjs';
import { projectFileName, readProjectFile, serializeProjectFile } from '../schemka-model-io/src/project-file.js';
import { outlineTextRuns } from './text-outline-service.mjs';
import { validateExchangeXml } from './xml-validator.mjs';
import { readExternalFiles, saveExternalFiles } from './external-files.mjs';
import { assertSvgExport } from '../schemka-model-ui/src/svg-export.js';

const tokenOK = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const inside = (target, root) => { const relative = path.relative(root, target); return !relative || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative); };
const fail = (code, message) => { throw Object.assign(Error(message), { code }); };

/** Prepare a model before creating its window; recovery may need a parentless native dialog. */
export async function prepareFileOpen(selected, { dialog, window, reader = readProjectSnapshot,
  inspectFileRecovery = inspectProjectFileRecovery, recoverFile = recoverProjectFile, revalidate = () => {} }) {
  let opened, recovered;
  try { opened = await reader(selected); }
  catch (error) {
    if (error.code !== 'FILE_RECOVERY' || !error.recoveryMarkerPath) throw error;
    const marker = error.recoveryMarkerPath, journal = await inspectFileRecovery(marker);
    const choices = [{ label: 'Отмена', side: null },
      ...(journal.before ? [{ label: 'Вернуть до сохранения', side: 'before' }] : []),
      { label: 'Завершить сохранение', side: 'after' },
      ...(journal.external.length === 1 ? [{ label: 'Вернуть внешнюю версию', side: 'displaced' }] : [])];
    const options = { type: 'warning', title: 'Восстановить файл',
      message: `Сохранение «${path.basename(journal.target)}» было прервано.`,
      detail: `Выберите сохранённую версию для файла:\n${journal.target}\n\nМеняется только файл на диске. Открытая модель и история сохраняются. Все копии останутся в каталоге восстановления. После восстановления модель Arkita можно будет открыть отдельным подтверждением.`,
      buttons: choices.map(choice => choice.label), defaultId: 0, cancelId: 0, noLink: true };
    const result = await (window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options));
    const side = choices[result.response]?.side;
    if (!side) return { status: 'cancelled' };
    revalidate();
    recovered = await recoverFile(marker, side);
    try {
      opened = await reader(recovered.path);
      readProjectFile(opened.bytes);
    } catch {
      // Recovery also serves SVG/Mermaid bytes. Successful disk restoration
      // does not imply that the restored file is a readable Arkita model.
      return { status: 'recovered', name: recovered.name, warning: recovered.warning,
        message: 'Файл восстановлен на диске, но не открыт в редакторе. Здесь можно открыть только доступную и корректную модель Arkita. Открытая модель и история не изменены.' };
    }
  }
  return { status: 'opened', prepared: opened, ...(recovered ? { recovered: true, warning: recovered.warning } : {}) };
}

/** One native I/O operation at a time. Paths, disk observations and pending candidates stay in main. */
export function createFileService({ window, dialog, read = readProject, write = atomicWrite,
  isExternalBusy = () => false, assertDestination = async () => {}, backup = async () => {}, printDocument = null,
  readFileSnapshot = readProjectSnapshot, writeCurrentFile = writeBoundProject,
  inspectFileRecovery = inspectProjectFileRecovery, recoverFile = recoverProjectFile,
  hostActions,
  readDirectory = readNativeDirectory, writeDirectory = createNativeDirectory,
  updateDirectory = updateNativeDirectory, recoverDirectory = recoverNativeDirectory }) {
  let busy = false, documentToken = null, binding = null, fileBinding = null, candidate = null, directoryGeneration = 0;
  const issues = new Map();
  const summary = () => ({ generation: directoryGeneration, binding: binding ? { id: binding.id, name: path.basename(binding.snapshot.guard.root), documentToken: binding.documentToken, blocked: issues.has(binding.snapshot.guard.root), requiresSaveAs: binding.sourceVersion < FORMAT_VERSION } : null,
    file: fileBinding ? { id: fileBinding.id, name: path.basename(fileBinding.snapshot.path), documentToken: fileBinding.documentToken, blocked: fileBinding.blocked, requiresSaveAs: fileBinding.sourceVersion < FORMAT_VERSION } : null,
    issues: [...issues.values()].map(issue => ({ id: issue.id, name: path.basename(issue.root), status: issue.status })) });
  function issue(root, status, transaction) {
    directoryGeneration++;
    issues.set(root, { id: issues.get(root)?.id || randomUUID(), root, status, transaction });
  }
  function adopt(token) {
    if (!tokenOK(token)) fail('DIRECTORY_SESSION', 'Некорректная файловая сессия.');
    if (documentToken === null) documentToken = token;
    if (documentToken !== token) fail('DIRECTORY_SESSION', 'Открытая модель уже изменилась.');
  }
  function rescueTarget(target) {
    if (path.resolve(target).split(path.sep).some(part => part.toLowerCase() === '.git' || part.toLowerCase().startsWith('.schemka-transaction-'))) fail('DIRECTORY_RESERVED', 'Выберите назначение вне служебных каталогов.');
    for (const entry of issues.values()) if (inside(target, entry.root) || entry.transaction && inside(target, entry.transaction)) fail('DIRECTORY_QUARANTINED', 'Этот каталог требует проверки или восстановления. Сохраните копию в другом месте.');
  }
  function rejectOwnedExport(target, root) {
    const comparable = value => process.platform === 'win32' ? value.toLowerCase() : value;
    const relative = path.relative(comparable(path.resolve(root)), comparable(path.resolve(target)));
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return;
    const [top, collection, record, drawing] = relative.toLowerCase().split(path.sep);
    const shaped = (name, prefix) => Boolean(name && (name.endsWith('.json') || name.startsWith(`${prefix}-`)));
    // Match the reader's owned namespaces, including malformed/new native-shaped entries.
    // Unowned notes/subdirectories remain valid export destinations without a disk scan.
    let owned = ['schemka.json', INCOMPLETE_MARKER, RECOVERY_MARKER].includes(top);
    if (top === 'model') {
      const prefixes = { elements: 'el', junctions: 'jct', relationships: 'rel', 'customization-profiles': 'prf', folders: 'fld' };
      const prefix = Object.hasOwn(prefixes, collection) && prefixes[collection];
      owned = !collection || Boolean(prefix && (!record || shaped(record, prefix)));
    } else if (top === 'assets') owned = !collection || shaped(collection, 'ast');
    else if (top === 'viewpoints') owned = !collection || shaped(collection, 'vpt');
    else if (top === 'views') {
      owned = !collection || collection.startsWith('view-') && (!record || record.endsWith('.json') ||
        ['occurrences', 'connections', 'visual-nodes', 'visual-connectors'].includes(record) && (!drawing || shaped(drawing, { occurrences: 'occ', connections: 'conn', 'visual-nodes': 'vnd', 'visual-connectors': 'vcn' }[record])));
    }
    if (owned) fail('DIRECTORY_OWNED', 'Это запись каталога модели. Выберите отдельный файл для экспорта.');
  }
  async function exportTarget(target, root) {
    if (root) rejectOwnedExport(target, root);
    // Expand Windows short names/extended aliases for comparison only. The writer
    // still receives the picker spelling and enforces its own no-follow boundary.
    await directoryBoundary(path.dirname(path.resolve(target)), fs);
    async function existingRoot(value) {
      if (!value) return null;
      try { return await fs.realpath(value); }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    }
    const canonicalRoot = await existingRoot(root);
    let canonicalTarget;
    try { canonicalTarget = await fs.realpath(target); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      canonicalTarget = path.join(await fs.realpath(path.dirname(target)), path.basename(target));
    }
    rescueTarget(canonicalTarget);
    for (const entry of issues.values()) {
      const issueRoot = await existingRoot(entry.root), transaction = await existingRoot(entry.transaction);
      if (issueRoot && inside(canonicalTarget, issueRoot) || transaction && inside(canonicalTarget, transaction)) fail('DIRECTORY_QUARANTINED', 'Этот каталог требует проверки или восстановления. Сохраните копию в другом месте.');
    }
    if (canonicalRoot) rejectOwnedExport(canonicalTarget, canonicalRoot);
  }
  async function protectModelFile(target, snapshot) {
    if (!snapshot) return;
    const comparable = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
    const refuse = () => fail('FILE_OWNED', 'Это файл открытой модели. Выберите отдельный файл для экспорта.');
    if (comparable(target) === comparable(snapshot.path)) refuse();
    async function existing(action) { try { return await action(); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
    const [canonicalTarget, canonicalSource, targetStat, sourceStat] = await Promise.all([
      existing(() => fs.realpath(target)), existing(() => fs.realpath(snapshot.path)),
      existing(() => fs.stat(target, { bigint: true })), existing(() => fs.stat(snapshot.path, { bigint: true })),
    ]);
    if (canonicalTarget && canonicalSource && comparable(canonicalTarget) === comparable(canonicalSource)) refuse();
    // Identity also protects a renamed file or an additional hard-link spelling.
    if (targetStat && [snapshot.identity, sourceStat].some(stat => stat && stat.dev === targetStat.dev && stat.ino === targetStat.ino)) refuse();
  }
  async function protectSourceDirectory(target, snapshot) {
    if (!snapshot) return;
    let stat;
    try { stat = await fs.stat(target, { bigint: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (snapshot.identities.some(source => source.dev === stat.dev && source.ino === stat.ino)) fail('DIRECTORY_OWNED', 'Это исходная запись модели прежнего формата. Выберите отдельный файл, чтобы сохранить исходник.');
  }
  async function run(event, action) {
    if (!trustedSender(event, window)) return { status: 'error', message: 'Недопустимый источник запроса.', code: 'IPC_SENDER' };
    if (busy || isExternalBusy()) return { status: 'error', message: 'Дождитесь текущей файловой операции или операции Git.', code: 'FILE_BUSY' };
    busy = true;
    try { return await action(); }
    catch (error) {
      if (error.incompletePath) {
        issue(error.incompletePath, 'incomplete');
        dialog.showErrorBox('Каталог не сохранён', `Незавершённый результат оставлен в ${error.incompletePath}. Он не будет открыт как готовая модель. Повторное сохранение создаст другой каталог.`);
      }
      if (error.transactionPath) dialog.showErrorBox('Данные восстановления сохранены', `Служебные копии оставлены в ${error.transactionPath}. Не удаляйте их до проверки восстановленного файла или каталога.`);
      return { status: 'error', code: error.code || 'FILE_IO', message: error.message, ...(Array.isArray(error.diagnostics) ? { diagnostics: error.diagnostics.slice(0, 20) } : {}) };
    } finally { busy = false; }
  }
  async function runDirectory(event, action) { const result = await run(event, action); return result.code === 'IPC_SENDER' ? result : { ...result, directory: summary() }; }
  const filter = { name: 'Модель Arkita', extensions: ['arkita'] };
  const openFilters = [filter, { name: 'Прежний формат модели или файл восстановления (.json)', extensions: ['json'] }];
  async function save(bytes, name, filters, { token, extension, exporting = false, forbiddenSource = null, freshOnly = false } = {}) {
    const exportRoot = binding?.snapshot.guard.root ?? null;
    const exportFile = exporting ? fileBinding?.snapshot : null;
    const migrationFile = !exporting && fileBinding?.sourceVersion < FORMAT_VERSION ? fileBinding.snapshot : null;
    const migrationDirectory = binding?.sourceVersion < FORMAT_VERSION ? binding.snapshot : null;
    const result = await dialog.showSaveDialog(window, { title: freshOnly ? 'Восстановить в новый файл' : 'Сохранить как', defaultPath: name,
      filters, properties: ['showOverwriteConfirmation', 'dontAddToRecent'] });
    if (result.canceled || !result.filePath) return { status: 'cancelled' };
    if (token !== undefined) adopt(token);
    if (forbiddenSource) { await protectModelFile(result.filePath, { path: forbiddenSource }); await exportTarget(result.filePath, forbiddenSource); }
    await assertDestination(result.filePath);
    rescueTarget(result.filePath); if (exportRoot || issues.size) await exportTarget(result.filePath, exportRoot);
    const currentBinding = binding;
    const currentFile = fileBinding;
    if (currentBinding) await exportTarget(result.filePath, currentBinding.snapshot.guard.root);
    if (exporting) {
      await protectModelFile(result.filePath, exportFile);
      if (currentFile?.snapshot !== exportFile) await protectModelFile(result.filePath, currentFile?.snapshot);
      if (fileBinding !== currentFile) fail('FILE_SESSION', 'Открытая модель уже изменилась. Повторите экспорт.');
    }
    if (!exporting) {
      await protectModelFile(result.filePath, migrationFile);
      if (currentFile?.sourceVersion < FORMAT_VERSION && currentFile.snapshot !== migrationFile) await protectModelFile(result.filePath, currentFile.snapshot);
      if (fileBinding !== currentFile) fail('FILE_SESSION', 'Открытая модель уже изменилась. Повторите сохранение.');
    }
    if (migrationDirectory) await protectSourceDirectory(result.filePath, migrationDirectory);
    if (currentBinding?.sourceVersion < FORMAT_VERSION && currentBinding.snapshot !== migrationDirectory) await protectSourceDirectory(result.filePath, currentBinding.snapshot);
    if (binding !== currentBinding) fail('DIRECTORY_SESSION', 'Открытая модель уже изменилась.');
    if (extension && path.extname(result.filePath).toLowerCase() !== extension) fail('FILE_EXTENSION', `Выберите отдельный файл с расширением ${extension}.`);
    const written = await write(result.filePath, bytes, fs, null, { backup: exporting ? undefined : backup, freshOnly });
    const warning = () => written?.warning ? { warning: written.warning } : {};
    if (token === undefined || forbiddenSource) {
      await written?.finalize?.();
      return { status: 'saved', name: path.basename(result.filePath), ...warning() };
    }
    try {
      const saved = await readFileSnapshot(result.filePath);
      if (!Buffer.from(saved.bytes).equals(Buffer.from(bytes))) fail('FILE_CHANGED', 'Файл изменился после записи. Привязка не установлена.');
      await written?.finalize?.();
      return { status: 'saved', name: saved.name, candidate: propose(saved.snapshot, token, 'save', 'file'), ...warning() };
    } catch (error) {
      if (written?.transactionPath) error.transactionPath = written.transactionPath;
      throw error;
    }
  }
  async function chooseDirectory(title) {
    const result = await dialog.showOpenDialog(window, { title, properties: ['openDirectory', 'dontAddToRecent'] });
    if (result.canceled || !result.filePaths?.length) return null;
    if (result.filePaths.length !== 1) throw Error('Выберите ровно один каталог.');
    return result.filePaths[0];
  }
  function propose(snapshot, token, kind, target = 'directory') {
    if (documentToken !== token) return null;
    const sourceVersion = target === 'file' ? readProjectFile(snapshot.bytes).sourceVersion : snapshot.sourceVersion;
    candidate = { id: randomUUID(), snapshot, sourceVersion, sourceToken: token, kind, target };
    return candidate.id;
  }
  async function openFile(event, selected, token, prepareOnly = false) {
    const reader = token === undefined && !prepareOnly ? read : readFileSnapshot;
    const result = await prepareFileOpen(selected, { dialog, window, reader, inspectFileRecovery, recoverFile,
      revalidate() {
        if (!trustedSender(event, window)) fail('IPC_SENDER', 'Недопустимый источник запроса.');
        if (token !== undefined && token !== null) adopt(token);
      } });
    if (result.status !== 'opened' || prepareOnly) return result;
    const { prepared: opened, ...metadata } = result;
    return { ...metadata, name: opened.name, bytes: opened.bytes,
      ...(token === undefined ? {} : { candidate: propose(opened.snapshot, token, 'open', 'file') }) };
  }
  return Object.freeze({
    documentLocation: (event, token) => run(event, async () => { adopt(token); return { status: 'ok', path: fileBinding?.documentToken === token ? fileBinding.snapshot.path : binding?.documentToken === token ? binding.snapshot.guard.root : null }; }),
    get busy() { return busy; },
    get documentToken() { return documentToken; },
    get location() { return fileBinding ? { path: fileBinding.snapshot.path, identity: fileBinding.snapshot.identity }
      : binding ? { path: binding.snapshot.guard.root, identity: binding.snapshot.rootIdentity, kind: 'directory' } : null; },
    prepareDirectory: (event, selected) => runDirectory(event, async () => {
      try { return { status: 'opened', prepared: await readDirectory(selected) }; }
      catch (error) { if (error.code === 'DIRECTORY_INCOMPLETE') issue(selected, error.incompleteMarker === INCOMPLETE_MARKER ? 'incomplete' : 'recovery-required'); throw error; }
    }),
    prepareFile: (event, selected) => run(event, () => openFile(event, selected, documentToken, true)),
    openPrepared: (event, prepared, token, kind = 'file') => runDirectory(event, async () => {
      adopt(token); candidate = null; readProjectFile(prepared.bytes);
      return { status: 'opened', name: prepared.name, bytes: prepared.bytes, candidate: propose(prepared.snapshot, token, 'open', kind) };
    }),
    get hasDirectoryIssue() { return issues.size > 0; },
    // This synchronous acknowledgment also invalidates late I/O while a different document commits.
    documentChanged(event, previous, current, candidateId = null) {
      if (!trustedSender(event, window)) return { status: 'error', code: 'IPC_SENDER' };
      try {
        adopt(previous); if (!tokenOK(current)) fail('DIRECTORY_SESSION', 'Некорректная файловая сессия.');
        if (candidateId !== null) {
          if (!candidate || candidate.id !== candidateId || candidate.sourceToken !== previous || candidate.kind === 'save' && current !== previous || candidate.kind === 'open' && current === previous) {
            binding = null; fileBinding = null; candidate = null; documentToken = current; directoryGeneration++;
            fail('DIRECTORY_SESSION', 'Выбор каталога больше не актуален. Модель открыта без привязки к каталогу.');
          }
          if (candidate.target === 'file') {
            fileBinding = { id: randomUUID(), snapshot: candidate.snapshot, sourceVersion: candidate.sourceVersion, documentToken: current, blocked: false }; binding = null;
          } else {
            binding = { id: randomUUID(), snapshot: candidate.snapshot, sourceVersion: candidate.sourceVersion, documentToken: current }; fileBinding = null;
            if (issues.get(binding.snapshot.guard.root)?.status === 'changed') issues.delete(binding.snapshot.guard.root);
          }
        } else { binding = null; fileBinding = null; }
        documentToken = current; candidate = null; directoryGeneration++;
        return { status: binding || fileBinding ? 'bound' : 'detached', directory: summary() };
      } catch (error) { return { status: 'error', code: error.code || 'DIRECTORY_SESSION', message: error.message, directory: summary() }; }
    },
    open: (event, token) => (token === undefined ? run : runDirectory)(event, async () => {
      if (token !== undefined) { adopt(token); candidate = null; }
      const result = await dialog.showOpenDialog(window, { title: 'Открыть модель', filters: openFilters, properties: ['openFile', 'dontAddToRecent'] });
      if (result.canceled || !result.filePaths?.length) return { status: 'cancelled' };
      if (result.filePaths.length !== 1) throw Error('Выберите ровно один файл.');
      return openFile(event, result.filePaths[0], token);
    }),
    openDirectory: (event, token) => runDirectory(event, async () => {
      adopt(token); candidate = null;
      const root = await chooseDirectory('Открыть каталог модели'); if (!root) return { status: 'cancelled' };
      let opened;
      try { opened = await readDirectory(root); }
      catch (error) { if (error.code === 'DIRECTORY_INCOMPLETE') issue(root, error.incompleteMarker === INCOMPLETE_MARKER ? 'incomplete' : 'recovery-required'); throw error; }
      return { status: 'opened', name: opened.name, bytes: opened.bytes, candidate: propose(opened.snapshot, token, 'open') };
    }),
    saveDirectory: (event, input, token) => runDirectory(event, async () => {
      adopt(token); const { bytes } = projectBytes(input);
      const parent = await chooseDirectory('Родитель для нового каталога модели'); if (!parent) return { status: 'cancelled' };
      await assertDestination(parent); rescueTarget(parent);
      const saved = await writeDirectory(parent, bytes);
      return { status: 'saved', name: saved.name, candidate: propose(saved.snapshot, token, 'save') };
    }),
    saveBoundDirectory: (event, input, token) => runDirectory(event, async () => {
      adopt(token);
      const target = binding;
      if (!target || target.documentToken !== token) fail('DIRECTORY_SESSION', 'У этой модели нет открытого каталога.');
      if (target.sourceVersion < FORMAT_VERSION) fail('VERSION_SAVE_AS', `Модель обновлена до формата v${FORMAT_VERSION}. Сохраните её в новый каталог.`);
      const root = target.snapshot.guard.root;
      if (issues.has(root)) fail('DIRECTORY_QUARANTINED', 'Каталог требует проверки или восстановления. Используйте экспорт или новый каталог.');
      try {
        const saved = await updateDirectory(target.snapshot, input, fs, { backup });
        target.snapshot = saved.snapshot; directoryGeneration++; // Actual disk baseline, even if this renderer document was superseded.
        await saved.finalize?.();
        return { status: 'saved', name: path.basename(root), bindingId: target.id, warning: saved.warning };
      } catch (error) {
        if (error.recoveryRequired || error.code === 'DIRECTORY_INCOMPLETE') issue(root,
          !error.recoveryRequired && error.incompleteMarker === INCOMPLETE_MARKER ? 'incomplete' : 'recovery-required', error.transactionPath);
        else if (['DIRECTORY_CHANGED', 'DIRECTORY_TYPE', 'ENOENT'].includes(error.code)) issue(root, 'changed', error.transactionPath);
        throw error;
      }
    }),
    recoverDirectory: (event, id, side) => runDirectory(event, async () => {
      const target = [...issues.values()].find(item => item.id === id);
      if (!target || target.status !== 'recovery-required' || !['before', 'after'].includes(side)) fail('DIRECTORY_RECOVERY', 'Выберите каталог и вариант восстановления.');
      const result = await recoverDirectory(target.root, side);
      let boundBytes = null, boundToken = null, boundId = null;
      if (binding?.snapshot.guard.root === target.root) {
        binding.snapshot = result.snapshot; boundToken = binding.documentToken; boundId = binding.id; boundBytes = serializeProjectFile(result.snapshot.state);
      }
      issues.delete(target.root); directoryGeneration++;
      return { status: 'recovered', name: path.basename(target.root), warning: result.warning, boundBytes, boundToken, boundId };
    }),
    printView: (event, svg, options, token) => run(event, async () => {
      if (!printDocument) fail('PRINT_UNAVAILABLE', 'Печать недоступна.');
      adopt(token); const result = await printDocument(window, svg, options, false, () => adopt(token)); adopt(token); return result;
    }),
    savePdf: (event, svg, title, options, token) => run(event, async () => {
      if (!printDocument) fail('PRINT_UNAVAILABLE', 'Печать недоступна.');
      adopt(token); const result = await printDocument(window, svg, options, true, () => adopt(token)); adopt(token);
      if (result.status !== 'prepared') return result;
      const saved = await saveExternalFiles({ window, dialog, kind: 'pdf', records: [{ name: projectFileName(title).replace(/\.arkita$/, '.pdf'), bytes: result.bytes }], current: () => { if (documentToken !== token) fail('DOCUMENT_STALE', 'Модель уже изменилась.'); }, protect: async target => {
        await assertDestination(target); rescueTarget(target); await exportTarget(target, binding?.snapshot.guard.root); await protectModelFile(target, fileBinding?.snapshot);
      } });
      return { ...saved, pages: result.pages, columns: result.columns, rows: result.rows };
    }),
    openExternalLink: (event, url, token) => run(event, async () => { adopt(token); if (!hostActions) fail('HOST_UNAVAILABLE', 'Внешние приложения недоступны.'); return hostActions.openExternal(window, url, () => adopt(token)); }),
    openCredentialManager: (event, token) => run(event, async () => { adopt(token); if (!hostActions) fail('HOST_UNAVAILABLE', 'Внешние приложения недоступны.'); return hostActions.credentialManager(); }),
    outlineText: (event, runs, token) => run(event, async () => { adopt(token); const result = await outlineTextRuns(runs); adopt(token); return result; }),
    validateExchangeXml: (event, bytes, token) => run(event, async () => { adopt(token); const result = await validateExchangeXml(bytes); adopt(token); return result; }),
    readExternalFiles: (event, kind, token) => run(event, async () => {
      adopt(token); return readExternalFiles({ window, dialog, kind, current: () => adopt(token) });
    }),
    saveExternalFiles: (event, kind, records, token) => run(event, async () => {
      adopt(token); if (kind === 'pdf') fail('EXTERNAL_FORMAT', 'PDF создаётся командой печати.'); return saveExternalFiles({ window, dialog, kind, records, current: () => adopt(token), protect: async target => {
        adopt(token); await assertDestination(target); rescueTarget(target);
        await exportTarget(target, binding?.snapshot.guard.root); await protectModelFile(target, fileBinding?.snapshot);
        if (binding?.sourceVersion < FORMAT_VERSION) await protectSourceDirectory(target, binding.snapshot);
      } });
    }),
    saveRecoveryCopy: (event, input, name, sourcePath, token) => run(event, async () => {
      adopt(token); const bytes = Uint8Array.from(input); readProjectFile(bytes);
      return save(bytes, name, [filter], { token, extension: '.arkita', exporting: true, forbiddenSource: sourcePath, freshOnly: true });
    }),
    saveProject: (event, input, token) => (token === undefined ? run : runDirectory)(event, async () => {
      if (token !== undefined) { adopt(token); candidate = null; }
      const { bytes, name } = projectBytes(input); return save(bytes, name, [filter], { token });
    }),
    saveCurrentProject: (event, input, token) => runDirectory(event, async () => {
      adopt(token); const { bytes } = projectBytes(input), target = fileBinding;
      if (!target || target.documentToken !== token) fail('FILE_SESSION', 'У модели нет открытого файла. Используйте «Сохранить как».');
      if (target.sourceVersion < FORMAT_VERSION) fail('VERSION_SAVE_AS', `Модель обновлена до формата v${FORMAT_VERSION}. Сохраните её отдельным файлом через «Сохранить как».`);
      if (target.blocked) fail('FILE_CHANGED', 'Файл изменён вне Arkita. Откройте его заново или сохраните копию под другим именем.');
      rescueTarget(target.snapshot.path);
      if (issues.size) await exportTarget(target.snapshot.path);
      if (fileBinding !== target || documentToken !== token) fail('FILE_SESSION', 'Открытая модель уже изменилась.');
      try {
        const saved = await writeCurrentFile(target.snapshot, bytes, fs, { backup });
        target.snapshot = saved.snapshot; directoryGeneration++;
        return { status: 'saved', name: saved.name, bindingId: target.id, warning: saved.warning };
      } catch (error) {
        if (error.recoveryRequired || ['FILE_CHANGED', 'FILE_TYPE', 'FILE_LINKS', 'FILE_RECOVERY', 'FILE_RECOVERY_LIMIT', 'DIRECTORY_CHANGED', 'DIRECTORY_TYPE', 'ENOENT'].includes(error.code)) { target.blocked = true; directoryGeneration++; }
        throw error;
      }
    }),
    saveMermaid: (event, text) => run(event, async () => {
      if (typeof text !== 'string' || !text.length || text.length > 1024 * 1024) throw Error('Недопустимый экспорт Mermaid.');
      return save(new TextEncoder().encode(text), 'view.mmd', [{ name: 'Mermaid', extensions: ['mmd'] }], { exporting: true });
    }),
    saveSvg: (event, text, title = 'view') => run(event, async () => {
      assertSvgExport(text);
      return save(new TextEncoder().encode(text), projectFileName(title).replace(/\.arkita$/, '.svg'), [{ name: 'Изображение SVG', extensions: ['svg'] }], { extension: '.svg', exporting: true });
    }),
  });
}
