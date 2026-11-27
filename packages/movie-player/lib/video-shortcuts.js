'use strict';

const VIDEO_SHORTCUTS = [
  { keys: ['Space', 'K'], label: 'Play / pause', bindings: { Space: 'toggle', k: 'toggle', MediaPlayPause: 'toggle' } },
  { keys: ['X'], label: 'Stop playback', bindings: { x: 'stop', MediaStop: 'stop' } },
  { keys: ['← / →', 'J / L'], label: 'Seek 10 seconds', repeat: true,
    bindings: { ArrowLeft: ['seekBy', -10], ArrowRight: ['seekBy', 10], j: ['seekBy', -10], l: ['seekBy', 10] } },
  { keys: ['Shift + ← / →'], label: 'Seek 30 seconds', repeat: true,
    bindings: { 'Shift+ArrowLeft': ['seekBy', -30], 'Shift+ArrowRight': ['seekBy', 30] } },
  { keys: ['Home / End'], label: 'Jump to start / end', bindings: { Home: ['seekFraction', 0], End: ['seekFraction', 1] } },
  { keys: ['0–9'], label: 'Jump to 0–90% of the video',
    bindings: Object.fromEntries(Array.from({ length: 10 }, (_, n) => [n, ['seekFraction', n / 10]])) },
  { keys: ['Ctrl / ⌘ + ← / →', 'Shift + P / N'], label: 'Previous / next in the queue',
    bindings: { 'Ctrl+ArrowLeft': 'prev', 'Ctrl+ArrowRight': 'next', 'Shift+p': 'prev', 'Shift+n': 'next',
      MediaTrackPrevious: 'prev', MediaTrackNext: 'next' } },
  { keys: ['↑ / ↓'], label: 'Raise / lower volume', local: true, repeat: true,
    bindings: { ArrowUp: ['volume', 0.05], ArrowDown: ['volume', -0.05] } },
  { keys: ['M'], label: 'Mute / unmute', local: true, bindings: { m: 'mute' } },
  { keys: ['F', 'F11', 'Alt + Enter'], label: 'Toggle fullscreen', local: true,
    bindings: { f: 'fullscreen', F11: 'fullscreen', 'Alt+Enter': 'fullscreen' } },
  { keys: ['Esc'], label: 'Exit fullscreen', local: true, bindings: { Escape: 'exitFullscreen' } },
  { keys: ['C'], label: 'Toggle subtitles', local: true, bindings: { c: 'subtitles' } },
  { keys: ['[ / ]', '\\'], label: 'Slow down / speed up / reset speed', local: true,
    bindings: { '[': ['speed', -0.25], ']': ['speed', 0.25], '\\': ['speed', 0] } },
  { keys: ['P'], label: 'Toggle picture-in-picture', local: true, bindings: { p: 'pip' } },
  { keys: ['A'], label: 'Switch between fit and fill', local: true, bindings: { a: 'fit' } },
  { keys: ['S'], label: 'Skip the current marked intro or commercial', local: true, bindings: { s: 'skipSegment' } },
  { keys: ['?'], label: 'Show keyboard shortcuts', bindings: { '?': 'help' } },
];

const bindings = new Map(VIDEO_SHORTCUTS.flatMap(({ bindings, repeat, local }) =>
  Object.entries(bindings).map(([key, value]) => {
    const [action, amount] = Array.isArray(value) ? value : [value];
    return [key, { action, amount, repeat, local }];
  }),
));

function findVideoShortcut(event) {
  if (event.defaultPrevented || event.isComposing || event.getModifierState?.('AltGraph')) return undefined;
  const rawKey = event.key === ' ' || event.code === 'Space' ? 'Space' : event.key;
  const key = rawKey.length === 1 ? rawKey.toLowerCase() : rawKey;
  const ctrl = event.ctrlKey || event.metaKey ? 'Ctrl+' : '';
  const alt = event.altKey ? 'Alt+' : '';
  const shift = event.shiftKey && key !== '?' ? 'Shift+' : '';
  return bindings.get(ctrl + alt + shift + key);
}

module.exports = { VIDEO_SHORTCUTS, findVideoShortcut };
