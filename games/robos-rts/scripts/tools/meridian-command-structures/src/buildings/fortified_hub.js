import {
  Part,
  box,
  boxBounds,
  boxY,
  chamferBoxY,
  cylinderZ,
  extrudePolyY,
  frustumY,
  strut,
  tubeZ,
} from '../geometry.js';
import {
  DEG2RAD,
  ensureQuatContinuity,
  quatFromEulerYXZ,
  quatIdentity,
} from '../math.js';

function buildDropBastion() {
  // Built extending radially toward -Z (from z = -2.15 out to z = -4.08), then rotated to 45/135/-45/-135 deg
  const p = new Part();

  // Broad armored landing footpad resting flush on Y = 0.00
  p.merge(
    extrudePolyY(
      'ArmorDark',
      [
        [0.86, -2.45],
        [0.64, -4.06],
        [-0.64, -4.06],
        [-0.86, -2.45],
      ],
      0.0,
      0.32,
      {
        topPolyXZ: [
          [0.80, -2.48],
          [0.56, -3.96],
          [-0.56, -3.96],
          [-0.80, -2.48],
        ],
      }
    )
  );

  // Hazard toe bumper on outer edge (near Y=0)
  p.merge(boxBounds('HazardTrim', -0.50, 0.50, 0.04, 0.20, -4.09, -3.98));

  // Sloped main bastion armor housing
  p.merge(
    extrudePolyY(
      'ArmorDark',
      [
        [0.78, -2.10],
        [0.56, -3.78],
        [-0.56, -3.78],
        [-0.78, -2.10],
      ],
      0.30,
      1.86,
      {
        topPolyXZ: [
          [0.64, -2.05],
          [0.42, -3.22],
          [-0.42, -3.22],
          [-0.64, -2.05],
        ],
      }
    )
  );

  // Bold blue TeamColor sloped upper shield plate on each corner bastion
  p.merge(
    extrudePolyY(
      'TeamColor',
      [
        [0.54, -2.22],
        [0.36, -3.48],
        [-0.36, -3.48],
        [-0.54, -2.22],
      ],
      1.18,
      1.94,
      {
        topPolyXZ: [
          [0.48, -2.16],
          [0.30, -3.14],
          [-0.30, -3.14],
          [-0.48, -2.16],
        ],
      }
    )
  );

  // Twin exposed hydraulic landing shock-struts on sides of bastion
  for (const sx of [-1, 1]) {
    p.merge(strut('SteelStructure', [sx * 0.62, 0.26, -3.72], [sx * 0.52, 1.52, -3.05], 0.14, 6));
    p.merge(box('ArmorMid', 0.22, 0.28, 0.26, sx * 0.58, 0.85, -3.40));
  }

  return p;
}

