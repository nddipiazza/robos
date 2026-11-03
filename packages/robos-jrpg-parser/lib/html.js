'use strict';

// Small helpers for saved web pages and plain text guides: decoding, visible
// text and tables. Regular expressions are enough, because the input is a local
// file that is only read for text.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, code) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? all;
    const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
  });
}

function decodeHtml(buffer) {
  const head = buffer.toString('latin1', 0, 4096);
  const charset = (head.match(/charset=["']?([\w-]+)/i) || [])[1];
  try {
    if (charset && !/utf-?8/i.test(charset)) return new TextDecoder(charset.toLowerCase()).decode(buffer);
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

function htmlTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, ' ').trim() : '';
}

function savedFromUrl(html) {
  const m = html.match(/saved from url=\(\d+\)(\S+)/i);
  return m ? m[1].replace(/-->$/, '') : null;
}

function stripNonText(html) {
  return html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, ' ');
}

/** Visible text, one line per block, without blank lines. Tables are kept when keepTables is true. */
function visibleText(html, { keepTables = false } = {}) {
  let s = stripNonText(html);
  if (!keepTables) s = s.replace(/<table\b[\s\S]*?<\/table>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n').replace(/<[^>]+>/g, ' ');
  return decodeEntities(s).split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

function cellText(cell) {
  return decodeEntities(cell.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Every table as an array of rows of cell strings. */
function tables(html) {
  return (stripNonText(html).match(/<table\b[\s\S]*?<\/table>/gi) || []).map(table =>
    (table.match(/<tr\b[\s\S]*?<\/tr>/gi) || []).map(row =>
      (row.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) || []).map(cellText)));
}

function isMarkdownRow(line) {
  return /^\s*\|.*\|\s*$/.test(line);
}

function isMarkdownSeparator(line) {
  return /^\s*\|[\s:|-]+\|\s*$/.test(line);
}

/** Every Markdown table as rows of cells, with the heading above it as `heading`. */
function markdownTables(text) {
  const out = [];
  let heading = '';
  let current = null;
  for (const line of text.split('\n')) {
    const h = line.match(/^#{1,6}\s+(.+)/);
    if (h) heading = h[1].trim();
    if (isMarkdownRow(line)) {
      if (!current) {
        current = [];
        current.heading = heading;
        out.push(current);
      }
      if (!isMarkdownSeparator(line)) {
        current.push(line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.replace(/[*`]/g, '').trim()));
      }
    } else current = null;
  }
  return out;
}

function markdownTitle(text) {
  const m = text.match(/^#\s+(.+)/m);
  return m ? m[1].replace(/[*`]/g, '').trim() : '';
}

/** Lines outside tables and outside any `skip` section, which code has already read. */
function markdownProse(text, skip) {
  const out = [];
  let skipLevel = 0;
  for (const line of text.split('\n')) {
    const h = line.match(/^(#{1,6})\s+(.+)/);
    if (h) {
      if (skipLevel && h[1].length <= skipLevel) skipLevel = 0;
      if (!skipLevel && skip && skip.test(h[2])) skipLevel = h[1].length;
    }
    if (skipLevel || isMarkdownRow(line) || !line.trim()) continue;
    out.push(line.trim());
  }
  return out.join('\n');
}

/** Text with whitespace collapsed and case folded, for checking that a quote is in a source. */
function normalizeForMatch(text) {
  return String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

module.exports = { decodeHtml, decodeEntities, htmlTitle, savedFromUrl, visibleText, tables, markdownTables, markdownTitle, markdownProse, normalizeForMatch };
