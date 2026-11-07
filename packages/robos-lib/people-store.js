'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ASSETS_PHOTOS_DIR = path.resolve(__dirname, '..', 'people-directory', 'assets', 'photos');

function getConfigDir(configDir) {
  return configDir || process.env.ROBOS_CONFIG_DIR || path.join(process.env.HOME || os.homedir(), '.config', 'robos');
}

function getPeopleDir(configDir) {
  return path.join(getConfigDir(configDir), 'people');
}

function getPhotosDir(configDir) {
  return path.join(getPeopleDir(configDir), 'photos');
}

const DEFAULT_HOUSE_PROFILE = {
  'home-type': 'house',
  spaces: ['living-room', 'kitchen', 'dining-room', 'basement', 'home-office'],
  'spaces-detail': 'Clean, orderly living room with PS5 co-op setup and big TV; spotless kitchen with strict food-handling zones; music & office space with Rock Invasion drumsticks, dual monitors, and stacks of fantasy and romance books.',
  special: 'PS5 with Baldur\'s Gate 3 co-op campaign (Illusionist Wizard + Oath of the Ancients Paladin), Rock Invasion drum gear, towering shelves of romance and fantasy novels, and Polyphia instrumental metal on the speakers (strictly zero female vocals).',
  games: ['video-game-console', 'board-games', 'card-games'],
  'games-detail': 'PS5 with Baldur\'s Gate 3 co-op in the living room, tabletop RPG dice, and RobOS Party Game on the big screen.',
  crafts: ['paper', 'markers-crayons', 'sticky-notes', 'tape'],
  'crafts-detail': 'Sticky notes for 10-minute patience timers, drumsticks, D20 dice, and fantasy books for dramatic readings.',
  tech: ['bluetooth-speaker', 'smart-lights', 'extra-tvs', 'laptop-tablet'],
  vibe: 'late-night',
  'off-limits': 'Leaving toilet lids up, unwashed hands in the kitchen, any music track with female vocals, or making an unnecessary mess.',
  'house-extra': 'Two distinctive personalities coexisting: Nick brings spontaneity and outrageous "Would Diana Survive?" hypotheticals; Diana brings order, predictability, and surgical adaptability.',
};

