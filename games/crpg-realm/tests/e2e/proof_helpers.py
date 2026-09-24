"""
proof_helpers.py — evidence-carrying assertions for the RobOS cRPG E2E suite.

Every Then-step should not only assert, it should *show what it read back from the game*.
Steps call ``proof(context, "...")`` with the live values they verified (HP before/after,
radii, distances, event timings, IE round numbers). ``environment.after_step`` posts the
step name plus that evidence to the in-game QA overlay (``/api/v1/qa/proof``), so every
recorded MP4 carries an on-screen, state-API-backed proof panel.

Engine events come from the GameState event journal (``POST /api/v1/engine/events``):
monotonic ``seq``, ``t_ms`` timestamp and the Infinity Engine ``round`` (6 s of unpaused
time) they occurred in — use them to verify ordering, latency and round-by-round rules.
"""

from __future__ import annotations

import json
import time
import urllib.request

PX_PER_FOOT = 9.0  # mirrors GameState.PX_PER_FOOT (20-ft Fireball == 180 px)


def _post(port: int, endpoint: str, payload: dict, timeout: float = 5.0) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(f"http://127.0.0.1:{port}{endpoint}", data=data,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _get(port: int, endpoint: str, timeout: float = 5.0) -> dict:
    req = urllib.request.Request(f"http://127.0.0.1:{port}{endpoint}", method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def proof(context, evidence: str) -> None:
    """Attach a line of evidence (live values read from the game) to the current step."""
    if not hasattr(context, "step_proofs") or context.step_proofs is None:
        context.step_proofs = []
    context.step_proofs.append(evidence)


def mark(context) -> int:
    """Remember the current engine-event sequence number (events after it belong to this action)."""
    st = _post(context.web_port, "/api/v1/engine/events", {"since": 10**12})
    context.event_mark = int(st.get("latest_seq", 0))
    return context.event_mark


def events(context, type_: str = "", since: int | None = None) -> list[dict]:
    if since is None:
        since = getattr(context, "scenario_event_mark", 0)
    res = _post(context.web_port, "/api/v1/engine/events", {"since": since, "type": type_})
    return res.get("events", [])


def wait_for_event(context, type_: str, predicate=lambda e: True, since: int | None = None,
                   timeout: float = 4.0) -> dict | None:
    end = time.time() + timeout
    while time.time() < end:
        for ev in events(context, type_, since):
            if predicate(ev):
                return ev
        time.sleep(0.1)
    return None


def state(context) -> dict:
    return _get(context.web_port, "/api/v1/state")


def enemy(context, enemy_id: str) -> dict:
    st = state(context)
    for en in st.get("battle", {}).get("enemies", []):
        if en.get("id") == enemy_id:
            return en
    raise AssertionError(f"Enemy '{enemy_id}' not found in battle.enemies")


def post_proof(port: int, check: str, evidence: str, passed: bool) -> None:
    try:
        _post(port, "/api/v1/qa/proof", {"check": check, "evidence": evidence, "passed": passed}, timeout=1.5)
    except Exception:
        pass


def clear_proofs(port: int, title: str) -> None:
    try:
        _post(port, "/api/v1/qa/proof_clear", {"title": title}, timeout=1.5)
    except Exception:
        pass
