"""Player-side commander for the live Hold for Dawn playthrough."""

import os
import time
from math import hypot

from live_match import LiveMatch


OUTPOST = (124, 120)
BRIDGES = (103, 112)
LANDING_PAD = (128, 141)
BRIDGE_PATROLS = (((100, 91), (105, 77)), ((80, 106), (67, 90)))
DISTRESS = (
    ("distress_north", "Northeast road"),
    ("distress_ruins", "Lowland ruins"),
    ("distress_west", "Western road"),
)
SILO_SITES = (
    (116, 141), (113, 145), (107, 147), (120, 150), (127, 151), (135, 151),
    (144, 150), (150, 144), (154, 137), (153, 129), (154, 121), (151, 113),
)
TURRET_SITES = (
    (99, 113), (102, 138), (117, 121), (121, 112.5), (130, 126), (130, 114),
    (118, 134.5), (97, 106), (96, 120), (105, 124), (106, 102),
    (149, 109), (150, 116), (144, 140), (138, 146), (126, 143), (111, 107),
    (109, 131), (107, 119), (146, 105), (133, 107), (137, 140), (116, 146),
    (111, 100), (97, 132), (101, 126), (146, 116), (111, 121),
)
BUNKER_SITES = ((94, 102), (95, 125), (105, 116), (113, 125), (136, 117), (144, 145))
FIRING_POSTS = ((105, 104), (104, 115), (109, 122), (114, 112), (130, 110), (133, 126), (128, 139))
REPAIR_POSTS = ((101, 110), (96, 115), (105, 130), (130, 113), (135, 130))


def distance(unit, point):
    return hypot(unit["pos"]["x"] - point[0], unit["pos"]["y"] - point[1])


def on_patrol(unit):
    return any(order["type"] == "patrol" for order in unit["orders"])


def dispatch_bridge_patrols(actions, rifles, patrols):
    posted = set()
    for (start, end), patrol in patrols.items():
        needed = 2 - len(patrol)
        if needed <= 0:
            continue
        candidates = [unit for unit in rifles if unit["tag"] not in posted
                      and all(order["type"] == "hold_position" for order in unit["orders"])]
        tags = [unit["tag"] for unit in sorted(candidates, key=lambda unit: distance(unit, start))[:needed]]
        if len(tags) == needed and actions.command("move", tags=tags, x=start[0], y=start[1])["ok"]:
            if actions.command("patrol", tags=tags, x=end[0], y=end[1], queue=True)["ok"]:
                patrol.update(tags)
                posted.update(tags)
    return posted


