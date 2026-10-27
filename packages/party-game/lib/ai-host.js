'use strict';

// The AI Writers' Room. The host's agent writes the night's material from the
// guests' survey answers. Agent CLIs take seconds to answer, so everything here
// runs in the background ahead of when it is needed; the engine shows whatever
// is ready and falls back to stock material for anything that is not.
//
//   guestIntro(guest)          one-line welcome roast when a guest finishes the survey
//   writeShow({ guests, … })   the show script: title, opening, role reveal lines,
//                              Who Said That? picks + quips, Most Likely To
//                              superlatives with the AI's pick, Two Truths bluffs
//   houseTour({ … })           a spoken "house tour" once the party host describes the house
//   writeTrivia({ guests })    multiple-choice trivia about each guest's interests
//   writeHouseQuests({ … })    real-world challenges using the house's rooms, games and supplies
//   recap({ … })               standings commentary after each mini game
//   finaleAwards({ … })        a custom award for every guest

const path = require('node:path');

let parseAIJson = null;
let JSON_RULES = 'Reply with JSON only: straight double quotes, no comments, no trailing commas, every string on one line.';
for (const p of [
  process.env.ROBOS_LIB_PATH && path.join(process.env.ROBOS_LIB_PATH, 'ai-json'),
  path.resolve(__dirname, '..', '..', 'robos-lib', 'ai-json'),
  '/usr/local/share/robos/robos-lib/ai-json',
].filter(Boolean)) {
  try {
    const mod = require(p);
    parseAIJson = mod.parseAIJson;
    JSON_RULES = mod.JSON_RULES_PROMPT || JSON_RULES;
    break;
  } catch {}
}

