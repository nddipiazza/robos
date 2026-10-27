/**
 * Right-Side Collapsible Now Playing Queue Dock for RobOS Movie Player
 */

import React from 'react';
import { Icon } from './Icon';
import { VirtualTable } from './virtual';
import { CoverThumb, formatTime } from './library-ui';

export function NowPlayingPanel({
  queue = [],
  currentTrack = null,
  isPlaying = false,
  collapsed = false,
  width = 280,
  onToggleCollapse,
  onPlayTrack,
  onRemoveFromQueue,
  onClearQueue,
  onMoveQueueItem
}) {
  if (collapsed) {
    return (
      <aside className="np-panel collapsed" title="Expand Screening Queue">
        <button className="np-expand-btn" onClick={onToggleCollapse}>
          <Icon name="list" size={16} />
          <span className="np-badge-count">{queue.length}</span>
        </button>
      </aside>
    );
  }

  const totalSec = queue.reduce((s, t) => s + (t.duration || 0), 0);

  return (
    <aside className="np-panel" style={{ width, minWidth: width }}>
      <div className="np-header">
        <div className="np-title-block">
          <div className="np-title">
            <Icon name="list" size={14} />
            <span>Screening Queue</span>
          </div>
          <div className="np-subtitle">
            {queue.length.toLocaleString()} films • {formatTime(totalSec)}
          </div>
        </div>
        <div className="np-header-actions">
          {queue.length > 0 && (
            <button className="btn btn-xs" onClick={onClearQueue} title="Clear queue">
              Clear
            </button>
          )}
          <button className="btn-icon" onClick={onToggleCollapse} title="Collapse queue panel">
            ✕
          </button>
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="np-empty">
          <Icon name="film" size={28} />
          <div>Screening queue is empty</div>
          <small>Double-click any movie or click + to queue a marathon</small>
        </div>
      ) : (
        <VirtualTable
          items={queue}
          rowHeight={48}
          className="np-list"
          renderRow={(track, idx) => {
            const active = currentTrack && currentTrack.id === track.id;
            return (
              <div
                key={`${track.id}-${idx}`}
                className={`np-item ${active ? 'active' : ''}`}
                onDoubleClick={() => onPlayTrack(track, queue)}
              >
                <button
                  className="np-play-indicator"
                  onClick={() => onPlayTrack(track, queue)}
                  title="Play this film"
                >
                  {active ? (
                    <Icon name={isPlaying ? 'volume' : 'pause'} size={13} />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </button>
                <CoverThumb artId={track.artId} fallback="film" className="np-item-art" />
                <div className="np-item-meta" onClick={() => onPlayTrack(track, queue)}>
                  <div className="np-item-title">{track.title}</div>
                  <div className="np-item-artist">
                    {track.artist}
                    {track.resolution ? ` • ${track.resolution}` : ''}
                  </div>
                </div>
                <div className="np-item-right">
                  <span className="np-item-dur">{formatTime(track.duration)}</span>
                  <div className="np-item-btns">
                    {onMoveQueueItem && idx > 0 && (
                      <button
                        className="btn-icon np-mini-btn"
                        onClick={() => onMoveQueueItem(idx, idx - 1)}
                        title="Move up"
                      >↑</button>
                    )}
                    <button
                      className="btn-icon np-mini-btn"
                      onClick={() => onRemoveFromQueue(idx)}
                      title="Remove from queue"
                    >✕</button>
                  </div>
                </div>
              </div>
            );
          }}
        />
      )}
    </aside>
  );
}
