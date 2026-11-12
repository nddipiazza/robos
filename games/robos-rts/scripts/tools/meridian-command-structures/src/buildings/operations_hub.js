import {
  Part,
  box,
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

function buildStabilizerPad() {
  // Modular landing stabilizer pad along -Z out to r = 4.08 (lighter & lower than fortified_hub's fortress bastions)
  const p = new Part();

  // Flat modular landing pad on Y = 0.00
  p.merge(
    extrudePolyY(
      'ArmorDark',
      [
        [0.80, -2.45],
        [0.58, -4.06],
        [-0.58, -4.06],
        [-0.80, -2.45],
      ],
      0.0,
      0.26,
      {
        topPolyXZ: [
          [0.74, -2.48],
          [0.52, -3.96],
          [-0.52, -3.96],
          [-0.74, -2.48],
        ],
      }
    )
  );
  p.merge(boxBounds('HazardTrim', -0.46, 0.46, 0.03, 0.16, -4.08, -3.98));

  // Open mechanical leveling jack frame + TeamColor cap
  p.merge(
    extrudePolyY(
      'ArmorMid',
      [
        [0.62, -2.25],
        [0.44, -3.45],
        [-0.44, -3.45],
        [-0.62, -2.25],
      ],
      0.26,
      0.98,
      {
        topPolyXZ: [
          [0.54, -2.22],
          [0.36, -3.18],
          [-0.36, -3.18],
          [-0.54, -2.22],
        ],
      }
    )
  );
  p.merge(boxBounds('TeamColor', -0.34, 0.34, 0.96, 1.12, -3.14, -2.30));

  // Exposed twin leveling jack struts
  for (const sx of [-1, 1]) {
    p.merge(frustumY('SteelStructure', 6, 0.12, 0.10, 0.24, 1.18, sx * 0.36, -3.68));
    p.merge(strut('SteelStructure', [sx * 0.36, 1.12, -3.68], [sx * 0.44, 0.92, -2.65], 0.10, 4));
  }

  return p;
}

function buildOperationsHullPart() {
  const p = new Part();

  // 1. Shared blocky Starfall Command Hub footprint (radius <= 4.2)
  p.merge(chamferBoxY('ArmorDark', 6.40, 6.20, 0.0, 0.34, 1.38, 0.06));
  p.merge(chamferBoxY('DarkTrim', 6.12, 5.92, 0.34, 0.44, 1.30, 0.0));

  const padProto = buildStabilizerPad();
  for (const deg of [45, 135, -45, -135]) {
    p.merge(padProto.clone().rotateY(deg * DEG2RAD));
  }

  // 2. Clean blocky modular lower & upper operations decks (Y = 0.44..2.72)
  p.merge(chamferBoxY('ArmorDark', 6.06, 5.86, 0.44, 1.62, 1.08, 0.14));
  p.merge(chamferBoxY('DarkTrim', 5.62, 5.42, 1.62, 1.78, 0.98, 0.0));
  p.merge(chamferBoxY('ArmorMid', 5.76, 5.56, 1.78, 2.66, 0.98, 0.10));
  p.merge(chamferBoxY('ArmorDark', 5.48, 5.28, 2.66, 2.76, 0.92, 0.04));

  // 3. Flank modular logistics bays & blue TeamColor fascia bands (-X and +X)
  const rightSide = new Part();
  // Bold continuous blue TeamColor fascia plate along upper deck
  rightSide.merge(boxBounds('TeamColor', 2.74, 2.94, 1.90, 2.54, -1.78, 1.78));
  // Steel structural deck columns
  for (const cz of [-1.82, -0.60, 0.60, 1.82]) {
    rightSide.merge(boxBounds('SteelStructure', 2.78, 3.04, 0.42, 2.68, cz - 0.10, cz + 0.10));
  }
  // Recessed modular cargo/comms bays on lower flank
  for (const bz of [-1.20, 0.0, 1.20]) {
    rightSide.merge(boxBounds('DarkTrim', 2.72, 2.98, 0.62, 1.48, bz - 0.42, bz + 0.42));
    rightSide.merge(boxBounds('ArmorMid', 2.78, 2.94, 0.68, 1.42, bz - 0.36, bz + 0.36));
  }
  p.merge(rightSide);
  p.merge(rightSide.mirrorX());

  // 4. Forward (-Z) Panoramic Operations Control Bridge & Logistics Entrance
  // Entrance ramp down to Y = 0.00 facing -Z
  p.merge(
    extrudePolyY(
      'ArmorMid',
      [
        [1.14, -2.85],
        [1.04, -3.98],
        [-1.04, -3.98],
        [-1.14, -2.85],
      ],
      0.0,
      0.07
    )
  );
  const ramp = new Part();
  ramp.addQuad('ArmorMid', [1.02, 0.07, -3.96], [-1.02, 0.07, -3.96], [-1.10, 0.38, -2.88], [1.10, 0.38, -2.88]);
  ramp.addTri('ArmorDark', [1.02, 0.07, -3.96], [1.10, 0.38, -2.88], [1.10, 0.07, -2.88]);
  ramp.addTri('ArmorDark', [-1.02, 0.07, -3.96], [-1.10, 0.07, -2.88], [-1.10, 0.38, -2.88]);
  p.merge(ramp);
  p.merge(boxBounds('HazardTrim', -1.00, 1.00, 0.01, 0.08, -4.00, -3.88));

  // Logistics roll-up door on -Z (proper Z layering so segmented steel slats & kickplate pop!)
  p.merge(boxBounds('DarkTrim', -1.14, 1.14, 0.38, 1.62, -2.80, -2.70));
  for (let sy = 0.42; sy <= 1.44; sy += 0.24) {
    p.merge(boxBounds('SteelStructure', -1.06, 1.06, sy, sy + 0.18, -2.92, -2.80));
  }
  p.merge(boxBounds('HazardTrim', -1.04, 1.04, 0.40, 0.54, -2.95, -2.88));
  for (const sx of [-1, 1]) {
    p.merge(boxBounds('ArmorDark', sx * 1.12, sx * 1.56, 0.0, 1.72, -3.28, -2.72));
    p.merge(boxBounds('TeamColor', sx * 1.20, sx * 1.50, 0.48, 1.58, -3.33, -3.24));
  }

  // Wide panoramic Operations Bridge facing -Z (wider glass band than FortifiedHub!)
  p.merge(
    extrudePolyY(
      'ArmorDark',
      [
        [1.86, -2.32],
        [1.42, -3.36],
        [-1.42, -3.36],
        [-1.86, -2.32],
      ],
      1.74,
      2.72
    )
  );
  p.merge(
    extrudePolyY(
      'EmissiveCyan',
      [
        [1.68, -2.56],
        [1.30, -3.40],
        [-1.30, -3.40],
        [-1.68, -2.56],
      ],
      2.02,
      2.46
    )
  );
  // Mullion struts across panoramic bridge window
  for (const mx of [-0.82, 0.0, 0.82]) {
    p.merge(boxBounds('ArmorDark', mx - 0.05, mx + 0.05, 2.00, 2.48, -3.43, -3.32));
  }
  p.merge(
    extrudePolyY(
      'TeamColor',
      [
        [1.64, -2.34],
        [1.24, -3.28],
        [-1.24, -3.28],
        [-1.64, -2.34],
      ],
      2.72,
      2.88
    )
  );

  // 5. Rear (+Z) Auxiliary Power & Cryo-Coolant Deck
  p.merge(boxBounds('ArmorDark', -1.85, 1.85, 0.40, 2.42, 2.55, 3.35));
  p.merge(boxBounds('TeamColor', -1.65, 1.65, 1.86, 2.36, 3.30, 3.42));
  for (const cx of [-1.05, 0.0, 1.05]) {
    p.merge(frustumY('SteelStructure', 10, 0.36, 0.34, 0.44, 2.25, cx, 3.48));
    p.merge(frustumY('TeamColor', 10, 0.37, 0.37, 1.40, 1.72, cx, 3.48));
  }

  // 6. Satellite Dish Azimuth Pedestal on Forward-Left Roof Deck (-0.96, 2.76, -0.46)
  p.merge(frustumY('ArmorDark', 8, 1.12, 0.92, 2.74, 3.36, -0.96, -0.46, Math.PI / 8));
  p.merge(frustumY('TeamColor', 8, 0.95, 0.90, 3.34, 3.50, -0.96, -0.46, Math.PI / 8));
  p.merge(frustumY('SteelStructure', 12, 0.72, 0.68, 3.48, 3.58, -0.96, -0.46));

  // Rooftop waveguide trunk conduits & comm-server cooling banks for crisp top-down detail
  p.merge(strut('SteelStructure', [-0.20, 2.86, -0.10], [0.55, 2.86, 0.45], 0.18, 4));
  p.merge(strut('TeamColor', [-0.15, 2.94, -0.05], [0.50, 2.94, 0.42], 0.08, 4));
  // Rear-left (-X/+Z) comm-server heat exchanger module
  p.merge(chamferBoxY('ArmorMid', 1.48, 1.24, 2.74, 3.16, 0.22, 0.06, -1.35, 1.38));
  p.merge(boxBounds('DarkTrim', -1.88, -0.82, 3.14, 3.22, 0.96, 1.80));
  p.merge(boxBounds('TeamColor', -1.84, -0.86, 2.84, 3.08, 1.94, 2.04));
  // Forward-right (+X/-Z) auxiliary tactical uplink terminal on roof
  p.merge(chamferBoxY('ArmorMid', 1.28, 1.12, 2.74, 3.12, 0.20, 0.05, 1.42, -1.16));
  p.merge(boxBounds('EmissiveCyan', 1.02, 1.82, 2.88, 3.04, -1.75, -1.66));

  // 7. Upper Antenna Bay on Rear-Right Roof Quadrant (+X / +Z, centered around (+1.35, +1.05))
  // Elevated armored comms bay housing
  p.merge(chamferBoxY('ArmorDark', 2.24, 2.16, 2.74, 3.64, 0.32, 0.08, 1.30, 1.02));
  p.merge(boxBounds('TeamColor', 0.38, 2.22, 2.92, 3.50, 2.04, 2.14)); // +Z TeamColor plate
  p.merge(boxBounds('TeamColor', 2.34, 2.44, 2.92, 3.50, 0.14, 1.90)); // +X TeamColor plate
  // Waveguide patch bay & cyan transceiver strip facing -Z on antenna bay front wall
  p.merge(boxBounds('DarkTrim', 0.56, 2.04, 2.90, 3.48, -0.10, 0.04));
  p.merge(boxBounds('EmissiveCyan', 0.72, 1.88, 3.24, 3.38, -0.12, -0.02));

  // Tall Open-Frame Lattice Antenna Mast rising from (1.48, 3.64, 1.18) to Y = 5.76
  const mx = 1.48, mz = 1.18;
  const bHalf = 0.44, tHalf = 0.24;
  const cornersBot = [
    [mx - bHalf, 3.62, mz - bHalf],
    [mx + bHalf, 3.62, mz - bHalf],
    [mx + bHalf, 3.62, mz + bHalf],
    [mx - bHalf, 3.62, mz + bHalf],
  ];
  const cornersMid = [
    [mx - 0.34, 4.68, mz - 0.34],
    [mx + 0.34, 4.68, mz - 0.34],
    [mx + 0.34, 4.68, mz + 0.34],
    [mx - 0.34, 4.68, mz + 0.34],
  ];
  const cornersTop = [
    [mx - tHalf, 5.68, mz - tHalf],
    [mx + tHalf, 5.68, mz - tHalf],
    [mx + tHalf, 5.68, mz + tHalf],
    [mx - tHalf, 5.68, mz + tHalf],
  ];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    p.merge(strut('SteelStructure', cornersBot[i], cornersTop[i], 0.09, 4));
    p.merge(strut('SteelStructure', cornersMid[i], cornersMid[j], 0.065, 4));
    p.merge(strut('SteelStructure', cornersTop[i], cornersTop[j], 0.07, 4));
    // Diagonal X-braces
    p.merge(strut('SteelStructure', cornersBot[i], cornersMid[j], 0.048, 4));
    p.merge(strut('SteelStructure', cornersMid[i], cornersTop[j], 0.045, 4));
  }
  // Masthead cap + horizontal dipole cross-arms
  p.merge(boxBounds('ArmorDark', mx - 0.30, mx + 0.30, 5.66, 5.80, mz - 0.30, mz + 0.30));
  p.merge(boxBounds('SteelStructure', mx - 1.02, mx + 1.02, 5.18, 5.26, mz - 0.05, mz + 0.05));
  for (const dx of [-0.96, -0.58, 0.58, 0.96]) {
    p.merge(boxBounds('SteelStructure', mx + dx - 0.03, mx + dx + 0.03, 4.92, 5.52, mz - 0.03, mz + 0.03));
  }
  // Forward-facing (-Z) microwave drum relay on antenna mast
  p.merge(cylinderZ('ArmorMid', 10, 0.28, 0.28, mz - 0.62, mz - 0.34, mx, 4.48));
  p.merge(cylinderZ('DishReflector', 10, 0.23, 0.23, mz - 0.65, mz - 0.60, mx, 4.48));

  // Secondary telemetry blade fin & whip spire on antenna bay deck (0.66, 3.64, 0.58)
  p.merge(
    extrudePolyY(
      'TeamColor',
      [
        [0.72, 0.32],
        [0.60, 0.32],
        [0.60, 0.92],
        [0.72, 0.92],
      ],
      3.62,
      4.78,
      {
        topPolyXZ: [
          [0.70, 0.52],
          [0.62, 0.52],
          [0.62, 0.88],
          [0.70, 0.88],
        ],
      }
    )
  );
  p.merge(frustumY('SteelStructure', 6, 0.055, 0.025, 3.62, 5.38, 0.66, 0.42));
  p.merge(frustumY('EmissiveCyan', 8, 0.07, 0.05, 5.36, 5.50, 0.66, 0.42));

  return p;
}