function parseJson(text) {
  if (!text) return null;
  if (parseAIJson) {
    const r = parseAIJson(text);
    return r.ok ? r.data : null;
  }
  const s = String(text).replace(/^```\w*\s*|```\s*$/gm, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

const RULES =
  'Keep everything party-safe and kind underneath the teasing: no insults about appearance, ' +
  'weight, race, religion, gender, sexuality, health or money. Use only facts given here; never invent ' +
  'private details. Write lines meant to be spoken aloud: short, punchy, no emoji, no stage directions.';

function oneLine(s, max = 220) {
  if (typeof s !== 'string') return null;
  const line = s.replace(/\s+/g, ' ').replace(/^["'\s]+|["'\s]+$/g, '').trim();
  return line && line.length <= max ? line : line ? line.slice(0, max).replace(/\s+\S*$/, '…') : null;
}

// Compact, prompt-friendly guest profiles keyed by short ids (G1, G2, …).
function profiles(guests, roleTitle = () => null) {
  const keyOf = {};
  const idOf = {};
  const lines = guests.map((g, i) => {
    const key = `G${i + 1}`;
    keyOf[g.id] = key;
    idOf[key] = g.id;
    const role = roleTitle(g);
    const facts = (g.facts || []).map((f) => `[${f.questionId}] ${f.text}`).join(' | ');
    const traits = Object.entries(g.traits || {})
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t)
      .join(', ');
    return `${key} ${g.name}${role ? ` (role: ${role})` : ''}; strongest traits: ${traits || 'balanced'}; answers: ${facts}`;
  });
  return { text: lines.join('\n'), keyOf, idOf };
}

function houseBlock(house) {
  if (!house || !house.profile) return '';
  return `THE PARTY IS AT ${house.hostName.toUpperCase()}'S PLACE (use these real rooms and things in jokes; respect anything off-limits):\n${house.profile}\n\n`;
}

function createAiHost({ ask, personalityStyle = () => 'an energetic game show host', log = () => {} }) {
  async function run(prompt) {
    try {
      const text = await ask(prompt);
      return text || null;
    } catch (err) {
      log({ msg: 'ai host call failed', err: err.message });
      return null;
    }
  }

  async function guestIntro(guest) {
    const facts = (guest.facts || []).map((f) => f.text).join(' ');
    const text = await run(
      `You are ${personalityStyle()} hosting a party game on a big TV. A guest named ${guest.name} just finished ` +
      `their survey. Their answers: ${facts}\nWrite ONE spoken line (max 28 words) welcoming ${guest.name} by name ` +
      `that playfully teases one specific answer. ${RULES} Reply with only the line.`
    );
    return oneLine(text);
  }

  async function writeShow({ guests, roleOf, house = null, miniGames = [], superlativeCount = 4, whoSaidCount = 4 }) {
    const { text: roster, idOf } = profiles(guests, (g) => roleOf(g)?.title);
    const prompt =
      `You are the head writer for ${personalityStyle()} hosting tonight's party game. Write tonight's show from these guests' survey answers.\n` +
      `GUESTS:\n${roster}\n\n` +
      houseBlock(house) +
      'Return a JSON object with exactly these keys:\n' +
      '{\n' +
      '  "showTitle": "a short funny title for tonight built from the guests (max 6 words)",\n' +
      '  "opening": "spoken opening line (max 30 words) that name-drops at least two guests",\n' +
      '  "roleReveals": { "G1": "spoken line (max 30 words) explaining why this guest got their role, citing one of their answers" },\n' +
      `  "whoSaidThat": [ { "guest": "G1", "question": "<question id in brackets>", "readAloud": "the answer rephrased as a teaser quote, without the name", "revealQuip": "spoken line after the reveal (max 20 words)" } ],\n` +
      `  "mostLikelyTo": [ { "superlative": "Most likely to ... (tailored to this group)", "guest": "G2", "reason": "why, citing their answers (max 20 words)" } ],\n` +
      '  "bluffs": { "G1": "a plausible but FALSE fun fact about this guest in the same style as their answers (max 14 words)" },\n' +
      '  "gameIntros": { "<mini game id>": "spoken intro (max 30 words) that explains the game and teases a guest or two" }\n' +
      '}\n' +
      `Write roleReveals and bluffs for every guest, ${whoSaidCount} whoSaidThat items (the most surprising answers, spread across guests), ` +
      `${superlativeCount} mostLikelyTo items (each guest picked at most twice), ` +
      `and gameIntros for these mini games: ${miniGames.map((m) => `${m.id} (${m.title}: ${m.description})`).join('; ')}. Never name the role "The Mole"; its owner's role reads "The Party Guest".\n` +
      `${RULES}\n${JSON_RULES}`;
    let raw = await run(prompt);
    let data = parseJson(raw);
    if (!data || typeof data !== 'object') {
      // One retry: long JSON answers occasionally come back truncated or wrapped.
      log({ msg: 'show script unreadable, retrying', chars: raw ? raw.length : 0 });
      raw = await run(prompt);
      data = parseJson(raw);
    }
    if (!data || typeof data !== 'object') return null;

    const guestId = (k) => idOf[String(k || '').trim().toUpperCase()] || null;
    const script = {
      showTitle: oneLine(data.showTitle, 60),
      opening: oneLine(data.opening),
      roleReveals: {},
      whoSaidThat: [],
      mostLikelyTo: [],
      bluffs: {},
      gameIntros: {},
    };
    for (const m of miniGames) {
      const line = oneLine(data.gameIntros?.[m.id], 260);
      if (line) script.gameIntros[m.id] = line;
    }
    for (const [k, v] of Object.entries(data.roleReveals || {})) {
      const id = guestId(k);
      if (id && oneLine(v)) script.roleReveals[id] = oneLine(v);
    }
    for (const [k, v] of Object.entries(data.bluffs || {})) {
      const id = guestId(k);
      if (id && oneLine(v, 140)) script.bluffs[id] = oneLine(v, 140);
    }
    for (const item of Array.isArray(data.whoSaidThat) ? data.whoSaidThat : []) {
      const id = guestId(item.guest);
      const g = guests.find((x) => x.id === id);
      const fact = g && (g.facts || []).find((f) => f.questionId === String(item.question || '').replace(/[[\]]/g, ''));
      if (fact) script.whoSaidThat.push({ guestId: id, questionId: fact.questionId, readAloud: oneLine(item.readAloud, 160) || fact.answer, revealQuip: oneLine(item.revealQuip) });
    }
    for (const item of Array.isArray(data.mostLikelyTo) ? data.mostLikelyTo : []) {
      const id = guestId(item.guest);
      const sup = oneLine(item.superlative, 100);
      if (id && sup) script.mostLikelyTo.push({ superlative: sup.replace(/\?$/, ''), guestId: id, reason: oneLine(item.reason, 160) });
    }
    return script;
  }

  // Multiple-choice trivia about each guest's interests from the survey.
  async function writeTrivia({ guests, count = 4 }) {
    const lines = [];
    const idOf = {};
    guests.forEach((g, i) => {
      const interests = (g.facts || []).filter((f) => f.interest).map((f) => f.answer);
      if (!interests.length) return;
      idOf[`G${i + 1}`] = g.id;
      lines.push(`G${i + 1} ${g.name}: ${interests.join(' | ')}`);
    });
    if (!lines.length) return [];
    const data = parseJson(await run(
      `You are the trivia writer for ${personalityStyle()} hosting a party game. These are the guests' interests from their survey:\n` +
      `${lines.join('\n')}\n` +
      `Write ${count} multiple-choice trivia questions, each about one guest's interest (spread across guests, mix easy and medium). ` +
      'Every question must have exactly one correct answer that is a well-established, verifiable fact (no opinions, nothing that changes year to year, ' +
      'no questions about the guest themselves). Use four short, plausible choices.\n' +
      'Return JSON: { "trivia": [ { "guest": "G1", "interest": "the interest in 1-4 words", "question": "max 22 words", ' +
      '"choices": ["", "", "", ""], "answer": 0, "funFact": "one spoken sentence explaining the answer (max 25 words)" } ] }\n' +
      `"answer" is the index (0-3) of the correct choice. ${RULES}\n${JSON_RULES}`
    ));
    const out = [];
    for (const t of (data && Array.isArray(data.trivia) ? data.trivia : [])) {
      const guestId = idOf[String(t.guest || '').toUpperCase()];
      const choices = Array.isArray(t.choices) ? t.choices.map((c) => oneLine(String(c), 80)).filter(Boolean) : [];
      const answer = Number(t.answer);
      const question = oneLine(t.question, 200);
      if (!guestId || !question || choices.length !== 4 || new Set(choices).size !== 4) continue;
      if (!Number.isInteger(answer) || answer < 0 || answer > 3) continue;
      out.push({ guestId, interest: oneLine(t.interest, 40) || 'their favorite thing', question, choices, answer, funFact: oneLine(t.funFact) });
    }
    return out;
  }

  async function houseTour({ hostName, house }) {
    const text = await run(
      `You are ${personalityStyle()} hosting a party game at ${hostName}'s place. ${hostName} just described the house:\n${house}\n` +
      `Write ONE spoken line (max 35 words) giving the guests a quick, funny "house tour" that thanks ${hostName} and ` +
      `name-drops two or three real things from the description. ${RULES} Reply with only the line.`
    );
    return oneLine(text, 260);
  }

  // Real-world challenges that use the actual rooms, games and supplies in the house.
  async function writeHouseQuests({ guests, house, count = 4 }) {
    if (!house || !house.profile) return [];
    const keyOf = {};
    const idOf = {};
    guests.forEach((g, i) => {
      keyOf[g.id] = `G${i + 1}`;
      idOf[`G${i + 1}`] = g.id;
    });
    const roster = guests.map((g) => `${keyOf[g.id]} ${g.name}: ${(g.facts || []).slice(0, 6).map((f) => f.text).join(' ')}`).join('\n');
    const data = parseJson(await run(
      `You are the challenge designer for ${personalityStyle()} hosting a party game.\n` +
      houseBlock(house) +
      `GUESTS:\n${roster}\n` +
      `Design ${count} short real-world party challenges that use specific rooms, games, instruments, supplies or gear from the house ` +
      '(e.g. a 60-second jam on the basement guitar amps, a craft-supply costume race, a backyard relay). Each is performed by one or two guests ' +
      '(pick guests whose answers fit, spread across guests), lasts 30 to 120 seconds, is safe for the stated vibe, and is judged by everyone else voting on their phones. ' +
      'Never use anything marked off-limits. Only use the printer if the house has one.\n' +
      'Return JSON: { "quests": [ { "title": "max 6 words", "performers": ["G1", "G2"], "where": "room or area", "seconds": 60, ' +
      '"challenge": "spoken instructions, max 40 words", "judging": "what the room votes on, max 12 words" } ] }\n' +
      `${RULES}\n${JSON_RULES}`
    ));
    const out = [];
    for (const q of (data && Array.isArray(data.quests) ? data.quests : [])) {
      const performers = [...new Set((Array.isArray(q.performers) ? q.performers : []).map((k) => idOf[String(k).toUpperCase()]).filter(Boolean))].slice(0, 2);
      const challenge = oneLine(q.challenge, 300);
      if (!performers.length || !challenge) continue;
      out.push({
        title: oneLine(q.title, 60) || 'House Quest',
        performers,
        where: oneLine(q.where, 40) || '',
        seconds: Math.min(120, Math.max(30, Math.round(Number(q.seconds) || 60))),
        challenge,
        judging: oneLine(q.judging, 100) || 'Who did it best?',
      });
    }
    return out;
  }

  async function recap({ standings, recent, nextGame }) {
    const text = await run(
      `You are ${personalityStyle()} hosting a party game. Standings: ${standings}. What just happened: ${recent}. ` +
      `${nextGame ? `Up next: ${nextGame}. ` : 'That was the last mini game. '}` +
      `Write ONE spoken line (max 35 words) recapping the standings with a callback to something that just happened. ${RULES} Reply with only the line.`
    );
    return oneLine(text, 260);
  }

  async function finaleAwards({ guests, roleOf, highlights, house = null }) {
    const { text: roster, idOf } = profiles(guests, (g) => roleOf(g)?.title);
    const data = parseJson(await run(
      `You are ${personalityStyle()} closing a party game. Give every guest a funny custom award based on their answers and tonight's play.\n` +
      `GUESTS:\n${roster}\nTONIGHT: ${highlights}\n` +
      (house ? `Give ${house.hostName}, the party host, an award that thanks them for the house.\n` : '') +
      'Return JSON: { "awards": { "G1": { "title": "The ... Award (max 7 words)", "line": "spoken line presenting it (max 22 words)" } } }\n' +
      `${RULES}\n${JSON_RULES}`
    ));
    const awards = {};
    for (const [k, v] of Object.entries((data && data.awards) || {})) {
      const id = idOf[String(k).toUpperCase()];
      if (id && v && oneLine(v.title, 80)) awards[id] = { title: oneLine(v.title, 80), line: oneLine(v.line) };
    }
    return awards;
  }

  return { guestIntro, houseTour, writeShow, writeTrivia, writeHouseQuests, recap, finaleAwards };
}

module.exports = { createAiHost, parseJson, profiles };
