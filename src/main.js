const { app, BrowserWindow, screen, globalShortcut, Tray, Menu, ipcMain, nativeImage, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Handle cleanup-downloads mode (runs when user uninstalls the app)
// Must check args BEFORE single-instance-lock because cleanup runs parallel to uninstaller
const isCleanupMode = process.argv.includes('--cleanup-downloads');

if (!isCleanupMode) {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    process.exit(0);
  }
}

const os = require('os');
const crypto = require('crypto');

function getPersistentDeviceId() {
  // Generate a stable hash from OS info that doesn't change across reinstalls
  const hostname = os.hostname();
  const platform = os.platform();
  const arch = os.arch();
  const cpus = os.cpus()[0]?.model || '';
  const fingerprint = `${hostname}-${platform}-${arch}-${cpus}`;
  return crypto.createHash('sha256').update(fingerprint).digest('hex').slice(0, 16);
}

const DEVICE_ID = getPersistentDeviceId();

let overlayWindow = null;
let settingsWindow = null;
let tray = null;
let store = null;
let crosshairVisible = true;

// Default settings
const defaultSettings = {
  shape: 'cross',
  customImage: null,
  size: 32,
  thickness: 2,
  gapSize: 4,
  color: '#00FF00',
  opacity: 100,
  rotation: 0,
  outline: true,
  outlineColor: '#000000',
  outlineThickness: 1,
  centerDot: true,
  centerDotSize: 2,
  centerDotColor: '#FF0000',
  offsetX: 0,
  offsetY: 0,
  monitorIndex: 0,
  hotkeyToggle: 'CommandOrControl+Alt+C',
  hotkeyHide: 'CommandOrControl+Alt+H',
  hotkeyReset: 'CommandOrControl+Alt+R',
  startWithWindows: false,
  startMinimized: false,
  hideOnCapture: false,
  smartContrast: false,
  activeProfile: 'default',
  profiles: { default: null }
};

let settings = { ...defaultSettings };

// Built-in community backend (anon key is public by design; RLS protects data)
const DEFAULT_COMMUNITY_CONFIG = {
  endpoint: 'https://vqyjfbbuapytcyialxsu.supabase.co',
  apiKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxeWpmYmJ1YXB5dGN5aWFseHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NTk0MDcsImV4cCI6MjA5MjMzNTQwN30.zOCRjrV80L9BZXi402eqr1IHiy2H6E3sp7CMh4TNBSA'
};
let communityConfig = { ...DEFAULT_COMMUNITY_CONFIG };

// ============ SECURITY: IPC RATE LIMITER ============
// Prevents runaway XSS / compromised renderer from hammering Supabase or the local store.
// Uses a sliding window: max N calls per M ms per channel.
const ipcRateLimits = new Map(); // channel -> { hits: [ts, ts, ...], max, windowMs }
function ipcRateLimit(channel, max, windowMs) {
  const now = Date.now();
  let bucket = ipcRateLimits.get(channel);
  if (!bucket) {
    bucket = { hits: [], max, windowMs };
    ipcRateLimits.set(channel, bucket);
  }
  // Drop hits outside the window
  bucket.hits = bucket.hits.filter(t => now - t < windowMs);
  if (bucket.hits.length >= max) return false;
  bucket.hits.push(now);
  return true;
}

async function loadStore() {
  try {
    const Store = (await import('electron-store')).default;
    store = new Store({ name: 'crosshair-f-config' });
    const saved = store.get('settings');
    // Defense: only merge if saved is a plain object (not array, not null, not string)
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      settings = { ...defaultSettings, ...saved };
      // Force-drop any keys that aren't in defaultSettings or aren't known-safe
      // (e.g. a malicious actor writing directly to the config file)
      const knownKeys = new Set(Object.keys(defaultSettings).concat([
        '_appliedCommunityId', 'customImage', 'customImageSize'
      ]));
      for (const k of Object.keys(settings)) {
        if (!knownKeys.has(k)) delete settings[k];
      }
    }
  } catch (e) {
    console.error('[Store] load failed, starting with defaults:', e.message);
    settings = { ...defaultSettings };
  }
}

function loadCommunityConfig() {
  if (!store) return;
  try {
    const saved = store.get('community');
    if (saved && typeof saved === 'object' && typeof saved.endpoint === 'string' && typeof saved.apiKey === 'string') {
      // Validate the persisted endpoint - reject if someone tampered with the config file
      let parsed;
      try { parsed = new URL(saved.endpoint); } catch { return; }
      if (parsed.protocol !== 'https:') return;
      if (!/^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname)) return;
      if (!/^[A-Za-z0-9_\-.]+$/.test(saved.apiKey) || saved.apiKey.length < 20 || saved.apiKey.length > 1000) return;
      communityConfig = { endpoint: saved.endpoint.replace(/\/$/, ''), apiKey: saved.apiKey };
    }
  } catch (e) {
    console.error('[Store] community config load failed:', e.message);
  }
}

function saveCommunityConfig() {
  if (store) store.set('community', communityConfig);
}

function saveSettings() {
  if (store) store.set('settings', settings);
}

function getMonitorBounds(index) {
  const displays = screen.getAllDisplays();
  const idx = Math.min(Math.max(0, index), displays.length - 1);
  return displays[idx].bounds;
}

function broadcastSettings() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('settings:update', settings);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('settings:update', settings);
  }
}

// Helper: validate that a URL is safe to open externally.
// Only http(s) allowed - no file://, javascript:, data:, etc.
function isSafeExternalUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length > 2000) return false;
  let parsed;
  try { parsed = new URL(rawUrl); } catch { return false; }
  return parsed.protocol === 'https:' || parsed.protocol === 'http:';
}

function safeOpenExternal(url) {
  if (!isSafeExternalUrl(url)) {
    console.warn('[Security] Blocked unsafe external URL:', url);
    return false;
  }
  shell.openExternal(url);
  return true;
}

// Lock a BrowserWindow's webContents against navigation, popups, permissions abuse
function hardenWebContents(wc) {
  if (!wc) return;
  // Block all navigation away from the bundled HTML
  wc.on('will-navigate', (event, url) => {
    event.preventDefault();
    if (isSafeExternalUrl(url)) shell.openExternal(url);
  });
  // Block any new window / window.open / target=_blank, route safe ones to OS browser
  wc.setWindowOpenHandler(({ url }) => {
    safeOpenExternal(url);
    return { action: 'deny' };
  });
  // Deny ALL permission requests (camera, mic, geolocation, notifications, etc.)
  wc.session.setPermissionRequestHandler((webContents, permission, callback) => callback(false));
  wc.session.setPermissionCheckHandler(() => false);
  // Block webview tags
  wc.on('will-attach-webview', (event) => event.preventDefault());
}

function createOverlay() {
  const bounds = getMonitorBounds(settings.monitorIndex);
  overlayWindow = new BrowserWindow({
    x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
    transparent: true, frame: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, closable: false, fullscreenable: false,
    skipTaskbar: true, focusable: false, alwaysOnTop: true, hasShadow: false,
    show: !settings.startMinimized,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      backgroundThrottling: false
    }
  });
  hardenWebContents(overlayWindow.webContents);
  overlayWindow.setIgnoreMouseEvents(true, { forward: false });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (settings.hideOnCapture) overlayWindow.setContentProtection(true);
  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));
  overlayWindow.webContents.on('did-finish-load', () => {
    overlayWindow.webContents.send('settings:update', settings);
  });
  screen.on('display-metrics-changed', repositionOverlay);
  screen.on('display-added', repositionOverlay);
  screen.on('display-removed', repositionOverlay);
}

function repositionOverlay() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const bounds = getMonitorBounds(settings.monitorIndex);
  overlayWindow.setBounds(bounds);
  overlayWindow.webContents.send('settings:update', settings);
}

function createSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 1200, height: 780, minWidth: 900, minHeight: 620,
    title: 'Crosshair F', backgroundColor: '#0a0e14',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false
    }
  });
  hardenWebContents(settingsWindow.webContents);
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));

  // Helper: drop overlay below settings, bring it back when settings hides/blurs
  const lowerOverlay = () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      // Fully drop always-on-top so settings window (modals, stars) render above the crosshair
      overlayWindow.setAlwaysOnTop(false);
    }
  };
  const raiseOverlay = () => {
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    }
  };

  // Fix first-click-after-focus bug: when window regains focus (alt-tab back,
  // taskbar click, tray restore), hover/click state in Chromium can go stale
  // until mouse moves. Force a renderer notification so JS can reflow listeners.
  settingsWindow.on('focus', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      lowerOverlay();
      settingsWindow.webContents.send('window:focused');
    }
  });
  settingsWindow.on('show', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      lowerOverlay();
      settingsWindow.webContents.send('window:focused');
    }
  });
  settingsWindow.on('restore', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      lowerOverlay();
      settingsWindow.focus();
      settingsWindow.webContents.send('window:focused');
    }
  });
  // When settings window is blurred/hidden/minimized, bring crosshair back on top for gaming
  settingsWindow.on('blur', raiseOverlay);
  settingsWindow.on('hide', raiseOverlay);
  settingsWindow.on('minimize', raiseOverlay);
  settingsWindow.on('close', raiseOverlay);

  settingsWindow.webContents.on('did-finish-load', () => {
    const displays = screen.getAllDisplays().map((d, i) => ({
      index: i,
      label: `Monitor ${i + 1} (${d.bounds.width}x${d.bounds.height})`,
      isPrimary: d.id === screen.getPrimaryDisplay().id
    }));
    settingsWindow.webContents.send('init', { settings, displays });
  });
}

