const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('crosshairAPI', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  rebindHotkey: (partial) => ipcRenderer.invoke('hotkey:rebind', partial),
  toggleOverlay: () => ipcRenderer.invoke('overlay:toggle'),
  saveProfile: (name) => ipcRenderer.invoke('profile:save', name),
  loadProfile: (name) => ipcRenderer.invoke('profile:load', name),
  deleteProfile: (name) => ipcRenderer.invoke('profile:delete', name),
  listProfiles: () => ipcRenderer.invoke('profile:list'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('app:setAutoLaunch', enabled),
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),
  quit: () => ipcRenderer.invoke('app:quit'),
  onSettingsUpdate: (cb) => ipcRenderer.on('settings:update', (e, s) => cb(s)),
  onInit: (cb) => ipcRenderer.on('init', (e, data) => cb(data)),

  // Community
  communityConfig: (cfg) => ipcRenderer.invoke('community:config', cfg),
  communityGetConfig: () => ipcRenderer.invoke('community:getConfig'),
  communityList: (params) => ipcRenderer.invoke('community:list', params),
  communityUpload: (data) => ipcRenderer.invoke('community:upload', data),
  communityDownload: (id) => ipcRenderer.invoke('community:download', id),
communityReport: (id, reason) => ipcRenderer.invoke('community:report', { id, reason }),

  // Calibration & game presets
  applyGamePreset: (key) => ipcRenderer.invoke('app:applyGamePreset', key),
  listGamePresets: () => ipcRenderer.invoke('app:listGamePresets'),
  startCalibration: () => ipcRenderer.invoke('app:startCalibration'),
  setCalibration: (pos) => ipcRenderer.invoke('app:setCalibration', pos),
  cancelCalibration: () => ipcRenderer.invoke('app:cancelCalibration'),
  toggleDebugGrid: () => ipcRenderer.invoke('app:toggleDebugGrid'),
  onDebug: (cb) => ipcRenderer.on('debug:toggleGrid', () => cb('toggleGrid')),
  onCalibrationStart: (cb) => ipcRenderer.on('debug:startCalibration', () => cb()),
  onCalibrationCancel: (cb) => ipcRenderer.on('debug:cancelCalibration', () => cb())
});
