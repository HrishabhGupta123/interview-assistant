const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendToGemini: (text) => ipcRenderer.send('send-to-gemini', text),
  closeApp:     ()     => ipcRenderer.send('close-app'),
  minimizeApp:  ()     => ipcRenderer.send('minimize-app'),
  maximizeApp:  ()     => ipcRenderer.send('maximize-app'),
  setOpacity:   (v)   => ipcRenderer.send('set-opacity', v),

  toggleClickThrough:   () => ipcRenderer.send('toggle-click-through'),
  toggleStealth:        () => ipcRenderer.send('toggle-stealth'),
  reloadGemini:         () => ipcRenderer.send('reload-gemini'),
  clearAllData:         () => ipcRenderer.send('clear-all-data'),
  showConfirmModal:     () => ipcRenderer.send('show-confirm-modal'),
  hideConfirmModal:     () => ipcRenderer.send('hide-confirm-modal'),
  dragWindow:           (deltaX, deltaY) => ipcRenderer.send('drag-window', { deltaX, deltaY }),
  setIgnoreMouseEvents: (ignore, forward) => ipcRenderer.send('set-ignore-mouse-events', ignore, forward),


  
  toggleGeminiMic:      () => ipcRenderer.send('toggle-gemini-mic'),

  onToggleMic:          (cb) => ipcRenderer.on('toggle-mic',           (_e)      => cb()),
  onMicStarted:         (cb) => ipcRenderer.on('mic-started',          (_e)      => cb()),
  onMicStopped:         (cb) => ipcRenderer.on('mic-stopped',          (_e)      => cb()),
  onMicError:           (cb) => ipcRenderer.on('mic-error',            (_e, err) => cb(err)),
  onStealthChanged:     (cb) => ipcRenderer.on('stealth-changed',      (_e, val) => cb(val)),
  onClickThroughChanged:(cb) => ipcRenderer.on('click-through-changed',(_e, val) => cb(val)),
  onMaximizedChanged:   (cb) => ipcRenderer.on('maximized-changed',    (_e, val) => cb(val)),
  onDataCleared:        (cb) => ipcRenderer.on('data-cleared',        (_e)      => cb()),
});


