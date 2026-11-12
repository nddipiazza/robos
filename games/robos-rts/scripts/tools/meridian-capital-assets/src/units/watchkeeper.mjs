// Watchkeeper (watchkeeper.glb) — Meridian Guard Compact Support Aircraft
// Radius: 1.5625 | Y-up, floor 0, faces -Z
// Distinguishing silhouette: blunt sensor-canopy nose, underslung modular mission bay with clamshell doors,
// prominent flanking ducted turbofan engine shrouds, and asymmetric offset dorsal sensor dishes.

import { MAT } from '../materials.mjs';
import {
  TAU,
  quatFromAxisAngle,
  quatFromEulerDeg,
  quatIdentity,
} from '../math.mjs';
import {
  PrimBuilder,
  bevelBox,
  chinedSection,
  cylinderY,
  ductedShroudZ,
  extrudePolygonY,
  groundedTranslation,
  loftStations,
  mirrorPrimX,
  recessedTeamPlate,
  sensorDishY,
  transformPrim,
} from '../geom.mjs';
import { SceneBuilder } from '../glb-writer.mjs';

export const WATCHKEEPER_RADIUS = 1.5625;

export function buildWatchkeeperScene() {
  const sb = new SceneBuilder({
    unitId: 'watchkeeper',
    radius: WATCHKEEPER_RADIUS,
  });

  // Root node
  sb.addNode({ name: 'Root', translation: [0, 0, 0] });

  // Main Airframe body
  const hullPrims = [];
  const teamPrims = [];

  // 1. Blunt Observation Nose & Upper Avionics Fuselage Spine (z = -1.44 to +0.88)
  // Stepped utility AWACS nose with dielectric weather-radome tip and prominent panoramic sensor canopy!
  const fuselageStations = [
    chinedSection({ z: -1.36, yCenter: 0.43, halfHeight: 0.14, topHalfW: 0.24, midHalfW: 0.34, botHalfW: 0.24 }),
    chinedSection({ z: -1.16, yCenter: 0.46, halfHeight: 0.19, topHalfW: 0.36, midHalfW: 0.48, botHalfW: 0.36 }),
    chinedSection({ z: -0.82, yCenter: 0.58, halfHeight: 0.31, topHalfW: 0.46, midHalfW: 0.60, botHalfW: 0.48 }),
    chinedSection({ z: -0.15, yCenter: 0.62, halfHeight: 0.32, topHalfW: 0.48, midHalfW: 0.62, botHalfW: 0.52 }),
    chinedSection({ z: +0.52, yCenter: 0.62, halfHeight: 0.29, topHalfW: 0.43, midHalfW: 0.56, botHalfW: 0.44 }),
    chinedSection({ z: +0.88, yCenter: 0.64, halfHeight: 0.21, topHalfW: 0.32, midHalfW: 0.40, botHalfW: 0.28 }),
  ];
  hullPrims.push(loftStations(fuselageStations, MAT.ArmorSlate));

  // Blunt dielectric composite nose radome cap (classic recon/AWACS nose, never a fighter spike!)
  const noseRadome = [
    chinedSection({ z: -1.48, yCenter: 0.42, halfHeight: 0.09, topHalfW: 0.15, midHalfW: 0.22, botHalfW: 0.15 }),
    chinedSection({ z: -1.35, yCenter: 0.43, halfHeight: 0.145, topHalfW: 0.25, midHalfW: 0.35, botHalfW: 0.25 }),
  ];
  hullPrims.push(loftStations(noseRadome, MAT.RadomeComposite));

  // Bold Stepped Panoramic Cyan Observation Canopy (sits proudly above stepped nose!)
  const canopyStations = [
    chinedSection({ z: -1.20, yCenter: 0.61, halfHeight: 0.10, topHalfW: 0.28, midHalfW: 0.39, botHalfW: 0.36 }),
    chinedSection({ z: -0.96, yCenter: 0.72, halfHeight: 0.15, topHalfW: 0.35, midHalfW: 0.47, botHalfW: 0.44 }),
    chinedSection({ z: -0.72, yCenter: 0.76, halfHeight: 0.13, topHalfW: 0.32, midHalfW: 0.43, botHalfW: 0.40 }),
  ];
  hullPrims.push(loftStations(canopyStations, MAT.SensorCyan));
  // Canopy armored brow & center mullion strut
  hullPrims.push(
    transformPrim(bevelBox(0.66, 0.07, 0.42, 0.02, MAT.ArmorDark), {
      pos: [0, 0.87, -0.88],
      rotDeg: [6, 0, 0],
    }),
    transformPrim(bevelBox(0.055, 0.22, 0.48, 0.01, MAT.ArmorDark), {
      pos: [0, 0.73, -0.98],
      rotDeg: [22, 0, 0],
    }),
  );

  // Chin Electro-Optical FLIR Sensor Turret Ball + forward pulse designator nibs
  hullPrims.push(
    transformPrim(cylinderY(0.16, 0.13, 0.20, 12, MAT.ArmorDark), { pos: [0, 0.25, -1.12] }),
    transformPrim(cylinderY(0.10, 0.10, 0.12, 10, MAT.SensorCyan), {
      pos: [0, 0.23, -1.21],
      rotDeg: [90, 0, 0],
    }),
  );
  for (const sx of [-1, 1]) {
    hullPrims.push(
      transformPrim(bevelBox(0.11, 0.09, 0.22, 0.02, MAT.ArmorDark), {
        pos: [sx * 0.27, 0.42, -1.36],
      }),
      transformPrim(cylinderY(0.032, 0.038, 0.14, 8, MAT.SteelLight), {
        pos: [sx * 0.27, 0.42, -1.46],
        rotDeg: [90, 0, 0],
      }),
    );
  }

  // 2. Bulged Underslung Modular Mission Bay Housing (z = -0.72 to +0.68, y = 0.00 to 0.52)
  // Prominent boxy reconnaissance & drone-telemetry bay protruding cleanly on belly & lower flanks!
  hullPrims.push(
    transformPrim(bevelBox(1.30, 0.38, 1.36, 0.05, MAT.ArmorDark), {
      pos: [0, 0.33, -0.02],
    }),
    // Recessed dark ventral mission bay cavity + aft cargo ramp frame
    transformPrim(bevelBox(0.84, 0.18, 1.06, 0.02, MAT.HullObsidian), {
      pos: [0, 0.18, -0.02],
    }),
    transformPrim(bevelBox(0.76, 0.28, 0.12, 0.02, MAT.SteelLight), {
      pos: [0, 0.34, +0.66],
      rotDeg: [-18, 0, 0],
    }),
  );
  // Modular mission-pod external latch ribs & SLAR scanner blisters
  for (const sx of [-1, 1]) {
    hullPrims.push(
      // Grounded ventral landing-skid / mission-pod rails sitting cleanly on Y = 0.00
      transformPrim(bevelBox(0.14, 0.12, 1.22, 0.025, MAT.ArmorDark), {
        pos: [sx * 0.52, 0.06, -0.02],
      }),
      // Outward modular mission-bay structural ribs
      transformPrim(bevelBox(0.08, 0.32, 0.12, 0.015, MAT.SteelLight), {
        pos: [sx * 0.64, 0.33, -0.42],
      }),
      transformPrim(bevelBox(0.08, 0.32, 0.12, 0.015, MAT.SteelLight), {
        pos: [sx * 0.64, 0.33, +0.36],
      }),
      // Luminous cyan side-looking synthetic aperture radar (SLAR) array on mission bay chine
      transformPrim(bevelBox(0.06, 0.09, 0.62, 0.012, MAT.SensorCyan), {
        pos: [sx * 0.65, 0.32, -0.03],
      }),
    );
  }

  // Sturdy Shoulder Pylons connecting Fuselage to Prominent Outboard Engine Shrouds
  for (const sx of [-1, 1]) {
    hullPrims.push(
      transformPrim(bevelBox(0.56, 0.18, 0.56, 0.035, MAT.ArmorDark), {
        pos: [sx * 0.72, 0.64, +0.02],
        rotDeg: [0, 0, sx * -4],
      }),
      transformPrim(bevelBox(0.42, 0.09, 0.36, 0.02, MAT.SteelLight), {
        pos: [sx * 0.70, 0.74, +0.02],
      }),
    );
    // Recessed TeamColor shoulder plates on mission bay / pylon shoulders
    const shoulderPlate = recessedTeamPlate({
      width: 0.30,
      length: 0.76,
      frameHeight: 0.065,
      border: 0.045,
      plateThickness: 0.038,
      bezelMat: MAT.ArmorDark,
      floorMat: MAT.HullObsidian,
      teamMat: MAT.TeamColor,
      pos: [sx * 0.34, 0.88, -0.18],
      rotDeg: [0, 0, sx * -14],
    });
    hullPrims.push(...shoulderPlate.framePrims);
    teamPrims.push(shoulderPlate.teamPrim);
  }

  // Dorsal Spine Raised Avionics Deck + Recessed Central TeamColor Plate
  hullPrims.push(
    transformPrim(bevelBox(0.42, 0.12, 1.05, 0.03, MAT.ArmorDark), {
      pos: [0, 0.93, -0.02],
    }),
  );

  // 3. Twin Stubby H-Tail Booms & High Telemetry Stabilizer (z = +0.62 to +1.44)
  for (const sx of [-1, 1]) {
    hullPrims.push(
      transformPrim(bevelBox(0.15, 0.16, 0.82, 0.03, MAT.ArmorSlate), {
        pos: [sx * 0.46, 0.66, +1.04],
      }),
      // Upright beveled tailfin
      extrudePolygonY(
        [
          [-0.05, +0.98],
          [+0.05, +0.98],
          [+0.04, +1.45],
          [-0.04, +1.45],
        ],
        0.58,
        1.10,
        MAT.ArmorDark,
        { scaleTopZ: 0.72, offsetTopZ: +0.06 },
      ).clone(),
    );
    // Shift tailfin to sx * 0.46
    const lastFin = hullPrims.pop();
    hullPrims.push(transformPrim(lastFin, { pos: [sx * 0.46, 0, 0] }));

    // Tailfin TeamColor flash panel
    teamPrims.push(
      transformPrim(bevelBox(0.115, 0.24, 0.22, 0.015, MAT.TeamColor), {
        pos: [sx * 0.46, 0.90, +1.23],
      }),
    );
  }
  // High horizontal stabilizer bar bridging twin tailfins
  hullPrims.push(
    transformPrim(bevelBox(1.08, 0.08, 0.28, 0.02, MAT.SteelLight), {
      pos: [0, 1.06, +1.24],
    }),
  );

  // Offset dorsal sensor pylons mounted asymmetrically on the airframe!
  // Port-Aft heavy AWACS rotodome pylon (x = -0.44, z = +0.24)
  hullPrims.push(
    transformPrim(cylinderY(0.12, 0.17, 0.34, 10, MAT.ArmorDark, { smooth: false }), {
      pos: [-0.44, 1.02, +0.24],
      rotDeg: [0, 0, 8],
    }),
  );
  // Starboard-Forward comms/EW sensor mast (x = +0.48, z = -0.46)
  hullPrims.push(
    transformPrim(cylinderY(0.085, 0.12, 0.28, 10, MAT.ArmorDark, { smooth: false }), {
      pos: [+0.48, 0.94, -0.46],
      rotDeg: [0, 0, -10],
    }),
  );

  sb.addNode({
    name: 'Airframe',
    parent: 'Root',
    translation: [0, 0, 0],
    prims: hullPrims,
  });

  // Named TeamColor mesh node locked to Airframe
  sb.addNode({
    name: 'TeamColor',
    meshName: 'TeamColor',
    parent: 'Airframe',
    translation: [0, 0, 0],
    prims: teamPrims,
  });

  // 4. Prominent Flanking Ducted Engine Shrouds (Left & Right)
  function makeEngineShroud(sideSign) {
    const prims = [];
    // Thick armored octagonal/12-sided ducted shroud
    prims.push(
      ductedShroudZ({
        outerRFront: 0.43,
        outerRMid: 0.46,
        outerRBack: 0.40,
        innerR: 0.29,
        length: 1.04,
        lipDepth: 0.14,
        segments: 12,
        material: MAT.ArmorSlate,
        smooth: false,
      }),
    );
    // Bright steel forward intake collar ring
    prims.push(
      transformPrim(
        ductedShroudZ({
          outerRFront: 0.445,
          outerRMid: 0.45,
          outerRBack: 0.44,
          innerR: 0.285,
          length: 0.20,
          lipDepth: 0.06,
          segments: 12,
          material: MAT.SteelLight,
          smooth: false,
        }),
        { pos: [0, 0, -0.43] },
      ),
    );
    // Outer armored bumper rib + outboard winglet stub (not a weapon wing!)
    prims.push(
      transformPrim(bevelBox(0.14, 0.22, 0.78, 0.03, MAT.ArmorDark), {
        pos: [sideSign * 0.43, 0.0, +0.02],
      }),
      transformPrim(bevelBox(0.18, 0.07, 0.34, 0.02, MAT.SteelLight), {
        pos: [sideSign * 0.50, 0.06, +0.06],
        rotDeg: [0, 0, sideSign * 12],
      }),
    );
    // Dark internal turbine stator & glowing aft exhaust ring
    prims.push(
      transformPrim(cylinderY(0.28, 0.28, 0.55, 12, MAT.HullObsidian), {
        pos: [0, 0, +0.06],
        rotDeg: [90, 0, 0],
      }),
      transformPrim(cylinderY(0.22, 0.16, 0.22, 12, MAT.ThrusterAmber), {
        pos: [0, 0, +0.42],
        rotDeg: [90, 0, 0],
      }),
    );
    return prims;
  }

  function makeFanRotor() {
    const prims = [
      transformPrim(cylinderY(0.09, 0.11, 0.18, 10, MAT.SteelLight), {
        pos: [0, 0, 0],
        rotDeg: [90, 0, 0],
      }),
      transformPrim(cylinderY(0.05, 0.05, 0.20, 8, MAT.SensorCyan), {
        pos: [0, 0, -0.02],
        rotDeg: [90, 0, 0],
      }),
    ];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 360;
      const blade = transformPrim(bevelBox(0.25, 0.03, 0.08, 0.008, MAT.SteelLight), {
        pos: [0.14, 0, 0],
        rotDeg: [28, 0, 0],
      });
      prims.push(transformPrim(blade, { rotDeg: [0, 0, a] }));
    }
    return prims;
  }

  for (const [sideSign, sideName] of [[-1, 'Left'], [1, 'Right']]) {
    const shroudNodeName = `EngineShroud${sideName}`;
    sb.addNode({
      name: shroudNodeName,
      parent: 'Airframe',
      translation: [sideSign * 1.05, 0.62, +0.02],
      prims: makeEngineShroud(sideSign),
    });
    // TeamColor band on outer engine shroud
    sb.addNode({
      name: `TeamColor_Shroud${sideName}`,
      meshName: `TeamColor_Shroud${sideName}`,
      parent: shroudNodeName,
      translation: [sideSign * 0.45, 0.12, -0.06],
      prims: [bevelBox(0.08, 0.11, 0.56, 0.015, MAT.TeamColor)],
    });
    // Spinning intake fan rotor
    sb.addNode({
      name: `FanRotor${sideName}`,
      parent: shroudNodeName,
      translation: [0, 0, -0.26],
      prims: makeFanRotor(),
    });
  }

  // 5. Offset Dorsal Sensor Dishes!
  // 5a. Large Port-Aft AWACS Rotodome Dish (x = -0.46, y = 1.22, z = +0.24)
  const awacsPrims = [
    ...sensorDishY({
      radius: 0.56,
      thickness: 0.14,
      rimWidth: 0.08,
      dishDepth: 0.09,
      segments: 20,
      dishMat: MAT.RadomeComposite,
      rimMat: MAT.SteelLight,
      coreMat: MAT.SensorCyan,
    }),
    // Phased-array dark spine across the AWACS rotodome
    transformPrim(bevelBox(1.06, 0.07, 0.16, 0.02, MAT.ArmorDark), {
      pos: [0, 0.075, 0],
    }),
  ];
  sb.addNode({
    name: 'DishPrimary',
    parent: 'Airframe',
    translation: [-0.46, 1.22, +0.24],
    rotation: quatFromEulerDeg(0, 0, 4),
    prims: awacsPrims,
  });
  sb.addNode({
    name: 'TeamColor_Dish',
    meshName: 'TeamColor_Dish',
    parent: 'DishPrimary',
    translation: [0, 0.088, 0.16],
    prims: [bevelBox(0.76, 0.05, 0.11, 0.012, MAT.TeamColor)],
  });

  // 5b. Smaller Starboard-Forward High-Gain Parabolic Dish (x = +0.50, y = 1.12, z = -0.46)
  const secondaryDishPrims = [
    ...sensorDishY({
      radius: 0.33,
      thickness: 0.11,
      rimWidth: 0.06,
      dishDepth: 0.10,
      segments: 16,
      dishMat: MAT.RadomeComposite,
      rimMat: MAT.SteelLight,
      coreMat: MAT.SensorCyan,
    }),
    // Counterweight EW transceiver box behind dish
    transformPrim(bevelBox(0.18, 0.12, 0.20, 0.02, MAT.ArmorDark), {
      pos: [0, -0.09, +0.06],
    }),
  ];
  sb.addNode({
    name: 'DishSecondary',
    parent: 'Airframe',
    translation: [+0.50, 1.12, -0.46],
    rotation: quatFromEulerDeg(-28, -16, -8),
    prims: secondaryDishPrims,
  });

  // 6. Articulated Clamshell Mission Bay Doors & Deployable Telemetry Beacon
  for (const [sx, side] of [[-1, 'Left'], [1, 'Right']]) {
    const doorGeom = [
      transformPrim(bevelBox(0.34, 0.055, 0.92, 0.015, MAT.ArmorSlate), {
        pos: [-sx * 0.16, -0.04, 0],
        rotDeg: [0, 0, sx * 10],
      }),
      transformPrim(bevelBox(0.08, 0.04, 0.74, 0.01, MAT.SteelLight), {
        pos: [-sx * 0.28, -0.06, 0],
      }),
    ];
    sb.addNode({
      name: `BayDoor${side}`,
      parent: 'Airframe',
      translation: [sx * 0.38, 0.16, -0.04],
      prims: doorGeom,
    });
  }

  sb.addNode({
    name: 'MissionBeacon',
    parent: 'Airframe',
    translation: [0, 0.22, -0.04],
    prims: [
      cylinderY(0.14, 0.16, 0.16, 12, MAT.SteelLight),
      transformPrim(cylinderY(0.11, 0.08, 0.14, 12, MAT.SiegePlasma), { pos: [0, -0.10, 0] }),
    ],
  });

  // 7. Required Muzzle Anchors (facing -Z)
  sb.addNode({
    name: 'Muzzle',
    parent: 'Airframe',
    translation: [0, 0.25, -1.30],
  });
  sb.addNode({
    name: 'MuzzleLeft',
    parent: 'Airframe',
    translation: [-0.27, 0.42, -1.53],
  });
  sb.addNode({
    name: 'MuzzleRight',
    parent: 'Airframe',
    translation: [+0.27, 0.42, -1.53],
  });

  // Calibrate exact radius 1.5625 and floor Y = 0.000000
  const s = sb.calibrate(0.992);

  // Grab calibrated rest translations & rotations for animation tracks
  const airT = sb.getNode('Airframe').translation.slice();
  const beaconT = sb.getNode('MissionBeacon').translation.slice();
  const dish1R = sb.getNode('DishPrimary').rotation.slice();
  const dish2R = sb.getNode('DishSecondary').rotation.slice();

  const spinYSteps = (baseQ, turns, times) =>
    times.map((t, idx) => {
      const frac = idx / (times.length - 1);
      const spin = quatFromAxisAngle([0, 1, 0], frac * turns * TAU);
      // Local spin around dish's own +Y axis: baseQ * spin
      const [ax, ay, az, aw] = baseQ;
      const [bx, by, bz, bw] = spin;
      return [
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
      ];
    });

  const spinZSteps = (turns, times) =>
    times.map((_, idx) => {
      const frac = idx / (times.length - 1);
      return quatFromAxisAngle([0, 0, 1], frac * turns * TAU);
    });

  // Clip 1: idle (2.4s seamless airborne station-keeping + AWACS radar sweep)
  const idleTimes9 = Array.from({ length: 9 }, (_, i) => (i / 8) * 2.4);
  sb.addAnimation('idle', [
    {
      node: 'Airframe',
      path: 'translation',
      times: [0, 0.6, 1.2, 1.8, 2.4],
      values: [
        [airT[0], airT[1], airT[2]],
        [airT[0], airT[1] + 0.06 * s, airT[2]],
        [airT[0], airT[1] + 0.11 * s, airT[2]],
        [airT[0], airT[1] + 0.05 * s, airT[2]],
        [airT[0], airT[1], airT[2]],
      ],
    },
    {
      node: 'Airframe',
      path: 'rotation',
      times: [0, 0.6, 1.2, 1.8, 2.4],
      values: [
        quatIdentity(),
        quatFromEulerDeg(0.8, 0, 1.6),
        quatFromEulerDeg(0.0, 0, 0.0),
        quatFromEulerDeg(-0.8, 0, -1.6),
        quatIdentity(),
      ],
    },
    {
      node: 'DishPrimary',
      path: 'rotation',
      times: idleTimes9,
      values: spinYSteps(dish1R, 1, idleTimes9),
    },
    {
      node: 'DishSecondary',
      path: 'rotation',
      times: [0, 0.6, 1.2, 1.8, 2.4],
      values: [
        dish2R,
        quatFromEulerDeg(-26, +4, -8),
        dish2R,
        quatFromEulerDeg(-30, -32, -8),
        dish2R,
      ],
    },
    {
      node: 'FanRotorLeft',
      path: 'rotation',
      times: idleTimes9,
      values: spinZSteps(1, idleTimes9),
    },
    {
      node: 'FanRotorRight',
      path: 'rotation',
      times: idleTimes9,
      values: spinZSteps(-1, idleTimes9),
    },
  ]);

  // Clip 2: hover (1.6s brisker flight hover + shroud pitch vectoring + twin fan spin)
  const hoverTimes9 = Array.from({ length: 9 }, (_, i) => (i / 8) * 1.6);
  sb.addAnimation('hover', [
    {
      node: 'Airframe',
      path: 'translation',
      times: [0, 0.4, 0.8, 1.2, 1.6],
      values: [
        [airT[0], airT[1] + 0.08 * s, airT[2]],
        [airT[0] - 0.03 * s, airT[1] + 0.17 * s, airT[2] - 0.02 * s],
        [airT[0], airT[1] + 0.10 * s, airT[2]],
        [airT[0] + 0.03 * s, airT[1] + 0.18 * s, airT[2] + 0.02 * s],
        [airT[0], airT[1] + 0.08 * s, airT[2]],
      ],
    },
    {
      node: 'Airframe',
      path: 'rotation',
      times: [0, 0.4, 0.8, 1.2, 1.6],
      values: [
        quatFromEulerDeg(-1.5, 0, 0),
        quatFromEulerDeg(-2.5, 1.2, 3.2),
        quatFromEulerDeg(-1.0, 0, 0),
        quatFromEulerDeg(-2.5, -1.2, -3.2),
        quatFromEulerDeg(-1.5, 0, 0),
      ],
    },
    {
      node: 'EngineShroudLeft',
      path: 'rotation',
      times: [0, 0.4, 0.8, 1.2, 1.6],
      values: [
        quatIdentity(),
        quatFromEulerDeg(5, 0, 0),
        quatIdentity(),
        quatFromEulerDeg(-4, 0, 0),
        quatIdentity(),
      ],
    },
    {
      node: 'EngineShroudRight',
      path: 'rotation',
      times: [0, 0.4, 0.8, 1.2, 1.6],
      values: [
        quatIdentity(),
        quatFromEulerDeg(-4, 0, 0),
        quatIdentity(),
        quatFromEulerDeg(5, 0, 0),
        quatIdentity(),
      ],
    },
    {
      node: 'DishPrimary',
      path: 'rotation',
      times: hoverTimes9,
      values: spinYSteps(dish1R, 1, hoverTimes9),
    },
    {
      node: 'FanRotorLeft',
      path: 'rotation',
      times: hoverTimes9,
      values: spinZSteps(1, hoverTimes9),
    },
    {
      node: 'FanRotorRight',
      path: 'rotation',
      times: hoverTimes9,
      values: spinZSteps(-1, hoverTimes9),
    },
  ]);

  // Clip 3: attack (0.85s nose designator / point-defense pulse burst & snap-lock)
  sb.addAnimation('attack', [
    {
      node: 'Airframe',
      path: 'translation',
      times: [0, 0.12, 0.28, 0.58, 0.85],
      values: [
        [airT[0], airT[1], airT[2]],
        [airT[0], airT[1] + 0.08 * s, airT[2] + 0.12 * s],
        [airT[0], airT[1] + 0.10 * s, airT[2] + 0.16 * s],
        [airT[0], airT[1] + 0.04 * s, airT[2] + 0.04 * s],
        [airT[0], airT[1], airT[2]],
      ],
    },
    {
      node: 'Airframe',
      path: 'rotation',
      times: [0, 0.12, 0.28, 0.58, 0.85],
      values: [
        quatIdentity(),
        quatFromEulerDeg(4.2, 0, 0),
        quatFromEulerDeg(-3.0, 0, 0),
        quatFromEulerDeg(1.2, 0, 0),
        quatIdentity(),
      ],
    },
    {
      node: 'DishSecondary',
      path: 'rotation',
      times: [0, 0.10, 0.45, 0.85],
      values: [
        dish2R,
        quatFromEulerDeg(-34, 0, 0), // snap-tracks forward -Z target
        quatFromEulerDeg(-34, 0, 0),
        dish2R,
      ],
    },
  ]);

  // Clip 4: cast (1.8s Mission Bay Clamshell Doors Open + Telemetry Beacon Pulse + Rapid Dish Sweep)
  const castTimes9 = Array.from({ length: 9 }, (_, i) => (i / 8) * 1.8);
  sb.addAnimation('cast', [
    {
      node: 'Airframe',
      path: 'translation',
      times: [0, 0.35, 0.90, 1.45, 1.8],
      values: [
        [airT[0], airT[1], airT[2]],
        [airT[0], airT[1] + 0.24 * s, airT[2]],
        [airT[0], airT[1] + 0.28 * s, airT[2]],
        [airT[0], airT[1] + 0.20 * s, airT[2]],
        [airT[0], airT[1], airT[2]],
      ],
    },
    {
      node: 'Airframe',
      path: 'rotation',
      times: [0, 0.35, 0.90, 1.45, 1.8],
      values: [
        quatIdentity(),
        quatFromEulerDeg(4.5, 0, 0),
        quatFromEulerDeg(2.0, 0, 0),
        quatFromEulerDeg(3.0, 0, 0),
        quatIdentity(),
      ],
    },
    {
      node: 'BayDoorLeft',
      path: 'rotation',
      times: [0, 0.30, 1.35, 1.8],
      values: [
        quatIdentity(),
        quatFromEulerDeg(0, 0, -58),
        quatFromEulerDeg(0, 0, -58),
        quatIdentity(),
      ],
    },
    {
      node: 'BayDoorRight',
      path: 'rotation',
      times: [0, 0.30, 1.35, 1.8],
      values: [
        quatIdentity(),
        quatFromEulerDeg(0, 0, +58),
        quatFromEulerDeg(0, 0, +58),
        quatIdentity(),
      ],
    },
    {
      node: 'MissionBeacon',
      path: 'translation',
      times: [0, 0.35, 0.90, 1.35, 1.8],
      values: [
        beaconT,
        [beaconT[0], beaconT[1] - 0.16 * s, beaconT[2]],
        [beaconT[0], beaconT[1] - 0.20 * s, beaconT[2]],
        [beaconT[0], beaconT[1] - 0.14 * s, beaconT[2]],
        beaconT,
      ],
    },
    {
      node: 'MissionBeacon',
      path: 'scale',
      times: [0, 0.45, 0.90, 1.35, 1.8],
      values: [
        [1, 1, 1],
        [1.18, 1.18, 1.18],
        [1.30, 1.30, 1.30],
        [1.12, 1.12, 1.12],
        [1, 1, 1],
      ],
    },
    {
      node: 'DishPrimary',
      path: 'rotation',
      times: castTimes9,
      values: spinYSteps(dish1R, 2, castTimes9),
    },
  ]);

  // Clip 5: death (1.5s shroud stall, bank/roll shudder, crash settle onto Y = 0 floor without clipping below)
  const deathRotMid = quatFromEulerDeg(-7, -8, -19);
  const deathRotImpact = quatFromEulerDeg(-8, -14, -18);
  const deathRotFinal = quatFromEulerDeg(-6, -15, -16);
  const deathShroudMid = quatFromEulerDeg(-18, 0, -8);
  const deathShroudFinal = quatFromEulerDeg(-26, 0, -10);
  const deathDishFinal = quatFromEulerDeg(14, 110, 16);

  const deathPosMid = groundedTranslation(
    sb,
    'Airframe',
    [airT[0] + 0.08 * s, airT[1], airT[2] - 0.06 * s],
    {
      Airframe: { rotation: deathRotMid },
      EngineShroudRight: { rotation: deathShroudMid },
    },
    0.10 * s,
  );
  const deathPosImpact = groundedTranslation(
    sb,
    'Airframe',
    [airT[0] + 0.10 * s, airT[1], airT[2] - 0.10 * s],
    {
      Airframe: { rotation: deathRotImpact },
      EngineShroudRight: { rotation: deathShroudFinal },
      DishPrimary: { rotation: deathDishFinal },
    },
    0.002,
  );
  const deathPosFinal = groundedTranslation(
    sb,
    'Airframe',
    [airT[0] + 0.10 * s, airT[1], airT[2] - 0.10 * s],
    {
      Airframe: { rotation: deathRotFinal },
      EngineShroudRight: { rotation: deathShroudFinal },
      DishPrimary: { rotation: deathDishFinal },
    },
    0.0,
  );

  sb.addAnimation('death', [
    {
      node: 'Airframe',
      path: 'translation',
      times: [0, 0.22, 0.55, 1.05, 1.30, 1.5],
      values: [
        [airT[0], airT[1], airT[2]],
        [airT[0] - 0.05 * s, airT[1] + 0.18 * s, airT[2] + 0.05 * s],
        deathPosMid,
        deathPosImpact,
        deathPosFinal,
        deathPosFinal,
      ],
    },
    {
      node: 'Airframe',
      path: 'rotation',
      times: [0, 0.22, 0.55, 1.05, 1.30, 1.5],
      values: [
        quatIdentity(),
        quatFromEulerDeg(5, 4, 12),
        deathRotMid,
        deathRotImpact,
        deathRotFinal,
        deathRotFinal,
      ],
    },
    {
      node: 'EngineShroudRight',
      path: 'rotation',
      times: [0, 0.35, 1.05, 1.5],
      values: [
        quatIdentity(),
        deathShroudMid,
        deathShroudFinal,
        deathShroudFinal,
      ],
    },
    {
      node: 'DishPrimary',
      path: 'rotation',
      times: [0, 0.45, 1.15, 1.5],
      values: [
        dish1R,
        quatFromEulerDeg(10, 65, 14),
        deathDishFinal,
        deathDishFinal,
      ],
    },
  ]);

  return sb;
}
