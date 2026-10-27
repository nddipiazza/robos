'use strict';

// Onboarding survey for RobOS Party Game.
//
// Every guest answers these questions when they join. Answers feed three things:
//   1. trait scores (used to assign each guest a role, see roles.js)
//   2. "facts" that mini games turn into prompts ("Who said this?")
//   3. narrator material (the host face roasts/celebrates guests by their answers)
//
// Question kinds:
//   choice  — pick one option; each option may carry trait weights
//   scale   — 1..5 slider; `traits` weights are multiplied by (value - 3)
//   text    — short free text; becomes a fact (never scored)
//
// `fact` is the sentence template used when a mini game quotes the answer.
// `{answer}` is replaced with the guest's answer text.

const TRAITS = ['bold', 'social', 'clever', 'chaotic', 'kind', 'sneaky', 'creative', 'competitive'];

const SURVEY_PACKS = {
  core: {
    id: 'core',
    title: 'The Basics',
    description: 'Who you are at a party.',
    questions: [
      {
        id: 'party-arrival',
        kind: 'choice',
        prompt: 'You arrive at a party. What do you do first?',
        options: [
          { value: 'snacks', label: 'Find the snacks', traits: { kind: 0 } },
          { value: 'host', label: 'Hug the host', traits: { social: 2, kind: 1 } },
          { value: 'corner', label: 'Scope it out from a corner', traits: { sneaky: 2, clever: 1 } },
          { value: 'dj', label: 'Take over the music', traits: { bold: 2, chaotic: 1 } },
        ],
        fact: 'The first thing they do at a party: {answer}.',
      },
      {
        id: 'competitive',
        kind: 'scale',
        prompt: 'How competitive are you at board games?',
        minLabel: 'Just here for fun',
        maxLabel: 'I will flip the table',
        traits: { competitive: 2, chaotic: 0.5 },
        fact: 'Rated their board game competitiveness {answer} out of 5.',
      },
      {
        id: 'secret-talent',
        kind: 'text',
        prompt: 'What is a hidden talent nobody here knows about?',
        placeholder: 'e.g. I can juggle oranges',
        fact: 'Has a hidden talent: {answer}.',
      },
      {
        id: 'superpower',
        kind: 'choice',
        prompt: 'Pick a superpower.',
        options: [
          { value: 'invisibility', label: 'Invisibility', traits: { sneaky: 2 } },
          { value: 'mind-reading', label: 'Mind reading', traits: { clever: 2, sneaky: 1 } },
          { value: 'flight', label: 'Flight', traits: { bold: 2 } },
          { value: 'time', label: 'Pause time', traits: { creative: 1, chaotic: 1 } },
          { value: 'healing', label: 'Healing', traits: { kind: 2 } },
        ],
        fact: 'Would pick {answer} as a superpower.',
      },
      {
        id: 'group-chat',
        kind: 'choice',
        prompt: 'In the group chat you are…',
        options: [
          { value: 'memes', label: 'The meme supplier', traits: { creative: 1, chaotic: 1, social: 1 } },
          { value: 'planner', label: 'The one who actually makes plans', traits: { clever: 1, kind: 1 } },
          { value: 'lurker', label: 'The silent lurker', traits: { sneaky: 2 } },
          { value: 'essay', label: 'The paragraph-texter', traits: { social: 2 } },
        ],
        fact: 'In the group chat they are {answer}.',
      },
    ],
  },
  interests: {
    id: 'interests',
    title: 'Interests',
    description: 'What you are into. The AI host writes trivia about it.',
    questions: [
      {
        id: 'hobby',
        kind: 'text',
        prompt: 'What hobby or interest are you really into lately?',
        placeholder: 'e.g. Sourdough baking, rock climbing',
        fact: 'Is really into {answer} lately.',
        interest: true,
      },
      {
        id: 'fav-show',
        kind: 'text',
        prompt: 'Favorite movie or TV show of all time?',
        placeholder: 'e.g. The Office',
        fact: 'Favorite movie or show: {answer}.',
        interest: true,
      },
      {
        id: 'music',
        kind: 'text',
        prompt: 'Favorite band, artist, or music genre?',
        placeholder: 'e.g. Fleetwood Mac',
        fact: 'Music taste: {answer}.',
        interest: true,
      },
      {
        id: 'expert-topic',
        kind: 'text',
        prompt: 'What topic could you talk about for an hour without notes?',
        placeholder: 'e.g. Ancient Rome, Formula 1',
        fact: 'Could talk for an hour about {answer}.',
        interest: true,
      },
      {
        id: 'travel',
        kind: 'text',
        prompt: 'Dream travel destination?',
        placeholder: 'e.g. Iceland',
        fact: 'Dream trip: {answer}.',
        interest: true,
      },
    ],
  },
  confessions: {
    id: 'confessions',
    title: 'Confessions',
    description: 'Juicy (but party-safe) stories.',
    questions: [
      {
        id: 'worst-job',
        kind: 'text',
        prompt: 'What was the weirdest job you ever had?',
        placeholder: 'e.g. Mascot at a car dealership',
        fact: 'Once worked as: {answer}.',
      },
      {
        id: 'embarrassing',
        kind: 'text',
        prompt: 'Describe a mildly embarrassing moment in under 10 words.',
        placeholder: 'e.g. Waved back at someone waving behind me',
        fact: 'Embarrassing moment: {answer}.',
      },
      {
        id: 'rule-breaker',
        kind: 'scale',
        prompt: 'How likely are you to bend the rules to win?',
        minLabel: 'Never',
        maxLabel: 'Rules are suggestions',
        traits: { sneaky: 1.5, chaotic: 1, kind: -0.5 },
        fact: 'Rated their rule-bending {answer} out of 5.',
      },
      {
        id: 'guilty-pleasure',
        kind: 'text',
        prompt: 'What is your guilty-pleasure song or show?',
        placeholder: 'e.g. Reality dating shows',
        fact: 'Guilty pleasure: {answer}.',
      },
    ],
  },
  wildcards: {
    id: 'wildcards',
    title: 'Wild Cards',
    description: 'Hypotheticals that reveal your true self.',
    questions: [
      {
        id: 'zombie',
        kind: 'choice',
        prompt: 'Zombie apocalypse. Your role?',
        options: [
          { value: 'leader', label: 'The leader of the survivors', traits: { bold: 2, social: 1 } },
          { value: 'medic', label: 'The medic', traits: { kind: 2 } },
          { value: 'engineer', label: 'The one who builds the base', traits: { clever: 2, creative: 1 } },
          { value: 'first', label: 'The first one bitten', traits: { chaotic: 2 } },
          { value: 'traitor', label: 'The one secretly hoarding supplies', traits: { sneaky: 2, competitive: 1 } },
        ],
        fact: 'In a zombie apocalypse they would be {answer}.',
      },
      {
        id: 'spontaneous',
        kind: 'scale',
        prompt: 'How spontaneous are you?',
        minLabel: 'Spreadsheet for everything',
        maxLabel: 'Booked a flight on a whim',
        traits: { chaotic: 1.5, bold: 1, clever: -0.5 },
        fact: 'Rated their spontaneity {answer} out of 5.',
      },
      {
        id: 'dinner-guest',
        kind: 'text',
        prompt: 'Any person, dead or alive, to have dinner with?',
        placeholder: 'e.g. Dolly Parton',
        fact: 'Dream dinner guest: {answer}.',
      },
      {
        id: 'storytelling',
        kind: 'scale',
        prompt: 'How much do you exaggerate when you tell a story?',
        minLabel: 'Strict facts',
        maxLabel: 'The fish was THIS big',
        traits: { creative: 2, social: 0.5 },
        fact: 'Rated their storytelling exaggeration {answer} out of 5.',
      },
    ],
  },
};

