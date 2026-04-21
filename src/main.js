const { app, BrowserWindow, screen, globalShortcut, Tray, Menu, ipcMain, nativeImage, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Single instance lock so user does not open the app twice
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// Disable hardware accel toggle is exposed in settings later if needed
// We keep it ON by default for smoother rendering

let overlayWindow = null;
let settingsWindow = null;
let tray = null;
let store = null;
let crosshairVisible = true;

// Default settings
const defaultSettings = {
  shape: 'cross',           // cross, dot, t, circle, hybrid, scope, sniper
  customImage: null,         // base64 PNG/SVG
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
  hideOnCapture: false,        // hide from screen recorders
  smartContrast: false,
  activeProfile: 'default',
  profiles: {
    default: null              // will be filled with current settings
  }
};

let settings = { ...defaultSettings };

// Load electron-store lazily so app starts even if module missing
async function loadStore() {
  try {
    const Store = (await import('electron-store')).default;
    store = new Store({ name: 'crosshair-f-config' });
    const saved = store.get('settings');
    if (saved) {
      settings = { ...defaultSettings, ...saved };
    }
  } catch (e) {
    console.error('Could not load electron-store, using defaults:', e.message);
  }
}

function saveSettings() {
  if (store) {
    store.set('settings', settings);
  }
}

function getMonitorBounds(index) {
  const displays = screen.getAllDisplays();
  const idx = Math.min(Math.max(0, index), displays.length - 1);
  return displays[idx].bounds;
}

function createOverlay() {
  const bounds = getMonitorBounds(settings.monitorIndex);

  overlayWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    alwaysOnTop: true,
    hasShadow: false,
    show: !settings.startMinimized,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  // Click-through so it does not block your aim or clicks
  overlayWindow.setIgnoreMouseEvents(true, { forward: false });

  // Stay above fullscreen apps as much as the OS allows
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Hide from screen capture (OBS, recorders) if user wants
  if (settings.hideOnCapture) {
    overlayWindow.setContentProtection(true);
  }

  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));

  overlayWindow.webContents.on('did-finish-load', () => {
    overlayWindow.webContents.send('settings:update', settings);
  });

  // If user changes display config, reposition
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
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 620,
    title: 'Crosshair F',
    backgroundColor: '#0a0e14',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
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

  // Open external links in default browser
  settingsWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function setupTray() {
  // Try to load tray icon, fallback to empty if not present
  let trayIconPath = path.join(__dirname, '..', 'assets', 'icon.png');
  if (!fs.existsSync(trayIconPath)) {
    trayIconPath = path.join(__dirname, '..', 'assets', 'icon.ico');
  }

  let trayImage;
  try {
    trayImage = nativeImage.createFromPath(trayIconPath);
    if (trayImage.isEmpty()) {
      trayImage = nativeImage.createEmpty();
    } else {
      trayImage = trayImage.resize({ width: 16, height: 16 });
    }
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
    {
      label: crosshairVisible ? 'Hide Crosshair' : 'Show Crosshair',
      click: () => toggleCrosshair()
    },
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
  if (crosshairVisible) {
    overlayWindow.show();
  } else {
    overlayWindow.hide();
  }
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
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('settings:update', settings);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('settings:update', settings);
  }
}

function loadProfile(name) {
  const p = (settings.profiles || {})[name];
  if (!p) return;
  settings = { ...settings, ...p, activeProfile: name, profiles: settings.profiles };
  saveSettings();
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('settings:update', settings);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('settings:update', settings);
  }
  rebuildTrayMenu();
}

function nudgePosition(dx, dy) {
  settings.offsetX = (settings.offsetX || 0) + dx;
  settings.offsetY = (settings.offsetY || 0) + dy;
  saveSettings();
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('settings:update', settings);
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('settings:update', settings);
  }
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

  // Nudge - 1px per press
  safeReg('Alt+Shift+Up', () => nudgePosition(0, -1), 'nudgeUp');
  safeReg('Alt+Shift+Down', () => nudgePosition(0, 1), 'nudgeDown');
  safeReg('Alt+Shift+Left', () => nudgePosition(-1, 0), 'nudgeLeft');
  safeReg('Alt+Shift+Right', () => nudgePosition(1, 0), 'nudgeRight');

  // Big nudge - 10px per press
  safeReg('Ctrl+Alt+Shift+Up', () => nudgePosition(0, -10), 'bigNudgeUp');
  safeReg('Ctrl+Alt+Shift+Down', () => nudgePosition(0, 10), 'bigNudgeDown');
  safeReg('Ctrl+Alt+Shift+Left', () => nudgePosition(-10, 0), 'bigNudgeLeft');
  safeReg('Ctrl+Alt+Shift+Right', () => nudgePosition(10, 0), 'bigNudgeRight');

  // Debug grid toggle
  safeReg('Alt+Shift+G', () => toggleDebugGrid(), 'debugGrid');
}

