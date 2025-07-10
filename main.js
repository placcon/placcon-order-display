const { app, BrowserWindow, session, ipcMain, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a global reference of the window object
let mainWindow;
let keepAliveInterval;
let lastActivityTime = Date.now();
let isRecovering = false;

// Settings file path
const settingsPath = path.join(app.getPath('userData'), 'display-settings.json');
const windowStatePath = path.join(app.getPath('userData'), 'window-state.json');

// Keep-alive configuration
const KEEP_ALIVE_INTERVAL = 30000; // 30 seconds
const INACTIVITY_TIMEOUT = 300000; // 5 minutes
const RECOVERY_CHECK_INTERVAL = 60000; // 1 minute

// Load display settings
function loadDisplaySettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      return settings;
    }
  } catch (error) {
    console.error('Error loading display settings:', error);
  }
  return { displayIndex: 1 }; // Default to secondary display (index 1)
}

// Save display settings
function saveDisplaySettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log('Display settings saved:', settings);
  } catch (error) {
    console.error('Error saving display settings:', error);
  }
}

// Load window state
function loadWindowState() {
  try {
    if (fs.existsSync(windowStatePath)) {
      const state = JSON.parse(fs.readFileSync(windowStatePath, 'utf8'));
      return state;
    }
  } catch (error) {
    console.error('Error loading window state:', error);
  }
  return null;
}

// Save window state
function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  
  try {
    const state = {
      bounds: mainWindow.getBounds(),
      isFullScreen: mainWindow.isFullScreen(),
      isMaximized: mainWindow.isMaximized(),
      timestamp: Date.now()
    };
    fs.writeFileSync(windowStatePath, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('Error saving window state:', error);
  }
}

// Get available displays
function getAvailableDisplays() {
  const displays = screen.getAllDisplays();
  return displays.map((display, index) => ({
    index,
    id: display.id,
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor,
    rotation: display.rotation,
    internal: display.internal,
    primary: display.primary,
    label: display.primary ? `Primary Display (${display.bounds.width}x${display.bounds.height})` : 
                            `Secondary Display ${index} (${display.bounds.width}x${display.bounds.height})`
  }));
}