function setupTray() {
  let trayIconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  if (!fs.existsSync(trayIconPath)) {
    trayIconPath = path.join(__dirname, '..', 'assets', 'icon.ico');
  }
  let trayImage;
  try {
    trayImage = nativeImage.createFromPath(trayIconPath);
    if (trayImage.isEmpty()) trayImage = nativeImage.createEmpty();
    else trayImage = trayImage.resize({ width: 16, height: 16 });
  } catch (e) {
    trayImage = nativeImage.createEmpty();
  }
  tray = new Tray(trayImage);
  tray.setToolTip('Crosshair F');
  rebuildTrayMenu();
  tray.on('double-click', () => createSettings());
}

function rebuildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: crosshairVisible ? 'Hide Crosshair' : 'Show Crosshair', click: () => toggleCrosshair() },
    { type: 'separator' },
    { label: 'Settings', click: () => createSettings() },
    { type: 'separator' },
    {
      label: 'Quick Profiles',
      submenu: Object.keys(settings.profiles || { default: null }).map(name => ({
        label: name + (name === settings.activeProfile ? '  (active)' : ''),
        click: () => loadProfile(name)
      }))
    },
    { type: 'separator' },
    { label: 'About Crosshair F', click: () => createSettings() },
    { label: 'Quit', click: () => quitApp() }
  ]);
  tray.setContextMenu(menu);
}

function toggleCrosshair() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  crosshairVisible = !crosshairVisible;
  if (crosshairVisible) overlayWindow.show();
  else overlayWindow.hide();
  rebuildTrayMenu();
}

function hideCrosshair() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  crosshairVisible = false;
  overlayWindow.hide();
  rebuildTrayMenu();
}

function resetPosition() {
  settings.offsetX = 0;
  settings.offsetY = 0;
  saveSettings();
  broadcastSettings();
}

function loadProfile(name) {
  if (name === 'default') {
    const preserved = {
      profiles: settings.profiles,
      monitorIndex: settings.monitorIndex,
      hotkeyToggle: settings.hotkeyToggle,
      hotkeyHide: settings.hotkeyHide,
      hotkeyReset: settings.hotkeyReset,
      startWithWindows: settings.startWithWindows,
      startMinimized: settings.startMinimized,
      hideOnCapture: settings.hideOnCapture
    };
    settings = { ...defaultSettings, ...preserved, activeProfile: 'default' };
    saveSettings();
    broadcastSettings();
    rebuildTrayMenu();
    return;
  }
  const p = (settings.profiles || {})[name];
  if (!p) return;
  settings = { ...settings, ...p, activeProfile: name, profiles: settings.profiles };
  delete settings._appliedCommunityId;
  saveSettings();
  broadcastSettings();
  rebuildTrayMenu();
}

function nudgePosition(dx, dy) {
  settings.offsetX = (settings.offsetX || 0) + dx;
  settings.offsetY = (settings.offsetY || 0) + dy;
  saveSettings();
  broadcastSettings();
}

function toggleDebugGrid() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send('debug:toggleGrid');
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  const safeReg = (accel, fn, label) => {
    if (!accel) return;
    try { globalShortcut.register(accel, fn); }
    catch (e) { console.error(`Hotkey ${label} failed:`, e.message); }
  };
  safeReg(settings.hotkeyToggle, () => toggleCrosshair(), 'toggle');
  safeReg(settings.hotkeyHide, () => hideCrosshair(), 'hide');
  safeReg(settings.hotkeyReset, () => resetPosition(), 'reset');
  safeReg('Alt+Shift+Up', () => nudgePosition(0, -1), 'nudgeUp');
  safeReg('Alt+Shift+Down', () => nudgePosition(0, 1), 'nudgeDown');
  safeReg('Alt+Shift+Left', () => nudgePosition(-1, 0), 'nudgeLeft');
  safeReg('Alt+Shift+Right', () => nudgePosition(1, 0), 'nudgeRight');
  safeReg('Ctrl+Alt+Shift+Up', () => nudgePosition(0, -10), 'bigNudgeUp');
  safeReg('Ctrl+Alt+Shift+Down', () => nudgePosition(0, 10), 'bigNudgeDown');
  safeReg('Ctrl+Alt+Shift+Left', () => nudgePosition(-10, 0), 'bigNudgeLeft');
  safeReg('Ctrl+Alt+Shift+Right', () => nudgePosition(10, 0), 'bigNudgeRight');
  safeReg('Alt+Shift+G', () => toggleDebugGrid(), 'debugGrid');
  safeReg('Alt+Shift+S', () => saveCurrentAsCustomGamePreset(), 'savePreset');
}

// ========== CUSTOM GAME PRESETS (user-made, hotkey-saveable) ==========
function getCustomGamePresets() {
  if (!store) return [];
  const raw = store.get('customGamePresets');
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const clean = [];
  for (const x of raw) {
    if (x && typeof x === 'object' && typeof x.id === 'string' && !seen.has(x.id)) {
      seen.add(x.id);
      clean.push(x);
    }
  }
  if (clean.length !== raw.length) store.set('customGamePresets', clean);
  return clean;
}

function setCustomGamePresets(list) {
  if (!store) return;
  const arr = Array.isArray(list) ? list : [];
  const seen = new Set();
  const clean = [];
  for (const x of arr) {
    if (x && typeof x === 'object' && typeof x.id === 'string' && !seen.has(x.id)) {
      seen.add(x.id);
      clean.push(x);
    }
  }
  store.set('customGamePresets', clean);
}

let promptWindow = null;

function saveCurrentAsCustomGamePreset() {
  if (settings.offsetX === 0 && settings.offsetY === 0) {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('notify', 'Adjust position first with Alt+Shift+Arrows before saving.');
      settingsWindow.show();
    }
    return;
  }
  openPromptWindow();
}

function openPromptWindow() {
  if (promptWindow && !promptWindow.isDestroyed()) {
    promptWindow.focus();
    return;
  }
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  promptWindow = new BrowserWindow({
    width: 420,
    height: 220,
    x: Math.floor(sw / 2 - 210),
    y: Math.floor(sh / 2 - 110),
    frame: false,
    transparent: false,
    backgroundColor: '#0d1117',
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false
    }
  });
  hardenWebContents(promptWindow.webContents);
  promptWindow.loadFile(path.join(__dirname, 'prompt.html'));
  promptWindow.once('ready-to-show', () => {
    promptWindow.show();
    promptWindow.focus();
    promptWindow.webContents.send('prompt:init', {
      offsetX: settings.offsetX,
      offsetY: settings.offsetY
    });
  });
  promptWindow.on('closed', () => { promptWindow = null; });
}

ipcMain.handle('prompt:submit', (event, name) => {
  const trimmed = (name || '').trim();
  if (!trimmed) return { ok: false, error: 'Name required' };
  if (trimmed.length < 2 || trimmed.length > 30) return { ok: false, error: 'Name must be 2-30 chars' };
  if (!/^[a-zA-Z0-9 _\-.]+$/.test(trimmed)) return { ok: false, error: 'Only letters, numbers, spaces allowed' };

  const list = getCustomGamePresets();
  if (list.length >= 30) return { ok: false, error: 'Max 30 custom presets. Delete some first.' };
  if (list.find(x => x.name.toLowerCase() === trimmed.toLowerCase())) {
    return { ok: false, error: 'Name already exists' };
  }
  const entry = {
    id: 'ugp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    name: trimmed,
    offsetX: settings.offsetX,
    offsetY: settings.offsetY,
    created: new Date().toISOString()
  };
  list.push(entry);
  setCustomGamePresets(list);
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('customGamePresets:updated', list);
  }
  if (promptWindow && !promptWindow.isDestroyed()) {
    promptWindow.close();
    promptWindow = null;
  }
  return { ok: true, entry, list };
});

ipcMain.handle('prompt:cancel', () => {
  if (promptWindow && !promptWindow.isDestroyed()) {
    promptWindow.close();
    promptWindow = null;
  }
  return { ok: true };
});

