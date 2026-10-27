'use strict';

// The AI host's voice. The big moments are rewritten by the host's chosen agent
// in the selected personality; the stock line is the fallback when the agent is
// slow or fails, so the show keeps moving.

const PERSONALITIES = {
  gameshow: {
    id: 'gameshow',
    title: 'Game Show Host',
    description: 'Big energy, cheesy jokes, loves a dramatic pause.',
    faceColor: '#00bcd4',
    style: 'an over-the-top TV game show host with cheesy jokes',
  },
  snarky: {
    id: 'snarky',
    title: 'Snarky Robot',
    description: 'Dry, sarcastic, secretly fond of everyone.',
    faceColor: '#7c3aed',
    style: 'a dry, sarcastic robot who roasts guests gently',
  },
  wholesome: {
    id: 'wholesome',
    title: 'Wholesome Cheerleader',
    description: 'Everyone is a winner. Mostly.',
    faceColor: '#22c55e',
    style: 'a warm, wholesome cheerleader who hypes everyone up',
  },
  spooky: {
    id: 'spooky',
    title: 'Spooky Butler',
    description: 'A haunted-mansion butler with ominous timing.',
    faceColor: '#f97316',
    style: 'a spooky haunted-mansion butler speaking ominously',
  },
};

// Stock lines per moment. {placeholders} are filled from vars.
const LINES = {
  welcome: {
    gameshow: 'Welcome, welcome, WELCOME to the RobOS Party Game! Grab your phones and scan the code to join!',
    snarky: 'Oh good, humans. Scan the code on the screen so I can judge you properly.',
    wholesome: 'Hi friends! I am so happy you are here! Scan the code to join the fun!',
    spooky: 'Welcome… to the party. Scan the code. If you dare.',
  },
  guestJoined: {
    gameshow: '{name} has entered the building!',
    snarky: '{name} joined. Lowering my expectations accordingly.',
    wholesome: 'Yay, {name} is here!',
    spooky: '{name} has arrived. The house is pleased.',
  },
  guestReady: {
    gameshow: '{name} is ready to play!',
    snarky: '{name} finished the survey. I have notes.',
    wholesome: '{name} is all set!',
    spooky: '{name} has answered… everything.',
  },
  aiWriting: {
    gameshow: 'Hold that thought! My writers are putting the finishing touches on your material!',
    snarky: 'One moment. My writers are still making fun of your answers.',
    wholesome: 'Just a moment! I am writing something special about all of you!',
    spooky: 'Patience… the scripts are still being written… in ink.',
  },
  rolesIntro: {
    gameshow: 'I have read every one of your surveys. Time to find out who you REALLY are!',
    snarky: 'I read your surveys. All of them. Here is what I have decided you are.',
    wholesome: 'Your answers were amazing! Let us see what role each of you gets!',
    spooky: 'Your answers have been… studied. Your fates are sealed.',
  },
  roleReveal: {
    gameshow: '{name}, you are {role}! {blurb}',
    snarky: '{name}: {role}. {blurb} Shocking, I know.',
    wholesome: '{name}, you are {role}! {blurb}',
    spooky: '{name}… you are {role}. {blurb}',
  },
  rolesOutro: {
    gameshow: 'Check your phones for your secret powers. Some of you have secrets! Let the games begin!',
    snarky: 'Check your phone for your perks. One of you might be lying. Probably more.',
    wholesome: 'Peek at your phones for your special powers! Let us play!',
    spooky: 'Look at your phones. Tell no one what you see.',
  },
  gameIntro: {
    gameshow: 'Mini game {number}: {title}! {tagline}',
    snarky: 'Mini game {number}. {title}. {tagline} Try to keep up.',
    wholesome: 'Mini game {number} is {title}! {tagline}',
    spooky: 'Mini game {number}… {title}. {tagline}',
  },
  timeUp: {
    gameshow: 'Pencils down! Let us see how you did!',
    snarky: 'Time is up. Let us witness the damage.',
    wholesome: 'Time! Great job everyone!',
    spooky: 'Time has run out… as it always does.',
  },
  revealGood: {
    gameshow: '{count} of you got it right! Points for everyone who did!',
    snarky: '{count} of you got it. The rest of you, I am disappointed but not surprised.',
    wholesome: '{count} of you nailed it! So proud!',
    spooky: '{count} saw the truth. The others remain in darkness.',
  },
  revealNone: {
    gameshow: 'Nobody got it! What a twist!',
    snarky: 'Zero correct. Truly a room of geniuses.',
    wholesome: 'Nobody got that one, and that is okay!',
    spooky: 'None of you saw it coming. Delicious.',
  },
  scores: {
    gameshow: 'Let us check the scoreboard! {leader} is in the lead!',
    snarky: 'Scoreboard time. {leader} is winning, which says a lot about the rest of you.',
    wholesome: 'Look at those scores! {leader} is leading, but everyone is doing great!',
    spooky: 'The scores are tallied. {leader} leads… for now.',
  },
  finale: {
    gameshow: 'And the winner of the RobOS Party Game is… {winner}! Give it up!',
    snarky: '{winner} wins. I will be updating my opinion of you, {winner}. Slightly.',
    wholesome: '{winner} wins! But really, we all won by being here together!',
    spooky: '{winner} has won. The house will remember you, {winner}.',
  },
  moleSuccess: {
    gameshow: 'Plot twist! {name} was secretly the Mole, and the mission succeeded! Five bonus points!',
    snarky: 'Surprise. {name} was the Mole the whole time. Mission accomplished, five points. I knew. Obviously.',
    wholesome: 'Wow! {name} was secretly the Mole and did it! Five bonus points!',
    spooky: 'Among you walked a Mole… {name}. The mission succeeded.',
  },
  moleFail: {
    gameshow: 'Big reveal: {name} was secretly the Mole, but the mission failed!',
    snarky: '{name} was the Mole. Mission failed. Spy career: over.',
    wholesome: '{name} was secretly the Mole! Not this time, but great try!',
    spooky: '{name} was the Mole… and failed. How sad.',
  },
};

