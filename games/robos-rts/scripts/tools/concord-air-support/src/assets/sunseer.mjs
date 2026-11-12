// Sunseer — Aurelian Concord compact sharp scout aircraft
// Asymmetric swept crescent side wings + suspended teal/gold core + BeamOrigin under nose
// Target XZ radius: 1.875, minY: 0, -Z forward

import { MAT, createConcordMaterialLibrary } from '../materials.mjs';
import {
  PartBuilder, addBeveledPolygon, addSweepLoft, addFacetedCrystal,
  addCircularArc, profileBlade, profileChamferRect,
} from '../geometry.mjs';
import {
  TAU, cubicBezier3, quatFromEulerXYZ, quatFromAxisAngle,
} from '../math.mjs';
import { SceneAssetBuilder } from '../glb-writer.mjs';

function buildCraftHullPart() {
  const part = new PartBuilder('sunseer_hull');

  // 1. Compact sharp central fuselage body (with dorsal viewing slot over forward core bay)
  // Aft-to-mid main diamond hull: z from -0.58 to +1.18
  addBeveledPolygon(part, [
    [0.0, -0.62],
    [0.34, -0.22],
    [0.38, 0.32],
    [0.26, 0.96],
    [0.12, 1.22],
    [-0.12, 1.22],
    [-0.26, 0.96],
    [-0.38, 0.32],
    [-0.34, -0.22],
  ], {
    yBottom: -0.14,
    yTop: 0.22,
    bevelTop: 0.07,
    bevelBottom: 0.05,
    matSide: MAT.IVORY_HULL,
    matBevel: MAT.GOLD_TRIM,
    matTop: MAT.IVORY_HULL,
    matBottom: MAT.DARK_ALLOY,
  });

  // Dorsal armored spine & sensor canopy crest
  addBeveledPolygon(part, [
    [0.0, -0.52],
    [0.20, -0.14],
    [0.22, 0.34],
    [0.10, 0.88],
    [-0.10, 0.88],
    [-0.22, 0.34],
    [-0.20, -0.14],
  ], {
    yBottom: 0.20,
    yTop: 0.38,
    bevelTop: 0.05,
    bevelBottom: 0.02,
    matSide: MAT.DARK_ALLOY,
    matBevel: MAT.GOLD_TRIM,
    matTop: MAT.TEAL_GLOW,
    matBottom: MAT.DARK_ALLOY,
  });

  // Dorsal aft gold fin
  addSweepLoft(part, [
    { pos: [0, 0.34, 0.25], sx: 1.0, sy: 1.0 },
    { pos: [0, 0.50, 0.78], sx: 0.85, sy: 0.9 },
    { pos: [0, 0.44, 1.26], sx: 0.35, sy: 0.45 },
  ], profileBlade(0.045, 0.09, 0.05), {
    matBody: MAT.GOLD_TRIM,
  });

  // Moderate TeamColor shoulder panels on upper hull flanks (left & right)
  const shoulderPort = new PartBuilder('shoulder');
  addBeveledPolygon(shoulderPort, [
    [-0.16, -0.12],
    [-0.33, -0.05],
    [-0.35, 0.48],
    [-0.20, 0.76],
    [-0.14, 0.44],
  ], {
    yBottom: 0.19,
    yTop: 0.26,
    bevelTop: 0.02,
    bevelBottom: 0.01,
    matSide: MAT.GOLD_TRIM,
    matBevel: MAT.GOLD_TRIM,
    matTop: MAT.TEAM_COLOR,
    matBottom: MAT.DARK_ALLOY,
  });
  part.merge(shoulderPort);
  part.mirrorX(shoulderPort);

  // 2. Razor-sharp twin-mandible scout prow converging at nose tip (z = -1.68)
  // Leaves an open arched cradle bay at z = -0.62..-1.12 so suspended teal/gold core shines from below AND overhead!
  const mandibleSide = new PartBuilder('mandible');
  const prowStations = [
    { pos: [-0.26, 0.06, -0.45], sx: 1.15, sy: 1.20, roll: -0.18 },
    { pos: [-0.22, 0.08, -0.82], sx: 0.95, sy: 1.05, roll: -0.12 },
    { pos: [-0.14, 0.07, -1.22], sx: 0.75, sy: 0.85, roll: -0.06 },
    { pos: [-0.04, 0.05, -1.56], sx: 0.45, sy: 0.55, roll: 0.0 },
    { pos: [0.0, 0.04, -1.70], sx: 0.08, sy: 0.12, roll: 0.0 },
  ];
  addSweepLoft(mandibleSide, prowStations, profileBlade(0.11, 0.10, 0.07), {
    edgeMaterials: [
      MAT.GOLD_TRIM, MAT.IVORY_HULL, MAT.IVORY_HULL, MAT.TEAL_GLOW,
      MAT.DARK_ALLOY, MAT.DARK_ALLOY, MAT.IVORY_HULL, MAT.GOLD_TRIM,
    ],
    matCapStart: MAT.DARK_ALLOY,
    matCapEnd: MAT.GOLD_TRIM,
  });
  part.merge(mandibleSide);
  part.mirrorX(mandibleSide);

  // Sharp central needle spear tip uniting the prow at -Z
  addSweepLoft(part, [
    { pos: [0, 0.08, -1.18], sx: 1.0, sy: 1.0 },
    { pos: [0, 0.05, -1.52], sx: 0.75, sy: 0.75 },
    { pos: [0, 0.03, -1.74], sx: 0.06, sy: 0.06 },
  ], profileBlade(0.08, 0.07, 0.05), {
    edgeMaterials: [
      MAT.GOLD_TRIM, MAT.IVORY_HULL, MAT.GOLD_TRIM, MAT.IVORY_HULL,
      MAT.GOLD_TRIM, MAT.DARK_ALLOY, MAT.GOLD_TRIM, MAT.DARK_ALLOY,
    ],
    matCapStart: MAT.GOLD_TRIM,
    matCapEnd: MAT.GOLD_TRIM,
  });

  // 3. Ventral Core Suspension Talons + Ventral Stabilizer Keel (defines exact minY = 0 in rest pose)
  // Rear-ventral keel fin going down to local y = -0.54
  addSweepLoft(part, [
    { pos: [0, -0.12, 0.55], sx: 1.0, sy: 1.0 },
    { pos: [0, -0.38, 0.05], sx: 0.85, sy: 0.90 },
    { pos: [0, -0.54, -0.34], sx: 0.55, sy: 0.55 },
    { pos: [0, -0.44, -0.58], sx: 0.30, sy: 0.35 },
  ], profileBlade(0.045, 0.06, 0.06), {
    edgeMaterials: [
      MAT.GOLD_TRIM, MAT.IVORY_HULL, MAT.IVORY_HULL, MAT.GOLD_TRIM,
      MAT.GOLD_TRIM, MAT.DARK_ALLOY, MAT.TEAL_GLOW, MAT.DARK_ALLOY,
    ],
  });

  // Curved ventral gold suspension talons framing the suspended core at (0, -0.23, -0.88)
  const talon = new PartBuilder('talon');
  addSweepLoft(talon, [
    { pos: [-0.20, -0.02, -0.56], sx: 1.0, sy: 1.0 },
    { pos: [-0.26, -0.20, -0.78], sx: 0.8, sy: 0.8 },
    { pos: [-0.16, -0.34, -0.96], sx: 0.45, sy: 0.45 },
  ], profileChamferRect(0.035, 0.03, 0.008), {
    matBody: MAT.GOLD_TRIM,
  });
  part.merge(talon);
  part.mirrorX(talon);

  // 4. Twin aft vector thrusters (+Z)
  const thruster = new PartBuilder('thruster');
  addSweepLoft(thruster, [
    { pos: [-0.19, 0.04, 0.96], sx: 1.0, sy: 1.0 },
    { pos: [-0.21, 0.04, 1.24], sx: 1.12, sy: 1.12 },
    { pos: [-0.21, 0.04, 1.32], sx: 0.88, sy: 0.88 },
  ], profileChamferRect(0.095, 0.085, 0.025), {
    matBody: MAT.DARK_ALLOY,
    edgeMaterials: [
      MAT.GOLD_TRIM, MAT.DARK_ALLOY, MAT.IVORY_HULL, MAT.GOLD_TRIM,
      MAT.DARK_ALLOY, MAT.DARK_ALLOY, MAT.GOLD_TRIM, MAT.DARK_ALLOY,
    ],
    matCapStart: MAT.DARK_ALLOY,
    matCapEnd: MAT.TEAL_GLOW,
  });
  part.merge(thruster);
  part.mirrorX(thruster);

  return part;
}

