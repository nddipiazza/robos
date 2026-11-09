'use strict';

/**
 * Generates a self-contained Google Apps Script Web App (`Code.gs` + `Index.html`)
 * that lives inside the user's Google Drive (`RobOS Household Shopping Lists`) and serves
 * a mobile-first, form-driven Shopping Lists app (`https://script.google.com/macros/s/.../exec`)
 * over cellular 5G or Wi-Fi anywhere in the world.
 *
 * Every Add / Remove / + / - / Check action in the Apps Script Web App updates BOTH:
 *   1. `shopping-lists.json` in the Google Drive folder (shared with RobOS desktop), and
 *   2. The 3 native Google Docs (`Grocery`, `Target`, `Costco`) in Google Drive!
 */

function generateAppsScriptCodeGs({ folderId = '', docIds = {} } = {}) {
  return `/**
 * RobOS Household Shopping Lists — Serverless Google Drive Mobile Form Web App
 *
 * Setup (takes 60 seconds once in Google Drive):
 *   1. Go to https://script.google.com -> New Project -> name it "RobOS Shopping Lists Mobile".
 *   2. Paste this file into Code.gs, and create an HTML file named "Index" (Index.html) with Index.html's contents.
 *   3. Click Deploy -> New deployment -> Web app -> Execute as: Me -> Who has access: Only myself (or Anyone with Google account for family).
 *   4. Copy the Web App URL and paste it into RobOS Shopping Lists -> Google Drive Sync -> Mobile Form URL!
 *      RobOS automatically embeds your Web App link at the top of your Grocery, Target, and Costco Google Docs!
 */

const FOLDER_ID = ${JSON.stringify(folderId || 'PASTE_DRIVE_FOLDER_ID')};
const STATE_FILENAME = 'shopping-lists.json';
const DOC_IDS = ${JSON.stringify(docIds || {}, null, 2)};

function doGet(e) {
  const initialList = (e && e.parameter && e.parameter.list) ? String(e.parameter.list) : '';
  const tpl = HtmlService.createTemplateFromFile('Index');
  tpl.initialList = initialList;
  return tpl.evaluate()
    .setTitle('RobOS Shopping Lists')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
}

function getFolder_() {
  if (FOLDER_ID && FOLDER_ID !== 'PASTE_DRIVE_FOLDER_ID') {
    return DriveApp.getFolderById(FOLDER_ID);
  }
  const iter = DriveApp.getFoldersByName('RobOS Household Shopping Lists');
  return iter.hasNext() ? iter.next() : DriveApp.createFolder('RobOS Household Shopping Lists');
}

function loadState() {
  const folder = getFolder_();
  const files = folder.getFilesByName(STATE_FILENAME);
  if (files.hasNext()) {
    return JSON.parse(files.next().getBlob().getDataAsString('UTF-8'));
  }
  return { activeListId: 'grocery', lists: [] };
}

function saveState_(state) {
  state.updatedAt = new Date().toISOString();
  const folder = getFolder_();
  const payload = JSON.stringify(state, null, 2);
  const files = folder.getFilesByName(STATE_FILENAME);
  if (files.hasNext()) {
    files.next().setContent(payload);
  } else {
    folder.createFile(STATE_FILENAME, payload, MimeType.PLAIN_TEXT);
  }
  return state;
}

function syncListToGoogleDoc_(list, docId) {
  if (!docId) return;
  try {
    const doc = DocumentApp.openById(docId);
    const body = doc.getBody();
    body.clear();
    const header = body.appendParagraph((list.icon || '🛒') + ' ' + list.name + ' Shopping List');
    header.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    const unchecked = (list.items || []).filter(function(i) { return !i.checked; });
    const checked = (list.items || []).filter(function(i) { return i.checked; });
    body.appendParagraph(unchecked.length + ' to buy · ' + checked.length + ' in cart · Updated ' + new Date().toLocaleString());
    const webUrl = ScriptApp.getService().getUrl();
    if (webUrl) {
      const linkP = body.appendParagraph('📱 Open Interactive Add / Remove Form');
      linkP.setLinkUrl(webUrl + '?list=' + encodeURIComponent(list.id));
    }
    const groups = {};
    unchecked.forEach(function(it) {
      const a = it.aisle || 'General';
      if (!groups[a]) groups[a] = [];
      groups[a].push(it);
    });
    Object.keys(groups).forEach(function(aisle) {
      const h = body.appendParagraph(aisle + ' (' + groups[aisle].length + ')');
      h.setHeading(DocumentApp.ParagraphHeading.HEADING2);
      groups[aisle].forEach(function(it) {
        body.appendParagraph('☐  ' + it.name + ' — ' + (it.qty || 1) + ' ' + (it.unit || 'ea') + (it.note ? ' (' + it.note + ')' : ''));
      });
    });
    if (checked.length) {
      const ch = body.appendParagraph('✅ In Cart (' + checked.length + ')');
      ch.setHeading(DocumentApp.ParagraphHeading.HEADING2);
      checked.forEach(function(it) {
        body.appendParagraph('☑  ' + it.name + ' — ' + (it.qty || 1) + ' ' + (it.unit || 'ea'));
      });
    }
    doc.saveAndClose();
  } catch (err) {
    Logger.log('Doc sync skipped: ' + err);
  }
}

function mutateList(action) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const state = loadState();
    const list = (state.lists || []).find(function(l) { return l.id === action.listId; }) || state.lists[0];
    if (!list) throw new Error('Shopping list not found');
    const now = new Date().toISOString();

    if (action.type === 'add') {
      const name = String(action.name || '').trim();
      if (!name) throw new Error('Enter an item name');
      const existing = (list.items || []).find(function(i) { return !i.checked && i.name.toLowerCase() === name.toLowerCase(); });
      if (existing) {
        existing.qty = Number(existing.qty || 1) + Number(action.qty || 1);
        existing.updatedAt = now;
      } else {
        list.items.unshift({
          id: 'item_' + Utilities.getUuid().slice(0, 12),
          name: name,
          qty: Number(action.qty || 1),
          unit: action.unit || 'ea',
          aisle: action.aisle || (list.aisles && list.aisles[0]) || 'General',
          estPrice: action.estPrice ? Number(action.estPrice) : null,
          badge: action.badge || '',
          note: action.note || '',
          checked: false,
          addedAt: now,
          updatedAt: now
        });
      }
    } else if (action.type === 'toggle') {
      const it = list.items.find(function(i) { return i.id === action.itemId; });
      if (it) { it.checked = !it.checked; it.updatedAt = now; }
    } else if (action.type === 'qty') {
      const it = list.items.find(function(i) { return i.id === action.itemId; });
      if (it) { it.qty = Math.max(1, Number(it.qty || 1) + Number(action.delta || 0)); it.updatedAt = now; }
    } else if (action.type === 'remove') {
      list.items = list.items.filter(function(i) { return i.id !== action.itemId; });
    } else if (action.type === 'clearChecked') {
      list.items = list.items.filter(function(i) { return !i.checked; });
    }

    list.updatedAt = now;
    saveState_(state);
    const docId = (state.sync && state.sync.docIds && state.sync.docIds[list.id]) || DOC_IDS[list.id];
    syncListToGoogleDoc_(list, docId);
    return state;
  } finally {
    lock.releaseLock();
  }
}
`;
}

function generateAppsScriptIndexHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>RobOS Shopping Lists · Mobile</title>
  <style>
    :root { --bg:#0b1120; --card:#131c31; --border:#233252; --text:#f8fafc; --muted:#94a3b8; --accent:#10b981; }
    * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
    body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:var(--bg); color:var(--text); padding-bottom:40px; }
    .top { position:sticky; top:0; z-index:10; background:rgba(11,17,32,0.94); backdrop-filter:blur(12px); padding:12px 14px; border-bottom:1px solid var(--border); }
    .tabs { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-top:10px; }
    .tab { border:1px solid var(--border); background:var(--card); color:var(--text); padding:10px 8px; border-radius:12px; font-weight:700; font-size:14px; cursor:pointer; }
    .tab.active { border-color:var(--accent); box-shadow:0 0 0 2px rgba(16,185,129,0.28); }
    .wrap { max-width:560px; margin:0 auto; padding:14px; }
    .form-card { background:var(--card); border:1px solid var(--border); border-radius:16px; padding:14px; margin-bottom:14px; }
    .row { display:flex; gap:8px; margin-bottom:8px; }
    input, select { background:#090e1a; color:var(--text); border:1px solid var(--border); border-radius:10px; padding:12px; font-size:16px; width:100%; }
    .btn-add { width:100%; padding:13px; border:none; border-radius:12px; background:var(--accent); color:#04130d; font-weight:800; font-size:16px; cursor:pointer; }
    .chips { display:flex; gap:6px; overflow-x:auto; padding-bottom:6px; margin-bottom:12px; }
    .chip { flex:0 0 auto; border:1px solid var(--border); background:#17223b; color:#e2e8f0; border-radius:999px; padding:7px 12px; font-size:13px; font-weight:600; cursor:pointer; }
    .item { display:flex; align-items:center; gap:10px; background:var(--card); border:1px solid var(--border); border-radius:14px; padding:11px 12px; margin-bottom:8px; }
    .item.checked { opacity:0.56; }
    .item.checked .name { text-decoration:line-through; }
    .chk { width:30px; height:30px; border-radius:50%; border:2px solid var(--accent); background:transparent; color:var(--text); font-size:16px; cursor:pointer; flex-shrink:0; }
    .item.checked .chk { background:var(--accent); color:#04130d; }
    .info { flex:1; min-width:0; }
    .name { font-weight:700; font-size:15px; }
    .meta { font-size:12px; color:var(--muted); margin-top:2px; }
    .stepper { display:flex; align-items:center; gap:4px; }
    .step-btn { width:32px; height:32px; border-radius:8px; border:1px solid var(--border); background:#0d1526; color:var(--text); font-size:18px; font-weight:700; cursor:pointer; }
    .del-btn { width:34px; height:32px; border-radius:8px; border:1px solid rgba(239,68,68,0.4); background:rgba(239,68,68,0.14); color:#fca5a5; font-size:15px; cursor:pointer; }
  </style>
</head>
<body>
  <div class="top">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <strong>🛒 RobOS Household Lists</strong>
      <span id="status" style="font-size:12px;color:#94a3b8;">Google Drive Live</span>
    </div>
    <div class="tabs" id="tabs"></div>
  </div>
  <div class="wrap">
    <form class="form-card" id="add-form">
      <div class="row">
        <input id="f-name" placeholder="Add item (milk, paper towels…)" required autocomplete="off">
      </div>
      <div class="row">
        <input id="f-qty" type="number" value="1" min="1" step="1" style="max-width:88px;">
        <select id="f-unit"><option>ea</option><option>pack</option><option>lb</option><option>gal</option><option>case</option><option>bag</option><option>box</option></select>
        <select id="f-aisle"></select>
      </div>
      <div class="row">
        <input id="f-note" placeholder="Optional note / coupon / brand">
      </div>
      <button type="submit" class="btn-add">+ Add Item to List</button>
    </form>
    <div class="chips" id="staples"></div>
    <div id="items"></div>
    <button id="clear-btn" style="width:100%;margin-top:10px;padding:11px;border-radius:12px;border:1px solid var(--border);background:transparent;color:var(--muted);font-weight:700;cursor:pointer;">🧹 Clear Checked Items</button>
  </div>
  <script>
    let STATE = { lists: [], activeListId: '<?= initialList ?>' || 'grocery' };
    function activeList() {
      return (STATE.lists || []).find(l => l.id === STATE.activeListId) || (STATE.lists || [])[0];
    }
    function setBusy(msg) { document.getElementById('status').textContent = msg; }
    function render() {
      const list = activeList();
      if (!list) return;
      document.documentElement.style.setProperty('--accent', list.accent || '#10b981');
      document.getElementById('tabs').innerHTML = (STATE.lists || []).map(l =>
        '<button type="button" class="tab ' + (l.id === list.id ? 'active' : '') + '" onclick="pickList(\\'' + l.id + '\\')">' + (l.icon || '🛒') + ' ' + l.name + '</button>'
      ).join('');
      document.getElementById('f-aisle').innerHTML = (list.aisles || ['General']).map(a => '<option>' + a + '</option>').join('');
      document.getElementById('staples').innerHTML = (list.staples || []).map((s, idx) =>
        '<button type="button" class="chip" onclick="quickStaple(' + idx + ')">+ ' + s.name + '</button>'
      ).join('');
      const sorted = [...(list.items || [])].sort((a, b) => Number(a.checked) - Number(b.checked));
      document.getElementById('items').innerHTML = sorted.map(it =>
        '<div class="item ' + (it.checked ? 'checked' : '') + '">' +
          '<button class="chk" onclick="act({type:\\'toggle\\',itemId:\\'' + it.id + '\\'})">' + (it.checked ? '✓' : '') + '</button>' +
          '<div class="info"><div class="name">' + it.name + '</div><div class="meta">' + it.aisle + ' · ' + it.qty + ' ' + (it.unit || 'ea') + (it.note ? ' · ' + it.note : '') + '</div></div>' +
          '<div class="stepper">' +
            '<button class="step-btn" onclick="act({type:\\'qty\\',itemId:\\'' + it.id + '\\',delta:-1})">−</button>' +
            '<button class="step-btn" onclick="act({type:\\'qty\\',itemId:\\'' + it.id + '\\',delta:1})">+</button>' +
            '<button class="del-btn" onclick="act({type:\\'remove\\',itemId:\\'' + it.id + '\\'})">✕</button>' +
          '</div>' +
        '</div>'
      ).join('');
    }
    function pickList(id) { STATE.activeListId = id; render(); }
    function act(payload) {
      const list = activeList();
      payload.listId = list.id;
      setBusy('Saving to Drive…');
      google.script.run.withSuccessHandler(next => { next.activeListId = list.id; STATE = next; setBusy('Synced ✓'); render(); }).mutateList(payload);
    }
    function quickStaple(i) {
      const s = (activeList().staples || [])[i];
      if (s) act({ type: 'add', name: s.name, qty: s.qty || 1, unit: s.unit || 'ea', aisle: s.aisle });
    }
    document.getElementById('add-form').addEventListener('submit', e => {
      e.preventDefault();
      const name = document.getElementById('f-name').value.trim();
      if (!name) return;
      act({
        type: 'add',
        name,
        qty: Number(document.getElementById('f-qty').value || 1),
        unit: document.getElementById('f-unit').value,
        aisle: document.getElementById('f-aisle').value,
        note: document.getElementById('f-note').value.trim(),
      });
      document.getElementById('f-name').value = '';
      document.getElementById('f-note').value = '';
      document.getElementById('f-qty').value = '1';
    });
    document.getElementById('clear-btn').addEventListener('click', () => act({ type: 'clearChecked' }));
    google.script.run.withSuccessHandler(s => { if ('<?= initialList ?>') s.activeListId = '<?= initialList ?>'; STATE = s; render(); }).loadState();
  </script>
</body>
</html>
`;
}

module.exports = {
  generateAppsScriptCodeGs,
  generateAppsScriptIndexHtml,
};
