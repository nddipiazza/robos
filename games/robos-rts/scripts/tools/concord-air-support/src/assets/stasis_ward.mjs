// Stasis Ward — Aurelian Concord small hovering diamond over narrow three-pronged emitter base
// Features a visibly pulsing center, ivory metallic hull, gold trims, teal recesses & TeamColor panels
// Target XZ radius: 1.25, minY: 0, -Z forward

import { MAT, createConcordMaterialLibrary } from '../materials.mjs';
import {
  PartBuilder, addBeveledPolygon, addSweepLoft, addFacetedCrystal,
  addCircularArc, regularPolygonXZ, profileBlade, profileChamferRect,
} from '../geometry.mjs';
import {
  TAU, rotY3, quatFromEulerXYZ,
} from '../math.mjs';
import { SceneAssetBuilder } from '../glb-writer.mjs';

function buildEmitterHubPart() {
  const part = new PartBuilder('emitter_hub');

  // Narrow central hexagonal emitter column (radius ~0.20, height 0..0.58)
  addBeveledPolygon(part, regularPolygonXZ(6, 0.22, 0.22, Math.PI / 6), {
    yBottom: 0.0,
    yTop: 0.14,
    bevelTop: 0.03,
    bevelBottom: 0.015,
    matSide: MAT.DARK_ALLOY,
    matBevel: MAT.GOLD_TRIM,
    matTop: MAT.IVORY_HULL,
    matBottom: MAT.DARK_ALLOY,
  });

  // Fluted narrow stem
  addBeveledPolygon(part, regularPolygonXZ(6, 0.155, 0.155, 0), {
    yBottom: 0.13,
    yTop: 0.48,
    bevelTop: 0.025,
    bevelBottom: 0.02,
    matSide: MAT.IVORY_HULL,
    matBevel: MAT.GOLD_TRIM,
    matTop: MAT.DARK_ALLOY,
    matBottom: MAT.DARK_ALLOY,
  });

  // Recessed teal vertical flutes on narrow stem (3 alternating faces)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    const flute = new PartBuilder('flute');
    addSweepLoft(flute, [
      { pos: [0, 0.17, -0.156], sx: 1, sy: 1 },
      { pos: [0, 0.44, -0.156], sx: 0.9, sy: 0.9 },
    ], profileChamferRect(0.024, 0.014, 0.004), {
      matBody: MAT.TEAL_GLOW,
    });
    part.rotateY(flute, a);
  }

  // Upper emitter projector collar & glowing teal stasis lens dish
  addCircularArc(part, {
    center: [0, 0.51, 0],
    radius: 0.185,
    segments: 18,
    closed: true,
    profile: profileChamferRect(0.032, 0.028, 0.008),
    matBody: MAT.GOLD_TRIM,
  });

  addBeveledPolygon(part, regularPolygonXZ(8, 0.15, 0.15, 0), {
    yBottom: 0.48,
    yTop: 0.55,
    bevelTop: 0.02,
    bevelBottom: 0.01,
    matSide: MAT.GOLD_TRIM,
    matBevel: MAT.GOLD_TRIM,
    matTop: MAT.CORE_BRIGHT,
    matBottom: MAT.DARK_ALLOY,
  });

  return part;
}