// Port Wing (-X): Broad Forward-Swept Solar Scimitar Crescent
function buildPortCrescentWing() {
  const part = new PartBuilder('wing_port');
  // Local origin at [-0.30, 0.04, 0.12]
  // Sweeps out to world x = -1.875 (local x = -1.575) and hooks sharply forward (-Z)
  const p0 = [0.0, 0.0, 0.18];
  const p1 = [-0.95, 0.06, 0.34];
  const p2 = [-1.72, 0.14, -0.18];
  const p3 = [-0.96, 0.18, -1.42];

  const stations = [];
  const segs = 16;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const pos = cubicBezier3(p0, p1, p2, p3, t);
    const chord = Math.sin(Math.PI * Math.pow(t, 0.72)) * 0.95 + (1 - t) * 0.65 + 0.10;
    const thick = (1 - t * 0.72) * 0.95 + 0.12;
    stations.push({
      pos,
      up: [-0.08, 1.0, 0.04],
      sx: chord,
      sy: thick,
    });
  }

  addSweepLoft(part, stations, profileBlade(0.26, 0.065, 0.045), {
    edgeMaterials: [
      MAT.GOLD_TRIM,   // outer/inner edge
      MAT.IVORY_HULL,
      MAT.TEAL_GLOW,   // recessed dorsal arc highlight
      MAT.IVORY_HULL,
      MAT.GOLD_TRIM,   // leading crescent rim
      MAT.DARK_ALLOY,
      MAT.IVORY_HULL,
      MAT.DARK_ALLOY,
    ],
    matCapStart: MAT.DARK_ALLOY,
    matCapEnd: MAT.GOLD_TRIM,
  });

  // Secondary aft crescent spur on port wing for compound scimitar silhouette
  const spurStations = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const pos = cubicBezier3(
      [-0.58, 0.04, 0.22],
      [-1.08, 0.05, 0.45],
      [-1.34, 0.08, 0.78],
      [-1.05, 0.10, 1.12],
      t
    );
    spurStations.push({
      pos,
      sx: (1 - t * 0.82) * 0.62 + 0.08,
      sy: (1 - t * 0.7) * 0.65 + 0.1,
    });
  }
  addSweepLoft(part, spurStations, profileBlade(0.18, 0.05, 0.035), {
    edgeMaterials: [
      MAT.GOLD_TRIM, MAT.IVORY_HULL, MAT.GOLD_TRIM, MAT.IVORY_HULL,
      MAT.GOLD_TRIM, MAT.DARK_ALLOY, MAT.DARK_ALLOY, MAT.GOLD_TRIM,
    ],
  });

  // Opaque TeamColor armor panel inset on upper mid-crescent
  const tcStations = [];
  for (let i = 2; i <= 11; i++) {
    const t = i / segs;
    const base = cubicBezier3(p0, p1, p2, p3, t);
    tcStations.push({
      pos: [base[0] * 0.96, base[1] + 0.038, base[2]],
      up: [-0.08, 1.0, 0.04],
      sx: (Math.sin(Math.PI * ((i - 2) / 9)) * 0.65 + 0.28),
      sy: 0.48,
    });
  }
  addSweepLoft(part, tcStations, profileChamferRect(0.16, 0.032, 0.01), {
    edgeMaterials: [
      MAT.GOLD_TRIM, MAT.GOLD_TRIM, MAT.TEAM_COLOR, MAT.TEAM_COLOR,
      MAT.GOLD_TRIM, MAT.DARK_ALLOY, MAT.DARK_ALLOY, MAT.GOLD_TRIM,
    ],
    matCapStart: MAT.GOLD_TRIM,
    matCapEnd: MAT.GOLD_TRIM,
  });

  return part;
}

