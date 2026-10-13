'use strict';

/**
 * Normalizes input speech text by removing punctuation, collapsing whitespace, and lowercasing.
 */
function normalizeText(str) {
  return (str || '')
    .toLowerCase()
    .replace(/\be[\s\u2010-\u2015-]+learning\b/g, 'elearning')
    .replace(/[^\w\s()\[\]*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if transcribed text represents ambient sound, Whisper acoustic cues, or non-speech noise.
 * Examples: "(wind blowing)", "[coughing]", "(applause)", "(laughter)", "(music)", "*sigh*"
 */
function detectAmbientNoise(text) {
  const raw = (text || '').trim();
  if (!raw) return { isAmbient: true, reason: 'empty' };

  // 1. Whisper bracketed / parenthetical acoustic notations
  // e.g. (wind blowing), [wind blowing], (applause), (laughter), (music), (sighs), [cough], *clears throat*
  const acousticPattern = /^[(\[*]\s*(?:wind\s+blowing|wind|blowing|applause|laughter|laughing|music|singing|coughing|cough|sighing|sighs|sigh|snicker|groan|groaning|whispering|whisper|throat\s+clearing|clears\s+throat|background\s+noise|ambient\s+sound|ambient|silence|inaudible|white\s+noise|breeze|rustling|chatter)\s*[)\]*][.!]*$/i;
  if (acousticPattern.test(raw)) {
    return { isAmbient: true, reason: raw.replace(/^[(\[*]\s*|[)\]*][.!]*$/g, '').trim() };
  }

  // General parenthesized sound descriptions
  if (/^[(\[*][^()\[\]]{2,40}[)\]*][.!]*$/.test(raw)) {
    const inner = raw.replace(/^[(\[*]\s*|[)\]*][.!]*$/g, '').trim().toLowerCase();
    const soundWords = ['wind', 'blow', 'breeze', 'noise', 'sound', 'breath', 'sigh', 'cough', 'laugh', 'music', 'chuckle', 'static', 'buzz', 'beep', 'hum'];
    if (soundWords.some(w => inner.includes(w))) {
      return { isAmbient: true, reason: inner };
    }
  }

  // 2. Pure filler or hesitation words
  if (/^(?:um|uh|er|ah|erm|hmm|mm)[.!?]*$/i.test(raw)) {
    return { isAmbient: true, reason: 'vocal hesitation' };
  }

  return { isAmbient: false, reason: null };
}

/**
 * Tabletop Quest Editor domain skill extractor
 * Resolves commands like:
 * - "add 2 skeletons to room 1"
 * - "Add one skeleton to room 2."
 * - "place a chest in room 3"
 * - "put a spear trap at room 1"
 */
function matchTabletopSkills(text) {
  const norm = normalizeText(text);
  const raw = text.trim();
  const skills = [];

  // Match numbers in words or digits: 1, 2, one, two, three, a, an
  const wordToNum = {
    'a': 1, 'an': 1, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
    'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
  };

  // Monster keywords
  const monsterKeywords = [
    'skeleton', 'skeletons', 'goblin', 'goblins', 'orc', 'orcs',
    'zombie', 'zombies', 'mummy', 'mummies', 'fimir', 'fimirs',
    'chaos warrior', 'chaos warriors', 'gargoyle', 'gargoyles',
    'abomination', 'abominations', 'dread warrior', 'dread warriors',
    'werewolf', 'werewolves', 'witch lord'
  ];

  // Furniture keywords
  const furnitureKeywords = [
    'chest', 'chests', 'treasure chest', 'table', 'tables', 'bookcase', 'bookcases',
    'throne', 'thrones', 'cupboard', 'cupboards', 'rack', 'racks', 'torture rack',
    'fireplace', 'fireplaces', 'tomb', 'tombs', 'alchemist bench', 'sorcerer table',
    'weapons rack'
  ];

  // Trap keywords
  const trapKeywords = ['pit trap', 'pit', 'spear trap', 'spear', 'falling rock', 'rock trap', 'gas trap', 'chest trap'];

  // Door keywords
  const doorKeywords = ['door', 'doors', 'secret door', 'iron door', 'wooden door'];

  // Pattern: (add|put|place|spawn|insert) [count] [item] (in|to|at|inside) (room|tile) [target]
  // e.g., "add 2 skeletons to room 1"
  // e.g., "Add one skeleton to room 2."
  // e.g., "put a chest in room 1"

  const monsterPattern = new RegExp(
    `(?:add|put|place|spawn|insert|set)\\s+(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an)?\\s*(${monsterKeywords.join('|')})\\s+(?:in(?:to)?|to|at|inside)\\s+(?:the\\s+)?(?:room\\s+)?([a-z0-9\\-_]+)`,
    'i'
  );

  const monsterMatch = raw.match(monsterPattern);
  if (monsterMatch) {
    const rawCount = (monsterMatch[1] || '1').toLowerCase().trim();
    const count = parseInt(rawCount, 10) || wordToNum[rawCount] || 1;
    let mType = monsterMatch[2].toLowerCase().trim();
    if (mType.endsWith('ies')) mType = mType.slice(0, -3) + 'y';
    else if (mType.endsWith('s') && !mType.endsWith('ss')) mType = mType.slice(0, -1);
    mType = mType.replace(/\s+/g, '_');

    const roomRaw = monsterMatch[3].replace(/[.,!?;:]+$/g, '').trim();
    const roomNum = parseInt(roomRaw, 10) || wordToNum[roomRaw.toLowerCase()] || roomRaw;
    const roomLabel = typeof roomNum === 'number' ? `Room ${roomNum}` : `Room ${roomRaw}`;
    const roomParam = typeof roomNum === 'number' ? String(roomNum) : roomRaw;
    const monsterLabel = mType.charAt(0).toUpperCase() + mType.slice(1).replace(/_/g, ' ');

    skills.push({
      id: 'tabletop:place-monster',
      name: 'Place Monster',
      title: `Place ${count} ${monsterLabel}${count > 1 ? 's' : ''} in ${roomLabel}`,
      category: 'Tabletop Quest',
      confidence: 0.96,
      action: 'place-monster',
      params: {
        category: 'monster',
        monster: mType,
        type: mType,
        count,
        targetRoom: roomParam,
        room: roomParam,
        roomLabel,
        roomNumber: typeof roomNum === 'number' ? roomNum : null
      }
    });
    return skills;
  }

  // Furniture pattern
  const furnPattern = new RegExp(
    `(?:add|put|place|set)\\s+(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|a|an)?\\s*(${furnitureKeywords.join('|')})\\s+(?:in(?:to)?|to|at|inside)\\s+(?:the\\s+)?(?:room\\s+)?([a-z0-9\\-_]+)`,
    'i'
  );
  const furnMatch = raw.match(furnPattern);
  if (furnMatch) {
    const rawCount = (furnMatch[1] || '1').toLowerCase().trim();
    const count = parseInt(rawCount, 10) || wordToNum[rawCount] || 1;
    let fType = furnMatch[2].toLowerCase().trim();
    if (fType.endsWith('s') && !fType.endsWith('ss')) fType = fType.slice(0, -1);
    fType = fType.replace(/\s+/g, '_');
    const roomRaw = furnMatch[3].replace(/[.,!?;:]+$/g, '').trim();
    const roomNum = parseInt(roomRaw, 10) || wordToNum[roomRaw.toLowerCase()] || roomRaw;
    const roomLabel = typeof roomNum === 'number' ? `Room ${roomNum}` : `Room ${roomRaw}`;
    const roomParam = typeof roomNum === 'number' ? String(roomNum) : roomRaw;
    const furnLabel = fType.charAt(0).toUpperCase() + fType.slice(1).replace(/_/g, ' ');

    skills.push({
      id: 'tabletop:place-furniture',
      name: 'Place Furniture',
      title: `Place ${count} ${furnLabel} in ${roomLabel}`,
      category: 'Tabletop Quest',
      confidence: 0.94,
      action: 'place-furniture',
      params: {
        category: 'furniture',
        furniture: fType,
        type: fType,
        count,
        targetRoom: roomParam,
        room: roomParam,
        roomLabel,
        roomNumber: typeof roomNum === 'number' ? roomNum : null
      }
    });
    return skills;
  }

  // Trap pattern
  const trapPattern = new RegExp(
    `(?:add|put|place|set)\\s+(?:a\\s+)?(${trapKeywords.join('|')})\\s+(?:in(?:to)?|to|at)\\s+(?:the\\s+)?(?:room\\s+)?([a-z0-9\\-_]+)`,
    'i'
  );
  const trapMatch = raw.match(trapPattern);
  if (trapMatch) {
    let tType = trapMatch[1].toLowerCase().replace(/\s*trap$/i, '').trim();
    const roomRaw = trapMatch[2].replace(/[.,!?;:]+$/g, '').trim();
    const roomNum = parseInt(roomRaw, 10) || wordToNum[roomRaw.toLowerCase()] || roomRaw;
    const roomLabel = typeof roomNum === 'number' ? `Room ${roomNum}` : `Room ${roomRaw}`;
    const roomParam = typeof roomNum === 'number' ? String(roomNum) : roomRaw;
    skills.push({
      id: 'tabletop:place-trap',
      name: 'Place Trap',
      title: `Place ${tType} Trap in ${roomLabel}`,
      category: 'Tabletop Quest',
      confidence: 0.92,
      action: 'place-trap',
      params: {
        category: 'trap',
        trap: tType,
        type: tType,
        count: 1,
        targetRoom: roomParam,
        room: roomParam,
        roomLabel,
        roomNumber: typeof roomNum === 'number' ? roomNum : null
      }
    });
    return skills;
  }

  // Door pattern
  const doorPattern = new RegExp(
    `(?:add|put|place)\\s+(?:a\\s+)?(${doorKeywords.join('|')})\\s+(?:at|between|to|in)\\s+([a-z0-9\\-_\\s,]+)`,
    'i'
  );
  const doorMatch = raw.match(doorPattern);
  if (doorMatch) {
    const dType = doorMatch[1].toLowerCase().includes('secret') ? 'secret' : 'standard';
    const location = doorMatch[2].trim();
    skills.push({
      id: 'tabletop:place-door',
      name: 'Place Door',
      title: `Place ${dType === 'secret' ? 'Secret Door' : 'Door'} at ${location}`,
      category: 'Tabletop Quest',
      confidence: 0.90,
      action: 'place-door',
      params: {
        category: 'door',
        doorType: dType,
        location
      }
    });
    return skills;
  }

  return skills;
}

/**
 * RobOS SDLC Platform Skills matcher
 */
function matchPlatformSkills(text) {
  const norm = normalizeText(text);
  const raw = text.trim();
  const skills = [];

  // Add Task
  const addTaskMatch = raw.match(/^(?:add|create|new|insert)\s+(?:a\s+)?task(?:\s*[:|-]\s*|\s+for\s+|\s+to\s+|\s+)(.+)$/i)
    || raw.match(/(?:add|create)\s+(?:a\s+)?(?:work\s+item|ticket|issue)(?:\s*[:|-]\s*|\s+for\s+|\s+to\s+|\s+)(.+)$/i);
  if (addTaskMatch) {
    const title = addTaskMatch[1].trim();
    skills.push({
      id: 'add-task',
      name: 'Add Task to Project Plan',
      title: `Add Task: ${title}`,
      category: 'Project Management',
      confidence: 0.95,
      action: 'add-task',
      params: { title }
    });
    return skills;
  }

  // Open / Launch Application
  const openAppMatch = raw.match(/^(?:open|launch|start|switch\s+to|show)\s+(?:the\s+)?(?:robos\s+)?([a-z0-9\s\-]+?)(?:\s+app|\s+window)?$/i);
  if (openAppMatch) {
    const target = openAppMatch[1].trim();
    skills.push({
      id: 'open-app',
      name: 'Open RobOS Application',
      title: `Open ${target}`,
      category: 'Desktop Environment',
      confidence: 0.95,
      action: 'open-app',
      params: { target }
    });
    return skills;
  }

  // Knowledge Graph Validation
  if (norm.includes('validate knowledge graph') || norm.includes('validate kgraph') || norm.includes('check shapes')) {
    skills.push({
      id: 'kgraph-validate',
      name: 'Validate Knowledge Graph',
      title: 'Validate W3C SHACL Shape Conformity',
      category: 'Knowledge Graph',
      confidence: 0.98,
      action: 'kgraph-validate',
      params: {}
    });
    return skills;
  }

  // Knowledge Graph Search
  const kgSearchMatch = raw.match(/(?:search|find|lookup)\s+(?:the\s+)?(?:knowledge\s+graph|kgraph)\s+(?:for\s+)?(.+)/i);
  if (kgSearchMatch) {
    const query = kgSearchMatch[1].trim();
    skills.push({
      id: 'kgraph-search',
      name: 'Search Knowledge Graph',
      title: `Search Knowledge Graph for "${query}"`,
      category: 'Knowledge Graph',
      confidence: 0.94,
      action: 'kgraph-search',
      params: { query }
    });
    return skills;
  }

  // Git Status
  if (norm.includes('git status') || norm.includes('what branch') || norm.includes('git branch')) {
    skills.push({
      id: 'git-status',
      name: 'Check Git Status',
      title: 'Check Git Branch and Dirty State',
      category: 'Source Control',
      confidence: 0.95,
      action: 'git-status',
      params: {}
    });
    return skills;
  }

  // Restart Taskbar
  if (norm.includes('restart taskbar') || norm.includes('restart dock')) {
    skills.push({
      id: 'restart-taskbar',
      name: 'Restart Taskbar Dock',
      title: 'Restart Taskbar and Desktop Manager',
      category: 'System',
      confidence: 0.96,
      action: 'restart-taskbar',
      params: {}
    });
    return skills;
  }

  // Read Error Logs
  if (norm.includes('read error logs') || norm.includes('show error logs') || norm.includes('check errors')) {
    skills.push({
      id: 'read-error-logs',
      name: 'Read System Error Logs',
      title: 'Inspect Recent RobOS Failure Logs',
      category: 'Diagnostics',
      confidence: 0.95,
      action: 'read-error-logs',
      params: {}
    });
    return skills;
  }

  // Platform Status
  if (norm.includes('system status') || norm.includes('project status') || norm.includes('platform status')) {
    skills.push({
      id: 'system-status',
      name: 'RobOS Platform Status',
      title: 'Health of Core Services and Graph Packages',
      category: 'Platform Health',
      confidence: 0.92,
      action: 'system-status',
      params: {}
    });
    return skills;
  }

  return skills;
}

class SkillIntentResolver {
  constructor(options = {}) {
    this.customSkills = options.customSkills || [];
  }

  registerSkill(skillDef) {
    if (skillDef && skillDef.id) {
      this.customSkills.push(skillDef);
    }
  }

  /**
   * Resolves raw speech transcript into likely skills intended by it
   * @param {string} msg - Transcribed speech text
   * @param {object} context - Active application context, guidancePrompt, activeApp
   * @returns {{ isAmbient: boolean, ambientReason: string|null, likelySkills: Array<object> }}
   */
  resolveLikelySkills(msg, context = {}) {
    const raw = (msg || '').trim();
    if (!raw) {
      return { isAmbient: true, ambientReason: 'empty', likelySkills: [] };
    }

    // 1. Check for ambient noise / non-speech acoustic cues
    const ambientCheck = detectAmbientNoise(raw);
    if (ambientCheck.isAmbient) {
      return {
        isAmbient: true,
        ambientReason: ambientCheck.reason,
        likelySkills: []
      };
    }

    // 2. Check domain skills (e.g. Tabletop Quest Editor, active app)
    // Tabletop skills take high priority if activeApp is tabletop-quest-editor or guidance prompt mentions tabletop/quest/rpg/monsters
    const activeApp = (context.activeApp?.appId || context.activeApp || '').toLowerCase();
    const guidance = (context.guidancePrompt || '').toLowerCase();
    const isTabletopContext = activeApp.includes('tabletop') || activeApp.includes('crpg') ||
      guidance.includes('tabletop') || guidance.includes('quest') || guidance.includes('monster');

    if (isTabletopContext) {
      const tabletopSkills = matchTabletopSkills(raw);
      if (tabletopSkills.length > 0) {
        return { isAmbient: false, ambientReason: null, likelySkills: tabletopSkills };
      }
    }

    // Even if context is not explicitly tabletop, if phrasing directly matches tabletop syntax, evaluate it
    const opportunisticTabletop = matchTabletopSkills(raw);
    if (opportunisticTabletop.length > 0) {
      return { isAmbient: false, ambientReason: null, likelySkills: opportunisticTabletop };
    }

    // 3. Check RobOS SDLC Platform Skills
    const platformSkills = matchPlatformSkills(raw);
    if (platformSkills.length > 0) {
      return { isAmbient: false, ambientReason: null, likelySkills: platformSkills };
    }

    // 4. Check registered custom skills
    for (const custom of this.customSkills) {
      if (Array.isArray(custom.matchers)) {
        for (const matcher of custom.matchers) {
          if (raw.toLowerCase().includes(matcher.toLowerCase())) {
            return {
              isAmbient: false,
              ambientReason: null,
              likelySkills: [
                {
                  id: custom.id,
                  name: custom.title || custom.name || custom.id,
                  title: custom.title || custom.name || custom.id,
                  category: custom.category || 'Custom Domain',
                  confidence: 0.88,
                  action: custom.action || custom.id,
                  params: { raw }
                }
              ]
            };
          }
        }
      }
    }

    // 5. Fallback: No clear skill matched
    return {
      isAmbient: false,
      ambientReason: null,
      likelySkills: []
    };
  }
}

const defaultIntentResolver = new SkillIntentResolver();

module.exports = {
  SkillIntentResolver,
  defaultIntentResolver,
  detectAmbientNoise,
  matchTabletopSkills,
  matchPlatformSkills,
  normalizeText,
};
