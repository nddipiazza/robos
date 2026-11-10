'use strict';

/**
 * Clean, human-friendly Google Docs HTML renderer & two-way Google Docs plain-text parser.
 *
 * Renders each shopping list as a scannable, mobile- and desktop-friendly Google Doc table:
 *   - Sorted Newest-Added First so voice/form additions appear immediately at the top
 *   - Explicit "Added" timestamp column on every item (e.g. "Nov 10, 2026, 8:51 AM")
 *   - Clean columns: Item & Qty | Aisle | Est. Price | Added Timestamp
 *   - Separate "✅ Checked Off / In Cart" table at the bottom with Checked timestamp
 */

const { BADGES, detectAisle } = require('./defaults');
const { computeListStats } = require('./store');

const BADGE_MAP = new Map(BADGES.filter((b) => b.id).map((b) => [b.id, b]));

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return '';
  return `$${Number(n).toFixed(2)}`;
}

function formatQty(qty, unit) {
  const q = Number(qty) || 1;
  const u = String(unit || 'ea').trim();
  if (u === 'ea' && q === 1) return '1 ea';
  return `${q} ${u}`;
}

function formatTimestamp(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return String(isoStr);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Renders HTML designed for clean, human-readable Google Docs viewing on phone & desktop.
 */
function renderGoogleDocHtml(list, options = {}) {
  const stats = list.stats || computeListStats(list);
  const accent = list.accent || '#10b981';
  const syncedAt = options.syncedAt ? formatTimestamp(options.syncedAt) : formatTimestamp(new Date().toISOString());
  const formUrl = options.appsScriptWebAppUrl || options.mobileFormUrl || '';
  const folderUrl = options.folderUrl || '';
  const siblingDocUrls = options.docUrls || {};

  // Sort unchecked items Newest First so newly added voice/form items appear right at the top
  const unchecked = (list.items || [])
    .filter((it) => !it.checked)
    .map((it, idx) => ({ it, idx }))
    .sort((a, b) => {
      const ta = new Date(a.it.updatedAt || a.it.addedAt || 0).getTime() || 0;
      const tb = new Date(b.it.updatedAt || b.it.addedAt || 0).getTime() || 0;
      if (tb !== ta) return tb - ta;
      return a.idx - b.idx;
    })
    .map((x) => x.it);

  const checked = (list.items || [])
    .filter((it) => it.checked)
    .map((it, idx) => ({ it, idx }))
    .sort((a, b) => {
      const ta = new Date(a.it.checkedAt || a.it.updatedAt || 0).getTime() || 0;
      const tb = new Date(b.it.checkedAt || b.it.updatedAt || 0).getTime() || 0;
      if (tb !== ta) return tb - ta;
      return a.idx - b.idx;
    })
    .map((x) => x.it);

  const navLinks = [];
  for (const [id, label] of [['grocery', '🥬 Grocery List'], ['target', '🎯 Target List'], ['costco', '📦 Costco List']]) {
    if (id !== list.id && siblingDocUrls[id]) {
      navLinks.push(`<a href="${escHtml(siblingDocUrls[id])}" style="color:${accent};text-decoration:none;font-weight:bold;">${label}</a>`);
    }
  }
  if (folderUrl) {
    navLinks.push(`<a href="${escHtml(folderUrl)}" style="color:#334155;text-decoration:none;font-weight:bold;">📁 Google Drive Folder</a>`);
  }
  if (formUrl) {
    navLinks.push(`<a href="${escHtml(formUrl)}?list=${encodeURIComponent(list.id)}" style="color:#0284c7;text-decoration:none;font-weight:bold;">📱 Open ${escHtml(list.name)} Interactive Add/Remove Form</a>`);
  }

  const renderTableRows = (items, isChecked) => {
    return items.map((it, rowIndex) => {
      const box = isChecked ? '☑' : '☐';
      const rowBg = rowIndex % 2 === 1 ? '#f8fafc' : '#ffffff';
      const badge = BADGE_MAP.get(it.badge);
      const badgeText = badge ? ` [${badge.icon} ${badge.label.toUpperCase()}]` : '';
      const lineTotal = it.estPrice != null ? formatMoney(it.estPrice * (it.qty || 1)) : '—';
      const nameStyle = isChecked
        ? 'text-decoration:line-through;color:#64748b;font-weight:normal;'
        : 'color:#0f172a;font-weight:bold;';
      const ts = formatTimestamp(isChecked ? (it.checkedAt || it.updatedAt || it.addedAt) : (it.addedAt || it.updatedAt));
      const noteLine = it.note
        ? `<p style="margin:3px 0 0 22px;font-size:9.5pt;color:#475569;">↳ ${escHtml(it.note)}</p>`
        : '';

      return `
        <tr style="background-color:${rowBg};">
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;">
            <p style="margin:0;font-size:11pt;line-height:1.35;">${box} <span style="${nameStyle}">${escHtml(it.name)}</span> — <span style="color:#1e293b;font-weight:bold;">${escHtml(formatQty(it.qty, it.unit))}</span><span style="color:#0f766e;font-size:9.5pt;">${escHtml(badgeText)}</span></p>
            ${noteLine}
          </td>
          <td style="padding:10px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:10pt;color:#334155;">
            <p style="margin:0;">${escHtml(it.aisle || 'General')}</p>
          </td>
          <td style="padding:10px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:10pt;color:#0f766e;font-weight:bold;text-align:right;">
            <p style="margin:0;">${escHtml(lineTotal)}</p>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;font-size:9.5pt;color:#475569;">
            <p style="margin:0;">${escHtml(ts)}</p>
          </td>
        </tr>
      `;
    }).join('\n');
  };

  const toBuySectionHtml = unchecked.length
    ? `
      <h2 style="margin:18px 0 8px 0;font-size:13pt;color:#0f172a;font-family:Arial,sans-serif;">
        🛒 Items To Buy (${unchecked.length}) — Newest First
      </h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #cbd5e1;font-family:Arial,sans-serif;">
        <thead>
          <tr style="background-color:#f1f5f9;">
            <th style="padding:9px 12px;border-bottom:2px solid ${accent};text-align:left;font-size:9.5pt;color:#334155;width:44%;">ITEM &amp; QTY</th>
            <th style="padding:9px 10px;border-bottom:2px solid ${accent};text-align:left;font-size:9.5pt;color:#334155;width:22%;">AISLE</th>
            <th style="padding:9px 10px;border-bottom:2px solid ${accent};text-align:right;font-size:9.5pt;color:#334155;width:12%;">EST.</th>
            <th style="padding:9px 12px;border-bottom:2px solid ${accent};text-align:left;font-size:9.5pt;color:#334155;width:22%;">ADDED</th>
          </tr>
        </thead>
        <tbody>
          ${renderTableRows(unchecked, false)}
        </tbody>
      </table>
    `
    : `<p style="padding:12px;background-color:#ecfdf5;color:#065f46;font-weight:bold;border:1px solid #a7f3d0;">🎉 Every item on ${escHtml(list.name)} is checked off!</p>`;

  const checkedSectionHtml = checked.length
    ? `
      <h2 style="margin:24px 0 8px 0;font-size:12pt;color:#475569;font-family:Arial,sans-serif;">
        ✅ Checked Off / In Cart (${checked.length})
      </h2>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;font-family:Arial,sans-serif;">
        <thead>
          <tr style="background-color:#f8fafc;">
            <th style="padding:8px 12px;border-bottom:1px solid #cbd5e1;text-align:left;font-size:9pt;color:#64748b;width:44%;">ITEM &amp; QTY</th>
            <th style="padding:8px 10px;border-bottom:1px solid #cbd5e1;text-align:left;font-size:9pt;color:#64748b;width:22%;">AISLE</th>
            <th style="padding:8px 10px;border-bottom:1px solid #cbd5e1;text-align:right;font-size:9pt;color:#64748b;width:12%;">EST.</th>
            <th style="padding:8px 12px;border-bottom:1px solid #cbd5e1;text-align:left;font-size:9pt;color:#64748b;width:22%;">CHECKED OFF</th>
          </tr>
        </thead>
        <tbody>
          ${renderTableRows(checked, true)}
        </tbody>
      </table>
    `
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escHtml(list.docTitle || `${list.name} — RobOS Shopping List`)}</title>
</head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:720px;margin:0 auto;padding:8px;">
  <table style="width:100%;border-collapse:collapse;background-color:${accent};color:#ffffff;">
    <tr>
      <td style="padding:14px 16px;">
        <h1 style="margin:0 0 4px 0;font-size:19pt;color:#ffffff;">${escHtml(list.icon || '🛒')} ${escHtml(list.name)} Shopping List</h1>
        <p style="margin:0;font-size:10pt;color:#ffffff;">
          <b>${stats.toBuyCount}</b> to buy &nbsp;·&nbsp; <b>${stats.checkedCount}</b> checked off &nbsp;·&nbsp; Est. remaining: <b>${formatMoney(stats.estRemaining) || '$0.00'}</b> &nbsp;·&nbsp; Last synced: <b>${escHtml(syncedAt)}</b>
        </p>
      </td>
    </tr>
  </table>

  ${navLinks.length ? `<p style="margin:8px 0 12px 0;font-size:10pt;color:#475569;">${navLinks.join(' &nbsp;·&nbsp; ')}</p>` : ''}

  ${toBuySectionHtml}
  ${checkedSectionHtml}
</body>
</html>`;
}

/**
 * Parses plain text exported from a Google Doc (`text/plain`) back into shopping list items,
 * preserving existing item IDs, prices, aisles, and timestamps when names match, while capturing:
 * - items checked/unchecked in Google Docs (`☑`, `[x]`, `✓` vs `☐`, `[ ]`)
 * - brand-new items typed directly in Google Docs
 */
function parseGoogleDocText(plainText, existingList) {
  const lines = String(plainText || '').split(/\r?\n/);
  const existingItems = Array.isArray(existingList?.items) ? existingList.items : [];
  const knownAisles = new Set(existingList?.aisles || []);
  const byNormName = new Map();
  for (const it of existingItems) {
    byNormName.set(it.name.trim().toLowerCase(), it);
  }

  let currentAisle = existingList?.aisles?.[0] || 'General';
  let inCheckedSection = false;
  const parsedItems = [];
  const seenNames = new Set();

  for (const rawLine of lines) {
    const line = rawLine.replace(/\u00a0/g, ' ').trim();
    if (!line) continue;

    if (/^(RobOS Household|Switch list:|📱|👉|🏠|💡|Synced by|🎉 Every item|ITEM & QTY|AISLE|EST\.|ADDED|CHECKED OFF)/i.test(line)) continue;
    if (/^\d+\s+to buy\b/i.test(line)) continue;
    if (/^↳/.test(line)) {
      if (parsedItems.length > 0) {
        parsedItems[parsedItems.length - 1].note = line.replace(/^↳\s*/, '').trim();
      }
      continue;
    }

    if (/^✅\s*(?:In Cart|Checked Off)/i.test(line)) {
      inCheckedSection = true;
      continue;
    }
    if (/^🛒\s*Items To Buy/i.test(line)) {
      inCheckedSection = false;
      continue;
    }
    const aisleHeadingMatch = line.match(/^([A-Za-z][A-Za-z0-9 &/'-]+?)\s*\(\d+\)$/);
    if (aisleHeadingMatch && !/^Items To Buy|^Checked Off/i.test(aisleHeadingMatch[1])) {
      const candidate = aisleHeadingMatch[1].trim();
      currentAisle = candidate;
      inCheckedSection = false;
      knownAisles.add(candidate);
      continue;
    }

    // Checkbox item line detection: ☐, ☑, ✅, ✓, [ ], [x], - [ ], * [x]
    const boxMatch = line.match(/^(?:[-*•]\s*)?(☐|☑|✅|✓|\[\s*\]|\[[xX✓]\])\s+(.+)$/);
    if (!boxMatch) continue;

    const marker = boxMatch[1];
    const checked = inCheckedSection || /^(☑|✅|✓|\[[xX✓]\])$/.test(marker);
    let rest = boxMatch[2].trim();

    // Strip trailing badge tags like [🌿 ORGANIC]
    let badge = '';
    rest = rest.replace(/\s*\[(?:🔥\s*MUST HAVE|🏷️\s*SALE \/ COUPON|🌿\s*ORGANIC|⭐\s*STORE BRAND \/ FAV|[^\]]+)\]\s*$/i, (m) => {
      if (/MUST HAVE|URGENT/i.test(m)) badge = 'urgent';
      else if (/SALE|COUPON|DEAL/i.test(m)) badge = 'deal';
      else if (/ORGANIC/i.test(m)) badge = 'organic';
      else if (/STORE BRAND|KIRKLAND|FAV/i.test(m)) badge = 'kirkland';
      return '';
    }).trim();

    // Strip optional ` · $12.34`
    let linePrice = null;
    rest = rest.replace(/\s*·\s*\$(\d+(?:\.\d+)?)\s*$/, (_, p) => {
      linePrice = Number(p);
      return '';
    }).trim();

    // Extract ` — 2 pack`
    let qty = 1;
    let unit = 'ea';
    const qtyMatch = rest.match(/^(.+?)\s+[—–-]\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?$/);
    let itemName = rest;
    if (qtyMatch) {
      itemName = qtyMatch[1].trim();
      qty = Number(qtyMatch[2]) || 1;
      unit = (qtyMatch[3] || 'ea').trim();
    }
    if (!itemName || /^Item Name$/i.test(itemName)) continue;

    const norm = itemName.toLowerCase();
    if (seenNames.has(norm)) continue;
    seenNames.add(norm);

    const prev = byNormName.get(norm);
    const estPrice = prev?.estPrice != null
      ? prev.estPrice
      : (linePrice != null && qty > 0 ? Math.round((linePrice / qty) * 100) / 100 : null);

    parsedItems.push({
      id: prev?.id || undefined,
      name: prev?.name || itemName,
      qty,
      unit: unit || prev?.unit || 'ea',
      aisle: prev ? prev.aisle : (detectAisle(existingList, itemName) || currentAisle),
      estPrice,
      badge: badge || prev?.badge || '',
      note: prev?.note || '',
      checked,
      addedAt: prev?.addedAt,
      updatedAt: prev?.updatedAt,
      checkedAt: prev?.checkedAt,
    });
  }

  return parsedItems;
}

module.exports = {
  renderGoogleDocHtml,
  parseGoogleDocText,
  formatMoney,
  formatQty,
  formatTimestamp,
};