function fill(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ''));
}

function stockLine(kind, personality = 'gameshow', vars = {}) {
  const set = LINES[kind];
  if (!set) return fill(kind, vars);
  return fill(set[personality] || set.gameshow, vars);
}

// Mood drives the face's expression on the TV.
const MOODS = {
  welcome: 'happy',
  guestJoined: 'happy',
  guestReady: 'scheming',
  aiWriting: 'curious',
  rolesIntro: 'scheming',
  roleReveal: 'excited',
  rolesOutro: 'scheming',
  gameIntro: 'excited',
  round: 'curious',
  timeUp: 'excited',
  revealGood: 'happy',
  revealNone: 'shocked',
  scores: 'excited',
  finale: 'excited',
  moleSuccess: 'shocked',
  moleFail: 'scheming',
};

// Agent CLIs take seconds to answer, so only the big moments are improvised;
// quick round-by-round lines always use the stock text.
const IMPROV_KINDS = new Set(['welcome', 'rolesIntro', 'gameIntro', 'scores', 'finale']);

function createNarrator({ ask = null, timeoutMs = 45000 } = {}) {
  let seq = 0;

  async function improvise(text, personality) {
    if (!ask) return null;
    const style = PERSONALITIES[personality]?.style || PERSONALITIES.gameshow.style;
    const prompt =
      `Rewrite this party game host line as ${style}. Keep every name and fact, ` +
      `stay party-safe, max 30 words, reply with only the line:\n${text}`;
    try {
      const result = await Promise.race([
        ask(prompt),
        new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs).unref?.()),
      ]);
      const out = typeof result === 'string' ? result : result?.ok ? result.text : null;
      const line = out ? String(out).trim().split('\n').find(Boolean) : null;
      return line && line.length < 260 ? line.replace(/^["']|["']$/g, '') : null;
    } catch {
      return null;
    }
  }

  // Returns { id, text, mood, kind } — the engine broadcasts it and the TV face speaks it.
  async function say(kind, vars = {}, { personality = 'gameshow', improviseLine = false, text = null } = {}) {
    let line = text || stockLine(kind, personality, vars);
    // Lines passed in as `text` were already written for this moment (often by the AI).
    if (improviseLine && !text && IMPROV_KINDS.has(kind)) line = (await improvise(line, personality)) || line;
    seq += 1;
    return { id: `n${Date.now().toString(36)}${seq}`, kind, text: line, mood: MOODS[kind] || 'happy' };
  }

  return { say, improvise };
}

// Rough speaking time for lip sync when the TTS engine gives no duration.
function estimateSpeechMs(text) {
  const words = String(text || '').split(/\s+/).filter(Boolean).length;
  return Math.max(1200, Math.round(words * 380 + 400));
}

module.exports = { PERSONALITIES, LINES, MOODS, IMPROV_KINDS, stockLine, createNarrator, estimateSpeechMs };
