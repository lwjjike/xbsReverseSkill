#!/usr/bin/env python3
"""验证码截图坐标换算工具。

只做离线坐标换算，不打开浏览器、不点击页面、不提交验证。
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


def parse_pair(value: str, sep: str = ",") -> tuple[float, float]:
    parts = [part.strip() for part in value.lower().split(sep)]
    if len(parts) != 2:
        raise argparse.ArgumentTypeError(f"需要两个数值: {value}")
    return float(parts[0]), float(parts[1])


def parse_size(value: str) -> tuple[float, float]:
    if "x" in value.lower():
        return parse_pair(value, sep="x")
    return parse_pair(value)


def map_point(
    image_size: tuple[float, float],
    display_size: tuple[float, float],
    point: tuple[float, float],
    element_left: float,
    element_top: float,
    scroll_x: float,
    scroll_y: float,
    device_pixel_ratio: float,
    point_space: str,
) -> dict[str, Any]:
    image_width, image_height = image_size
    display_width, display_height = display_size
    if min(image_width, image_height, display_width, display_height) <= 0:
        raise ValueError("图片尺寸和显示尺寸必须大于 0")
    if device_pixel_ratio <= 0:
        raise ValueError("device_pixel_ratio 必须大于 0")

    x, y = point
    if point_space == "image":
        element_x = x * display_width / image_width
        element_y = y * display_height / image_height
    elif point_space == "viewport-device":
        element_x = x / device_pixel_ratio - element_left
        element_y = y / device_pixel_ratio - element_top
    elif point_space == "element-css":
        element_x = x
        element_y = y
    else:
        raise ValueError(f"未知 point_space: {point_space}")

    viewport_x = element_left + element_x
    viewport_y = element_top + element_y
    page_x = viewport_x + scroll_x
    page_y = viewport_y + scroll_y

    return {
        "input": {
            "point": [x, y],
            "point_space": point_space,
            "image_size": [image_width, image_height],
            "display_size": [display_width, display_height],
            "element_left": element_left,
            "element_top": element_top,
            "scroll_x": scroll_x,
            "scroll_y": scroll_y,
            "device_pixel_ratio": device_pixel_ratio,
        },
        "element_css": {"x": round(element_x, 3), "y": round(element_y, 3)},
        "viewport_css": {"x": round(viewport_x, 3), "y": round(viewport_y, 3)},
        "page_css": {"x": round(page_x, 3), "y": round(page_y, 3)},
        "notes": [
            "结果仅用于授权验证分析。",
            "真实页面点击前需要再次确认浏览器模式和授权范围。",
        ],
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="验证码截图坐标换算工具")
    parser.add_argument("--image-size", required=True, type=parse_size, help="原图尺寸，如 300x150")
    parser.add_argument("--display-size", required=True, type=parse_size, help="页面显示尺寸，如 300x150")
    parser.add_argument("--point", required=True, type=parse_pair, help="输入点，如 120,75")
    parser.add_argument(
        "--point-space",
        choices=["image", "element-css", "viewport-device"],
        default="image",
        help="输入点所属坐标系",
    )
    parser.add_argument("--element-left", type=float, default=0.0, help="元素视口 left")
    parser.add_argument("--element-top", type=float, default=0.0, help="元素视口 top")
    parser.add_argument("--scroll-x", type=float, default=0.0, help="页面横向滚动")
    parser.add_argument("--scroll-y", type=float, default=0.0, help="页面纵向滚动")
    parser.add_argument("--device-pixel-ratio", type=float, default=1.0, help="DPR")
    parser.add_argument("--pretty", action="store_true", help="缩进输出 JSON")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    result = map_point(
        image_size=args.image_size,
        display_size=args.display_size,
        point=args.point,
        element_left=args.element_left,
        element_top=args.element_top,
        scroll_x=args.scroll_x,
        scroll_y=args.scroll_y,
        device_pixel_ratio=args.device_pixel_ratio,
        point_space=args.point_space,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2 if args.pretty else None))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