// Starboard Wing (+X): Asymmetric Aft-Swept Split Lunar Counter-Crescent + Forward Harmonic Canard
function buildStarboardCrescentWing() {
  const part = new PartBuilder('wing_starboard');
  // Local origin at [0.30, 0.04, -0.10]
  // Sweeps forward-outward to world x = +1.875 (local x = +1.575) then curves sharply AFT (+Z)!
  const p0 = [0.0, 0.0, -0.18];
  const p1 = [0.92, 0.06, -0.46];
  const p2 = [1.74, 0.14, 0.14];
  const p3 = [0.98, 0.20, 1.48];

  const segs = 16;
  const stations = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const pos = cubicBezier3(p0, p1, p2, p3, t);
    const chord = Math.sin(Math.PI * Math.pow(t, 0.70)) * 0.88 + (1 - t) * 0.60 + 0.10;
    const thick = (1 - t * 0.72) * 0.92 + 0.12;
    stations.push({
      pos,
      up: [0.08, 1.0, -0.04],
      sx: chord,
      sy: thick,
    });
  }

  addSweepLoft(part, stations, profileBlade(0.24, 0.062, 0.042), {
    edgeMaterials: [
      MAT.GOLD_TRIM,
      MAT.IVORY_HULL,
      MAT.TEAL_GLOW,
      MAT.IVORY_HULL,
      MAT.GOLD_TRIM,
      MAT.DARK_ALLOY,
      MAT.IVORY_HULL,
      MAT.DARK_ALLOY,
    ],
    matCapStart: MAT.DARK_ALLOY,
    matCapEnd: MAT.GOLD_TRIM,
  });

  // Inner forward-curving harmonic sensor horn (distinct starboard asymmetry feature!)
  const hornStations = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const pos = cubicBezier3(
      [0.32, 0.02, -0.24],
      [0.88, 0.03, -0.52],
      [1.08, 0.06, -0.92],
      [0.68, 0.09, -1.28],
      t
    );
    hornStations.push({
      pos,
      sx: (1 - t * 0.78) * 0.58 + 0.08,
      sy: (1 - t * 0.68) * 0.65 + 0.12,
    });
  }
  addSweepLoft(part, hornStations, profileBlade(0.15, 0.045, 0.035), {
    edgeMaterials: [
      MAT.GOLD_TRIM, MAT.IVORY_HULL, MAT.TEAL_GLOW, MAT.GOLD_TRIM,
      MAT.GOLD_TRIM, MAT.DARK_ALLOY, MAT.IVORY_HULL, MAT.DARK_ALLOY,
    ],
  });

  // Opaque TeamColor panel along starboard crescent arc
  const tcStations = [];
  for (let i = 2; i <= 11; i++) {
    const t = i / segs;
    const base = cubicBezier3(p0, p1, p2, p3, t);
    tcStations.push({
      pos: [base[0] * 0.96, base[1] + 0.036, base[2]],
      up: [0.08, 1.0, -0.04],
      sx: (Math.sin(Math.PI * ((i - 2) / 9)) * 0.62 + 0.26),
      sy: 0.48,
    });
  }
  addSweepLoft(part, tcStations, profileChamferRect(0.15, 0.032, 0.01), {
    edgeMaterials: [
      MAT.GOLD_TRIM, MAT.GOLD_TRIM, MAT.TEAM_COLOR, MAT.TEAM_COLOR,
      MAT.GOLD_TRIM, MAT.DARK_ALLOY, MAT.DARK_ALLOY, MAT.GOLD_TRIM,
    ],
    matCapStart: MAT.GOLD_TRIM,
    matCapEnd: MAT.GOLD_TRIM,
  });

  return part;
}

