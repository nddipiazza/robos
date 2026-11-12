# Starfall Command — Meridian Air, Drone-Turret & Capital Assets

Deterministic, zero-dependency Node.js procedural GLB source and binary assets for the **Meridian Guard** faction in *Starfall Command*.

## Generated Assets

| File | Unit Role | Target Radius | Conventions | Anchors | Animation Clips |
| :--- | :--- | :---: | :--- | :--- | :--- |
| `watchkeeper.glb` | Compact support aircraft with asymmetric offset dorsal sensor dishes, prominent flanking ducted engine shrouds, and clamshell ventral mission bay | `1.5625` | `+Y` up, floor `Y = 0`, faces `-Z` | `Muzzle`, `MuzzleLeft`, `MuzzleRight` | `idle`, `hover`, `attack`, `cast`, `death` |
| `bastion_turret.glb` | Temporary squat deployed two-barrel rail turret on four low 45° outrigger claw legs | `2.03125` | `+Y` up, floor `Y = 0`, faces `-Z` | `Muzzle`, `MuzzleLeft`, `MuzzleRight` | `idle`, `attack`, `cast`, `death` |
| `dreadnought.glb` | 550-HP massive heavy cruiser with 3-tier layered dark armored hull, twin lateral laser batteries, prominent 4-prong forward siege emitter, and recessed long blue team-color plates | `3.125` | `+Y` up, floor `Y = 0`, faces `-Z` | `Muzzle`, `MuzzleLeft`, `MuzzleRight`, `SiegeMuzzle` | `idle`, `hover`, `attack`, `cast`, `death` |

## Team-Color & Material Conventions

- Primary team-color geometry is isolated on a named node `TeamColor` (`mesh.name = "TeamColor"`, `material.name = "TeamColor"`), with articulated sub-parts prefixed `TeamColor_*` sharing the `TeamColor` PBR material.
- Designed specifically for *Starfall Command*'s `-56°` angled perspective RTS camera (`42°` FOV), using beveled hard-surface armor planes, dark obsidian recess channels, steel leading-edge highlights, and luminous cyan/amber tactical accents.

## Repeatable Build & Validation

```bash
# Regenerate watchkeeper.glb, bastion_turret.glb, dreadnought.glb, and manifest.json
node src/build.mjs

# Run binary GLB spec, normal/triangle, radius/floor-zero, anchor, animation, and SHA-256 determinism checks
node src/validate.mjs
```
