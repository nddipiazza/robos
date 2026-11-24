---
title: "RobOS Media Server"
package: media-server
category: "services"
component_type: app
permalink: /media-server/
redirect_from:
  - /apps/media-server/
summary: "Unified web media streaming server, transcode engine, eBook reader, and MCP server for movies, TV shows, music, and books"
description: "Unified web media streaming server, transcode engine, eBook reader, and MCP server for movies, TV shows, music, and books"
icon: media-server.svg
---

**RobOS Media Server** (`packages/media-server`, port `:19234`) turns any RobOS Linux server into an always-on media streaming hub and Model Context Protocol (MCP) server for **Movies**, **TV Shows**, **Music**, **Books & eBooks**, and **Courses**.

## Key Capabilities

- **All Media Services in One Server**: Configure dedicated services for Movies, TV Shows (with automatic `S01E01` season/episode grouping), Music (`MP3`, `FLAC`, `M4A`, `OGG`, `WAV` with header tag and embedded cover extraction), Books (`EPUB`, `PDF`, `MOBI`, `AZW3`, `CBZ`, `M4B` with a built-in zero-cloud web EPUB & PDF reader), and Courses.
- **Direct Byte-Range Streaming & Live FFmpeg Remux/Transcode**: Serves RFC 7233 `HTTP 206 Partial Content` streams (`/stream/:id`) alongside live fragmented MP4 H.264/AAC remuxing and transcoding (`/transcode/:id.mp4`), automatic `.srt`-to-WebVTT and embedded subtitle extraction (`/api/subtitles/:id.vtt`), and poster/thumbnail generation (`/api/art/:id.jpg`).
- **Built-in Model Context Protocol (MCP)**: Exposes HTTP JSON-RPC 2.0 (`/mcp`), SSE (`/mcp/sse`), and stdio (`bin/media-server-mcp.js`) tools and resources to add/scan services, search movies/shows/music/books, inspect codecs, and read EPUB book chapters directly from AI agents.
- **Automatic RobOS Preferences Sync**: Add the server once in **RobOS Preferences → RobOS Media Services**. Preferences syncs `~/.config/robos/media-servers.json` through your Config Sync vault and keeps **RobOS Movie Player**, **RobOS Audio Player**, and **MCP Manager** automatically populated on every RobOS machine without creating local libraries.

## Install as an Always-On Server Service

```bash
bash packages/media-server/bin/install-media-server.sh
bash packages/robos-preferences/bin/install-preferences-service.sh
```

## Validation

```bash
node --test packages/media-server/test/media-server.test.js
```
