const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('staffDesktop', {
  version: '1.0.0',
  showNotification(title, body) {
    return ipcRenderer.invoke('staff-notify', { title, body });
  },
});
