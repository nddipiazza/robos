/**
 * Shared artwork caching & time/byte formatting utilities for the RobOS Movie Player UI.
 */

import React, { useState, useEffect } from 'react';
import { Icon } from './Icon';

const artUrlCache = new Map();

export function useArtUrl(artId) {
  const [url, setUrl] = useState(() => (artId && artUrlCache.has(artId) ? artUrlCache.get(artId) : null));

  useEffect(() => {
    if (!artId) {
      setUrl(null);
      return;
    }
    if (artUrlCache.has(artId)) {
      setUrl(artUrlCache.get(artId));
      return;
    }
    let cancelled = false;
    window.robosAudio.getArtUrl(artId).then(resolved => {
      if (resolved) artUrlCache.set(artId, resolved);
      if (!cancelled) setUrl(resolved);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [artId]);

  return url;
}

export function CoverThumb({ artId, fallback = 'film', className = 'card-cover' }) {
  const url = useArtUrl(artId);
  const iconName = fallback === '♪' ? 'film' : fallback;
  return (
    <div className={className}>
      {url ? <img src={url} alt="" loading="lazy" /> : <Icon name={iconName} size={22} />}
    </div>
  );
}

export function formatTime(sec) {
  if (!sec || !Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatBytes(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
