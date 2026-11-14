'use strict';

let currentSnapshot = null;
let liveAudioCtx = null;
let liveMediaStream = null;
let liveRafId = null;

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showStatus(message, isError = false) {
  const el = document.getElementById('status-banner');
  if (!el) return;
  el.textContent = message;
  el.className = `status-banner${isError ? ' error' : ''}`;
  el.classList.remove('hidden');
}

function dbToPercent(db) {
  if (!Number.isFinite(db) || db <= -72) return 0;
  return Math.max(0, Math.min(100, ((db + 72) / 72) * 100));
}

function setMeter(peakDb, labelText) {
  const fill = document.getElementById('meter-fill');
  const readout = document.getElementById('meter-db-readout');
  const label = document.getElementById('meter-status-label');
  if (fill) fill.style.width = `${dbToPercent(peakDb).toFixed(1)}%`;
  if (readout) readout.textContent = `${peakDb <= -90 ? '-∞' : peakDb.toFixed(1)} dBFS`;
  if (label && labelText) label.textContent = labelText;
}

function renderSnapshot(snap) {
  if (!snap || !snap.ok) {
    showStatus(snap?.error || 'Could not inspect Linux audio devices.', true);
    return;
  }
  currentSnapshot = snap;

  const fr = snap.focusrite || { connected: false };
  const clk = snap.clock || { effectiveRate: 48000, effectiveQuantum: 1024, latencyMs: 21.33, forceQuantum: 0, quantum: 1024 };
  const pill = document.getElementById('header-hw-pill');
  if (pill) {
    if (fr.connected) {
      pill.textContent = `● ${fr.model} · ${(clk.effectiveRate / 1000).toFixed(clk.effectiveRate % 1000 ? 1 : 0)}kHz / ${fr.bits}-bit`;
      pill.className = 'hw-pill connected';
    } else {
      pill.textContent = `PipeWire ${(clk.effectiveRate / 1000).toFixed(0)}kHz · No USB Interface`;
      pill.className = 'hw-pill';
    }
  }

  // 1. Focusrite / Hardware Card
  const cardSlot = document.getElementById('interface-card-slot');
  if (fr.connected) {
    const syncBadges = fr.mixer?.syncValid
      ? `Internal ${fr.mixer.syncValid.internal ? '✓' : '—'} · S/PDIF ${fr.mixer.syncValid.spdif ? '✓' : '—'} · ADAT ${fr.mixer.syncValid.adat ? '✓' : '—'}`
      : 'Locked';
    cardSlot.innerHTML = `
      <div class="card card-focusrite" id="focusrite-card">
        <div class="fr-header">
          <div class="fr-title-wrap">
            <span class="badge-connected">● CONNECTED</span>
            <span class="badge-Scarlett">FOCUSRITE PRO-AUDIO</span>
            <span class="fr-name">${esc(fr.model)}</span>
          </div>
          <span class="mono">USB ID ${esc(fr.usbId || '')} · ALSA ${esc(fr.alsaDevice || '')}${fr.serial ? ` · SN ${esc(fr.serial)}` : ''}</span>
        </div>
        <div class="specs-grid">
          <div class="spec-item"><span class="k">Linux Driver</span><span class="v">snd_usb_audio + PipeWire (Native)</span></div>
          <div class="spec-item"><span class="k">Hardware I/O</span><span class="v">${fr.maxCaptureChannels} Inputs / ${fr.maxPlaybackChannels} Outputs</span></div>
          <div class="spec-item"><span class="k">Sample Format</span><span class="v">${fr.bits}-bit PCM (${esc(fr.format)})</span></div>
          <div class="spec-item"><span class="k">USB Transport</span><span class="v">${esc(fr.usbSpeed)}</span></div>
          <div class="spec-item"><span class="k">Supported Rates</span><span class="v">${(fr.sampleRates || []).map(r => `${r / 1000}k`).join(', ')} Hz</span></div>
          <div class="spec-item"><span class="k">Firmware &amp; Sync</span><span class="v">FW ${esc(fr.mixer?.firmwareVersion || 'OK')} · ${syncBadges}</span></div>
        </div>
      </div>
    `;
  } else {
    cardSlot.innerHTML = `
      <div class="card" id="focusrite-card">
        <div class="fr-header">
          <div class="fr-title-wrap">
            <span class="fr-name">No Focusrite USB Interface Detected</span>
          </div>
        </div>
        <p class="subtitle" style="margin-bottom:0;">${esc(fr.hint || 'Connect your Focusrite Scarlett / Clarett USB interface.')}</p>
      </div>
    `;
  }

  // 2. Inputs & Outputs Selectors
  const inSel = document.getElementById('select-input-device');
  const outSel = document.getElementById('select-output-device');
  const activeInName = snap.activeInput?.name || '';
  const activeOutName = snap.activeOutput?.name || '';

  inSel.innerHTML = (snap.inputs || []).map(n =>
    `<option value="${esc(n.name)}" data-node-id="${n.id}"${n.name === activeInName ? ' selected' : ''}>${n.isDefault ? '★ ' : ''}${esc(n.description)}</option>`
  ).join('');

  outSel.innerHTML = (snap.outputs || []).map(n =>
    `<option value="${esc(n.name)}" data-node-id="${n.id}"${n.name === activeOutName ? ' selected' : ''}>${n.isDefault ? '★ ' : ''}${esc(n.description)}</option>`
  ).join('');

  // 3. Rate & Quantum
  const rateSel = document.getElementById('select-sample-rate');
  const rates = fr.connected && fr.sampleRates?.length ? fr.sampleRates : [44100, 48000, 88200, 96000];
  rateSel.innerHTML = rates.map(r =>
    `<option value="${r}"${clk.effectiveRate === r ? ' selected' : ''}>${(r / 1000).toFixed(r % 1000 ? 1 : 0)} kHz (${r} Hz)</option>`
  ).join('');

  const qSel = document.getElementById('select-quantum');
  const qChoices = [
    { v: 0, label: `Auto / Dynamic (${clk.quantum} samples)` },
    { v: 64, label: `64 samples (${((64 / clk.effectiveRate) * 1000).toFixed(2)} ms — Ultra-Low Latency)` },
    { v: 128, label: `128 samples (${((128 / clk.effectiveRate) * 1000).toFixed(2)} ms — Studio Tracking)` },
    { v: 256, label: `256 samples (${((256 / clk.effectiveRate) * 1000).toFixed(2)} ms — Balanced)` },
    { v: 512, label: `512 samples (${((512 / clk.effectiveRate) * 1000).toFixed(2)} ms — Heavy FX Mixing)` },
    { v: 1024, label: `1024 samples (${((1024 / clk.effectiveRate) * 1000).toFixed(2)} ms — Safe Playback)` },
  ];
  qSel.innerHTML = qChoices.map(q =>
    `<option value="${q.v}"${clk.forceQuantum === q.v ? ' selected' : ''}>${esc(q.label)}</option>`
  ).join('');

  document.getElementById('stat-rate').textContent = `${clk.effectiveRate} Hz`;
  document.getElementById('stat-quantum').textContent = `${clk.effectiveQuantum} smp`;
  document.getElementById('stat-latency').textContent = `${clk.latencyMs} ms`;

  // 4. Focusrite Hardware Preamp & Clock Controls
  const mixerSlot = document.getElementById('focusrite-mixer-slot');
  if (fr.connected && fr.mixer && (fr.mixer.preamps?.length || fr.mixer.phantomBanks?.length)) {
    const banksHtml = (fr.mixer.phantomBanks || []).map(b => `
      <button type="button"
        class="hw-toggle ${b.enabled ? 'on-48v' : 'off-48v'}"
        data-hw-card="${fr.alsaCardIndex}"
        data-hw-control="${esc(b.control)}"
        data-hw-val="${!b.enabled}">
        ⚡ ${esc(b.label)}: ${b.enabled ? 'ON' : 'OFF'}
      </button>
    `).join('');

    const clockSelectHtml = fr.mixer.clockSource?.options?.length ? `
      <label class="mono" style="display:flex;align-items:center;gap:6px;">
        Clock:
        <select id="select-fr-clock" class="select" style="height:32px;width:auto;">
          ${fr.mixer.clockSource.options.map(opt => `<option value="${esc(opt)}"${opt === fr.mixer.clockSource.value ? ' selected' : ''}>${esc(opt)}</option>`).join('')}
        </select>
      </label>
    ` : '';

    const stripsHtml = (fr.mixer.preamps || []).map(p => `
      <div class="preamp-strip">
        <div class="preamp-ch-title">${esc(p.label)}</div>
        ${p.level !== null ? `
          <button type="button"
            class="hw-toggle ${p.level === 'Inst' ? 'on-inst' : ''}"
            data-hw-card="${fr.alsaCardIndex}"
            data-hw-control="Line In ${p.channel} Level"
            data-hw-enum="${p.level === 'Inst' ? 'Line' : 'Inst'}"
            title="Toggle Line vs Hi-Z Instrument impedance">
            ${p.level === 'Inst' ? '🎸 Inst (Hi-Z)' : 'Line'}
          </button>
        ` : `<div style="height:28px;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted);">Mic / Line</div>`}
        ${p.air !== null ? `
          <button type="button"
            class="hw-toggle ${p.air ? 'on-air' : ''}"
            data-hw-card="${fr.alsaCardIndex}"
            data-hw-control="Line In ${p.channel} Air"
            data-hw-val="${!p.air}"
            title="Focusrite ISA Transformer Air Preamp Mode">
            Air ${p.air ? 'ON' : 'OFF'}
          </button>
        ` : ''}
        ${p.pad !== null ? `
          <button type="button"
            class="hw-toggle ${p.pad ? 'on-pad' : ''}"
            data-hw-card="${fr.alsaCardIndex}"
            data-hw-control="Line In ${p.channel} Pad"
            data-hw-val="${!p.pad}"
            title="-10 dB Attenuation Pad">
            Pad ${p.pad ? '-10dB' : 'OFF'}
          </button>
        ` : ''}
      </div>
    `).join('');

    mixerSlot.innerHTML = `
      <div class="card" id="focusrite-preamp-card">
        <div class="preamp-header">
          <div>
            <h2 class="card-title" style="margin-bottom:2px;">Focusrite Hardware Preamps &amp; DSP (${fr.mixer.totalMixerControls} Kernel Controls Active)</h2>
            <span class="hint">Direct hardware control over USB via mainline Linux <code>snd_usb_audio</code> Scarlett driver.</span>
          </div>
          <div class="phantom-group">
            ${clockSelectHtml}
            ${banksHtml}
          </div>
        </div>
        <div class="preamp-strip-grid">${stripsHtml}</div>
      </div>
    `;

    mixerSlot.querySelectorAll('[data-hw-control]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cardIndex = Number(btn.dataset.hwCard);
        const control = btn.dataset.hwControl;
        const value = btn.dataset.hwEnum !== undefined ? btn.dataset.hwEnum : (btn.dataset.hwVal === 'true');
        btn.disabled = true;
        const res = await window.robos.setFocusriteControl({ cardIndex, control, value });
        if (res?.ok) {
          renderSnapshot(res.snapshot);
          showStatus(`✓ Updated Focusrite hardware "${control}" → ${value}`);
        } else {
          btn.disabled = false;
          showStatus(`Hardware control failed: ${res?.error || 'Unknown error'}`, true);
        }
      });
    });

    document.getElementById('select-fr-clock')?.addEventListener('change', async (e) => {
      const value = e.target.value;
      const res = await window.robos.setFocusriteControl({
        cardIndex: fr.alsaCardIndex,
        control: 'Clock Source Clock Source',
        value,
      });
      if (res?.ok) {
        renderSnapshot(res.snapshot);
        showStatus(`✓ Focusrite clock source set to ${value}`);
      } else {
        showStatus(`Clock change failed: ${res?.error || 'Unknown error'}`, true);
      }
    });
  } else {
    mixerSlot.innerHTML = '';
  }

  // 5. Discovered Endpoints List
  document.getElementById('inputs-count-heading').textContent = `Capture Inputs (${snap.inputs?.length || 0})`;
  document.getElementById('outputs-count-heading').textContent = `Playback Outputs (${snap.outputs?.length || 0})`;

  document.getElementById('inputs-list').innerHTML = (snap.inputs || []).map(n => `
    <li class="endpoint-item ${n.isFocusrite ? 'is-fr' : ''} ${n.isDefault ? 'is-default' : ''}">
      <span>${n.isDefault ? '★ ' : ''}${esc(n.description)}</span>
      <span class="mono" style="color:var(--muted);">PW #${n.id}</span>
    </li>
  `).join('');

  document.getElementById('outputs-list').innerHTML = (snap.outputs || []).map(n => `
    <li class="endpoint-item ${n.isFocusrite ? 'is-fr' : ''} ${n.isDefault ? 'is-default' : ''}">
      <span>${n.isDefault ? '★ ' : ''}${esc(n.description)}</span>
      <span class="mono" style="color:var(--muted);">PW #${n.id}</span>
    </li>
  `).join('');

  const readyCopy = document.getElementById('studio-ready-copy');
  if (readyCopy && fr.connected) {
    readyCopy.textContent = `Connected to ${fr.model} (${fr.maxCaptureChannels} In / ${fr.maxPlaybackChannels} Out @ ${clk.effectiveRate} Hz, ${clk.latencyMs} ms). Ready to build tracks and record!`;
  }
}

