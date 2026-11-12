// Fleet Spire — Aurelian Concord elevated three-spire tech structure with luminous suspended prism
// Target XZ radius: 3.75, minY: 0, -Z forward

import { MAT, createConcordMaterialLibrary } from '../materials.mjs';
import {
  PartBuilder, addBeveledPolygon, addSweepLoft, addFacetedCrystal,
  addCircularArc, regularPolygonXZ, profileBlade, profileChamferRect,
} from '../geometry.mjs';
import {
  TAU, cubicBezier3, quatFromEulerXYZ,
} from '../math.mjs';
import { SceneAssetBuilder } from '../glb-writer.mjs';

function buildElevatedTechPlatformPart() {
  const part = new PartBuilder('elevated_tech_platform');

  // 1. Three arched buttress legs lifting the central tech deck high off the ground (Y = 0 -> Y = 1.48)
  // Angles match the three spires: PI (+Z aft), -PI/3 (forward-port), +PI/3 (forward-starboard)
  const spireAngles = [Math.PI, -TAU / 6, TAU / 6];
  for (const ang of spireAngles) {
    const leg = new PartBuilder('buttress_leg');
    // Ground anchor footpad at R = 3.45..3.75, Y = 0.000
    addBeveledPolygon(leg, [
      [0.42, -3.75],
      [-0.42, -3.75],
      [-0.58, -2.92],
      [0.58, -2.92],
    ], {
      yBottom: 0.0,
      yTop: 0.28,
      bevelTop: 0.06,
      bevelBottom: 0.02,
      matSide: MAT.DARK_ALLOY,
      matBevel: MAT.GOLD_TRIM,
      matTop: MAT.IVORY_HULL,
      matBottom: MAT.DARK_ALLOY,
    });

    // Vaulted arch beam rising from ground anchor (z = -3.45, y = 0.22) up to elevated deck (z = -1.65, y = 1.48)
    const archStations = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const pos = cubicBezier3(
        [0, 0.20, -3.45],
        [0, 1.05, -3.28],
        [0, 1.45, -2.55],
        [0, 1.50, -1.62],
        t
      );
      archStations.push({
        pos,
        sx: 1.08 - t * 0.16,
        sy: 1.0,
      });
    }
    addSweepLoft(leg, archStations, profileChamferRect(0.36, 0.20, 0.05), {
      edgeMaterials: [
        MAT.IVORY_HULL, MAT.GOLD_TRIM, MAT.IVORY_HULL, MAT.GOLD_TRIM,
        MAT.IVORY_HULL, MAT.DARK_ALLOY, MAT.TEAL_GLOW, MAT.DARK_ALLOY,
      ],
    });

    part.rotateY(leg, ang);
  }

  // 2. Forward (-Z) Ground Conduit Prow & Stepped Ascent Causeway (clearly establishes -Z forward!)
  addBeveledPolygon(part, [
    [0.52, -3.05],
    [-0.52, -3.05],
    [-0.72, -1.85],
    [0.72, -1.85],
  ], {
    yBottom: 0.0,
    yTop: 0.34,
    bevelTop: 0.06,
    bevelBottom: 0.02,
    matSide: MAT.IVORY_HULL,
    matBevel: MAT.GOLD_TRIM,
    matTop: MAT.DARK_ALLOY,
    matBottom: MAT.DARK_ALLOY,
  });

  // Rising forward conduit bridge from -Z step up to the elevated deck (y = 0.32 -> 1.52)
  addSweepLoft(part, [
    { pos: [0, 0.30, -2.75], sx: 0.85, sy: 0.85 },
    { pos: [0, 0.96, -2.25], sx: 0.95, sy: 0.95 },
    { pos: [0, 1.48, -1.65], sx: 1.05, sy: 1.0 },
  ], profileChamferRect(0.38, 0.14, 0.035), {
    edgeMaterials: [
      MAT.IVORY_HULL, MAT.GOLD_TRIM, MAT.TEAL_GLOW, MAT.TEAL_GLOW,
      MAT.GOLD_TRIM, MAT.IVORY_HULL, MAT.DARK_ALLOY, MAT.DARK_ALLOY,
    ],
  });

  // 3. Elevated Central Hexagonal Tech Sanctum Deck (suspended cleanly at Y = 1.32 .. 1.82!)
  addBeveledPolygon(part, regularPolygonXZ(6, 2.18, 2.18, Math.PI / 6), {
    yBottom: 1.30,
    yTop: 1.76,
    bevelTop: 0.10,
    bevelBottom: 0.08,
    matSide: MAT.IVORY_HULL,
    matBevel: MAT.GOLD_TRIM,
    matTop: MAT.IVORY_HULL,
    matBottom: MAT.DARK_ALLOY,
  });

  // Outer elevated harmonic conduit ring linking the three spire shoulders at Y = 1.56
  addCircularArc(part, {
    center: [0, 1.56, 0],
    radius: 2.68,
    segments: 30,
    closed: true,
    profile: profileChamferRect(0.14, 0.11, 0.03),
    edgeMaterials: [
      MAT.IVORY_HULL, MAT.GOLD_TRIM, MAT.TEAL_GLOW, MAT.GOLD_TRIM,
      MAT.DARK_ALLOY, MAT.GOLD_TRIM, MAT.DARK_ALLOY, MAT.GOLD_TRIM,
    ],
  });

  // Central Resonance Projector Well on top of the elevated deck directly beneath the suspended prism!
  addCircularArc(part, {
    center: [0, 1.80, 0],
    radius: 1.12,
    segments: 24,
    closed: true,
    profile: profileChamferRect(0.14, 0.08, 0.025),
    edgeMaterials: [
      MAT.GOLD_TRIM, MAT.IVORY_HULL, MAT.GOLD_TRIM, MAT.GOLD_TRIM,
      MAT.TEAL_GLOW, MAT.DARK_ALLOY, MAT.DARK_ALLOY, MAT.GOLD_TRIM,
    ],
  });

  addBeveledPolygon(part, regularPolygonXZ(6, 0.96, 0.96, 0), {
    yBottom: 1.74,
    yTop: 1.83,
    bevelTop: 0.03,
    bevelBottom: 0.01,
    matSide: MAT.GOLD_TRIM,
    matBevel: MAT.GOLD_TRIM,
    matTop: MAT.TEAL_GLOW,
    matBottom: MAT.DARK_ALLOY,
  });

  return part;
}

