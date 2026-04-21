const { app, BrowserWindow, screen, globalShortcut, Tray, Menu, ipcMain, nativeImage, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
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

async function loadStore() {
  try {
    const Store = (await import('electron-store')).default;
    store = new Store({ name: 'crosshair-f-config' });
    const saved = store.get('settings');
    if (saved) settings = { ...defaultSettings, ...saved };
  } catch (e) {
    console.error('electron-store load failed:', e.message);
  }
}

function loadCommunityConfig() {
  if (store) {
    const saved = store.get('community');
    if (saved && saved.endpoint && saved.apiKey) {
      communityConfig = { ...DEFAULT_COMMUNITY_CONFIG, ...saved };
    }
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
      contextIsolation: true, nodeIntegration: false, backgroundThrottling: false
    }
  });
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
      contextIsolation: true, nodeIntegration: false
    }
  });
  settingsWindow.setMenuBarVisibility(false);
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.webContents.on('did-finish-load', () => {
    const displays = screen.getAllDisplays().map((d, i) => ({
      index: i,
      label: `Monitor ${i + 1} (${d.bounds.width}x${d.bounds.height})`,
      isPrimary: d.id === screen.getPrimaryDisplay().id
    }));
    settingsWindow.webContents.send('init', { settings, displays });
  });
  settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
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
  const p = (settings.profiles || {})[name];
  if (!p) return;
  settings = { ...settings, ...p, activeProfile: name, profiles: settings.profiles };
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
  return store ? (store.get('customGamePresets') || []) : [];
}

function setCustomGamePresets(list) {
  if (store) store.set('customGamePresets', list);
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
      nodeIntegration: false
    }
  });
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
ipcMain.handle('settings:set', (event, partial) => {
  const oldMonitor = settings.monitorIndex;
  const oldHideCapture = settings.hideOnCapture;
  settings = { ...settings, ...partial };
  saveSettings();
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (partial.monitorIndex !== undefined && partial.monitorIndex !== oldMonitor) repositionOverlay();
    if (partial.hideOnCapture !== undefined && partial.hideOnCapture !== oldHideCapture) {
      overlayWindow.setContentProtection(!!partial.hideOnCapture);
    }
    overlayWindow.webContents.send('settings:update', settings);
  }
  return settings;
});
ipcMain.handle('settings:reset', () => {
  settings = { ...defaultSettings, profiles: settings.profiles };
  saveSettings();
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('settings:update', settings);
  }
  return settings;
});
ipcMain.handle('hotkey:rebind', (event, partial) => {
  settings = { ...settings, ...partial };
  saveSettings();
  registerHotkeys();
  return settings;
});
ipcMain.handle('overlay:toggle', () => { toggleCrosshair(); return crosshairVisible; });

// IPC: profiles
ipcMain.handle('profile:save', (event, name) => {
  const profile = { ...settings };
  delete profile.profiles;
  delete profile.activeProfile;
  settings.profiles = settings.profiles || {};
  settings.profiles[name] = profile;
  settings.activeProfile = name;
  saveSettings();
  rebuildTrayMenu();
  return settings;
});
ipcMain.handle('profile:load', (event, name) => { loadProfile(name); return settings; });
ipcMain.handle('profile:delete', (event, name) => {
  if (name === 'default') return settings;
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
ipcMain.handle('app:openExternal', (event, url) => shell.openExternal(url));
ipcMain.handle('app:setAutoLaunch', (event, enabled) => {
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: settings.startMinimized });
  settings.startWithWindows = enabled;
  saveSettings();
  return enabled;
});

// IPC: user custom crosshair library
function getCustomList() { return store ? (store.get('customCrosshairs') || []) : []; }
function setCustomList(list) { if (store) store.set('customCrosshairs', list); }

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
  let list = getCustomList();
  list = list.filter(x => x.id !== id);
  setCustomList(list);
  return { ok: true, list };
});

// IPC: community backend
ipcMain.handle('community:getConfig', () => communityConfig);
ipcMain.handle('community:config', (event, cfg) => {
  communityConfig = { ...communityConfig, ...cfg };
  saveCommunityConfig();
  return communityConfig;
});

