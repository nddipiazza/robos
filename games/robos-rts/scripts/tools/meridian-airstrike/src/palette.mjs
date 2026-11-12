// Starfall Command — Meridian Faction PBR Material Library
// Untextured glTF 2.0 metallic-roughness materials tuned for strong readability at RTS zoom.

export const MERIDIAN_MATERIALS = {
  // Dedicated TeamColor material for separate named TeamColor armor plates
  TeamColor: {
    name: "TeamColor",
    baseColorFactor: [0.84, 0.21, 0.17, 1.0],
    metallicFactor: 0.22,
    roughnessFactor: 0.36,
  },

  // Primary Meridian stealth/combat slate-gunmetal armor
  ArmorDark: {
    name: "MeridianArmorDark",
    baseColorFactor: [0.19, 0.22, 0.27, 1.0],
    metallicFactor: 0.58,
    roughnessFactor: 0.44,
  },

  // Lighter titanium-steel upper hull paneling for crisp RTS value separation
  ArmorLight: {
    name: "MeridianArmorLight",
    baseColorFactor: [0.38, 0.43, 0.50, 1.0],
    metallicFactor: 0.64,
    roughnessFactor: 0.36,
  },

  // Deep recessed mechanical frame, hinges, intakes, radiator louvers, weapon barrels
  MechFrame: {
    name: "MeridianMechFrame",
    baseColorFactor: [0.10, 0.12, 0.15, 1.0],
    metallicFactor: 0.45,
    roughnessFactor: 0.66,
  },

  // Fortified concrete-alloy structural foundation for Meridian ground structures
  FoundationSteel: {
    name: "MeridianFoundation",
    baseColorFactor: [0.25, 0.27, 0.30, 1.0],
    metallicFactor: 0.32,
    roughnessFactor: 0.72,
  },

  // Signature Meridian nested bronze radiator shielding & thermal hardware
  BronzeRadiator: {
    name: "MeridianBronzeShield",
    baseColorFactor: [0.74, 0.48, 0.24, 1.0],
    metallicFactor: 0.84,
    roughnessFactor: 0.28,
  },

  // Darker aged bronze inner fins & actuator trim for nested depth contrast
  BronzeDeep: {
    name: "MeridianBronzeDeep",
    baseColorFactor: [0.52, 0.32, 0.15, 1.0],
    metallicFactor: 0.80,
    roughnessFactor: 0.36,
  },

  // Central teal plasma containment torus, ion thrusters, targeting energy rails
  TealContainment: {
    name: "MeridianTealContainment",
    baseColorFactor: [0.14, 0.92, 0.86, 1.0],
    metallicFactor: 0.08,
    roughnessFactor: 0.18,
    emissiveFactor: [0.10, 0.82, 0.76],
  },

  // Polarized teal-tinted armored cockpit canopy & optical sensor glass
  CockpitCanopy: {
    name: "MeridianCockpitGlass",
    baseColorFactor: [0.10, 0.38, 0.46, 1.0],
    metallicFactor: 0.86,
    roughnessFactor: 0.14,
    emissiveFactor: [0.03, 0.18, 0.22],
  },

  // High-temperature ordnance warhead tips / warning hardware accents
  OrdnanceTip: {
    name: "MeridianOrdnanceAccent",
    baseColorFactor: [0.88, 0.64, 0.22, 1.0],
    metallicFactor: 0.50,
    roughnessFactor: 0.34,
  },
};
