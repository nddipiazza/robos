import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { formatDuration, formatLongDuration, plural } from '../lib/library-index.js';

export const DJ_FREQUENCY_LABELS = {
  every: 'Before every song',
  alternate: 'Every other song',
  sometimes: 'Now and then (every third song)',
};

/**
 * The shared RobOS <robos-ai-textarea> (robos-ui), wrapped for React: multi-line,
 * reports its text through onChange and submits on Ctrl+Enter.
 */
export function AiPromptBox({ id, placeholder, initialValue = '', minHeight = 100, onChange, onSubmit }) {
  const hostRef = useRef(null);
  const [missing, setMissing] = useState(false);
  const latest = useRef({ onChange, onSubmit });
  latest.current = { onChange, onSubmit };

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof customElements === 'undefined') return undefined;
    // Built by hand: React 19 would assign `placeholder` as a property, which this
    // element only exposes as a getter. Attributes must be set before it connects.
    const el = document.createElement('robos-ai-textarea');
    el.id = id;
    el.setAttribute('show-submit', 'false');
    el.setAttribute('show-commands', 'false');
    // Requests go to the user's active RobOS agent, not a per-box agent choice.
    el.setAttribute('show-agent', 'false');
    el.setAttribute('placeholder', placeholder);
    el.setAttribute('min-height', String(minHeight));
    host.appendChild(el);

    let alive = true;
    const report = () => latest.current.onChange && latest.current.onChange(String(el.value || ''));
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && String(el.value || '').trim() && latest.current.onSubmit) {
        e.preventDefault();
        latest.current.onSubmit();
      }
    };
    // Set the starting text only once the element is upgraded, so it lands in the editor.
    customElements.whenDefined('robos-ai-textarea').then(() => {
      if (!alive) return;
      if (initialValue && !String(el.value || '').trim()) el.value = initialValue;
      report();
    });
    const timer = setTimeout(() => { if (alive && !customElements.get('robos-ai-textarea')) setMissing(true); }, 4000);
    ['input', 'change', 'keyup'].forEach(t => el.addEventListener(t, report));
    el.addEventListener('keydown', onKey);
    return () => {
      alive = false;
      clearTimeout(timer);
      ['input', 'change', 'keyup'].forEach(t => el.removeEventListener(t, report));
      el.removeEventListener('keydown', onKey);
      el.remove();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="ai-prompt-box">
      <div ref={hostRef} />
      {missing && (
        <p className="ai-note error">RobOS UI components (robos-ui) are not installed, so the prompt box can't load.</p>
      )}
    </div>
  );
}

function useDjVoices() {
  const [voices, setVoices] = useState(null);
  useEffect(() => {
    let alive = true;
    (window.robosAudio?.djVoices ? window.robosAudio.djVoices() : Promise.resolve({ ok: false, voices: {} }))
      .then(res => { if (alive) setVoices(res && res.ok ? res.voices || {} : {}); })
      .catch(() => { if (alive) setVoices({}); });
    return () => { alive = false; };
  }, []);
  return voices;
}

const ENGINE_LABELS = { kokoro: 'Kokoro (offline)', 'edge-tts': 'Edge neural voices (online)', piper: 'Piper (offline)', 'speech-dispatcher': 'System speech' };

export function defaultDjVoice(voices) {
  if (!voices) return '';
  for (const engine of ['kokoro', 'edge-tts', 'piper']) {
    const list = voices[engine] || [];
    const pick = list.find(v => v.gender === 'male' && v.recommended) || list.find(v => v.recommended) || list[0];
    if (pick) return `${engine}:${pick.id}`;
  }
  return '';
}

/**
 * Persona, voice and how often the Virtual DJ talks. Used by the AI playlist
 * dialog and the Now Playing panel's DJ settings.
 */
