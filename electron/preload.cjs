const { contextBridge, ipcRenderer } = require('electron');

function isOpenLeiraAppOrigin(location) {
  if (location.protocol === 'file:') return true;

  if (location.protocol === 'http:') {
    return location.hostname === '127.0.0.1' || location.hostname === 'localhost';
  }

  return location.protocol === 'https:' && (
    location.hostname === 'openleira.online' || location.hostname.endsWith('.openleira.online')
  );
}

function onDesktopStateUpdated(callback) {
  const listener = (_event, state) => callback(state);
  ipcRenderer.on('openleira-desktop:state-updated', listener);
  return () => {
    ipcRenderer.removeListener('openleira-desktop:state-updated', listener);
  };
}

if (isOpenLeiraAppOrigin(window.location)) {
  contextBridge.exposeInMainWorld('openleiraDesktopNotifications', {
    getState: () => ipcRenderer.invoke('openleira-desktop:get-state'),
    update: (settings) => ipcRenderer.invoke('openleira-desktop:update-desktop-notifications', settings),
    onStateUpdated: onDesktopStateUpdated,
  });
}

if (window.location.protocol === 'file:') {
  contextBridge.exposeInMainWorld('openleiraDesktop', {
    connectCloud: () => ipcRenderer.invoke('openleira-desktop:connect-cloud'),
    disconnectCloud: () => ipcRenderer.invoke('openleira-desktop:disconnect-cloud'),
    copyDiagnostics: () => ipcRenderer.invoke('openleira-desktop:copy-diagnostics'),
    copyLocalWebUrl: () => ipcRenderer.invoke('openleira-desktop:copy-local-web-url'),
    getState: () => ipcRenderer.invoke('openleira-desktop:get-state'),
    openCloudDashboard: () => ipcRenderer.invoke('openleira-desktop:open-cloud-dashboard'),
    openEnvironment: (environmentId) => ipcRenderer.invoke('openleira-desktop:open-environment', environmentId),
    runActiveEnvironmentAction: (action) => ipcRenderer.invoke('openleira-desktop:run-active-environment-action', action),
    openLocal: () => ipcRenderer.invoke('openleira-desktop:open-local'),
    openLocalWebUi: () => ipcRenderer.invoke('openleira-desktop:open-local-web-ui'),
    refreshEnvironments: () => ipcRenderer.invoke('openleira-desktop:refresh-environments'),
    refreshActiveTab: () => ipcRenderer.invoke('openleira-desktop:reload-active-tab'),
    showEnvironmentPicker: () => ipcRenderer.invoke('openleira-desktop:show-environment-picker'),
    showLauncher: () => ipcRenderer.invoke('openleira-desktop:show-launcher'),
    showLocalSettings: () => ipcRenderer.invoke('openleira-desktop:show-local-settings'),
    showDesktopSettings: () => ipcRenderer.invoke('openleira-desktop:show-desktop-settings'),
    closeSettingsWindow: () => ipcRenderer.invoke('openleira-desktop:close-settings-window'),
    showActiveEnvironmentActionsMenu: () => ipcRenderer.invoke('openleira-desktop:show-active-environment-actions-menu'),
    showEnvironmentActionsMenu: (environmentId) => ipcRenderer.invoke('openleira-desktop:show-environment-actions-menu', environmentId),
    switchTab: (tabId) => ipcRenderer.invoke('openleira-desktop:switch-tab', tabId),
    closeTab: (tabId) => ipcRenderer.invoke('openleira-desktop:close-tab', tabId),
    updateSetting: (key, value) => ipcRenderer.invoke('openleira-desktop:update-setting', key, value),
    onStateUpdated: onDesktopStateUpdated,
    onLauncherCommand: (callback) => {
      ipcRenderer.on('openleira-desktop:launcher-command', (_event, command) => callback(command));
    },
  });
}
