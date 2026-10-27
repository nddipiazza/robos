import React, { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon.jsx';
import { AiPromptBox, AgentPicker } from './AiPlaylist.jsx';
import { Cover } from './library-ui.jsx';
import { plural } from '../lib/library-index.js';

export const DEFAULT_FIX_METADATA_PROMPT = `@skill(robos:fix-media-metadata)
Inspect all selected media files and fix missing, noisy, or incomplete metadata and artwork using open-source tools and open databases:
1. Clean noisy titles (strip [Official Video], (Lyrics), bitrate/resolution tags, leading track numbers, and underscores) while preserving legitimate feat./remix/live credits.
2. Infer missing artist, albumArtist, album, year, genre, composer, trackNumber/trackTotal, and discNumber/discTotal from container streams, folder/filename hierarchy, .cue/.lrc/.nfo sidecars, and MusicBrainz / LRCLIB open-data matches.
3. Ensure every track gets high-quality artwork: extract embedded pictures or video frames, use folder cover images, fetch Cover Art Archive release covers, or generate an open-source waveform/album cover when none exists.`;

const NOISE_RE = /(\[\s*(?:official|hd|hq|4k|1080p|720p|lyrics?|audio|flac|320\s*kbps|mp3)[^\]]*\]|\(\s*(?:official|hd|hq|4k|1080p|720p|lyrics?)[^)]*\)|^\d{1,3}\s*[-._]\s*\S+)/i;

export function trackNeedsFixClient(t) {
  if (!t) return false;
  if (!t.artist || t.artist === 'Unknown Artist' || t.artist === 'Cloud Stream') return true;
  if (!t.album || t.album === 'Unknown Album' || t.album === 'Imported Playlist') return true;
  if (!t.title || NOISE_RE.test(t.title) || t.title.includes('_')) return true;
  if (!t.artId) return true;
  if (!t.year || !t.genre) return true;
  return false;
}

const COVER_BADGE_LABELS = {
  embedded: 'Embedded Stream',
  'video-frame': 'FFmpeg Frame',
  folder: 'Folder Cover',
  coverartarchive: 'Cover Art Archive',
  caa: 'Cover Art Archive',
  waveform: 'FFmpeg Waveform',
  generated: 'Open-Source SVG Cover',
  existing: 'Existing Cover',
};

/**
 * Modal for "✦ AI Fix Metadata":
 * - Reuses the shared <robos-agent-selector> (via AgentPicker) and <robos-ai-textarea> (via AiPromptBox)
 * - Pre-populates the default prompt with @skill(robos:fix-media-metadata)
 * - Lets user inspect proposed tag + artwork fixes before applying them to library & files
 */
