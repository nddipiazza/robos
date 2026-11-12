// Night Harrier (night_harrier.glb)
// Starfall Command — Meridian Faction
// Radius: 1.875 | Y-up, floor 0, faces -Z
// Armored dual nacelle stealth ground-strike aircraft with clearly separated cockpit
// and twin multi-tube rocket launchers.

import { DEG, quatFromAxisAngle, quatFromEulerYXZ, quatIdentity } from "../math.mjs";
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

function buildCockpitPod() {
  const part = new MeshPart("CockpitPodMesh");

  // Long, sharply faceted forward-projecting stealth cockpit pod (z = -1.875 to -0.16)
  // Narrow neck at z = -0.34..-0.16 creates unmistakable separation from fuselage & rocket pods.
  const sections = [
    octProfileZ(-1.875, { halfW: 0.012, yBot: 0.00, yTop: 0.02, topHalfW: 0.008, botHalfW: 0.008 }),
    octProfileZ(-1.62,  { halfW: 0.115, yBot: -0.06, yTop: 0.08, topHalfW: 0.065, botHalfW: 0.075 }),
    octProfileZ(-1.28,  { halfW: 0.215, yBot: -0.13, yTop: 0.15, topHalfW: 0.135, botHalfW: 0.145 }),
    octProfileZ(-0.82,  { halfW: 0.235, yBot: -0.15, yTop: 0.18, topHalfW: 0.145, botHalfW: 0.160 }),
    octProfileZ(-0.44,  { halfW: 0.195, yBot: -0.12, yTop: 0.15, topHalfW: 0.115, botHalfW: 0.130 }),
    octProfileZ(-0.16,  { halfW: 0.165, yBot: -0.10, yTop: 0.13, topHalfW: 0.105, botHalfW: 0.115 }),
  ];

  addLoft(part, "ArmorDark", sections, {
    panelMaterials: (sec, seg) => {
      if (seg === 2 && sec >= 1 && sec <= 3) return "ArmorLight";
      if (seg === 6) return "MechFrame";
      return "ArmorDark";
    },
  });

  // Raised stepped armored stealth canopy glass (z = -1.42 to -0.58)
  const canopySections = [
    octProfileZ(-1.42, { halfW: 0.065, yBot: 0.08, yTop: 0.12, topHalfW: 0.04, botHalfW: 0.06 }),
    octProfileZ(-1.14, { halfW: 0.138, yBot: 0.12, yTop: 0.255, topHalfW: 0.082, botHalfW: 0.13 }),
    octProfileZ(-0.78, { halfW: 0.142, yBot: 0.14, yTop: 0.275, topHalfW: 0.085, botHalfW: 0.135 }),
    octProfileZ(-0.54, { halfW: 0.095, yBot: 0.13, yTop: 0.195, topHalfW: 0.055, botHalfW: 0.09 }),
  ];
  addLoft(part, "CockpitCanopy", canopySections, {
    panelMaterials: (sec, seg) => {
      // Rear canopy fairing is armored titanium; forward/upper facets are polarized glass
      if (sec === 2 && seg === 2) return "ArmorLight";
      return "CockpitCanopy";
    },
  });

  // Crisp armored canopy bow frame & dorsal spine rib so cockpit reads sharply from overhead
  addBeveledBox(part, "ArmorLight", [0, 0.268, -0.98], [0.036, 0.032, 0.56], { bevel: 0.008 });
  addBeveledBox(part, "BronzeRadiator", [0, 0.195, -1.16], [0.29, 0.026, 0.04], { bevel: 0.006 });

  // Chin-mounted ground-strike electro-optical FLIR sensor turret (bronze collar + teal lens)
  addBeveledBox(part, "MechFrame", [0, -0.175, -1.26], [0.15, 0.09, 0.24], { bevel: 0.02 });
  addFrustum(part, "BronzeRadiator", [0, -0.18, -1.36], [0, -0.18, -1.43], 0.058, 0.048, 8);
  addFrustum(part, "TealContainment", [0, -0.18, -1.43], [0, -0.18, -1.445], 0.040, 0.034, 8);

  return part;
}