function buildSatelliteDishYawPart() {
  // Local to DishYaw at (-0.96, 3.58, -0.46)
  const p = new Part();

  // Turntable collar + heavy U-shaped azimuth yoke
  p.merge(frustumY('ArmorDark', 10, 0.64, 0.58, 0.0, 0.22));
  for (const sx of [-0.52, 0.52]) {
    p.merge(
      extrudePolyY(
        'SteelStructure',
        [
          [sx + 0.09, -0.22],
          [sx - 0.09, -0.22],
          [sx - 0.09, 0.26],
          [sx + 0.09, 0.26],
        ],
        0.20,
        0.92
      )
    );
  }
  // Counterweight block on +Z side of yoke
  p.merge(boxBounds('ArmorMid', -0.42, 0.42, 0.28, 0.68, 0.24, 0.76));
  p.merge(boxBounds('TeamColor', -0.36, 0.36, 0.34, 0.62, 0.72, 0.82));

  // Large Parabolic Satellite Dish Assembly tilted 38 deg upward from -Z toward +Y
  const dishAssy = new Part();
  dishAssy.merge(
    parabolicDish({
      radiusX: 1.32,
      radiusY: 1.32,
      depth: 0.46,
      shellThickness: 0.09,
      radialSegs: 16,
      ringSegs: 4,
      frontMat: 'DishReflector',
      backMat: 'ArmorDark',
      rimMat: 'ArmorMid',
      ribMat: 'SteelStructure',
      teamStripeBand: true,
    })
  );
  // Central reflector hub cone + tripod feed-horn boom extending along -Z
  dishAssy.merge(cylinderZ('ArmorMid', 10, 0.14, 0.24, -0.22, 0.02, 0, 0));
  const focalZ = -1.12;
  const tripodAngles = [Math.PI * 0.5, Math.PI * 1.166, Math.PI * 1.833];
  for (const a of tripodAngles) {
    const rx = 1.06 * Math.cos(a);
    const ry = 1.06 * Math.sin(a);
    const rz = -0.46 * (1.06 / 1.32) * (1.06 / 1.32);
    dishAssy.merge(strut('SteelStructure', [rx, ry, rz], [0, 0, focalZ], 0.055, 4));
  }
  // Focal transceiver horn & cyan beacon
  dishAssy.merge(cylinderZ('ArmorDark', 10, 0.18, 0.12, focalZ - 0.16, focalZ + 0.08, 0, 0));
  dishAssy.merge(cylinderZ('EmissiveCyan', 10, 0.11, 0.11, focalZ - 0.21, focalZ - 0.14, 0, 0));
  // Rear elevation housing boss
  dishAssy.merge(cylinderZ('TeamColor', 10, 0.34, 0.28, 0.06, 0.28, 0, 0));

  // Tilt dish upward 38 deg around X (in right-handed coords, +38 deg around +X tilts -Z upward toward +Y!
  // Wait: let's verify! rotateX(+rad): y' = y*c - z*s, z' = y*s + z*c.
  // For a point at (0, 0, -1): y' = -(-1)*sin(rad) = +sin(rad) > 0 (UP!), z' = -cos(rad) < 0 (FORWARD -Z!).
  // Exact! +38 deg around +X tilts a -Z-facing dish upward to point forward-and-up!)
  dishAssy.rotateX(38 * DEG2RAD);
  dishAssy.translate(0, 0.94, -0.04);

  p.merge(dishAssy);
  return p;
}

