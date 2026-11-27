import React, { useEffect, useRef } from 'react';
import { VIDEO_SHORTCUTS } from '../lib/video-shortcuts.js';

export default function VideoShortcutHelp({ local, onClose }) {
  const dialog = useRef(null);
  useEffect(() => { dialog.current.showModal(); }, []);
  const close = () => {
    dialog.current.close();
    onClose();
  };

  return (
    <dialog ref={dialog} className="video-segments-dialog video-shortcuts-dialog" aria-labelledby="video-shortcuts-heading"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onKeyDown={(event) => {
        if (event.key === '?') { event.preventDefault(); close(); }
      }}>
      <h2 id="video-shortcuts-heading">Keyboard shortcuts</h2>
      <dl className="video-shortcuts-list">
        {VIDEO_SHORTCUTS.filter(shortcut => local || !shortcut.local).map(({ keys, label }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{keys.map(key => <kbd key={key}>{key}</kbd>)}</dd>
          </div>
        ))}
      </dl>
      <footer><button type="button" className="btn-secondary" onClick={close} autoFocus>Close</button></footer>
    </dialog>
  );
}
