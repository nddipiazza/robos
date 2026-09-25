'use strict';

/**
 * 50+ Casual, fun, and varied wake-word greetings for RobOS Voice Assistant.
 * User-configurable in ~/.config/robos/voice-prompt-prefs.json
 */
const DEFAULT_GREETINGS = [
  "Go ahead.",
  "I hear you, what's up?",
  "Listening, shoot.",
  "Talk to me.",
  "Ready when you are.",
  "What's on your mind?",
  "I'm all ears.",
  "How can I help?",
  "At your command, Lead Architect.",
  "Speak, friend, and enter.",
  "System online. What do you need?",
  "Go for it.",
  "Standing by. What's the plan?",
  "I'm listening.",
  "Right here with you.",
  "Lay it on me.",
  "What's the next mission?",
  "Awaiting your directive.",
  "Hey there, what's happening?",
  "Tell me everything.",
  "Microphone hot. Go ahead.",
  "Voice channel open.",
  "What can I do for you today?",
  "All systems nominal. Shoot.",
  "Listening closely.",
  "Ready to code.",
  "Hit me with it.",
  "Command me.",
  "Voice stream active. Go ahead.",
  "What's breaking?",
  "Ready to automate.",
  "Got your back. What's up?",
  "Say the word.",
  "Here and listening.",
  "At the ready.",
  "What's our next task?",
  "Channel open, go ahead.",
  "I'm locked in. What's up?",
  "Listening live.",
  "Ready for input.",
  "I've got your signal.",
  "Ready when you call.",
  "Listening in, Lead Architect.",
  "System listening, fire away.",
  "Online and ready.",
  "What are we building?",
  "Hit the deck, what's the plan?",
  "Speech recognition online. Go.",
  "Talk to the terminal.",
  "Your wish is my command.",
  "Listening for instructions.",
  "Prompt receiver active. Speak.",
  "Hey, what's the status?",
  "Always ready for you.",
  "Audio linked. What's up?",
];

/**
 * Pick a random greeting from the configured list or defaults
 * @param {string[]} customList
 * @returns {string}
 */
function getRandomGreeting(customList) {
  const list = (Array.isArray(customList) && customList.length > 0)
    ? customList
    : DEFAULT_GREETINGS;
  const index = Math.floor(Math.random() * list.length);
  return list[index] || "I hear you, what's up?";
}

module.exports = {
  DEFAULT_GREETINGS,
  getRandomGreeting,
};
