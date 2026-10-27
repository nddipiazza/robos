/**
 * Movie / Video Details Modal for RobOS Movie Player
 */

import React from 'react';
import { Icon } from './Icon';
import { CoverThumb, formatTime, formatBytes } from './library-ui';

export function TrackInfoModal({ track, onClose, onToggleLoved }) {
  if (!track) return null;

  const rows = [
    ['Title', track.title || '—'],
    ['Director / Creator', track.artist || 'Unknown Director'],
    ['Collection / Series', track.album || 'Standalone Films'],
    ['Lead / Franchise', track.albumArtist || track.artist || '—'],
    ['Studio / Writer', track.composer || '—'],
    ['Genre', track.genre || 'Cinema'],
    ['Release Year', track.year || '—'],
    ['Season / Episode', (track.discNumber || track.trackNumber)
      ? `${track.discNumber ? `S${String(track.discNumber).padStart(2, '0')} ` : ''}${track.trackNumber ? `E${String(track.trackNumber).padStart(2, '0')}` : ''}`
      : 'Feature Film'],
    ['Runtime', formatTime(track.duration)],
    ['Resolution', track.resolution || (track.height ? `${track.height}p` : '1080p')],
    ['Video Codec / Format', [track.videoCodec || track.codec, track.format ? track.format.toUpperCase() : null].filter(Boolean).join(' / ') || '—'],
    ['Bitrate', track.bitrate ? `${track.bitrate} kbps` : '—'],
    ['Audio Sample Rate', track.sampleRate ? `${track.sampleRate} Hz` : '—'],
    ['File Size', track.size ? formatBytes(track.size) : '—'],
    ['Source', track.source === 'cloud' ? `Cloud (${track.sourceName || track.sourceId})` : track.source === 'stream' ? 'Network Stream' : 'Local Disk'],
    ['Watch Count', track.playCount || 0],
    ['Path', track.remotePath || track.path || '—']
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card track-info-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="track-info-header">
            <CoverThumb artId={track.artId} fallback="film" className="track-info-cover" />
            <div className="track-info-headings">
              <h3>{track.title}</h3>
              <div className="track-info-sub">{track.artist} • {track.album}</div>
              <div className="track-info-badges">
                {track.resolution && <span className="pill">{track.resolution}</span>}
                {track.videoCodec && <span className="pill">{track.videoCodec}</span>}
                {track.format && <span className="pill">{track.format.toUpperCase()}</span>}
                {track.year && <span className="pill">{track.year}</span>}
              </div>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} title="Close">✕</button>
        </div>

        <div className="track-info-grid">
          {rows.map(([label, val]) => (
            <div key={label} className="track-info-row">
              <span className="track-info-label">{label}</span>
              <span className="track-info-value">{String(val)}</span>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button
            className={`btn btn-sm ${track.loved ? 'btn-accent' : ''}`}
            onClick={() => onToggleLoved && onToggleLoved(track)}
          >
            <Icon name="heart" size={13} fill={track.loved ? 'currentColor' : 'none'} />
            <span>{track.loved ? 'In Watchlist (Loved)' : 'Add to Watchlist (Love)'}</span>
          </button>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
