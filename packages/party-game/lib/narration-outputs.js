'use strict';

// Sends the AI host's voice to the outputs the host picked:
//
//   host     this computer (played by the host console window)
//   tvs      main-stage TVs: browser TVs play it in the TV page; Roku TVs get
//            { narration: { id, url } } on their app cast and the RobOS TV
//            channel plays it
//   speaker  an Audio Player device (Google Cast speaker). A Cast speaker
//            plays one stream at a time, so when the RobOS Audio Player is
//            running the line goes through its control API: if the music is
//            on that speaker, the line plays there and the song picks up where
//            it was. Otherwise (Audio Player closed, or playing elsewhere) the
//            line is cast straight to the speaker with the Audio Player's
//            CastService, replacing whatever it was playing.
//
// Each line is synthesized once with RobOS Voice and rendered to a loud, level
// MP3 that every output can play.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const CLIP_DIR = path.join(os.tmpdir(), 'robos-party-narration');

// Normalise to typical speaker loudness and encode as MP3 (Roku and Cast
// speakers both play it; voice engines write quiet, sometimes float WAVs).
// `key` names the output so two lines rendered at once never share a file.
function toMp3(filePath, key = filePath) {
  return new Promise((resolve) => {
    try {
      fs.mkdirSync(CLIP_DIR, { recursive: true });
      const out = path.join(CLIP_DIR, `${crypto.createHash('md5').update(String(key)).digest('hex').slice(0, 16)}.mp3`);
      const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', filePath,
        '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ac', '2', '-ar', '44100', '-codec:a', 'libmp3lame', '-b:a', '128k', out], { stdio: 'ignore' });
      ff.on('error', () => resolve(filePath));
      ff.on('close', (code) => resolve(code === 0 && fs.existsSync(out) && fs.statSync(out).size > 0 ? out : filePath));
    } catch {
      resolve(filePath);
    }
  });
}

// Roku TVs play lines through the same Video node as their keep-alive clip, so
// lines go out in that clip's format: a tiny black H.264 video with AAC audio.
function toRokuMp4(audioPath, key) {
  return new Promise((resolve) => {
    try {
      fs.mkdirSync(CLIP_DIR, { recursive: true });
      const out = path.join(CLIP_DIR, `${crypto.createHash('md5').update(`roku:${key}`).digest('hex').slice(0, 16)}.mp4`);
      const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=15', '-i', audioPath, '-shortest',
        '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0', '-pix_fmt', 'yuv420p', '-g', '30',
        '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-movflags', '+faststart', out], { stdio: 'ignore' });
      ff.on('error', () => resolve(null));
      ff.on('close', (code) => resolve(code === 0 && fs.existsSync(out) && fs.statSync(out).size > 0 ? out : null));
    } catch {
      resolve(null);
    }
  });
}

function probeDurationMs(filePath) {
  return new Promise((resolve) => {
    let out = '';
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', filePath]);
    p.stdout.on('data', (d) => { out += d; });
    p.on('error', () => resolve(null));
    p.on('close', () => {
      const s = Number.parseFloat(out);
      resolve(Number.isFinite(s) ? Math.round(s * 1000) : null);
    });
  });
}

