'use strict';

/**
 * RobOS Media Server — Model Context Protocol (MCP) Engine
 *
 * Supports:
 *   - Streamable HTTP JSON-RPC 2.0 (`POST /mcp`)
 *   - SSE transport (`GET /mcp/sse` + `POST /mcp/messages`)
 *   - Stdio transport (`bin/media-server-mcp.js`)
 *
 * Covers all media services: Movies, TV Shows, Music, Books (including reading EPUB/text chapters!), and Education.
 */

const fs = require('node:fs');
const { probeMediaFile } = require('./transcoder');
const { readEpubChapters, readEpubChapterContent } = require('./epub-reader');

const DEFAULT_PROTOCOL = '2024-11-05';

function buildMcpTools(store, getBaseUrl) {
  const str = (description) => ({ type: 'string', description });
  const int = (description) => ({ type: 'integer', description });
  const bool = (description) => ({ type: 'boolean', description });

  return [
    {
      name: 'robos_media_server_status',
      description: 'Returns RobOS Media Server health, catalog revision, active media services (movies, shows, music, books, education), item counts, and scan status.',
      inputSchema: { type: 'object', properties: {} },
      call: async () => store.getSummary(getBaseUrl()),
    },
    {
      name: 'robos_media_list_services',
      description: 'Lists all configured media services (movies, shows, music, books, education) and their folder paths on the RobOS Media Server.',
      inputSchema: { type: 'object', properties: {} },
      call: async () => ({ ok: true, services: store.listServices() }),
    },
    {
      name: 'robos_media_add_service',
      description: 'Adds or updates a media service (movies, shows, music, books, education) on the RobOS Media Server with one or more folder paths and optionally scans it immediately.',
      inputSchema: {
        type: 'object',
        properties: {
          id: str('Service slug, e.g. "movies", "shows", "music", "books", "education"'),
          name: str('Human-readable service name, e.g. "Movies", "TV Shows", "Books"'),
          kind: { type: 'string', enum: ['movies', 'shows', 'music', 'books', 'education', 'mixed'], description: 'Media type classification' },
          folders: { type: 'array', items: { type: 'string' }, description: 'Absolute directory paths on the server (e.g. ["/downloads/movies"])' },
          appendFolders: bool('If true, append folders to an existing service instead of replacing'),
          mcpEnabled: bool('Expose this service over MCP (default true)'),
          scanNow: bool('Trigger an immediate scan after adding (default true)'),
        },
        required: ['kind', 'folders'],
      },
      call: async (args) => {
        const service = store.upsertService({
          id: args.id,
          name: args.name,
          kind: args.kind,
          folders: args.folders,
          appendFolders: Boolean(args.appendFolders),
          mcpEnabled: args.mcpEnabled !== false,
        });
        const scanResult = args.scanNow !== false ? await store.scan({ serviceId: service.id }) : null;
        return { ok: true, service, scanResult };
      },
    },
    {
      name: 'robos_media_remove_service',
      description: 'Removes a media service and its indexed items from the RobOS Media Server (does not delete media files on disk).',
      inputSchema: {
        type: 'object',
        properties: { id: str('Service id to remove') },
        required: ['id'],
      },
      call: async (args) => ({ ok: true, ...store.removeService(args.id) }),
    },
    {
      name: 'robos_media_scan',
      description: 'Scans media folders on the RobOS Media Server (all enabled services or a specific serviceId) and updates the catalog.',
      inputSchema: {
        type: 'object',
        properties: {
          serviceId: str('Optional service id (omit to scan all enabled services)'),
          force: bool('Re-parse all files even if size and mtime did not change'),
        },
      },
      call: async (args) => store.scan({ serviceId: args.serviceId || null, force: Boolean(args.force) }),
    },
    {
      name: 'robos_media_search',
      description: 'Searches across all media types on the RobOS Media Server (movies, TV shows, music tracks/albums/artists, books, courses).',
      inputSchema: {
        type: 'object',
        properties: {
          query: str('Search keywords (title, actor/author/artist, album, show name, year, format)'),
          type: { type: 'string', enum: ['movie', 'tv', 'music', 'book', 'education'], description: 'Optional media type filter' },
          serviceId: str('Optional service id filter'),
          limit: int('Max items to return (default 30)'),
        },
        required: ['query'],
      },
      call: async (args) => store.queryCatalog({
        q: args.query,
        type: args.type || '',
        serviceId: args.serviceId || '',
        limit: Math.min(200, Number(args.limit) || 30),
        baseUrl: getBaseUrl(),
      }),
    },
    {
      name: 'robos_media_list_movies',
      description: 'Lists movies from the RobOS Media Server with stream URLs, transcode URLs, quality badges, years, and genres.',
      inputSchema: {
        type: 'object',
        properties: {
          query: str('Optional title filter'),
          genre: str('Optional genre filter'),
          year: int('Optional release year filter'),
          limit: int('Max movies to return (default 50)'),
          offset: int('Pagination offset (default 0)'),
        },
      },
      call: async (args) => store.queryCatalog({
        type: 'movie',
        q: args.query || '',
        genre: args.genre || '',
        year: args.year || null,
        limit: Math.min(500, Number(args.limit) || 50),
        offset: Number(args.offset) || 0,
        baseUrl: getBaseUrl(),
      }),
    },
    {
      name: 'robos_media_list_shows',
      description: 'Lists all TV series on the RobOS Media Server with season counts, episode counts, and watched counts.',
      inputSchema: {
        type: 'object',
        properties: { query: str('Optional show name filter') },
      },
      call: async (args) => {
        const shows = store.listShows(getBaseUrl()).map(({ seasons, ...summary }) => ({
          ...summary,
          seasonNumbers: seasons.map(s => s.seasonNumber),
        }));
        const q = String(args.query || '').trim().toLowerCase();
        const filtered = q ? shows.filter(s => s.showName.toLowerCase().includes(q)) : shows;
        return { ok: true, count: filtered.length, shows: filtered };
      },
    },
    {
      name: 'robos_media_get_show',
      description: 'Returns full season and episode breakdown with stream URLs for a TV show on the RobOS Media Server.',
      inputSchema: {
        type: 'object',
        properties: {
          show: str('TV show name or slug (e.g. "House", "Bluey", "Avatar")'),
          season: int('Optional season number filter'),
        },
        required: ['show'],
      },
      call: async (args) => {
        const found = store.getShow(args.show, getBaseUrl());
        if (!found) return { ok: false, error: `TV show "${args.show}" not found` };
        if (args.season != null) {
          return {
            ok: true,
            ...found,
            seasons: found.seasons.filter(s => s.seasonNumber === Number(args.season)),
          };
        }
        return { ok: true, ...found };
      },
    },
    {
      name: 'robos_media_list_music',
      description: 'Lists music albums or tracks on the RobOS Media Server (MP3, FLAC, M4A, OGG, WAV).',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['albums', 'tracks'], description: '"albums" (default) or "tracks"' },
          query: str('Optional artist, album, or song title filter'),
          limit: int('Max results (default 50)'),
        },
      },
      call: async (args) => {
        if (args.mode === 'tracks') {
          return store.queryCatalog({
            type: 'music',
            q: args.query || '',
            limit: Math.min(500, Number(args.limit) || 50),
            baseUrl: getBaseUrl(),
          });
        }
        const q = String(args.query || '').trim().toLowerCase();
        let albums = store.listAlbums(getBaseUrl());
        if (q) {
          albums = albums.filter(a => a.artist.toLowerCase().includes(q) || a.album.toLowerCase().includes(q));
        }
        return {
          ok: true,
          total: albums.length,
          albums: albums.slice(0, Math.min(200, Number(args.limit) || 50)).map(a => ({
            album: a.album,
            artist: a.artist,
            year: a.year,
            genre: a.genre,
            lossless: a.lossless,
            trackCount: a.trackCount,
            artUrl: a.artUrl,
          })),
        };
      },
    },
    {
      name: 'robos_media_list_books',
      description: 'Lists eBooks, PDFs, comics, audiobooks, and educational books on the RobOS Media Server with reader and download URLs.',
      inputSchema: {
        type: 'object',
        properties: {
          query: str('Optional title, author, or topic filter'),
          format: str('Optional format filter, e.g. "EPUB", "PDF", "CBZ"'),
          limit: int('Max books to return (default 50)'),
        },
      },
      call: async (args) => {
        const res = store.queryCatalog({
          type: 'book',
          q: args.query || '',
          limit: Math.min(500, Number(args.limit) || 50),
          baseUrl: getBaseUrl(),
        });
        const fmt = String(args.format || '').trim().toUpperCase();
        const items = fmt ? res.items.filter(i => i.bookFormat === fmt) : res.items;
        return { ok: true, total: items.length, books: items };
      },
    },
    {
      name: 'robos_media_read_book',
      description: 'Reads the Table of Contents or a specific chapter of an EPUB, TXT, or Markdown book from the RobOS Media Server.',
      inputSchema: {
        type: 'object',
        properties: {
          id: str('Book item id (or provide title to look up)'),
          title: str('Book title search if id is not known'),
          chapterIndex: int('Optional 0-based chapter index to read; omit to return the Table of Contents'),
          maxChars: int('Max characters of chapter text to return (default 12000)'),
        },
      },
      call: async (args) => {
        let item = args.id ? store.byId.get(args.id) : null;
        if (!item && args.title) {
          const hit = store.queryCatalog({ type: 'book', q: args.title, limit: 10, baseUrl: getBaseUrl() });
          const best = hit.items.find(i => i.ext === '.epub') || hit.items.find(i => i.ext === '.pdf') || hit.items[0];
          item = best ? store.byId.get(best.id) : null;
        }
        if (!item || item.mediaType !== 'book') {
          return { ok: false, error: 'Book not found in RobOS Media Server catalog' };
        }
        const maxChars = Math.min(60000, Math.max(500, Number(args.maxChars) || 12000));
        if (item.ext === '.epub') {
          if (args.chapterIndex === undefined || args.chapterIndex === null) {
            const toc = readEpubChapters(item.filePath);
            return { ok: true, id: item.id, title: item.title, author: item.author, ...(toc || { error: 'Could not read EPUB spine' }) };
          }
          const ch = readEpubChapterContent(item.filePath, Number(args.chapterIndex));
          if (!ch) return { ok: false, error: 'Chapter not found in EPUB' };
          return {
            ok: true,
            id: item.id,
            bookTitle: item.title,
            author: item.author,
            chapterIndex: ch.index,
            totalChapters: ch.totalChapters,
            chapterTitle: ch.title,
            text: ch.text.slice(0, maxChars),
            truncated: ch.text.length > maxChars,
          };
        }
        if (item.ext === '.txt' || item.ext === '.md') {
          const raw = fs.readFileSync(item.filePath, 'utf8');
          return {
            ok: true,
            id: item.id,
            bookTitle: item.title,
            author: item.author,
            text: raw.slice(0, maxChars),
            truncated: raw.length > maxChars,
          };
        }
        return {
          ok: true,
          id: item.id,
          bookTitle: item.title,
          format: item.bookFormat,
          note: `${item.bookFormat} book can be opened directly via readerUrl or downloaded via downloadUrl.`,
          hydrated: store.hydrateItem(item, getBaseUrl()),
        };
      },
    },
    {
      name: 'robos_media_get_item',
      description: 'Gets full metadata, stream/transcode/subtitle/art URLs, and ffprobe codec/stream inspection for a single media item.',
      inputSchema: {
        type: 'object',
        properties: { id: str('Media item id') },
        required: ['id'],
      },
      call: async (args) => {
        const raw = store.byId.get(args.id);
        if (!raw) return { ok: false, error: `Item "${args.id}" not found` };
        const probe = (raw.mediaType === 'movie' || raw.mediaType === 'tv' || raw.mediaType === 'music')
          ? await probeMediaFile(raw.filePath)
          : null;
        return { ok: true, item: store.hydrateItem(raw, getBaseUrl()), probe };
      },
    },
    {
      name: 'robos_media_continue',
      description: 'Gets in-progress movies, TV shows, music, and books across devices, or updates watch/listen/read progress.',
      inputSchema: {
        type: 'object',
        properties: {
          itemId: str('Optional item id to update progress for'),
          positionSec: int('Optional playback position in seconds'),
          durationSec: int('Optional total duration in seconds'),
          chapterIndex: int('Optional book chapter index'),
          completed: bool('Mark item finished/watched'),
          limit: int('Max continue items to return (default 15)'),
        },
      },
      call: async (args) => {
        if (args.itemId) {
          const updated = store.updateProgress({
            itemId: args.itemId,
            positionSec: args.positionSec,
            durationSec: args.durationSec,
            chapterIndex: args.chapterIndex,
            completed: args.completed,
          });
          return { ok: true, updated };
        }
        return { ok: true, items: store.getContinueItems({ limit: Number(args.limit) || 15, baseUrl: getBaseUrl() }) };
      },
    },
  ];
}

