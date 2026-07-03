#!/usr/bin/env python3
"""生成授权验证分析用的鼠标/触摸轨迹 JSON。

脚本只生成离线轨迹，不控制浏览器、不点击页面、不提交验证码。
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from typing import Any


def configure_utf8_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


configure_utf8_stdio()


def parse_pair(value: str) -> tuple[float, float]:
    parts = [part.strip() for part in value.split(",")]
    if len(parts) != 2:
        raise argparse.ArgumentTypeError(f"需要 x,y: {value}")
    return float(parts[0]), float(parts[1])


def parse_box(value: str) -> tuple[float, float, float, float]:
    parts = [part.strip() for part in value.split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError(f"需要 left,top,right,bottom: {value}")
    left, top, right, bottom = (float(part) for part in parts)
    if right <= left or bottom <= top:
        raise argparse.ArgumentTypeError("box 的 right/bottom 必须大于 left/top")
    return left, top, right, bottom


def parse_points(value: str) -> list[tuple[float, float]]:
    points: list[tuple[float, float]] = []
    for item in value.split():
        points.append(parse_pair(item))
    if len(points) < 2:
        raise argparse.ArgumentTypeError("至少需要两个点")
    return points


def ease_out_cubic(t: float) -> float:
    return 1 - (1 - t) ** 3


def make_line_track(
    start: tuple[float, float],
    end: tuple[float, float],
    duration_ms: int,
    steps: int,
    jitter: float,
    rng: random.Random,
) -> list[dict[str, float]]:
    if steps < 2:
        raise ValueError("steps 必须至少为 2")
    result: list[dict[str, float]] = []
    sx, sy = start
    ex, ey = end
    for index in range(steps):
        progress = index / (steps - 1)
        eased = ease_out_cubic(progress)
        x = sx + (ex - sx) * eased
        y = sy + (ey - sy) * eased
        if 0 < index < steps - 1 and jitter:
            x += rng.uniform(-jitter, jitter)
            y += rng.uniform(-jitter * 0.45, jitter * 0.45)
        t = round(duration_ms * progress)
        result.append({"x": round(x, 3), "y": round(y, 3), "t": t})
    return result


def make_scratch_track(
    box: tuple[float, float, float, float],
    duration_ms: int,
    rows: int,
    rng: random.Random,
) -> list[dict[str, float]]:
    left, top, right, bottom = box
    rows = max(2, rows)
    points: list[tuple[float, float]] = []
    for row in range(rows):
        y = top + (bottom - top) * row / (rows - 1)
        y += rng.uniform(-1.5, 1.5)
        if row % 2 == 0:
            points.append((left, y))
            points.append((right, y))
        else:
            points.append((right, y))
            points.append((left, y))
    return resample_polyline(points, duration_ms, max(2, rows * 8), jitter=0.8, rng=rng)


def polyline_length(points: list[tuple[float, float]]) -> float:
    total = 0.0
    for first, second in zip(points, points[1:]):
        total += math.dist(first, second)
    return total


def resample_polyline(
    points: list[tuple[float, float]],
    duration_ms: int,
    steps: int,
    jitter: float,
    rng: random.Random,
) -> list[dict[str, float]]:
    total_length = polyline_length(points)
    if total_length <= 0:
        raise ValueError("路径长度必须大于 0")
    result: list[dict[str, float]] = []
    segment_index = 0
    segment_start_distance = 0.0
    segment_length = math.dist(points[0], points[1])
    for index in range(steps):
        target_distance = total_length * index / (steps - 1)
        while segment_index < len(points) - 2 and segment_start_distance + segment_length < target_distance:
            segment_start_distance += segment_length
            segment_index += 1
            segment_length = math.dist(points[segment_index], points[segment_index + 1])
        local = 0.0 if segment_length == 0 else (target_distance - segment_start_distance) / segment_length
        x1, y1 = points[segment_index]
        x2, y2 = points[segment_index + 1]
        x = x1 + (x2 - x1) * local
        y = y1 + (y2 - y1) * local
        if 0 < index < steps - 1 and jitter:
            x += rng.uniform(-jitter, jitter)
            y += rng.uniform(-jitter, jitter)
        result.append({"x": round(x, 3), "y": round(y, 3), "t": round(duration_ms * index / (steps - 1))})
    return result


def build_track(args: argparse.Namespace) -> dict[str, Any]:
    rng = random.Random(args.seed)
    if args.mode == "slider":
        start = args.start or (0.0, 0.0)
        end = (start[0] + args.distance, start[1] + args.vertical)
        points = make_line_track(start, end, args.duration_ms, args.steps, args.jitter, rng)
    elif args.mode == "drag-drop":
        if args.start is None or args.end is None:
            raise ValueError("drag-drop 需要 --start 和 --end")
        points = make_line_track(args.start, args.end, args.duration_ms, args.steps, args.jitter, rng)
    elif args.mode == "scratch":
        if args.box is None:
            raise ValueError("scratch 需要 --box")
        points = make_scratch_track(args.box, args.duration_ms, args.rows, rng)
    elif args.mode == "trace":
        if args.points is None:
            raise ValueError("trace 需要 --points")
        points = resample_polyline(args.points, args.duration_ms, args.steps, args.jitter, rng)
    else:
        raise ValueError(f"未知 mode: {args.mode}")
    return {
        "mode": args.mode,
        "coordinate_space": "element-css",
        "duration_ms": args.duration_ms,
        "points": points,
        "notes": [
            "轨迹仅用于授权验证分析。",
            "真实页面执行前必须再次确认授权范围和浏览器取证模式。",
        ],
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="生成验证码验证分析用轨迹 JSON")
    parser.add_argument("--mode", choices=["slider", "drag-drop", "scratch", "trace"], required=True)
    parser.add_argument("--distance", type=float, default=0.0, help="slider 水平距离")
    parser.add_argument("--vertical", type=float, default=0.0, help="slider 垂直偏移")
    parser.add_argument("--start", type=parse_pair, help="起点 x,y")
    parser.add_argument("--end", type=parse_pair, help="终点 x,y")
    parser.add_argument("--box", type=parse_box, help="scratch 区域 left,top,right,bottom")
    parser.add_argument("--points", type=parse_points, help='trace 点列，如 "10,10 80,30 120,90"')
    parser.add_argument("--duration-ms", type=int, default=1200)
    parser.add_argument("--steps", type=int, default=24)
    parser.add_argument("--rows", type=int, default=6)
    parser.add_argument("--jitter", type=float, default=1.2)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--pretty", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    result = build_track(args)
    print(json.dumps(result, ensure_ascii=False, indent=2 if args.pretty else None))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
