import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  nativeImage,
  clipboard,
  session,
} from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import started from 'electron-squirrel-startup';
import {
  REGISTRATION_URL,
  lookupRegistration,
  lookupRegistrations,
} from './lib/registration.mjs';
import {
  ADMIN_CUSTOMERS_URL,
  ADMIN_ERROR,
  ADMIN_LOGIN_URL,
  MAX_CUSTOMER_CANDIDATES,
  assertAllowedAdminUrl,
  buildCustomerSearchUrl,
  extractCustomerCandidates,
  isAuthenticatedPage,
  isLoginPage,
  matchesCustomerEmail,
  normalizeAdminRedirect,
  parseCustomerAccount,
  parseCustomerProfile,
  validateCustomerEmail,
} from './lib/admin.mjs';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const DECRYPTION_KEY = Buffer.from('0-3.4=q!Yg#{oWo:8)evq(zh9<^qBi6r', 'binary');
const CUSTOM_APP_ICON_FILENAME = 'custom-app-icon.png';
let activeAppIcon = null;
let adminSession = null;
let adminAuthenticated = false;

const adminFailure = (code, error) => ({ ok: false, code, error });

const getAdminSession = () => {
  if (!adminSession) {
    adminSession = session.fromPartition('cuescript-admin-session', { cache: false });
  }
  return adminSession;
};

const clearAdminSession = async () => {
  adminAuthenticated = false;
  if (!adminSession) return;
  await adminSession.clearStorageData();
  await adminSession.clearCache();
};

const checkAdminTransport = async () => {
  const response = await fetch(ADMIN_LOGIN_URL, {
    method: 'GET',
    redirect: 'manual',
    headers: { 'cache-control': 'no-cache' },
  });
  assertAllowedAdminUrl(response.url || ADMIN_LOGIN_URL);
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get('location');
    if (!location) throw new Error(ADMIN_ERROR.REMOTE_FORMAT_CHANGED);
    return normalizeAdminRedirect(location, ADMIN_LOGIN_URL);
  }
  return assertAllowedAdminUrl(response.url || ADMIN_LOGIN_URL);
};

const establishAdminSession = async (loginUrl) => {
  const sessionId = loginUrl.searchParams.get('osCAdminID');
  if (!sessionId || !/^[a-z0-9]+$/i.test(sessionId)) {
    throw new Error(ADMIN_ERROR.REMOTE_FORMAT_CHANGED);
  }
  await getAdminSession().cookies.set({
    url: ADMIN_LOGIN_URL,
    name: 'osCAdminID',
    value: sessionId,
    path: '/catalog/admin/',
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
  });
};

const secureAdminFetch = async (input, init = {}) => {
  let url = assertAllowedAdminUrl(input);
  let method = init.method || 'GET';
  let body = init.body;
  let headers = init.headers;

  for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
    const redirectMode = method === 'GET' || method === 'HEAD' ? 'manual' : 'follow';
    const response = await getAdminSession().fetch(url.href, {
      ...init,
      method,
      body,
      headers,
      redirect: redirectMode,
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      assertAllowedAdminUrl(response.url || url.href);
      return response;
    }

    const location = response.headers.get('location');
    if (!location || redirectCount === 5) {
      throw new Error(ADMIN_ERROR.REMOTE_FORMAT_CHANGED);
    }
    url = normalizeAdminRedirect(location, url);
    if ([301, 302, 303].includes(response.status) && method !== 'GET' && method !== 'HEAD') {
      method = 'GET';
      body = undefined;
      headers = undefined;
    }
  }
  throw new Error(ADMIN_ERROR.REMOTE_FORMAT_CHANGED);
};

const adminErrorResponse = (error) => {
  if (error?.message === ADMIN_ERROR.SECURE_TRANSPORT_REQUIRED) {
    return adminFailure(
      ADMIN_ERROR.SECURE_TRANSPORT_REQUIRED,
      'The administration server redirected outside the allowed CueScript administration area.',
    );
  }
  if (error?.message === ADMIN_ERROR.REMOTE_FORMAT_CHANGED) {
    return adminFailure(
      ADMIN_ERROR.REMOTE_FORMAT_CHANGED,
      'The administration server response could not be read safely.',
    );
  }
  return adminFailure(
    ADMIN_ERROR.NETWORK_ERROR,
    'Could not reach the secure administration server.',
  );
};

