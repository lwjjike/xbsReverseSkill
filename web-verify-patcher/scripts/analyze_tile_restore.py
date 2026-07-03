#!/usr/bin/env python3
"""离线分析切片乱序图片验证码并尝试还原。

脚本只读取本地证据，不打开网页、不控制浏览器、不提交验证码、
不发送网络请求。
"""

from __future__ import annotations

import argparse
import itertools
import json
import math
import re
import sys
from pathlib import Path
from typing import Any

try:
    from PIL import Image, ImageStat
except ImportError:  # pragma: no cover - depends on local environment
    Image = None  # type: ignore[assignment]
    ImageStat = None  # type: ignore[assignment]


def configure_utf8_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


configure_utf8_stdio()


def read_value(value: str | None) -> str:
    if not value:
        return ""
    path = Path(value)
    if path.exists() and path.is_file():
        for encoding in ("utf-8", "utf-8-sig", "gb18030"):
            try:
                return path.read_text(encoding=encoding)
            except UnicodeDecodeError:
                continue
        return path.read_text(errors="replace")
    return value


def parse_order(value: str | None) -> list[int] | None:
    if not value:
        return None
    numbers = [int(item) for item in re.findall(r"-?\d+", value)]
    return numbers or None


def compact(text: str, limit: int = 100) -> str:
    cleaned = re.sub(r"\s+", " ", text.strip())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1] + "…"


def collect_text_signals(text: str) -> list[dict[str, str]]:
    patterns = [
        ("切片乱序中文文案", r"切片乱序|分块乱序|图片分割|瓦片重排|分割顺序打乱|乱序图片还原|图片被切成多块|顺序打乱"),
        ("切片乱序英文文案", r"\b(?:scrambled tiles|tile scramble|scrambled image tiles|image tile restore|reorder tiles)\b"),
        ("tileOrder/pieceOrder 字段", r"\b(?:tileOrder|pieceOrder|tile_order|piece_order|restoreOrder|sliceOrder)\b"),
        ("CSS 背景切片线索", r"background-position|background-size|sprite"),
        ("Canvas 绘制切片线索", r"\bdrawImage\s*\("),
        ("布局位置线索", r"\b(?:transform|translate3d|translate|left|top)\b.{0,80}\b(?:px|tile|piece|slice)\b"),
        ("shuffle/scramble 线索", r"\b(?:shuffle|scramble|unscramble|slice|tile|piece)\b.{0,80}\b(?:captcha|verify|challenge|image)\b"),
    ]
    signals: list[dict[str, str]] = []
    for label, pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
        if match:
            signals.append({"label": label, "evidence": compact(match.group(0)), "source": "text"})
    return signals


def extract_order_arrays(text: str) -> tuple[list[int] | None, list[dict[str, str]]]:
    signals: list[dict[str, str]] = []
    for pattern in (
        r"\b(?:tileOrder|pieceOrder|tile_order|piece_order|restoreOrder|sliceOrder)\b\s*[:=]\s*\[([^\]]+)\]",
        r"[\"'](?:tileOrder|pieceOrder|tile_order|piece_order|restoreOrder|sliceOrder)[\"']\s*:\s*\[([^\]]+)\]",
    ):
        match = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
        if not match:
            continue
        order = [int(item) for item in re.findall(r"-?\d+", match.group(1))]
        if order:
            signals.append({"label": "抽取显式切片顺序数组", "evidence": compact(match.group(0)), "source": "html"})
            return order, signals
    return None, signals


def extract_background_position_order(
    text: str,
    rows: int | None,
    cols: int | None,
    tile_width: int | None,
    tile_height: int | None,
) -> tuple[list[int] | None, list[dict[str, str]]]:
    if not rows or not cols or not tile_width or not tile_height:
        return None, []
    pattern = r"background-position\s*:\s*(-?\d+(?:\.\d+)?)px\s+(-?\d+(?:\.\d+)?)px"
    order: list[int] = []
    signals: list[dict[str, str]] = []
    for match in re.finditer(pattern, text, flags=re.IGNORECASE):
        x = abs(float(match.group(1)))
        y = abs(float(match.group(2)))
        col = int(round(x / tile_width))
        row = int(round(y / tile_height))
        if 0 <= row < rows and 0 <= col < cols:
            order.append(row * cols + col)
            signals.append({"label": "抽取 background-position 切片来源", "evidence": compact(match.group(0)), "source": "html"})
    expected = rows * cols
    if len(order) == expected:
        return order, signals
    return None, signals


