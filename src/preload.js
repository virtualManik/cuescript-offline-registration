const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  adminStatus: () => ipcRenderer.invoke('admin-status'),
  adminLogin: (payload) => ipcRenderer.invoke('admin-login', payload),
  adminLogout: () => ipcRenderer.invoke('admin-logout'),
  lookupAdminCustomer: (payload) => ipcRenderer.invoke('lookup-admin-customer', payload),
  lookupRegistration: (payload) => ipcRenderer.invoke('lookup-registration', payload),
  lookupRegistrations: (payload) => ipcRenderer.invoke('lookup-registrations', payload),
  generateRegistration: (payload) => ipcRenderer.invoke('generate-registration', payload),
  saveRegistration: (payload) => ipcRenderer.invoke('save-registration', payload),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  setAppIcon: (payload) => ipcRenderer.invoke('set-app-icon', payload),
  resetAppIcon: () => ipcRenderer.invoke('reset-app-icon'),
});
