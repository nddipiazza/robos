import {
  Part,
  boxBounds,
  chamferBoxY,
  cylinderZ,
  extrudePolyY,
  frustumY,
  parabolicDish,
  strut,
} from '../geometry.js';
import {
  DEG2RAD,
  ensureQuatContinuity,
  fullSpinKeyframes,
  quatFromEulerYXZ,
  quatIdentity,
} from '../math.js';

function buildAnchorFoot() {
  // Compact diagonal anchor pad extending along -Z out to r = 1.78 (hypot(1.78, 0.28) = 1.80 <= 1.875)
  const p = new Part();
  p.merge(
    extrudePolyY(
      'ArmorDark',
      [
        [0.36, -0.82],
        [0.26, -1.78],
        [-0.26, -1.78],
        [-0.36, -0.82],
      ],
      0.0,
      0.24,
      {
        topPolyXZ: [
          [0.32, -0.82],
          [0.22, -1.68],
          [-0.22, -1.68],
          [-0.32, -0.82],
        ],
      }
    )
  );
  p.merge(boxBounds('HazardTrim', -0.20, 0.20, 0.02, 0.14, -1.80, -1.70));
  p.merge(strut('SteelStructure', [0, 0.20, -1.56], [0, 0.72, -0.86], 0.10, 4));
  return p;
}

function buildScaffoldBasePart() {
  const p = new Part();

  // 1. Compact octagonal footing flush at Y = 0.00 + 4 diagonal anchor pads (R_XZ <= 1.82 <= 1.875)
  p.merge(chamferBoxY('ArmorDark', 2.06, 2.06, 0.0, 0.28, 0.48, 0.06));
  p.merge(chamferBoxY('ArmorMid', 1.74, 1.74, 0.28, 0.38, 0.40, 0.04));

  const footProto = buildAnchorFoot();
  for (const deg of [45, 135, -45, -135]) {
    p.merge(footProto.clone().rotateY(deg * DEG2RAD));
  }

  // 2. Forward (-Z) Telemetry & Signal Processing Cabinet facing -Z
  p.merge(chamferBoxY('ArmorDark', 1.04, 0.82, 0.22, 1.24, 0.14, 0.04, 0, -1.12));
  // Blue TeamColor front cabinet service door + cyan diagnostic display facing -Z
  p.merge(boxBounds('TeamColor', -0.38, 0.38, 0.34, 0.84, -1.56, -1.48));
  p.merge(boxBounds('EmissiveCyan', -0.32, 0.32, 0.90, 1.10, -1.56, -1.48));
  p.merge(boxBounds('ArmorMid', -0.46, 0.46, 1.14, 1.26, -1.62, -1.42)); // sun hood over display

  // 3. Rear (+Z) Dual Field Capacitor Power Cells
  for (const sx of [-0.34, 0.34]) {
    p.merge(frustumY('ArmorMid', 8, 0.24, 0.23, 0.22, 1.06, sx, 1.08));
    p.merge(frustumY('TeamColor', 8, 0.25, 0.25, 0.68, 0.88, sx, 1.08));
    p.merge(frustumY('SteelStructure', 8, 0.16, 0.14, 1.06, 1.16, sx, 1.08));
  }

  // 4. Compact 3-Bay Open-Frame Steel Lattice Scaffold (Y = 0.36..3.42)
  const levels = [
    { y: 0.36, h: 0.72 },
    { y: 1.38, h: 0.58 },
    { y: 2.40, h: 0.46 },
    { y: 3.38, h: 0.38 },
  ];

  for (let b = 0; b < levels.length - 1; b++) {
    const L0 = levels[b];
    const L1 = levels[b + 1];
    const c0 = [
      [-L0.h, L0.y, -L0.h],
      [L0.h, L0.y, -L0.h],
      [L0.h, L0.y, L0.h],
      [-L0.h, L0.y, L0.h],
    ];
    const c1 = [
      [-L1.h, L1.y, -L1.h],
      [L1.h, L1.y, -L1.h],
      [L1.h, L1.y, L1.h],
      [-L1.h, L1.y, L1.h],
    ];

    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      // Main corner leg column
      p.merge(strut('SteelStructure', c0[i], c1[i], 0.115, 4));
      // Horizontal tie-girder at top of bay
      p.merge(strut('SteelStructure', c1[i], c1[j], 0.08, 4));
      // True X-bracing diagonal struts on each face
      p.merge(strut('SteelStructure', c0[i], c1[j], 0.052, 4));
      p.merge(strut('SteelStructure', c0[j], c1[i], 0.052, 4));
    }
    // Corner gusset collars at intermediate joints
    if (b < levels.length - 2) {
      for (let i = 0; i < 4; i++) {
        p.merge(
          boxBounds(
            'ArmorDark',
            c1[i][0] - 0.09,
            c1[i][0] + 0.09,
            L1.y - 0.08,
            L1.y + 0.08,
            c1[i][2] - 0.09,
            c1[i][2] + 0.09
          )
        );
      }
    }
  }

  // Central vertical waveguide conduit inside the open scaffold
  p.merge(frustumY('DarkTrim', 8, 0.11, 0.09, 0.36, 3.40));

  // 5. Compact Rotary Collar Platform at Scaffold Crown (Y = 3.36..3.74)
  p.merge(chamferBoxY('ArmorDark', 1.06, 1.06, 3.36, 3.54, 0.24, 0.02));
  p.merge(frustumY('TeamColor', 8, 0.56, 0.54, 3.54, 3.68, 0, 0, Math.PI / 8));
  p.merge(frustumY('SteelStructure', 12, 0.44, 0.42, 3.68, 3.76));

  return p;
}

