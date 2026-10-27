'use strict';

const { defineMiniGame, tallyVotes } = require('./template');
const { HOUSE_SURVEY } = require('../survey');

// Real-world challenges built from the party host's house survey. The AI host
// picks one or two performers and a challenge that uses the actual rooms,
// games, instruments and craft supplies; everyone else judges on their phones.
//
//   two performers → vote for the winner: the winner gets +3, voters who picked
//                    the winner get +1
//   one performer  → vote "Nailed it" / "Not quite": a majority of nailed-its
//                    earns them +3, and +1 more if it was unanimous

const labelsFor = (id, values = []) => {
  const q = HOUSE_SURVEY.find((x) => x.id === id);
  return values.map((v) => q.options.find((o) => o.value === v)?.label || v);
};

// Stock challenges, filled in from the house survey, for when the AI writers
// could not deliver quests.
function fallbackQuests(house, guests, pick, shuffle) {
  const spaces = labelsFor('spaces', house.spaces || []);
  const crafts = labelsFor('crafts', house.crafts || []);
  const games = labelsFor('games', house.games || []);
  const place = () => (spaces.length ? pick(spaces).toLowerCase() : 'living room');
  const quests = [
    { title: 'Scavenger Sprint', where: place(), seconds: 60, judging: 'Who brought back the best find?',
      challenge: `Race to the ${place()} and bring back the most surprising object you can find. You have one minute. Go!` },
    { title: 'Instant Costume', where: 'anywhere', seconds: 90, judging: 'Best costume wins',
      challenge: `Build a costume for the other player using only ${crafts.length ? crafts.slice(0, 3).join(', ').toLowerCase() : 'things from the kitchen'}. Ninety seconds!` },
    { title: 'Trick Shot', where: place(), seconds: 60, judging: 'Most impressive trick shot',
      challenge: games.length ? `Grab something from the ${pick(games).toLowerCase()} and invent a trick shot. Best attempt in sixty seconds wins.` : 'Toss a balled-up sock into a cup from across the room. Best trick shot in sixty seconds wins.' },
    { title: 'Commercial Break', where: 'in front of the TV', seconds: 45, judging: 'Most convincing pitch',
      challenge: 'Pick up any object in the room and sell it to us like a late-night infomercial. Forty-five seconds, maximum drama.' },
  ];
  const order = shuffle(guests);
  return quests.map((q, i) => ({
    ...q,
    performers: [order[(i * 2) % order.length].id, order[(i * 2 + 1) % order.length].id].filter((v, j, a) => a.indexOf(v) === j),
  }));
}

module.exports = defineMiniGame({
  id: 'house-quest',
  title: 'House Quest',
  tagline: 'The AI host turns this house into the game board.',
  description:
    'Real challenges using the rooms, games and supplies in this house. One or two guests perform; ' +
    'everyone else votes on their phone when the timer ends. Winners earn +3.',
  icon: '🏠',
  minGuests: 2,
  defaultRounds: 3,
  answerSeconds: 60,

  buildRounds(ctx, count) {
    const { guests, pick, shuffle } = ctx;
    let quests = (ctx.script?.houseQuests || []).filter((q) => q.performers.every((id) => guests.some((g) => g.id === id)));
    if (!quests.length) quests = fallbackQuests(ctx.house || {}, guests, pick, shuffle);
    return quests.slice(0, count).map((q) => {
      const performers = q.performers.map((id) => guests.find((g) => g.id === id));
      const duel = performers.length > 1;
      const options = duel
        ? performers.map((g) => ({ id: g.id, label: g.name, guestId: g.id }))
        : [{ id: 'yes', label: '🔥 Nailed it' }, { id: 'no', label: '😬 Not quite' }];
      return {
        quest: q,
        performers: performers.map((g) => g.id),
        duel,
        prompt: {
          headline: `${q.title}${q.where ? ` · ${q.where}` : ''}`,
          body: q.challenge,
          caption: `${performers.map((g) => g.name).join(' vs ')} · Judges: ${q.judging}`,
          subjectId: performers[0].id,
          options,
          excludeGuestIds: performers.map((g) => g.id),
          layout: duel ? 'guests' : 'statements',
          seconds: q.seconds + 20, // performance plus time to vote
          waitForTimer: true,
        },
      };
    });
  },

  score(round, answers, ctx) {
    const votes = tallyVotes(answers);
    const awards = {};
    const names = (id) => ctx.guests.find((g) => g.id === id)?.name || '?';
    if (round.duel) {
      const [a, b] = round.performers;
      const va = votes[a] || 0;
      const vb = votes[b] || 0;
      const winner = va === vb ? null : va > vb ? a : b;
      if (winner) {
        awards[winner] = 3;
        for (const [gid, choice] of Object.entries(answers)) if (choice === winner) awards[gid] = (awards[gid] || 0) + 1;
      } else if (va > 0) {
        awards[a] = 2;
        awards[b] = 2;
      }
      return {
        correct: winner,
        awards,
        fooled: [],
        subjectId: winner || a,
        bluffer: null,
        reveal: {
          headline: winner ? `${names(winner)} wins the quest!` : 'It’s a tie!',
          detail: `${names(a)}: ${va} vote${va === 1 ? '' : 's'} · ${names(b)}: ${vb} vote${vb === 1 ? '' : 's'}`,
        },
      };
    }
    const [p] = round.performers;
    const yes = votes.yes || 0;
    const no = votes.no || 0;
    const passed = yes > no;
    if (passed) awards[p] = yes > 0 && no === 0 ? 4 : 3;
    return {
      correct: passed ? 'yes' : 'no',
      awards,
      fooled: [],
      subjectId: p,
      bluffer: null,
      reveal: {
        headline: passed ? `${names(p)} nailed it!` : `${names(p)} did not quite make it`,
        detail: `${yes} nailed it · ${no} not quite`,
      },
    };
  },

  narration: {
    round(round, index, ctx) {
      const names = round.performers.map((id) => ctx.guests.find((g) => g.id === id)?.name).join(' and ');
      return `${names}, this one is yours. ${round.quest.challenge} Everyone else: judge on your phones when time is up.`;
    },
    reveal(round, result) {
      return `${result.reveal.headline} ${result.reveal.detail}.`;
    },
  },
});

module.exports.fallbackQuests = fallbackQuests;
