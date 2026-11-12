// Ignition Core (ignition_core.glb)
// Starfall Command — Meridian Faction
// Radius: 3.75 | Y-up, floor 0, faces -Z
// Industrial military fusion plant with nested bronze radiator shielding
// and central teal containment torus.

import { DEG, quatFromAxisAngle, quatFromEulerYXZ, quatIdentity, quatMul } from "../math.mjs";
import {
  MeshPart,
  addBeveledBox,
  addExtrudedPolygonY,
  addFrustum,
  addHollowTube,
  addTorusY,
} from "../mesh-builder.mjs";
import { normalizeAssetScene } from "../glb-writer.mjs";

function regularPolygonXZ(radius, sides, angleOffset = 0) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + angleOffset;
    pts.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return pts;
}

function buildFoundationAndButtresses() {
  const part = new MeshPart("IgnitionCoreFoundationMesh");

  // 16-sided fortified industrial military foundation plinth (exact R = 3.75 at cardinal points 0, 90, 180, 270 deg!)
  const basePoly = regularPolygonXZ(3.75, 16, 0);
  addExtrudedPolygonY(part, "FoundationSteel", basePoly, 0.0, 0.36, {
    bevelTop: 0.08,
    insetTop: 0.14,
    topMat: "ArmorDark",
    botMat: "MechFrame",
  });

  // Second stepped armored reactor deck
  const deckPoly = regularPolygonXZ(3.34, 16, 0);
  addExtrudedPolygonY(part, "ArmorDark", deckPoly, 0.36, 0.68, {
    bevelTop: 0.06,
    insetTop: 0.10,
    topMat: "ArmorLight",
    capBot: false,
  });

  // Recessed central magnetic reactor pit rim + glowing teal floor ring
  addHollowTube(
    part,
    "ArmorDark",
    "MechFrame",
    "BronzeDeep",
    [0, 0.68, 0],
    [0, 0.96, 0],
    2.02,
    1.94,
    1.62,
    1.58,
    16,
    { recessedCoreMat: "TealContainment", coreDepthFrac: 0.75 },
  );

  // Cardinal heavy anchor pads at N (-Z), S (+Z), E (+X), W (-X) inside exact 3.75 circle
  for (let i = 0; i < 4; i++) {
    const yaw = i * 90 * DEG;
    const pad = new MeshPart("CardinalPad");
    addBeveledBox(pad, "ArmorDark", [0, 0.24, -3.36], [1.10, 0.44, 0.60], {
      bevel: 0.03,
      topMat: "ArmorLight",
    });
    addBeveledBox(pad, "BronzeDeep", [0, 0.48, -3.32], [0.74, 0.08, 0.34], {
      bevel: 0.012,
    });
    part.mergeTRS(pad, [0, 0, 0], quatFromAxisAngle([0, 1, 0], yaw));
  }

  // Directional -Z Front Command & Power Distribution Bunker (unmistakable -Z orientation!)
  addBeveledBox(part, "ArmorDark", [0, 0.78, -3.14], [1.62, 0.84, 0.96], {
    bevel: 0.06,
    topMat: "ArmorLight",
  });
  // Armored blast doorway & glowing teal reactor control slit facing -Z
  addBeveledBox(part, "MechFrame", [0, 0.52, -3.60], [0.68, 0.56, 0.12], { bevel: 0.02 });
  addBeveledBox(part, "CockpitCanopy", [0, 0.96, -3.60], [1.14, 0.20, 0.10], { bevel: 0.015 });
  addBeveledBox(part, "TealContainment", [0, 0.96, -3.64], [0.92, 0.08, 0.05], { bevel: 0.008 });
  for (const sx of [-1, 1]) {
    // Flanking bronze high-voltage power busbars on -Z front
    addFrustum(
      part,
      "BronzeRadiator",
      [sx * 0.62, 0.62, -3.52],
      [sx * 0.62, 0.62, -3.72],
      0.13,
      0.10,
      10,
    );
  }

  // Four Heavy Diagonal Structural Buttress Pylons (45, 135, 225, 315 deg)
  for (let i = 0; i < 4; i++) {
    const yaw = (45 + i * 90) * DEG;
    const buttress = new MeshPart("DiagonalButtress");

    // Lower diagonal base foot
    addBeveledBox(buttress, "ArmorDark", [0, 0.62, -3.12], [0.88, 0.86, 0.92], {
      bevel: 0.05,
      topMat: "ArmorLight",
    });

    // Angled rising structural pylon arm leaning inward toward reactor crown
    const arm = new MeshPart("ButtressArm");
    addBeveledBox(arm, "ArmorDark", [0, 0.95, 0], [0.68, 2.05, 0.64], {
      bevel: 0.045,
      topMat: "ArmorLight",
    });
    addBeveledBox(arm, "MechFrame", [0, 0.95, 0.28], [0.42, 1.75, 0.18], {
      bevel: 0.02,
    });
    addBeveledBox(arm, "BronzeRadiator", [0, 1.98, 0.16], [0.50, 0.20, 0.48], {
      bevel: 0.02,
    });
    // Glowing teal field-link node facing inward toward the central torus
    addBeveledBox(arm, "TealContainment", [0, 1.62, 0.34], [0.22, 0.36, 0.08], {
      bevel: 0.01,
    });

    buttress.mergeTRS(arm, [0, 0.72, -3.02], quatFromAxisAngle([1, 0, 0], 22 * DEG));
    part.mergeTRS(buttress, [0, 0, 0], quatFromAxisAngle([0, 1, 0], yaw));
  }

  return part;
}

