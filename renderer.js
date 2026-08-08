// renderer.js — Real Voice Volume Detection (VAD) via WebAudio Analyser

(function () {
  'use strict';

  const statusDot     = document.getElementById('status-dot');
  const statusLabel   = document.getElementById('status-label');
  const opacitySlider = document.getElementById('opacity-slider');
  const btnClose      = document.getElementById('btn-close');
  const btnMinimize   = document.getElementById('btn-minimize');
  const btnClickThru  = document.getElementById('btn-click-through');
  const btnStealth    = document.getElementById('btn-stealth');
  const geminiLoading = document.getElementById('gemini-loading');
  const searchInput   = document.getElementById('search-input');
  const searchSend    = document.getElementById('search-send');
  const micBtn        = document.getElementById('mic-btn');

  setTimeout(() => { if (geminiLoading) geminiLoading.style.display = 'none'; }, 5000);

  let statusTimer = null;

  function setStatus(state, label, duration = 2000) {
    if (statusDot)   statusDot.className    = 'status-dot ' + (state || '');
    if (statusLabel) statusLabel.textContent = label || 'Ready';

    if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }

    if (duration > 0 && label && label !== 'Ready') {
      statusTimer = setTimeout(() => {
        if (statusDot)   statusDot.className    = 'status-dot';
        if (statusLabel) statusLabel.textContent = 'Ready';
      }, duration);
    }
  }


  function sendToGemini() {
    const text = searchInput ? searchInput.value.trim() : '';
    if (!text) return;
    setStatus('sending', 'Sending...');
    searchSend && searchSend.classList.add('sending');
    window.electronAPI.sendToGemini(text);
    if (searchInput) searchInput.value = '';
    setTimeout(() => {
      if (micBtn && micBtn.style.opacity === '0.5') {
        setStatus('web-mic', 'Unavailable', 0); // Keep Red Dot + Unavailable while mic is blurred!
      } else {
        setStatus('', 'Ready');
      }
      searchSend && searchSend.classList.remove('sending');
    }, 1500);
  }




  searchInput && searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); sendToGemini(); }
  });
  searchSend && searchSend.addEventListener('click', sendToGemini);

  // ── REAL VOICE VOLUME DETECTION (WebAudio Analyser) ──────────────────────
  let audioCtx      = null;
  let analyser      = null;
  let micStream     = null;
  let vadInterval   = null;
  let isRecording   = false;
  let speechStarted = false;
  let silenceMillis = 0;

  function startRealVoiceVad() {
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then((stream) => {
        micStream = stream;
        audioCtx  = new (window.AudioContext || window.webkitAudioContext)();
        analyser  = audioCtx.createAnalyser();
        analyser.fftSize = 512;

        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        isRecording   = true;
        speechStarted = false;
        silenceMillis = 0;

        micBtn && micBtn.classList.add('recording');
        setStatus('listening', 'Listening to your voice…');

        // Trigger Gemini native mic
        window.electronAPI.toggleGeminiMic();

        // Check actual microphone volume every 100ms
        vadInterval = setInterval(() => {
          if (!isRecording) return;

          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const averageVolume = sum / dataArray.length; // 0 to 255

          // Volume > 35 means user is actively speaking!
          if (averageVolume > 35) {
            speechStarted = true;
            silenceMillis = 0; // reset silence counter
            setStatus('listening', 'Speaking… (' + Math.round(averageVolume) + ' dB)');
          } else if (speechStarted) {
            // User WAS speaking, but audio dropped below 35 dB
            silenceMillis += 100;
            const remainingSecs = Math.max(0, ((2000 - silenceMillis) / 1000).toFixed(1));
            setStatus('listening', 'Silence detected (<35 dB)… Sending in ' + remainingSecs + 's');

            // 2.0 seconds of continuous silence below 35 dB -> STOP & SEND!
            if (silenceMillis >= 2000) {
              stopRealVoiceVad(true); // true = send to Gemini
            }
          }
        }, 100);
      })
      .catch((err) => {
        console.error('[VAD Mic Error]', err);
        setStatus('error', 'Mic Access Denied');
        setTimeout(() => setStatus('', 'Ready'), 3000);
      });
  }

  function pauseAppVad() {
    isRecording   = false;
    speechStarted = false;
    silenceMillis = 0;
    if (vadInterval) { clearInterval(vadInterval); vadInterval = null; }
    if (audioCtx)    { try { audioCtx.close(); } catch(e){} audioCtx = null; }
    if (micStream)   { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
    micBtn && micBtn.classList.remove('recording');
  }

  function stopRealVoiceVad(shouldSend = false) {
    pauseAppVad();

    if (shouldSend) {
      setStatus('sending', 'Sending...');
      window.electronAPI.toggleGeminiMic(); // stops Gemini mic & clicks send
      setTimeout(() => {
        if (micBtn) {
          micBtn.style.pointerEvents = '';
          micBtn.style.opacity = '1';
        }
        setStatus('', 'Ready');
      }, 2500);
    } else {
      setStatus('', 'Ready');
    }
  }


  let isAppMicTriggered = false;

  function toggleMic() {
    if (isRecording) {
      isAppMicTriggered = false;
      stopRealVoiceVad(true); // manually clicking mic stops & sends immediately
    } else {
      isAppMicTriggered = true;
      startRealVoiceVad();
    }
  }

  micBtn && micBtn.addEventListener('click', toggleMic);
  window.electronAPI.onToggleMic && window.electronAPI.onToggleMic(toggleMic);

  // Detect Web Mic / Response Active -> 🔴 Red Dot + Unavailable + Blur Controls
  window.electronAPI.onMicStarted && window.electronAPI.onMicStarted(() => {
    if (isAppMicTriggered) return; // Keep App Mic VAD active!
    if (isRecording) pauseAppVad();
    setStatus('web-mic', 'Unavailable', 0); // 🔴 Red Dot + Unavailable ALWAYS when blurred!
    [micBtn, searchSend].forEach(el => {
      if (el) {
        el.style.pointerEvents = 'none';
        el.style.opacity = '0.5';
      }
    });
    if (searchInput) searchInput.disabled = true;
  });


  window.electronAPI.onMicStopped && window.electronAPI.onMicStopped(() => {
    isAppMicTriggered = false;
    [micBtn, searchSend].forEach(el => {
      if (el) {
        el.style.pointerEvents = '';
        el.style.opacity = '1';
      }
    });
    if (searchInput) searchInput.disabled = false;
    setStatus('', 'Ready'); // 🟢 Green Dot + Ready label
  });











  const btnReload = document.getElementById('btn-reload');
  btnReload && btnReload.addEventListener('click', () => {
    setStatus('sending', 'Reloading Gemini...');
    window.electronAPI.reloadGemini && window.electronAPI.reloadGemini();
  });

  const btnClearData  = document.getElementById('btn-clear-data');
  const confirmModal  = document.getElementById('confirm-modal');
  const modalCancel   = document.getElementById('modal-cancel');
  const modalConfirm  = document.getElementById('modal-confirm');

  btnClearData && btnClearData.addEventListener('click', () => {
    if (confirmModal) confirmModal.classList.add('active');
    window.electronAPI.showConfirmModal && window.electronAPI.showConfirmModal();
  });

  modalCancel && modalCancel.addEventListener('click', () => {
    if (confirmModal) confirmModal.classList.remove('active');
    window.electronAPI.hideConfirmModal && window.electronAPI.hideConfirmModal();
  });

  modalConfirm && modalConfirm.addEventListener('click', () => {
    if (confirmModal) confirmModal.classList.remove('active');
    setStatus('sending', 'Clearing Data...');
    window.electronAPI.clearAllData && window.electronAPI.clearAllData();
  });

  window.electronAPI.onDataCleared && window.electronAPI.onDataCleared(() => {
    setStatus('sending', 'Data Cleared');
    setTimeout(() => setStatus('', 'Ready'), 2000);
  });





  // ── Window controls ───────────────────────────────────────────────────────
  const btnMaximize = document.getElementById('btn-maximize');
  btnClose    && btnClose.addEventListener('click',    () => window.electronAPI.closeApp());
  btnMinimize && btnMinimize.addEventListener('click', () => window.electronAPI.minimizeApp());
  btnMaximize && btnMaximize.addEventListener('click', () => window.electronAPI.maximizeApp && window.electronAPI.maximizeApp());

  window.electronAPI.onMaximizedChanged && window.electronAPI.onMaximizedChanged((isMaximized) => {
    if (btnMaximize) {
      btnMaximize.title = isMaximized ? 'Restore' : 'Maximize';
      btnMaximize.innerHTML = isMaximized
        ? '<svg viewBox="0 0 24 24"><path d="M4 8h4V4h12v12h-4v4H4V8zm6 8h8V6H10v10z"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M4 4h16v16H4V4zm2 4v10h12V8H6z"/></svg>';
    }
  });






  // Disable tooltips on non-interactive elements when Click-Through is ON
  function updateTooltipsForClickThrough(isClickThroughOn) {
    const interactiveSet = new Set([btnClickThru, micBtn, btnClose]);
    document.querySelectorAll('[title], [data-orig-title]').forEach(el => {
      if (!interactiveSet.has(el)) {
        if (isClickThroughOn) {
          if (el.title) {
            el.dataset.origTitle = el.title;
            el.removeAttribute('title');
          }
        } else {
          if (el.dataset.origTitle) {
            el.title = el.dataset.origTitle;
            delete el.dataset.origTitle;
          }
        }
      }
    });
  }

  // ── Click-through toggle ──────────────────────────────────────────────────
  let clickThrough = false;
  btnClickThru && btnClickThru.addEventListener('click', () => window.electronAPI.toggleClickThrough());
  window.electronAPI.onClickThroughChanged((isOn) => {
    clickThrough = isOn;
    btnClickThru && btnClickThru.classList.toggle('active', clickThrough);
    setStatus('sending', clickThrough ? 'Click-through ON' : 'Click-through OFF');
    updateTooltipsForClickThrough(clickThrough);
  });

  // ONLY Click-Through, Mic, and Close buttons stay interactive when Click-Through is ON
  const interactiveBtns = [btnClickThru, micBtn, btnClose].filter(Boolean);
  interactiveBtns.forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      if (clickThrough) window.electronAPI.setIgnoreMouseEvents(false);
    });
    btn.addEventListener('mouseleave', () => {
      if (clickThrough) window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
    });
  });






  // ── Stealth toggle ────────────────────────────────────────────────────────
  let stealthOn = false;
  btnStealth && btnStealth.classList.toggle('active', stealthOn);
  btnStealth && btnStealth.addEventListener('click', () => window.electronAPI.toggleStealth());

  window.electronAPI.onStealthChanged((isOn) => {
    stealthOn = isOn;
    btnStealth && btnStealth.classList.toggle('active', stealthOn);
    setStatus('sending', stealthOn ? 'Stealth ON' : 'Stealth OFF'); // 🟣 Purple Dot
    setTimeout(() => setStatus('', 'Ready'), 2000);
  });


  // ── Opacity slider ────────────────────────────────────────────────────────
  opacitySlider && opacitySlider.addEventListener('input', () => {
    window.electronAPI.setOpacity(parseFloat(opacitySlider.value) / 100);
  });

  // ── Clear All Data Confirmation Modal ──────────────────────────────────────
  const btnClearData = document.getElementById('btn-clear-data');
  const confirmModal = document.getElementById('confirm-modal');
  const modalCancel  = document.getElementById('modal-cancel');
  const modalConfirm = document.getElementById('modal-confirm');

  if (btnClearData && confirmModal) {
    btnClearData.addEventListener('click', () => {
      confirmModal.classList.add('active');
      window.electronAPI.showConfirmModal(); // Hides BrowserView so modal shows above!
    });

    const closeModal = () => {
      confirmModal.classList.remove('active');
      window.electronAPI.hideConfirmModal(); // Restores BrowserView!
    };


    modalCancel && modalCancel.addEventListener('click', closeModal);

    modalConfirm && modalConfirm.addEventListener('click', () => {
      closeModal();
      setStatus('sending', 'Clearing data…');
      window.electronAPI.clearAllData();
    });
  }

  window.electronAPI.onDataCleared && window.electronAPI.onDataCleared(() => {
    setStatus('', 'Data Cleared!');
    setTimeout(() => setStatus('', 'Ready'), 2500);
  });

})();

