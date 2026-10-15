#!/usr/bin/env python3
"""
robos_sc2_bot_sdk.py — Python SC2 Bot SDK for RobOS RTS (modeled on BurnySc2/python-sc2 & DeepMind pysc2)
Communicates with the GameControlServer HTTP/JSON s2client-proto endpoint (:18095).
"""

from __future__ import annotations

import json
import urllib.request
from typing import Any, Dict, List, Optional


class RobOSSC2Client:
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

    def step(self, ticks: int = 16) -> Dict[str, Any]:
        return self._request("POST", "/step", {"count": ticks})

    def load_scenario(self, scenario: Dict[str, Any]) -> Dict[str, Any]:
        return self._request("POST", "/scenario", scenario)

    def load_scenario_slug(self, slug: str) -> Dict[str, Any]:
        return self._request("POST", "/scenario", {"slug": slug})

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
