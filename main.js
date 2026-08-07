const {
  app, BrowserWindow, BrowserView, globalShortcut,
  ipcMain, screen, Menu, Tray, session
} = require('electron');
const path = require('path');

let mainWindow  = null;
let geminiView  = null;
let tray        = null;

function setupPermissions(sess) {
  sess.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media' || permission === 'audioCapture') {
      callback(true);
    } else {
      callback(true);
    }
  });
  sess.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media' || permission === 'audioCapture') return true;
    return true;
  });
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const WIN_W    = 440;
  const WIN_H    = height;
  const HEADER_H = 58;
  const FOOTER_H = 72;

  setupPermissions(session.defaultSession);

  const geminiSession = session.fromPartition('persist:gemini-v2');
  setupPermissions(geminiSession);

  mainWindow = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    x: width - WIN_W,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    movable: true,
    skipTaskbar: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  geminiView = new BrowserView({
    webPreferences: {
      session: geminiSession,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setBrowserView(geminiView);

  function updateBrowserViewBounds() {
    if (!mainWindow || !geminiView) return;
    const [w, h] = mainWindow.getSize();
    geminiView.setBounds({
      x: 0,
      y: HEADER_H,
      width: w,
      height: Math.max(100, h - HEADER_H - FOOTER_H),
    });
  }

  updateBrowserViewBounds();
  mainWindow.on('resize', updateBrowserViewBounds);

  geminiView.webContents.loadURL('https://gemini.google.com');

  // Relayers for mic events from Gemini to Renderer
  geminiView.webContents.on('console-message', (_e, _level, message) => {
    if (message === '[GEMINI_MIC_STARTED]') {
      if (mainWindow) mainWindow.webContents.send('mic-started');
    } else if (message === '[GEMINI_MIC_STOPPED]') {
      if (mainWindow) mainWindow.webContents.send('mic-stopped');
    } else if (message === '[GEMINI_MIC_NOT_FOUND]') {
      if (mainWindow) mainWindow.webContents.send('mic-error', 'Gemini mic button not found');
    }
  });

  try {
    const iconPath = path.join(__dirname, 'assets', 'icon.ico');
    tray = new Tray(iconPath);
    tray.setToolTip('Interview Assistant');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Show Window', click: () => { mainWindow.show(); mainWindow.focus(); } },
      { label: 'Hide Window', click: () => mainWindow.hide() },
      { type: 'separator' },
      { label: 'Exit', click: () => app.quit() },
    ]));
  } catch (e) {
    console.warn('Tray icon creation failed:', e.message);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    geminiView = null;
  });
}

function toggleStealth() {
  if (!mainWindow) return;
  const isVisible = mainWindow.isVisible();
  if (isVisible) {
    mainWindow.hide();
    if (mainWindow.webContents) mainWindow.webContents.send('stealth-changed', false);
  } else {
    mainWindow.show();
    mainWindow.focus();
    if (mainWindow.webContents) mainWindow.webContents.send('stealth-changed', true);
  }
}

function toggleClickThrough() {
  if (!mainWindow) return;
  const currentIgnore = mainWindow.isClickThrough || false;
  const nextIgnore    = !currentIgnore;
  mainWindow.isClickThrough = nextIgnore;
  mainWindow.setIgnoreMouseEvents(nextIgnore, { forward: true });
  if (mainWindow.webContents) {
    mainWindow.webContents.send('click-through-changed', nextIgnore);
  }
}

app.whenReady().then(() => {
  createWindow();

  globalShortcut.register('Alt+X', toggleStealth);
  globalShortcut.register('Alt+C', toggleClickThrough);

  globalShortcut.register('Ctrl+Shift+M', () => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('toggle-mic');
    }
  });
});

ipcMain.on('send-to-gemini', (event, text) => {
  if (!geminiView) return;
  geminiView.webContents.executeJavaScript(`
    (function() {
      function deepQuery(selector, root = document) {
        let el = root.querySelector(selector);
        if (el) return el;
        const elements = root.querySelectorAll('*');
        for (let element of elements) {
          if (element.shadowRoot) {
            el = deepQuery(selector, element.shadowRoot);
            if (el) return el;
          }
        }
        return null;
      }

      var input = deepQuery('p[data-placeholder]') ||
                  deepQuery('div[contenteditable="true"]') ||
                  deepQuery('textarea');

      if (!input) return 'no-input';

      input.focus();
      var ok = document.execCommand('insertText', false, ${JSON.stringify(text)});
      if (!ok) {
        input.innerHTML = '<p>' + ${JSON.stringify(text)} + '</p>';
        input.dispatchEvent(new InputEvent('input', { bubbles: true, data: ${JSON.stringify(text)}, inputType: 'insertText' }));
      }

      setTimeout(function() {
        var sendBtn = deepQuery('button[aria-label*="Send" i]') ||
                      deepQuery('[aria-label*="send" i]') ||
                      deepQuery('button[jsname]');
        if (sendBtn) {
          sendBtn.click();
        } else {
          input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true
          }));
        }
      }, 400);

      return 'ok';
    })();
  `).catch(err => console.error('[Gemini inject]', err));
});

// ── Trigger Gemini Native Mic (Responds to Real VAD in renderer.js) ─────────
ipcMain.on('toggle-gemini-mic', () => {
  if (!geminiView) return;

  geminiView.webContents.executeJavaScript(`
    (function() {
      function deepQuery(selector, root = document) {
        let el = root.querySelector(selector);
        if (el) return el;
        const elements = root.querySelectorAll('*');
        for (let element of elements) {
          if (element.shadowRoot) {
            el = deepQuery(selector, element.shadowRoot);
            if (el) return el;
          }
        }
        return null;
      }

      var micBtn = deepQuery('button[aria-label*="mic" i]') ||
                   deepQuery('button[aria-label*="dictat" i]') ||
                   deepQuery('button[aria-label*="voice" i]') ||
                   deepQuery('mat-icon[data-mat-icon-name="mic"]');

      if (!micBtn) return 'not-found';

      // If active -> Stop mic and Click Send!
      if (window.__geminiMicActive) {
        window.__geminiMicActive = false;
        var stopBtn = deepQuery('button[aria-label*="stop" i]') ||
                      deepQuery('mat-icon[data-mat-icon-name="stop"]') ||
                      micBtn;
        stopBtn.click();

        setTimeout(function() {
          var sendBtn = deepQuery('button[aria-label*="Send" i]') ||
                        deepQuery('[aria-label*="send" i]');
          if (sendBtn) sendBtn.click();
        }, 400);

        return 'stopped';
      } else {
        // Start mic
        window.__geminiMicActive = true;
        micBtn.click();
        return 'started';
      }
    })();
  `).catch(e => console.error('[Mic toggle err]', e));
});






ipcMain.on('close-app',            () => mainWindow && mainWindow.close());
ipcMain.on('minimize-app',         () => mainWindow && mainWindow.minimize());
ipcMain.on('hide-app',             () => mainWindow && mainWindow.hide());
ipcMain.on('toggle-click-through', toggleClickThrough);
ipcMain.on('toggle-stealth',       toggleStealth);
ipcMain.on('set-ignore-mouse-events', (e, ignore, forward) => {
  if (mainWindow) mainWindow.setIgnoreMouseEvents(ignore, forward);
});
ipcMain.on('set-opacity',          (e, v) => mainWindow && mainWindow.setOpacity(v));

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