ipcMain.handle('customGamePreset:list', () => getCustomGamePresets());

ipcMain.handle('customGamePreset:apply', (event, id) => {
  if (typeof id !== 'string' || id.length > 100) return { ok: false, error: 'Invalid id' };
  const list = getCustomGamePresets();
  const preset = list.find(x => x.id === id);
  if (!preset) return { ok: false, error: 'Not found' };
  settings.offsetX = preset.offsetX;
  settings.offsetY = preset.offsetY;
  saveSettings();
  broadcastSettings();
  return { ok: true, settings };
});

ipcMain.handle('customGamePreset:delete', (event, id) => {
  if (typeof id !== 'string' || id.length > 100) return { ok: false, error: 'Invalid id' };
  let list = getCustomGamePresets();
  list = list.filter(x => x.id !== id);
  setCustomGamePresets(list);
  return { ok: true, list };
});

ipcMain.handle('customGamePreset:openSaveDialog', () => {
  saveCurrentAsCustomGamePreset();
  return { ok: true };
});

function quitApp() {
  app.isQuiting = true;
  globalShortcut.unregisterAll();
  if (tray) tray.destroy();
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy();
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.destroy();
  app.quit();
}

// IPC: basic settings
ipcMain.handle('settings:get', () => settings);
// Helper: decrement community download count (fire-and-forget, non-blocking)
async function decrementCommunityCount(id) {
  if (!id) return;
  try {
    await supabaseFetch('/rpc/decrement_downloads', {
      method: 'POST',
      body: JSON.stringify({ crosshair_id_param: id })
    });
  } catch (err) {
    console.error('[Decrement] RPC failed for', id, err.message);
  }
}

// Helper: increment community download count
async function incrementCommunityCount(id) {
  if (!id) return { ok: true };
  try {
    await supabaseFetch('/rpc/increment_downloads', {
      method: 'POST',
      body: JSON.stringify({ crosshair_id_param: id })
    });
    return { ok: true };
  } catch (err) {
    console.error('[Increment] RPC failed for', id, err.message);
    return { ok: false, error: err.message };
  }
}

// Whitelist of field names that renderer is allowed to change via settings:set.
// Internal fields like _appliedCommunityId, profiles, activeProfile are NOT in this list —
// those can only be changed via their dedicated handlers.
const SETTABLE_FIELDS = {
  // visual
  shape: 'string', customImage: 'string_or_null',
  size: 'number', thickness: 'number', gapSize: 'number', rotation: 'number', opacity: 'number',
  color: 'hex', outline: 'bool', outlineColor: 'hex', outlineThickness: 'number',
  centerDot: 'bool', centerDotSize: 'number', centerDotColor: 'hex',
  armTop: 'number', armBottom: 'number', armLeft: 'number', armRight: 'number',
  customImageSize: 'number',
  // display
  offsetX: 'number', offsetY: 'number', monitorIndex: 'number',
  hideOnCapture: 'bool', startWithWindows: 'bool', startMinimized: 'bool',
  // hotkeys
  hotkeyToggle: 'string', hotkeyHide: 'string', hotkeyReset: 'string'
};

const ALLOWED_SHAPES = new Set(['cross','dot','t','circle','hybrid','scope','sniper',
  'x','corners','brackets','chevron','diamond','triangle','star',
  'ksight','prong3','prong6','double_ring','hollow_cross','plus_dot','custom']);

function sanitizeSettingsPatch(partial) {
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) return {};
  const out = {};
  for (const [k, v] of Object.entries(partial)) {
    const kind = SETTABLE_FIELDS[k];
    if (!kind) continue; // silently drop unknown / internal fields
    if (kind === 'string') {
      if (typeof v !== 'string') continue;
      if (v.length > 200) continue;
      if (k === 'shape' && !ALLOWED_SHAPES.has(v)) continue;
      out[k] = v;
    } else if (kind === 'string_or_null') {
      if (v === null || v === undefined) { out[k] = null; continue; }
      if (typeof v !== 'string') continue;
      if (v.length > 2000000) continue; // up to 2MB for base64 image data
      // For customImage specifically: must be a valid data URI of an image type
      if (k === 'customImage') {
        if (v.length === 0) { out[k] = null; continue; }
        if (!/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(v)) continue;
      }
      out[k] = v;
    } else if (kind === 'number') {
      const n = Number(v);
      if (!Number.isFinite(n)) continue;
      // Clamp to reasonable bounds for any number field
      if (k === 'monitorIndex') { if (n < 0 || n > 16) continue; out[k] = Math.floor(n); }
      else if (k === 'offsetX' || k === 'offsetY') { if (Math.abs(n) > 10000) continue; out[k] = Math.floor(n); }
      else if (k === 'rotation') { if (n < 0 || n > 360) continue; out[k] = n; }
      else if (k === 'opacity') { if (n < 0 || n > 100) continue; out[k] = n; }
      else if (k === 'size' || k === 'customImageSize') { if (n < 1 || n > 500) continue; out[k] = n; }
      else if (k === 'thickness' || k === 'outlineThickness' || k === 'centerDotSize') { if (n < 0 || n > 30) continue; out[k] = n; }
      else if (k === 'gapSize') { if (n < 0 || n > 200) continue; out[k] = n; }
      else if (k === 'armTop' || k === 'armBottom' || k === 'armLeft' || k === 'armRight') { if (n < 0 || n > 300) continue; out[k] = n; }
      else { out[k] = n; }
    } else if (kind === 'bool') {
      out[k] = !!v;
    } else if (kind === 'hex') {
      if (typeof v !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(v)) continue;
      out[k] = v;
    }
  }
  return out;
}

ipcMain.handle('settings:set', (event, partial) => {
  const oldMonitor = settings.monitorIndex;
  const oldHideCapture = settings.hideOnCapture;

  // SECURITY: whitelist + validate every field the renderer sends.
  // Unknown fields (like _appliedCommunityId, profiles, etc.) are silently dropped.
  const sanitized = sanitizeSettingsPatch(partial);

  // If user changes visual crosshair fields, clear the applied marker
  const visualFields = ['shape', 'size', 'thickness', 'gapSize', 'color', 'opacity',
                        'rotation', 'outline', 'outlineColor', 'outlineThickness',
                        'centerDot', 'centerDotSize', 'centerDotColor', 'customImage',
                        'armTop', 'armBottom', 'armLeft', 'armRight'];
  const touchesVisual = Object.keys(sanitized).some(k => visualFields.includes(k));
  if (touchesVisual && settings._appliedCommunityId) {
    delete settings._appliedCommunityId;
  }

  settings = { ...settings, ...sanitized };
  saveSettings();
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (sanitized.monitorIndex !== undefined && sanitized.monitorIndex !== oldMonitor) repositionOverlay();
    if (sanitized.hideOnCapture !== undefined && sanitized.hideOnCapture !== oldHideCapture) {
      overlayWindow.setContentProtection(!!sanitized.hideOnCapture);
    }
    overlayWindow.webContents.send('settings:update', settings);
  }
  return settings;
});
ipcMain.handle('settings:reset', () => {
  settings = { ...defaultSettings, profiles: settings.profiles };
  // _appliedCommunityId auto-cleared because not in defaultSettings
  saveSettings();
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('settings:update', settings);
  }
  return settings;
});
ipcMain.handle('hotkey:rebind', (event, partial) => {
  if (!partial || typeof partial !== 'object') return settings;
  const allowed = { hotkeyToggle: true, hotkeyHide: true, hotkeyReset: true };
  const safe = {};
  for (const [k, v] of Object.entries(partial)) {
    if (!allowed[k]) continue;
    if (typeof v !== 'string' || v.length === 0 || v.length > 64) continue;
    // Accelerator syntax: modifiers + key, like "CommandOrControl+Alt+R"
    // Allow only letters, digits, +, and standard modifier/key names
    if (!/^[A-Za-z0-9+ ]+$/.test(v)) continue;
    safe[k] = v;
  }
  settings = { ...settings, ...safe };
  saveSettings();
  registerHotkeys();
  return settings;
});
ipcMain.handle('overlay:toggle', () => { toggleCrosshair(); return crosshairVisible; });

// IPC: profiles
function isValidProfileName(name) {
  return typeof name === 'string'
    && name.length >= 1 && name.length <= 40
    && /^[A-Za-z0-9 _\-.]+$/.test(name);
}

