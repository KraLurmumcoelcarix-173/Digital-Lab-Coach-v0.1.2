import re
from pathlib import Path


def test_app_version_matches_pyproject(monkeypatch):
    monkeypatch.delenv("DLC_VERSION", raising=False)
    import importlib
    import dlc.version as v
    importlib.reload(v)
    want = re.search(r'^version\s*=\s*"([^"]+)"',
                     Path("pyproject.toml").read_text(encoding="utf-8"), re.M).group(1)
    assert v.__version__ == want
