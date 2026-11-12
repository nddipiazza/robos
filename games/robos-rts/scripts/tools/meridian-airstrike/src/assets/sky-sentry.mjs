// Sky Sentry & Sky Sentry Defender (sky_sentry.glb & sky_sentry_defender.glb)
// Starfall Command — Meridian Faction
// Radius: 1.875 | Y-up, floor 0, faces -Z
// - sky_sentry.glb: Heavy compact anti-air gunship with broad forward wings (MuzzleLeft, MuzzleRight)
// - sky_sentry_defender.glb: Same ship with stowed wings and extended ventral targeting cannon (Muzzle)

import { DEG, quatFromAxisAngle, quatFromEulerYXZ, quatIdentity, quatMul } from "../math.mjs";
import {
  MeshPart,
  addBeveledBox,
  addExtrudedPolygonY,
  addFrustum,
  addHollowTube,
  addLoft,
  octProfileZ,
} from "../mesh-builder.mjs";
import { normalizeAssetScene } from "../glb-writer.mjs";

// Exact stowed-wing rotation for right (+1) and left (-1) broad forward wings:
// Rolls each broad forward wing upward (+68 deg carrier-style fold) and pitches it aft (+46 deg around X)
// so wingspan narrows dramatically from 3.75 down to ~1.98 tucked compactly along the rear hull shoulders!
function getWingPose(sideSign, stowedFrac) {
  if (stowedFrac <= 1e-6) return quatIdentity();
  const rollUp = quatFromAxisAngle([0, 0, 1], sideSign * 68 * DEG * stowedFrac);
  const pitchAft = quatFromAxisAngle([1, 0, 0], 46 * DEG * stowedFrac);
  return quatMul(pitchAft, rollUp);
}

// Self-aligning pylon counter-rotation so stowed AA pods tuck neatly forward along the hull cheeks!
function getAAPodPose(sideSign, stowedFrac) {
  if (stowedFrac <= 1e-6) return quatIdentity();
  const unPitch = quatFromAxisAngle([1, 0, 0], -46 * DEG * stowedFrac);
  const unRoll = quatFromAxisAngle([0, 0, 1], -sideSign * 68 * DEG * stowedFrac);
  return quatMul(unRoll, unPitch);
}

function buildGunshipHull() {
  const part = new MeshPart("SkySentryHullMesh");

  // Compact, stocky, bull-nosed heavy armored anti-air gunship hull (z = -1.36 to +1.36)
  const hullSections = [
    octProfileZ(-1.36, { halfW: 0.28, yBot: -0.14, yTop: 0.10, topHalfW: 0.19, botHalfW: 0.20 }),
    octProfileZ(-1.12, { halfW: 0.48, yBot: -0.22, yTop: 0.24, topHalfW: 0.34, botHalfW: 0.36 }),
    octProfileZ(-0.56, { halfW: 0.60, yBot: -0.25, yTop: 0.34, topHalfW: 0.42, botHalfW: 0.46 }),
    octProfileZ(0.28,  { halfW: 0.62, yBot: -0.24, yTop: 0.36, topHalfW: 0.44, botHalfW: 0.48 }),
    octProfileZ(0.96,  { halfW: 0.52, yBot: -0.21, yTop: 0.30, topHalfW: 0.36, botHalfW: 0.38 }),
    octProfileZ(1.36,  { halfW: 0.38, yBot: -0.15, yTop: 0.20, topHalfW: 0.26, botHalfW: 0.28 }),
  ];

  addLoft(part, "ArmorDark", hullSections, {
    panelMaterials: (sec, seg) => {
      if (seg === 2 && sec >= 1 && sec <= 3) return "ArmorLight";
      if (seg === 6) return "MechFrame";
      return "ArmorDark";
    },
  });

  // Heavy armored gunship cockpit brow & recessed polarized teal visor slit (-Z prow)
  const visorSections = [
    octProfileZ(-1.20, { halfW: 0.30, yBot: 0.08, yTop: 0.21, topHalfW: 0.22, botHalfW: 0.26 }),
    octProfileZ(-0.82, { halfW: 0.39, yBot: 0.14, yTop: 0.36, topHalfW: 0.27, botHalfW: 0.35 }),
    octProfileZ(-0.42, { halfW: 0.35, yBot: 0.20, yTop: 0.39, topHalfW: 0.24, botHalfW: 0.32 }),
  ];
  addLoft(part, "CockpitCanopy", visorSections, {
    panelMaterials: (sec, seg) => (sec === 1 && seg === 2 ? "ArmorLight" : "CockpitCanopy"),
  });
  // Armored brow overhang & center pillar
  addBeveledBox(part, "ArmorLight", [0, 0.33, -0.96], [0.64, 0.055, 0.26], { bevel: 0.015 });
  addBeveledBox(part, "ArmorDark", [0, 0.22, -1.16], [0.055, 0.16, 0.14], { bevel: 0.01 });

  // Heavy shoulder wing-hinge drums (bronze actuator collars at x = ±0.56, z = +0.12)
  for (const sx of [-1, 1]) {
    addFrustum(
      part,
      "BronzeRadiator",
      [sx * 0.56, -0.06, 0.12],
      [sx * 0.56, 0.16, 0.12],
      0.16,
      0.15,
      10,
    );
    // Side intake scoops ahead of shoulder hinges
    addHollowTube(
      part,
      "ArmorLight",
      "MechFrame",
      "BronzeDeep",
      [sx * 0.55, 0.04, -0.32],
      [sx * 0.55, 0.04, -0.78],
      0.125,
      0.110,
      0.088,
      0.080,
      8,
      { angleOffset: Math.PI / 8, recessedCoreMat: "MechFrame" },
    );
    // Compact twin rear turbofan exhaust shrouds (x = ±0.26, z = +1.34..+1.54)
    addHollowTube(
      part,
      "MechFrame",
      "BronzeDeep",
      "BronzeRadiator",
      [sx * 0.25, 0.03, 1.26],
      [sx * 0.25, 0.03, 1.54],
      0.175,
      0.150,
      0.125,
      0.110,
      10,
      { recessedCoreMat: "TealContainment", coreDepthFrac: 0.55 },
    );
    // Stubby twin vertical tail fins
    addBeveledBox(part, "ArmorDark", [sx * 0.38, 0.34, 1.08], [0.06, 0.34, 0.48], {
      bevel: 0.014,
      topMat: "BronzeRadiator",
    });
    // Ventral armored landing skids (define floor Y = 0 in Gunship mode)
    addBeveledBox(part, "MechFrame", [sx * 0.36, -0.32, -0.08], [0.09, 0.12, 1.12], {
      bevel: 0.015,
    });
  }

  // Bronze dorsal radiator vents behind radar dome
  for (let i = 0; i < 3; i++) {
    addBeveledBox(part, "BronzeDeep", [0, 0.355, 0.52 + i * 0.20], [0.46, 0.04, 0.11], {
      bevel: 0.008,
      topMat: "BronzeRadiator",
    });
  }

  return part;
}

