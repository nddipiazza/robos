'use strict';

// Game 2: Expertise Turf War
//
// Trivia alternating between the players' areas of expertise:
//   - Anatomy, X-Ray, Bone/Fracture, Medical & Science (Diana's turf)
//   - General IT, Computer Tech, Networking, DevOps & Software (Nick's turf)
// Scoring:
//   - +1 point if you get a question right in your OWN expertise
//   - +3 points if you get a question right in the OTHER person's expertise!

const { defineMiniGame } = require('./template');

const MEDICAL_SCIENCE_QUESTIONS = [
  {
    category: 'Bone Anatomy & Trauma X-Ray',
    question: 'A patient falls onto an outstretched hand (FOOSH) and has tenderness in the "anatomical snuffbox." Which carpal bone is most notoriously fractured—and at risk of avascular necrosis?',
    choices: ['Scaphoid (Navicular)', 'Lunate', 'Pisiform', 'Hamate'],
    answer: 0,
    funFact: 'The scaphoid receives its blood supply retrograde from the radial artery, so proximal pole fractures can lose blood flow and develop avascular necrosis, often hiding on initial day-1 X-rays!',
  },
  {
    category: 'Orthopedic Fractures & Radiology',
    question: 'What is the classic difference between a Colles’ fracture and a Smith’s fracture of the distal radius?',
    choices: [
      'Colles’ has dorsal ("dinner-fork") angulation; Smith’s has volar (anterior) angulation',
      'Colles’ affects the ulna only; Smith’s affects the radius only',
      'Colles’ is a pediatric growth-plate fracture; Smith’s is a spiral tibial fracture',
      'Colles’ is an open fracture; Smith’s is a stress fracture of the calcaneus',
    ],
    answer: 0,
    funFact: 'Colles’ fractures happen when landing on an extended wrist (dorsal displacement), whereas Smith’s ("reverse Colles") fractures happen from a fall onto a flexed wrist (volar displacement).',
  },
  {
    category: 'Radiology Physics & Imaging',
    question: 'In diagnostic X-ray imaging, what is the primary effect of increasing kVp (kilovoltage peak) versus increasing mAs (milliampere-seconds)?',
    choices: [
      'kVp controls beam penetrating power and lowers image contrast; mAs controls total photon quantity and patient dose',
      'kVp only changes exposure timer length; mAs controls photon wavelength',
      'kVp sharpens focal-spot blur; mAs eliminates scatter radiation',
      'kVp and mAs are identical and interchangeable on modern digital detectors',
    ],
    answer: 0,
    funFact: 'Higher kVp produces higher-energy X-ray photons that penetrate dense bone/tissue with a wider greyscale (lower contrast), while mAs linearly determines the number of photons emitted.',
  },
  {
    category: 'Skeletal Anatomy & Science',
    question: 'A "Boxer’s fracture" seen on a hand X-ray (PA, oblique, and lateral views) is a fracture of the neck of which bone?',
    choices: [
      'The 5th metacarpal (pinky finger knuckle bone)',
      'The 1st proximal phalanx (thumb)',
      'The radial styloid process',
      'The olecranon process of the ulna',
    ],
    answer: 0,
    funFact: 'Punching a hard object with a closed fist concentrates force across the neck of the 5th metacarpal, causing apex-dorsal angulation on the lateral X-ray.',
  },
  {
    category: 'Pediatric Bone & Fracture Science',
    question: 'Why do children frequently experience "Greenstick" or "Torus (Buckle)" fractures instead of complete cortical breaks?',
    choices: [
      'Pediatric bones have a thicker, more elastic periosteum and higher collagen-to-mineral ratio',
      'Children lack bone marrow in their long bones until age 14',
      'Pediatric bones contain no calcium phosphate until puberty',
      'Growth plates fuse before birth and absorb all rotational torque',
    ],
    answer: 0,
    funFact: 'Like a young green twig, pediatric bone cortex often bends or buckles on the compression side while only partially cracking on the tension side.',
  },
  {
    category: 'Human Anatomy & Medical Science',
    question: 'On an upright PA chest X-ray, why is the beam shot Posterior-to-Anterior (PA) at a 72-inch (180 cm) SID rather than Anterior-to-Posterior (AP)?',
    choices: [
      'Placing the heart closer to the detector at 72 inches minimizes cardiac magnification',
      'X-rays cannot penetrate the sternum from the front',
      'PA projection makes the clavicles disappear completely',
      'AP projection reverses the left and right lungs on the detector',
    ],
    answer: 0,
    funFact: 'Because the heart sits anteriorly in the thorax, a PA chest X-ray puts the heart right against the detector, preventing artificial cardiomegaly from beam divergence!',
  },
];

