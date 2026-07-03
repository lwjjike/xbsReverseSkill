#!/usr/bin/env python3
"""验证第二阶段辅助脚本和参考文件是否可用。"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


def configure_utf8_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


configure_utf8_stdio()


SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_DIR = SCRIPT_DIR.parent


def run_json(args: list[str]) -> dict[str, Any]:
    completed = subprocess.run(
        [sys.executable, "-X", "utf8", *args],
        cwd=str(SKILL_DIR),
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return json.loads(completed.stdout)


def check_references() -> dict[str, Any]:
    required = {
        "references/verification-workflow.md": ["进入条件", "动作分级", "真实网页"],
        "references/open-source-recipes.md": ["ddddocr", "OpenCV", "Whisper", "切片乱序", "analyze_tile_restore.py"],
        "references/solver-platform-recipes.md": ["请求模板", "API key", "不默认发送"],
        "references/motion-and-coordinate.md": ["坐标体系", "滑块轨迹", "真实网页执行前检查"],
        "references/provider-execution-notes.md": ["极验", "Turnstile", "WAF"],
    }
    missing: list[str] = []
    for relative, snippets in required.items():
        path = SKILL_DIR / relative
        if not path.exists():
            missing.append(relative)
            continue
        content = path.read_text(encoding="utf-8")
        for snippet in snippets:
            if snippet not in content:
                missing.append(f"{relative}:{snippet}")
    return {"passed": not missing, "missing": missing}


def make_original_image(path: Path, rows: int, cols: int, tile_size: int) -> None:
    from PIL import Image, ImageDraw

    image = Image.new("RGB", (cols * tile_size, rows * tile_size), "white")
    draw = ImageDraw.Draw(image)
    for index in range(rows * cols):
        row, col = divmod(index, cols)
        left = col * tile_size
        top = row * tile_size
        color = (
            30 + (index * 47) % 200,
            40 + (index * 83) % 190,
            50 + (index * 31) % 180,
        )
        draw.rectangle((left, top, left + tile_size - 1, top + tile_size - 1), fill=color)
        draw.line((left, top, left + tile_size - 1, top + tile_size - 1), fill=(255, 255, 255), width=2)
        draw.text((left + 3, top + 3), str(index), fill=(0, 0, 0))
    image.save(path)


def scramble_image(original: Path, output: Path, rows: int, cols: int, tile_size: int, order_source_by_target: list[int]) -> None:
    from PIL import Image

    source = Image.open(original).convert("RGB")
    tiles = []
    for row in range(rows):
        for col in range(cols):
            left = col * tile_size
            top = row * tile_size
            tiles.append(source.crop((left, top, left + tile_size, top + tile_size)))

    scrambled = Image.new("RGB", source.size)
    for target_index, current_index in enumerate(order_source_by_target):
        row, col = divmod(current_index, cols)
        scrambled.paste(tiles[target_index], (col * tile_size, row * tile_size))
    scrambled.save(output)


def images_equal(left: Path, right: Path) -> bool:
    from PIL import Image, ImageChops

    left_image = Image.open(left).convert("RGB")
    right_image = Image.open(right).convert("RGB")
    return ImageChops.difference(left_image, right_image).getbbox() is None


def check_tile_restore() -> dict[str, Any]:
    try:
        import PIL  # noqa: F401
    except ImportError:
        return {"passed": False, "missing": ["Pillow"], "details": {}}

    details: dict[str, Any] = {}
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)

        cases = [
            ("3x3", 3, 3, 18, [1, 2, 0, 4, 5, 3, 7, 8, 6]),
            ("4x2", 4, 2, 18, [1, 0, 3, 2, 5, 4, 7, 6]),
        ]
        for name, rows, cols, tile_size, order in cases:
            original = tmp_dir / f"original-{name}.png"
            scrambled = tmp_dir / f"scrambled-{name}.png"
            restored = tmp_dir / f"restored-{name}.png"
            make_original_image(original, rows, cols, tile_size)
            scramble_image(original, scrambled, rows, cols, tile_size, order)
            report = run_json(
                [
                    "scripts/analyze_tile_restore.py",
                    "--image",
                    str(scrambled),
                    "--rows",
                    str(rows),
                    "--cols",
                    str(cols),
                    "--order-source-by-target",
                    ",".join(str(item) for item in order),
                    "--output-image",
                    str(restored),
                ]
            )
            details[name] = {
                "strategy": report["restore_strategy"],
                "confidence": report["confidence"],
                "image_equal": images_equal(original, restored),
                "order": report["order_source_by_target"],
            }

        original = tmp_dir / "original-2x2.png"
        scrambled = tmp_dir / "scrambled-2x2.png"
        make_original_image(original, 2, 2, 24)
        scramble_image(original, scrambled, 2, 2, 24, [1, 0, 3, 2])
        image_only = run_json(
            [
                "scripts/analyze_tile_restore.py",
                "--image",
                str(scrambled),
                "--rows",
                "2",
                "--cols",
                "2",
            ]
        )
        details["image-only"] = {
            "strategy": image_only["restore_strategy"],
            "confidence": image_only["confidence"],
            "order_len": len(image_only["order_source_by_target"] or []),
        }

        flat = tmp_dir / "flat.png"
        from PIL import Image

        Image.new("RGB", (48, 48), (120, 120, 120)).save(flat)
        flat_report = run_json(
            [
                "scripts/analyze_tile_restore.py",
                "--image",
                str(flat),
                "--rows",
                "2",
                "--cols",
                "2",
            ]
        )
        details["flat"] = {
            "strategy": flat_report["restore_strategy"],
            "confidence": flat_report["confidence"],
            "warnings": flat_report["warnings"],
        }

    passed = (
        details["3x3"]["strategy"] == "page-order"
        and details["3x3"]["image_equal"] is True
        and details["4x2"]["strategy"] == "page-order"
        and details["4x2"]["image_equal"] is True
        and details["image-only"]["order_len"] == 4
        and isinstance(details["image-only"]["confidence"], (int, float))
        and details["flat"]["strategy"] == "manual-or-platform"
        and details["flat"]["confidence"] <= 0.42
    )
    return {"passed": passed, "details": details, "missing": []}


def main() -> int:
    coord = run_json(
        [
            "scripts/map_coordinates.py",
            "--image-size",
            "300x150",
            "--display-size",
            "300x150",
            "--point",
            "120,75",
            "--element-left",
            "20",
            "--element-top",
            "80",
        ]
    )
    track = run_json(
        [
            "scripts/generate_motion_track.py",
            "--mode",
            "slider",
            "--distance",
            "128",
            "--duration-ms",
            "1100",
        ]
    )
    template = run_json(
        [
            "scripts/solver_request_template.py",
            "--platform",
            "2captcha",
            "--captcha-type",
            "token-widget",
            "--provider",
            "recaptcha",
        ]
    )
    assets = run_json(
        [
            "scripts/inspect_assets.py",
            "--captcha-type",
            "slider",
            "--provided",
            "background_or_screenshot",
            "--provided",
            "track_width",
        ]
    )
    tile_restore = check_tile_restore()
    refs = check_references()
    checks = {
        "coordinate_mapping": coord["element_css"]["x"] == 120 and coord["page_css"]["x"] == 140,
        "motion_track": track["mode"] == "slider" and len(track["points"]) >= 2,
        "solver_template": template["send_request"] is False and "api_key" in template,
        "asset_inspection": assets["ready_for_offline_flow"] is True,
        "tile_restore": tile_restore["passed"],
        "references": refs["passed"],
    }
    report = {
        "passed": all(checks.values()),
        "checks": checks,
        "tile_restore": tile_restore,
        "reference_missing": refs["missing"],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
