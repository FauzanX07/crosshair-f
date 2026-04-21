const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('crosshairAPI', {
  // Core settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  rebindHotkey: (partial) => ipcRenderer.invoke('hotkey:rebind', partial),
  toggleOverlay: () => ipcRenderer.invoke('overlay:toggle'),

  // Profiles (per-game settings)
  saveProfile: (name) => ipcRenderer.invoke('profile:save', name),
  loadProfile: (name) => ipcRenderer.invoke('profile:load', name),
  deleteProfile: (name) => ipcRenderer.invoke('profile:delete', name),
  listProfiles: () => ipcRenderer.invoke('profile:list'),

  // App lifecycle
  setAutoLaunch: (enabled) => ipcRenderer.invoke('app:setAutoLaunch', enabled),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  quit: () => ipcRenderer.invoke('app:quit'),

  // Events from main
  onSettingsUpdate: (cb) => ipcRenderer.on('settings:update', (e, s) => cb(s)),
  onInit: (cb) => ipcRenderer.on('init', (e, data) => cb(data)),

  // Community
  communityConfig: (cfg) => ipcRenderer.invoke('community:config', cfg),
  communityGetConfig: () => ipcRenderer.invoke('community:getConfig'),
  communityList: (params) => ipcRenderer.invoke('community:list', params),
  communityUpload: (data) => ipcRenderer.invoke('community:upload', data),
communityDownload: (id) => ipcRenderer.invoke('community:download', id),
  communityUnapply: (id) => ipcRenderer.invoke('community:unapply', id),
  communityListApplied: () => ipcRenderer.invoke('community:listApplied'),
  communityReport: (id, reason) => ipcRenderer.invoke('community:report', { id, reason }),

  // Game presets & calibration
  applyGamePreset: (key) => ipcRenderer.invoke('app:applyGamePreset', key),
  listGamePresets: () => ipcRenderer.invoke('app:listGamePresets'),
  startCalibration: () => ipcRenderer.invoke('app:startCalibration'),
  setCalibration: (pos) => ipcRenderer.invoke('app:setCalibration', pos),
  cancelCalibration: () => ipcRenderer.invoke('app:cancelCalibration'),
  toggleDebugGrid: () => ipcRenderer.invoke('app:toggleDebugGrid'),
  onDebug: (cb) => ipcRenderer.on('debug:toggleGrid', () => cb('toggleGrid')),
  onCalibrationStart: (cb) => ipcRenderer.on('debug:startCalibration', () => cb()),
  onCalibrationCancel: (cb) => ipcRenderer.on('debug:cancelCalibration', () => cb()),

  // User custom crosshair library
  saveCustomCrosshair: (data) => ipcRenderer.invoke('custom:save', data),
  listCustomCrosshairs: () => ipcRenderer.invoke('custom:list'),
  deleteCustomCrosshair: (id) => ipcRenderer.invoke('custom:delete', id),

  // Custom user-made game position presets
  listCustomGamePresets: () => ipcRenderer.invoke('customGamePreset:list'),
  applyCustomGamePreset: (id) => ipcRenderer.invoke('customGamePreset:apply', id),
  deleteCustomGamePreset: (id) => ipcRenderer.invoke('customGamePreset:delete', id),
  openGamePresetSaveDialog: () => ipcRenderer.invoke('customGamePreset:openSaveDialog'),
  onCustomGamePresetsUpdated: (cb) => ipcRenderer.on('customGamePresets:updated', (e, list) => cb(list)),
  onNotify: (cb) => ipcRenderer.on('notify', (e, msg) => cb(msg)),

  // Prompt window internal
  promptInit: (cb) => ipcRenderer.on('prompt:init', (e, data) => cb(data)),
  promptSubmit: (name) => ipcRenderer.invoke('prompt:submit', name),
  promptCancel: () => ipcRenderer.invoke('prompt:cancel')
});
