const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  lookupRegistration: (payload) => ipcRenderer.invoke('lookup-registration', payload),
  generateRegistration: (payload) => ipcRenderer.invoke('generate-registration', payload),
  saveRegistration: (payload) => ipcRenderer.invoke('save-registration', payload),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
});
