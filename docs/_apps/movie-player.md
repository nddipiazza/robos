---
layout: default
title: RobOS Movie Player
app_id: movie-player
category: System & Utilities
nav_order: 63
---

# RobOS Movie Player (`packages/movie-player`)

**RobOS Movie Player** is a cinema and video player built with the exact same warm dark theater palette (`#15120f`, `#1c1814`, `#26211b`, `#e8a33d`, `#f1e9dc`) and multi-pane architecture as **RobOS Audio Player**, translating every audio player capability to movies, TV series, and video collections.

## Key Features

1. **Cinema Video Stage & Synchronized Transport Deck (`Now Playing`)**:
   - HTML5 `<video>` theater stage with live on-screen subtitle / closed-caption overlay (`CC On/Off`), playback speed selector (`0.5x` – `2x`), aspect fit switcher (`Contain`, `Cover`, `Stretch`), Theater height toggle, Picture-in-Picture (`PiP`), Fullscreen toggle, and PNG Frame Snapshot capture (`~/Pictures/RobOS Movie Snapshots/`).
   - Synchronized `.robos-rhap-theme` transport deck with scrubber, 10-second jump controls, shuffle, repeat, and quick Screen Output / Cast selector.
2. **Synced Subtitles & Dialogue Panel (`src/Lyrics.jsx` / `lib/lyrics.js`)**:
   - Parses sidecar `.srt` (`SubRip`), `.vtt` (`WebVTT`), `.lrc`, or embedded subtitle streams (`ffmpeg`), highlights the active line in real time, and lets you click any dialogue line to seek the movie directly to that timestamp.
3. **100,000-Movie Virtualized Library (`src/Library.jsx` / `lib/library-index.js`)**:
   - Instant sub-15ms filtering and sorting across **Collections/Series**, **Directors/Creators**, **Movies**, **Genres**, **Decades**, **Studios/Writers**, **Watchlist (Loved)**, **Recently Added**, **Recently Watched**, **Most Watched**, and **Folders**.
   - Scene release filename cleaner (`cleanMovieFilename`) automatically strips `2160p`/`1080p`/`BluRay`/`WEB-DL`/`x264`/`HEVC` tags while preserving release year, `SxxExx` episode numbers, resolution badges (`4K`, `1080p`, `720p`), and video codecs.
4. **AI Watchlists & Virtual Cinema Host (`src/AiPlaylist.jsx` / `lib/ai-playlist.js`)**:
   - Describe a movie marathon, director retrospective, or mood and let your configured RobOS AI agent curate and order a watchlist from your library (with a deterministic local fallback).
   - Optional **Virtual Cinema Host** speaks short introductions between films using **RobOS Voice** (or casts the spoken intro directly to your Smart TV).
5. **AI & Open-Data Movie Metadata / Poster Fixer (`src/AiFixMetadata.jsx` / `lib/ai-metadata.js`)**:
   - Uses `ffprobe` stream inspection, `.nfo` sidecar parsing, `ffmpeg` video frame poster extraction, `@skill(robos:fix-media-metadata)`, and a warm cinema SVG poster fallback.
6. **Cloud Cinema Storage (`src/CloudBrowser.jsx` / `lib/cloud-storage.js`)**:
   - Indexes 50,000+ movies from Google Drive, Microsoft OneDrive, Dropbox, and S3 by metadata only, streaming video on-demand via a local HTTP byte-range proxy (`/cloud-stream/:trackId`) with a bounded 2 GB LRU disk cache.
7. **Zero-Cloud Smart TV & Chromecast LAN Streaming (`lib/cast-service.js`)**:
   - Discovers Google TV, Chromecast, and Nest Hub displays via mDNS (`_googlecast._tcp.local`) and streams local or cloud movies over HTTP `206 Partial Content`.
