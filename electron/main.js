// OpenLeira desktop app: a single window showing the same OpenLeira web app
// you get in the browser, served by the server that ships inside the
// installer. There is no launcher, no tab strip and no cloud account: the app
// starts its own server, waits for it, and opens it full-window.
import { app, BrowserWindow, Menu, dialog, session, shell } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const APP_NAME = 'OpenLeira';
// Release line shown with the name ("OpenLeira - Reaver4"); keep in sync with releaseName in package.json.
const RELEASE_NAME = 'Reaver4';
const APP_USER_MODEL_ID = 'online.openleira.desktop';
const HOST = '127.0.0.1';
// A port of its own, so the app never ends up on another (older) OpenLeira or
// CloudCLI server already listening on 3001, and the address (and with it the
// browser storage that keeps you signed in) stays the same between runs.
const PREFERRED_PORT = Number.parseInt(process.env.OPENLEIRA_DESKTOP_PORT || '', 10) || 37301;
const SERVER_START_TIMEOUT_MS = 90000;
const MAX_LOG_LINES = 400;

/** The OpenLeira server this app started, while it runs. */
let serverProcess = null;
/** http://127.0.0.1:<port> of that server once it answers. */
let serverUrl = null;
/** The one app window. */
let mainWindow = null;
/** Recent server output, shown when the server fails to start. */
const serverLog = [];
let logStream = null;
let quitting = false;

// Set before anything reads userData, so data lives under "OpenLeira" from source too.
app.setName(APP_NAME);
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_USER_MODEL_ID);
}

/** Where the running server's process id is kept, to clean up after a crash. */
const pidFile = () => path.join(app.getPath('userData'), 'server.pid');

/**
 * Stops a server left running by an earlier run that did not shut down
 * cleanly. Only when an OpenLeira server still answers on our port, so a
 * reused process id never takes down some unrelated program.
 */
async function stopLeftoverServer() {
  let pid = 0;
  try {
    pid = Number.parseInt(fs.readFileSync(pidFile(), 'utf8'), 10);
  } catch {
    return;
  }
  fs.rmSync(pidFile(), { force: true });
  if (!(pid > 0) || !(await isHealthy(`http://${HOST}:${PREFERRED_PORT}`))) return;
  try {
    process.kill(pid);
    log(`server lama (pid ${pid}) dihentikan`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch {
    // Already gone.
  }
}

function getAppRoot() {
  return app.isPackaged ? app.getAppPath() : path.resolve(__dirname, '..');
}

function getIconPath() {
  if (process.platform === 'darwin') {
    return path.join(getAppRoot(), 'electron', 'assets', 'logo-macos.png');
  }
  return path.join(getAppRoot(), 'public', 'logo-512.png');
}

function log(line) {
  const text = String(line ?? '').trimEnd();
  if (!text) return;
  serverLog.push(text);
  if (serverLog.length > MAX_LOG_LINES) serverLog.splice(0, serverLog.length - MAX_LOG_LINES);
  logStream?.write(`${new Date().toISOString()} ${text}\n`);
}

/**
 * The server entry: the one the installer ships under resources/server, or
 * the repo's own build when running from source (`npm run desktop`).
 */
function getServerEntry() {
  if (process.env.ELECTRON_SERVER_ENTRY) return process.env.ELECTRON_SERVER_ENTRY;
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'server', 'dist-server', 'server', 'index.js');
  }
  return path.join(getAppRoot(), 'dist-server', 'server', 'index.js');
}

/**
 * The installer's server has native modules built for this Electron, so it
 * runs on Electron's own Node. From source it runs on the system Node that
 * `npm install` built them for.
 */
function getNodeRuntime() {
  if (app.isPackaged) {
    return { command: process.execPath, env: { ELECTRON_RUN_AS_NODE: '1' } };
  }
  return { command: process.env.npm_node_execpath || 'node', env: {} };
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, HOST);
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.once('listening', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
    probe.listen(0, HOST);
  });
}

