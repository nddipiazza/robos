// Bastion Turret (bastion_turret.glb) — Meridian Guard Temporary Squat Deployed Two-Barrel Rail Turret
// Radius: 2.03125 | Y-up, floor 0, faces -Z
// Distinguishing silhouette: wide X-stance low outrigger legs with ground-spade claws, low-slung armored
// casemate with recessed blue TeamColor cheek plates, flanking capacitor banks, and twin parallel slotted railguns.

import { MAT } from '../materials.mjs';
import {
  quatFromEulerDeg,
  quatIdentity,
} from '../math.mjs';
import {
  bevelBox,
  chinedSection,
  cylinderY,
  groundedTranslation,
  loftStations,
  recessedTeamPlate,
  transformPrim,
} from '../geom.mjs';
import { SceneBuilder } from '../glb-writer.mjs';

export const BASTION_TURRET_RADIUS = 2.03125;

export function buildBastionTurretScene() {
  const sb = new SceneBuilder({
    unitId: 'bastion_turret',
    radius: BASTION_TURRET_RADIUS,
  });

  sb.addNode({ name: 'Root', translation: [0, 0, 0] });

  // 1. Low Drop-Pod Base Chassis & Toothed Slewing Ring (squat height: y = 0.08 to 0.50)
  const basePrims = [
    // Heavy octagonal armored drop-base hub (sits just above ground on 4 outrigger legs)
    transformPrim(cylinderY(0.96, 1.08, 0.30, 8, MAT.ArmorDark, { smooth: false }), {
      pos: [0, 0.23, 0],
    }),
    // Recessed dark under-skirt
    transformPrim(cylinderY(0.84, 0.78, 0.10, 8, MAT.HullObsidian, { smooth: false }), {
      pos: [0, 0.09, 0],
    }),
    // Steel slewing bearing ring
    transformPrim(cylinderY(0.90, 0.94, 0.12, 16, MAT.SteelLight, { smooth: false }), {
      pos: [0, 0.43, 0],
    }),
  ];
  // 4 corner leg-hinge clevises on BaseChassis
  for (const angleDeg of [45, 135, 225, 315]) {
    basePrims.push(
      transformPrim(
        transformPrim(bevelBox(0.36, 0.24, 0.34, 0.03, MAT.ArmorSlate), { pos: [0, 0.24, -0.92] }),
        { rotDeg: [0, angleDeg, 0] },
      ),
    );
  }

  sb.addNode({
    name: 'BaseChassis',
    parent: 'Root',
    translation: [0, 0, 0],
    prims: basePrims,
  });

  // 2. Four Low Squat Deployed Outrigger Legs at 45 deg diagonals (LegFL, LegFR, LegRL, LegRR)
  // Built in local -Z outward space then placed/rotated to each diagonal corner!
  function buildOutriggerLeg() {
    const legPrims = [
      // Heavy sloped low thigh beam extending outward from hinge (0,0,0) to (0, -0.18, -0.92)
      transformPrim(bevelBox(0.32, 0.20, 0.96, 0.035, MAT.ArmorDark), {
        pos: [0, -0.07, -0.46],
        rotDeg: [-11, 0, 0],
      }),
      // Upper bright steel hydraulic locking piston
      transformPrim(cylinderY(0.055, 0.065, 0.72, 8, MAT.SteelLight, { smooth: false }), {
        pos: [0, +0.06, -0.40],
        rotDeg: [76, 0, 0],
      }),
      // Wide ground-hugging anchor footpad + spade claws resting flat at local y = -0.24 (world Y = 0.00!)
      transformPrim(bevelBox(0.56, 0.11, 0.56, 0.025, MAT.ArmorSlate), {
        pos: [0, -0.185, -0.88],
      }),
      transformPrim(bevelBox(0.62, 0.06, 0.62, 0.015, MAT.HullObsidian), {
        pos: [0, -0.21, -0.90],
      }),
      // Outer anchor claw teeth gripping the ground
      transformPrim(bevelBox(0.16, 0.12, 0.22, 0.02, MAT.SteelLight), {
        pos: [-0.17, -0.18, -1.12],
        rotDeg: [-18, 0, 0],
      }),
      transformPrim(bevelBox(0.16, 0.12, 0.22, 0.02, MAT.SteelLight), {
        pos: [+0.17, -0.18, -1.12],
        rotDeg: [-18, 0, 0],
      }),
      // Amber deployment lock indicator strip
      transformPrim(bevelBox(0.22, 0.05, 0.08, 0.01, MAT.ThrusterAmber), {
        pos: [0, -0.11, -0.96],
      }),
    ];

    const legTeam = transformPrim(bevelBox(0.22, 0.055, 0.44, 0.012, MAT.TeamColor), {
      pos: [0, +0.04, -0.52],
      rotDeg: [-11, 0, 0],
    });

    return { legPrims, legTeam };
  }

  const legConfigs = [
    { name: 'LegFL', yaw: +42 },  // Front-Left (-X, -Z)
    { name: 'LegFR', yaw: -42 },  // Front-Right (+X, -Z)
    { name: 'LegRL', yaw: +138 }, // Rear-Left (-X, +Z)
    { name: 'LegRR', yaw: -138 }, // Rear-Right (+X, +Z)
  ];

  for (const cfg of legConfigs) {
    const { legPrims, legTeam } = buildOutriggerLeg();
    const rad = (cfg.yaw * Math.PI) / 180;
    // Local -Z rotated by yaw around +Y goes to (-sin(yaw), 0, -cos(yaw))
    const hx = -Math.sin(rad) * 0.78;
    const hz = -Math.cos(rad) * 0.78;
    sb.addNode({
      name: cfg.name,
      parent: 'BaseChassis',
      translation: [hx, 0.24, hz],
      rotation: quatFromEulerDeg(0, cfg.yaw, 0),
      prims: legPrims,
    });
    sb.addNode({
      name: `TeamColor_${cfg.name}`,
      meshName: `TeamColor_${cfg.name}`,
      parent: cfg.name,
      translation: [0, 0, 0],
      prims: [legTeam],
    });
  }

  // 3. Squat Rotating Armored Turret Carapace (TurretYaw: y = 0.48 to 1.24)
  const turretPrims = [];
  const turretTeamPrims = [];

  // Wide sloped wedge casemate hull
  const turretStations = [
    chinedSection({ z: -0.78, yCenter: 0.34, halfHeight: 0.22, topHalfW: 0.56, midHalfW: 0.78, botHalfW: 0.68 }),
    chinedSection({ z: -0.20, yCenter: 0.38, halfHeight: 0.30, topHalfW: 0.72, midHalfW: 0.96, botHalfW: 0.86 }),
    chinedSection({ z: +0.58, yCenter: 0.40, halfHeight: 0.31, topHalfW: 0.68, midHalfW: 0.92, botHalfW: 0.82 }),
    chinedSection({ z: +1.18, yCenter: 0.38, halfHeight: 0.25, topHalfW: 0.52, midHalfW: 0.72, botHalfW: 0.62 }),
  ];
  turretPrims.push(loftStations(turretStations, MAT.ArmorSlate));

  // Center gun-slot recess in frontal glacis
  turretPrims.push(
    transformPrim(bevelBox(1.18, 0.34, 0.48, 0.03, MAT.HullObsidian), {
      pos: [0, 0.38, -0.62],
    }),
  );

  // Flanking Heavy Rail-Capacitor Banks (left & right cheeks) + Recessed TeamColor Armor Plates!
  for (const sx of [-1, 1]) {
    turretPrims.push(
      transformPrim(bevelBox(0.38, 0.38, 1.22, 0.045, MAT.ArmorDark), {
        pos: [sx * 0.98, 0.34, +0.16],
      }),
      // Glowing cyan magnetic capacitor coils visible from top/side RTS angle!
      transformPrim(bevelBox(0.18, 0.12, 0.14, 0.015, MAT.SensorCyan), {
        pos: [sx * 1.04, 0.52, -0.18],
      }),
      transformPrim(bevelBox(0.18, 0.12, 0.14, 0.015, MAT.SensorCyan), {
        pos: [sx * 1.04, 0.52, +0.12],
      }),
      transformPrim(bevelBox(0.18, 0.12, 0.14, 0.015, MAT.SensorCyan), {
        pos: [sx * 1.04, 0.52, +0.42],
      }),
    );

    // Prominent recessed blue TeamColor plate on each sloped dorsal turret cheek!
    const cheekPlate = recessedTeamPlate({
      width: 0.40,
      length: 0.98,
      frameHeight: 0.075,
      border: 0.055,
      plateThickness: 0.044,
      bezelMat: MAT.ArmorDark,
      floorMat: MAT.HullObsidian,
      teamMat: MAT.TeamColor,
      pos: [sx * 0.56, 0.68, +0.18],
      rotDeg: [0, 0, sx * -8],
    });
    turretPrims.push(...cheekPlate.framePrims);
    turretTeamPrims.push(cheekPlate.teamPrim);
  }

  // Rear Temporary Field-Battery Power Pack + Short Autonomous Transponder Mast
  turretPrims.push(
    transformPrim(bevelBox(0.92, 0.36, 0.42, 0.04, MAT.ArmorDark), {
      pos: [0, 0.38, +1.28],
    }),
    transformPrim(bevelBox(0.58, 0.14, 0.10, 0.015, MAT.ThrusterAmber), {
      pos: [0, 0.42, +1.49],
    }),
    // Compact target-acquisition optic pod on front-left roof + rugged field antenna on rear-right
    transformPrim(bevelBox(0.28, 0.18, 0.32, 0.025, MAT.ArmorDark), {
      pos: [-0.24, 0.78, -0.24],
    }),
    transformPrim(bevelBox(0.20, 0.10, 0.08, 0.01, MAT.SensorCyan), {
      pos: [-0.24, 0.79, -0.40],
    }),
    transformPrim(cylinderY(0.035, 0.055, 0.44, 8, MAT.SteelLight, { smooth: false }), {
      pos: [+0.36, 0.88, +0.76],
    }),
    transformPrim(cylinderY(0.065, 0.065, 0.09, 8, MAT.SensorCyan), {
      pos: [+0.36, 1.11, +0.76],
    }),
  );

  sb.addNode({
    name: 'TurretYaw',
    parent: 'BaseChassis',
    translation: [0, 0.39, 0],
    prims: turretPrims,
  });

  // Primary named TeamColor mesh node on TurretYaw!
  sb.addNode({
    name: 'TeamColor',
    meshName: 'TeamColor',
    parent: 'TurretYaw',
    translation: [0, 0, 0],
    prims: turretTeamPrims,
  });

  // Dorsal Overcharge Capacitor Cooling Hood (opens during cast!)
  sb.addNode({
    name: 'CapacitorHood',
    parent: 'TurretYaw',
    translation: [0, 0.70, +0.58],
    prims: [
      transformPrim(bevelBox(0.62, 0.10, 0.68, 0.025, MAT.SteelLight), {
        pos: [0, 0.03, -0.28],
      }),
      transformPrim(bevelBox(0.46, 0.06, 0.48, 0.015, MAT.SiegePlasma), {
        pos: [0, -0.02, -0.28],
      }),
    ],
  });

  // 4. Elevating Gun Cradle & Twin Heavy Slotted Railgun Barrels (GunPitch -> BarrelLeft, BarrelRight)
  sb.addNode({
    name: 'GunPitch',
    parent: 'TurretYaw',
    translation: [0, 0.40, -0.38],
    prims: [
      // Central heavy armored trunnion mantlet
      bevelBox(1.24, 0.28, 0.42, 0.035, MAT.ArmorDark),
      transformPrim(cylinderY(0.14, 0.14, 1.32, 12, MAT.SteelLight), {
        pos: [0, 0, 0],
        rotDeg: [0, 0, 90],
      }),
    ],
  });

  function buildRailBarrel() {
    const prims = [
      // Heavy rectangular armored breech jacket (z = +0.05 to -0.45)
      transformPrim(bevelBox(0.32, 0.28, 0.56, 0.03, MAT.ArmorDark), {
        pos: [0, 0, -0.18],
      }),
      // Upper electromagnetic rail conductor bar (z = -0.40 to -1.58)
      transformPrim(bevelBox(0.24, 0.09, 1.24, 0.018, MAT.ArmorSlate), {
        pos: [0, +0.082, -0.98],
      }),
      // Dorsal bright steel busbar + top plasma rail slot so both railguns pop from -56 deg RTS camera!
      transformPrim(bevelBox(0.18, 0.032, 1.18, 0.008, MAT.SteelLight), {
        pos: [0, +0.132, -0.96],
      }),
      transformPrim(bevelBox(0.075, 0.042, 1.14, 0.006, MAT.SensorCyan), {
        pos: [0, +0.136, -0.96],
      }),
      // Lower electromagnetic rail conductor bar
      transformPrim(bevelBox(0.24, 0.09, 1.24, 0.018, MAT.ArmorSlate), {
        pos: [0, -0.082, -0.98],
      }),
      // Inner bright steel rail contact strips
      transformPrim(bevelBox(0.18, 0.028, 1.22, 0.006, MAT.SteelLight), {
        pos: [0, +0.034, -0.98],
      }),
      transformPrim(bevelBox(0.18, 0.028, 1.22, 0.006, MAT.SteelLight), {
        pos: [0, -0.034, -0.98],
      }),
      // Luminous cyan plasma-armature accelerator core running down center of rail slot!
      transformPrim(bevelBox(0.13, 0.052, 1.20, 0.008, MAT.SensorCyan), {
        pos: [0, 0, -0.98],
      }),
    ];
    // 3 chunky dark magnetic rail-clamping yokes + heavy muzzle brake at -Z tip
    for (const zClamp of [-0.62, -0.98, -1.32]) {
      prims.push(
        transformPrim(bevelBox(0.28, 0.24, 0.10, 0.02, MAT.ArmorDark), {
          pos: [0, 0, zClamp],
        }),
      );
    }
    // Boxy railgun muzzle brake at tip (-1.54)
    prims.push(
      transformPrim(bevelBox(0.30, 0.25, 0.16, 0.022, MAT.SteelLight), {
        pos: [0, 0, -1.52],
      }),
      transformPrim(bevelBox(0.14, 0.10, 0.06, 0.01, MAT.SiegePlasma), {
        pos: [0, 0, -1.60],
      }),
    );
    return prims;
  }

  sb.addNode({
    name: 'BarrelLeft',
    parent: 'GunPitch',
    translation: [-0.46, 0, 0],
    prims: buildRailBarrel(),
  });
  sb.addNode({
    name: 'BarrelRight',
    parent: 'GunPitch',
    translation: [+0.46, 0, 0],
    prims: buildRailBarrel(),
  });

  // 5. Required Muzzle Anchors (facing -Z)
  sb.addNode({
    name: 'MuzzleLeft',
    parent: 'BarrelLeft',
    translation: [0, 0, -1.63],
  });
  sb.addNode({
    name: 'MuzzleRight',
    parent: 'BarrelRight',
    translation: [0, 0, -1.63],
  });
  sb.addNode({
    name: 'Muzzle',
    parent: 'GunPitch',
    translation: [0, 0, -1.63],
  });

  // Calibrate exact radius 2.03125 and floor Y = 0.000000
  const s = sb.calibrate(0.992);

  const baseT = sb.getNode('BaseChassis').translation.slice();
  const bLeftT = sb.getNode('BarrelLeft').translation.slice();
  const bRightT = sb.getNode('BarrelRight').translation.slice();
  const legRots = Object.fromEntries(
    legConfigs.map((c) => [c.name, sb.getNode(c.name).rotation.slice()]),
  );

  // Clip 1: idle (2.6s watchful sentry turret scan)
  sb.addAnimation('idle', [
    {
      node: 'TurretYaw',
      path: 'rotation',
      times: [0, 0.65, 1.0, 1.75, 2.1, 2.6],
      values: [
        quatIdentity(),
        quatFromEulerDeg(0, +13, 0),
        quatFromEulerDeg(0, +13, 0),
        quatFromEulerDeg(0, -13, 0),
        quatFromEulerDeg(0, -13, 0),
        quatIdentity(),
      ],
    },
    {
      node: 'GunPitch',
      path: 'rotation',
      times: [0, 0.65, 1.3, 1.95, 2.6],
      values: [
        quatIdentity(),
        quatFromEulerDeg(+2.2, 0, 0),
        quatIdentity(),
        quatFromEulerDeg(+1.8, 0, 0),
        quatIdentity(),
      ],
    },
  ]);

  // Clip 2: attack (0.90s heavy staggered Left-Right twin railgun recoil salvo + suspension kick)
  sb.addAnimation('attack', [
    {
      node: 'BarrelLeft',
      path: 'translation',
      times: [0, 0.07, 0.22, 0.58, 0.90],
      values: [
        bLeftT,
        [bLeftT[0], bLeftT[1], bLeftT[2] + 0.36 * s], // crisp backward +Z rail recoil!
        [bLeftT[0], bLeftT[1], bLeftT[2] + 0.22 * s],
        [bLeftT[0], bLeftT[1], bLeftT[2] + 0.04 * s],
        bLeftT,
      ],
    },
    {
      node: 'BarrelRight',
      path: 'translation',
      times: [0, 0.20, 0.28, 0.46, 0.90],
      values: [
        bRightT,
        bRightT,
        [bRightT[0], bRightT[1], bRightT[2] + 0.36 * s], // second barrel fires right after!
        [bRightT[0], bRightT[1], bRightT[2] + 0.18 * s],
        bRightT,
      ],
    },
    {
      node: 'GunPitch',
      path: 'rotation',
      times: [0, 0.08, 0.20, 0.29, 0.62, 0.90],
      values: [
        quatIdentity(),
        quatFromEulerDeg(+4.0, 0, 0),
        quatFromEulerDeg(+1.2, 0, 0),
        quatFromEulerDeg(+4.6, 0, 0),
        quatFromEulerDeg(+0.8, 0, 0),
        quatIdentity(),
      ],
    },
    {
      node: 'TurretYaw',
      path: 'rotation',
      times: [0, 0.08, 0.28, 0.60, 0.90],
      values: [
        quatIdentity(),
        quatFromEulerDeg(0, -1.8, 0),
        quatFromEulerDeg(0, +1.8, 0),
        quatFromEulerDeg(0, +0.4, 0),
        quatIdentity(),
      ],
    },
    {
      node: 'BaseChassis',
      path: 'translation',
      times: [0, 0.08, 0.29, 0.65, 0.90],
      values: [
        baseT,
        [baseT[0], baseT[1], baseT[2] + 0.05 * s],
        [baseT[0], baseT[1], baseT[2] + 0.07 * s],
        [baseT[0], baseT[1], baseT[2] + 0.02 * s],
        baseT,
      ],
    },
  ]);

  // Clip 3: cast (1.5s Deploy / Overcharge Lockdown: capacitor hood vents open, barrels prime & elevate)
  sb.addAnimation('cast', [
    {
      node: 'CapacitorHood',
      path: 'rotation',
      times: [0, 0.28, 1.05, 1.5],
      values: [
        quatIdentity(),
        quatFromEulerDeg(+34, 0, 0),
        quatFromEulerDeg(+34, 0, 0),
        quatIdentity(),
      ],
    },
    {
      node: 'GunPitch',
      path: 'rotation',
      times: [0, 0.32, 0.75, 1.15, 1.5],
      values: [
        quatIdentity(),
        quatFromEulerDeg(+10, 0, 0),
        quatFromEulerDeg(+6, 0, 0),
        quatFromEulerDeg(+9, 0, 0),
        quatIdentity(),
      ],
    },
    {
      node: 'BarrelLeft',
      path: 'translation',
      times: [0, 0.35, 0.75, 1.10, 1.5],
      values: [
        bLeftT,
        [bLeftT[0], bLeftT[1], bLeftT[2] - 0.08 * s],
        [bLeftT[0], bLeftT[1], bLeftT[2] - 0.11 * s],
        [bLeftT[0], bLeftT[1], bLeftT[2] - 0.06 * s],
        bLeftT,
      ],
    },
    {
      node: 'BarrelRight',
      path: 'translation',
      times: [0, 0.35, 0.75, 1.10, 1.5],
      values: [
        bRightT,
        [bRightT[0], bRightT[1], bRightT[2] - 0.08 * s],
        [bRightT[0], bRightT[1], bRightT[2] - 0.11 * s],
        [bRightT[0], bRightT[1], bRightT[2] - 0.06 * s],
        bRightT,
      ],
    },
  ]);

  // Clip 4: death (1.3s Temporary turret expiration / collapse: legs splay, chassis settles onto Y=0, barrels droop)
  const collapsedLegOverrides = Object.fromEntries(
    legConfigs.map((cfg) => [cfg.name, { rotation: quatFromEulerDeg(+6.0, cfg.yaw, 0) }]),
  );
  const collapsedChassisPos = groundedTranslation(
    sb,
    'BaseChassis',
    [baseT[0], baseT[1], baseT[2] + 0.03 * s],
    {
      ...collapsedLegOverrides,
      TurretYaw: { rotation: quatFromEulerDeg(-5, +28, +7) },
      GunPitch: { rotation: quatFromEulerDeg(-14, 0, 0) },
      CapacitorHood: { rotation: quatFromEulerDeg(+24, 0, 6) },
    },
    0.0,
  );

  sb.addAnimation('death', [
    {
      node: 'BaseChassis',
      path: 'translation',
      times: [0, 0.25, 0.75, 1.10, 1.3],
      values: [
        baseT,
        [baseT[0], baseT[1] + 0.025 * s, baseT[2]],
        collapsedChassisPos,
        collapsedChassisPos,
        collapsedChassisPos,
      ],
    },
    {
      node: 'TurretYaw',
      path: 'rotation',
      times: [0, 0.30, 0.85, 1.3],
      values: [
        quatIdentity(),
        quatFromEulerDeg(-3, +16, +4),
        quatFromEulerDeg(-5, +28, +7),
        quatFromEulerDeg(-5, +28, +7),
      ],
    },
    {
      node: 'GunPitch',
      path: 'rotation',
      times: [0, 0.25, 0.78, 1.3],
      values: [
        quatIdentity(),
        quatFromEulerDeg(+6, 0, 0),
        quatFromEulerDeg(-14, 0, 0),
        quatFromEulerDeg(-14, 0, 0),
      ],
    },
    {
      node: 'CapacitorHood',
      path: 'rotation',
      times: [0, 0.35, 0.85, 1.3],
      values: [
        quatIdentity(),
        quatFromEulerDeg(+42, 0, 8),
        quatFromEulerDeg(+24, 0, 6),
        quatFromEulerDeg(+24, 0, 6),
      ],
    },
    ...legConfigs.map((cfg) => ({
      node: cfg.name,
      path: 'rotation',
      times: [0, 0.25, 0.75, 1.3],
      values: [
        legRots[cfg.name],
        quatFromEulerDeg(-1.5, cfg.yaw, 0),
        quatFromEulerDeg(+6.0, cfg.yaw, 0),
        quatFromEulerDeg(+6.0, cfg.yaw, 0),
      ],
    })),
  ]);

  return sb;
}
