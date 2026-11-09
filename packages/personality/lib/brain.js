'use strict';

// The model part of a personality: turns what it heard (and saw) into a prompt
// for the chosen AI agent, and the agent's answer into words to say and a mood
// for the face.

const MOODS = ['happy', 'excited', 'curious', 'thinking', 'surprised', 'sad', 'calm'];
const MAX_SPOKEN_CHARS = 700;
const PROMPT_TURNS = 12;

function buildPrompt({ personality, history = [], message, viaEars = false, sight = null, now = new Date() }) {
  const lines = [];
  lines.push(`You are ${personality.name}, a character the user talks to out loud on a RobOS computer.`);
  lines.push(`Who ${personality.name} is: ${personality.persona}`);
  lines.push('');
  lines.push('How to answer:');
  lines.push('- Your words are spoken by a voice and shown as captions under your animated face, so talk the way a person speaks.');
  lines.push('- Keep it short: one to three sentences unless the user asks for more.');
  lines.push('- No markdown, lists, code blocks, links or emoji.');
  lines.push(`- Start your answer with one mood tag in square brackets, chosen from: ${MOODS.join(', ')}. Example: [happy] Hi there!`);
  lines.push('- Answer only with what you say. Do not run commands or change files.');
  if (viaEars) {
    lines.push('- The user spoke and speech recognition wrote it down, so it may contain mistakes. If it makes no sense, ask them to say it again.');
  }
  if (sight && sight.file) {
    lines.push(`- You can see through the camera "${sight.cameraName}". The picture in the file ${sight.file} in the current directory is what you see right now. Look at it when the user asks about what you see or when it helps your answer; otherwise do not describe it.`);
  } else {
    lines.push('- You cannot see right now. If the user asks what you see, say your eyes are not connected.');
  }
  lines.push(`- It is ${now.toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' })}.`);

  const recent = history.slice(-PROMPT_TURNS);
  if (recent.length) {
    lines.push('');
    lines.push('The conversation so far:');
    for (const t of recent) {
      lines.push(`${t.role === 'user' ? 'User' : personality.name}: ${String(t.text || '').replace(/\s+/g, ' ').trim()}`);
    }
  }
  lines.push('');
  lines.push(`User: ${String(message || '').trim()}`);
  lines.push(`${personality.name}:`);
  return lines.join('\n');
}

/** Turns the agent's answer into { mood, say } with only speakable text. */
function parseReply(raw, personalityName = '') {
  let text = String(raw || '').trim();
  // Some CLIs echo the speaker label back.
  if (personalityName) {
    const label = new RegExp(`^${personalityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*`, 'i');
    text = text.replace(label, '');
  }
  let mood = 'happy';
  const tag = /^\s*\[([a-z]+)\]\s*/i.exec(text);
  if (tag) {
    const m = tag[1].toLowerCase();
    if (MOODS.includes(m)) mood = m;
    text = text.slice(tag[0].length);
  }
  // Mood tags in the middle of an answer are dropped too.
  text = text.replace(new RegExp(`\\[(?:${MOODS.join('|')})\\]`, 'gi'), '');
  text = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/(\*\*|__|\*|_)(\S[^*_]*?)\1/g, '$2')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length > MAX_SPOKEN_CHARS) {
    const cut = text.slice(0, MAX_SPOKEN_CHARS);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    text = end > 200 ? cut.slice(0, end + 1) : `${cut.trim()}…`;
  }
  return { mood, say: text };
}

/**
 * A stand-in model for tests and demos (PERSONALITY_TEST_BRAIN=1): answers
 * from the message itself, so the whole talk loop runs without an agent CLI.
 */
function testReply({ personality, message, sight }) {
  const m = String(message || '').trim();
  if (/what do you see|can you see/i.test(m)) {
    return sight ? `[curious] I am looking through ${sight.cameraName}. It is a test picture, so I will keep my guesses to myself.`
      : '[calm] My eyes are not connected yet. Pick a camera under Eyes and I can look.';
  }
  if (/^(hi|hello|hey)\b/i.test(m)) return `[excited] Hello! I am ${personality.name}. It is nice to hear from you.`;
  return `[happy] You said: ${m}. I am the test brain, so that is all I can do for now.`;
}

module.exports = { buildPrompt, parseReply, testReply, MOODS, PROMPT_TURNS, MAX_SPOKEN_CHARS };