function buildCentralPinchSpire() {
  const part = new MeshPart("CentralPinchSpireMesh");

  // Lower magnetic pedestal rising from reactor pit
  addFrustum(part, "MechFrame", [0, 0.65, 0], [0, 1.42, 0], 0.72, 0.52, 12);
  addFrustum(part, "BronzeRadiator", [0, 1.42, 0], [0, 1.66, 0], 0.58, 0.46, 12);

  // Glowing central teal plasma pinch column right through the torus eye!
  addFrustum(part, "TealContainment", [0, 1.66, 0], [0, 2.86, 0], 0.34, 0.34, 12, {
    smooth: true,
  });

  // Upper superconducting magnetic crown & spire cap (Y = 2.86 to 4.24)
  addFrustum(part, "BronzeRadiator", [0, 2.86, 0], [0, 3.12, 0], 0.48, 0.60, 12);
  addFrustum(part, "ArmorDark", [0, 3.12, 0], [0, 3.68, 0], 0.56, 0.30, 12, {
    capEndMat: "ArmorLight",
  });
  addFrustum(part, "BronzeRadiator", [0, 3.68, 0], [0, 4.08, 0], 0.22, 0.09, 10);
  addFrustum(part, "TealContainment", [0, 4.08, 0], [0, 4.26, 0], 0.09, 0.03, 8);

  // 4 radial magnetic support ribs bridging upper spire cap outward over torus inner rim
  for (let i = 0; i < 4; i++) {
    const rib = new MeshPart("SpireRib");
    addBeveledBox(rib, "ArmorLight", [0, 3.24, -0.56], [0.14, 0.18, 0.68], {
      bevel: 0.02,
      botMat: "BronzeDeep",
    });
    part.mergeTRS(rib, [0, 0, 0], quatFromAxisAngle([0, 1, 0], i * 90 * DEG));
  }

  return part;
}

