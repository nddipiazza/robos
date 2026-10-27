'use strict';

const { defineMiniGame, guestOptions, majorityOptions, tallyVotes } = require('./template');

// Each superlative is tied to a survey trait. The guest who scored highest on
// that trait is the "survey says" answer.
const SUPERLATIVES = [
  { trait: 'competitive', text: 'Most likely to flip the table at game night' },
  { trait: 'chaotic', text: 'Most likely to book a flight on a whim' },
  { trait: 'sneaky', text: 'Most likely to be a secret agent' },
  { trait: 'kind', text: 'Most likely to adopt every stray animal in town' },
  { trait: 'bold', text: 'Most likely to start a conga line' },
  { trait: 'clever', text: 'Most likely to solve the murder before the detective' },
  { trait: 'creative', text: 'Most likely to turn a grocery trip into an epic tale' },
  { trait: 'social', text: 'Most likely to befriend the waiter and get their life story' },
];

module.exports = defineMiniGame({
  id: 'most-likely-to',
  title: 'Most Likely To',
  tagline: 'The room votes. The AI host decides.',
  description:
    'The AI host writes superlatives about your group. Vote for who fits best: +1 for voting with the room, ' +
    '+2 more if you match the AI host\'s pick.',
  icon: '🏅',
  minGuests: 3,
  defaultRounds: 4,
  answerSeconds: 20,

  buildRounds(ctx, count) {
    const { guests, shuffle } = ctx;
    // AI-written superlatives tailored to this group, with the AI's own pick.
    const written = (ctx.script?.mostLikelyTo || [])
      .filter((w) => guests.some((g) => g.id === w.guestId))
      .slice(0, count);
    if (written.length >= Math.min(count, 2)) {
      return written.map((w) => {
        const text = /^most likely/i.test(w.superlative) ? w.superlative : `Most likely to ${w.superlative}`;
        return {
          superlative: { trait: null, text },
          surveyPickId: w.guestId,
          reason: w.reason,
          aiPick: true,
          prompt: {
            headline: 'Who is…',
            body: text + '?',
            subjectId: null,
            options: guestOptions(guests),
            excludeGuestIds: [],
            layout: 'guests',
          },
        };
      });
    }
    return shuffle(SUPERLATIVES)
      .slice(0, count)
      .map((sup) => {
        const ranked = [...guests].sort((a, b) => (b.traits?.[sup.trait] || 0) - (a.traits?.[sup.trait] || 0));
        return {
          superlative: sup,
          surveyPickId: ranked[0]?.id || null,
          prompt: {
            headline: 'Who is…',
            body: sup.text + '?',
            subjectId: null,
            options: guestOptions(guests),
            excludeGuestIds: [],
            layout: 'guests',
          },
        };
      });
  },

  correctOption: (round) => round.surveyPickId,

  score(round, answers, ctx) {
    const majority = majorityOptions(answers);
    const counts = tallyVotes(answers);
    const awards = {};
    const fooled = [];
    for (const [gid, choice] of Object.entries(answers)) {
      let pts = 0;
      if (majority.includes(choice)) pts += 1;
      if (choice === round.surveyPickId) pts += 2;
      if (pts) awards[gid] = pts;
      else fooled.push(gid);
    }
    const pick = ctx.guests.find((g) => g.id === round.surveyPickId);
    const roomPick = ctx.guests.find((g) => g.id === majority[0]);
    const roomText = majority.length === 1 && roomPick
      ? `The room picked ${roomPick.name} (${counts[roomPick.id]} vote${counts[roomPick.id] === 1 ? '' : 's'}).`
      : majority.length > 1 ? 'The room was split.' : 'Nobody voted!';
    return {
      correct: round.surveyPickId,
      majority,
      awards,
      fooled,
      subjectId: round.surveyPickId,
      bluffer: null,
      reveal: round.aiPick
        ? {
          headline: pick ? `The AI host picked: ${pick.name}` : 'The AI host is speechless',
          detail: `${roomText} ${round.reason || ''}`.trim(),
        }
        : {
          headline: pick ? `The survey says: ${pick.name}` : 'The survey is speechless',
          detail: `${roomText} Their survey answers scored highest for “${round.superlative.trait}”.`,
        },
    };
  },

  narration: {
    round(round) {
      return `${round.superlative.text}? Vote now. I already know the answer.`;
    },
    reveal(round, result, ctx) {
      if (!round.aiPick || !round.reason) return null;
      const g = ctx.guests.find((x) => x.id === round.surveyPickId);
      return `My pick: ${g ? g.name : 'nobody'}. ${round.reason}`;
    },
  },
});

module.exports.SUPERLATIVES = SUPERLATIVES;
