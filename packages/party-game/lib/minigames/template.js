'use strict';

// Mini game template.
//
// A mini game is a plain object passed to defineMiniGame(). The engine owns
// timers, answer collection, role perks, scores and narration playback; a mini
// game only describes its rounds. To add a new one, copy an example in this
// folder, give it a unique `id`, and add it to minigames/index.js.
//
//   defineMiniGame({
//     id: 'my-game',                    // unique, kebab-case
//     title: 'My Game',
//     tagline: 'One line for the TV title card',
//     description: 'How to play, shown in the host app and phones',
//     icon: '🎲',
//     minGuests: 3,
//     defaultRounds: 3,
//     answerSeconds: 30,                // default timer per round (host can override)
//
//     // Build every round up front. May be async (e.g. to ask the AI host for
//     // content). ctx = { guests, rand, pick, shuffle, settings, ai }
//     // Each round must have a `prompt` (see below) plus any private data the
//     // `score` step needs. Return fewer rounds if there is not enough material.
//     buildRounds(ctx, count) => [{ prompt, ...private }],
//
//     // Called once all answers are in (or time runs out).
//     // answers = { [guestId]: optionId }
//     // Returns { correct: optionId|null, awards: { [guestId]: points },
//     //           fooled: [guestId], subjectId, bluffer: guestId|null,
//     //           reveal: { headline, detail } }
//     // `bluffer` is the guest who profits from fooling others (Trickster and
//     // Storyteller roles get +1 per fooled guest when they are the bluffer).
//     score(round, answers, ctx) => result,
//
//     // Optional. The right option for a round, so the Detective role can be
//     // shown one wrong option. Omit it for opinion rounds with no right answer.
//     correctOption(round) => optionId,
//
//     // Optional narration hooks. Each returns a sentence or null to use the
//     // narrator's stock line for the current host personality.
//     narration: {
//       intro(ctx) => string,
//       round(round, index, ctx) => string,
//       reveal(round, result, ctx) => string,
//     },
//   })
//
// Round prompt shape (sent to TVs and phones):
//   {
//     headline: 'Who said this?',            // big text
//     body: 'Their hidden talent: juggling', // the content being judged
//     subjectId: 'g_abc' | null,             // spotlight guest (shown on the spotlight TV)
//     options: [{ id, label, guestId? }],    // what phones can pick
//     excludeGuestIds: ['g_abc'],            // guests who sit this round out
//     layout: 'guests' | 'statements',       // TV rendering hint
//   }

const REQUIRED = ['id', 'title', 'buildRounds', 'score'];

function defineMiniGame(def) {
  for (const key of REQUIRED) {
    if (!def || def[key] === undefined) throw new Error(`Mini game is missing "${key}"`);
  }
  if (!/^[a-z0-9-]+$/.test(def.id)) throw new Error(`Mini game id "${def.id}" must be kebab-case`);
  return {
    tagline: '',
    description: '',
    icon: '🎲',
    minGuests: 2,
    defaultRounds: 3,
    answerSeconds: 30,
    narration: {},
    ...def,
  };
}

// Helpers shared by mini games.

function guestOptions(guests) {
  return guests.map((g) => ({ id: g.id, label: g.name, guestId: g.id }));
}

function tallyVotes(answers) {
  const counts = {};
  for (const optionId of Object.values(answers || {})) {
    if (optionId) counts[optionId] = (counts[optionId] || 0) + 1;
  }
  return counts;
}

function majorityOptions(answers) {
  const counts = tallyVotes(answers);
  const max = Math.max(0, ...Object.values(counts));
  if (max === 0) return [];
  return Object.keys(counts).filter((k) => counts[k] === max);
}

module.exports = { defineMiniGame, guestOptions, tallyVotes, majorityOptions };
