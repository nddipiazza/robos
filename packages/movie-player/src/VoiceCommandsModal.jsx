import React, { useMemo, useState } from 'react';
import { Icon } from './Icon.jsx';

export default function VoiceCommandsModal({ speakers = [], sampleShow = 'House', sampleMovie = 'Dune', onRunCommand, onClose }) {
  const defaultTvLabel = useMemo(() => {
    if (!speakers.length) return 'Roku TV';
    const roku = speakers.find(s => /roku/i.test(`${s.name || ''} ${s.platformId || ''}`));
    if (roku) return 'Roku TV';
    return speakers[0].name || 'Roku TV';
  }, [speakers]);

  const [selectedTvPhrase, setSelectedTvPhrase] = useState(defaultTvLabel);
  const [customInput, setCustomInput] = useState('');
  const [busyCmd, setBusyCmd] = useState('');
  const [lastResult, setLastResult] = useState(null);

  const tvOptions = useMemo(() => {
    const opts = [];
    const seen = new Set();
    const push = (label, hint) => {
      if (!label || seen.has(label.toLowerCase())) return;
      seen.add(label.toLowerCase());
      opts.push({ label, hint });
    };
    if (speakers.some(s => /roku/i.test(`${s.name || ''} ${s.platformId || ''}`))) {
      push('Roku TV', 'Short alias');
    }
    for (const s of speakers) {
      if (s && s.name) push(s.name, s.ip);
    }
    if (!opts.length) push('Roku TV', 'Named Smart TV');
    push('this computer', 'Local playback');
    return opts;
  }, [speakers]);

  const tvSuffix = selectedTvPhrase === 'this computer'
    ? 'on this computer'
    : `on the "${selectedTvPhrase}"`;

  const categories = useMemo(() => [
    {
      title: 'Random Episodes & Movies on Named Smart TVs',
      items: [
        { cmd: `play a random episode of ${sampleShow} ${tvSuffix}`, desc: 'Picks a random episode across all seasons and queues shuffled episodes next' },
        { cmd: `play a random unwatched episode of ${sampleShow} ${tvSuffix}`, desc: 'Picks randomly only from episodes not yet marked Watched' },
        { cmd: `play a random episode of ${sampleShow} season 2 ${tvSuffix}`, desc: 'Picks a random episode from a specific season' },
        { cmd: `play a random movie ${tvSuffix}`, desc: 'Picks a random feature film from your Movie Player library' },
        { cmd: `play a random unwatched movie ${tvSuffix}`, desc: 'Picks a random movie you have not watched yet' },
        { cmd: `play a random horror movie ${tvSuffix}`, desc: 'Filters random movies by genre (horror, comedy, sci-fi, action, animated) or decade (90s, 1980s)' },
      ],
    },
    {
      title: 'Continue, Specific, Latest & Pilot Episodes on Smart TVs',
      items: [
        { cmd: `continue watching ${sampleShow} ${tvSuffix}`, desc: 'Resumes your exact stopped timestamp or starts the next unwatched episode' },
        { cmd: `play the next episode of ${sampleShow} ${tvSuffix}`, desc: 'Advances to your Next Up episode on the named Smart TV' },
        { cmd: `play ${sampleShow} season 2 episode 5 ${tvSuffix}`, desc: 'Plays an exact season & episode (supports S02E05, 2x05, or spoken numbers)' },
        { cmd: `play the latest episode of ${sampleShow} ${tvSuffix}`, desc: 'Plays the newest episode available in your library' },
        { cmd: `play the pilot of ${sampleShow} ${tvSuffix}`, desc: 'Starts Season 1, Episode 1 from 0:00' },
        { cmd: `play ${sampleMovie} ${tvSuffix}`, desc: 'Streams a movie directly to the named Smart TV' },
      ],
    },
    {
      title: 'Live Smart TV Handoff, Library & Remote Transport',
      items: [
        { cmd: selectedTvPhrase === 'this computer' ? 'move playback to this computer' : `move playback to the "${selectedTvPhrase}"`, desc: 'Transfers the currently playing movie/episode at its live timestamp' },
        ...(selectedTvPhrase !== 'this computer' ? [
          { cmd: `set my default tv to "${selectedTvPhrase}"`, desc: 'Makes this TV the automatic target whenever you do not name a TV' },
          { cmd: `open the movie library ${tvSuffix}`, desc: 'Launches the 10-foot TV remote browser on that Smart TV' },
        ] : []),
        { cmd: 'what is my default tv', desc: 'Speaks your currently configured Default Smart TV' },
        { cmd: `pause ${tvSuffix}`, desc: 'Pauses active playback' },
        { cmd: `resume ${tvSuffix}`, desc: 'Resumes paused playback' },
        { cmd: `next episode ${tvSuffix}`, desc: 'Skips to the next queued episode' },
        { cmd: 'stop casting', desc: 'Disconnects active Smart TV cast session' },
        { cmd: 'list my smart tvs', desc: 'Reads out all paired RobOS Smart TVs and their LAN IPs' },
      ],
    },
    {
      title: 'Watchlist, Episode Cursor & Watch History',
      items: [
        { cmd: `what season of ${sampleShow} did we leave off on`, desc: 'Speaks your last watched episode, when you watched it, and what is Next Up' },
        { cmd: 'what is on my watch list', desc: 'Reads My Watchlist and active Continue Watching shows' },
        { cmd: `add ${sampleShow} to my watch list`, desc: 'Adds a show or movie to My Watchlist' },
        { cmd: `remove ${sampleShow} from my watch list`, desc: 'Removes from My Watchlist and hides from Continue Watching' },
        { cmd: `my current episode of ${sampleShow} is season 2 episode 4`, desc: 'Marks all prior episodes Watched and S02E04 onward Unwatched' },
        { cmd: `mark all episodes of ${sampleShow} as new`, desc: 'Resets all episodes of the show to Unwatched' },
        { cmd: 'import my watch history', desc: 'Imports the newest Plex / Trakt / CSV watch history file from ~/Downloads' },
      ],
    },
  ], [sampleShow, sampleMovie, selectedTvPhrase, tvSuffix]);

  const trigger = async (phrase) => {
    const clean = String(phrase || '').trim();
    if (!clean || !onRunCommand) return;
    setBusyCmd(clean);
    try {
      const res = await onRunCommand(clean);
      setLastResult({ ok: Boolean(res?.ok), command: clean, response: res?.response || res?.error || 'Done.' });
    } catch (err) {
      setLastResult({ ok: false, command: clean, response: err.message });
    } finally {
      setBusyCmd('');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card voice-commands-modal" onClick={(e) => e.stopPropagation()}>
        <div className="vc-modal-header">
          <div>
            <h3>
              <Icon name="mic" size={16} />
              <span>RobOS Voice Assistant — Movie Player &amp; Smart TV Commands</span>
            </h3>
            <p className="subtitle" style={{ marginTop: '3px' }}>
              Say <code>&quot;Commander, …&quot;</code> or <code>&quot;Hey Nabu, …&quot;</code>, or test any command directly below.
            </p>
          </div>
          <button type="button" className="btn-icon-only" title="Close" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="vc-try-bar">
          <form
            className="vc-try-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (customInput.trim()) trigger(customInput);
            }}
          >
            <Icon name="mic" size={14} />
            <input
              type="text"
              placeholder={`Try any voice command, e.g. play a random episode of ${sampleShow} ${tvSuffix}`}
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
            />
            <button type="submit" className="btn-accent" disabled={!customInput.trim() || Boolean(busyCmd)}>
              {busyCmd && busyCmd === customInput.trim() ? 'Running…' : 'Run'}
            </button>
          </form>

          <div className="vc-tv-picker">
            <label htmlFor="vc-tv-select">Target TV in examples:</label>
            <select
              id="vc-tv-select"
              value={selectedTvPhrase}
              onChange={(e) => setSelectedTvPhrase(e.target.value)}
            >
              {tvOptions.map(opt => (
                <option key={opt.label} value={opt.label}>
                  {opt.label}{opt.hint ? ` (${opt.hint})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {lastResult && (
          <div className={`wh-import-banner ${lastResult.ok ? 'ok' : 'err'}`} style={{ margin: '0 0 10px' }}>
            <div className="wh-import-banner-main">
              <strong>{lastResult.ok ? '🎙️ Assistant:' : '⚠ Error:'}</strong>
              <span>{lastResult.response}</span>
            </div>
            <button type="button" className="wh-action-btn" onClick={() => setLastResult(null)}>
              <Icon name="x" size={12} />
            </button>
          </div>
        )}

        <div className="vc-categories-scroll">
          {categories.map((cat) => (
            <div key={cat.title} className="vc-category">
              <h4>{cat.title}</h4>
              <div className="vc-cmd-list">
                {cat.items.map((it) => (
                  <div key={it.cmd} className="vc-cmd-row">
                    <div className="vc-cmd-text">
                      <code>&ldquo;{it.cmd}&rdquo;</code>
                      <span>{it.desc}</span>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary vc-run-btn"
                      disabled={Boolean(busyCmd)}
                      onClick={() => trigger(it.cmd)}
                      title="Run this voice command now"
                    >
                      {busyCmd === it.cmd ? '…' : '▶ Run'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
