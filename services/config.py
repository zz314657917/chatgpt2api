from __future__ import annotations

import json
import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import cast


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
CONFIG_FILE = BASE_DIR / "config.json"
CONFIG_EXAMPLE_FILE = BASE_DIR / "config.example.json"


@dataclass(frozen=True)
class AppSettings:
    auth_key: str
    host: str
    port: int
    accounts_file: Path
    refresh_account_interval_minute: int

def _load_json_object(path: Path, *, name: str) -> dict[str, object]:
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        return {}

    loaded = json.loads(text)
    if not isinstance(loaded, dict):
        raise ValueError(f"{name} must be a JSON object")
    return loaded


def _ensure_config_file() -> None:
    if CONFIG_FILE.exists():
        return
    if not CONFIG_EXAMPLE_FILE.exists():
        return
    shutil.copyfile(CONFIG_EXAMPLE_FILE, CONFIG_FILE)


def _load_settings() -> AppSettings:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    _ensure_config_file()

    raw_config: dict[str, object] = {}
    if CONFIG_EXAMPLE_FILE.exists():
        raw_config.update(_load_json_object(CONFIG_EXAMPLE_FILE, name="config.example.json"))
    if CONFIG_FILE.exists():
        raw_config.update(_load_json_object(CONFIG_FILE, name="config.json"))

    auth_key = str(os.getenv("CHATGPT2API_AUTH_KEY") or raw_config.get("auth-key") or "").strip()
    if not auth_key:
        raise ValueError("config.example.json must contain a non-empty 'auth-key'")
    refresh_account_interval_minute = cast(int, raw_config.get("refresh_account_interval_minute", 5))

    return AppSettings(
        auth_key=auth_key,
        host="0.0.0.0",
        port=8000,
        accounts_file=DATA_DIR / "accounts.json",
        refresh_account_interval_minute=refresh_account_interval_minute,
    )


config = _load_settings()