export function AiFixMetadataModal({
  tracks = [],
  initialTracks = [],
  agent: initialAgent,
  onAgentChange,
  onApplied,
  onClose,
}) {
  const hasInitialSubset = Array.isArray(initialTracks) && initialTracks.length > 0;
  const missingTracks = useMemo(() => tracks.filter(trackNeedsFixClient), [tracks]);

  const [scope, setScope] = useState(() => {
    if (hasInitialSubset) return 'selected';
    if (missingTracks.length > 0) return 'missing';
    return 'all';
  });

  const [prompt, setPrompt] = useState(DEFAULT_FIX_METADATA_PROMPT);
  const [enableOpenLookup, setEnableOpenLookup] = useState(true);
  const [writeFiles, setWriteFiles] = useState(false);

  const [agent, setAgent] = useState({ ...(initialAgent || {}), ready: false });
  const pickAgent = (next) => {
    setAgent(next);
    if (next.provider && onAgentChange) {
      onAgentChange({ provider: next.provider, model: next.model, effort: next.effort });
    }
  };

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [previewResult, setPreviewResult] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  useEffect(() => {
    const off = window.robosAudio?.onAiProgress?.((p) => p && p.message && setProgress(p.message));
    return () => { if (typeof off === 'function') off(); };
  }, []);

  const targetList = useMemo(() => {
    if (scope === 'selected' && hasInitialSubset) return initialTracks.slice(0, 40);
    if (scope === 'missing') return missingTracks.slice(0, 40);
    return tracks.slice(0, 40);
  }, [scope, hasInitialSubset, initialTracks, missingTracks, tracks]);

  const canRunPreview = !busy && prompt.trim().length > 0 && targetList.length > 0 && !!(agent && agent.provider && agent.ready);

  const runPreview = async () => {
    if (!canRunPreview) return;
    setBusy(true);
    setError('');
    setProgress(`Starting open-source metadata & artwork analysis for ${plural(targetList.length, 'track')}…`);
    try {
      const res = await window.robosAudio.aiFixMetadataPreview({
        trackIds: targetList.map(t => t.id),
        scope,
        prompt: prompt.trim(),
        agent: { provider: agent.provider, model: agent.model, effort: agent.effort },
        enableOpenLookup,
      });
      if (!res || !res.ok) {
        setError((res && res.error) || 'Could not analyze track metadata.');
        return;
      }
      setPreviewResult(res);
      const changedSet = new Set(
        (res.proposals || []).filter(p => p.changed).map(p => p.id)
      );
      if (changedSet.size === 0) {
        (res.proposals || []).forEach(p => changedSet.add(p.id));
      }
      setSelectedIds(changedSet);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  const toggleProposal = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applySelected = async () => {
    if (!previewResult || !selectedIds.size || busy) return;
    setBusy(true);
    setError('');
    setProgress(`Applying metadata & cover art fixes to ${plural(selectedIds.size, 'track')}…`);
    try {
      const chosen = (previewResult.proposals || []).filter(p => selectedIds.has(p.id));
      const res = await window.robosAudio.aiFixMetadataApply({
        fixes: chosen,
        writeFiles,
      });
      if (!res || !res.ok) {
        setError((res && res.error) || 'Failed to apply metadata fixes.');
        return;
      }
      if (onApplied) onApplied(res);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setProgress('');
    }
  };

  return (
    <div className="modal-overlay" onClick={busy ? undefined : onClose}>
      <div className="modal-card ai-modal ai-fix-metadata-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ai-modal-head">
          <h3><span className="ai-spark">✦</span> AI Fix Metadata &amp; Artwork</h3>
          <span className="ai-note">
            Your RobOS agent inspects media streams, paths, sidecars, and open databases (<strong>MusicBrainz CC0</strong>, <strong>Cover Art Archive</strong>, <strong>LRCLIB</strong>, <strong>FFmpeg</strong>) to repair tags and artwork.
          </span>
        </div>

        <AgentPicker value={initialAgent} onChange={pickAgent} />

        <div className="ai-fix-scope-group">
          <label className="modal-label">Tracks to Inspect</label>
          <div className="ai-scope-pills">
            {hasInitialSubset && (
              <button
                type="button"
                id="btn-ai-fix-scope-selected"
                className={scope === 'selected' ? 'btn-accent' : 'btn-secondary'}
                onClick={() => { setScope('selected'); setPreviewResult(null); }}
                disabled={busy}
              >
                Selected ({initialTracks.length > 40 ? '40 max' : initialTracks.length})
              </button>
            )}
            <button
              type="button"
              id="btn-ai-fix-scope-missing"
              className={scope === 'missing' ? 'btn-accent' : 'btn-secondary'}
              onClick={() => { setScope('missing'); setPreviewResult(null); }}
              disabled={busy}
            >
              Needs Metadata / Art ({missingTracks.length > 40 ? `40 of ${missingTracks.length}` : missingTracks.length})
            </button>
            <button
              type="button"
              id="btn-ai-fix-scope-all"
              className={scope === 'all' ? 'btn-accent' : 'btn-secondary'}
              onClick={() => { setScope('all'); setPreviewResult(null); }}
              disabled={busy}
            >
              Library Batch ({Math.min(tracks.length, 40)} of {tracks.length})
            </button>
          </div>
        </div>

        <label className="modal-label">
          Instructions &amp; Open-Source Media Skill (use <code>/skills</code> or <code>@</code> to attach files)
        </label>
        <AiPromptBox
          id="ai-fix-metadata-prompt"
          placeholder="Describe how to clean or enrich metadata and cover art…"
          initialValue={DEFAULT_FIX_METADATA_PROMPT}
          minHeight={108}
          showCommands={true}
          onChange={setPrompt}
          onSubmit={runPreview}
        />

        <div className="dj-row ai-fix-options-row">
          <label className="dj-toggle">
            <input
              id="ai-fix-open-lookup"
              type="checkbox"
              checked={enableOpenLookup}
              onChange={(e) => setEnableOpenLookup(e.target.checked)}
              disabled={busy}
            />
            <span>Query open-data APIs (MusicBrainz CC0, Cover Art Archive, LRCLIB)</span>
          </label>
          <label className="dj-toggle">
            <input
              id="ai-fix-write-files"
              type="checkbox"
              checked={writeFiles}
              onChange={(e) => setWriteFiles(e.target.checked)}
              disabled={busy}
            />
            <span>Also write updated tags &amp; cover art to local media files via FFmpeg</span>
          </label>
        </div>

        {previewResult && Array.isArray(previewResult.proposals) && (
          <div className="ai-fix-preview-section">
            <div className="ai-fix-preview-head">
              <div>
                <strong>Proposed Fixes ({selectedIds.size} of {previewResult.proposals.length} selected)</strong>
                {previewResult.summary && <p className="ai-note">{previewResult.summary}</p>}
              </div>
              <div className="ai-fix-preview-actions">
                <button
                  type="button"
                  className="btn-chip"
                  onClick={() => setSelectedIds(new Set(previewResult.proposals.map(p => p.id)))}
                  disabled={busy}
                >
                  Select All
                </button>
                <button
                  type="button"
                  className="btn-chip"
                  onClick={() => setSelectedIds(new Set())}
                  disabled={busy}
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="ai-fix-proposal-list">
              {previewResult.proposals.map((prop) => {
                const checked = selectedIds.has(prop.id);
                const coverSourceLabel = COVER_BADGE_LABELS[prop.after.coverSource || prop.after.coverAction] || 'Artwork';
                return (
                  <div
                    key={prop.id}
                    className={`ai-fix-proposal-card ${checked ? 'is-selected' : ''} ${prop.changed ? 'has-changes' : ''}`}
                    onClick={() => !busy && toggleProposal(prop.id)}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleProposal(prop.id)}
                      onClick={(e) => e.stopPropagation()}
                      disabled={busy}
                    />
                    <div className="ai-fix-cover-col">
                      <Cover
                        artId={prop.after.artId || prop.before.artId}
                        name={prop.after.album || prop.after.title}
                        size={48}
                      />
                      {prop.after.artId && prop.after.artId !== prop.before.artId && (
                        <span className="ai-fix-cover-badge" title={`Cover source: ${coverSourceLabel}`}>
                          {coverSourceLabel}
                        </span>
                      )}
                    </div>
                    <div className="ai-fix-details-col">
                      <div className="ai-fix-title-line">
                        <strong>{prop.after.title}</strong>
                        <span className="ai-note"> — {prop.after.artist}</span>
                        {prop.after.album && <span className="ai-note"> · {prop.after.album}</span>}
                        {prop.after.year && <span className="ai-note"> ({prop.after.year})</span>}
                      </div>
                      {prop.changes.length > 0 ? (
                        <div className="ai-fix-diff-chips">
                          {prop.changes.map((c, idx) => (
                            <span key={idx} className="ai-fix-diff-chip">
                              <b>{c.field}:</b>{' '}
                              <span className="diff-from">{c.from ?? '—'}</span> →{' '}
                              <span className="diff-to">{c.to}</span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="ai-note">Metadata already clean</div>
                      )}
                      {prop.reason && <div className="ai-fix-reason ai-note">{prop.reason}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {error && <p className="ai-note error" role="alert">{error}</p>}
        {busy && (
          <div className="ai-progress" role="status">
            <div className="scan-spinner"></div>
            <span>{progress || 'Analyzing media…'}</span>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            id="btn-ai-fix-metadata-run"
            className={previewResult ? 'btn-secondary' : 'btn-accent'}
            onClick={runPreview}
            disabled={!canRunPreview}
            title={
              !agent.ready
                ? 'Choose a ready AI agent first'
                : !prompt.trim()
                  ? 'Enter metadata instructions first'
                  : 'Inspect tracks and preview metadata & artwork fixes'
            }
          >
            ✦ {busy ? 'Working…' : (previewResult ? 'Re-Analyze with AI' : `Fix Metadata with AI (${targetList.length})`)}
          </button>
          {previewResult && (
            <button
              id="btn-ai-fix-metadata-apply"
              className="btn-accent"
              onClick={applySelected}
              disabled={busy || selectedIds.size === 0}
            >
              <Icon name="check" size={13} /> Apply {plural(selectedIds.size, 'Fix', 'Fixes')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
