// Star Assembly — Aurelian Concord broad low armored swept orbital gate building
// Obvious split circular aperture + articulated central landing cradle
// Target XZ radius: 3.75, minY: 0, -Z forward

import { MAT, createConcordMaterialLibrary } from '../materials.mjs';
import {
  PartBuilder, addBeveledPolygon, addSweepLoft, addFacetedCrystal,
  addCircularArc, regularPolygonXZ, profileBlade, profileChamferRect,
} from '../geometry.mjs';
import {
  TAU, cubicBezier3, rotX3, quatFromEulerXYZ, quatFromAxisAngle, quatMul,
} from '../math.mjs';
import { SceneAssetBuilder } from '../glb-writer.mjs';

const GATE_TILT_X = 0.34; // ~19.5 deg pitch toward -Z so circular aperture is super readable in steep overhead view!

function buildFoundationAndCradleDeckPart() {
  const part = new PartBuilder('assembly_foundation');

  // 1. Broad low central foundation ring & -Z launch apron (y = 0..0.26)
  addBeveledPolygon(part, regularPolygonXZ(12, 2.75, 2.75, Math.PI / 12), {
    yBottom: 0.0,
    yTop: 0.24,
    bevelTop: 0.06,
    bevelBottom: 0.02,
    matSide: MAT.DARK_ALLOY,
    matBevel: MAT.GOLD_TRIM,
    matTop: MAT.DARK_ALLOY,
    matBottom: MAT.DARK_ALLOY,
  });

  // Forward (-Z) launch runway apron & flanking approach guide pylons reaching R = 3.75
  addBeveledPolygon(part, [
    [0.92, -1.65],
    [1.10, -3.55],
    [0.72, -3.66],
    [-0.72, -3.66],
    [-1.10, -3.55],
    [-0.92, -1.65],
  ], {
    yBottom: 0.0,
    yTop: 0.18,
    bevelTop: 0.04,
    bevelBottom: 0.015,
    matSide: MAT.DARK_ALLOY,
    matBevel: MAT.GOLD_TRIM,
    matTop: MAT.DARK_ALLOY,
    matBottom: MAT.DARK_ALLOY,
  });

  // Twin low armored -Z forward approach guide pylons (frame the -Z exit from the landing cradle!)
  const frontPylon = new PartBuilder('front_pylon');
  addBeveledPolygon(frontPylon, [
    [-0.78, -2.35],
    [-1.38, -2.55],
    [-1.26, -3.54],
    [-0.72, -3.68],
    [-0.64, -2.65],
  ], {
    yBottom: 0.0,
    yTop: 0.56,
    bevelTop: 0.07,
    bevelBottom: 0.03,
    matSide: MAT.IVORY_HULL,
    matBevel: MAT.GOLD_TRIM,
    matTop: MAT.IVORY_HULL,
    matBottom: MAT.DARK_ALLOY,
  });
  // Glowing teal runway guide strip along inner face of approach pylon
  addSweepLoft(frontPylon, [
    { pos: [-0.68, 0.24, -2.35], sx: 1, sy: 1 },
    { pos: [-0.68, 0.22, -3.55], sx: 0.85, sy: 0.85 },
  ], profileChamferRect(0.045, 0.035, 0.01), {
    matBody: MAT.TEAL_GLOW,
  });
  part.merge(frontPylon);
  part.mirrorX(frontPylon);

  // Two gold directional launch chevrons on the -Z runway pointing straight toward -Z!
  for (const zOff of [-2.35, -3.05]) {
    addBeveledPolygon(part, [
      [0.0, zOff - 0.34],
      [0.42, zOff + 0.05],
      [0.30, zOff + 0.16],
      [0.0, zOff - 0.12],
      [-0.30, zOff + 0.16],
      [-0.42, zOff + 0.05],
    ], {
      yBottom: 0.17,
      yTop: 0.23,
      bevelTop: 0.015,
      bevelBottom: 0.005,
      matSide: MAT.GOLD_TRIM,
      matBevel: MAT.GOLD_TRIM,
      matTop: MAT.TEAL_GLOW,
      matBottom: MAT.DARK_ALLOY,
    });
  }

  // 2. Central Recessed Landing Cradle Deck (obvious circular/octagonal vessel berth in the center!)
  // Outer raised ivory & gold cradle rim
  addCircularArc(part, {
    center: [0, 0.30, 0.0],
    radius: 1.56,
    angleStart: 0.42, // open at -Z front runway!
    angleEnd: TAU - 0.42,
    segments: 24,
    closed: false,
    profile: profileChamferRect(0.18, 0.10, 0.03),
    edgeMaterials: [
      MAT.GOLD_TRIM, MAT.IVORY_HULL, MAT.IVORY_HULL, MAT.GOLD_TRIM,
      MAT.TEAL_GLOW, MAT.DARK_ALLOY, MAT.DARK_ALLOY, MAT.GOLD_TRIM,
    ],
    matCaps: MAT.GOLD_TRIM,
  });

  // Recessed dark octagonal cradle floor + glowing concentric teal landing target ring
  addBeveledPolygon(part, regularPolygonXZ(8, 1.38, 1.38, Math.PI / 8), {
    yBottom: 0.18,
    yTop: 0.28,
    bevelTop: 0.03,
    bevelBottom: 0.01,
    matSide: MAT.GOLD_TRIM,
    matBevel: MAT.GOLD_TRIM,
    matTop: MAT.DARK_ALLOY,
    matBottom: MAT.DARK_ALLOY,
  });

  addCircularArc(part, {
    center: [0, 0.295, 0],
    radius: 0.98,
    segments: 24,
    closed: true,
    profile: profileChamferRect(0.055, 0.024, 0.008),
    matBody: MAT.TEAL_GLOW,
  });

  addCircularArc(part, {
    center: [0, 0.295, 0],
    radius: 0.52,
    segments: 16,
    closed: true,
    profile: profileChamferRect(0.04, 0.022, 0.006),
    matBody: MAT.GOLD_TRIM,
  });

  // 3. Broad Low Aft Armored Command & Capacitor Bastion (+Z, reaching R = 3.75)
  addBeveledPolygon(part, [
    [1.68, 1.75],
    [1.35, 3.48],
    [0.48, 3.72],
    [-0.48, 3.72],
    [-1.35, 3.48],
    [-1.68, 1.75],
  ], {
    yBottom: 0.0,
    yTop: 1.08,
    bevelTop: 0.12,
    bevelBottom: 0.05,
    matSide: MAT.IVORY_HULL,
    matBevel: MAT.GOLD_TRIM,
    matTop: MAT.IVORY_HULL,
    matBottom: MAT.DARK_ALLOY,
  });

  // Stepped upper aft capacitor hood with recessed teal core vents & TeamColor trim
  addBeveledPolygon(part, [
    [1.12, 2.10],
    [0.88, 3.30],
    [-0.88, 3.30],
    [-1.12, 2.10],
  ], {
    yBottom: 1.04,
    yTop: 1.38,
    bevelTop: 0.08,
    bevelBottom: 0.03,
    matSide: MAT.DARK_ALLOY,
    matBevel: MAT.GOLD_TRIM,
    matTop: MAT.TEAM_COLOR,
    matBottom: MAT.DARK_ALLOY,
  });

  return part;
}

