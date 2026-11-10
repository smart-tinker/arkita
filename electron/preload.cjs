const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('schemkaDesktop', Object.freeze({
  paletteOpen: snapshot => ipcRenderer.invoke('schemka:palette-open', snapshot),
  palettePublish: snapshot => ipcRenderer.invoke('schemka:palette-publish', snapshot),
  paletteDock: () => ipcRenderer.invoke('schemka:palette-dock'),
  paletteResolveDrop: data => ipcRenderer.invoke('schemka:palette-resolve-drop', data),
  onPaletteCommand: callback => {
    if (typeof callback !== 'function') throw new TypeError('Expected callback');
    const listener = (_event, data) => callback(data); ipcRenderer.on('schemka:palette-command', listener);
    return () => ipcRenderer.removeListener('schemka:palette-command', listener);
  },
  onPaletteDocked: callback => {
    if (typeof callback !== 'function') throw new TypeError('Expected callback');
    const listener = () => callback(); ipcRenderer.on('schemka:palette-docked', listener);
    return () => ipcRenderer.removeListener('schemka:palette-docked', listener);
  },
  clipboardWriteFragment: options => ipcRenderer.invoke('schemka:clipboard-write-fragment', options),
  clipboardReadFragment: () => ipcRenderer.invoke('schemka:clipboard-read-fragment'),
  clipboardAcknowledgeCut: (id, token) => ipcRenderer.invoke('schemka:clipboard-acknowledge-cut', id, token),
  clipboardClaimCut: (id, token) => ipcRenderer.invoke('schemka:clipboard-claim-cut', id, token),
  clipboardCompleteCut: (id, token, result) => ipcRenderer.invoke('schemka:clipboard-complete-cut', id, token, result),
  clipboardWriteImage: (bytes, token) => ipcRenderer.invoke('schemka:clipboard-write-image', bytes, token),
  onClipboardCutDelivered: callback => {
    if (typeof callback !== 'function') throw new TypeError('Expected callback');
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('schemka:clipboard-cut-delivered', listener);
    return () => ipcRenderer.removeListener('schemka:clipboard-cut-delivered', listener);
  },
  printView: (svg, options, token) => ipcRenderer.invoke('schemka:print-view', svg, options, token),
  savePdf: (svg, title, options, token) => ipcRenderer.invoke('schemka:save-pdf', svg, title, options, token),
  openExternalLink: (url, token) => ipcRenderer.invoke('schemka:open-external-link', url, token),
  openCredentialManager: token => ipcRenderer.invoke('schemka:open-credential-manager', token),
  outlineText: (runs, token) => ipcRenderer.invoke('schemka:outline-text', runs, token),
  validateExchangeXml: (bytes, token) => ipcRenderer.invoke('schemka:validate-exchange-xml', bytes, token),
  readExternalFiles: (kind, token) => ipcRenderer.invoke('schemka:read-external-files', kind, token),
  saveExternalFiles: (kind, records, token) => ipcRenderer.invoke('schemka:save-external-files', kind, records, token),
  documentPreferences: () => ipcRenderer.invoke('schemka:document-preferences'),
  setDocumentPreferences: settings => ipcRenderer.invoke('schemka:set-document-preferences', settings),
  openRecent: id => ipcRenderer.invoke('schemka:open-recent', id),
  recoverBackup: (id, token) => ipcRenderer.invoke('schemka:recover-backup', id, token),
  newDocument: options => ipcRenderer.invoke('schemka:new-document', options),
  documentReady: token => ipcRenderer.invoke('schemka:document-ready', token),
  openDroppedFile: file => ipcRenderer.invoke('schemka:open-dropped', webUtils.getPathForFile(file)),
  closeDocument: () => ipcRenderer.invoke('schemka:close-document'),
  finishSaveClose: (request, token) => ipcRenderer.invoke('schemka:finish-save-close', request, token),
  setDocumentTitle: (name, dirty, marker = 'circle') => ipcRenderer.invoke('schemka:document-title', name, dirty, marker),
  onSaveAndClose: callback => {
    if (typeof callback !== 'function') throw new TypeError('Expected callback');
    const listener = (_event, request) => callback(request);
    ipcRenderer.on('schemka:save-and-close', listener);
    return () => ipcRenderer.removeListener('schemka:save-and-close', listener);
  },
  readTeamProfile: () => ipcRenderer.invoke('schemka:read-team-profile'),
  documentLocation: token => ipcRenderer.invoke('schemka:document-location', token),
  getAppInfo: () => ipcRenderer.invoke('schemka:app-info'),
  openProject: token => ipcRenderer.invoke('schemka:open-project', token),
  saveProject: (bytes, token) => ipcRenderer.invoke('schemka:save-project', bytes, token),
  saveCurrentProject: (bytes, token) => ipcRenderer.invoke('schemka:save-current-project', bytes, token),
  openDirectory: token => ipcRenderer.invoke('schemka:open-directory', token),
  saveDirectory: (bytes, token) => ipcRenderer.invoke('schemka:save-directory', bytes, token),
  documentChanged: (previous, current, candidate = null) => ipcRenderer.invoke('schemka:document-changed', previous, current, candidate),
  saveBoundDirectory: (bytes, token) => ipcRenderer.invoke('schemka:save-bound-directory', bytes, token),
  recoverDirectory: (id, side) => ipcRenderer.invoke('schemka:recover-directory', id, side),
  saveMermaid: text => ipcRenderer.invoke('schemka:save-mermaid', text),
  saveSvg: (text, title) => ipcRenderer.invoke('schemka:save-svg', text, title),
  gitNetworkPolicy: (token, target) => ipcRenderer.invoke('schemka:git-network-policy', token, target),
  gitSetNetworkPolicy: (target, policy, token) => ipcRenderer.invoke('schemka:git-set-network-policy', target, policy, token),
  gitStatus: (bytes, token) => ipcRenderer.invoke('schemka:git-status', bytes, token),
  gitConnect: options => ipcRenderer.invoke('schemka:git-connect', options),
  gitOpen: token => ipcRenderer.invoke('schemka:git-open', token),
  gitAdopt: (candidate, token) => ipcRenderer.invoke('schemka:git-adopt', candidate, token),
  gitCommit: (bytes, token, message) => ipcRenderer.invoke('schemka:git-commit', bytes, token, message),
  gitPush: token => ipcRenderer.invoke('schemka:git-push', token),
  gitReceive: (bytes, token) => ipcRenderer.invoke('schemka:git-receive', bytes, token),
  gitApply: (plan, resolution, token) => ipcRenderer.invoke('schemka:git-apply', plan, resolution, token),
  gitInspect: (oid, bytes, token) => ipcRenderer.invoke('schemka:git-inspect', oid, bytes, token),
  gitRestore: (id, bytes, token) => ipcRenderer.invoke('schemka:git-restore', id, bytes, token),
  gitCreateBranch: (name, token) => ipcRenderer.invoke('schemka:git-create-branch', name, token),
  gitPrepareBranch: (name, bytes, token) => ipcRenderer.invoke('schemka:git-prepare-branch', name, bytes, token),
  gitSwitchBranch: (id, bytes, token) => ipcRenderer.invoke('schemka:git-switch-branch', id, bytes, token),
  gitCreateMilestone: (name, oid, token) => ipcRenderer.invoke('schemka:git-create-milestone', name, oid, token),
  gitPublishMilestone: (name, oid, token) => ipcRenderer.invoke('schemka:git-publish-milestone', name, oid, token),
  gitDeleteMilestone: (name, oid, token) => ipcRenderer.invoke('schemka:git-delete-milestone', name, oid, token),
  gitDisconnect: () => ipcRenderer.invoke('schemka:git-disconnect'),
}));
