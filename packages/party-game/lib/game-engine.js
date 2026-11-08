'use strict';

// RobOS Party Game engine: one party, from lobby to finale.
//
// Phases:
//   setup → lobby → roles → game-intro → question ⇄ reveal → scores → … → finale
//
// The engine is host-driven: next() moves to the next phase, and tick() moves
// on automatically when a timer runs out (if autoAdvance is on). Everything a
// screen needs comes from tvView(), playerView() and hostView(); the server
// pushes a fresh view whenever the engine emits 'change'.

const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const survey = require('./survey');
const roles = require('./roles');
const { getMiniGame, listMiniGames } = require('./minigames');
const { majorityOptions } = require('./minigames/template');
const { createNarrator, estimateSpeechMs, PERSONALITIES } = require('./narrator');
const { createAiHost } = require('./ai-host');

const DEFAULT_SETTINGS = Object.freeze({
  title: 'RobOS Party Game',
  personality: 'gameshow',
  hostFace: 'mask', // mask | robot: the AI host's look on the TVs
  agent: null, // { provider, model, effort } from <robos-agent-selector>; required to play
  surveyPacks: [...survey.DEFAULT_PACKS],
  customQuestions: [],
  miniGames: ['real-or-ai', 'expertise-trivia', 'country-leaders'],
  roundsPerGame: 3,
  answerSeconds: 0, // 0 = each mini game's default
  autoAdvance: true,
  revealSeconds: 9,
  enabledRoles: null, // null = every role
  secretRoles: true,
  minGuests: 3,
  // Where the AI host's voice plays: any of host (this computer), tvs (the
  // main-stage TVs, Roku included) and speaker (an Audio Player device).
  narrationOutputs: ['tvs'],
  speakerId: null, // Audio Player device for the 'speaker' output
  aiWaitSeconds: 60, // how long a mini game waits for the AI writers before using stock material
});

const SCREEN_ROLES = ['stage', 'scoreboard', 'spotlight'];
const AVATARS = ['🦄', '🐙', '🦖', '🐸', '🦉', '🐼', '🦊', '🐝', '🐳', '🦩', '🐲', '🦔', '🐧', '🦁', '🐨', '🐢'];
const COLORS = ['#00bcd4', '#ec4899', '#22c55e', '#f97316', '#7c3aed', '#eab308', '#3b82f6', '#ef4444', '#14b8a6'];

function screenRolesFor(count) {
  // 1 TV: stage only (it shows a scoreboard strip). 2: stage + scoreboard.
  // 3+: stage, scoreboard, spotlight; extra TVs mirror the stage.
  return Array.from({ length: count }, (_, i) => SCREEN_ROLES[i] || 'stage');
}

function normalizeSettings(input = {}, base = DEFAULT_SETTINGS) {
  const s = { ...base, ...input };
  s.roundsPerGame = Math.min(8, Math.max(1, Math.round(Number(s.roundsPerGame) || base.roundsPerGame)));
  s.answerSeconds = Math.min(120, Math.max(0, Math.round(Number(s.answerSeconds) || 0)));
  s.revealSeconds = Math.min(60, Math.max(3, Math.round(Number(s.revealSeconds) || base.revealSeconds)));
  s.minGuests = Math.min(12, Math.max(2, Math.round(Number(s.minGuests) || base.minGuests)));
  s.aiWaitSeconds = Math.min(180, Math.max(5, Math.round(Number(s.aiWaitSeconds) || base.aiWaitSeconds || 60)));
  if (!PERSONALITIES[s.personality]) s.personality = 'gameshow';
  if (!['mask', 'robot'].includes(s.hostFace)) s.hostFace = 'mask';
  if (!Array.isArray(input.narrationOutputs) && input.narrationAudio) {
    // Settings saved before narration outputs existed.
    s.narrationOutputs = { host: ['host'], tv: ['tvs'], off: [] }[input.narrationAudio] || ['tvs'];
  }
  delete s.narrationAudio;
  s.narrationOutputs = [...new Set((Array.isArray(s.narrationOutputs) ? s.narrationOutputs : []).filter((o) => ['host', 'tvs', 'speaker'].includes(o)))];
  s.speakerId = s.speakerId ? String(s.speakerId) : null;
  s.miniGames = (Array.isArray(s.miniGames) ? s.miniGames : []).filter((id) => getMiniGame(id));
  if (s.miniGames.length === 0) s.miniGames = [...DEFAULT_SETTINGS.miniGames];
  s.surveyPacks = (Array.isArray(s.surveyPacks) ? s.surveyPacks : []).filter((id) => survey.SURVEY_PACKS[id]);
  if (s.surveyPacks.length === 0 && !(s.customQuestions || []).length) s.surveyPacks = ['core'];
  delete s.aiImprovise;
  s.agent = s.agent && typeof s.agent === 'object' && s.agent.provider
    ? { provider: String(s.agent.provider), model: String(s.agent.model || ''), effort: String(s.agent.effort || '') }
    : null;
  s.autoAdvance = Boolean(s.autoAdvance);
  s.secretRoles = Boolean(s.secretRoles);
  return s;
}

