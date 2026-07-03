#!/usr/bin/env python3
"""检查第二阶段验证码验证所需的离线证据是否齐备。"""

from __future__ import annotations

import argparse
import imghdr
import json
import sys
import wave
from pathlib import Path
from typing import Any


def configure_utf8_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


configure_utf8_stdio()


REQUIRED_BY_TYPE = {
    "text": ["image"],
    "math": ["image_or_text"],
    "slider": ["background_or_screenshot", "track_width"],
    "click-select": ["screenshot", "prompt"],
    "rotate": ["image", "track_width"],
    "grid": ["screenshot", "prompt"],
    "audio": ["audio"],
    "drag-drop": ["screenshot", "source_target_bounds"],
    "trace-draw": ["screenshot_or_path_points"],
    "scratch": ["box"],
    "image-restore": ["image_or_tiles"],
    "area-select": ["screenshot", "prompt"],
    "difference-click": ["image_pair_or_screenshot"],
    "font-identify": ["screenshot", "prompt"],
    "semantic-reasoning": ["screenshot", "prompt"],
    "game-challenge": ["screenshot", "prompt_or_provider_key"],
    "pow-challenge": ["challenge_payload"],
    "risk-score": ["sitekey", "action_or_server_log"],
    "one-click": ["component_html"],
    "multi-step": ["round_screenshots"],
    "qa-logic": ["question"],
    "token-widget": ["sitekey", "pageurl"],
    "waf-challenge": ["headers_or_challenge_html"],
}


def inspect_file(path: Path) -> dict[str, Any]:
    item: dict[str, Any] = {
        "path": str(path),
        "exists": path.exists(),
        "is_file": path.is_file() if path.exists() else False,
    }
    if not item["is_file"]:
        return item
    item["size_bytes"] = path.stat().st_size
    image_type = imghdr.what(path)
    if image_type:
        item["kind"] = f"image/{image_type}"
    elif path.suffix.lower() in {".mp3", ".ogg", ".m4a", ".flac"}:
        item["kind"] = f"audio/{path.suffix.lower().lstrip('.')}"
    elif path.suffix.lower() == ".wav":
        item["kind"] = "audio/wav"
        try:
            with wave.open(str(path), "rb") as handle:
                item["audio"] = {
                    "channels": handle.getnchannels(),
                    "sample_width": handle.getsampwidth(),
                    "frame_rate": handle.getframerate(),
                    "frames": handle.getnframes(),
                }
        except wave.Error:
            item["audio_error"] = "无法读取 wav 元信息"
    else:
        item["kind"] = "text-or-binary"
    return item


def build_report(args: argparse.Namespace) -> dict[str, Any]:
    files = [inspect_file(Path(value)) for value in args.file or []]
    provided = set(args.provided or [])
    captcha_type = args.captcha_type
    required = REQUIRED_BY_TYPE.get(captcha_type, [])
    missing = [name for name in required if name not in provided]
    return {
        "captcha_type": captcha_type,
        "required_evidence": required,
        "provided_evidence": sorted(provided),
        "missing_evidence": missing,
        "files": files,
        "ready_for_offline_flow": not missing and all(item.get("exists") for item in files),
        "notes": [
            "只检查离线证据齐备性，不打开网页、不读取 Cookie/Storage、不提交验证。",
            "如果要真实网页执行，必须按 verification-workflow.md 再次确认。",
        ],
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="检查验证码验证流程所需证据")
    parser.add_argument("--captcha-type", required=True)
    parser.add_argument("--file", action="append", help="证据文件路径，可重复")
    parser.add_argument("--provided", action="append", help="已具备的证据项，如 image/sitekey/pageurl")
    parser.add_argument("--pretty", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    report = build_report(args)
    print(json.dumps(report, ensure_ascii=False, indent=2 if args.pretty else None))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