async function toggleLiveMonitor() {
  const btn = document.getElementById('btn-live-monitor');
  if (liveMediaStream) {
    if (liveRafId) cancelAnimationFrame(liveRafId);
    liveRafId = null;
    liveMediaStream.getTracks().forEach(t => t.stop());
    liveMediaStream = null;
    if (liveAudioCtx) {
      try { await liveAudioCtx.close(); } catch {}
      liveAudioCtx = null;
    }
    btn.textContent = 'Start Live Mic Meter';
    setMeter(-96, 'Input Signal Meter');
    return;
  }

  try {
    // Route selected PipeWire source as default first so WebAudio opens that input
    const inSel = document.getElementById('select-input-device');
    const inOpt = inSel?.selectedOptions?.[0];
    if (inOpt?.dataset?.nodeId) {
      await window.robos.saveAudioEngine({
        defaultInputId: Number(inOpt.dataset.nodeId),
        preferredInputNodeName: inSel.value,
      });
    }
    liveMediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    liveAudioCtx = new AudioContext();
    const src = liveAudioCtx.createMediaStreamSource(liveMediaStream);
    const analyser = liveAudioCtx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    btn.textContent = 'Stop Live Mic Meter';

    const tick = () => {
      if (!liveMediaStream) return;
      analyser.getFloatTimeDomainData(buf);
      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const a = Math.abs(buf[i]);
        if (a > peak) peak = a;
      }
      const db = peak <= 0.000015 ? -96 : 20 * Math.log10(peak);
      setMeter(db, 'Live Input Signal');
      liveRafId = requestAnimationFrame(tick);
    };
    tick();
  } catch (err) {
    showStatus(`Could not open live WebAudio stream: ${err.message}`, true);
  }
}

