'use strict';
// Webcam barcode scanner for the register, the self-checkout and the item form.
// Reads UPC/EAN, Code 128/39/93, ITF, Codabar and the modern 2D codes (QR including GS1 Digital Link, Data Matrix,
// Aztec, PDF417). Uses the browser's built-in BarcodeDetector when it has one, otherwise the bundled ZXing decoder,
// which is only downloaded the first time a camera button is pressed.
(function () {
  const POS = window.POS;
  const { h } = POS;

  const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar', 'qr_code', 'data_matrix', 'aztec', 'pdf417'];
  let zxingPromise;

  function loadZxing() {
    if (window.ZXing) return Promise.resolve(window.ZXing);
    zxingPromise = zxingPromise || new Promise((resolve, reject) => {
      const script = h('script', { src: '/vendor/zxing-library.min.js' });
      script.onload = () => resolve(window.ZXing);
      script.onerror = () => { zxingPromise = null; reject(new Error('Could not load the barcode reader')); };
      document.head.append(script);
    });
    return zxingPromise;
  }

  // Builds a function frame(canvas) -> { text, format } | null, using the best decoder this browser offers.
  async function makeDecoder() {
    if (window.BarcodeDetector) {
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const formats = NATIVE_FORMATS.filter(f => supported.includes(f));
        if (formats.includes('ean_13') && formats.includes('qr_code')) {
          const detector = new window.BarcodeDetector({ formats });
          return async source => { const found = await detector.detect(source); return found.length ? { text: found[0].rawValue, format: found[0].format } : null; };
        }
      } catch { /* fall through to ZXing */ }
    }
    const Z = await loadZxing();
    const hints = new Map();
    const F = Z.BarcodeFormat;
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [F.UPC_A, F.UPC_E, F.EAN_13, F.EAN_8, F.CODE_128, F.CODE_39, F.CODE_93, F.ITF, F.CODABAR, F.QR_CODE, F.DATA_MATRIX, F.AZTEC, F.PDF_417]);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    const reader = new Z.MultiFormatReader();
    reader.setHints(hints);
    let flip = false;
    return async canvas => {
      // Alternate normal and inverted frames so light-on-dark codes (common on screens and dark packaging) also read.
      flip = !flip;
      const base = new Z.HTMLCanvasElementLuminanceSource(canvas);
      const source = flip ? new Z.InvertedLuminanceSource(base) : base;
      try {
        const result = reader.decode(new Z.BinaryBitmap(new Z.HybridBinarizer(source)));
        return { text: result.getText(), format: Z.BarcodeFormat[result.getBarcodeFormat()].toLowerCase() };
      } catch { return null; }
    };
  }

  function explain(e) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'The camera needs a secure address (https:// or localhost). On a shop tablet, use a hardware scanner or serve this page over HTTPS.';
    if (e.name === 'NotAllowedError' || e.name === 'SecurityError') return 'Camera access is blocked. Allow the camera for this page, then press Scan again.';
    if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') return 'No camera found. Plug in a webcam, or use a barcode scanner.';
    if (e.name === 'NotReadableError') return 'The camera is busy in another app. Close that app and try again.';
    return `Camera problem: ${e.message}`;
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.frequency.value = 1500; gain.gain.value = 0.08; osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.08); setTimeout(() => ctx.close(), 300);
    } catch { /* silent */ }
  }

  // onCode(text, format) may be async. Return a short message to show ("Added Canvas Tote") or throw to show an error.
  // single: close after the first accepted scan (used to fill a form field).
  POS.camera = function ({ title = 'Scan a barcode or QR code', onCode, single = false }) {
    const video = h('video', { playsinline: true, muted: true, autoplay: true, 'data-testid': 'camera-video', style: 'width:100%;max-height:50vh;background:#000;border-radius:12px;object-fit:contain' });
    const status = h('p', { class: 'center', 'data-testid': 'camera-status', 'aria-live': 'polite' }, 'Starting the camera…');
    const last = h('p', { class: 'center muted', 'data-testid': 'camera-last', 'aria-live': 'polite' }, '');
    const picker = h('select', { 'data-testid': 'camera-select', 'aria-label': 'Camera', style: 'display:none' });
    let stream, decode, timer, closed = false, busy = false, lastText = '', lastSeenAt = 0;
    const canvas = document.createElement('canvas');

    const stop = () => { closed = true; clearTimeout(timer); if (stream) stream.getTracks().forEach(t => t.stop()); };
    const dlg = POS.dialog(title, h('div', null, video, h('div', { style: 'margin-top:8px' }, picker), status, last), { wide: true, testid: 'camera-dialog', onClose: stop, actions: [{ label: 'Done', kind: 'primary', testid: 'camera-done' }] });

    async function begin(deviceId) {
      if (stream) stream.getTracks().forEach(t => t.stop());
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('insecure'), { name: 'SecurityError' });
        stream = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      } catch (e) { status.textContent = explain(e); status.classList.add('warn-text'); return; }
      if (closed) { stream.getTracks().forEach(t => t.stop()); return; }
      video.srcObject = stream; await video.play().catch(() => { });
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
      if (devices.length > 1) {
        const current = stream.getVideoTracks()[0].getSettings().deviceId;
        picker.replaceChildren(...devices.map((d, i) => h('option', { value: d.deviceId, selected: d.deviceId === current }, d.label || `Camera ${i + 1}`)));
        picker.style.display = 'block';
        picker.onchange = () => begin(picker.value);
      }
      try { decode = decode || await makeDecoder(); } catch (e) { status.textContent = e.message; return; }
      status.textContent = 'Hold a barcode or QR code in front of the camera';
      loop();
    }

    async function loop() {
      if (closed) return;
      try {
        if (!busy && video.readyState >= 2 && video.videoWidth) {
          busy = true;
          const w = Math.min(video.videoWidth, 1280), hgt = Math.round(video.videoHeight * (w / video.videoWidth));
          canvas.width = w; canvas.height = hgt;
          canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, w, hgt);
          const hit = await decode(canvas);
          // A code held steadily in view counts once; it counts again only after it has been out of view for a moment.
          const fresh = !!(hit && hit.text) && (hit.text !== lastText || Date.now() - lastSeenAt > 1200);
          if (hit && hit.text) { lastText = hit.text; lastSeenAt = Date.now(); }
          if (fresh) {
            beep();
            try {
              const message = await onCode(hit.text, hit.format);
              last.textContent = message || `Scanned ${hit.text}`; last.classList.remove('warn-text');
              if (single && !closed) { dlg.close(); return; }
            } catch (e) { last.textContent = e.message; last.classList.add('warn-text'); }
          }
          busy = false;
        }
      } catch { busy = false; }
      timer = setTimeout(loop, 120);
    }
    begin();
    return dlg;
  };
})();