function buildRadarDome() {
  const part = new MeshPart("RadarDomeMesh");
  // Elevated hexagonal anti-air phased-array radar dome atop carapace
  addFrustum(part, "MechFrame", [0, 0, 0], [0, 0.06, 0], 0.22, 0.24, 8);
  addFrustum(part, "ArmorLight", [0, 0.06, 0], [0, 0.15, 0], 0.25, 0.17, 8, {
    capEndMat: "BronzeRadiator",
  });
  // Forward-facing teal phased-array tracking bar
  addBeveledBox(part, "TealContainment", [0, 0.10, -0.21], [0.22, 0.045, 0.06], {
    bevel: 0.008,
  });
  return part;
}

function buildCarapaceTeamPlate() {
  const part = new MeshPart("TeamColorPlate_Carapace_Mesh");
  const poly = [
    [-0.30, -0.36],
    [0.30, -0.36],
    [0.36, 0.18],
    [-0.36, 0.18],
  ];
  addExtrudedPolygonY(part, "TeamColor", poly, 0, 0.036, {
    bevelTop: 0.012,
    insetTop: 0.018,
  });
  return part;
}

function buildBroadForwardWing(sideSign) {
  // Built in right-wing local coords relative to mid-shoulder hinge at (+0.56, +0.06, +0.12)
  // Boldly sweeps FORWARD (-Z) and OUTWARD (+X):
  // - Root spans z_world = -0.22 .. +0.68
  // - Forward leading outer corner reaches world (1.55, y, -1.04) -> hypot = 1.867
  // - Extreme forward-swept wingtip reaches world (1.778, y, -0.595) -> exact hypot = 1.875!
  const rightWing = new MeshPart("BroadWingRightMesh");

  const mainWingPoly = [
    [0.00, -0.34],   // Inner leading root (world x=0.56, z=-0.22)
    [0.52, -0.86],   // Mid leading forward sweep (world x=1.08, z=-0.74)
    [0.99, -1.16],   // Forward-swept outer leading tip (world x=1.55, z=-1.04, hypot=1.867)
    [1.218, -0.715], // Extreme outer wingtip (world x=1.778, z=-0.595, exact hypot=1.875!)
    [1.16, -0.14],   // Outer trailing corner (world x=1.72, z=-0.02, hypot=1.720)
    [0.56, 0.36],    // Mid trailing edge (world x=1.12, z=+0.48)
    [0.00, 0.56],    // Inner trailing root (world x=0.56, z=+0.68)
  ];

  addExtrudedPolygonY(rightWing, "ArmorDark", mainWingPoly, -0.055, 0.065, {
    bevelTop: 0.024,
    bevelBot: 0.020,
    insetTop: 0.035,
    insetBot: 0.030,
    topMat: "ArmorLight",
    botMat: "MechFrame",
  });

  // Heavy armored wingtip bumper & teal nav/sensor bar along angled outer tip
  const tipPod = new MeshPart("WingtipPod");
  addBeveledBox(tipPod, "BronzeRadiator", [0, 0.005, 0], [0.11, 0.09, 0.54], {
    bevel: 0.018,
  });
  addBeveledBox(tipPod, "TealContainment", [0.04, 0.01, -0.08], [0.035, 0.04, 0.24], {
    bevel: 0.006,
  });
  rightWing.mergeTRS(tipPod, [1.14, 0, -0.44], quatFromAxisAngle([0, 1, 0], 22 * DEG));

  // Forward-swept structural spar rib across upper wing
  const spar = new MeshPart("WingSpar");
  addBeveledBox(spar, "ArmorDark", [0, 0.068, 0], [0.86, 0.03, 0.11], {
    bevel: 0.008,
  });
  rightWing.mergeTRS(spar, [0.56, 0, -0.26], quatFromAxisAngle([0, 1, 0], 32 * DEG));

  return sideSign > 0 ? rightWing : rightWing.cloneMirroredX("BroadWingLeftMesh");
}