function buildHullPart() {
  const p = new Part();

  // 1. Heavy octagonal foundation plinth flush at Y = 0
  p.merge(chamferBoxY('ArmorDark', 6.46, 6.26, 0.0, 0.38, 1.42, 0.08));
  p.merge(chamferBoxY('DarkTrim', 6.16, 5.96, 0.38, 0.48, 1.34, 0.0));

  // 2. Four diagonal orbital-drop corner bastions (max R_XZ = hypot(4.09, 0.50) = 4.12 <= 4.20)
  const bastionProto = buildDropBastion();
  for (const deg of [45, 135, -45, -135]) {
    p.merge(bastionProto.clone().rotateY(deg * DEG2RAD));
  }

  // 3. Lower sloped citadel casemate (Y = 0.48..1.88)
  p.merge(chamferBoxY('ArmorDark', 6.24, 6.04, 0.48, 1.88, 1.26, 0.36));
  // Recessed dark structural waist seam
  p.merge(chamferBoxY('DarkTrim', 5.26, 5.06, 1.88, 2.06, 1.02, 0.0));

  // 4. Upper chunky fortress casemate (Y = 2.06..3.16)
  p.merge(chamferBoxY('ArmorDark', 5.52, 5.32, 2.06, 3.16, 1.08, 0.24));
  // Rooftop armor deck cap
  p.merge(chamferBoxY('ArmorMid', 5.02, 4.82, 3.16, 3.26, 0.96, 0.06));

  // 5. Flank vertical steel ribs, recessed vents, and bold blue TeamColor shoulder plates (-X and +X)
  const rightFlank = new Part();
  for (const rz of [-1.26, 0.0, 1.26]) {
    rightFlank.merge(
      extrudePolyY(
        'SteelStructure',
        [
          [3.12, rz - 0.16],
          [2.65, rz - 0.16],
          [2.65, rz + 0.16],
          [3.12, rz + 0.16],
        ],
        0.44,
        3.14,
        {
          topPolyXZ: [
            [2.68, rz - 0.14],
            [2.42, rz - 0.14],
            [2.42, rz + 0.14],
            [2.68, rz + 0.14],
          ],
        }
      )
    );
  }
  // Recessed dark cooling vents on lower flank
  for (const vz of [-0.63, 0.63]) {
    rightFlank.merge(boxBounds('DarkTrim', 2.75, 3.02, 0.78, 1.65, vz - 0.42, vz + 0.42));
    for (let ly = 0.90; ly <= 1.52; ly += 0.20) {
      rightFlank.merge(boxBounds('ArmorMid', 2.82, 3.05, ly, ly + 0.07, vz - 0.38, vz + 0.38));
    }
  }
  // Prominent blue TeamColor upper flank armor plates
  for (const tz of [-0.63, 0.63]) {
    rightFlank.merge(
      extrudePolyY(
        'TeamColor',
        [
          [2.82, tz - 0.46],
          [2.52, tz - 0.46],
          [2.52, tz + 0.46],
          [2.82, tz + 0.46],
        ],
        2.12,
        3.04,
        {
          topPolyXZ: [
            [2.66, tz - 0.44],
            [2.42, tz - 0.44],
            [2.42, tz + 0.44],
            [2.66, tz + 0.44],
          ],
        }
      )
    );
  }
  p.merge(rightFlank);
  p.merge(rightFlank.mirrorX());

  // 6. Forward (-Z) Command Entrance Bay, Assault Ramp & Overhanging Command Bridge
  // Sloped assault ramp down to Y = 0.00 facing -Z (hypot(1.06, 4.02) = 4.157 <= 4.20)
  p.merge(
    extrudePolyY(
      'ArmorMid',
      [
        [1.06, -2.92],
        [0.98, -4.02],
        [-0.98, -4.02],
        [-1.06, -2.92],
      ],
      0.0,
      0.08
    )
  );
  // Ramp sloped wedge surface
  const rampWedge = new Part();
  rampWedge.addQuad('ArmorMid', [0.96, 0.08, -4.00], [-0.96, 0.08, -4.00], [-1.02, 0.44, -2.95], [1.02, 0.44, -2.95]);
  rampWedge.addTri('ArmorDark', [0.96, 0.08, -4.00], [1.02, 0.44, -2.95], [1.02, 0.08, -2.95]);
  rampWedge.addTri('ArmorDark', [-0.96, 0.08, -4.00], [-1.02, 0.08, -2.95], [-1.02, 0.44, -2.95]);
  p.merge(rampWedge);
  p.merge(boxBounds('HazardTrim', -0.94, 0.94, 0.01, 0.09, -4.04, -3.92));
  for (const sx of [-1, 1]) {
    p.merge(strut('SteelStructure', [sx * 1.02, 0.12, -3.94], [sx * 1.08, 0.54, -2.95], 0.12, 4));
  }

  // Recessed armored double blast gate on -Z (proper Z layering: backing behind leaves behind locking bars!)
  p.merge(boxBounds('DarkTrim', -1.08, 1.08, 0.42, 1.92, -2.84, -2.72));
  p.merge(boxBounds('ArmorMid', -0.98, -0.05, 0.44, 1.84, -2.94, -2.82));
  p.merge(boxBounds('ArmorMid', 0.05, 0.98, 0.44, 1.84, -2.94, -2.82));
  for (const gy of [0.78, 1.16, 1.54]) {
    p.merge(boxBounds('SteelStructure', -0.92, -0.10, gy, gy + 0.10, -2.99, -2.92));
    p.merge(boxBounds('SteelStructure', 0.10, 0.92, gy, gy + 0.10, -2.99, -2.92));
  }
  p.merge(boxBounds('HazardTrim', -0.94, -0.08, 0.45, 0.60, -2.97, -2.92));
  p.merge(boxBounds('HazardTrim', 0.08, 0.94, 0.45, 0.60, -2.97, -2.92));

  // Twin heavy frontal portal buttresses with TeamColor plates facing -Z
  for (const sx of [-1, 1]) {
    p.merge(boxBounds('ArmorDark', sx * 1.06, sx * 1.62, 0.0, 2.06, -3.46, -2.75));
    p.merge(boxBounds('TeamColor', sx * 1.14, sx * 1.54, 0.62, 1.88, -3.52, -3.42));
  }
  p.merge(boxBounds('SteelStructure', -1.10, 1.10, 1.84, 1.92, -3.08, -2.82));
  p.merge(boxBounds('EmissiveCyan', -1.02, 1.02, 1.92, 2.04, -3.12, -2.96));

  // Jutting forward (-Z) Armored Command Bridge Prow (Y = 2.06..3.10)
  p.merge(
    extrudePolyY(
      'ArmorDark',
      [
        [1.52, -2.35],
        [1.08, -3.38],
        [-1.08, -3.38],
        [-1.52, -2.35],
      ],
      2.06,
      3.08,
      {
        topPolyXZ: [
          [1.42, -2.32],
          [0.98, -3.26],
          [-0.98, -3.26],
          [-1.42, -2.32],
        ],
      }
    )
  );
  // Glowing cyan command bridge tactical visor facing -Z
  p.merge(
    extrudePolyY(
      'EmissiveCyan',
      [
        [1.24, -2.72],
        [0.92, -3.41],
        [-0.92, -3.41],
        [-1.24, -2.72],
      ],
      2.48,
      2.72
    )
  );
  // Bridge visor overhanging armored brow + TeamColor bridge roof plate
  p.merge(
    extrudePolyY(
      'ArmorMid',
      [
        [1.46, -2.36],
        [1.06, -3.46],
        [-1.06, -3.46],
        [-1.46, -2.36],
      ],
      2.74,
      2.92
    )
  );
  p.merge(
    extrudePolyY(
      'TeamColor',
      [
        [1.18, -2.38],
        [0.84, -3.18],
        [-0.84, -3.18],
        [-1.18, -2.38],
      ],
      3.06,
      3.22
    )
  );

  // 7. Rear (+Z) Landed Orbital Drop-Thruster Cowls & Reactor Spine
  for (const sx of [-1, 1]) {
    p.merge(
      extrudePolyY(
        'ArmorMid',
        [
          [sx * 0.56, 2.45],
          [sx * 1.72, 2.45],
          [sx * 1.54, 3.56],
          [sx * 0.66, 3.56],
        ],
        0.38,
        2.78,
        {
          topPolyXZ: [
            [sx * 0.60, 2.38],
            [sx * 1.58, 2.38],
            [sx * 1.38, 3.22],
            [sx * 0.70, 3.22],
          ],
        }
      )
    );
    p.merge(boxBounds('DarkTrim', sx * 0.76, sx * 1.44, 0.58, 2.36, 3.35, 3.60));
    for (let fy = 0.78; fy <= 2.18; fy += 0.35) {
      p.merge(boxBounds('SteelStructure', sx * 0.80, sx * 1.40, fy, fy + 0.08, 3.42, 3.63));
    }
  }
  // Central rear TeamColor reactor spine
  p.merge(boxBounds('TeamColor', -0.44, 0.44, 0.85, 2.88, 2.55, 3.32));
  p.merge(boxBounds('SteelStructure', -0.26, 0.26, 1.05, 2.98, 2.65, 3.40));

  // 8. Upper Citadel Turret Barbette & Perimeter Blast Parapets (Y = 3.26..3.56)
  p.merge(frustumY('ArmorMid', 8, 2.10, 1.92, 3.24, 3.50, 0, -0.10, Math.PI / 8));
  p.merge(frustumY('SteelStructure', 12, 1.78, 1.72, 3.48, 3.56, 0, -0.10));

  // Flank & rear rooftop crenellation parapets + corner armor blisters (clear -Z forward arc!)
  for (const sx of [-1, 1]) {
    p.merge(boxBounds('ArmorDark', sx * 2.02, sx * 2.42, 3.24, 3.62, -1.45, 1.85));
    p.merge(boxBounds('TeamColor', sx * 2.26, sx * 2.46, 3.30, 3.56, -1.20, 1.60));
    // Forward-corner armored sensor/shield merlons
    p.merge(chamferBoxY('ArmorMid', 0.62, 0.62, 3.24, 3.74, 0.14, 0.06, sx * 1.96, -1.68));
  }
  p.merge(boxBounds('ArmorDark', -1.85, 1.85, 3.24, 3.64, 1.95, 2.35));

  return p;
}

