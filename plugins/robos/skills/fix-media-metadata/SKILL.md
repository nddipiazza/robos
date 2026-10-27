---
name: fix-media-metadata
description: Inspect, extract, enrich, and write audio/video media metadata and cover art across all known formats (MP3, FLAC, M4A/MP4, OGG, Opus, WAV, AAC, WMA, WebM, MKV) using strictly legal open-source tools (music-metadata, FFmpeg/ffprobe) and open-data APIs (MusicBrainz CC0, Cover Art Archive, LRCLIB).
---

# Open-Source Media Metadata & Artwork Skill (`fix-media-metadata`)

You are an expert media archivist and metadata engineer. When asked to inspect, repair, normalize, or enrich media metadata and artwork, you **strictly use legal, open-source software and open-licensed databases**—never proprietary scraping or closed-source commercial APIs.

## 1. Legal Open-Source Toolchain & Open-Data Sources

| Tool / Source | License | Role |
|---------------|---------|------|
| **`music-metadata`** | MIT | Fast Node.js parser for ID3v1/v2.2/v2.3/v2.4, Vorbis Comments, FLAC `METADATA_BLOCK_PICTURE`, MP4/iTunes `covr` atoms, RIFF/WAV INFO, and ASF/WMA tags |
| **FFmpeg & `ffprobe`** | LGPL v2.1+ / GPL | Container/stream probing (`ffprobe -show_format -show_streams`), lossless tag writing (`-c copy -metadata`), attached picture extraction/embedding, video frame extraction, and audio waveform/spectrum artwork generation |
| **MusicBrainz WS/2 API** | CC0 1.0 Public Domain | Canonical artist, recording, release, release-group, year, track/disc numbering, ISRC, and genre tags (`https://musicbrainz.org/ws/2/`) |
| **Cover Art Archive** | CC0 / Public Domain / Open | Official release cover art hosted by the Internet Archive & MusicBrainz (`https://coverartarchive.org/release/<mbid>/front-500`) |
| **LRCLIB** | MIT / Open Database | Open-source synced (`lrc`) and plain lyrics + canonical track duration/album verification (`https://lrclib.net/api`) |
| **Procedural SVG / FFmpeg Lavfi** | MIT / LGPL | Deterministic album cover synthesis (SVG/PNG typography + `showwavespic` / `showspectrum`) when no external or embedded cover art exists |

> **MusicBrainz Etiquette**: Always send a descriptive `User-Agent` header (e.g., `RobOSAudioPlayer/1.0 (https://github.com/ndipiazza/robos)`) and respect the 1 request/second rate limit.

---

## 2. Supported Media Formats & Container Specifics

Understand how each media container stores tags and visual artwork:

1. **MP3 (`.mp3`) — ID3v2.3 / ID3v2.4 & ID3v1**
   - Text frames: `TIT2` (Title), `TPE1` (Artist), `TPE2` (Album Artist), `TALB` (Album), `TYER`/`TDRC` (Year), `TRCK` (Track/Total), `TPOS` (Disc/Total), `TCON` (Genre), `TCOM` (Composer).
   - Artwork: `APIC` frame (`PictureType: 3` = Cover Front).
   - FFmpeg write flags: `-c copy -id3v2_version 3` (ensures universal player compatibility).

2. **FLAC (`.flac`) — Vorbis Comments & Picture Blocks**
   - Tags: `TITLE`, `ARTIST`, `ALBUMARTIST`, `ALBUM`, `DATE`, `TRACKNUMBER`, `TRACKTOTAL`, `DISCNUMBER`, `DISCTOTAL`, `GENRE`, `COMPOSER`.
   - Artwork: `METADATA_BLOCK_PICTURE` (type 3 front cover).

3. **MP4 / M4A / AAC / ALAC (`.m4a`, `.mp4`, `.aac`, `.m4b`) — iTunes Atoms (`moov.udta.meta.ilst`)**
   - Atoms: `©nam` (Title), `©ART` (Artist), `aART` (Album Artist), `©alb` (Album), `©day` (Date/Year), `trkn` (Track), `disk` (Disc), `©gen` (Genre), `©wrt` (Composer).
   - Artwork: `covr` atom (`-c:v mjpeg` or `png` with `-disposition:v:0 attached_pic`).

4. **OGG Vorbis & Opus (`.ogg`, `.oga`, `.opus`) — Ogg Pages + Vorbis Comments**
   - Tags: Standard Vorbis comments (`TITLE`, `ARTIST`, `ALBUM`, `DATE`, `TRACKNUMBER`, `GENRE`).
   - Artwork: Base64-encoded FLAC picture structure in `METADATA_BLOCK_PICTURE`.

5. **WAV / AIFF (`.wav`, `.aiff`) — RIFF `INFO` Chunk + Embedded ID3v2**
   - `INAM` (Title), `IART` (Artist), `IPRD` (Album), `ICRD` (Year), `IGNR` (Genre), plus `id3 ` chunk for cover art (`-write_id3v2 1`).

6. **Video & Multi-Stream Containers (`.mp4`, `.mkv`, `.webm`, `.avi`, `.mov`)**
   - Audio-player tracks sourced from video containers or music videos often lack audio tags entirely or store the full title in the filename (`Artist - Song Title [Official Video] (1080p).mkv`).
   - Artwork can be extracted from:
     - Attached Matroska cover (`cover.jpg` attachment stream),
     - Embedded `attached_pic` stream, or
     - A representative non-blank video frame at ~15–25% of track duration (`ffmpeg -ss <t> -i input -frames:v 1 -q:v 2 frame.jpg`).

