import { hexToLinearRgba } from './math.js';

// Cohesive Meridian Starfall Command PBR material palette.
// Moderate metallic values ensure crisp value separation in both IBL and directional-only RTS renderers.
export const MATERIAL_LIBRARY = {
  TeamColor: {
    name: 'TeamColor',
    baseColorFactor: hexToLinearRgba('#2C75EB', 1.0),
    metallicFactor: 0.22,
    roughnessFactor: 0.40,
  },
  ArmorDark: {
    name: 'ArmorDark',
    baseColorFactor: hexToLinearRgba('#323944', 1.0),
    metallicFactor: 0.45,
    roughnessFactor: 0.52,
  },
  ArmorMid: {
    name: 'ArmorMid',
    baseColorFactor: hexToLinearRgba('#4C5665', 1.0),
    metallicFactor: 0.40,
    roughnessFactor: 0.46,
  },
  SteelStructure: {
    name: 'SteelStructure',
    baseColorFactor: hexToLinearRgba('#84909E', 1.0),
    metallicFactor: 0.55,
    roughnessFactor: 0.36,
  },
  DishReflector: {
    name: 'DishReflector',
    baseColorFactor: hexToLinearRgba('#BAC4D0', 1.0),
    metallicFactor: 0.50,
    roughnessFactor: 0.30,
  },
  DarkTrim: {
    name: 'DarkTrim',
    baseColorFactor: hexToLinearRgba('#1B2027', 1.0),
    metallicFactor: 0.28,
    roughnessFactor: 0.72,
  },
  HazardTrim: {
    name: 'HazardTrim',
    baseColorFactor: hexToLinearRgba('#DCA028', 1.0),
    metallicFactor: 0.18,
    roughnessFactor: 0.48,
  },
  EmissiveCyan: {
    name: 'EmissiveCyan',
    baseColorFactor: hexToLinearRgba('#46DCFF', 1.0),
    emissiveFactor: [0.12, 0.68, 0.96],
    metallicFactor: 0.10,
    roughnessFactor: 0.25,
  },
};

export const MATERIAL_ORDER = [
  'TeamColor',
  'ArmorDark',
  'ArmorMid',
  'SteelStructure',
  'DishReflector',
  'DarkTrim',
  'HazardTrim',
  'EmissiveCyan',
];
