# Starfall Command 100-point roadmap

Starfall Command already has three skirmish factions, fog and detection, mineral walking, control groups, grid hotkeys, a map editor, and paid AI openings. The roadmap builds on that game. It uses Starfall’s own factions, maps, names, and art.

Work proceeds in numbered groups of ten. An item is complete once it works through its normal entry point and its check passes. Shared simulation changes also need a rendered UI pass and deterministic match regressions. Keep new content and modes playable from the title screen. The existing 64 Hz simulation and bot API remain the common test surface.

## 001–010 Battlefield controls

- [x] **001 Personal map pings.** Alt+G and a world or minimap click show the same location on both views without issuing a unit order.
- [x] **002 Center on selection.** Home centers on the selected units without changing the selection or zoom.
- [x] **003 Keyboard zoom.** Page Up and Page Down use the mouse wheel’s zoom limits.
- [x] **004 Camera pan speed.** Settings saves a slow, standard, or fast pan speed for arrows and edge scroll.
- [x] **005 Selected weapon ranges.** A toggle shows maximum and minimum range for selected friendly weapons, including emplaced Howitzers.
- [x] **006 Order line visibility.** Settings offers always, while holding Shift, or hidden for selected mobile orders. Rally flags stay visible.
- [x] **007 Undo the last queued order.** A shortcut removes the last future order and preserves the current job.
- [x] **008 Idle production selection.** Cycle or select all completed idle combat producers that can operate.
- [x] **009 Reset rally routes.** Restore default rallies on selected producers, including both routes at a Brood Nest.
- [x] **010 Consecutive targeted waypoints.** Shift-click multiple move, attack-move, or rally points with one activation.

## 011–020 Economy and construction

- [x] **011 Depleted crystal clears space.** Empty finite patches disappear and release their footprint after paying their last load.
- [x] **012 Rich crystal deposits.** A distinct deposit pays more per trip and displays its remaining reserves.
- [x] **013 Rich aether vents.** A distinct vent pays more per trip through each faction’s extractor.
- [x] **014 Mineral line reassignment.** When a drop-off is destroyed, workers transfer to an accessible surviving base.
- [x] **015 Gas build-to-gather.** Assign workers to an unfinished friendly extractor so gathering starts when it completes.
- [x] **016 Gas transfer shortcut.** Fill available gas slots from the current worker selection while leaving the rest on their current jobs.
- [x] **017 Default worker rally preview.** A completed headquarters shows the deposit it would assign to its next worker.
- [x] **018 Live income counters.** Hover crystal or aether to see recent income based on delivered loads.
- [x] **019 Build footprints on the ground.** Show blocked tiles, snapping, and a distinct planned footprint while targeting construction.
- [x] **020 Construction handoff.** A replacement Pioneer can claim a vacant foundation without paying twice, with ownership visible in its panel.

## 021–030 Combat readability and tactical terrain

- [x] **021 Target priorities by unit role.** Configured units prefer threats their weapons counter while explicit targets take precedence.
- [x] **022 Splash with friendly fire.** Emplaced Howitzers apply reduced friendly splash and disclose it in the weapon tooltip.
- [x] **023 Weapon wind-up indicator.** Selected weapons show when a shot is committed and when the next can fire.
- [x] **024 Area warning decals.** Delayed area attacks show the footprint and detonation timing to players who can see them.
- [x] **025 Brush cover.** Infantry can hide in authored brush until a scout or nearby enemy reveals them.
- [x] **026 Watch stations.** A unit holding a neutral station reveals a fixed radius until it leaves or loses control.
- [ ] **027 Destructible route blockers.** Breaking a neutral blocker opens a ground route in both navigation and the minimap.
- [ ] **028 Healing support.** A paid support unit restores biological allies from a limited energy pool.
- [ ] **029 Shield restoration.** A powered Concord support structure spends energy to restore nearby allied shields.
- [ ] **030 Ground and air targeting.** Flying movement and weapon target domains let anti-air units counter flyers without affecting ground-only shots.

## 031–040 Meridian Guard tech

