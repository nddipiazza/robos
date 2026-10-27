/**
 * Cast Clock & Cast Ambient Soundscape Cards for Smart TVs / Speakers
 */

import React, { useState } from 'react';
import { Icon } from './Icon';

export function CastClockCard({ castDevices = [], activeCastDevice = null }) {
  const [style, setStyle] = useState('minimal');
  const [format24h, setFormat24h] = useState(false);
  const [chimeHourly, setChimeHourly] = useState(false);
  const [status, setStatus] = useState('');

  const target = activeCastDevice || castDevices[0] || null;

  const handleStart = async () => {
    if (!target) {
      setStatus('Select or add a Cast TV / display above first.');
      return;
    }
    try {
      await window.robosAudio.castClockStart({ device: target, style, format24h, chimeHourly });
      setStatus(`Clock active on ${target.name}`);
    } catch (err) {
      setStatus(`Clock error: ${err.message}`);
    }
  };

  const handleStop = async () => {
    try {
      await window.robosAudio.castClockStop();
      setStatus('Clock stopped');
    } catch (_) {}
  };

  return (
    <div className="cast-feature-card" style={{ marginTop: 14, padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="clock" size={15} /> Theater Lobby Clock Display
          </h4>
          <p className="muted" style={{ margin: '4px 0 0 0', fontSize: 12 }}>
            Cast an ambient theater clock face to your Smart TV or Nest Hub between screenings.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="select-sm" value={style} onChange={e => setStyle(e.target.value)}>
            <option value="minimal">Minimal Cinema</option>
            <option value="retro">Retro Flip</option>
            <option value="neon">Amber Marquee</option>
          </select>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={format24h} onChange={e => setFormat24h(e.target.checked)} />
            24h
          </label>
          <button className="btn btn-xs btn-accent" onClick={handleStart}>Cast Clock</button>
          <button className="btn btn-xs" onClick={handleStop}>Stop</button>
        </div>
      </div>
      {status && <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 6 }}>{status}</div>}
    </div>
  );
}

export function CastAmbientCard({ castDevices = [], activeCastDevice = null }) {
  const [presetId, setPresetId] = useState('rain');
  const [status, setStatus] = useState('');

  const target = activeCastDevice || castDevices[0] || null;

  const handleStart = async () => {
    if (!target) {
      setStatus('Select or add a Cast TV / speaker above first.');
      return;
    }
    try {
      await window.robosAudio.castAmbientStart({ device: target, presetId, durationSec: 3600 });
      setStatus(`Streaming ambient "${presetId}" to ${target.name}`);
    } catch (err) {
      setStatus(`Ambient cast error: ${err.message}`);
    }
  };

  const handleStop = async () => {
    try {
      await window.robosAudio.castAmbientStop();
      setStatus('Ambient stream stopped');
    } catch (_) {}
  };

  return (
    <div className="cast-feature-card" style={{ marginTop: 10, padding: 12, background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="waves" size={15} /> Cast Theater Ambient Soundscape
          </h4>
          <p className="muted" style={{ margin: '4px 0 0 0', fontSize: 12 }}>
            Stream procedural theater rain or projector room tone directly to a LAN Cast device.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="select-sm" value={presetId} onChange={e => setPresetId(e.target.value)}>
            <option value="rain">Cinema Rain</option>
            <option value="pink">Projector Hum</option>
            <option value="brown">Sub-Bass Warmth</option>
          </select>
          <button className="btn btn-xs btn-accent" onClick={handleStart}>Cast Ambient</button>
          <button className="btn btn-xs" onClick={handleStop}>Stop</button>
        </div>
      </div>
      {status && <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 6 }}>{status}</div>}
    </div>
  );
}