function buildWingTeamPlate(sideSign) {
  const rightPlate = new MeshPart("TeamColorPlate_WingRight_Mesh");
  // Broad forward-swept TeamColor chevron plate matching the forward wing planform
  const poly = [
    [0.18, -0.24],
    [0.88, -0.92],
    [1.06, -0.60],
    [0.98, -0.12],
    [0.22, 0.34],
  ];
  addExtrudedPolygonY(rightPlate, "TeamColor", poly, 0, 0.034, {
    bevelTop: 0.01,
    insetTop: 0.018,
  });
  return sideSign > 0
    ? rightPlate
    : rightPlate.cloneMirroredX("TeamColorPlate_WingLeft_Mesh");
}

function buildAABattery(sideSign) {
  const pod = new MeshPart(sideSign > 0 ? "AABatteryRightMesh" : "AABatteryLeftMesh");

  // Compact heavy anti-air twin autocannon + interceptor pod mounted under/ahead of forward wing
  addBeveledBox(pod, "ArmorDark", [0, 0, 0], [0.24, 0.17, 0.52], {
    bevel: 0.025,
    topMat: "ArmorLight",
  });
  addBeveledBox(pod, "BronzeRadiator", [0, 0, -0.25], [0.21, 0.14, 0.06], {
    bevel: 0.012,
  });

  // Twin anti-air high-velocity barrels jutting toward -Z
  for (const bx of [-0.055, 0.055]) {
    addHollowTube(
      pod,
      "MechFrame",
      "MechFrame",
      "BronzeRadiator",
      [bx, 0.01, -0.26],
      [bx, 0.01, -0.58],
      0.036,
      0.032,
      0.022,
      0.020,
      8,
      { recessedCoreMat: "TealContainment", coreDepthFrac: 0.75 },
    );
  }

  // Side micro-SAM optic cell
  addBeveledBox(pod, "TealContainment", [sideSign * 0.115, 0.02, -0.14], [0.03, 0.055, 0.14], {
    bevel: 0.006,
  });

  return pod;
}

function buildVentralCannonMount() {
  const part = new MeshPart("VentralCannonMountMesh");

  // Articulated ventral turret saddle, bronze hydraulic trunnion struts & glowing teal capacitor chamber
  addBeveledBox(part, "MechFrame", [0, 0.16, -0.05], [0.36, 0.26, 0.76], {
    bevel: 0.025,
  });
  addBeveledBox(part, "ArmorDark", [0, -0.02, -0.06], [0.44, 0.22, 0.94], {
    bevel: 0.03,
    botMat: "MechFrame",
  });

  // Bronze hydraulic trunnion cheeks & cooling fins on both sides
  for (const sx of [-1, 1]) {
    addBeveledBox(part, "BronzeRadiator", [sx * 0.22, 0.08, -0.04], [0.07, 0.28, 0.54], {
      bevel: 0.014,
    });
    // Glowing teal plasma capacitor cells visible along the sides when deployed
    addBeveledBox(part, "TealContainment", [sx * 0.23, -0.02, -0.16], [0.04, 0.08, 0.38], {
      bevel: 0.008,
    });
    // Angled ventral stabilizer fins/heels (define clean Y = 0 contact pad when deployed)
    addBeveledBox(part, "BronzeDeep", [sx * 0.16, -0.14, 0.02], [0.08, 0.06, 0.62], {
      bevel: 0.01,
    });
  }

  return part;
}

