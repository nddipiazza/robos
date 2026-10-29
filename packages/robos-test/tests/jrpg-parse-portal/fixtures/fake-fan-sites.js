'use strict';

// An offline stand-in for the fan sites the Final Fantasy profile reads:
// a MediaWiki API (Final Fantasy Wiki), the VGMaps NES atlas and the RPGamer
// fan-music page. The wikitext is trimmed from the real pages and keeps the
// shapes that matter: galleries inside infoboxes, self-closing refs, bosses
// fought twice, row-spanning tables and remake-only rows that must be dropped.

const WIKI = {
  'Final Fantasy': `{{infobox game
|developer=[[Square]]
}}
'''''Final Fantasy''''' is a role-playing game.

==Story==
{{spoiler}}
{{Quote|And so their journey began.|Opening scene}}
[[File:Start.png|thumb|Start.]]
The four Warriors of Light arrive at the kingdom of [[Cornelia (Final Fantasy)|Cornelia]], each carrying a darkened crystal.

==Gallery==
[[File:FF1 NES NA box.jpg|NES box art]]`,

  'Final Fantasy enemies': `== G ==
<gallery expand="true">
Goblin from FFI Pixel Remaster sprite.png|[[Goblin (Final Fantasy)|Goblin]]<br>IMP (NES)
Gloom Widow from FFI 20th Anniversary Edition sprite.png|''[[Gloom Widow]]''
</gallery>

== Bosses ==
<gallery expand="true">
Lich from FFI Pixel Remaster battle sprite.png|[[Lich (Final Fantasy)|Lich]]<br>LICH (NES)
Omega from FFI 20th Anniversary Edition sprite.png|''[[Omega (Final Fantasy)|Omega]]''
</gallery>`,

  'Goblin (Final Fantasy)': `{{infobox enemy
| release = FFI
| name = Goblin
| aka = IMP
| image = <gallery>
Goblin from FFI Pixel Remaster sprite.png|PR
IMP from FFI NES sprite.png|NES
</gallery>
| location = [[Cornelia (Final Fantasy)|Cornelia]] region
}}
The '''Goblin''', also known as the '''IMP''', is an enemy in ''[[Final Fantasy]]''. It is typically the first and weakest enemy encountered.

==Stats==
{{infobox enemy stats FFI
| name = Goblin<br>'''NES:''' IMP<ref name="Enemy Identification Chart"/>
| type = Giant
| hp = 8
| attack = 4
| defense = 4
| exp = 6
| gil = 6
| drop = [[Potion (Final Fantasy)|Potion]]
}}`,

  'Lich (Final Fantasy)': `{{infobox enemy
| name = Lich
| image = <gallery>
LICH from FFI NES sprite.png|NES
</gallery>
| type = Boss
}}
Lich is the Fiend of Earth from the original Final Fantasy. He appears at the bottom of the Cavern of Earth.

{{infobox enemy stats FFI
| 1 nes = LICH
| 1 location = [[Cavern of Earth]]
| 1 hp = 400
| 1 nes attack = 40 - 80
| 1 attack = 40
| 1 exp = 2200
| 1 nes fire = Weak
| 2 location = [[Chaos Shrine (Final Fantasy)|Temple of Fiends]]
| 2 hp = 500
| 2 exp = 2000
}}`,

  'Final Fantasy enemy formations': `==Formations==
===Original releases===
{|class="scrollable article-table"
|-
!Number
!Enemies
!Maximum
!Can flee?
!Ambush%
!Musical theme
!Location
!Rate/64
|-
!rowspan="2"|{{A|000}}
|rowspan="2"|[[Goblin (Final Fantasy)|Goblin]] x3-5
|rowspan="2"|9 small
|rowspan="2"|{{y}}
|rowspan="2"|4
|rowspan="2"|[[Battle (Final Fantasy)|Battle]]
|[[Chaos Shrine (Final Fantasy)|Chaos Shrine]] region
|12
|-
|Southern [[Cornelia (Final Fantasy)|Cornelia]] region
|64
|-
!{{A|200}}
|[[Omega (Final Fantasy)|Omega]] x1
|1 large
|{{n}}
|0
|[[Battle (Final Fantasy)|Battle]]
|[[Labyrinth of Time]]
|64
|}
====Soul of Chaos====
{|
|-
!Number
|}`,

  'Final Fantasy weapons': `==List of weapons==
===Daggers===
{|class="full-width FFI article-table"
|-
!Name
!NES Image
!PS/GBA Image
!PSP Image
!Jobs
!Atk
!Acc
!Crit
!Acquirement
!Cost
|-
! rowspan="2"|{{LA|Dagger (Final Fantasy)|Dagger}}<br/>({{A|Large}})
|[[File:FF1-NES-Large.png]]
|[[File:FF1-GBA-Dagger.png|30px]]
|[[File:Dagger.png]]
|Wa, Kn, Th
|7
|10
|10
|'''Buy:''' [[Elfheim]]<br/>'''Find:''' [[Marsh Cave]]
|140 (Easy)<br/>175 (Normal)
|-
|colspan="9"|''A large knife.''
|-
! rowspan="2"|{{LA|Lust Dagger}}
|
|[[File:FF1-GBA-LustDagger.png]]
|[[File:Lust Dagger.png]]
|Th, Ni
|30
|20
|20
|'''Drop:''' Chronodia (Lich)
|—
|-
|colspan="9"|''A remake-only dagger.''
|}`,

  'Final Fantasy armor': `== Shields ==
{| class="full-width article-table FFI"
|-
! Name
! PS/GBA Image
! PSP Image
! Jobs
! Defense
! Evasion
! Weight
! Acquirement
! Cost
|-
! rowspan="2"|{{A|Helm (Final Fantasy)|Helm}} <br/>({{A|Wooden}})
|[[File:Helm.png]]
|[[File:Helm psp.png]]
|Wa, Kn
|3
|0
|1
|'''Buy:''' [[Pravoka]]
|80 gil (Easy)<br />100 gil (Normal)
|-
| colspan="8" |''A sturdy helm.''
|}`,

  'Final Fantasy items': `For consumable items, only the [[#Potion|Potion]] and [[#Tent|Tent]] existed in the [[Nintendo Entertainment System|NES]] and PS versions.

== Usable items ==
=== Healing items ===
{|class="full-width FFI article-table"
|-
!Name
!Cost
!Acquirement
!Effect
|-
! rowspan="2"|{{LA|Potion (Final Fantasy)|Potion}}<br/>({{A|HEAL}})
|60
|'''Buy:''' All shops
|Restores 50 HP.
|-
|colspan="3"|''Restores 50 HP.''
|-
! rowspan="2"|{{LA|Hi-Potion (Final Fantasy)|Hi-Potion}}
|150
|'''Buy:''' [[Crescent Lake]]
|Restores 150 HP.
|-
|colspan="3"|''Restores 150 HP.''
|}

== Key items ==
{|class="full-width FFI article-table"
|-
!Name
!Acquirement
!Description
|-
!{{LA|Lute (Final Fantasy)|Lute}}
|'''Gift:''' Princess Sarah, after defeating Garland
|A sonorous instrument of great beauty.
|-
!{{A|House Key}}
|Whisperwind Cove trading sequence
|Some poor dwarf's lost key.
|}`,

  'Magic (Final Fantasy)': `==Mechanics==
===Formulas===
====Hit determination====
:Hit Successful if Random ( 0 ... 200 ) <= [ Base Chance + Spell Accuracy - Target Magic Defense ]

==Black Magic==
{|class="full-width article-table""
|-
!Name
!Level
!MP
!Power
!Accuracy
!Element
!Target
!Price
!Buy
!Jobs
|-
! rowspan="3"|{{LA|Fire (Final Fantasy)|Fire}}<br><small>{{J|ファイア|Faia}}<br>NES: FIRE; PS: Fire1
|1
|5
|10
|24
|[[Fire (Final Fantasy element)|Fire]]
|One enemy
|100<br/>50
|[[Cornelia (Final Fantasy)|Cornelia]]
|BM, RM
|-
|colspan="12"|Inflicts light fire damage on one enemy.
|-
|colspan="12"|''Deals fire damage to one enemy.''
|}

==White Magic==
`,

  'Final Fantasy shops': `== [[Cornelia (Final Fantasy)|Cornelia]] ==
{|class="full-width"
| valign="top" width="50%"|
=== [[Final Fantasy items|Items]] ===
{|class="half-width article-table FFI"
|-
!rowspan="2"|Name
!colspan="2"|Cost
|-
!NES/PS (Normal)
!PS (Easy), GBA/PSP
|-
![[Potion (Final Fantasy)|Potion]]
|60 gil
|40 gil
|-
![[Phoenix Down (Final Fantasy)|Phoenix Down]]
|N/A
|500 gil
|}
|}`,

  'Final Fantasy stats': `==List of stats==
=== HP ===
HP is the amount of damage a character can take.
=== Initial stats ===
{| class="FFI article-table"
|-
!Stat
![[Warrior (Final Fantasy)|Warrior]]
![[White Mage (Final Fantasy)|W. Mage]]
|-
!HP
|35
|33
|-
!STR
|10
|5
|}`,

  'Final Fantasy statuses': `== Mechanics ==
:Hit Successful if Random ( 0 ... 200 ) < [ Base Hit Chance + Spell Accuracy - Target Magic Defense ]
== List of statuses ==
=== Poison ===
Poison removes HP at the end of every turn.`,

  'Final Fantasy elements': `==List of elements==
===Fire===
Fire damage.`,

  'Menu (Final Fantasy)': `[[File:FF NES Main Menu.png|thumb|Main menu in the original NES version.]]`,

  'Final Fantasy characters': `==Non-player characters==
<gallery expand="true">
Matoya.png|[[Matoya]]
Chronodia-map.png|''[[Chronodia]]''
</gallery>`,

  'Original soundtracks of Final Fantasy I & II': `==''All Sounds of Final Fantasy I & II''==
''All Sounds'' is the complete soundtrack. Tracks 2 - 3 are from ''Final Fantasy'' and 4 - 4 are from ''Final Fantasy II''.

===Track list===
::;<big>WELCOME TO F.F. WORLD (ARRANGE VERSION)</big>
#{{A|WELCOME TO F.F. WORLD}} - 6:57
#;<big>FINAL FANTASY (ORIGINAL SOUND)</big>
#{{LA|Prelude (theme)|Prelude}} - 0:52<br />{{J|プレリュード|Pureryūdo}}
#: Plays at the title screen.
#{{LA|Main Theme (Final Fantasy)|Main Theme}} - 1:02
#: The world map theme.
#;<big>FINAL FANTASY II (ORIGINAL SOUND)</big>
#{{A|Rebel Army}} - 1:15`,

  'Warrior (Final Fantasy)': `{{infobox job
|name=Warrior
|sprite='''Warrior'''<br>
[[File:Warrior-ff1-nes.png|NES.]] [[File:Warrior-ff1-gba.png|GBA.]]<hr/>
[[File:FFI NES Fighter Map.png|Map sprite (NES).]]<hr/>
;Knight
[[File:Knight (Final Fantasy).png|NES.]]<hr/>
[[File:FFI NES Knight Map.png|Map sprite (NES).]]
|weapons=[[Final Fantasy weapons#Swords|Swords]]
|armor=[[Final Fantasy armor#Shields|Shields]]
}}
The '''Warrior''', also known as the '''Fighter''', is a job available to the Warriors of Light.`,

  'Cornelia (Final Fantasy)': `{{infobox location
|name=Cornelia
}}
'''Cornelia''', also known as '''Coneria''', is a town from the original ''[[Final Fantasy]]''.

== Encounters ==
*[[Goblin (Final Fantasy)|Goblin]]

== Gallery ==
<gallery>Coneria.gif|Cornelia (NES).
Coneriaoverworld.PNG|Cornelia in the World Map (NES).
</gallery>`,

  Level: `===''[[Final Fantasy]]''===
Character class dictates the stat growth gained from level ups. The maximum level is 50.

===''[[Final Fantasy II]]''===
Different.`,
};