export function DjSettingsFields({ value, onChange, idPrefix = 'dj' }) {
  const voices = useDjVoices();
  const [previewing, setPreviewing] = useState(false);
  const set = (patch) => onChange({ ...value, ...patch });

  useEffect(() => {
    if (voices && !value.voice) set({ voice: defaultDjVoice(voices) });
  }, [voices]); // eslint-disable-line react-hooks/exhaustive-deps

  const preview = async () => {
    setPreviewing(true);
    try {
      const res = await window.robosAudio.djSynthesize("Hey, you're listening to the RobOS Virtual DJ. Here's what's coming up next.", value.voice);
      if (res && res.ok) {
        const audio = new Audio(`file://${res.filePath.split('/').map(encodeURIComponent).join('/')}`);
        audio.onended = () => setPreviewing(false);
        audio.onerror = () => setPreviewing(false);
        await audio.play();
        return;
      }
    } catch {}
    setPreviewing(false);
  };

  const engines = voices ? Object.entries(voices).filter(([, list]) => list && list.length) : [];
  return (
    <div className="dj-fields">
      <label className="modal-label">Describe your DJ</label>
      <AiPromptBox
        id={`${idPrefix}-persona`}
        minHeight={90}
        initialValue={value.persona || ''}
        placeholder="e.g. A laid-back late-night jazz radio host with a dry sense of humour who keeps it short"
        onChange={(persona) => set({ persona })}
      />
      <div className="dj-row">
        <label className="dj-field">
          <span>Voice</span>
          {engines.length ? (
            <select id={`${idPrefix}-voice`} value={value.voice || ''} onChange={(e) => set({ voice: e.target.value })}>
              {engines.map(([engine, list]) => (
                <optgroup key={engine} label={ENGINE_LABELS[engine] || engine}>
                  {list.map(v => <option key={v.id} value={`${engine}:${v.id}`}>{v.name}</option>)}
                </optgroup>
              ))}
            </select>
          ) : (
            <span className="ai-note">{voices ? 'RobOS voice is not installed; the DJ will use the system voice.' : 'Loading voices…'}</span>
          )}
        </label>
        <label className="dj-field">
          <span>Talks</span>
          <select id={`${idPrefix}-frequency`} value={value.frequency || 'every'} onChange={(e) => set({ frequency: e.target.value })}>
            {Object.entries(DJ_FREQUENCY_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        {engines.length > 0 && (
          <button className="btn-secondary dj-preview" onClick={preview} disabled={previewing || !value.voice}>
            <Icon name="speaker" size={13} /> {previewing ? 'Playing…' : 'Hear voice'}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * "AI Playlist": describe a playlist, optionally add a Virtual DJ, and let the
 * user's RobOS agent pick and order songs from their library.
 */
export function AiPlaylistModal({ initialDj, onClose, onPlay, onSave }) {
  const [request, setRequest] = useState('');
  const [count, setCount] = useState(25);
  const [withDj, setWithDj] = useState(!!(initialDj && initialDj.enabled));
  const [dj, setDj] = useState({ persona: '', voice: '', frequency: 'every', ...(initialDj || {}) });
  const [phase, setPhase] = useState('edit'); // edit | working | result
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [name, setName] = useState('');
  const [agent, setAgent] = useState(null);

  useEffect(() => {
    window.robosAudio?.aiAgentInfo?.().then(setAgent).catch(() => {});
    const off = window.robosAudio?.onAiProgress?.((p) => p && p.message && setProgress(p.message));
    return () => { if (typeof off === 'function') off(); };
  }, []);

  const djReady = !withDj || dj.persona.trim().length > 0;
  const canGenerate = request.trim().length > 0 && djReady && phase !== 'working';

  const generate = async () => {
    if (!canGenerate) return;
    setPhase('working');
    setError('');
    setProgress('Asking your RobOS agent…');
    try {
      const res = await window.robosAudio.aiPlaylistGenerate(request.trim(), count, withDj ? dj : null);
      if (res && res.ok) {
        setResult(res.playlist);
        setName(res.playlist.name);
        setPhase('result');
      } else {
        setError((res && res.error) || 'The agent did not answer.');
        setPhase('edit');
      }
    } catch (err) {
      setError(err.message);
      setPhase('edit');
    }
  };

  const final = () => ({ ...result, name: name.trim() || result.name });

  return (
    <div className="modal-overlay" onClick={phase === 'working' ? undefined : onClose}>
      <div className="modal-card ai-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ai-modal-head">
          <h3><span className="ai-spark">✦</span> AI Playlist</h3>
          <span className="ai-note">
            {agent && agent.ok
              ? <>Built by your RobOS agent · <strong>{agent.api ? agent.api.label || 'API mode' : agent.activeName}</strong></>
              : (agent && agent.error) || 'Built by your RobOS agent'}
          </span>
        </div>

        {phase !== 'result' && (
          <>
            <label className="modal-label">What should it sound like?</label>
            <AiPromptBox
              id="ai-playlist-prompt"
              placeholder="e.g. An hour of upbeat 90s alternative rock for coding — no ballads, end with something mellow"
              onChange={setRequest}
              onSubmit={generate}
            />
            <div className="dj-row">
              <label className="dj-field">
                <span>Songs</span>
                <input
                  id="ai-playlist-count"
                  type="number"
                  min="3"
                  max="100"
                  value={count}
                  onChange={(e) => setCount(Math.max(3, Math.min(100, parseInt(e.target.value, 10) || 25)))}
                />
              </label>
              <label className="dj-toggle">
                <input id="ai-playlist-dj" type="checkbox" checked={withDj} onChange={(e) => setWithDj(e.target.checked)} />
                <span><Icon name="mic" size={14} /> Virtual DJ between songs</span>
              </label>
            </div>
            {withDj && <DjSettingsFields value={dj} onChange={setDj} idPrefix="ai-dj" />}
            {error && <p className="ai-note error" role="alert">{error}</p>}
            {phase === 'working' && (
              <div className="ai-progress" role="status">
                <div className="scan-spinner"></div>
                <span>{progress}</span>
              </div>
            )}
            <div className="modal-actions">
              <button className="btn-secondary" onClick={onClose} disabled={phase === 'working'}>Cancel</button>
              <button id="btn-ai-playlist-generate" className="btn-accent" onClick={generate} disabled={!canGenerate}>
                ✦ {phase === 'working' ? 'Working…' : 'Generate with AI'}
              </button>
            </div>
          </>
        )}

        {phase === 'result' && result && (
          <>
            <input id="ai-playlist-name" className="ai-name-input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Playlist name" />
            <p className="ai-description">{result.description}</p>
            <div className="ai-meta">
              <span className="badge">{plural(result.tracks.length, 'song')}</span>
              <span className="badge">{formatLongDuration(result.tracks.reduce((n, t) => n + (t.duration || 0), 0))}</span>
              {result.dj && <span className="badge"><Icon name="mic" size={11} /> Virtual DJ</span>}
            </div>
            {result.dj && result.dj.intro && <p className="ai-dj-quote">🎙 “{result.dj.intro}”</p>}
            <ol className="ai-track-list">
              {result.tracks.map((t, i) => (
                <li key={`${t.id}-${i}`}>
                  <span className="ai-track-title">{t.title}</span>
                  <span className="ai-track-sub">{t.artist}{t.album ? ` · ${t.album}` : ''}</span>
                  <span className="ai-track-dur">{formatDuration(t.duration)}</span>
                </li>
              ))}
            </ol>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => { setPhase('edit'); setResult(null); }}>Start over</button>
              <button id="btn-ai-playlist-save" className="btn-secondary" onClick={() => onSave(final())}>
                <Icon name="save" size={13} /> Save playlist
              </button>
              <button id="btn-ai-playlist-play" className="btn-accent" onClick={() => onPlay(final())}>
                <Icon name="play" size={12} /> {result.dj ? 'Play with DJ' : 'Play'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Virtual DJ settings for whatever is in the play queue. */
export function DjSettingsModal({ value, onClose, onSave }) {
  const [dj, setDj] = useState({ persona: '', voice: '', frequency: 'every', ...value });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card ai-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ai-modal-head">
          <h3><Icon name="mic" size={16} /> Virtual DJ</h3>
          <span className="ai-note">Your RobOS agent writes a short intro before songs, spoken in the voice you pick.</span>
        </div>
        <DjSettingsFields value={dj} onChange={setDj} idPrefix="queue-dj" />
        <div className="modal-actions">
          {value.enabled && <button className="btn-secondary" onClick={() => onSave({ ...dj, enabled: false })}>Turn DJ off</button>}
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button id="btn-dj-save" className="btn-accent" disabled={!dj.persona.trim()} onClick={() => onSave({ ...dj, enabled: true })}>
            <Icon name="mic" size={13} /> {value.enabled ? 'Save' : 'Start DJ'}
          </button>
        </div>
      </div>
    </div>
  );
}