function createWindow() {
  // Load display settings
  const settings = loadDisplaySettings();
  const displays = getAvailableDisplays();
  
  // Get the target display
  const targetDisplay = displays[settings.displayIndex] || displays[0];
  console.log('Using display:', targetDisplay.label);
  
  // Reset recovery flag
  isRecovering = false;
  
  // Create the browser window
  mainWindow = new BrowserWindow({
    fullscreen: true,
    kiosk: true,
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: targetDisplay.bounds.width,
    height: targetDisplay.bounds.height,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload-simple.js'),
      backgroundThrottling: false, // Prevent background throttling
      webSecurity: true,
      allowRunningInsecureContent: false
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'placcon order display',
    show: false, // Don't show until ready
    autoHideMenuBar: true, // Hide menu bar
    titleBarStyle: 'default',
    alwaysOnTop: false, // Don't force always on top
    skipTaskbar: false, // Show in taskbar
    closable: true, // Allow closing
    minimizable: false, // Prevent minimizing
    maximizable: false, // Prevent maximizing
    resizable: false // Prevent resizing
  });

  // Load the Placcon website
  mainWindow.loadURL('https://core.placcon.com');
  
  // Track page load start time
  mainWindow.webContents.on('did-start-loading', () => {
    console.log('Page started loading...');
    mainWindow.webContents.executeJavaScript(`
      window.pageLoadStartTime = Date.now();
    `);
  });

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Inject display selector code after page loads
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page finished loading, injecting display selector...');
    
    // Reset recovery flag when page loads successfully
    isRecovering = false;
    lastActivityTime = Date.now();
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log('Garbage collection triggered');
    }
    
    // Inject the display selector code
    mainWindow.webContents.executeJavaScript(`
      console.log('Injecting display selector code...');
      
      // Add keyboard shortcut only
      document.addEventListener('keydown', (event) => {
        if (event.ctrlKey && event.shiftKey && event.key === 'D') {
          event.preventDefault();
          console.log('Keyboard shortcut detected');
          showDisplaySelector();
        }
      });
      
      // Display selector function
      async function showDisplaySelector() {
        console.log('Opening display selector...');
        
        try {
          // Get displays using IPC
          const result = await window.electronAPI.getDisplays();
          console.log('Displays result:', result);
          
          if (!result.success) {
            alert('Error loading displays: ' + result.error);
            return;
          }
          
          const { displays, currentDisplay } = result;
          
          if (displays.length === 0) {
            alert('No displays found.');
            return;
          }
          
          // Create modal
          const modal = document.createElement('div');
          modal.id = 'displaySelectorModal';
          modal.style.cssText = \`
            position: fixed;
            z-index: 9999;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.8);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
          \`;
          
          modal.innerHTML = \`
            <div style="background-color: white; margin: auto; padding: 0; border-radius: 12px; width: 90%; max-width: 500px; box-shadow: 0 10px 25px rgba(0,0,0,0.3);">
              <div style="padding: 20px 24px; border-bottom: 1px solid #e9ecef; background-color: #f8f9fa; border-top-left-radius: 12px; border-top-right-radius: 12px;">
                <h2 style="margin: 0; font-size: 18px; font-weight: 600; color: #333;">Display Selection</h2>
                <p style="margin: 8px 0 0 0; font-size: 14px; color: #666;">Select which display to use for the order display application</p>
              </div>
              <div style="padding: 24px;">
                <div id="displayList" style="min-height: 200px; max-height: 300px; overflow-y: auto; border: 1px solid #e9ecef; border-radius: 8px;"></div>
              </div>
              <div style="padding: 16px 24px; text-align: right; border-top: 1px solid #e9ecef; background-color: #f8f9fa; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px;">
                <button id="cancelDisplaySelect" style="background: #6c757d; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-size: 14px;">Cancel</button>
                <button id="applyDisplayBtn" disabled style="background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; margin-left: 10px; font-size: 14px;">Apply & Restart</button>
              </div>
            </div>
          \`;
          
          document.body.appendChild(modal);
          
          const displayList = document.getElementById('displayList');
          const applyBtn = document.getElementById('applyDisplayBtn');
          const cancelBtn = document.getElementById('cancelDisplaySelect');
          let selectedDisplayIndex = null;
          
          // Populate display list
          displayList.innerHTML = displays.map((display, index) => \`
            <div class="display-item" data-index="\${display.index}" style="padding: 16px; border-bottom: 1px solid #f1f3f4; cursor: pointer; transition: background-color 0.2s;">
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <div style="font-weight: 500; color: #333;">\${display.label}</div>
                  <div style="font-size: 12px; color: #6c757d; margin-top: 4px;">
                    Position: (\${display.bounds.x}, \${display.bounds.y}) | 
                    Scale: \${display.scaleFactor}x | 
                    \${display.primary ? 'Primary' : 'Secondary'}
                  </div>
                </div>
                \${display.index === currentDisplay ? '<span style="color: #28a745; font-weight: 600;">✓ Current</span>' : ''}
              </div>
            </div>
          \`).join('');
          
          // Add click handlers
          document.querySelectorAll('.display-item').forEach(item => {
            item.addEventListener('click', () => {
              document.querySelectorAll('.display-item').forEach(i => i.style.background = 'transparent');
              item.style.background = '#e3f2fd';
              selectedDisplayIndex = parseInt(item.dataset.index);
              applyBtn.disabled = false;
            });
          });
          
          // Select current display by default
          const currentItem = document.querySelector(\`[data-index="\${currentDisplay}"]\`);
          if (currentItem) {
            currentItem.style.background = '#e3f2fd';
            selectedDisplayIndex = currentDisplay;
            applyBtn.disabled = false;
          }
          
          // Add button handlers
          applyBtn.addEventListener('click', async () => {
            if (selectedDisplayIndex !== null) {
              try {
                console.log('Setting display to:', selectedDisplayIndex);
                const result = await window.electronAPI.setDisplay(selectedDisplayIndex);
                console.log('setDisplay result:', result);
                if (result.success) {
                  displayList.innerHTML = '<div style="padding: 40px; text-align: center; color: #28a745;">✓ ' + result.message + '</div>';
                  setTimeout(() => {
                    document.body.removeChild(modal);
                  }, 2000);
                } else {
                  displayList.innerHTML = '<div style="padding: 20px; color: red;">Error: ' + result.error + '</div>';
                }
              } catch (error) {
                console.error('Error setting display:', error);
                displayList.innerHTML = '<div style="padding: 20px; color: red;">Error: ' + error.message + '</div>';
              }
            }
          });
          
          cancelBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
          });
          
          // Close on outside click
          modal.addEventListener('click', (event) => {
            if (event.target === modal) {
              document.body.removeChild(modal);
            }
          });
          
        } catch (error) {
          console.error('Error showing display selector:', error);
          alert('Error showing display selector: ' + error.message);
        }
      }
    `);
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    saveWindowState();
    mainWindow = null;
    // Clear intervals when window is closed
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
  });

  // Save window state periodically
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      saveWindowState();
    }
  }, 30000); // Save every 30 seconds

  // Handle window focus events
  mainWindow.on('focus', () => {
    console.log('Window focused');
    lastActivityTime = Date.now();
  });

  mainWindow.on('blur', () => {
    console.log('Window blurred');
  });

  // Handle window show/hide events
  mainWindow.on('show', () => {
    console.log('Window shown');
    lastActivityTime = Date.now();
  });

  mainWindow.on('hide', () => {
    console.log('Window hidden');
  });

  // Prevent new window creation (block popups)
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // Handle navigation to external sites
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.hostname !== 'core.placcon.com') {
      event.preventDefault();
      // Optionally open in default browser
      require('electron').shell.openExternal(navigationUrl);
    }
  });

  // Handle new window requests
  mainWindow.webContents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.hostname !== 'core.placcon.com') {
      require('electron').shell.openExternal(navigationUrl);
    }
  });

  // Handle uncaught exceptions in renderer process
  mainWindow.webContents.on('crashed', (event) => {
    console.error('Renderer process crashed:', event);
    // Attempt recovery instead of just reloading
    attemptRecovery();
  });

  // Handle renderer process killed
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Page failed to load:', errorCode, errorDescription);
    // Attempt recovery for failed loads
    setTimeout(() => {
      if (isRecovering) return;
      attemptRecovery();
    }, 5000);
  });

  // Handle renderer process unresponsive
  mainWindow.webContents.on('unresponsive', () => {
    console.error('Renderer process became unresponsive');
    attemptRecovery();
  });

  // Handle unresponsive renderer
  mainWindow.on('unresponsive', () => {
    console.warn('Window became unresponsive');
  });

  // Handle responsive renderer
  mainWindow.on('responsive', () => {
    console.log('Window became responsive');
    lastActivityTime = Date.now();
  });

  // Start keep-alive system
  startKeepAliveSystem();
  
  // Start recovery monitoring
  startRecoveryMonitoring();
}