function switchView(viewId) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === viewId));
  document.getElementById('view-audio-devices').classList.toggle('hidden', viewId !== 'audio-devices');
  document.getElementById('view-studio-stage').classList.toggle('hidden', viewId !== 'studio-stage');
  document.getElementById('header-crumb').textContent =
    viewId === 'audio-devices' ? 'Preferences › Audio Devices' : 'Workstation › Recording Studio';
}

async function init() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  document.getElementById('btn-back-to-audio-prefs')?.addEventListener('click', () => switchView('audio-devices'));

  document.getElementById('btn-rescan')?.addEventListener('click', async () => {
    const snap = await window.robos.getAudioSnapshot();
    renderSnapshot(snap);
    showStatus(snap.focusrite?.connected
      ? `✓ Connected to ${snap.focusrite.model} (${snap.inputs.length} inputs, ${snap.outputs.length} outputs)`
      : 'Rescanned PipeWire & ALSA audio bus.');
  });

  document.getElementById('btn-apply-engine')?.addEventListener('click', async () => {
    const inSel = document.getElementById('select-input-device');
    const outSel = document.getElementById('select-output-device');
    const inOpt = inSel?.selectedOptions?.[0];
    const outOpt = outSel?.selectedOptions?.[0];
    const res = await window.robos.saveAudioEngine({
      sampleRate: Number(document.getElementById('select-sample-rate').value),
      quantum: Number(document.getElementById('select-quantum').value),
      defaultInputId: inOpt ? Number(inOpt.dataset.nodeId) : undefined,
      defaultOutputId: outOpt ? Number(outOpt.dataset.nodeId) : undefined,
      preferredInputNodeName: inSel?.value || '',
      preferredOutputNodeName: outSel?.value || '',
    });
    if (res?.ok) {
      renderSnapshot(res.snapshot);
      showStatus(`✓ Applied: ${res.snapshot.clock.effectiveRate} Hz · ${res.snapshot.clock.effectiveQuantum} samples (${res.snapshot.clock.latencyMs} ms latency)`);
    } else {
      showStatus(`Failed to apply engine settings: ${res?.error || 'Unknown error'}`, true);
    }
  });

  document.getElementById('btn-test-input')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const target = document.getElementById('select-input-device')?.value || '';
    btn.disabled = true;
    showStatus('Capturing 1.5s test sample from selected input…');
    const res = await window.robos.testInputCapture({ targetNodeName: target, durationMs: 1500 });
    btn.disabled = false;
    if (res?.ok) {
      setMeter(res.peakDb, 'Last 1.5s Capture Peak');
      showStatus(`✓ Captured ${res.samples} samples @ 48kHz — Peak: ${res.peakDb} dBFS · RMS: ${res.rmsDb} dBFS`);
    } else {
      showStatus(`Input test failed: ${res?.error || 'No signal'}`, true);
    }
  });

  document.getElementById('btn-play-tone')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const target = document.getElementById('select-output-device')?.value || '';
    btn.disabled = true;
    showStatus('Playing studio A-major chime on selected output…');
    const res = await window.robos.playTestTone({ targetNodeName: target });
    btn.disabled = false;
    if (res?.ok) {
      showStatus('✓ Played studio test chime on selected output.');
    } else {
      showStatus(`Output test failed: ${res?.error || 'Playback error'}`, true);
    }
  });

  document.getElementById('btn-live-monitor')?.addEventListener('click', toggleLiveMonitor);

  window.robos.onHardwareChanged((snap) => {
    renderSnapshot(snap);
    showStatus(snap.focusrite?.connected
      ? `🔌 USB Hotplug: ${snap.focusrite.model} connected!`
      : '🔌 USB audio device state changed.');
  });

  const snap = await window.robos.getAudioSnapshot();
  renderSnapshot(snap);
}

init();
