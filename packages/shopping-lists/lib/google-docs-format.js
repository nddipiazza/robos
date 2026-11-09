'use strict';

/**
 * Mobile-first Google Docs HTML renderer & two-way Google Docs plain-text parser.
 *
 * Google Drive v3 converts uploaded `text/html` into a native `application/vnd.google-apps.document`
 * that opens cleanly in the Google Docs and Google Drive iOS/Android mobile apps, complete with
 * store color headers, aisle groupings, `☐`/`☑` checkboxes, quantities, prices, and a prominent
 * 1-tap button at the top to launch the interactive Mobile Add/Remove Form Web App.
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

/**
 * Renders HTML designed specifically for Google Docs mobile conversion & mobile-preview display.
 */
function renderGoogleDocHtml(list, options = {}) {
  const stats = list.stats || computeListStats(list);
  const accent = list.accent || '#10b981';
  const syncedAt = options.syncedAt
    ? new Date(options.syncedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Live';
  const formUrl = options.appsScriptWebAppUrl || options.mobileFormUrl || '';
  const lanFormUrl = options.mobileLanUrl || '';
  const folderUrl = options.folderUrl || '';
  const siblingDocUrls = options.docUrls || {};

  const unchecked = (list.items || []).filter((it) => !it.checked);
  const checked = (list.items || []).filter((it) => it.checked);

  // Group unchecked items by aisle in canonical aisle order
  const byAisle = new Map();
  for (const a of list.aisles || []) byAisle.set(a, []);
  for (const it of unchecked) {
    const a = it.aisle || 'General';
    if (!byAisle.has(a)) byAisle.set(a, []);
    byAisle.get(a).push(it);
  }

  const navLinks = [];
  for (const [id, label] of [['grocery', '🥬 Grocery'], ['target', '🎯 Target'], ['costco', '📦 Costco']]) {
    if (id !== list.id && siblingDocUrls[id]) {
      navLinks.push(`<a href="${escHtml(siblingDocUrls[id])}" style="color:${accent};text-decoration:none;font-weight:bold;">${label}</a>`);
    }
  }
  if (folderUrl) {
    navLinks.push(`<a href="${escHtml(folderUrl)}" style="color:#475569;text-decoration:none;">📁 All Lists in Drive</a>`);
  }

  const renderItemLine = (it, isChecked) => {
    const box = isChecked ? '☑' : '☐';
    const badge = BADGE_MAP.get(it.badge);
    const badgeHtml = badge
      ? ` <span style="background-color:#f1f5f9;color:${badge.color};font-size:9pt;font-weight:bold;padding:1px 5px;border-radius:4px;">[${escHtml(badge.icon)} ${escHtml(badge.label.toUpperCase())}]</span>`
      : '';
    const priceStr = it.estPrice != null ? ` · <span style="color:#0f766e;font-weight:bold;">${formatMoney(it.estPrice * (it.qty || 1))}</span>` : '';
    const noteStr = it.note ? `<br/><span style="color:#64748b;font-size:9.5pt;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;↳ ${escHtml(it.note)}</span>` : '';
    const nameStyle = isChecked
      ? 'text-decoration:line-through;color:#94a3b8;font-weight:normal;'
      : 'color:#0f172a;font-weight:bold;';
    return `<p style="margin:6px 0 8px 0;line-height:1.38;font-size:11.5pt;">`
      + `<span style="font-size:13pt;">${box}</span>&nbsp; `
      + `<span style="${nameStyle}">${escHtml(it.name)}</span> `
      + `<span style="color:#334155;font-size:10.5pt;">— ${escHtml(formatQty(it.qty, it.unit))}</span>`
      + `${priceStr}${badgeHtml}${noteStr}`
      + `</p>`;
  };

  let aisleHtml = '';
  for (const [aisle, items] of byAisle.entries()) {
    if (!items.length) continue;
    aisleHtml += `
      <h2 style="margin:18px 0 6px 0;padding:5px 10px;background-color:#f8fafc;border-left:4px solid ${accent};color:#0f172a;font-size:12pt;font-family:Arial,sans-serif;">
        ${escHtml(aisle)} (${items.length})
      </h2>
      ${items.map((it) => renderItemLine(it, false)).join('\n')}
    `;
  }

  if (!unchecked.length) {
    aisleHtml = `<p style="padding:14px;background-color:#ecfdf5;color:#065f46;font-weight:bold;border-radius:6px;">🎉 Every item on ${escHtml(list.name)} is checked off!</p>`;
  }

  let checkedHtml = '';
  if (checked.length) {
    checkedHtml = `
      <h2 style="margin:22px 0 6px 0;padding:5px 10px;background-color:#f1f5f9;border-left:4px solid #94a3b8;color:#475569;font-size:11.5pt;font-family:Arial,sans-serif;">
        ✅ In Cart / Checked Off (${checked.length})
      </h2>
      ${checked.map((it) => renderItemLine(it, true)).join('\n')}
    `;
  }

  const formBannerHtml = formUrl || lanFormUrl
    ? `
      <table style="width:100%;border-collapse:collapse;margin:10px 0 14px 0;background-color:#f0fdf4;border:2px solid ${accent};">
        <tr>
          <td style="padding:12px 14px;font-family:Arial,sans-serif;">
            <p style="margin:0 0 6px 0;font-size:11pt;font-weight:bold;color:#0f172a;">
              📱 Easy Mobile Form — Add, Check Off, or Remove Items with Buttons:
            </p>
            ${formUrl ? `<p style="margin:4px 0;"><a href="${escHtml(formUrl)}?list=${encodeURIComponent(list.id)}" style="color:${accent};font-size:12pt;font-weight:bold;">👉 Open ${escHtml(list.name)} Interactive Add/Remove Form (Anywhere / Mobile)</a></p>` : ''}
            ${lanFormUrl && lanFormUrl !== formUrl ? `<p style="margin:4px 0;font-size:10pt;"><a href="${escHtml(lanFormUrl)}?list=${encodeURIComponent(list.id)}" style="color:#0284c7;font-weight:bold;">🏠 Open Home Wi-Fi / RobOS Mesh Instant Form</a></p>` : ''}
          </td>
        </tr>
      </table>
    `
    : `
      <table style="width:100%;border-collapse:collapse;margin:10px 0 14px 0;background-color:#f8fafc;border:1px solid #cbd5e1;">
        <tr>
          <td style="padding:10px 12px;font-family:Arial,sans-serif;font-size:10pt;color:#334155;">
            💡 <b>Tip:</b> Open the <b>RobOS Shopping Lists</b> mobile form (or deploy the included Google Drive Apps Script Web App) for 1-tap <b>+ Add</b> / <b>−</b> / <b>Remove</b> buttons right from your phone. You can also edit lines directly in this Google Doc (` + '`☐`' + ` / ` + '`☑`' + `) and sync back!
          </td>
        </tr>
      </table>
    `;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escHtml(list.docTitle || `${list.name} — RobOS Shopping List`)}</title>
</head>
<body style="font-family:Arial,Helvetica,sans-serif;color:#0f172a;max-width:680px;margin:0 auto;padding:8px;">
  <table style="width:100%;border-collapse:collapse;background-color:${accent};color:#ffffff;">
    <tr>
      <td style="padding:14px 16px;">
        <p style="margin:0;font-size:9.5pt;letter-spacing:0.08em;text-transform:uppercase;color:#ffffff;">RobOS Household · Shopping Lists</p>
        <h1 style="margin:4px 0 4px 0;font-size:20pt;color:#ffffff;">${escHtml(list.icon || '🛒')} ${escHtml(list.name)} Shopping List</h1>
        <p style="margin:0;font-size:10.5pt;color:#ffffff;">
          <b>${stats.toBuyCount}</b> to buy &nbsp;·&nbsp; <b>${stats.checkedCount}</b> in cart &nbsp;·&nbsp; Est. remaining: <b>${formatMoney(stats.estRemaining) || '$0.00'}</b> (Total ${formatMoney(stats.estTotal) || '$0.00'})
        </p>
      </td>
    </tr>
  </table>

  ${navLinks.length ? `<p style="margin:8px 0;font-size:10pt;">Switch list: ${navLinks.join(' &nbsp;|&nbsp; ')}</p>` : ''}
  ${formBannerHtml}

  ${aisleHtml}
  ${checkedHtml}

  <hr style="border:none;border-top:1px solid #e2e8f0;margin:22px 0 8px 0;"/>
  <p style="font-size:8.5pt;color:#64748b;margin:0;">
    Synced by <b>RobOS Household Shopping Lists</b> · Updated ${escHtml(syncedAt)} · Tip: Add a new line starting with <code>☐ Item Name — 2 pack</code> in Google Docs mobile to sync new items back automatically.
  </p>
</body>
</html>`;
}

/**
 * Parses plain text exported from a Google Doc (`text/plain`) back into shopping list items,
 * preserving existing item IDs, prices, and metadata when names match, while capturing:
 * - items checked/unchecked in Google Docs mobile (`☑`, `[x]`, `✓` vs `☐`, `[ ]`)
 * - brand-new items typed directly in Google Docs mobile
 * - items deleted from the Google Doc when `honorDeletions` is true
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

    // Skip boilerplate headers / footers / notes
    if (/^(RobOS Household|Switch list:|📱 Easy Mobile Form|👉 Open |🏠 Open |💡 Tip:|Synced by RobOS|🎉 Every item)/i.test(line)) continue;
    if (/^\d+\s+to buy\b/i.test(line)) continue;
    if (/^↳/.test(line)) {
      if (parsedItems.length > 0) {
        parsedItems[parsedItems.length - 1].note = line.replace(/^↳\s*/, '').trim();
      }
      continue;
    }

    // Section heading detection
    if (/^✅\s*In Cart/i.test(line)) {
      inCheckedSection = true;
      continue;
    }
    const aisleHeadingMatch = line.match(/^([A-Za-z][A-Za-z0-9 &/'-]+?)\s*\(\d+\)$/);
    if (aisleHeadingMatch) {
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
      aisle: prev && inCheckedSection ? prev.aisle : (currentAisle || detectAisle(existingList, itemName)),
      estPrice,
      badge: badge || prev?.badge || '',
      note: prev?.note || '',
      checked,
      addedAt: prev?.addedAt,
    });
  }

  return parsedItems;
}

module.exports = {
  renderGoogleDocHtml,
  parseGoogleDocText,
  formatMoney,
  formatQty,
};
