'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

// Host-side camera scanner. Uses the native BarcodeDetector when available (Android Chrome),
// otherwise decodes frames with jsQR (iOS Safari, desktop).
export default function Scanner() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const busyRef = useRef(false);
  const lastRef = useRef({ code: '', at: 0 });
  const [state, setState] = useState('idle'); // idle | starting | scanning | error
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [manual, setManual] = useState('');

  const submit = useCallback(async (text) => {
    if (busyRef.current) return;
    const now = Date.now();
    if (lastRef.current.code === text && now - lastRef.current.at < 4000) return;
    lastRef.current = { code: text, at: now };
    busyRef.current = true;
    try {
      const res = await api('/api/checkin/scan', { body: { code: text } });
      setResult(res.ok ? { ok: true, name: res.attendeeBandName, already: res.already, cents: res.refundedCents } : { ok: false, error: res.error });
      if (navigator.vibrate) navigator.vibrate(res.ok ? 80 : [40, 60, 40]);
    } finally {
      setTimeout(() => {
        busyRef.current = false;
      }, 1500);
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError('');
    setResult(null);
    setState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      setState('scanning');
      const detector = 'BarcodeDetector' in window ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
      const jsQR = detector ? null : (await import('jsqr')).default;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const tick = async () => {
        if (!streamRef.current) return;
        if (video.readyState >= 2 && !busyRef.current) {
          try {
            let text = null;
            if (detector) {
              const codes = await detector.detect(video);
              text = codes[0]?.rawValue || null;
            } else {
              const w = video.videoWidth;
              const h = video.videoHeight;
              const scale = Math.min(1, 640 / Math.max(w, h));
              canvas.width = Math.round(w * scale);
              canvas.height = Math.round(h * scale);
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              text = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data || null;
            }
            if (text) await submit(text);
          } catch {
            // keep scanning
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (err) {
      setState('error');
      setError(
        err?.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow camera access for getemgigs.com, or use your phone’s camera app.'
          : 'Could not start the camera on this device. Use your phone’s camera app to scan instead.',
      );
    }
  }, [submit]);

  useEffect(() => stop, [stop]);

  return (
    <div className="scanner stack">
      <div className={`viewfinder ${state === 'scanning' ? 'live' : ''}`}>
        <video ref={videoRef} playsInline muted data-testid="scanner-video" />
        {state !== 'scanning' && (
          <button type="button" className="btn btn-primary btn-lg" onClick={start} data-testid="start-scanner">
            📷 Start scanning
          </button>
        )}
        {state === 'scanning' && <div className="reticle" aria-hidden="true" />}
        {result && (
          <div className={`scan-toast ${result.ok ? 'ok' : 'bad'}`} aria-hidden="true">
            {result.ok ? `✅ ${result.name} checked in` : `⚠️ ${result.error}`}
          </div>
        )}
      </div>
      <canvas ref={canvasRef} hidden />
      {result?.ok && (
        <p className="alert alert-ok" role="status" data-testid="scan-ok">
          ✅ {result.name} checked in{result.already ? ' (already verified)' : ` — $${Math.round(result.cents / 100)} deposit released`}.
        </p>
      )}
      {result && !result.ok && (
        <p className="alert alert-error" role="alert" data-testid="scan-error">
          {result.error}
        </p>
      )}
      {error && <p className="alert alert-error" role="alert">{error}</p>}
      <details className="manual">
        <summary>Can’t use the camera? Enter the code</summary>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) submit(manual.trim());
          }}
        >
          <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Paste check-in code" aria-label="Check-in code" />
          <button className="btn btn-secondary btn-sm">Check in</button>
        </form>
      </details>
    </div>
  );
}
