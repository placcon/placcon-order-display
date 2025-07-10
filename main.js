const { app, BrowserWindow, session, ipcMain, screen, powerSaveBlocker, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a global reference of the window object
let mainWindow;
let autoReloadInterval;
let lastWelcomeCheck = Date.now();

// Settings file path
const settingsPath = path.join(app.getPath('userData'), 'display-settings.json');



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

// Helper function to check if a URL is allowed
function isAllowedUrl(url) {
  const allowedHosts = [
    'core.placcon.com',
    'placcon.com',
    'www.placcon.com',
    'localhost',
    '127.0.0.1'
  ];
  
  try {
    const parsedUrl = new URL(url);
    return allowedHosts.some(host => 
      parsedUrl.hostname === host || 
      parsedUrl.hostname.endsWith('.' + host) ||
      host.endsWith('.' + parsedUrl.hostname)
    );
  } catch (error) {
    console.warn('Invalid URL:', url);
    return false;
  }
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
      preload: path.join(__dirname, 'preload.js'),
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
  


  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Inject display selector code after page loads
  mainWindow.webContents.on('did-finish-load', () => {
    
          
    
            // Inject the display selector code
  mainWindow.webContents.executeJavaScript(`
    
    // Add keyboard shortcut only
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey && event.shiftKey && event.key === 'D') {
        event.preventDefault();
        showDisplaySelector();
      }
    });
    
    // Function to check if we're on welcome screen
    function isOnWelcomeScreen() {
      try {
        const welcomeIndicators = [
          document.querySelector('.welcome'),
          document.querySelector('.welcome-screen'),
          document.querySelector('[data-welcome]'),
          document.querySelector('.login-form'),
          document.querySelector('.auth-form'),
          document.querySelector('.signin-form'),
          document.querySelector('.login-container'),
          document.querySelector('.auth-container'),
          document.querySelector('.welcome-container'),
          document.querySelector('.welcome-message'),
          document.querySelector('.login-message')
        ];
        const url = window.location.href;
        const welcomeUrlPatterns = [
          '/welcome', '/login', '/auth', '/signin', '/sign-in', '/log-in', '/', '/index', '/home'
        ];
        const hasWelcomeIndicator = welcomeIndicators.some(indicator => indicator !== null);
        const hasWelcomeUrl = welcomeUrlPatterns.some(pattern => url.includes(pattern));
        const isOnMainDomain = url === 'https://core.placcon.com' || 
                              url === 'https://core.placcon.com/' ||
                              (url.includes('core.placcon.com') && !url.replace('https://core.placcon.com', '').replace('http://core.placcon.com', '').replace('core.placcon.com', '').replace(/^\//, ''));
        return hasWelcomeIndicator || hasWelcomeUrl || isOnMainDomain;
      } catch (e) {
        console.warn('isOnWelcomeScreen error:', e);
        return false;
      }
    }
    window.isOnWelcomeScreen = isOnWelcomeScreen;
      
      // Display selector function
      async function showDisplaySelector() {
        
        try {
          // Get displays using IPC
          const result = await window.electronAPI.getDisplays();
          
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
    mainWindow = null;
    // Clear auto-reload interval
    if (autoReloadInterval) {
      clearInterval(autoReloadInterval);
      autoReloadInterval = null;
    }
  });



  // Prevent new window creation (block popups)
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  // Handle navigation to external sites
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isAllowedUrl(navigationUrl)) {
      event.preventDefault();
      // Optionally open in default browser
      shell.openExternal(navigationUrl);
    } else {
      console.log('Allowing navigation to:', navigationUrl);
    }
  });

  // Handle new window requests
  mainWindow.webContents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    
    if (!isAllowedUrl(navigationUrl)) {
      shell.openExternal(navigationUrl);
    } else {
      console.log('Allowing new window to:', navigationUrl);
      // Load in the same window instead of opening new one
      mainWindow.loadURL(navigationUrl);
    }
  });

  // Handle form submission redirects
  mainWindow.webContents.on('will-redirect', (event, navigationUrl) => {
    if (!isAllowedUrl(navigationUrl)) {
      event.preventDefault();
      console.log('Blocking redirect to external site:', navigationUrl);
    } else {
      console.log('Allowing redirect to:', navigationUrl);
    }
  });

  // Handle uncaught exceptions in renderer process
  mainWindow.webContents.on('crashed', (event) => {
    console.error('Renderer process crashed:', event);
    // Just reload the page
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.reload();
    }
  });

  // Handle renderer process killed
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Page failed to load:', errorCode, errorDescription);
    // Just reload the page after a delay
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.reload();
      }
    }, 5000);
  });

  // Handle renderer process unresponsive
  mainWindow.webContents.on('unresponsive', () => {
    console.error('Renderer process became unresponsive');
    // Just reload the page
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.reload();
    }
  });

  // Start auto-reload system (2 hours)
  startAutoReloadSystem();
}

function startAutoReloadSystem() {
  let reloadDue = false;
  let lastReload = Date.now();
  const RELOAD_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours

  if (autoReloadInterval) {
    clearInterval(autoReloadInterval);
  }

  autoReloadInterval = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const now = Date.now();
    if (now - lastReload < RELOAD_INTERVAL) return;

    mainWindow.webContents.executeJavaScript('window.isOnWelcomeScreen && window.isOnWelcomeScreen()')
      .then(isWelcome => {
        if (isWelcome) {
          console.log('[AutoReload] 2 óra eltelt, welcome képernyőn vagyunk, reload...');
          lastReload = Date.now();
          mainWindow.reload();
        } else {
          // Jelöljük, hogy esedékes a reload, de csak akkor hajtjuk végre, ha welcome képernyőre érünk
          reloadDue = true;
        }
      })
      .catch(() => {});
  }, 60 * 1000); // Ellenőrzés percenként

  // Figyeljük, mikor érünk welcome képernyőre, ha esedékes a reload
  mainWindow.webContents.on('did-navigate', () => {
    if (!reloadDue) return;
    mainWindow.webContents.executeJavaScript('window.isOnWelcomeScreen && window.isOnWelcomeScreen()')
      .then(isWelcome => {
        if (isWelcome) {
          console.log('[AutoReload] Esedékes reload, most welcome képernyőn vagyunk, reload...');
          reloadDue = false;
          lastReload = Date.now();
          mainWindow.reload();
        }
      })
      .catch(() => {});
  });
}


// Configure session for persistent storage
function configureSession() {
  // Enable persistent storage
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    // Add any custom headers if needed
    callback({ requestHeaders: details.requestHeaders });
  });
  
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
  configureSession();
  createWindow();

  // Prevent system sleep
  if (process.platform === 'darwin' || process.platform === 'win32') {
    const id = powerSaveBlocker.start('prevent-display-sleep');
    console.log('Power save blocker started:', id);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
}); 