// Broad low armored swept wing bastion (built for Port -X, mirrored for Starboard +X)
function buildSweptArmoredBastionPart(mirror = false) {
  const base = new PartBuilder('swept_bastion_port');

  // Lower heavy armored swept wing hull reaching X = -3.75, sweeping from forward-mid back to aft!
  addBeveledPolygon(base, [
    [-1.52, -1.85],
    [-2.78, -1.45],
    [-3.68, -0.45],
    [-3.75, 0.42],
    [-3.32, 1.88],
    [-2.24, 2.68],
    [-1.58, 1.85],
    [-1.78, 0.15],
  ], {
    yBottom: 0.0,
    yTop: 0.88,
    bevelTop: 0.12,
    bevelBottom: 0.05,
    matSide: MAT.IVORY_HULL,
    matBevel: MAT.GOLD_TRIM,
    matTop: MAT.IVORY_HULL,
    matBottom: MAT.DARK_ALLOY,
  });

  // Upper stepped swept armor carapace (keeps profile low, broad & heavily plated!)
  addBeveledPolygon(base, [
    [-1.72, -1.25],
    [-2.68, -0.92],
    [-3.32, -0.10],
    [-3.08, 1.35],
    [-2.18, 2.05],
    [-1.75, 1.25],
  ], {
    yBottom: 0.84,
    yTop: 1.28,
    bevelTop: 0.09,
    bevelBottom: 0.03,
    matSide: MAT.DARK_ALLOY,
    matBevel: MAT.GOLD_TRIM,
    matTop: MAT.IVORY_HULL,
    matBottom: MAT.DARK_ALLOY,
  });

  // Bold moderate opaque TeamColor panel inset on top of the swept armor bastion (high overhead readability!)
  addBeveledPolygon(base, [
    [-2.02, -0.82],
    [-2.72, -0.55],
    [-2.98, 0.18],
    [-2.74, 1.08],
    [-2.08, 1.42],
    [-1.95, 0.35],
  ], {
    yBottom: 1.25,
    yTop: 1.36,
    bevelTop: 0.035,
    bevelBottom: 0.015,
    matSide: MAT.GOLD_TRIM,
    matBevel: MAT.GOLD_TRIM,
    matTop: MAT.TEAM_COLOR,
    matBottom: MAT.DARK_ALLOY,
  });

  // Recessed teal energy conduit feeding from outer swept bastion inward to the orbital gate pylon!
  const conduitStations = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const pos = cubicBezier3(
      [-3.48, 0.92, 0.15],
      [-3.05, 1.18, 0.12],
      [-2.50, 1.38, 0.08],
      [-2.05, 1.48, 0.05],
      t
    );
    conduitStations.push({ pos, sx: 1.0 - t * 0.15, sy: 1.0 });
  }
  addSweepLoft(base, conduitStations, profileChamferRect(0.085, 0.055, 0.015), {
    edgeMaterials: [
      MAT.GOLD_TRIM, MAT.DARK_ALLOY, MAT.TEAL_GLOW, MAT.TEAL_GLOW,
      MAT.GOLD_TRIM, MAT.DARK_ALLOY, MAT.DARK_ALLOY, MAT.GOLD_TRIM,
    ],
  });

  // Gate mounting trunnion pylon rising to support the split circular aperture
  addBeveledPolygon(base, [
    [-1.82, -0.36],
    [-2.42, -0.30],
    [-2.42, 0.42],
    [-1.82, 0.48],
  ], {
    yBottom: 0.85,
    yTop: 1.62,
    bevelTop: 0.06,
    bevelBottom: 0.03,
    matSide: MAT.IVORY_HULL,
    matBevel: MAT.GOLD_TRIM,
    matTop: MAT.GOLD_TRIM,
    matBottom: MAT.DARK_ALLOY,
  });

  if (!mirror) return base;
  const mirrored = new PartBuilder('swept_bastion_starboard');
  mirrored.mirrorX(base);
  return mirrored;
}