function buildVentralCannonBarrel() {
  const part = new MeshPart("VentralCannonBarrelMesh");

  // Telescoping long-range Meridian ventral targeting cannon!
  // Local z = +0.20 (breech) to -1.275 (muzzle tip).
  // In Gunship stowed state: parent mount z = 0, barrel z = +0.08 -> tip at z = -1.195 (tucked under prow -1.36!).
  // In Defender deployed state: barrel telescopes forward to z = -0.60 -> tip at z = -1.875 (exact radius 1.875!)!
  addBeveledBox(part, "ArmorLight", [0, 0.0, -0.28], [0.22, 0.16, 0.92], {
    bevel: 0.022,
  });

  // Heavy central rifled bore + glowing teal targeting energy rails top/bottom/sides
  addHollowTube(
    part,
    "MechFrame",
    "MechFrame",
    "BronzeRadiator",
    [0, 0, -0.68],
    [0, 0, -1.275],
    0.085,
    0.072,
    0.052,
    0.046,
    10,
    { recessedCoreMat: "TealContainment", coreDepthFrac: 0.6 },
  );

  // Upper & lower bronze magnetic accelerator rails flanking the main barrel
  addBeveledBox(part, "BronzeRadiator", [0, 0.082, -0.94], [0.065, 0.036, 0.62], {
    bevel: 0.008,
  });
  addBeveledBox(part, "BronzeRadiator", [0, -0.082, -0.90], [0.065, 0.036, 0.54], {
    bevel: 0.008,
  });

  // Glowing teal target-designator strips along barrel flanks
  for (const sx of [-1, 1]) {
    addBeveledBox(part, "TealContainment", [sx * 0.082, 0, -0.92], [0.025, 0.035, 0.52], {
      bevel: 0.005,
    });
  }

  // Slotted bronze muzzle brake collar near front tip (-1.22)
  addBeveledBox(part, "BronzeDeep", [0, 0, -1.21], [0.19, 0.15, 0.09], {
    bevel: 0.015,
  });

  return part;
}

function buildVentralRearCounterweight() {
  const part = new MeshPart("VentralRearStabilizerMesh");
  // Continuous telescoping recoil heatsink & counter-anchor boom (local z = -0.68..+0.875)
  // so its forward shaft stays solidly seated inside VentralCannonMount with zero gap!
  addBeveledBox(part, "MechFrame", [0, 0.02, 0.06], [0.20, 0.12, 1.48], { bevel: 0.015 });
  // Angled dorsal strut bracing up into the rear ventral mount
  addBeveledBox(part, "ArmorDark", [0, 0.12, -0.22], [0.14, 0.14, 0.68], { bevel: 0.015 });
  addBeveledBox(part, "BronzeRadiator", [0, 0.02, 0.74], [0.30, 0.11, 0.27], {
    bevel: 0.018,
  });
  addBeveledBox(part, "TealContainment", [0, 0.02, 0.86], [0.14, 0.045, 0.03], {
    bevel: 0.005,
  });
  return part;
}

