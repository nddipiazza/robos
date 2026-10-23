Source: https://github.com/saman-mb/crusade-rts

Revision: e4929c8a5c48748b2d7905089b908393a2820966

`brush_core.gd` and `flood_fill.gd` are copied from `src/editor/` under
the accompanying MIT license. Only the global class names were prefixed with
`RTS` to avoid collisions. RobOS adapts their abstract cell decisions to its
map document; it does not import Crusade's renderer, game runtime or assets.
