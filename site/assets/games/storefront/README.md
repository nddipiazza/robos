# Storefront media

These looping GIFs show actual gameplay, rather than generated animation or a
slideshow. They are shared by the four published itch.io storefronts.

| Game | Capture source | GIF |
| --- | --- | --- |
| Quest: Warrior Dragon | Windows v0.0.9 export, demo controller walking the overworld; 20–28 seconds of a Godot movie capture | 768px wide, 5 fps, 8 seconds |
| Realm of Heroes | Windows v0.0.9 export, VillageSquare fixture and real `user_input/move_to` commands; viewport screenshots sampled during movement | 960px wide, 5 fps, 10 seconds |
| Starfall Command | `../rts/frontier-hunters-live.mp4`, 28–37 seconds | 1920px wide, 8 fps, 9 seconds |
| RobOS Tabletop RPG | `../proof-of-viability-election-2026/election-2026-playthrough.webm`, 8–16 seconds | 960px wide, 6 fps, 8 seconds |

Quest preserves its original pixel art with nearest-neighbor scaling. Its wide
background is an enlargement of the native capture, not newly added detail.
The Realm backdrop comes from the game's 2560px village art; the other backdrops
are gameplay frames. Every background is below itch.io's 3 MB image limit.

The native itch themes use fixed, centered backgrounds, no tiling, matching
accent colors and 72% panel opacity. Screenshot galleries are hidden; each
description embeds one gameplay GIF. No cutscene videos are embedded.

The `*-itch.css` files are prepared for the account's Custom CSS feature, which
itch.io has not enabled. They add responsive `background-size: cover`; the
native theme editor does not expose that setting. See
[itch.io's CSS guide](https://itch.io/docs/creators/css-guide).