const DEFAULT_PACKS = ['core', 'interests', 'confessions', 'wildcards'];

// The party host (whoever claims "I'm the party host" first) also describes the
// house. The AI host builds real-world challenges and jokes from it, so the
// more detail the better. Kinds: choice, multi (checkboxes), text, long.
const HOUSE_SURVEY = [
  {
    id: 'home-type',
    kind: 'choice',
    required: true,
    prompt: 'What kind of place is the party at?',
    options: ['House', 'Apartment', 'Condo / townhouse', 'Cabin / vacation rental', 'Something else'].map((l) => ({ value: l.toLowerCase().replace(/[^a-z]+/g, '-'), label: l })),
  },
  {
    id: 'spaces',
    kind: 'multi',
    required: true,
    prompt: 'Which spaces can guests use for games?',
    options: ['Living room', 'Kitchen', 'Dining room', 'Backyard', 'Front yard', 'Patio / deck', 'Garage', 'Basement', 'Porch', 'Pool', 'Home office', 'Attic', 'Hallway / stairs'].map((l) => ({ value: l.toLowerCase().replace(/[^a-z]+/g, '-'), label: l })),
  },
  {
    id: 'spaces-detail',
    kind: 'long',
    required: true,
    prompt: 'Describe those spaces. What is in each one?',
    placeholder: 'Fenced backyard with a fire pit and string lights; finished basement with a couch, TV and a drum kit; two-car garage with a ping pong table…',
  },
  {
    id: 'special',
    kind: 'long',
    required: true,
    prompt: 'What is special about your place?',
    placeholder: 'Guitar amps and a bass in the basement, a hot tub, a piano, a giant inflatable flamingo, a dog named Biscuit…',
  },
  {
    id: 'games',
    kind: 'multi',
    prompt: 'Which games are in the house?',
    options: ['Board games', 'Card games', 'Video game console', 'Lawn games (cornhole, ladder toss…)', 'Ping pong', 'Pool / billiards', 'Darts', 'Foosball', 'Puzzles', 'Karaoke', 'Giant Jenga', 'Frisbee / balls'].map((l) => ({ value: l.toLowerCase().replace(/[^a-z]+/g, '-'), label: l })),
  },
  {
    id: 'games-detail',
    kind: 'long',
    prompt: 'Which games exactly, and where are they?',
    placeholder: 'Codenames, Catan and Uno in the living room cabinet; Switch with Mario Kart; cornhole boards in the garage…',
  },
  {
    id: 'crafts',
    kind: 'multi',
    prompt: 'Arts and crafts supplies you can bring out:',
    options: ['Paper', 'Markers / crayons', 'Tape', 'Scissors', 'Glue', 'Cardboard', 'Paint', 'Yarn / string', 'Sticky notes', 'Balloons', 'Aluminum foil', 'Costumes / dress-up box', 'Party hats', 'Play-Doh / clay'].map((l) => ({ value: l.toLowerCase().replace(/[^a-z]+/g, '-'), label: l })),
  },
  {
    id: 'crafts-detail',
    kind: 'long',
    prompt: 'Anything else crafty or prop-like lying around?',
    placeholder: 'A box of old Halloween costumes, wrapping paper, a bag of pool noodles…',
  },
  {
    id: 'tech',
    kind: 'multi',
    prompt: 'Tech and gear available:',
    options: ['Printer', 'Bluetooth speaker', 'Microphone', 'Projector', 'Musical instruments', 'Instant camera', 'Smart lights', 'Extra TVs', 'Laptop / tablet', 'Walkie-talkies'].map((l) => ({ value: l.toLowerCase().replace(/[^a-z]+/g, '-'), label: l })),
  },
  {
    id: 'vibe',
    kind: 'choice',
    required: true,
    prompt: 'What is the vibe tonight?',
    options: ['Chill hangout', 'Loud and rowdy', 'Family-friendly (kids around)', 'Late-night', 'Fancy dinner party'].map((l) => ({ value: l.toLowerCase().replace(/[^a-z]+/g, '-'), label: l })),
  },
  {
    id: 'off-limits',
    kind: 'long',
    prompt: 'Anything or anywhere off-limits?',
    placeholder: 'Upstairs bedrooms, the good china, the neighbors’ yard after 10pm…',
  },
  {
    id: 'house-extra',
    kind: 'long',
    prompt: 'Anything else the AI host should know about the house?',
    placeholder: 'The stairs creak, the fridge is stocked with popsicles, the cat will judge you…',
  },
];

