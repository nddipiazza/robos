#!/usr/bin/env python3
"""
Base class for RobOS Video Game QA Player scenarios.
"""

from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..qa_player import VideoGameQAPlayer

class BaseQAScenario:
    name: str = "Base Scenario"
    description: str = "Base description"

    def execute(self, player: VideoGameQAPlayer) -> dict:
        raise NotImplementedError("Subclasses must implement execute(player)")
