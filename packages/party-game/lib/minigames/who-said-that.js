'use strict';

const { defineMiniGame, guestOptions } = require('./template');

// A survey answer appears on the TV; everyone guesses which guest gave it.
module.exports = defineMiniGame({
  id: 'who-said-that',
  title: 'Who Said That?',
  tagline: 'One of you wrote this. Which one?',
  description:
    'The host reads a survey answer out loud. Guess which guest wrote it. ' +
    '+2 for a correct guess. The guest it belongs to sits the round out.',
  icon: '🗣️',
  minGuests: 3,
  defaultRounds: 4,
  answerSeconds: 25,

  buildRounds(ctx, count) {
    const { guests, shuffle } = ctx;
    // The AI writers pick the most surprising answers and phrase them as teasers.
    const written = (ctx.script?.whoSaidThat || [])
      .map((w) => {
        const g = guests.find((x) => x.id === w.guestId);
        const fact = g && g.facts.find((f) => f.questionId === w.questionId);
        return fact ? { guest: g, fact, readAloud: w.readAloud, quip: w.revealQuip } : null;
      })
      .filter(Boolean)
      .slice(0, count);
    if (written.length >= Math.min(count, 2)) {
      return written.map((w) => ({
        subjectId: w.guest.id,
        fact: w.fact,
        readAloud: w.readAloud,
        quip: w.quip,
        prompt: {
          headline: 'Who said that?',
          body: `“${w.readAloud || w.fact.answer}”`,
          caption: w.fact.prompt,
          subjectId: null,
          options: guestOptions(guests),
          excludeGuestIds: [w.guest.id],
          layout: 'guests',
        },
      }));
    }
    // Prefer free-text facts: they are the most surprising to guess.
    const pool = [];
    for (const g of guests) {
      for (const f of g.facts || []) pool.push({ guest: g, fact: f, weight: f.kind === 'text' ? 2 : 1 });
    }
    const ordered = shuffle(pool).sort((a, b) => b.weight - a.weight);
    const rounds = [];
    const usedPerGuest = {};
    // Spread subjects across guests before repeating anyone.
    for (let pass = 0; pass < 3 && rounds.length < count; pass++) {
      for (const item of ordered) {
        if (rounds.length >= count) break;
        if ((usedPerGuest[item.guest.id] || 0) > pass) continue;
        if (rounds.some((r) => r.fact === item.fact)) continue;
        usedPerGuest[item.guest.id] = (usedPerGuest[item.guest.id] || 0) + 1;
        rounds.push({
          subjectId: item.guest.id,
          fact: item.fact,
          prompt: {
            headline: 'Who said that?',
            body: `“${item.fact.answer}”`,
            caption: item.fact.prompt,
            subjectId: null, // stays hidden until the reveal
            options: guestOptions(guests),
            excludeGuestIds: [item.guest.id],
            layout: 'guests',
          },
        });
      }
    }
    return shuffle(rounds);
  },

  correctOption: (round) => round.subjectId,

  score(round, answers) {
    const awards = {};
    const fooled = [];
    for (const [gid, choice] of Object.entries(answers)) {
      if (gid === round.subjectId) continue;
      if (choice === round.subjectId) awards[gid] = 2;
      else fooled.push(gid);
    }
    return {
      correct: round.subjectId,
      awards,
      fooled,
      subjectId: round.subjectId,
      bluffer: round.subjectId,
      reveal: { headline: 'It was…', detail: round.fact.text },
    };
  },

  narration: {
    round(round, index) {
      const said = String(round.readAloud || round.fact.answer).replace(/[.!?]+$/, '');
      return index === 0
        ? `First up. Somebody told me: ${said}. Who was it?`
        : `Next confession: ${said}. Point the finger.`;
    },
    reveal(round, result, ctx) {
      if (!round.quip) return null;
      const g = ctx.guests.find((x) => x.id === round.subjectId);
      return g && round.quip.includes(g.name) ? round.quip : `It was ${g ? g.name : 'them'}! ${round.quip}`;
    },
  },
});
