"""Regenerate the game's stock synthetic character voice (requires edge-tts and FFmpeg)."""
import argparse
import asyncio
import hashlib
import json
import pathlib
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ffmpeg', default='ffmpeg')
parser.add_argument('--voice-tools', help='Optional directory containing edge_tts dependencies')
args = parser.parse_args()
if args.voice_tools:
    sys.path.insert(0, str(pathlib.Path(args.voice_tools).resolve()))
import edge_tts

root = pathlib.Path(__file__).resolve().parents[2]
output = root / 'games/tabletop-rpg/assets/audio/heroes'
manifest = json.loads((output / 'hillary-voice-lines.json').read_text(encoding='utf-8'))
cache = root / 'run/hillary-voice-cache'
cache.mkdir(parents=True, exist_ok=True)

async def main():
    for filename, text in manifest['lines'].items():
        fingerprint = hashlib.sha256((manifest['voice'] + manifest['rate'] + manifest['pitch'] + text).encode()).hexdigest()[:16]
        source = cache / (fingerprint + '.mp3')
        if not source.exists():
            for attempt in range(3):
                try:
                    await edge_tts.Communicate(text, manifest['voice'], rate=manifest['rate'], pitch=manifest['pitch']).save(str(source))
                    break
                except Exception:
                    if attempt == 2:
                        raise
                    await asyncio.sleep(2 * (attempt + 1))
        subprocess.run([args.ffmpeg, '-v', 'error', '-y', '-i', str(source),
                        '-af', 'silenceremove=start_periods=1:start_duration=0.03:start_threshold=-50dB,loudnorm=I=-18:TP=-1.5:LRA=8',
                        '-ar', '44100', '-ac', '1', '-c:a', 'libvorbis', '-q:a', '5', str(output / filename)], check=True)
        print('Generated ' + filename, flush=True)

asyncio.run(main())
