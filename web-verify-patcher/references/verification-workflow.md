# 授权验证流程

本文件用于第二阶段：用户已经看到 `solution_options`，并明确选择某个方案后，再进入验证流程。默认先离线验证；真实网页操作、打码平台调用、表单提交都必须再次确认。

## 进入条件

必须同时满足：

1. 已有第一阶段输出：`captcha_type`、`provider`、`confidence`、`signals`、`solution_options`。
2. 用户明确选择方案，例如“用 ddddocr + OpenCV 做滑块偏移”。

## 标准流程

1. 复述当前识别结论：类型、厂商、置信度、关键证据。
2. 复述用户选择的方案，并列出将使用的参考文件和脚本。
3. 做执行前检查：
   - 证据是否足够：图片、HTML、截图、题面、脚本 URL、元素尺寸、DPR、接口名。
   - 依赖是否可用：Python、OpenCV、ddddocr、Tesseract、Whisper、平台 API key 等。
   - 是否需要真实浏览器：只要涉及打开页面、点击、拖动、提交、抓 Cookie/Storage，就需要再次确认。
4. 离线执行：
   - 用开源工具识别答案、偏移、角度、坐标、点列或 token 诊断结果。
   - 用 `scripts/map_coordinates.py` 换算坐标。
   - 用 `scripts/generate_motion_track.py` 生成轨迹 JSON。
   - 用 `scripts/solver_request_template.py` 生成打码平台请求模板。
5. 展示中间产物：
   - 识别结果、置信度、坐标/轨迹 JSON、缺失证据、失败原因。
   - 不要默认提交给真实页面。
6. 需要真实网页验证时：
   - 先读取 `references/browser-acquisition.md`。
   - 让用户确认 ruyiPage/Camoufox/CloakBrowser 模式。
   - 让用户确认具体动作：打开页面、截图、拖动、点击、提交或人工接管。
7. 结束时输出报告：
   - 使用方案、输入证据、产物、成功/失败、失败原因、下一步建议。

## 动作分级

| 动作 | 默认允许 | 是否需要再次确认 |
| --- | --- | --- |
| 离线分类、读取本地 HTML/截图 | 是 | 否 |
| 本地 OCR、图像匹配、坐标换算、轨迹生成 | 是 | 否 |
| 生成打码平台请求模板 | 是 | 否 |
| 发送打码平台请求 | 否 | 是，且用户提供 API key 和授权范围 |
| 打开真实网页 | 否 | 是，且按浏览器取证模式 |
| 点击、拖动、提交、注入 token | 否 | 是；未授权场景拒绝 |
| 读取 Cookie/Storage/账号材料 | 否 | 是；默认避免 |

## 方案路由

| 类型 | 首选参考 |
| --- | --- |
| `text`、`math`、`audio` | `references/open-source-recipes.md` |
| `slider`、`rotate`、`image-restore` | `references/open-source-recipes.md` + `references/motion-and-coordinate.md` |
| `click-select`、`grid`、`area-select`、`difference-click`、`font-identify`、`semantic-reasoning` | `references/open-source-recipes.md` + `references/motion-and-coordinate.md` |
| `drag-drop`、`trace-draw`、`scratch` | `references/motion-and-coordinate.md` |
| `token-widget`、`game-challenge`、`risk-score` | `references/provider-execution-notes.md` + `references/solver-platform-recipes.md` |
| `pow-challenge` | `references/provider-execution-notes.md` |
| `waf-challenge` | `references/browser-acquisition.md` + `references/provider-execution-notes.md` |
| `biometric-liveness` | 只做合规接入和人工复核建议 |

## 输出模板

```json
{
  "phase": "verification-flow",
  "captcha_type": "slider",
  "provider": "geetest",
  "chosen_solution": "open-source-slider",
  "authorization_scope": "用户确认的自有/授权测试目标",
  "preflight": {
    "evidence_ready": true,
    "dependencies_ready": false,
    "missing": ["背景图", "滑块图"]
  },
  "offline_steps": [
    "识别滑块偏移",
    "换算 DOM 坐标",
    "生成轨迹 JSON"
  ],
  "requires_live_browser": false,
  "requires_user_confirmation": [
    "如需真实页面拖动或提交，需要再次确认"
  ],
  "artifacts": []
}
```

## 失败处理

- 证据不足：要求补充最小证据，不猜测。
- 开源工具低通过率：给出失败样本原因，再建议平台或人工接管。
- 平台任务失败：检查题型、sitekey/pageurl/action、TTL、代理/IP/session、图片坐标系。
- 真实网页失败：优先诊断环境、浏览器模式、DPR、坐标映射、challenge 过期和厂商绑定。