// Half of the Obvious Split Circular Orbital Aperture!
// Spanning port (-X) or starboard (+X) with wide open split gaps at -Z front (launch exit) and +Z crown!
function buildSplitGateArcPart(isStarboard = false) {
  const part = new PartBuilder(isStarboard ? 'gate_arc_starboard' : 'gate_arc_port');

  // Angle convention: 0 = -Z front, PI/2 = +X starboard, PI = +Z aft, -PI/2 = -X port
  // Leave wide 0.56 rad (~32 deg = ~1.3m!) split gaps at 0 (-Z) and PI (+Z) so the SPLIT circular aperture is unmistakable!
  const aStart = isStarboard ? 0.28 : Math.PI + 0.28;
  const aEnd = isStarboard ? Math.PI - 0.28 : TAU - 0.28;

  // Heavy beveled orbital ring cross-section (0.36m radial width x 0.24m height)
  // Note: along positive angle sweep, right = radially outward, -right = radially inward toward portal center!
  addCircularArc(part, {
    center: [0, 0, 0],
    radius: 2.26,
    angleStart: aStart,
    angleEnd: aEnd,
    segments: 20,
    closed: false,
    tiltX: GATE_TILT_X,
    profile: profileChamferRect(0.22, 0.13, 0.035),
    edgeMaterials: [
      MAT.IVORY_HULL,  // outer wall
      MAT.GOLD_TRIM,   // outer-top bevel
      MAT.IVORY_HULL,  // broad top armor face
      MAT.GOLD_TRIM,   // inner-top bevel
      MAT.CORE_BRIGHT, // bright inner circular portal rim!
      MAT.GOLD_TRIM,   // inner-bottom bevel
      MAT.DARK_ALLOY,  // underside
      MAT.GOLD_TRIM,   // outer-bottom bevel
    ],
    matCaps: MAT.GOLD_TRIM, // gleaming golden end-caps framing the split aperture gaps!
  });

  // Recessed teal arc channel inlaid along the top face of the circular gate ring (super crisp from overhead!)
  addCircularArc(part, {
    center: [0, 0.04, 0],
    radius: 2.26,
    angleStart: aStart + 0.10,
    angleEnd: aEnd - 0.10,
    segments: 16,
    closed: false,
    tiltX: GATE_TILT_X,
    profile: profileChamferRect(0.065, 0.105, 0.015),
    edgeMaterials: [
      MAT.GOLD_TRIM, MAT.GOLD_TRIM, MAT.TEAL_GLOW, MAT.TEAL_GLOW,
      MAT.GOLD_TRIM, MAT.DARK_ALLOY, MAT.DARK_ALLOY, MAT.GOLD_TRIM,
    ],
    matCaps: MAT.GOLD_TRIM,
  });

  // Glowing golden/teal emitter prongs at the two split-gap tips of each crescent half!
  for (const tipAngle of [aStart, aEnd]) {
    const dirSign = tipAngle === aStart ? -1 : 1;
    const tipStations = [];
    for (let k = 0; k <= 3; k++) {
      const a = tipAngle + dirSign * (k * 0.035);
      const localPos = rotX3([Math.sin(a) * 2.24, 0, -Math.cos(a) * 2.24], GATE_TILT_X);
      const localUp = rotX3([0, 1, 0], GATE_TILT_X);
      tipStations.push({
        pos: localPos,
        up: localUp,
        sx: 1.0 - k * 0.22,
        sy: 1.0 - k * 0.22,
      });
    }
    addSweepLoft(part, tipStations, profileChamferRect(0.14, 0.09, 0.02), {
      matBody: MAT.GOLD_TRIM,
      matCapStart: MAT.GOLD_TRIM,
      matCapEnd: MAT.CORE_BRIGHT,
    });
  }

  return part;
}