const loginAdmin = async ({ username, password } = {}) => {
  if (typeof username !== 'string' || !username.trim() || typeof password !== 'string' || !password) {
    return adminFailure(ADMIN_ERROR.INVALID_CREDENTIALS, 'Enter an administrator username and password.');
  }
  await clearAdminSession();
  try {
    const secureLoginUrl = await checkAdminTransport();
    await establishAdminSession(secureLoginUrl);
    const loginPage = await secureAdminFetch(secureLoginUrl);
    const loginHtml = await loginPage.text();
    if (!isLoginPage(loginHtml)) throw new Error(ADMIN_ERROR.REMOTE_FORMAT_CHANGED);

    const form = new URLSearchParams({ username: username.trim(), password });
    const response = await secureAdminFetch(`${ADMIN_LOGIN_URL}?action=process`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const html = await response.text();
    if (!isAuthenticatedPage(html)) {
      await clearAdminSession();
      return adminFailure(ADMIN_ERROR.INVALID_CREDENTIALS, 'The administrator username or password was not accepted.');
    }
    adminAuthenticated = true;
    return { ok: true, authenticated: true };
  } catch (error) {
    await clearAdminSession();
    return adminErrorResponse(error);
  }
};

const lookupAdminCustomer = async ({ email } = {}) => {
  if (!adminAuthenticated) {
    return adminFailure(ADMIN_ERROR.SESSION_EXPIRED, 'Sign in to search customer information.');
  }
  const validated = validateCustomerEmail(email);
  if (!validated.ok) {
    return adminFailure(ADMIN_ERROR.NOT_FOUND, validated.error);
  }

  try {
    const response = await secureAdminFetch(buildCustomerSearchUrl(validated.email));
    const searchHtml = await response.text();
    if (isLoginPage(searchHtml)) {
      await clearAdminSession();
      return adminFailure(ADMIN_ERROR.SESSION_EXPIRED, 'The administrator session expired. Sign in again.');
    }
    const candidates = extractCustomerCandidates(searchHtml);
    if (candidates.length > MAX_CUSTOMER_CANDIDATES) {
      return adminFailure(ADMIN_ERROR.TOO_MANY_MATCHES, 'The search returned too many possible customers.');
    }

    const matches = [];
    for (const customerId of candidates) {
      const detailUrl = new URL(ADMIN_CUSTOMERS_URL);
      detailUrl.searchParams.set('search', validated.email);
      detailUrl.searchParams.set('page', '1');
      detailUrl.searchParams.set('cID', customerId);

      const summaryResponse = await secureAdminFetch(detailUrl);
      const summaryHtml = await summaryResponse.text();
      if (isLoginPage(summaryHtml)) {
        await clearAdminSession();
        return adminFailure(ADMIN_ERROR.SESSION_EXPIRED, 'The administrator session expired. Sign in again.');
      }

      detailUrl.searchParams.set('action', 'edit');
      const profileResponse = await secureAdminFetch(detailUrl);
      const profileHtml = await profileResponse.text();
      if (isLoginPage(profileHtml)) {
        await clearAdminSession();
        return adminFailure(ADMIN_ERROR.SESSION_EXPIRED, 'The administrator session expired. Sign in again.');
      }
      const profile = parseCustomerProfile(profileHtml);
      if (matchesCustomerEmail(profile, validated.email)) {
        matches.push({ ...profile, account: parseCustomerAccount(summaryHtml) });
      }
    }
    if (matches.length === 0) {
      return adminFailure(ADMIN_ERROR.NOT_FOUND, 'No customer matched that email address.');
    }
    return { ok: true, matches };
  } catch (error) {
    return adminErrorResponse(error);
  }
};

const getCustomAppIconPath = () => path.join(app.getPath('userData'), CUSTOM_APP_ICON_FILENAME);

const getDefaultAppIcon = () => nativeImage.createFromPath(
  app.isPackaged
    ? path.join(process.resourcesPath, '512x512.png')
    : path.join(app.getAppPath(), 'src/assets/icons/512x512.png')
);

const applyAppIcon = (icon) => {
  if (!icon || icon.isEmpty()) return;

  activeAppIcon = icon;
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(icon);
  }
  if (process.platform !== 'darwin') {
    BrowserWindow.getAllWindows().forEach((window) => window.setIcon(icon));
  }
};

