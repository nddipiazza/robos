'use strict';

/**
 * RobOS Users & Groups Engine (`robos-lib/users-groups`)
 *
 * Unified library, natural-language voice intent engine, Knowledge Graph exporter,
 * and RobOS Services / SSH cross-machine synchronizer for:
 *   1. RobOS Users (`~/.config/robos/people/<uid>.json` + `photos/`)
 *   2. RobOS Groups (`~/.config/robos/groups/<gid>.json` + user `groups` tags)
 *   3. Active RobOS User identity (`~/.config/robos/settings.json` -> `myProfileUid`)
 *   4. RobOS Services (`~/.config/robos/services/data/users-groups.json` + `:19400/users-groups` gateway)
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const peopleStore = require('./people-store');

function getHomeDir(opts = {}) {
  return opts.homeDir || process.env.HOME || os.homedir();
}

function getConfigDir(opts = {}) {
  if (typeof opts === 'string') return opts;
  return opts.configDir || process.env.ROBOS_CONFIG_DIR || path.join(getHomeDir(opts), '.config', 'robos');
}

function getGroupsDir(opts = {}) {
  return path.join(getConfigDir(opts), 'groups');
}

function getServicesDir(opts = {}) {
  return opts.servicesDir || process.env.ROBOS_SERVICES_CONFIG || path.join(getConfigDir(opts), 'services');
}

function slugify(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function fold(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’"`]/g, '')
    .replace(/[^a-z0-9@\s.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readJsonSafe(fp, fallback = null) {
  try {
    if (!fs.existsSync(fp)) return fallback;
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(fp, value, mode) {
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  const tmp = `${fp}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, mode ? { mode } : undefined);
  fs.renameSync(tmp, fp);
}

// ── Search Index & KGraph Maintenance ────────────────────────────────────────

function rebuildSearchIndexes(opts = {}) {
  const configDir = getConfigDir(opts);
  const indexDir = path.join(configDir, 'search-index');
  fs.mkdirSync(indexDir, { recursive: true });

  const users = peopleStore.loadAllPeople({
    configDir,
    seedDefaults: opts.seedDefaults !== false,
    includePhotoDataUrl: false,
  });
  const peopleLines = users
    .map((p) => `person:${p.username || p.uid || ''}:${p.displayName || ''}`)
    .filter((l) => l !== 'person::');
  fs.writeFileSync(path.join(indexDir, 'people.txt'), peopleLines.length ? `${peopleLines.join('\n')}\n` : '', 'utf8');

  const groups = listGroups({ ...opts, includeDerived: true });
  const groupLines = groups
    .map((g) => `group:${g.id || ''}:${g.name || ''}`)
    .filter((l) => l !== 'group::');
  fs.writeFileSync(path.join(indexDir, 'groups.txt'), groupLines.length ? `${groupLines.join('\n')}\n` : '', 'utf8');

  return { peopleCount: peopleLines.length, groupCount: groupLines.length };
}

function buildUsersGroupsKGraph(opts = {}) {
  const users = listUsers({ ...opts, includePhotoDataUrl: false });
  const groups = listGroups({ ...opts, includeDerived: true });

  const personNodes = users.map((u) => ({
    '@id': `urn:robos:person:${u.uid}`,
    '@type': ['oslc:Person', 'schema:Person', 'robos:User'],
    'dcterms:identifier': u.uid,
    'dcterms:title': u.displayName,
    'schema:givenName': u.firstName || '',
    'schema:familyName': u.lastName || '',
    'schema:alternateName': u.nickname || u.gameProfile?.gamerTag || '',
    'schema:email': u.email || '',
    'schema:jobTitle': u.title || u.relationshipRole || '',
    'dcterms:description': u.bio || u.robosPersonalitySummary || '',
    'robos:gamerTag': u.gameProfile?.gamerTag || '',
    'robos:groups': u.groups || [],
  }));

  const groupNodes = groups.map((g) => ({
    '@id': `urn:robos:group:${g.id}`,
    '@type': ['schema:Organization', 'robos:Group', 'oslc:Resource'],
    'dcterms:identifier': g.id,
    'dcterms:title': g.name,
    'dcterms:description': g.description || '',
    'robos:memberCount': g.members.length,
    'schema:member': g.members.map((uid) => ({ '@id': `urn:robos:person:${uid}` })),
    'robos:contexts': g.contexts || [],
    'robos:workspaces': g.workspaces || [],
  }));

  return {
    '@context': {
      dcterms: 'http://purl.org/dc/terms/',
      oslc: 'http://open-services.net/ns/core#',
      robos: 'https://robos.dev/ns/sdlc#',
      schema: 'https://schema.org/',
    },
    '@id': 'urn:robos:package:users-groups',
    '@type': ['oslc:ServiceProvider', 'robos:Package'],
    'dcterms:title': 'RobOS Users & Groups Knowledge Graph',
    'dcterms:description': 'Canonical RobOS User profiles, household/family/team groups, and group memberships.',
    '@graph': [...personNodes, ...groupNodes],
  };
}

function syncUsersGroupsKGraph(opts = {}) {
  const configDir = getConfigDir(opts);
  const kgraphDir = path.join(configDir, 'kgraph');
  fs.mkdirSync(kgraphDir, { recursive: true });
  const payload = buildUsersGroupsKGraph(opts);
  const kgraphFile = path.join(kgraphDir, 'users-groups.jsonld');
  writeJsonAtomic(kgraphFile, payload);

  // Also synchronize into ~/.config/robos/ekgraph/nodes.json when used
  const ekgraphDir = path.join(configDir, 'ekgraph');
  const ekNodesPath = path.join(ekgraphDir, 'nodes.json');
  try {
    fs.mkdirSync(ekgraphDir, { recursive: true });
    const existing = readJsonSafe(ekNodesPath, []);
    const nodes = Array.isArray(existing) ? existing : [];
    const users = listUsers({ ...opts, includePhotoDataUrl: false });
    const groups = listGroups({ ...opts, includeDerived: true });
    const nowIso = new Date().toISOString();

    const filtered = nodes.filter(
      (n) => n && !String(n.path || '').startsWith('people/') && !String(n.path || '').startsWith('groups/')
    );

    for (const u of users) {
      filtered.push({
        path: `people/${u.uid}`,
        title: u.displayName,
        type: 'person',
        role: u.relationshipRole || u.title || '',
        email: u.email || '',
        description: u.bio || u.robosPersonalitySummary || '',
        content: [u.bio, u.robosPersonalitySummary, (u.interests?.hobbies || []).join(', ')].filter(Boolean).join(' — '),
        tags: ['robos-user', ...(u.groups || []).map(slugify)].filter(Boolean),
        links: (u.groups || []).map((g) => `groups/${slugify(g)}`),
        updatedAt: nowIso,
      });
    }

    for (const g of groups) {
      filtered.push({
        path: `groups/${g.id}`,
        title: g.name,
        type: 'group',
        description: g.description || '',
        content: g.description || `RobOS Group ${g.name}`,
        members: g.memberProfiles.map((m) => `${m.displayName} <${m.email || m.uid}>`),
        tags: ['robos-group', g.id],
        links: g.members.map((uid) => `people/${uid}`),
        updatedAt: nowIso,
      });
    }

    writeJsonAtomic(ekNodesPath, filtered);
  } catch {}

  return { ok: true, kgraphFile, nodeCount: payload['@graph'].length };
}

function afterMutation(opts = {}) {
  try { rebuildSearchIndexes(opts); } catch {}
  try { syncUsersGroupsKGraph(opts); } catch {}
  try { syncLocalRobosServicesData(opts); } catch {}
}

// ── Users CRUD & Lookup ──────────────────────────────────────────────────────

function summarizeUser(u) {
  return {
    uid: u.uid,
    displayName: u.displayName || u.name || u.uid,
    firstName: u.firstName || '',
    lastName: u.lastName || '',
    nickname: u.nickname || '',
    username: u.username || '',
    email: u.email || '',
    phone: u.phone || '',
    pronouns: u.pronouns || '',
    age: u.age ?? null,
    ageRange: u.ageRange || '',
    birthday: u.birthday || '',
    title: u.title || '',
    relationshipRole: u.relationshipRole || '',
    avatar: u.avatar || u.gameProfile?.avatar || '👤',
    color: u.color || u.gameProfile?.color || '#00bcd4',
    gamerTag: u.gameProfile?.gamerTag || '',
    groups: Array.isArray(u.groups) ? u.groups : [],
    photo: u.photo || '',
  };
}

function listUsers(opts = {}) {
  const configDir = getConfigDir(opts);
  const seedDefaults = opts.seedDefaults !== undefined ? Boolean(opts.seedDefaults) : true;
  const includePhotoDataUrl = Boolean(opts.includePhotoDataUrl);
  let all = peopleStore.loadAllPeople({ configDir, seedDefaults, includePhotoDataUrl });

  if (opts.group) {
    const grp = resolveGroup(opts.group, { ...opts, seedDefaults });
    if (grp) {
      const uidSet = new Set(grp.members);
      all = all.filter((u) => uidSet.has(u.uid));
    } else {
      const q = fold(opts.group);
      all = all.filter((u) => (u.groups || []).some((g) => fold(g) === q || slugify(g) === slugify(opts.group)));
    }
  }

  if (opts.query) {
    const q = fold(opts.query);
    all = all.filter((u) => {
      const hay = fold([
        u.uid, u.displayName, u.firstName, u.lastName, u.nickname,
        u.username, u.email, u.title, u.relationshipRole, u.gameProfile?.gamerTag,
        ...(u.groups || []),
      ].join(' '));
      return hay.includes(q);
    });
  }

  return all.sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));
}

function cleanPersonQuery(raw) {
  return String(raw || '')
    .trim()
    .replace(/^@/, '')
    .replace(/^(?:user|person|member|profile|robos\s+user)\s+/i, '')
    .replace(/(?:'s|’s)$/i, '')
    .replace(/[.!?,;:]+$/g, '')
    .trim();
}

function resolveUser(query, opts = {}) {
  const cleaned = cleanPersonQuery(query);
  if (!cleaned) return null;
  const q = fold(cleaned);
  const qSlug = slugify(cleaned);
  if (!q) return null;

  const all = listUsers({ ...opts, includePhotoDataUrl: Boolean(opts.includePhotoDataUrl) });

  // 1. Exact matches on primary identifiers
  const exactChecks = [
    (u) => fold(u.uid) === q || slugify(u.uid) === qSlug,
    (u) => u.email && fold(u.email) === q,
    (u) => u.username && fold(u.username) === q,
    (u) => u.nickname && fold(u.nickname) === q,
    (u) => u.firstName && fold(u.firstName) === q,
    (u) => u.displayName && fold(u.displayName) === q,
    (u) => u.gameProfile?.gamerTag && fold(u.gameProfile.gamerTag) === q,
    (u) => fold(`${u.firstName} ${u.lastName}`) === q,
  ];
  for (const fn of exactChecks) {
    const hit = all.find(fn);
    if (hit) return hit;
  }

  // 2. Common short-name / first-token / quoted-nickname match
  for (const u of all) {
    const dispFold = fold(u.displayName);
    const nickFold = fold(u.nickname);
    const firstFold = fold(u.firstName);
    if (firstFold && firstFold.startsWith(q) && q.length >= 3) return u;
    if (nickFold && nickFold.startsWith(q) && q.length >= 3) return u;
    if (dispFold.split(' ').includes(q) && q.length >= 3) return u;
  }

  // 3. Substring match on displayName
  const sub = all.find((u) => fold(u.displayName).includes(q) && q.length >= 3);
  return sub || null;
}

function getActiveUser(opts = {}) {
  const configDir = getConfigDir(opts);
  const settings = readJsonSafe(path.join(configDir, 'settings.json'), {}) || {};
  const voiceCtx = readJsonSafe(path.join(configDir, 'active-voice-context.json'), {}) || {};
  const all = listUsers({ ...opts, includePhotoDataUrl: false });
  const preferredUid = settings.myProfileUid || voiceCtx.robosUser?.uid || 'nicholas-dipiazza';
  const user = resolveUser(preferredUid, opts) || all[0] || null;
  return {
    ok: Boolean(user),
    activeUserUid: user?.uid || null,
    user: user ? summarizeUser(user) : null,
    profile: user || null,
    spoken: user
      ? `The active RobOS user is ${user.displayName}${user.nickname ? ` (${user.nickname})` : ''}${user.email ? `, ${user.email}` : ''}.`
      : 'No active RobOS user is configured.',
  };
}

function setActiveUser(queryOrUid, opts = {}) {
  const configDir = getConfigDir(opts);
  const user = resolveUser(queryOrUid, opts);
  if (!user) {
    return {
      ok: false,
      error: `Could not find a RobOS user matching "${queryOrUid}".`,
      spoken: `I could not find a RobOS user matching ${queryOrUid}.`,
    };
  }
  const settingsPath = path.join(configDir, 'settings.json');
  const settings = readJsonSafe(settingsPath, {}) || {};
  settings.myProfileUid = user.uid;
  writeJsonAtomic(settingsPath, settings);

  const voiceCtxPath = path.join(configDir, 'active-voice-context.json');
  const voiceCtx = readJsonSafe(voiceCtxPath, {}) || {};
  voiceCtx.robosUser = {
    uid: user.uid,
    name: user.displayName,
    nickname: user.nickname || user.firstName || user.displayName,
    email: user.email || '',
    updatedAt: new Date().toISOString(),
  };
  writeJsonAtomic(voiceCtxPath, voiceCtx);

  afterMutation(opts);
  const spoken = `Switched the active RobOS user to ${user.displayName}.`;
  return {
    ok: true,
    activeUserUid: user.uid,
    user: summarizeUser(user),
    spoken,
  };
}

function createUser(input = {}, opts = {}) {
  const configDir = getConfigDir(opts);
  const rawName = String(input.displayName || input.name || '').trim();
  const firstName = String(input.firstName || rawName.split(/\s+/)[0] || '').trim();
  const lastName = String(input.lastName || rawName.split(/\s+/).slice(1).join(' ') || '').trim();
  const displayName = rawName || `${firstName} ${lastName}`.trim();
  if (!displayName) {
    return { ok: false, error: 'User name is required.', spoken: 'Please provide a name for the new RobOS user.' };
  }

  const uid = slugify(input.uid || displayName);
  if (!uid) {
    return { ok: false, error: 'Valid user id/name is required.', spoken: 'Could not derive a valid user ID.' };
  }

  const existing = peopleStore.getPerson(uid, { configDir, includePhotoDataUrl: false });
  if (existing && !input.overwrite) {
    return {
      ok: false,
      error: `RobOS user "${existing.displayName}" (${uid}) already exists.`,
      spoken: `${existing.displayName} already exists in RobOS Users.`,
    };
  }

  const groupNames = Array.isArray(input.groups)
    ? input.groups.map((g) => String(g).trim()).filter(Boolean)
    : typeof input.groups === 'string'
      ? input.groups.split(/[,;]+/).map((g) => g.trim()).filter(Boolean)
      : [];

  const personPayload = {
    ...(existing || {}),
    uid,
    displayName,
    firstName,
    lastName,
    nickname: input.nickname !== undefined ? String(input.nickname).trim() : (existing?.nickname || firstName),
    username: input.username !== undefined ? String(input.username).trim() : (existing?.username || uid.replace(/-/g, '')),
    email: input.email !== undefined ? String(input.email).trim() : (existing?.email || ''),
    phone: input.phone !== undefined ? String(input.phone).trim() : (existing?.phone || ''),
    pronouns: input.pronouns !== undefined ? String(input.pronouns).trim() : (existing?.pronouns || ''),
    birthday: input.birthday !== undefined ? String(input.birthday).trim() : (existing?.birthday || ''),
    age: input.age !== undefined ? input.age : existing?.age,
    location: input.location !== undefined ? String(input.location).trim() : (existing?.location || ''),
    title: input.title || input.role || existing?.title || '',
    relationshipRole: input.relationshipRole || input.role || existing?.relationshipRole || '',
    department: input.department || existing?.department || '',
    bio: input.bio || existing?.bio || '',
    avatar: input.avatar || existing?.avatar || '👤',
    color: input.color || existing?.color || '#00bcd4',
    groups: groupNames.length ? groupNames : (existing?.groups || []),
    gameProfile: {
      ...(existing?.gameProfile || {}),
      ...(input.gamerTag ? { gamerTag: String(input.gamerTag).trim() } : {}),
    },
  };

  const saved = peopleStore.savePerson(personPayload, { configDir });

  // Sync group files if any specified groups correspond to existing group files
  for (const gName of saved.groups || []) {
    const grp = resolveGroup(gName, { ...opts, includeDerived: false });
    if (grp) {
      const file = path.join(getGroupsDir(opts), `${grp.id}.json`);
      const rawGrp = readJsonSafe(file, grp);
      rawGrp.members = Array.from(new Set([...(rawGrp.members || []), saved.uid]));
      writeJsonAtomic(file, rawGrp);
    }
  }

  afterMutation(opts);
  const spoken = `Added RobOS user ${saved.displayName}${saved.email ? ` (${saved.email})` : ''}${saved.groups?.length ? ` in ${saved.groups.join(', ')}` : ''}.`;
  return {
    ok: true,
    user: summarizeUser(saved),
    profile: saved,
    spoken,
  };
}

function updateUser(queryOrUid, patch = {}, opts = {}) {
  const configDir = getConfigDir(opts);
  const existing = resolveUser(queryOrUid, { ...opts, includePhotoDataUrl: false });
  if (!existing) {
    return {
      ok: false,
      error: `RobOS user "${queryOrUid}" not found.`,
      spoken: `I could not find a RobOS user matching ${queryOrUid}.`,
    };
  }

  const next = { ...existing };
  for (const key of [
    'displayName', 'firstName', 'lastName', 'nickname', 'username', 'email', 'phone',
    'pronouns', 'birthday', 'age', 'ageRange', 'location', 'title', 'relationshipRole',
    'department', 'bio', 'robosPersonalitySummary', 'avatar', 'color',
  ]) {
    if (patch[key] !== undefined) next[key] = patch[key];
  }
  if (patch.role !== undefined && patch.title === undefined) {
    next.title = patch.role;
    if (!next.relationshipRole) next.relationshipRole = patch.role;
  }
  if (patch.gamerTag !== undefined) {
    next.gameProfile = { ...(next.gameProfile || {}), gamerTag: String(patch.gamerTag).trim() };
  }
  if (patch.addHobby) {
    const hobbies = Array.isArray(next.interests?.hobbies) ? [...next.interests.hobbies] : [];
    const h = String(patch.addHobby).trim();
    if (h && !hobbies.some((x) => fold(x) === fold(h))) hobbies.push(h);
    next.interests = { ...(next.interests || {}), hobbies };
  }
  if (patch.groups !== undefined) {
    next.groups = Array.isArray(patch.groups)
      ? patch.groups
      : String(patch.groups).split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  }

  const saved = peopleStore.savePerson(next, { configDir });
  afterMutation(opts);

  const spoken = `Updated RobOS user ${saved.displayName}.`;
  return {
    ok: true,
    user: summarizeUser(saved),
    profile: saved,
    spoken,
  };
}

function deleteUser(queryOrUid, opts = {}) {
  const configDir = getConfigDir(opts);
  const existing = resolveUser(queryOrUid, { ...opts, includePhotoDataUrl: false });
  if (!existing) {
    return {
      ok: false,
      error: `RobOS user "${queryOrUid}" not found.`,
      spoken: `I could not find a RobOS user matching ${queryOrUid}.`,
    };
  }

  const fp = path.join(peopleStore.getPeopleDir(configDir), `${existing.uid}.json`);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);

  // Clean uid from any group files
  const groupsDir = getGroupsDir(opts);
  if (fs.existsSync(groupsDir)) {
    for (const f of fs.readdirSync(groupsDir).filter((x) => x.endsWith('.json'))) {
      const gPath = path.join(groupsDir, f);
      const g = readJsonSafe(gPath, null);
      if (g && Array.isArray(g.members) && g.members.includes(existing.uid)) {
        g.members = g.members.filter((m) => m !== existing.uid);
        writeJsonAtomic(gPath, g);
      }
    }
  }

  afterMutation(opts);
  const spoken = `Removed RobOS user ${existing.displayName}.`;
  return {
    ok: true,
    deletedUid: existing.uid,
    displayName: existing.displayName,
    spoken,
  };
}

// ── Natural-Language User Fact Q&A ───────────────────────────────────────────

function answerUserQuestion(queryOrUser, topic = 'summary', opts = {}) {
  const user = typeof queryOrUser === 'object' && queryOrUser?.uid
    ? queryOrUser
    : resolveUser(queryOrUser, { ...opts, includePhotoDataUrl: false });

  if (!user) {
    return {
      ok: false,
      error: `RobOS user "${queryOrUser}" not found.`,
      spoken: `I could not find a RobOS user matching ${queryOrUser}.`,
    };
  }

  const name = user.nickname || user.firstName || user.displayName;
  const fullName = user.displayName;
  const t = fold(topic || 'summary');

  if (t === 'email') {
    const spoken = user.email
      ? `${fullName}'s email address is ${user.email}.`
      : `No email address is recorded for ${fullName}.`;
    return { ok: true, topic: 'email', value: user.email || null, user: summarizeUser(user), spoken };
  }

  if (t === 'phone') {
    const spoken = user.phone
      ? `${fullName}'s phone number is ${user.phone}.`
      : `No phone number is on file for ${fullName}.`;
    return { ok: true, topic: 'phone', value: user.phone || null, user: summarizeUser(user), spoken };
  }

  if (t === 'birthday') {
    const spoken = user.birthday
      ? `${fullName}'s birthday is ${user.birthday}.`
      : `No birthday date is recorded yet for ${fullName}.`;
    return { ok: true, topic: 'birthday', value: user.birthday || null, user: summarizeUser(user), spoken };
  }

  if (t === 'age') {
    const val = user.age || user.ageRange || null;
    const spoken = user.age
      ? `${fullName} is ${user.age} years old.`
      : user.ageRange
        ? `${fullName} is in their ${user.ageRange}.`
        : `No age is recorded yet for ${fullName}.`;
    return { ok: true, topic: 'age', value: val, user: summarizeUser(user), spoken };
  }

  if (t === 'role' || t === 'job' || t === 'title') {
    const roleText = [user.title, user.relationshipRole].filter(Boolean).join(' — ');
    const spoken = roleText
      ? `${fullName}: ${roleText}.`
      : `No role or job title is recorded for ${fullName}.`;
    return { ok: true, topic: 'role', value: roleText || null, user: summarizeUser(user), spoken };
  }

  if (t === 'gamertag' || t === 'gamer tag') {
    const gt = user.gameProfile?.gamerTag || '';
    const spoken = gt
      ? `${name}'s gamer tag is ${gt}.`
      : `${fullName} does not have a gamer tag set.`;
    return { ok: true, topic: 'gamerTag', value: gt || null, user: summarizeUser(user), spoken };
  }

  if (t === 'rpg' || t === 'bg3' || t === 'character') {
    const rpg = user.gameProfile?.rpgCharacter || {};
    const cls = [rpg.subclass, rpg.characterClass].filter(Boolean).join(' ');
    const spoken = cls
      ? `${name} plays a ${cls}${rpg.game ? ` in ${rpg.game}` : ''}${rpg.playstyle ? `. ${rpg.playstyle}` : '.'}`
      : `${fullName} does not have an RPG character configured yet.`;
    return { ok: true, topic: 'rpgCharacter', value: rpg, user: summarizeUser(user), spoken };
  }

  if (t === 'music-dislikes') {
    const dis = user.interests?.musicDislikes || [];
    const spoken = dis.length
      ? `${name} dislikes ${dis.join(', ')}.`
      : `No music dislikes are listed for ${fullName}.`;
    return { ok: true, topic: 'musicDislikes', value: dis, user: summarizeUser(user), spoken };
  }

  if (t === 'music' || t === 'bands') {
    const likes = user.interests?.musicLikes || [];
    const bands = user.interests?.favoriteBands || [];
    const dis = user.interests?.musicDislikes || [];
    const parts = [];
    if (likes.length) parts.push(`${name} likes ${likes.join(', ')}`);
    if (bands.length) parts.push(`favorite bands: ${bands.join(', ')}`);
    if (dis.length) parts.push(`dislikes ${dis.join(', ')}`);
    const spoken = parts.length ? `${parts.join('; ')}.` : `No music preferences are listed yet for ${fullName}.`;
    return { ok: true, topic: 'music', value: { likes, bands, dislikes: dis }, user: summarizeUser(user), spoken };
  }

  if (t === 'books') {
    const books = user.interests?.booksAndGenres || [];
    const spoken = books.length
      ? `${name} enjoys reading ${books.join(', ')}.`
      : `No book preferences are listed yet for ${fullName}.`;
    return { ok: true, topic: 'books', value: books, user: summarizeUser(user), spoken };
  }

  if (t === 'hobbies' || t === 'interests') {
    const hobbies = [...(user.interests?.hobbies || []), ...(user.interests?.expertTopics || [])];
    const unique = Array.from(new Set(hobbies));
    const spoken = unique.length
      ? `${name}'s hobbies and interests include ${unique.slice(0, 5).join('; ')}.`
      : `No specific hobbies are recorded yet for ${fullName}.`;
    return { ok: true, topic: 'hobbies', value: unique, user: summarizeUser(user), spoken };
  }

  if (t === 'pet-peeves' || t === 'pet peeves') {
    const pp = user.personality?.petPeeves || [];
    const spoken = pp.length
      ? `${name}'s pet peeves include: ${pp.slice(0, 4).join('; ')}.`
      : `No pet peeves are recorded for ${fullName}.`;
    return { ok: true, topic: 'petPeeves', value: pp, user: summarizeUser(user), spoken };
  }

  if (t === 'quirks' || t === 'traits' || t === 'personality') {
    const pers = user.personality || {};
    const bits = [];
    if (pers.archetype) bits.push(`${fullName}'s archetype is "${pers.archetype}"`);
    if (pers.traits?.length) bits.push(`traits: ${pers.traits.join(', ')}`);
    if (pers.quirks?.length) bits.push(`quirks: ${pers.quirks.slice(0, 2).join('; ')}`);
    const spoken = bits.length
      ? `${bits.join('. ')}.`
      : (user.robosPersonalitySummary || user.bio || `No personality notes recorded for ${fullName}.`);
    return { ok: true, topic: 'personality', value: pers, user: summarizeUser(user), spoken };
  }

  if (t === 'games') {
    const games = user.gameProfile?.favoriteGames || user.interests?.gamesAndPlatforms || [];
    const spoken = games.length
      ? `${name}'s favorite games include ${games.join(', ')}.`
      : `No favorite games are listed yet for ${fullName}.`;
    return { ok: true, topic: 'games', value: games, user: summarizeUser(user), spoken };
  }

  if (t === 'family' || t === 'partner' || t === 'kids' || t === 'children') {
    const fam = user.family || {};
    const bits = [];
    if (user.relationshipRole) bits.push(user.relationshipRole);
    if (fam.partnerName) bits.push(`partner: ${fam.partnerName}`);
    if (fam.children?.length) bits.push(`children: ${fam.children.join(', ')}`);
    const spoken = bits.length
      ? `${fullName} — ${bits.join('; ')}.`
      : `${fullName} is in groups: ${(user.groups || []).join(', ') || 'none'}.`;
    return { ok: true, topic: 'family', value: fam, user: summarizeUser(user), spoken };
  }

  if (t === 'groups') {
    const userGroups = listGroups({ ...opts, includeDerived: true }).filter((g) => g.members.includes(user.uid));
    const names = userGroups.map((g) => g.name);
    const spoken = names.length
      ? `${fullName} belongs to ${names.length} RobOS group${names.length === 1 ? '' : 's'}: ${names.join(', ')}.`
      : `${fullName} is not currently assigned to any RobOS groups.`;
    return { ok: true, topic: 'groups', value: names, user: summarizeUser(user), spoken };
  }

  // Default rich summary
  const summaryBits = [];
  const roleLine = user.relationshipRole || user.title;
  if (roleLine) summaryBits.push(`${fullName} is ${roleLine}`);
  else summaryBits.push(fullName);
  if (user.bio) summaryBits.push(user.bio);
  else if (user.robosPersonalitySummary) summaryBits.push(user.robosPersonalitySummary);
  if (user.groups?.length) summaryBits.push(`Groups: ${user.groups.join(', ')}.`);
  const spoken = summaryBits.join('. ').replace(/\.\.+/g, '.');
  return {
    ok: true,
    topic: 'summary',
    user: summarizeUser(user),
    profile: user,
    spoken,
  };
}

function listBirthdays(opts = {}) {
  const users = listUsers({ ...opts, includePhotoDataUrl: false });
  const withBday = users
    .filter((u) => u.birthday || u.age)
    .map((u) => ({
      uid: u.uid,
      displayName: u.displayName,
      nickname: u.nickname || u.firstName,
      birthday: u.birthday || '',
      age: u.age ?? null,
    }));
  const spoken = withBday.length
    ? `Recorded birthdays and ages: ${withBday.map((b) => `${b.displayName} (${[b.birthday, b.age ? `age ${b.age}` : ''].filter(Boolean).join(', ')})`).join('; ')}.`
    : 'No birthday dates are recorded on your RobOS user profiles yet.';
  return { ok: true, birthdays: withBday, spoken };
}

// ── Groups CRUD & Membership Sync ────────────────────────────────────────────

function groupTagMatchesGroup(tag, groupObj) {
  const tSlug = slugify(tag);
  const gSlug = slugify(groupObj.id);
  const nameSlug = slugify(groupObj.name);
  if (!tSlug) return false;
  if (tSlug === gSlug || tSlug === nameSlug) return true;
  if (gSlug === 'dipiazza-kids' && (tSlug === 'dipiazza-kids' || tSlug === 'kids' || tSlug === 'kids-calendar')) return true;
  if (gSlug === 'family' && tSlug === 'family') return true;
  if (gSlug === 'household' && tSlug === 'household') return true;
  return false;
}

function listGroups(opts = {}) {
  const configDir = getConfigDir(opts);
  const includeDerived = opts.includeDerived !== false;
  const groupsDir = getGroupsDir(opts);
  fs.mkdirSync(groupsDir, { recursive: true });

  const users = peopleStore.loadAllPeople({
    configDir,
    seedDefaults: opts.seedDefaults !== false,
    includePhotoDataUrl: false,
  });
  const usersByUid = new Map(users.map((u) => [u.uid, u]));

  const explicitFiles = fs.readdirSync(groupsDir).filter((f) => f.endsWith('.json'));
  const groupMap = new Map();

  for (const file of explicitFiles) {
    const raw = readJsonSafe(path.join(groupsDir, file), null);
    if (!raw) continue;
    const id = String(raw.id || path.basename(file, '.json')).trim();
    if (!id) continue;
    const members = Array.from(new Set((raw.members || []).filter(Boolean)));
    groupMap.set(id, {
      id,
      name: raw.name || id,
      description: raw.description || '',
      members,
      memberProfiles: members.map((uid) => (usersByUid.has(uid) ? summarizeUser(usersByUid.get(uid)) : { uid, displayName: uid, email: '' })),
      contexts: Array.isArray(raw.contexts) ? raw.contexts : [],
      settings: raw.settings && typeof raw.settings === 'object' ? raw.settings : {},
      workspaces: Array.isArray(raw.workspaces) ? raw.workspaces : [],
      backedByFile: true,
    });
  }

  const explicitGroups = Array.from(groupMap.values());

  if (includeDerived) {
    for (const u of users) {
      for (const rawTag of u.groups || []) {
        const tag = String(rawTag || '').trim();
        if (!tag) continue;
        const alreadyExplicit = explicitGroups.find((g) => groupTagMatchesGroup(tag, g));
        if (alreadyExplicit) continue;
        const derivedId = slugify(tag);
        if (!derivedId) continue;
        if (!groupMap.has(derivedId)) {
          groupMap.set(derivedId, {
            id: derivedId,
            name: tag,
            description: `RobOS "${tag}" group (derived from user profiles).`,
            members: [],
            memberProfiles: [],
            contexts: [],
            settings: {},
            workspaces: [],
            backedByFile: false,
          });
        }
        const entry = groupMap.get(derivedId);
        if (!entry.members.includes(u.uid)) {
          entry.members.push(u.uid);
          entry.memberProfiles.push(summarizeUser(u));
        }
      }
    }
  }

  return Array.from(groupMap.values()).sort((a, b) => {
    if (a.backedByFile !== b.backedByFile) return a.backedByFile ? -1 : 1;
    return (a.name || '').localeCompare(b.name || '');
  });
}

function cleanGroupQuery(raw) {
  return String(raw || '')
    .trim()
    .replace(/^(?:the\s+)?(?:robos\s+)?/i, '')
    .replace(/\s+(?:robos\s+)?groups?$/i, '')
    .replace(/[.!?,;:]+$/g, '')
    .trim();
}

function resolveGroup(query, opts = {}) {
  const cleaned = cleanGroupQuery(query);
  if (!cleaned) return null;
  const qFold = fold(cleaned);
  const qSlug = slugify(cleaned);
  if (!qFold) return null;

  const groups = listGroups({ ...opts, includeDerived: opts.includeDerived !== false });

  // 1. Exact ID or exact name
  const exact = groups.find(
    (g) =>
      slugify(g.id) === qSlug ||
      slugify(g.name) === qSlug ||
      fold(g.name) === qFold ||
      fold(g.id) === qFold
  );
  if (exact) return exact;

  // 2. Friendly aliases ("kids" -> "dipiazza-kids", "family" -> "family")
  if (qSlug === 'kids' || qSlug === 'kids-calendar' || qSlug === 'dipiazza-kids-calendar') {
    const kids = groups.find((g) => g.id === 'dipiazza-kids' || /kids/i.test(g.name));
    if (kids) return kids;
  }

  // 3. Substring match
  return groups.find((g) => fold(g.name).includes(qFold) || slugify(g.id).includes(qSlug)) || null;
}

function createGroup(input = {}, opts = {}) {
  const rawName = String(input.name || input.id || '').trim();
  if (!rawName) {
    return { ok: false, error: 'Group name is required.', spoken: 'Please provide a name for the RobOS group.' };
  }
  const id = slugify(input.id || rawName);
  if (!id) {
    return { ok: false, error: 'Invalid group ID.', spoken: 'Could not derive a valid group ID.' };
  }

  const rawMembers = Array.isArray(input.members)
    ? input.members
    : typeof input.members === 'string'
      ? input.members.split(/[,;]|\band\b/i).map((s) => s.trim()).filter(Boolean)
      : [];

  const resolvedUids = [];
  for (const m of rawMembers) {
    const u = resolveUser(m, opts);
    if (u && !resolvedUids.includes(u.uid)) {
      resolvedUids.push(u.uid);
    }
  }

  const groupDoc = {
    id,
    name: rawName,
    description: String(input.description || '').trim(),
    members: resolvedUids,
    contexts: Array.isArray(input.contexts) ? input.contexts : [],
    settings: input.settings && typeof input.settings === 'object' ? input.settings : {},
    workspaces: Array.isArray(input.workspaces) ? input.workspaces : [],
  };

  const file = path.join(getGroupsDir(opts), `${id}.json`);
  writeJsonAtomic(file, groupDoc);

  // Two-way sync onto member profiles
  const configDir = getConfigDir(opts);
  for (const uid of resolvedUids) {
    const person = peopleStore.getPerson(uid, { configDir, includePhotoDataUrl: false });
    if (person) {
      const tags = Array.isArray(person.groups) ? [...person.groups] : [];
      if (!tags.some((t) => groupTagMatchesGroup(t, groupDoc))) {
        tags.push(rawName);
        person.groups = tags;
        peopleStore.savePerson(person, { configDir });
      }
    }
  }

  afterMutation(opts);
  const full = resolveGroup(id, opts);
  const spoken = `Created RobOS group "${groupDoc.name}" with ${resolvedUids.length} member${resolvedUids.length === 1 ? '' : 's'}.`;
  return { ok: true, group: full || groupDoc, spoken };
}

function updateGroup(groupQuery, patch = {}, opts = {}) {
  const existing = resolveGroup(groupQuery, opts);
  if (!existing) {
    return { ok: false, error: `RobOS group "${groupQuery}" not found.`, spoken: `I could not find a RobOS group matching ${groupQuery}.` };
  }

  const file = path.join(getGroupsDir(opts), `${existing.id}.json`);
  const raw = readJsonSafe(file, {
    id: existing.id,
    name: existing.name,
    description: existing.description || '',
    members: existing.members || [],
    contexts: existing.contexts || [],
    settings: existing.settings || {},
    workspaces: existing.workspaces || [],
  });

  if (patch.name !== undefined) raw.name = String(patch.name).trim() || raw.name;
  if (patch.description !== undefined) raw.description = String(patch.description).trim();
  if (Array.isArray(patch.contexts)) raw.contexts = patch.contexts;
  if (patch.addContext) raw.contexts = Array.from(new Set([...(raw.contexts || []), String(patch.addContext).trim()]));
  if (Array.isArray(patch.workspaces)) raw.workspaces = patch.workspaces;
  if (patch.addWorkspace) raw.workspaces = Array.from(new Set([...(raw.workspaces || []), String(patch.addWorkspace).trim()]));
  if (patch.settings && typeof patch.settings === 'object') raw.settings = { ...(raw.settings || {}), ...patch.settings };

  writeJsonAtomic(file, raw);
  afterMutation(opts);
  const updated = resolveGroup(existing.id, opts);
  return { ok: true, group: updated, spoken: `Updated RobOS group "${raw.name}".` };
}

function deleteGroup(groupQuery, opts = {}) {
  const existing = resolveGroup(groupQuery, opts);
  if (!existing) {
    return { ok: false, error: `RobOS group "${groupQuery}" not found.`, spoken: `I could not find a RobOS group matching ${groupQuery}.` };
  }

  const file = path.join(getGroupsDir(opts), `${existing.id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);

  // Also strip group tag from users
  const configDir = getConfigDir(opts);
  const users = peopleStore.loadAllPeople({ configDir, seedDefaults: false, includePhotoDataUrl: false });
  for (const person of users) {
    if ((person.groups || []).some((t) => groupTagMatchesGroup(t, existing))) {
      person.groups = person.groups.filter((t) => !groupTagMatchesGroup(t, existing));
      peopleStore.savePerson(person, { configDir });
    }
  }

  afterMutation(opts);
  return {
    ok: true,
    deletedId: existing.id,
    name: existing.name,
    spoken: `Deleted RobOS group "${existing.name}".`,
  };
}

function addMemberToGroup(userQuery, groupQuery, opts = {}) {
  const configDir = getConfigDir(opts);
  const user = resolveUser(userQuery, { ...opts, includePhotoDataUrl: false });
  if (!user) {
    return { ok: false, error: `RobOS user "${userQuery}" not found.`, spoken: `I could not find a RobOS user matching ${userQuery}.` };
  }

  let group = resolveGroup(groupQuery, opts);
  if (!group) {
    // Auto-create the group if named explicitly
    const created = createGroup({ name: cleanGroupQuery(groupQuery), members: [user.uid] }, opts);
    if (!created.ok) return created;
    return {
      ok: true,
      added: true,
      createdGroup: true,
      user: summarizeUser(user),
      group: created.group,
      spoken: `Created RobOS group "${created.group.name}" and added ${user.displayName}.`,
    };
  }

  const file = path.join(getGroupsDir(opts), `${group.id}.json`);
  const raw = readJsonSafe(file, {
    id: group.id,
    name: group.name,
    description: group.description || '',
    members: group.members || [],
    contexts: group.contexts || [],
    settings: group.settings || {},
    workspaces: group.workspaces || [],
  });

  const already = (raw.members || []).includes(user.uid);
  if (!already) {
    raw.members = [...(raw.members || []), user.uid];
  }
  writeJsonAtomic(file, raw);

  const tagName = group.id === 'family' ? 'Family' : group.id === 'household' ? 'Household' : group.id === 'dipiazza-kids' ? 'Dipiazza Kids' : group.name;
  const tags = Array.isArray(user.groups) ? [...user.groups] : [];
  if (!tags.some((t) => groupTagMatchesGroup(t, group))) {
    tags.push(tagName);
    user.groups = tags;
    peopleStore.savePerson(user, { configDir });
  }

  afterMutation(opts);
  const refreshed = resolveGroup(group.id, opts);
  const spoken = already
    ? `${user.displayName} is already a member of ${group.name}.`
    : `Added ${user.displayName} to ${group.name}.`;
  return {
    ok: true,
    added: !already,
    user: summarizeUser(user),
    group: refreshed,
    spoken,
  };
}

function removeMemberFromGroup(userQuery, groupQuery, opts = {}) {
  const configDir = getConfigDir(opts);
  const user = resolveUser(userQuery, { ...opts, includePhotoDataUrl: false });
  if (!user) {
    return { ok: false, error: `RobOS user "${userQuery}" not found.`, spoken: `I could not find a RobOS user matching ${userQuery}.` };
  }
  const group = resolveGroup(groupQuery, opts);
  if (!group) {
    return { ok: false, error: `RobOS group "${groupQuery}" not found.`, spoken: `I could not find a RobOS group matching ${groupQuery}.` };
  }

  const file = path.join(getGroupsDir(opts), `${group.id}.json`);
  if (fs.existsSync(file)) {
    const raw = readJsonSafe(file, null);
    if (raw && Array.isArray(raw.members)) {
      raw.members = raw.members.filter((m) => m !== user.uid);
      writeJsonAtomic(file, raw);
    }
  }

  if ((user.groups || []).some((t) => groupTagMatchesGroup(t, group))) {
    user.groups = user.groups.filter((t) => !groupTagMatchesGroup(t, group));
    peopleStore.savePerson(user, { configDir });
  }

  afterMutation(opts);
  const refreshed = resolveGroup(group.id, opts);
  return {
    ok: true,
    removed: true,
    user: summarizeUser(user),
    group: refreshed,
    spoken: `Removed ${user.displayName} from ${group.name}.`,
  };
}

// ── RobOS Services & Cross-Machine SSH Sync ──────────────────────────────────

function buildServicesStatePayload(opts = {}) {
  const configDir = getConfigDir(opts);
  const rawUsers = peopleStore.loadAllPeople({
    configDir,
    seedDefaults: opts.seedDefaults !== false,
    includePhotoDataUrl: false,
  });
  const users = rawUsers.map((u) => ({
    id: u.uid,
    uid: u.uid,
    name: u.displayName || u.name || u.uid,
    updatedAt: new Date().toISOString(),
    data: u,
  }));

  const groups = listGroups({ ...opts, includeDerived: true }).map((g) => ({
    id: g.id,
    name: g.name,
    updatedAt: new Date().toISOString(),
    data: {
      id: g.id,
      name: g.name,
      description: g.description || '',
      members: g.members,
      contexts: g.contexts || [],
      settings: g.settings || {},
      workspaces: g.workspaces || [],
      backedByFile: g.backedByFile,
    },
  }));

  const active = getActiveUser(opts);
  return {
    activeUserUid: active.activeUserUid || 'nicholas-dipiazza',
    updatedAt: new Date().toISOString(),
    users,
    groups,
  };
}

function syncLocalRobosServicesData(opts = {}) {
  const servicesDir = getServicesDir(opts);
  const dataFile = path.join(servicesDir, 'data', 'users-groups.json');
  const payload = buildServicesStatePayload(opts);
  writeJsonAtomic(dataFile, payload, 0o600);
  return {
    ok: true,
    dataFile,
    userCount: payload.users.length,
    groupCount: payload.groups.length,
    activeUserUid: payload.activeUserUid,
  };
}

function httpJsonRequest({ hostname = '127.0.0.1', port = 19400, reqPath = '/health', method = 'GET', token = '', body = null, timeoutMs = 4000 }) {
  return new Promise((resolve, reject) => {
    const payload = body !== null ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
      {
        hostname,
        port,
        path: reqPath,
        method,
        timeout: timeoutMs,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': payload.length } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({ status: res.statusCode, data: JSON.parse(text || '{}') });
          } catch {
            resolve({ status: res.statusCode, data: text });
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('Request timed out')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function syncUsersAndGroupsToHost(targetOpts = {}, opts = {}) {
  const host = String(targetOpts.host || '192.168.1.25').trim();
  const user = String(targetOpts.user || os.userInfo().username).trim();
  const port = Number(targetOpts.port || 22);
  if (!/^[a-zA-Z0-9.:-]+$/.test(host) || !/^[a-z_][a-z0-9_-]*$/i.test(user)) {
    throw new Error('Invalid SSH host or username.');
  }

  // 1. Ensure local indexes, KGraph, and services payload are completely fresh
  rebuildSearchIndexes(opts);
  syncUsersGroupsKGraph(opts);
  const localServiceSync = syncLocalRobosServicesData(opts);

  const configDir = getConfigDir(opts);
  const peopleDir = peopleStore.getPeopleDir(configDir);
  const groupsDir = getGroupsDir(opts);
  const kgraphFile = path.join(configDir, 'kgraph', 'users-groups.jsonld');
  const indexDir = path.join(configDir, 'search-index');
  const servicesDataFile = localServiceSync.dataFile;

  const sshTarget = `${user}@${host}`;
  const sshOptStr = `ssh -o BatchMode=yes -o ConnectTimeout=8 -p ${port}`;

  execFileSync(
    'ssh',
    [
      '-o', 'BatchMode=yes',
      '-o', 'ConnectTimeout=8',
      '-p', String(port),
      sshTarget,
      'mkdir -p ~/.config/robos/people/photos ~/.config/robos/groups ~/.config/robos/kgraph ~/.config/robos/search-index ~/.config/robos/services/data',
    ],
    { stdio: 'pipe', timeout: 15000 }
  );

  execFileSync('rsync', ['-az', '--delete', '-e', sshOptStr, `${peopleDir}/`, `${sshTarget}:~/.config/robos/people/`], {
    stdio: 'pipe',
    timeout: 30000,
  });
  execFileSync('rsync', ['-az', '--delete', '-e', sshOptStr, `${groupsDir}/`, `${sshTarget}:~/.config/robos/groups/`], {
    stdio: 'pipe',
    timeout: 20000,
  });
  if (fs.existsSync(kgraphFile)) {
    execFileSync('rsync', ['-az', '-e', sshOptStr, kgraphFile, `${sshTarget}:~/.config/robos/kgraph/users-groups.jsonld`], {
      stdio: 'pipe',
      timeout: 15000,
    });
  }
  for (const idxFile of ['people.txt', 'groups.txt']) {
    const srcIdx = path.join(indexDir, idxFile);
    if (fs.existsSync(srcIdx)) {
      execFileSync('rsync', ['-az', '-e', sshOptStr, srcIdx, `${sshTarget}:~/.config/robos/search-index/${idxFile}`], {
        stdio: 'pipe',
        timeout: 15000,
      });
    }
  }
  execFileSync('rsync', ['-az', '-e', sshOptStr, servicesDataFile, `${sshTarget}:~/.config/robos/services/data/users-groups.json`], {
    stdio: 'pipe',
    timeout: 15000,
  });

  // Sync active user setting (`myProfileUid`) without clobbering machine-local settings on remote host
  const activeUid = localServiceSync.activeUserUid || 'nicholas-dipiazza';
  const remoteVerifyJson = execFileSync(
    'ssh',
    [
      '-o', 'BatchMode=yes',
      '-o', 'ConnectTimeout=8',
      '-p', String(port),
      sshTarget,
      `export PATH="$HOME/.local/share/robos/node/bin:$HOME/.local/bin:$PATH"
systemctl --user restart robos-services-users-groups.service 2>/dev/null || true
node -e '
const fs = require("fs"), path = require("path"), os = require("os"), http = require("http");
const cfg = path.join(os.homedir(), ".config/robos");
const sf = path.join(cfg, "settings.json");
let s = {};
try { s = JSON.parse(fs.readFileSync(sf, "utf8")); } catch {}
if (!s.myProfileUid) { s.myProfileUid = ${JSON.stringify(activeUid)}; fs.writeFileSync(sf, JSON.stringify(s, null, 2) + "\\n"); }
const tokFile = path.join(cfg, "services/access-token");
const tok = fs.existsSync(tokFile) ? fs.readFileSync(tokFile, "utf8").trim() : "";
if (!tok) { console.log(JSON.stringify({ gatewayVerified: false })); process.exit(0); }
(async () => {
  for (let i = 0; i < 15; i++) {
    const out = await new Promise((resolve) => {
      const req = http.get({ hostname: "127.0.0.1", port: 19400, path: "/users-groups", headers: { Authorization: "Bearer " + tok }, timeout: 3000 }, (res) => {
        let b = "";
        res.on("data", c => b += c);
        res.on("end", () => {
          try {
            const d = JSON.parse(b);
            resolve({ gatewayVerified: res.statusCode === 200, status: res.statusCode, serviceUsers: (d.users || []).length, serviceGroups: (d.groups || []).length });
          } catch {
            resolve({ gatewayVerified: false, status: res.statusCode });
          }
        });
      });
      req.on("error", (e) => resolve({ gatewayVerified: false, error: e.message }));
    });
    if (out.gatewayVerified) { console.log(JSON.stringify(out)); process.exit(0); }
    await new Promise(r => setTimeout(r, 200));
  }
  console.log(JSON.stringify({ gatewayVerified: false, status: 503 }));
})();
'`,
    ],
    { encoding: 'utf8', timeout: 20000 }
  ).trim();

  let remoteService = { gatewayVerified: false };
  try {
    remoteService = JSON.parse(remoteVerifyJson.split('\n').pop());
  } catch {}

  const spoken = `Synced ${localServiceSync.userCount} RobOS users and ${localServiceSync.groupCount} RobOS groups to RobOS Services on ${host}.`;
  return {
    ok: true,
    host,
    user,
    userCount: localServiceSync.userCount,
    groupCount: localServiceSync.groupCount,
    remoteService,
    spoken,
  };
}

// ── Voice & CLI Email to RobOS Users & Groups (via Thunderbird Bridge) ───────

const PENDING_VOICE_EMAIL_TTL_MS = 15 * 60 * 1000;

function getPendingVoiceEmailPath(opts = {}) {
  return path.join(getConfigDir(opts), 'pending-voice-email.json');
}

function loadPendingVoiceEmail(opts = {}) {
  const fp = getPendingVoiceEmailPath(opts);
  const doc = readJsonSafe(fp, null);
  if (!doc || typeof doc !== 'object') return null;
  if (doc.expiresAt && Date.now() > Number(doc.expiresAt)) {
    try { fs.unlinkSync(fp); } catch {}
    return null;
  }
  return doc;
}

function savePendingVoiceEmail(draft, opts = {}) {
  const fp = getPendingVoiceEmailPath(opts);
  const next = {
    ...draft,
    updatedAt: new Date().toISOString(),
    expiresAt: Date.now() + PENDING_VOICE_EMAIL_TTL_MS,
  };
  writeJsonAtomic(fp, next, 0o600);
  return next;
}

function clearPendingVoiceEmail(opts = {}) {
  const fp = getPendingVoiceEmailPath(opts);
  try {
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch {}
}

function resolveEmailRecipients(rawInput, opts = {}) {
  const items = Array.isArray(rawInput)
    ? rawInput.map((x) => String(x || '').trim()).filter(Boolean)
    : [String(rawInput || '').trim()].filter(Boolean);

  const recipients = [];
  const unresolved = [];
  const missingEmail = [];
  const seenEmails = new Set();

  const addRecipient = (rec) => {
    const em = String(rec.email || '').trim().toLowerCase();
    if (!em || seenEmails.has(em)) return;
    seenEmails.add(em);
    recipients.push(rec);
  };

  for (const rawChunk of items) {
    const chunk = rawChunk.replace(/^to\s+/i, '').trim();
    if (!chunk) continue;

    // 1. Check if the whole chunk explicitly names a RobOS Group (e.g. "the Family group", "Dipiazza Kids group", "Household")
    const hasExplicitGroupWord = /\bgroups?$/i.test(chunk);
    const wholeUser = !hasExplicitGroupWord ? resolveUser(chunk, opts) : null;
    const wholeGroup = !wholeUser ? resolveGroup(chunk, opts) : null;

    if (wholeGroup) {
      const withMail = wholeGroup.memberProfiles.filter((m) => m.email);
      if (withMail.length === 0) {
        missingEmail.push(`${wholeGroup.name} group`);
      } else {
        for (const m of withMail) {
          addRecipient({
            uid: m.uid,
            name: m.displayName,
            email: m.email,
            sourceGroup: wholeGroup.name,
          });
        }
      }
      continue;
    }

    // 2. Otherwise split multiple recipients on commas, semicolons, or "and"
    const parts = chunk
      .split(/\s*(?:,|;|\band\b)\s*/i)
      .map((s) => s.replace(/^to\s+/i, '').trim())
      .filter(Boolean);

    for (const part of parts) {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(part)) {
        const matchedByEmail = resolveUser(part, opts);
        addRecipient({
          uid: matchedByEmail?.uid || '',
          name: matchedByEmail?.displayName || part,
          email: part,
        });
        continue;
      }

      const partHasGroup = /\bgroups?$/i.test(part);
      const u = !partHasGroup ? resolveUser(part, opts) : null;
      if (u) {
        if (!u.email) {
          missingEmail.push(u.displayName);
        } else {
          addRecipient({
            uid: u.uid,
            name: u.displayName,
            email: u.email,
          });
        }
        continue;
      }

      const g = resolveGroup(part, opts);
      if (g) {
        const withMail = g.memberProfiles.filter((m) => m.email);
        if (withMail.length === 0) missingEmail.push(`${g.name} group`);
        for (const m of withMail) {
          addRecipient({
            uid: m.uid,
            name: m.displayName,
            email: m.email,
            sourceGroup: g.name,
          });
        }
        continue;
      }

      unresolved.push(part);
    }
  }

  return {
    ok: recipients.length > 0 && unresolved.length === 0 && missingEmail.length === 0,
    recipients,
    emails: recipients.map((r) => r.email),
    unresolved,
    missingEmail,
  };
}

