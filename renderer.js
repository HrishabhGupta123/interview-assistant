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

  function setStatus(state, label) {
    if (statusDot)   statusDot.className    = 'status-dot ' + (state || '');
    if (statusLabel) statusLabel.textContent = label || 'Ready';
  }

  function sendToGemini() {
    const text = searchInput ? searchInput.value.trim() : '';
    if (!text) return;
    setStatus('sending', 'Sending...');
    searchSend && searchSend.classList.add('sending');
    window.electronAPI.sendToGemini(text);
    if (searchInput) searchInput.value = '';
    setTimeout(() => {
      setStatus('', 'Ready');
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

        // Trigger Gemini mic
        window.electronAPI.toggleGeminiMic();

        // Check actual microphone decibels every 100ms
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

  function stopRealVoiceVad(shouldSend = false) {
    isRecording   = false;
    speechStarted = false;
    silenceMillis = 0;

    if (vadInterval) { clearInterval(vadInterval); vadInterval = null; }
    if (audioCtx)    { try { audioCtx.close(); } catch(e){} audioCtx = null; }
    if (micStream)   { micStream.getTracks().forEach(t => t.stop()); micStream = null; }

    micBtn && micBtn.classList.remove('recording');

    if (shouldSend) {
      setStatus('sending', 'Sending prompt to Gemini…');
      window.electronAPI.toggleGeminiMic(); // stops Gemini mic & clicks send
      setTimeout(() => setStatus('', 'Ready'), 2500);
    } else {
      setStatus('', 'Ready');
      window.electronAPI.toggleGeminiMic(); // stops Gemini mic without send
    }
  }

  function toggleMic() {
    if (isRecording) {
      stopRealVoiceVad(true); // manually clicking mic stops & sends immediately
    } else {
      startRealVoiceVad();
    }
  }

  micBtn && micBtn.addEventListener('click', toggleMic);
  window.electronAPI.onToggleMic && window.electronAPI.onToggleMic(toggleMic);

  // ── Window controls ───────────────────────────────────────────────────────
  btnClose    && btnClose.addEventListener('click',    () => window.electronAPI.closeApp());
  btnMinimize && btnMinimize.addEventListener('click', () => window.electronAPI.minimizeApp());

  // ── Click-through toggle ──────────────────────────────────────────────────
  let clickThrough = false;
  btnClickThru && btnClickThru.addEventListener('click', () => window.electronAPI.toggleClickThrough());
  window.electronAPI.onClickThroughChanged((isOn) => {
    clickThrough = isOn;
    btnClickThru && btnClickThru.classList.toggle('active', clickThrough);
    setStatus(clickThrough ? 'sending' : '', clickThrough ? 'Click-through ON' : 'Ready');
  });

  const headerEl = document.getElementById('drag-region');
  const footerEl = document.querySelector('.footer');
  [headerEl, footerEl].forEach(el => {
    if (!el) return;
    el.addEventListener('mouseenter', () => { if (clickThrough) window.electronAPI.setIgnoreMouseEvents(false); });
    el.addEventListener('mouseleave', () => { if (clickThrough) window.electronAPI.setIgnoreMouseEvents(true, { forward: true }); });
  });

  // ── Stealth toggle ────────────────────────────────────────────────────────
  let stealthOn = true;
  btnStealth && btnStealth.classList.toggle('active', stealthOn);
  btnStealth && btnStealth.addEventListener('click', () => window.electronAPI.toggleStealth());
  window.electronAPI.onStealthChanged((isOn) => {
    stealthOn = isOn;
    btnStealth && btnStealth.classList.toggle('active', stealthOn);
    setStatus(stealthOn ? '' : 'error', stealthOn ? 'Stealth ON' : 'Stealth OFF');
  });

  // ── Opacity slider ────────────────────────────────────────────────────────
  opacitySlider && opacitySlider.addEventListener('input', () => {
    window.electronAPI.setOpacity(parseFloat(opacitySlider.value) / 100);
  });

})();
