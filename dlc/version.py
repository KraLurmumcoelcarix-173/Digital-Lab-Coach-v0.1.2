"""
The running app's version
"""

from __future__ import annotations

import os
import re
from pathlib import Path


def _from_metadata() -> str | None:
    try:
        from importlib.metadata import version
        return version("digital-lab-coach")
    except Exception:
        return None


def _from_pyproject() -> str | None:
    try:
        text = (Path(__file__).resolve().parent.parent / "pyproject.toml").read_text(
            encoding="utf-8")
        m = re.search(r'^version\s*=\s*"([^"]+)"', text, re.MULTILINE)
        return m.group(1) if m else None
    except OSError:
        return None


__version__ = (os.environ.get("DLC_VERSION") or _from_pyproject()
               or _from_metadata() or "0.0.0")