async function supabaseFetch(urlPath, options = {}) {
  if (!communityConfig.endpoint || !communityConfig.apiKey) {
    throw new Error('Community backend not configured');
  }
  const url = communityConfig.endpoint.replace(/\/$/, '') + '/rest/v1' + urlPath;
  const headers = {
    'apikey': communityConfig.apiKey,
    'Authorization': 'Bearer ' + communityConfig.apiKey,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Backend error ${res.status}: ${txt}`);
  }
  // Handle empty response body (e.g. when Prefer: return=minimal is set)
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
  const { search = '', game = '', sort = 'popular', page = 0, limit = 20 } = params;
  let query = '/crosshairs?select=*&verified=eq.true';
  if (game) query += `&game=eq.${encodeURIComponent(game)}`;
  if (search && search.trim()) {
    // Supabase PostgREST: escape reserved chars in ilike patterns
    const safe = search.trim().replace(/[%_,()]/g, '').slice(0, 40);
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
    console.error('Community list query:', query, 'error:', e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('community:upload', async (event, data) => {
  if (!data.name || data.name.length < 2 || data.name.length > 40) return { ok: false, error: 'Name must be 2-40 characters' };
  if (!data.author || data.author.length < 2 || data.author.length > 20) return { ok: false, error: 'Author tag must be 2-20 characters' };
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

ipcMain.handle('community:download', async (event, id) => {
  try {
    const data = await supabaseFetch(`/crosshairs?id=eq.${encodeURIComponent(id)}&select=*`);
    if (!data || !data.length) return { ok: false, error: 'Not found' };
    const item = data[0];

    // Local tracking: if this device has already applied this crosshair, DON'T increment
    const applied = getAppliedSet();
    const alreadyApplied = applied.includes(id);

    if (!alreadyApplied) {
      // First-time apply from this device - increment downloads
      await supabaseFetch(`/crosshairs?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ downloads: (item.downloads || 0) + 1 })
      }).catch((e) => { console.error('Increment failed:', e.message); });
      applied.push(id);
      setAppliedSet(applied);
    }

    const safe = sanitizeCommunityPreset(item.preset);
    if (!safe) return { ok: false, error: 'Preset failed validation on download' };

    // Backup current settings so unapply can restore them
    if (store) store.set('lastAppliedCommunityBackup', { ...settings });
    settings = { ...settings, ...safe, _appliedCommunityId: id };
    saveSettings();
    broadcastSettings();
    return { ok: true, settings, alreadyApplied };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('community:unapply', async (event, id) => {
  try {
    const applied = getAppliedSet();
    const idx = applied.indexOf(id);

    // IDEMPOTENCY: only decrement if this device actually had it applied.
    // This prevents count-going-negative after uninstall/reinstall or stale data.
    if (idx === -1) {
      // Not in applied list - don't touch the count, just restore backup if any
      const backup = store ? store.get('lastAppliedCommunityBackup') : null;
      if (backup) {
        settings = { ...backup };
        delete settings._appliedCommunityId;
        saveSettings();
        broadcastSettings();
      }
      return { ok: true, settings, wasApplied: false };
    }

    // Fetch current count, decrement by 1 (but never below 0)
    const data = await supabaseFetch(`/crosshairs?id=eq.${encodeURIComponent(id)}&select=*`);
    if (data && data.length) {
      const current = data[0].downloads || 0;
      const newCount = Math.max(0, current - 1);
      await supabaseFetch(`/crosshairs?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ downloads: newCount })
      }).catch((e) => { console.error('Decrement failed:', e.message); });
    }

    // Remove from local applied set
    applied.splice(idx, 1);
    setAppliedSet(applied);

    // Restore previous settings
    const backup = store ? store.get('lastAppliedCommunityBackup') : null;
    if (backup) {
      settings = { ...backup };
      delete settings._appliedCommunityId;
      saveSettings();
      broadcastSettings();
    }
    return { ok: true, settings, wasApplied: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

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
  return store ? (store.get('installedCrosshairs') || []) : [];
}
function setInstalledCrosshairs(list) {
  if (store) store.set('installedCrosshairs', list);
}

ipcMain.handle('community:install', async (event, id) => {
  try {
    const data = await supabaseFetch(`/crosshairs?id=eq.${encodeURIComponent(id)}&select=*`);
    if (!data || !data.length) return { ok: false, error: 'Not found' };
    const item = data[0];

    const installed = getInstalledCrosshairs();
    const alreadyInstalled = installed.find(x => x.id === id);
    if (alreadyInstalled) {
      return { ok: false, error: 'Already installed. Check your Crosshairs tab.', alreadyInstalled: true };
    }

    // Increment download count via RPC
    try {
      await supabaseFetch('/rpc/increment_downloads', {
        method: 'POST',
        body: JSON.stringify({ crosshair_id_param: id })
      });
    } catch (err) {
      console.error('Increment RPC failed:', err.message);
      return { ok: false, error: 'Could not update download count. ' + err.message };
    }

    const safe = sanitizeCommunityPreset(item.preset);
    if (!safe) return { ok: false, error: 'Preset failed validation' };

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

    // Also apply it immediately
    if (store) store.set('lastAppliedCommunityBackup', { ...settings });
    settings = { ...settings, ...safe, _appliedCommunityId: id };
    saveSettings();
    broadcastSettings();

    // Also update the local applied set (for compatibility)
    const applied = getAppliedSet();
    if (!applied.includes(id)) {
      applied.push(id);
      setAppliedSet(applied);
    }
    return { ok: true, settings, entry };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('community:uninstall', async (event, id) => {
  try {
    let installed = getInstalledCrosshairs();
    const entry = installed.find(x => x.id === id);
    if (!entry) return { ok: false, error: 'Not in your installed library' };

    // Decrement download count via RPC
    try {
      await supabaseFetch('/rpc/decrement_downloads', {
        method: 'POST',
        body: JSON.stringify({ crosshair_id_param: id })
      });
    } catch (err) {
      console.error('Decrement RPC failed:', err.message);
    }

    installed = installed.filter(x => x.id !== id);
    setInstalledCrosshairs(installed);

    // Remove from applied set too
    let applied = getAppliedSet();
    applied = applied.filter(x => x !== id);
    setAppliedSet(applied);

    // If this was the currently-applied community crosshair, restore backup
    if (settings._appliedCommunityId === id) {
      const backup = store ? store.get('lastAppliedCommunityBackup') : null;
      if (backup) {
        settings = { ...backup };
        delete settings._appliedCommunityId;
        saveSettings();
        broadcastSettings();
      }
    }
    return { ok: true, installed };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('community:listInstalled', () => getInstalledCrosshairs());

ipcMain.handle('community:applyInstalled', (event, id) => {
  const installed = getInstalledCrosshairs();
  const entry = installed.find(x => x.id === id);
  if (!entry) return { ok: false, error: 'Not found in installed library' };
  if (store) store.set('lastAppliedCommunityBackup', { ...settings });
  settings = { ...settings, ...entry.preset, _appliedCommunityId: id };
  saveSettings();
  broadcastSettings();
  return { ok: true, settings };
});

// ========== REVIEWS & RATINGS ==========
ipcMain.handle('community:submitReview', async (event, { crosshairId, rating, reviewText }) => {
  try {
    if (!crosshairId) return { ok: false, error: 'Crosshair ID required' };
    const r = parseInt(rating);
    if (isNaN(r) || r < 1 || r > 5) return { ok: false, error: 'Rating must be 1-5' };
    const text = (reviewText || '').slice(0, 500);
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
    await supabaseFetch('/reports', {
      method: 'POST',
      body: JSON.stringify({
        crosshair_id: id,
        reason: (reason || 'inappropriate').slice(0, 200),
        reported_at: new Date().toISOString()
      })
    });
    return { ok: true };
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

// App lifecycle
app.whenReady().then(async () => {
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
