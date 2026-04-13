const { app, BrowserWindow, shell, ipcMain, Notification } = require('electron');
const path = require('path');

if (process.platform === 'win32') {
  app.setAppUserModelId('ru.worldcashbox.staff.desktop');
}

ipcMain.handle('staff-notify', (event, { title, body }) => {
  try {
    if (!Notification.isSupported()) return { ok: false, reason: 'unsupported' };
    const t = String(title || 'WorldCashBox Staff').slice(0, 250);
    const b = String(body || '').replace(/\s+/g, ' ').trim().slice(0, 400);
    const n = new Notification({ title: t, body: b || ' ' });
    n.show();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e.message };
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 900,
    minHeight: 600,
    title: 'WorldCashBox Staff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