function quitApp() {
  app.isQuiting = true;
  globalShortcut.unregisterAll();
  if (tray) tray.destroy();
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.destroy();
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.destroy();
  app.quit();
}

// IPC handlers
ipcMain.handle('settings:get', () => settings);

ipcMain.handle('settings:set', (event, partial) => {
  const oldMonitor = settings.monitorIndex;
  const oldHideCapture = settings.hideOnCapture;
  settings = { ...settings, ...partial };
  saveSettings();

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    if (partial.monitorIndex !== undefined && partial.monitorIndex !== oldMonitor) {
      repositionOverlay();
    }
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

ipcMain.handle('overlay:toggle', () => {
  toggleCrosshair();
  return crosshairVisible;
});

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

ipcMain.handle('profile:load', (event, name) => {
  loadProfile(name);
  return settings;
});

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

// Game-specific position presets (offset from screen center)
const GAME_PRESETS = {
  'roblox': { offsetX: 0, offsetY: 34, note: 'Roblox windowed (top bar offset)' },
  'roblox-fullscreen': { offsetX: 0, offsetY: 18, note: 'Roblox fullscreen' },
  'fortnite': { offsetX: 0, offsetY: 0, note: 'Fortnite borderless' },
  'apex': { offsetX: 0, offsetY: 0, note: 'Apex Legends' },
  'cs2': { offsetX: 0, offsetY: 0, note: 'Counter-Strike 2' },
  'warzone': { offsetX: 0, offsetY: 0, note: 'Call of Duty Warzone' },
  'pubg': { offsetX: 0, offsetY: 0, note: 'PUBG' },
  'rust': { offsetX: 0, offsetY: 0, note: 'Rust' },
  'tarkov': { offsetX: 0, offsetY: 0, note: 'Escape from Tarkov' },
  'sea-of-thieves': { offsetX: 0, offsetY: 0, note: 'Sea of Thieves' },
  'hunt': { offsetX: 0, offsetY: 0, note: 'Hunt: Showdown' },
  'battlefield': { offsetX: 0, offsetY: 0, note: 'Battlefield' },
  'minecraft': { offsetX: 0, offsetY: 0, note: 'Minecraft' },
  'forza': { offsetX: 0, offsetY: 0, note: 'Forza Horizon 5' },
  'overwatch': { offsetX: 0, offsetY: 0, note: 'Overwatch 2' },
  'r6siege': { offsetX: 0, offsetY: 0, note: 'Rainbow Six Siege' },
  'thefinals': { offsetX: 0, offsetY: 0, note: 'The Finals' },
  'deadlock': { offsetX: 0, offsetY: 0, note: 'Deadlock' },
  'marvelrivals': { offsetX: 0, offsetY: 0, note: 'Marvel Rivals' },
  'reset': { offsetX: 0, offsetY: 0, note: 'Reset (no offset)' }
};

ipcMain.handle('app:applyGamePreset', (event, gameKey) => {
  const preset = GAME_PRESETS[gameKey];
  if (!preset) return { ok: false, error: 'Unknown game' };
  settings.offsetX = preset.offsetX;
  settings.offsetY = preset.offsetY;
  saveSettings();
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('settings:update', settings);
  }
  return { ok: true, settings, note: preset.note };
});

ipcMain.handle('app:listGamePresets', () => {
  return Object.entries(GAME_PRESETS).map(([key, val]) => ({
    key, label: val.note, offsetX: val.offsetX, offsetY: val.offsetY
  }));
});

// Calibration mode - user clicks on screen to set crosshair position
let calibrationMode = false;
ipcMain.handle('app:startCalibration', () => {
  if (!overlayWindow || overlayWindow.isDestroyed()) return { ok: false };
  calibrationMode = true;
  // Make overlay clickable for calibration
  overlayWindow.setIgnoreMouseEvents(false);
  overlayWindow.webContents.send('debug:startCalibration');
  return { ok: true };
});

ipcMain.handle('app:setCalibration', (event, { x, y }) => {
  if (!calibrationMode || !overlayWindow || overlayWindow.isDestroyed()) return { ok: false };
  const bounds = getMonitorBounds(settings.monitorIndex);
  const cx = bounds.width / 2;
  const cy = bounds.height / 2;
  settings.offsetX = Math.round(x - cx);
  settings.offsetY = Math.round(y - cy);
  saveSettings();
  calibrationMode = false;
  overlayWindow.setIgnoreMouseEvents(true);
  overlayWindow.webContents.send('settings:update', settings);
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('settings:update', settings);
  }
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

ipcMain.handle('app:toggleDebugGrid', () => {
  toggleDebugGrid();
  return { ok: true };
});

ipcMain.handle('app:quit', () => quitApp());

ipcMain.handle('app:openExternal', (event, url) => shell.openExternal(url));

ipcMain.handle('app:setAutoLaunch', (event, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: settings.startMinimized
  });
  settings.startWithWindows = enabled;
  saveSettings();
  return enabled;
});