function normalizeHouse(answers = {}) {
  const clean = {};
  for (const q of HOUSE_SURVEY) {
    const raw = answers[q.id];
    if (raw === undefined || raw === null || raw === '') continue;
    if (q.kind === 'choice') {
      if (q.options.some((o) => o.value === raw)) clean[q.id] = raw;
    } else if (q.kind === 'multi') {
      const list = (Array.isArray(raw) ? raw : [raw]).filter((v) => q.options.some((o) => o.value === v));
      if (list.length) clean[q.id] = [...new Set(list)];
    } else {
      const s = String(raw).trim().slice(0, q.kind === 'long' ? 600 : 160);
      if (s) clean[q.id] = s;
    }
  }
  return clean;
}

// complete = every required question answered; score = how much of the
// survey is filled in (long answers count more the longer they are).
function houseProgress(answers = {}) {
  const missing = HOUSE_SURVEY.filter((q) => q.required && answers[q.id] === undefined).map((q) => q.id);
  let got = 0;
  let max = 0;
  for (const q of HOUSE_SURVEY) {
    const weight = q.kind === 'long' ? 2 : 1;
    max += weight;
    const v = answers[q.id];
    if (v === undefined) continue;
    if (q.kind === 'long') got += Math.min(weight, String(v).length / 60);
    else if (q.kind === 'multi') got += Math.min(weight, v.length / 3);
    else got += weight;
  }
  return { complete: missing.length === 0, missing, percent: Math.round((got / max) * 100) };
}