// Single soaring inward-curving Aurelian Spire (local frame: positioned at R = 2.75 along -Z, curving up & inward toward +Z center!)
function buildSingleSpirePart(isSovereignAft = false) {
  const part = new PartBuilder('spire_blade');
  // Local pivot at [0, 1.52, -2.68] (on the elevated shoulder), so outward is -Z and inward toward prism is +Z!
  const peakY = isSovereignAft ? 3.92 : 3.58; // world Y = 1.52 + 3.92 = 5.44!

  const p0 = [0, -0.15, -0.38];
  const p1 = [0, 1.15, -0.58];  // dramatic outer architectural flare
  const p2 = [0, 2.65, 0.25];   // graceful inward sweep
  const p3 = [0, peakY, 1.48];  // tip converges over central prism (world R ~ 1.20)!

  const segs = 14;
  const stations = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const pos = cubicBezier3(p0, p1, p2, p3, t);
    const wScale = (1 - Math.pow(t, 1.25) * 0.80) * 1.05 + 0.06;
    const hScale = (1 - Math.pow(t, 1.15) * 0.78) * 1.05 + 0.06;
    stations.push({
      pos,
      up: [0, 0.35, 1.0], // local 'up' points inward (+Z) toward central prism!
      sx: wScale,
      sy: hScale,
    });
  }

  addSweepLoft(part, stations, profileBlade(0.42, 0.24, 0.28), {
    edgeMaterials: [
      MAT.GOLD_TRIM,   // side leading bevel
      MAT.IVORY_HULL,  // inner-right bevel
      MAT.TEAL_GLOW,   // inner spine glowing teal conduit facing the prism!
      MAT.IVORY_HULL,  // inner-left bevel
      MAT.GOLD_TRIM,   // side leading bevel
      MAT.IVORY_HULL,  // outer-left armor face
      MAT.GOLD_TRIM,   // outer dorsal gold crest
      MAT.IVORY_HULL,  // outer-right armor face
    ],
    matCapStart: MAT.DARK_ALLOY,
    matCapEnd: MAT.GOLD_TRIM,
  });

  // Moderate opaque TeamColor exterior armor shield along the lower-mid back of each spire (high overhead visibility!)
  const tcStations = [];
  for (let i = 1; i <= 8; i++) {
    const t = i / segs;
    const base = cubicBezier3(p0, p1, p2, p3, t);
    tcStations.push({
      pos: [base[0], base[1] - 0.02, base[2] - 0.20 * (1 - t * 0.5)],
      up: [0, 0.25, -1.0], // facing outward/upward for overhead camera!
      sx: Math.sin(Math.PI * ((i - 1) / 7)) * 0.65 + 0.35,
      sy: 0.65,
    });
  }
  addSweepLoft(part, tcStations, profileChamferRect(0.24, 0.055, 0.015), {
    edgeMaterials: [
      MAT.GOLD_TRIM, MAT.GOLD_TRIM, MAT.TEAM_COLOR, MAT.TEAM_COLOR,
      MAT.GOLD_TRIM, MAT.DARK_ALLOY, MAT.DARK_ALLOY, MAT.GOLD_TRIM,
    ],
    matCapStart: MAT.GOLD_TRIM,
    matCapEnd: MAT.GOLD_TRIM,
  });

  // Golden harmonic emitter prong projecting from upper inner spire toward the suspended prism!
  addSweepLoft(part, [
    { pos: [0, 2.05, 0.08], sx: 1.0, sy: 1.0 },
    { pos: [0, 1.96, 0.62], sx: 0.68, sy: 0.68 },
    { pos: [0, 1.88, 0.98], sx: 0.28, sy: 0.28 },
  ], profileChamferRect(0.068, 0.062, 0.018), {
    edgeMaterials: [
      MAT.GOLD_TRIM, MAT.GOLD_TRIM, MAT.CORE_BRIGHT, MAT.GOLD_TRIM,
      MAT.GOLD_TRIM, MAT.TEAL_GLOW, MAT.CORE_BRIGHT, MAT.TEAL_GLOW,
    ],
    matCapStart: MAT.GOLD_TRIM,
    matCapEnd: MAT.CORE_BRIGHT,
  });

  return part;
}

