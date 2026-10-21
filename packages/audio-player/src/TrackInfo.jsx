import React from 'react';
import { Icon } from './Icon.jsx';
import { formatDuration } from '../lib/library-index.js';
import { useLibrary, Cover, LoveButton } from './library-ui.jsx';

const when = (iso) => (iso ? new Date(iso).toLocaleString() : '—');

export default function TrackInfo({ track, onClose }) {
  const { stats, actions } = useLibrary();
  if (!track) return null;
  const st = stats[track.id] || {};
  const rows = [
    ['Title', track.title],
    ['Artist', track.artist],
    ['Album artist', track.albumArtist],
    ['Album', track.album],
    ['Track', track.trackNumber ? `${track.trackNumber}${track.trackTotal ? ` of ${track.trackTotal}` : ''}` : null],
    ['Disc', track.discNumber ? `${track.discNumber}${track.discTotal ? ` of ${track.discTotal}` : ''}` : null],
    ['Year', track.year],
    ['Genre', track.genre],
    ['Composer', track.composer],
    ['Duration', formatDuration(track.duration)],
    ['Format', [track.codec, track.lossless ? 'lossless' : null].filter(Boolean).join(', ') || null],
    ['Bitrate', track.bitrate ? `${Math.round(track.bitrate / 1000)} kbps` : null],
    ['Sample rate', track.sampleRate ? `${(track.sampleRate / 1000).toFixed(1)} kHz${track.bitsPerSample ? ` · ${track.bitsPerSample}-bit` : ''}` : null],
    ['Channels', track.channels === 1 ? 'Mono' : track.channels === 2 ? 'Stereo' : track.channels],
    ['Plays', st.plays || 0],
    ['Last played', when(st.lastPlayed)],
    ['Added', when(track.addedAt)],
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
              <button className="btn-chip" onClick={() => { onClose(); actions.goToAlbumOf(track); }}>Go to album</button>
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
