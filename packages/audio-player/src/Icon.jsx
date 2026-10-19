import React from 'react';

const ICON_PATHS = {
  play: <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none" />,
  pause: <g fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></g>,
  prev: <g><polygon points="19 5 9 12 19 19 19 5" fill="currentColor" stroke="none" /><line x1="5" y1="5" x2="5" y2="19" /></g>,
  next: <g><polygon points="5 5 15 12 5 19 5 5" fill="currentColor" stroke="none" /><line x1="19" y1="5" x2="19" y2="19" /></g>,
  note: <g><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></g>,
  list: <g><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></g>,
  library: <g><path d="M4 19V5" /><path d="M9 19V5" /><path d="M14 19l3-14 4 1-3 14-4-1z" /></g>,
  cloud: <path d="M18 18a4 4 0 0 0 0-8 6 6 0 0 0-11.7 1.5A3.5 3.5 0 0 0 7 18h11z" />,
  wave: <path d="M2 12h3l2-6 4 12 3-9 2 3h6" />,
  speaker: <g><rect x="5" y="2" width="14" height="20" rx="2" /><circle cx="12" cy="14" r="4" /><line x1="12" y1="6" x2="12.01" y2="6" /></g>,
  rain: <g><path d="M18 12a4 4 0 0 0 0-8 6 6 0 0 0-11.7 1.5A3.5 3.5 0 0 0 7 12h11z" /><line x1="8" y1="16" x2="7" y2="20" /><line x1="12" y1="16" x2="11" y2="20" /><line x1="16" y1="16" x2="15" y2="20" /></g>,
  synth: <g><rect x="2" y="6" width="20" height="12" rx="1" /><line x1="7" y1="6" x2="7" y2="18" /><line x1="12" y1="6" x2="12" y2="18" /><line x1="17" y1="6" x2="17" y2="18" /></g>,
  noise: <path d="M3 12h2l1-4 2 8 2-12 2 14 2-10 1 4h6" />,
  x: <g><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></g>,
  up: <polyline points="6 15 12 9 18 15" />,
  down: <polyline points="6 9 12 15 18 9" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />,
  file: <g><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" /><polyline points="14 3 14 8 19 8" /></g>,
  check: <polyline points="5 12 10 17 19 7" />,
  mic: <g><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0" /><line x1="12" y1="18" x2="12" y2="22" /></g>,
};

export function Icon({ name, size = 16 }) {
  return (
    <svg className="icon" xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}