const IT_TECH_QUESTIONS = [
  {
    category: 'Networking & Internet Architecture',
    question: 'When your computer resolves a domain name like "robos.local" or "github.com" into an IP address, which standard network port and protocol does DNS primarily use for queries?',
    choices: [
      'Port 53 (UDP/TCP)',
      'Port 443 (HTTPS)',
      'Port 22 (SSH)',
      'Port 3306 (MySQL)',
    ],
    answer: 0,
    funFact: 'DNS uses UDP Port 53 for fast low-overhead lookups and falls back to TCP Port 53 for zone transfers or responses larger than 512 bytes (without EDNS0).',
  },
  {
    category: 'Software Engineering & Web Protocols',
    question: 'In HTTP status codes, what is the exact technical difference between "401 Unauthorized" and "403 Forbidden"?',
    choices: [
      '401 means unauthenticated ("who are you?"); 403 means authenticated but lacking permission ("I know who you are, and no")',
      '401 is a server crash; 403 means the DNS server is offline',
      '401 only happens on Wi-Fi; 403 only happens on Ethernet',
      '401 means a file was deleted; 403 means the browser cache is full',
    ],
    answer: 0,
    funFact: 'Despite being named "Unauthorized", HTTP 401 actually means unauthenticated—logging in can fix a 401, whereas a 403 means your account does not have access rights.',
  },
  {
    category: 'DevOps, Linux & Containers',
    question: 'How does a Docker container differ architecturally from a traditional Virtual Machine (VM)?',
    choices: [
      'Containers share the host Linux kernel using namespaces and cgroups; VMs run a full guest OS kernel on virtualized hardware',
      'Containers require a dedicated physical CPU core per container; VMs cannot use RAM',
      'Containers only run Java code; VMs only run Windows',
      'Containers store all files in CPU L1 cache; VMs store files in BIOS',
    ],
    answer: 0,
    funFact: 'Linux namespaces isolate process IDs, mounts, and networks while cgroups meter CPU/RAM, letting containers boot in milliseconds without booting a guest kernel.',
  },
  {
    category: 'Computer Hardware & Storage',
    question: 'A server administrator configures two 2TB NVMe drives in "RAID 0" (striping) instead of "RAID 1" (mirroring). What happens if one of the two drives fails?',
    choices: [
      '100% of the data across the array is lost because RAID 0 has zero redundancy',
      'The surviving drive automatically rebuilds all 4TB of data in 30 seconds',
      'Only files starting with letters A–M are lost',
      'The computer switches to running everything out of the GPU',
    ],
    answer: 0,
    funFact: 'RAID 0 stripes blocks across both drives for maximum speed and capacity (4TB), which means the "0" in RAID 0 also stands for how many drive failures you can survive!',
  },
  {
    category: 'Java, JVM & Memory Engineering',
    question: 'In a Java application, what causes a "java.lang.OutOfMemoryError: Java heap space" even when the server still has plenty of free disk space?',
    choices: [
      'Live objects remain referenced in RAM so the Garbage Collector cannot reclaim space within the configured max heap (-Xmx)',
      'The hard drive spun too fast and overheated the motherboard',
      'The source code had too many comments in the .java files',
      'The CPU ran out of TCP ports on localhost',
    ],
    answer: 0,
    funFact: 'Garbage collection can only free unreachable objects; if a cache or collection holds references to millions of objects, the JVM heap fills up regardless of disk space.',
  },
  {
    category: 'Cybersecurity & Cryptography',
    question: 'In asymmetric (public-key) cryptography like SSH or TLS, if Diana wants to verify that a Git commit was genuinely signed by Nick, which key does she use to verify the signature?',
    choices: [
      'Nick creates the signature with his Private Key, and Diana verifies it using Nick’s Public Key',
      'Nick posts his Private Key in the public GitHub repository so everyone can share it',
      'Both of them type the same Wi-Fi password into the router at the same time',
      'Diana encrypts her hard drive with a MD5 hash of the commit message',
    ],
    answer: 0,
    funFact: 'A private key never leaves the signer (or hardware YubiKey); anyone with the corresponding public key can mathematically verify the signature was produced by that private key.',
  },
];

