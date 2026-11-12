// Meridian Guard PBR Material Palette for Starfall Command capital, air, and drone assets.
// Tuned for crisp plane separation and immediate RTS readability under -56 deg directional + sky lighting.

function hexToRgba(hex, alpha = 1.0) {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  // Convert sRGB hex to linear-light glTF baseColorFactor / emissiveFactor
  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [
    Math.round(toLin(r) * 1e6) / 1e6,
    Math.round(toLin(g) * 1e6) / 1e6,
    Math.round(toLin(b) * 1e6) / 1e6,
    alpha,
  ];
}

function hexToRgb(hex, boost = 1.0) {
  const [r, g, b] = hexToRgba(hex, 1.0);
  return [
    Math.min(1, Math.round(r * boost * 1e6) / 1e6),
    Math.min(1, Math.round(g * boost * 1e6) / 1e6),
    Math.min(1, Math.round(b * boost * 1e6) / 1e6),
  ];
}

export const MERIDIAN_MATERIALS = [
  {
    // Index 0: Named TeamColor material (Meridian Guard tactical cobalt blue)
    name: 'TeamColor',
    baseColorFactor: hexToRgba('#2568ef', 1.0),
    metallicFactor: 0.22,
    roughnessFactor: 0.42,
    emissiveFactor: hexToRgb('#1b4fd8', 0.28),
  },
  {
    // Index 1: Deep obsidian recessed trough / structural underframe / barrel slot interior
    name: 'HullObsidian',
    baseColorFactor: hexToRgba('#161b23', 1.0),
    metallicFactor: 0.48,
    roughnessFactor: 0.64,
    emissiveFactor: [0, 0, 0],
  },
  {
    // Index 2: Heavy dark charcoal main armor plating (primary dreadnought & turret lower hull)
    name: 'ArmorDark',
    baseColorFactor: hexToRgba('#262f3b', 1.0),
    metallicFactor: 0.52,
    roughnessFactor: 0.52,
    emissiveFactor: [0, 0, 0],
  },
  {
    // Index 3: Mid-slate tactical armor carapace (layered upper plates, aircraft fuselage, turret cheeks)
    name: 'ArmorSlate',
    baseColorFactor: hexToRgba('#495668', 1.0),
    metallicFactor: 0.44,
    roughnessFactor: 0.48,
    emissiveFactor: [0, 0, 0],
  },
  {
    // Index 4: Light steel bevels, shroud intake lips, dish rims, mechanical struts
    name: 'SteelLight',
    baseColorFactor: hexToRgba('#93a2b5', 1.0),
    metallicFactor: 0.58,
    roughnessFactor: 0.38,
    emissiveFactor: [0, 0, 0],
  },
  {
    // Index 5: Radome / AWACS dielectric composite off-white-grey (makes support dishes read unmistakably!)
    name: 'RadomeComposite',
    baseColorFactor: hexToRgba('#cfd8e3', 1.0),
    metallicFactor: 0.12,
    roughnessFactor: 0.46,
    emissiveFactor: [0, 0, 0],
  },
  {
    // Index 6: Luminous Meridian cyan sensor glass, laser optics, rail accelerator slots
    name: 'SensorCyan',
    baseColorFactor: hexToRgba('#5ce6ff', 1.0),
    metallicFactor: 0.08,
    roughnessFactor: 0.18,
    emissiveFactor: hexToRgb('#38d6ff', 0.92),
  },
  {
    // Index 7: High-intensity siege emitter / plasma capacitor core
    name: 'SiegePlasma',
    baseColorFactor: hexToRgba('#b8f5ff', 1.0),
    metallicFactor: 0.0,
    roughnessFactor: 0.14,
    emissiveFactor: hexToRgb('#67e8f9', 1.0),
  },
  {
    // Index 8: Industrial amber hazard / thruster exhaust glow
    name: 'ThrusterAmber',
    baseColorFactor: hexToRgba('#ff9d3b', 1.0),
    metallicFactor: 0.1,
    roughnessFactor: 0.28,
    emissiveFactor: hexToRgb('#ff7b1c', 0.85),
  },
];

export const MAT = Object.fromEntries(MERIDIAN_MATERIALS.map((m, idx) => [m.name, idx]));