// Single narrow emitter prong pointing along -Z out to R = 1.25 (replicated at 0, 120, 240 deg)
function buildSingleEmitterProngPart(isForwardProng = false) {
  const part = new PartBuilder('emitter_prong');

  // 1. Slender swept ground-skimming stabilizer blade tapering to a razor point at z = -1.25
  const legStations = [
    { pos: [0, 0.11, -0.16], sx: 1.05, sy: 1.15 },
    { pos: [0, 0.14, -0.44], sx: 0.92, sy: 1.05 },
    { pos: [0, 0.09, -0.82], sx: 0.68, sy: 0.78 },
    { pos: [0, 0.045, -1.10], sx: 0.42, sy: 0.50 },
    { pos: [0, 0.022, -1.25], sx: 0.14, sy: 0.22 },
  ];
  addSweepLoft(part, legStations, profileBlade(0.088, 0.075, 0.045), {
    edgeMaterials: [
      MAT.GOLD_TRIM,
      MAT.IVORY_HULL,
      MAT.TEAL_GLOW, // recessed dorsal teal conduit along narrow prong!
      MAT.IVORY_HULL,
      MAT.GOLD_TRIM,
      MAT.DARK_ALLOY,
      MAT.DARK_ALLOY,
      MAT.GOLD_TRIM,
    ],
    matCapStart: MAT.DARK_ALLOY,
    matCapEnd: MAT.GOLD_TRIM,
  });

  // Small ground contact pad at y = 0.000 under mid-outer leg so minY === 0.000 cleanly
  addBeveledPolygon(part, [
    [0.0, -1.16],
    [0.048, -1.00],
    [0.042, -0.84],
    [-0.042, -0.84],
    [-0.048, -1.00],
  ], {
    yBottom: 0.0,
    yTop: 0.045,
    bevelTop: 0.01,
    bevelBottom: 0.004,
    matSide: MAT.GOLD_TRIM,
    matBevel: MAT.GOLD_TRIM,
    matTop: MAT.DARK_ALLOY,
    matBottom: MAT.DARK_ALLOY,
  });

  // 2. Moderate opaque TeamColor armor plate inset along upper root-mid spine of prong
  addSweepLoft(part, [
    { pos: [0, 0.185, -0.25], sx: 1.0, sy: 1.0 },
    { pos: [0, 0.195, -0.50], sx: 0.88, sy: 0.95 },
    { pos: [0, 0.145, -0.76], sx: 0.56, sy: 0.80 },
  ], profileChamferRect(isForwardProng ? 0.068 : 0.056, 0.022, 0.006), {
    edgeMaterials: [
      MAT.GOLD_TRIM, MAT.GOLD_TRIM, MAT.TEAM_COLOR, MAT.TEAM_COLOR,
      MAT.GOLD_TRIM, MAT.DARK_ALLOY, MAT.DARK_ALLOY, MAT.GOLD_TRIM,
    ],
    matCapStart: MAT.GOLD_TRIM,
    matCapEnd: MAT.GOLD_TRIM,
  });

  // 3. Upward-curving inner stasis emitter horn rising from prong to cradle hovering diamond!
  addSweepLoft(part, [
    { pos: [0, 0.16, -0.44], sx: 1.0, sy: 1.0 },
    { pos: [0, 0.42, -0.48], sx: 0.82, sy: 0.85 },
    { pos: [0, 0.68, -0.41], sx: 0.58, sy: 0.62 },
    { pos: [0, 0.84, -0.30], sx: 0.28, sy: 0.32 },
  ], profileBlade(0.052, 0.048, 0.040), {
    edgeMaterials: [
      MAT.GOLD_TRIM, MAT.IVORY_HULL, MAT.GOLD_TRIM, MAT.IVORY_HULL,
      MAT.GOLD_TRIM, MAT.TEAL_GLOW, MAT.CORE_BRIGHT, MAT.TEAL_GLOW,
    ],
    matCapStart: MAT.DARK_ALLOY,
    matCapEnd: MAT.CORE_BRIGHT,
  });

  return part;
}

