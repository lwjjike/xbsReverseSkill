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
        "references/verification-workflow.md": ["进入条件", "动作分级", "真实网页", "成功样本基线", "evaluate_success_baseline.py", "5 次失败复盘门槛", "evaluate_verification_attempts.py"],
        "references/browser-acquisition.md": ["用户手动成功样本", "至少 5 次成功样本", "每个新类型至少补到 2 次成功样本"],
        "references/open-source-recipes.md": ["ddddocr", "OpenCV", "Whisper", "切片乱序", "analyze_tile_restore.py"],
        "references/solver-platform-recipes.md": ["请求模板", "API key", "不默认发送", "授权 QA 对照"],
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


def write_attempts(path: Path, captcha_type: str, attempts: list[dict[str, Any]], captcha_variant: str = "") -> None:
    data = {
        "authorization_scope": "授权测试目标",
        "captcha_type": captcha_type,
        "captcha_variant": captcha_variant,
        "provider": "geetest" if captcha_type == "slider" else "custom-or-unknown",
        "chosen_solution": f"open-source-{captcha_type}",
        "attempts": attempts,
    }
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def failed_attempt(status_overrides: dict[str, str] | None = None) -> dict[str, Any]:
    diagnosis = {
        "image": "ok",
        "coordinates": "ok",
        "track": "ok",
        "tile_restore": "ok",
        "browser_env": "ok",
        "challenge_freshness": "ok",
    }
    if status_overrides:
        diagnosis.update(status_overrides)
    return {
        "success": False,
        "diagnosis_status": diagnosis,
        "failure_reason": "服务端仍判定失败，离线诊断未发现明显异常",
    }


def check_attempt_evaluation() -> dict[str, Any]:
    details: dict[str, Any] = {}
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)

        switch_path = tmp_dir / "switch.json"
        write_attempts(switch_path, "slider", [failed_attempt() for _ in range(5)])
        switch_report = run_json(["scripts/evaluate_verification_attempts.py", "--attempts", str(switch_path)])
        details["switch"] = {
            "switch_triggered": switch_report["switch_triggered"],
            "route": switch_report["recommended_next_route"],
            "decision": switch_report["escalation_decision"],
            "send_request": switch_report["send_request"],
        }

        below_path = tmp_dir / "below.json"
        write_attempts(below_path, "slider", [failed_attempt() for _ in range(4)])
        below_report = run_json(["scripts/evaluate_verification_attempts.py", "--attempts", str(below_path)])
        details["below_threshold"] = {
            "switch_triggered": below_report["switch_triggered"],
            "route": below_report["recommended_next_route"],
        }

        blocking_path = tmp_dir / "blocking.json"
        write_attempts(blocking_path, "slider", [failed_attempt() for _ in range(4)] + [failed_attempt({"coordinates": "error"})])
        blocking_report = run_json(["scripts/evaluate_verification_attempts.py", "--attempts", str(blocking_path)])
        details["blocking"] = {
            "switch_triggered": blocking_report["switch_triggered"],
            "blocking_issue": blocking_report["blocking_issue"],
            "route": blocking_report["recommended_next_route"],
        }

        success_path = tmp_dir / "success.json"
        success_attempts = [failed_attempt() for _ in range(4)] + [failed_attempt()]
        success_attempts[2]["success"] = True
        write_attempts(success_path, "slider", success_attempts)
        success_report = run_json(["scripts/evaluate_verification_attempts.py", "--attempts", str(success_path)])
        details["success"] = {
            "switch_triggered": success_report["switch_triggered"],
            "route": success_report["recommended_next_route"],
        }

        tile_path = tmp_dir / "tile.json"
        write_attempts(tile_path, "image-restore", [failed_attempt() for _ in range(5)], captcha_variant="tile-scramble")
        tile_report = run_json(["scripts/evaluate_verification_attempts.py", "--attempts", str(tile_path)])
        details["tile_scramble"] = {
            "switch_triggered": tile_report["switch_triggered"],
            "route": tile_report["recommended_next_route"],
            "has_platform_candidates": bool(tile_report["platform_candidates"]),
        }

        special: dict[str, Any] = {}
        for captcha_type in ["pow-challenge", "waf-challenge", "biometric-liveness"]:
            path = tmp_dir / f"{captcha_type}.json"
            write_attempts(path, captcha_type, [failed_attempt() for _ in range(5)])
            report = run_json(["scripts/evaluate_verification_attempts.py", "--attempts", str(path)])
            special[captcha_type] = {
                "switch_triggered": report["switch_triggered"],
                "decision": report["escalation_decision"],
                "platform_candidates": report["platform_candidates"],
            }
        details["special_types"] = special

    passed = (
        details["switch"]["switch_triggered"] is True
        and details["switch"]["route"] == "platform-control"
        and details["switch"]["decision"] == "recommend-platform-control"
        and details["switch"]["send_request"] is False
        and details["below_threshold"]["switch_triggered"] is False
        and details["blocking"]["switch_triggered"] is False
        and details["blocking"]["blocking_issue"] == "coordinates"
        and details["success"]["switch_triggered"] is False
        and details["success"]["route"] == "optimize-current-route"
        and details["tile_scramble"]["switch_triggered"] is True
        and details["tile_scramble"]["has_platform_candidates"] is True
        and all(item["switch_triggered"] is False for item in details["special_types"].values())
        and all(item["decision"] == "ordinary-platform-not-recommended" for item in details["special_types"].values())
        and all(not item["platform_candidates"] for item in details["special_types"].values())
    )
    return {"passed": passed, "details": details}


