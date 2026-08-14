const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { google } = require('googleapis');

const isDev = process.env.NODE_ENV === 'development';

// Executive Notes preview — this is the only place the service account
// credential ever gets loaded. It's a main-process-only file, never bundled
// into anything the renderer (the React app / DevTools) can read directly,
// which is the whole point of doing this here instead of in the browser
// side of the app.
const driveAuth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'drive-service-account.json'),
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});

function extractFolderId(driveUrl) {
  const match = driveUrl.match(/folders\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

ipcMain.handle('drive:getLatestFile', async (event, driveUrl) => {
  const folderId = extractFolderId(driveUrl);
  if (!folderId) return { error: "That doesn't look like a Drive folder link." };

  try {
    const authClient = await driveAuth.getClient();
    const drive = google.drive({ version: 'v3', auth: authClient });
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      orderBy: 'modifiedTime desc',
      pageSize: 1,
      fields: 'files(id, name, modifiedTime, webViewLink, iconLink, thumbnailLink, mimeType)',
      // Without these two, the API silently ignores anything inside a
      // Shared Drive (Team Drive) and just returns zero results — no
      // error, so it looks like an empty folder even when it isn't. Since
      // the Executive Hub Drive structure is a Shared Drive, this is
      // required, not optional.
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const file = res.data.files?.[0];
    if (!file) return { error: 'No files found in that folder yet.' };
    return { file };
  } catch (err) {
    // Most common cause: the folder hasn't been shared with the service
    // account's email yet, or the Drive API isn't enabled on the project.
    return { error: err.message || 'Could not reach Google Drive.' };
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    // Native traffic-light look on Mac; Windows just gets its normal title bar.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
    backgroundColor: '#1A1A1A',
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