// Luminous Suspended Prism in the heart of the three spires!
function buildLuminousSuspendedPrismPart() {
  const part = new PartBuilder('luminous_suspended_prism');

  // Tall, crisp 6-faceted luminous cyan/teal bipyramid crystal
  addFacetedCrystal(part, {
    center: [0, 0, 0],
    sides: 6,
    radiusX: 0.78,
    radiusZ: 0.78,
    upperH: 0.98,
    lowerH: 0.98,
    girdleH: 0.14,
    matCrystal: MAT.CORE_BRIGHT,
    matGirdle: MAT.GOLD_TRIM,
  });

  // Six vertical golden filigree cage ribs framing the luminous prism facets
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const rib = new PartBuilder('prism_rib');
    addSweepLoft(rib, [
      { pos: [0, 1.02, 0], sx: 0.30, sy: 0.30 },
      { pos: [0, 0.08, -0.80], sx: 1.0, sy: 1.0 },
      { pos: [0, -0.08, -0.80], sx: 1.0, sy: 1.0 },
      { pos: [0, -1.02, 0], sx: 0.30, sy: 0.30 },
    ], profileChamferRect(0.026, 0.024, 0.006), {
      matBody: MAT.GOLD_TRIM,
    });
    part.rotateY(rib, a);
  }

  return part;
}

