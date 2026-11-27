import React, { useEffect, useRef, useState } from 'react';
import { formatDuration } from '../lib/library-index.js';

const evidenceLabels = { chapter: 'Chapter label', 'repeated opening': 'Repeated opening', 'break cues': 'Break transitions' };

export function formatSegmentTime(seconds) {
  const tenths = Math.round(seconds * 10);
  const time = formatDuration(Math.floor(tenths / 10));
  const decimal = tenths % 10;
  return (time === '--:--' ? '0:00' : time) + (decimal ? '.' + decimal : '');
}

export default function VideoSegmentsPanel({ track, onClose, onJump }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const dialog = useRef(null);
  const api = window.robosAudio;

  useEffect(() => {
    dialog.current.showModal();
    let mounted = true;
    const apply = (value) => {
      if (!mounted) return;
      if (value.ok === false) setError(value.error);
      else setResult(value);
    };
    const unsubscribe = api.onVideoSegmentsUpdated(value => {
      if (value.trackId === track.id) apply(value);
    });
    api.getVideoSegments(track.id).then(apply).catch(error => apply({ ok: false, error: error.message }));
    return () => { mounted = false; unsubscribe(); };
  }, [api, track.id]);

  async function request(action) {
    setError('');
    try {
      const response = await action();
      if (!response.ok) setError(response.error);
      else setResult(response);
    } catch (err) { setError(err.message); }
  }

  const segments = result?.segments || [];
  return (
    <dialog ref={dialog} className="video-segments-dialog" aria-labelledby="video-segments-heading"
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <header>
        <h2 id="video-segments-heading">Video segments</h2>
        <p className="video-segments-title">{track.title}</p>
      </header>
      <p>Right-click the video or seek bar to mark the start and end of an intro or commercial.</p>
      <div className="video-segments-toolbar">
        <button className="btn-secondary" disabled={!result?.canDetect || result.scanning}
          onClick={() => request(() => api.detectVideoSegments(track.id))}>
          Detect intros and commercials
        </button>
        {result?.scanning && <span role="status">Analyzing video…</span>}
      </div>
      {(error || result?.error) && <p className="video-segments-error" role="alert">{error || result.error}</p>}
      {!result?.scanning && !segments.length && !error && !result?.error && (
        <p role="status">{result?.scannedAt ? 'No intros or commercials found.' : 'No segments marked yet.'}</p>
      )}
      {!!segments.length && <ul className="video-segments-list">
        {segments.map(segment => (
          <li key={segment.id} className="video-segment" data-segment-status={segment.status}>
            <div className="video-segment-label">
              <strong>{segment.type === 'intro' ? 'Intro' : 'Commercial break'}</strong>
              <span>{formatSegmentTime(segment.start)} – {formatSegmentTime(segment.end)}</span>
              {segment.status === 'suggested' && <small>Suggested · {evidenceLabels[segment.source]}</small>}
            </div>
            <div className="video-segment-actions">
              <button className="btn-secondary" onClick={() => onJump(segment.start)}>Go to start</button>
              <button className="btn-secondary" onClick={() => onJump(segment.end)}>Skip to end</button>
              {segment.status === 'suggested' ? <>
                <button className="btn-accent" onClick={() => request(() => api.reviewVideoSegment(track.id, { id: segment.id, status: 'confirmed' }))}>Confirm</button>
                <button className="btn-secondary" onClick={() => request(() => api.reviewVideoSegment(track.id, { id: segment.id, status: 'dismissed' }))}>Dismiss</button>
              </> : <button className="btn-secondary" onClick={() => request(() => api.reviewVideoSegment(track.id, { id: segment.id, status: 'dismissed' }))}>Remove</button>}
            </div>
          </li>
        ))}
      </ul>}
      <footer><button className="btn-secondary" onClick={onClose} autoFocus>Close</button></footer>
    </dialog>
  );
}
