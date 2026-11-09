'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createStore } = require('../../../shopping-lists/lib/store');
const { renderGoogleDocHtml, parseGoogleDocText } = require('../../../shopping-lists/lib/google-docs-format');
const { syncWithGoogleDrive, shareShoppingFolder, GDOC_MIME, FOLDER_MIME } = require('../../../shopping-lists/lib/google-drive-sync');
const { generateAppsScriptCodeGs, generateAppsScriptIndexHtml } = require('../../../shopping-lists/lib/apps-script-bundle');
const { buildMatrix, renderQrSvg } = require('../../../shopping-lists/lib/qr');

function makeTempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'robos-shopping-unit-'));
  const store = createStore({ configDir: dir });
  return { dir, store, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

/** In-memory mock of Google Drive v3 REST API for hermetic unit testing. */
function createMockDriveFetch() {
  const files = new Map();
  const permissions = [];
  let seq = 1;

  const fetchImpl = async (rawUrl, init = {}) => {
    const url = new URL(rawUrl, 'https://www.googleapis.com');
    const method = (init.method || 'GET').toUpperCase();
    const pathname = url.pathname;

    // Multipart upload
    if (method === 'POST' && pathname === '/upload/drive/v3/files') {
      const rawBody = Buffer.isBuffer(init.body) ? init.body.toString('utf8') : String(init.body || '');
      const parts = rawBody.split(/--robos-shop-[a-z0-9-]+/);
      const metaPart = parts[1] || '';
      const contentPart = parts[2] || '';
      const metaJson = metaPart.split('\r\n\r\n').slice(1).join('\r\n\r\n').trim();
      const content = contentPart.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
      const meta = JSON.parse(metaJson);
      const id = `drv_${seq++}`;
      const record = {
        id,
        name: meta.name,
        mimeType: meta.mimeType || 'application/octet-stream',
        parents: meta.parents || [],
        content,
        modifiedTime: new Date().toISOString(),
      };
      files.set(id, record);
      return new Response(JSON.stringify(record), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Media PATCH update
    const patchMatch = pathname.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/);
    if (method === 'PATCH' && patchMatch) {
      const id = decodeURIComponent(patchMatch[1]);
      const record = files.get(id);
      if (!record) return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
      record.content = Buffer.isBuffer(init.body) ? init.body.toString('utf8') : String(init.body || '');
      record.modifiedTime = new Date().toISOString();
      return new Response(JSON.stringify(record), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Metadata create (folders)
    if (method === 'POST' && pathname === '/drive/v3/files') {
      const meta = JSON.parse(String(init.body || '{}'));
      const id = `drv_${seq++}`;
      const record = {
        id,
        name: meta.name,
        mimeType: meta.mimeType,
        parents: meta.parents || [],
        content: '',
        modifiedTime: new Date().toISOString(),
      };
      files.set(id, record);
      return new Response(JSON.stringify(record), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // List query
    if (method === 'GET' && pathname === '/drive/v3/files') {
      const q = url.searchParams.get('q') || '';
      const parentMatch = q.match(/'([^']+)' in parents/);
      const nameMatch = q.match(/name = '([^']+)'/);
      const mimeMatch = q.match(/mimeType = '([^']+)'/);
      let list = [...files.values()];
      if (parentMatch) list = list.filter((f) => (f.parents || []).includes(parentMatch[1]));
      if (nameMatch) list = list.filter((f) => f.name === nameMatch[1]);
      if (mimeMatch) list = list.filter((f) => f.mimeType === mimeMatch[1]);
      return new Response(JSON.stringify({ files: list }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Export Google Doc as plain text
    const exportMatch = pathname.match(/^\/drive\/v3\/files\/([^/]+)\/export$/);
    if (method === 'GET' && exportMatch) {
      const id = decodeURIComponent(exportMatch[1]);
      const record = files.get(id);
      if (!record) return new Response('Not found', { status: 404 });
      // Simulate Google Docs plain-text export if record.exportedText is set, otherwise strip HTML tags
      const plain = record.exportedText ?? record.content
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|h1|h2|tr|div)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&');
      return new Response(plain, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }

    // Share permissions
    const permMatch = pathname.match(/^\/drive\/v3\/files\/([^/]+)\/permissions$/);
    if (method === 'POST' && permMatch) {
      const fileId = decodeURIComponent(permMatch[1]);
      const body = JSON.parse(String(init.body || '{}'));
      const entry = { id: `perm_${seq++}`, fileId, emailAddress: body.emailAddress, role: body.role };
      permissions.push(entry);
      return new Response(JSON.stringify(entry), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Get single file metadata or alt=media
    const fileMatch = pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (method === 'GET' && fileMatch) {
      const id = decodeURIComponent(fileMatch[1]);
      const record = files.get(id);
      if (!record) return new Response(JSON.stringify({ error: { message: 'Not found' } }), { status: 404 });
      if (url.searchParams.get('alt') === 'media') {
        return new Response(record.content, { status: 200 });
      }
      return new Response(JSON.stringify(record), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: { message: `Unhandled ${method} ${pathname}` } }), { status: 500 });
  };

  return { files, permissions, fetchImpl };
}

describe('RobOS Shopping Lists — Store, Form Actions, Google Docs Sync & QR', () => {
  it('seeds the 3 household shopping lists: 1) Grocery, 2) Target, 3) Costco', () => {
    const { store, cleanup } = makeTempStore();
    try {
      const snap = store.getSnapshot();
      assert.deepEqual(snap.lists.map((l) => l.id), ['grocery', 'target', 'costco']);
      assert.deepEqual(snap.lists.map((l) => l.name), ['Grocery', 'Target', 'Costco']);
      for (const list of snap.lists) {
        assert.ok(list.items.length >= 6, `${list.name} has starter items`);
        assert.ok(list.staples.length >= 8, `${list.name} has 1-tap staples`);
        assert.ok(list.aisles.length >= 6, `${list.name} has store aisles`);
      }
    } finally {
      cleanup();
    }
  });

  it('supports form-like add, duplicate merge, +/- quantity, toggle, remove, clearChecked, undo, and Household CSV export', () => {
    const { store, cleanup } = makeTempStore();
    try {
      const addRes = store.addItem('grocery', {
        name: 'Fresh Cilantro',
        qty: 2,
        unit: 'bunch',
        aisle: 'auto',
        estPrice: 1.29,
        badge: 'organic',
        note: 'For street tacos',
      });
      assert.equal(addRes.merged, false);
      assert.equal(addRes.item.aisle, 'Produce');
      assert.equal(addRes.item.qty, 2);

      // Adding the same unchecked item increments quantity cleanly
      const mergeRes = store.addItem('grocery', { name: 'fresh cilantro', qty: 1 });
      assert.equal(mergeRes.merged, true);
      assert.equal(mergeRes.item.qty, 3);

      // Stepper + / -
      const inc = store.adjustItemQty('grocery', addRes.item.id, 2);
      assert.equal(inc.item.qty, 5);
      const dec = store.adjustItemQty('grocery', addRes.item.id, -3);
      assert.equal(dec.item.qty, 2);

      // Toggle check-off
      const toggled = store.toggleItem('grocery', addRes.item.id);
      assert.equal(toggled.item.checked, true);

      // Export CSV for RobOS Household
      const csvOut = store.exportHouseholdCsv('grocery');
      assert.match(csvOut.filename, /^robos-household-grocery-/);
      assert.match(csvOut.csv, /Fresh Cilantro,Produce,2,bunch,1\.29,2\.58,in_cart/);

      // Remove + Undo
      const rem = store.removeItem('grocery', addRes.item.id);
      assert.equal(rem.removed.name, 'Fresh Cilantro');
      assert.ok(!rem.state.lists[0].items.some((i) => i.id === addRes.item.id));

      const undone = store.undo();
      assert.equal(undone.restored, true);
      assert.ok(undone.state.lists[0].items.some((i) => i.id === addRes.item.id));

      // Clear checked + Undo
      const cleared = store.clearChecked('grocery');
      assert.ok(cleared.removedCount >= 1);
      assert.equal(cleared.state.lists[0].stats.checkedCount, 0);
    } finally {
      cleanup();
    }
  });

  it('routes multi-store smart batch input offline across Grocery, Target, and Costco', () => {
    const { store, cleanup } = makeTempStore();
    try {
      const out = store.smartBatchAdd(
        '2 gal oatmilk, dishwasher detergent pods at target, kirkland maple syrup at costco',
        'grocery',
      );
      assert.equal(out.added.length, 3);
      assert.equal(out.added[0].listId, 'grocery');
      assert.equal(out.added[0].item.qty, 2);
      assert.equal(out.added[0].item.unit, 'gal');
      assert.equal(out.added[1].listId, 'target');
      assert.equal(out.added[2].listId, 'costco');
    } finally {
      cleanup();
    }
  });

  it('syncs all 3 lists as native Google Docs in Google Drive and pulls mobile Google Docs edits back', async () => {
    const { store, cleanup } = makeTempStore();
    const mock = createMockDriveFetch();
    const tokens = { get: async () => 'mock-token', refresh: async () => 'mock-token' };
    try {
      const res = await syncWithGoogleDrive({
        store,
        accountId: 'google-test',
        appsScriptWebAppUrl: 'https://script.google.com/macros/s/AKfycb_test/exec',
        mobileLanUrl: 'http://192.168.1.50:19225',
        tokens,
        fetchImpl: mock.fetchImpl,
      });

      assert.equal(res.ok, true);
      assert.ok(res.folderId);
      assert.ok(res.docIds.grocery);
      assert.ok(res.docIds.target);
      assert.ok(res.docIds.costco);

      // Verify 3 native Google Docs + folder + shopping-lists.json + Apps Script files were created
      const allFiles = [...mock.files.values()];
      const gdocs = allFiles.filter((f) => f.mimeType === GDOC_MIME);
      assert.equal(gdocs.length, 3);
      for (const doc of gdocs) {
        assert.match(doc.content, /Open .* Interactive Add\/Remove Form/);
        assert.match(doc.content, /https:\/\/script\.google\.com\/macros\/s\/AKfycb_test\/exec/);
      }
      assert.ok(allFiles.some((f) => f.name === 'shopping-lists.json'));
      assert.ok(allFiles.some((f) => f.name === 'Code.gs'));
      assert.ok(allFiles.some((f) => f.name === 'Index.html'));
      assert.ok(allFiles.some((f) => f.mimeType === FOLDER_MIME && f.name === 'RobOS Household Shopping Lists'));

      // Simulate mobile edit inside Google Docs: check off "Free & Clear Laundry Pods" and type a new item in Target Doc
      const targetDoc = mock.files.get(res.docIds.target);
      targetDoc.exportedText = [
        '🎯 Target Shopping List',
        'Household Essentials (2)',
        '☑ Free & Clear Laundry Pods — 1 pack',
        '☐ Swiffer WetJet Refill Pads — 2 box',
      ].join('\n');

      const pullRes = await syncWithGoogleDrive({
        store,
        accountId: 'google-test',
        pullFromDocs: true,
        tokens,
        fetchImpl: mock.fetchImpl,
      });
      assert.ok(pullRes.pulledChanges >= 1);
      const targetList = pullRes.state.lists.find((l) => l.id === 'target');
      const pods = targetList.items.find((i) => /Laundry Pods/i.test(i.name));
      const swiffer = targetList.items.find((i) => /Swiffer WetJet/i.test(i.name));
      assert.ok(pods?.checked, 'Laundry Pods checked off from mobile Google Doc');
      assert.ok(swiffer && !swiffer.checked && swiffer.qty === 2, 'New item pulled from mobile Google Doc');

      // Share folder with partner
      const shared = await shareShoppingFolder({
        accountId: 'google-test',
        folderId: res.folderId,
        emails: ['family@example.com'],
        tokens,
        fetchImpl: mock.fetchImpl,
      });
      assert.equal(shared[0].ok, true);
      assert.equal(mock.permissions.length, 1);
      assert.equal(mock.permissions[0].emailAddress, 'family@example.com');
    } finally {
      cleanup();
    }
  });

  it('generates valid QR code SVG and Apps Script mobile form bundle', () => {
    const mat = buildMatrix('https://docs.google.com/document/d/1abcDEF_shopping/edit');
    assert.ok(mat.size >= 29);
    const svg = renderQrSvg('http://192.168.1.42:19225/?list=costco');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /<path d="M/);

    const codeGs = generateAppsScriptCodeGs({ folderId: 'fld_123', docIds: { grocery: 'doc_g' } });
    const indexHtml = generateAppsScriptIndexHtml();
    assert.match(codeGs, /fld_123/);
    assert.match(indexHtml, /\+ Add Item to List/);
  });

  it('round-trips Google Docs HTML rendering and plain-text parsing cleanly', () => {
    const { store, cleanup } = makeTempStore();
    try {
      const list = store.getSnapshot().lists[0];
      const html = renderGoogleDocHtml(list, {
        appsScriptWebAppUrl: 'https://script.google.com/macros/s/demo/exec',
      });
      assert.match(html, /Grocery Shopping List/);
      const simulatedPlain = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|h1|h2|tr|div)>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&');
      const parsed = parseGoogleDocText(simulatedPlain, list);
      assert.equal(parsed.length, list.items.length);
    } finally {
      cleanup();
    }
  });
});
