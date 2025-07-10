const { contextBridge, ipcRenderer } = require('electron');

console.log('Simple preload script loaded');

// Keep-alive state
let keepAliveState = {
  lastPing: Date.now(),
  isResponsive: true
};

// Expose API
contextBridge.exposeInMainWorld('electronAPI', {
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  setDisplay: (displayIndex) => ipcRenderer.invoke('set-display', displayIndex),
  keepAlive: () => {
    keepAliveState.lastPing = Date.now();
    keepAliveState.isResponsive = true;
    console.log('Keep-alive ping received');
    return { success: true, timestamp: keepAliveState.lastPing };
  },
  getKeepAliveState: () => keepAliveState
});

// Monitor page responsiveness
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, monitoring responsiveness...');
  keepAliveState.isResponsive = true;
});

// Monitor page visibility changes
document.addEventListener('visibilitychange', () => {
  keepAliveState.isResponsive = !document.hidden;
  console.log('Page visibility changed:', !document.hidden);
});

// Monitor page focus
window.addEventListener('focus', () => {
  keepAliveState.isResponsive = true;
  console.log('Window focused');
});

window.addEventListener('blur', () => {
  console.log('Window blurred');
});

console.log('API exposed to window'); 