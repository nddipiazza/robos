import {
  Part,
  boxBounds,
  chamferBoxY,
  extrudePolyY,
  extrudePolyZ,
  frustumY,
  strut,
} from '../geometry.js';
import {
  DEG2RAD,
  ensureQuatContinuity,
  quatFromEulerYXZ,
  quatIdentity,
} from '../math.js';

function buildPortalRib(zCenter) {
  // Heavy external steel fabrication portal arch spanning up -X wall, across pitched roof, and down +X wall!
  const p = new Part();
  const halfT = 0.14; // total thickness 0.28 along Z

  // Concave portal arch polygon in XY plane (outer profile clockwise/CCW auto-handled by extrudePolyZ)
  const archXY = [
    // Inner arch contour (left -> top -> right)
    [-1.96, 0.0],
    [-1.96, 2.38],
    [-1.12, 3.22],
    [1.12, 3.22],
    [1.96, 2.38],
    [1.96, 0.0],
    // Right outer buttress & flange contour (bottom -> top)
    [2.38, 0.0],
    [2.30, 0.86],
    [2.30, 2.52],
    [1.24, 3.58],
    // Left outer crown & buttress contour (top -> bottom)
    [-1.24, 3.58],
    [-2.30, 2.52],
    [-2.30, 0.86],
    [-2.38, 0.0],
  ];
  p.merge(extrudePolyZ('SteelStructure', archXY, zCenter - halfT, zCenter + halfT));

  // Recessed darker I-beam web channels on front/back faces of each vertical leg so ribs read like real girders
  for (const sx of [-1, 1]) {
    p.merge(
      boxBounds(
        'ArmorMid',
        sx * 2.04,
        sx * 2.22,
        0.42,
        2.42,
        zCenter - halfT - 0.015,
        zCenter + halfT + 0.015
      )
    );
    // Heavy dark anchor base shoes at Y = 0.00
    p.merge(
      boxBounds(
        'ArmorDark',
        sx * 1.94,
        sx * 2.42,
        0.0,
        0.28,
        zCenter - 0.20,
        zCenter + 0.20
      )
    );
  }

  return p;
}