// Inner rotating orbital resonance ring segments inside the tilted split circular aperture
function buildGatePortalResonanceRing() {
  const part = new PartBuilder('gate_portal_ring');
  for (let i = 0; i < 3; i++) {
    const a0 = (i / 3) * TAU + 0.18;
    const a1 = ((i + 1) / 3) * TAU - 0.34;
    addCircularArc(part, {
      center: [0, 0, 0],
      radius: 1.88,
      angleStart: a0,
      angleEnd: a1,
      segments: 10,
      closed: false,
      profile: profileChamferRect(0.042, 0.032, 0.008),
      edgeMaterials: [
        MAT.GOLD_TRIM, MAT.CORE_BRIGHT, MAT.TEAL_GLOW, MAT.CORE_BRIGHT,
        MAT.CORE_BRIGHT, MAT.GOLD_TRIM, MAT.TEAL_GLOW, MAT.GOLD_TRIM,
      ],
      matCaps: MAT.GOLD_TRIM,
    });
  }
  return part;
}

// Articulated Landing Cradle Clamp Arm (3 arranged around the central landing cradle!)
function buildCradleClampArmPart() {
  const part = new PartBuilder('cradle_clamp');
  // Local origin at hinge on cradle rim (0, 0.30, -1.36) in rotated frame (points inward toward center)
  addSweepLoft(part, [
    { pos: [0, 0.0, 0.0], sx: 1.0, sy: 1.0 },
    { pos: [0, 0.26, 0.08], sx: 0.88, sy: 0.90 },
    { pos: [0, 0.48, 0.28], sx: 0.68, sy: 0.72 },
    { pos: [0, 0.56, 0.48], sx: 0.42, sy: 0.48 },
  ], profileBlade(0.095, 0.065, 0.055), {
    edgeMaterials: [
      MAT.GOLD_TRIM, MAT.IVORY_HULL, MAT.GOLD_TRIM, MAT.IVORY_HULL,
      MAT.GOLD_TRIM, MAT.TEAL_GLOW, MAT.CORE_BRIGHT, MAT.TEAL_GLOW,
    ],
    matCapStart: MAT.DARK_ALLOY,
    matCapEnd: MAT.GOLD_TRIM,
  });
  return part;
}