// ai(prompt) → text|null runs the host's chosen agent. checkAgent(agent) →
// { ok, reason } says whether that agent can be used right now. The AI host is
// required: the lobby will not open without a working agent.
function createPartyEngine({
  settings = {},
  seed = Date.now(),
  ai = null,
  checkAgent = (agent) => ({ ok: Boolean(agent && agent.provider), reason: 'Pick an AI agent to host the party' }),
  now = () => Date.now(),
  joinUrl = '',
} = {}) {
  const events = new EventEmitter();
  const rand = roles.mulberry32(seed);
  const shuffle = (arr) => {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  // A failed or slow agent call returns null and the stock line/content is used,
  // so one bad reply never stalls the party.
  const aiText = async (prompt) => {
    if (!ai || !state.settings.agent) return null;
    try {
      const r = await ai(prompt);
      return typeof r === 'string' ? r : r?.ok ? r.text : null;
    } catch {
      return null;
    }
  };
  const narrator = createNarrator({ ask: aiText });
  const aiHost = createAiHost({
    ask: aiText,
    log: (entry) => events.emit('log', entry),
    personalityStyle: () => (PERSONALITIES[state.settings.personality] || PERSONALITIES.gameshow).style,
  });

  const state = {
    id: `party-${seed.toString(36)}`,
    seed,
    createdAt: new Date(now()).toISOString(),
    settings: normalizeSettings(settings),
    joinUrl,
    tvs: [],
    guests: [],
    phase: 'setup',
    roleRevealIndex: -1,
    gameIndex: -1,
    roundIndex: -1,
    rounds: [],
    answers: {},
    doubleDowns: {},
    hints: {},
    phaseEndsAt: null,
    lastResult: null,
    narration: null,
    history: [],
    moleWrongVotes: 0,
    moleResult: null,
    winnerIds: [],
    error: null,
    ai: freshAi(),
    partyHostId: null, // the guest whose place this is; they describe the house
    house: {}, // house survey answers (survey.HOUSE_SURVEY)
  };
  let busy = false;

  // What the AI writers have produced so far. Promises live outside `state`
  // so views stay serializable.
  function freshAi() {
    return { status: 'idle', scriptKey: null, script: null, intros: {}, awards: null, recaps: 0, calls: 0 };
  }
  let scriptJob = null; // { key, promise }
  let scriptTimer = null;
  let awardsJob = null;

  const questions = () => survey.getSurvey(state.settings.surveyPacks, state.settings.customQuestions);
  const guest = (id) => state.guests.find((g) => g.id === id) || null;
  const currentGame = () => (state.gameIndex >= 0 ? getMiniGame(state.settings.miniGames[state.gameIndex]) : null);
  const currentRound = () => state.rounds[state.roundIndex] || null;

  function emit() {
    events.emit('change', state);
  }

  async function narrate(kind, vars = {}, text = null) {
    state.narration = await narrator.say(kind, vars, {
      personality: state.settings.personality,
      improviseLine: false, // AI lines are prepared ahead of time; never block a click on the agent
      text,
    });
    state.narration.durationMs = estimateSpeechMs(state.narration.text);
    events.emit('narration', state.narration);
    return state.narration;
  }

  function setTimer(seconds, minMs = 0) {
    const speech = state.narration ? estimateSpeechMs(state.narration.text) + 800 : 0;
    state.phaseEndsAt = now() + Math.max(seconds * 1000, minMs, speech);
  }

  // ── Setup ────────────────────────────────────────────────────────────────

  function updateSettings(patch = {}) {
    if (!['setup', 'lobby'].includes(state.phase)) throw new Error('Settings are locked once the game starts');
    state.settings = normalizeSettings(patch, state.settings);
    for (const g of state.guests) refreshGuestSurvey(g);
    emit();
    return state.settings;
  }

  function selectTvs(tvs = []) {
    const list = (Array.isArray(tvs) ? tvs : []).filter((t) => t && t.tvId);
    const rolesFor = screenRolesFor(list.length);
    state.tvs = list.map((t, i) => ({
      tvId: String(t.tvId),
      name: t.name || t.tvId,
      platformId: t.platformId || 'browser',
      screen: SCREEN_ROLES.includes(t.screen) ? t.screen : rolesFor[i],
    }));
    emit();
    return state.tvs;
  }

  async function agentStatus() {
    try {
      const r = await checkAgent(state.settings.agent);
      return r && r.ok ? { ok: true } : { ok: false, reason: (r && r.reason) || 'Pick an AI agent to host the party' };
    } catch (err) {
      return { ok: false, reason: err.message };
    }
  }

  async function openLobby() {
    if (state.phase !== 'setup') throw new Error('Lobby is already open');
    if (state.tvs.length === 0) throw new Error('Pick at least one RobOS TV before starting');
    const agent = await agentStatus();
    if (!agent.ok) throw new Error(agent.reason);
    state.phase = 'lobby';
    state.phaseEndsAt = null;
    const welcome = await narrate('welcome');
    emit();
    // The AI host's own welcome follows as soon as the agent answers.
    state.ai.calls += 1;
    narrator.improvise(welcome.text, state.settings.personality).then(async (line) => {
      if (line && state.phase === 'lobby' && state.narration?.id === welcome.id) {
        await narrate('welcome', {}, line);
        emit();
      }
    });
  }

  // ── Guests & survey ──────────────────────────────────────────────────────

  function refreshGuestSurvey(g) {
    const qs = questions();
    g.answers = survey.normalizeAnswers(qs, g.answers);
    g.traits = survey.scoreTraits(qs, g.answers);
    const surveyFacts = survey.extractFacts(qs, g.answers);
    const customFacts = (g.customFacts || [])
      .filter((f) => f && (f.answer || f.text))
      .map((f, i) => ({
        questionId: String(f.id || `profile-fact-${i + 1}`),
        kind: 'text',
        interest: Boolean(f.interest),
        prompt: String(f.prompt || 'About them'),
        answer: String(f.answer || f.text),
        text: String(f.text || f.answer),
      }));
    g.facts = [...surveyFacts, ...customFacts];
    g.surveyComplete = survey.surveyProgress(qs, g.answers).complete;
  }

  async function addGuest({
    name,
    userId = null,
    avatar = null,
    color = null,
    photoUrl = null,
    gamerTag = null,
    archetype = null,
    preferredRole = null,
    surveyAnswers = null,
    customFacts = null,
    customTrivia = null,
    customSuperlatives = null,
    customBluffs = null,
    customQuests = null,
    houseDefaults = null,
    profileSummary = null,
  } = {}) {
    if (!['setup', 'lobby'].includes(state.phase)) throw new Error('The game already started');
    const clean = String(name || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    if (!clean) throw new Error('Name is required');
    if (state.guests.some((g) => g.name.toLowerCase() === clean.toLowerCase())) {
      throw new Error(`Someone named ${clean} already joined`);
    }
    if (state.guests.length >= 16) throw new Error('The party is full (16 guests)');
    const i = state.guests.length;
    const g = {
      id: `g_${crypto.randomBytes(4).toString('hex')}`,
      token: crypto.randomBytes(12).toString('hex'),
      userId: userId ? String(userId) : null,
      name: clean,
      gamerTag: gamerTag ? String(gamerTag) : null,
      archetype: archetype ? String(archetype) : null,
      avatar: avatar || AVATARS[i % AVATARS.length],
      color: color || COLORS[i % COLORS.length],
      photoUrl: photoUrl || null,
      preferredRole: preferredRole || null,
      answers: surveyAnswers && typeof surveyAnswers === 'object' ? { ...surveyAnswers } : {},
      customFacts: Array.isArray(customFacts) ? [...customFacts] : [],
      customTrivia: Array.isArray(customTrivia) ? [...customTrivia] : [],
      customSuperlatives: Array.isArray(customSuperlatives) ? [...customSuperlatives] : [],
      customBluffs: Array.isArray(customBluffs) ? [...customBluffs] : [],
      customQuests: Array.isArray(customQuests) ? [...customQuests] : [],
      houseDefaults: houseDefaults && typeof houseDefaults === 'object' ? { ...houseDefaults } : {},
      profileSummary: profileSummary ? String(profileSummary) : null,
      traits: {},
      facts: [],
      surveyComplete: false,
      roleId: null,
      score: 0,
      joinedAt: new Date(now()).toISOString(),
    };
    refreshGuestSurvey(g);
    state.guests.push(g);
    if (state.phase === 'lobby') {
      await narrate('guestJoined', { name: g.name });
      if (g.surveyComplete) introduceGuest(g);
      scheduleScript();
    }
    emit();
    return g;
  }

  async function onboardUser(profile, { setAsPartyHost = false, applyHouse = false } = {}) {
    if (!profile || !profile.name) throw new Error('Valid user profile is required');
    let g = state.guests.find((x) => (profile.uid && x.userId === profile.uid) || x.name.toLowerCase() === String(profile.name).toLowerCase());
    const photoUrl = profile.uid && (profile.photo || profile.photoDataUrl) ? `/api/user-photo/${encodeURIComponent(profile.uid)}` : null;
    if (g) {
      g.userId = profile.uid || g.userId;
      g.avatar = profile.avatar || g.avatar;
      g.color = profile.color || g.color;
      g.photoUrl = photoUrl || g.photoUrl;
      g.gamerTag = profile.gamerTag || g.gamerTag;
      g.archetype = profile.archetype || g.archetype;
      g.preferredRole = profile.preferredRole || g.preferredRole;
      g.customFacts = Array.isArray(profile.customFacts) ? [...profile.customFacts] : g.customFacts;
      g.customTrivia = Array.isArray(profile.customTrivia) ? [...profile.customTrivia] : g.customTrivia;
      g.customSuperlatives = Array.isArray(profile.customSuperlatives) ? [...profile.customSuperlatives] : g.customSuperlatives;
      g.customBluffs = Array.isArray(profile.customBluffs) ? [...profile.customBluffs] : g.customBluffs;
      g.customQuests = Array.isArray(profile.customQuests) ? [...profile.customQuests] : g.customQuests;
      g.houseDefaults = profile.houseDefaults || g.houseDefaults;
      g.profileSummary = profile.profileSummary || g.profileSummary;
      if (profile.surveyAnswers && Object.keys(profile.surveyAnswers).length) {
        submitSurvey(g.id, profile.surveyAnswers);
      }
    } else {
      g = await addGuest({
        name: profile.name,
        userId: profile.uid,
        avatar: profile.avatar,
        color: profile.color,
        photoUrl,
        gamerTag: profile.gamerTag,
        archetype: profile.archetype,
        preferredRole: profile.preferredRole,
        surveyAnswers: profile.surveyAnswers,
        customFacts: profile.customFacts,
        customTrivia: profile.customTrivia,
        customSuperlatives: profile.customSuperlatives,
        customBluffs: profile.customBluffs,
        customQuests: profile.customQuests,
        houseDefaults: profile.houseDefaults,
        profileSummary: profile.profileSummary,
      });
    }
    if (setAsPartyHost || (!state.partyHostId && applyHouse)) {
      state.partyHostId = g.id;
      const hd = profile.houseDefaults || g.houseDefaults;
      if (hd && Object.keys(hd).length) {
        submitHouse(g.id, hd);
      }
    }
    emit();
    return g;
  }

  function removeGuest(id) {
    if (!['setup', 'lobby'].includes(state.phase)) throw new Error('The game already started');
    state.guests = state.guests.filter((g) => g.id !== id);
    if (state.partyHostId === id) state.partyHostId = null;
    emit();
  }

  function submitSurvey(guestId, answers = {}) {
    const g = guest(guestId);
    if (!g) throw new Error('Unknown guest');
    if (!['setup', 'lobby'].includes(state.phase)) throw new Error('The survey is closed');
    const wasComplete = g.surveyComplete;
    g.answers = { ...g.answers, ...answers };
    refreshGuestSurvey(g);
    if (g.surveyComplete && !wasComplete) introduceGuest(g);
    scheduleScript();
    emit();
    return survey.surveyProgress(questions(), g.answers);
  }

  // ── AI writers' room ─────────────────────────────────────────────────────

  // As soon as a guest finishes the survey, the AI host writes them a personal
  // welcome and says it on the TV (lobby only).
  function introduceGuest(g) {
    if (state.ai.intros[g.id]) return;
    state.ai.intros[g.id] = { pending: true };
    state.ai.calls += 1;
    aiHost.guestIntro(g).then(async (line) => {
      state.ai.intros[g.id] = { line: line || null };
      if (line && state.phase === 'lobby' && guest(g.id)) {
        await narrate('guestReady', {}, line);
        emit();
      }
    });
  }

  function houseContext() {
    const hostGuest = guest(state.partyHostId);
    return hostGuest ? { hostName: hostGuest.name, hostId: hostGuest.id, profile: survey.houseProfileText(state.house) } : null;
  }

  function plannedRoles() {
    const enabled = state.settings.enabledRoles
      || roles.ROLE_CATALOG.filter((r) => state.settings.secretRoles || !r.secretRole).map((r) => r.id);
    const autoAssigned = roles.assignRoles(state.guests, { enabledRoles: enabled, seed: state.seed });
    const used = new Set();
    const out = {};
    for (const g of state.guests) {
      if (g.preferredRole && enabled.includes(g.preferredRole) && !used.has(g.preferredRole)) {
        out[g.id] = g.preferredRole;
        used.add(g.preferredRole);
      }
    }
    for (const g of state.guests) {
      if (out[g.id]) continue;
      const auto = autoAssigned[g.id];
      if (auto && !used.has(auto)) {
        out[g.id] = auto;
        used.add(auto);
      } else {
        const fallback = enabled.find((id) => !used.has(id)) || auto || enabled[0] || 'detective';
        out[g.id] = fallback;
        used.add(fallback);
      }
    }
    return out;
  }

  function scriptKey() {
    return JSON.stringify([
      state.settings.personality,
      state.settings.miniGames,
      state.settings.roundsPerGame,
      state.guests.map((g) => [g.id, g.answers]),
      state.house,
    ]);
  }

  function startScript() {
    const key = scriptKey();
    if (scriptJob && scriptJob.key === key) return scriptJob.promise;
    const assignment = plannedRoles();
    const snapshot = state.guests.map((g) => ({
      id: g.id,
      name: g.name,
      traits: g.traits,
      facts: g.facts,
      profileSummary: g.profileSummary,
    }));
    state.ai.status = 'writing';
    state.ai.scriptKey = key;
    state.ai.script = null;
    state.ai.calls += 1;
    const rounds = state.settings.roundsPerGame;
    const wantsTrivia = state.settings.miniGames.includes('interest-trivia');
    if (wantsTrivia) state.ai.calls += 1;
    if (state.settings.miniGames.includes('house-quest')) state.ai.calls += 1;
    // The show script and the trivia are written in parallel.
    const promise = Promise.all([
      aiHost.writeShow({
        guests: snapshot,
        house: houseContext(),
        roleOf: (g) => roles.publicRole(roles.roleById(assignment[g.id])),
        miniGames: state.settings.miniGames.map((id) => getMiniGame(id)),
        superlativeCount: rounds + 1,
        whoSaidCount: rounds + 1,
      }).catch(() => null),
      wantsTrivia ? aiHost.writeTrivia({ guests: snapshot, count: rounds + 2 }).catch(() => []) : [],
      state.settings.miniGames.includes('house-quest')
        ? aiHost.writeHouseQuests({ guests: snapshot, house: houseContext(), count: rounds + 1 }).catch(() => [])
        : [],
    ]).then(([show, trivia, houseQuests]) => {
      const hasProfileMaterial = state.guests.some((g) =>
        (g.customTrivia && g.customTrivia.length)
        || (g.customSuperlatives && g.customSuperlatives.length)
        || (g.customBluffs && g.customBluffs.length)
        || (g.customQuests && g.customQuests.length)
      );
      const script = show || ((trivia.length || houseQuests.length || hasProfileMaterial)
        ? { roleReveals: {}, whoSaidThat: [], mostLikelyTo: [], bluffs: {}, gameIntros: {} }
        : null);
      if (state.ai.scriptKey !== key) return script; // superseded by newer answers
      state.ai.script = script && { ...script, trivia, houseQuests, roles: assignment };
      state.ai.status = script ? 'ready' : 'failed';
      emit();
      return state.ai.script;
    });
    scriptJob = { key, promise };
    emit();
    return promise;
  }

  // Draft the show once everyone in the lobby has finished their survey, so the
  // writers are usually done before the host presses Start.
  function scheduleScript() {
    clearTimeout(scriptTimer);
    if (state.phase !== 'lobby') return;
    const ready = state.guests.length >= state.settings.minGuests && state.guests.every((g) => g.surveyComplete)
      && state.partyHostId && survey.houseProgress(state.house).complete;
    if (!ready) return;
    scriptTimer = setTimeout(() => {
      if (state.phase === 'lobby') startScript();
    }, 2500);
    scriptTimer.unref?.();
  }

  function waitFor(promise, ms) {
    return Promise.race([promise, new Promise((resolve) => {
      const t = setTimeout(() => resolve(undefined), ms);
      t.unref?.();
    })]);
  }

  // ── Party host & house ───────────────────────────────────────────────────

  function claimPartyHost(guestId) {
    const g = guest(guestId);
    if (!g) throw new Error('Unknown guest');
    if (!['setup', 'lobby'].includes(state.phase)) throw new Error('The game already started');
    if (state.partyHostId && state.partyHostId !== guestId) {
      throw new Error(`${guest(state.partyHostId)?.name || 'Someone'} is already the party host`);
    }
    state.partyHostId = guestId;
    emit();
    return { ok: true };
  }

  // The desktop operator can reassign or clear the party host.
  function setPartyHost(guestId) {
    if (!['setup', 'lobby'].includes(state.phase)) throw new Error('The game already started');
    if (guestId && !guest(guestId)) throw new Error('Unknown guest');
    state.partyHostId = guestId || null;
    emit();
  }

  function submitHouse(guestId, answers = {}) {
    if (!['setup', 'lobby'].includes(state.phase)) throw new Error('The game already started');
    if (guestId !== state.partyHostId) throw new Error('Only the party host describes the house');
    const was = survey.houseProgress(state.house).complete;
    state.house = survey.normalizeHouse({ ...state.house, ...answers });
    const progress = survey.houseProgress(state.house);
    if (progress.complete && !was) tourHouse();
    scheduleScript();
    emit();
    return progress;
  }

  // Once the house is described, the AI host gives the room a quick "house tour".
  function tourHouse() {
    const hostGuest = guest(state.partyHostId);
    state.ai.calls += 1;
    aiHost.houseTour({ hostName: hostGuest?.name || 'our host', house: survey.houseProfileText(state.house) }).then(async (line) => {
      if (line && state.phase === 'lobby') {
        state.ai.houseTour = line;
        await narrate('guestReady', {}, line);
        emit();
      }
    });
  }

  function authGuest(guestId, token) {
    const g = guest(guestId);
    return g && token && g.token === token ? g : null;
  }

  // ── Game flow ────────────────────────────────────────────────────────────

  function canStart() {
    const ready = state.guests.filter((g) => g.surveyComplete);
    const waiting = state.guests.filter((g) => !g.surveyComplete).map((g) => g.name);
    const reasons = [];
    if (state.tvs.length === 0) reasons.push('Pick at least one RobOS TV');
    if (!state.settings.agent) reasons.push('Pick an AI agent to host the party');
    if (ready.length < state.settings.minGuests) {
      reasons.push(`Need ${state.settings.minGuests} guests with finished surveys (have ${ready.length})`);
    }
    if (waiting.length) reasons.push(`Still answering: ${waiting.join(', ')}`);
    if (!state.partyHostId) reasons.push('Nobody has claimed “I’m the party host” yet');
    else if (!survey.houseProgress(state.house).complete) reasons.push(`${guest(state.partyHostId)?.name} still needs to describe the house`);
    return { ok: reasons.length === 0, reasons };
  }

  async function startGame() {
    if (state.phase !== 'lobby') throw new Error('Open the lobby first');
    const check = canStart();
    if (!check.ok) throw new Error(check.reasons.join('. '));
    const agent = await agentStatus();
    if (!agent.ok) throw new Error(agent.reason);
    clearTimeout(scriptTimer);
    const assignment = plannedRoles();
    for (const g of state.guests) g.roleId = assignment[g.id];
    startScript();
    state.phase = 'roles';
    state.roleRevealIndex = -1;
    // Give the writers a moment if they are nearly done, so the opening is theirs.
    const script = await waitFor(scriptJob.promise, 4000);
    const opening = script && script.opening
      ? `${script.showTitle ? `Welcome to ${script.showTitle.replace(/[.!?]+$/, '')}! ` : ''}${script.opening}`
      : null;
    await narrate('rolesIntro', {}, opening);
    setTimer(5);
    emit();
  }

  async function revealNextRole() {
    state.roleRevealIndex += 1;
    if (state.roleRevealIndex < state.guests.length) {
      const g = state.guests[state.roleRevealIndex];
      const pub = roles.publicRole(roles.roleById(g.roleId));
      const written = state.ai.script?.roleReveals?.[g.id];
      // The writers usually name the guest and role themselves; add them only if not.
      const mentions = written && written.includes(g.name) && written.includes(pub.title.replace(/^The /, ''));
      await narrate('roleReveal', { name: g.name, role: pub.title, blurb: pub.blurb },
        written ? (mentions ? written : `${g.name}, you are ${pub.title}! ${written}`) : null);
      setTimer(5);
    } else if (state.roleRevealIndex === state.guests.length) {
      await narrate('rolesOutro');
      setTimer(6);
    } else {
      await startMiniGame(0);
    }
  }

  async function startMiniGame(index) {
    const game = getMiniGame(state.settings.miniGames[index]);
    state.gameIndex = index;
    state.roundIndex = -1;
    state.doubleDowns = {};
    state.lastResult = null;
    state.phase = 'game-intro';
    if (state.ai.status === 'writing' && scriptJob) {
      await narrate('aiWriting', {});
      emit();
      await waitFor(scriptJob.promise, state.settings.aiWaitSeconds * 1000);
    }
    // Finale awards take a while to write: start them as the last game begins.
    if (index === state.settings.miniGames.length - 1 && !awardsJob) startAwards();
    const ctx = buildCtx();
    let rounds = [];
    try {
      rounds = await game.buildRounds(ctx, state.settings.roundsPerGame);
    } catch (err) {
      state.error = `${game.title}: ${err.message}`;
    }
    const maxRounds = game.preserveAllRounds ? (rounds || []).length : state.settings.roundsPerGame;
    state.rounds = (rounds || []).slice(0, maxRounds);
    const introText = state.ai.script?.gameIntros?.[game.id] || game.narration?.intro?.(ctx) || null;
    await narrate('gameIntro', { number: index + 1, title: game.title, tagline: game.tagline }, introText);
    setTimer(7);
    if (state.rounds.length === 0) state.error = `${game.title} had not enough survey material; skipping`;
  }

  function buildCtx() {
    return {
      guests: state.guests.map((g) => ({
        id: g.id,
        userId: g.userId,
        name: g.name,
        gamerTag: g.gamerTag,
        archetype: g.archetype,
        traits: g.traits,
        facts: g.facts,
        roleId: g.roleId,
        profileSummary: g.profileSummary,
        customTrivia: g.customTrivia,
        customSuperlatives: g.customSuperlatives,
        customBluffs: g.customBluffs,
        customQuests: g.customQuests,
      })),
      questions: questions(),
      settings: state.settings,
      rand,
      shuffle,
      pick,
      ai: aiText,
      script: state.ai.script,
      house: { ...state.house },
      partyHostId: state.partyHostId,
    };
  }

  async function startRound(index) {
    const game = currentGame();
    state.roundIndex = index;
    state.answers = {};
    state.hints = {};
    state.lastResult = null;
    state.phase = 'question';
    const round = currentRound();
    if (typeof game.onBeforeRound === 'function') {
      await game.onBeforeRound(round, index, buildCtx(), state);
    }
    // Detective: one wrong option crossed out on their phone.
    const correct = game.correctOption ? game.correctOption(round) : null;
    if (correct && (round.prompt.inputMode || 'single') === 'single') {
      for (const g of state.guests) {
        if (!roles.hasPerk(g.roleId, 'hint') || round.prompt.excludeGuestIds?.includes(g.id)) continue;
        const wrong = (round.prompt.options || []).filter((o) => o.id !== correct && o.guestId !== g.id);
        if (wrong.length) state.hints[g.id] = pick(wrong).id;
      }
    }
    const custom = game.narration?.round?.(round, index, buildCtx()) || null;
    await narrate('round', {}, custom || round.prompt.headline + ' ' + (round.prompt.body || ''));
    // A round or mini game can disable the countdown timer so it only advances when all votes lock in.
    if (round.prompt.noTimer || game.noTimer) {
      state.phaseEndsAt = null;
    } else {
      const secs = round.prompt.seconds || state.settings.answerSeconds || game.answerSeconds || 30;
      state.phaseEndsAt = now() + secs * 1000 + estimateSpeechMs(state.narration.text);
    }
  }

  function eligibleGuests() {
    const round = currentRound();
    const excluded = new Set(round?.prompt?.excludeGuestIds || []);
    return state.guests.filter((g) => !excluded.has(g.id));
  }

  function submitAnswer(guestId, rawAnswer) {
    if (state.phase !== 'question') throw new Error('Not accepting answers right now');
    const round = currentRound();
    if (!eligibleGuests().some((g) => g.id === guestId)) throw new Error('You sit this round out');
    const mode = round.prompt.inputMode || 'single';
    if (mode === 'text') {
      const textVal = typeof rawAnswer === 'string'
        ? rawAnswer
        : rawAnswer && typeof rawAnswer === 'object'
          ? String(rawAnswer.text || rawAnswer.optionId || '')
          : '';
      const clean = textVal.trim().replace(/\s+/g, ' ').slice(0, 240);
      if (!clean) throw new Error('Please enter an answer');
      const matchedOpt = (round.prompt.options || []).find((o) => o.id === clean);
      state.answers[guestId] = matchedOpt ? matchedOpt.label : clean;
    } else if (mode === 'multi') {
      const maxPicks = Math.max(1, Number(round.prompt.pickCount) || 3);
      const rawList = Array.isArray(rawAnswer)
        ? rawAnswer
        : Array.isArray(rawAnswer?.optionIds)
          ? rawAnswer.optionIds
          : typeof rawAnswer === 'string' && rawAnswer
            ? [rawAnswer]
            : [];
      const validIds = new Set((round.prompt.options || []).map((o) => o.id));
      const cleanList = [...new Set(rawList.map((x) => String(x || '')))].filter((id) => validIds.has(id));
      if (cleanList.length === 0) throw new Error('Pick at least one option');
      if (cleanList.length > maxPicks) throw new Error(`Pick at most ${maxPicks} options`);
      state.answers[guestId] = cleanList;
    } else {
      const optionId = typeof rawAnswer === 'string' ? rawAnswer : String(rawAnswer?.optionId || '');
      if (!round.prompt.options.some((o) => o.id === optionId)) throw new Error('Unknown option');
      state.answers[guestId] = optionId;
    }
    emit();
    // Rounds performed in real life (House Quest) wait for the timer instead.
    if (!round.prompt.waitForTimer && eligibleGuests().every((g) => {
      const a = state.answers[g.id];
      return Array.isArray(a) ? a.length > 0 : Boolean(a);
    })) {
      // Everyone answered: shorten the clock so the reveal comes quickly.
      state.phaseEndsAt = Math.min(state.phaseEndsAt || Infinity, now() + (round.prompt.skipReveal ? 800 : 1500));
    }
    return { ok: true };
  }

  function useDoubleDown(guestId) {
    if (state.phase !== 'question') throw new Error('Double down only during a question');
    if (!roles.hasPerk(guest(guestId)?.roleId, 'doubleDown')) throw new Error('Your role cannot double down');
    if (state.doubleDowns[guestId] !== undefined) throw new Error('Already used in this mini game');
    state.doubleDowns[guestId] = state.roundIndex;
    emit();
    return { ok: true };
  }

  function rankedGuests() {
    return [...state.guests].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  }

  async function revealRound() {
    const game = currentGame();
    const round = currentRound();
    const ctx = buildCtx();
    const result = game.score(round, { ...state.answers }, ctx);
    const deltas = {};
    const add = (gid, pts, reason) => {
      if (!pts || !guest(gid)) return;
      deltas[gid] = deltas[gid] || { points: 0, reasons: [] };
      deltas[gid].points += pts;
      deltas[gid].reasons.push(`${pts > 0 ? '+' : ''}${pts} ${reason}`);
    };

    const minScore = Math.min(...state.guests.map((g) => g.score));
    const lastPlace = new Set(state.guests.filter((g) => g.score === minScore).map((g) => g.id));
    const majority = majorityOptions(state.answers);

    for (const [gid, pts] of Object.entries(result.awards || {})) {
      const reason = result.awardReasons?.[gid] || game.title;
      add(gid, pts, reason);
    }
    for (const g of state.guests) {
      const answer = state.answers[g.id];
      const earned = result.awards?.[g.id] || 0;
      const ansMatchesMajority = Array.isArray(answer)
        ? answer.some((a) => majority.includes(a))
        : Boolean(answer && majority.includes(answer));
      if (roles.hasPerk(g.roleId, 'crowdBonus') && ansMatchesMajority && majority.length === 1) {
        add(g.id, 1, 'Diplomat: voted with the room');
      }
      if (roles.hasPerk(g.roleId, 'underdog') && earned > 0 && lastPlace.has(g.id) && state.guests.length > 1) {
        add(g.id, 2, 'Underdog bonus');
      }
      if (result.bluffer === g.id && roles.hasPerk(g.roleId, 'steal') && result.fooled?.length) {
        add(g.id, result.fooled.length, 'fooled the room');
      }
      if (state.doubleDowns[g.id] === state.roundIndex) {
        const subtotal = deltas[g.id]?.points || 0;
        add(g.id, subtotal > 0 ? subtotal : -2, subtotal > 0 ? 'DOUBLE DOWN!' : 'double down backfired');
      }
    }
    // Mole: in the final mini game, a wrong vote that lands on the Mole counts.
    const mole = state.guests.find((g) => g.roleId === 'mole');
    if (mole && state.gameIndex === state.settings.miniGames.length - 1) {
      for (const [gid, choice] of Object.entries(state.answers)) {
        if (gid !== mole.id && choice === mole.id && result.correct !== mole.id) state.moleWrongVotes += 1;
      }
    }
    for (const [gid, d] of Object.entries(deltas)) guest(gid).score += d.points;

    const correctCount = Object.entries(state.answers).filter(([, c]) =>
      Array.isArray(c) ? c.includes(result.correct) : c === result.correct
    ).length;
    state.lastResult = {
      ...result,
      answers: { ...state.answers },
      deltas,
      correctCount,
      correctLabel: round.prompt.options.find((o) => o.id === result.correct)?.label || null,
    };
    state.history.push({
      game: game.id,
      round: state.roundIndex,
      prompt: round.prompt.body || round.prompt.headline,
      correct: state.lastResult.correctLabel,
      deltas,
    });
    state.phase = 'reveal';
    if (state.roundIndex === state.rounds.length - 1) startRecap();
    const custom = game.narration?.reveal?.(round, result, ctx) || null;
    if (custom) await narrate('revealGood', {}, custom);
    else await narrate(correctCount ? 'revealGood' : 'revealNone', { count: correctCount });
    setTimer(state.settings.revealSeconds);
  }

  // The recap is written while the last reveal of a mini game is on screen.
  let recapJob = null;
  function startRecap() {
    const nextGame = getMiniGame(state.settings.miniGames[state.gameIndex + 1]);
    const thisGame = currentGame();
    const recent = state.history
      .filter((h) => h.game === thisGame.id)
      .map((h) => `"${h.prompt}" → ${h.correct || 'no right answer'}; ${Object.entries(h.deltas).map(([id, d]) => `${guest(id)?.name} ${d.points > 0 ? '+' : ''}${d.points}`).join(', ') || 'nobody scored'}`)
      .join(' / ');
    state.ai.calls += 1;
    recapJob = aiHost.recap({
      standings: rankedGuests().map((g) => `${g.name} ${g.score}`).join(', '),
      recent: `${thisGame.title}: ${recent}`,
      nextGame: nextGame ? nextGame.title : null,
    }).catch(() => null);
  }

  async function showScores() {
    state.phase = 'scores';
    const leader = rankedGuests()[0];
    if (!recapJob) startRecap();
    const job = recapJob;
    recapJob = null;
    // Use the recap if it is already written; otherwise say the stock line now
    // and speak the recap the moment it arrives (holding the scoreboard for it).
    const early = await waitFor(job, 3000);
    await narrate('scores', { leader: leader ? leader.name : 'nobody' }, early || null);
    setTimer(state.settings.revealSeconds);
    if (early) {
      state.ai.recaps += 1;
      return;
    }
    const gameIndex = state.gameIndex;
    const stockId = state.narration.id;
    job.then(async (line) => {
      if (!line || state.phase !== 'scores' || state.gameIndex !== gameIndex || state.narration?.id !== stockId) return;
      state.ai.recaps += 1;
      await narrate('scores', {}, line);
      setTimer(state.settings.revealSeconds);
      emit();
    });
  }

  function startAwards() {
    state.ai.calls += 1;
    const highlights = () => state.history.slice(-8)
      .map((h) => `${h.prompt} → ${h.correct || '?'}`).join('; ');
    awardsJob = aiHost.finaleAwards({
      house: houseContext(),
      guests: state.guests.map((g) => ({ id: g.id, name: g.name, traits: g.traits, facts: g.facts })),
      roleOf: (g) => roles.roleById(guest(g.id)?.roleId),
      highlights: highlights() || 'the games are just starting',
    }).catch(() => null).then((awards) => {
      state.ai.awards = awards && Object.keys(awards).length ? awards : null;
      return state.ai.awards;
    });
  }

  async function finale() {
    state.phase = 'finale';
    state.phaseEndsAt = null;
    if (awardsJob) await waitFor(awardsJob, 15000);
    const mole = state.guests.find((g) => g.roleId === 'mole');
    let moleLine = '';
    if (mole) {
      const success = state.moleWrongVotes > 0;
      if (success) mole.score += 5;
      state.moleResult = { guestId: mole.id, success, wrongVotes: state.moleWrongVotes };
      moleLine = (await narrator.say(success ? 'moleSuccess' : 'moleFail', { name: mole.name }, {
        personality: state.settings.personality,
      })).text + ' ';
    }
    const ranked = rankedGuests();
    const top = ranked[0]?.score ?? 0;
    state.winnerIds = ranked.filter((g) => g.score === top).map((g) => g.id);
    const winnerNames = state.winnerIds.map((id) => guest(id).name).join(' and ');
    const n = await narrator.say('finale', { winner: winnerNames }, { personality: state.settings.personality });
    const winnerAward = state.winnerIds.map((id) => state.ai.awards?.[id]?.line).find(Boolean);
    await narrate('finale', {}, moleLine + n.text + (winnerAward ? ` ${winnerAward}` : ''));
  }

  async function next() {
    if (busy) return state;
    busy = true;
    state.error = null;
    try {
      switch (state.phase) {
        case 'setup':
          await openLobby();
          break;
        case 'lobby':
          await startGame();
          break;
        case 'roles':
          await revealNextRole();
          break;
        case 'game-intro':
          if (state.rounds.length) await startRound(0);
          else if (state.gameIndex + 1 < state.settings.miniGames.length) await startMiniGame(state.gameIndex + 1);
          else await finale();
          break;
        case 'question': {
          const r = currentRound();
          if (r && r.prompt && r.prompt.skipReveal) {
            const game = currentGame();
            if (typeof game?.onCollect === 'function') {
              await game.onCollect(r, { ...state.answers }, buildCtx());
            }
            if (state.roundIndex + 1 < state.rounds.length) await startRound(state.roundIndex + 1);
            else await showScores();
          } else {
            await revealRound();
          }
          break;
        }
        case 'reveal':
          if (state.roundIndex + 1 < state.rounds.length) await startRound(state.roundIndex + 1);
          else await showScores();
          break;
        case 'scores':
          if (state.gameIndex + 1 < state.settings.miniGames.length) await startMiniGame(state.gameIndex + 1);
          else await finale();
          break;
        default:
          break;
      }
    } catch (err) {
      state.error = err.message;
      throw err;
    } finally {
      busy = false;
      emit();
    }
    return state;
  }

  // Called every ~500ms by the server. Moves on when a timer runs out.
  async function tick() {
    if (busy || !state.phaseEndsAt || now() < state.phaseEndsAt) return false;
    const timed = state.phase === 'question' || state.settings.autoAdvance;
    if (!timed) return false;
    state.phaseEndsAt = null;
    await next().catch(() => {});
    return true;
  }

  function skipRound() {
    if (state.phase !== 'question') throw new Error('No round in progress');
    state.phaseEndsAt = now();
    return tick();
  }

  function resetGame({ keepGuests = true } = {}) {
    const keep = keepGuests ? state.guests : [];
    if (!keepGuests) {
      state.partyHostId = null;
      state.house = {};
    }
    for (const g of keep) {
      g.score = 0;
      g.roleId = null;
    }
    Object.assign(state, {
      guests: keep,
      phase: state.tvs.length ? 'lobby' : 'setup',
      roleRevealIndex: -1,
      gameIndex: -1,
      roundIndex: -1,
      rounds: [],
      answers: {},
      doubleDowns: {},
      hints: {},
      phaseEndsAt: null,
      lastResult: null,
      history: [],
      moleWrongVotes: 0,
      moleResult: null,
      winnerIds: [],
      error: null,
      ai: freshAi(),
    });
    scriptJob = null;
    awardsJob = null;
    clearTimeout(scriptTimer);
    emit();
  }

  // ── Views ────────────────────────────────────────────────────────────────

  function publicGuest(g, { revealRoles }) {
    const role = roles.roleById(g.roleId);
    return {
      id: g.id,
      userId: g.userId,
      name: g.name,
      gamerTag: g.gamerTag,
      archetype: g.archetype,
      avatar: g.avatar,
      color: g.color,
      photoUrl: g.photoUrl,
      score: g.score,
      surveyComplete: g.surveyComplete,
      role: revealRoles ? roles.publicRole(role) : null,
    };
  }

  function rolesRevealed(g) {
    if (state.phase === 'roles') return state.guests.indexOf(g) <= state.roleRevealIndex;
    return Boolean(g.roleId);
  }

  function publicRound() {
    const round = currentRound();
    if (!round || !['question', 'reveal'].includes(state.phase)) return null;
    const p = round.prompt;
    const revealMeta = state.phase === 'reveal' ? (state.lastResult?.optionMeta || null) : null;
    return {
      kicker: p.kicker || '',
      headline: p.headline,
      body: p.body,
      caption: p.caption || '',
      layout: p.layout,
      inputMode: p.inputMode || 'single',
      pickCount: p.pickCount || 1,
      placeholder: p.placeholder || '',
      suggestions: p.suggestions || [],
      options: (p.options || []).map((o) => {
        const meta = revealMeta && revealMeta[o.id];
        return meta ? { ...o, ...meta } : o;
      }),
      // The spotlight guest is only public once the answer is revealed (unless the prompt shows it).
      subjectId: state.phase === 'reveal' ? state.lastResult?.subjectId || p.subjectId : p.subjectId,
      excludeGuestIds: p.excludeGuestIds || [],
      number: state.roundIndex + 1,
      total: state.rounds.length,
    };
  }

  function tvView(screen = 'stage') {
    const game = currentGame();
    const finaleMole = state.phase === 'finale' ? state.moleResult : null;
    return {
      id: state.id,
      screen,
      phase: state.phase,
      title: state.settings.title,
      personality: PERSONALITIES[state.settings.personality],
      hostFace: state.settings.hostFace,
      joinUrl: state.joinUrl,
      tvs: state.tvs,
      guests: state.guests.map((g) => {
        const pg = publicGuest(g, { revealRoles: rolesRevealed(g) });
        if (finaleMole && finaleMole.guestId === g.id) {
          const mole = roles.roleById('mole');
          pg.role = { id: mole.id, title: mole.title, emoji: mole.emoji, color: mole.color, blurb: mole.blurb };
        }
        return pg;
      }),
      ranking: rankedGuests().map((g) => g.id),
      roleRevealGuestId: state.phase === 'roles' ? state.guests[state.roleRevealIndex]?.id || null : null,
      game: game ? {
        id: game.id, title: game.title, icon: game.icon, tagline: game.tagline, description: game.description,
        number: state.gameIndex + 1, total: state.settings.miniGames.length,
      } : null,
      round: publicRound(),
      answeredIds: Object.keys(state.answers),
      result: state.phase === 'reveal' ? state.lastResult : null,
      phaseEndsAt: state.phaseEndsAt,
      serverNow: now(),
      narration: state.narration,
      narrationOutputs: state.settings.narrationOutputs,
      winnerIds: state.winnerIds,
      moleResult: finaleMole,
      canStart: state.phase === 'lobby' ? canStart() : null,
      partyHost: state.partyHostId ? {
        guestId: state.partyHostId,
        name: guest(state.partyHostId)?.name,
        house: survey.houseProgress(state.house),
      } : null,
      ai: {
        status: state.ai.status,
        showTitle: state.ai.script?.showTitle || null,
        awards: state.phase === 'finale' ? state.ai.awards : null,
      },
    };
  }

  function playerView(guestId) {
    const g = guest(guestId);
    if (!g) return { error: 'unknown-guest' };
    const base = tvView('phone');
    const role = roles.roleById(g.roleId);
    const qs = questions();
    const round = currentRound();
    const excluded = round?.prompt?.excludeGuestIds?.includes(g.id);
    const guestSuggestions = round?.prompt?.suggestionsByGuest?.[g.id] || round?.prompt?.suggestions || [];
    return {
      ...base,
      round: base.round ? { ...base.round, suggestions: guestSuggestions } : null,
      me: {
        id: g.id,
        userId: g.userId,
        name: g.name,
        gamerTag: g.gamerTag,
        archetype: g.archetype,
        avatar: g.avatar,
        color: g.color,
        photoUrl: g.photoUrl,
        score: g.score,
        rank: rankedGuests().findIndex((x) => x.id === g.id) + 1,
        answers: g.answers,
        surveyComplete: g.surveyComplete,
        role: role && rolesRevealed(g) ? { ...role, traits: undefined } : null,
        answer: state.answers[g.id] || null,
        sittingOut: Boolean(excluded),
        hint: state.phase === 'question' ? state.hints[g.id] || null : null,
        canDoubleDown: state.phase === 'question' && roles.hasPerk(g.roleId, 'doubleDown')
          && state.doubleDowns[g.id] === undefined && !excluded,
        doubledThisRound: state.doubleDowns[g.id] === state.roundIndex,
        delta: state.phase === 'reveal' ? state.lastResult?.deltas?.[g.id] || null : null,
      },
      survey: ['setup', 'lobby'].includes(state.phase) ? qs : null,
      isPartyHost: state.partyHostId === g.id,
      canClaimPartyHost: !state.partyHostId && ['setup', 'lobby'].includes(state.phase),
      houseSurvey: state.partyHostId === g.id && ['setup', 'lobby'].includes(state.phase) ? survey.HOUSE_SURVEY : null,
      house: state.partyHostId === g.id ? state.house : null,
    };
  }

  function hostView() {
    return {
      ...tvView('host'),
      settings: state.settings,
      miniGames: listMiniGames(),
      personalities: Object.values(PERSONALITIES),
      surveyPacks: Object.values(survey.SURVEY_PACKS).map(({ id, title, description, questions: q }) => ({
        id, title, description, count: q.length,
      })),
      roleCatalog: roles.ROLE_CATALOG,
      guestsDetail: state.guests.map((g) => ({
        isPartyHost: g.id === state.partyHostId,
        id: g.id,
        userId: g.userId,
        name: g.name,
        gamerTag: g.gamerTag,
        archetype: g.archetype,
        avatar: g.avatar,
        color: g.color,
        photoUrl: g.photoUrl,
        score: g.score,
        surveyComplete: g.surveyComplete,
        progress: survey.surveyProgress(questions(), g.answers),
        role: g.roleId ? roles.roleById(g.roleId) : null,
        traits: g.traits,
        answered: Boolean(state.answers[g.id]),
        answers: g.answers,
        joinQuery: `?guest=${encodeURIComponent(g.id)}&token=${encodeURIComponent(g.token)}`,
      })),
      history: state.history,
      error: state.error,
      houseSurvey: survey.HOUSE_SURVEY,
      house: state.house,
      aiDetail: {
        status: state.ai.status,
        calls: state.ai.calls,
        recaps: state.ai.recaps,
        intros: Object.values(state.ai.intros).filter((i) => i.line).length,
        script: state.ai.script ? {
          showTitle: state.ai.script.showTitle,
          roleReveals: Object.keys(state.ai.script.roleReveals).length,
          whoSaidThat: state.ai.script.whoSaidThat.length,
          mostLikelyTo: state.ai.script.mostLikelyTo.length,
          bluffs: Object.keys(state.ai.script.bluffs).length,
          trivia: (state.ai.script.trivia || []).length,
          houseQuests: (state.ai.script.houseQuests || []).length,
        } : null,
        awards: state.ai.awards ? Object.keys(state.ai.awards).length : 0,
      },
    };
  }

  function summary() {
    return {
      id: state.id,
      createdAt: state.createdAt,
      finishedAt: new Date(now()).toISOString(),
      settings: state.settings,
      partyHost: guest(state.partyHostId)?.name || null,
      house: state.house,
      guests: rankedGuests().map((g) => ({ name: g.name, userId: g.userId, score: g.score, role: g.roleId })),
      winners: state.winnerIds.map((id) => guest(id)?.name),
      history: state.history,
    };
  }

  return {
    events,
    state,
    updateSettings,
    selectTvs,
    openLobby,
    addGuest,
    onboardUser,
    removeGuest,
    submitSurvey,
    authGuest,
    claimPartyHost,
    setPartyHost,
    submitHouse,
    canStart,
    agentStatus,
    startGame,
    next,
    tick,
    skipRound,
    submitAnswer,
    useDoubleDown,
    resetGame,
    tvView,
    playerView,
    hostView,
    summary,
    questions,
    setJoinUrl(url) { state.joinUrl = url; emit(); },
  };
}

module.exports = { createPartyEngine, DEFAULT_SETTINGS, normalizeSettings, screenRolesFor, SCREEN_ROLES };
