'use strict';

// Game 1: Real or AI
//
// Stage 1 (3 Questions): Ask the players 3 questions; they type (or tap a
// quick-fill suggestion and customize) their real answers on their phones.
// Stage 2 (6 Alternating Turns): For each question and each player, display
// 5 AI-generated answers and 1 real answer (6 total). Players take turns
// trying to figure out which answer is real vs. AI-generated!

const { defineMiniGame } = require('./template');
const { parseJson } = require('../ai-host');

const QUESTION_BANK = [
  {
    id: 'pet-peeve-rule',
    prompt: 'What is a household rule, habit, or pet peeve you will 100% die on a hill defending?',
    placeholder: 'Type your real answer…',
    personaSuggestions: {
      diana: [
        'Close the toilet lid before flushing and wash your hands the second you touch raw meat.',
        'If there is a weird vein or tendon in my food, it gets surgically isolated before I take another bite.',
        'Do not spring a chaotic last-minute change to the evening plan five minutes before we leave.',
      ],
      nick: [
        'If something works in 30 seconds without turning it into a 12-step procedure, just let it work.',
        'Asking an outrageous hypothetical question in the kitchen is a valid love language.',
        'If a problem can be solved with a quick script or a reboot, do not overcomplicate it.',
      ],
      default: [
        'Put things back where they belong the first time so nobody has to hunt for them.',
        'If the dishwasher is already running, rinsing your spoon takes two seconds.',
        'Do not turn a five-minute errand into an all-afternoon production.',
      ],
    },
    aiDecoys: {
      diana: [
        'Every spice jar in the cabinet must face forward in alphabetical order or dinner is cancelled.',
        'Shoes stay within three feet of the front mat, and outside coats never touch the couch cushions.',
        'If you open a new bag of chips while another bag is still half full, that is a felony.',
        'Kitchen sponges have a strict four-day lifespan before they are considered biohazards.',
        'Leftovers go into glass containers with the lid snapped down within ten minutes of plating.',
      ],
      nick: [
        'If a household appliance needs a manual thicker than ten pages, it was engineered wrong.',
        'Thermostats should be controlled by a cron job, not emotional negotiations.',
        'If the Wi-Fi drops below 300 Mbps, all other household chores are suspended until root cause analysis finishes.',
        'Every argument should have a ten-minute SLA and end with a clear action item.',
        'You should always test whether a rule is actually necessary by poking at it once.',
      ],
      default: [
        'Never leave less than two squares of paper or an empty ice tray for the next person.',
        'Lights in unoccupied rooms should be turned off within sixty seconds of leaving.',
        'Alarm clocks with more than two snoozes in a row should be outlawed.',
        'Grocery carts must be loaded heaviest-to-lightest or the whole trip is compromised.',
        'TV volume must land on an even number or a multiple of five.',
      ],
    },
  },
  {
    id: 'ideal-saturday',
    prompt: 'If you had a completely uninterrupted Saturday with zero obligations, what does your ideal day look like?',
    placeholder: 'Describe your real ideal Saturday…',
    personaSuggestions: {
      diana: [
        'A spotless, quiet house, zero crowds, a 600-page fantasy-romance book, and Polyphia playing with zero vocals.',
        'Sleeping in, iced coffee in peace, reading on the couch all afternoon, and co-op Baldur’s Gate 3 at night.',
        'Everything clean before noon, no noisy restaurants, comfort food at home, and a long evening together.',
      ],
      nick: [
        'Jamming a Rock Invasion drum setlist, hacking on a cool project, and couch co-op Baldur’s Gate 3 with Diana.',
        'Zero schedules, loud music, ordering food in, and casting Illusionist Wizard spells while Diana’s Paladin tanks.',
        'Sleeping in, building something ridiculous on Linux, and spending the whole night hanging out with Diana.',
      ],
      default: [
        'Sleeping in with no alarm, great coffee, zero errands, and a movie marathon at night.',
        'A slow morning at home, a favorite hobby all afternoon, and takeout on the couch.',
        'Turning my phone on Do Not Disturb and doing whatever sounds fun in the moment.',
      ],
    },
    aiDecoys: {
      diana: [
        'Waking up to a freshly cleaned kitchen, three chapters of a dark fantasy novel, and instrumental prog metal on the speakers.',
        'Zero small talk with strangers, homemade comfort food, and smiting undead as an Oath of the Ancients Paladin.',
        'Finishing an entire book series under a blanket while every counter in the house gleams.',
        'Ordering in so we skip crowded dining rooms, then a four-hour RPG session with zero interruptions.',
        'A quiet morning routine where nothing is out of place, followed by guitar instrumentals and a fantasy novel.',
      ],
      nick: [
        'Two hours on the drum kit, automating three things nobody asked me to automate, and a long BG3 co-op campaign.',
        'Debugging a home server over coffee, cranking rock tracks, and testing absurd hypotheticals on Diana.',
        'Zero chores, an afternoon coding spike, and sneaking around the battlefield with Minor Illusion.',
        'Playing drums until my arms ache, ordering pizza, and uninterrupted couch time with Diana.',
        'Setting up a new Linux gadget in the morning and spending the rest of the day gaming and laughing.',
      ],
      default: [
        'Coffee on the porch, three hours on a personal project, and cooking a big dinner at home.',
        'Binge-watching a whole season in one sitting with phones on silent.',
        'A late brunch, a long walk outside, and board games until midnight.',
        'Catching up on sleep, listening to records, and ordering Thai food.',
        'Doing absolutely nothing productive and feeling zero guilt about it.',
      ],
    },
  },
  {
    id: 'opposite-reactions',
    prompt: 'What is the funniest way the two of you react completely differently to the exact same situation?',
    placeholder: 'Type your real answer…',
    personaSuggestions: {
      diana: [
        'Nick invents a horrifying hygiene hypothetical just to watch my face, and I give him the silent death stare.',
        'I want to clean up a mess immediately so it is done, while Nick acts like pausing for two minutes is torture.',
        'In Baldur’s Gate 3 I march in front as a heavily armored Paladin while Nick schemes from the shadows.',
      ],
      nick: [
        'I pitch an outrageous "Would Diana Survive?" scenario for entertainment, and she immediately calculates the contamination risk.',
        'Diana spots a tiny detail out of place from across the room while I didn’t even register the room had walls.',
        'She wants a predictable plan before we start, and I want to wing it and see what happens.',
      ],
      default: [
        'One of us wants a step-by-step plan three days early and the other wings it in the driveway.',
        'One of us notices every tiny mess immediately and the other is blissfully oblivious.',
        'One of us plays the tank charging straight in while the other schemes from the back row.',
      ],
    },
    aiDecoys: {
      diana: [
        'When food has a questionable texture, I calmly dissect it like an X-ray tech while Nick narrates it like a sports broadcast.',
        'In a crowded restaurant, I immediately scan for the cleanest booth while Nick is already cracking loud jokes.',
        'If something spills, my hands are already washing it while Nick is explaining why gravity is statistically unavoidable.',
        'When someone asks a personal question in public, I lock it down with one look while Nick is ready to overshare.',
        'I treat bedtime routines like a sacred protocol while Nick treats them like a flexible suggestion.',
      ],
      nick: [
        'When Diana starts cleaning something mid-conversation, I used to debate it—now I just let her finish the mission.',
        'I throw a ridiculous hypothetical grenade into a quiet evening just to see her eyebrow go up.',
        'Diana reads the entire menu and checks the kitchen vibe while I pick the first thing that sounds good in four seconds.',
        'In co-op RPGs she upholds her sacred Paladin oath while I’m busy picking pockets and casting illusions.',
        'She notices a microscopic smudge on a glass while I’m standing there proud that the glass isn’t broken.',
      ],
      default: [
        'When packing for a trip, one of us folds everything a day early and the other throws it in ten minutes before leaving.',
        'At a party, one of us is looking for the quietest corner and the other is looking for the microphone.',
        'When assembling furniture, one reads every page of the manual and the other starts tightening bolts.',
        'In traffic, one of us calmly takes the detour and the other provides live commentary.',
        'When watching a movie, one quietly analyzes the plot and the other predicts the twist out loud.',
      ],
    },
  },
];