ipcMain.handle('profile:save', (event, name) => {
  if (!isValidProfileName(name)) return settings;
  settings.profiles = settings.profiles || {};
  // Cap at 100 profiles to prevent storage abuse
  if (!settings.profiles[name] && Object.keys(settings.profiles).length >= 100) return settings;
  const profile = { ...settings };
  delete profile.profiles;
  delete profile.activeProfile;
  // Also strip internal markers — a stale pointer to a deleted crosshair would
  // leak into loaded profiles and cause phantom "APPLIED" badges
  delete profile._appliedCommunityId;
  settings.profiles[name] = profile;
  settings.activeProfile = name;
  saveSettings();
  rebuildTrayMenu();
  return settings;
});
ipcMain.handle('profile:load', (event, name) => {
  if (name !== 'default' && !isValidProfileName(name)) return settings;
  loadProfile(name);
  return settings;
});
ipcMain.handle('profile:delete', (event, name) => {
  if (name === 'default') return settings;
  if (!isValidProfileName(name)) return settings;
  if (settings.profiles && settings.profiles[name]) {
    delete settings.profiles[name];
    if (settings.activeProfile === name) settings.activeProfile = 'default';
    saveSettings();
    rebuildTrayMenu();
  }
  return settings;
});
ipcMain.handle('profile:list', () => Object.keys(settings.profiles || {}));

// Game presets removed in favor of user self-calibration.
// Every game renders aim point differently per user's resolution/FOV/weapon.
// Users must manually align with Alt+Shift+Arrows, then save with Alt+Shift+S.
// "reset" kept as it just zeros out the offset.
const GAME_PRESETS = {
  'reset': { offsetX: 0, offsetY: 0, note: 'Reset to center (clear any saved offset)' }
};

ipcMain.handle('app:applyGamePreset', (event, gameKey) => {
  const preset = GAME_PRESETS[gameKey];
  if (!preset) return { ok: false, error: 'Unknown game' };
  settings.offsetX = preset.offsetX;
  settings.offsetY = preset.offsetY;
  saveSettings();
  broadcastSettings();
  return { ok: true, settings, note: preset.note };
});

ipcMain.handle('app:listGamePresets', () => {
  return Object.entries(GAME_PRESETS).map(([key, val]) => ({
    key, label: val.note, offsetX: val.offsetX, offsetY: val.offsetY
  }));
});

// IPC: calibration
let calibrationMode = false;
ipcMain.handle('app:startCalibration', () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return { ok: false };
  calibrationMode = true;
  overlayWindow.setIgnoreMouseEvents(false);
  overlayWindow.webContents.send('debug:startCalibration');
  return { ok: true };
});
ipcMain.handle('app:setCalibration', (event, { x, y }) => {
  if (!calibrationMode || !overlayWindow || overlayWindow.isDestroyed()) return { ok: false };
  const bounds = getMonitorBounds(settings.monitorIndex);
  settings.offsetX = Math.round(x - bounds.width / 2);
  settings.offsetY = Math.round(y - bounds.height / 2);
  saveSettings();
  calibrationMode = false;
  overlayWindow.setIgnoreMouseEvents(true);
  broadcastSettings();
  return { ok: true, settings };
});
ipcMain.handle('app:cancelCalibration', () => {
  calibrationMode = false;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.setIgnoreMouseEvents(true);
    overlayWindow.webContents.send('debug:cancelCalibration');
  }
  return { ok: true };
});
ipcMain.handle('app:toggleDebugGrid', () => { toggleDebugGrid(); return { ok: true }; });
ipcMain.handle('app:quit', () => quitApp());
ipcMain.handle('app:openExternal', (event, url) => {
  return safeOpenExternal(url);
});
ipcMain.handle('app:setAutoLaunch', (event, enabled) => {
  const bool = !!enabled;
  app.setLoginItemSettings({ openAtLogin: bool, openAsHidden: !!settings.startMinimized });
  settings.startWithWindows = bool;
  saveSettings();
  return bool;
});

// IPC: user custom crosshair library
function getCustomList() {
  if (!store) return [];
  const raw = store.get('customCrosshairs');
  if (!Array.isArray(raw)) return [];
  // Dedupe by id + filter invalid entries
  const seen = new Set();
  const clean = [];
  for (const x of raw) {
    if (x && typeof x === 'object' && typeof x.id === 'string' && !seen.has(x.id)) {
      seen.add(x.id);
      clean.push(x);
    }
  }
  if (clean.length !== raw.length) store.set('customCrosshairs', clean);
  return clean;
}
function setCustomList(list) {
  if (!store) return;
  const arr = Array.isArray(list) ? list : [];
  const seen = new Set();
  const clean = [];
  for (const x of arr) {
    if (x && typeof x === 'object' && typeof x.id === 'string' && !seen.has(x.id)) {
      seen.add(x.id);
      clean.push(x);
    }
  }
  store.set('customCrosshairs', clean);
}

function validateCustomPreset(preset) {
  const allowedShapes = ['cross','dot','t','circle','hybrid','scope','sniper',
                         'x','corners','brackets','chevron','diamond','triangle','star',
                         'ksight','prong3','prong6','double_ring','hollow_cross','plus_dot'];
  if (!preset || typeof preset !== 'object') return { ok: false, error: 'Invalid preset' };
  if (!allowedShapes.includes(preset.shape)) return { ok: false, error: 'Unknown shape' };
  const ranges = {
    size: [4, 200], thickness: [0.5, 20], gapSize: [0, 60],
    rotation: [0, 359], opacity: [10, 100],
    outlineThickness: [0.5, 6], centerDotSize: [0.5, 20]
  };
  for (const [k, [min, max]] of Object.entries(ranges)) {
    if (preset[k] !== undefined) {
      const v = parseFloat(preset[k]);
      if (isNaN(v) || v < min || v > max) return { ok: false, error: `${k} out of range` };
    }
  }
  for (const k of ['color','outlineColor','centerDotColor']) {
    if (preset[k] && !/^#[0-9A-Fa-f]{6}$/.test(preset[k])) {
      return { ok: false, error: `Invalid color format: ${k}` };
    }
  }
  return { ok: true };
}

ipcMain.handle('custom:list', () => getCustomList());
ipcMain.handle('custom:save', (event, { name, preset }) => {
  if (!name || typeof name !== 'string') return { ok: false, error: 'Name required' };
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 30) return { ok: false, error: 'Name must be 2-30 chars' };
  if (!/^[a-zA-Z0-9 _\-.]+$/.test(trimmed)) return { ok: false, error: 'Only letters, numbers, spaces, dash, underscore, dot allowed' };
  const v = validateCustomPreset(preset);
  if (!v.ok) return v;
  const list = getCustomList();
  if (list.length >= 50) return { ok: false, error: 'Max 50 custom crosshairs. Delete some first.' };
  if (list.find(x => x.name.toLowerCase() === trimmed.toLowerCase())) {
    return { ok: false, error: 'Name already exists. Pick a different name.' };
  }
  const newEntry = {
    id: 'cust_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    name: trimmed, preset, category: 'custom',
    created: new Date().toISOString()
  };
  list.push(newEntry);
  setCustomList(list);
  return { ok: true, list, entry: newEntry };
});
ipcMain.handle('custom:delete', (event, id) => {
  if (typeof id !== 'string' || id.length > 100) return { ok: true, list: getCustomList() };
  let list = getCustomList();
  list = list.filter(x => x.id !== id);
  setCustomList(list);
  return { ok: true, list };
});

// IPC: community backend
ipcMain.handle('community:getConfig', () => communityConfig);
ipcMain.handle('community:config', (event, cfg) => {
  if (!cfg || typeof cfg !== 'object') return { ok: false, error: 'Invalid config' };
  const next = { ...communityConfig };

  if (cfg.endpoint !== undefined) {
    if (typeof cfg.endpoint !== 'string' || cfg.endpoint.length > 500) {
      return { ok: false, error: 'Invalid endpoint' };
    }
    // STRICT: must be https and must be a Supabase subdomain
    let parsed;
    try { parsed = new URL(cfg.endpoint); } catch { return { ok: false, error: 'Invalid endpoint URL' }; }
    if (parsed.protocol !== 'https:') return { ok: false, error: 'Endpoint must be https' };
    if (!/^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname)) {
      return { ok: false, error: 'Endpoint must be a *.supabase.co domain' };
    }
    next.endpoint = cfg.endpoint.replace(/\/$/, '');
  }

  if (cfg.apiKey !== undefined) {
    if (typeof cfg.apiKey !== 'string' || cfg.apiKey.length < 20 || cfg.apiKey.length > 1000) {
      return { ok: false, error: 'Invalid API key' };
    }
    // Supabase JWTs are base64 segments separated by dots
    if (!/^[A-Za-z0-9_\-.]+$/.test(cfg.apiKey)) {
      return { ok: false, error: 'API key contains invalid characters' };
    }
    next.apiKey = cfg.apiKey;
  }

  communityConfig = next;
  saveCommunityConfig();
  return communityConfig;
});