const loadSavedAppIcon = async () => {
  try {
    const icon = nativeImage.createFromPath(getCustomAppIconPath());
    return icon.isEmpty() ? null : icon;
  } catch {
    return null;
  }
};

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

ipcMain.handle('admin-status', async () => {
  if (adminAuthenticated) {
    return { ok: true, authenticated: true, secureAvailable: true, insecureTransport: true };
  }
  try {
    const secureLoginUrl = await checkAdminTransport();
    await establishAdminSession(secureLoginUrl);
    const response = await secureAdminFetch(secureLoginUrl);
    const html = await response.text();
    if (!isLoginPage(html)) throw new Error(ADMIN_ERROR.REMOTE_FORMAT_CHANGED);
    return {
      ok: true,
      authenticated: false,
      secureAvailable: true,
      insecureTransport: true,
    };
  } catch (error) {
    return { ...adminErrorResponse(error), authenticated: false, secureAvailable: false };
  }
});

ipcMain.handle('admin-login', async (_event, payload) => loginAdmin(payload));

ipcMain.handle('admin-logout', async () => {
  try {
    if (adminAuthenticated) {
      await secureAdminFetch(`${ADMIN_LOGIN_URL}?action=logoff`);
    }
  } catch {
    // Local session data is cleared even if remote logout cannot complete.
  }
  await clearAdminSession();
  return { ok: true, authenticated: false };
});

ipcMain.handle('lookup-admin-customer', async (_event, payload) => lookupAdminCustomer(payload));

ipcMain.handle('lookup-registration', async (_event, { serial }) => {
  return lookupRegistration(serial);
});

ipcMain.handle('lookup-registrations', async (_event, { query }) => {
  return lookupRegistrations(query);
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

ipcMain.handle('copy-to-clipboard', (_event, text) => {
  if (typeof text !== 'string' || !text) {
    return { ok: false };
  }

  try {
    clipboard.writeText(text);
    return { ok: true };
  } catch {
    return { ok: false };
  }
});

ipcMain.handle('set-app-icon', async (_event, { dataUrl } = {}) => {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return { ok: false, error: 'The selected icon is not a valid image.' };
  }

  try {
    const icon = nativeImage.createFromDataURL(dataUrl);
    if (icon.isEmpty()) {
      return { ok: false, error: 'The selected icon could not be read.' };
    }

    await fs.writeFile(getCustomAppIconPath(), icon.toPNG());
    applyAppIcon(icon);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `The app icon could not be updated: ${err.message}` };
  }
});

ipcMain.handle('reset-app-icon', async () => {
  try {
    await fs.rm(getCustomAppIconPath(), { force: true });
    const defaultIcon = getDefaultAppIcon();
    if (defaultIcon.isEmpty()) {
      return { ok: false, error: 'The default app icon could not be loaded.' };
    }

    applyAppIcon(defaultIcon);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `The default app icon could not be restored: ${err.message}` };
  }
});

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 640,
    height: 900,
    minWidth: 480,
    minHeight: 640,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: process.platform === 'win32',
    backgroundColor: '#151016',
    ...(process.platform === 'darwin' ? {} : { icon: activeAppIcon }),
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

app.whenReady().then(async () => {
  const savedIcon = await loadSavedAppIcon();
  const initialIcon = savedIcon || getDefaultAppIcon();
  applyAppIcon(initialIcon);

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

app.on('before-quit', () => {
  adminAuthenticated = false;
  if (adminSession) {
    void adminSession.clearStorageData();
  }
});