function buildArmoryPlantPart() {
  const p = new Part();

  // 1. Heavy Rectangular Foundation Plinth flush on Y = 0.00 (4.36 wide x 5.76 long, R_XZ <= 3.74 <= 3.75)
  p.merge(chamferBoxY('ArmorDark', 4.36, 5.76, 0.0, 0.34, 0.28, 0.04));

  // 2. Main Rectangular Industrial Hall (Y = 0.34..3.26)
  // Vertical dark gunmetal lower hall walls (|x| <= 1.98, |z| <= 2.74)
  p.merge(boxBounds('ArmorDark', -1.98, 1.98, 0.34, 2.40, -2.74, 2.74));

  // Sloped upper roof casemate rising from |x| = 1.98 (Y = 2.40) to |x| = 1.12 (Y = 3.26)
  const roofXY = [
    [-1.98, 2.40],
    [1.98, 2.40],
    [1.12, 3.26],
    [-1.12, 3.26],
  ];
  p.merge(extrudePolyZ('ArmorDark', roofXY, -2.74, 2.74));

  // Raised central clerestory spine deck along roof crown
  p.merge(boxBounds('ArmorMid', -0.84, 0.84, 3.26, 3.44, -2.66, 2.66));

  // 3. Bold Blue TeamColor Sloped Roof Shoulder Plates & Front Header between the 5 steel ribs!
  const bayCentersZ = [-1.86, -0.62, 0.62, 1.86];
  for (const bz of bayCentersZ) {
    for (const sx of [-1, 1]) {
      const plateXY =
        sx > 0
          ? [
              [1.96, 2.46],
              [2.05, 2.46],
              [1.26, 3.25],
              [1.17, 3.25],
            ]
          : [
              [-2.05, 2.46],
              [-1.96, 2.46],
              [-1.17, 3.25],
              [-1.26, 3.25],
            ];
      p.merge(extrudePolyZ('TeamColor', plateXY, bz - 0.44, bz + 0.44));
    }
  }

  // 4. Five Massive External Steel Fabrication Portal Ribs marching front-to-back!
  const ribPositionsZ = [-2.48, -1.24, 0.0, 1.24, 2.48];
  for (const rz of ribPositionsZ) {
    p.merge(buildPortalRib(rz));
  }

  // Longitudinal steel purlin / crane girders tying all 5 portal ribs together along the roof
  for (const sx of [-1.08, 1.08]) {
    p.merge(boxBounds('SteelStructure', sx - 0.09, sx + 0.09, 3.44, 3.60, -2.68, 2.68));
  }

  // 5. MAIN FRONT (-Z) HEAVY TWIN SERVICE DOORS & VEHICLE APRON RAMP
  // Sloped concrete/armor vehicle service apron at Y = 0.00..0.22 (hypot(1.18, 3.54) = 3.731 <= 3.75)
  p.merge(
    extrudePolyY(
      'ArmorMid',
      [
        [1.18, -2.84],
        [1.12, -3.54],
        [-1.12, -3.54],
        [-1.18, -2.84],
      ],
      0.0,
      0.07
    )
  );
  const frontRamp = new Part();
  frontRamp.addQuad('ArmorMid', [1.10, 0.07, -3.52], [-1.10, 0.07, -3.52], [-1.16, 0.28, -2.84], [1.16, 0.28, -2.84]);
  frontRamp.addTri('ArmorDark', [1.10, 0.07, -3.52], [1.16, 0.28, -2.84], [1.16, 0.07, -2.84]);
  frontRamp.addTri('ArmorDark', [-1.10, 0.07, -3.52], [-1.16, 0.07, -2.84], [-1.16, 0.28, -2.84]);
  p.merge(frontRamp);
  p.merge(boxBounds('HazardTrim', -1.08, 1.08, 0.01, 0.08, -3.55, -3.44));

  // Twin yellow/gold industrial safety bollards flanking the front service apron
  for (const sx of [-1.24, 1.24]) {
    p.merge(frustumY('ArmorDark', 8, 0.13, 0.12, 0.0, 0.16, sx, -3.26));
    p.merge(frustumY('HazardTrim', 8, 0.10, 0.09, 0.16, 0.62, sx, -3.26));
  }

  // Heavy 3-piece steel portal surround (left jamb + right jamb + top lintel) framing deeply recessed Twin Service Doors!
  p.merge(boxBounds('SteelStructure', -1.56, -1.30, 0.26, 2.58, -2.96, -2.70));
  p.merge(boxBounds('SteelStructure', 1.30, 1.56, 0.26, 2.58, -2.96, -2.70));
  p.merge(boxBounds('SteelStructure', -1.56, 1.56, 2.38, 2.60, -2.96, -2.70));
  // Dark interior seam backing behind the twin doors
  p.merge(boxBounds('DarkTrim', -1.32, 1.32, 0.28, 2.40, -2.76, -2.64));

  // Left & Right Heavy Segmented Service Door Leaves (proud in front of DarkTrim, recessed inside SteelStructure jambs!)
  for (const [x0, x1] of [
    [-1.28, -0.05],
    [0.05, 1.28],
  ]) {
    p.merge(boxBounds('ArmorMid', x0, x1, 0.28, 2.38, -2.85, -2.74));
    // Horizontal steel structural door ribs standing proud at z = -2.90
    for (const ry of [0.76, 1.24, 1.72, 2.14]) {
      p.merge(boxBounds('SteelStructure', x0 + 0.04, x1 - 0.04, ry, ry + 0.10, -2.90, -2.83));
    }
    // Vertical locking stile near center seam
    const lockX = x0 < 0 ? [-0.22, -0.10] : [0.10, 0.22];
    p.merge(boxBounds('ArmorDark', lockX[0], lockX[1], 0.54, 2.28, -2.91, -2.84));
    // Hazard kickplate along bottom of each service door
    p.merge(boxBounds('HazardTrim', x0 + 0.04, x1 - 0.04, 0.30, 0.52, -2.90, -2.83));
  }

  // Front (-Z) Blue TeamColor Gable Fascia Badge & Illuminated Cyan Bay Strip
  p.merge(boxBounds('TeamColor', -1.38, 1.38, 2.60, 3.08, -2.86, -2.72));
  p.merge(boxBounds('EmissiveCyan', -1.24, 1.24, 2.44, 2.55, -2.95, -2.84));

  // Cantilevered Overhead Hoist I-Beam jutting forward along -Z above main service doors
  p.merge(boxBounds('SteelStructure', -0.14, 0.14, 2.74, 2.94, -3.40, -2.70));
  p.merge(strut('SteelStructure', [-0.62, 3.16, -2.74], [-0.10, 2.90, -3.28], 0.07, 4));
  p.merge(strut('SteelStructure', [0.62, 3.16, -2.74], [0.10, 2.90, -3.28], 0.07, 4));

  // 6. SECONDARY FLANK (-X) SERVICE DOOR & THRESHOLD RAMP (between middle ribs z = -1.24..0.00)
  const sideZ = -0.62;
  // 3-piece steel jamb surround (front jamb + back jamb + lintel) so recessed side service door shows clearly!
  p.merge(boxBounds('SteelStructure', -2.16, -1.94, 0.22, 1.98, sideZ - 0.52, sideZ - 0.38));
  p.merge(boxBounds('SteelStructure', -2.16, -1.94, 0.22, 1.98, sideZ + 0.38, sideZ + 0.52));
  p.merge(boxBounds('SteelStructure', -2.16, -1.94, 1.84, 1.98, sideZ - 0.52, sideZ + 0.52));
  p.merge(boxBounds('DarkTrim', -2.02, -1.94, 0.24, 1.86, sideZ - 0.40, sideZ + 0.40));
  p.merge(boxBounds('ArmorMid', -2.08, -2.00, 0.24, 1.82, sideZ - 0.36, sideZ + 0.36));
  for (const sry of [0.72, 1.14, 1.54]) {
    p.merge(boxBounds('SteelStructure', -2.12, -2.06, sry, sry + 0.09, sideZ - 0.33, sideZ + 0.33));
  }
  p.merge(boxBounds('HazardTrim', -2.12, -2.06, 0.26, 0.46, sideZ - 0.34, sideZ + 0.34));
  // Canopy hood + cyan door beacon over side service door
  p.merge(boxBounds('ArmorDark', -2.32, -1.96, 1.98, 2.12, sideZ - 0.54, sideZ + 0.54));
  p.merge(boxBounds('EmissiveCyan', -2.18, -2.06, 1.88, 1.96, sideZ - 0.34, sideZ + 0.34));
  // Side threshold ramp at Y = 0.00
  p.merge(boxBounds('ArmorMid', -2.64, -2.02, 0.0, 0.22, sideZ - 0.48, sideZ + 0.48));
  p.merge(boxBounds('HazardTrim', -2.66, -2.56, 0.01, 0.14, sideZ - 0.44, sideZ + 0.44));

  // Recessed industrial louver vents in remaining -X wall bays
  for (const vz of [-1.86, 0.62, 1.86]) {
    p.merge(boxBounds('DarkTrim', -2.04, -1.92, 0.72, 1.96, vz - 0.38, vz + 0.38));
    for (let ly = 0.86; ly <= 1.82; ly += 0.24) {
      p.merge(boxBounds('SteelStructure', -2.06, -1.96, ly, ly + 0.08, vz - 0.34, vz + 0.34));
    }
  }

  // 7. OPPOSITE FLANK (+X) HEAVY UPGRADE FORGE / PLASMA MANIFOLD MODULE
  p.merge(chamferBoxY('ArmorDark', 0.82, 1.96, 0.0, 2.18, 0.18, 0.06, 2.28, 0.0));
  p.merge(boxBounds('TeamColor', 2.62, 2.72, 0.68, 1.92, -0.74, 0.74));
  p.merge(boxBounds('EmissiveCyan', 2.64, 2.74, 1.22, 1.38, -0.52, 0.52));
  // Twin heavy high-pressure conduit pipes curving from manifold into plant roof
  for (const pz of [-0.62, 0.62]) {
    p.merge(strut('SteelStructure', [2.42, 2.12, pz], [1.62, 2.86, pz], 0.18, 6));
  }

  // 8. REAR (+Z) REAR WALL & ASYMMETRIC TWIN FOUNDRY EXHAUST STACKS
  p.merge(boxBounds('ArmorMid', -1.42, 0.62, 0.42, 2.38, 2.70, 2.86));
  p.merge(boxBounds('TeamColor', -1.24, 0.44, 1.62, 2.24, 2.82, 2.92));

  // Twin tall octagonal industrial smokestacks on rear-right (+X/+Z) corner (R_XZ = hypot(1.62, 2.76) = 3.20 <= 3.75)
  for (const [sx, topY] of [
    [1.06, 4.46],
    [1.64, 4.12],
  ]) {
    p.merge(frustumY('ArmorDark', 8, 0.28, 0.24, 0.34, topY - 0.32, sx, 2.68, Math.PI / 8));
    p.merge(frustumY('SteelStructure', 8, 0.31, 0.30, 2.60, 3.45, sx, 2.68, Math.PI / 8));
    p.merge(frustumY('DarkTrim', 8, 0.25, 0.20, topY - 0.32, topY, sx, 2.68, Math.PI / 8));
  }

  return p;
}