function buildPrismCrownCapPart(isUpper = true) {
  const part = new PartBuilder(isUpper ? 'prism_upper_cap' : 'prism_lower_cap');
  const s = isUpper ? 1 : -1;
  addFacetedCrystal(part, {
    center: [0, s * 0.88, 0],
    sides: 6,
    radiusX: 0.28,
    radiusZ: 0.28,
    upperH: isUpper ? 0.32 : 0.08,
    lowerH: isUpper ? 0.08 : 0.32,
    girdleH: 0.04,
    matCrystal: MAT.IVORY_HULL,
    matGirdle: MAT.GOLD_TRIM,
  });
  return part;
}

function buildPrismGyroRingPart(radius, tiltX, tiltZ) {
  const part = new PartBuilder('prism_gyro_ring');
  addCircularArc(part, {
    center: [0, 0, 0],
    radius,
    segments: 24,
    closed: true,
    tiltX,
    tiltZ,
    profile: profileChamferRect(0.042, 0.032, 0.008),
    edgeMaterials: [
      MAT.GOLD_TRIM, MAT.IVORY_HULL, MAT.GOLD_TRIM, MAT.CORE_BRIGHT,
      MAT.TEAL_GLOW, MAT.GOLD_TRIM, MAT.IVORY_HULL, MAT.GOLD_TRIM,
    ],
  });
  return part;
}

function spinKeys(duration, turns = 1, tiltX = 0, tiltZ = 0) {
  const steps = 6 * Math.max(1, Math.abs(turns));
  const times = [];
  const values = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    times.push(t * duration);
    values.push(quatFromEulerXYZ(tiltX, t * TAU * turns, tiltZ));
  }
  return { times, values };
}

