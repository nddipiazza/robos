'use strict';

const { defineMiniGame } = require('./template');

// Two real facts about a guest plus one the AI host made up. Spot the fake.
const FALLBACK_FAKES = {
  'secret-talent': ['Can recite the alphabet backwards in 4 seconds', 'Can whistle with a mouth full of crackers', 'Can fold a fitted sheet perfectly'],
  'worst-job': ['Professional mattress tester', 'Costumed hot dog at a minor league stadium', 'Golf ball diver'],
  embarrassing: ['Called their teacher "Mom" in high school', 'Walked into a glass door at an Apple store', 'Got stuck in a revolving door'],
  'guilty-pleasure': ['Competitive cup stacking videos', 'Polka covers of pop songs', 'Cooking shows for dogs'],
  'dinner-guest': ['Bob Ross', 'A medieval knight', 'Their childhood goldfish'],
};

const GENERIC_FAKES = [
  'Once won a hot dog eating contest.',
  'Has never seen a single Star Wars movie.',
  'Is secretly afraid of geese.',
  'Was an extra in a cereal commercial.',
];

function fakeForFact(fact, question, guest, others, ctx) {
  const { pick } = ctx;
  if (question?.kind === 'choice') {
    const alt = (question.options || []).filter((o) => o.label !== fact.answer);
    if (alt.length) {
      const o = pick(alt);
      return (question.fact || '{answer}').replace('{answer}', o.label.toLowerCase());
    }
  }
  if (question?.kind === 'scale') {
    const current = Number(fact.answer);
    const options = [1, 2, 3, 4, 5].filter((n) => Math.abs(n - current) >= 2);
    const n = options.length ? pick(options) : (current >= 3 ? 1 : 5);
    return (question.fact || '{answer}').replace('{answer}', String(n));
  }
  // Text: borrow another guest's answer to the same question — the best bluff.
  const borrowed = others
    .map((g) => (g.facts || []).find((f) => f.questionId === fact.questionId))
    .filter((f) => f && f.answer !== fact.answer);
  if (borrowed.length) return pick(borrowed).text;
  const bank = FALLBACK_FAKES[fact.questionId];
  if (bank && question) return (question.fact || '{answer}').replace('{answer}', pick(bank));
  return pick(GENERIC_FAKES);
}

async function aiFake(guest, truths, ctx) {
  if (!ctx.ai) return null;
  const prompt =
    `You are the host of a party game. Invent ONE short, plausible but false fun fact about a guest named ${guest.name}, ` +
    'in the same style as these true facts, under 14 words, party-safe, no quotes:\n' +
    truths.map((t) => `- ${t.text}`).join('\n') +
    '\nReply with only the fake fact.';
  const text = await ctx.ai(prompt);
  if (!text) return null;
  const line = String(text).split('\n').map((s) => s.replace(/^[-*\s"]+|["\s]+$/g, '')).find(Boolean);
  return line && line.length <= 140 ? line : null;
}

module.exports = defineMiniGame({
  id: 'truth-or-bot',
  title: 'Two Truths & a Bot',
  tagline: 'Two facts are real. The AI host wrote the third.',
  description:
    'Three statements about one guest appear on the TV. Two came from their survey; ' +
    'the AI host invented the other. Find the fake for +2. The guest earns +1 for everyone fooled.',
  icon: '🤖',
  minGuests: 3,
  defaultRounds: 3,
  answerSeconds: 30,

  async buildRounds(ctx, count) {
    const { guests, shuffle, questions } = ctx;
    const subjects = shuffle(guests.filter((g) => (g.facts || []).length >= 2)).slice(0, count);
    const plans = subjects.map((guest) => {
      const truths = shuffle(guest.facts).slice(0, 2);
      const source = shuffle(guest.facts.filter((f) => !truths.includes(f)))[0] || truths[0];
      return { guest, truths, source };
    });
    // Ask the AI host for every lie at once; any that fail fall back to survey bluffs.
    // The writers' room usually has a bluff ready; ask live only for the rest.
    const aiLies = await Promise.all(plans.map((p) => ctx.script?.bluffs?.[p.guest.id]
      || aiFake(p.guest, p.truths, ctx).catch(() => null)));
    return plans.map(({ guest, truths, source }, i) => {
      const question = questions.find((q) => q.id === source.questionId);
      const others = guests.filter((g) => g.id !== guest.id);
      let lie = aiLies[i];
      const byAi = Boolean(lie);
      if (!lie) lie = fakeForFact(source, question, guest, others, ctx);
      if (truths.some((t) => t.text === lie)) lie = ctx.pick(GENERIC_FAKES);
      const statements = shuffle([
        ...truths.map((t, j) => ({ id: `truth-${j}`, label: t.text, truth: true })),
        { id: 'lie', label: lie, truth: false },
      ]);
      return {
        subjectId: guest.id,
        lieByAi: byAi,
        statements,
        prompt: {
          headline: `Which one is the bot's lie about ${guest.name}?`,
          body: '',
          subjectId: guest.id,
          options: statements.map((st, j) => ({ id: st.id, label: `${'ABC'[j]}. ${st.label}` })),
          excludeGuestIds: [guest.id],
          layout: 'statements',
        },
      };
    });
  },

  correctOption: () => 'lie',

  score(round, answers) {
    const awards = {};
    const fooled = [];
    for (const [gid, choice] of Object.entries(answers)) {
      if (gid === round.subjectId) continue;
      if (choice === 'lie') awards[gid] = 2;
      else fooled.push(gid);
    }
    if (fooled.length) awards[round.subjectId] = (awards[round.subjectId] || 0) + fooled.length;
    const lie = round.statements.find((s) => !s.truth);
    return {
      correct: 'lie',
      awards,
      fooled,
      subjectId: round.subjectId,
      bluffer: round.subjectId,
      reveal: { headline: 'The bot made up:', detail: lie.label },
    };
  },

  narration: {
    round(round, index, ctx) {
      const g = ctx.guests.find((x) => x.id === round.subjectId);
      return `Let's talk about ${g ? g.name : 'someone'}. Two of these are true. One I invented. Which one?`;
    },
  },
});

module.exports.fakeForFact = fakeForFact;