7. **Sidecar & Folder Files (`.cue`, `.nfo`, `.lrc`, `.json`, `cover.jpg`, `folder.png`, `front.webp`)**
   - Check sibling `.cue` sheets for `PERFORMER`, `TITLE`, `REM DATE`, `REM GENRE`, and `TRACK` indices.
   - Check sibling `.lrc` files for `[ti:...]`, `[ar:...]`, `[al:...]`, and `[length:...]`.
   - Check sibling image files (`cover`, `folder`, `front`, `album`, `artwork`, or single image in album directory).

---

## 3. Step-by-Step Metadata Inference & Normalization Rules

When analyzing tracks (via `packages/audio-player/lib/ai-metadata.js` or CLI):

1. **Clean Noisy Filenames & Tags**:
   - Strip scene/ripper noise: `[Official Video]`, `(Official Audio)`, `[HD]`, `(1080p)`, `(Lyrics)`, `[320kbps]`, `[FLAC]`, `www.site.com`, `_`, trailing track hashes (`- [a1b2c3d4]`), and redundant file extensions.
   - Parse structured paths:
     - `<Artist>/<Year> - <Album>/<Disc>-<Track> - <Title>.<ext>`
     - `<Artist>/<Album> (<Year>)/<Track>. <Title>.<ext>`
     - `<Artist> - <Album> - <Track> - <Title>.<ext>`
     - `<Artist> - <Title>.<ext>`
   - Preserve genuine featured artists (`feat. ...`) and remix/live credits (`(Live at ...)`, `(Acoustic Mix)`) in the title.

2. **Cross-Reference Open-Source Databases**:
   - When MusicBrainz / LRCLIB candidates are provided in context, prefer the canonical spelling, capitalization, release year (original release year or album year), `albumArtist`, `trackNumber`/`trackTotal`, `discNumber`/`discTotal`, and primary `genre`.
   - Do **not** hallucinate albums or years if neither the path, existing tags, nor open-source lookup provides reliable evidence; leave uncertain fields null/unchanged rather than guessing wildly.

3. **Artwork Selection Strategy (`coverAction`)**:
   - `"keep"`: Track already has valid cover art (`hasArt: true`) and user did not ask to replace it.
   - `"embedded"`: Extract embedded picture stream or video frame found in the container via FFmpeg / `music-metadata`.
   - `"folder"`: Use discovered sibling folder image (`cover.jpg`, `folder.png`, etc.).
   - `"caa"`: Download official open cover art from the **Cover Art Archive** using the matched MusicBrainz release MBID.
   - `"waveform"`: Generate a clean FFmpeg audio waveform + typography cover from the audio stream (`showwavespic`) when no release cover exists.
   - `"generated"`: Synthesize a crisp, deterministic open-source SVG/PNG album sleeve with the resolved Artist & Album/Title.

---

## 4. Reference CLI Commands (FFprobe & FFmpeg)

### Probe Format, Streams, and Attached Pictures
```bash
ffprobe -v quiet -print_format json -show_format -show_streams "/path/to/media.flac"
```

### Extract Embedded Cover Art or Representative Video Frame
```bash
# Extract attached picture stream without re-encoding
ffmpeg -y -v quiet -i "/path/to/track.mp3" -an -vcodec copy "/tmp/cover.jpg"

# Extract representative frame from video container (.mp4/.mkv/.webm) at 20% duration
ffmpeg -y -v quiet -ss 30 -i "/path/to/music-video.mkv" -frames:v 1 -vf "scale='min(600,iw)':-1" -q:v 2 "/tmp/frame.jpg"
```

### Generate Open-Source Waveform Artwork from Audio Stream
```bash
ffmpeg -y -v quiet -i "/path/to/track.flac" \
  -filter_complex "color=c=0x0f172a:s=600x600[bg];[0:a]showwavespic=s=520x200:colors=0x38bdf8|0x818cf8[fg];[bg][fg]overlay=40:200:format=auto" \
  -frames:v 1 "/tmp/waveform-cover.png"
```

### Losslessly Write Tags & Embed Cover Art
```bash
# MP3 with ID3v2.3 tags + APIC front cover
ffmpeg -y -v quiet -i input.mp3 -i cover.jpg \
  -map 0:a -map 1:v -c copy -id3v2_version 3 \
  -metadata:s:v title="Album cover" -metadata:s:v comment="Cover (front)" -disposition:v:0 attached_pic \
  -metadata title="Track Title" -metadata artist="Artist Name" -metadata album="Album Name" \
  -metadata album_artist="Artist Name" -metadata date="1997" -metadata track="3/12" -metadata genre="Electronic" \
  output.mp3
```

---

## 5. Structured Output Contract for RobOS Audio Player

When invoked by the RobOS Audio Player **AI Fix Metadata** engine, return **only** a JSON object (or fenced ```json block) matching this schema:

```json
{
  "summary": "Brief summary of metadata and artwork fixes",
  "fixes": [
    {
      "id": "trk_1234567890",
      "title": "Canonical Track Title",
      "artist": "Canonical Artist",
      "albumArtist": "Canonical Album Artist",
      "album": "Canonical Album",
      "year": 2001,
      "genre": "Electronic",
      "composer": "Composer Name",
      "trackNumber": 1,
      "trackTotal": 12,
      "discNumber": 1,
      "discTotal": 1,
      "coverAction": "caa",
      "releaseMbid": "optional-musicbrainz-release-uuid",
      "reason": "Cleaned filename tags, matched MusicBrainz release (2001), and selected Cover Art Archive front sleeve"
    }
  ]
}
```