// Keep-alive system to prevent white screen issues
function startKeepAliveSystem() {
  // Clear any existing interval
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
  }

  keepAliveInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    try {
      // Update activity time
      lastActivityTime = Date.now();
      
      // Send keep-alive ping to renderer
      mainWindow.webContents.executeJavaScript(`
        // Keep-alive ping
        if (window.electronAPI && window.electronAPI.keepAlive) {
          window.electronAPI.keepAlive();
        }
        
        // Check if page is responsive
        if (document.readyState === 'complete') {
          // Page is loaded and responsive
          console.log('Keep-alive: Page is responsive');
        } else {
          console.log('Keep-alive: Page state:', document.readyState);
        }
        
        // Memory management - clear any unnecessary data
        if (window.performance && window.performance.memory) {
          const memory = window.performance.memory;
          if (memory.usedJSHeapSize > 100 * 1024 * 1024) { // 100MB
            console.log('High memory usage detected:', Math.round(memory.usedJSHeapSize / 1024 / 1024) + 'MB');
          }
        }
      `).catch(error => {
        console.warn('Keep-alive ping failed:', error.message);
      });
      
    } catch (error) {
      console.warn('Keep-alive error:', error.message);
    }
  }, KEEP_ALIVE_INTERVAL);

  console.log('Keep-alive system started');
  
  // Monitor process memory usage
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const memUsageMB = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024)
    };
    
    console.log('Memory usage:', memUsageMB);
    
    // If memory usage is too high, trigger garbage collection
    if (memUsageMB.heapUsed > 200) { // 200MB
      console.warn('High memory usage detected, triggering garbage collection');
      if (global.gc) {
        global.gc();
      }
    }
  }, 60000); // Check every minute
}