function synthesizeSubjectFromBody(bodyText, senderName = '') {
  const clean = String(bodyText || '').replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
  if (!clean) return senderName ? `Message from ${senderName}` : 'Message from RobOS';
  const words = clean.split(' ');
  const clipped = words.slice(0, 7).join(' ');
  const titled = clipped.charAt(0).toUpperCase() + clipped.slice(1);
  return words.length > 7 ? `${titled}...` : titled;
}

function formatSentenceBody(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  const cap = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(cap) ? cap : `${cap}.`;
}

function parseVoiceEmailCommand(rawText, opts = {}) {
  const cleaned = stripCommandFiller(rawText);
  if (!cleaned) return null;

  const pending = loadPendingVoiceEmail(opts);

  // 1. Explicit or contextual pending-email follow-ups
  if (/^(?:confirm\s+(?:the\s+|pending\s+)?email|send\s+(?:the\s+|pending\s+)email|yes[,]?\s+send\s+(?:the\s+)?email)[.!?]*$/i.test(cleaned)) {
    return { intent: 'confirm-email' };
  }
  if (pending && /^(?:send\s+it|yes[,]?\s+send\s+it|confirm(?:\s+and\s+send)?|go\s+ahead\s+and\s+send(?:\s+it)?)[.!?]*$/i.test(cleaned)) {
    return { intent: 'confirm-email' };
  }
  if (/^(?:queue\s+(?:the\s+|pending\s+)?email|save\s+(?:the\s+|pending\s+)?email\s+to\s+outbox)[.!?]*$/i.test(cleaned) || (pending && /^(?:queue\s+it|save\s+to\s+outbox)[.!?]*$/i.test(cleaned))) {
    return { intent: 'queue-email' };
  }
  if (/^(?:cancel|discard|clear|abort)\s+(?:the\s+|pending\s+)?email[.!?]*$/i.test(cleaned) || (pending && /^(?:cancel\s+it|discard\s+it|never\s*mind)[.!?]*$/i.test(cleaned))) {
    return { intent: 'cancel-email' };
  }
  if (/^(?:read|show|check|what\s+is)\s+(?:the\s+|my\s+)?(?:pending|queued|staged)\s+email[.!?]*$/i.test(cleaned) || /^what\s+email\s+is\s+(?:pending|queued|staged)[.!?]*$/i.test(cleaned)) {
    return { intent: 'read-pending-email' };
  }
  if (pending && !pending.body) {
    const fillSubBody = cleaned.match(/^(?:with\s+)?subject\s+(.+?)\s+(?:and\s+)?(?:saying|body|message|that)\s*[:,-]?\s*(.+)$/i);
    if (fillSubBody) {
      return { intent: 'complete-pending-email', subject: fillSubBody[1].trim(), body: fillSubBody[2].trim() };
    }
    const fillBodyOnly = cleaned.match(/^(?:message|body|saying)\s*[:,-]?\s*(.+)$/i);
    if (fillBodyOnly) {
      return { intent: 'complete-pending-email', subject: '', body: fillBodyOnly[1].trim() };
    }
  }

  // 2. Compose / Send / Draft Email to RobOS User(s) or Group(s)
  // Guard against "what is Diana's email" / "emails for Family group" / "set Leo's email to ..."
  if (/^(?:what|which|list|show|get|set|update|change)\b/i.test(cleaned)) return null;

  const composeMatch = cleaned.match(
    /^(?:(draft|queue)\s+(?:an?\s+)?(?:email|mail(?:\s+message)?)|(?:send|write|compose)\s+(?:an?\s+)?(?:email|mail(?:\s+message)?)|email)\s+(?:to\s+)?(.+)$/i
  );
  if (!composeMatch) return null;

  const isDraft = Boolean(composeMatch[1]);
  let rest = composeMatch[2].trim();

  // Check trailing explicit immediate-send modifier ("... and send it now" / "... send immediately")
  let sendNow = false;
  const sendNowTrail = rest.match(/\s+(?:and\s+)?(?:send\s+(?:it\s+)?now|send\s+immediately|without\s+confirmation)[.!?]*$/i);
  if (sendNowTrail) {
    sendNow = true;
    rest = rest.slice(0, rest.length - sendNowTrail[0].length).trim();
  }

  let recipientsRaw = '';
  let ccRaw = '';
  let subject = '';
  let body = '';

  // Pattern A: "<recipients> [with] subject <S> [and] (body|message|saying|telling them|that) <B>"
  const patSubAndBody = rest.match(
    /^(.+?)\s+(?:with\s+)?subject\s*[:,-]?\s*(.+?)\s+(?:and\s+)?(?:with\s+)?(?:body|message|saying|telling\s+(?:him|her|them)|that)\s*[:,-]?\s*(.+)$/i
  );
  // Pattern B: "<recipients> about <S>: <B>" or "<recipients> about <S> saying <B>"
  const patAboutBody = !patSubAndBody && rest.match(
    /^(.+?)\s+about\s+(.+?)(?:\s*:\s*|\s+(?:saying|telling\s+(?:him|her|them)|with\s+(?:body|message)|message)\s*[:,-]?\s*)(.+)$/i
  );
  // Pattern C: "<recipients> (saying|telling him/her/them|with message|with body|message:|body:|that) <B>"
  const patBodyOnly = !patSubAndBody && !patAboutBody && rest.match(
    /^(.+?)\s+(?:saying|telling\s+(?:him|her|them)|with\s+(?:message|body)|message\s*:|body\s*:|that)\s*[:,-]?\s*(.+)$/i
  );
  // Pattern D: "<recipients> [with] subject <S>" (subject only, no body yet)
  const patSubOnly = !patSubAndBody && !patAboutBody && !patBodyOnly && rest.match(
    /^(.+?)\s+(?:with\s+)?subject\s*[:,-]?\s*(.+)$/i
  );

  if (patSubAndBody) {
    recipientsRaw = patSubAndBody[1].trim();
    subject = patSubAndBody[2].trim().replace(/^["']|["']$/g, '');
    body = patSubAndBody[3].trim();
  } else if (patAboutBody) {
    recipientsRaw = patAboutBody[1].trim();
    subject = patAboutBody[2].trim().replace(/^["']|["']$/g, '');
    body = patAboutBody[3].trim();
  } else if (patBodyOnly) {
    recipientsRaw = patBodyOnly[1].trim();
    body = patBodyOnly[2].trim();
  } else if (patSubOnly) {
    recipientsRaw = patSubOnly[1].trim();
    subject = patSubOnly[2].trim().replace(/^["']|["']$/g, '');
  } else {
    recipientsRaw = rest.replace(/[.!?]+$/, '').trim();
  }

  // Extract optional "cc <who>" from recipientsRaw (e.g. "Diana cc Nick")
  const ccSplit = recipientsRaw.match(/^(.+?)\s+cc\s+(.+)$/i);
  if (ccSplit) {
    recipientsRaw = ccSplit[1].trim();
    ccRaw = ccSplit[2].trim();
  }

  return {
    intent: 'compose-email',
    recipientsRaw,
    ccRaw,
    subject,
    body,
    sendLater: isDraft,
    sendNow,
  };
}

async function dispatchVoiceEmail(draft, opts = {}) {
  const sendMailFn = opts.sendMailFn || (async (msg, mailOpts) => {
    const tbMail = require('./thunderbird-mail');
    const st = await tbMail.getStatus(mailOpts);
    if (st.thunderbirdInstalled && !st.bridgeInstalled) {
      tbMail.installBridge(mailOpts);
    }
    return tbMail.sendEmail(msg, mailOpts);
  });

  const toEmails = draft.recipients.map((r) => r.email);
  const ccEmails = (draft.ccRecipients || []).map((r) => r.email);
  const recipientNames = draft.recipients.map((r) => `${r.name} (${r.email})`).join(', ');

  try {
    const result = await sendMailFn(
      {
        to: toEmails,
        cc: ccEmails,
        from: draft.from || undefined,
        subject: draft.subject,
        text: draft.body,
        attachments: draft.attachments || [],
        sendLater: Boolean(draft.sendLater),
      },
      { homeDir: getHomeDir(opts), configDir: getConfigDir(opts) }
    );
    clearPendingVoiceEmail(opts);
    const modeLabel = (result?.mode === 'sendLater' || draft.sendLater) ? 'Queued' : 'Sent';
    const whereLabel = modeLabel === 'Queued' ? ' in Thunderbird Outbox' : '';
    const spoken = `${modeLabel} email to ${recipientNames}${whereLabel} with subject "${draft.subject}".`;
    return {
      ok: true,
      sent: modeLabel === 'Sent',
      queued: modeLabel === 'Queued',
      mode: result?.mode || (draft.sendLater ? 'sendLater' : 'sendNow'),
      headerMessageId: result?.headerMessageId || null,
      from: result?.from || draft.from || null,
      draft,
      spoken,
    };
  } catch (err) {
    // Preserve draft so the user can retry with "send it" once Thunderbird / Bridge is ready
    savePendingVoiceEmail(draft, opts);
    const errText = String(err?.message || err);
    const friendly = /not running with the RobOS Bridge|BRIDGE_UNAVAILABLE/i.test(errText)
      ? `Thunderbird Bridge is not active yet. Open Thunderbird, ensure Google sign-in and the RobOS Thunderbird Bridge add-on are enabled, then say "send it". Your draft to ${recipientNames} is saved.`
      : `Could not send email via Thunderbird: ${errText}. Your draft to ${recipientNames} is still saved — say "send it" to retry or "cancel email" to discard.`;
    return {
      ok: false,
      staged: true,
      error: errText,
      draft,
      spoken: friendly,
    };
  }
}

async function sendOrStageEmailToUsers(input = {}, opts = {}) {
  const resolvedTo = resolveEmailRecipients(input.to || input.recipients || '', opts);
  if (resolvedTo.unresolved.length > 0) {
    const msg = `Could not find RobOS user or group matching: ${resolvedTo.unresolved.join(', ')}.`;
    return { ok: false, error: msg, spoken: msg, unresolved: resolvedTo.unresolved };
  }
  if (resolvedTo.missingEmail.length > 0 && resolvedTo.recipients.length === 0) {
    const msg = `${resolvedTo.missingEmail.join(', ')} does not have an email address configured in RobOS Users.`;
    return { ok: false, error: msg, spoken: msg, missingEmail: resolvedTo.missingEmail };
  }
  if (resolvedTo.recipients.length === 0) {
    const msg = 'Please specify at least one RobOS user or group to email.';
    return { ok: false, error: msg, spoken: msg };
  }

  let ccRecipients = [];
  if (input.cc) {
    const resolvedCc = resolveEmailRecipients(input.cc, opts);
    if (resolvedCc.unresolved.length > 0) {
      const msg = `Could not find CC user or group matching: ${resolvedCc.unresolved.join(', ')}.`;
      return { ok: false, error: msg, spoken: msg };
    }
    ccRecipients = resolvedCc.recipients;
  }

  const active = getActiveUser(opts);
  const senderName = active.user?.nickname || active.user?.firstName || active.user?.displayName || 'RobOS';
  const body = formatSentenceBody(input.body || input.text || '');
  const subject = String(input.subject || '').trim() || (body ? synthesizeSubjectFromBody(body, senderName) : '');
  const recipientSummary = resolvedTo.recipients.map((r) => `${r.name} (${r.email})`).join(', ');

  const draft = {
    recipients: resolvedTo.recipients,
    ccRecipients,
    from: input.from || '',
    subject,
    body,
    attachments: Array.isArray(input.attachments) ? input.attachments : [],
    sendLater: Boolean(input.sendLater),
    createdBy: active.activeUserUid || '',
  };

  // If neither body nor subject was spoken yet ("send an email to Diana"), stage recipient and ask for message
  if (!body && !subject) {
    const saved = savePendingVoiceEmail(draft, opts);
    const spoken = `Ready to email ${recipientSummary}. Say "message" followed by what you want to say, or "cancel email".`;
    return { ok: true, staged: true, needsMessage: true, draft: saved, spoken };
  }

  const finalDraft = {
    ...draft,
    subject: subject || synthesizeSubjectFromBody(body, senderName),
    body: body || subject,
  };

  // Immediate dispatch when explicitly requested (`sendNow: true` or `sendLater: true` draft-to-Outbox)
  if (input.sendNow || input.sendLater) {
    return dispatchVoiceEmail(finalDraft, opts);
  }

  // Safe two-step voice confirmation by default (matches outward-email rule)
  const saved = savePendingVoiceEmail(finalDraft, opts);
  const ccNote = ccRecipients.length ? `, CC ${ccRecipients.map((r) => r.name).join(', ')}` : '';
  const spoken = `Ready to send email to ${recipientSummary}${ccNote} with subject "${finalDraft.subject}" and message: "${finalDraft.body}" Say "send it" or "confirm email" to send, or "cancel email" to discard.`;
  return {
    ok: true,
    staged: true,
    requiresConfirmation: true,
    draft: saved,
    spoken,
  };
}

// ── Voice & Natural-Language Command Router ──────────────────────────────────

const NON_USER_GROUP_APP_OPEN_RE = /^(?:open|launch|start|switch\s+to|focus)\s+(?:the\s+)?(?:robos\s+)?(?:users?|people(?:\s+directory|\s+manager)?|user\s+profiles?|groups?|group\s+manager)(?:\s+app|\s+window)?[.!?]*$/i;

function stripCommandFiller(rawText) {
  return String(rawText || '')
    .trim()
    .replace(/^\/(?:robos-users|robos-groups)\s*/i, '')
    .replace(/^(?:(?:hello|hey|hi|okay|ok|yo)\s+)?(?:commander|nabu|na\s+bu|naboo|robos|row\s+bose|computer|assistant)\b[,.:;!\-\s]*/i, '')
    .replace(/^(?:can\s+you\s+|could\s+you\s+|would\s+you\s+)?(?:please\s+)?/i, '')
    .trim();
}

function isUsersOrGroupsVoiceCommand(rawText, opts = {}) {
  const raw = String(rawText || '').trim();
  if (!raw) return false;
  if (/^\/(?:robos-users|robos-groups)\b/i.test(raw)) return true;
  if (NON_USER_GROUP_APP_OPEN_RE.test(raw)) return false;

  const cleaned = stripCommandFiller(raw);
  if (!cleaned || NON_USER_GROUP_APP_OPEN_RE.test(cleaned)) return false;

  // Never steal calendar, shopping list, or watchlist commands
  if (/\b(?:calendar|calendars|appointment|appointments|watch\s*list|watchlist|grocery|groceries|costco|target\s+list|shopping\s+list)\b/i.test(cleaned)) {
    return false;
  }
  if (/^(?:play|watch|cast|resume|continue\s+watching|pause|stop)\b/i.test(cleaned)) {
    return false;
  }

  // Voice Email to RobOS Users & Groups (compose, confirm, queue, cancel, inspect)
  const emailCmd = parseVoiceEmailCommand(rawText, opts);
  if (emailCmd) {
    return true;
  }

  // Explicit RobOS Users / RobOS Groups cues
  if (/\b(?:robos\s+users?|robos\s+groups?|active\s+(?:robos\s+)?user|family\s+members|household\s+members|family\s+birthdays|upcoming\s+birthdays)\b/i.test(cleaned)) {
    return true;
  }
  if (/^(?:who\s+am\s+i|what\s+user\s+am\s+i|who\s+is\s+logged\s+in|switch\s+(?:robos\s+)?(?:user|profile)\s+to\b|set\s+active\s+(?:robos\s+)?user\s+to\b)/i.test(cleaned)) {
    return true;
  }
  if (/^(?:list|show|what\s+are)\s+(?:all\s+)?(?:the\s+|our\s+|my\s+)?groups\b/i.test(cleaned)) {
    return true;
  }
  if (/^(?:who\s+is\s+in|list\s+members\s+of|show\s+members\s+of|what\s+members\s+are\s+in|what\s+are\s+the\s+emails?\s+(?:for|in|of)|emails?\s+for)\s+(?:the\s+)?(.+?)(?:\s+group)?[.!?]*$/i.test(cleaned)) {
    const m = cleaned.match(/^(?:who\s+is\s+in|list\s+members\s+of|show\s+members\s+of|what\s+members\s+are\s+in|what\s+are\s+the\s+emails?\s+(?:for|in|of)|emails?\s+for)\s+(?:the\s+)?(.+?)(?:\s+group)?[.!?]*$/i);
    if (m && (/\bgroup\b/i.test(cleaned) || resolveGroup(m[1], opts))) return true;
  }
  if (/^(?:create|make|new|delete|remove)\s+(?:a\s+)?(?:robos\s+)?group\b/i.test(cleaned)) {
    return true;
  }
  if (/^(?:add|put|remove|take)\s+.+\s+(?:to|into|from)\s+(?:the\s+)?.+\s+group[.!?]*$/i.test(cleaned)) {
    return true;
  }
  if (/\bwhat\s+(?:robos\s+)?groups?\s+(?:is|does)\s+.+\s+(?:in|belong\s+to)\b/i.test(cleaned)) {
    return true;
  }
  if (/^is\s+.+\s+in\s+(?:the\s+)?.+\s+group[.!?]*$/i.test(cleaned)) {
    return true;
  }

  // Person-targeted questions ("what is Diana's email", "tell me about Leo", "what music does Diana like", "what is Nick's gamer tag")
  const users = listUsers({ ...opts, includePhotoDataUrl: false });
  const mentionsKnownUser = users.some((u) => {
    const tokens = [u.firstName, u.nickname, u.displayName, u.username, u.gameProfile?.gamerTag]
      .map(fold)
      .filter((x) => x && x.length >= 3);
    const cFold = fold(cleaned);
    return tokens.some((tok) => new RegExp(`\\b${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:s)?\\b`, 'i').test(cFold));
  });

  if (mentionsKnownUser) {
    if (
      /^(?:who\s+is|tell\s+me\s+about|describe|show\s+profile\s+for|what\s+is|whats|when\s+is|how\s+old\s+is|what\s+does|what\s+music|what\s+bands|what\s+books|what\s+games|what\s+are|who\s+are|set|update|add\s+hobby)\b/i.test(
        cleaned
      )
    ) {
      return true;
    }
  }

  return false;
}

async function executeVoiceCommand(rawText, opts = {}) {
  const forcedGroupSkill = /^\/robos-groups\b/i.test(String(rawText || '').trim());
  const cleaned = stripCommandFiller(rawText);
  if (!cleaned) {
    const users = listUsers(opts);
    const spoken = `You have ${users.length} RobOS users: ${users.map((u) => u.displayName).join(', ')}.`;
    return { ok: true, skill: forcedGroupSkill ? 'robos-groups' : 'robos-users', action: 'list-users', response: spoken, spoken, data: { users: users.map(summarizeUser) } };
  }

  // 0. Voice Email to RobOS Users & Groups
  const emailCmd = parseVoiceEmailCommand(rawText, opts);
  if (emailCmd) {
    if (emailCmd.intent === 'confirm-email' || emailCmd.intent === 'queue-email') {
      const pending = loadPendingVoiceEmail(opts);
      if (!pending) {
        const msg = 'There is no pending email waiting to be sent.';
        return { ok: false, skill: 'robos-users', action: emailCmd.intent, response: msg, spoken: msg, error: msg };
      }
      if (!pending.body && !pending.subject) {
        const who = (pending.recipients || []).map((r) => r.name).join(', ');
        const msg = `Your pending email to ${who} still needs a message. Say "message" followed by what you want to say.`;
        return { ok: false, skill: 'robos-users', action: emailCmd.intent, response: msg, spoken: msg, error: msg, data: { draft: pending } };
      }
      const dispatched = await dispatchVoiceEmail(
        { ...pending, sendLater: emailCmd.intent === 'queue-email' ? true : Boolean(pending.sendLater) },
        opts
      );
      return {
        ok: dispatched.ok,
        skill: 'robos-users',
        action: emailCmd.intent,
        response: dispatched.spoken,
        spoken: dispatched.spoken,
        ...(dispatched.error ? { error: dispatched.error } : {}),
        data: dispatched,
      };
    }

    if (emailCmd.intent === 'cancel-email') {
      const pending = loadPendingVoiceEmail(opts);
      clearPendingVoiceEmail(opts);
      const who = (pending?.recipients || []).map((r) => r.name).join(', ');
      const spoken = pending
        ? `Cancelled the pending email${who ? ` to ${who}` : ''}.`
        : 'There is no pending email to cancel.';
      return { ok: true, skill: 'robos-users', action: 'cancel-email', response: spoken, spoken, data: { cancelled: Boolean(pending) } };
    }

    if (emailCmd.intent === 'read-pending-email') {
      const pending = loadPendingVoiceEmail(opts);
      if (!pending) {
        const spoken = 'There is no pending email queued right now.';
        return { ok: true, skill: 'robos-users', action: 'read-pending-email', response: spoken, spoken, data: { draft: null } };
      }
      const who = (pending.recipients || []).map((r) => `${r.name} (${r.email})`).join(', ');
      const spoken = pending.body
        ? `Pending email to ${who} with subject "${pending.subject}" and message: "${pending.body}" Say "send it" to send or "cancel email" to discard.`
        : `Pending email to ${who} (waiting for message). Say "message" followed by your text.`;
      return { ok: true, skill: 'robos-users', action: 'read-pending-email', response: spoken, spoken, data: { draft: pending } };
    }

    if (emailCmd.intent === 'complete-pending-email') {
      const pending = loadPendingVoiceEmail(opts);
      const active = getActiveUser(opts);
      const senderName = active.user?.nickname || active.user?.firstName || active.user?.displayName || 'RobOS';
      const body = formatSentenceBody(emailCmd.body);
      const subject = String(emailCmd.subject || pending?.subject || '').trim() || synthesizeSubjectFromBody(body, senderName);
      const updated = savePendingVoiceEmail({ ...pending, subject, body }, opts);
      const who = (updated.recipients || []).map((r) => `${r.name} (${r.email})`).join(', ');
      const spoken = `Ready to send email to ${who} with subject "${subject}" and message: "${body}" Say "send it" or "confirm email" to send, or "cancel email" to discard.`;
      return { ok: true, skill: 'robos-users', action: 'stage-email', response: spoken, spoken, data: { staged: true, requiresConfirmation: true, draft: updated } };
    }

    if (emailCmd.intent === 'compose-email') {
      const emailRes = await sendOrStageEmailToUsers(
        {
          to: emailCmd.recipientsRaw,
          cc: emailCmd.ccRaw,
          subject: emailCmd.subject,
          body: emailCmd.body,
          sendLater: emailCmd.sendLater,
          sendNow: emailCmd.sendNow,
        },
        opts
      );
      const targetGroupUsed = (emailRes.draft?.recipients || []).some((r) => r.sourceGroup);
      return {
        ok: emailRes.ok,
        skill: targetGroupUsed ? 'robos-groups' : 'robos-users',
        action: emailRes.sent ? 'send-email' : emailRes.queued ? 'queue-email' : 'stage-email',
        response: emailRes.spoken,
        spoken: emailRes.spoken,
        ...(emailRes.error ? { error: emailRes.error } : {}),
        data: emailRes,
      };
    }
  }

  // 1. Sync to remote host / RobOS Services
  const syncMatch = cleaned.match(/^sync\s+(?:all\s+)?(?:robos\s+)?(?:users?(?:\s+and\s+(?:robos\s+)?groups?)?|groups?(?:\s+and\s+(?:robos\s+)?users?)?)(?:\s+(?:to|with|on)\s+(.+?))?[.!?]*$/i);
  if (syncMatch) {
    const targetRaw = String(syncMatch[1] || '').trim();
    const ipOrHostMatch = targetRaw.match(/(\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9-]+(?:\.[a-z0-9-]+)+)/i);
    if (ipOrHostMatch && ipOrHostMatch[1] !== '127.0.0.1' && ipOrHostMatch[1].toLowerCase() !== 'localhost') {
      const res = await syncUsersAndGroupsToHost({ host: ipOrHostMatch[1] }, opts);
      return { ok: res.ok, skill: 'robos-users', action: 'sync-remote', response: res.spoken, spoken: res.spoken, data: res };
    }
    rebuildSearchIndexes(opts);
    syncUsersGroupsKGraph(opts);
    const localRes = syncLocalRobosServicesData(opts);
    const spoken = `Synced ${localRes.userCount} RobOS users and ${localRes.groupCount} RobOS groups into local RobOS Services and the Knowledge Graph.`;
    return { ok: true, skill: 'robos-users', action: 'sync-local', response: spoken, spoken, data: localRes };
  }

  // 2. Active user: "who am I" / "switch robos user to Diana"
  if (/^(?:who\s+am\s+i|what\s+(?:robos\s+)?user\s+am\s+i|who\s+is\s+(?:the\s+)?active\s+(?:robos\s+)?user|who\s+is\s+logged\s+in)[.!?]*$/i.test(cleaned)) {
    const res = getActiveUser(opts);
    return { ok: res.ok, skill: 'robos-users', action: 'whoami', response: res.spoken, spoken: res.spoken, data: res };
  }
  const switchMatch = cleaned.match(/^(?:switch\s+(?:active\s+)?(?:robos\s+)?(?:user|profile)\s+to|set\s+(?:the\s+)?active\s+(?:robos\s+)?user\s+to)\s+(.+?)[.!?]*$/i);
  if (switchMatch) {
    const res = setActiveUser(switchMatch[1], opts);
    return { ok: res.ok, skill: 'robos-users', action: 'switch-user', response: res.spoken, spoken: res.spoken, data: res };
  }

  // 3. List all RobOS Groups
  if (/^(?:list|show|what|which)\b.*\b(?:robos\s+groups|groups)\b/i.test(cleaned) && !/\b(?:is|does)\s+.+\s+(?:in|belong)\b/i.test(cleaned) && !/\bemails?\b/i.test(cleaned)) {
    const groups = listGroups(opts);
    const spoken = groups.length
      ? `You have ${groups.length} RobOS groups: ${groups.map((g) => `${g.name} (${g.members.length})`).join(', ')}.`
      : 'No RobOS groups are configured yet.';
    return { ok: true, skill: 'robos-groups', action: 'list-groups', response: spoken, spoken, data: { groups } };
  }
  if (/^how\s+many\s+(?:robos\s+)?groups\b/i.test(cleaned)) {
    const groups = listGroups(opts);
    const spoken = `There are ${groups.length} RobOS groups: ${groups.map((g) => g.name).join(', ')}.`;
    return { ok: true, skill: 'robos-groups', action: 'count-groups', response: spoken, spoken, data: { count: groups.length, groups } };
  }

  // 4. Create / Delete RobOS Group
  const createGroupMatch = cleaned.match(/^(?:create|make|add|new)\s+(?:a\s+)?(?:robos\s+)?group\s+(?:called\s+|named\s+)?(.+?)(?:\s+with\s+(?:members?\s+)?(.+))?[.!?]*$/i);
  if (createGroupMatch) {
    const res = createGroup({ name: createGroupMatch[1].trim(), members: createGroupMatch[2] || '' }, opts);
    return { ok: res.ok, skill: 'robos-groups', action: 'create-group', response: res.spoken, spoken: res.spoken, data: res };
  }
  const deleteGroupMatch = cleaned.match(/^(?:delete|remove)\s+(?:the\s+)?(?:robos\s+)?group\s+(.+?)[.!?]*$/i);
  if (deleteGroupMatch) {
    const res = deleteGroup(deleteGroupMatch[1], opts);
    return { ok: res.ok, skill: 'robos-groups', action: 'delete-group', response: res.spoken, spoken: res.spoken, data: res };
  }

  // 5. Add / Remove Member in Group
  const addMemberMatch = cleaned.match(/^(?:add|put)\s+(.+?)\s+(?:to|into|in)\s+(?:the\s+)?(.+?)\s+group[.!?]*$/i);
  if (addMemberMatch && !/^robos\s+user\b/i.test(addMemberMatch[1])) {
    const res = addMemberToGroup(addMemberMatch[1], addMemberMatch[2], opts);
    return { ok: res.ok, skill: 'robos-groups', action: 'add-member', response: res.spoken, spoken: res.spoken, data: res };
  }
  const removeMemberMatch = cleaned.match(/^(?:remove|take|delete)\s+(.+?)\s+(?:from|off)\s+(?:the\s+)?(.+?)(?:\s+group)?[.!?]*$/i);
  if (removeMemberMatch && (/\bgroup\b/i.test(cleaned) || resolveGroup(removeMemberMatch[2], opts))) {
    const res = removeMemberFromGroup(removeMemberMatch[1], removeMemberMatch[2], opts);
    return { ok: res.ok, skill: 'robos-groups', action: 'remove-member', response: res.spoken, spoken: res.spoken, data: res };
  }

  // 6. Membership check: "Is Jennilyn in the Dipiazza Kids group?" / "What groups is Leo in?"
  const isMemberMatch = cleaned.match(/^is\s+(.+?)\s+in\s+(?:the\s+)?(.+?)(?:\s+group)?[.!?]*$/i);
  if (isMemberMatch) {
    const user = resolveUser(isMemberMatch[1], opts);
    const group = resolveGroup(isMemberMatch[2], opts);
    if (user && group) {
      const yes = group.members.includes(user.uid);
      const spoken = yes
        ? `Yes, ${user.displayName} is a member of ${group.name}.`
        : `No, ${user.displayName} is not in ${group.name}.`;
      return { ok: true, skill: 'robos-groups', action: 'check-member', response: spoken, spoken, data: { isMember: yes, user: summarizeUser(user), group } };
    }
  }

  const userGroupsMatch = cleaned.match(/^(?:what|which)\s+(?:robos\s+)?groups?\s+(?:is|does)\s+(.+?)\s+(?:in|belong\s+to)[.!?]*$/i);
  if (userGroupsMatch) {
    const res = answerUserQuestion(userGroupsMatch[1], 'groups', opts);
    return { ok: res.ok, skill: 'robos-groups', action: 'user-groups', response: res.spoken, spoken: res.spoken, data: res };
  }

  // 7. Group emails / Group members / Describe group
  const groupEmailsMatch = cleaned.match(/^(?:what\s+are\s+the\s+emails?\s+(?:addresses?\s+)?(?:for|in|of)|list\s+emails?\s+(?:for|in|of)|emails?\s+for)\s+(?:the\s+)?(.+?)(?:\s+group)?[.!?]*$/i);
  if (groupEmailsMatch) {
    const group = resolveGroup(groupEmailsMatch[1], opts);
    if (group) {
      const withEmail = group.memberProfiles.filter((m) => m.email);
      const spoken = withEmail.length
        ? `Emails for ${group.name}: ${withEmail.map((m) => `${m.displayName} (${m.email})`).join(', ')}.`
        : `No email addresses are on file for members of ${group.name}.`;
      return { ok: true, skill: 'robos-groups', action: 'group-emails', response: spoken, spoken, data: { group, emails: withEmail } };
    }
  }

  const groupMembersMatch = cleaned.match(/^(?:who\s+is\s+in|who'?s\s+in|list\s+members\s+of|show\s+members\s+of|what\s+members\s+are\s+in|describe)\s+(?:the\s+|our\s+)?(.+?)(?:\s+group)?[.!?]*$/i);
  if (groupMembersMatch) {
    const targetText = groupMembersMatch[1].trim();
    if (/^(?:our\s+)?(?:family|household)$/i.test(targetText) || resolveGroup(targetText, opts)) {
      const group = resolveGroup(targetText, opts);
      if (group) {
        const names = group.memberProfiles.map((m) => m.displayName);
        const desc = /^describe\b/i.test(cleaned) && group.description ? ` ${group.description}` : '';
        const spoken = `${group.name} has ${names.length} member${names.length === 1 ? '' : 's'}: ${names.join(', ')}.${desc}`;
        return { ok: true, skill: 'robos-groups', action: 'group-members', response: spoken, spoken, data: { group } };
      }
    }
  }

  // 8. List / Count RobOS Users & Birthdays
  if (/\b(?:family\s+birthdays|upcoming\s+birthdays|list\s+birthdays|everybody'?s\s+birthday)\b/i.test(cleaned)) {
    const res = listBirthdays(opts);
    return { ok: true, skill: 'robos-users', action: 'birthdays', response: res.spoken, spoken: res.spoken, data: res };
  }
  if (/^(?:who\s+are\s+(?:all\s+)?(?:the\s+|our\s+)?(?:robos\s+users?|users|family\s+members|household\s+members)|list\s+(?:all\s+)?(?:the\s+|our\s+)?(?:robos\s+users?|family\s+members|household\s+members)|show\s+(?:all\s+)?robos\s+users?)[.!?]*$/i.test(cleaned)) {
    const users = listUsers(opts);
    const spoken = `You have ${users.length} RobOS users: ${users.map((u) => `${u.displayName}${u.nickname && u.nickname !== u.firstName ? ` (${u.nickname})` : ''}`).join(', ')}.`;
    return { ok: true, skill: 'robos-users', action: 'list-users', response: spoken, spoken, data: { users: users.map(summarizeUser) } };
  }
  if (/^how\s+many\s+(?:robos\s+users?|family\s+members|household\s+members)\b/i.test(cleaned)) {
    const users = listUsers(opts);
    const spoken = `There are ${users.length} RobOS users: ${users.map((u) => u.displayName).join(', ')}.`;
    return { ok: true, skill: 'robos-users', action: 'count-users', response: spoken, spoken, data: { count: users.length, users: users.map(summarizeUser) } };
  }

  // 9. Add / Remove / Update RobOS User by Voice
  const addUserMatch = cleaned.match(/^(?:add|create|register)\s+(?:a\s+)?(?:new\s+)?robos\s+user\s+(.+?)[.!?]*$/i);
  if (addUserMatch) {
    let spec = addUserMatch[1].trim();
    let email = '';
    let groups = [];
    const emailM = spec.match(/\s+with\s+email\s+([^\s,]+@[^\s,]+)/i);
    if (emailM) {
      email = emailM[1];
      spec = spec.replace(emailM[0], ' ');
    }
    const grpM = spec.match(/\s+(?:in|to)\s+groups?\s+(.+)$/i);
    if (grpM) {
      groups = grpM[1].split(/[,;]|\band\b/i).map((s) => s.trim()).filter(Boolean);
      spec = spec.replace(grpM[0], ' ');
    }
    const res = createUser({ displayName: spec.trim(), email, groups }, opts);
    return { ok: res.ok, skill: 'robos-users', action: 'create-user', response: res.spoken, spoken: res.spoken, data: res };
  }

  const removeUserMatch = cleaned.match(/^(?:remove|delete)\s+robos\s+user\s+(.+?)[.!?]*$/i);
  if (removeUserMatch) {
    const res = deleteUser(removeUserMatch[1], opts);
    return { ok: res.ok, skill: 'robos-users', action: 'delete-user', response: res.spoken, spoken: res.spoken, data: res };
  }

  const setFieldMatch = cleaned.match(/^(?:set|update|change)\s+(.+?)(?:'s|’s)\s+(gamer\s*tag|nickname|email|phone|birthday|role|title)\s+to\s+(.+?)[.!?]*$/i);
  if (setFieldMatch) {
    const [, who, rawField, val] = setFieldMatch;
    const f = fold(rawField);
    const patch = {};
    if (f.includes('gamer')) patch.gamerTag = val.trim();
    else if (f === 'nickname') patch.nickname = val.trim();
    else if (f === 'email') patch.email = val.trim();
    else if (f === 'phone') patch.phone = val.trim();
    else if (f === 'birthday') patch.birthday = val.trim();
    else patch.role = val.trim();
    const res = updateUser(who, patch, opts);
    return { ok: res.ok, skill: 'robos-users', action: 'update-user', response: res.spoken, spoken: res.spoken, data: res };
  }

  const addHobbyMatch = cleaned.match(/^add\s+hobby\s+(.+?)\s+(?:to|for)\s+(.+?)[.!?]*$/i);
  if (addHobbyMatch) {
    const res = updateUser(addHobbyMatch[2], { addHobby: addHobbyMatch[1] }, opts);
    return { ok: res.ok, skill: 'robos-users', action: 'update-user', response: res.spoken, spoken: res.spoken, data: res };
  }

  // 10. Rich Person Fact Q&A
  const users = listUsers({ ...opts, includePhotoDataUrl: false });
  let matchedUser = null;
  for (const u of users) {
    const candidates = [u.displayName, `${u.firstName} ${u.lastName}`, u.nickname, u.firstName, u.username, u.gameProfile?.gamerTag]
      .map((s) => String(s || '').trim())
      .filter((s) => s.length >= 3);
    for (const c of candidates) {
      const escaped = fold(c).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}(?:s)?\\b`, 'i').test(fold(cleaned))) {
        matchedUser = u;
        break;
      }
    }
    if (matchedUser) break;
  }

  if (matchedUser) {
    let topic = 'summary';
    if (/\bemail\b/i.test(cleaned)) topic = 'email';
    else if (/\bphone\b/i.test(cleaned)) topic = 'phone';
    else if (/\bbirthday\b/i.test(cleaned)) topic = 'birthday';
    else if (/\b(?:how\s+old|age)\b/i.test(cleaned)) topic = 'age';
    else if (/\bgamer\s*tag\b/i.test(cleaned)) topic = 'gamerTag';
    else if (/\b(?:bg3|baldur|rpg|character|class\s+does|play\s+in\s+baldur)\b/i.test(cleaned)) topic = 'rpg';
    else if (/\bmusic\b.*\b(?:hate|dislike|cant\s+stand|outlaw)/i.test(fold(cleaned))) topic = 'music-dislikes';
    else if (/\b(?:music|bands?|songs?)\b/i.test(cleaned)) topic = 'music';
    else if (/\b(?:books?|read|reading|novels?)\b/i.test(cleaned)) topic = 'books';
    else if (/\bpet\s+peeves?\b/i.test(cleaned)) topic = 'pet-peeves';
    else if (/\b(?:quirks?|traits?|personality|archetype)\b/i.test(cleaned)) topic = 'personality';
    else if (/\b(?:hobbies|hobby|interests?|expert\s+topics?)\b/i.test(cleaned)) topic = 'hobbies';
    else if (/\b(?:favorite\s+games?|what\s+games?)\b/i.test(cleaned)) topic = 'games';
    else if (/\b(?:partner|wife|husband|children|kids)\b/i.test(cleaned)) topic = 'family';
    else if (/\b(?:job|role|title|work|profession|what\s+does\s+.+\s+do)\b/i.test(cleaned)) topic = 'role';
    else if (/\bgroups?\b/i.test(cleaned)) topic = 'groups';

    const res = answerUserQuestion(matchedUser, topic, opts);
    return {
      ok: res.ok,
      skill: topic === 'groups' ? 'robos-groups' : 'robos-users',
      action: `user-${topic}`,
      response: res.spoken,
      spoken: res.spoken,
      data: res,
    };
  }

  return {
    ok: false,
    skill: forcedGroupSkill ? 'robos-groups' : 'robos-users',
    action: 'unrecognized',
    error: `Could not understand RobOS users/groups command: "${rawText}"`,
    response: `I could not match that RobOS users or groups request. Try asking "who are the RobOS users?", "who is in the Family group?", or "tell me about Diana".`,
    spoken: `I could not match that RobOS users or groups request. Try asking who are the RobOS users, or who is in the Family group.`,
  };
}

module.exports = {
  slugify,
  getConfigDir,
  getGroupsDir,
  getServicesDir,
  rebuildSearchIndexes,
  buildUsersGroupsKGraph,
  syncUsersGroupsKGraph,
  summarizeUser,
  listUsers,
  resolveUser,
  getActiveUser,
  setActiveUser,
  createUser,
  updateUser,
  deleteUser,
  answerUserQuestion,
  listBirthdays,
  listGroups,
  resolveGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  addMemberToGroup,
  removeMemberFromGroup,
  buildServicesStatePayload,
  syncLocalRobosServicesData,
  syncUsersAndGroupsToHost,
  httpJsonRequest,
  getPendingVoiceEmailPath,
  loadPendingVoiceEmail,
  savePendingVoiceEmail,
  clearPendingVoiceEmail,
  resolveEmailRecipients,
  parseVoiceEmailCommand,
  dispatchVoiceEmail,
  sendOrStageEmailToUsers,
  isUsersOrGroupsVoiceCommand,
  executeVoiceCommand,
};