const DEFAULT_PROFILES = [
  {
    uid: 'nicholas-dipiazza',
    displayName: 'Nicholas DiPiazza',
    firstName: 'Nicholas',
    lastName: 'DiPiazza',
    nickname: 'Nick',
    username: 'ndipiazza',
    pronouns: 'he/him',
    ageRange: '40s',
    email: 'ndipiazza@robos.local',
    phone: '',
    location: 'Madison, WI',
    title: 'Principal Software Engineer · Java, IT & DevOps Expert',
    department: 'Engineering & Rock Invasion',
    manager: '',
    groups: ['Engineering', 'Rock Invasion', 'Game Night', 'Household'],
    avatar: '🧙‍♂️',
    color: '#00bcd4',
    photo: 'photos/nicholas-dipiazza.jpg',
    photos: [
      {
        id: 'nick-main',
        url: 'photos/nicholas-dipiazza.jpg',
        caption: 'Nicholas — Pragmatic Engineer, Illusionist Wizard & Rock Invasion Drummer',
      },
    ],
    bio: 'Pragmatic, analytical software engineer in his 40s (Java expert, IT expert, DevOps & Linux systems), drummer in the band Rock Invasion, and involved dad to Bella, Leo, and Viv. Loves RPGs and plays an Illusionist Wizard in co-op Baldur\'s Gate 3 on PS5 with Diana.',
    personality: {
      archetype: 'The Pragmatic, Loudmouthed Engineer',
      tagline: 'Spontaneity and irreverence — wants things to work without turning everyday life into a procedure.',
      traits: [
        'Pragmatic',
        'Analytical',
        'Loud & Irreverent',
        'Playfully Provocative',
        'Impatient',
        'Self-Aware',
        'Spontaneous',
      ],
      quirks: [
        'Brings an analytical engineering mindset into everyday life — naturally breaks problems down and looks for logical solutions',
        'Enjoys profanity, inappropriate humor, outrageous "Would Diana Survive?" hypotheticals, and being playfully immature for entertainment value',
        'Likes getting reactions out of people, particularly Diana — sometimes the reaction itself is half the fun',
        'Uses a 10-minute response timer to distinguish genuine patience from the desire for an immediate answer',
        'Learned to let Diana finish cleaning something immediately rather than turning her particularity into a conflict',
      ],
      petPeeves: [
        'Unnecessary complications, inefficiency, and bullshit',
        'Turning everyday life into a rigid procedure',
        'Getting bogged down in particular details that do not functionally matter',
        'A relationship that exists only in the leftover moments after everyone else\'s needs are addressed',
      ],
      boundaries: [
        'Needs to feel treated reasonably — does not need someone to think like him, just fairness and mutual respect',
        'Values affection, shared experiences, physical intimacy, and uninterrupted meaningful time together',
        'Does not want patience to become indefinite postponement of his own needs',
      ],
      adaptability: 'Self-aware that his irritation and impatience can be counterproductive; actively works on how he responds and appreciates Diana\'s quirks without needing to adopt them.',
      communicationStyle: 'Direct, candid, analytical, and irreverent — values straightforward communication while practicing patience.',
    },
    interests: {
      expertTopics: [
        'Java Software Engineering & JVM Architecture',
        'IT Infrastructure, Linux & DevOps',
        'Computers & Autonomous Agent Systems',
        'Baldur\'s Gate 3 Illusionist Wizard Tactics',
        'Rock Drumming & Live Band Groove',
      ],
      hobbies: [
        'Drummer in the band Rock Invasion',
        'Co-op Baldur\'s Gate 3 on PS5 with Diana',
        'cRPGs and Tabletop RPGs',
        'Inventing outrageous "Would Diana Survive?" scenarios',
      ],
      musicLikes: [
        'Rock & Hard Rock',
        'Live Band Drumming (Rock Invasion)',
        'Progressive & Classic Rock',
      ],
      musicDislikes: [
        'Over-engineered soulless elevator pop',
      ],
      favoriteBands: [
        'Rock Invasion (Drummer)',
      ],
      booksAndGenres: [
        'Sci-Fi & Fantasy',
        'RPG Lore & Rulebooks',
        'Systems & Software Architecture',
      ],
      gamesAndPlatforms: [
        'Baldur\'s Gate 3 (PS5 Co-op — Illusionist Wizard)',
        'Role-Playing Games (RPGs)',
        'RobOS Party Game',
      ],
      foodAndTextureNotes: 'Pragmatic eater — zero hesitation around food textures that would trigger Diana\'s surgical dissection protocol.',
      environmentPreferences: 'Relaxed, spontaneous, unconstrained spaces with room for humor, music, and real connection.',
    },
    family: {
      partnerUid: 'diana-arrington',
      partnerName: 'Diana Arrington',
      children: ['Bella', 'Leo', 'Viv'],
      householdRoutines: 'Seeks freedom from unnecessary constraints; gives Diana space to run her cleanliness routines without making it a battle.',
      relationshipDynamic: 'Spontaneity & irreverence (Nick) meets Order & predictability (Diana). He pushes boundaries; she establishes them. They aren\'t trying to become the same kind of person — they\'re figuring out how two distinctive personalities can coexist, enjoy each other, and not drive each other completely insane.',
      sharedActivities: [
        'Baldur\'s Gate 3 Co-op on PS5 (Illusionist Wizard + Oath of the Ancients Paladin)',
        '"Would Diana Survive?" hypothetical comedy nights',
        'Uninterrupted quality time together',
        'RobOS Game Night',
      ],
    },
    gameProfile: {
      gamerTag: 'IllusionistNick',
      avatar: '🧙‍♂️',
      color: '#00bcd4',
      rpgCharacter: {
        game: 'Baldur\'s Gate 3 (PS5 Co-op)',
        characterClass: 'Wizard',
        subclass: 'Illusionist',
        platform: 'PS5',
        playstyle: 'Manipulating the battlefield with clever spells, misdirection, and arcane control while Diana holds the front line.',
        blurb: 'Illusionist Wizard & Rock Invasion Drummer — casts Minor Illusion just to see Diana\'s reaction.',
      },
      favoriteGames: [
        'Baldur\'s Gate 3',
        'Realm of Heroes cRPG',
        'Tabletop RPGs',
        'RobOS Party Game',
      ],
      partyGame: {
        enabled: true,
        preferredRole: 'wildcard',
        surveyAnswers: {
          'party-arrival': 'dj',
          competitive: 4,
          'secret-talent': 'Drummer in the band Rock Invasion and can debug a Java production system in minutes',
          superpower: 'time',
          'group-chat': 'memes',
          hobby: 'Playing drums in Rock Invasion and Baldur\'s Gate 3 PS5 co-op with Diana',
          'fav-show': 'Sci-fi, irreverent comedies, and co-op couch nights with Diana',
          music: 'Rock Invasion (drummer!) and classic/hard rock',
          'expert-topic': 'Java engineering, IT, DevOps, computers, and Baldur\'s Gate 3 Wizard builds',
          travel: 'A spontaneous trip with zero rigid procedures or spreadsheets',
          'worst-job': 'Fixing over-complicated legacy systems wrapped in corporate red tape',
          embarrassing: 'Pushed a joke too far in public and earned Diana\'s legendary death stare',
          'rule-breaker': 4,
          'guilty-pleasure': 'Inventing outrageous "Would Diana Survive?" cleanliness hypotheticals',
          zombie: 'engineer',
          spontaneous: 5,
          'dinner-guest': 'Swen Vincke (Baldur\'s Gate 3 director) or Neil Peart',
          storytelling: 4,
        },
        customFacts: [
          {
            id: 'nick-fact-band',
            prompt: 'What band do they play in?',
            answer: 'Drummer in the band Rock Invasion',
            text: 'Is the drummer in the band Rock Invasion.',
            interest: true,
          },
          {
            id: 'nick-fact-bg3',
            prompt: 'What is their Baldur\'s Gate 3 co-op character?',
            answer: 'Illusionist Wizard on PS5 co-op with Diana',
            text: 'Plays an Illusionist Wizard in Baldur\'s Gate 3 PS5 co-op, manipulating the battlefield while Diana tanks as a Paladin.',
            interest: true,
          },
          {
            id: 'nick-fact-hypotheticals',
            prompt: 'What is their favorite game to play with Diana?',
            answer: 'Pitching outrageous "Would Diana Survive?" hypothetical scenarios',
            text: 'Knows the exact hypothetical scenario that would horrify Diana and pitches "Would Diana Survive?" scenarios for the reaction.',
            interest: false,
          },
          {
            id: 'nick-fact-timer',
            prompt: 'What engineering trick do they use to practice patience?',
            answer: 'A 10-minute response timer',
            text: 'Uses a 10-minute response timer to distinguish patience from wanting an immediate answer.',
            interest: false,
          },
          {
            id: 'nick-fact-tech',
            prompt: 'What is their technical wheelhouse?',
            answer: 'Java expert, IT expert, DevOps, and computers in general',
            text: 'Is a pragmatic Java, IT, and DevOps software engineer with zero patience for unnecessary complications.',
            interest: true,
          },
        ],
        customTrivia: [
          {
            interest: 'Baldur\'s Gate 3 Illusionist Wizard',
            question: 'In Baldur\'s Gate 3, what special upgrade does an Illusionist Wizard get at Level 2 with Improved Minor Illusion?',
            choices: [
              'Cast Minor Illusion as a Bonus Action while remaining hidden',
              'Wear heavy Paladin armor without penalty',
              'Double all fire spell damage',
              'Summon two permanent skeleton archers',
            ],
            answer: 0,
            funFact: 'School of Illusion Wizards cast Minor Illusion as a bonus action without breaking stealth — ideal for battlefield mischief!',
          },
          {
            interest: 'Java & Software Engineering',
            question: 'In the Java Virtual Machine (JVM), which garbage collector became the default in Java 9 to balance throughput and predictable pause times?',
            choices: [
              'G1 (Garbage-First) Collector',
              'Serial Garbage Collector',
              'CMS (Concurrent Mark Sweep)',
              'Manual free() pointers',
            ],
            answer: 0,
            funFact: 'G1GC became the default collector in JDK 9 to keep pause times low across large multi-gigabyte heaps.',
          },
          {
            interest: 'Rock Drumming (Rock Invasion)',
            question: 'On a standard rock drum kit, which foot-operated pair of cymbals keeps the primary eighth-note pulse alongside the snare and kick?',
            choices: [
              'Hi-hat cymbals',
              'China cymbals',
              'Splash cymbals',
              'Orchestral gong',
            ],
            answer: 0,
            funFact: 'The hi-hat stand uses a spring-loaded clutch so the drummer can snap the cymbals together with their left foot or play them open and closed with sticks.',
          },
        ],
        customSuperlatives: [
          {
            superlative: 'Most likely to cast Minor Illusion in real life just to provoke a death stare from Diana',
            reason: 'He plays an Illusionist Wizard in BG3 and openly admits getting a reaction out of Diana is half the fun.',
          },
          {
            superlative: 'Most likely to invent an outrageous "Would Diana Survive?" contamination scenario in the middle of dinner',
            reason: 'He knows the exact cleanliness hypotheticals that test Diana\'s rules and loves exploring them.',
          },
          {
            superlative: 'Most likely to refactor a household chore because the procedure was "unnecessarily complicated"',
            reason: 'Pragmatic engineer to the core — zero patience for inefficiency or red tape.',
          },
        ],
        customBluffs: [
          'Insists on making a 14-page laminated spreadsheet before agreeing to any spontaneous weekend plan.',
          'Refuses to use profanity and always plays a lawful-good pacifist cleric in RPGs.',
        ],
        customQuests: [
          {
            title: 'Would Diana Survive?: Live Pitch',
            where: 'living room',
            seconds: 45,
            challenge: 'Nicholas has 20 seconds to pitch an outrageous "Would Diana Survive?" scenario; Diana has 25 seconds to explain her calm, surgical protocol for surviving it.',
            judging: 'Who won the round — Nick\'s chaos or Diana\'s protocol?',
          },
          {
            title: 'Rock Invasion vs. Polyphia Riff-Off',
            where: 'living room',
            seconds: 45,
            challenge: 'Nicholas plays a 20-second Rock Invasion drum solo on the nearest table while Diana shreds a 20-second air-guitar Polyphia riff (strictly zero female vocals!).',
            judging: 'Best musical performance',
          },
        ],
        houseDefaults: { ...DEFAULT_HOUSE_PROFILE },
      },
    },
    customProperties: [
      { section: 'Couple Dynamic', key: 'Core Philosophy', value: 'Freedom from unnecessary constraints (Spontaneity & Irreverence)' },
      { section: 'Couple Dynamic', key: 'BG3 Co-op Pairing', value: 'Illusionist Wizard (with Diana\'s Oath of the Ancients Paladin)' },
      { section: 'Personal Growth', key: 'Patience Tool', value: '10-minute response timer & letting Diana finish cleaning without making it a battle' },
      { section: 'Music & Band', key: 'Band Role', value: 'Drummer in Rock Invasion' },
      { section: 'Family', key: 'Kids', value: 'Bella, Leo, and Viv' },
    ],
  },
  {
    uid: 'diana-arrington',
    displayName: 'Diana Arrington',
    firstName: 'Diana',
    lastName: 'Arrington',
    nickname: 'Diana',
    username: 'darrington',
    pronouns: 'she/her',
    ageRange: '30s-40s',
    email: 'diana@robos.local',
    phone: '',
    location: 'Madison, WI',
    title: 'Radiologic X-Ray Technologist (Imaging Technologist)',
    department: 'Radiology & Diagnostic Imaging',
    manager: '',
    groups: ['Healthcare & Radiology', 'Book Club', 'Game Night', 'Household'],
    avatar: '🛡️',
    color: '#ec4899',
    photo: 'photos/diana-arrington.jpg',
    photos: [
      {
        id: 'diana-main',
        url: 'photos/diana-arrington.jpg',
        caption: 'Diana — Radiologic X-Ray Tech, Oath of the Ancients Paladin, Bookworm & Polyphia Fan',
      },
    ],
    bio: 'Radiologic X-ray technologist in the Madison area who takes X-rays all day and knows everything about bone anatomy, breaks, and fractures. Devoted mother, huge romance and fantasy book reader, fan of Polyphia and instrumental metal (hates female vocals!), and plays an Oath of the Ancients Paladin in Baldur\'s Gate 3 co-op on PS5 with Nicholas.',
    personality: {
      archetype: 'The Particular, Hygiene-Conscious Realist',
      tagline: 'Order and predictability — high environmental standards paired with calm, practical adaptability.',
      traits: [
        'Detail-Oriented',
        'Hygiene-Conscious',
        'Adaptable Realist',
        'Orderly & Predictable',
        'Private',
        'Observant',
        'Protective Paladin',
      ],
      quirks: [
        'Very particular about cleanliness: handwashing, food handling, toilet lids down, and preventing contamination',
        'Attentive to tiny details that other people do not even register',
        'Strong household routines and established ways of doing things',
        'Practical adaptability: if she encounters fat, a vein, or a tendon in food, she surgically isolates the offending part on the plate and continues eating',
        'If something bothers her, she quickly cleans it and moves on rather than being incapacitated by discomfort',
        'Delivers a memorable, unmistakable death stare if personal information about her is unexpectedly revealed in public',
      ],
      petPeeves: [
        'Music with female vocals (hates female vocals!)',
        'Animal fat, veins, tendons, and unpleasant textures in food',
        'Toilet lids left up, unwashed hands, and sloppy food handling',
        'Crowds and noisy, unpredictable restaurants',
        'Unexpectedly revealing private information about her in public',
      ],
      boundaries: [
        'Strong, well-defined expectations for how her immediate environment and household routines function',
        'Prefers environments where she has control and predictability over chaotic crowds',
        'Protects personal privacy in public settings',
      ],
      adaptability: 'Capable of adapting with practical realism — she has clear rules, and she also has calm, effective ways of handling violations (isolate the offending bit, clean the spot quickly, and move on).',
      communicationStyle: 'Observant, private, clear about expectations, and armed with an iconic death stare when Nick pushes a boundary.',
    },
    interests: {
      expertTopics: [
        'Human Bone Anatomy & Skeletal System',
        'Radiologic X-Ray Imaging, Breaks & Fractures',
        'Romance & Fantasy Literature',
        'Polyphia & Instrumental Progressive Metal',
        'Hygiene & Contamination Prevention',
      ],
      hobbies: [
        'Reading stacks of romance and fantasy books',
        'Listening to Polyphia and instrumental metal',
        'Playing Baldur\'s Gate 3 co-op on PS5 as an Oath of the Ancients Paladin',
        'Keeping a clean, calm, predictable home environment',
      ],
      musicLikes: [
        'Polyphia',
        'Instrumental Metal',
        'Technical Guitar Instrumentals (zero vocals)',
      ],
      musicDislikes: [
        'Music with female vocals (absolute dealbreaker)',
      ],
      favoriteBands: [
        'Polyphia',
      ],
      booksAndGenres: [
        'Romance novels',
        'Fantasy & Romantasy series',
        'Fiction (huge avid reader)',
      ],
      gamesAndPlatforms: [
        'Baldur\'s Gate 3 (PS5 Co-op — Oath of the Ancients Paladin)',
        'RobOS Party Game',
      ],
      foodAndTextureNotes: 'Sensitive to animal fat, veins, and tendons — isolates the offending piece with surgical precision and keeps eating.',
      environmentPreferences: 'Clean, orderly, predictable home environment away from crowds and noisy restaurants.',
    },
    family: {
      partnerUid: 'nicholas-dipiazza',
      partnerName: 'Nicholas DiPiazza',
      children: ['Mother with significant parenting responsibilities'],
      householdRoutines: 'Established routines for handwashing, kitchen sanitation, toilet lids, and keeping unnecessary disorder at bay.',
      relationshipDynamic: 'Order & predictability (Diana) meets Spontaneity & irreverence (Nick). She establishes the clear boundaries that Nick playfully tests, and holds the front line as a heavily armored Oath of the Ancients Paladin alongside his Illusionist Wizard in Baldur\'s Gate 3.',
      sharedActivities: [
        'Baldur\'s Gate 3 Co-op on PS5 (Oath of the Ancients Paladin + Illusionist Wizard)',
        'Answering Nick\'s "Would Diana Survive?" hypotheticals with practical realism',
        'Quiet, predictable nights in together',
        'RobOS Game Night',
      ],
    },
    gameProfile: {
      gamerTag: 'PaladinDiana',
      avatar: '🛡️',
      color: '#ec4899',
      rpgCharacter: {
        game: 'Baldur\'s Gate 3 (PS5 Co-op)',
        characterClass: 'Paladin',
        subclass: 'Oath of the Ancients',
        platform: 'PS5',
        playstyle: 'Heavily armored defender with a sacred oath to uphold — smiting enemies and keeping order while Nick casts illusions.',
        blurb: 'Oath of the Ancients Paladin & Master of Bone Radiography — can spot a hairline fracture AND Divine Smite it.',
      },
      favoriteGames: [
        'Baldur\'s Gate 3',
        'RobOS Party Game',
      ],
      partyGame: {
        enabled: true,
        preferredRole: 'detective',
        surveyAnswers: {
          'party-arrival': 'corner',
          competitive: 3,
          'secret-talent': 'Can identify any bone fracture on an X-ray instantly and surgically isolate a tendon on a dinner plate',
          superpower: 'healing',
          'group-chat': 'planner',
          hobby: 'Reading romance and fantasy books and playing an Oath of the Ancients Paladin in Baldur\'s Gate 3',
          'fav-show': 'Anything watched from a spotless couch at home instead of a crowded restaurant',
          music: 'Polyphia and instrumental metal — strictly NO female vocals',
          'expert-topic': 'Bone anatomy, X-rays, breaks, fractures, and fantasy/romance books',
          travel: 'A spotless, private retreat with zero crowds and a stack of fantasy novels',
          'worst-job': 'Anything involving crowded buffets or mystery meat textures',
          embarrassing: 'Had to deploy the ultimate death stare when Nick overshared in public',
          'rule-breaker': 1,
          'guilty-pleasure': 'Finishing an entire fantasy romance novel series in a single weekend',
          zombie: 'medic',
          spontaneous: 1,
          'dinner-guest': 'Tim Henson from Polyphia (at a spotless table at home)',
          storytelling: 1,
        },
        customFacts: [
          {
            id: 'diana-fact-xray',
            prompt: 'What is their profession and medical expertise?',
            answer: 'Radiologic X-ray technologist who knows all about bone anatomy, breaks, and fractures',
            text: 'Takes X-rays of people all day and knows everything about bone anatomy, breaks, and fractures.',
            interest: true,
          },
          {
            id: 'diana-fact-music',
            prompt: 'What is their strict music rule?',
            answer: 'Loves Polyphia and instrumental metal; hates music with female vocals',
            text: 'Loves Polyphia and instrumental metal, and hates music with female vocals.',
            interest: true,
          },
          {
            id: 'diana-fact-books',
            prompt: 'What do they love reading?',
            answer: 'Huge book reader — tons of romance and fantasy novels',
            text: 'Is a huge book reader who devours romance and fantasy novels.',
            interest: true,
          },
          {
            id: 'diana-fact-food',
            prompt: 'How do they handle animal fat, veins, or tendons in food?',
            answer: 'Surgically isolates the offending part and continues eating',
            text: 'When she encounters animal fat, veins, or tendons in food, she isolates the offending part and calmly continues eating.',
            interest: false,
          },
          {
            id: 'diana-fact-bg3',
            prompt: 'What is their Baldur\'s Gate 3 co-op class?',
            answer: 'Oath of the Ancients Paladin on PS5',
            text: 'Plays a heavily armored Oath of the Ancients Paladin in Baldur\'s Gate 3 co-op on PS5 alongside Nick\'s Illusionist Wizard.',
            interest: true,
          },
        ],
        customTrivia: [
          {
            interest: 'Bone Anatomy & X-Ray Fractures',
            question: 'Which wrist bone is the most commonly fractured carpal bone and is famous for hiding on initial X-ray views?',
            choices: [
              'Scaphoid',
              'Pisiform',
              'Hamate',
              'Patella',
            ],
            answer: 0,
            funFact: 'The scaphoid accounts for over 60% of carpal fractures and often requires a dedicated scaphoid X-ray view to spot!',
          },
          {
            interest: 'Polyphia & Instrumental Metal',
            question: 'Who is the virtuosic lead guitarist of the instrumental progressive metal band Polyphia, known for "Playing God" and "G.O.A.T."?',
            choices: [
              'Tim Henson',
              'Tosin Abasi',
              'Buckethead',
              'Joe Satriani',
            ],
            answer: 0,
            funFact: 'Tim Henson and Scott LePage lead Polyphia, blending intricate nylon and electric guitar work with zero vocals.',
          },
          {
            interest: 'Baldur\'s Gate 3 Oath of the Ancients Paladin',
            question: 'In Baldur\'s Gate 3, which Channel Oath ability does an Oath of the Ancients Paladin unlock at Level 1 to heal themselves and nearby allies?',
            choices: [
              'Healing Radiance',
              'Vow of Enmity',
              'Sacred Weapon',
              'Eldritch Blast',
            ],
            answer: 0,
            funFact: 'Healing Radiance invokes the Paladin\'s ancient oath to heal the party immediately and again at the start of the next turn!',
          },
        ],
        customSuperlatives: [
          {
            superlative: 'Most likely to surgically isolate a 2-millimeter piece of fat on their plate and calmly keep eating',
            reason: 'She hates animal fat, veins, and tendons, but adapts like a pro by isolating the offending bit and moving on.',
          },
          {
            superlative: 'Most likely to skip a song in under half a second because a female vocalist started singing',
            reason: 'Polyphia and instrumental metal only — female vocals are strictly outlawed.',
          },
          {
            superlative: 'Most likely to spot a hairline bone fracture on an X-ray AND deliver a silent death stare in the same minute',
            reason: 'Radiologic X-ray technologist by day, guardian of privacy and household order by night.',
          },
        ],
        customBluffs: [
          'Loves going to crowded standing-room-only buffet restaurants while blasting solo female pop divas.',
          'Leaves every cabinet door and toilet lid open just to embrace unpredictable household chaos.',
        ],
        customQuests: [
          {
            title: 'Paladin\'s X-Ray & Book Inspection',
            where: 'living room',
            seconds: 45,
            challenge: 'Diana picks a romance or fantasy book and reads one dramatic sentence like an Oath of the Ancients Paladin, then diagnoses which bone Nick would break first in that fantasy world.',
            judging: 'Most accurate Paladin & Radiology verdict',
          },
        ],
        houseDefaults: { ...DEFAULT_HOUSE_PROFILE },
      },
    },
    customProperties: [
      { section: 'Couple Dynamic', key: 'Core Philosophy', value: 'Freedom from unnecessary disorder (Order, Predictability & Practical Realism)' },
      { section: 'Couple Dynamic', key: 'BG3 Co-op Pairing', value: 'Oath of the Ancients Paladin (with Nick\'s Illusionist Wizard)' },
      { section: 'Music Rule', key: 'Strictly Forbidden', value: 'Music with female vocals (Polyphia & instrumental metal FTW)' },
      { section: 'Food Protocol', key: 'Texture Adaptation', value: 'Surgically isolate animal fat, veins, or tendons on the plate and continue eating' },
      { section: 'Radiology', key: 'Specialty', value: 'X-Ray Technologist — expert on every bone, break, and fracture' },
    ],
  },
];