function buildTurretHousingPart() {
  // Local to TurretYaw at (0, 3.54, -0.10)
  const p = new Part();

  // Turret base collar
  p.merge(frustumY('DarkTrim', 12, 1.62, 1.56, -0.02, 0.14, 0, 0));

  // Wide chunky turret casemate (wider rear ammo bustle, sloped front cheeks)
  p.merge(
    extrudePolyY(
      'ArmorDark',
      [
        [1.12, -1.24],
        [-1.12, -1.24],
        [-1.38, -0.15],
        [-1.32, 1.38],
        [1.32, 1.38],
        [1.38, -0.15],
      ],
      0.12,
      1.18,
      {
        topPolyXZ: [
          [0.94, -1.06],
          [-0.94, -1.06],
          [-1.16, -0.10],
          [-1.12, 1.22],
          [1.12, 1.22],
          [1.16, -0.10],
        ],
      }
    )
  );

  // Prominent blue TeamColor dorsal carapace & cheek armor plates on turret
  p.merge(
    extrudePolyY(
      'TeamColor',
      [
        [0.82, -0.96],
        [-0.82, -0.96],
        [-1.02, 0.05],
        [-0.96, 1.12],
        [0.96, 1.12],
        [1.02, 0.05],
      ],
      1.16,
      1.32,
      {
        topPolyXZ: [
          [0.68, -0.84],
          [-0.68, -0.84],
          [-0.86, 0.05],
          [-0.82, 0.98],
          [0.82, 0.98],
          [0.86, 0.05],
        ],
      }
    )
  );
  for (const sx of [-1, 1]) {
    p.merge(boxBounds('TeamColor', sx * 1.16, sx * 1.41, 0.34, 0.96, -0.08, 1.05));
  }

  // Twin rear ammo drums on bustle (+Z)
  for (const sx of [-0.62, 0.62]) {
    p.merge(cylinderZ('ArmorMid', 8, 0.44, 0.42, 1.28, 1.72, sx, 0.66, Math.PI / 8));
    p.merge(cylinderZ('SteelStructure', 8, 0.24, 0.24, 1.70, 1.80, sx, 0.66, Math.PI / 8));
  }

  // Right-cheek optical target acquisition pod facing -Z
  p.merge(boxBounds('ArmorMid', 1.02, 1.48, 0.56, 0.98, -0.98, -0.25));
  p.merge(cylinderZ('EmissiveCyan', 8, 0.14, 0.14, -1.04, -0.95, 1.26, 0.77));

  return p;
}

