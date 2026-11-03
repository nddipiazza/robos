# Hillary character dialogue

The `hillary_*.ogg` clips are synthetic game dialogue produced with the stock
Microsoft neural voice `en-US-AriaNeural`. The transcript and synthesis settings
are recorded in `hillary-voice-lines.json`. Existing dialogue/subtitles retain
their text; generic action fallbacks use short character responses.

Regenerate with `scripts/games/generate-hillary-voice.py` (development-only
dependencies: `edge-tts` and FFmpeg). Clips are mono Ogg Vorbis at 44.1 kHz,
normalized to -18 LUFS with a -1.5 dB true-peak target. The game plays bundled
audio offline and does not call a speech service at runtime.
