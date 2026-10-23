"""A player-side build-order driver. Only observation/action API calls, no state edits."""
from math import cos, sin, tau, hypot


class FrontierBuildBot:
    def __init__(self, client, build):
        self.client, self.build = client, build
        self.produced = set()
        self.attacking = False

    def on_step(self, obs):
        self.busy_builders = set()
        mine = [u for u in obs["units"] if u["owner"] == 1]
        workers = [u for u in mine if u["is_worker"]]
        army = [u for u in mine if not u["is_worker"] and not u["is_structure"]]
        self.produced.update(u["unit_type"] for u in army)
        halls = [u for u in mine if u["unit_type"] == "colony_hub"]
        if not halls:
            self.attack(obs, army, True)
            return
        base = halls[0]["pos"]
        p = obs["players"]["1"]
        counts = {}
        for u in mine:
            counts[u["unit_type"]] = counts.get(u["unit_type"], 0) + 1
        for w in workers:
            for order in w["orders"]:
                if order["type"] == "build" and not order.get("structure_tag"):
                    st = order["structure_type"]
                    counts[st] = counts.get(st, 0) + 1
        taps = [u for u in mine if u["unit_type"] == "aether_tap" and u["build_progress"] >= 1]
        available = [w for w in workers if not w["orders"] or w["orders"][0]["type"] != "build"]
        for i, w in enumerate(available):
            if taps and i < 3:
                if not w["orders"] or w["orders"][0].get("target_tag") != taps[0]["tag"]:
                    self.client.command("harvest", tags=[w["tag"]], target_tag=taps[0]["tag"])
            elif not w["orders"]:
                crystals = [r for r in obs["resources"] if r["resource_type"] == "crystal_field" and r["amount"] > 0]
                if crystals:
                    target = min(crystals, key=lambda r: self.distance(r["pos"], w["pos"]))
                    self.client.command("harvest", tags=[w["tag"]], target_tag=target["tag"])
        finished_silos = sum(u["unit_type"] == "silo" and u["build_progress"] >= 1 for u in mine)
        if p["supply_cap"] < 200 and p["supply_cap"] - p["supply_used"] <= 4 and counts.get("silo", 0) == finished_silos:
            self.build_structure(obs, available, "silo", base, 100)
            self.attack(obs, army)
            return
        if not counts.get("muster_hall"):
            self.build_structure(obs, available, "muster_hall", base, 150)
            return
        if self.build != "rush" and not counts.get("aether_tap"):
            self.build_structure(obs, available, "aether_tap", base, 75)
            return
        if self.build == "economy" and counts.get("colony_hub", 0) < 2 and len(workers) >= 18 and obs["sim_time"] >= 90:
            vacant = [s for s in obs["match"]["starts"] + obs["match"].get("expansions", []) if all(self.distance(s, u["pos"]) >= 26 for u in obs["units"] if u["is_structure"])]
            if vacant:
                pos = min(vacant, key=lambda s: self.distance(s, base))
                self.build_structure(obs, available, "colony_hub", pos, 400, exact=True)
                self.attack(obs, army)
                return
        if self.build == "siege" and not counts.get("workshop"):
            self.build_structure(obs, available, "workshop", base, 150, 100)
        target = 2 if self.build == "siege" else 4
        if counts.get("muster_hall", 0) < target and p["crystal"] >= 150:
            self.build_structure(obs, available, "muster_hall", base, 150)
        worker_goal = 28 if self.build == "economy" else 20
        for h in halls:
            if len(workers) < worker_goal and not h["production_queue_len"]:
                self.client.command("train_pioneer", tags=[h["tag"]])
        for u in mine:
            if u["build_progress"] < 1 or u["production_queue_len"]:
                continue
            if u["unit_type"] == "muster_hall":
                self.client.command("train_rifleman", tags=[u["tag"]])
            elif u["unit_type"] == "workshop":
                self.client.command("train_howitzer", tags=[u["tag"]])
        self.attack(obs, army)

    @staticmethod
    def distance(a, b):
        return hypot(a["x"] - b["x"], a["y"] - b["y"])

    def build_structure(self, obs, workers, kind, base, crystal, aether=0, exact=False):
        workers = [w for w in workers if w["tag"] not in self.busy_builders]
        p = obs["players"]["1"]
        if not workers or p["crystal"] < crystal or p["aether"] < aether:
            return
        candidates = [base] if exact else [
            {"x": base["x"] + cos(tau*i/16)*r, "y": base["y"] + sin(tau*i/16)*r}
            for r in (11, 20, 29, 38) for i in range(16)]
        if kind == "aether_tap":
            candidates = [r["pos"] for r in obs["resources"] if r["resource_type"] == "aether_vent" and self.distance(base, r["pos"]) < 24]
        for pos in candidates:
            res = self.client.command("build_" + kind, tags=[workers[-1]["tag"]], x=pos["x"], y=pos["y"])
            if res.get("accepted"):
                self.busy_builders.add(workers[-1]["tag"])
                return

    def attack(self, obs, army, desperate=False):
        threshold = {"rush": 8, "siege": 16, "economy": 20}[self.build]
        self.attacking |= len(army) >= threshold or desperate
        if not self.attacking:
            return
        structures = [u for u in obs["units"] if u["owner"] == 2 and u["is_structure"]]
        for u in army:
            if not u["orders"] and structures:
                target = min(structures, key=lambda e: self.distance(e["pos"], u["pos"]))
                self.client.command("attack_move", tags=[u["tag"]], x=target["pos"]["x"], y=target["pos"]["y"])