function buildMcpResources(store, getBaseUrl) {
  return [
    {
      uri: 'robos-media://server/status',
      name: 'RobOS Media Server Status & Counts',
      mimeType: 'application/json',
      read: () => store.getSummary(getBaseUrl()),
    },
    {
      uri: 'robos-media://services',
      name: 'Configured Media Services & Folders',
      mimeType: 'application/json',
      read: () => ({ services: store.listServices() }),
    },
    {
      uri: 'robos-media://catalog/movies',
      name: 'Movies Catalog',
      mimeType: 'application/json',
      read: () => store.queryCatalog({ type: 'movie', limit: 250, baseUrl: getBaseUrl() }),
    },
    {
      uri: 'robos-media://catalog/shows',
      name: 'TV Shows Catalog',
      mimeType: 'application/json',
      read: () => ({ shows: store.listShows(getBaseUrl()).map(({ seasons, ...s }) => s) }),
    },
    {
      uri: 'robos-media://catalog/music',
      name: 'Music Albums Catalog',
      mimeType: 'application/json',
      read: () => ({ albums: store.listAlbums(getBaseUrl()).slice(0, 250).map(({ tracks, ...a }) => a) }),
    },
    {
      uri: 'robos-media://catalog/books',
      name: 'Books & eBooks Catalog',
      mimeType: 'application/json',
      read: () => store.queryCatalog({ type: 'book', limit: 250, baseUrl: getBaseUrl() }),
    },
    {
      uri: 'robos-media://continue',
      name: 'Continue Watching / Listening / Reading',
      mimeType: 'application/json',
      read: () => ({ items: store.getContinueItems({ limit: 25, baseUrl: getBaseUrl() }) }),
    },
  ];
}