const VGMAPS_INDEX = `<a href="FinalFantasy-World.png">World</a> <a href="FinalFantasy-Coneria.png">Coneria</a> <a href="FinalFantasyII(J)-Altea.png">Altea</a>`;

const RPGAMER_MIDI = `<tr><td colspan=2><a href="sounds/midi/ff1prel.mid">The Prelude ~ (Enhanced)</a></td>
<td width=25%><a href="/cdn-cgi/l/email-protection#abc">Jane Arranger</a></td></tr>
<tr><td colspan=3><a href="sounds/midi/ff1main.mid">Main Theme</a></td></tr>`;

function response(status, body, type = 'application/json') {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  return { status, ok: status >= 200 && status < 300, headers: { get: () => type }, text: async () => buf.toString('utf8'), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) };
}

// fetch() stand-in. `requests` records every URL asked for.
function createFakeFetch({ wiki = WIKI, requests = [] } = {}) {
  return async url => {
    requests.push(url);
    const u = new URL(url);
    if (u.host === 'finalfantasy.fandom.com' && u.pathname === '/api.php') {
      const titles = (u.searchParams.get('titles') || '').split('|').filter(Boolean);
      if (u.searchParams.get('prop') === 'revisions') {
        return response(200, { query: { pages: titles.map(t => (wiki[t] !== undefined ? { title: t, revisions: [{ slots: { main: { content: wiki[t] } } }] } : { title: t, missing: true })) } });
      }
      if (u.searchParams.get('prop') === 'imageinfo') {
        return response(200, { query: { pages: titles.map(t => ({ title: t, imageinfo: [{ url: `https://static.example/ffwiki/${encodeURIComponent(t.replace(/^File:/, ''))}`, descriptionurl: `https://finalfantasy.fandom.com/wiki/${encodeURIComponent(t)}`, width: 32, height: 32, mime: 'image/png' }] })) } });
      }
    }
    if (u.host === 'www.vgmaps.com') return response(200, VGMAPS_INDEX, 'text/html');
    if (u.host === 'archive.rpgamer.com' && u.pathname.endsWith('ff1mid.html')) return response(200, RPGAMER_MIDI, 'text/html');
    return response(404, 'not found', 'text/plain');
  };
}

module.exports = { WIKI, createFakeFetch };
