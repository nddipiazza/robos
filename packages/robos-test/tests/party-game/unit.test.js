'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');

const APP_DIR = path.resolve(__dirname, '../../../party-game');
const { createPartyEngine, normalizeSettings, screenRolesFor } = require(path.join(APP_DIR, 'lib', 'game-engine'));
const { createGameServer } = require(path.join(APP_DIR, 'lib', 'game-server'));
const survey = require(path.join(APP_DIR, 'lib', 'survey'));
const roles = require(path.join(APP_DIR, 'lib', 'roles'));
const { defineMiniGame } = require(path.join(APP_DIR, 'lib', 'minigames', 'template'));
const { MINI_GAMES, listMiniGames } = require(path.join(APP_DIR, 'lib', 'minigames'));
const { parseJson } = require(path.join(APP_DIR, 'lib', 'ai-host'));

const NAMES = ['Ana', 'Ben', 'Cleo', 'Dev', 'Eli'];

function answersFor(engine, name) {
  const ans = {};
  for (const q of engine.questions()) {
    if (q.kind === 'choice') ans[q.id] = q.options[name.length % q.options.length].value;
    else if (q.kind === 'scale') ans[q.id] = (name.charCodeAt(0) % 5) + 1;
    else ans[q.id] = `${name} answer to ${q.id}`;
  }
  return ans;
}

