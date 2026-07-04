#!/usr/bin/env python3
"""评估第二阶段验证码验证尝试，并判断是否应切换到平台对照。"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def configure_utf8_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


configure_utf8_stdio()


MIN_FAILURES_FOR_SWITCH = 5
NO_ORDINARY_PLATFORM_TYPES = {"pow-challenge", "waf-challenge", "biometric-liveness"}
OK_STATUSES = {
    "ok",
    "pass",
    "passed",
    "success",
    "successful",
    "ready",
    "clean",
    "normal",
    "valid",
    "verified",
    "no_issue",
    "no-issue",
    "none",
    "无异常",
    "正常",
    "通过",
}

STATUS_ALIASES = {
    "coordinate": "coordinates",
    "coord": "coordinates",
    "coords": "coordinates",
    "motion": "track",
    "trajectory": "track",
    "tile": "tile_restore",
    "restore": "tile_restore",
    "env": "browser_env",
    "environment": "browser_env",
    "browser": "browser_env",
    "freshness": "challenge_freshness",
    "ttl": "challenge_freshness",
    "challenge": "challenge_freshness",
}

AXIS_LABELS = {
    "image": "图片/识别结果",
    "coordinates": "坐标映射",
    "track": "轨迹/交互行为",
    "tile_restore": "切片乱序还原",
    "browser_env": "补环境/浏览器环境",
    "challenge_freshness": "challenge 新鲜度/TTL",
}

BLOCKING_ROUTE_BY_AXIS = {
    "image": "fix-image-recognition",
    "coordinates": "fix-coordinate-mapping",
    "track": "fix-motion-track",
    "tile_restore": "fix-tile-restore",
    "browser_env": "fix-browser-env",
    "challenge_freshness": "refresh-challenge",
}

PLATFORM_CANDIDATES = {
    "text": ["云码/JFBYM", "超级鹰", "2Captcha ImageToText", "Anti-Captcha Image"],
    "math": ["云码/JFBYM", "超级鹰", "2Captcha Normal Captcha"],
    "slider": ["云码/JFBYM 滑块类型", "超级鹰滑块/坐标类型", "CapSolver", "2Captcha GeeTest/slider"],
    "image-restore": ["云码/JFBYM 拼图/图片任务", "超级鹰滑块/坐标类型", "CapSolver 图片任务", "2Captcha 图片任务"],
    "click-select": ["云码/JFBYM 坐标/点选类型", "超级鹰坐标类型", "2Captcha Coordinates", "CapSolver ComplexImageTask"],
    "grid": ["2Captcha Grid/reCAPTCHA", "CapSolver", "CapMonster Cloud", "Anti-Captcha", "NopeCHA"],
    "rotate": ["云码/JFBYM 旋转类型", "超级鹰旋转/坐标类型", "CapSolver 图片任务", "2Captcha 图片任务"],
    "audio": ["2Captcha Audio", "CapMonster/Anti-Captcha 音频任务", "人工复核"],
    "drag-drop": ["云码/JFBYM 坐标类型", "超级鹰坐标类型", "CapSolver ComplexImageTask", "人工接管"],
    "trace-draw": ["云码/JFBYM 轨迹/坐标类型", "超级鹰坐标/轨迹类", "人工标注"],
    "scratch": ["云码/JFBYM 定制类型", "超级鹰定制/人工", "人工接管"],
    "area-select": ["云码/JFBYM 坐标/区域类型", "超级鹰坐标类型", "CapSolver ComplexImageTask"],
    "difference-click": ["云码/JFBYM 坐标类型", "超级鹰坐标类型", "人工标注"],
    "font-identify": ["云码/JFBYM 定制/坐标类型", "超级鹰人工/坐标类型", "人工标注"],
    "semantic-reasoning": ["云码/JFBYM 定制/坐标类型", "超级鹰人工/坐标类型", "CapSolver ComplexImageTask"],
    "game-challenge": ["2Captcha FunCaptcha/Arkose", "CapSolver FunCaptcha", "Anti-Captcha FunCaptcha", "NopeCHA", "人工接管"],
    "risk-score": ["2Captcha reCAPTCHA v3/Enterprise", "CapSolver", "CapMonster Cloud", "Anti-Captcha"],
    "one-click": ["2Captcha token 任务", "CapSolver", "CapMonster Cloud", "人工接管"],
    "multi-step": ["按每轮子类型选择平台", "人工接管多轮流程"],
    "qa-logic": ["云码/JFBYM 文字/定制类型", "超级鹰人工类型", "2Captcha Normal Captcha"],
    "token-widget": ["2Captcha", "CapSolver", "CapMonster Cloud", "Anti-Captcha", "YesCaptcha/NoCaptchaAI"],
    "unknown-custom": ["云码/JFBYM 定制", "超级鹰人工/定制", "2Captcha/CapSolver 通用图片或坐标任务"],
}


def load_json_source(value: str) -> Any:
    stripped = value.lstrip()
    if stripped.startswith("{") or stripped.startswith("["):
        return json.loads(value)
    path = Path(value)
    try:
        if path.exists() and path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
    except OSError:
        pass
    return json.loads(value)


def get_first(mapping: dict[str, Any], names: list[str], default: Any = None) -> Any:
    for name in names:
        if name in mapping and mapping[name] not in (None, ""):
            return mapping[name]
    return default


def normalize_attempts(data: Any) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)], {}
    if isinstance(data, dict):
        attempts = data.get("attempts")
        if isinstance(attempts, list):
            defaults = {key: value for key, value in data.items() if key != "attempts"}
            return [item for item in attempts if isinstance(item, dict)], defaults
        return [data], {}
    raise ValueError("attempts JSON 必须是数组，或包含 attempts 数组的对象")


def context_value(attempt: dict[str, Any], defaults: dict[str, Any], names: list[str], fallback: str) -> str:
    value = get_first(attempt, names, get_first(defaults, names, fallback))
    return str(value)


def attempt_context(attempt: dict[str, Any], defaults: dict[str, Any]) -> dict[str, str]:
    return {
        "authorization_scope": context_value(attempt, defaults, ["authorization_scope", "scope", "target"], "未声明授权目标"),
        "captcha_type": context_value(attempt, defaults, ["captcha_type", "type"], "unknown-custom"),
        "captcha_variant": context_value(attempt, defaults, ["captcha_variant", "variant"], ""),
        "provider": context_value(attempt, defaults, ["provider"], "custom-or-unknown"),
        "chosen_solution": context_value(attempt, defaults, ["chosen_solution", "solution", "route"], "未声明方案"),
    }


def same_context(left: dict[str, str], right: dict[str, str]) -> bool:
    return (
        left["authorization_scope"] == right["authorization_scope"]
        and left["captcha_type"] == right["captcha_type"]
        and left["chosen_solution"] == right["chosen_solution"]
    )


def is_success(attempt: dict[str, Any]) -> bool:
    if isinstance(attempt.get("success"), bool):
        return bool(attempt["success"])
    status = str(get_first(attempt, ["status", "result", "outcome"], "")).strip().lower()
    return status in {"success", "succeeded", "passed", "pass", "ok", "成功", "通过"}


def normalize_axis(name: str) -> str:
    return STATUS_ALIASES.get(name.strip().lower(), name.strip().lower())


def normalize_status(value: Any) -> str:
    if isinstance(value, bool):
        return "ok" if value else "issue"
    if value is None:
        return "unknown"
    status = str(value).strip().lower()
    if not status:
        return "unknown"
    return "ok" if status in OK_STATUSES else status


def extract_diagnosis(attempt: dict[str, Any]) -> dict[str, str]:
    raw = get_first(attempt, ["diagnosis_status", "diagnosis", "checks"], {})
    diagnosis: dict[str, str] = {}
    if isinstance(raw, dict):
        for key, value in raw.items():
            normalized = normalize_axis(str(key))
            if isinstance(value, dict):
                value = get_first(value, ["status", "result", "state"], "unknown")
            diagnosis[normalized] = normalize_status(value)

    for key, axis in [
        ("image_status", "image"),
        ("coordinate_status", "coordinates"),
        ("coordinates_status", "coordinates"),
        ("track_status", "track"),
        ("tile_restore_status", "tile_restore"),
        ("browser_env_status", "browser_env"),
        ("environment_status", "browser_env"),
        ("challenge_freshness_status", "challenge_freshness"),
        ("challenge_status", "challenge_freshness"),
    ]:
        if key in attempt:
            diagnosis[axis] = normalize_status(attempt[key])
    return diagnosis


def applicable_axes(captcha_type: str, captcha_variant: str) -> list[str]:
    if captcha_type in {"text", "math", "audio", "qa-logic"}:
        return ["image", "challenge_freshness"]
    if captcha_type == "slider":
        return ["image", "coordinates", "track", "browser_env", "challenge_freshness"]
    if captcha_type == "image-restore":
        axes = ["image", "coordinates", "track", "browser_env", "challenge_freshness"]
        if captcha_variant == "tile-scramble":
            axes.insert(1, "tile_restore")
        return axes
    if captcha_type in {"click-select", "grid", "area-select", "difference-click", "font-identify", "semantic-reasoning"}:
        return ["image", "coordinates", "browser_env", "challenge_freshness"]
    if captcha_type in {"rotate", "drag-drop", "trace-draw", "scratch"}:
        return ["image", "coordinates", "track", "browser_env", "challenge_freshness"]
    if captcha_type in {"token-widget", "risk-score", "one-click", "game-challenge", "multi-step"}:
        return ["browser_env", "challenge_freshness"]
    if captcha_type in NO_ORDINARY_PLATFORM_TYPES:
        return ["browser_env", "challenge_freshness"]
    return ["image", "coordinates", "browser_env", "challenge_freshness"]


def infer_blocking_axis_from_text(attempts: list[dict[str, Any]]) -> str | None:
    text = "\n".join(
        str(get_first(attempt, ["failure_reason", "reason", "error", "notes"], ""))
        for attempt in attempts
    ).lower()
    keyword_axes = [
        ("tile_restore", ["乱序", "切片", "分块", "tile", "restore", "scramble", "还原"]),
        ("coordinates", ["坐标", "偏移", "映射", "dpr", "coordinate", "offset"]),
        ("track", ["轨迹", "速度", "拖动", "motion", "track", "trajectory"]),
        ("browser_env", ["补环境", "环境", "指纹", "cdp", "webdriver", "browser", "fingerprint"]),
        ("challenge_freshness", ["过期", "ttl", "expired", "stale", "刷新", "challenge id"]),
        ("image", ["图片", "识别", "ocr", "缺口", "角度", "目标", "image", "recognition"]),
    ]
    for axis, keywords in keyword_axes:
        if any(keyword in text for keyword in keywords):
            return axis
    return None


def find_blocking_issue(
    recent_attempts: list[dict[str, Any]],
    context: dict[str, str],
) -> tuple[str | None, dict[str, str]]:
    latest_diagnosis = extract_diagnosis(recent_attempts[-1]) if recent_attempts else {}
    axes = applicable_axes(context["captcha_type"], context["captcha_variant"])
    normalized = {axis: latest_diagnosis.get(axis, "unknown") for axis in axes}

    for axis in axes:
        if normalized[axis] != "ok":
            return axis, normalized

    inferred = infer_blocking_axis_from_text(recent_attempts)
    if inferred and inferred in axes:
        normalized[inferred] = "suspected"
        return inferred, normalized
    return None, normalized


def candidates_for(context: dict[str, str]) -> list[str]:
    captcha_type = context["captcha_type"]
    if captcha_type == "image-restore" and context.get("captcha_variant") == "tile-scramble":
        return ["云码/JFBYM 拼图/图片任务", "超级鹰坐标/拼图类型", "CapSolver 图片任务", "2Captcha 图片任务", "人工复核"]
    return PLATFORM_CANDIDATES.get(captcha_type, PLATFORM_CANDIDATES["unknown-custom"])


def special_route_for(captcha_type: str) -> tuple[str, list[str], str] | None:
    if captcha_type == "pow-challenge":
        return (
            "official-protocol-diagnostics",
            [],
            "PoW/工作量证明不默认推荐普通打码平台；优先检查官方协议、difficulty、nonce、TTL、防重放和服务端签名绑定。",
        )
    if captcha_type == "waf-challenge":
        return (
            "browser-env-and-vendor-diagnostics",
            [],
            "WAF challenge 不等同普通图片验证码；优先做浏览器环境、TLS/HTTP 指纹、IP/session 绑定和厂商日志诊断。",
        )
    if captcha_type == "biometric-liveness":
        return (
            "manual-review-or-vendor-support",
            [],
            "活体/人脸验证涉及隐私与合规，不默认推荐普通打码平台；优先走官方 SDK、人工复核、可访问性替代或厂商支持。",
        )
    return None


def build_platform_control_plan(context: dict[str, str], candidates: list[str]) -> dict[str, Any]:
    return {
        "role": "授权 QA 对照，不是默认替代所有本地方案",
        "send_request": False,
        "candidate_platforms": candidates,
        "template_command": (
            "python scripts/solver_request_template.py "
            f"--platform <platform> --captcha-type {context['captcha_type']} "
            f"--provider {context['provider']} --pretty"
        ),
        "steps": [
            "先生成请求模板和字段映射，只填非秘密字段。",
            "让用户再次确认授权目标、平台、题型、代理/session 绑定要求和是否允许发送。",
            "API key 只由用户运行时提供；不要写入文件、不要保存、不要回显。",
            "平台结果只用于对照本地识别/交互链路与厂商服务端绑定问题。",
        ],
    }


def evaluate(data: Any) -> dict[str, Any]:
    attempts, defaults = normalize_attempts(data)
    if not attempts:
        return {
            "switch_triggered": False,
            "reason": "没有可评估的验证尝试记录。",
            "blocking_issue": "attempts-missing",
            "recommended_next_route": "collect-attempts",
            "platform_candidates": [],
            "attempt_summary": {"total_attempts": 0, "consecutive_same_context": 0, "failures": 0, "successes": 0},
            "diagnosis_status": {},
            "platform_control_plan": {},
            "requires_user_confirmation": ["补充 attempts JSON 后再复盘"],
            "send_request": False,
        }

    context = attempt_context(attempts[-1], defaults)
    consecutive: list[dict[str, Any]] = []
    for attempt in reversed(attempts):
        if same_context(attempt_context(attempt, defaults), context):
            consecutive.append(attempt)
        else:
            break
    consecutive.reverse()

    successes = sum(1 for attempt in consecutive if is_success(attempt))
    failures = len(consecutive) - successes
    special_route = special_route_for(context["captcha_type"])
    platform_candidates = candidates_for(context) if not special_route else special_route[1]
    blocking_axis, diagnosis_status = find_blocking_issue(consecutive, context)
    summary = {
        "total_attempts": len(attempts),
        "consecutive_same_context": len(consecutive),
        "failures": failures,
        "successes": successes,
        "context": context,
        "failure_threshold": MIN_FAILURES_FOR_SWITCH,
    }

    base: dict[str, Any] = {
        "attempt_summary": summary,
        "diagnosis_status": diagnosis_status,
        "platform_candidates": platform_candidates,
        "platform_control_plan": build_platform_control_plan(context, platform_candidates) if platform_candidates else {},
        "requires_user_confirmation": [
            "实际发送打码平台请求前，必须再次确认授权范围、平台、题型和执行动作。",
            "API key 只在运行时由用户提供，不保存、不回显。",
        ],
        "send_request": False,
    }

    if special_route:
        route, candidates, reason = special_route
        return {
            **base,
            "switch_triggered": False,
            "escalation_decision": "ordinary-platform-not-recommended",
            "reason": reason,
            "blocking_issue": None,
            "recommended_next_route": route,
            "platform_candidates": candidates,
            "platform_control_plan": {},
        }

    if successes:
        return {
            **base,
            "switch_triggered": False,
            "escalation_decision": "keep-and-optimize",
            "reason": "同一授权目标和同一方案下已有成功记录；当前方案可用，但需要继续优化稳定性和失败样本原因。",
            "blocking_issue": None,
            "recommended_next_route": "optimize-current-route",
        }

    if failures < MIN_FAILURES_FOR_SWITCH:
        return {
            **base,
            "switch_triggered": False,
            "escalation_decision": "wait-for-more-evidence",
            "reason": f"连续失败 {failures} 次，未达到 {MIN_FAILURES_FOR_SWITCH} 次失败复盘门槛。",
            "blocking_issue": None,
            "recommended_next_route": "continue-current-route-with-diagnostics",
        }

    if blocking_axis:
        return {
            **base,
            "switch_triggered": False,
            "escalation_decision": "fix-blocking-issue-first",
            "reason": f"已达到失败次数门槛，但仍存在明确阻塞项：{AXIS_LABELS.get(blocking_axis, blocking_axis)}。",
            "blocking_issue": blocking_axis,
            "recommended_next_route": BLOCKING_ROUTE_BY_AXIS.get(blocking_axis, "fix-blocking-issue"),
        }

    return {
        **base,
        "switch_triggered": True,
        "escalation_decision": "recommend-platform-control",
        "reason": (
            f"同一授权目标、同一验证码类型、同一方案连续 {failures} 次验证失败且无成功记录，"
            "图片/坐标/轨迹/还原/补环境/challenge 新鲜度未见明显异常；建议切换到打码平台做授权 QA 对照。"
        ),
        "blocking_issue": None,
        "recommended_next_route": "platform-control",
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="评估验证码验证尝试是否应切换方案")
    parser.add_argument("--attempts", required=True, help="attempts JSON 文件路径，或直接传 JSON 字符串")
    parser.add_argument("--pretty", action="store_true", help="以缩进格式输出 JSON")
    parser.add_argument("--json", action="store_true", help="兼容参数；脚本始终输出 JSON")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    report = evaluate(load_json_source(args.attempts))
    print(json.dumps(report, ensure_ascii=False, indent=2 if args.pretty else None))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
