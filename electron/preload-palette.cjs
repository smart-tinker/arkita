const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('arkitaPalette', Object.freeze({
  ready: () => ipcRenderer.invoke('schemka:palette-ready'),
  command: data => ipcRenderer.invoke('schemka:palette-activate', data),
  dock: () => ipcRenderer.invoke('schemka:palette-child-dock'),
  onState: callback => {
    if (typeof callback !== 'function') throw new TypeError('Expected callback');
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('schemka:palette-state', listener);
    return () => ipcRenderer.removeListener('schemka:palette-state', listener);
  },
}));