function findExperts(guests) {
  let medGuest = guests.find((g) => {
    const h = `${g.name} ${g.userId || ''} ${g.archetype || ''} ${g.profileSummary || ''}`.toLowerCase();
    return h.includes('diana') || h.includes('xray') || h.includes('x-ray') || h.includes('radiol') || h.includes('medical');
  });
  let itGuest = guests.find((g) => {
    const h = `${g.name} ${g.userId || ''} ${g.archetype || ''} ${g.profileSummary || ''}`.toLowerCase();
    return h.includes('nick') || h.includes('nicholas') || h.includes('java') || h.includes('software') || h.includes('engineer');
  });
  if (!medGuest && !itGuest) {
    medGuest = guests[0];
    itGuest = guests[1] || guests[0];
  } else if (!medGuest) {
    medGuest = guests.find((g) => g.id !== itGuest.id) || guests[0];
  } else if (!itGuest) {
    itGuest = guests.find((g) => g.id !== medGuest.id) || guests[0];
  }
  return { medGuest, itGuest };
}

module.exports = defineMiniGame({
  id: 'expertise-trivia',
  title: 'Expertise Turf War',
  icon: '🧠',
  tagline: 'Anatomy, X-Ray & Science vs. IT & Computer Tech. +1 on your turf, +3 to steal!',
  description: 'Questions alternate between Anatomy/Medical/Science and IT/Computer Tech. Score +1 point when you nail your own expertise—or +3 points when you get a question right in the other person’s expertise!',
  minGuests: 2,
  defaultRounds: 6,
  preserveAllRounds: true,
  answerSeconds: 30,

  async buildRounds(ctx, count = 3) {
    if (!ctx.guests.length) return [];
    const { medGuest, itGuest } = findExperts(ctx.guests);
    const pairsCount = Math.min(4, Math.max(2, Number(count) || 3)); // 3 pairs = 6 alternating rounds

    const medPool = ctx.shuffle(MEDICAL_SCIENCE_QUESTIONS).slice(0, pairsCount);
    const itPool = ctx.shuffle(IT_TECH_QUESTIONS).slice(0, pairsCount);

    const sequence = [];
    for (let i = 0; i < pairsCount; i++) {
      if (medPool[i]) {
        sequence.push({
          ...medPool[i],
          domain: 'medical',
          domainIcon: '🩻',
          domainTitle: 'Anatomy, X-Ray & Medical Science',
          domainShort: 'Anatomy & Medical',
          owner: medGuest,
          challenger: itGuest,
        });
      }
      if (itPool[i]) {
        sequence.push({
          ...itPool[i],
          domain: 'it',
          domainIcon: '💻',
          domainTitle: 'General IT, Software & Computer Tech',
          domainShort: 'IT & Computer Tech',
          owner: itGuest,
          challenger: medGuest,
        });
      }
    }

    const letters = ['A', 'B', 'C', 'D'];
    return sequence.map((item, idx) => {
      // Shuffle choices so the right answer isn't always A
      const indexedChoices = item.choices.map((label, ci) => ({ label, isCorrect: ci === item.answer }));
      const shuffledChoices = ctx.shuffle(indexedChoices);
      const correctIdx = shuffledChoices.findIndex((c) => c.isCorrect);
      const options = shuffledChoices.map((c, ci) => ({
        id: `c${ci}`,
        label: `${letters[ci]}. ${c.label}`,
      }));

      return {
        roundNumber: idx + 1,
        domain: item.domain,
        domainIcon: item.domainIcon,
        domainTitle: item.domainTitle,
        domainShort: item.domainShort,
        category: item.category,
        ownerId: item.owner.id,
        ownerName: item.owner.name,
        challengerId: item.challenger.id,
        challengerName: item.challenger.name,
        correctId: `c${correctIdx}`,
        funFact: item.funFact,
        prompt: {
          kicker: `${item.domainIcon} ${item.owner.name.toUpperCase()}’S TURF · ${item.category}`,
          headline: `${item.domainIcon} ${item.domainTitle} (${item.owner.name}: +1 pt · ${item.challenger.name}: +3 pts STEAL!)`,
          body: item.question,
          caption: `Own Turf (${item.owner.name}): +1 pt for correct answer · Challenger Turf Steal (${item.challenger.name}): +3 pts!`,
          subjectId: item.owner.id,
          inputMode: 'single',
          options,
          excludeGuestIds: [],
          layout: 'statements',
          seconds: 30,
        },
      };
    });
  },

  correctOption(round) {
    return round.correctId;
  },

  score(round, answers, ctx) {
    const awards = {};
    const awardReasons = {};
    const rightOwners = [];
    const rightStealers = [];
    const fooled = [];

    for (const [gid, choice] of Object.entries(answers || {})) {
      const gName = ctx.guests.find((g) => g.id === gid)?.name || 'Guest';
      if (choice === round.correctId) {
        if (gid === round.ownerId) {
          awards[gid] = 1;
          awardReasons[gid] = `Own Expertise (${round.domainShort})`;
          rightOwners.push(gName);
        } else {
          awards[gid] = 3;
          awardReasons[gid] = `TURF STEAL! (${round.ownerName}'s Expertise)`;
          rightStealers.push(gName);
        }
      } else if (choice) {
        fooled.push(gid);
      }
    }

    const correctLabel = round.prompt.options.find((o) => o.id === round.correctId)?.label || '';
    let headline;
    if (rightStealers.length && rightOwners.length) {
      headline = `🔥 TURF STEAL! ${rightStealers.join(' & ')} (+3 pts) AND ${rightOwners.join(' & ')} (+1 pt) both nailed it!`;
    } else if (rightStealers.length) {
      headline = `🚨 UPSET ON ${round.ownerName.toUpperCase()}’S TURF! ${rightStealers.join(' & ')} stole it for +3 pts!`;
    } else if (rightOwners.length) {
      headline = `✅ ${rightOwners.join(' & ')} defended their ${round.domainShort} turf! (+1 pt)`;
    } else {
      headline = `💥 Stumped the room! Correct answer: ${correctLabel}`;
    }

    return {
      correct: round.correctId,
      awards,
      awardReasons,
      fooled,
      subjectId: round.ownerId,
      bluffer: null,
      reveal: {
        headline,
        detail: `${correctLabel} — ${round.funFact}`,
      },
    };
  },

  narration: {
    intro: () => 'Game two: Expertise Turf War! We are alternating between Anatomy, X-Ray, and Medical Science versus I T and Computer Tech. You get one point on your own turf—or three points if you nail a question in the other person’s expertise!',
    round: (r) => `${r.ownerName}’s expertise: ${r.category}! One point for ${r.ownerName}, or three points if ${r.challengerName} steals it!`,
    reveal: (_r, res) => `${res.reveal.headline}`,
  },
});