def extract_draw_image_order(
    text: str,
    rows: int | None,
    cols: int | None,
    tile_width: int | None,
    tile_height: int | None,
) -> tuple[list[int] | None, list[dict[str, str]]]:
    if not rows or not cols or not tile_width or not tile_height:
        return None, []
    pattern = r"drawImage\s*\([^,]+,\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)"
    found: dict[int, int] = {}
    signals: list[dict[str, str]] = []
    for match in re.finditer(pattern, text, flags=re.IGNORECASE):
        sx = float(match.group(1))
        sy = float(match.group(2))
        dx = float(match.group(5))
        dy = float(match.group(6))
        src_col = int(round(sx / tile_width))
        src_row = int(round(sy / tile_height))
        dst_col = int(round(dx / tile_width))
        dst_row = int(round(dy / tile_height))
        if 0 <= src_row < rows and 0 <= src_col < cols and 0 <= dst_row < rows and 0 <= dst_col < cols:
            found[dst_row * cols + dst_col] = src_row * cols + src_col
            signals.append({"label": "抽取 drawImage 源/目标切片", "evidence": compact(match.group(0)), "source": "html"})
    expected = rows * cols
    if len(found) == expected:
        return [found[index] for index in range(expected)], signals
    return None, signals


def normalize_order(order: list[int], total: int) -> tuple[list[int] | None, str | None]:
    if len(order) != total:
        return None, f"顺序数组长度为 {len(order)}，但网格需要 {total} 个切片"
    if sorted(order) == list(range(total)):
        return order, None
    if sorted(item - 1 for item in order) == list(range(total)):
        return [item - 1 for item in order], None
    return None, "顺序数组不是 0 基或 1 基的完整排列"


def infer_grid(
    image: Any,
    rows: int | None,
    cols: int | None,
    tile_width: int | None,
    tile_height: int | None,
) -> tuple[int | None, int | None, int | None, int | None, list[str]]:
    warnings: list[str] = []
    width, height = image.size
    if tile_width and not cols:
        cols = width // tile_width
    if tile_height and not rows:
        rows = height // tile_height
    if rows and not tile_height:
        tile_height = height // rows
    if cols and not tile_width:
        tile_width = width // cols
    if not rows or not cols or not tile_width or not tile_height:
        warnings.append("需要提供 rows/cols 或 tile-width/tile-height 才能切片分析图片")
        return rows, cols, tile_width, tile_height, warnings
    if rows * tile_height > height or cols * tile_width > width:
        warnings.append("网格尺寸超过图片尺寸")
    return rows, cols, tile_width, tile_height, warnings


def split_tiles(image: Any, rows: int, cols: int, tile_width: int, tile_height: int) -> list[Any]:
    tiles = []
    for row in range(rows):
        for col in range(cols):
            left = col * tile_width
            top = row * tile_height
            tiles.append(image.crop((left, top, left + tile_width, top + tile_height)).convert("RGB"))
    return tiles


def edge_cost(a: Any, b: Any, direction: str) -> float:
    if direction == "right":
        edge_a = a.crop((a.width - 1, 0, a.width, a.height))
        edge_b = b.crop((0, 0, 1, b.height))
    else:
        edge_a = a.crop((0, a.height - 1, a.width, a.height))
        edge_b = b.crop((0, 0, b.width, 1))
    diff = ImageStat.Stat(Image.eval(ImageChopsCompat.difference(edge_a, edge_b), lambda px: px)).mean
    return float(sum(diff) / len(diff))