function createMcpDispatcher(store, getBaseUrl = () => 'http://127.0.0.1:19234') {
  const tools = buildMcpTools(store, getBaseUrl);
  const resources = buildMcpResources(store, getBaseUrl);

  async function dispatch(req) {
    if (!req || typeof req !== 'object') {
      throw Object.assign(new Error('Invalid JSON-RPC request'), { code: -32600 });
    }
    const { id, method, params } = req;

    if (method === 'initialize') {
      return {
        protocolVersion: params?.protocolVersion || DEFAULT_PROTOCOL,
        serverInfo: { name: 'robos-media-server', version: '1.0.0' },
        capabilities: { tools: {}, resources: {} },
      };
    }
    if (method === 'ping') return {};
    if (method === 'tools/list') {
      return {
        tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      };
    }
    if (method === 'tools/call') {
      const tool = tools.find(t => t.name === params?.name);
      if (!tool) throw Object.assign(new Error(`Unknown MCP tool: ${params?.name}`), { code: -32602 });
      try {
        const out = await tool.call(params?.arguments || {});
        return {
          content: [{ type: 'text', text: JSON.stringify(out, null, 2) }],
          isError: out && out.ok === false ? true : undefined,
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: err.message }],
          isError: true,
        };
      }
    }
    if (method === 'resources/list') {
      return {
        resources: resources.map(({ uri, name, mimeType }) => ({ uri, name, mimeType })),
      };
    }
    if (method === 'resources/read') {
      const r = resources.find(x => x.uri === params?.uri);
      if (!r) throw Object.assign(new Error(`Unknown MCP resource: ${params?.uri}`), { code: -32602 });
      const val = await r.read();
      return {
        contents: [{ uri: r.uri, mimeType: r.mimeType, text: JSON.stringify(val, null, 2) }],
      };
    }
    if (id === undefined) return undefined; // JSON-RPC notifications
    throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
  }

  return { tools, resources, dispatch };
}

module.exports = { createMcpDispatcher };