- [ ] **031 Technology branch panel.** The faction card shows unlocked production, prerequisites, and costs.
- [ ] **032 Production attachments.** Muster Halls can build an attachment when its pad is clear.
- [ ] **033 Dual production attachment.** One attachment permits two concurrent light infantry jobs with normal costs.
- [ ] **034 Research attachment.** A different attachment unlocks infantry abilities and competes for the same pad.
- [ ] **035 Deployable supply headquarters.** A Colony Hub upgrade unlocks an alternative energy spend with the existing recon and supply powers.
- [ ] **036 Timed mining helper.** The upgraded Hub can deploy a short-lived crystal-only helper with a visible timer.
- [ ] **037 Transport bay.** A paid aircraft loads and unloads a capacity-limited squad at a valid drop site.
- [ ] **038 Air production structure.** A paid build path unlocks the transport and dedicated fighters.
- [ ] **039 Fighter modes.** A fighter switches attack domains with a transition delay and clear state indicator.
- [ ] **040 Relocatable production.** Eligible Meridian structures can lift and land on a valid footprint, with production suspended in flight.

## 041–050 Gnarl Brood tech

- [ ] **041 Living ground.** Completed Brood bases spread a deterministic terrain layer visible in game and on the minimap.
- [ ] **042 Brood terrain bonuses.** Eligible Brood troops gain speed on living ground and tooltips show the effective speed.
- [ ] **043 Expansion of living ground.** Paid or energy-limited nodes extend the layer and decay after losing their source.
- [ ] **044 Nest support unit.** A paid defender can spend energy to add brood slots after a delay.
- [ ] **045 Ground ambush.** Eligible units can burrow, with detection and mobility rules applied consistently.
- [ ] **046 Unit morph branch.** A paid morph transforms an existing combat unit into a different battlefield role.
- [ ] **047 Mobile supply.** A paid, vulnerable Brood flyer grants supply and frees room for scouting.
- [ ] **048 Brood air harassment.** A light flyer attacks valid targets and is vulnerable to dedicated anti-air.
- [ ] **049 Siege denial.** A late-tier Brood ability temporarily denies an area without hiding its duration.
- [ ] **050 Subterranean reinforcement.** Linked paid entrances allow allied troops to travel between them under capacity and placement limits.

## 051–060 Aurelian Concord tech

- [ ] **051 Energy-backed production boost.** A Heartstone can temporarily speed one friendly producer with a visible timer.
- [ ] **052 Powered infrastructure overlay.** Show overlapping power fields and which Waystones would lose coverage if a Resonator falls.
- [ ] **053 Fast deployment upgrade.** Research lets eligible Waystones deploy paid troops at powered locations with a cooldown.
- [ ] **054 Mobile power source.** A Concord carrier can deploy a temporary field while giving up movement.
- [ ] **055 Disposable scout.** A cheap, fragile scouting unit provides sight without attack power.
- [ ] **056 Mobile detector.** A paid Concord unit reveals hidden enemies within a displayed radius.
- [ ] **057 Barrier placement.** A support ability briefly blocks ground paths with visible duration and size.
- [ ] **058 Area spellcaster.** An energy-funded cast damages units in a telegraphed area, including allies.
- [ ] **059 Defensive recall.** An energy-funded recall returns eligible units after a delay if they remain inside the marker.
- [ ] **060 Heavy air capital unit.** A late-tech flyer has a specific anti-capital role and a demonstrated counter.

## 061–070 Skirmish maps and AI

- [ ] **061 Competitive map pool.** Add at least three original duel maps with distinct safe expansion and attack routes.
- [ ] **062 Lobby map preview.** Display terrain, candidate starts, expansion sites, and special features before launch.
- [ ] **063 Start symmetry checks.** Check opening travel and resource capacity from each spawn on competitive maps.
- [ ] **064 Map pool filters.** Filter by size, starts, finite deposits, and special terrain.
- [ ] **065 AI build profiles.** Each faction has tested economic, aggressive, and tech-heavy openings.
- [ ] **066 AI scouting worker.** The opponent scouts plausible starts and reacts to visible evidence.
- [ ] **067 AI defensive response.** Idle defenders intercept a raid while harvesting and production continue elsewhere.
- [ ] **068 AI multi-front attacks.** High difficulty can split an attack across two routes with visible targets.
- [ ] **069 AI air and stealth response.** Opponents build counters to confirmed threats using the standard economy.
- [ ] **070 Skirmish handicap options.** An explicit handicap changes starting resources or unit durability and is recorded in the result.