class ImageChopsCompat:
    @staticmethod
    def difference(left: Any, right: Any) -> Any:
        from PIL import ImageChops

        return ImageChops.difference(left, right)


def arrangement_cost(order: tuple[int, ...], tiles: list[Any], rows: int, cols: int) -> float:
    total = 0.0
    count = 0
    for row in range(rows):
        for col in range(cols):
            current = tiles[order[row * cols + col]]
            if col + 1 < cols:
                total += edge_cost(current, tiles[order[row * cols + col + 1]], "right")
                count += 1
            if row + 1 < rows:
                total += edge_cost(current, tiles[order[(row + 1) * cols + col]], "down")
                count += 1
    return total / max(count, 1)


def tile_diversity(tiles: list[Any]) -> float:
    means: list[float] = []
    for tile in tiles:
        stat = ImageStat.Stat(tile)
        means.extend(float(value) for value in stat.mean)
    if not means:
        return 0.0
    avg = sum(means) / len(means)
    variance = sum((value - avg) ** 2 for value in means) / len(means)
    return math.sqrt(variance)


def image_edge_match_order(tiles: list[Any], rows: int, cols: int) -> tuple[list[int] | None, float, float, list[str]]:
    total = rows * cols
    warnings: list[str] = []
    if total != len(tiles):
        return None, 0.0, 0.0, ["切片数量和网格不一致"]
    if total > 9:
        warnings.append("切片超过 9 个，第一版不做全排列搜索；请优先使用页面顺序或显式 order")
        return list(range(total)), 0.25, 0.0, warnings

    best_order: tuple[int, ...] | None = None
    best_cost = float("inf")
    second_cost = float("inf")
    for order in itertools.permutations(range(total)):
        cost = arrangement_cost(order, tiles, rows, cols)
        if cost < best_cost:
            second_cost = best_cost
            best_cost = cost
            best_order = order
        elif cost < second_cost:
            second_cost = cost

    diversity = tile_diversity(tiles)
    separation = 0.0 if not math.isfinite(second_cost) else max(0.0, (second_cost - best_cost) / (second_cost + 1e-6))
    confidence = max(0.25, min(0.95, separation * 4.0 + min(diversity / 128.0, 0.35)))
    if separation < 0.02:
        confidence = min(confidence, 0.42)
        warnings.append("候选排列分数接近，可能是重复纹理、纯色块或边缘线索不足")
    if diversity < 6:
        confidence = min(confidence, 0.35)
        warnings.append("切片视觉差异很低，建议改用页面顺序或人工/平台复核")
    return list(best_order or range(total)), round(confidence, 2), round(best_cost, 4), warnings


def restore_image(
    image: Any,
    rows: int,
    cols: int,
    tile_width: int,
    tile_height: int,
    order_source_by_target: list[int],
    output_path: Path,
) -> None:
    tiles = split_tiles(image, rows, cols, tile_width, tile_height)
    restored = Image.new("RGB", (cols * tile_width, rows * tile_height))
    for target_index, source_index in enumerate(order_source_by_target):
        row, col = divmod(target_index, cols)
        restored.paste(tiles[source_index], (col * tile_width, row * tile_height))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    restored.save(output_path)