function buildContainmentTorusAssembly() {
  const part = new MeshPart("CentralTealContainmentTorusMesh");

  // Prominent, high-visibility Central Teal Containment Torus (centered at local [0, 0, 0])
  // majorR = 1.42, minorR = 0.37 -> outer edge at 1.79, inner eye at 1.05
  addTorusY(part, "TealContainment", [0, 0, 0], 1.42, 0.37, 20, 10, {
    smooth: true,
    scaleY: 0.95,
  });

  // 8 Superconducting Poloidal Field Clamps wrapping around narrow slices of the torus
  // leaving wide, unobstructed glowing teal plasma windows visible from RTS zoom!
  for (let i = 0; i < 8; i++) {
    const phi = (i / 8) * Math.PI * 2;
    addTorusY(part, "BronzeRadiator", [0, 0, 0], 1.42, 0.42, 1, 8, {
      arcStart: phi - 0.045,
      arcSweep: 0.09,
      smooth: false,
      capEnds: true,
      scaleY: 0.98,
    });
  }

  return part;
}

function buildInnerConfinementGyro() {
  const part = new MeshPart("InnerConfinementGyroMesh");
  // Counter-rotating bronze magnetic stabilizer ring above/inside the torus throat
  addTorusY(part, "BronzeRadiator", [0, 0, 0], 0.88, 0.075, 16, 8, {
    smooth: false,
  });
  for (let i = 0; i < 4; i++) {
    const emitter = new MeshPart("GyroEmitter");
    addBeveledBox(emitter, "ArmorLight", [0, 0, -0.88], [0.18, 0.18, 0.26], {
      bevel: 0.02,
    });
    addBeveledBox(emitter, "TealContainment", [0, 0, -1.01], [0.10, 0.10, 0.05], {
      bevel: 0.008,
    });
    part.mergeTRS(emitter, [0, 0, 0], quatFromAxisAngle([0, 1, 0], (i * 90 + 45) * DEG));
  }
  return part;
}

// Single Outer Bronze Radiator Shield Petal (pivoted at its base hinge so it can flare open!)
function buildOuterBronzeShieldPetal() {
  const part = new MeshPart("OuterBronzeShieldPetalMesh");

  // Local origin = base hinge at radius R = 2.84, y = 0.68, facing radially outward along -Z
  // Broad curved/angled bronze radiator shield wall (height 1.88, width 1.34)
  const mainShield = new MeshPart("OuterShieldBody");

  // Main bright brushed-bronze thermal shield plate (inner face reflects reactor glow!)
  addBeveledBox(mainShield, "BronzeRadiator", [0, 0.94, 0.0], [1.28, 1.84, 0.14], {
    bevel: 0.03,
  });

  // Angled upper bronze crown hood
  addBeveledBox(mainShield, "BronzeRadiator", [0, 1.86, 0.10], [1.14, 0.18, 0.34], {
    bevel: 0.025,
  });

  // 4 Stacked darker bronze radiator cooling louver fins on outer (-Z) face
  for (let row = 0; row < 4; row++) {
    const ly = 0.38 + row * 0.38;
    addBeveledBox(mainShield, "BronzeDeep", [0, ly, -0.10], [1.08, 0.16, 0.12], {
      bevel: 0.012,
      botMat: "MechFrame",
    });
  }

  // Heavy dark gunmetal structural side cheek frames
  for (const sx of [-1, 1]) {
    addBeveledBox(mainShield, "ArmorDark", [sx * 0.62, 0.90, -0.04], [0.14, 1.76, 0.26], {
      bevel: 0.014,
    });
  }

  // Slight natural outward cant (12 deg) so RTS overhead camera sees nested bronze interiors!
  part.mergeTRS(mainShield, [0, 0, 0], quatFromAxisAngle([1, 0, 0], -12 * DEG));
  return part;
}

