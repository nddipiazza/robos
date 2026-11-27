import React, { useEffect, useRef, useState } from 'react';
import { formatSegmentTime } from './VideoSegments.jsx';

export default function TrimVideo({ edit, onClose, onSaved }) {
  const dialog = useRef(null);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState(null);
  const [saving, setSaving] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [message, setMessage] = useState('');
  const { track, point, edge, duration } = edit;
  const start = edge === 'start' ? point : 0;
  const end = edge === 'end' ? point : duration;

  useEffect(() => {
    dialog.current.showModal();
    return window.robosAudio.onVideoTrimProgress(({ percent, saving }) => {
      setProgress(percent);
      setSaving(!!saving);
    });
  }, []);

  async function trim() {
    if (working) return;
    setWorking(true);
    setSaving(false);
    setCanceling(false);
    setProgress(null);
    setMessage('');
    try {
      const result = await window.robosAudio.trimVideo({ trackId: track.id, point, edge });
      if (result.ok) {
        onSaved(result.track);
        return;
      }
      setMessage(result.canceled ? 'Trim canceled.' : result.error);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setWorking(false);
      setSaving(false);
      setCanceling(false);
    }
  }

  async function cancel() {
    if (!working) { onClose(); return; }
    if (saving || canceling) return;
    setCanceling(true);
    try {
      if (!await window.robosAudio.cancelVideoTrim()) setCanceling(false);
    } catch (err) {
      setCanceling(false);
      setMessage(err.message);
    }
  }

  const label = edge === 'start' ? 'Trim video up to this point' : 'Trim video from this point';
  return (
    <dialog ref={dialog} className="video-segments-dialog video-trim-dialog" aria-labelledby="video-trim-heading"
      onCancel={(event) => { event.preventDefault(); cancel(); }}>
      <header>
        <h2 id="video-trim-heading">{label}</h2>
        <p className="video-segments-title">{track.title}</p>
      </header>
      <dl className="video-trim-range">
        <div><dt>Keep</dt><dd>{formatSegmentTime(start)} – {formatSegmentTime(end)}</dd></div>
        <div><dt>New duration</dt><dd>{formatSegmentTime(end - start)}</dd></div>
      </dl>
      {working && <>
        <progress aria-label="Trim progress" max="100" value={progress ?? undefined} />
        <p role="status">{saving ? 'Adding the trimmed video to your library…' : canceling ? 'Canceling trim…' : 'Exporting the trimmed video…'}</p>
      </>}
      {message && <p role="status">{message}</p>}
      <footer>
        <button className="btn-secondary" onClick={cancel} disabled={saving || canceling}>{working ? 'Cancel trim' : 'Cancel'}</button>
        <button className="btn-accent" onClick={trim} disabled={working} autoFocus>Save trimmed copy</button>
      </footer>
    </dialog>
  );
}
