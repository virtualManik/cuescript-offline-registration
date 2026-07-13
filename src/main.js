import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import started from 'electron-squirrel-startup';
import { REGISTRATION_URL, lookupRegistration } from './lib/registration.mjs';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const DECRYPTION_KEY = Buffer.from('0-3.4=q!Yg#{oWo:8)evq(zh9<^qBi6r', 'binary');

const decryptRegistration = (body) => {
  const decipher = crypto.createDecipheriv('aes-256-cbc', DECRYPTION_KEY, Buffer.alloc(16));
  let content = decipher.update(body, 'base64', 'utf8');
  content += decipher.final('utf8');
  return JSON.parse(content);
};

const firstDefined = (source, keys) => {
  for (const key of keys) {
    if (source && source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }
  return undefined;
};

const normalizeRegistrationInfo = (info) => ({
  serial: info.serial,
  flavor: info.flavor,
  addons: info.addons,
  regEndDate: info.regEndDate,
  demo: firstDefined(info, ['demo', 'isDemo', 'trial', 'isTrial', 'demoMode']),
  licenseType: firstDefined(info, ['licenseType', 'type', 'licenseStatus', 'status']),
  addonDetails: firstDefined(info, [
    'addonDetails',
    'addonsDetails',
    'addonInfo',
    'addonsInfo',
    'addonLicenses',
    'addonsLicenses',
    'licenses',
    'modules',
  ]),
  addonExpirations: firstDefined(info, [
    'addonExpirations',
    'addonsExpirations',
    'addonExpiration',
    'addonsExpiration',
    'addonExpiry',
    'addonsExpiry',
    'addonEndDates',
    'addonsEndDates',
  ]),
  addonDemos: firstDefined(info, [
    'addonDemos',
    'addonsDemos',
    'addonDemo',
    'addonsDemo',
    'addonTrials',
    'addonsTrials',
  ]),
});

const generateRegistration = async ({ serial, email, renew = false }) => {
  if (typeof serial !== 'string' || serial.length !== 10) {
    return { ok: false, error: 'Serial number must be exactly 10 characters.' };
  }

  const formData = new FormData();
  formData.append('manualRegister', 'CueiT');
  formData.append('serial', serial);
  if (typeof email === 'string' && email.trim()) {
    formData.append('email', email.trim());
  }
  formData.append('renew', renew ? 'true' : 'false');

  let body;
  try {
    const response = await fetch(REGISTRATION_URL, { method: 'POST', body: formData });
    if (!response.ok) {
      return { ok: false, error: `Registration server returned ${response.status} ${response.statusText}.` };
    }
    body = await response.text();
  } catch (err) {
    return { ok: false, error: `Could not reach the registration server: ${err.message}` };
  }

  try {
    const info = decryptRegistration(body);
    return {
      ok: true,
      raw: body,
      info: normalizeRegistrationInfo(info),
    };
  } catch {
    // The server responds with a plain-text message (not encrypted data) for
    // unknown serials or other registration problems.
    const serverMessage = body.trim();
    return {
      ok: false,
      error: serverMessage.length > 0 && serverMessage.length < 500
        ? serverMessage
        : 'The server response could not be read as registration data.',
    };
  }
};

ipcMain.handle('lookup-registration', async (_event, { serial }) => {
  return lookupRegistration(serial);
});

ipcMain.handle('generate-registration', async (_event, { serial, email, renew }) => {
  if (typeof email !== 'string' || !email.trim()) {
    return { ok: false, error: 'Customer email is required to generate an offline registration file.' };
  }

  return generateRegistration({ serial, email, renew });
});

ipcMain.handle('save-registration', async (event, { serial, raw }) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: 'Save Registration File',
    defaultPath: path.join(app.getPath('downloads'), `OLR-${serial}.csr`),
    filters: [{ name: 'Offline Registration File', extensions: ['csr'] }],
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  try {
    await fs.writeFile(filePath, raw);
    return { canceled: false, filePath };
  } catch (err) {
    return { canceled: false, error: `Could not write file: ${err.message}` };
  }
});

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 560,
    height: 780,
    minWidth: 480,
    minHeight: 640,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#151016',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
