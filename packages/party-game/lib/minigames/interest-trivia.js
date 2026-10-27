'use strict';

const { defineMiniGame } = require('./template');

// Trivia the AI host writes about each guest's interests from the survey.
// The guest whose interest it is becomes the round's "resident expert": they
// earn a bonus for getting it right, and everyone who beats them gets one too.

// Used only when the AI writers could not deliver questions.
const FALLBACK_TRIVIA = [
  { interest: 'space', question: 'Which planet has the most known moons?', choices: ['Saturn', 'Jupiter', 'Uranus', 'Neptune'], answer: 0, funFact: 'Saturn passed Jupiter in 2023 and has well over a hundred confirmed moons.' },
  { interest: 'music', question: 'How many keys does a standard piano have?', choices: ['76', '88', '92', '101'], answer: 1, funFact: 'A standard piano has 88 keys: 52 white and 36 black.' },
  { interest: 'food', question: 'Which country is the origin of the croissant’s ancestor, the kipferl?', choices: ['France', 'Austria', 'Italy', 'Belgium'], answer: 1, funFact: 'The crescent-shaped kipferl came from Austria before Paris made it buttery and flaky.' },
  { interest: 'movies', question: 'Which film won the first Academy Award for Best Picture?', choices: ['Wings', 'Metropolis', 'Sunrise', 'The Jazz Singer'], answer: 0, funFact: 'Wings, a silent war film, won the first Best Picture award in 1929.' },
  { interest: 'travel', question: 'What is the capital of Australia?', choices: ['Sydney', 'Melbourne', 'Canberra', 'Perth'], answer: 2, funFact: 'Canberra was purpose-built as a compromise between rivals Sydney and Melbourne.' },
  { interest: 'animals', question: 'How many hearts does an octopus have?', choices: ['One', 'Two', 'Three', 'Four'], answer: 2, funFact: 'Octopuses have three hearts: two pump blood through the gills, one through the body.' },
];

const LETTERS = 'ABCD';

module.exports = defineMiniGame({
  id: 'interest-trivia',
  title: 'Nerd Alert Trivia',
  tagline: 'Trivia about the things you love. The experts are on the spot.',
  description:
    'The AI host writes trivia about each guest’s interests. +2 for a right answer. ' +
    'The resident expert earns +1 more for getting it, and if they miss, everyone who got it right gets +1 for out-nerding them.',
  icon: '🧠',
  minGuests: 2,
  defaultRounds: 4,
  answerSeconds: 25,

  buildRounds(ctx, count) {
    const { guests, shuffle } = ctx;
    let items = (ctx.script?.trivia || []).filter((t) => guests.some((g) => g.id === t.guestId));
    // Spread experts across guests before repeating anyone.
    const ordered = [];
    const byGuest = {};
    for (const t of items) (byGuest[t.guestId] = byGuest[t.guestId] || []).push(t);
    while (ordered.length < items.length) {
      for (const list of Object.values(byGuest)) if (list.length) ordered.push(list.shift());
    }
    items = ordered.length ? ordered : shuffle(FALLBACK_TRIVIA).map((t) => ({ ...t, guestId: null }));

    return items.slice(0, count).map((t) => {
      // Shuffle the choices so the right answer is not always where the AI put it.
      const choices = shuffle(t.choices.map((label, i) => ({ label, correct: i === t.answer })));
      const options = choices.map((c, i) => ({ id: `c${i}`, label: `${LETTERS[i]}. ${c.label}` }));
      const expert = guests.find((g) => g.id === t.guestId) || null;
      return {
        expertId: expert ? expert.id : null,
        interest: t.interest,
        question: t.question,
        funFact: t.funFact,
        correctId: options[choices.findIndex((c) => c.correct)].id,
        prompt: {
          headline: expert ? `${expert.name}’s expert topic: ${t.interest}` : `Trivia: ${t.interest}`,
          body: t.question,
          subjectId: expert ? expert.id : null,
          options,
          excludeGuestIds: [],
          layout: 'statements',
        },
      };
    });
  },

  correctOption: (round) => round.correctId,

  score(round, answers, ctx) {
    const awards = {};
    const fooled = [];
    const expertRight = round.expertId && answers[round.expertId] === round.correctId;
    for (const [gid, choice] of Object.entries(answers)) {
      if (choice !== round.correctId) {
        fooled.push(gid);
        continue;
      }
      let pts = 2;
      if (gid === round.expertId) pts += 1; // expert bonus
      else if (round.expertId && !expertRight) pts += 1; // out-nerded the expert
      awards[gid] = pts;
    }
    const expert = ctx.guests.find((g) => g.id === round.expertId);
    let verdict = '';
    if (expert) verdict = expertRight ? `${expert.name} defended their title.` : `${expert.name} got out-nerded!`;
    return {
      correct: round.correctId,
      awards,
      fooled,
      subjectId: round.expertId,
      bluffer: null,
      expertRight: Boolean(expertRight),
      reveal: { headline: 'The answer:', detail: `${verdict} ${round.funFact || ''}`.trim() },
    };
  },

  narration: {
    round(round, index, ctx) {
      const expert = ctx.guests.find((g) => g.id === round.expertId);
      const lead = expert ? `This one is for ${expert.name}, our resident ${round.interest} expert.` : `Trivia time: ${round.interest}.`;
      return `${lead} ${round.question}`;
    },
    reveal(round, result, ctx) {
      const expert = ctx.guests.find((g) => g.id === round.expertId);
      const answer = round.prompt.options.find((o) => o.id === round.correctId).label.slice(3);
      const verdict = !expert ? '' : result.expertRight ? `${expert.name} knew it, of course.` : `And ${expert.name}, our so-called expert, missed it!`;
      return `The answer is ${answer}. ${verdict} ${round.funFact || ''}`.trim();
    },
  },
});

module.exports.FALLBACK_TRIVIA = FALLBACK_TRIVIA;
