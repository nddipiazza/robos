'use strict';

// Robos agent source discovery. The portal asks the user's active coding
// agent (robos-lib/ai-agent → Claude Code, Codex, Gemini CLI, Copilot) which
// fan resources cover each asset type of a game. The answer is data: it is
// parsed as JSON, validated, probed over HTTP and recorded as jrpg:Source
// nodes with status "agent-suggested". Nothing the agent says is executed.

const path = require('path');
const { ASSET_TYPES } = require('./asset-types');
const { slug } = require('./kgraph-writer');

const KNOWN_CONNECTORS = [
  { id: 'mediawiki', test: u => /\/api\.php(\?|$)/.test(u) || /fandom\.com\/wiki\//.test(u) || /strategywiki\.org\/wiki\//.test(u) },
  { id: 'vgmaps', test: u => /vgmaps\.com\/Atlas\//i.test(u) },
  { id: 'rpgamer', test: u => /archive\.rpgamer\.com\//i.test(u) },
  { id: 'wayback', test: u => /web\.archive\.org\//i.test(u) },
];

function loadAiAgent() {
  for (const p of [process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'ai-agent'), path.resolve(__dirname, '..', '..', 'robos-lib', 'ai-agent'), '/usr/local/share/robos/robos-lib/ai-agent'].filter(Boolean)) {
    try { return require(p); } catch { /* next */ }
  }
  return null;
}

function discoveryBrief(profile, { assetTypes, known = profile.sources || [] } = {}) {
  const wanted = (assetTypes && assetTypes.length ? ASSET_TYPES.filter(a => assetTypes.includes(a.id)) : ASSET_TYPES);
  return [
    `You are helping remake the classic JRPG "${profile.title}" (${profile.platform}, ${profile.region} release, ${profile.year || 'original release'}).`,
    'Find fan resources on the public web that document what a faithful remake needs. Prefer sources with structured data (wiki tables, MediaWiki APIs, map atlases, FAQs with tables), and say which ones refuse automated clients if you know.',
    '',
    'Asset types needed:',
    ...wanted.map(a => `- ${a.id}: ${a.label} (typical sources: ${a.hints.join('; ')})`),
    '',
    known.length ? `Already known (do not repeat): ${known.map(s => s.url).join(', ')}` : '',
    '',
    'Answer with JSON only: an array of objects',
    '{"title": string, "url": "https://...", "assetTypes": [asset type ids], "kind": "wiki|map-atlas|walkthrough|faq|sprite-archive|rom-map|fan-site", "license": string, "notes": string}.',
    'Use only real URLs you are confident exist. No commentary outside the JSON.',
  ].filter(l => l !== undefined).join('\n');
}

function extractJsonArray(text) {
  const s = String(text || '');
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : s;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start === -1 || end <= start) throw new Error('Agent answer has no JSON array');
  return JSON.parse(body.slice(start, end + 1));
}

function validateSuggestions(raw) {
  const ids = new Set(ASSET_TYPES.map(a => a.id));
  const out = [];
  const rejected = [];
  for (const s of Array.isArray(raw) ? raw : []) {
    let url;
    try { url = new URL(String(s.url || '')); } catch { rejected.push({ item: s, reason: 'invalid url' }); continue; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') { rejected.push({ item: s, reason: 'not http(s)' }); continue; }
    if (url.username || url.password) { rejected.push({ item: s, reason: 'credentials in url' }); continue; }
    const assetTypes = [].concat(s.assetTypes || []).map(String).filter(a => ids.has(a));
    if (!assetTypes.length) { rejected.push({ item: s, reason: 'no known asset types' }); continue; }
    out.push({
      title: String(s.title || url.host).slice(0, 160),
      url: url.href,
      assetTypes,
      kind: String(s.kind || 'fan-site').slice(0, 40),
      license: String(s.license || 'Unknown; cite, do not copy').slice(0, 200),
      notes: String(s.notes || '').slice(0, 500),
      connector: (KNOWN_CONNECTORS.find(c => c.test(url.href)) || {}).id || null,
    });
  }
  return { suggestions: out, rejected };
}

// Ask the agent, validate, then probe each URL with the portal's HTTP client.
async function discoverSources(profile, { ask, http, assetTypes, providerId, log = () => {} } = {}) {
  const agent = ask ? { ask } : loadAiAgent();
  if (!agent || typeof agent.ask !== 'function') throw new Error('No robos agent available: install robos-lib or pass ask()');
  const brief = discoveryBrief(profile, { assetTypes, known: profile.sources || [] });
  log('Asking the robos agent for fan resources');
  const res = await agent.ask(brief, providerId ? { providerId } : undefined);
  if (!res || !res.ok) throw new Error(`Agent did not answer: ${(res && res.error) || 'no response'}`);
  const { suggestions, rejected } = validateSuggestions(extractJsonArray(res.text));
  const known = new Set((profile.sources || []).map(s => s.url));
  const fresh = suggestions.filter(s => !known.has(s.url));
  for (const s of fresh) {
    if (!http) { s.status = 'unprobed'; continue; }
    const probe = await http.text(s.url);
    s.status = probe.ok ? 'reachable' : `unreachable (${probe.error})`;
    log(`${s.status.padEnd(18)} ${s.url}`);
  }
  return { brief, suggestions: fresh, rejected, via: res.via || 'agent' };
}

function suggestionNodes(gameSlug, suggestions) {
  return suggestions.map(s => ({
    '@id': `urn:robos:jrpg:${gameSlug}:source:agent-${slug(new URL(s.url).host + new URL(s.url).pathname).slice(0, 80)}`,
    '@type': ['jrpg:Source', 'schema:WebSite'], 'dcterms:title': s.title, 'robos:package': 'game', 'schema:url': s.url,
    'jrpg:sourceKind': s.kind, 'jrpg:license': s.license, 'jrpg:assetTypes': s.assetTypes, 'jrpg:status': `agent-suggested, ${s.status || 'unprobed'}`,
    ...(s.connector ? { 'jrpg:connector': s.connector } : {}), ...(s.notes ? { 'dcterms:description': s.notes } : {}),
  }));
}

module.exports = { discoveryBrief, extractJsonArray, validateSuggestions, discoverSources, suggestionNodes, loadAiAgent };