function buildFuselageCore() {
  const part = new MeshPart("FuselageCoreMesh");

  // Central diamond stealth hull & aft ECM tail sting (z = -0.34 to +1.875)
  const spineSections = [
    octProfileZ(-0.34, { halfW: 0.22, yBot: -0.12, yTop: 0.16, topHalfW: 0.14, botHalfW: 0.16 }),
    octProfileZ(0.05,  { halfW: 0.42, yBot: -0.16, yTop: 0.25, topHalfW: 0.25, botHalfW: 0.30 }),
    octProfileZ(0.58,  { halfW: 0.38, yBot: -0.14, yTop: 0.23, topHalfW: 0.22, botHalfW: 0.26 }),
    octProfileZ(1.18,  { halfW: 0.22, yBot: -0.09, yTop: 0.14, topHalfW: 0.12, botHalfW: 0.15 }),
    octProfileZ(1.62,  { halfW: 0.11, yBot: -0.04, yTop: 0.07, topHalfW: 0.06, botHalfW: 0.07 }),
    octProfileZ(1.875, { halfW: 0.015, yBot: 0.00, yTop: 0.025, topHalfW: 0.01, botHalfW: 0.01 }),
  ];

  addLoft(part, "ArmorDark", spineSections, {
    panelMaterials: (sec, seg) => {
      if (seg === 2 && sec <= 2) return "ArmorLight";
      if (seg === 6) return "MechFrame";
      return "ArmorDark";
    },
  });

  // Swept structural gull-wing spars bridging fuselage core -> rocket pylons -> dual nacelles
  // Leaves deep forward cutouts ahead of z = -0.38 so cockpit & rocket pods stay clearly separated!
  const rightBridgePoly = [
    [0.20, -0.26],
    [0.96, -0.38],
    [1.02, 0.68],
    [0.32, 0.84],
  ];
  const bridgeRight = new MeshPart("BridgeRight");
  addExtrudedPolygonY(bridgeRight, "ArmorDark", rightBridgePoly, -0.05, 0.12, {
    bevelTop: 0.03,
    bevelBot: 0.02,
    topMat: "ArmorLight",
    botMat: "MechFrame",
  });

  // Bronze dorsal thermal exhaust louvers recessed into inner wing root
  for (let i = 0; i < 3; i++) {
    const zL = 0.02 + i * 0.20;
    addBeveledBox(bridgeRight, "BronzeDeep", [0.64, 0.128, zL], [0.28, 0.028, 0.11], {
      bevel: 0.006,
      topMat: "BronzeRadiator",
    });
  }

  // Ventral stealth landing/keel skid strakes (touching floor Y = 0 after normalization)
  addBeveledBox(bridgeRight, "MechFrame", [0.34, -0.34, 0.15], [0.07, 0.14, 0.92], {
    bevel: 0.015,
  });
  addBeveledBox(bridgeRight, "BronzeDeep", [0.34, -0.405, 0.15], [0.09, 0.03, 0.84], {
    bevel: 0.006,
  });

  // Heavy stub pylon dropping down to hold the separated twin rocket pod at x = ±0.58
  addBeveledBox(bridgeRight, "MechFrame", [0.58, -0.02, -0.52], [0.10, 0.16, 0.34], {
    bevel: 0.015,
  });

  part.mergeTransformed(bridgeRight, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  part.mergeTransformed(bridgeRight.cloneMirroredX(), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  // Dorsal spine sensor crest & bronze power busbar
  addBeveledBox(part, "BronzeRadiator", [0, 0.265, 0.52], [0.12, 0.045, 0.42], { bevel: 0.01 });
  addBeveledBox(part, "TealContainment", [0, 0.285, 0.86], [0.05, 0.025, 0.18], { bevel: 0.005 });

  return part;
}

function buildSingleNacelle(sideSign) {
  // Built in local nacelle coordinates centered at x = 0, then mirrored for left (-1) vs right (+1)
  // Wait: build right-side (+X outward) local nacelle and mirror for left-side (-X outward)!
  const rightLocal = new MeshPart("NacelleRightLocal");

  // Heavy faceted armored stealth nacelle body (local z = -1.04 to +1.06; world z = -0.98 to +1.12)
  const nacSections = [
    octProfileZ(-1.04, { halfW: 0.185, yBot: -0.15, yTop: 0.16, topHalfW: 0.125, botHalfW: 0.135 }),
    octProfileZ(-0.76, { halfW: 0.245, yBot: -0.20, yTop: 0.22, topHalfW: 0.165, botHalfW: 0.175 }),
    octProfileZ(-0.08, { halfW: 0.265, yBot: -0.21, yTop: 0.24, topHalfW: 0.180, botHalfW: 0.185 }),
    octProfileZ(0.62,  { halfW: 0.240, yBot: -0.19, yTop: 0.22, topHalfW: 0.160, botHalfW: 0.165 }),
    octProfileZ(1.06,  { halfW: 0.195, yBot: -0.15, yTop: 0.17, topHalfW: 0.135, botHalfW: 0.135 }),
  ];

  addLoft(rightLocal, "ArmorDark", nacSections, {
    capStart: false,
    capEnd: true,
    capEndMat: "MechFrame",
    panelMaterials: (sec, seg) => {
      if (seg === 1 || seg === 2) return "ArmorLight"; // Outer-upper & dorsal armor facets
      if (seg === 6) return "MechFrame";
      return "ArmorDark";
    },
  });

  // Recessed stealth intake mouth at front (-Z) with bronze intake splitter vane
  addHollowTube(
    rightLocal,
    "ArmorDark",
    "MechFrame",
    "BronzeRadiator",
    [0, 0.005, -0.84],
    [0, 0.005, -1.07],
    0.195,
    0.170,
    0.145,
    0.130,
    8,
    { angleOffset: Math.PI / 8, recessedCoreMat: "MechFrame", coreDepthFrac: 0.7 },
  );
  // Vertical bronze splitter blade inside stealth intake
  addBeveledBox(rightLocal, "BronzeRadiator", [0, 0.005, -1.00], [0.026, 0.22, 0.15], {
    bevel: 0.005,
  });

  // Side armored cheek plates & bronze heat-dissipation gills on outer nacelle wall (+X)
  addBeveledBox(rightLocal, "ArmorLight", [0.245, 0.02, -0.14], [0.06, 0.22, 0.88], {
    bevel: 0.014,
  });
  for (let i = 0; i < 3; i++) {
    addBeveledBox(rightLocal, "BronzeDeep", [0.265, 0.02, 0.36 + i * 0.15], [0.04, 0.14, 0.09], {
      bevel: 0.006,
    });
  }

  // Swept outer stealth strike winglet jutting outward (+X) from nacelle flank
  // Nacelle center is at x = ±1.04 -> wingtip reaches x = ±(1.04 + 0.62) = ±1.66!
  const outerWingPoly = [
    [0.19, -0.46],
    [0.62, -0.04],
    [0.62, 0.28],
    [0.18, 0.52],
  ];
  addExtrudedPolygonY(rightLocal, "ArmorDark", outerWingPoly, -0.03, 0.06, {
    bevelTop: 0.02,
    bevelBot: 0.015,
    topMat: "ArmorLight",
    botMat: "MechFrame",
  });
  // Wingtip stealth sensor / nav strobe bar
  addBeveledBox(rightLocal, "TealContainment", [0.615, 0.015, 0.12], [0.03, 0.035, 0.26], {
    bevel: 0.006,
  });

  // Outward-canted stealth V-tail stabilizer rising from aft nacelle
  const tailFin = new MeshPart("TailFin");
  addBeveledBox(tailFin, "ArmorDark", [0, 0.28, 0.66], [0.055, 0.56, 0.56], {
    bevel: 0.014,
    topMat: "BronzeRadiator",
  });
  addBeveledBox(tailFin, "ArmorLight", [0.022, 0.30, 0.68], [0.025, 0.42, 0.38], {
    bevel: 0.006,
  });
  rightLocal.mergeTRS(tailFin, [0.10, 0.16, 0], quatFromAxisAngle([0, 0, 1], -28 * DEG));

  return sideSign > 0 ? rightLocal : rightLocal.cloneMirroredX("NacelleLeftMesh");
}

function buildThrusterNozzle() {
  const part = new MeshPart("ThrusterNozzleMesh");
  // Faceted stealth vector-thrust shroud + glowing teal plasma exhaust core facing +Z
  addHollowTube(
    part,
    "MechFrame",
    "BronzeDeep",
    "BronzeRadiator",
    [0, 0, -0.10],
    [0, 0, 0.24],
    0.185,
    0.155,
    0.135,
    0.115,
    8,
    { angleOffset: Math.PI / 8, recessedCoreMat: "TealContainment", coreDepthFrac: 0.55 },
  );
  // Central glowing ion thrust cone
  addFrustum(part, "TealContainment", [0, 0, 0.04], [0, 0, 0.20], 0.075, 0.025, 8);
  return part;
}

function buildRocketPod(sideSign) {
  const pod = new MeshPart(sideSign > 0 ? "RocketPodRightMesh" : "RocketPodLeftMesh");

  // Unmistakable armored hexagonal multi-tube rocket launcher box (local z = -0.50 to +0.50)
  const podSections = [
    octProfileZ(-0.50, { halfW: 0.175, yBot: -0.135, yTop: 0.135, topHalfW: 0.115, botHalfW: 0.115 }),
    octProfileZ(-0.42, { halfW: 0.190, yBot: -0.148, yTop: 0.148, topHalfW: 0.125, botHalfW: 0.125 }),
    octProfileZ(0.40,  { halfW: 0.190, yBot: -0.148, yTop: 0.148, topHalfW: 0.125, botHalfW: 0.125 }),
    octProfileZ(0.50,  { halfW: 0.155, yBot: -0.120, yTop: 0.120, topHalfW: 0.100, botHalfW: 0.100 }),
  ];

  addLoft(pod, "ArmorDark", podSections, {
    capStart: true,
    capEnd: true,
    capStartMat: "BronzeRadiator",
    capEndMat: "MechFrame",
    panelMaterials: (_, seg) => (seg === 2 ? "ArmorLight" : "ArmorDark"),
  });

  // Heavy bronze blast-shield collar at the -Z front face
  addBeveledBox(pod, "BronzeRadiator", [0, 0, -0.49], [0.32, 0.24, 0.05], {
    bevel: 0.012,
  });

  // 6 distinct rocket launch tubes (3 columns x 2 rows) facing -Z with visible warhead cones!
  const cols = [-0.095, 0.0, 0.095];
  const rows = [-0.055, 0.055];
  for (const rx of cols) {
    for (const ry of rows) {
      addHollowTube(
        pod,
        "MechFrame",
        "MechFrame",
        "MechFrame",
        [rx, ry, -0.46],
        [rx, ry, -0.535],
        0.040,
        0.040,
        0.031,
        0.031,
        8,
        { recessedCoreMat: "MechFrame", coreDepthFrac: 0.85 },
      );
      // Recessed rocket warhead tip peeking out of each launch tube
      addFrustum(pod, "OrdnanceTip", [rx, ry, -0.48], [rx, ry, -0.532], 0.026, 0.006, 8);
    }
  }

  // Side target-laser pod & dorsal ammunition feed latch
  addBeveledBox(pod, "ArmorLight", [0, 0.16, -0.04], [0.16, 0.04, 0.58], { bevel: 0.01 });
  addBeveledBox(
    pod,
    "TealContainment",
    [sideSign * 0.185, 0.02, -0.32],
    [0.035, 0.05, 0.16],
    { bevel: 0.006 },
  );

  return pod;
}

function buildNacelleTeamPlate(sideSign) {
  const rightPlate = new MeshPart("TeamColorPlate_NacelleRight_Mesh");
  // Bold beveled dorsal chevron/trapezoid plate sitting proud atop the nacelle armor
  const poly = [
    [-0.13, -0.68],
    [0.14, -0.48],
    [0.15, 0.46],
    [-0.13, 0.62],
  ];
  addExtrudedPolygonY(rightPlate, "TeamColor", poly, 0.0, 0.036, {
    bevelTop: 0.012,
    insetTop: 0.018,
  });
  return sideSign > 0
    ? rightPlate
    : rightPlate.cloneMirroredX("TeamColorPlate_NacelleLeft_Mesh");
}

function buildSpineTeamPlate() {
  const plate = new MeshPart("TeamColorPlate_Spine_Mesh");
  // Crisp diamond spearhead TeamColor plate on central spine behind separated cockpit
  const poly = [
    [0.0, -0.30],
    [0.21, 0.06],
    [0.15, 0.44],
    [-0.15, 0.44],
    [-0.21, 0.06],
  ];
  addExtrudedPolygonY(plate, "TeamColor", poly, 0.0, 0.034, {
    bevelTop: 0.01,
    insetTop: 0.016,
  });
  return plate;
}

export function createNightHarrierAsset() {
  const airframeBaseY = 0.44;

  const nodes = [
    {
      id: "root",
      name: "NightHarrier",
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
      id: "fuselage",
      name: "FuselageCore",
      parent: "airframe",
      translation: [0, 0, 0],
      part: buildFuselageCore(),
    },
    {
      id: "cockpit",
      name: "CockpitPod",
      parent: "airframe",
      translation: [0, 0.03, 0],
      part: buildCockpitPod(),
    },
    {
      id: "tc_spine",
      name: "TeamColorPlate_Spine",
      parent: "airframe",
      translation: [0, 0.248, 0.02],
      part: buildSpineTeamPlate(),
    },

    // Left Armored Nacelle (-X)
    {
      id: "nacelle_l",
      name: "NacelleLeft",
      parent: "airframe",
      translation: [-1.04, 0.04, 0.06],
      part: buildSingleNacelle(-1),
    },
    {
      id: "tc_nacelle_l",
      name: "TeamColorPlate_NacelleLeft",
      parent: "nacelle_l",
      translation: [0, 0.238, -0.06],
      part: buildNacelleTeamPlate(-1),
    },
    {
      id: "thruster_l",
      name: "ThrusterNozzleLeft",
      parent: "nacelle_l",
      translation: [0, 0.01, 1.06],
      part: buildThrusterNozzle(),
    },

    // Right Armored Nacelle (+X)
    {
      id: "nacelle_r",
      name: "NacelleRight",
      parent: "airframe",
      translation: [1.04, 0.04, 0.06],
      part: buildSingleNacelle(1),
    },
    {
      id: "tc_nacelle_r",
      name: "TeamColorPlate_NacelleRight",
      parent: "nacelle_r",
      translation: [0, 0.238, -0.06],
      part: buildNacelleTeamPlate(1),
    },
    {
      id: "thruster_r",
      name: "ThrusterNozzleRight",
      parent: "nacelle_r",
      translation: [0, 0.01, 1.06],
      part: buildThrusterNozzle(),
    },

    // Twin Separated Rocket Launchers + MuzzleLeft / MuzzleRight anchors
    {
      id: "rocket_l",
      name: "RocketLauncherLeft",
      parent: "airframe",
      translation: [-0.58, -0.13, -0.82],
      part: buildRocketPod(-1),
    },
    {
      id: "muzzle_l",
      name: "MuzzleLeft",
      parent: "rocket_l",
      translation: [0, 0, -0.55],
    },
    {
      id: "rocket_r",
      name: "RocketLauncherRight",
      parent: "airframe",
      translation: [0.58, -0.13, -0.82],
      part: buildRocketPod(1),
    },
    {
      id: "muzzle_r",
      name: "MuzzleRight",
      parent: "rocket_r",
      translation: [0, 0, -0.55],
    },
  ];

  const y0 = airframeBaseY;
  const qId = quatIdentity();

  const animations = [
    {
      name: "idle",
      tracks: [
        {
          nodeId: "airframe",
          path: "translation",
          times: [0, 0.6, 1.2, 1.8, 2.4],
          values: [
            [0, y0, 0],
            [0, y0 + 0.025, 0],
            [0, y0 + 0.04, 0],
            [0, y0 + 0.018, 0],
            [0, y0, 0],
          ],
        },
        {
          nodeId: "airframe",
          path: "rotation",
          times: [0, 0.8, 1.6, 2.4],
          values: [
            qId,
            quatFromEulerYXZ(0, 0.6 * DEG, 0.8 * DEG),
            quatFromEulerYXZ(0, -0.5 * DEG, -0.8 * DEG),
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
          times: [0, 0.5, 1.0, 1.5, 2.0],
          values: [
            [0, y0 + 0.08, 0],
            [0.03, y0 + 0.16, -0.02],
            [0, y0 + 0.09, 0],
            [-0.03, y0 + 0.17, 0.02],
            [0, y0 + 0.08, 0],
          ],
        },
        {
          nodeId: "airframe",
          path: "rotation",
          times: [0, 0.5, 1.0, 1.5, 2.0],
          values: [
            qId,
            quatFromEulerYXZ(0, -1.6 * DEG, -2.5 * DEG),
            quatFromEulerYXZ(0, 0.8 * DEG, 0),
            quatFromEulerYXZ(0, -1.4 * DEG, 2.5 * DEG),
            qId,
          ],
        },
        {
          nodeId: "thruster_l",
          path: "rotation",
          times: [0, 0.5, 1.0, 1.5, 2.0],
          values: [
            qId,
            quatFromEulerYXZ(0, 4 * DEG, 0),
            qId,
            quatFromEulerYXZ(0, -3 * DEG, 0),
            qId,
          ],
        },
        {
          nodeId: "thruster_r",
          path: "rotation",
          times: [0, 0.5, 1.0, 1.5, 2.0],
          values: [
            qId,
            quatFromEulerYXZ(0, -3 * DEG, 0),
            qId,
            quatFromEulerYXZ(0, 4 * DEG, 0),
            qId,
          ],
        },
      ],
    },
    {
      name: "attack",
      tracks: [
        {
          nodeId: "airframe",
          path: "rotation",
          times: [0, 0.14, 0.28, 0.44, 0.68, 1.0],
          values: [
            qId,
            quatFromEulerYXZ(0, -8.5 * DEG, 1.5 * DEG),
            quatFromEulerYXZ(0, -6.5 * DEG, -1.8 * DEG),
            quatFromEulerYXZ(0, -9.0 * DEG, 0.8 * DEG),
            quatFromEulerYXZ(0, -3.0 * DEG, 0),
            qId,
          ],
        },
        {
          nodeId: "airframe",
          path: "translation",
          times: [0, 0.15, 0.38, 0.65, 1.0],
          values: [
            [0, y0, 0],
            [0, y0 + 0.04, 0.06],
            [0, y0 + 0.05, 0.10],
            [0, y0 + 0.02, 0.03],
            [0, y0, 0],
          ],
        },
        {
          nodeId: "rocket_l",
          path: "translation",
          times: [0, 0.10, 0.18, 0.46, 1.0],
          values: [
            [-0.58, -0.13, -0.82],
            [-0.58, -0.13, -0.84],
            [-0.58, -0.12, -0.66], // Sharp left rocket salvo recoil
            [-0.58, -0.13, -0.82],
            [-0.58, -0.13, -0.82],
          ],
        },
        {
          nodeId: "rocket_r",
          path: "translation",
          times: [0, 0.28, 0.36, 0.66, 1.0],
          values: [
            [0.58, -0.13, -0.82],
            [0.58, -0.13, -0.84],
            [0.58, -0.12, -0.66], // Staggered right rocket salvo recoil
            [0.58, -0.13, -0.82],
            [0.58, -0.13, -0.82],
          ],
        },
      ],
    },
    {
      name: "cast",
      tracks: [
        // Tactical Precision Rocket Barrage: flare up, lock ground target, rapid dual-pod salvo!
        {
          nodeId: "airframe",
          path: "translation",
          times: [0, 0.30, 0.55, 0.85, 1.15, 1.6],
          values: [
            [0, y0, 0],
            [0, y0 + 0.22, -0.05],
            [0, y0 + 0.18, 0.08],
            [0, y0 + 0.16, 0.14],
            [0, y0 + 0.10, 0.05],
            [0, y0, 0],
          ],
        },
        {
          nodeId: "airframe",
          path: "rotation",
          times: [0, 0.28, 0.52, 0.82, 1.15, 1.6],
          values: [
            qId,
            quatFromEulerYXZ(0, 6.0 * DEG, 0),
            quatFromEulerYXZ(0, -12.5 * DEG, -2.5 * DEG),
            quatFromEulerYXZ(0, -13.0 * DEG, 2.5 * DEG),
            quatFromEulerYXZ(0, -5.0 * DEG, 0),
            qId,
          ],
        },
        {
          nodeId: "rocket_l",
          path: "translation",
          times: [0, 0.45, 0.55, 0.72, 0.84, 1.25, 1.6],
          values: [
            [-0.58, -0.13, -0.82],
            [-0.56, -0.14, -0.88],
            [-0.56, -0.12, -0.64],
            [-0.56, -0.14, -0.86],
            [-0.56, -0.12, -0.65],
            [-0.58, -0.13, -0.82],
            [-0.58, -0.13, -0.82],
          ],
        },
        {
          nodeId: "rocket_r",
          path: "translation",
          times: [0, 0.52, 0.62, 0.78, 0.90, 1.25, 1.6],
          values: [
            [0.58, -0.13, -0.82],
            [0.56, -0.14, -0.88],
            [0.56, -0.12, -0.64],
            [0.56, -0.14, -0.86],
            [0.56, -0.12, -0.65],
            [0.58, -0.13, -0.82],
            [0.58, -0.13, -0.82],
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
          times: [0, 0.22, 0.65, 1.15, 1.50, 1.8],
          values: [
            [0, y0, 0],
            [0.08, y0 + 0.28, 0.06],
            [0.16, y0 + 0.36, -0.08],
            [0.12, y0 + 0.27, -0.14],
            [0.10, y0 + 0.26, -0.16],
            [0.10, y0 + 0.26, -0.16],
          ],
        },
        {
          nodeId: "airframe",
          path: "rotation",
          times: [0, 0.22, 0.70, 1.20, 1.55, 1.8],
          values: [
            qId,
            quatFromEulerYXZ(4 * DEG, 9 * DEG, -16 * DEG),
            quatFromEulerYXZ(12 * DEG, -14 * DEG, 28 * DEG),
            quatFromEulerYXZ(18 * DEG, -8 * DEG, 17 * DEG),
            quatFromEulerYXZ(19 * DEG, -6 * DEG, 14 * DEG),
            quatFromEulerYXZ(19 * DEG, -6 * DEG, 14 * DEG),
          ],
        },
        {
          nodeId: "nacelle_l",
          path: "rotation",
          times: [0, 0.35, 1.2, 1.8],
          values: [
            qId,
            quatFromEulerYXZ(-4 * DEG, -6 * DEG, 8 * DEG),
            quatFromEulerYXZ(-6 * DEG, -10 * DEG, 12 * DEG),
            quatFromEulerYXZ(-6 * DEG, -10 * DEG, 12 * DEG),
          ],
        },
      ],
    },
  ];

  const scene = {
    name: "NightHarrierScene",
    nodes,
    animations,
  };

  return normalizeAssetScene(scene, {
    targetRadius: 1.875,
    floorY: 0,
    bodyRootId: "airframe",
  });
}