// Upper half of the small hovering diamond (rotated 45 deg so 4 corners contrast with 3-prong base!)
function buildDiamondCrownPart() {
  const part = new PartBuilder('diamond_crown');
  // Local origin at diamond center (y = 1.54); crown spans local y = +0.11 .. +0.62
  // Main ivory octahedral upper cap
  addBeveledPolygon(part, regularPolygonXZ(4, 0.42, 0.42, Math.PI / 4), {
    yBottom: 0.12,
    yTop: 0.22,
    bevelTop: 0.04,
    bevelBottom: 0.02,
    matSide: MAT.GOLD_TRIM,
    matBevel: MAT.GOLD_TRIM,
    matTop: MAT.IVORY_HULL,
    matBottom: MAT.TEAL_GLOW,
  });

  // Sculpted 4-sided upper diamond spire to sharp apex
  addFacetedCrystal(part, {
    center: [0, 0.22, 0],
    sides: 4,
    radiusX: 0.39,
    radiusZ: 0.39,
    upperH: 0.42,
    lowerH: 0.04,
    girdleH: 0.03,
    phase: Math.PI / 4,
    matCrystal: MAT.IVORY_HULL,
    matGirdle: MAT.GOLD_TRIM,
  });

  // Four TeamColor chevron badges + gold corner ribs on the upper diamond faces (readable from steep overhead!)
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    const rib = new PartBuilder('crown_rib');
    // Corner gold spine along 45-deg ridge
    addSweepLoft(rib, [
      { pos: [0.28, 0.14, -0.28], sx: 1.0, sy: 1.0 },
      { pos: [0.14, 0.39, -0.14], sx: 0.78, sy: 0.78 },
      { pos: [0.0, 0.65, 0.0], sx: 0.25, sy: 0.25 },
    ], profileChamferRect(0.026, 0.024, 0.006), {
      matBody: MAT.GOLD_TRIM,
    });

    // Moderate opaque TeamColor facet inset on alternating/all 4 upper faces
    addSweepLoft(rib, [
      { pos: [0, 0.21, -0.25], sx: 1.0, sy: 1.0 },
      { pos: [0, 0.38, -0.14], sx: 0.55, sy: 0.85 },
    ], profileChamferRect(0.088, 0.018, 0.005), {
      edgeMaterials: [
        MAT.GOLD_TRIM, MAT.GOLD_TRIM, MAT.TEAM_COLOR, MAT.TEAM_COLOR,
        MAT.GOLD_TRIM, MAT.DARK_ALLOY, MAT.DARK_ALLOY, MAT.GOLD_TRIM,
      ],
    });
    part.rotateY(rib, a);
  }

  return part;
}

// Lower half of the small hovering diamond (spans local y = -0.60 .. -0.11, leaving open 0.22m waist for pulsing center!)
function buildDiamondPointPart() {
  const part = new PartBuilder('diamond_point');

  addBeveledPolygon(part, regularPolygonXZ(4, 0.40, 0.40, Math.PI / 4), {
    yBottom: -0.20,
    yTop: -0.12,
    bevelTop: 0.02,
    bevelBottom: 0.035,
    matSide: MAT.GOLD_TRIM,
    matBevel: MAT.GOLD_TRIM,
    matTop: MAT.TEAL_GLOW,
    matBottom: MAT.IVORY_HULL,
  });

  addFacetedCrystal(part, {
    center: [0, -0.20, 0],
    sides: 4,
    radiusX: 0.36,
    radiusZ: 0.36,
    upperH: 0.03,
    lowerH: 0.40,
    girdleH: 0.025,
    phase: Math.PI / 4,
    matCrystal: MAT.IVORY_HULL,
    matGirdle: MAT.GOLD_TRIM,
  });

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU;
    const rib = new PartBuilder('lower_rib');
    addSweepLoft(rib, [
      { pos: [0.26, -0.14, -0.26], sx: 1.0, sy: 1.0 },
      { pos: [0.13, -0.37, -0.13], sx: 0.75, sy: 0.75 },
      { pos: [0.0, -0.61, 0.0], sx: 0.24, sy: 0.24 },
    ], profileChamferRect(0.022, 0.022, 0.005), {
      matBody: MAT.GOLD_TRIM,
    });
    part.rotateY(rib, a);
  }

  return part;
}

