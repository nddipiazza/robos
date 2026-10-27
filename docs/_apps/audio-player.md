---
title: "RobOS Audio Player"
package: audio-player
category: core-desktop
icon: audio-player.svg
summary: "Open-source audio player, custom playlist engine, procedural focus soundscapes, and zero-cloud Google Cast smart speaker streaming."
description: "Desktop audio deck with React H5 audio playback, custom playlist manager, M3U import/export, interactive queue controls, procedural synthesizers, and local TLS Google Cast streaming."
---

RobOS Audio Player provides high-fidelity audio playback for the developer workstation, complete playlist curation, and seamless zero-cloud audio streaming to physical Google Home and Nest smart speakers on the local network.

![RobOS Audio Player and Playlist Engine Architecture](../assets/images/audio-player-playlist-architecture.jpg)

```mermaid
flowchart TD
    subgraph LibraryAndPlaylists["Media Library & Playlist Manager"]
        FSW["Folder Scanner & File Watcher"] --> MetaEx["Metadata Extractor (music-metadata)"]
        MetaEx --> LibCache[("Audio Library Cache\naudio-library.json")]
        PLCache[("Playlist Store\naudio-playlists.json")] <--> PLManager["Playlist Engine\n(CRUD / Reorder / Seed)"]
        M3U["M3U / M3U8 Exporter & Importer"] <--> PLManager
    end

    subgraph AudioDeck["React Audio Deck & Queue"]
        Deck["Now Playing View\n(react-h5-audio-player)"]
        Queue["Interactive Queue\n(Shuffle, Reorder, Remove)"]
        SaveQueue["Save Queue as Playlist"]
        Deck <--> Queue
        Queue --> SaveQueue
        SaveQueue --> PLManager
    end

    subgraph AmbientEngine["Web Audio API Synthesizers"]
        Rain["Coding Rain\n(Resonant Noise)"]
        Synth["Cyber Synth\n(Dual Saw Oscillators)"]
        Pink["Pink Noise\n(Voss-McCartney Buffer)"]
    end

    subgraph OutputRouting["Dual-Mode Audio Routing"]
        LocalOut["Desktop Sound Output\n(Local DAC / Headphones)"]
        CastStreamer["CastService\nEphemeral HTTP Streamer"]
        LANDiscovery["mDNS / LAN Scanner\nPorts 8008 & 8009"]
    end

    subgraph Speakers["Smart Speakers (LAN)"]
        NestAudio["Google Nest Audio / Home"]
        NestMini["Google Nest Mini"]
        SmartClock["Lenovo / Smart Displays"]
    end

    LibCache --> Deck
    PLManager --> Deck
    AmbientEngine --> LocalOut
    Deck --> LocalOut
    Deck --> CastStreamer
    LANDiscovery --> CastStreamer
    CastStreamer -- "TLS CastV2 / Media Stream" --> Speakers
```

## Features