## 071–080 Replay, observer, and results

- [ ] **071 Versioned replay recording.** Record map, seed, options, and timestamped commands needed to reconstruct a match.
- [ ] **072 Deterministic replay validation.** A playback reaches the recorded terminal result and state digest.
- [ ] **073 Replay library.** Open, rename, and delete locally saved recordings from the title screen.
- [ ] **074 Replay playback controls.** Pause, resume, and change speed with a visible time indicator.
- [ ] **075 Replay seeking.** Jump to a requested time from a validated checkpoint or initial state.
- [ ] **076 Observer perspective.** Switch to a player’s fog, camera, or full-information observer view.
- [ ] **077 Observer comparison panels.** Compare both players’ supply, income, army, and production during playback.
- [ ] **078 Build-order timeline.** Review both sides’ construction, training, and research events in time order.
- [ ] **079 Result graphs.** Chart income, supply, and army value from recorded samples.
- [ ] **080 Match history.** Browse local results by opponent, faction, map, duration, and replay availability.

## 081–090 Practice, campaign, and presentation

- [ ] **081 Guided first skirmish.** The title screen offers a practice run that teaches gather, build, train, and attack.
- [ ] **082 Macro drills.** A timed practice scenario scores worker production, spending, and avoidable supply blocks.
- [ ] **083 Micro drills.** Practice kiting, focus fire, positioning, and split movement with repeatable setups.
- [ ] **084 Counter guide.** The roster describes weapon domains and counters using actual simulation data.
- [ ] **085 Campaign mission selection.** An original mission sequence appears as a playable title-screen mode.
- [ ] **086 Campaign objectives.** Scenario rules support clear primary and optional objectives with live progress.
- [ ] **087 Mission checkpoints.** Save and resume at deliberate mission checkpoints without losing objective state.
- [ ] **088 Contextual announcer cues.** Localized cues call out threats, depleted resources, and blocked production with rate limits.
- [ ] **089 Readable team colors.** A palette setting distinguishes allies, enemies, and neutrals across HUD and battlefield.
- [ ] **090 Accessible controls.** Rebind commands with conflict checks and reset controls to a known profile.

## 091–100 Multiplayer and release validation

- [ ] **091 Local two-player lobby.** Two seats choose a map, faction, and ready state before a match can start.
- [ ] **092 Deterministic network commands.** Peers agree on ordered tick inputs and reject unauthorized seat commands.
- [ ] **093 Desync detection.** Periodic state digests identify and report a reproducible divergent tick.
- [ ] **094 Disconnect recovery.** A player can rejoin the same seat using a verified checkpoint and command history.
- [ ] **095 Spectator seats.** A lobby can admit read-only observers with the appropriate vision policy.
- [ ] **096 Team pings and chat.** Team messages stay with the correct recipients and cannot modify simulation state.
- [ ] **097 Two versus two.** Team victory, ally colors, and shared vision work across two human or AI seats per team.
- [ ] **098 Custom lobby maps.** Players verify and agree on the map version before a custom match starts.
- [ ] **099 Cross-platform smoke tests.** Validate Windows, macOS, and Linux launch, input, replay loading, and skirmish.
- [ ] **100 Release acceptance.** Run the full roster and map matrix, stress a late-game battle, and record playable release proof.

## Design references

- [Blizzard’s simplified controls guide](https://news.blizzard.com/en-us/article/6640645/game-guide-simplified-controls)
- [Blizzard’s special controls guide](https://news.blizzard.com/en-us/article/4552955/game-guide-special-control)
- [Blizzard’s resources guide](https://news.blizzard.com/en-us/article/4488900/game-guide-resources)
- [Blizzard’s faction guide index](https://news.blizzard.com/en-us/article/7178492/game-guide-updated-race-pages)
- [Blizzard’s replay and resume overview](https://news.blizzard.com/en-gb/article/10054757/new-replay-and-resume-features-coming-in-heart-of-the-swarm)