export function buildFleetSpireAsset() {
  const matLib = createConcordMaterialLibrary();
  const builder = new SceneAssetBuilder('fleet_spire', matLib);

  const platformIdx = builder.addNode({
    name: 'ElevatedTechPlatform',
    parent: 0,
    translation: [0, 0, 0],
    part: buildElevatedTechPlatformPart(),
  });

  // Three soaring spires at PI (+Z aft), -PI/3 (forward-port), +PI/3 (forward-starboard)
  const spireAngles = [Math.PI, -TAU / 6, TAU / 6];
  const spireRadius = 2.68;
  const spireY = 1.52;
  const spireIndices = spireAngles.map((ang, i) => {
    const x = Math.sin(ang) * spireRadius;
    const z = -Math.cos(ang) * spireRadius;
    return builder.addNode({
      name: `SpireTower_${i}`,
      parent: platformIdx,
      translation: [x, spireY, z],
      rotation: quatFromEulerXYZ(0, ang, 0),
      part: buildSingleSpirePart(i === 0),
    });
  });

  // Luminous Suspended Prism floating prominently at (0, 3.42, 0)
  const prismY = 3.42;
  const prismIdx = builder.addNode({
    name: 'SuspendedPrismCore',
    parent: 0,
    translation: [0, prismY, 0],
    part: buildLuminousSuspendedPrismPart(),
    creaseAngle: 18,
  });

  const upperCapIdx = builder.addNode({
    name: 'PrismUpperCap',
    parent: prismIdx,
    translation: [0, 0, 0],
    part: buildPrismCrownCapPart(true),
    creaseAngle: 20,
  });

  const lowerCapIdx = builder.addNode({
    name: 'PrismLowerCap',
    parent: prismIdx,
    translation: [0, 0, 0],
    part: buildPrismCrownCapPart(false),
    creaseAngle: 20,
  });

  const outerGyroIdx = builder.addNode({
    name: 'PrismGyroRingOuter',
    parent: 0,
    translation: [0, prismY, 0],
    part: buildPrismGyroRingPart(1.18, 0.36, -0.18),
  });

  const innerGyroIdx = builder.addNode({
    name: 'PrismGyroRingInner',
    parent: 0,
    translation: [0, prismY, 0],
    part: buildPrismGyroRingPart(0.98, -0.32, 0.28),
  });

  // --- Animations ---
  // 1. idle (3.2s majestic suspended prism levitation + counter-precessing gyroscopic gold rings)
  const idlePrismSpin = spinKeys(3.2, 1, 0, 0);
  const idleOuterSpin = spinKeys(3.2, 1, 0.15, -0.10);
  const idleInnerSpin = spinKeys(3.2, -1, -0.15, 0.12);

  builder.addAnimation('idle', [
    {
      node: prismIdx,
      path: 'translation',
      times: [0, 0.8, 1.6, 2.4, 3.2],
      values: [
        [0, prismY, 0],
        [0, prismY + 0.11, 0],
        [0, prismY + 0.02, 0],
        [0, prismY + 0.12, 0],
        [0, prismY, 0],
      ],
    },
    {
      node: prismIdx,
      path: 'rotation',
      times: idlePrismSpin.times,
      values: idlePrismSpin.values,
    },
    {
      node: outerGyroIdx,
      path: 'translation',
      times: [0, 1.6, 3.2],
      values: [
        [0, prismY, 0],
        [0, prismY + 0.08, 0],
        [0, prismY, 0],
      ],
    },
    {
      node: outerGyroIdx,
      path: 'rotation',
      times: idleOuterSpin.times,
      values: idleOuterSpin.values,
    },
    {
      node: innerGyroIdx,
      path: 'translation',
      times: [0, 1.6, 3.2],
      values: [
        [0, prismY, 0],
        [0, prismY + 0.08, 0],
        [0, prismY, 0],
      ],
    },
    {
      node: innerGyroIdx,
      path: 'rotation',
      times: idleInnerSpin.times,
      values: idleInnerSpin.values,
    },
    ...spireIndices.map((sIdx, i) => ({
      node: sIdx,
      path: 'rotation',
      times: [0, 1.6, 3.2],
      values: [
        quatFromEulerXYZ(0, spireAngles[i], 0),
        quatFromEulerXYZ(0.025, spireAngles[i], 0), // gentle harmonic inward breath
        quatFromEulerXYZ(0, spireAngles[i], 0),
      ],
    })),
  ]);

  // 2. cast (2.2s psionic fleet beacon resonance surge)
  const castPrismSpin = spinKeys(2.2, 2, 0, 0);
  const castOuterSpin = spinKeys(2.2, 2, 0, 0);
  const castInnerSpin = spinKeys(2.2, -2, 0, 0);

  builder.addAnimation('cast', [
    {
      node: prismIdx,
      path: 'translation',
      times: [0, 0.45, 0.90, 1.60, 2.2],
      values: [
        [0, prismY, 0],
        [0, prismY + 0.34, 0],
        [0, prismY + 0.38, 0],
        [0, prismY + 0.14, 0],
        [0, prismY, 0],
      ],
    },
    {
      node: prismIdx,
      path: 'rotation',
      times: castPrismSpin.times,
      values: castPrismSpin.values,
    },
    {
      node: prismIdx,
      path: 'scale',
      times: [0, 0.35, 0.65, 1.15, 2.2],
      values: [
        [1, 1, 1],
        [0.88, 0.92, 0.88],
        [1.30, 1.26, 1.30], // luminous beacon flare!
        [1.18, 1.16, 1.18],
        [1, 1, 1],
      ],
    },
    {
      node: upperCapIdx,
      path: 'translation',
      times: [0, 0.55, 1.10, 2.2],
      values: [
        [0, 0, 0],
        [0, 0.22, 0],
        [0, 0.18, 0],
        [0, 0, 0],
      ],
    },
    {
      node: lowerCapIdx,
      path: 'translation',
      times: [0, 0.55, 1.10, 2.2],
      values: [
        [0, 0, 0],
        [0, -0.22, 0],
        [0, -0.18, 0],
        [0, 0, 0],
      ],
    },
    {
      node: outerGyroIdx,
      path: 'translation',
      times: [0, 0.55, 1.10, 2.2],
      values: [
        [0, prismY, 0],
        [0, prismY + 0.36, 0],
        [0, prismY + 0.34, 0],
        [0, prismY, 0],
      ],
    },
    {
      node: outerGyroIdx,
      path: 'rotation',
      times: castOuterSpin.times,
      values: castOuterSpin.values,
    },
    {
      node: outerGyroIdx,
      path: 'scale',
      times: [0, 0.55, 1.10, 2.2],
      values: [
        [1, 1, 1],
        [1.28, 1.28, 1.28],
        [1.20, 1.20, 1.20],
        [1, 1, 1],
      ],
    },
    {
      node: innerGyroIdx,
      path: 'translation',
      times: [0, 0.55, 1.10, 2.2],
      values: [
        [0, prismY, 0],
        [0, prismY + 0.36, 0],
        [0, prismY + 0.34, 0],
        [0, prismY, 0],
      ],
    },
    {
      node: innerGyroIdx,
      path: 'rotation',
      times: castInnerSpin.times,
      values: castInnerSpin.values,
    },
    ...spireIndices.map((sIdx, i) => ({
      node: sIdx,
      path: 'rotation',
      times: [0, 0.50, 1.05, 2.2],
      values: [
        quatFromEulerXYZ(0, spireAngles[i], 0),
        quatFromEulerXYZ(0.085, spireAngles[i], 0), // spires converge inward to channel beam!
        quatFromEulerXYZ(0.065, spireAngles[i], 0),
        quatFromEulerXYZ(0, spireAngles[i], 0),
      ],
    })),
  ]);

  // 3. death (2.0s prism fall onto elevated deck + outward fracture of the three spires, Y >= 0)
  builder.addAnimation('death', [
    {
      node: prismIdx,
      path: 'translation',
      times: [0, 0.25, 0.78, 1.25, 2.0],
      values: [
        [0, prismY, 0],
        [0.03, prismY + 0.10, -0.02],
        [0.08, 2.25, 0.06],
        [0.10, 2.02, 0.08], // rests fallen on the elevated sanctum deck!
        [0.10, 2.02, 0.08],
      ],
    },
    {
      node: prismIdx,
      path: 'rotation',
      times: [0, 0.30, 0.85, 1.30, 2.0],
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0.18, 0.35, -0.15),
        quatFromEulerXYZ(0.88, 0.72, 0.42),
        quatFromEulerXYZ(1.18, 0.85, 0.55),
        quatFromEulerXYZ(1.18, 0.85, 0.55),
      ],
    },
    {
      node: prismIdx,
      path: 'scale',
      times: [0, 0.20, 0.85, 2.0],
      values: [
        [1, 1, 1],
        [1.18, 1.18, 1.18],
        [0.52, 0.52, 0.52],
        [0.42, 0.42, 0.42],
      ],
    },
    {
      node: outerGyroIdx,
      path: 'translation',
      times: [0, 0.30, 0.85, 1.25, 2.0],
      values: [
        [0, prismY, 0],
        [0, prismY - 0.15, 0],
        [0.05, 1.92, -0.04],
        [0.05, 1.88, -0.04],
        [0.05, 1.88, -0.04],
      ],
    },
    {
      node: innerGyroIdx,
      path: 'translation',
      times: [0, 0.30, 0.80, 1.20, 2.0],
      values: [
        [0, prismY, 0],
        [0, prismY - 0.20, 0],
        [-0.04, 1.90, 0.05],
        [-0.04, 1.86, 0.05],
        [-0.04, 1.86, 0.05],
      ],
    },
    ...spireIndices.map((sIdx, i) => ({
      node: sIdx,
      path: 'rotation',
      times: [0, 0.28, 0.95, 1.45, 2.0],
      values: [
        quatFromEulerXYZ(0, spireAngles[i], 0),
        quatFromEulerXYZ(-0.08, spireAngles[i], 0.04 * (i - 1)),
        quatFromEulerXYZ(-0.30, spireAngles[i], 0.08 * (i - 1)), // splay outward in ruin!
        quatFromEulerXYZ(-0.36, spireAngles[i], 0.10 * (i - 1)),
        quatFromEulerXYZ(-0.36, spireAngles[i], 0.10 * (i - 1)),
      ],
    })),
  ]);

  const bounds = builder.calibrateBounds(3.75, 0);
  return { buffer: builder.toGLB(), bounds };
}
