#!/usr/bin/env python3
"""
robos_rts_bot_sdk.py — Python bot SDK for RobOS RTS
Observation -> action -> step loop in the style of open RL environments (Gymnasium / PettingZoo).
The exact same components used for E2E Cucumber testing can be used to write custom Python bots,
run multi-faction AI Arena matches, or hook up external LLM/RL agents via the HTTP/JSON API (:18095).
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional
import urllib.error
import urllib.request


class RTSClient:
    def __init__(self, host: str = "127.0.0.1", port: int = 18095) -> None:
        self.base_url = f"http://{host}:{port}"

    def _request(self, method: str, path: str, payload: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        url = f"{self.base_url}{path}"
        data = json.dumps(payload).encode("utf-8") if payload is not None else None
        headers = {"Content-Type": "application/json"} if data is not None else {}
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=10.0) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def health(self) -> Dict[str, Any]:
        return self._request("GET", "/health")

    def get_observation(self, player: int = 1) -> Dict[str, Any]:
        return self._request("GET", "/observation", {"player": player})

    def pause(self, paused: bool = True) -> Dict[str, Any]:
        return self._request("POST", "/pause", {"paused": paused})

    def set_playback(self, paused: bool = False, speed: float = 1.0) -> Dict[str, Any]:
        """Control the live frame clock without manually advancing simulation ticks."""
        return self._request("POST", "/playback", {"paused": paused, "speed": speed})

    def step(self, ticks: int = 16) -> Dict[str, Any]:
        return self._request("POST", "/step", {"count": ticks})

    def load_scenario(self, scenario: Dict[str, Any]) -> Dict[str, Any]:
        return self._request("POST", "/scenario", scenario)

    def load_scenario_slug(self, slug: str) -> Dict[str, Any]:
        return self._request("POST", "/scenario", {"slug": slug})

    def new_match(self, difficulty: str = "normal", strategy: str = "balanced", seed: Optional[int] = None) -> Dict[str, Any]:
        payload = {"difficulty": difficulty, "strategy": strategy}
        if seed is not None:
            payload["seed"] = seed
        return self._request("POST", "/match", payload)

    def surrender(self, player: int = 1) -> Dict[str, Any]:
        return self._request("POST", "/match", {"action": "surrender", "player": player})

    def editor(self, action: str = "state", **params: Any) -> Dict[str, Any]:
        """Drive the Map Editor (`scenes/MapEditor.tscn`); action="open" switches the game into it."""
        try:
            return self._request("POST", "/editor", {"action": action, **params})
        except urllib.error.HTTPError as err:
            return json.loads(err.read().decode("utf-8"))

    def command(
        self,
        command: str,
        tags: Optional[List[int]] = None,
        x: float = 0.0,
        y: float = 0.0,
        target_tag: int = 0,
        unit_type: Optional[str] = None,
        owner: int = 1,
        structure_type: str = "",
        queue: bool = False,
    ) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "command": command,
            "x": x,
            "y": y,
            "target_tag": target_tag,
            "owner": owner,
            "queue": queue,
        }
        if tags is not None:
            payload["tags"] = tags
        if unit_type is not None:
            payload["unit_type"] = unit_type
        if structure_type:
            payload["structure_type"] = structure_type
        return self._request("POST", "/action", payload)

    def set_directive(self, player: int, mode: str, enabled: bool = True, target_x: float = 64.0, target_y: float = 48.0) -> Dict[str, Any]:
        return self._request(
            "POST",
            "/directive",
            {"player": player, "mode": mode, "enabled": enabled, "target_x": target_x, "target_y": target_y},
        )

    def set_overlay(self, step_text: str, proof_text: str = "") -> Dict[str, Any]:
        return self._request("POST", "/overlay", {"step": step_text, "proof": proof_text})

    def select(self, tags: Optional[List[int]] = None, unit_type: Optional[str] = None, owner: int = 1) -> Dict[str, Any]:
        payload: Dict[str, Any] = {"owner": owner}
        if tags is not None:
            payload["tags"] = tags
        if unit_type is not None:
            payload["unit_type"] = unit_type
        return self._request("POST", "/select", payload)

    def set_camera(self, x: float = 64.0, y: float = 68.0, z: float = 92.0) -> Dict[str, Any]:
        return self._request("POST", "/camera", {"x": x, "y": y, "z": z})

    def screenshot(self, path: str, asynchronous: bool = False) -> Dict[str, Any]:
        return self._request("POST", "/screenshot", {"path": path, "async": asynchronous})

    def capture_status(self) -> Dict[str, Any]:
        return self._request("GET", "/capture")

    def focus_camera(self, x: float, y: float, height: float = 50.0) -> Dict[str, Any]:
        return self._request("POST", "/camera", {"focus_x": x, "focus_y": y, "height": height})

    def mouse(self, x: float, y: float, button: int = 1, pressed: bool = True, **mods: Any) -> Dict[str, Any]:
        """Inject a mouse button event (1 left, 2 right) through the game's real input handlers."""
        return self._request("POST", "/input", {"type": "mouse_button", "x": x, "y": y, "button": button, "pressed": pressed, **mods})

    def mouse_move(self, x: float, y: float) -> Dict[str, Any]:
        return self._request("POST", "/input", {"type": "mouse_motion", "x": x, "y": y})

    def key(self, key: str, pressed: bool = True, **mods: Any) -> Dict[str, Any]:
        """Inject a key event, e.g. key("A"), key("1", ctrl=True), key("F1")."""
        return self._request("POST", "/input", {"type": "key", "key": key, "pressed": pressed, **mods})

    def drag_select(self, x0: float, y0: float, x1: float, y1: float, **mods: Any) -> Dict[str, Any]:
        self.mouse(x0, y0, 1, True, **mods)
        self.mouse_move(x1, y1)
        return self.mouse(x1, y1, 1, False, **mods)

    def project(self, *points: Any) -> List[List[float]]:
        """World (x, y[, height]) points -> screen pixels for the current camera."""
        return self._request("POST", "/ui", {"project": [list(p) for p in points]})["state"]["projected"]

    def ui(self, **state: Any) -> Dict[str, Any]:
        """Drive HUD state: local_player, hover=[x, y], help, pending_ability, message, control_group, focus."""
        return self._request("POST", "/ui", state)


class RTSBotBase:
    """
    Base class for custom bots in RobOS RTS.
    Subclass this and implement `on_step(obs, step_idx)`!
    """

    def __init__(self, player_id: int, client: RTSClient) -> None:
        self.player_id = player_id
        self.client = client

    def my_units(self, obs: Dict[str, Any], unit_type: Optional[str] = None) -> List[Dict[str, Any]]:
        return [
            u for u in obs.get("units", [])
            if u["owner"] == self.player_id and (unit_type is None or u["unit_type"] == unit_type)
        ]

    def enemy_units(self, obs: Dict[str, Any]) -> List[Dict[str, Any]]:
        return [u for u in obs.get("units", []) if u["owner"] != self.player_id and u["hp"] > 0]

    def on_step(self, obs: Dict[str, Any], iteration: int) -> None:
        pass