function buildScannerVanePart() {
  // Small secondary rotary comms crossbar atop the UpperAntennaBay mast at (1.48, 5.80, 1.18)
  const p = new Part();
  p.merge(frustumY('SteelStructure', 8, 0.09, 0.07, 0.0, 0.24));
  p.merge(boxBounds('TeamColor', -0.48, 0.48, 0.22, 0.36, -0.07, 0.07));
  p.merge(boxBounds('EmissiveCyan', -0.46, 0.46, 0.25, 0.33, -0.09, -0.06));
  return p;
}

export function createOperationsHubScene() {
  const hullPart = buildOperationsHullPart();
  const dishYawPart = buildSatelliteDishYawPart();
  const scannerVanePart = buildScannerVanePart();

  const root = {
    name: 'OperationsHub',
    translation: [0, 0, 0],
    rotation: quatIdentity(),
    scale: [1, 1, 1],
    children: [
      {
        name: 'HullBase',
        translation: [0, 0, 0],
        rotation: quatIdentity(),
        scale: [1, 1, 1],
        part: hullPart,
        children: [
          {
            name: 'DishYaw',
            translation: [-0.96, 3.58, -0.46],
            rotation: quatIdentity(),
            scale: [1, 1, 1],
            part: dishYawPart,
          },
          {
            name: 'ScannerVane',
            translation: [1.48, 5.80, 1.18],
            rotation: quatIdentity(),
            scale: [1, 1, 1],
            part: scannerVanePart,
          },
        ],
      },
    ],
  };

  // --- Animations: idle (continuous 360-deg dish spin), death ---
  const idleDuration = 6.0;
  const dishSpin = fullSpinKeyframes(idleDuration, [0, 1, 0], 1);
  const vaneOscTimes = [0.0, 1.5, 3.0, 4.5, 6.0];
  const vaneOscQuats = ensureQuatContinuity([
    quatFromEulerYXZ(0, 0, 0),
    quatFromEulerYXZ(-28 * DEG2RAD, 0, 0),
    quatFromEulerYXZ(0, 0, 0),
    quatFromEulerYXZ(28 * DEG2RAD, 0, 0),
    quatFromEulerYXZ(0, 0, 0),
  ]);

  const deathTimes = [0.0, 0.25, 0.70, 1.30, 1.80];
  const deathHullTrans = [
    [0, 0, 0],
    [-0.04, 0.06, 0.03],
    [0.06, -0.06, 0.06],
    [0.10, -0.15, 0.10],
    [0.12, -0.18, 0.12],
  ];
  const deathHullRot = ensureQuatContinuity([
    quatIdentity(),
    quatFromEulerYXZ(-2.0 * DEG2RAD, 2.0 * DEG2RAD, -3.0 * DEG2RAD),
    quatFromEulerYXZ(3.5 * DEG2RAD, -3.5 * DEG2RAD, 4.8 * DEG2RAD),
    quatFromEulerYXZ(5.5 * DEG2RAD, -5.0 * DEG2RAD, 6.8 * DEG2RAD),
    quatFromEulerYXZ(6.0 * DEG2RAD, -5.5 * DEG2RAD, 7.5 * DEG2RAD),
  ]);
  const deathHullScale = [
    [1, 1, 1],
    [1.02, 0.96, 1.02],
    [1.05, 0.66, 1.05],
    [1.07, 0.42, 1.07],
    [1.08, 0.36, 1.08],
  ];
  const deathDishRot = ensureQuatContinuity([
    quatIdentity(),
    quatFromEulerYXZ(18 * DEG2RAD, 10 * DEG2RAD, -12 * DEG2RAD),
    quatFromEulerYXZ(42 * DEG2RAD, 28 * DEG2RAD, -24 * DEG2RAD),
    quatFromEulerYXZ(58 * DEG2RAD, 42 * DEG2RAD, -32 * DEG2RAD),
    quatFromEulerYXZ(62 * DEG2RAD, 46 * DEG2RAD, -35 * DEG2RAD),
  ]);

  return {
    name: 'OperationsHubScene',
    targetRadius: 4.2,
    root,
    animations: [
      {
        name: 'idle',
        tracks: [
          {
            node: 'DishYaw',
            path: 'rotation',
            times: dishSpin.times,
            values: dishSpin.values,
          },
          {
            node: 'ScannerVane',
            path: 'rotation',
            times: vaneOscTimes,
            values: vaneOscQuats,
          },
        ],
      },
      {
        name: 'death',
        tracks: [
          { node: 'HullBase', path: 'translation', times: deathTimes, values: deathHullTrans },
          { node: 'HullBase', path: 'rotation', times: deathTimes, values: deathHullRot },
          { node: 'HullBase', path: 'scale', times: deathTimes, values: deathHullScale },
          { node: 'DishYaw', path: 'rotation', times: deathTimes, values: deathDishRot },
        ],
      },
    ],
  };
}