function buildHoistTrolleyPart() {
  // Animated winch trolley hanging under the front (-Z) cantilevered hoist I-beam at (0, 2.74, -3.12)
  const p = new Part();
  p.merge(boxBounds('ArmorMid', -0.22, 0.22, -0.14, 0.04, -0.18, 0.18));
  p.merge(frustumY('SteelStructure', 6, 0.035, 0.035, -0.46, -0.14));
  p.merge(boxBounds('HazardTrim', -0.12, 0.12, -0.62, -0.44, -0.10, 0.10));
  return p;
}

function buildRoofCalibrationGantryPart() {
  // Animated rooftop calibration scanner/crane sled riding along the roof rails at (0, 3.58, 0)
  const p = new Part();
  p.merge(boxBounds('ArmorDark', -1.20, 1.20, 0.0, 0.22, -0.26, 0.26));
  p.merge(boxBounds('TeamColor', -0.78, 0.78, 0.20, 0.36, -0.20, 0.20));
  p.merge(boxBounds('EmissiveCyan', -0.42, 0.42, 0.24, 0.34, -0.28, -0.18));
  return p;
}

export function createVehicleArmoryScene() {
  const plantPart = buildArmoryPlantPart();
  const trolleyPart = buildHoistTrolleyPart();
  const gantryPart = buildRoofCalibrationGantryPart();

  const root = {
    name: 'VehicleArmory',
    translation: [0, 0, 0],
    rotation: quatIdentity(),
    scale: [1, 1, 1],
    children: [
      {
        name: 'PlantHull',
        translation: [0, 0, 0],
        rotation: quatIdentity(),
        scale: [1, 1, 1],
        part: plantPart,
        children: [
          {
            name: 'HoistTrolley',
            translation: [0, 2.74, -3.12],
            rotation: quatIdentity(),
            scale: [1, 1, 1],
            part: trolleyPart,
          },
          {
            name: 'RoofGantry',
            translation: [0, 3.58, -0.62],
            rotation: quatIdentity(),
            scale: [1, 1, 1],
            part: gantryPart,
          },
        ],
      },
    ],
  };

  // --- Animations: idle (industrial gantry & hoist cycle), death (structural collapse) ---
  const idleTimes = [0.0, 2.0, 4.0];
  const gantryTrans = [
    [0, 3.58, -0.62],
    [0, 3.58, 0.62],
    [0, 3.58, -0.62],
  ];
  const trolleyTrans = [
    [0, 2.74, -3.12],
    [0, 2.82, -3.26],
    [0, 2.74, -3.12],
  ];

  const deathTimes = [0.0, 0.25, 0.70, 1.30, 1.80];
  const deathHullTrans = [
    [0, 0, 0],
    [0.04, 0.05, 0.02],
    [-0.05, -0.05, 0.04],
    [-0.08, -0.12, 0.08],
    [-0.10, -0.15, 0.10],
  ];
  const deathHullRot = ensureQuatContinuity([
    quatIdentity(),
    quatFromEulerYXZ(1.5 * DEG2RAD, -1.8 * DEG2RAD, 2.5 * DEG2RAD),
    quatFromEulerYXZ(-3.0 * DEG2RAD, 3.0 * DEG2RAD, -4.5 * DEG2RAD),
    quatFromEulerYXZ(-4.5 * DEG2RAD, 4.5 * DEG2RAD, -6.5 * DEG2RAD),
    quatFromEulerYXZ(-5.0 * DEG2RAD, 5.0 * DEG2RAD, -7.2 * DEG2RAD),
  ]);
  const deathHullScale = [
    [1, 1, 1],
    [1.02, 0.96, 1.01],
    [1.05, 0.66, 1.03],
    [1.07, 0.42, 1.04],
    [1.08, 0.36, 1.05],
  ];

  return {
    name: 'VehicleArmoryScene',
    targetRadius: 3.75,
    root,
    animations: [
      {
        name: 'idle',
        tracks: [
          { node: 'RoofGantry', path: 'translation', times: idleTimes, values: gantryTrans },
          { node: 'HoistTrolley', path: 'translation', times: idleTimes, values: trolleyTrans },
        ],
      },
      {
        name: 'death',
        tracks: [
          { node: 'PlantHull', path: 'translation', times: deathTimes, values: deathHullTrans },
          { node: 'PlantHull', path: 'rotation', times: deathTimes, values: deathHullRot },
          { node: 'PlantHull', path: 'scale', times: deathTimes, values: deathHullScale },
        ],
      },
    ],
  };
}