// Single Inner Bronze Radiator Shield Petal (taller, narrower, nested & staggered 22.5 deg inside outer ring!)
function buildInnerBronzeShieldPetal() {
  const part = new MeshPart("InnerBronzeShieldPetalMesh");

  const innerBody = new MeshPart("InnerShieldBody");
  // Taller bronze radiator fin (height 2.28, width 0.88) creating unmistakable nested concentric shielding!
  addBeveledBox(innerBody, "BronzeRadiator", [0, 1.14, 0.0], [0.86, 2.24, 0.12], {
    bevel: 0.025,
  });
  addBeveledBox(innerBody, "BronzeDeep", [0, 1.12, -0.08], [0.66, 1.96, 0.09], {
    bevel: 0.015,
  });
  // Vertical bronze heat-pipe spine on outer back
  addBeveledBox(innerBody, "ArmorDark", [0, 1.05, -0.13], [0.16, 1.85, 0.10], {
    bevel: 0.015,
  });
  // Luminous teal thermal sensor strip near inner shield tip
  addBeveledBox(innerBody, "TealContainment", [0, 2.08, 0.065], [0.46, 0.08, 0.04], {
    bevel: 0.008,
  });

  part.mergeTRS(innerBody, [0, 0, 0], quatFromAxisAngle([1, 0, 0], -8 * DEG));
  return part;
}

function buildButtressTeamPlate(meshName) {
  const part = new MeshPart(meshName);
  // Bold beveled armor identification plate mounted atop each diagonal buttress shoulder
  const poly = [
    [-0.31, -0.44],
    [0.31, -0.44],
    [0.26, 0.42],
    [-0.26, 0.42],
  ];
  addExtrudedPolygonY(part, "TeamColor", poly, 0, 0.055, {
    bevelTop: 0.018,
    insetTop: 0.025,
  });
  return part;
}

function buildCommandFrontTeamPlate() {
  const part = new MeshPart("TeamColorPlate_CommandFront_Mesh");
  const poly = [
    [-0.64, -0.34],
    [0.64, -0.34],
    [0.52, 0.30],
    [-0.52, 0.30],
  ];
  addExtrudedPolygonY(part, "TeamColor", poly, 0, 0.05, {
    bevelTop: 0.016,
    insetTop: 0.024,
  });
  return part;
}

