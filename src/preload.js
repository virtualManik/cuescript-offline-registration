const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  register: (payload) => ipcRenderer.invoke('register', payload),
  saveRegistration: (payload) => ipcRenderer.invoke('save-registration', payload),
});
