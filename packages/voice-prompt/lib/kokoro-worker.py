#!/usr/bin/env python3
"""
Persistent Kokoro-82M ONNX Speech Synthesis Worker.
Keeps Kokoro loaded in memory so synthesis requests execute in ~0.3-0.8s without 2.0s Python cold-start overhead.
Reads JSON lines from stdin, synthesizes, and writes JSON lines to stdout.
"""
import sys
import json
import os
import soundfile as sf
from kokoro_onnx import Kokoro

KOKORO_DIR = os.path.expanduser('~/.local/share/kokoro')
KOKORO_MODEL = os.path.join(KOKORO_DIR, 'kokoro-v1.0.onnx')
KOKORO_VOICES = os.path.join(KOKORO_DIR, 'voices-v1.0.bin')

def main():
    kokoro = None
    try:
        kokoro = Kokoro(KOKORO_MODEL, KOKORO_VOICES)
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
            text = req.get("text", "")
            out_wav = req.get("outWav", "")
            voice = req.get("voice", "af_heart")
            speed = float(req.get("speed", 1.0))

            samples, sample_rate = kokoro.create(text, voice=voice, speed=speed, lang="en-us")
            sf.write(out_wav, samples, sample_rate)
            dur_ms = int((len(samples) / sample_rate) * 1000)

            sys.stdout.write(json.dumps({"id": req_id, "ok": True, "durationMs": dur_ms, "filePath": out_wav}) + "\n")
            sys.stdout.flush()
        except Exception as e:
            sys.stdout.write(json.dumps({"id": req.get("id"), "ok": False, "error": str(e)}) + "\n")
            sys.stdout.flush()

if __name__ == "__main__":
    main()
