'use strict';

/**
 * RobOS Media Server — Zero-Dependency EPUB & CBZ Reader
 *
 * Reads ZIP central directories and inflates entries using Node's built-in `zlib`,
 * allowing RobOS Media Server to:
 *   1. Extract EPUB title, author, description, subjects, and cover image during library scan
 *   2. Serve clean, chapter-by-chapter EPUB reading in the web browser (/books/read/:id)
 *   3. Answer AI agent MCP tool calls (`robos_media_read_book`) with full Table of Contents and chapter text
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function listZipEntries(filePath) {
  let fd = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const stat = fs.fstatSync(fd);
    if (stat.size < 22) return null;
    const tailLen = Math.min(stat.size, 65557);
    const tail = Buffer.alloc(tailLen);
    fs.readSync(fd, tail, 0, tailLen, stat.size - tailLen);

    // Find End of Central Directory (0x06054b50)
    let eocdPos = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocdPos = i;
        break;
      }
    }
    if (eocdPos < 0) return null;

    const totalEntries = tail.readUInt16LE(eocdPos + 10);
    const cdSize = tail.readUInt32LE(eocdPos + 12);
    const cdOffset = tail.readUInt32LE(eocdPos + 16);
    if (cdOffset + cdSize > stat.size || cdSize > 16 * 1024 * 1024) return null;

    const cd = Buffer.alloc(cdSize);
    fs.readSync(fd, cd, 0, cdSize, cdOffset);

    const entries = [];
    let pos = 0;
    for (let i = 0; i < totalEntries && pos + 46 <= cd.length; i++) {
      if (cd.readUInt32LE(pos) !== 0x02014b50) break;
      const compression = cd.readUInt16LE(pos + 10);
      const compressedSize = cd.readUInt32LE(pos + 20);
      const uncompressedSize = cd.readUInt32LE(pos + 24);
      const nameLen = cd.readUInt16LE(pos + 28);
      const extraLen = cd.readUInt16LE(pos + 30);
      const commentLen = cd.readUInt16LE(pos + 32);
      const localHeaderOffset = cd.readUInt32LE(pos + 42);
      const name = cd.toString('utf8', pos + 46, pos + 46 + nameLen);
      entries.push({
        name,
        compression,
        compressedSize,
        uncompressedSize,
        localHeaderOffset,
      });
      pos += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  } catch {
    return null;
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch {} }
  }
}

function readZipEntry(filePath, entry, maxBytes = 8 * 1024 * 1024) {
  if (!entry || entry.uncompressedSize > maxBytes || entry.compressedSize > maxBytes) return null;
  let fd = null;
  try {
    fd = fs.openSync(filePath, 'r');
    const localHead = Buffer.alloc(30);
    if (fs.readSync(fd, localHead, 0, 30, entry.localHeaderOffset) < 30) return null;
    if (localHead.readUInt32LE(0) !== 0x04034b50) return null;
    const nameLen = localHead.readUInt16LE(26);
    const extraLen = localHead.readUInt16LE(28);
    const dataOffset = entry.localHeaderOffset + 30 + nameLen + extraLen;
    const raw = Buffer.alloc(entry.compressedSize);
    fs.readSync(fd, raw, 0, entry.compressedSize, dataOffset);
    if (entry.compression === 0) return raw;
    if (entry.compression === 8) return zlib.inflateRawSync(raw, { maxOutputLength: maxBytes });
    return null;
  } catch {
    return null;
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch {} }
  }
}

function decodeXmlEntities(str) {
  return String(str || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

function stripTagsToText(html) {
  return decodeXmlEntities(
    String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sanitizeChapterHtml(html) {
  let body = String(html || '');
  const bodyMatch = body.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) body = bodyMatch[1];
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<link[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .trim();
}

function parseOpf(filePath, entries) {
  if (!entries || !entries.length) return null;
  const byName = new Map(entries.map(e => [e.name, e]));
  let opfPath = null;
  const containerEntry = byName.get('META-INF/container.xml');
  if (containerEntry) {
    const xml = readZipEntry(filePath, containerEntry, 256 * 1024)?.toString('utf8') || '';
    const m = xml.match(/full-path\s*=\s*["']([^"']+)["']/i);
    if (m) opfPath = m[1];
  }
  if (!opfPath) {
    const found = entries.find(e => e.name.toLowerCase().endsWith('.opf'));
    if (found) opfPath = found.name;
  }
  if (!opfPath || !byName.get(opfPath)) return null;

  const opfXml = readZipEntry(filePath, byName.get(opfPath), 2 * 1024 * 1024)?.toString('utf8') || '';
  if (!opfXml) return null;

  const opfDir = path.posix.dirname(opfPath);
  const resolveHref = (href) => {
    const clean = decodeURIComponent(String(href || '').split('#')[0]);
    return opfDir === '.' ? clean : path.posix.normalize(`${opfDir}/${clean}`);
  };

  const tagText = (tag) => {
    const m = opfXml.match(new RegExp(`<dc:${tag}[^>]*>([\\s\\S]*?)<\\/dc:${tag}>`, 'i'));
    return m ? stripTagsToText(m[1]) : '';
  };

  const title = tagText('title');
  const author = tagText('creator');
  const description = tagText('description');
  const subject = tagText('subject');
  const dateRaw = tagText('date');
  const yearMatch = dateRaw.match(/\b(19\d\d|20\d\d)\b/);
  const year = yearMatch ? Number(yearMatch[1]) : null;

  // Parse manifest items
  const manifest = new Map();
  let coverHref = null;
  const metaCoverMatch = opfXml.match(/<meta[^>]+name=["']cover["'][^>]+content=["']([^"']+)["']/i)
    || opfXml.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']cover["']/i);
  const coverId = metaCoverMatch ? metaCoverMatch[1] : null;

  for (const m of opfXml.matchAll(/<item\b([^>]+?)\/?>/gi)) {
    const attrs = m[1];
    const id = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1];
    const href = attrs.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    const mediaType = attrs.match(/\bmedia-type\s*=\s*["']([^"']+)["']/i)?.[1] || '';
    const props = attrs.match(/\bproperties\s*=\s*["']([^"']+)["']/i)?.[1] || '';
    if (id && href) {
      manifest.set(id, { id, href: resolveHref(href), mediaType, props });
      if (!coverHref && (props.includes('cover-image') || (coverId && id === coverId))) {
        coverHref = resolveHref(href);
      }
    }
  }
  if (!coverHref) {
    for (const item of manifest.values()) {
      if (/^image\//i.test(item.mediaType) && /cover/i.test(item.href)) {
        coverHref = item.href;
        break;
      }
    }
  }

  // Parse spine order
  const spine = [];
  for (const m of opfXml.matchAll(/<itemref\b([^>]+?)\/?>/gi)) {
    const idref = m[1].match(/\bidref\s*=\s*["']([^"']+)["']/i)?.[1];
    const item = idref && manifest.get(idref);
    if (item && /html|xml/i.test(item.mediaType)) {
      spine.push(item);
    }
  }

  return {
    title,
    author,
    description,
    subject,
    year,
    coverHref,
    hasCover: Boolean(coverHref && byName.has(coverHref)),
    chapterCount: spine.length,
    spine,
    byName,
  };
}

function inspectEpubMetadata(filePath) {
  const entries = listZipEntries(filePath);
  if (!entries) return null;
  const opf = parseOpf(filePath, entries);
  if (!opf) return null;
  return {
    title: opf.title,
    author: opf.author,
    description: opf.description,
    subject: opf.subject,
    year: opf.year,
    hasCover: opf.hasCover,
    chapterCount: opf.chapterCount,
  };
}

function extractEpubCover(filePath) {
  const entries = listZipEntries(filePath);
  if (!entries) return null;
  const opf = parseOpf(filePath, entries);
  if (opf && opf.coverHref && opf.byName.has(opf.coverHref)) {
    const entry = opf.byName.get(opf.coverHref);
    const buffer = readZipEntry(filePath, entry, 6 * 1024 * 1024);
    if (buffer) {
      const ext = path.extname(opf.coverHref).toLowerCase();
      const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      return { buffer, mime };
    }
  }
  // Fallback for CBZ comics or EPUBs without cover declaration: first image entry
  const imgEntry = entries
    .filter(e => /\.(jpg|jpeg|png|webp)$/i.test(e.name) && !e.name.startsWith('__MACOSX'))
    .sort((a, b) => a.name.localeCompare(b.name))[0];
  if (imgEntry) {
    const buffer = readZipEntry(filePath, imgEntry, 6 * 1024 * 1024);
    if (buffer) {
      const ext = path.extname(imgEntry.name).toLowerCase();
      return { buffer, mime: ext === '.png' ? 'image/png' : 'image/jpeg' };
    }
  }
  return null;
}

function readEpubChapters(filePath) {
  const entries = listZipEntries(filePath);
  if (!entries) return null;
  const opf = parseOpf(filePath, entries);
  if (!opf) return null;
  const chapters = opf.spine.map((item, idx) => {
    const entry = opf.byName.get(item.href);
    let chapterTitle = `Chapter ${idx + 1}`;
    if (entry && entry.uncompressedSize < 512 * 1024) {
      const html = readZipEntry(filePath, entry, 512 * 1024)?.toString('utf8') || '';
      const hMatch = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      const extracted = hMatch ? stripTagsToText(hMatch[1]) : '';
      if (extracted && extracted.length < 120 && extracted.toLowerCase() !== 'unknown') {
        chapterTitle = extracted;
      }
    }
    return {
      index: idx,
      id: item.id,
      href: item.href,
      title: chapterTitle,
    };
  });
  return {
    title: opf.title,
    author: opf.author,
    description: opf.description,
    chapterCount: chapters.length,
    chapters,
  };
}

function readEpubChapterContent(filePath, chapterIndex = 0) {
  const entries = listZipEntries(filePath);
  if (!entries) return null;
  const opf = parseOpf(filePath, entries);
  if (!opf || !opf.spine.length) return null;
  const idx = Math.max(0, Math.min(Number(chapterIndex) || 0, opf.spine.length - 1));
  const item = opf.spine[idx];
  const entry = opf.byName.get(item.href);
  if (!entry) return null;
  const rawHtml = readZipEntry(filePath, entry, 4 * 1024 * 1024)?.toString('utf8') || '';
  const html = sanitizeChapterHtml(rawHtml);
  const text = stripTagsToText(rawHtml);
  const hMatch = rawHtml.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  const chapterTitle = (hMatch && stripTagsToText(hMatch[1])) || `Chapter ${idx + 1}`;
  return {
    index: idx,
    totalChapters: opf.spine.length,
    title: chapterTitle,
    html,
    text,
  };
}

module.exports = {
  inspectEpubMetadata,
  extractEpubCover,
  readEpubChapters,
  readEpubChapterContent,
};