def build_report(args: argparse.Namespace) -> dict[str, Any]:
    html_text = read_value(args.html)
    plain_text = read_value(args.text)
    combined_text = "\n".join(part for part in (html_text, plain_text) if part)
    signals = collect_text_signals(combined_text)
    warnings: list[str] = []

    rows = args.rows
    cols = args.cols
    tile_width = args.tile_width
    tile_height = args.tile_height
    explicit_order = parse_order(args.order_source_by_target)
    extracted_order: list[int] | None = None

    for extractor in (
        extract_order_arrays,
        lambda text: extract_background_position_order(text, rows, cols, tile_width, tile_height),
        lambda text: extract_draw_image_order(text, rows, cols, tile_width, tile_height),
    ):
        order, found_signals = extractor(combined_text)
        signals.extend(found_signals)
        if order:
            extracted_order = order
            break

    image = None
    if args.image:
        if Image is None:
            warnings.append("当前 Python 环境缺少 Pillow，无法读取图片；只能分析文本/HTML 线索")
        else:
            image_path = Path(args.image)
            if image_path.exists() and image_path.is_file():
                image = Image.open(image_path).convert("RGB")
                rows, cols, tile_width, tile_height, grid_warnings = infer_grid(image, rows, cols, tile_width, tile_height)
                warnings.extend(grid_warnings)
            else:
                warnings.append("图片文件不存在")

    total = rows * cols if rows and cols else 0
    normalized_order: list[int] | None = None
    order_warning: str | None = None
    order_source = ""
    if explicit_order and total:
        normalized_order, order_warning = normalize_order(explicit_order, total)
        order_source = "argument"
    elif extracted_order and total:
        normalized_order, order_warning = normalize_order(extracted_order, total)
        order_source = "page"
    if order_warning:
        warnings.append(order_warning)

    confidence = 0.0
    edge_cost_value: float | None = None
    restore_strategy = "manual-or-platform"
    if normalized_order:
        confidence = 0.92 if order_source == "argument" else 0.86
        restore_strategy = "page-order"
    elif image is not None and rows and cols and tile_width and tile_height:
        tiles = split_tiles(image, rows, cols, tile_width, tile_height)
        normalized_order, confidence, edge_cost_value, edge_warnings = image_edge_match_order(tiles, rows, cols)
        warnings.extend(edge_warnings)
        restore_strategy = "image-edge-match" if confidence >= 0.55 else "manual-or-platform"
    elif signals:
        confidence = 0.58

    restored_image: str | None = None
    if image is not None and rows and cols and tile_width and tile_height and normalized_order and args.output_image:
        if len(normalized_order) == rows * cols:
            output_path = Path(args.output_image)
            restore_image(image, rows, cols, tile_width, tile_height, normalized_order, output_path)
            restored_image = str(output_path)
        else:
            warnings.append("顺序长度不匹配，未输出还原图片")

    is_tile_scramble = bool(signals or normalized_order or (image is not None and rows and cols))
    if not signals and normalized_order:
        signals.append({"label": "提供显式切片顺序", "evidence": ",".join(str(item) for item in normalized_order), "source": "argument"})
    if image is not None and rows and cols:
        signals.append({"label": "图片网格切片证据", "evidence": f"{rows}x{cols}", "source": "image"})

    return {
        "is_tile_scramble": is_tile_scramble,
        "grid": {
            "rows": rows,
            "cols": cols,
            "tile_width": tile_width,
            "tile_height": tile_height,
            "total": total,
        },
        "order_source_by_target": normalized_order,
        "confidence": round(confidence, 2),
        "restore_strategy": restore_strategy,
        "edge_match_cost": edge_cost_value,
        "signals": signals,
        "warnings": warnings,
        "restored_image": restored_image,
        "notes": [
            "脚本只做离线切片判断和图片还原，不打开网页、不点击页面、不提交验证。",
            "优先相信页面逻辑中的顺序字段；纯图片边缘匹配低置信度时应切换人工或平台复核。",
        ],
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="离线分析切片乱序图片验证码")
    parser.add_argument("--image", help="待分析的乱序图片路径")
    parser.add_argument("--html", help="HTML/CSS/JS 片段或文件路径")
    parser.add_argument("--text", help="页面文案或分析备注")
    parser.add_argument("--rows", type=int, help="切片行数")
    parser.add_argument("--cols", type=int, help="切片列数")
    parser.add_argument("--tile-width", type=int, help="单块宽度")
    parser.add_argument("--tile-height", type=int, help="单块高度")
    parser.add_argument("--order-source-by-target", help="还原顺序：每个目标位置使用哪个当前切片索引，支持逗号分隔")
    parser.add_argument("--output-image", help="输出还原图片路径")
    parser.add_argument("--pretty", action="store_true", help="以缩进格式输出 JSON")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    report = build_report(args)
    print(json.dumps(report, ensure_ascii=False, indent=2 if args.pretty else None))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