class HoldForDawn(LiveMatch):
    def __init__(self, context, difficulty):
        super().__init__(context, f"hold-for-dawn-{difficulty}", "idle")
        self.difficulty = difficulty
        self.build = "outpost defense and rescue expeditions"
        self.purpose = "campaign_evacuation"
        self.walkthrough_intro = f"The commander played the shipped campaign on {difficulty.title()} with ordinary player commands on the live frame clock."
        self.construction = {}
        self.completed_research = set()
        self.repair_crews = {}
        self.defenders = set()
        self.bridge_patrols = {route: set() for route in BRIDGE_PATROLS}
        self.next_patrol_order = 0.0
        self.interceptors = set()
        self.intercept_target = None
        self.expedition = set()
        self.expedition_index = -1
        self.expedition_target = BRIDGES
        self.last_expedition_order = -30.0
        self.called_at = {}
        self.camera = BRIDGES
        self.camera_height = 55
        self.camera_hold_until = 0.0

    def follow_camera(self, _obs):
        self.client.focus_camera(*self.camera, height=self.camera_height)

    def highlight(self, name, obs, detail, point, image=None, height=55):
        if any(event["stage"] == name for event in self.events):
            return
        self.camera = point
        self.camera_height = height
        self.camera_hold_until = time.monotonic() + 2.0
        self.event(name, obs, detail)
        if self.rendered and image:
            self.drain_capture(wait=True)
            assert self.client.screenshot((self.output / f"{image}.png").as_posix())["ok"]

    def run(self, speed):
        self.speed = speed
        self.final = self.opening
        started = time.monotonic()
        deadline = started + float(os.environ.get("RTS_WALL_TIMEOUT", max(300, 2000 / speed * 2)))
        next_frame = next_camera = started
        last_tick = last_decision = last_sample = -1
        if self.rendered:
            self.client.key("Space")
            self.client.key("Space", pressed=False)
        self.highlight(f"Hold for Dawn | {self.difficulty.title()}", self.opening,
                       "Two garrisoned bridges defend the evacuation outpost", BRIDGES, "opening")
        assert self.client.set_playback(paused=False, speed=speed)["ok"]
        try:
            while time.monotonic() < deadline:
                obs = self.client.get_observation(player=1)
                self.final = obs
                mission = obs["campaign"]
                if obs["tick"] > last_tick >= 0:
                    self.autonomous_ticks += obs["tick"] - last_tick
                last_tick = obs["tick"]
                if mission["status"] != "playing":
                    result = "Evacuation complete" if mission["status"] == "victory" else "Outpost lost"
                    self.highlight(result, obs, mission["reason"], LANDING_PAD)
                    if self.rendered:
                        time.sleep(0.8)  # Let the result panel render before capturing it.
                    break
                if mission["rescue_tag"]:
                    self.highlight("Rampart inbound", obs, "Keep the southeast landing pad clear", LANDING_PAD, "inbound")
                elapsed = obs["sim_time"]
                if elapsed - last_decision >= 4 or last_decision < 0:
                    self.actions.observe(obs)
                    self._play(obs)
                    last_decision = elapsed
                if elapsed - last_sample >= 30:
                    self.samples.append({"game_seconds": elapsed, "tick": obs["tick"], "players": obs["players"],
                                         "waves": mission["waves_sent"], "rescued": mission["bonus_done"]})
                    last_sample = elapsed
                    print(f"{elapsed:6.1f}s  wave {mission['waves_sent']}/{mission['wave_total']}  "
                          f"rescued {mission['bonus_done']}/3  supply {obs['players']['1']['supply_used']}", flush=True)
                now = time.monotonic()
                if self.rendered and (now >= next_camera or mission["rescue_tag"]):
                    self._track_camera(obs, now)
                    next_camera = now + 1.2
                if now >= next_frame:
                    self.capture()
                    next_frame = now + 0.18
                time.sleep(0.06)
            else:
                raise AssertionError("The campaign exceeded the wall-clock deadline")
        except Exception as error:
            self.error = str(error)
            raise
        finally:
            self.wall_seconds = time.monotonic() - started
            self.capture()
            self.drain_capture(wait=True)
            if self.rendered:
                self.client.screenshot((self.output / "result.png").as_posix())

    def _track_camera(self, obs, now):
        units = obs["units"]
        rescue_tag = obs["campaign"]["rescue_tag"]
        if now < self.camera_hold_until and not rescue_tag:
            return
        transport = next((u for u in units if u["tag"] == rescue_tag), None)
        expedition = [u for u in units if u["tag"] in self.expedition]
        if transport:
            x, y = transport["pos"]["x"], transport["pos"]["y"]
            target = ((x + LANDING_PAD[0]) / 2, (y + LANDING_PAD[1]) / 2)
            height = 48
        elif expedition:
            lead = sorted(expedition, key=lambda u: distance(u, self.expedition_target))[:8]
            target = tuple(sum(u["pos"][axis] for u in lead) / len(lead) for axis in ("x", "y"))
            height = 51
        else:
            enemies = [u for u in units if u["owner"] == 2
                       and (distance(u, OUTPOST) < 35 or distance(u, BRIDGES) < 25)]
            target, height = OUTPOST, 58
            if enemies:
                positions = [(u["pos"]["x"], u["pos"]["y"]) for u in enemies]
                clash = max(positions, key=lambda point: sum(distance(u, point) < 12 for u in enemies))
                target = ((clash[0] * 2 + OUTPOST[0]) / 3, (clash[1] * 2 + OUTPOST[1]) / 3)
                height = 61
        if hypot(self.camera[0] - target[0], self.camera[1] - target[1]) > 3 or height != self.camera_height:
            self.camera = target
            self.camera_height = height
            self.follow_camera(obs)

    def _command(self, command, units, point=None, **args):
        if point is not None:
            args.update(x=point[0], y=point[1])
        return self.actions.command(command, tags=[unit["tag"] for unit in units], **args)["ok"]

    def _build(self, unit_type, sites, workers, units, elapsed):
        available = [u for u in workers if u["tag"] not in self.repair_crews
                     and not any(o["type"] in ("build", "repair") for o in u["orders"])]
        if not available:
            return False
        for site in sites:
            if self.construction.get(site, 0) > elapsed:
                continue
            if any(u["is_structure"] and distance(u, site) < 1 for u in units):
                continue
            worker = min(available, key=lambda u: distance(u, site))
            if self._command(f"build_{unit_type}", [worker], site):
                self.construction[site] = elapsed + 60
                return True
        return False

    def _play(self, obs):
        elapsed = obs["sim_time"]
        mission = obs["campaign"]
        player = obs["players"]["1"]
        units = [u for u in obs["units"] if u["owner"] == 1 and not u.get("campaign_scripted")]
        workers = [u for u in units if u["unit_type"] == "pioneer"]
        rifles = [u for u in units if u["unit_type"] == "rifleman"]
        medics = [u for u in units if u["unit_type"] == "triage_specialist"]
        by_type = lambda name: [u for u in units if u["unit_type"] == name and u["build_progress"] == 1]
        halls = by_type("muster_hall")
        hubs = by_type("colony_hub")
        tap = by_type("aether_tap")
        gas = next((r for r in obs["resources"] if r["resource_type"] == "aether_vent"), None)
        crystal = [r for r in obs["resources"] if r["resource_type"] == "crystal_field" and r["amount"] > 0]

        self.repair_crews = {u["tag"]: self.repair_crews[u["tag"]] for u in workers if u["tag"] in self.repair_crews}
        if len(workers) >= 10:
            posts = REPAIR_POSTS[:2] if elapsed < 200 else REPAIR_POSTS
            for point in posts:
                if point in self.repair_crews.values():
                    continue
                worker = min((u for u in workers if u["tag"] not in self.repair_crews), key=lambda u: distance(u, point))
                if self._command("move", [worker], point):
                    self.repair_crews[worker["tag"]] = point
        miners = [u for u in workers if u["tag"] not in self.repair_crews]
        if crystal:
            for worker in miners:
                if not worker["orders"]:
                    patch = min(crystal, key=lambda r: distance(worker, (r["pos"]["x"], r["pos"]["y"])))
                    self._command("harvest", [worker], target_tag=patch["tag"])
        crystal_budget = player["crystal"]
        if hubs and len(workers) < 21 and hubs[0]["production_queue_len"] < 2 and crystal_budget >= 50:
            if self._command("train_pioneer", hubs[:1]):
                crystal_budget -= 50
        if player["supply_cap"] - player["supply_used"] < 6 and crystal_budget >= 100:
            if self._build("silo", SILO_SITES, workers, units, elapsed):
                crystal_budget -= 100
        if not tap and gas and crystal_budget >= 75 and elapsed < 500:
            if self._build("aether_tap", [(gas["pos"]["x"], gas["pos"]["y"])], workers, units, elapsed):
                crystal_budget -= 75
        elif tap and player["aether"] < 300:
            self._command("fill_gas", miners, target_tag=tap[0]["tag"])
        medical_hall = next((h for h in halls if h.get("attachment_tag")), None)
        if medical_hall and len(medics) < 5 and player["aether"] >= 25 and crystal_budget >= 75:
            if medical_hall["production_queue_len"] < 2 and self._command("train_triage_specialist", [medical_hall]):
                crystal_budget -= 75
        turrets = len(by_type("sentry_turret"))
        if crystal_budget >= 125 and turrets < (9 if elapsed < 280 else 15):
            if self._build("sentry_turret", TURRET_SITES, workers, units, elapsed):
                crystal_budget -= 125
        if crystal_budget >= 130 and elapsed > 65 and len(by_type("field_bunker")) < 6:
            if self._build("field_bunker", BUNKER_SITES, workers, units, elapsed):
                crystal_budget -= 100

        for armory in by_type("field_armory")[:1]:
            if armory["production_queue_len"] == 0:
                for upgrade in ("weapons", "armor"):
                    if (upgrade not in self.completed_research and crystal_budget >= 100
                            and player["aether"] >= 100 and self._command(f"research_{upgrade}", [armory])):
                        self.completed_research.add(upgrade)
                        crystal_budget -= 100
                        break
        if player["aether"] >= 25 and crystal_budget >= 75 and not any(h.get("attachment_tag") for h in halls):
            for hall in reversed(halls):
                if self._command("attach_research_module", [hall]):
                    crystal_budget -= 50
                    break
        for hall in halls:
            if hall["production_queue_len"] < 2 and crystal_budget >= (50 if len(rifles) < 25 or turrets >= 9 else 150):
                if (hall.get("attachment_tag") and player["aether"] >= 25 and crystal_budget >= 75
                        and len(medics) * 7 < len(rifles) and self._command("train_triage_specialist", [hall])):
                    crystal_budget -= 75
                    continue
                if self._command("train_rifleman", [hall]):
                    crystal_budget -= 50

        self._intercept(obs, rifles)
        self._defend(units, rifles, medics, workers, by_type("field_bunker"))

        self._rescue(obs, mission, rifles, medics)
        if elapsed >= 960 and mission["rescue_tag"] == 0:
            self.highlight("Final assault", obs, "Brood flyers and late ground waves close in on the outpost", OUTPOST, "final-assault")

    def _defend(self, units, rifles, medics, workers, bunkers):
        available = [u for u in rifles if u["tag"] not in self.expedition | self.interceptors and not on_patrol(u)]
        assigned = set()
        for bunker in bunkers:
            point = (bunker["pos"]["x"], bunker["pos"]["y"])
            en_route = [u for u in available if any(o["type"] == "enter_bunker" and o["target_tag"] == bunker["tag"] for o in u["orders"])]
            seats = 4 - len(bunker.get("passengers", [])) - len(en_route)
            candidates = [u for u in available if u["tag"] not in assigned
                          and distance(u, point) < 30 and not any(o["type"] == "enter_bunker" for o in u["orders"])]
            if seats > 0 and candidates:
                boarders = sorted(candidates, key=lambda u: distance(u, point))[:seats]
                if self._command("enter_bunker", boarders, target_tag=bunker["tag"]):
                    assigned.update(u["tag"] for u in boarders)

        elapsed = self.final["sim_time"]
        if elapsed >= self.next_patrol_order:
            active = {u["tag"] for u in rifles if on_patrol(u)}
            for patrol in self.bridge_patrols.values():
                patrol.intersection_update(active)
            reserves = [u for u in available if u["tag"] not in assigned]
            if len(reserves) >= 18:
                posted = dispatch_bridge_patrols(self.actions, reserves, self.bridge_patrols)
                assigned.update(posted)
                if posted and all(self.bridge_patrols.values()) and not any(e["stage"] == "Bridge patrols" for e in self.events):
                    self.highlight("Bridge patrols", self.final, "Two Riflemen per bridge scout the river crossings",
                                   (89, 92), height=67)
                    self.camera_hold_until = time.monotonic() + 5.0
            self.next_patrol_order = elapsed + 24

        for unit in available + [u for u in medics if u["tag"] not in self.expedition]:
            if (unit["tag"] in assigned or unit["tag"] in self.defenders
                    or any(o["type"] == "enter_bunker" for o in unit["orders"])):
                continue
            index = unit["tag"] % len(FIRING_POSTS)
            x, y = FIRING_POSTS[index]
            offset = (unit["tag"] // len(FIRING_POSTS)) % 5 - 2
            if self._command("move", [unit], (x + offset * 1.1, y + (offset % 2) * 1.8)):
                self._command("hold_position", [unit], queue=True)
                self.defenders.add(unit["tag"])

        wounded = [u for u in units if u["is_structure"] and u["build_progress"] == 1 and u["max_hp"] - u["hp"] > 35]
        for worker in workers:
            if worker["tag"] not in self.repair_crews or worker["orders"]:
                continue
            close = [u for u in wounded if distance(u, self.repair_crews[worker["tag"]]) < 14]
            if close:
                target = min(close, key=lambda u: u["hp"] / u["max_hp"])
                self._command("repair", [worker], target_tag=target["tag"])

    def _intercept(self, obs, rifles):
        threats = [u for u in obs["units"] if u["owner"] == 2 and u["unit_type"] == "blight_hurler"
                   and (distance(u, BRIDGES) < 34 or distance(u, OUTPOST) < 29)]
        if any(u["tag"] == self.intercept_target for u in threats):
            active = [u for u in rifles if u["tag"] in self.interceptors and u["orders"]]
            if len(active) >= 6:
                return
        self.defenders.difference_update(self.interceptors)
        self.interceptors.clear()
        self.intercept_target = None
        if not threats:
            return
        target = min(threats, key=lambda u: distance(u, OUTPOST))
        point = (target["pos"]["x"], target["pos"]["y"])
        candidates = [u for u in rifles if u["tag"] not in self.expedition and not on_patrol(u)
                      and not any(o["type"] == "enter_bunker" for o in u["orders"])]
        interceptors = sorted(candidates, key=lambda u: distance(u, point))[:20]
        if interceptors and self._command("attack_target", interceptors, point, target_tag=target["tag"]):
            self.interceptors = {u["tag"] for u in interceptors}
            self.intercept_target = target["tag"]

    def _rescue(self, obs, mission, rifles, medics):
        elapsed = obs["sim_time"]
        for index, (cue, place) in enumerate(DISTRESS):
            if cue in mission["cue_history"] and index not in self.called_at:
                self.called_at[index] = elapsed
                marker = next((m for m in mission["markers"] if m["label"] == "Rescue militia"), None)
                self.highlight(f"Distress call | {place}", obs, "The stranded squad has three game minutes of cover",
                               tuple(marker["point"]) if marker else BRIDGES, f"distress-{index + 1}")
        index = mission["bonus_done"]
        if self.expedition and index > self.expedition_index:
            troops = [u for u in rifles + medics if u["tag"] in self.expedition or distance(u, self.expedition_target) < 10]
            self.highlight(f"Militia rescued | {index} of 3", obs, "The first hit on the guards brings the militia into the army",
                           self.expedition_target, f"rescue-{index}")
            self._command("move", troops, BRIDGES)
            self.defenders.difference_update(u["tag"] for u in troops)
            self.expedition.clear()
        if index >= len(DISTRESS) or index not in self.called_at:
            return
        if elapsed - self.called_at[index] < (40 if index == 0 else 8):
            return
        marker = next((m for m in mission["markers"] if m["label"] == "Rescue militia"), None)
        if not marker:
            return
        target = tuple(marker["point"])
        rifles = [u for u in rifles if u["tag"] not in self.interceptors and not on_patrol(u)
                  and not any(o["type"] == "enter_bunker" for o in u["orders"])]
        troop_count = max(0, min(24, len(rifles) - 12))
        if not self.expedition:
            if troop_count < 12:
                return
            troops = sorted(rifles, key=lambda u: distance(u, BRIDGES))[:troop_count] + medics[:3]
            self.expedition = {u["tag"] for u in troops}
            self.expedition_index = index
            self.expedition_target = target
            self.highlight(f"Expedition | {DISTRESS[index][1]}", obs, "Riflemen and Triage Specialists leave the garrison to reach the call",
                           BRIDGES)
            self._command("attack_move", troops, target)
            self.last_expedition_order = elapsed
        elif elapsed - self.last_expedition_order > 22:
            troops = [u for u in rifles + medics if u["tag"] in self.expedition]
            if len(troops) < 8:
                troops += [u for u in rifles if u["tag"] not in self.expedition][:troop_count]
                self.expedition.update(u["tag"] for u in troops)
            if troops:
                self._command("attack_move", troops, target)
            self.last_expedition_order = elapsed