function splitList(val) {
  if (Array.isArray(val)) return val.map((x) => String(x || '').trim()).filter(Boolean);
  if (typeof val === 'string') {
    return val
      .split(/\n|;/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizePerson(raw = {}) {
  const p = { ...raw };
  p.uid = String(p.uid || '').trim();
  p.firstName = String(p.firstName || '').trim();
  p.lastName = String(p.lastName || '').trim();
  p.displayName = String(p.displayName || p.name || '').trim() || `${p.firstName} ${p.lastName}`.trim() || p.uid;
  p.name = p.displayName;
  p.nickname = String(p.nickname || '').trim();
  p.username = String(p.username || '').trim();
  p.pronouns = String(p.pronouns || '').trim();
  p.ageRange = String(p.ageRange || '').trim();
  p.email = String(p.email || '').trim();
  p.phone = String(p.phone || '').trim();
  p.location = String(p.location || '').trim();
  p.title = String(p.title || '').trim();
  p.department = String(p.department || '').trim();
  p.manager = String(p.manager || '').trim();
  p.bio = String(p.bio || '').trim();
  p.avatar = String(p.avatar || p.gameProfile?.avatar || '').trim() || '';
  p.color = String(p.color || p.gameProfile?.color || '').trim() || '#00bcd4';
  p.photo = String(p.photo || '').trim();
  p.groups = splitList(p.groups);
  p.photos = Array.isArray(p.photos)
    ? p.photos.filter((x) => x && x.url).map((x, i) => ({
      id: String(x.id || `photo-${i + 1}`),
      url: String(x.url),
      caption: String(x.caption || ''),
    }))
    : [];
  if (p.photo && !p.photos.some((x) => x.url === p.photo)) {
    p.photos.unshift({ id: 'primary', url: p.photo, caption: `${p.displayName} profile photo` });
  }

  const pers = p.personality && typeof p.personality === 'object' ? p.personality : {};
  p.personality = {
    archetype: String(pers.archetype || '').trim(),
    tagline: String(pers.tagline || '').trim(),
    traits: splitList(pers.traits),
    quirks: splitList(pers.quirks),
    petPeeves: splitList(pers.petPeeves),
    boundaries: splitList(pers.boundaries),
    adaptability: String(pers.adaptability || '').trim(),
    communicationStyle: String(pers.communicationStyle || '').trim(),
  };

  const intr = p.interests && typeof p.interests === 'object' ? p.interests : {};
  p.interests = {
    expertTopics: splitList(intr.expertTopics),
    hobbies: splitList(intr.hobbies),
    musicLikes: splitList(intr.musicLikes),
    musicDislikes: splitList(intr.musicDislikes),
    favoriteBands: splitList(intr.favoriteBands),
    booksAndGenres: splitList(intr.booksAndGenres),
    gamesAndPlatforms: splitList(intr.gamesAndPlatforms),
    foodAndTextureNotes: String(intr.foodAndTextureNotes || '').trim(),
    environmentPreferences: String(intr.environmentPreferences || '').trim(),
  };

  const fam = p.family && typeof p.family === 'object' ? p.family : {};
  p.family = {
    partnerUid: String(fam.partnerUid || '').trim(),
    partnerName: String(fam.partnerName || '').trim(),
    children: splitList(fam.children),
    householdRoutines: String(fam.householdRoutines || '').trim(),
    relationshipDynamic: String(fam.relationshipDynamic || '').trim(),
    sharedActivities: splitList(fam.sharedActivities),
  };

  const gp = p.gameProfile && typeof p.gameProfile === 'object' ? p.gameProfile : {};
  const rpg = gp.rpgCharacter && typeof gp.rpgCharacter === 'object' ? gp.rpgCharacter : {};
  const pg = gp.partyGame && typeof gp.partyGame === 'object' ? gp.partyGame : {};
  p.gameProfile = {
    gamerTag: String(gp.gamerTag || p.nickname || p.firstName || p.displayName || '').trim(),
    avatar: String(gp.avatar || p.avatar || '🎲').trim(),
    color: String(gp.color || p.color || '#00bcd4').trim(),
    rpgCharacter: {
      game: String(rpg.game || '').trim(),
      characterClass: String(rpg.characterClass || '').trim(),
      subclass: String(rpg.subclass || '').trim(),
      platform: String(rpg.platform || '').trim(),
      playstyle: String(rpg.playstyle || '').trim(),
      blurb: String(rpg.blurb || '').trim(),
    },
    favoriteGames: splitList(gp.favoriteGames),
    partyGame: {
      enabled: pg.enabled !== false,
      preferredRole: String(pg.preferredRole || '').trim(),
      surveyAnswers: pg.surveyAnswers && typeof pg.surveyAnswers === 'object' ? { ...pg.surveyAnswers } : {},
      customFacts: Array.isArray(pg.customFacts) ? pg.customFacts : [],
      customTrivia: Array.isArray(pg.customTrivia) ? pg.customTrivia : [],
      customSuperlatives: Array.isArray(pg.customSuperlatives) ? pg.customSuperlatives : [],
      customBluffs: splitList(pg.customBluffs),
      customQuests: Array.isArray(pg.customQuests) ? pg.customQuests : [],
      houseDefaults: pg.houseDefaults && typeof pg.houseDefaults === 'object' ? { ...pg.houseDefaults } : {},
    },
  };

  p.customProperties = Array.isArray(p.customProperties)
    ? p.customProperties
      .filter((c) => c && (c.key || c.value))
      .map((c) => ({
        section: String(c.section || 'General').trim(),
        key: String(c.key || '').trim(),
        value: String(c.value || '').trim(),
      }))
    : [];

  return p;
}

function resolvePhotoDataUrl(photoRef, { configDir } = {}) {
  if (!photoRef) return null;
  const ref = String(photoRef).trim();
  if (!ref) return null;
  if (ref.startsWith('data:image/') || ref.startsWith('http://') || ref.startsWith('https://')) {
    return ref;
  }
  const peopleDir = getPeopleDir(configDir);
  const candidates = [
    path.isAbsolute(ref) ? ref : null,
    ref.startsWith('file://') ? ref.slice('file://'.length) : null,
    path.join(peopleDir, ref),
    path.join(getPhotosDir(configDir), path.basename(ref)),
    path.join(ASSETS_PHOTOS_DIR, path.basename(ref)),
  ].filter(Boolean);
  for (const fp of candidates) {
    try {
      if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        const ext = path.extname(fp).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : ext === '.svg' ? 'image/svg+xml' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        const b64 = fs.readFileSync(fp).toString('base64');
        return `data:${mime};base64,${b64}`;
      }
    } catch {}
  }
  return null;
}

function withResolvedPhotos(person, { configDir } = {}) {
  if (!person) return null;
  const p = normalizePerson(person);
  p.photoDataUrl = resolvePhotoDataUrl(p.photo, { configDir });
  p.photos = (p.photos || []).map((ph) => ({
    ...ph,
    dataUrl: resolvePhotoDataUrl(ph.url, { configDir }),
  }));
  return p;
}

function ensureDefaultProfiles(opts = {}) {
  const configDir = typeof opts === 'string' ? opts : opts?.configDir;
  const peopleDir = getPeopleDir(configDir);
  const photosDir = getPhotosDir(configDir);
  fs.mkdirSync(peopleDir, { recursive: true });
  fs.mkdirSync(photosDir, { recursive: true });

  const cfgFile = path.join(peopleDir, 'config.json');
  if (!fs.existsSync(cfgFile)) {
    fs.writeFileSync(cfgFile, JSON.stringify({ backend: 'filesystem' }, null, 2));
  }

  for (const filename of ['nicholas-dipiazza.jpg', 'diana-arrington.jpg']) {
    const src = path.join(ASSETS_PHOTOS_DIR, filename);
    const dest = path.join(photosDir, filename);
    try {
      if (fs.existsSync(src) && !fs.existsSync(dest)) {
        fs.copyFileSync(src, dest);
      }
    } catch {}
  }

  for (const def of DEFAULT_PROFILES) {
    const fp = path.join(peopleDir, `${def.uid}.json`);
    if (!fs.existsSync(fp)) {
      fs.writeFileSync(fp, JSON.stringify(normalizePerson(def), null, 2));
    }
  }

  // Ensure myProfileUid defaults to nicholas-dipiazza if unset
  try {
    const settingsFile = path.join(getConfigDir(configDir), 'settings.json');
    let settings = {};
    if (fs.existsSync(settingsFile)) {
      settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
    }
    if (!settings.myProfileUid) {
      settings.myProfileUid = 'nicholas-dipiazza';
      fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    }
  } catch {}
}

function loadAllPeople(opts = {}) {
  const configDir = typeof opts === 'string' ? opts : opts?.configDir;
  const seedDefaults = typeof opts === 'object' && opts !== null && opts.seedDefaults !== undefined ? opts.seedDefaults : true;
  const includePhotoDataUrl = typeof opts === 'object' && opts !== null && opts.includePhotoDataUrl !== undefined ? opts.includePhotoDataUrl : true;
  if (seedDefaults) ensureDefaultProfiles({ configDir });
  const peopleDir = getPeopleDir(configDir);
  fs.mkdirSync(peopleDir, { recursive: true });
  const files = fs.readdirSync(peopleDir).filter((f) => f.endsWith('.json') && f !== 'config.json');
  return files
    .map((f) => {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(peopleDir, f), 'utf8'));
        return includePhotoDataUrl ? withResolvedPhotos(raw, { configDir }) : normalizePerson(raw);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function getPerson(uid, opts = {}) {
  if (!uid) return null;
  const configDir = typeof opts === 'string' ? opts : opts?.configDir;
  const includePhotoDataUrl = typeof opts === 'object' && opts !== null && opts.includePhotoDataUrl !== undefined ? opts.includePhotoDataUrl : true;
  const fp = path.join(getPeopleDir(configDir), `${uid}.json`);
  if (!fs.existsSync(fp)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return includePhotoDataUrl ? withResolvedPhotos(raw, { configDir }) : normalizePerson(raw);
  } catch {
    return null;
  }
}

function savePerson(person, opts = {}) {
  if (!person || !person.uid) throw new Error('uid required');
  const configDir = typeof opts === 'string' ? opts : opts?.configDir;
  const peopleDir = getPeopleDir(configDir);
  fs.mkdirSync(peopleDir, { recursive: true });
  const clean = normalizePerson(person);
  delete clean.photoDataUrl;
  clean.photos = (clean.photos || []).map(({ id, url, caption }) => ({ id, url, caption }));
  fs.writeFileSync(path.join(peopleDir, `${clean.uid}.json`), JSON.stringify(clean, null, 2));
  return withResolvedPhotos(clean, { configDir });
}

function savePersonPhoto(uid, { sourcePath, dataUrl, caption = '', setPrimary = true, configDir } = {}) {
  const person = getPerson(uid, { configDir, includePhotoDataUrl: false });
  if (!person) throw new Error(`Unknown person: ${uid}`);
  const photosDir = getPhotosDir(configDir);
  fs.mkdirSync(photosDir, { recursive: true });

  let relPath = null;
  if (sourcePath && fs.existsSync(sourcePath)) {
    const ext = path.extname(sourcePath) || '.jpg';
    const filename = `${uid}-${Date.now()}${ext}`;
    fs.copyFileSync(sourcePath, path.join(photosDir, filename));
    relPath = `photos/${filename}`;
  } else if (dataUrl && /^data:image\/([a-zA-Z0-9+.-]+);base64,/.test(dataUrl)) {
    const m = /^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/.exec(dataUrl);
    const ext = m[1].includes('png') ? '.png' : m[1].includes('svg') ? '.svg' : m[1].includes('webp') ? '.webp' : '.jpg';
    const filename = `${uid}-${Date.now()}${ext}`;
    fs.writeFileSync(path.join(photosDir, filename), Buffer.from(m[2], 'base64'));
    relPath = `photos/${filename}`;
  } else {
    throw new Error('Provide sourcePath or dataUrl');
  }

  const entry = {
    id: `photo-${Date.now().toString(36)}`,
    url: relPath,
    caption: caption || `${person.displayName} photo`,
  };
  person.photos = [entry, ...(person.photos || []).filter((x) => x.url !== relPath)];
  if (setPrimary || !person.photo) person.photo = relPath;
  return savePerson(person, { configDir });
}

// Builds a rich summary string and onboarding payload for RobOS Party Game.
function buildPartyGuestProfile(person, { configDir } = {}) {
  const p = person.photoDataUrl !== undefined ? person : withResolvedPhotos(person, { configDir });
  const pg = p.gameProfile?.partyGame || {};
  const rpg = p.gameProfile?.rpgCharacter || {};
  const pers = p.personality || {};
  const intr = p.interests || {};
  const fam = p.family || {};

  const summaryParts = [];
  if (p.title) summaryParts.push(`Role/Job: ${p.title}`);
  if (pers.archetype) summaryParts.push(`Archetype: ${pers.archetype}${pers.tagline ? ` (${pers.tagline})` : ''}`);
  if (pers.traits?.length) summaryParts.push(`Traits: ${pers.traits.join(', ')}`);
  if (pers.quirks?.length) summaryParts.push(`Quirks: ${pers.quirks.join('; ')}`);
  if (pers.petPeeves?.length) summaryParts.push(`Pet peeves: ${pers.petPeeves.join('; ')}`);
  if (intr.expertTopics?.length) summaryParts.push(`Expert topics: ${intr.expertTopics.join(', ')}`);
  if (intr.musicLikes?.length || intr.musicDislikes?.length) {
    summaryParts.push(`Music: loves ${intr.musicLikes?.join(', ') || 'music'}${intr.musicDislikes?.length ? `; hates ${intr.musicDislikes.join(', ')}` : ''}`);
  }
  if (intr.booksAndGenres?.length) summaryParts.push(`Books: ${intr.booksAndGenres.join(', ')}`);
  if (rpg.game || rpg.characterClass) {
    summaryParts.push(`RPG character: ${[rpg.subclass, rpg.characterClass].filter(Boolean).join(' ')} in ${rpg.game || 'RPGs'}${rpg.playstyle ? ` (${rpg.playstyle})` : ''}`);
  }
  if (fam.partnerName) summaryParts.push(`Partner: ${fam.partnerName}`);
  if (fam.children?.length) summaryParts.push(`Family/Kids: ${fam.children.join(', ')}`);
  if (fam.relationshipDynamic) summaryParts.push(`Relationship dynamic: ${fam.relationshipDynamic}`);

  const rpgText = [rpg.subclass, rpg.characterClass].filter(Boolean).join(' ')
    + (rpg.game ? ` (${rpg.game})` : '');

  return {
    uid: p.uid,
    name: p.displayName || p.firstName || p.uid,
    shortName: p.nickname || p.firstName || p.displayName || p.uid,
    gamerTag: p.gameProfile?.gamerTag || p.nickname || p.firstName,
    title: p.title || '',
    archetype: pers.archetype || '',
    avatar: p.gameProfile?.avatar || p.avatar || '🎲',
    color: p.gameProfile?.color || p.color || '#00bcd4',
    photo: p.photo || '',
    photoDataUrl: p.photoDataUrl || null,
    rpgCharacter: rpgText.trim(),
    rpgCharacterDetail: rpg,
    preferredRole: pg.preferredRole || '',
    surveyAnswers: pg.surveyAnswers || {},
    customFacts: pg.customFacts || [],
    customTrivia: pg.customTrivia || [],
    customSuperlatives: pg.customSuperlatives || [],
    customBluffs: pg.customBluffs || [],
    customQuests: pg.customQuests || [],
    houseDefaults: pg.houseDefaults || {},
    profileSummary: summaryParts.join(' | '),
  };
}

module.exports = {
  DEFAULT_PROFILES,
  DEFAULT_HOUSE_PROFILE,
  PHOTOS_DIR: getPhotosDir(),
  getPeopleDir,
  getPhotosDir,
  normalizePerson,
  resolvePhotoDataUrl,
  withResolvedPhotos,
  ensureDefaultProfiles,
  loadAllPeople,
  getPerson,
  savePerson,
  savePersonPhoto,
  buildPartyGuestProfile,
};