function buildCoreGyroRing() {
  const part = new PartBuilder('core_gyro_ring');
  addCircularArc(part, {
    center: [0, 0, 0],
    radius: 0.22,
    segments: 20,
    closed: true,
    tiltX: 0.35,
    profile: profileChamferRect(0.026, 0.022, 0.006),
    matBody: MAT.GOLD_TRIM,
  });
  addCircularArc(part, {
    center: [0, 0, 0],
    radius: 0.18,
    segments: 16,
    closed: true,
    tiltZ: 1.15,
    profile: profileChamferRect(0.018, 0.018, 0.005),
    matBody: MAT.GOLD_TRIM,
  });
  return part;
}

function buildSuspendedCoreGem() {
  const part = new PartBuilder('suspended_core_gem');
  addFacetedCrystal(part, {
    center: [0, 0, 0],
    sides: 6,
    radiusX: 0.125,
    radiusZ: 0.145,
    upperH: 0.16,
    lowerH: 0.16,
    girdleH: 0.035,
    matCrystal: MAT.CORE_BRIGHT,
    matGirdle: MAT.GOLD_TRIM,
  });
  return part;
}

function buildBeamEmitterLens() {
  const part = new PartBuilder('beam_emitter_lens');
  // Compact golden focusing collar + forward teal emitter crystal at BeamOrigin (under nose)
  // Extends forward (-Z) during attack animation via scale!
  addCircularArc(part, {
    center: [0, 0, -0.02],
    radius: 0.065,
    segments: 12,
    closed: true,
    tiltX: Math.PI * 0.5,
    profile: profileChamferRect(0.016, 0.018, 0.004),
    matBody: MAT.GOLD_TRIM,
  });
  addSweepLoft(part, [
    { pos: [0, 0, 0.02], sx: 0.9, sy: 0.9 },
    { pos: [0, 0, -0.05], sx: 1.0, sy: 1.0 },
    { pos: [0, 0, -0.16], sx: 0.15, sy: 0.15 },
  ], profileChamferRect(0.036, 0.036, 0.012), {
    matBody: MAT.CORE_BRIGHT,
    matCapStart: MAT.GOLD_TRIM,
    matCapEnd: MAT.CORE_BRIGHT,
  });
  return part;
}

