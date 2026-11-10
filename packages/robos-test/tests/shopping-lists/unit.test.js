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
const { executeTextCommand, renderPrintableGuideHtml } = require('../../../shopping-lists/lib/text-commands');
const { processDictationAudio } = require('../../../shopping-lists/lib/dictate-agent');

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

  it('executes natural-language text commands, @store tags, inline prices/notes, and printable guide output', async () => {
    const { store, cleanup } = makeTempStore();
    try {
      const addOut = await executeTextCommand(
        store,
        'add two gal organic milk $4.89 (whole), 3 hass avocados, laundry detergent @target, rotisserie chicken @costco',
      );
      assert.equal(addOut.ok, true);
      assert.equal(addOut.data.added.length, 4);
      assert.equal(addOut.data.added[0].listId, 'grocery');
      assert.equal(addOut.data.added[0].item.qty, 2);
      assert.equal(addOut.data.added[0].item.unit, 'gal');
      assert.equal(addOut.data.added[0].item.estPrice, 4.89);
      assert.equal(addOut.data.added[0].item.note, 'whole');
      assert.equal(addOut.data.added[2].listId, 'target');
      assert.equal(addOut.data.added[3].listId, 'costco');

      const checkOut = await executeTextCommand(store, 'check off avocados');
      assert.equal(checkOut.ok, true);
      assert.equal(checkOut.data.item.checked, true);

      const qtyOut = await executeTextCommand(store, 'qty avocados +2');
      assert.equal(qtyOut.ok, true);
      assert.ok(qtyOut.data.item.qty >= 5);

      const statusOut = await executeTextCommand(store, 'what is on my costco list?');
      assert.equal(statusOut.ok, true);
      assert.match(statusOut.spoken, /Costco list has/);

      const guideOut = await executeTextCommand(store, 'guide');
      assert.equal(guideOut.ok, true);
      assert.match(guideOut.text, /ROBOS SHOPPING LISTS — SKILLS & TEXT COMMANDS PRINTABLE GUIDE/);
      assert.match(renderPrintableGuideHtml(), /Print Guide/);
    } finally {
      cleanup();
    }
  });

  it('wires shopping-lists into RobOS Voice Commands Registry, Live Bubble Intent Resolver, and SkillsExecutor', () => {
    const { defaultRegistry } = require('../../../voice-prompt/lib/voice-commands-registry');
    const { defaultIntentResolver } = require('../../../voice-prompt/lib/skill-intent-resolver');
    const { SkillsExecutor } = require('../../../voice-prompt/lib/skills-executor');

    // 1. VoiceCommandsRegistry matches skill commands & app launch
    const matchAdd = defaultRegistry.matchCommand('Hey RobOS, add 2 gallons of milk to grocery list');
    assert.equal(matchAdd.matched, true);
    assert.equal(matchAdd.command.targetId, 'shopping-lists');

    const matchTarget = defaultRegistry.matchCommand('what is on my target list?');
    assert.equal(matchTarget.matched, true);
    assert.equal(matchTarget.command.targetId, 'shopping-lists');

    const matchOpen = defaultRegistry.matchCommand('open shopping lists');
    assert.equal(matchOpen.matched, true);
    assert.equal(matchOpen.command.targetType, 'app');
    assert.equal(matchOpen.command.targetId, 'shopping-lists');

    // 2. SkillIntentResolver tags live speech bubbles with Household · Shopping Lists
    const bubbleIntent = defaultIntentResolver.resolveLikelySkills('add rotisserie chicken to costco list');
    assert.equal(bubbleIntent.isAmbient, false);
    assert.equal(bubbleIntent.likelySkills.length, 1);
    assert.equal(bubbleIntent.likelySkills[0].id, 'shopping-lists');
    assert.equal(bubbleIntent.likelySkills[0].category, 'Household');

    // 3. SkillsExecutor advertises shopping-lists in getSupportedSkills()
    const executor = new SkillsExecutor();
    assert.ok(executor.getSupportedSkills().some((s) => s.id === 'shopping-lists'));
  });

  it('executes "Ok Nabu" spoken commands end-to-end via executeNabuCommand and WakeWordDetector', async () => {
    const { executeNabuCommand } = require('../../../home-speaker/lib/nabu-command-router');
    const { WakeWordDetector } = require('../../../voice-prompt/lib/wake-word');
    const { SkillsExecutor } = require('../../../voice-prompt/lib/skills-executor');
    const { dir, cleanup } = makeTempStore();

    try {
      const detector = new WakeWordDetector();
      const wakeMatch = detector.processText('Ok Nabu, add 2 gallons of whole milk and honeycrisp apples to my grocery list');
      assert.equal(wakeMatch.matched, true);
      assert.match(wakeMatch.query, /add 2 gallons of whole milk/i);

      const executor = new SkillsExecutor();
      executor.homeDir = dir;
      executor.configDir = dir;

      // 1. Add multiple items via spoken "and" to Grocery list
      const r1 = await executeNabuCommand(
        'Ok Nabu, add 2 gallons of whole milk and honeycrisp apples to my grocery list',
        { configDir: executor.configDir, skillsExecutor: executor, autoLaunchPlayers: false },
      );
      assert.equal(r1.ok, true);
      assert.equal(r1.skill, 'shopping-lists:add');
      assert.equal(r1.data.added.length, 2);
      assert.equal(r1.data.added[0].listId, 'grocery');
      assert.equal(r1.data.added[1].listId, 'grocery');

      // 2. Add item to Target list via "Ok Nabu"
      const r2 = await executeNabuCommand(
        'Ok Nabu, put paper towels on my target list',
        { configDir: executor.configDir, skillsExecutor: executor, autoLaunchPlayers: false },
      );
      assert.equal(r2.ok, true);
      assert.equal(r2.skill, 'shopping-lists:add');
      assert.equal(r2.data.added[0].listId, 'target');

      // 3. Add item to Costco list via "Ok Nabu"
      const r3 = await executeNabuCommand(
        'Ok Nabu, add rotisserie chicken to my costco list',
        { configDir: executor.configDir, skillsExecutor: executor, autoLaunchPlayers: false },
      );
      assert.equal(r3.ok, true);
      assert.equal(r3.skill, 'shopping-lists:add');
      assert.equal(r3.data.added[0].listId, 'costco');

      // 4. Ask "Ok Nabu, what is on my target list?"
      const r4 = await executeNabuCommand(
        'Ok Nabu, what is on my target list?',
        { configDir: executor.configDir, skillsExecutor: executor, autoLaunchPlayers: false },
      );
      assert.equal(r4.ok, true);
      assert.equal(r4.skill, 'shopping-lists:list');
      assert.match(r4.response, /Target list has/i);

      // 5. Tolerates Whisper tiny.en phonetic mishearings ("to the Mike Rotary list" / "to my grodery list")
      const r5 = await executeNabuCommand(
        'Add two gallons of whole milk and blueberries to the Mike Rotary list.',
        { configDir: executor.configDir, skillsExecutor: executor, autoLaunchPlayers: false },
      );
      assert.equal(r5.ok, true);
      assert.equal(r5.skill, 'shopping-lists:add');
      assert.equal(r5.data.added.length, 2);
      assert.equal(r5.data.added[0].listId, 'grocery');
      assert.equal(r5.data.added[1].listId, 'grocery');
    } finally {
      cleanup();
    }
  });

  it('processes audio dictation via Whisper STT and the RobOS Agent /shopping-lists skill', async () => {
    const { store, cleanup } = makeTempStore();
    try {
      // 1. With RobOS AI Agent planning `/shopping-lists` skill commands from transcribed audio
      const dummyAudio = Buffer.from('fake-webm-audio-payload');
      const rAgent = await processDictationAudio({
        store,
        audioBuffer: dummyAudio,
        mimeType: 'audio/webm',
        autoSync: false,
        sttTranscribeFn: async () => 'We are making tacos tonight so grab two pounds of ground beef and salsa for the Mike Rotary list, and put laundry pods on Target.',
        aiAskFn: async (prompt) => {
          assert.match(prompt, /\/shopping-lists/);
          assert.match(prompt, /the grocery list/i); // Phonetic normalization applied before agent prompt
          return JSON.stringify({
            commands: [
              'add 2 lb ground beef, 1 jar salsa @grocery',
              'add 1 pack laundry pods @target',
            ],
            agentNote: 'Added taco ingredients to Grocery and laundry pods to Target.',
          });
        },
      });

      assert.equal(rAgent.ok, true);
      assert.equal(rAgent.usedAgent, true);
      assert.equal(rAgent.skillCommands.length, 2);
      const grocery = rAgent.state.lists.find((l) => l.id === 'grocery');
      const target = rAgent.state.lists.find((l) => l.id === 'target');
      assert.ok(grocery.items.some((i) => /ground beef/i.test(i.name) && i.qty === 2));
      assert.ok(grocery.items.some((i) => /salsa/i.test(i.name)));
      assert.ok(target.items.some((i) => /laundry pods/i.test(i.name)));

      // 2. Offline fallback when no external AI agent is configured
      const rOffline = await processDictationAudio({
        store,
        audioBuffer: dummyAudio,
        mimeType: 'audio/webm',
        autoSync: false,
        sttTranscribeFn: async () => 'I need 3 bags of coffee beans at Costco, and also check off salsa on my grocery list',
        aiAskFn: async () => { throw new Error('offline'); },
      });

      assert.equal(rOffline.ok, true);
      assert.equal(rOffline.usedAgent, false);
      const costco = rOffline.state.lists.find((l) => l.id === 'costco');
      const groceryAfter = rOffline.state.lists.find((l) => l.id === 'grocery');
      assert.ok(costco.items.some((i) => /coffee beans/i.test(i.name) && i.qty === 3));
      assert.ok(groceryAfter.items.find((i) => /salsa/i.test(i.name))?.checked);
    } finally {
      cleanup();
    }
  });
});