async function supabaseFetch(urlPath, options = {}) {
  if (!communityConfig.endpoint || !communityConfig.apiKey) {
    throw new Error('Community backend not configured');
  }
  // Defense in depth: re-validate endpoint at every fetch
  let parsed;
  try { parsed = new URL(communityConfig.endpoint); } catch { throw new Error('Invalid endpoint'); }
  if (parsed.protocol !== 'https:') throw new Error('Endpoint must be https');
  if (!/^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname)) {
    throw new Error('Endpoint must be a *.supabase.co domain');
  }
  const url = communityConfig.endpoint.replace(/\/$/, '') + '/rest/v1' + urlPath;
  const headers = {
    'apikey': communityConfig.apiKey,
    'Authorization': 'Bearer ' + communityConfig.apiKey,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  // Hard timeout prevents the app from hanging forever on a bad network
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await fetch(url, { ...options, headers, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) {
    const txt = await res.text();
    // Truncate raw error to prevent log flooding
    throw new Error(`Backend error ${res.status}: ${String(txt).slice(0, 500)}`);
  }
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function sanitizeCommunityPreset(preset) {
  const allowed = ['shape','size','thickness','gapSize','color','opacity','rotation',
                   'outline','outlineColor','outlineThickness','centerDot','centerDotSize','centerDotColor'];
  const allowedShapes = ['cross','dot','t','circle','hybrid','scope','sniper',
                         'x','corners','brackets','chevron','diamond','triangle','star',
                         'ksight','prong3','prong6','double_ring','hollow_cross','plus_dot'];
  const out = {};
  for (const key of allowed) if (preset[key] !== undefined) out[key] = preset[key];
  if (out.shape && !allowedShapes.includes(out.shape)) return null;
  for (const key of ['color','outlineColor','centerDotColor']) {
    if (out[key] && !/^#[0-9a-fA-F]{6}$/.test(out[key])) return null;
  }
  const ranges = {
    size: [4, 200], thickness: [0.5, 20], gapSize: [0, 60],
    opacity: [10, 100], rotation: [0, 359],
    outlineThickness: [0.5, 6], centerDotSize: [0.5, 20]
  };
  for (const [k, [min, max]] of Object.entries(ranges)) {
    if (out[k] !== undefined) {
      const v = parseFloat(out[k]);
      if (isNaN(v) || v < min || v > max) return null;
      out[k] = v;
    }
  }
  return out;
}

ipcMain.handle('community:list', async (event, params = {}) => {
  if (!params || typeof params !== 'object') params = {};
  const search = typeof params.search === 'string' ? params.search : '';
  const game = typeof params.game === 'string' ? params.game : '';
  const sort = typeof params.sort === 'string' ? params.sort : 'popular';
  const page = Number.isFinite(Number(params.page)) ? Math.max(0, Math.min(1000, Math.floor(Number(params.page)))) : 0;
  const limit = Number.isFinite(Number(params.limit)) ? Math.max(1, Math.min(50, Math.floor(Number(params.limit)))) : 20;

  let query = '/crosshairs?select=*&verified=eq.true';
  if (game && /^[a-z0-9_]{1,30}$/i.test(game)) query += `&game=eq.${encodeURIComponent(game)}`;
  if (search && search.trim()) {
    // Strip reserved ilike chars + any non-safe chars to prevent PostgREST injection
    const safe = search.trim().replace(/[%_,()<>"'\\]/g, '').slice(0, 40);
    if (safe.length > 0) {
      const pattern = encodeURIComponent(`*${safe}*`);
      query += `&or=(name.ilike.${pattern},author.ilike.${pattern},tags.ilike.${pattern},description.ilike.${pattern})`;
    }
  }
  if (sort === 'popular') query += '&order=downloads.desc';
  else if (sort === 'recent') query += '&order=created_at.desc';
  else if (sort === 'rating') query += '&order=rating.desc';
  query += `&offset=${page * limit}&limit=${limit}`;
  try {
    const data = await supabaseFetch(query);
    return { ok: true, items: data || [] };
  } catch (e) {
    console.error('Community list query failed:', e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('community:upload', async (event, data) => {
  if (!ipcRateLimit('community:upload', 5, 60000)) return { ok: false, error: 'Too many uploads, slow down' };
  if (!data || typeof data !== 'object') return { ok: false, error: 'Invalid data' };
  if (!data.name || typeof data.name !== 'string' || data.name.length < 2 || data.name.length > 40) return { ok: false, error: 'Name must be 2-40 characters' };
  if (!data.author || typeof data.author !== 'string' || data.author.length < 2 || data.author.length > 20) return { ok: false, error: 'Author tag must be 2-20 characters' };
  if (!data.preset || typeof data.preset !== 'object') return { ok: false, error: 'Invalid preset' };
  const safePreset = sanitizeCommunityPreset(data.preset);
  if (!safePreset) return { ok: false, error: 'Preset failed validation' };
  try {
    await supabaseFetch('/crosshairs', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        name: data.name.trim(), author: data.author.trim(),
        game: data.game || 'any',
        tags: (data.tags || '').slice(0, 60),
        description: (data.description || '').slice(0, 120),
        preset: safePreset, verified: false,
        downloads: 0, rating: 0,
        created_at: new Date().toISOString()
      })
    });
    return { ok: true, message: 'Uploaded! Will appear publicly after auto-scan (usually under 1 minute).' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Track which community crosshairs this device has already counted
function getAppliedSet() {
  if (!store) return [];
  return store.get('appliedCommunityIds') || [];
}
function setAppliedSet(list) {
  if (store) store.set('appliedCommunityIds', list);
}

// ========== DEVICE ID (for review dedup, no accounts) ==========
function getDeviceId() {
  if (!store) return 'anonymous';
  let id = store.get('deviceId');
  if (!id) {
    id = 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 12);
    store.set('deviceId', id);
  }
  return id;
}

// ========== INSTALLED CROSSHAIRS (downloaded from community) ==========
function getInstalledCrosshairs() {
  if (!store) return [];
  const raw = store.get('installedCrosshairs') || [];
  // Dedupe by id (defensive against historical duplicates from older buggy versions)
  const seen = new Set();
  const deduped = [];
  for (const x of raw) {
    if (x && x.id && !seen.has(x.id)) {
      seen.add(x.id);
      deduped.push(x);
    }
  }
  // If we removed any duplicates, persist the cleaned list back
  if (deduped.length !== raw.length) {
    store.set('installedCrosshairs', deduped);
    console.log(`[Dedupe] Removed ${raw.length - deduped.length} duplicate crosshair(s) from installed library`);
  }
  return deduped;
}
function setInstalledCrosshairs(list) {
  if (!store) return;
  // Final dedup safety net before writing
  const seen = new Set();
  const clean = [];
  for (const x of list || []) {
    if (x && x.id && !seen.has(x.id)) {
      seen.add(x.id);
      clean.push(x);
    }
  }
  store.set('installedCrosshairs', clean);
}

// In-flight install lock per crosshair id, prevents parallel race condition
const installInFlight = new Set();

ipcMain.handle('community:install', async (event, id) => {
  // Rate limit: 20 installs per minute max (generous for normal use, blocks spam)
  if (!ipcRateLimit('community:install', 20, 60000)) return { ok: false, error: 'Too many install attempts, slow down' };
  // Validate ID: must be a UUID or safe-ish string
  if (typeof id !== 'string' || id.length < 4 || id.length > 100 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return { ok: false, error: 'Invalid id' };
  }
  // Lock guard: if same crosshair install is in flight, bail with reapply
  if (installInFlight.has(id)) {
    console.log('[Install] Already in flight for', id, '- bailing');
    return { ok: false, error: 'Install already in progress, please wait' };
  }
  installInFlight.add(id);

  try {
    const data = await supabaseFetch(`/crosshairs?id=eq.${encodeURIComponent(id)}&select=*`);
    if (!data || !data.length) return { ok: false, error: 'Not found' };
    const item = data[0];

    // PRE-CHECK: already installed?
    let installed = getInstalledCrosshairs();
    let alreadyInstalled = installed.find(x => x.id === id);

    // Already installed: just re-apply silently (no count change, no duplicate entry)
    if (alreadyInstalled) {
      const safe = sanitizeCommunityPreset(alreadyInstalled.preset);
      if (!safe) return { ok: false, error: 'Preset failed validation' };
      settings = { ...settings, ...safe, _appliedCommunityId: id };
      saveSettings();
      broadcastSettings();
      return { ok: true, settings, entry: alreadyInstalled, reapplied: true };
    }

    // First install: increment count
    const incResult = await incrementCommunityCount(id);
    if (!incResult.ok) {
      return { ok: false, error: 'Could not update download count: ' + incResult.error };
    }

    const safe = sanitizeCommunityPreset(item.preset);
    if (!safe) {
      // Rollback on validation failure
      decrementCommunityCount(id);
      return { ok: false, error: 'Preset failed validation' };
    }

    // POST-AWAIT RE-CHECK: did another concurrent invocation install it during our await?
    // (extra safety beyond the lock, in case the lock somehow gets bypassed)
    installed = getInstalledCrosshairs();
    alreadyInstalled = installed.find(x => x.id === id);
    if (alreadyInstalled) {
      // Rollback the duplicate increment we just did
      decrementCommunityCount(id);
      // Just apply the already-installed entry
      settings = { ...settings, ...alreadyInstalled.preset, _appliedCommunityId: id };
      saveSettings();
      broadcastSettings();
      return { ok: true, settings, entry: alreadyInstalled, reapplied: true };
    }

    const entry = {
      id: item.id,
      name: item.name,
      author: item.author,
      game: item.game,
      description: item.description,
      tags: item.tags,
      preset: safe,
      installed_at: new Date().toISOString()
    };
    installed.push(entry);
    setInstalledCrosshairs(installed);

    // Apply the just-installed crosshair
    settings = { ...settings, ...safe, _appliedCommunityId: id };
    saveSettings();
    broadcastSettings();

    // Track in applied set (legacy compat)
    const applied = getAppliedSet();
    if (!applied.includes(id)) {
      applied.push(id);
      setAppliedSet(applied);
    }
    return { ok: true, settings, entry };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    installInFlight.delete(id);
  }
});

ipcMain.handle('community:uninstall', async (event, id) => {
  try {
    if (!ipcRateLimit('community:uninstall', 30, 60000)) return { ok: false, error: 'Too many uninstall attempts, slow down' };
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id) || id.length > 100) {
      return { ok: false, error: 'Invalid id' };
    }
    let installed = getInstalledCrosshairs();
    const entry = installed.find(x => x.id === id);
    if (!entry) return { ok: false, error: 'Not in your installed library' };

    const wasApplied = settings._appliedCommunityId === id;

    // Delete from library = always decrement (they installed once, now uninstalling)
    await decrementCommunityCount(id);

    // Remove from library
    installed = installed.filter(x => x.id !== id);
    setInstalledCrosshairs(installed);

    // Remove from applied set
    const applied = getAppliedSet();
    setAppliedSet(applied.filter(x => x !== id));

    // If was currently applied, reset to factory default
    if (wasApplied) {
      const factoryReset = {
        shape: 'cross', customImage: null, size: 32, thickness: 2, gapSize: 4,
        color: '#00FF00', opacity: 100, rotation: 0,
        outline: true, outlineColor: '#000000', outlineThickness: 1,
        centerDot: true, centerDotSize: 2, centerDotColor: '#FF0000',
        armTop: 100, armBottom: 100, armLeft: 100, armRight: 100
      };
      settings = { ...settings, ...factoryReset };
      delete settings._appliedCommunityId;
      saveSettings();
      broadcastSettings();
    }

    return { ok: true, installed, wasApplied };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('community:listInstalled', () => getInstalledCrosshairs());

ipcMain.handle('community:applyInstalled', (event, id) => {
  const installed = getInstalledCrosshairs();
  const entry = installed.find(x => x.id === id);
  if (!entry) return { ok: false, error: 'Not found in installed library' };
  // Apply without changing count - they already installed it, count was +1 then.
  // Applying/re-applying from library is a free action.
  settings = { ...settings, ...entry.preset, _appliedCommunityId: id };
  saveSettings();
  broadcastSettings();

  const applied = getAppliedSet();
  if (!applied.includes(id)) {
    applied.push(id);
    setAppliedSet(applied);
  }
  return { ok: true, settings };
});

// ========== REVIEWS & RATINGS ==========
ipcMain.handle('community:submitReview', async (event, { crosshairId, rating, reviewText }) => {
  try {
    if (!ipcRateLimit('community:submitReview', 10, 60000)) return { ok: false, error: 'Too many review submissions, slow down' };
    if (typeof crosshairId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(crosshairId) || crosshairId.length > 100) {
      return { ok: false, error: 'Invalid crosshair ID' };
    }
    const r = parseInt(rating);
    if (isNaN(r) || r < 1 || r > 5) return { ok: false, error: 'Rating must be 1-5' };
    const text = (typeof reviewText === 'string' ? reviewText : '').slice(0, 500);
    const deviceId = getDeviceId();

    await supabaseFetch('/rpc/submit_review', {
      method: 'POST',
      body: JSON.stringify({
        p_crosshair_id: crosshairId,
        p_device_id: deviceId,
        p_rating: r,
        p_review_text: text
      })
    });
    return { ok: true };
  } catch (e) {
    console.error('Submit review failed:', e.message);
    return { ok: false, error: 'Could not submit review. Did you run the reviews SQL? ' + e.message };
  }
});

ipcMain.handle('community:getReviews', async (event, crosshairId) => {
  try {
    if (!crosshairId) return { ok: false, error: 'Crosshair ID required' };
    const reviews = await supabaseFetch('/rpc/get_reviews', {
      method: 'POST',
      body: JSON.stringify({ p_crosshair_id: crosshairId })
    });
    const stats = await supabaseFetch('/rpc/get_review_stats', {
      method: 'POST',
      body: JSON.stringify({ p_crosshair_id: crosshairId })
    });
    const deviceId = getDeviceId();
    const myReview = (reviews || []).find(r => r.device_id === deviceId);
    return {
      ok: true,
      reviews: reviews || [],
      stats: (stats && stats[0]) || { avg_rating: 0, total_reviews: 0, star_1:0, star_2:0, star_3:0, star_4:0, star_5:0 },
      myReview: myReview || null
    };
  } catch (e) {
    console.error('Get reviews failed:', e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('community:getDetails', async (event, crosshairId) => {
  try {
    const data = await supabaseFetch(`/crosshairs?id=eq.${encodeURIComponent(crosshairId)}&select=*`);
    if (!data || !data.length) return { ok: false, error: 'Not found' };
    const item = data[0];
    const installed = getInstalledCrosshairs();
    const isInstalled = !!installed.find(x => x.id === crosshairId);
    return { ok: true, item, isInstalled };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('community:report', async (event, { id, reason }) => {
  try {
    if (!ipcRateLimit('community:report', 10, 60000)) return { ok: false, error: 'Too many reports, slow down' };
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id) || id.length > 100) {
      return { ok: false, error: 'Invalid id' };
    }
    const safeReason = (typeof reason === 'string' ? reason : 'inappropriate').slice(0, 200);
    await supabaseFetch('/reports', {
      method: 'POST',
      body: JSON.stringify({
        crosshair_id: id,
        reason: safeReason,
        reported_at: new Date().toISOString()
      })
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ========== COMMUNITY GAME POSITION PRESETS ==========
// These are PC-specific offsets people share. Filtered by resolution + display mode
// so only compatible presets show to each user.

// Detect user's primary screen resolution
ipcMain.handle('gamePreset:getResolution', () => {
  try {
    const { width, height } = screen.getPrimaryDisplay().size;
    return { ok: true, resolution: `${width}x${height}`, width, height };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// List of installed community game presets (so we don't show Install on ones already installed)
function getInstalledGamePresets() {
  if (!store) return [];
  const raw = store.get('installedGamePresets') || [];
  // Dedupe by id (defensive)
  const seen = new Set();
  const deduped = [];
  for (const x of raw) {
    if (x && x.id && !seen.has(x.id)) {
      seen.add(x.id);
      deduped.push(x);
    }
  }
  if (deduped.length !== raw.length) {
    store.set('installedGamePresets', deduped);
    console.log(`[Dedupe] Removed ${raw.length - deduped.length} duplicate game preset(s)`);
  }
  return deduped;
}
function setInstalledGamePresets(list) {
  if (!store) return;
  const seen = new Set();
  const clean = [];
  for (const x of list || []) {
    if (x && x.id && !seen.has(x.id)) {
      seen.add(x.id);
      clean.push(x);
    }
  }
  store.set('installedGamePresets', clean);
}

// Upload a game preset to Supabase
ipcMain.handle('gamePreset:upload', async (event, data) => {
  try {
    if (!ipcRateLimit('gamePreset:upload', 5, 60000)) return { ok: false, error: 'Too many uploads, slow down' };
    if (!data || typeof data !== 'object') return { ok: false, error: 'Invalid data' };
    const name = (typeof data.name === 'string' ? data.name : '').trim();
    const author = (typeof data.author === 'string' ? data.author : 'anonymous').trim();
    const game = (typeof data.game === 'string' ? data.game : 'other').trim().toLowerCase();
    const resolution = (typeof data.resolution === 'string' ? data.resolution : '').trim();
    const displayMode = (typeof data.displayMode === 'string' ? data.displayMode : 'borderless').toLowerCase();
    const offsetX = parseInt(data.offsetX);
    const offsetY = parseInt(data.offsetY);
    const description = (data.description || '').slice(0, 300);

    // Validation
    if (!name || name.length < 2 || name.length > 40) return { ok: false, error: 'Name must be 2-40 chars' };
    if (author.length > 30) return { ok: false, error: 'Author too long' };
    if (!/^\d{3,5}x\d{3,5}$/.test(resolution)) return { ok: false, error: 'Invalid resolution format (e.g. 1920x1080)' };
    const allowedModes = ['fullscreen_exclusive', 'borderless_fullscreen', 'windowed',
                          'maximized_windowed', 'fullscreen_optimized', 'any'];
    if (!allowedModes.includes(displayMode)) return { ok: false, error: 'Invalid display mode' };
    if (isNaN(offsetX) || isNaN(offsetY)) return { ok: false, error: 'Invalid offsets' };
    if (Math.abs(offsetX) > 500 || Math.abs(offsetY) > 500) return { ok: false, error: 'Offset too large (max ±500)' };

    const allowedGames = ['fortnite', 'valorant', 'cs2', 'apex', 'warzone', 'overwatch', 'r6siege',
                          'pubg', 'thefinals', 'rust', 'battlefield', 'halo', 'deadlock', 'marvelrivals',
                          'tarkov', 'huntshowdown', 'roblox', 'other'];
    if (!allowedGames.includes(game)) return { ok: false, error: 'Invalid game' };

    const payload = {
      name, author, game,
      resolution, display_mode: displayMode,
      offset_x: offsetX, offset_y: offsetY,
      description,
      verified: false,
      downloads: 0,
      rating: 0
    };

    const result = await supabaseFetch('/game_presets', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(payload)
    });
    return { ok: true, item: (result && result[0]) || payload };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// List game presets with filters (resolution, displayMode, game, search, sort)
ipcMain.handle('gamePreset:list', async (event, params = {}) => {
  if (!params || typeof params !== 'object') params = {};
  const search = typeof params.search === 'string' ? params.search : '';
  const game = typeof params.game === 'string' ? params.game : '';
  const resolution = typeof params.resolution === 'string' ? params.resolution : '';
  const displayMode = typeof params.displayMode === 'string' ? params.displayMode : '';
  const sort = typeof params.sort === 'string' ? params.sort : 'popular';
  const page = Number.isFinite(Number(params.page)) ? Math.max(0, Math.min(1000, Math.floor(Number(params.page)))) : 0;
  const limit = Number.isFinite(Number(params.limit)) ? Math.max(1, Math.min(60, Math.floor(Number(params.limit)))) : 30;

  try {
    let query = '/game_presets?select=*&verified=eq.true';
    if (game && /^[a-z0-9_]{1,30}$/i.test(game)) query += `&game=eq.${encodeURIComponent(game)}`;
    if (resolution && /^\d{3,5}x\d{3,5}$/.test(resolution)) query += `&resolution=eq.${encodeURIComponent(resolution)}`;
    if (displayMode && /^[a-z_]{1,30}$/.test(displayMode)) query += `&display_mode=eq.${encodeURIComponent(displayMode)}`;
    if (search && search.trim()) {
      const safe = search.trim().replace(/[%_,()<>"'\\]/g, '').slice(0, 40);
      if (safe.length > 0) {
        const pattern = encodeURIComponent(`*${safe}*`);
        query += `&or=(name.ilike.${pattern},author.ilike.${pattern})`;
      }
    }
    if (sort === 'recent') query += '&order=created_at.desc';
    else if (sort === 'rating') query += '&order=rating.desc';
    else query += '&order=downloads.desc';

    query += `&limit=${limit}&offset=${page * limit}`;
    const data = await supabaseFetch(query);
    return { ok: true, items: data || [] };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// In-flight lock for GP install (prevents race condition)
const gpInstallInFlight = new Set();

// Install a game preset (increment counter + save locally + apply offset)
ipcMain.handle('gamePreset:install', async (event, id) => {
  if (!ipcRateLimit('gamePreset:install', 20, 60000)) return { ok: false, error: 'Too many install attempts, slow down' };
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id) || id.length > 100) {
    return { ok: false, error: 'Invalid id' };
  }
  if (gpInstallInFlight.has(id)) {
    return { ok: false, error: 'Install already in progress, please wait' };
  }
  gpInstallInFlight.add(id);

  try {
    const data = await supabaseFetch(`/game_presets?id=eq.${encodeURIComponent(id)}&select=*`);
    if (!data || !data.length) return { ok: false, error: 'Not found' };
    const item = data[0];

    let installed = getInstalledGamePresets();
    if (installed.find(x => x.id === id)) {
      return { ok: false, error: 'Already installed.', alreadyInstalled: true };
    }

    // Increment downloads
    try {
      await supabaseFetch('/rpc/increment_game_preset_downloads', {
        method: 'POST',
        body: JSON.stringify({ preset_id_param: id })
      });
    } catch (err) {
      console.error('Increment game preset downloads RPC failed:', err.message);
      return { ok: false, error: 'Could not update download count: ' + err.message };
    }

    // POST-AWAIT RE-CHECK: did another concurrent invocation install it?
    installed = getInstalledGamePresets();
    if (installed.find(x => x.id === id)) {
      // Rollback the duplicate increment
      try {
        await supabaseFetch('/rpc/decrement_game_preset_downloads', {
          method: 'POST',
          body: JSON.stringify({ preset_id_param: id })
        });
      } catch (e) { console.error('Rollback decrement failed:', e.message); }
      return { ok: false, error: 'Already installed.', alreadyInstalled: true };
    }

    // Save to local installed list
    const entry = {
      id: item.id,
      name: item.name,
      author: item.author,
      game: item.game,
      resolution: item.resolution,
      display_mode: item.display_mode,
      offset_x: item.offset_x,
      offset_y: item.offset_y,
      description: item.description,
      installed_at: new Date().toISOString()
    };
    installed.push(entry);
    setInstalledGamePresets(installed);

    // Apply offset immediately
    settings.offsetX = item.offset_x;
    settings.offsetY = item.offset_y;
    saveSettings();
    broadcastSettings();

    return { ok: true, entry, settings };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    gpInstallInFlight.delete(id);
  }
});

// Uninstall a game preset (decrement + remove from local list)
ipcMain.handle('gamePreset:uninstall', async (event, id) => {
  try {
    if (!ipcRateLimit('gamePreset:uninstall', 30, 60000)) return { ok: false, error: 'Too many uninstall attempts, slow down' };
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id) || id.length > 100) {
      return { ok: false, error: 'Invalid id' };
    }
    let installed = getInstalledGamePresets();
    const entry = installed.find(x => x.id === id);
    if (!entry) return { ok: false, error: 'Not in your installed library' };

    try {
      await supabaseFetch('/rpc/decrement_game_preset_downloads', {
        method: 'POST',
        body: JSON.stringify({ preset_id_param: id })
      });
    } catch (err) {
      console.error('Decrement game preset downloads failed:', err.message);
    }

    installed = installed.filter(x => x.id !== id);
    setInstalledGamePresets(installed);

    return { ok: true, installed };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('gamePreset:listInstalled', () => getInstalledGamePresets());

// Apply a previously-installed game preset to current crosshair offset
ipcMain.handle('gamePreset:applyInstalled', (event, id) => {
  const installed = getInstalledGamePresets();
  const entry = installed.find(x => x.id === id);
  if (!entry) return { ok: false, error: 'Not found' };
  settings.offsetX = entry.offset_x;
  settings.offsetY = entry.offset_y;
  saveSettings();
  broadcastSettings();
  return { ok: true, settings };
});

// Report a community game preset
ipcMain.handle('gamePreset:report', async (event, { id, reason }) => {
  try {
    if (!ipcRateLimit('gamePreset:report', 10, 60000)) return { ok: false, error: 'Too many reports, slow down' };
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(id) || id.length > 100) {
      return { ok: false, error: 'Invalid id' };
    }
    const safeReason = (typeof reason === 'string' ? reason : 'inappropriate').slice(0, 200);
    await supabaseFetch('/game_preset_reports', {
      method: 'POST',
      body: JSON.stringify({
        preset_id: id,
        reason: safeReason,
        reported_at: new Date().toISOString()
      })
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ========== GAME PRESET REVIEWS & RATINGS ==========
ipcMain.handle('gamePreset:submitReview', async (event, { presetId, rating, reviewText }) => {
  try {
    if (!ipcRateLimit('gamePreset:submitReview', 10, 60000)) return { ok: false, error: 'Too many review submissions, slow down' };
    if (typeof presetId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(presetId) || presetId.length > 100) {
      return { ok: false, error: 'Invalid preset ID' };
    }
    const r = parseInt(rating);
    if (isNaN(r) || r < 1 || r > 5) return { ok: false, error: 'Rating must be 1-5' };
    const text = (typeof reviewText === 'string' ? reviewText : '').slice(0, 500);
    const deviceId = getDeviceId();

    await supabaseFetch('/rpc/submit_game_preset_review', {
      method: 'POST',
      body: JSON.stringify({
        p_preset_id: presetId,
        p_device_id: deviceId,
        p_rating: r,
        p_review_text: text
      })
    });
    return { ok: true };
  } catch (e) {
    console.error('Submit game preset review failed:', e.message);
    return { ok: false, error: 'Could not submit review. Did you run the reviews SQL? ' + e.message };
  }
});

ipcMain.handle('gamePreset:getReviews', async (event, presetId) => {
  try {
    if (typeof presetId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(presetId) || presetId.length > 100) {
      return { ok: false, error: 'Invalid preset ID' };
    }
    const reviews = await supabaseFetch('/rpc/get_game_preset_reviews', {
      method: 'POST',
      body: JSON.stringify({ p_preset_id: presetId })
    });
    const stats = await supabaseFetch('/rpc/get_game_preset_review_stats', {
      method: 'POST',
      body: JSON.stringify({ p_preset_id: presetId })
    });
    const deviceId = getDeviceId();
    const myReview = (reviews || []).find(r => r.device_id === deviceId);
    return {
      ok: true,
      reviews: reviews || [],
      stats: (stats && stats[0]) || { avg_rating: 0, total_reviews: 0, star_1:0, star_2:0, star_3:0, star_4:0, star_5:0 },
      myReview: myReview || null
    };
  } catch (e) {
    console.error('Get game preset reviews failed:', e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('gamePreset:getDetails', async (event, presetId) => {
  try {
    if (typeof presetId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(presetId) || presetId.length > 100) {
      return { ok: false, error: 'Invalid preset ID' };
    }
    const data = await supabaseFetch(`/game_presets?id=eq.${encodeURIComponent(presetId)}&select=*`);
    if (!data || !data.length) return { ok: false, error: 'Not found' };
    const item = data[0];
    const installed = getInstalledGamePresets();
    const isInstalled = !!installed.find(x => x.id === presetId);
    return { ok: true, item, isInstalled };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// First-launch disclaimer
async function showFirstLaunchDisclaimer() {
  if (!store || store.get('disclaimer_accepted')) return true;
  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'Crosshair F - Terms & Notice',
    message: 'READ BEFORE USING',
    detail: `Crosshair F is a transparent overlay for games. By using this app you agree to:

GAMES TO AVOID (will cause issues):
- Valorant (Vanguard kernel anti-cheat blocks ALL overlays)
- Faceit / ESEA tournament play (CS2)
- PUBG ranked / esports mode
- Fortnite Champion League / FNCS
- Any tournament with prize money

TERMS OF USE:
- Use at your OWN risk
- Developers are NOT liable for ANY account bans, suspensions, or warnings
- You have read your game's overlay policy
- You will exit Crosshair F before launching restricted games
- You will not upload offensive, NSFW, or copyrighted content to Community
- You are 13 or older

PRIVACY:
- No telemetry, no tracking, no data collection
- Settings stored locally on your PC only

TRADEMARKS:
- Crosshair F is not affiliated with any game publisher
- All game names are trademarks of their respective owners

Copyright 2026 Crosshair F. MIT License. Full terms under Help & Info.

Click "I Understand & Accept" to continue, or "Exit" to quit.`,
    buttons: ['I Understand & Accept', 'Exit App'],
    defaultId: 0, cancelId: 1, noLink: true,
    icon: path.join(__dirname, '..', 'assets', 'icon.png')
  });
  if (result.response === 1) {
    app.quit();
    return false;
  }
  store.set('disclaimer_accepted', true);
  store.set('disclaimer_accepted_date', new Date().toISOString());
  store.set('disclaimer_version', '1.0');
  return true;
}

// ========== CLEANUP MODE (called by uninstaller) ==========
async function runCleanupMode() {
  try {
    const Store = (await import('electron-store')).default;
    const tempStore = new Store({ name: 'crosshair-f-config' });
    const installedCrosshairs = Array.isArray(tempStore.get('installedCrosshairs')) ? tempStore.get('installedCrosshairs') : [];
    const installedGamePresets = Array.isArray(tempStore.get('installedGamePresets')) ? tempStore.get('installedGamePresets') : [];
    const savedCfg = tempStore.get('community') || {};

    // Validate saved endpoint - reject tampered config, fall back to baked-in default
    let endpoint = DEFAULT_COMMUNITY_CONFIG.endpoint;
    let apiKey = DEFAULT_COMMUNITY_CONFIG.apiKey;
    if (savedCfg && typeof savedCfg.endpoint === 'string' && typeof savedCfg.apiKey === 'string') {
      try {
        const parsed = new URL(savedCfg.endpoint);
        if (parsed.protocol === 'https:'
            && /^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname)
            && /^[A-Za-z0-9_\-.]+$/.test(savedCfg.apiKey)
            && savedCfg.apiKey.length >= 20 && savedCfg.apiKey.length <= 1000) {
          endpoint = savedCfg.endpoint.replace(/\/$/, '');
          apiKey = savedCfg.apiKey;
        }
      } catch { /* fall through to defaults */ }
    }

    console.log(`[Cleanup] Decrementing ${installedCrosshairs.length} crosshair installs + ${installedGamePresets.length} game preset installs...`);

    // Helper to call a decrement RPC with timeout
    const decrementCall = (rpc, param, value) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      return fetch(`${endpoint}/rest/v1/rpc/${rpc}`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'apikey': apiKey,
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ [param]: value })
      }).catch(() => null).finally(() => clearTimeout(timer));
    };

    // Filter to only valid IDs - skip any tampered or corrupt entries
    const validId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id) && id.length <= 100;
    const validCrosshairs = installedCrosshairs.filter(x => x && validId(x.id));
    const validGamePresets = installedGamePresets.filter(x => x && validId(x.id));

    // Decrement crosshair installs
    const crosshairPromises = validCrosshairs.map(item =>
      decrementCall('decrement_downloads', 'crosshair_id_param', item.id)
    );
    // Decrement game preset installs
    const gamePresetPromises = validGamePresets.map(item =>
      decrementCall('decrement_game_preset_downloads', 'preset_id_param', item.id)
    );

    await Promise.all([...crosshairPromises, ...gamePresetPromises]);

    // Clear lists so reinstall starts fresh
    tempStore.set('installedCrosshairs', []);
    tempStore.set('installedGamePresets', []);
    tempStore.set('appliedCommunityIds', []);

    console.log('[Cleanup] Done.');
  } catch (e) {
    console.error('[Cleanup] Failed:', e.message);
  }
  // Fast exit - uninstaller is waiting for this process to die
  setTimeout(() => process.exit(0), 100);
  app.quit();
}

// ========== GLOBAL SESSION SECURITY HARDENING ==========
// Applies a belt-and-suspenders layer on top of HTML meta CSP tags.
function applySessionSecurity() {
  try {
    const { session } = require('electron');
    const defaultSession = session.defaultSession;

    // Inject CSP header on every response - belt and suspenders over HTML meta tags
    defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const isHttpUrl = details.url.startsWith('http');
      const csp = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data:",
        "connect-src 'self' https://*.supabase.co",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
        "frame-src 'none'",
        "frame-ancestors 'none'"
      ].join('; ');

      // Only apply CSP to our own bundled files (file://), let Supabase API responses through unchanged
      if (!isHttpUrl) {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [csp],
            'X-Frame-Options': ['DENY'],
            'X-Content-Type-Options': ['nosniff'],
            'Referrer-Policy': ['no-referrer']
          }
        });
      } else {
        callback({ responseHeaders: details.responseHeaders });
      }
    });

    // Block all permission requests globally (camera, mic, geolocation, notifications, etc.)
    defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(false));
    defaultSession.setPermissionCheckHandler(() => false);
  } catch (e) {
    console.error('[Security] applySessionSecurity failed:', e.message);
  }
}

// Block every future BrowserWindow's renderer from navigating or opening new windows.
// Catches any case we might have missed at window construction time.
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (ev, url) => {
    // Only allow navigating to our own file:// URLs
    if (!url.startsWith('file://')) {
      ev.preventDefault();
      if (isSafeExternalUrl(url)) shell.openExternal(url);
    }
  });
  contents.setWindowOpenHandler(({ url }) => {
    safeOpenExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-attach-webview', (ev) => ev.preventDefault());
});

// App lifecycle
app.whenReady().then(async () => {
  if (isCleanupMode) {
    await runCleanupMode();
    return;
  }
  applySessionSecurity();
  await loadStore();
  const accepted = await showFirstLaunchDisclaimer();
  if (!accepted) return;
  loadCommunityConfig();
  createOverlay();
  setupTray();
  registerHotkeys();
  if (!store || !store.get('settings')) createSettings();
});

app.on('second-instance', () => createSettings());
app.on('window-all-closed', (e) => { e.preventDefault(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
