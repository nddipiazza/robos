# Storefront media

These looping GIFs show actual gameplay, rather than generated animation or a
slideshow. They are shared by the four published itch.io storefronts.

| Game | Capture source | GIF |
| --- | --- | --- |
| Quest: Warrior Dragon | Windows v0.0.9 export, demo controller walking the overworld; 20–28 seconds of a Godot movie capture | 768px wide, 40 frames, 24-second loop |
| Realm of Heroes | Windows v0.0.9 export, VillageSquare fixture and real `user_input/move_to` commands; viewport screenshots sampled during movement | 960px wide, 50 frames, 30-second loop |
| Starfall Command | `../rts/frontier-hunters-live.mp4`, 28–37 seconds | 1920px wide, 72 frames, 27.03-second loop |
| RobOS Tabletop RPG | `../proof-of-viability-election-2026/election-2026-playthrough.webm`, 8–16 seconds | 960px wide, 48 frames, 24-second loop |

Playback is one-third of the original capture speed, giving viewers more time
to follow the action. Only GIF frame delays changed; every frame, palette,
resolution and loop setting is preserved without re-encoding the images.

Quest preserves its original pixel art with nearest-neighbor scaling. Its wide
background is an enlargement of the native capture, not newly added detail.
The Realm backdrop comes from the game's 2560px village art; the other backdrops
are gameplay frames. Every background is below itch.io's 3 MB image limit.

The native itch themes use fixed, centered backgrounds, no tiling, matching
accent colors and 72% panel opacity. Screenshot galleries are hidden; each
description embeds one gameplay GIF. No cutscene videos are embedded.

Each itch description also explains how its KGraph and RobOS support development
with minimal AI work, and links to `https://rowbose.com/#build` for context
engineering and app development. Game-specific graph scope and available AI
playthrough links live in `site/_data/games.json`; Rowbose game pages render
the same explanation through `_includes/game-kgraph.html`. Playthrough links
are provided for Quest, Tabletop and Starfall Command. Realm has no published
full-playthrough link yet.

The `*-itch.css` files are prepared for the account's Custom CSS feature, which
itch.io has not enabled. They add responsive `background-size: cover`; the
native theme editor does not expose that setting. See
[itch.io's CSS guide](https://itch.io/docs/creators/css-guide).