// Recovery monitoring system
function startRecoveryMonitoring() {
  setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed() || isRecovering) {
      return;
    }

    try {
      // Check if window is responsive
      if (mainWindow.isDestroyed()) {
        console.log('Window destroyed, attempting recovery...');
        attemptRecovery();
        return;
      }

      // Check for white screen or unresponsive state
      mainWindow.webContents.executeJavaScript(`
        // Check if page is in a bad state
        const isWhiteScreen = document.body && 
          (document.body.innerHTML.trim() === '' || 
           document.body.style.backgroundColor === 'white' ||
           document.body.style.backgroundColor === '#ffffff');
        
        const isUnresponsive = !document.querySelector('body') || 
          document.readyState !== 'complete';
        
        // Check for network connectivity issues
        const hasNetworkError = document.querySelector('.error-message, .network-error, .offline-indicator') !== null;
        
        // Check if page is stuck loading
        const isStuckLoading = document.readyState === 'loading' && 
          (Date.now() - window.pageLoadStartTime) > 30000; // 30 seconds
        
        // Check for specific Placcon error states
        const hasPlacconError = document.querySelector('.error-container, .loading-error, .connection-error') !== null;
        
        // Check if we're on the correct domain
        const isCorrectDomain = window.location.hostname === 'core.placcon.com';
        
        { 
          isWhiteScreen, 
          isUnresponsive, 
          readyState: document.readyState,
          hasNetworkError,
          isStuckLoading,
          hasPlacconError,
          isCorrectDomain,
          url: window.location.href
        }
      `).then(result => {
        if (result && (result.isWhiteScreen || result.isUnresponsive || result.hasNetworkError || result.isStuckLoading || result.hasPlacconError || !result.isCorrectDomain)) {
          console.log('Detected problematic state:', result);
          attemptRecovery();
        }
      }).catch(error => {
        console.warn('Recovery check failed:', error.message);
        // If we can't even execute JavaScript, the window might be in a bad state
        attemptRecovery();
      });

    } catch (error) {
      console.warn('Recovery monitoring error:', error.message);
    }
  }, RECOVERY_CHECK_INTERVAL);

  console.log('Recovery monitoring started');
}

// Attempt to recover from white screen or unresponsive state
function attemptRecovery() {
  if (isRecovering) {
    return; // Already recovering
  }

  isRecovering = true;
  console.log('Attempting to recover from white screen...');

  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // First try to reload the page
      console.log('Attempting page reload...');
      mainWindow.reload();
      
      // If reload doesn't work after 15 seconds, recreate the window
      setTimeout(() => {
        if (isRecovering) {
          console.log('Reload failed, recreating window...');
          recreateWindow();
        }
      }, 15000);
      
      // Additional check after 5 seconds to see if reload worked
      setTimeout(() => {
        if (isRecovering && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.executeJavaScript(`
            document.readyState === 'complete' && 
            document.body && 
            document.body.innerHTML.trim() !== ''
          `).then(isHealthy => {
            if (isHealthy) {
              console.log('Recovery successful via reload');
              isRecovering = false;
            }
          }).catch(() => {
            // If we can't check, assume recovery failed
          });
        }
      }, 5000);
      
    } else {
      recreateWindow();
    }
  } catch (error) {
    console.error('Recovery attempt failed:', error.message);
    recreateWindow();
  }
}