// ========== COMMUNITY ==========
let communityConfig = {
  endpoint: '',
  apiKey: ''
};

// ========== COMMUNITY ==========
// Built-in community backend. Anon key is safe to embed (Supabase RLS protects data).
const DEFAULT_COMMUNITY_CONFIG = {
  endpoint: 'https://vqyjfbbuapytcyialxsu.supabase.co',
  apiKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZxeWpmYmJ1YXB5dGN5aWFseHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NTk0MDcsImV4cCI6MjA5MjMzNTQwN30.zOCRjrV80L9BZXi402eqr1IHiy2H6E3sp7CMh4TNBSA'
};

let communityConfig = { ...DEFAULT_COMMUNITY_CONFIG };

function loadCommunityConfig() {
  // Built-in by default. Future override possible via electron-store.
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

ipcMain.handle('community:getConfig', () => communityConfig);
ipcMain.handle('community:config', (event, cfg) => {
  communityConfig = { ...communityConfig, ...cfg };
  saveCommunityConfig();
  return communityConfig;
});

async function supabaseFetch(path, options = {}) {
  if (!communityConfig.endpoint || !communityConfig.apiKey) {
    throw new Error('Community backend not configured');
  }
  const url = communityConfig.endpoint.replace(/\/$/, '') + '/rest/v1' + path;
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
  return res.json();
}

ipcMain.handle('community:list', async (event, params = {}) => {
  const { search = '', game = '', sort = 'popular', page = 0, limit = 20 } = params;
  let query = '/crosshairs?select=*&verified=eq.true';
  if (game) query += `&game=eq.${encodeURIComponent(game)}`;
  if (search) query += `&or=(name.ilike.*${encodeURIComponent(search)}*,author.ilike.*${encodeURIComponent(search)}*,tags.ilike.*${encodeURIComponent(search)}*)`;
  if (sort === 'popular') query += '&order=downloads.desc';
  else if (sort === 'recent') query += '&order=created_at.desc';
  else if (sort === 'rating') query += '&order=rating.desc';
  query += `&offset=${page * limit}&limit=${limit}`;

  try {
    const data = await supabaseFetch(query);
    return { ok: true, items: data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('community:upload', async (event, data) => {
  // Strict client-side validation before sending
  if (!data.name || data.name.length < 2 || data.name.length > 40) {
    return { ok: false, error: 'Name must be 2-40 characters' };
  }
  if (!data.author || data.author.length < 2 || data.author.length > 20) {
    return { ok: false, error: 'Author tag must be 2-20 characters' };
  }
  if (!data.preset || typeof data.preset !== 'object') {
    return { ok: false, error: 'Invalid preset' };
  }
  // Sanitize: never allow custom image upload via this path. Only safe shape data.
  // For custom images, the server scans them separately.
  const safePreset = sanitizePreset(data.preset);
  if (!safePreset) {
    return { ok: false, error: 'Preset failed validation' };
  }

  try {
    const payload = {
      name: data.name.trim(),
      author: data.author.trim(),
      game: data.game || 'any',
      tags: (data.tags || '').slice(0, 60),
      description: (data.description || '').slice(0, 120),
      preset: safePreset,
      verified: false, // server cron job verifies after scan
      downloads: 0,
      rating: 0,
      created_at: new Date().toISOString()
    };
    await supabaseFetch('/crosshairs', {
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: JSON.stringify(payload)
    });
    return { ok: true, message: 'Uploaded! Will appear publicly after auto-scan (usually under 1 minute).' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

function sanitizePreset(preset) {
  // Whitelist only known fields. Strip anything weird.
  const allowed = ['shape','size','thickness','gapSize','color','opacity','rotation',
                   'outline','outlineColor','outlineThickness','centerDot','centerDotSize','centerDotColor'];
  const allowedShapes = ['cross','dot','t','circle','hybrid','scope','sniper'];
  const out = {};
  for (const key of allowed) {
    if (preset[key] !== undefined) out[key] = preset[key];
  }
  // Reject custom images from community uploads in client. Server still rescans.
  if (out.shape && !allowedShapes.includes(out.shape)) return null;
  // Color must match #RRGGBB
  for (const key of ['color','outlineColor','centerDotColor']) {
    if (out[key] && !/^#[0-9a-fA-F]{6}$/.test(out[key])) return null;
  }
  // Numeric ranges
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

ipcMain.handle('community:download', async (event, id) => {
  try {
    const data = await supabaseFetch(`/crosshairs?id=eq.${encodeURIComponent(id)}&select=*`);
    if (!data || !data.length) return { ok: false, error: 'Not found' };
    const item = data[0];
    // Increment download counter (fire-and-forget)
    supabaseFetch(`/crosshairs?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ downloads: (item.downloads || 0) + 1 })
    }).catch(() => {});
    // Apply the preset to current settings
    const safe = sanitizePreset(item.preset);
    if (!safe) return { ok: false, error: 'Preset failed validation on download' };
    settings = { ...settings, ...safe };
    saveSettings();
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('settings:update', settings);
    }
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('settings:update', settings);
    }
    return { ok: true, settings };
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

const { dialog } = require('electron');

async function showFirstLaunchDisclaimer() {
  if (!store || store.get('disclaimer_accepted')) return true;

  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'Crosshair F - Terms & Notice',
    message: 'READ BEFORE USING',
    detail: `Crosshair F is a transparent overlay for games. By using this app you agree to:

⚠ GAMES TO AVOID (will cause issues):
- Valorant (Vanguard kernel anti-cheat blocks ALL overlays)
- Faceit / ESEA tournament play (CS2)
- PUBG ranked / esports mode
- Fortnite Champion League / FNCS
- Any tournament with prize money

✓ TERMS OF USE:
- Use at your OWN risk
- Developers are NOT liable for ANY account bans, suspensions, or warnings
- You have read your game's overlay policy
- You will exit Crosshair F before launching restricted games
- You will not use the community to upload offensive, NSFW, or copyrighted content
- You are 13 or older

✓ PRIVACY:
- No telemetry, no tracking, no data collection
- Settings stored locally on your PC only
- Community uploads contain only the data you explicitly provide

✓ TRADEMARKS:
- Crosshair F is not affiliated with any game publisher mentioned
- All game names are trademarks of their respective owners

© 2026 Crosshair F. MIT License. Full terms in app under "Help & Info".

Click "I Understand & Accept" to continue, or "Exit" to quit.`,
    buttons: ['I Understand & Accept', 'Exit App'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
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

app.whenReady().then(async () => {
  await loadStore();
  const accepted = await showFirstLaunchDisclaimer();
  if (!accepted) return;

  loadCommunityConfig();
  createOverlay();
  setupTray();
  registerHotkeys();

  // Open settings on first run if no profile saved yet
  if (!store || !store.get('settings')) {
    createSettings();
  }
});

app.on('second-instance', () => createSettings());
app.on('window-all-closed', (e) => {
  // Keep the app running in tray
  e.preventDefault();
});
app.on('will-quit', () => globalShortcut.unregisterAll());
