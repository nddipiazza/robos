import React from 'react';
import { Icon } from './Icon.jsx';
import { formatDuration, inferMovieGenres } from '../lib/library-index.js';
import { useLibrary, Cover, LoveButton } from './library-ui.jsx';

const when = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

export default function TrackInfo({ track, onClose }) {
  const { stats, actions } = useLibrary();
  if (!track) return null;
  const st = stats[track.id] || {};
  const cats = inferMovieGenres(track);
  const rows = [
    ['Title', track.title],
    ['Collection / Series', track.album],
    ['Release Format', track.artist],
    ['Rating', track.rating ? `★ ${track.rating} / 10` : null],
    ['Network / Studio', track.network || null],
    ['Director', track.director || track.composer || null],
    ['Starring Cast', track.cast || null],
    ['Air Date', track.airdate || null],
    ['IMDb ID', track.imdbId || null],
    ['Episode / Part', track.trackNumber ? `${track.trackNumber}${track.trackTotal ? ` of ${track.trackTotal}` : ''}` : null],
    ['Season / Disc', track.discNumber ? `${track.discNumber}${track.discTotal ? ` of ${track.discTotal}` : ''}` : null],
    ['Release Year', track.year],
    ['Categories / Genres', cats.length ? cats.join(', ') : track.genre],
    ['Plot / Synopsis', track.overview || track.showOverview || null],
    ['Runtime', formatDuration(track.duration)],
    ['Video / Audio Codec', [track.codec, track.lossless ? 'lossless' : null].filter(Boolean).join(', ') || null],
    ['Bitrate', track.bitrate ? `${Math.round(track.bitrate / 1000)} kbps` : null],
    ['Audio Sample Rate', track.sampleRate ? `${(track.sampleRate / 1000).toFixed(1)} kHz${track.bitsPerSample ? ` · ${track.bitsPerSample}-bit` : ''}` : null],
    ['Audio Channels', track.channels === 1 ? 'Mono' : track.channels === 2 ? 'Stereo' : track.channels],
    ['Views', st.plays || 0],
    ['Last Watched', when(st.lastPlayed)],
    ['Added to Library', when(track.addedAt)],
    ['Source', track.cloud ? `Cloud (${track.cloud.driverType || 'remote'})${track.cloud.cached ? ', cached locally' : ''}` : (track.filePath ? 'Local file' : 'Stream')],
    ['Location', track.cloud ? track.cloud.remotePath : (track.filePath || track.src)],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card track-info-card" onClick={(e) => e.stopPropagation()}>
        <div className="track-info-head">
          <Cover artId={track.artId} name={track.album || track.title} size={96} />
          <div className="track-info-title">
            <h3>{track.title}</h3>
            <span>{track.artist}{track.album ? ` — ${track.album}` : ''}</span>
            <div className="track-info-actions">
              <LoveButton track={track} size={16} />
              <button className="btn-chip" onClick={() => { onClose(); actions.playTracks([track], 0); }}><Icon name="play" size={10} /> Play</button>
              <button className="btn-chip" onClick={() => { onClose(); actions.goToAlbumOf(track); }}>View Movie / Show Details</button>
              {actions.fetchMetadata && (
                <button id="btn-track-info-fetch-public" className="btn-chip" onClick={() => { onClose(); actions.fetchMetadata([track], { force: true }); }}>
                  <Icon name="locate" size={10} /> Fetch Poster &amp; Metadata
                </button>
              )}
              {actions.fixMetadata && (
                <button id="btn-track-info-ai-fix" className="btn-chip" onClick={() => { onClose(); actions.fixMetadata([track]); }}>
                  ✦ AI Fix Metadata
                </button>
              )}
              {track.filePath && !track.cloud && (
                <button className="btn-chip" onClick={() => actions.showInFolder(track)}>Show in file manager</button>
              )}
            </div>
          </div>
        </div>
        <dl className="track-info-grid">
          {rows.map(([k, v]) => (
            <React.Fragment key={k}>
              <dt>{k}</dt>
              <dd title={String(v)}>{String(v)}</dd>
            </React.Fragment>
          ))}
        </dl>
        <div className="modal-actions">
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
