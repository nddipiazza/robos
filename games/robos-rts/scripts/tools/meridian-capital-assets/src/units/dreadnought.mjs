// Dreadnought (dreadnought.glb) — Meridian Guard 550-HP Massive Heavy Cruiser
// Radius: 3.125 | Y-up, floor 0, faces -Z
// Distinguishing silhouette: 3-tier layered dark armored cruiser hull, prominent 4-prong forward spinal siege emitter,
// port & starboard twin-barrel lateral laser batteries, elevated command citadel, and recessed long blue TeamColor plates.

import { MAT } from '../materials.mjs';
import {
  TAU,
  quatFromAxisAngle,
  quatFromEulerDeg,
  quatIdentity,
} from '../math.mjs';
import {
  bevelBox,
  chinedSection,
  cylinderY,
  ductedShroudZ,
  extrudePolygonY,
  groundedTranslation,
  loftStations,
  recessedTeamPlate,
  transformPrim,
} from '../geom.mjs';
import { SceneBuilder } from '../glb-writer.mjs';

export const DREADNOUGHT_RADIUS = 3.125;

export function buildDreadnoughtScene() {
  const sb = new SceneBuilder({
    unitId: 'dreadnought',
    radius: DREADNOUGHT_RADIUS,
  });

  sb.addNode({ name: 'Root', translation: [0, 0, 0] });

  const hullPrims = [];
  const teamPrims = [];

  // =========================================================================
  // 1. LAYERED DARK ARMORED HULL (Three Stepped Warship Armor Tiers)
  // =========================================================================

  // Tier 1: Deep Ventral Keel & Lower Armored Belt (y = 0.00 to 0.62, z = -2.25 to +2.82)
  const keelStations = [
    chinedSection({ z: -2.25, yCenter: 0.32, halfHeight: 0.22, topHalfW: 0.58, midHalfW: 0.68, botHalfW: 0.42 }),
    chinedSection({ z: -1.10, yCenter: 0.34, halfHeight: 0.28, topHalfW: 0.98, midHalfW: 1.12, botHalfW: 0.72 }),
    chinedSection({ z: +0.35, yCenter: 0.34, halfHeight: 0.30, topHalfW: 1.10, midHalfW: 1.24, botHalfW: 0.80 }),
    chinedSection({ z: +1.85, yCenter: 0.36, halfHeight: 0.28, topHalfW: 0.96, midHalfW: 1.08, botHalfW: 0.72 }),
    chinedSection({ z: +2.82, yCenter: 0.40, halfHeight: 0.24, topHalfW: 0.78, midHalfW: 0.88, botHalfW: 0.58 }),
  ];
  hullPrims.push(loftStations(keelStations, MAT.HullObsidian));

  // Grounded ventral armored keel skegs resting cleanly on Y = 0.00
  for (const sx of [-1, 1]) {
    hullPrims.push(
      transformPrim(bevelBox(0.24, 0.12, 3.60, 0.03, MAT.ArmorDark), {
        pos: [sx * 0.52, 0.06, +0.20],
      }),
    );
  }

  // Tier 2: Main Heavy Cruiser Casemate Hull (y = 0.50 to 1.22, z = -2.35 to +2.92)
  const mainHullStations = [
    chinedSection({ z: -2.35, yCenter: 0.86, halfHeight: 0.32, topHalfW: 0.88, midHalfW: 1.06, botHalfW: 0.78 }),
    chinedSection({ z: -1.35, yCenter: 0.88, halfHeight: 0.36, topHalfW: 1.24, midHalfW: 1.48, botHalfW: 1.12 }),
    chinedSection({ z: -0.10, yCenter: 0.90, halfHeight: 0.38, topHalfW: 1.38, midHalfW: 1.62, botHalfW: 1.26 }),
    chinedSection({ z: +1.35, yCenter: 0.90, halfHeight: 0.37, topHalfW: 1.30, midHalfW: 1.52, botHalfW: 1.18 }),
    chinedSection({ z: +2.45, yCenter: 0.90, halfHeight: 0.34, topHalfW: 1.10, midHalfW: 1.28, botHalfW: 0.98 }),
    chinedSection({ z: +2.92, yCenter: 0.90, halfHeight: 0.30, topHalfW: 0.94, midHalfW: 1.10, botHalfW: 0.86 }),
  ];
  hullPrims.push(loftStations(mainHullStations, MAT.ArmorDark));

  // Fortress-like Port & Starboard Lateral Broadside Sponsons (x = +/-1.30 out to +/-2.38)
  for (const sx of [-1, 1]) {
    // Lower dark structural sponson wing
    hullPrims.push(
      extrudePolygonY(
        [
          [sx * 1.18, -1.55],
          [sx * 2.18, -0.98],
          [sx * 2.38, -0.52],
          [sx * 2.38, +0.58],
          [sx * 2.02, +1.38],
          [sx * 1.18, +1.68],
        ],
        0.58,
        1.06,
        MAT.ArmorDark,
        { scaleTopX: 0.95, scaleTopZ: 0.95 },
      ),
      // Layered upper slate armor carapace over sponson (creates crisp stepped shadow line!)
      extrudePolygonY(
        [
          [sx * 1.22, -1.35],
          [sx * 2.08, -0.86],
          [sx * 2.26, -0.44],
          [sx * 2.26, +0.48],
          [sx * 1.92, +1.18],
          [sx * 1.22, +1.46],
        ],
        1.04,
        1.20,
        MAT.ArmorSlate,
        { scaleTopX: 0.94, scaleTopZ: 0.94 },
      ),
      // Steel leading-edge armor bumper on sponson prow
      transformPrim(bevelBox(0.16, 0.24, 0.62, 0.03, MAT.SteelLight), {
        pos: [sx * 2.28, 0.86, -0.52],
        rotDeg: [0, sx * -24, 0],
      }),
      // Raised octagonal barbette ring for Lateral Laser Battery
      transformPrim(cylinderY(0.46, 0.52, 0.16, 8, MAT.HullObsidian, { smooth: false }), {
        pos: [sx * 1.92, 1.24, -0.32],
      }),
    );
  }

  // Tier 3: Layered Beveled Upper Deck Carapace Slabs (with recessed obsidian expansion seams!)
  // Segmented overlapping heavy armor plates on port & starboard foredeck framing the central spinal siege trench
  for (const sx of [-1, 1]) {
    for (const [zPos, zLen, wPlate] of [
      [-1.88, 0.82, 0.56],
      [-0.98, 0.86, 0.68],
      [-0.04, 0.88, 0.74],
    ]) {
      hullPrims.push(
        transformPrim(bevelBox(wPlate, 0.14, zLen, 0.035, MAT.ArmorSlate), {
          pos: [sx * 0.82, 1.28, zPos],
          rotDeg: [0, 0, sx * -4],
        }),
      );
    }
  }

  // Dark Recessed Central Spinal Siege Trench running from Citadel forward to Bow Siege Chamber!
  hullPrims.push(
    transformPrim(bevelBox(0.76, 0.28, 2.85, 0.025, MAT.HullObsidian), {
      pos: [0, 1.12, -0.95],
    }),
  );
  // Glowing spinal plasma conduit ribs visible inside the dorsal trench!
  for (const zRib of [-1.95, -1.45, -0.95, -0.45, +0.05]) {
    hullPrims.push(
      transformPrim(bevelBox(0.52, 0.10, 0.14, 0.02, MAT.SteelLight), {
        pos: [0, 1.25, zRib],
      }),
      transformPrim(bevelBox(0.32, 0.08, 0.26, 0.015, MAT.SensorCyan), {
        pos: [0, 1.22, zRib - 0.20],
      }),
    );
  }

  // =========================================================================
  // 2. ELEVATED COMMAND CITADEL & QUAD ARMORED STERN THRUSTERS
  // =========================================================================

  // Lower Citadel Bastion (z = +0.25 to +2.25, y = 1.22 to 1.76)
  hullPrims.push(
    transformPrim(bevelBox(1.86, 0.52, 1.98, 0.06, MAT.ArmorDark), {
      pos: [0, 1.46, +1.24],
    }),
    // Stepped Upper Command Bridge Tower (z = +0.48 to +1.82, y = 1.70 to 2.16)
    transformPrim(bevelBox(1.28, 0.44, 1.32, 0.05, MAT.ArmorSlate), {
      pos: [0, 1.90, +1.18],
    }),
    // Armored Bridge Brow Cap
    transformPrim(bevelBox(1.36, 0.12, 0.92, 0.03, MAT.ArmorDark), {
      pos: [0, 2.14, +1.12],
    }),
    // Luminous Cyan Armored Command Bridge Viewport Slit facing -Z!
    transformPrim(bevelBox(0.96, 0.12, 0.10, 0.015, MAT.SensorCyan), {
      pos: [0, 1.96, +0.52],
    }),
  );

  // Angled Shield/Radiator Pylons flanking Command Citadel
  for (const sx of [-1, 1]) {
    hullPrims.push(
      transformPrim(bevelBox(0.14, 0.62, 0.96, 0.025, MAT.ArmorDark), {
        pos: [sx * 0.98, 1.72, +1.42],
        rotDeg: [-8, 0, sx * -18],
      }),
      transformPrim(bevelBox(0.06, 0.42, 0.68, 0.01, MAT.SensorCyan), {
        pos: [sx * 1.03, 1.74, +1.42],
        rotDeg: [-8, 0, sx * -18],
      }),
    );
  }

  // Quad Heavy Stern Thruster Bank at +Z (z = +2.75 to +3.08)
  hullPrims.push(
    transformPrim(bevelBox(2.04, 0.68, 0.32, 0.04, MAT.HullObsidian), {
      pos: [0, 0.88, +2.86],
    }),
  );
  for (const xThr of [-0.68, -0.23, +0.23, +0.68]) {
    hullPrims.push(
      transformPrim(
        ductedShroudZ({
          outerRFront: 0.21,
          outerRMid: 0.22,
          outerRBack: 0.19,
          innerR: 0.13,
          length: 0.34,
          lipDepth: 0.05,
          segments: 10,
          material: MAT.SteelLight,
          smooth: false,
        }),
        { pos: [xThr, 0.88, +2.92] },
      ),
      transformPrim(cylinderY(0.13, 0.09, 0.18, 10, MAT.ThrusterAmber), {
        pos: [xThr, 0.88, +2.98],
        rotDeg: [90, 0, 0],
      }),
    );
  }

  // =========================================================================
  // 3. RECESSED LONG BLUE TEAM-COLOR PLATES (Signature Meridian Flagship Read!)
  // =========================================================================
  for (const sx of [-1, 1]) {
    // 3a. Primary Long Fore-to-Midship Dorsal Recessed Blue Plate (2.52 units long!)
    const mainLongPlate = recessedTeamPlate({
      width: 0.36,
      length: 2.52,
      frameHeight: 0.085,
      border: 0.055,
      plateThickness: 0.048,
      bezelMat: MAT.ArmorDark,
      floorMat: MAT.HullObsidian,
      teamMat: MAT.TeamColor,
      pos: [sx * 0.82, 1.33, -0.96],
      rotDeg: [0, 0, sx * -4],
    });
    hullPrims.push(...mainLongPlate.framePrims);
    teamPrims.push(mainLongPlate.teamPrim);

    // 3b. Outer Broadside Sponson Long Recessed Blue Plate (1.92 units long!)
    const sponsonLongPlate = recessedTeamPlate({
      width: 0.30,
      length: 1.92,
      frameHeight: 0.08,
      border: 0.05,
      plateThickness: 0.045,
      bezelMat: MAT.ArmorDark,
      floorMat: MAT.HullObsidian,
      teamMat: MAT.TeamColor,
      pos: [sx * 1.44, 1.18, +0.16],
      rotDeg: [0, 0, sx * -3],
    });
    hullPrims.push(...sponsonLongPlate.framePrims);
    teamPrims.push(sponsonLongPlate.teamPrim);

    // 3c. Command Citadel Flank Recessed Blue Plate (1.16 units long)
    const citadelPlate = recessedTeamPlate({
      width: 0.24,
      length: 1.16,
      frameHeight: 0.07,
      border: 0.045,
      plateThickness: 0.042,
      bezelMat: MAT.ArmorDark,
      floorMat: MAT.HullObsidian,
      teamMat: MAT.TeamColor,
      pos: [sx * 0.52, 1.70, +1.26],
    });
    hullPrims.push(...citadelPlate.framePrims);
    teamPrims.push(citadelPlate.teamPrim);
  }

  // Main Hull & Primary Named TeamColor Node
  sb.addNode({
    name: 'Hull',
    parent: 'Root',
    translation: [0, 0, 0],
    prims: hullPrims,
  });

  sb.addNode({
    name: 'TeamColor',
    meshName: 'TeamColor',
    parent: 'Hull',
    translation: [0, 0, 0],
    prims: teamPrims,
  });

  // Rotating Flagship Bridge Radar Mast
  sb.addNode({
    name: 'BridgeRadar',
    parent: 'Hull',
    translation: [0, 2.26, +1.34],
    prims: [
      cylinderY(0.06, 0.09, 0.22, 8, MAT.SteelLight, { smooth: false }),
      transformPrim(bevelBox(0.84, 0.08, 0.14, 0.015, MAT.RadomeComposite), { pos: [0, 0.12, 0] }),
      transformPrim(bevelBox(0.68, 0.04, 0.06, 0.008, MAT.SensorCyan), { pos: [0, 0.12, -0.06] }),
    ],
  });

  // Dorsal Spinal Siege Radiator Shutter (opens during cast!)
  sb.addNode({
    name: 'SpinalShutter',
    parent: 'Hull',
    translation: [0, 1.30, -0.15],
    prims: [
      transformPrim(bevelBox(0.62, 0.09, 0.92, 0.02, MAT.ArmorSlate), { pos: [0, 0.02, -0.42] }),
      transformPrim(bevelBox(0.42, 0.05, 0.72, 0.01, MAT.SiegePlasma), { pos: [0, -0.02, -0.42] }),
    ],
  });

  // =========================================================================
  // 4. PROMINENT FORWARD SIEGE EMITTER (4 Armored Bow Prongs + Central Core)
  // =========================================================================

  // Cavernous dark bow siege chamber housing
  sb.addNode({
    name: 'SiegeChamber',
    parent: 'Hull',
    translation: [0, 0.88, -2.18],
    prims: [
      bevelBox(1.16, 0.64, 0.62, 0.03, MAT.HullObsidian),
      transformPrim(
        ductedShroudZ({
          outerRFront: 0.48,
          outerRMid: 0.50,
          outerRBack: 0.52,
          innerR: 0.34,
          length: 0.44,
          lipDepth: 0.08,
          segments: 12,
          material: MAT.ArmorDark,
          smooth: false,
        }),
        { pos: [0, 0, -0.22] },
      ),
    ],
  });

  // Concentric glowing plasma accelerator rings along the siege emitter (sized to shine boldly at RTS zoom!)
  const siegeCorePrims = [
    // Heavy central accelerator tube extending forward toward -Z
    transformPrim(cylinderY(0.26, 0.30, 0.98, 14, MAT.SteelLight, { smooth: false }), {
      pos: [0, 0, -0.42],
      rotDeg: [90, 0, 0],
    }),
    transformPrim(cylinderY(0.37, 0.37, 0.12, 14, MAT.SensorCyan), {
      pos: [0, 0, -0.24],
      rotDeg: [90, 0, 0],
    }),
    transformPrim(cylinderY(0.35, 0.35, 0.12, 14, MAT.SiegePlasma), {
      pos: [0, 0, -0.52],
      rotDeg: [90, 0, 0],
    }),
    // Forward Siege Focusing Bell & High-Intensity SiegePlasma Aperture!
    transformPrim(
      ductedShroudZ({
        outerRFront: 0.38,
        outerRMid: 0.35,
        outerRBack: 0.31,
        innerR: 0.22,
        length: 0.26,
        lipDepth: 0.06,
        segments: 14,
        material: MAT.ArmorDark,
        smooth: false,
      }),
      { pos: [0, 0, -0.80] },
    ),
    transformPrim(cylinderY(0.26, 0.20, 0.18, 14, MAT.SiegePlasma), {
      pos: [0, 0, -0.87],
      rotDeg: [90, 0, 0],
    }),
  ];

  sb.addNode({
    name: 'SiegeCore',
    parent: 'SiegeChamber',
    translation: [0, 0, 0],
    prims: siegeCorePrims,
  });

  // Four Massive Layered Armored Bow Siege Prongs framing the Siege Emitter (-Z)
  function buildSiegeProng(sx, sy) {
    return [
      // Heavy outer dark-armor tapered jaw (extends from hinge z=0 out to z=-0.92 -> world z=-3.06)
      transformPrim(bevelBox(0.34, 0.22, 0.96, 0.035, MAT.ArmorDark), {
        pos: [0, 0, -0.46],
        rotDeg: [sy * -4, sx * 5, 0],
      }),
      // Layered upper/outer slate armor cap on prong
      transformPrim(bevelBox(0.28, 0.09, 0.78, 0.02, MAT.ArmorSlate), {
        pos: [sx * 0.03, sy * 0.09, -0.40],
        rotDeg: [sy * -4, sx * 5, 0],
      }),
      // Inner steel magnetic rail + glowing cyan focusing strip facing the central siege beam!
      transformPrim(bevelBox(0.14, 0.07, 0.84, 0.012, MAT.SteelLight), {
        pos: [-sx * 0.09, -sy * 0.07, -0.46],
      }),
      transformPrim(bevelBox(0.08, 0.055, 0.76, 0.008, MAT.SiegePlasma), {
        pos: [-sx * 0.12, -sy * 0.08, -0.48],
      }),
    ];
  }

  const prongDefs = [
    { name: 'SiegeProngUL', sx: -1, sy: +1, pos: [-0.62, +0.26, -0.06] },
    { name: 'SiegeProngUR', sx: +1, sy: +1, pos: [+0.62, +0.26, -0.06] },
    { name: 'SiegeProngLL', sx: -1, sy: -1, pos: [-0.54, -0.24, -0.04] },
    { name: 'SiegeProngLR', sx: +1, sy: -1, pos: [+0.54, -0.24, -0.04] },
  ];
  for (const pd of prongDefs) {
    sb.addNode({
      name: pd.name,
      parent: 'SiegeChamber',
      translation: pd.pos,
      prims: buildSiegeProng(pd.sx, pd.sy),
    });
  }

  // =========================================================================
  // 5. TWO LATERAL LASER BATTERIES (Port & Starboard Broadside Sponson Turrets)
  // =========================================================================
  function buildLaserTurretHousing() {
    return [
      // Beveled armored heavy laser turret housing
      transformPrim(bevelBox(0.68, 0.28, 0.74, 0.04, MAT.ArmorDark), { pos: [0, 0.14, +0.04] }),
      transformPrim(bevelBox(0.56, 0.10, 0.58, 0.025, MAT.ArmorSlate), { pos: [0, 0.30, +0.06] }),
      // Optical heat-sink side pods
      transformPrim(bevelBox(0.78, 0.14, 0.36, 0.02, MAT.SteelLight), { pos: [0, 0.15, +0.10] }),
    ];
  }

  function buildTwinLaserBarrels() {
    const prims = [];
    for (const bx of [-0.16, +0.16]) {
      prims.push(
        // Armored laser focusing jacket
        transformPrim(cylinderY(0.085, 0.105, 0.68, 10, MAT.SteelLight, { smooth: false }), {
          pos: [bx, 0, -0.34],
          rotDeg: [90, 0, 0],
        }),
        // Dark emitter collar
        transformPrim(cylinderY(0.10, 0.10, 0.14, 10, MAT.ArmorDark, { smooth: false }), {
          pos: [bx, 0, -0.58],
          rotDeg: [90, 0, 0],
        }),
        // Luminous cyan laser lens aperture + dorsal charge strip!
        transformPrim(cylinderY(0.068, 0.068, 0.08, 10, MAT.SensorCyan), {
          pos: [bx, 0, -0.68],
          rotDeg: [90, 0, 0],
        }),
        transformPrim(bevelBox(0.05, 0.045, 0.52, 0.008, MAT.SensorCyan), {
          pos: [bx, +0.085, -0.30],
        }),
      );
    }
    return prims;
  }

  for (const [sx, side] of [[-1, 'Left'], [1, 'Right']]) {
    const batName = `LaserBattery${side}`;
    const barName = `LaserBarrels${side}`;
    sb.addNode({
      name: batName,
      parent: 'Hull',
      translation: [sx * 1.92, 1.28, -0.32],
      prims: buildLaserTurretHousing(),
    });
    sb.addNode({
      name: `TeamColor_Battery${side}`,
      meshName: `TeamColor_Battery${side}`,
      parent: batName,
      translation: [0, 0.355, +0.08],
      prims: [bevelBox(0.36, 0.04, 0.42, 0.01, MAT.TeamColor)],
    });
    sb.addNode({
      name: barName,
      parent: batName,
      translation: [0, 0.15, -0.26],
      prims: buildTwinLaserBarrels(),
    });
  }

  // =========================================================================
  // 6. REQUIRED ANCHORS: MuzzleLeft, MuzzleRight, Muzzle, and SiegeMuzzle
  // =========================================================================
  sb.addNode({
    name: 'MuzzleLeft',
    parent: 'LaserBarrelsLeft',
    translation: [0, 0, -0.74],
  });
  sb.addNode({
    name: 'MuzzleRight',
    parent: 'LaserBarrelsRight',
    translation: [0, 0, -0.74],
  });
  sb.addNode({
    name: 'Muzzle',
    parent: 'Hull',
    translation: [0, 1.05, -2.98],
  });
  sb.addNode({
    name: 'SiegeMuzzle',
    parent: 'SiegeCore',
    translation: [0, 0, -0.96],
  });

  // Calibrate exact radius 3.125 and floor Y = 0.000000
  const s = sb.calibrate(0.994);

  const hullT = sb.getNode('Hull').translation.slice();
  const coreT = sb.getNode('SiegeCore').translation.slice();
  const lBarT = sb.getNode('LaserBarrelsLeft').translation.slice();
  const rBarT = sb.getNode('LaserBarrelsRight').translation.slice();

  const spinRadar = (times) =>
    times.map((_, idx) => quatFromAxisAngle([0, 1, 0], (idx / (times.length - 1)) * TAU));

  // Clip 1: idle (3.2s ponderous capital-ship station-keeping + lateral turret scan + bridge radar)
  const idleTimes9 = Array.from({ length: 9 }, (_, i) => (i / 8) * 3.2);
  sb.addAnimation('idle', [
    {
      node: 'Hull',
      path: 'translation',
      times: [0, 0.8, 1.6, 2.4, 3.2],
      values: [
        hullT,
        [hullT[0], hullT[1] + 0.07 * s, hullT[2]],
        [hullT[0], hullT[1] + 0.13 * s, hullT[2]],
        [hullT[0], hullT[1] + 0.06 * s, hullT[2]],
        hullT,
      ],
    },
    {
      node: 'Hull',
      path: 'rotation',
      times: [0, 0.8, 1.6, 2.4, 3.2],
      values: [
        quatIdentity(),
        quatFromEulerDeg(0.6, 0, 1.3),
        quatIdentity(),
        quatFromEulerDeg(-0.6, 0, -1.3),
        quatIdentity(),
      ],
    },
    {
      node: 'LaserBatteryLeft',
      path: 'rotation',
      times: [0, 1.0, 2.2, 3.2],
      values: [
        quatIdentity(),
        quatFromEulerDeg(0, +10, 0),
        quatFromEulerDeg(0, -5, 0),
        quatIdentity(),
      ],
    },
    {
      node: 'LaserBatteryRight',
      path: 'rotation',
      times: [0, 1.0, 2.2, 3.2],
      values: [
        quatIdentity(),
        quatFromEulerDeg(0, -10, 0),
        quatFromEulerDeg(0, +5, 0),
        quatIdentity(),
      ],
    },
    {
      node: 'BridgeRadar',
      path: 'rotation',
      times: idleTimes9,
      values: spinRadar(idleTimes9),
    },
  ]);

  // Clip 2: hover (2.2s active battle-cruise levitation heave + forward combat trim)
  const hoverTimes9 = Array.from({ length: 9 }, (_, i) => (i / 8) * 2.2);
  sb.addAnimation('hover', [
    {
      node: 'Hull',
      path: 'translation',
      times: [0, 0.55, 1.1, 1.65, 2.2],
      values: [
        [hullT[0], hullT[1] + 0.08 * s, hullT[2]],
        [hullT[0] - 0.03 * s, hullT[1] + 0.19 * s, hullT[2] - 0.03 * s],
        [hullT[0], hullT[1] + 0.12 * s, hullT[2]],
        [hullT[0] + 0.03 * s, hullT[1] + 0.20 * s, hullT[2] + 0.03 * s],
        [hullT[0], hullT[1] + 0.08 * s, hullT[2]],
      ],
    },
    {
      node: 'Hull',
      path: 'rotation',
      times: [0, 0.55, 1.1, 1.65, 2.2],
      values: [
        quatFromEulerDeg(-1.0, 0, 0),
        quatFromEulerDeg(-1.6, 0.6, +2.0),
        quatFromEulerDeg(-0.8, 0, 0),
        quatFromEulerDeg(-1.6, -0.6, -2.0),
        quatFromEulerDeg(-1.0, 0, 0),
      ],
    },
    {
      node: 'BridgeRadar',
      path: 'rotation',
      times: hoverTimes9,
      values: spinRadar(hoverTimes9),
    },
  ]);

  // Clip 3: attack (1.1s Dual Lateral Laser Battery Converging Salvo + Cruiser Shudder)
  sb.addAnimation('attack', [
    {
      node: 'LaserBatteryLeft',
      path: 'rotation',
      times: [0, 0.10, 0.70, 1.1],
      values: [
        quatIdentity(),
        quatFromEulerDeg(0, -5, 0), // converges slightly inward toward forward -Z target!
        quatFromEulerDeg(0, -5, 0),
        quatIdentity(),
      ],
    },
    {
      node: 'LaserBatteryRight',
      path: 'rotation',
      times: [0, 0.10, 0.70, 1.1],
      values: [
        quatIdentity(),
        quatFromEulerDeg(0, +5, 0),
        quatFromEulerDeg(0, +5, 0),
        quatIdentity(),
      ],
    },
    {
      node: 'LaserBarrelsLeft',
      path: 'translation',
      times: [0, 0.10, 0.20, 0.58, 1.1],
      values: [
        lBarT,
        lBarT,
        [lBarT[0], lBarT[1], lBarT[2] + 0.28 * s],
        [lBarT[0], lBarT[1], lBarT[2] + 0.08 * s],
        lBarT,
      ],
    },
    {
      node: 'LaserBarrelsRight',
      path: 'translation',
      times: [0, 0.24, 0.34, 0.72, 1.1],
      values: [
        rBarT,
        rBarT,
        [rBarT[0], rBarT[1], rBarT[2] + 0.28 * s],
        [rBarT[0], rBarT[1], rBarT[2] + 0.08 * s],
        rBarT,
      ],
    },
    {
      node: 'Hull',
      path: 'translation',
      times: [0, 0.18, 0.38, 0.78, 1.1],
      values: [
        hullT,
        [hullT[0], hullT[1] + 0.06 * s, hullT[2] + 0.07 * s],
        [hullT[0], hullT[1] + 0.08 * s, hullT[2] + 0.11 * s],
        [hullT[0], hullT[1] + 0.03 * s, hullT[2] + 0.03 * s],
        hullT,
      ],
    },
    {
      node: 'Hull',
      path: 'rotation',
      times: [0, 0.20, 0.40, 0.80, 1.1],
      values: [
        quatIdentity(),
        quatFromEulerDeg(+1.2, -0.6, 0),
        quatFromEulerDeg(+1.8, +0.6, 0),
        quatFromEulerDeg(+0.5, 0, 0),
        quatIdentity(),
      ],
    },
  ]);

  // Clip 4: cast (2.2s Signature Forward Siege Emitter Charge, 4-Prong Jaw Spread & Heavy Recoil!)
  sb.addAnimation('cast', [
    {
      node: 'Hull',
      path: 'translation',
      times: [0, 0.55, 0.85, 1.05, 1.55, 2.2],
      values: [
        hullT,
        [hullT[0], hullT[1] + 0.18 * s, hullT[2] - 0.06 * s], // braces forward
        [hullT[0], hullT[1] + 0.20 * s, hullT[2] - 0.08 * s], // peak charge
        [hullT[0], hullT[1] + 0.24 * s, hullT[2] + 0.32 * s], // MASSIVE +Z siege discharge recoil!
        [hullT[0], hullT[1] + 0.12 * s, hullT[2] + 0.10 * s],
        hullT,
      ],
    },
    {
      node: 'Hull',
      path: 'rotation',
      times: [0, 0.55, 0.85, 1.05, 1.55, 2.2],
      values: [
        quatIdentity(),
        quatFromEulerDeg(-2.5, 0, 0),
        quatFromEulerDeg(-3.0, 0, 0),
        quatFromEulerDeg(+4.6, 0, 0), // nose kicks upward on siege blast!
        quatFromEulerDeg(+1.4, 0, 0),
        quatIdentity(),
      ],
    },
    {
      node: 'SiegeCore',
      path: 'translation',
      times: [0, 0.55, 0.85, 1.02, 1.65, 2.2],
      values: [
        coreT,
        [coreT[0], coreT[1], coreT[2] - 0.15 * s], // extends forward to focus beam
        [coreT[0], coreT[1], coreT[2] - 0.18 * s],
        [coreT[0], coreT[1], coreT[2] + 0.34 * s], // slams back into spinal recuperator!
        [coreT[0], coreT[1], coreT[2] + 0.08 * s],
        coreT,
      ],
    },
    {
      node: 'SiegeProngUL',
      path: 'rotation',
      times: [0, 0.50, 0.95, 1.65, 2.2],
      values: [
        quatIdentity(),
        quatFromEulerDeg(+14, +12, 0),
        quatFromEulerDeg(+16, +14, 0),
        quatFromEulerDeg(+4, +3, 0),
        quatIdentity(),
      ],
    },
    {
      node: 'SiegeProngUR',
      path: 'rotation',
      times: [0, 0.50, 0.95, 1.65, 2.2],
      values: [
        quatIdentity(),
        quatFromEulerDeg(+14, -12, 0),
        quatFromEulerDeg(+16, -14, 0),
        quatFromEulerDeg(+4, -3, 0),
        quatIdentity(),
      ],
    },
    {
      node: 'SiegeProngLL',
      path: 'rotation',
      times: [0, 0.50, 0.95, 1.65, 2.2],
      values: [
        quatIdentity(),
        quatFromEulerDeg(-14, +12, 0),
        quatFromEulerDeg(-16, +14, 0),
        quatFromEulerDeg(-4, +3, 0),
        quatIdentity(),
      ],
    },
    {
      node: 'SiegeProngLR',
      path: 'rotation',
      times: [0, 0.50, 0.95, 1.65, 2.2],
      values: [
        quatIdentity(),
        quatFromEulerDeg(-14, -12, 0),
        quatFromEulerDeg(-16, -14, 0),
        quatFromEulerDeg(-4, -3, 0),
        quatIdentity(),
      ],
    },
    {
      node: 'SpinalShutter',
      path: 'rotation',
      times: [0, 0.45, 1.25, 2.2],
      values: [
        quatIdentity(),
        quatFromEulerDeg(+24, 0, 0),
        quatFromEulerDeg(+24, 0, 0),
        quatIdentity(),
      ],
    },
  ]);

  // Clip 5: death (2.0s Secondary explosions, heavy starboard list & bow pitch, settling crippled on Y=0)
  const dRotMid = quatFromEulerDeg(-5, -6, -15);
  const dRotImpact = quatFromEulerDeg(-6, -10, -16);
  const dRotFinal = quatFromEulerDeg(-5, -11, -15);
  const dPosMid = groundedTranslation(
    sb,
    'Hull',
    [hullT[0] + 0.12 * s, hullT[1], hullT[2] - 0.08 * s],
    {
      Hull: { rotation: dRotMid },
      SiegeProngLR: { rotation: quatFromEulerDeg(-10, -9, 0) },
    },
    0.16 * s,
  );
  const dPosImpact = groundedTranslation(
    sb,
    'Hull',
    [hullT[0] + 0.16 * s, hullT[1], hullT[2] - 0.12 * s],
    {
      Hull: { rotation: dRotImpact },
      SiegeProngLR: { rotation: quatFromEulerDeg(-10, -9, 0) },
    },
    0.005,
  );
  const dPosFinal = groundedTranslation(
    sb,
    'Hull',
    [hullT[0] + 0.16 * s, hullT[1], hullT[2] - 0.12 * s],
    {
      Hull: { rotation: dRotFinal },
      SiegeProngLR: { rotation: quatFromEulerDeg(-10, -9, 0) },
    },
    0.0,
  );

  sb.addAnimation('death', [
    {
      node: 'Hull',
      path: 'translation',
      times: [0, 0.30, 0.80, 1.45, 1.75, 2.0],
      values: [
        hullT,
        [hullT[0] - 0.08 * s, hullT[1] + 0.28 * s, hullT[2] + 0.06 * s],
        dPosMid,
        dPosImpact,
        dPosFinal,
        dPosFinal,
      ],
    },
    {
      node: 'Hull',
      path: 'rotation',
      times: [0, 0.30, 0.80, 1.45, 1.75, 2.0],
      values: [
        quatIdentity(),
        quatFromEulerDeg(+4, +3, +9),
        dRotMid,
        dRotImpact,
        dRotFinal,
        dRotFinal,
      ],
    },
    {
      node: 'LaserBatteryLeft',
      path: 'rotation',
      times: [0, 0.65, 1.45, 2.0],
      values: [
        quatIdentity(),
        quatFromEulerDeg(-6, +22, +8),
        quatFromEulerDeg(-10, +28, +10),
        quatFromEulerDeg(-10, +28, +10),
      ],
    },
    {
      node: 'LaserBatteryRight',
      path: 'rotation',
      times: [0, 0.55, 1.45, 2.0],
      values: [
        quatIdentity(),
        quatFromEulerDeg(-8, -18, -10),
        quatFromEulerDeg(-12, -25, -12),
        quatFromEulerDeg(-12, -25, -12),
      ],
    },
    {
      node: 'SiegeProngUL',
      path: 'rotation',
      times: [0, 0.70, 1.50, 2.0],
      values: [
        quatIdentity(),
        quatFromEulerDeg(+9, +8, 0),
        quatFromEulerDeg(+9, +8, 0),
        quatFromEulerDeg(+9, +8, 0),
      ],
    },
    {
      node: 'SiegeProngLR',
      path: 'rotation',
      times: [0, 0.70, 1.50, 2.0],
      values: [
        quatIdentity(),
        quatFromEulerDeg(-10, -9, 0),
        quatFromEulerDeg(-10, -9, 0),
        quatFromEulerDeg(-10, -9, 0),
      ],
    },
  ]);

  return sb;
}
