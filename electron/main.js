const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const isDev = process.env.NODE_ENV === 'development';

// Executive Notes is temporarily offline. The Drive service account key
// was revoked because it shipped inside the packaged app, where anyone
// with the DMG could extract it from app.asar. Access is being rebuilt
// server-side via a Cloud Function so the credential never leaves our
// infrastructure and the executive-only role check is actually enforced
// rather than just hidden in the renderer. Until then this returns a
// clean message instead of throwing a Google API error.
ipcMain.handle('drive:getLatestFile', async () => {
  return {
    error:
      'Executive Notes is temporarily unavailable while we upgrade how it connects to Drive. It will return in an upcoming update.',
  };
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    // Native traffic-light look on Mac; Windows just gets its normal title bar.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
    backgroundColor: '#16161A',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  // Direct-distribution builds (not App Store) are allowed to self-update —
  // this checks the GitHub Releases feed configured in package.json and
  // silently downloads any newer version, installing it next launch. Does
  // nothing in dev mode, and does nothing if there's no packaged app to
  // compare against (e.g. running unpacked).
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