function isHealthy(baseUrl) {
  return new Promise((resolve) => {
    const req = http.get(`${baseUrl}/health`, { timeout: 1000 }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

/** Starts the bundled server and resolves with its URL once it answers /health. */
async function startServer() {
  const entry = getServerEntry();
  if (!fs.existsSync(entry)) {
    throw new Error(`Server OpenLeira tidak ditemukan di ${entry}. Pasang ulang OpenLeira.`);
  }

  await stopLeftoverServer();
  const port = (await isPortFree(PREFERRED_PORT)) ? PREFERRED_PORT : await getFreePort();
  const baseUrl = `http://${HOST}:${port}`;
  const runtime = getNodeRuntime();
  // Installed layout is <root>/dist-server/server/index.js; the server finds dist/ from <root>.
  const cwd = path.resolve(path.dirname(entry), '..', '..');
  log(`$ ${runtime.command} ${entry} (port ${port})`);

  const child = spawn(runtime.command, [entry], {
    cwd,
    env: {
      ...process.env,
      ...runtime.env,
      NODE_ENV: 'production',
      HOST,
      SERVER_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  serverProcess = child;
  if (child.pid) fs.writeFileSync(pidFile(), String(child.pid));
  child.stdout.on('data', (chunk) => String(chunk).split(/\r?\n/).forEach(log));
  child.stderr.on('data', (chunk) => String(chunk).split(/\r?\n/).forEach(log));
  const exited = new Promise((resolve) => {
    child.once('error', (error) => { log(`gagal menjalankan server: ${error.message}`); resolve(); });
    child.once('exit', (code, signal) => {
      log(`server berhenti (code ${code ?? '-'}, signal ${signal ?? '-'})`);
      if (serverProcess === child) {
        serverProcess = null;
        fs.rmSync(pidFile(), { force: true });
      }
      resolve();
      if (!quitting && serverUrl) void handleServerCrash();
    });
  });

  const startedAt = Date.now();
  let stopped = false;
  void exited.then(() => { stopped = true; });
  while (!stopped && Date.now() - startedAt < SERVER_START_TIMEOUT_MS) {
    if (await isHealthy(baseUrl)) return baseUrl;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  stopServer();
  throw new Error(stopped ? 'Server OpenLeira berhenti saat dinyalakan.' : 'Server OpenLeira tidak merespons.');
}

function stopServer() {
  if (!serverProcess) return;
  const child = serverProcess;
  serverProcess = null;
  fs.rmSync(pidFile(), { force: true });
  child.kill();
}

const escapeHtml = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The page shown while the server starts, in the web app's colours and type. */
function startupPage({ error = null } = {}) {
  const body = error
    ? `<p class="msg err">${escapeHtml(error)}</p><pre>${escapeHtml(serverLog.slice(-60).join('\n') || 'Tidak ada output.')}</pre>`
    : '<p class="msg"><span class="dot"></span>Menyalakan OpenLeira…</p>';
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><meta charset="utf-8"><title>${APP_NAME}</title>
<style>
html,body{margin:0;height:100%;background:#0a0a0b;color:#f2f2f0;font:15px Inter,-apple-system,"Segoe UI",sans-serif}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:32px;box-sizing:border-box}
h1{margin:0;font:700 44px/1 "Playfair Display",Georgia,serif;letter-spacing:.01em}
h1 span{color:#8a8a90}
.rel{margin:0;font:600 11px/1 Cinzel,Georgia,serif;letter-spacing:.32em;text-transform:uppercase;color:#8a8a90}
.msg{display:flex;align-items:center;gap:10px;margin:8px 0 0;color:#c4c4c8}
.err{color:#c07c7c;max-width:720px;text-align:center}
.dot{width:8px;height:8px;border-radius:50%;background:#c9ccd4;animation:p 1.2s ease-in-out infinite}
@keyframes p{50%{opacity:.25}}
pre{width:min(900px,100%);max-height:45vh;overflow:auto;margin:0;padding:14px;border:1px solid #2a2a2e;border-radius:6px;background:#141416;color:#c4c4c8;font:12px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;user-select:text}
</style>
<h1>Open<span>Leira</span></h1><p class="rel">${RELEASE_NAME}</p>${body}`)}`;
}

function isOwnUrl(url) {
  return Boolean(serverUrl) && (url === serverUrl || url.startsWith(`${serverUrl}/`));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#0a0a0b',
    title: APP_NAME,
    icon: getIconPath(),
    // Normal OS title bar; the menu bar stays hidden until Alt is pressed.
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  // The page's own <title> would replace the app name in the title bar.
  mainWindow.on('page-title-updated', (event) => event.preventDefault());

  // Links leaving OpenLeira open in the normal browser; its own pages stay here.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isOwnUrl(url)) return { action: 'allow' };
    if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isOwnUrl(url) || url.startsWith('data:')) return;
    event.preventDefault();
    if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url);
  });
}

async function openOpenLeira() {
  await mainWindow.loadURL(startupPage());
  try {
    serverUrl = process.env.ELECTRON_DEV_URL || await startServer();
    log(`OpenLeira siap di ${serverUrl}`);
    await mainWindow.loadURL(serverUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(message);
    await mainWindow.loadURL(startupPage({ error: message }));
    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: APP_NAME,
      message: 'OpenLeira gagal dinyalakan',
      detail: `${message}\n\nLog lengkap: ${path.join(app.getPath('userData'), 'server.log')}`,
      buttons: ['Coba lagi', 'Keluar'],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) return openOpenLeira();
    app.quit();
  }
}

async function handleServerCrash() {
  serverUrl = null;
  if (!mainWindow) return;
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'error',
    title: APP_NAME,
    message: 'Server OpenLeira berhenti',
    detail: serverLog.slice(-15).join('\n'),
    buttons: ['Nyalakan lagi', 'Keluar'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) await openOpenLeira();
  else app.quit();
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        { label: 'openleira.online', click: () => void shell.openExternal('https://openleira.online') },
        { label: 'Buka di browser', click: () => serverUrl && void shell.openExternal(serverUrl) },
        { label: 'Buka log server', click: () => void shell.openPath(path.join(app.getPath('userData'), 'server.log')) },
      ],
    },
  ]));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.on('before-quit', () => {
    quitting = true;
    stopServer();
  });
  app.on('window-all-closed', () => app.quit());
  // Closing the app from a terminal (Ctrl+C, kill) still stops the server.
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.quit());

  app.whenReady().then(async () => {
    app.setAboutPanelOptions({
      applicationName: `${APP_NAME} - ${RELEASE_NAME}`,
      applicationVersion: app.getVersion(),
      copyright: 'OpenLeira contributors',
    });
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    logStream = fs.createWriteStream(path.join(app.getPath('userData'), 'server.log'), { flags: 'w' });

    // OpenLeira's own pages may use the clipboard, notifications and the mic (voice input).
    session.defaultSession.setPermissionRequestHandler((contents, _permission, callback) => {
      callback(isOwnUrl(contents.getURL()));
    });

    buildMenu();
    createWindow();
    await openOpenLeira();
  }).catch((error) => {
    dialog.showErrorBox('OpenLeira gagal dibuka', error instanceof Error ? error.stack || error.message : String(error));
    app.quit();
  });
}