function buildCentralWarpBeaconPart() {
  const part = new PartBuilder('warp_beacon');
  addFacetedCrystal(part, {
    center: [0, 0.14, 0],
    sides: 8,
    radiusX: 0.24,
    radiusZ: 0.24,
    upperH: 0.18,
    lowerH: 0.10,
    girdleH: 0.03,
    matCrystal: MAT.CORE_BRIGHT,
    matGirdle: MAT.GOLD_TRIM,
  });
  return part;
}

function tiltedRingSpinKeys(duration, turns = 1) {
  const steps = 6 * Math.max(1, Math.abs(turns));
  const baseTilt = quatFromEulerXYZ(GATE_TILT_X, 0, 0);
  const times = [];
  const values = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    times.push(t * duration);
    const localSpin = quatFromAxisAngle([0, 1, 0], t * TAU * turns);
    values.push(quatMul(baseTilt, localSpin));
  }
  return { times, values };
}

export function buildStarAssemblyAsset() {
  const matLib = createConcordMaterialLibrary();
  const builder = new SceneAssetBuilder('star_assembly', matLib);

  const foundationIdx = builder.addNode({
    name: 'AssemblyFoundation',
    parent: 0,
    translation: [0, 0, 0],
    part: buildFoundationAndCradleDeckPart(),
  });

  const portBastionIdx = builder.addNode({
    name: 'SweptBastionPort',
    parent: foundationIdx,
    translation: [0, 0, 0],
    part: buildSweptArmoredBastionPart(false),
  });

  const starboardBastionIdx = builder.addNode({
    name: 'SweptBastionStarboard',
    parent: foundationIdx,
    translation: [0, 0, 0],
    part: buildSweptArmoredBastionPart(true),
  });

  // Split Circular Orbital Gate Aperture centered at [0, 1.62, 0.08] above the landing cradle
  const gateY = 1.62;
  const gateZ = 0.08;
  const gatePortIdx = builder.addNode({
    name: 'GateArcPort',
    parent: foundationIdx,
    translation: [0, gateY, gateZ],
    part: buildSplitGateArcPart(false),
  });

  const gateStarboardIdx = builder.addNode({
    name: 'GateArcStarboard',
    parent: foundationIdx,
    translation: [0, gateY, gateZ],
    part: buildSplitGateArcPart(true),
  });

  const portalRingIdx = builder.addNode({
    name: 'GatePortalRing',
    parent: foundationIdx,
    translation: [0, gateY, gateZ],
    rotation: quatFromEulerXYZ(GATE_TILT_X, 0, 0),
    part: buildGatePortalResonanceRing(),
  });

  // Three Landing Cradle Docking Clamps at Port (-105 deg), Starboard (+105 deg), Aft (180 deg), leaving -Z open!
  const clampAngles = [-1.83, 1.83, Math.PI];
  const clampIndices = clampAngles.map((ang, i) => {
    const r = 1.34;
    const x = Math.sin(ang) * r;
    const z = -Math.cos(ang) * r;
    return builder.addNode({
      name: `LandingCradleClamp_${i}`,
      parent: foundationIdx,
      translation: [x, 0.30, z],
      rotation: quatFromEulerXYZ(0, ang, 0),
      part: buildCradleClampArmPart(),
    });
  });

  const beaconIdx = builder.addNode({
    name: 'LandingCradleBeacon',
    parent: foundationIdx,
    translation: [0, 0.26, 0],
    part: buildCentralWarpBeaconPart(),
    creaseAngle: 18,
  });

  // --- Animations ---
  // 1. idle (3.0s orbital gate hum, spinning inner resonance ring, breathing cradle clamps)
  const idleSpin = tiltedRingSpinKeys(3.0, 1);
  builder.addAnimation('idle', [
    {
      node: gatePortIdx,
      path: 'translation',
      times: [0, 1.5, 3.0],
      values: [
        [0, gateY, gateZ],
        [-0.04, gateY + 0.04, gateZ],
        [0, gateY, gateZ],
      ],
    },
    {
      node: gateStarboardIdx,
      path: 'translation',
      times: [0, 1.5, 3.0],
      values: [
        [0, gateY, gateZ],
        [0.04, gateY + 0.04, gateZ],
        [0, gateY, gateZ],
      ],
    },
    {
      node: portalRingIdx,
      path: 'rotation',
      times: idleSpin.times,
      values: idleSpin.values,
    },
    {
      node: beaconIdx,
      path: 'scale',
      times: [0, 0.75, 1.5, 2.25, 3.0],
      values: [
        [1, 1, 1],
        [1.15, 1.25, 1.15],
        [0.95, 0.95, 0.95],
        [1.18, 1.28, 1.18],
        [1, 1, 1],
      ],
    },
    ...clampIndices.map((cIdx, i) => ({
      node: cIdx,
      path: 'rotation',
      times: [0, 1.5, 3.0],
      values: [
        quatFromEulerXYZ(0, clampAngles[i], 0),
        quatFromEulerXYZ(-0.06, clampAngles[i], 0),
        quatFromEulerXYZ(0, clampAngles[i], 0),
      ],
    })),
  ]);

  // 2. cast (2.2s orbital warp-in & cradle release cycle)
  const castSpin = tiltedRingSpinKeys(2.2, 2);
  builder.addAnimation('cast', [
    {
      node: gatePortIdx,
      path: 'translation',
      times: [0, 0.45, 1.15, 2.2],
      values: [
        [0, gateY, gateZ],
        [-0.18, gateY + 0.14, gateZ],
        [-0.14, gateY + 0.12, gateZ],
        [0, gateY, gateZ],
      ],
    },
    {
      node: gateStarboardIdx,
      path: 'translation',
      times: [0, 0.45, 1.15, 2.2],
      values: [
        [0, gateY, gateZ],
        [0.18, gateY + 0.14, gateZ],
        [0.14, gateY + 0.12, gateZ],
        [0, gateY, gateZ],
      ],
    },
    {
      node: portalRingIdx,
      path: 'rotation',
      times: castSpin.times,
      values: castSpin.values,
    },
    {
      node: portalRingIdx,
      path: 'scale',
      times: [0, 0.45, 0.85, 1.55, 2.2],
      values: [
        [1, 1, 1],
        [1.14, 1.35, 1.14],
        [1.18, 1.45, 1.18],
        [1.06, 1.12, 1.06],
        [1, 1, 1],
      ],
    },
    {
      node: beaconIdx,
      path: 'scale',
      times: [0, 0.40, 0.75, 1.45, 2.2],
      values: [
        [1, 1, 1],
        [1.55, 2.40, 1.55], // warp arrival pillar in landing cradle!
        [1.68, 2.65, 1.68],
        [1.15, 1.30, 1.15],
        [1, 1, 1],
      ],
    },
    ...clampIndices.map((cIdx, i) => ({
      node: cIdx,
      path: 'rotation',
      times: [0, 0.35, 0.90, 1.60, 2.2],
      values: [
        quatFromEulerXYZ(0, clampAngles[i], 0),
        quatFromEulerXYZ(0.10, clampAngles[i], 0),  // lock vessel
        quatFromEulerXYZ(-0.34, clampAngles[i], 0), // swing open wide to launch!
        quatFromEulerXYZ(-0.26, clampAngles[i], 0),
        quatFromEulerXYZ(0, clampAngles[i], 0),
      ],
    })),
  ]);

  // 3. death (1.9s split gate shear & structural collapse onto armored bastions, Y >= 0)
  builder.addAnimation('death', [
    {
      node: gatePortIdx,
      path: 'translation',
      times: [0, 0.28, 0.85, 1.35, 1.9],
      values: [
        [0, gateY, gateZ],
        [-0.22, gateY + 0.08, gateZ],
        [-0.34, 1.24, gateZ + 0.08],
        [-0.40, 1.18, gateZ + 0.12],
        [-0.40, 1.18, gateZ + 0.12],
      ],
    },
    {
      node: gatePortIdx,
      path: 'rotation',
      times: [0, 0.30, 0.95, 1.40, 1.9],
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-0.04, 0.05, 0.06),
        quatFromEulerXYZ(-0.10, 0.10, 0.12),
        quatFromEulerXYZ(-0.12, 0.12, 0.14),
        quatFromEulerXYZ(-0.12, 0.12, 0.14),
      ],
    },
    {
      node: gateStarboardIdx,
      path: 'translation',
      times: [0, 0.28, 0.85, 1.35, 1.9],
      values: [
        [0, gateY, gateZ],
        [0.22, gateY + 0.06, gateZ],
        [0.36, 1.22, gateZ - 0.04],
        [0.42, 1.16, gateZ - 0.06],
        [0.42, 1.16, gateZ - 0.06],
      ],
    },
    {
      node: gateStarboardIdx,
      path: 'rotation',
      times: [0, 0.30, 0.95, 1.40, 1.9],
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-0.05, -0.06, -0.06),
        quatFromEulerXYZ(-0.12, -0.10, -0.12),
        quatFromEulerXYZ(-0.14, -0.12, -0.14),
        quatFromEulerXYZ(-0.14, -0.12, -0.14),
      ],
    },
    {
      node: portalRingIdx,
      path: 'scale',
      times: [0, 0.22, 0.65, 1.9],
      values: [
        [1, 1, 1],
        [1.22, 1.22, 1.22],
        [0.18, 0.18, 0.18],
        [0.08, 0.08, 0.08],
      ],
    },
    {
      node: beaconIdx,
      path: 'scale',
      times: [0, 0.20, 0.65, 1.9],
      values: [
        [1, 1, 1],
        [1.4, 1.8, 1.4],
        [0.2, 0.15, 0.2],
        [0.1, 0.08, 0.1],
      ],
    },
    {
      node: portBastionIdx,
      path: 'translation',
      times: [0, 0.5, 1.2, 1.9],
      values: [
        [0, 0, 0],
        [-0.08, 0, 0.03],
        [-0.14, 0, 0.05],
        [-0.14, 0, 0.05],
      ],
    },
    {
      node: starboardBastionIdx,
      path: 'translation',
      times: [0, 0.5, 1.2, 1.9],
      values: [
        [0, 0, 0],
        [0.08, 0, -0.02],
        [0.14, 0, -0.04],
        [0.14, 0, -0.04],
      ],
    },
    ...clampIndices.map((cIdx, i) => ({
      node: cIdx,
      path: 'rotation',
      times: [0, 0.5, 1.1, 1.9],
      values: [
        quatFromEulerXYZ(0, clampAngles[i], 0),
        quatFromEulerXYZ(-0.48, clampAngles[i], 0),
        quatFromEulerXYZ(-0.68, clampAngles[i], 0),
        quatFromEulerXYZ(-0.68, clampAngles[i], 0),
      ],
    })),
  ]);

  const bounds = builder.calibrateBounds(3.75, 0);
  return { buffer: builder.toGLB(), bounds };
}