function spinKeyframesY(duration, turns = 1, tiltX = 0, tiltZ = 0) {
  const steps = 6 * Math.max(1, Math.abs(turns));
  const times = [];
  const values = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    times.push(t * duration);
    const angle = t * TAU * turns;
    values.push(quatFromEulerXYZ(tiltX, angle, tiltZ));
  }
  return { times, values };
}

export function buildSunseerAsset() {
  const matLib = createConcordMaterialLibrary();
  const builder = new SceneAssetBuilder('sunseer', matLib);

  const hullBaseY = 0.54;
  const hullIdx = builder.addNode({
    name: 'CraftHull',
    parent: 0,
    translation: [0, hullBaseY, 0],
    part: buildCraftHullPart(),
  });

  const wingPortIdx = builder.addNode({
    name: 'WingPort',
    parent: hullIdx,
    translation: [-0.30, 0.04, 0.12],
    part: buildPortCrescentWing(),
  });

  const wingStarboardIdx = builder.addNode({
    name: 'WingStarboard',
    parent: hullIdx,
    translation: [0.30, 0.04, -0.10],
    part: buildStarboardCrescentWing(),
  });

  const coreRingIdx = builder.addNode({
    name: 'CoreGyroRing',
    parent: hullIdx,
    translation: [0, -0.22, -0.86],
    part: buildCoreGyroRing(),
  });

  const coreGemIdx = builder.addNode({
    name: 'SuspendedCore',
    parent: hullIdx,
    translation: [0, -0.22, -0.86],
    part: buildSuspendedCoreGem(),
    creaseAngle: 18,
  });

  // Required socket node: BeamOrigin under the nose, facing -Z forward
  const beamOriginIdx = builder.addNode({
    name: 'BeamOrigin',
    parent: hullIdx,
    translation: [0, -0.22, -1.24],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  });

  const beamPulseIdx = builder.addNode({
    name: 'BeamEmitterPulse',
    parent: beamOriginIdx,
    translation: [0, 0, 0],
    part: buildBeamEmitterLens(),
  });

  // --- Animations (all targeting visible mesh nodes) ---
  // 1. hover (2.4s seamless airborne scout hover loop)
  const hoverSpin = spinKeyframesY(2.4, 1, 0.12, 0.08);
  const hoverCounterSpin = spinKeyframesY(2.4, -1, 0, 0);
  builder.addAnimation('hover', [
    {
      node: hullIdx,
      path: 'translation',
      times: [0, 0.6, 1.2, 1.8, 2.4],
      values: [
        [0, hullBaseY, 0],
        [0.02, hullBaseY + 0.09, -0.02],
        [0, hullBaseY + 0.03, 0.01],
        [-0.02, hullBaseY + 0.10, -0.01],
        [0, hullBaseY, 0],
      ],
    },
    {
      node: hullIdx,
      path: 'rotation',
      times: [0, 0.6, 1.2, 1.8, 2.4],
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-0.025, 0.02, -0.035),
        quatFromEulerXYZ(0.015, 0, 0.01),
        quatFromEulerXYZ(-0.02, -0.02, 0.035),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      node: wingPortIdx,
      path: 'rotation',
      times: [0, 1.2, 2.4],
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, 0.045),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      node: wingStarboardIdx,
      path: 'rotation',
      times: [0, 1.2, 2.4],
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0, -0.045),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      node: coreRingIdx,
      path: 'rotation',
      times: hoverSpin.times,
      values: hoverSpin.values,
    },
    {
      node: coreGemIdx,
      path: 'rotation',
      times: hoverCounterSpin.times,
      values: hoverCounterSpin.values,
    },
    {
      node: coreGemIdx,
      path: 'scale',
      times: [0, 0.6, 1.2, 1.8, 2.4],
      values: [
        [1, 1, 1],
        [1.15, 1.18, 1.15],
        [0.96, 0.96, 0.96],
        [1.16, 1.20, 1.16],
        [1, 1, 1],
      ],
    },
  ]);

  // 2. idle (2.4s station-keeping sensor scan)
  const idleSpin = spinKeyframesY(2.4, 1, 0, 0);
  builder.addAnimation('idle', [
    {
      node: hullIdx,
      path: 'translation',
      times: [0, 1.2, 2.4],
      values: [
        [0, hullBaseY, 0],
        [0, hullBaseY + 0.06, 0],
        [0, hullBaseY, 0],
      ],
    },
    {
      node: hullIdx,
      path: 'rotation',
      times: [0, 0.8, 1.6, 2.4],
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0.045, -0.02),
        quatFromEulerXYZ(0, -0.045, 0.02),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      node: coreRingIdx,
      path: 'rotation',
      times: idleSpin.times,
      values: idleSpin.values,
    },
    {
      node: coreGemIdx,
      path: 'scale',
      times: [0, 1.2, 2.4],
      values: [
        [1, 1, 1],
        [1.14, 1.14, 1.14],
        [1, 1, 1],
      ],
    },
  ]);

  // 3. attack (1.5s focused nose-beam strike from BeamOrigin)
  const attackSpin = spinKeyframesY(1.5, 2, 0.2, 0);
  builder.addAnimation('attack', [
    {
      node: hullIdx,
      path: 'translation',
      times: [0, 0.30, 0.45, 0.95, 1.5],
      values: [
        [0, hullBaseY, 0],
        [0, hullBaseY + 0.06, -0.08], // lean into target
        [0, hullBaseY + 0.05, 0.10],  // beam discharge recoil
        [0, hullBaseY + 0.04, 0.06],
        [0, hullBaseY, 0],
      ],
    },
    {
      node: hullIdx,
      path: 'rotation',
      times: [0, 0.30, 0.48, 1.0, 1.5],
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-0.07, 0, 0),
        quatFromEulerXYZ(0.04, 0, 0),
        quatFromEulerXYZ(0.02, 0, 0),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      node: wingPortIdx,
      path: 'rotation',
      times: [0, 0.32, 1.0, 1.5],
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, -0.08, -0.12),
        quatFromEulerXYZ(0, -0.06, -0.10),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      node: wingStarboardIdx,
      path: 'rotation',
      times: [0, 0.32, 1.0, 1.5],
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0, 0.08, 0.12),
        quatFromEulerXYZ(0, 0.06, 0.10),
        quatFromEulerXYZ(0, 0, 0),
      ],
    },
    {
      node: coreRingIdx,
      path: 'rotation',
      times: attackSpin.times,
      values: attackSpin.values,
    },
    {
      node: coreGemIdx,
      path: 'scale',
      times: [0, 0.30, 0.45, 1.0, 1.5],
      values: [
        [1, 1, 1],
        [1.38, 1.38, 1.38],
        [1.48, 1.48, 1.55],
        [1.25, 1.25, 1.25],
        [1, 1, 1],
      ],
    },
    {
      node: beamPulseIdx,
      path: 'scale',
      times: [0, 0.25, 0.38, 0.90, 1.20, 1.5],
      values: [
        [1, 1, 1],
        [1.4, 1.4, 1.8],
        [2.2, 2.2, 7.5], // bright beam lance projecting forward along -Z from BeamOrigin
        [1.9, 1.9, 6.8],
        [1.1, 1.1, 1.3],
        [1, 1, 1],
      ],
    },
  ]);

  // 4. death (1.7s core overload, asymmetric wing shear & grounded wreck resting cleanly at Y >= 0)
  builder.addAnimation('death', [
    {
      node: hullIdx,
      path: 'translation',
      times: [0, 0.28, 0.75, 1.25, 1.7],
      values: [
        [0, hullBaseY, 0],
        [0.05, hullBaseY + 0.22, 0.06],
        [-0.06, hullBaseY + 0.10, 0.10],
        [-0.08, hullBaseY + 0.08, 0.14],
        [-0.08, hullBaseY + 0.08, 0.14],
      ],
    },
    {
      node: hullIdx,
      path: 'rotation',
      times: [0, 0.30, 0.85, 1.35, 1.7],
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0.08, 0.08, -0.14),
        quatFromEulerXYZ(-0.04, 0.18, 0.16),
        quatFromEulerXYZ(-0.03, 0.22, 0.15),
        quatFromEulerXYZ(-0.03, 0.22, 0.15),
      ],
    },
    {
      node: wingPortIdx,
      path: 'rotation',
      times: [0, 0.35, 1.1, 1.7],
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0.05, 0.12, 0.14),
        quatFromEulerXYZ(0.06, 0.22, 0.10),
        quatFromEulerXYZ(0.06, 0.22, 0.10),
      ],
    },
    {
      node: wingStarboardIdx,
      path: 'rotation',
      times: [0, 0.35, 1.1, 1.7],
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(-0.06, -0.15, -0.16),
        quatFromEulerXYZ(-0.05, -0.24, -0.18),
        quatFromEulerXYZ(-0.05, -0.24, -0.18),
      ],
    },
    {
      node: coreGemIdx,
      path: 'scale',
      times: [0, 0.22, 0.55, 1.1, 1.7],
      values: [
        [1, 1, 1],
        [1.55, 1.55, 1.55],
        [0.45, 0.45, 0.45],
        [0.12, 0.12, 0.12],
        [0.10, 0.10, 0.10],
      ],
    },
    {
      node: coreRingIdx,
      path: 'rotation',
      times: [0, 0.4, 1.1, 1.7],
      values: [
        quatFromAxisAngle([0, 1, 0], 0),
        quatFromEulerXYZ(0.8, 1.4, 0.5),
        quatFromEulerXYZ(1.35, 2.1, 0.9),
        quatFromEulerXYZ(1.35, 2.1, 0.9),
      ],
    },
    {
      node: beamPulseIdx,
      path: 'scale',
      times: [0, 0.20, 0.60, 1.7],
      values: [
        [1, 1, 1],
        [1.3, 1.3, 1.5],
        [0.2, 0.2, 0.2],
        [0.15, 0.15, 0.15],
      ],
    },
  ]);

  const bounds = builder.calibrateBounds(1.875, 0);
  return { buffer: builder.toGLB(), bounds };
}