function buildSlimRadarDishYawPart() {
  // Local to RadarDishYaw at (0, 3.76, 0), facing -Z in rest pose
  const p = new Part();

  // Azimuth turntable hub & elevation fork
  p.merge(frustumY('ArmorDark', 10, 0.40, 0.36, 0.0, 0.20));
  for (const sx of [-0.30, 0.30]) {
    p.merge(boxBounds('SteelStructure', sx - 0.06, sx + 0.06, 0.18, 0.68, -0.14, 0.18));
  }
  // Rear (+Z) transmitter counterweight box with blue TeamColor cap
  p.merge(boxBounds('ArmorMid', -0.28, 0.28, 0.24, 0.58, 0.18, 0.68));
  p.merge(boxBounds('TeamColor', -0.24, 0.24, 0.30, 0.54, 0.64, 0.74));

  // Slim Curved Surveillance Radar Dish Assembly (aspect ratio ~3.3:1, facing -Z)
  const slimDish = new Part();
  slimDish.merge(
    parabolicDish({
      radiusX: 1.44,
      radiusY: 0.43,
      depth: 0.34,
      shellThickness: 0.07,
      radialSegs: 16,
      ringSegs: 3,
      frontMat: 'DishReflector',
      backMat: 'ArmorDark',
      rimMat: 'ArmorMid',
      ribMat: 'SteelStructure',
      teamStripeBand: false,
    })
  );

  // Rear horizontal strongback truss bar supporting the wide slim dish
  slimDish.merge(boxBounds('SteelStructure', -1.38, 1.38, -0.10, 0.10, 0.02, 0.14));

  // Crisp vertical blue TeamColor wingtip endplates on left & right tips of slim radar dish
  for (const sx of [-1, 1]) {
    slimDish.merge(
      boxBounds(
        'TeamColor',
        sx * 1.40,
        sx * 1.49,
        -0.30,
        0.30,
        -0.42,
        -0.14
      )
    );
  }

  // Forward (-Z) slim A-frame waveguide feed horn
  const focalZ = -0.98;
  slimDish.merge(strut('SteelStructure', [-0.56, 0.0, -0.06], [0, 0, focalZ], 0.048, 4));
  slimDish.merge(strut('SteelStructure', [0.56, 0.0, -0.06], [0, 0, focalZ], 0.048, 4));
  slimDish.merge(strut('SteelStructure', [0, 0.28, -0.12], [0, 0, focalZ], 0.042, 4));
  slimDish.merge(boxBounds('ArmorDark', -0.16, 0.16, -0.09, 0.09, focalZ - 0.12, focalZ + 0.06));
  slimDish.merge(boxBounds('EmissiveCyan', -0.13, 0.13, -0.06, 0.06, focalZ - 0.16, focalZ - 0.10));

  // Tilt slightly upward (+14 deg around X so -Z dish looks slightly skyward)
  slimDish.rotateX(14 * DEG2RAD);
  slimDish.translate(0, 0.68, -0.04);

  p.merge(slimDish);
  return p;
}