// Four floating outer diamond corner brackets framing the open equatorial window around the pulsing center
function buildDiamondCornerBrackets() {
  const part = new PartBuilder('diamond_brackets');
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + Math.PI / 4;
    const bracket = new PartBuilder('bracket');
    addSweepLoft(bracket, [
      { pos: [0, 0.20, -0.43], sx: 0.65, sy: 0.65 },
      { pos: [0, 0.0, -0.50], sx: 1.05, sy: 1.05 },
      { pos: [0, -0.20, -0.41], sx: 0.65, sy: 0.65 },
    ], profileBlade(0.042, 0.042, 0.035), {
      edgeMaterials: [
        MAT.GOLD_TRIM, MAT.IVORY_HULL, MAT.GOLD_TRIM, MAT.IVORY_HULL,
        MAT.GOLD_TRIM, MAT.TEAL_GLOW, MAT.CORE_BRIGHT, MAT.TEAL_GLOW,
      ],
    });
    part.rotateY(bracket, a);
  }
  return part;
}

// Luminous Pulsing Center inside the hovering diamond!
function buildPulsingCenterPart() {
  const part = new PartBuilder('pulsing_center');
  // Radiant teal faceted core gem + inner crossed star facets so it shines brightly from overhead & sides
  addFacetedCrystal(part, {
    center: [0, 0, 0],
    sides: 8,
    radiusX: 0.22,
    radiusZ: 0.22,
    upperH: 0.21,
    lowerH: 0.21,
    girdleH: 0.045,
    matCrystal: MAT.CORE_BRIGHT,
    matGirdle: MAT.GOLD_TRIM,
  });
  return part;
}

