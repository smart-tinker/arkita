const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('arkitaCatalog', Object.freeze({
  ready: () => ipcRenderer.invoke('schemka:catalog-ready'),
  command: data => ipcRenderer.invoke('schemka:catalog-activate', data),
  dock: () => ipcRenderer.invoke('schemka:catalog-child-dock'),
  onState: callback => {
    if (typeof callback !== 'function') throw new TypeError('Expected callback');
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('schemka:catalog-state', listener);
    return () => ipcRenderer.removeListener('schemka:catalog-state', listener);
  },
}));
