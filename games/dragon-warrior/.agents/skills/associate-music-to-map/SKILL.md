---
name: associate-music-to-map
description: Guidelines and code snippets for attaching background music tracks to maps, dungeons, towns, and combat scenes.
---

# 🎵 Associate Music to a Map/Scene Skill

Use this skill when configuring background music (BGM) streams for new or existing map scenes.

## 🎶 Music Track Directory (`assets/music/mp3/`)

| Audio File | Primary Usage |
|---|---|
| `tantegel_castle.mp3` | Castle 1F / Tantegel Castle upper floors |
| `tantegel_castle_lower.mp3` | Castle lower floors & dungeons |
| `peaceful_village.mp3` | Towns & villages |
| `kingdom_of_alefgard.mp3` | World map overworld |
| `dungeon_1.mp3` … `dungeon_8.mp3` | Caves & dungeon floors |
| `overture.mp3` | Title screen |
| `dragonlord.mp3` | Dragonlord throne room |

---

## 🛠️ Setting Music in Scene Scripts

In the scene script, add `_start_music()` and invoke it during `_ready()`:

```gdscript
var _music: AudioStreamPlayer

func _start_music() -> void:
    _music = AudioStreamPlayer.new()
    var bgm := load("res://assets/music/mp3/tantegel_castle.mp3") as AudioStream
    if bgm:
        _music.stream = bgm
        if _music.stream is AudioStreamMP3:
            (_music.stream as AudioStreamMP3).loop = true
        _music.volume_db = -6.0
        add_child(_music)
        _music.play()
```

To stop music on scene transition:

```gdscript
if _music:
    _music.stop()
```

For `DungeonMap.gd` subclasses, simply override `_get_music_path() -> String`.
