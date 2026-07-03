#!/usr/bin/env python3
"""生成打码平台请求模板。
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any


def configure_utf8_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


configure_utf8_stdio()


def template_for(platform: str, captcha_type: str, provider: str) -> dict[str, Any]:
    base: dict[str, Any] = {
        "platform": platform,
        "captcha_type": captcha_type,
        "provider": provider,
        "send_request": False,
        "api_key": "<由用户运行时提供，不要写入文件>",
        "authorization_required": True,
        "notes": [
            "这是请求模板，不会发送网络请求。",
            "只用于自有系统或明确授权 QA。",
            "不要把 token 注入未授权流程。",
        ],
    }

    token_providers = {
        "recaptcha",
        "hcaptcha",
        "cloudflare-turnstile",
        "arkose-funcaptcha",
        "mtcaptcha",
        "yandex-smartcaptcha",
        "captchafox",
        "prosopo-procaptcha",
        "trustcaptcha",
    }

    if captcha_type in {"text", "math"}:
        base["payload"] = {
            "method": "image",
            "image": "<captcha image base64 or file>",
            "constraints": {"charset": "<optional>", "length": "<optional>", "case_sensitive": False},
        }
    elif captcha_type in {
        "click-select",
        "grid",
        "area-select",
        "difference-click",
        "font-identify",
        "semantic-reasoning",
    }:
        base["payload"] = {
            "method": "coordinates",
            "image": "<challenge screenshot base64 or file>",
            "prompt": "<题面文本>",
            "coordinate_space": "image",
            "expected_output": "ordered_points_or_grid_indexes",
        }
    elif captcha_type in {"slider", "rotate", "image-restore"}:
        base["payload"] = {
            "method": "image_or_slider",
            "background": "<background image>",
            "piece": "<optional slider piece>",
            "screenshot": "<optional single challenge image>",
            "expected_output": "offset_or_angle",
        }
    elif captcha_type == "audio":
        base["payload"] = {
            "method": "audio",
            "audio": "<audio file or base64>",
            "language": "<optional>",
            "answer_format": "<digits/letters/text>",
        }
    elif captcha_type == "game-challenge" or provider == "arkose-funcaptcha":
        base["payload"] = {
            "method": "funcaptcha",
            "websiteURL": "<page url>",
            "websitePublicKey": "<arkose public key>",
            "funcaptchaApiJSSubdomain": "<optional surl>",
            "data": {"blob": "<optional blob>"},
        }
    elif captcha_type in {"token-widget", "risk-score", "one-click"} or provider in token_providers:
        base["payload"] = {
            "method": "token",
            "websiteURL": "<page url>",
            "websiteKey": "<sitekey>",
            "action": "<optional action>",
            "enterprise": "<optional bool>",
            "extra": {"cdata": "<optional>", "rqdata": "<optional>"},
        }
    elif captcha_type == "pow-challenge":
        base["payload"] = {
            "method": "pow",
            "challenge": "<challenge/payload>",
            "difficulty": "<optional>",
            "nonce": "<optional>",
            "note": "优先按官方协议在自有系统中校验，通常不需要打码平台。",
        }
    elif captcha_type == "waf-challenge":
        base["payload"] = {
            "method": "waf_diagnostic",
            "pageURL": "<page url>",
            "headers": "<response headers>",
            "challengeHTML": "<challenge html>",
            "note": "优先做 WAF/浏览器环境诊断；平台仅作授权对照。",
        }
    else:
        base["payload"] = {
            "method": "custom",
            "evidence": "<html/scripts/screenshot/prompt>",
            "expected_output": "<answer/coordinates/offset/token/diagnosis>",
        }

    return base


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="生成打码平台请求模板")
    parser.add_argument("--platform", required=True, help="平台名，如 2captcha/capsolver/jfbym")
    parser.add_argument("--captcha-type", required=True)
    parser.add_argument("--provider", default="custom-or-unknown")
    parser.add_argument("--pretty", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    result = template_for(args.platform, args.captcha_type, args.provider)
    print(json.dumps(result, ensure_ascii=False, indent=2 if args.pretty else None))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