function buildPulseHaloRingPart() {
  const part = new PartBuilder('pulse_halo_ring');
  addCircularArc(part, {
    center: [0, 0, 0],
    radius: 0.32,
    segments: 20,
    closed: true,
    tiltX: 0.22,
    profile: profileChamferRect(0.024, 0.018, 0.005),
    edgeMaterials: [
      MAT.GOLD_TRIM, MAT.CORE_BRIGHT, MAT.TEAL_GLOW, MAT.CORE_BRIGHT,
      MAT.GOLD_TRIM, MAT.GOLD_TRIM, MAT.TEAL_GLOW, MAT.GOLD_TRIM,
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

export function buildStasisWardAsset() {
  const matLib = createConcordMaterialLibrary();
  const builder = new SceneAssetBuilder('stasis_ward', matLib);

  // Base hub resting on Y = 0
  const hubIdx = builder.addNode({
    name: 'EmitterHub',
    parent: 0,
    translation: [0, 0, 0],
    part: buildEmitterHubPart(),
  });

  // Three narrow emitter prongs at 0 deg (-Z forward), +120 deg, -120 deg
  const prongAngles = [0, TAU / 3, (2 * TAU) / 3];
  const prongIndices = prongAngles.map((ang, i) =>
    builder.addNode({
      name: `EmitterProng_${i}`,
      parent: hubIdx,
      translation: [0, 0, 0],
      rotation: quatFromEulerXYZ(0, ang, 0),
      part: buildSingleEmitterProngPart(i === 0),
    })
  );

  // Hovering diamond assembly centered at Y = 1.54 over the narrow 3-prong emitter base
  const diamondY = 1.54;
  const bracketsIdx = builder.addNode({
    name: 'DiamondBrackets',
    parent: 0,
    translation: [0, diamondY, 0],
    part: buildDiamondCornerBrackets(),
  });

  const crownIdx = builder.addNode({
    name: 'DiamondCrown',
    parent: bracketsIdx,
    translation: [0, 0, 0],
    part: buildDiamondCrownPart(),
    creaseAngle: 20,
  });

  const pointIdx = builder.addNode({
    name: 'DiamondPoint',
    parent: bracketsIdx,
    translation: [0, 0, 0],
    part: buildDiamondPointPart(),
    creaseAngle: 20,
  });

  const pulsingCenterIdx = builder.addNode({
    name: 'PulsingCenter',
    parent: bracketsIdx,
    translation: [0, 0, 0],
    part: buildPulsingCenterPart(),
    creaseAngle: 18,
  });

  const pulseHaloIdx = builder.addNode({
    name: 'PulseHaloRing',
    parent: bracketsIdx,
    translation: [0, 0, 0],
    part: buildPulseHaloRingPart(),
  });

  // --- Animations ---
  const hoverDiamondSpin = spinKeys(2.4, 1, 0, 0);
  const hoverCoreSpin = spinKeys(2.4, -2, 0, 0);
  const hoverHaloSpin = spinKeys(2.4, 1, 0.32, -0.18);

  const makeHoverClip = (clipName) => {
    builder.addAnimation(clipName, [
      {
        node: bracketsIdx,
        path: 'translation',
        times: [0, 0.6, 1.2, 1.8, 2.4],
        values: [
          [0, diamondY, 0],
          [0, diamondY + 0.09, 0],
          [0, diamondY + 0.02, 0],
          [0, diamondY + 0.10, 0],
          [0, diamondY, 0],
        ],
      },
      {
        node: bracketsIdx,
        path: 'rotation',
        times: hoverDiamondSpin.times,
        values: hoverDiamondSpin.values,
      },
      {
        node: crownIdx,
        path: 'translation',
        times: [0, 0.6, 1.2, 1.8, 2.4],
        values: [
          [0, 0, 0],
          [0, 0.045, 0],
          [0, 0.005, 0],
          [0, 0.05, 0],
          [0, 0, 0],
        ],
      },
      {
        node: pointIdx,
        path: 'translation',
        times: [0, 0.6, 1.2, 1.8, 2.4],
        values: [
          [0, 0, 0],
          [0, -0.035, 0],
          [0, -0.005, 0],
          [0, -0.04, 0],
          [0, 0, 0],
        ],
      },
      // Prominent rhythmic pulsing of the center!
      {
        node: pulsingCenterIdx,
        path: 'scale',
        times: [0, 0.6, 1.2, 1.8, 2.4],
        values: [
          [0.86, 0.86, 0.86],
          [1.30, 1.32, 1.30],
          [0.88, 0.88, 0.88],
          [1.34, 1.36, 1.34],
          [0.86, 0.86, 0.86],
        ],
      },
      {
        node: pulsingCenterIdx,
        path: 'rotation',
        times: hoverCoreSpin.times,
        values: hoverCoreSpin.values,
      },
      {
        node: pulseHaloIdx,
        path: 'rotation',
        times: hoverHaloSpin.times,
        values: hoverHaloSpin.values,
      },
      {
        node: pulseHaloIdx,
        path: 'scale',
        times: [0, 0.6, 1.2, 1.8, 2.4],
        values: [
          [0.95, 0.95, 0.95],
          [1.16, 1.16, 1.16],
          [0.96, 0.96, 0.96],
          [1.18, 1.18, 1.18],
          [0.95, 0.95, 0.95],
        ],
      },
    ]);
  };

  makeHoverClip('hover');
  makeHoverClip('idle');

  // cast (1.8s stasis wave release: split diamond opens wide, pulsing center surges dramatically!)
  const castSpin = spinKeys(1.8, 2, 0, 0);
  builder.addAnimation('cast', [
    {
      node: bracketsIdx,
      path: 'translation',
      times: [0, 0.40, 0.70, 1.25, 1.8],
      values: [
        [0, diamondY, 0],
        [0, diamondY + 0.24, 0],
        [0, diamondY + 0.28, 0],
        [0, diamondY + 0.10, 0],
        [0, diamondY, 0],
      ],
    },
    {
      node: bracketsIdx,
      path: 'rotation',
      times: castSpin.times,
      values: castSpin.values,
    },
    {
      node: crownIdx,
      path: 'translation',
      times: [0, 0.45, 0.80, 1.8],
      values: [
        [0, 0, 0],
        [0, 0.22, 0],
        [0, 0.25, 0],
        [0, 0, 0],
      ],
    },
    {
      node: pointIdx,
      path: 'translation',
      times: [0, 0.45, 0.80, 1.8],
      values: [
        [0, 0, 0],
        [0, -0.15, 0],
        [0, -0.17, 0],
        [0, 0, 0],
      ],
    },
    {
      node: pulsingCenterIdx,
      path: 'scale',
      times: [0, 0.30, 0.55, 0.90, 1.40, 1.8],
      values: [
        [1, 1, 1],
        [0.72, 0.72, 0.72], // charge-in compression
        [1.78, 1.78, 1.78], // massive stasis center pulse!
        [1.52, 1.52, 1.52],
        [1.12, 1.12, 1.12],
        [1, 1, 1],
      ],
    },
    {
      node: pulseHaloIdx,
      path: 'scale',
      times: [0, 0.35, 0.60, 1.05, 1.8],
      values: [
        [1, 1, 1],
        [0.85, 0.85, 0.85],
        [1.95, 1.25, 1.95], // stasis ring shockwave expansion
        [1.45, 1.10, 1.45],
        [1, 1, 1],
      ],
    },
    ...prongIndices.map((pIdx, i) => ({
      node: pIdx,
      path: 'rotation',
      times: [0, 0.50, 1.0, 1.8],
      values: [
        quatFromEulerXYZ(0, prongAngles[i], 0),
        quatFromEulerXYZ(0.045, prongAngles[i], 0),
        quatFromEulerXYZ(0.025, prongAngles[i], 0),
        quatFromEulerXYZ(0, prongAngles[i], 0),
      ],
    })),
  ]);

  // death (1.6s stasis collapse: pulsing center extinguishes, hovering diamond drops onto emitter base)
  builder.addAnimation('death', [
    {
      node: bracketsIdx,
      path: 'translation',
      times: [0, 0.22, 0.68, 1.10, 1.6],
      values: [
        [0, diamondY, 0],
        [0.02, diamondY + 0.08, -0.02],
        [0.04, 0.74, 0.03],
        [0.05, 0.58, 0.04],
        [0.05, 0.58, 0.04],
      ],
    },
    {
      node: bracketsIdx,
      path: 'rotation',
      times: [0, 0.30, 0.80, 1.20, 1.6],
      values: [
        quatFromEulerXYZ(0, 0, 0),
        quatFromEulerXYZ(0.18, 0.35, -0.14),
        quatFromEulerXYZ(0.55, 0.85, 0.38),
        quatFromEulerXYZ(0.68, 1.05, 0.46),
        quatFromEulerXYZ(0.68, 1.05, 0.46),
      ],
    },
    {
      node: crownIdx,
      path: 'translation',
      times: [0, 0.35, 1.0, 1.6],
      values: [
        [0, 0, 0],
        [0.08, 0.12, -0.06],
        [0.14, -0.18, -0.10],
        [0.14, -0.18, -0.10],
      ],
    },
    {
      node: pulsingCenterIdx,
      path: 'scale',
      times: [0, 0.18, 0.50, 1.0, 1.6],
      values: [
        [1, 1, 1],
        [1.45, 1.45, 1.45],
        [0.35, 0.35, 0.35],
        [0.08, 0.08, 0.08],
        [0.06, 0.06, 0.06],
      ],
    },
    {
      node: pulseHaloIdx,
      path: 'scale',
      times: [0, 0.25, 0.75, 1.6],
      values: [
        [1, 1, 1],
        [1.3, 1.3, 1.3],
        [0.25, 0.25, 0.25],
        [0.15, 0.15, 0.15],
      ],
    },
  ]);

  const bounds = builder.calibrateBounds(1.25, 0);
  return { buffer: builder.toGLB(), bounds };
}