function houseLabel(q, v) {
  if (q.kind === 'multi') return v.map((x) => q.options.find((o) => o.value === x)?.label || x).join(', ');
  if (q.kind === 'choice') return q.options.find((o) => o.value === v)?.label || v;
  return String(v);
}

// Prompt-friendly description of the house for the AI host.
function houseProfileText(answers = {}) {
  return HOUSE_SURVEY.filter((q) => answers[q.id] !== undefined)
    .map((q) => `${q.prompt.replace(/[?:]$/, '')}: ${houseLabel(q, answers[q.id])}`)
    .join('\n');
}

function getSurvey(packIds = DEFAULT_PACKS, customQuestions = []) {
  const questions = [];
  for (const id of packIds) {
    const pack = SURVEY_PACKS[id];
    if (pack) questions.push(...pack.questions.map((q) => ({ ...q, pack: id })));
  }
  for (const q of customQuestions || []) {
    if (q && q.id && q.prompt) questions.push({ kind: 'text', fact: '{answer}', ...q, pack: 'custom' });
  }
  return questions;
}

function answerLabel(question, value) {
  if (value === undefined || value === null || value === '') return '';
  if (question.kind === 'choice') {
    const opt = (question.options || []).find((o) => o.value === value);
    return opt ? opt.label : String(value);
  }
  return String(value).trim();
}

// Validates answers against the survey and returns the cleaned map.
// Text answers are trimmed and capped so they fit on a TV.
function normalizeAnswers(questions, answers = {}) {
  const clean = {};
  for (const q of questions) {
    const raw = answers[q.id];
    if (raw === undefined || raw === null || raw === '') continue;
    if (q.kind === 'choice') {
      if ((q.options || []).some((o) => o.value === raw)) clean[q.id] = raw;
    } else if (q.kind === 'scale') {
      const n = Math.round(Number(raw));
      if (n >= 1 && n <= 5) clean[q.id] = n;
    } else {
      const s = String(raw).trim().slice(0, 120);
      if (s) clean[q.id] = s;
    }
  }
  return clean;
}

function scoreTraits(questions, answers = {}) {
  const scores = Object.fromEntries(TRAITS.map((t) => [t, 0]));
  for (const q of questions) {
    const value = answers[q.id];
    if (value === undefined) continue;
    let weights = null;
    let mult = 1;
    if (q.kind === 'choice') {
      weights = (q.options || []).find((o) => o.value === value)?.traits;
    } else if (q.kind === 'scale') {
      weights = q.traits;
      mult = Number(value) - 3;
    }
    if (!weights) continue;
    for (const [trait, w] of Object.entries(weights)) {
      if (trait in scores) scores[trait] += w * mult;
    }
  }
  return scores;
}

// Turns a guest's answers into quotable facts for mini games.
function extractFacts(questions, answers = {}) {
  const facts = [];
  for (const q of questions) {
    const value = answers[q.id];
    if (value === undefined) continue;
    const label = answerLabel(q, value);
    if (!label) continue;
    const display = q.kind === 'choice' ? label.toLowerCase() : label;
    facts.push({
      questionId: q.id,
      kind: q.kind,
      interest: Boolean(q.interest),
      prompt: q.prompt,
      answer: label,
      text: (q.fact || '{answer}').replace('{answer}', display),
    });
  }
  return facts;
}

function surveyProgress(questions, answers = {}) {
  const answered = questions.filter((q) => answers[q.id] !== undefined).length;
  return { answered, total: questions.length, complete: questions.length > 0 && answered >= questions.length };
}

module.exports = {
  TRAITS,
  SURVEY_PACKS,
  DEFAULT_PACKS,
  HOUSE_SURVEY,
  normalizeHouse,
  houseProgress,
  houseProfileText,
  getSurvey,
  answerLabel,
  normalizeAnswers,
  scoreTraits,
  extractFacts,
  surveyProgress,
};
