/**
 * AI & Open-Data Movie Metadata / Poster Fixer Modal for RobOS Movie Player
 *
 * Uses strictly legal open-source tools (`music-metadata`, `ffprobe`, `ffmpeg`, `.nfo` sidecars)
 * and the RobOS AI agent (`@skill(robos:fix-media-metadata)`) to clean scene release filenames,
 * fill in missing directors / collections / years / resolutions, and extract video frame posters
 * or generate cinema SVG posters.
 */

import React, { useState, useEffect } from 'react';
import { Icon } from './Icon';

export function AiFixMetadataModal({
  open,
  selectedTracks = [],
  totalLibraryTracks = 0,
  onClose,
  onCompleted
}) {
  const hasSelection = Array.isArray(selectedTracks) && selectedTracks.length > 0;
  const [scope, setScope] = useState(hasSelection ? 'selected' : 'missing');
  const [useAi, setUseAi] = useState(true);
  const [generateFallbackArt, setGenerateFallbackArt] = useState(true);
  const [writeFileTags, setWriteFileTags] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setScope(selectedTracks && selectedTracks.length > 0 ? 'selected' : 'missing');
      setSummary(null);
      setError('');
      setProgress(null);
    }
  }, [open, selectedTracks && selectedTracks.length]);

  useEffect(() => {
    if (!open || !window.robosAudio || !window.robosAudio.onFixMetadataProgress) return undefined;
    return window.robosAudio.onFixMetadataProgress(p => setProgress(p));
  }, [open]);

  if (!open) return null;

  const handleRun = async (e) => {
    if (e) e.preventDefault();
    setBusy(true);
    setError('');
    setSummary(null);
    try {
      const trackIds = scope === 'selected' && hasSelection
        ? selectedTracks.map(t => t.id)
        : null;
      const res = await window.robosAudio.fixTrackMetadata({
        trackIds,
        scope: scope === 'selected' ? 'missing' : scope,
        useAi,
        generateFallbackArt,
        writeFileTags
      });
      setSummary(res);
      if (onCompleted) onCompleted(res);
    } catch (err) {
      setError(err.message || 'Metadata enrichment failed');
    } finally {
      setBusy(false);
      setProgress(null);
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
              <h3>Fix Movie Metadata &amp; Poster Art</h3>
              <div className="track-info-sub">
                Scene filename cleaning • <code>.nfo</code> sidecar • <code>ffprobe</code> stream inspection • <code>ffmpeg</code> frame poster • AI Agent
              </div>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} disabled={busy} title="Close">✕</button>
        </div>

        <form onSubmit={handleRun} className="ai-playlist-form">
          <div className="ai-option-col">
            <label className="ai-field-label">Target Movies</label>
            <select
              className="select-sm"
              value={scope}
              onChange={e => setScope(e.target.value)}
              disabled={busy}
            >
              {hasSelection && (
                <option value="selected">
                  Selected movies only ({selectedTracks.length} movie{selectedTracks.length === 1 ? '' : 's'})
                </option>
              )}
              <option value="missing">
                All movies missing tags or posters (scans {totalLibraryTracks.toLocaleString()} films)
              </option>
              <option value="all">
                Re-verify entire movie library (up to 500 films per batch)
              </option>
            </select>
          </div>

          <div className="ai-option-col">
            <label className="ai-field-label">Enrichment Sources (100% Open-Source &amp; Legal)</label>
            <label className="ai-checkbox-row">
              <input
                type="checkbox"
                checked={useAi}
                onChange={e => setUseAi(e.target.checked)}
                disabled={busy}
              />
              <span>Clean scene release filenames &amp; infer Director / Collection / Year with RobOS AI Agent</span>
            </label>
            <label className="ai-checkbox-row">
              <input
                type="checkbox"
                checked={generateFallbackArt}
                onChange={e => setGenerateFallbackArt(e.target.checked)}
                disabled={busy}
              />
              <span>Extract video frame thumbnail via <code>ffmpeg</code> or generate cinema SVG poster when missing</span>
            </label>
            <label className="ai-checkbox-row">
              <input
                type="checkbox"
                checked={writeFileTags}
                onChange={e => setWriteFileTags(e.target.checked)}
                disabled={busy}
              />
              <span>Also write updated container tags &amp; poster back to local <code>.mp4</code> / <code>.mkv</code> files via <code>ffmpeg</code></span>
            </label>
          </div>

          {progress && (
            <div className="scan-progress-banner">
              Enriching {progress.processed} / {progress.total}: <strong>{progress.currentTitle || '…'}</strong>
            </div>
          )}

          {error && <div className="ai-error-banner">{error}</div>}

          {summary && (
            <div className="ai-fix-summary">
              <div className="ai-fix-summary-head">
                <strong>Completed:</strong> Checked {summary.total} film{summary.total === 1 ? '' : 's'} •
                Updated <strong>{summary.updatedCount}</strong> •
                Added <strong>{summary.artAddedCount}</strong> poster{summary.artAddedCount === 1 ? '' : 's'}
              </div>
              {Array.isArray(summary.results) && summary.results.filter(r => r.changed).length > 0 && (
                <div className="ai-fix-results-list">
                  {summary.results.filter(r => r.changed).slice(0, 8).map(r => (
                    <div key={r.id} className="ai-fix-result-row">
                      <span className="ai-fix-result-main">
                        <strong>{r.after.title}</strong> — {r.after.artist} ({r.after.album}{r.after.year ? `, ${r.after.year}` : ''}{r.after.resolution ? `, ${r.after.resolution}` : ''})
                      </span>
                      <span className="ai-fix-result-badges">
                        {(r.sources || []).map(s => (
                          <span key={s} className="pill">{s}</span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="btn btn-sm" onClick={onClose} disabled={busy}>
              {summary ? 'Done' : 'Cancel'}
            </button>
            <button type="submit" className="btn btn-sm btn-accent" disabled={busy}>
              <Icon name="sparkles" size={14} />
              <span>{busy ? 'Fixing Metadata & Posters…' : 'Fix Metadata & Posters'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
