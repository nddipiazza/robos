'use strict';

// Small MediaWiki wikitext reader: templates, wikitables, sections, file links
// and plain-text conversion. Enough for fan wikis (infoboxes and data tables);
// it is not a full MediaWiki parser.

// Split `text` on `sep` characters that sit outside {{ }}, [[ ]] and <tags>.
function splitTopLevel(text, sep = '|') {
  const parts = [];
  let depthCurly = 0, depthSquare = 0, depthTag = 0, start = 0;
  for (let i = 0; i < text.length; i++) {
    // <gallery> and <ref> bodies use "|" for their own captions.
    if (text[i] === '<') {
      const tag = text.slice(i, i + 12).toLowerCase();
      const close = text.indexOf('>', i);
      const selfClosing = close > 0 && text[close - 1] === '/';
      if (/^<(gallery|ref)[\s>/]/.test(tag) && !selfClosing) depthTag++;
      else if (/^<\/(gallery|ref)>/.test(tag)) depthTag = Math.max(0, depthTag - 1);
    }
    const two = text.slice(i, i + 2);
    if (two === '{{') { depthCurly++; i++; continue; }
    if (two === '}}') { depthCurly = Math.max(0, depthCurly - 1); i++; continue; }
    if (two === '[[') { depthSquare++; i++; continue; }
    if (two === ']]') { depthSquare = Math.max(0, depthSquare - 1); i++; continue; }
    if (text[i] === sep && depthCurly === 0 && depthSquare === 0 && depthTag === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

// Find the matching `}}` for a `{{` at `open`. Returns the index just past it.
function matchBraces(text, open) {
  let depth = 0;
  for (let i = open; i < text.length - 1; i++) {
    if (text[i] === '{' && text[i + 1] === '{') { depth++; i++; continue; }
    if (text[i] === '}' && text[i + 1] === '}') {
      depth--; i++;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

function normalizeTemplateName(name) {
  return String(name || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Every top-level and nested template call in `text`, optionally filtered by name.
function parseTemplates(text, name) {
  const wanted = name ? normalizeTemplateName(name) : null;
  const out = [];
  const scan = (src) => {
    let i = 0;
    while ((i = src.indexOf('{{', i)) !== -1) {
      const end = matchBraces(src, i);
      if (end === -1) break;
      const inner = src.slice(i + 2, end - 2);
      const parts = splitTopLevel(inner, '|');
      const tplName = normalizeTemplateName(parts[0]);
      const params = {};
      const positional = [];
      for (const raw of parts.slice(1)) {
        const eq = raw.indexOf('=');
        const linkOrTpl = raw.search(/\[\[|\{\{/);
        if (eq > 0 && (linkOrTpl === -1 || eq < linkOrTpl)) {
          params[raw.slice(0, eq).trim().toLowerCase()] = raw.slice(eq + 1).trim();
        } else {
          positional.push(raw.trim());
        }
      }
      if (!wanted || tplName === wanted) out.push({ name: tplName, params, positional, raw: src.slice(i, end) });
      scan(inner);
      i = end;
    }
  };
  scan(String(text || ''));
  return out;
}

const INLINE_TEMPLATES = {
  j: () => '', // Japanese name and romaji: left out of English text
  y: () => 'Yes',
  n: () => 'No',
  a: p => p[0] || '',
  la: p => p[1] || p[0] || '',
  'small': p => p[0] || '',
  nowrap: p => p[0] || '',
};

// Convert wikitext to readable plain text.
function stripMarkup(value) {
  let s = String(value ?? '');
  s = s.replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  // Inline templates we understand become text; the rest disappear.
  for (let guard = 0; guard < 8 && s.includes('{{'); guard++) {
    s = s.replace(/\{\{([^{}]*)\}\}/g, (_, inner) => {
      const parts = splitTopLevel(inner, '|').map(p => p.trim());
      const fn = INLINE_TEMPLATES[normalizeTemplateName(parts[0])];
      return fn ? fn(parts.slice(1)) : '';
    });
  }
  s = s.replace(/\[\[(?:File|Image):[^\]]*\]\]/gi, '');
  s = s.replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2').replace(/\[\[([^\]]*)\]\]/g, (_, t) => t.replace(/^:?Category:/i, ''));
  s = s.replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '$1').replace(/\[https?:\/\/[^\]\s]+\]/g, '');
  s = s.replace(/<br\s*\/?>/gi, ' / ').replace(/<hr\s*\/?>/gi, ' ');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/'''''|'''|''/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&ndash;/g, '–').replace(/&mdash;/g, '—');
  return s.replace(/\s+/g, ' ').replace(/\s*\/\s*$/, '').trim();
}

// [[Target|Label]] links found in a wikitext fragment.
function extractLinks(value) {
  const out = [];
  const re = /\[\[([^\]|#]*)(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]/g;
  let m;
  while ((m = re.exec(String(value || '')))) {
    const target = m[1].trim();
    if (!target && !m[2]) continue;
    if (!target) { out.push({ target: '', anchor: m[2].trim(), label: stripMarkup(m[3] || m[2]) }); continue; }
    if (/^(File|Image|Category):/i.test(target)) continue;
    out.push({ target, ...(m[2] ? { anchor: m[2].trim() } : {}), label: stripMarkup(m[3] || target) });
  }
  return out;
}

// File names referenced through [[File:...]] or gallery lines.
function extractFiles(value) {
  const out = [];
  const text = String(value || '');
  const re = /\[\[(?:File|Image):([^\]|]+)(?:\|([^\]]*))?\]\]/gi;
  let m;
  while ((m = re.exec(text))) out.push({ file: m[1].trim(), caption: stripMarkup(m[2] || '') });
  const gal = /<gallery[^>]*>([\s\S]*?)<\/gallery>/gi;
  while ((m = gal.exec(text))) {
    for (const line of m[1].split('\n')) {
      const t = line.trim();
      if (!t) continue;
      const [file, ...cap] = t.split('|');
      if (/\.(png|gif|jpe?g|webp|svg)$/i.test(file.trim())) out.push({ file: file.replace(/^(File|Image):/i, '').trim(), caption: stripMarkup(cap.join('|')), rawCaption: cap.join('|') });
    }
  }
  return out;
}

// Heading-delimited sections: [{ level, title, body }]. Text before the first
// heading is returned with level 0 and an empty title.
function sections(text) {
  const out = [];
  const lines = String(text || '').split('\n');
  let cur = { level: 0, title: '', lines: [] };
  for (const line of lines) {
    const m = line.match(/^(={2,6})\s*(.*?)\s*\1\s*$/);
    if (m) {
      out.push(cur);
      cur = { level: m[1].length, title: stripMarkup(m[2]), rawTitle: m[2], lines: [] };
    } else cur.lines.push(line);
  }
  out.push(cur);
  return out.map(s => ({ level: s.level, title: s.title, rawTitle: s.rawTitle || '', body: s.lines.join('\n') }));
}

// The body of a section and all of its subsections.
function sectionTree(text, title) {
  const all = sections(text);
  const want = String(title).toLowerCase();
  const idx = all.findIndex(s => s.title.toLowerCase() === want);
  if (idx === -1) return '';
  const level = all[idx].level;
  const parts = [all[idx].body];
  for (let i = idx + 1; i < all.length && all[i].level > level; i++) {
    parts.push(`${'='.repeat(all[i].level)}${all[i].rawTitle}${'='.repeat(all[i].level)}\n${all[i].body}`);
  }
  return parts.join('\n');
}

function cellValue(raw) {
  // "style=... | value" → value (an attribute prefix has no links/templates before the pipe).
  const parts = splitTopLevel(raw, '|');
  if (parts.length > 1 && /=/.test(parts[0]) && !/\[\[|\{\{/.test(parts[0])) {
    return { attrs: parts[0], value: parts.slice(1).join('|') };
  }
  return { attrs: '', value: raw };
}

function attrNumber(attrs, name) {
  const m = String(attrs || '').match(new RegExp(`${name}\\s*=\\s*"?(\\d+)`, 'i'));
  return m ? parseInt(m[1], 10) : 1;
}

// Parse every {| ... |} wikitable. Rowspans and colspans are expanded so each
// row has one entry per column. Cells keep their raw wikitext; `text` holds
// stripped values.
function parseTables(text) {
  const src = String(text || '');
  const tables = [];
  const lines = src.split('\n');
  const stack = [];
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('{|')) { stack.push({ attrs: t.slice(2), caption: '', rawRows: [], cur: null, pendingHeading: '' }); continue; }
    const tbl = stack[stack.length - 1];
    if (!tbl) continue;
    if (t.startsWith('|}')) {
      if (tbl.cur) tbl.rawRows.push(tbl.cur);
      stack.pop();
      tables.push(finishTable(tbl));
      continue;
    }
    if (t.startsWith('|+')) { tbl.caption = stripMarkup(t.slice(2)); continue; }
    if (t.startsWith('|-')) { if (tbl.cur) tbl.rawRows.push(tbl.cur); tbl.cur = []; continue; }
    if (t.startsWith('!') || t.startsWith('|')) {
      if (!tbl.cur) tbl.cur = [];
      const header = t.startsWith('!');
      const body = t.slice(1);
      const cells = header ? body.split(/!!|\|\|/) : body.split('||');
      for (const c of cells) tbl.cur.push({ header, ...cellValue(c) });
      continue;
    }
    // Continuation of the previous cell (multi-line content).
    if (tbl.cur && tbl.cur.length) tbl.cur[tbl.cur.length - 1].value += '\n' + line;
  }
  return tables;
}

function finishTable(tbl) {
  const grid = [];
  const carry = []; // column → { cell, remaining }
  for (const rawRow of tbl.rawRows) {
    if (!rawRow.length) continue;
    const row = [];
    let col = 0;
    const queue = rawRow.slice();
    while (queue.length || (carry[col] && carry[col].remaining > 0)) {
      if (carry[col] && carry[col].remaining > 0) {
        row[col] = carry[col].cell;
        carry[col].remaining--;
        col++;
        continue;
      }
      const cell = queue.shift();
      if (!cell) break;
      const span = attrNumber(cell.attrs, 'colspan');
      const rows = attrNumber(cell.attrs, 'rowspan');
      const entry = { header: cell.header, raw: cell.value.trim(), text: stripMarkup(cell.value) };
      for (let k = 0; k < span; k++) {
        row[col] = entry;
        if (rows > 1) carry[col] = { cell: entry, remaining: rows - 1 };
        col++;
      }
    }
    grid.push(row);
  }
  let headers = [];
  let bodyStart = 0;
  // The header row is the first all-header row; a lone title row above it is skipped.
  for (let r = 0; r < Math.min(2, grid.length); r++) {
    if (grid[r].length > 1 && grid[r].every(c => c && c.header)) { headers = grid[r].map(c => c.text); bodyStart = r + 1; break; }
  }
  const rows = grid.slice(bodyStart);
  return { attrs: tbl.attrs, caption: tbl.caption, headers, rows };
}

// Turn a parsed table into objects keyed by header (lower-case).
function tableObjects(table) {
  const keys = table.headers.map(h => h.toLowerCase());
  return table.rows.map(row => {
    const o = {};
    keys.forEach((k, i) => { o[k] = row[i] || { raw: '', text: '' }; });
    return o;
  });
}

module.exports = {
  splitTopLevel,
  parseTemplates,
  stripMarkup,
  extractLinks,
  extractFiles,
  sections,
  sectionTree,
  parseTables,
  tableObjects,
};