// A stand-in for the host's agent CLI that answers each AI host prompt the way
// a real agent would (JSON for the show script and awards, one line otherwise).
function stubAgent(log = []) {
  return async (prompt) => {
    log.push(prompt);
    const keys = [...prompt.matchAll(/^(G\d+) ([^ (;]+)/gm)].map((m) => ({ key: m[1], name: m[2] }));
    if (prompt.includes('head writer')) {
      const qids = [...prompt.matchAll(/\[([a-z-]+)\]/g)].map((m) => m[1]);
      return '```json\n' + JSON.stringify({
        showTitle: 'Night of the Suspicious Snackers',
        opening: `Tonight ${keys[0].name} and ${keys[1].name} learn the truth.`,
        roleReveals: Object.fromEntries(keys.map((k) => [k.key, `${k.name} answered like a mastermind.`])),
        whoSaidThat: keys.slice(0, 4).map((k) => ({ guest: k.key, question: `[${qids.includes('secret-talent') ? 'secret-talent' : qids[0]}]`, readAloud: `I can secretly do ${k.name}-things`, revealQuip: `Classic ${k.name}.` })),
        mostLikelyTo: keys.slice(0, 4).map((k) => ({ superlative: `Most likely to narrate their own life as ${k.name}`, guest: k.key, reason: `${k.name} rated storytelling high.` })),
        bluffs: Object.fromEntries(keys.map((k) => [k.key, `${k.name} once raced a goose.`])),
        gameIntros: Object.fromEntries([...prompt.matchAll(/([a-z-]+) \(/g)].map((m) => [m[1], `Writers intro for ${m[1]}.`])),
      }) + '\n```';
    }
    if (prompt.includes('trivia writer')) {
      const guests = [...prompt.matchAll(/^(G\d+) ([^:]+):/gm)].map((m) => m[1]);
      return JSON.stringify({ trivia: guests.flatMap((g) => [0, 1].map((i) => ({
        guest: g, interest: 'sourdough', question: `${g} question ${i}: what makes bread rise?`,
        choices: ['Yeast', 'Salt', 'Butter', 'Sugar'], answer: 0, funFact: 'Yeast makes carbon dioxide.',
      }))).concat([{ guest: 'G1', question: 'broken', choices: ['a', 'a', 'b', 'c'], answer: 9 }]) });
    }
    if (prompt.includes('challenge designer')) {
      return JSON.stringify({ quests: [
        { title: 'Basement Jam', performers: ['G2', 'G3'], where: 'basement', seconds: 60, challenge: 'Grab the guitar amps and play a 30-second theme song for Biscuit the dog.', judging: 'Best theme song' },
        { title: 'Costume Dash', performers: ['G4'], where: 'garage', seconds: 45, challenge: 'Make a superhero costume from the dress-up box and tape.', judging: 'Did they nail it?' },
        { title: 'Bad quest', performers: ['G99'], challenge: 'nobody' },
      ] });
    }
    if (prompt.includes('quick, funny "house tour"')) return 'Welcome to Ana’s place: guitar amps downstairs, a hot tub out back, and Biscuit in charge.';
    if (prompt.includes('custom award')) {
      return JSON.stringify({ awards: Object.fromEntries(keys.map((k) => [k.key, { title: `The ${k.name} Award`, line: `For ${k.name}, the trophy.` }])) });
    }
    if (prompt.includes('just finished their survey')) return 'Welcome! I read your answers. Bold choices.';
    if (prompt.includes('recapping the standings')) return 'What a round. The leaderboard is shaking.';
    return 'AI line.';
  };
}

const HOUSE = {
  'home-type': 'house',
  spaces: ['backyard', 'basement', 'garage'],
  'spaces-detail': 'Fenced backyard with a fire pit; finished basement with guitar amps and a drum kit; garage with a ping pong table.',
  special: 'Two guitar amps and a bass in the basement, a hot tub, and a dog named Biscuit.',
  crafts: ['paper', 'tape', 'costumes-dress-up-box'],
  tech: ['printer', 'bluetooth-speaker'],
  vibe: 'loud-and-rowdy',
  'off-limits': 'Upstairs bedrooms.',
};

async function joinGuests(engine, count) {
  const guests = [];
  for (const n of NAMES.slice(0, count)) {
    const g = await engine.addGuest({ name: n });
    engine.submitSurvey(g.id, answersFor(engine, n));
    guests.push(g);
  }
  engine.claimPartyHost(guests[0].id);
  engine.submitHouse(guests[0].id, HOUSE);
  await new Promise((r) => setTimeout(r, 10)); // let the AI house tour land in the lobby
  return guests;
}

async function playFullGame(engine, { guestCount = 5 } = {}) {
  engine.selectTvs([{ tvId: 'tv-a', name: 'Living Room' }, { tvId: 'tv-b', name: 'Basement' }]);
  await engine.next(); // lobby
  await joinGuests(engine, guestCount);
  let steps = 0;
  while (engine.state.phase !== 'finale' && steps++ < 300) {
    if (engine.state.phase === 'question') {
      const v = engine.tvView();
      engine.state.guests.forEach((g, i) => {
        if (v.round.excludeGuestIds.includes(g.id)) return;
        engine.submitAnswer(g.id, v.round.options[(i + steps) % v.round.options.length].id);
      });
    }
    await engine.next();
  }
  return steps;
}

describe('RobOS Party Game', () => {
  describe('Package & registrations', () => {
    it('has package.json, desktop entry and 48x48 icon', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8'));
      assert.strictEqual(pkg.name, 'robos-party-game');
      assert.ok(pkg.dependencies.qrcode, 'qrcode dependency for the join code');
      const desktop = fs.readFileSync(path.join(APP_DIR, 'party-game.desktop'), 'utf8');
      assert.match(desktop, /X-RobOS-App=true/);
      assert.match(desktop, /X-RobOS-Category=Party Games/);
      assert.match(desktop, /StartupWMClass=robos-party-game/);
      const icon = fs.readFileSync(path.join(APP_DIR, 'icon.svg'), 'utf8');
      assert.match(icon, /width="48"/);
      assert.match(icon, /height="48"/);
    });

    it('registers the Party Games category and the TV portal tile', () => {
      const lib = require(path.resolve(APP_DIR, '..', 'robos-lib'));
      assert.ok(lib.CATEGORIES['Party Games'], 'robos-lib CATEGORIES has Party Games');
      const tv = require(path.resolve(APP_DIR, '..', 'robos-lib', 'tv-engine'));
      const tile = tv.TEN_FOOT_LAUNCH_TILES.find((t) => t.id === 'party-game');
      assert.strictEqual(tile.category, 'Party Games');
    });
  });

  describe('Survey', () => {
    it('normalizes answers, scores traits and extracts quotable facts', () => {
      const qs = survey.getSurvey();
      const clean = survey.normalizeAnswers(qs, { 'party-arrival': 'dj', competitive: 9, 'secret-talent': '  juggling  ', bogus: 'x' });
      assert.deepStrictEqual(clean, { 'party-arrival': 'dj', 'secret-talent': 'juggling' });
      const traits = survey.scoreTraits(qs, { 'party-arrival': 'dj', competitive: 5 });
      assert.strictEqual(traits.bold, 2);
      assert.strictEqual(traits.competitive, 4);
      const facts = survey.extractFacts(qs, { 'group-chat': 'lurker' });
      assert.strictEqual(facts[0].text, 'In the group chat they are the silent lurker.');
    });

    it('flags interest answers so the AI can write trivia about them', () => {
      const facts = survey.extractFacts(survey.getSurvey(), { hobby: 'Sourdough baking', 'group-chat': 'memes' });
      assert.deepStrictEqual(facts.map((f) => [f.questionId, f.interest]), [['group-chat', false], ['hobby', true]]);
    });

    it('scores House Quest duels and solo challenges', () => {
      const quest = MINI_GAMES.find((m) => m.id === 'house-quest');
      const ctx = { guests: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }] };
      const duel = { duel: true, performers: ['a', 'b'] };
      assert.deepStrictEqual(quest.score(duel, { c: 'a', d: 'a' }, ctx).awards, { a: 3, c: 1, d: 1 });
      assert.deepStrictEqual(quest.score(duel, { c: 'a', d: 'b' }, ctx).awards, { a: 2, b: 2 });
      const solo = { duel: false, performers: ['a'] };
      assert.deepStrictEqual(quest.score(solo, { b: 'yes', c: 'yes', d: 'yes' }, ctx).awards, { a: 4 });
      assert.deepStrictEqual(quest.score(solo, { b: 'yes', c: 'no', d: 'no' }, ctx).awards, {});
    });

    it('builds stock House Quests from the house survey when the AI is unavailable', () => {
      const { fallbackQuests } = require(path.join(APP_DIR, 'lib', 'minigames', 'house-quest'));
      const qs = fallbackQuests(survey.normalizeHouse(HOUSE), [{ id: 'a' }, { id: 'b' }, { id: 'c' }], (a) => a[0], (a) => a);
      assert.ok(qs.length >= 3);
      assert.match(qs[0].challenge, /backyard/);
      assert.match(qs[1].challenge, /paper, tape, costumes/);
    });

    it('scores trivia with expert bonus and out-nerding', () => {
      const trivia = MINI_GAMES.find((m) => m.id === 'interest-trivia');
      const round = { expertId: 'e', correctId: 'c1', funFact: 'x', prompt: { options: [{ id: 'c0', label: 'A. No' }, { id: 'c1', label: 'B. Yes' }] } };
      const ctx = { guests: [{ id: 'e', name: 'Exp' }, { id: 'a', name: 'A' }, { id: 'b', name: 'B' }] };
      assert.deepStrictEqual(trivia.score(round, { e: 'c1', a: 'c1', b: 'c0' }, ctx).awards, { e: 3, a: 2 });
      assert.deepStrictEqual(trivia.score(round, { e: 'c0', a: 'c1', b: 'c1' }, ctx).awards, { a: 3, b: 3 });
    });

    it('supports host-written custom questions', () => {
      const qs = survey.getSurvey(['core'], [{ id: 'pet', prompt: 'Name of your first pet?' }]);
      assert.ok(qs.some((q) => q.id === 'pet' && q.kind === 'text'));
    });
  });

  describe('Roles', () => {
    it('gives every guest a role, at most one Mole, and only with 4+ guests', () => {
      const guests = NAMES.map((n, i) => ({ id: `g${i}`, traits: { sneaky: i, clever: 5 - i } }));
      const a = roles.assignRoles(guests, { seed: 7 });
      assert.strictEqual(Object.keys(a).length, 5);
      assert.ok(Object.values(a).filter((r) => r === 'mole').length <= 1);
      const small = roles.assignRoles(guests.slice(0, 3), { seed: 7 });
      assert.ok(!Object.values(small).includes('mole'));
    });

    it('hides the Mole on public screens', () => {
      const pub = roles.publicRole(roles.roleById('mole'));
      assert.strictEqual(pub.title, 'The Party Guest');
    });
  });

  describe('Mini game template', () => {
    it('validates definitions and ships three mini games', () => {
      assert.throws(() => defineMiniGame({ id: 'Bad Id', title: 'x', buildRounds() {}, score() {} }), /kebab-case/);
      assert.throws(() => defineMiniGame({ id: 'x' }), /missing "title"/);
      assert.deepStrictEqual(MINI_GAMES.map((m) => m.id), ['who-said-that', 'most-likely-to', 'house-quest', 'interest-trivia', 'truth-or-bot']);
      assert.strictEqual(listMiniGames().length, 5);
    });
  });

  describe('Engine requirements', () => {
    it('needs a TV and an AI agent before the lobby opens', async () => {
      const noTv = createPartyEngine({ seed: 1, settings: { agent: { provider: 'stub' } }, ai: stubAgent() });
      await assert.rejects(noTv.openLobby(), /at least one RobOS TV/);
      const noAgent = createPartyEngine({ seed: 1, ai: stubAgent() });
      noAgent.selectTvs([{ tvId: 'tv-a' }]);
      await assert.rejects(noAgent.openLobby(), /AI agent/);
      const brokenAgent = createPartyEngine({
        seed: 1,
        settings: { agent: { provider: 'codex' } },
        checkAgent: () => ({ ok: false, reason: 'Codex is not signed in' }),
      });
      brokenAgent.selectTvs([{ tvId: 'tv-a' }]);
      await assert.rejects(brokenAgent.openLobby(), /not signed in/);
    });

    it('assigns screen roles to multiple TVs', () => {
      assert.deepStrictEqual(screenRolesFor(4), ['stage', 'scoreboard', 'spotlight', 'stage']);
      assert.strictEqual(normalizeSettings({ roundsPerGame: 99 }).roundsPerGame, 8);
    });

    it('will not start until enough guests finished the survey', async () => {
      const e = createPartyEngine({ seed: 2, settings: { agent: { provider: 'stub' } }, ai: stubAgent() });
      e.selectTvs([{ tvId: 'tv-a' }]);
      await e.openLobby();
      const g = await e.addGuest({ name: 'Ana' });
      for (const n of ['Ben', 'Cleo']) {
        const x = await e.addGuest({ name: n });
        e.submitSurvey(x.id, answersFor(e, n));
      }
      e.submitSurvey(g.id, answersFor(e, 'Ana'));
      assert.match(e.canStart().reasons.join(), /party host/);
      assert.strictEqual(e.playerView(g.id).canClaimPartyHost, true);
      e.claimPartyHost(g.id);
      const ben = e.state.guests[1];
      assert.throws(() => e.claimPartyHost(ben.id), /Ana is already the party host/);
      assert.strictEqual(e.playerView(ben.id).canClaimPartyHost, false);
      assert.throws(() => e.submitHouse(ben.id, HOUSE), /Only the party host/);
      assert.match(e.canStart().reasons.join(), /Ana still needs to describe the house/);
      const progress = e.submitHouse(g.id, { 'home-type': 'house', spaces: ['basement', 'nope'] });
      assert.deepStrictEqual(progress.missing, ['spaces-detail', 'special', 'vibe']);
      e.submitHouse(g.id, HOUSE);
      assert.strictEqual(e.canStart().ok, true);
      assert.deepStrictEqual(e.playerView(g.id).house.spaces, ['backyard', 'basement', 'garage']);
      assert.strictEqual(e.playerView(ben.id).house, null, 'only the party host sees the house answers');
    });

    it('will not start with too few finished surveys', async () => {
      const e = createPartyEngine({ seed: 2, settings: { agent: { provider: 'stub' } }, ai: stubAgent() });
      e.selectTvs([{ tvId: 'tv-a' }]);
      await e.openLobby();
      const g = await e.addGuest({ name: 'Ana' });
      await assert.rejects(e.addGuest({ name: 'ana' }), /already joined/);
      assert.strictEqual(e.canStart().ok, false);
      e.submitSurvey(g.id, answersFor(e, 'Ana'));
      await assert.rejects(e.startGame(), /Need 3 guests/);
    });
  });

  describe('AI-hosted full game', () => {
    it('plays lobby → roles → five mini games → finale with the AI writers room', async () => {
      const prompts = [];
      const e = createPartyEngine({ seed: 42, settings: { agent: { provider: 'stub' } }, ai: stubAgent(prompts) });
      const spoken = [];
      e.events.on('narration', (n) => spoken.push(n.text));
      await playFullGame(e);
      await new Promise((r) => setImmediate(r));
      assert.strictEqual(e.state.phase, 'finale');

      // Writers' room: one show script, tailored content used in every mini game.
      assert.strictEqual(e.state.ai.status, 'ready');
      assert.strictEqual(e.state.ai.script.showTitle, 'Night of the Suspicious Snackers');
      const games = e.state.history.map((h) => h.game);
      assert.deepStrictEqual([...new Set(games)], ['who-said-that', 'most-likely-to', 'house-quest', 'interest-trivia', 'truth-or-bot']);
      // House Quest: AI challenges built from the party host's house; invalid quests dropped.
      assert.strictEqual(e.state.ai.script.houseQuests.length, 2);
      const quests = e.state.history.filter((h) => h.game === 'house-quest');
      assert.ok(/guitar amps/.test(quests[0].prompt));
      assert.ok(prompts.some((p) => p.includes("THE PARTY IS AT ANA'S PLACE") && p.includes('head writer')), 'show script knows the house');
      assert.ok(spoken.some((t) => /Biscuit in charge/.test(t)), 'house tour is narrated');
      // Trivia: AI questions about guest interests; malformed items are dropped.
      assert.strictEqual(e.state.ai.script.trivia.length, 10);
      const trivia = e.state.history.filter((h) => h.game === 'interest-trivia');
      assert.strictEqual(trivia.length, 3);
      assert.ok(trivia.every((h) => /what makes bread rise/.test(h.prompt) && /Yeast/.test(h.correct)));
      assert.ok(spoken.some((t) => /our resident sourdough expert/.test(t)), 'trivia names the resident expert');
      assert.ok(e.state.history.some((h) => /secretly do/.test(h.prompt)), 'Who Said That reads AI teasers');
      assert.ok(e.state.history.some((h) => /narrate their own life/.test(h.prompt)), 'Most Likely To uses AI superlatives');
      assert.ok(prompts.filter((p) => p.includes('head writer')).length === 1, 'one batched script call');
      assert.ok(prompts.some((p) => p.includes('just finished their survey')), 'guest intros written in the lobby');
      assert.ok(e.state.ai.recaps >= 2, 'AI recaps after mini games');
      assert.ok(spoken.includes('Writers intro for most-likely-to.'), 'mini game intros come from the script');
      assert.ok(spoken.some((t) => t.includes('Welcome to Night of the Suspicious Snackers! Tonight Ana')), 'opening line comes from the script');
      assert.ok(spoken.some((t) => / answered like a mastermind\./.test(t)), 'role reveals come from the script');
      assert.ok(spoken.includes('What a round. The leaderboard is shaking.'), 'recap is spoken');

      // Finale: winners, awards for every guest, scores add up.
      assert.ok(e.state.winnerIds.length >= 1);
      assert.strictEqual(Object.keys(e.state.ai.awards).length, 5);
      const view = e.tvView('stage');
      assert.ok(view.ai.awards, 'TV finale shows the awards');
      assert.ok(e.state.narration.text.length > 0);
      const host = e.hostView();
      assert.strictEqual(host.aiDetail.script.bluffs, 5);
      const mole = e.state.guests.find((g) => g.roleId === 'mole');
      if (mole) assert.strictEqual(view.guests.find((g) => g.id === mole.id).role.title, 'The Mole', 'finale unmasks the Mole');
    });

    it('falls back to stock material when the agent fails', async () => {
      const e = createPartyEngine({ seed: 9, settings: { agent: { provider: 'stub' }, aiWaitSeconds: 5 }, ai: async () => { throw new Error('offline'); } });
      await playFullGame(e, { guestCount: 4 });
      assert.strictEqual(e.state.phase, 'finale');
      assert.strictEqual(e.state.ai.status, 'failed');
      assert.ok(e.state.history.length >= 6, 'every mini game still played');
    });

    it('applies role perks: detective hint, double down and secret views', async () => {
      const e = createPartyEngine({ seed: 42, settings: { agent: { provider: 'stub' } }, ai: stubAgent() });
      e.selectTvs([{ tvId: 'tv-a' }]);
      await e.next();
      await joinGuests(e, 5);
      await e.next(); // roles
      while (e.state.phase !== 'question') await e.next();
      const detective = e.state.guests.find((g) => roles.hasPerk(g.roleId, 'hint') && !e.tvView().round.excludeGuestIds.includes(g.id));
      if (detective) {
        const pv = e.playerView(detective.id);
        assert.ok(pv.me.hint, 'detective sees a crossed-out option');
        assert.notStrictEqual(pv.me.hint, e.state.lastResult?.correct);
      }
      const doubler = e.state.guests.find((g) => roles.hasPerk(g.roleId, 'doubleDown'));
      if (doubler && !e.tvView().round.excludeGuestIds.includes(doubler.id)) {
        assert.ok(e.playerView(doubler.id).me.canDoubleDown);
        e.useDoubleDown(doubler.id);
        assert.throws(() => e.useDoubleDown(doubler.id), /Already used/);
      }
      // The TV never shows the Mole's real role; the Mole's phone does.
      const mole = e.state.guests.find((g) => g.roleId === 'mole');
      if (mole) {
        assert.strictEqual(e.tvView().guests.find((g) => g.id === mole.id).role.title, 'The Party Guest');
        assert.strictEqual(e.playerView(mole.id).me.role.id, 'mole');
      }
    });
  });

  describe('Narration outputs', () => {
    it('migrates the old narration setting and keeps only known outputs', () => {
      assert.deepStrictEqual(normalizeSettings({ narrationAudio: 'host' }).narrationOutputs, ['host']);
      assert.deepStrictEqual(normalizeSettings({ narrationAudio: 'off' }).narrationOutputs, []);
      assert.deepStrictEqual(normalizeSettings({ narrationOutputs: ['tvs', 'speaker', 'moon', 'tvs'] }).narrationOutputs, ['tvs', 'speaker']);
      assert.strictEqual('narrationAudio' in normalizeSettings({ narrationAudio: 'tv' }), false);
    });

    it('sends each spoken line to main-stage Roku TVs and the chosen speaker', async () => {
      const os = require('node:os');
      const { createNarrationRouter } = require(path.join(APP_DIR, 'lib', 'narration-outputs'));
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'party-narration-'));
      // A tiny valid WAV (0.1 s of silence) stands in for RobOS Voice.
      const pcm = Buffer.alloc(4410 * 2);
      const header = Buffer.alloc(44);
      header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
      header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
      header.writeUInt32LE(44100, 24); header.writeUInt32LE(88200, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
      header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
      const wav = path.join(dir, 'line.wav');
      fs.writeFileSync(wav, Buffer.concat([header, pcm]));

      const e = createPartyEngine({ seed: 3, settings: { agent: { provider: 'stub' }, narrationOutputs: ['tvs', 'speaker'], speakerId: '192.168.1.6' }, ai: stubAgent() });
      e.selectTvs([
        { tvId: 'roku', platformId: 'roku-os', screen: 'stage' },
        { tvId: 'oled', platformId: 'lg-webos', screen: 'stage' },
        { tvId: 'roku2', platformId: 'roku-os', screen: 'scoreboard' },
      ]);
      const patches = [];
      const casts = [];
      class FakeCast {
        constructor() { this.streamPort = 1234; }
        registerFile(f) { return `http://host/media/${path.basename(f)}`; }
        async castMediaUrl(ip, url) { casts.push({ ip, url }); return { ok: true }; }
      }
      const router = createNarrationRouter({
        engine: e,
        getTts: () => ({ synthesize: async () => ({ ok: true, engine: 'kokoro', filePath: wav }) }),
        tvEngine: { updateAppCast: (p) => patches.push(p) },
        castModule: { CastService: FakeCast },
        configDir: dir,
        getLanIp: () => '10.0.0.5',
        getGamePort: () => 19213,
      });
      router.handle({ id: 'n1', text: 'Welcome to the party!' });
      const file = await router.clip('n1');
      assert.ok(file && fs.existsSync(file), 'line rendered to a playable file');
      for (let i = 0; i < 100 && (!casts.length || !patches.length); i++) await new Promise((r) => setTimeout(r, 20));
      assert.deepStrictEqual(patches.map((p) => p.tvId), ['roku'], 'only main-stage Roku TVs get the line');
      assert.deepStrictEqual(patches[0].patch.narration, { id: 'n1', url: 'http://10.0.0.5:19213/api/narration/n1.mp4' });
      const mp4 = await router.clip('n1', 'mp4');
      assert.ok(mp4 && mp4.endsWith('.mp4') && fs.statSync(mp4).size > 0, 'Roku gets a keep-alive-style MP4');
      assert.deepStrictEqual(casts.map((c) => c.ip), ['192.168.1.6']);
    });

    it('plays speaker lines through the running Audio Player so its song resumes, else casts directly', async () => {
      const os = require('node:os');
      const { createNarrationRouter } = require(path.join(APP_DIR, 'lib', 'narration-outputs'));
      const casts = [];
      class FakeCast {
        constructor() { this.streamPort = 1234; }
        registerFile(f) { return `http://host/media/${path.basename(f)}`; }
        async castMediaUrl(ip, url) { casts.push({ ip, url }); return { ok: true }; }
      }
      const asked = [];
      let answer = null;
      const router = createNarrationRouter({
        engine: createPartyEngine({ seed: 1, settings: { agent: { provider: 'stub' } }, ai: stubAgent() }),
        getTts: () => null,
        castModule: { CastService: FakeCast },
        audioPlayer: { speakClip: async (clip) => { asked.push(clip); return answer; } },
        configDir: os.tmpdir(),
        getLanIp: () => '10.0.0.5',
        getGamePort: () => 19213,
      });
      answer = { ok: true, handled: true };
      assert.strictEqual(await router.playOnSpeaker('192.168.1.10', '/tmp/line.mp3', 1800), 'audio-player');
      assert.deepStrictEqual(asked[0], { speakerIp: '192.168.1.10', filePath: '/tmp/line.mp3', title: 'RobOS Party Game', artist: 'Your AI host', durationMs: 1800, holdMs: 2500 });
      assert.strictEqual(casts.length, 0, 'the Audio Player had the speaker: no direct cast');
      answer = { ok: true, handled: false, reason: 'other-speaker' };
      assert.strictEqual(await router.playOnSpeaker('192.168.1.6', '/tmp/line.mp3'), 'cast');
      answer = null; // Audio Player not running
      assert.strictEqual(await router.playOnSpeaker('192.168.1.6', '/tmp/line.mp3'), 'cast');
      assert.deepStrictEqual(casts.map((c) => c.ip), ['192.168.1.6', '192.168.1.6']);
    });

    it('reaches a real Audio Player control server through the shared client', async () => {
      const os = require('node:os');
      const { createNarrationRouter } = require(path.join(APP_DIR, 'lib', 'narration-outputs'));
      const control = require(path.join(APP_DIR, '..', 'audio-player', 'lib', 'control-server'));
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'party-ap-'));
      const line = path.join(dir, 'line.mp3');
      fs.writeFileSync(line, 'x');
      const clips = [];
      const server = control.createControlServer({
        configDir: dir,
        probe: async () => null,
        handlers: { status: () => ({ ok: true }), speakClip: (c) => { clips.push(c); return { ok: true, handled: true }; }, pause: () => ({}), resume: () => ({}) },
      });
      await server.start();
      try {
        const router = createNarrationRouter({
          engine: createPartyEngine({ seed: 1, settings: { agent: { provider: 'stub' } }, ai: stubAgent() }),
          getTts: () => null,
          castModule: { CastService: class { async castMediaUrl() { throw new Error('should not cast directly'); } } },
          audioPlayer: control.createAudioPlayerClient({ configDir: dir }),
          configDir: dir,
          getLanIp: () => '10.0.0.5',
          getGamePort: () => 19213,
        });
        assert.strictEqual(await router.playOnSpeaker('192.168.1.10', line, 1200), 'audio-player');
        assert.deepStrictEqual([clips[0].speakerIp, clips[0].filePath, clips[0].durationMs, clips[0].holdMs], ['192.168.1.10', line, 1200, 2500]);
      } finally {
        server.stop();
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('AI JSON parsing', () => {
    it('reads fenced JSON from agent output', () => {
      assert.deepStrictEqual(parseJson('Sure!\n```json\n{"a":1}\n```'), { a: 1 });
      assert.strictEqual(parseJson('no json here'), null);
    });
  });

  describe('LAN game server', () => {
    function request(port, method, p, body) {
      return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : null;
        const req = http.request({ host: '127.0.0.1', port, method, path: p, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (res) => {
          let buf = '';
          res.on('data', (c) => { buf += c; });
          res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: buf }));
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
      });
    }

    it('serves TV and phone pages and runs join → survey → answer over HTTP', async () => {
      const e = createPartyEngine({ seed: 5, settings: { agent: { provider: 'stub' }, minGuests: 2 }, ai: stubAgent() });
      const server = createGameServer({ engine: e, port: 0, host: '127.0.0.1' });
      const port = await server.start();
      try {
        e.setJoinUrl(`http://127.0.0.1:${port}/join`);
        e.selectTvs([{ tvId: 'tv-a' }]);
        await e.openLobby();
        assert.match((await request(port, 'GET', '/tv?screen=stage')).body, /face\.js/);
        assert.match((await request(port, 'GET', '/join')).body, /phone\.js/);
        assert.match((await request(port, 'GET', '/qr.svg')).type, /svg/);

        const players = [];
        for (const name of ['Ana', 'Ben']) {
          const j = JSON.parse((await request(port, 'POST', '/api/join', { name })).body);
          assert.ok(j.token);
          const r = await request(port, 'POST', '/api/survey', { guestId: j.guestId, token: j.token, answers: answersFor(e, name) });
          assert.strictEqual(JSON.parse(r.body).progress.complete, true);
          players.push(j);
        }
        const [ana, ben] = players;
        assert.strictEqual((await request(port, 'POST', '/api/claim-host', { guestId: ana.guestId, token: ana.token })).status, 200);
        assert.match((await request(port, 'POST', '/api/claim-host', { guestId: ben.guestId, token: ben.token })).body, /already the party host/);
        const house = JSON.parse((await request(port, 'POST', '/api/house', { guestId: ana.guestId, token: ana.token, answers: HOUSE })).body);
        assert.strictEqual(house.progress.complete, true);
        assert.strictEqual((await request(port, 'POST', '/api/survey', { guestId: players[0].guestId, token: 'wrong', answers: {} })).status, 401);
        const tv = JSON.parse((await request(port, 'GET', '/api/view?role=tv&screen=stage')).body);
        assert.strictEqual(tv.guests.length, 2);
        assert.ok(!JSON.stringify(tv).includes(players[0].token), 'TV view never leaks guest tokens');

        await e.startGame();
        while (e.state.phase !== 'question') await e.next();
        const pv = JSON.parse((await request(port, 'GET', `/api/view?role=player&guest=${players[0].guestId}&token=${players[0].token}`)).body);
        if (!pv.me.sittingOut) {
          const r = await request(port, 'POST', '/api/answer', { guestId: players[0].guestId, token: players[0].token, optionId: pv.round.options[0].id });
          assert.strictEqual(r.status, 200);
        }
      } finally {
        await server.stop();
      }
    });
  });
});
