/**
 * AI Watchlist / Movie Marathon Builder Modal for RobOS Movie Player
 *
 * Lets the user describe a movie marathon, mood, director retrospective, or theme
 * and builds an ordered Watchlist from their library via the configured RobOS AI agent
 * (with a deterministic local fallback). Optionally turns on the **Virtual Cinema Host**
 * for spoken introductions between films using RobOS Voice.
 */

import React, { useState } from 'react';
import { Icon } from './Icon';

const EXAMPLE_PROMPTS = [
  'Cyberpunk & sci-fi movie marathon for a rainy night',
  'Blender open-source animated short films back to back',
  'Classic 1990s & 2000s high-resolution 1080p/4K action features',
  'Short episodes and quick video clips under 30 minutes',
  'Most-watched favorites and director spotlight double feature'
];

const DJ_STYLES = [
  { id: 'warm classic cinema host', label: 'Classic Theater Host — warm, welcoming, silver-screen intro' },
  { id: 'film festival curator', label: 'Film Festival Curator — director notes, cinematography & release context' },
  { id: 'late-night drive-in host', label: 'Late-Night Drive-In — retro, atmospheric double-feature energy' },
  { id: 'concise screening intro', label: 'Minimalist — brief title, director, and year only' }
];

export function AiPlaylistModal({
  open,
  trackCount = 0,
  onClose,
  onCreated
}) {
  const [prompt, setPrompt] = useState('');
  const [count, setCount] = useState(12);
  const [virtualDj, setVirtualDj] = useState(true);
  const [djStyle, setDjStyle] = useState(DJ_STYLES[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed) {
      setError('Describe the movie marathon, mood, director, or genre you want to watch.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await window.robosAudio.generateAiPlaylist({
        prompt: trimmed,
        count: Number(count) || 12,
        virtualDj,
        djStyle,
        save: true
      });
      if (!res || !Array.isArray(res.tracks) || res.tracks.length === 0) {
        setError('No matching movies were found in your library. Scan a folder or index a cloud source first.');
        setBusy(false);
        return;
      }
      if (onCreated) onCreated(res);
      onClose();
    } catch (err) {
      setError(err.message || 'Could not generate AI Watchlist');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div className="modal-card ai-playlist-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="track-info-header">
            <div className="ai-badge-icon">
              <Icon name="sparkles" size={20} />
            </div>
            <div className="track-info-headings">
              <h3>AI Watchlist &amp; Virtual Cinema Host</h3>
              <div className="track-info-sub">
                Picks and orders movies from your library ({trackCount.toLocaleString()} indexed films)
              </div>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} disabled={busy} title="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="ai-playlist-form">
          <label className="ai-field-label">Describe your movie marathon or mood</label>
          <textarea
            className="input ai-prompt-textarea"
            rows={3}
            placeholder="e.g., Sci-fi and animated open-movie double feature with atmospheric pacing…"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            disabled={busy}
            autoFocus
          />

          <div className="ai-preset-chips">
            {EXAMPLE_PROMPTS.map(sample => (
              <button
                key={sample}
                type="button"
                className="chip"
                disabled={busy}
                onClick={() => setPrompt(sample)}
              >
                {sample}
              </button>
            ))}
          </div>

          <div className="ai-options-row">
            <div className="ai-option-col">
              <label className="ai-field-label">Movies in watchlist</label>
              <select
                className="select-sm"
                value={count}
                onChange={e => setCount(Number(e.target.value))}
                disabled={busy}
              >
                <option value={5}>5 films (~double/triple feature)</option>
                <option value={12}>12 films / episodes</option>
                <option value={20}>20 films / episodes</option>
                <option value={35}>35 films (weekend marathon)</option>
              </select>
            </div>

            <div className="ai-option-col">
              <label className="ai-field-label">Virtual Cinema Host (RobOS Voice)</label>
              <label className="ai-checkbox-row">
                <input
                  type="checkbox"
                  checked={virtualDj}
                  onChange={e => setVirtualDj(e.target.checked)}
                  disabled={busy}
                />
                <span>Speak short cinema host intros between films</span>
              </label>
            </div>
          </div>

          {virtualDj && (
            <div className="ai-option-col">
              <label className="ai-field-label">Cinema Host Persona</label>
              <select
                className="select-sm"
                value={djStyle}
                onChange={e => setDjStyle(e.target.value)}
                disabled={busy}
              >
                {DJ_STYLES.map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
          )}

          {error && <div className="ai-error-banner">{error}</div>}

          <div className="modal-footer">
            <button type="button" className="btn btn-sm" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-sm btn-accent" disabled={busy}>
              <Icon name="sparkles" size={14} />
              <span>{busy ? 'Curating Watchlist…' : 'Create & Screen Watchlist'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