function buildSkySentryVariant({ defenderMode = false }) {
  const stowedFrac = defenderMode ? 1.0 : 0.0;

  // Mechanical state coordinates for Gunship vs Defender
  const mountGunshipPos = [0, -0.19, 0.0];
  const mountDefenderPos = [0, -0.50, 0.0];

  const barrelGunshipPos = [0, -0.02, 0.08];   // Muzzle tip at z = -1.195 (retracted behind nose -1.36)
  const barrelDefenderPos = [0, -0.02, -0.60]; // Muzzle tip at z = -1.875 (extended forward!)

  const rearStabGunshipPos = [0, 0.02, 0.42];  // Ends at +1.295 (retracted inside tail)
  const rearStabDefenderPos = [0, 0.02, 1.00]; // Ends at +1.875 (deployed aft stabilizer!)

  const restMountPos = defenderMode ? mountDefenderPos : mountGunshipPos;
  const restBarrelPos = defenderMode ? barrelDefenderPos : barrelGunshipPos;
  const restRearStabPos = defenderMode ? rearStabDefenderPos : rearStabGunshipPos;

  const restWingLRot = getWingPose(-1, stowedFrac);
  const restWingRRot = getWingPose(1, stowedFrac);
  const restAALRot = getAAPodPose(-1, stowedFrac);
  const restAARRot = getAAPodPose(1, stowedFrac);

  // Initial airframe Y before exact floor-0 normalization:
  // Gunship skids sit at y_local = -0.38 -> airframeY = 0.38
  // Defender deployed ventral stabilizer heel sits at y_local = -0.50 - 0.17 = -0.67 -> airframeY = 0.67
  const airframeBaseY = defenderMode ? 0.67 : 0.38;

  const nodes = [
    {
      id: "root",
      name: defenderMode ? "SkySentryDefender" : "SkySentry",
      parent: null,
      translation: [0, 0, 0],
    },
    {
      id: "airframe",
      name: "Airframe",
      parent: "root",
      translation: [0, airframeBaseY, 0],
    },
    {
      id: "hull",
      name: "GunshipHull",
      parent: "airframe",
      translation: [0, 0, 0],
      part: buildGunshipHull(),
    },
    {
      id: "radar",
      name: "RadarDome",
      parent: "airframe",
      translation: [0, 0.35, 0.02],
      part: buildRadarDome(),
    },
    {
      id: "tc_carapace",
      name: "TeamColorPlate_Carapace",
      parent: "airframe",
      translation: [0, 0.355, -0.32],
      part: buildCarapaceTeamPlate(),
    },

    // Articulated Broad Forward Wings + Wing TeamColor Plates + Twin AA Batteries
    {
      id: "wing_l",
      name: "WingLeft",
      parent: "airframe",
      translation: [-0.56, 0.06, 0.12],
      rotation: restWingLRot,
      part: buildBroadForwardWing(-1),
    },
    {
      id: "tc_wing_l",
      name: "TeamColorPlate_WingLeft",
      parent: "wing_l",
      translation: [0, 0.064, 0],
      part: buildWingTeamPlate(-1),
    },
    {
      id: "aa_l",
      name: "AABatteryLeft",
      parent: "wing_l",
      translation: [-0.48, -0.09, -0.58],
      rotation: restAALRot,
      part: buildAABattery(-1),
    },

    {
      id: "wing_r",
      name: "WingRight",
      parent: "airframe",
      translation: [0.56, 0.06, 0.12],
      rotation: restWingRRot,
      part: buildBroadForwardWing(1),
    },
    {
      id: "tc_wing_r",
      name: "TeamColorPlate_WingRight",
      parent: "wing_r",
      translation: [0, 0.064, 0],
      part: buildWingTeamPlate(1),
    },
    {
      id: "aa_r",
      name: "AABatteryRight",
      parent: "wing_r",
      translation: [0.48, -0.09, -0.58],
      rotation: restAARRot,
      part: buildAABattery(1),
    },

    // Articulated Ventral Targeting Cannon Assembly
    {
      id: "ventral_mount",
      name: "VentralCannonMount",
      parent: "airframe",
      translation: restMountPos,
      part: buildVentralCannonMount(),
    },
    {
      id: "ventral_barrel",
      name: "VentralCannonBarrel",
      parent: "ventral_mount",
      translation: restBarrelPos,
      part: buildVentralCannonBarrel(),
    },
    {
      id: "ventral_rear_stab",
      name: "VentralStabilizerBoom",
      parent: "ventral_mount",
      translation: restRearStabPos,
      part: buildVentralRearCounterweight(),
    },
  ];

  // Weapon Muzzle Anchors:
  // - sky_sentry (twin anti-air gunship): MuzzleLeft & MuzzleRight at twin AA barrel tips
  // - sky_sentry_defender (ventral targeting cannon): Muzzle at extended ventral targeting cannon tip
  if (!defenderMode) {
    nodes.push(
      {
        id: "muzzle_l",
        name: "MuzzleLeft",
        parent: "aa_l",
        translation: [0, 0.01, -0.60],
      },
      {
        id: "muzzle_r",
        name: "MuzzleRight",
        parent: "aa_r",
        translation: [0, 0.01, -0.60],
      },
    );
  } else {
    nodes.push({
      id: "muzzle_main",
      name: "Muzzle",
      parent: "ventral_barrel",
      translation: [0, 0, -1.275], // World Z = -0.60 - 1.275 = -1.875!
    });
  }

  const y0 = airframeBaseY;
  const qId = quatIdentity();

  // Common idle & hover tracks + mode-specific attack, morph, cast, and death clips
  const animations = [
    {
      name: "idle",
      tracks: [
        {
          nodeId: "airframe",
          path: "translation",
          times: [0, 0.7, 1.4, 2.1, 2.8],
          values: [
            [0, y0, 0],
            [0, y0 + 0.022, 0],
            [0, y0 + 0.036, 0],
            [0, y0 + 0.015, 0],
            [0, y0, 0],
          ],
        },
        {
          nodeId: "radar",
          path: "rotation",
          times: [0, 0.7, 1.4, 2.1, 2.8],
          values: [
            qId,
            quatFromAxisAngle([0, 1, 0], 24 * DEG),
            quatFromAxisAngle([0, 1, 0], 0),
            quatFromAxisAngle([0, 1, 0], -24 * DEG),
            qId,
          ],
        },
      ],
    },
    {
      name: "hover",
      tracks: [
        {
          nodeId: "airframe",
          path: "translation",
          times: [0, 0.55, 1.1, 1.65, 2.2],
          values: [
            [0, y0 + 0.07, 0],
            [0.02, y0 + 0.15, -0.015],
            [0, y0 + 0.08, 0],
            [-0.02, y0 + 0.14, 0.015],
            [0, y0 + 0.07, 0],
          ],
        },
        {
          nodeId: "airframe",
          path: "rotation",
          times: [0, 0.55, 1.1, 1.65, 2.2],
          values: [
            qId,
            quatFromEulerYXZ(0, 1.2 * DEG, -1.8 * DEG),
            qId,
            quatFromEulerYXZ(0, -1.0 * DEG, 1.8 * DEG),
            qId,
          ],
        },
        {
          nodeId: "radar",
          path: "rotation",
          times: [0, 0.55, 1.1, 1.65, 2.2],
          values: [
            quatFromAxisAngle([0, 1, 0], 0),
            quatFromAxisAngle([0, 1, 0], 90 * DEG),
            quatFromAxisAngle([0, 1, 0], 180 * DEG),
            quatFromAxisAngle([0, 1, 0], 270 * DEG),
            quatFromAxisAngle([0, 1, 0], 360 * DEG),
          ],
        },
      ],
    },
  ];

  if (!defenderMode) {
    // SKY SENTRY (Anti-Air Gunship) Attack, Morph (-> Defender), Cast, Death
    animations.push(
      {
        name: "attack",
        tracks: [
          // Anti-air upward tracking tilt (+7.5 deg nose up!) + rapid twin AA battery recoil
          {
            nodeId: "airframe",
            path: "rotation",
            times: [0, 0.12, 0.28, 0.46, 0.85],
            values: [
              qId,
              quatFromEulerYXZ(0, 7.5 * DEG, -1.5 * DEG),
              quatFromEulerYXZ(0, 6.2 * DEG, 1.5 * DEG),
              quatFromEulerYXZ(0, 7.8 * DEG, 0),
              qId,
            ],
          },
          {
            nodeId: "aa_l",
            path: "translation",
            times: [0, 0.08, 0.16, 0.34, 0.44, 0.85],
            values: [
              [-0.48, -0.09, -0.58],
              [-0.48, -0.09, -0.44],
              [-0.48, -0.09, -0.58],
              [-0.48, -0.09, -0.46],
              [-0.48, -0.09, -0.58],
              [-0.48, -0.09, -0.58],
            ],
          },
          {
            nodeId: "aa_r",
            path: "translation",
            times: [0, 0.18, 0.26, 0.44, 0.54, 0.85],
            values: [
              [0.48, -0.09, -0.58],
              [0.48, -0.09, -0.44],
              [0.48, -0.09, -0.58],
              [0.48, -0.09, -0.46],
              [0.48, -0.09, -0.58],
              [0.48, -0.09, -0.58],
            ],
          },
        ],
      },
      {
        name: "morph",
        tracks: [
          // Full mechanical transformation from Sky Sentry -> Sky Sentry Defender!
          {
            nodeId: "airframe",
            path: "translation",
            times: [0, 0.45, 0.95, 1.35],
            values: [
              [0, y0, 0],
              [0, y0 + 0.34, 0.03],
              [0, y0 + 0.31, -0.01],
              [0, y0 + 0.29, 0],
            ],
          },
          {
            nodeId: "wing_l",
            path: "rotation",
            times: [0, 0.35, 0.85, 1.35],
            values: [
              getWingPose(-1, 0.0),
              getWingPose(-1, 0.35),
              getWingPose(-1, 0.92),
              getWingPose(-1, 1.0),
            ],
          },
          {
            nodeId: "wing_r",
            path: "rotation",
            times: [0, 0.35, 0.85, 1.35],
            values: [
              getWingPose(1, 0.0),
              getWingPose(1, 0.35),
              getWingPose(1, 0.92),
              getWingPose(1, 1.0),
            ],
          },
          {
            nodeId: "aa_l",
            path: "rotation",
            times: [0, 0.35, 0.85, 1.35],
            values: [
              getAAPodPose(-1, 0.0),
              getAAPodPose(-1, 0.35),
              getAAPodPose(-1, 0.92),
              getAAPodPose(-1, 1.0),
            ],
          },
          {
            nodeId: "aa_r",
            path: "rotation",
            times: [0, 0.35, 0.85, 1.35],
            values: [
              getAAPodPose(1, 0.0),
              getAAPodPose(1, 0.35),
              getAAPodPose(1, 0.92),
              getAAPodPose(1, 1.0),
            ],
          },
          {
            nodeId: "ventral_mount",
            path: "translation",
            times: [0, 0.30, 0.85, 1.35],
            values: [
              mountGunshipPos,
              [0, -0.30, 0],
              [0, -0.52, 0],
              mountDefenderPos,
            ],
          },
          {
            nodeId: "ventral_barrel",
            path: "translation",
            times: [0, 0.45, 1.05, 1.35],
            values: [
              barrelGunshipPos,
              [0, -0.02, -0.05],
              [0, -0.02, -0.63],
              barrelDefenderPos,
            ],
          },
          {
            nodeId: "ventral_rear_stab",
            path: "translation",
            times: [0, 0.45, 1.05, 1.35],
            values: [
              rearStabGunshipPos,
              [0, 0.02, 0.58],
              [0, 0.02, 1.02],
              rearStabDefenderPos,
            ],
          },
        ],
      },
      {
        name: "cast",
        tracks: [
          // Active Sky-Sweep Radar Lock & Wing Flare
          {
            nodeId: "airframe",
            path: "translation",
            times: [0, 0.35, 0.85, 1.2],
            values: [
              [0, y0, 0],
              [0, y0 + 0.18, 0],
              [0, y0 + 0.14, 0],
              [0, y0, 0],
            ],
          },
          {
            nodeId: "radar",
            path: "rotation",
            times: [0, 0.3, 0.6, 0.9, 1.2],
            values: [
              quatFromAxisAngle([0, 1, 0], 0),
              quatFromAxisAngle([0, 1, 0], 180 * DEG),
              quatFromAxisAngle([0, 1, 0], 360 * DEG),
              quatFromAxisAngle([0, 1, 0], 540 * DEG),
              quatFromAxisAngle([0, 1, 0], 720 * DEG),
            ],
          },
          {
            nodeId: "wing_l",
            path: "rotation",
            times: [0, 0.35, 0.80, 1.2],
            values: [
              qId,
              quatFromAxisAngle([0, 0, 1], -10 * DEG),
              quatFromAxisAngle([0, 0, 1], -6 * DEG),
              qId,
            ],
          },
          {
            nodeId: "wing_r",
            path: "rotation",
            times: [0, 0.35, 0.80, 1.2],
            values: [
              qId,
              quatFromAxisAngle([0, 0, 1], 10 * DEG),
              quatFromAxisAngle([0, 0, 1], 6 * DEG),
              qId,
            ],
          },
        ],
      },
      {
        name: "death",
        tracks: [
          {
            nodeId: "airframe",
            path: "translation",
            times: [0, 0.20, 0.68, 1.20, 1.65],
            values: [
              [0, y0, 0],
              [-0.06, y0 + 0.28, 0.05],
              [-0.12, y0 + 0.36, -0.06],
              [-0.10, y0 + 0.27, -0.10],
              [-0.10, y0 + 0.27, -0.10],
            ],
          },
          {
            nodeId: "airframe",
            path: "rotation",
            times: [0, 0.22, 0.72, 1.25, 1.65],
            values: [
              qId,
              quatFromEulerYXZ(-6 * DEG, 10 * DEG, 14 * DEG),
              quatFromEulerYXZ(-15 * DEG, -12 * DEG, -22 * DEG),
              quatFromEulerYXZ(-18 * DEG, -7 * DEG, -12 * DEG),
              quatFromEulerYXZ(-18 * DEG, -7 * DEG, -12 * DEG),
            ],
          },
          {
            nodeId: "wing_r",
            path: "rotation",
            times: [0, 0.45, 1.25, 1.65],
            values: [
              qId,
              getWingPose(1, 0.35),
              getWingPose(1, 0.45),
              getWingPose(1, 0.45),
            ],
          },
        ],
      },
    );
  } else {
    // SKY SENTRY DEFENDER (Stowed Wings + Extended Ventral Targeting Cannon)
    animations.push(
      {
        name: "attack",
        tracks: [
          // Heavy high-caliber ventral targeting cannon recoil kick + hydraulic recovery!
          {
            nodeId: "ventral_barrel",
            path: "translation",
            times: [0, 0.07, 0.15, 0.55, 1.1],
            values: [
              barrelDefenderPos,
              [0, -0.02, -0.61],
              [0, -0.02, -0.28], // Powerful +0.32 Z recoil stroke!
              [0, -0.02, -0.56],
              barrelDefenderPos,
            ],
          },
          {
            nodeId: "airframe",
            path: "translation",
            times: [0, 0.14, 0.45, 1.1],
            values: [
              [0, y0, 0],
              [0, y0 + 0.03, 0.11], // Hull pushed slightly aft by cannon blast
              [0, y0 + 0.01, 0.03],
              [0, y0, 0],
            ],
          },
          {
            nodeId: "airframe",
            path: "rotation",
            times: [0, 0.14, 0.48, 1.1],
            values: [
              qId,
              quatFromEulerYXZ(0, 4.8 * DEG, 0),
              quatFromEulerYXZ(0, -1.2 * DEG, 0),
              qId,
            ],
          },
        ],
      },
      {
        name: "morph",
        tracks: [
          // Reverse transformation: Sky Sentry Defender -> Sky Sentry (unstow wings, retract cannon)!
          {
            nodeId: "airframe",
            path: "translation",
            times: [0, 0.45, 0.95, 1.35],
            values: [
              [0, y0, 0],
              [0, y0 + 0.06, -0.02],
              [0, y0 - 0.22, 0.01],
              [0, y0 - 0.29, 0],
            ],
          },
          {
            nodeId: "ventral_barrel",
            path: "translation",
            times: [0, 0.45, 0.95, 1.35],
            values: [
              barrelDefenderPos,
              [0, -0.02, -0.20],
              [0, -0.02, 0.06],
              barrelGunshipPos,
            ],
          },
          {
            nodeId: "ventral_rear_stab",
            path: "translation",
            times: [0, 0.45, 0.95, 1.35],
            values: [
              rearStabDefenderPos,
              [0, 0.02, 0.66],
              [0, 0.02, 0.44],
              rearStabGunshipPos,
            ],
          },
          {
            nodeId: "ventral_mount",
            path: "translation",
            times: [0, 0.45, 1.05, 1.35],
            values: [
              mountDefenderPos,
              [0, -0.42, 0],
              [0, -0.22, 0],
              mountGunshipPos,
            ],
          },
          {
            nodeId: "wing_l",
            path: "rotation",
            times: [0, 0.40, 0.95, 1.35],
            values: [
              getWingPose(-1, 1.0),
              getWingPose(-1, 0.72),
              getWingPose(-1, 0.12),
              getWingPose(-1, 0.0),
            ],
          },
          {
            nodeId: "wing_r",
            path: "rotation",
            times: [0, 0.40, 0.95, 1.35],
            values: [
              getWingPose(1, 1.0),
              getWingPose(1, 0.72),
              getWingPose(1, 0.12),
              getWingPose(1, 0.0),
            ],
          },
          {
            nodeId: "aa_l",
            path: "rotation",
            times: [0, 0.40, 0.95, 1.35],
            values: [
              getAAPodPose(-1, 1.0),
              getAAPodPose(-1, 0.72),
              getAAPodPose(-1, 0.12),
              getAAPodPose(-1, 0.0),
            ],
          },
          {
            nodeId: "aa_r",
            path: "rotation",
            times: [0, 0.40, 0.95, 1.35],
            values: [
              getAAPodPose(1, 1.0),
              getAAPodPose(1, 0.72),
              getAAPodPose(1, 0.12),
              getAAPodPose(1, 0.0),
            ],
          },
        ],
      },
      {
        name: "cast",
        tracks: [
          // Precision Overwatch Target Lock: barrel calibrates forward, radar spins fast
          {
            nodeId: "ventral_barrel",
            path: "translation",
            times: [0, 0.35, 0.75, 1.2],
            values: [
              barrelDefenderPos,
              [0, -0.02, -0.66],
              [0, -0.02, -0.64],
              barrelDefenderPos,
            ],
          },
          {
            nodeId: "radar",
            path: "rotation",
            times: [0, 0.3, 0.6, 0.9, 1.2],
            values: [
              quatFromAxisAngle([0, 1, 0], 0),
              quatFromAxisAngle([0, 1, 0], 180 * DEG),
              quatFromAxisAngle([0, 1, 0], 360 * DEG),
              quatFromAxisAngle([0, 1, 0], 540 * DEG),
              quatFromAxisAngle([0, 1, 0], 720 * DEG),
            ],
          },
          {
            nodeId: "airframe",
            path: "rotation",
            times: [0, 0.40, 0.85, 1.2],
            values: [
              qId,
              quatFromEulerYXZ(0, -3.5 * DEG, 0),
              quatFromEulerYXZ(0, -2.5 * DEG, 0),
              qId,
            ],
          },
        ],
      },
      {
        name: "death",
        tracks: [
          {
            nodeId: "airframe",
            path: "translation",
            times: [0, 0.20, 0.70, 1.25, 1.65],
            values: [
              [0, y0, 0],
              [0.06, y0 + 0.22, 0.06],
              [0.10, y0 + 0.10, -0.05],
              [0.08, y0 + 0.02, -0.08],
              [0.08, y0 + 0.02, -0.08],
            ],
          },
          {
            nodeId: "airframe",
            path: "rotation",
            times: [0, 0.22, 0.75, 1.25, 1.65],
            values: [
              qId,
              quatFromEulerYXZ(5 * DEG, 8 * DEG, -12 * DEG),
              quatFromEulerYXZ(14 * DEG, -9 * DEG, 20 * DEG),
              quatFromEulerYXZ(16 * DEG, -5 * DEG, 15 * DEG),
              quatFromEulerYXZ(16 * DEG, -5 * DEG, 15 * DEG),
            ],
          },
          {
            nodeId: "ventral_mount",
            path: "translation",
            times: [0, 0.55, 1.25, 1.65],
            values: [
              mountDefenderPos,
              [0, -0.34, 0.04],
              [0, -0.28, 0.06],
              [0, -0.28, 0.06],
            ],
          },
          {
            nodeId: "ventral_barrel",
            path: "translation",
            times: [0, 0.55, 1.25, 1.65],
            values: [
              barrelDefenderPos,
              [0, -0.02, -0.25],
              [0, -0.02, -0.15],
              [0, -0.02, -0.15],
            ],
          },
        ],
      },
    );
  }

  const scene = {
    name: defenderMode ? "SkySentryDefenderScene" : "SkySentryScene",
    nodes,
    animations,
  };

  return normalizeAssetScene(scene, {
    targetRadius: 1.875,
    floorY: 0,
    bodyRootId: "airframe",
  });
}

export function createSkySentryAsset() {
  return buildSkySentryVariant({ defenderMode: false });
}

export function createSkySentryDefenderAsset() {
  return buildSkySentryVariant({ defenderMode: true });
}