def write_success_samples(path: Path, samples: list[dict[str, Any]]) -> None:
    data = {
        "authorization_scope": "授权测试目标",
        "provider": "custom-or-unknown",
        "success_samples": samples,
    }
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def success_sample(captcha_type: str, sample_id: str) -> dict[str, Any]:
    return {
        "sample_id": sample_id,
        "success": True,
        "captcha_type": captcha_type,
        "provider": "custom-or-unknown",
        "evidence": {
            "success_signal": "UI/callback/response 显示验证成功",
            "timeline": ["rendered", "user solved", "success observed"],
        },
    }


def check_success_baseline() -> dict[str, Any]:
    details: dict[str, Any] = {}
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)

        sufficient_path = tmp_dir / "success-sufficient.json"
        write_success_samples(
            sufficient_path,
            [
                success_sample("slider", "s1"),
                success_sample("slider", "s2"),
                success_sample("slider", "s3"),
                success_sample("click-select", "c1"),
                success_sample("click-select", "c2"),
            ],
        )
        sufficient = run_json(["scripts/evaluate_success_baseline.py", "--samples", str(sufficient_path)])
        details["sufficient"] = {
            "status": sufficient["success_baseline_status"],
            "route": sufficient["recommended_next_route"],
            "dynamic": sufficient["success_baseline_summary"]["has_dynamic_type_switch"],
        }

        insufficient_total_path = tmp_dir / "success-insufficient-total.json"
        write_success_samples(
            insufficient_total_path,
            [
                success_sample("slider", "s1"),
                success_sample("slider", "s2"),
                success_sample("slider", "s3"),
            ],
        )
        insufficient_total = run_json(["scripts/evaluate_success_baseline.py", "--samples", str(insufficient_total_path)])
        details["insufficient_total"] = {
            "status": insufficient_total["success_baseline_status"],
            "missing_scopes": [item["scope"] for item in insufficient_total["missing_success_samples"]],
            "send_request": insufficient_total["send_request"],
        }

        insufficient_type_path = tmp_dir / "success-insufficient-type.json"
        write_success_samples(
            insufficient_type_path,
            [
                success_sample("slider", "s1"),
                success_sample("slider", "s2"),
                success_sample("slider", "s3"),
                success_sample("slider", "s4"),
                success_sample("click-select", "c1"),
            ],
        )
        insufficient_type = run_json(["scripts/evaluate_success_baseline.py", "--samples", str(insufficient_type_path)])
        details["insufficient_type"] = {
            "status": insufficient_type["success_baseline_status"],
            "missing": insufficient_type["missing_success_samples"],
        }

    passed = (
        details["sufficient"]["status"] == "sufficient"
        and details["sufficient"]["route"] == "ready-for-verification-flow"
        and details["sufficient"]["dynamic"] is True
        and details["insufficient_total"]["status"] == "insufficient"
        and "total" in details["insufficient_total"]["missing_scopes"]
        and details["insufficient_total"]["send_request"] is False
        and details["insufficient_type"]["status"] == "insufficient"
        and any(item.get("scope") == "captcha_type" and item.get("captcha_type") == "click-select" for item in details["insufficient_type"]["missing"])
    )
    return {"passed": passed, "details": details}


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
    success_baseline = check_success_baseline()
    tile_restore = check_tile_restore()
    attempt_eval = check_attempt_evaluation()
    refs = check_references()
    checks = {
        "coordinate_mapping": coord["element_css"]["x"] == 120 and coord["page_css"]["x"] == 140,
        "motion_track": track["mode"] == "slider" and len(track["points"]) >= 2,
        "solver_template": template["send_request"] is False and "api_key" in template,
        "asset_inspection": assets["ready_for_offline_flow"] is True,
        "success_baseline": success_baseline["passed"],
        "tile_restore": tile_restore["passed"],
        "attempt_evaluation": attempt_eval["passed"],
        "references": refs["passed"],
    }
    report = {
        "passed": all(checks.values()),
        "checks": checks,
        "success_baseline": success_baseline,
        "tile_restore": tile_restore,
        "attempt_evaluation": attempt_eval,
        "reference_missing": refs["missing"],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
