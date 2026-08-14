const { contextBridge, ipcRenderer } = require('electron');

// Only ever expose specific, narrow functions here — never raw Node or
// Electron APIs. The renderer can call window.driveAPI.getLatestFile(...),
// which hands off to the main process; it never sees the actual service
// account credential, just whatever result comes back.
contextBridge.exposeInMainWorld('driveAPI', {
  getLatestFile: (driveUrl) => ipcRenderer.invoke('drive:getLatestFile', driveUrl),
});
