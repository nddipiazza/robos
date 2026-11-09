---
title: "Starfall Command 100-point roadmap"
layout: default
permalink: /projects/starfall-sc2-roadmap/
description: "The completed 100-point Starfall Command roadmap for battlefield controls, faction technology, skirmish AI and simulation hardening."
---

# Starfall Command 100-point roadmap

All 100 items shipped in [`801e8895`](https://github.com/nddipiazza/robos/commit/801e889558100575837d4288052720e08d508bf7). For controls and faction tech, see the [player guide](/projects/robos-rts/). The [engineering post](/blog/starfall-command-100-point-roadmap/) covers the gameplay tests and the final paid skirmish replays.

Each item had to work through its normal entry point and pass its focused check. Shared simulation changes also went through rendered UI and deterministic match regressions. The 64 Hz simulation and bot API served both test layers.

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
- [x] **027 Destructible route blockers.** Breaking a neutral blocker opens a ground route in both navigation and the minimap.
- [x] **028 Healing support.** A paid support unit restores biological allies from a limited energy pool.
- [x] **029 Shield restoration.** A powered Concord support structure spends energy to restore nearby allied shields.
- [x] **030 Ground and air targeting.** Flying movement and weapon target domains let anti-air units counter flyers without affecting ground-only shots.

## 031–040 Meridian Guard tech

- [x] **031 Technology branch panel.** The faction card shows unlocked production, prerequisites, and costs.
- [x] **032 Production attachments.** Muster Halls can build an attachment when its pad is clear.
- [x] **033 Dual production attachment.** One attachment permits two concurrent light infantry jobs with normal costs.
- [x] **034 Research attachment.** A different attachment unlocks infantry abilities and competes for the same pad.
- [x] **035 Deployable supply headquarters.** A Colony Hub upgrade unlocks an alternative energy spend with the existing recon and supply powers.
- [x] **036 Timed mining helper.** The upgraded Hub can deploy a short-lived crystal-only helper with a visible timer.
- [x] **037 Transport bay.** A paid aircraft loads and unloads a capacity-limited squad at a valid drop site.
- [x] **038 Air production structure.** A paid build path unlocks the transport and dedicated fighters.
- [x] **039 Fighter modes.** A fighter switches attack domains with a transition delay and clear state indicator.
- [x] **040 Relocatable production.** Eligible Meridian structures can lift and land on a valid footprint, with production suspended in flight.

## 041–050 Gnarl Brood tech

- [x] **041 Living ground.** Completed Brood bases spread a deterministic terrain layer visible in game and on the minimap.
- [x] **042 Brood terrain bonuses.** Eligible Brood troops gain speed on living ground and tooltips show the effective speed.
- [x] **043 Expansion of living ground.** Paid or energy-limited nodes extend the layer and decay after losing their source.
- [x] **044 Nest support unit.** A paid defender can spend energy to add brood slots after a delay.
- [x] **045 Ground ambush.** Eligible units can burrow, with detection and mobility rules applied consistently.
- [x] **046 Unit morph branch.** A paid morph transforms an existing combat unit into a different battlefield role.
- [x] **047 Mobile supply.** A paid, vulnerable Brood flyer grants supply and frees room for scouting.
- [x] **048 Brood air harassment.** A light flyer attacks valid targets and is vulnerable to dedicated anti-air.
- [x] **049 Siege denial.** A late-tier Brood ability temporarily denies an area without hiding its duration.
- [x] **050 Subterranean reinforcement.** Linked paid entrances allow allied troops to travel between them under capacity and placement limits.

## 051–060 Aurelian Concord tech

- [x] **051 Energy-backed production boost.** A Heartstone can temporarily speed one friendly producer with a visible timer.
- [x] **052 Powered infrastructure overlay.** Show overlapping power fields and which Waystones would lose coverage if a Resonator falls.
- [x] **053 Fast deployment upgrade.** Research lets eligible Waystones deploy paid troops at powered locations with a cooldown.
- [x] **054 Mobile power source.** A Concord carrier can deploy a temporary field while giving up movement.
- [x] **055 Disposable scout.** A cheap, fragile scouting unit provides sight without attack power.
- [x] **056 Mobile detector.** A paid Concord unit reveals hidden enemies within a displayed radius.
- [x] **057 Barrier placement.** A support ability briefly blocks ground paths with visible duration and size.
- [x] **058 Area spellcaster.** An energy-funded cast damages units in a telegraphed area, including allies.
- [x] **059 Defensive recall.** An energy-funded recall returns eligible units after a delay if they remain inside the marker.
- [x] **060 Heavy air capital unit.** A late-tech flyer has a specific anti-capital role and a demonstrated counter.

## 061–070 Skirmish maps and AI

- [x] **061 Competitive map pool.** Add at least three original duel maps with distinct safe expansion and attack routes.
- [x] **062 Lobby map preview.** Display terrain, candidate starts, expansion sites, and special features before launch.
- [x] **063 Start symmetry checks.** Check opening travel and resource capacity from each spawn on competitive maps.
- [x] **064 Map pool filters.** Filter by size, starts, finite deposits, and special terrain.
- [x] **065 AI build profiles.** Each faction has tested economic, aggressive, and tech-heavy openings.
- [x] **066 AI scouting worker.** The opponent scouts plausible starts and reacts to visible evidence.
- [x] **067 AI defensive response.** Idle defenders intercept a raid while harvesting and production continue elsewhere.
- [x] **068 AI multi-front attacks.** High difficulty can split an attack across two routes with visible targets.
- [x] **069 AI air and stealth response.** Opponents build counters to confirmed threats using the standard economy.
- [x] **070 AI route recovery.** An army that loses a crossing or stalls at a neutral barrier tries another reachable route while its economy keeps running. Verify a paid opening reaches the enemy on both sides of a blocked crossing.

## 071–080 Movement and command reliability

- [x] **071 Group arrival spacing.** Give a mixed army reachable destinations around one move click. Verify units settle without piling on the center or circling after arrival.
- [x] **072 Route changes during a move.** Replan when a raised gate, new foundation, or destroyed barrier changes the active route. Preserve the remaining Shift-queued waypoints.
- [x] **073 Unreachable order feedback.** Mark the reachable endpoint when a click lands across an impassable gap. Show which group members could not reach the requested side.
- [x] **074 Clearance through ramps and gates.** A heavy unit takes a wide enough route and a smaller unit can still use a narrow one. Test both directions and protect against clipping at diagonal corners.
- [x] **075 Choke traffic.** Opposing friendly groups get through a one-lane opening in bounded time. Cover idle blockers, army retreats, and workers returning cargo through the same choke.
- [x] **076 Production exit clearance.** Rally a newly trained squad past adjacent structures and deposits. A temporarily blocked exit holds units at a safe point and resumes when space opens.
- [x] **077 Queued target loss.** Destroy a queued target, deplete a queued deposit, and break a follow link. Each unit resolves the invalid leg and starts the next valid order once.
- [x] **078 Picking crowded targets.** Verify clicks on overlapping workers, units in cover, and flyers over ground troops select or target the intended visible object at each zoom level.
- [x] **079 Mixed selection orders.** A single context click can assign a worker, move an escort, and keep an incompatible unit’s active order. Validate the resulting orders for each subgroup.
- [x] **080 Input under battle load.** Issue move, attack, and stop in a dense fight. Confirm each order registers once and takes effect within the next simulation step at normal speed.

## 081–090 Combat and economy reliability

- [x] **081 Attack-move pursuit limits.** An army resumes its original route after chasing a retreating unit beyond its pursuit range. Verify hold position remains anchored through the same encounter.
- [x] **082 Fire and movement timing.** Test move and stop on the ticks immediately before and after impact. Preserve valid shots and cooldowns across rapid alternating orders.
- [x] **083 Splash boundaries.** Match the warning ring to the actual hit radius at cliff edges and around large units. Check friendly fire, inner and outer damage, and air and ground overlap.
- [x] **084 High-ground engagements.** Verify low-ground units lose a target that climbs out of sight and regain it when a spotter arrives. Keep targeting, projectile cues, and fog consistent.
- [x] **085 Concealment under crossfire.** Test brush, cloak, sweeps, and detector loss together. Hidden targets stay out of attack selection, warning decals, and the minimap until revealed.
- [x] **086 Support in a retreat.** Automatic treatment switches patients when the current ally dies or retreats outside range. Verify explicit orders take precedence and interrupted treatment spends energy only for restoration already delivered.
- [x] **087 Supply changes with queued units.** Destroy a supply provider during production, cancel one paid slot, then restore supply. Validate reservation and refund accounting for each faction.
- [x] **088 Mineral-line saturation at scale.** Test 12, 24, and 36 workers on finite and unlimited lines. Verify workers redistribute as slots open, deliver each load once, and recover when a path is blocked.
- [x] **089 Construction and repair under pressure.** Kill a builder during placement, replace it, and assign multiple repairers with a low bank. Verify one foundation charge and bounded repair spending.
- [x] **090 Production queue consistency.** Exercise queued training, research, and cancellation as buildings lose power or attachments. Check exact costs, refunds, prerequisites, and resumed progress.

## 091–100 Skirmish depth and performance

- [x] **091 AI economy recovery after a raid.** After losing workers, gas, or a production building, the AI rebuilds a working economy and resumes paid production from its surviving base.
- [x] **092 Opening timing and counterplay.** Measure first attack, expansion, and tech timings for the three factions on the same maps. Verify a timely defense has a viable paid answer to each opening.
- [x] **093 Unit counter and upgrade checks.** Run equal-cost encounters for core unit roles and weapon tiers. Verify each intended counter has a measurable advantage and that positioning can change the outcome.
- [x] **094 Expansion safety and counterattacks.** Verify each skirmish spawn can defend a nearby expansion and that its opponent has a distinct raiding or flanking route to contest it.
- [x] **095 Match end and rematch integrity.** Cover annihilation with unfinished structures, mutual destruction, and surrender. A rematch starts with clean resources, queues, selection, and AI orders.
- [x] **096 Large-army simulation stress.** Run two paid armies near the supply cap with active worker lines. Compare tick cost and verify repeated runs with the same seed and inputs reach the same result.
- [x] **097 Fog and minimap cost.** Profile a large explored map during simultaneous attacks and detection changes. Keep the minimap responsive and confirm fog updates within the simulation’s vision cadence.
- [x] **098 Combat rendering budget.** Stress a dense fight with projectiles, splash, smoke, and shield effects. Track frame times and keep selection, health bars, and commands readable during the burst.
- [x] **099 Long skirmish soak.** Play a sustained match through depletion, expansion, and repeated battles. Restart it several times and check for stalled commands, memory growth, and stale world objects.
- [x] **100 Core skirmish acceptance.** Play paid matches across faction pairings and maps from opening through victory or surrender. Require the movement, economy, combat, AI, and responsiveness checks to pass together.

## Design references

- [Blizzard’s simplified controls guide](https://news.blizzard.com/en-us/article/6640645/game-guide-simplified-controls)
- [Blizzard’s special controls guide](https://news.blizzard.com/en-us/article/4552955/game-guide-special-control)
- [Blizzard’s resources guide](https://news.blizzard.com/en-us/article/4488900/game-guide-resources)
- [Blizzard’s faction guide index](https://news.blizzard.com/en-us/article/7178492/game-guide-updated-race-pages)