### Media Library Browser
- **Browse by category**: Albums, Artists, Songs, Genres, Decades and Composers, each with its own sort options and an A–Z jump rail for large lists.
- **Smart collections**: Loved, Recently Added, Recently Played and Most Played, driven by per-track play counts and ♥ marks stored in `~/.config/robos/audio-track-stats.json`. A play counts once a track has been heard for 30 seconds (or half of a short track).
- **Album, artist, genre, decade and composer pages**: artwork header, Play / Shuffle / Play next / Add to queue / Love all, disc-grouped track lists, "More by this artist", "Appears on" compilations and top artists per genre.
- **Smart album grouping**: groups by album-artist tag, or by folder when tracks have no album-artist tag. Untagged compilations stay together as *Various Artists*, `CD1`/`CD2` folders merge into one album, and two artists' "Greatest Hits" stay separate.
- **Search everything**: `Ctrl+F` searches titles, artists, albums, genres, composers and years. Every word must match (`beatles abbey`), and results are grouped into artists, albums, genres and songs.
- **Track lists made for playing**: double-click plays the list from that song. Click, `Ctrl`-click and `Shift`-click select several songs; `Ctrl+A` selects all and `Enter` plays the selection. Right-click or `⋯` for Play next, Add to queue, Add to playlist, Love, Go to album/artist, Track info and Show in file manager. Drag songs onto the Now Playing panel to queue them.
- **Cover art that persists**: embedded covers and `cover.jpg` / `folder.jpg` / `front.jpg` files next to the tracks are cached once per album under `~/.cache/robos/audio-player/art/`. Libraries indexed before this cache existed recover their art the first time it is shown.
- **Folder scope**: limit every view to a single library folder, or manage folders from *Sources → Folders*.
- **Saved cloud folder sync**: in *Cloud Storage*, check the folders to keep synced. Choices survive restart; each checked folder is checked for additions, removals and changed files when Audio Player starts. Each folder shows its track count, last successful sync and a **Refresh** button. Uncheck a folder to pause updates while keeping its existing library tracks. Google folders linked more than once appear as one choice. Failed checks leave the library intact and show an error so you can retry. Songs continue to stream on play rather than downloading the entire folder.
- **Built for 100,000-track libraries**:
  - Song lists, album grids, artist grids and A–Z sections are virtualized: only the rows on screen are in the DOM, however far you scroll.
  - Sorted and filtered views are memoized, so playback and notifications don't re-sort the library, and sort keys are precomputed.
  - Search runs on a deferred query so typing stays responsive.
  - Background scans merge tracks in O(batch) time, write the (compact) cache at most every few seconds, and send the renderer throttled progress and library updates instead of one per handful of files.