export function createIgnitionCoreAsset() {
  const nodes = [
    {
      id: "root",
      name: "IgnitionCore",
      parent: null,
      translation: [0, 0, 0],
    },
    {
      id: "structure",
      name: "ReactorStructure",
      parent: "root",
      translation: [0, 0, 0],
    },
    {
      id: "foundation",
      name: "FoundationAndButtresses",
      parent: "structure",
      translation: [0, 0, 0],
      part: buildFoundationAndButtresses(),
    },
    {
      id: "spire",
      name: "CentralPinchSpire",
      parent: "structure",
      translation: [0, 0, 0],
      part: buildCentralPinchSpire(),
    },
    {
      id: "torus",
      name: "CentralContainmentTorus",
      parent: "structure",
      translation: [0, 2.24, 0],
      part: buildContainmentTorusAssembly(),
    },
    {
      id: "gyro",
      name: "InnerConfinementGyro",
      parent: "structure",
      translation: [0, 2.86, 0],
      part: buildInnerConfinementGyro(),
    },
    // Discharge / effect origin anchor at top of central pinch spire
    {
      id: "muzzle",
      name: "Muzzle",
      parent: "spire",
      translation: [0, 4.26, 0],
    },

    // Separate Named TeamColor Plates (Front Command Bay + 4 Diagonal Buttresses)
    {
      id: "tc_front",
      name: "TeamColorPlate_CommandFront",
      parent: "structure",
      translation: [0, 1.20, -3.12],
      part: buildCommandFrontTeamPlate(),
    },
  ];

  const buttressLabels = [
    { id: "tc_fl", name: "TeamColorPlate_FrontLeft", deg: 45 },
    { id: "tc_rl", name: "TeamColorPlate_RearLeft", deg: 135 },
    { id: "tc_rr", name: "TeamColorPlate_RearRight", deg: 225 },
    { id: "tc_fr", name: "TeamColorPlate_FrontRight", deg: 315 },
  ];

  for (const b of buttressLabels) {
    const yawQ = quatFromAxisAngle([0, 1, 0], b.deg * DEG);
    const tiltQ = quatFromAxisAngle([1, 0, 0], -52 * DEG); // Seated cleanly against the sloped buttress shoulder!
    const rad = 2.86;
    const px = -Math.sin(b.deg * DEG) * rad;
    const pz = -Math.cos(b.deg * DEG) * rad;
    nodes.push({
      id: b.id,
      name: b.name,
      parent: "structure",
      translation: [px, 2.18, pz],
      rotation: quatMul(yawQ, tiltQ),
      part: buildButtressTeamPlate(`${b.name}_Mesh`),
    });
  }

  // Build Nested Bronze Radiator Shielding:
  // - 8 Outer Bronze Radiator Shield Petals at R = 2.84 (angles 0, 45, 90, ..., 315 deg — skipping 0 deg? Wait:
  //   at 0 deg (-Z) is the front command bay at R = 3.14; placing outer shields at 22.5 + k*45 deg
  //   nestles them cleanly between the cardinal bays and diagonal buttresses, while inner shields sit at k*45 deg!)
  const sharedOuterPetal = buildOuterBronzeShieldPetal();
  const sharedInnerPetal = buildInnerBronzeShieldPetal();

  const outerPetalInfos = [];
  const innerPetalInfos = [];

  for (let k = 0; k < 8; k++) {
    // Outer ring at 22.5 + k * 45 deg, radius 2.80
    const outDeg = 22.5 + k * 45;
    const outRad = outDeg * DEG;
    const outR = 2.80;
    const outX = -Math.sin(outRad) * outR;
    const outZ = -Math.cos(outRad) * outR;
    const outYaw = quatFromAxisAngle([0, 1, 0], outRad);
    const outId = `outer_shield_${k}`;
    outerPetalInfos.push({ id: outId, yaw: outYaw });

    nodes.push({
      id: outId,
      name: `OuterBronzeShield_${k}`,
      parent: "structure",
      translation: [outX, 0.68, outZ],
      rotation: outYaw,
      part: sharedOuterPetal,
      meshName: `OuterBronzeShieldMesh_${k}`,
    });

    // Inner nested ring staggered at k * 45 deg, radius 2.16 (taller nested crown!)
    const inDeg = k * 45;
    const inRad = inDeg * DEG;
    const inR = 2.16;
    const inX = -Math.sin(inRad) * inR;
    const inZ = -Math.cos(inRad) * inR;
    const inYaw = quatFromAxisAngle([0, 1, 0], inRad);
    const inId = `inner_shield_${k}`;
    innerPetalInfos.push({ id: inId, yaw: inYaw });

    nodes.push({
      id: inId,
      name: `InnerBronzeShield_${k}`,
      parent: "structure",
      translation: [inX, 0.86, inZ],
      rotation: inYaw,
      part: sharedInnerPetal,
      meshName: `InnerBronzeShieldMesh_${k}`,
    });
  }

  const qId = quatIdentity();

  // Animations:
  // 1. idle: Smooth 360-deg central containment torus magnetic rotation, counter-rotating inner gyro,
  //    subtle torus levitation pulse, gentle thermal breathing of nested bronze radiator shields.
  const idleTracks = [
    {
      nodeId: "torus",
      path: "rotation",
      times: [0, 1.0, 2.0, 3.0, 4.0],
      values: [
        quatFromAxisAngle([0, 1, 0], 0),
        quatFromAxisAngle([0, 1, 0], 90 * DEG),
        quatFromAxisAngle([0, 1, 0], 180 * DEG),
        quatFromAxisAngle([0, 1, 0], 270 * DEG),
        quatFromAxisAngle([0, 1, 0], 360 * DEG),
      ],
    },
    {
      nodeId: "torus",
      path: "translation",
      times: [0, 1.0, 2.0, 3.0, 4.0],
      values: [
        [0, 2.24, 0],
        [0, 2.30, 0],
        [0, 2.24, 0],
        [0, 2.30, 0],
        [0, 2.24, 0],
      ],
    },
    {
      nodeId: "gyro",
      path: "rotation",
      times: [0, 1.0, 2.0, 3.0, 4.0],
      values: [
        quatFromAxisAngle([0, 1, 0], 0),
        quatFromAxisAngle([0, 1, 0], -90 * DEG),
        quatFromAxisAngle([0, 1, 0], -180 * DEG),
        quatFromAxisAngle([0, 1, 0], -270 * DEG),
        quatFromAxisAngle([0, 1, 0], -360 * DEG),
      ],
    },
  ];

  // 2. cast (Reactor Overdrive / Containment Surge):
  //    Nested inner & outer bronze radiator shields flare outward to vent plasma heat
  //    while the central teal containment torus levitates higher and spins at double speed!
  const castTracks = [
    {
      nodeId: "torus",
      path: "translation",
      times: [0, 0.45, 1.15, 1.8],
      values: [
        [0, 2.24, 0],
        [0, 2.52, 0],
        [0, 2.48, 0],
        [0, 2.24, 0],
      ],
    },
    {
      nodeId: "torus",
      path: "scale",
      times: [0, 0.45, 0.90, 1.35, 1.8],
      values: [
        [1, 1, 1],
        [1.05, 1.08, 1.05],
        [1.02, 1.03, 1.02],
        [1.05, 1.07, 1.05],
        [1, 1, 1],
      ],
    },
    {
      nodeId: "torus",
      path: "rotation",
      times: [0, 0.45, 0.90, 1.35, 1.8],
      values: [
        quatFromAxisAngle([0, 1, 0], 0),
        quatFromAxisAngle([0, 1, 0], 180 * DEG),
        quatFromAxisAngle([0, 1, 0], 360 * DEG),
        quatFromAxisAngle([0, 1, 0], 540 * DEG),
        quatFromAxisAngle([0, 1, 0], 720 * DEG),
      ],
    },
    {
      nodeId: "gyro",
      path: "rotation",
      times: [0, 0.45, 0.90, 1.35, 1.8],
      values: [
        quatFromAxisAngle([0, 1, 0], 0),
        quatFromAxisAngle([0, 1, 0], -180 * DEG),
        quatFromAxisAngle([0, 1, 0], -360 * DEG),
        quatFromAxisAngle([0, 1, 0], -540 * DEG),
        quatFromAxisAngle([0, 1, 0], -720 * DEG),
      ],
    },
  ];

  // 3. death (Containment Breach & Radiator Collapse):
  //    Torus destabilizes off-axis, drops into the reactor well & shrinks out,
  //    while nested bronze radiator shields buckle inward asymmetrically!
  const deathTracks = [
    {
      nodeId: "torus",
      path: "translation",
      times: [0, 0.25, 0.65, 1.25, 1.8],
      values: [
        [0, 2.24, 0],
        [0.06, 2.42, -0.05],
        [-0.08, 1.85, 0.06],
        [0, 1.18, 0],
        [0, 1.12, 0],
      ],
    },
    {
      nodeId: "torus",
      path: "rotation",
      times: [0, 0.25, 0.70, 1.30, 1.8],
      values: [
        qId,
        quatFromEulerYXZ(35 * DEG, 14 * DEG, -12 * DEG),
        quatFromEulerYXZ(95 * DEG, -22 * DEG, 18 * DEG),
        quatFromEulerYXZ(140 * DEG, 16 * DEG, -20 * DEG),
        quatFromEulerYXZ(145 * DEG, 16 * DEG, -20 * DEG),
      ],
    },
    {
      nodeId: "torus",
      path: "scale",
      times: [0, 0.30, 0.90, 1.50, 1.8],
      values: [
        [1, 1, 1],
        [1.06, 0.94, 1.06],
        [0.82, 0.72, 0.82],
        [0.45, 0.35, 0.45],
        [0.42, 0.32, 0.42],
      ],
    },
    {
      nodeId: "gyro",
      path: "translation",
      times: [0, 0.40, 1.20, 1.8],
      values: [
        [0, 2.86, 0],
        [0, 2.65, 0],
        [0, 1.55, 0],
        [0, 1.52, 0],
      ],
    },
    {
      nodeId: "spire",
      path: "rotation",
      times: [0, 0.35, 1.25, 1.8],
      values: [
        qId,
        quatFromEulerYXZ(0, 2.5 * DEG, -2.0 * DEG),
        quatFromEulerYXZ(0, -4.5 * DEG, 3.5 * DEG),
        quatFromEulerYXZ(0, -4.5 * DEG, 3.5 * DEG),
      ],
    },
  ];

  // Add synchronized / staggered radiator shield tracks
  for (let k = 0; k < 8; k++) {
    const outInfo = outerPetalInfos[k];
    const inInfo = innerPetalInfos[k];

    const flareOut14 = quatMul(outInfo.yaw, quatFromAxisAngle([1, 0, 0], -14 * DEG));
    const flareIn12 = quatMul(inInfo.yaw, quatFromAxisAngle([1, 0, 0], -12 * DEG));
    const breatheOut = quatMul(outInfo.yaw, quatFromAxisAngle([1, 0, 0], -3.0 * DEG));
    const breatheIn = quatMul(inInfo.yaw, quatFromAxisAngle([1, 0, 0], -2.5 * DEG));

    idleTracks.push(
      {
        nodeId: outInfo.id,
        path: "rotation",
        times: [0, 2.0, 4.0],
        values: [outInfo.yaw, breatheOut, outInfo.yaw],
      },
      {
        nodeId: inInfo.id,
        path: "rotation",
        times: [0, 2.0, 4.0],
        values: [inInfo.yaw, breatheIn, inInfo.yaw],
      },
    );

    castTracks.push(
      {
        nodeId: outInfo.id,
        path: "rotation",
        times: [0, 0.40, 1.20, 1.8],
        values: [outInfo.yaw, flareOut14, flareOut14, outInfo.yaw],
      },
      {
        nodeId: inInfo.id,
        path: "rotation",
        times: [0, 0.35, 1.15, 1.8],
        values: [inInfo.yaw, flareIn12, flareIn12, inInfo.yaw],
      },
    );

    const collapseTilt = (k % 2 === 0 ? 22 : 15) * DEG;
    const collapseInner = (k % 2 === 0 ? 18 : 26) * DEG;
    deathTracks.push(
      {
        nodeId: outInfo.id,
        path: "rotation",
        times: [0, 0.30, 1.15, 1.8],
        values: [
          outInfo.yaw,
          flareOut14,
          quatMul(outInfo.yaw, quatFromAxisAngle([1, 0, 0], collapseTilt)),
          quatMul(outInfo.yaw, quatFromAxisAngle([1, 0, 0], collapseTilt)),
        ],
      },
      {
        nodeId: inInfo.id,
        path: "rotation",
        times: [0, 0.25, 1.10, 1.8],
        values: [
          inInfo.yaw,
          flareIn12,
          quatMul(inInfo.yaw, quatFromAxisAngle([1, 0, 0], collapseInner)),
          quatMul(inInfo.yaw, quatFromAxisAngle([1, 0, 0], collapseInner)),
        ],
      },
    );
  }

  const animations = [
    { name: "idle", tracks: idleTracks },
    { name: "cast", tracks: castTracks },
    { name: "death", tracks: deathTracks },
  ];

  const scene = {
    name: "IgnitionCoreScene",
    nodes,
    animations,
  };

  return normalizeAssetScene(scene, {
    targetRadius: 3.75,
    floorY: 0,
    bodyRootId: "structure",
  });
}