export function createRadarBeaconScene() {
  const scaffoldPart = buildScaffoldBasePart();
  const radarDishPart = buildSlimRadarDishYawPart();

  const root = {
    name: 'RadarBeacon',
    translation: [0, 0, 0],
    rotation: quatIdentity(),
    scale: [1, 1, 1],
    children: [
      {
        name: 'ScaffoldBase',
        translation: [0, 0, 0],
        rotation: quatIdentity(),
        scale: [1, 1, 1],
        part: scaffoldPart,
        children: [
          {
            name: 'RadarDishYaw',
            translation: [0, 3.76, 0],
            rotation: quatIdentity(),
            scale: [1, 1, 1],
            part: radarDishPart,
          },
        ],
      },
    ],
  };

  // --- Animations: idle (smooth 360-deg radar dish rotation), plus death ---
  const idleSpin = fullSpinKeyframes(4.0, [0, 1, 0], 1);

  const deathTimes = [0.0, 0.22, 0.60, 1.10, 1.50];
  const deathBaseTrans = [
    [0, 0, 0],
    [0.03, 0.04, -0.02],
    [0.06, -0.05, -0.05],
    [0.10, -0.10, -0.08],
    [0.12, -0.12, -0.10],
  ];
  const deathBaseRot = ensureQuatContinuity([
    quatIdentity(),
    quatFromEulerYXZ(3 * DEG2RAD, 4 * DEG2RAD, -5 * DEG2RAD),
    quatFromEulerYXZ(8 * DEG2RAD, 11 * DEG2RAD, -14 * DEG2RAD),
    quatFromEulerYXZ(12 * DEG2RAD, 17 * DEG2RAD, -22 * DEG2RAD),
    quatFromEulerYXZ(14 * DEG2RAD, 19 * DEG2RAD, -25 * DEG2RAD),
  ]);
  const deathBaseScale = [
    [1, 1, 1],
    [1.01, 0.96, 1.01],
    [1.04, 0.68, 1.04],
    [1.06, 0.44, 1.06],
    [1.07, 0.36, 1.07],
  ];
  const deathDishRot = ensureQuatContinuity([
    quatIdentity(),
    quatFromEulerYXZ(25 * DEG2RAD, -14 * DEG2RAD, 10 * DEG2RAD),
    quatFromEulerYXZ(55 * DEG2RAD, -32 * DEG2RAD, 24 * DEG2RAD),
    quatFromEulerYXZ(78 * DEG2RAD, -46 * DEG2RAD, 32 * DEG2RAD),
    quatFromEulerYXZ(84 * DEG2RAD, -50 * DEG2RAD, 36 * DEG2RAD),
  ]);

  return {
    name: 'RadarBeaconScene',
    targetRadius: 1.875,
    root,
    animations: [
      {
        name: 'idle',
        tracks: [
          {
            node: 'RadarDishYaw',
            path: 'rotation',
            times: idleSpin.times,
            values: idleSpin.values,
          },
        ],
      },
      {
        name: 'death',
        tracks: [
          { node: 'ScaffoldBase', path: 'translation', times: deathTimes, values: deathBaseTrans },
          { node: 'ScaffoldBase', path: 'rotation', times: deathTimes, values: deathBaseRot },
          { node: 'ScaffoldBase', path: 'scale', times: deathTimes, values: deathBaseScale },
          { node: 'RadarDishYaw', path: 'rotation', times: deathTimes, values: deathDishRot },
        ],
      },
    ],
  };
}
