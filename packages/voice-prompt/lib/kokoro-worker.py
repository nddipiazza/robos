#!/usr/bin/env python3
"""
Persistent Kokoro-82M ONNX Speech Synthesis Worker.
Keeps Kokoro loaded in memory so synthesis requests execute in ~0.3-0.8s without 2.0s Python cold-start overhead.
Reads JSON lines from stdin, synthesizes, and writes JSON lines to stdout.
"""
import sys
import json
import os
import wave
import soundfile as sf
from kokoro_onnx import Kokoro

KOKORO_DIR = os.path.expanduser('~/.local/share/kokoro')
KOKORO_MODEL = os.path.join(KOKORO_DIR, 'kokoro-v1.0.onnx')
KOKORO_VOICES = os.path.join(KOKORO_DIR, 'voices-v1.0.bin')

PIPER_DIR = os.path.expanduser('~/.local/share/piper/voices')
PIPER_DEFAULT_MODEL = os.path.join(PIPER_DIR, 'en_US-lessac-medium/en_US-lessac-medium.onnx')

def main():
    kokoro = None
    piper_voices = {}
    try:
        if os.path.exists(KOKORO_MODEL) and os.path.exists(KOKORO_VOICES):
            kokoro = Kokoro(KOKORO_MODEL, KOKORO_VOICES)
        if os.path.exists(PIPER_DEFAULT_MODEL):
            try:
                from piper.voice import PiperVoice
                piper_voices['en_US-lessac-medium'] = PiperVoice.load(PIPER_DEFAULT_MODEL)
            except Exception:
                pass
        sys.stdout.write(json.dumps({"type": "ready"}) + "\n")
        sys.stdout.flush()
    except Exception as e:
        sys.stdout.write(json.dumps({"type": "error", "error": str(e)}) + "\n")
        sys.stdout.flush()
        sys.exit(1)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            if req.get("type") == "shutdown":
                break
            req_id = req.get("id")
            engine = req.get("engine", "kokoro")
            text = req.get("text", "")
            out_wav = req.get("outWav", "")
            voice = req.get("voice", "af_heart")
            speed = float(req.get("speed", 1.0))

            if engine == "piper":
                from piper.voice import PiperVoice
                v_key = voice if voice and not voice.startswith(('af_', 'am_', 'bf_', 'bm_')) else 'en_US-lessac-medium'
                if v_key not in piper_voices:
                    m_path = v_key if (v_key.endswith('.onnx') or '/' in v_key) else os.path.join(PIPER_DIR, f"{v_key}/{v_key}.onnx")
                    piper_voices[v_key] = PiperVoice.load(m_path)
                p_voice = piper_voices[v_key]
                with wave.open(out_wav, "wb") as wf:
                    p_voice.synthesize_wav(text, wf)
                dur_ms = max(300, int(((os.path.getsize(out_wav) - 44) / (22050 * 2)) * 1000))
                sys.stdout.write(json.dumps({"id": req_id, "ok": True, "durationMs": dur_ms, "filePath": out_wav, "engine": "piper"}) + "\n")
                sys.stdout.flush()
            else:
                if kokoro is None:
                    raise RuntimeError("Kokoro model not loaded")
                samples, sample_rate = kokoro.create(text, voice=voice, speed=speed, lang="en-us")
                sf.write(out_wav, samples, sample_rate)
                dur_ms = int((len(samples) / sample_rate) * 1000)

                sys.stdout.write(json.dumps({"id": req_id, "ok": True, "durationMs": dur_ms, "filePath": out_wav, "engine": "kokoro"}) + "\n")
                sys.stdout.flush()
        except Exception as e:
            sys.stdout.write(json.dumps({"id": req.get("id"), "ok": False, "error": str(e)}) + "\n")
            sys.stdout.flush()

if __name__ == "__main__":
    main()