function buildTurretPitchPart() {
  // Local to TurretPitch at (0, 0.64, -0.62) inside TurretYaw
  const p = new Part();
  // Armored elevation mantlet drum
  const drum = frustumY('SteelStructure', 10, 0.38, 0.38, -0.98, 0.98, 0, 0).rotateZ(Math.PI * 0.5);
  p.merge(drum);
  p.merge(box('ArmorDark', 1.68, 0.64, 0.62, 0, 0, -0.12));
  return p;
}

function buildTwinCannonBarrelsPart() {
  // Local to CannonBarrels at (0, 0, 0) inside TurretPitch; points forward along -Z!
  const p = new Part();

  // Wide separation (+/-0.54) so twin barrels read clearly with clean air gap at RTS zoom
  for (const sx of [-0.54, 0.54]) {
    // Armored recoil cradle sleigh
    p.merge(boxBounds('ArmorMid', sx - 0.22, sx + 0.22, -0.24, 0.24, -1.12, 0.18));
    // Hydraulic recoil recuperator cylinder above barrel
    p.merge(cylinderZ('SteelStructure', 8, 0.085, 0.085, -1.28, -0.10, sx, 0.28));

    // Stepped octagonal cooling shroud
    p.merge(cylinderZ('ArmorDark', 8, 0.20, 0.22, -2.06, -1.10, sx, 0, Math.PI / 8));
    p.merge(cylinderZ('DarkTrim', 8, 0.21, 0.21, -1.68, -1.52, sx, 0, Math.PI / 8));

    // High-velocity long rifled gun barrel
    p.merge(cylinderZ('SteelStructure', 10, 0.135, 0.15, -2.86, -2.04, sx, 0));

    // Slotted heavy muzzle brake + recessed dark bore facing -Z
    p.merge(boxBounds('ArmorDark', sx - 0.19, sx + 0.19, -0.17, 0.17, -3.12, -2.72));
    p.merge(boxBounds('DarkTrim', sx - 0.20, sx + 0.20, -0.07, 0.07, -3.02, -2.82));
    p.merge(tubeZ('DarkTrim', 10, 0.14, 0.085, -3.15, -3.08, sx, 0));
  }

  // Cross-brace tie bar near breech keeping twin cannon rigid
  p.merge(boxBounds('SteelStructure', -0.54, 0.54, -0.10, 0.10, -0.92, -0.68));

  return p;
}