### AI Playlists & Virtual DJ
- **Describe it, your RobOS agent builds it**: *✦ AI Playlist* (Playlists tab, Library sidebar or the Now Playing panel) opens the shared `<robos-ai-textarea>` prompt. Describe the playlist ("an hour of upbeat 90s alternative for coding, end with something mellow") and pick how many songs. The agent picks and orders songs from **your own library**.
- **Choose the agent**: the shared `<robos-agent-selector>` (the same one PR Review uses) lists the agents in the RobOS provider catalog (AGY, Codex). It defaults to the first one that is installed and signed in, and you can also pick a model and reasoning effort. The choice is remembered and also drives the Virtual DJ. Requests run through `robos-agent-client/one-shot`: Codex in its read-only sandbox, AGY in print mode.
- **Scales to huge libraries**: up to 400 songs go to the agent in one call. Bigger libraries take two: the agent reads a summary (genres, decades, top artists) and answers with criteria, the player shortlists 400 matching songs locally, and the agent picks and orders from that shortlist.
- **Preview, then play or save**: rename the result, *Play* it right away or *Save playlist*; saved AI playlists keep their request and DJ script.
- **Virtual DJ between songs**: tick *Virtual DJ between songs* and describe your DJ ("a laid-back late-night jazz host with dry humour"). The agent writes an intro and a short line before each song, spoken with RobOS voice (Kokoro, Edge neural voices or Piper via `voice-prompt`'s `TTSEngine`) in the voice you choose. Choose how often the DJ talks: before every song, every other song, or now and then.
  - The DJ talks only between songs that end on their own, never when you skip.
  - Lines and audio are prepared while the current song plays. If a line is still being written when the song ends, the music waits for it ("DJ is warming up…"); if the agent fails, the reason is shown and the music carries on.
  - *Skip* (or Play/Space) cuts the DJ short.
  - With a Cast speaker selected, the DJ is cast to it too.
  - If no voice can be produced, the message names why for each engine (e.g. Kokoro model not installed, edge-tts missing). The DJ also tries the voice set up in RobOS Voice, and starts the voice engine as soon as the DJ is on, since Kokoro takes a while to load.
  - On a Cast speaker, DJ lines are sent as MP3 and the music resumes when the speaker reports the line finished.
  - **DJ volume** (DJ settings, default 150%): each line is loudness-normalised to music level (-14 LUFS) and then set to this % of the music, with a limiter, so the DJ cuts through without turning the music up. It works the same on this computer and on Cast speakers, where the level has to be in the audio itself.
- **DJ for any queue**: the 🎙 button in the Now Playing panel turns the Virtual DJ on for whatever is playing; the agent writes lines a few songs ahead.
- **Announce this song**: the speaker button next to 🎙 plays the intro the DJ has ready for the next song, and right-click → *Announce this song* in the queue does the same for any song. The music pauses for it and picks up where it was. While casting, the line plays on the speaker and the song is then cast again from the same point.

### Resizable layout
- **Panes**: drag the divider beside the Now Playing list, the Library sidebar, or between the playlist list and the open playlist. Arrow keys move a focused divider (Shift for bigger steps).
- **Columns**: drag a column border in the Library's song lists, the Now Playing list and the playlist table. The column you drag changes size and Title takes up the difference. Dragging Title's own border trades width with the column to its right.
- Double-click a divider or a column border to go back to the default. Sizes are remembered between launches.

### Lyrics
- Time-synced lyrics (LRCLIB or a `.lrc` beside the song); click a line to jump there.
- **On/Off**: the switch is remembered; while off, no lyrics are looked up.
- **Follow**: keeps the current line in view. Scrolling the lyrics yourself turns it off; click *Follow* to jump back and keep following.

### Now Playing Panel (VLC-style playlist)
- **Always visible**: the play queue is docked on the right of every tab, so you can switch tracks while browsing the library, playlists, cloud storage or speakers. Collapse it to a slim rail with the *Now Playing list* button.
- **VLC-style editing**: double-click or `Enter` jumps to a track, and the playing row is bold with a live indicator. Drag rows to reorder, `Delete` removes the selection, and clicking Title / Artist / Time sorts the queue. A filter box narrows long queues, and right-click gives Play next, Move to top/bottom and Remove.
- **Random & repeat**: random playback avoids repeats until the whole queue has played, and *Previous* walks back through what played. Repeat cycles through off, whole queue and current track.
- **Totals**: track count, total duration and time remaining. The queue, current position, random and repeat modes are restored on the next launch.
- **Transport everywhere**: the bottom bar has random, previous, play/pause, next and repeat buttons, a seek bar and a ♥ button. `Space` plays/pauses, `Ctrl+→` / `Ctrl+←` skip, and media keys / GNOME media controls work through the Media Session API.

### 1. Custom Playlist Engine & Queue Management
- **Persistent Playlists**: Create, update, reorder, and delete custom playlists persisted in `~/.config/robos/audio-playlists.json`. Pre-seeded with curated defaults like *Favorites* and *Focus & Deep Work*.
- **Interactive Playback Queue**: Real-time queue bar with drag-and-drop ingestion, individual track removal (`✕`), queue shuffle (`🔀`), and single-click **Save Queue as Playlist** (`💾`).
- **M3U / M3U8 Import & Export**: Full compatibility with external media players via standard `#EXTM3U` and `#EXTINF` format export and import.
- **Media Library Cross-Linking**: Add any indexed track from the Media Library browser directly to existing playlists with the `📑 Playlist` button or quick-select picker.
- **Cloud songs (Google Drive / OneDrive)**: songs are listed without downloading them. Their tags (artist, album, title, track number, cover) are read in the background by fetching only the bytes that hold them: the ID3 tag at the start of an MP3, FLAC's metadata blocks, an M4A's `moov` box. Until then, artist and album are guessed from the folders (`Artist/Album (Year)/03 - Song.mp3`). The next cloud song in the queue is downloaded while the current one plays, so changing songs doesn't wait for it.
- **Playlist Casting**: Broadcast entire playlists in order directly to any discovered Google Cast speaker or all speakers simultaneously with one click.

### 2. React H5 Audio Deck & Local Playback
- **High-Fidelity Deck**: Powered by `react-h5-audio-player` and `Howler.js` with progress scrubbing, time indicators, volume adjustments, and track artwork display.
- **Synchronized Visual Seeker**: When routing playback to external Cast speakers, local desktop audio is cleanly muted while the seeker and queue remain in live synchronization.
- **Multi-Format Support**: Comprehensive codec playback supporting MP3, WAV, OGG, FLAC, AAC, M4A, OPUS, and WMA.

### 3. Zero-Cloud Google Home / Cast Smart Speaker Streaming
- **Local TLS Streaming**: Casts audio directly across the local area network (`castv2` over port 8009 TLS) through an ephemeral, dynamic HTTP streaming server. Zero external cloud roundtrips or third-party audio subscriptions required.
- **The speaker is the clock**: while casting, the seek bars (deck and mini player), the play/pause button, play counts, synced lyrics and moving on to the next song follow what the speaker reports (asked every second). Dragging a seek bar seeks the speaker, and switching between a speaker and this computer continues from the same point.
- **No gaps between songs**: one receiver session stays open while you cast, and each song is loaded into it once, so the speaker doesn't stop, chime and restart at every track change. Files are sent with their real type (MP3, FLAC, M4A, WAV), so speakers accept the DJ's WAV voice clips too.
- **Network Probing**: Automatic mDNS and eureka probing (`http://<ip>:8008/setup/eureka_info`) to discover Google Nest, Google Home, and Chromecast Audio devices on the local subnet.
- **Volume & Playback Control**: Centralized volume adjustment, pause, resume, individual speaker stop, and global `Stop All Speakers` controls.
- **Harmonic Test Chime**: Synthesizes and broadcasts an in-memory 16-bit PCM harmonic test chime to verify speaker connectivity.

### Control API for other RobOS apps

Other RobOS apps can borrow the speaker the music is on for a moment without ending the music session. [RobOS Party Game]({{ '/apps/party-game/' | relative_url }}) uses it to say its AI host's lines on the speaker the music is playing on.

- **Loopback only, with a token**: while the Audio Player runs, a small HTTP server listens on `127.0.0.1` on a free port. The port and a random token are in `~/.config/robos/audio-player-control.json` (readable only by you, removed when the Audio Player quits), and every request sends the token in an `X-RobOS-Token` header, so web pages in a browser cannot drive it.
- **`POST /api/speak-clip`** `{ speakerIp?, filePath | url, title?, artist?, durationMs?, holdMs? }`: plays an audio clip (a local audio file or an http(s) URL) on the speaker the music is cast to. It works like a Virtual DJ break: the clip replaces the song on the speaker, and when the speaker reports the clip finished, the song is cast again from where it was, still paused if it was paused. Clips that arrive while one is playing queue up behind it, and the song waits `holdMs` (default 1.5 s, at most 10 s) after the last one in case another follows. If the music is on this computer or a different speaker, the answer is `{ handled: false }` and the caller casts the clip itself.
- **`POST /api/pause`** and **`POST /api/resume`**: pause and resume the music. During a clip, they decide whether the song comes back playing or paused.
- **`GET /api/status`**: where the music plays (`output`, `speakerIps`), whether it is playing, the current track and position, and whether a clip has the speaker.
- **From Node**: `createAudioPlayerClient()` in `packages/audio-player/lib/control-server.js` finds the running Audio Player and makes these calls. Each one resolves with `null` when the Audio Player is not running.

### 4. Procedural Focus Soundscapes
- **Real-Time Web Audio Synthesizers**: Generates procedural ambient focus audio directly via the browser Web Audio API with zero external media files:
  - **Coding Rain**: Resonant bandpass-filtered noise mimicking rainfall.
  - **Cyber Synth**: Dual detuned sawtooth oscillators passing through an analog low-pass filter.
  - **Pink Noise**: Voss-McCartney noise buffer optimized for deep technical concentration.

### 5. Automated Inspection & DOM Snapshot Debugging
- **Snapshot Port**: Exposes automated DOM snapshot inspection and headless testing on port `19196`.

## Hardware Compatibility

The player automatically probes and connects to:
- Google Nest Audio & Google Home
- Google Nest Mini & Google Home Mini
- Lenovo Smart Clocks & Cast-enabled smart displays
- Chromecast Audio & Google Cast receivers

## Files & Configuration

- **App directory**: `packages/audio-player/`
- **Playlists storage**: `~/.config/robos/audio-playlists.json`
- **Library cache**: `~/.config/robos/audio-library.json`
- **Play counts & loved tracks**: `~/.config/robos/audio-track-stats.json`
- **Cover art cache**: `~/.cache/robos/audio-player/art/`
- **Snapshot debug port**: `19196`
- **Control API**: loopback port and token in `~/.config/robos/audio-player-control.json` (see *Control API for other RobOS apps*)
- **Ephemeral stream server**: Dynamic port on host LAN interface
