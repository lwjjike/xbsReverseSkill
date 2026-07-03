# 坐标、轨迹与本地模拟

本文件用于生成离线坐标和轨迹。默认只输出 JSON，不直接控制真实网页。真实页面点击、拖动、提交前必须让用户再次确认。

## 坐标体系

常见坐标有三种：

- 图片像素：截图或验证码图片中的像素坐标。
- 元素 CSS 像素：浏览器中验证码元素内的相对坐标。
- 页面坐标：考虑元素位置、滚动偏移后的页面坐标。

换算时记录：

- 原图尺寸：`image_width`、`image_height`。
- 显示尺寸：`display_width`、`display_height`。
- DPR：`device_pixel_ratio`。
- 元素位置：`element_left`、`element_top`。
- 滚动：`scroll_x`、`scroll_y`。

使用脚本：

```bash
python scripts/map_coordinates.py --image-size 300x150 --display-size 300x150 --point 120,75 --element-left 20 --element-top 80 --pretty
```

## 滑块轨迹

轨迹应包含：

- 起点、终点。
- 每个点的 `x`、`y`、`t`。
- 轻微纵向抖动和停顿。
- 总时长。

使用脚本：

```bash
python scripts/generate_motion_track.py --mode slider --distance 128 --duration-ms 1100 --pretty
```

输出只用于授权 QA 分析。厂商可能检查行为采集、浏览器状态和加密参数，不要假设轨迹自然就能通过。

## 拖放轨迹

拖放需要源点和目标点：

```bash
python scripts/generate_motion_track.py --mode drag-drop --start 40,60 --end 220,130 --duration-ms 1400 --pretty
```

注意目标区域可能有吸附、动画、释放点容错和拖拽事件差异。

## 刮刮卡轨迹

刮刮卡是覆盖区域，不是单一终点：

```bash
python scripts/generate_motion_track.py --mode scratch --box 10,10,220,90 --duration-ms 1800 --pretty
```

输出点列用于覆盖比例分析。移动端触摸事件和 canvas 状态变化需要真实环境复核。

## 轨迹绘制/连线

如果已有目标路径点：

```bash
python scripts/generate_motion_track.py --mode trace --points "10,10 80,30 120,90" --duration-ms 1000 --pretty
```

如果只有图片，需要先用 OpenCV 提取路径，再重采样。

## 点选坐标

点选/九宫格/区域选择优先输出元素相对坐标和截图坐标。多点题必须保留顺序。

输出格式建议：

```json
{
  "coordinate_space": "element-css",
  "points": [
    {"x": 120.0, "y": 75.0, "order": 1, "label": "天"}
  ],
  "source_image_size": [300, 150],
  "display_size": [300, 150]
}
```

## 真实网页执行前检查

执行前必须确认：

- 目标是否自有/授权。
- 浏览器模式是否按 `browser-acquisition.md`。
- 是否需要人工完成登录或验证码。
- 是否读取 Cookie/Storage。
- 是否提交业务表单。

任何一项不明确，都停留在离线产物。