function buildBeaconMastPart() {
  const p = new Part();
  p.merge(frustumY('SteelStructure', 6, 0.08, 0.05, 0.0, 0.46));
  p.merge(frustumY('EmissiveCyan', 8, 0.11, 0.09, 0.44, 0.58));
  return p;
}

export function createFortifiedHubScene() {
  const hullPart = buildHullPart();
  const turretHousingPart = buildTurretHousingPart();
  const turretPitchPart = buildTurretPitchPart();
  const cannonBarrelsPart = buildTwinCannonBarrelsPart();
  const beaconMastPart = buildBeaconMastPart();

  const root = {
    name: 'FortifiedHub',
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
            name: 'TurretYaw',
            translation: [0, 3.54, -0.10],
            rotation: quatIdentity(),
            scale: [1, 1, 1],
            part: turretHousingPart,
            children: [
              {
                name: 'TurretPitch',
                translation: [0, 0.64, -0.62],
                rotation: quatIdentity(),
                scale: [1, 1, 1],
                part: turretPitchPart,
                children: [
                  {
                    name: 'CannonBarrels',
                    translation: [0, 0, 0],
                    rotation: quatIdentity(),
                    scale: [1, 1, 1],
                    part: cannonBarrelsPart,
                    children: [
                      {
                        // Exact Muzzle anchor centered at the forward (-Z) tip of the twin cannon barrels
                        name: 'Muzzle',
                        translation: [0, 0, -3.16],
                        rotation: quatIdentity(),
                        scale: [1, 1, 1],
                      },
                    ],
                  },
                ],
              },
              {
                name: 'BeaconMast',
                translation: [-0.82, 1.24, 0.88],
                rotation: quatIdentity(),
                scale: [1, 1, 1],
                part: beaconMastPart,
              },
            ],
          },
        ],
      },
    ],
  };

  // --- Animations: idle, attack, death ---

  // 1. idle (4.0s seamless loop): Vigilant turret sector scan around -Z + subtle elevation & beacon pulse
  const idleTimes = [0.0, 1.0, 2.0, 3.0, 4.0];
  const idleYawQuats = ensureQuatContinuity([
    quatFromEulerYXZ(0, 0, 0),
    quatFromEulerYXZ(14 * DEG2RAD, 0, 0),
    quatFromEulerYXZ(0, 0, 0),
    quatFromEulerYXZ(-14 * DEG2RAD, 0, 0),
    quatFromEulerYXZ(0, 0, 0),
  ]);
  const idlePitchQuats = ensureQuatContinuity([
    quatFromEulerYXZ(0, 0, 0),
    quatFromEulerYXZ(0, 2.2 * DEG2RAD, 0),
    quatFromEulerYXZ(0, -1.0 * DEG2RAD, 0),
    quatFromEulerYXZ(0, 2.2 * DEG2RAD, 0),
    quatFromEulerYXZ(0, 0, 0),
  ]);

  // 2. attack (0.85s): Crisp heavy twin-cannon recoil along +Z, upward muzzle kick, hydraulic return to battery
  const attackTimes = [0.0, 0.08, 0.22, 0.55, 0.85];
  const attackBarrelTrans = [
    [0, 0, 0],
    [0, 0, 0.46], // sharp recoil back (+Z)
    [0, 0, 0.32],
    [0, 0, 0.06],
    [0, 0, 0],
  ];
  const attackPitchQuats = ensureQuatContinuity([
    quatFromEulerYXZ(0, 0, 0),
    quatFromEulerYXZ(0, 4.2 * DEG2RAD, 0), // upward recoil kick
    quatFromEulerYXZ(0, 2.0 * DEG2RAD, 0),
    quatFromEulerYXZ(0, -0.6 * DEG2RAD, 0),
    quatFromEulerYXZ(0, 0, 0),
  ]);
  const attackHullTrans = [
    [0, 0, 0],
    [0, -0.03, 0.04], // subtle heavy chassis shock absorption
    [0, 0, 0.01],
    [0, 0, 0],
    [0, 0, 0],
  ];

  // 3. death (1.8s): Internal blast jolt, turret wrenching askew & barrels drooping, citadel structural collapse onto Y=0
  const deathTimes = [0.0, 0.22, 0.65, 1.25, 1.8];
  const deathHullTrans = [
    [0, 0, 0],
    [0.05, 0.08, 0.03],
    [-0.06, -0.06, 0.05],
    [-0.10, -0.16, 0.08],
    [-0.12, -0.20, 0.10],
  ];
  const deathHullRot = ensureQuatContinuity([
    quatIdentity(),
    quatFromEulerYXZ(1.5 * DEG2RAD, -2.0 * DEG2RAD, 3.0 * DEG2RAD),
    quatFromEulerYXZ(-2.5 * DEG2RAD, 3.0 * DEG2RAD, -4.5 * DEG2RAD),
    quatFromEulerYXZ(-4.5 * DEG2RAD, 4.5 * DEG2RAD, -6.5 * DEG2RAD),
    quatFromEulerYXZ(-5.0 * DEG2RAD, 5.0 * DEG2RAD, -7.0 * DEG2RAD),
  ]);
  const deathHullScale = [
    [1, 1, 1],
    [1.02, 0.96, 1.02],
    [1.05, 0.68, 1.05],
    [1.07, 0.42, 1.07],
    [1.08, 0.36, 1.08],
  ];
  const deathTurretRot = ensureQuatContinuity([
    quatIdentity(),
    quatFromEulerYXZ(-10 * DEG2RAD, 3 * DEG2RAD, 5 * DEG2RAD),
    quatFromEulerYXZ(18 * DEG2RAD, -4 * DEG2RAD, 11 * DEG2RAD),
    quatFromEulerYXZ(28 * DEG2RAD, -6 * DEG2RAD, 15 * DEG2RAD),
    quatFromEulerYXZ(30 * DEG2RAD, -7 * DEG2RAD, 16 * DEG2RAD),
  ]);
  const deathPitchRot = ensureQuatContinuity([
    quatIdentity(),
    quatFromEulerYXZ(0, 6 * DEG2RAD, 0),
    quatFromEulerYXZ(0, -4 * DEG2RAD, 0),
    quatFromEulerYXZ(0, -7 * DEG2RAD, 0),
    quatFromEulerYXZ(0, -8 * DEG2RAD, 0),
  ]);

  const animations = [
    {
      name: 'idle',
      tracks: [
        { node: 'TurretYaw', path: 'rotation', times: idleTimes, values: idleYawQuats },
        { node: 'TurretPitch', path: 'rotation', times: idleTimes, values: idlePitchQuats },
        {
          node: 'BeaconMast',
          path: 'scale',
          times: idleTimes,
          values: [
            [1, 1, 1],
            [1.06, 1.04, 1.06],
            [1, 1, 1],
            [1.06, 1.04, 1.06],
            [1, 1, 1],
          ],
        },
      ],
    },
    {
      name: 'attack',
      tracks: [
        { node: 'CannonBarrels', path: 'translation', times: attackTimes, values: attackBarrelTrans },
        { node: 'TurretPitch', path: 'rotation', times: attackTimes, values: attackPitchQuats },
        { node: 'HullBase', path: 'translation', times: attackTimes, values: attackHullTrans },
      ],
    },
    {
      name: 'death',
      tracks: [
        { node: 'HullBase', path: 'translation', times: deathTimes, values: deathHullTrans },
        { node: 'HullBase', path: 'rotation', times: deathTimes, values: deathHullRot },
        { node: 'HullBase', path: 'scale', times: deathTimes, values: deathHullScale },
        { node: 'TurretYaw', path: 'rotation', times: deathTimes, values: deathTurretRot },
        { node: 'TurretPitch', path: 'rotation', times: deathTimes, values: deathPitchRot },
      ],
    },
  ];

  return {
    name: 'FortifiedHubScene',
    targetRadius: 4.2,
    root,
    animations,
  };
}