function personaKeyFor(guest) {
  const hay = `${guest?.name || ''} ${guest?.userId || ''} ${guest?.archetype || ''} ${guest?.profileSummary || ''}`.toLowerCase();
  if (hay.includes('diana') || hay.includes('xray') || hay.includes('x-ray') || hay.includes('radiol')) return 'diana';
  if (hay.includes('nick') || hay.includes('nicholas') || hay.includes('dipiazza') || hay.includes('java')) return 'nick';
  return 'default';
}

function normalizeText(s) {
  return String(s || '').trim().replace(/\s+/g, ' ');
}

module.exports = defineMiniGame({
  id: 'real-or-ai',
  title: 'Real or AI',
  icon: '🤖',
  tagline: '3 questions. 5 AI-generated answers. 1 real human answer.',
  description: 'First, answer 3 questions in your own words. Then take turns facing 5 AI-generated decoys and 1 real answer—and figure out which one is real vs. AI!',
  minGuests: 2,
  defaultRounds: 3,
  preserveAllRounds: true,
  answerSeconds: 45,

  async buildRounds(ctx, count = 3) {
    if (ctx.guests.length < 2) return [];
    const qCount = Math.min(3, Math.max(1, count || 3));
    const selectedQuestions = QUESTION_BANK.slice(0, qCount);
    const collected = {}; // questionId -> { [guestId]: string }

    const promptRounds = selectedQuestions.map((q, qi) => {
      // Build quick-fill suggestions combining both players' persona suggestions so anyone can tap or type
      const allSuggestions = [
        ...(q.personaSuggestions.diana || []).slice(0, 1),
        ...(q.personaSuggestions.nick || []).slice(0, 1),
        ...(q.personaSuggestions.default || []).slice(0, 1),
      ];
      return {
        stage: 'collect',
        questionIndex: qi,
        questionObj: q,
        collected,
        prompt: {
          kicker: `Step 1 of 2 · Write Your Real Answer (${qi + 1} of ${qCount})`,
          headline: `Question ${qi + 1}: ${q.prompt}`,
          body: 'Type your real answer on your controller (or tap a quick-fill idea and make it yours). Keep a straight face!',
          caption: 'Your real answer will be hidden among 5 AI-generated answers in the next stage.',
          inputMode: 'text',
          skipReveal: true,
          placeholder: q.placeholder || 'Type your real answer…',
          suggestions: allSuggestions,
          options: allSuggestions.map((label, idx) => ({ id: `sug_${idx}`, label })),
          excludeGuestIds: [],
          layout: 'statements',
          seconds: 45,
        },
      };
    });

    // Build alternating guessing turns: for each question, each guest gets a turn as the subject
    const guessRounds = [];
    let turnNumber = 0;
    const totalTurns = selectedQuestions.length * ctx.guests.length;
    for (let qi = 0; qi < selectedQuestions.length; qi++) {
      const q = selectedQuestions[qi];
      for (let gi = 0; gi < ctx.guests.length; gi++) {
        turnNumber += 1;
        const subject = ctx.guests[gi];
        const guessers = ctx.guests.filter((g) => g.id !== subject.id);
        const guesserNames = guessers.map((g) => g.name).join(' & ');
        guessRounds.push({
          stage: 'guess',
          turnNumber,
          totalTurns,
          questionIndex: qi,
          questionObj: q,
          subjectId: subject.id,
          subjectName: subject.name,
          guesserIds: guessers.map((g) => g.id),
          guesserNames,
          collected,
          correctId: 'opt_0',
          realAnswerText: '',
          prompt: {
            kicker: `Turn ${turnNumber} of ${totalTurns} · ${guesserNames}'s Turn to Spot the AI`,
            headline: `Which answer did ${subject.name} REALLY write? (5 are AI-Generated, 1 is Real!)`,
            body: q.prompt,
            caption: `${guesserNames}: Spot ${subject.name}'s 1 real answer hidden among 5 AI-generated decoys!`,
            subjectId: subject.id,
            inputMode: 'single',
            options: [],
            excludeGuestIds: [subject.id],
            layout: 'statements',
            seconds: 40,
          },
        });
      }
    }

    return [...promptRounds, ...guessRounds];
  },

  async onCollect(round, answers, ctx) {
    if (round.stage !== 'collect') return;
    const q = round.questionObj;
    round.collected[q.id] = round.collected[q.id] || {};
    for (const g of ctx.guests) {
      const raw = normalizeText(answers[g.id]);
      const matchedOpt = (round.prompt.options || []).find((o) => o.id === raw);
      const pKey = personaKeyFor(g);
      const fallbackList = q.personaSuggestions[pKey] || q.personaSuggestions.default;
      const fallback = fallbackList[round.questionIndex % fallbackList.length];
      round.collected[q.id][g.id] = matchedOpt ? matchedOpt.label : (raw || fallback);
    }
  },

  async onBeforeRound(round, _index, ctx) {
    if (round.stage === 'collect') {
      // Customize suggestions per guest in round.prompt.suggestionsByGuest so each player sees their own voice
      const q = round.questionObj;
      const byGuest = {};
      for (const g of ctx.guests) {
        const pKey = personaKeyFor(g);
        byGuest[g.id] = q.personaSuggestions[pKey] || q.personaSuggestions.default;
      }
      round.prompt.suggestionsByGuest = byGuest;
      return;
    }

    if (round.stage !== 'guess') return;
    const q = round.questionObj;
    const subject = ctx.guests.find((g) => g.id === round.subjectId) || ctx.guests[0];
    const pKey = personaKeyFor(subject);
    const fallbackReal = (q.personaSuggestions[pKey] || q.personaSuggestions.default)[0];
    const realText = normalizeText(round.collected?.[q.id]?.[subject.id]) || fallbackReal;
    round.realAnswerText = realText;

    // Gather 5 AI-generated decoy answers in the subject's voice
    const stockDecoys = (q.aiDecoys[pKey] || q.aiDecoys.default)
      .filter((d) => normalizeText(d).toLowerCase() !== realText.toLowerCase());

    let aiDecoys = [];
    if (ctx.ai && ctx.settings?.agent) {
      try {
        const aiPromise = ctx.ai(
          `You are generating 5 convincing AI decoy answers for a party game called "Real or AI".\n` +
          `Player: ${subject.name} (${subject.archetype || ''}; ${subject.profileSummary || ''})\n` +
          `Question: "${q.prompt}"\n` +
          `Their REAL answer is: "${realText}"\n` +
          `Write 5 DIFFERENT, plausible, witty 1-sentence decoy answers that sound like ${subject.name} could have written them, matching the approximate length and tone of the real answer.\n` +
          `Reply with JSON only: {"decoys":["...","...","...","...","..."]}`
        );
        const raw = await Promise.race([
          aiPromise,
          new Promise((resolve) => {
            const t = setTimeout(() => resolve(null), 3500);
            t.unref?.();
          }),
        ]);
        const parsed = parseJson(raw);
        if (parsed && Array.isArray(parsed.decoys)) {
          aiDecoys = parsed.decoys
            .map(normalizeText)
            .filter((d) => d.length >= 8 && d.toLowerCase() !== realText.toLowerCase());
        }
      } catch {}
    }

    const fiveAi = [...aiDecoys, ...stockDecoys];
    const uniqueAi = [];
    const seen = new Set([realText.toLowerCase()]);
    for (const item of fiveAi) {
      const k = item.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        uniqueAi.push(item);
      }
      if (uniqueAi.length === 5) break;
    }
    while (uniqueAi.length < 5) {
      uniqueAi.push(`Honestly, ${subject.name} would just handle it their own way (${uniqueAi.length + 1}).`);
    }

    const rawEntries = [
      { kind: 'real', text: realText, aiIndex: 0 },
      ...uniqueAi.map((text, idx) => ({ kind: 'ai', text, aiIndex: idx + 1 })),
    ];
    const shuffled = ctx.shuffle(rawEntries);
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    round.entries = shuffled.map((entry, idx) => ({
      id: `opt_${idx}`,
      letter: letters[idx],
      label: `${letters[idx]}. “${entry.text}”`,
      rawText: entry.text,
      kind: entry.kind,
      aiIndex: entry.aiIndex,
    }));
    const realEntry = round.entries.find((e) => e.kind === 'real') || round.entries[0];
    round.correctId = realEntry.id;
    round.prompt.options = round.entries.map((e) => ({
      id: e.id,
      label: e.label,
    }));
  },

  correctOption(round) {
    return round.stage === 'guess' ? round.correctId : null;
  },

  score(round, answers, ctx) {
    if (round.stage === 'collect') {
      return {
        correct: null,
        awards: {},
        fooled: [],
        subjectId: null,
        bluffer: null,
        reveal: { headline: 'Answers locked in!', detail: 'Moving to the next question…' },
      };
    }

    const awards = {};
    const fooled = [];
    const winners = [];
    for (const [gid, choice] of Object.entries(answers || {})) {
      if (gid === round.subjectId) continue;
      if (choice === round.correctId) {
        awards[gid] = (awards[gid] || 0) + 3;
        winners.push(gid);
      } else if (choice) {
        fooled.push(gid);
      }
    }
    if (winners.length) {
      awards[round.subjectId] = (awards[round.subjectId] || 0) + 1;
    } else if (fooled.length) {
      awards[round.subjectId] = (awards[round.subjectId] || 0) + 2;
    }

    const optionMeta = {};
    for (const e of round.entries || []) {
      const pickedBy = Object.entries(answers || {})
        .filter(([, c]) => c === e.id)
        .map(([gid]) => ctx.guests.find((g) => g.id === gid)?.name || gid);
      optionMeta[e.id] = {
        badge: e.kind === 'real' ? `✓ ${round.subjectName.toUpperCase()}'S REAL ANSWER` : `🤖 AI GENERATED #${e.aiIndex}`,
        badgeKind: e.kind === 'real' ? 'real' : 'ai',
        pickedBy,
      };
    }

    const pickedLabels = fooled.map((gid) => {
      const gName = ctx.guests.find((g) => g.id === gid)?.name || 'They';
      const chosen = (round.entries || []).find((e) => e.id === answers[gid]);
      return chosen ? `${gName} fell for AI Decoy ${chosen.letter}` : `${gName} missed`;
    });

    const winnerNames = winners.map((gid) => ctx.guests.find((g) => g.id === gid)?.name).filter(Boolean).join(' & ');

    return {
      correct: round.correctId,
      awards,
      fooled,
      subjectId: round.subjectId,
      bluffer: fooled.length ? round.subjectId : null,
      optionMeta,
      reveal: {
        headline: winners.length
          ? `🎯 ${winnerNames} spotted ${round.subjectName}'s real answer! (+3 pts)`
          : `🤖 Fooled by the AI! (+2 pts to ${round.subjectName})`,
        detail: `${round.subjectName}'s real answer was: “${round.realAnswerText}”. ${pickedLabels.length ? pickedLabels.join(' · ') + '!' : 'All 5 AI decoys were exposed!'}`,
      },
    };
  },

  narration: {
    intro: () => 'Game one: Real or A I! First, answer three questions in your own words. Then take turns facing five A I generated decoys and one real answer—and try to spot which is real!',
    round: (r) => {
      if (r.stage === 'collect') {
        return `Question ${r.questionIndex + 1}: ${r.questionObj.prompt} Type your real answer on your controller now!`;
      }
      return `Turn ${r.turnNumber}: ${r.guesserNames}, five of these answers were written by A I and only one was really written by ${r.subjectName}. Which one is real?`;
    },
    reveal: (_r, res) => `${res.reveal.headline}`,
  },
});