function createNarrationRouter({
  engine,
  getTts,
  tvEngine = null,
  castModule = null, // require('audio-player/lib/cast-service')
  audioPlayer = null, // createAudioPlayerClient() from audio-player/lib/control-server
  configDir,
  getLanIp,
  getGamePort,
  log = () => {},
}) {
  const clips = new Map(); // narration id → Promise<mp3 path | null>
  const rokuClips = new Map(); // narration id → Promise<mp4 path | null>
  let cast = null;

  function getCast() {
    if (!cast && castModule && castModule.CastService) cast = new castModule.CastService();
    return cast;
  }

  // ── Speakers ─────────────────────────────────────────────────────────────

  // Speakers the Audio Player and Home Speaker already found.
  function listSpeakers() {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(configDir, 'home-speakers.json'), 'utf8'));
      return (data.speakers || []).filter((s) => s.ip).map((s) => ({ ip: s.ip, name: s.name || s.ip, model: s.model || '', online: s.online !== false }));
    } catch {
      return [];
    }
  }

  async function scanSpeakers() {
    const c = getCast();
    if (!c) throw new Error('The RobOS Audio Player is not installed, so speakers are unavailable');
    const found = await c.scanSubnet(1500);
    const known = listSpeakers();
    const merged = new Map(known.map((s) => [s.ip, { ...s, online: false }]));
    for (const s of found || []) merged.set(s.ip, { ip: s.ip, name: s.name || s.ip, model: s.model || '', online: true });
    const speakers = [...merged.values()];
    try {
      fs.writeFileSync(path.join(configDir, 'home-speakers.json'), JSON.stringify({ updatedAt: new Date().toISOString(), speakers }, null, 2));
    } catch {}
    return speakers;
  }

  // Returns how the line went out: 'audio-player', 'cast' or null.
  async function playOnSpeaker(ip, file, durationMs = null) {
    if (audioPlayer) {
      const res = await audioPlayer.speakClip({ speakerIp: ip, filePath: file, title: 'RobOS Party Game', artist: 'Your AI host', durationMs, holdMs: 2500 });
      if (res && res.handled) {
        if (!res.ok) log({ msg: 'Audio Player could not play the line', ip, err: res.error });
        return 'audio-player';
      }
    }
    const c = getCast();
    if (!c) return null;
    for (let i = 0; i < 30 && !c.streamPort; i++) await new Promise((r) => setTimeout(r, 50));
    const url = c.registerFile(file, castModule.sniffAudioType ? castModule.sniffAudioType(file) : 'audio/mpeg');
    const res = await c.castMediaUrl(ip, url, { title: 'RobOS Party Game', artist: 'Your AI host', contentType: 'audio/mpeg' });
    if (!res || !res.ok) log({ msg: 'speaker narration failed', ip, err: res && res.error });
    return 'cast';
  }

  // ── Lines ────────────────────────────────────────────────────────────────

  function clip(id, format = 'mp3') {
    return (format === 'mp4' ? rokuClips : clips).get(id) || null;
  }

  function narrationUrl(id, ext = 'mp3') {
    return `http://${getLanIp()}:${getGamePort()}/api/narration/${encodeURIComponent(id)}.${ext}`;
  }

  // Called for every new line the host says.
  function handle(narration) {
    const outputs = engine.state.settings.narrationOutputs || [];
    if (!outputs.length) return;
    const tts = getTts();
    if (!tts) return;
    const job = tts
      .synthesize(narration.text, { kokoroTimeoutMs: 30000 })
      .then((res) => (res && res.ok && res.engine !== 'fallback' ? toMp3(res.filePath, narration.id) : null))
      .catch(() => null);
    clips.set(narration.id, job);
    while (clips.size > 40) clips.delete(clips.keys().next().value);
    const rokuStage = outputs.includes('tvs') && engine.state.tvs.some((tv) => tv.screen === 'stage' && tv.platformId === 'roku-os');
    if (rokuStage) {
      rokuClips.set(narration.id, job.then((file) => (file ? toRokuMp4(file, narration.id) : null)));
      while (rokuClips.size > 40) rokuClips.delete(rokuClips.keys().next().value);
    }

    job.then(async (file) => {
      if (!file) return;
      // Keep the face's lip sync and the phase timer in step with the real audio.
      const ms = await probeDurationMs(file);
      if (ms && engine.state.narration && engine.state.narration.id === narration.id) {
        engine.state.narration.durationMs = ms;
      }
      if (rokuStage && tvEngine && (await rokuClips.get(narration.id))) {
        for (const tv of engine.state.tvs) {
          if (tv.screen !== 'stage' || tv.platformId !== 'roku-os') continue;
          tvEngine.updateAppCast({ tvId: tv.tvId, appId: 'party-game', patch: { narration: { id: narration.id, url: narrationUrl(narration.id, 'mp4') } } });
        }
      }
      const speakerId = engine.state.settings.speakerId;
      if (outputs.includes('speaker') && speakerId) {
        playOnSpeaker(speakerId, file, ms).catch((err) => log({ msg: 'speaker narration failed', err: err.message }));
      }
    });
  }

  function stop() {
    try {
      cast?.stopAllPlayback?.();
    } catch {}
  }

  return { handle, clip, listSpeakers, scanSpeakers, stop, playOnSpeaker, speakersAvailable: () => Boolean(castModule && castModule.CastService) };
}

module.exports = { createNarrationRouter, toMp3, toRokuMp4 };
