#!/usr/bin/env python3
"""评估用户手动成功验证码样本是否足够形成成功基线。"""

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


MIN_TOTAL_SUCCESS_SAMPLES = 5
MIN_SUCCESS_SAMPLES_PER_TYPE = 2


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


def normalize_samples(data: Any) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if isinstance(data, list):
        return [item for item in data if isinstance(item, dict)], {}
    if isinstance(data, dict):
        for key in ("success_samples", "samples", "manual_success_samples"):
            value = data.get(key)
            if isinstance(value, list):
                defaults = {name: item for name, item in data.items() if name != key}
                return [item for item in value if isinstance(item, dict)], defaults
        return [data], {}
    raise ValueError("success baseline JSON 必须是数组，或包含 success_samples/samples 数组的对象")


def is_success(sample: dict[str, Any]) -> bool:
    if isinstance(sample.get("success"), bool):
        return bool(sample["success"])
    status = str(get_first(sample, ["status", "result", "outcome"], "")).strip().lower()
    return status in {"success", "succeeded", "passed", "pass", "ok", "成功", "通过"}


def normalize_type(value: Any) -> str:
    text = str(value or "").strip()
    return text or "unknown-custom"


def sample_context(sample: dict[str, Any], defaults: dict[str, Any]) -> dict[str, str]:
    return {
        "authorization_scope": str(get_first(sample, ["authorization_scope", "scope", "target"], get_first(defaults, ["authorization_scope", "scope", "target"], "未声明授权目标"))),
        "provider": str(get_first(sample, ["provider"], get_first(defaults, ["provider"], "custom-or-unknown"))),
        "captcha_type": normalize_type(get_first(sample, ["captcha_type", "type"], get_first(defaults, ["captcha_type", "type"], "unknown-custom"))),
        "captcha_variant": str(get_first(sample, ["captcha_variant", "variant"], get_first(defaults, ["captcha_variant", "variant"], ""))),
    }


def evaluate(data: Any) -> dict[str, Any]:
    samples, defaults = normalize_samples(data)
    success_samples = [sample for sample in samples if is_success(sample)]
    contexts = [sample_context(sample, defaults) for sample in success_samples]

    by_type: dict[str, int] = {}
    by_variant: dict[str, int] = {}
    scopes: dict[str, int] = {}
    providers: dict[str, int] = {}
    for context in contexts:
        captcha_type = context["captcha_type"]
        variant_key = captcha_type
        if context["captcha_variant"]:
            variant_key = f"{captcha_type}/{context['captcha_variant']}"
        by_type[captcha_type] = by_type.get(captcha_type, 0) + 1
        by_variant[variant_key] = by_variant.get(variant_key, 0) + 1
        scopes[context["authorization_scope"]] = scopes.get(context["authorization_scope"], 0) + 1
        providers[context["provider"]] = providers.get(context["provider"], 0) + 1

    missing: list[dict[str, Any]] = []
    total_success = len(success_samples)
    if total_success < MIN_TOTAL_SUCCESS_SAMPLES:
        missing.append(
            {
                "scope": "total",
                "required": MIN_TOTAL_SUCCESS_SAMPLES,
                "actual": total_success,
                "missing": MIN_TOTAL_SUCCESS_SAMPLES - total_success,
            }
        )

    for captcha_type, count in sorted(by_type.items()):
        if count < MIN_SUCCESS_SAMPLES_PER_TYPE:
            missing.append(
                {
                    "scope": "captcha_type",
                    "captcha_type": captcha_type,
                    "required": MIN_SUCCESS_SAMPLES_PER_TYPE,
                    "actual": count,
                    "missing": MIN_SUCCESS_SAMPLES_PER_TYPE - count,
                }
            )

    if success_samples and not by_type:
        missing.append(
            {
                "scope": "captcha_type",
                "required": MIN_SUCCESS_SAMPLES_PER_TYPE,
                "actual": 0,
                "missing": MIN_SUCCESS_SAMPLES_PER_TYPE,
                "reason": "成功样本缺少 captcha_type，无法判断动态验证码覆盖。",
            }
        )

    status = "sufficient" if success_samples and not missing else "insufficient"
    dynamic_switch = len(by_type) > 1
    return {
        "success_baseline_status": status,
        "success_baseline_summary": {
            "total_samples": len(samples),
            "total_success_samples": total_success,
            "min_total_success_samples": MIN_TOTAL_SUCCESS_SAMPLES,
            "min_success_samples_per_type": MIN_SUCCESS_SAMPLES_PER_TYPE,
            "observed_captcha_types": sorted(by_type),
            "success_samples_by_type": dict(sorted(by_type.items())),
            "success_samples_by_type_variant": dict(sorted(by_variant.items())),
            "authorization_scopes": dict(sorted(scopes.items())),
            "providers": dict(sorted(providers.items())),
            "has_dynamic_type_switch": dynamic_switch,
        },
        "missing_success_samples": missing,
        "recommended_next_route": "ready-for-verification-flow" if status == "sufficient" else "collect-more-manual-success-samples",
        "collection_plan": {
            "role": "建立真实成功基线，用于对照本地方案、平台方案和失败复盘。",
            "default_target": "每个授权目标至少 5 次用户手动成功样本；出现新验证码类型时，该类型至少 2 次成功样本。",
            "required_evidence": [
                "成功前后截图或截图元信息",
                "验证码区域 HTML/DOM 摘要",
                "脚本/iframe URL",
                "关键请求摘要",
                "captcha_type/provider/captcha_variant",
                "成功 UI、callback、response token 或服务端成功状态",
                "challenge id、时间线和刷新/切题信息",
            ],
        },
        "requires_user_confirmation": [
            "成功基线不足时，必须明确提示风险；用户确认后仍可继续离线分析或受控验证。",
            "采集真实网页成功样本前，必须确认授权目标和浏览器取证模式。",
        ],
        "send_request": False,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="评估用户手动成功验证码样本基线")
    parser.add_argument("--samples", required=True, help="成功样本 JSON 文件路径，或直接传 JSON 字符串")
    parser.add_argument("--pretty", action="store_true", help="以缩进格式输出 JSON")
    parser.add_argument("--json", action="store_true", help="兼容参数；脚本始终输出 JSON")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    report = evaluate(load_json_source(args.samples))
    print(json.dumps(report, ensure_ascii=False, indent=2 if args.pretty else None))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