// Recreate the window completely
function recreateWindow() {
  console.log('Recreating window...');
  
  try {
    // Save current state before destroying
    saveWindowState();
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.destroy();
    }
    
    // Clear intervals
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
    
    // Create new window after a short delay
    setTimeout(() => {
      try {
        createWindow();
        console.log('Window recreation completed');
      } catch (error) {
        console.error('Failed to create new window:', error.message);
      } finally {
        isRecovering = false;
      }
    }, 3000);
    
  } catch (error) {
    console.error('Failed to recreate window:', error.message);
    isRecovering = false;
  }
}

// Configure session for persistent storage
function configureSession() {
  // Enable persistent storage
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    // Add any custom headers if needed
    callback({ requestHeaders: details.requestHeaders });
  });
  
  // Configure session for better stability
  session.defaultSession.setPreloads([]);
  
  // Set session permissions
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['notifications', 'media'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });
  
  // Clear session data periodically to prevent memory issues
  setInterval(() => {
    try {
      session.defaultSession.clearStorageData({
        storages: ['appcache', 'filesystem', 'indexdb', 'localstorage', 'shadercache', 'websql', 'serviceworkers', 'cachestorage']
      }).then(() => {
        console.log('Session storage cleared');
      }).catch(error => {
        console.warn('Failed to clear session storage:', error.message);
      });
    } catch (error) {
      console.warn('Session storage clear error:', error.message);
    }
  }, 300000); // Clear every 5 minutes
  
  console.log('Session configured for stability');
}

// Get available displays (IPC handler)
ipcMain.handle('get-displays', async () => {
  try {
    const displays = getAvailableDisplays();
    const settings = loadDisplaySettings();
    return { success: true, displays, currentDisplay: settings.displayIndex };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Set display preference (IPC handler)
ipcMain.handle('set-display', async (event, displayIndex) => {
  try {
    const displays = getAvailableDisplays();
    if (displayIndex >= 0 && displayIndex < displays.length) {
      const settings = { displayIndex };
      saveDisplaySettings(settings);
      
      // Restart the app to apply the new display setting
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 1000);
      
      return { success: true, message: 'Display setting saved. Application will restart.' };
    } else {
      return { success: false, error: 'Invalid display index' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// App event handlers
app.whenReady().then(() => {
  // Enable garbage collection if available
  if (process.argv.includes('--expose-gc')) {
    console.log('Garbage collection enabled');
  }
  
  configureSession();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
  
  // Prevent system sleep
  if (process.platform === 'darwin') {
    // macOS: Use powerSaveBlocker
    const { powerSaveBlocker } = require('electron');
    const id = powerSaveBlocker.start('prevent-display-sleep');
    console.log('Power save blocker started:', id);
  } else if (process.platform === 'win32') {
    // Windows: Use powerSaveBlocker
    const { powerSaveBlocker } = require('electron');
    const id = powerSaveBlocker.start('prevent-display-sleep');
    console.log('Power save blocker started:', id);
  }
});

app.on('window-all-closed', () => {
  // Clear all intervals
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle app before-quit
app.on('before-quit', () => {
  // Save window state
  saveWindowState();
  
  // Clear all intervals
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
});

// Handle process errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit, try to recover
  if (mainWindow && !mainWindow.isDestroyed()) {
    attemptRecovery();
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit, try to recover
  if (mainWindow && !mainWindow.isDestroyed()) {
    attemptRecovery();
  }
});

// Security: Prevent navigation to file:// URLs
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    if (parsedUrl.protocol === 'file:') {
      event.preventDefault();
    }
  });
});

// Handle app activation (macOS)
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
}); 