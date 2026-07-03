---
name: web-verify-patcher
description: "网页验证码识别、方案选择与授权验证流程分析技能。当用户询问验证码识别、验证码类型、这是什么验证码、验证码方案、风控验证、WAF challenge、captcha recognition/type，或提到滑块/拼图、点选/文字点选/九宫格、旋转、文字/数字/算术、语音、拖放、轨迹绘制、刮刮卡、图片/图像复原、切片乱序、分块乱序、图片分割、瓦片重排、分割顺序打乱、区域/面积选择、差异点击/找茬、字体识别、空间语义、小游戏、PoW/工作量证明、无感/无痕/风险评分、一键/checkbox、多轮、问答、活体/人脸，或提到极验、易盾、腾讯、阿里云、数美、顶象、百度、京东云、云片、reCAPTCHA、hCaptcha、Turnstile、AWS WAF、DataDome、Arkose/FunCaptcha、Akamai、Imperva、PerimeterX/HUMAN、Kasada、ALTCHA/FriendlyCaptcha 等国内外验证码/风控厂商时使用。用于识别网页验证码/验证产品、输出方案，并在用户确认后编排离线求解、切片乱序图片还原、坐标/轨迹生成、打码平台请求模板和授权验证测试；打开真实网页时按 ruyiPage/Camoufox/CloakBrowser 取证模式。"
---

# Web Verify Patcher（网页验证码识别与验证方案分析）

使用这个技能分析网页验证码或网页验证材料，输出安全、可落地的“识别 + 厂商判断 + 验证分析方案 + 授权验证流程”。第一阶段做类型/厂商识别和方案选择；第二阶段只在用户明确选择方案并确认授权后，编排离线求解、坐标/轨迹生成、平台请求模板或授权验证测试。

## 工作流程

1. 优先基于用户已提供的离线证据分析：HTML 片段、脚本 URL、iframe URL、页面可见提示文案、截图元信息、厂商参数名、网络接口名。
2. 如果必须打开真实网页取证，先读取 `references/browser-acquisition.md`，并按其中的取证模式执行。启动任何浏览器前先让用户确认模式：ruyiPage + RuyiTrace、仅 ruyiPage、Camoufox + camoufox-reverse-mcp、仅 Camoufox、CloakBrowser、用户手动取证或 AI 自行决定。用户未确认前，不要打开页面、截图、抓包、注入 Hook、读取 Cookie/Storage 或启动任何浏览器工具。
3. 打开网页时不要直接使用普通 Playwright、Puppeteer、系统浏览器或 CDP 路线；已选模式不可用时，暂停并让用户确认安装、提供路径、降级或切换，不要静默 fallback。验证码、登录、MFA 或设备验证出现时暂停，让用户手动完成或改为离线分析。
4. 用现有证据运行离线分类脚本：
   - `python scripts/classify_verify.py --html page.html --url "https://example.test/login" --text "拖动滑块完成拼图" --pretty`
   - `--html`、`--text`、`--screenshot-meta` 既可以传文件路径，也可以直接传字符串。
5. 得到初步分类后，再按需读取参考文件：
   - 需要判断厂商/产品特征时读 `references/provider-products.md`。
   - 需要判断验证码形态和证据要求时读 `references/captcha-types.md`。
   - 需要按类型给方案时读 `references/solution-playbooks.md`。
   - 需要打开真实网页、截图、抓包或采集页面证据时读 `references/browser-acquisition.md`。
   - 如果 `image-restore` 命中 `captcha_variant: tile-scramble`，先用 `scripts/analyze_tile_restore.py` 判断是否是切片/分块乱序图，再分析 `tileOrder`、`pieceOrder`、`background-position`、`drawImage` 或纯图片边缘连续性。
6. 用户从 `solution_options` 中选择方案并明确确认后，进入第二阶段：
   - 总流程必须读 `references/verification-workflow.md`。
   - 使用开源/本地方案时读 `references/open-source-recipes.md`。
   - 使用打码平台时读 `references/solver-platform-recipes.md`。
   - 需要坐标换算、滑块/拖放/刮刮卡/轨迹绘制时读 `references/motion-and-coordinate.md`，优先用 `scripts/map_coordinates.py` 和 `scripts/generate_motion_track.py` 生成离线结果。
   - 需要厂商执行注意点时读 `references/provider-execution-notes.md`。
   - 真实页面点击、拖动、提交或抓取 Cookie/Storage 前必须再次让用户确认授权目标、执行模式和浏览器取证模式。
7. 输出报告时必须包含：
   - `captcha_type`
   - `provider`
   - 置信度和命中的信号
   - 为什么判断为该类型/厂商
   - 推荐方案：先给开源/本地方案，再给低通过率时的打码平台或人工/厂商备选，最后说明切换条件
   - 关键风险和缺失证据
   - 第二阶段执行时还必须包含：用户选择的方案、执行前检查结果、是否需要真实网页操作、需要用户确认的动作、产物路径或 JSON 结果

## 分类标签

使用这些固定类型标签，便于脚本和报告保持一致：

- `text`：文字、数字、字母数字混合或简单图片验证码。
- `math`：算术验证码，需要先 OCR 再解析表达式。
- `slider`：滑块/拼图验证码，需要识别缺口或目标偏移。
- `click-select`：点选文字、图标、物体或按顺序点击目标。
- `rotate`：旋转图片或物体，使其转正或对齐。
- `grid`：九宫格或多宫格图片分类验证码。
- `audio`：语音/音频验证码，需要识别播放内容。
- `drag-drop`：拖放物体到目标区域，不等同于单纯滑块。
- `trace-draw`：轨迹绘制、连线或画线验证。
- `scratch`：刮刮卡式验证，需要刮开或覆盖指定比例。
- `image-restore`：图片/图像复原、乱序拼图、滑动还原；切片/分块顺序打乱时保留主类型，并补充 `captcha_variant: tile-scramble`。
- `area-select`：框选、圈选或选择图片区域。
- `difference-click`：找不同、找茬或点击差异点。
- `font-identify`：选择相同/不同字体或字体样式识别。
- `semantic-reasoning`：空间语义、视觉关系或逻辑图片题。
- `game-challenge`：小游戏、3D、骰子或 Arkose/FunCaptcha 类交互题。
- `pow-challenge`：工作量证明/浏览器计算挑战，如 FriendlyCaptcha、ALTCHA、Cap.js、mCaptcha。
- `risk-score`：无感、无痕、隐形或风险评分验证，如 reCAPTCHA v3 类。
- `one-click`：一键、checkbox、按住或点击完成验证。
- `multi-step`：多轮、多步或分页挑战；优先同时记录具体子类型。
- `qa-logic`：问答、逻辑题或安全问题式验证码。
- `biometric-liveness`：活体、人脸或生物识别验证；只做边界清晰的识别和合规建议。
- `token-widget`：基于 `sitekey`、`pageurl`、`action` 的组件，如 reCAPTCHA、hCaptcha、Turnstile，当前未展示具体图片题。
- `waf-challenge`：反自动化/WAF 验证，常见输出是 clearance cookie、WAF token、PoW 结果或环境检查结果。
- `unknown-custom`：自研、未知或证据不足。

使用这些固定厂商标签：

- `recaptcha`、`hcaptcha`、`cloudflare-turnstile`、`cloudflare-waf`、`geetest`、`tencent-tcaptcha`、`netease-yidun`、`aliyun-captcha`、`shumei-captcha`、`dingxiang-captcha`、`baidu-captcha`、`jdcloud-captcha`、`yunpian-captcha`、`huawei-captcha`、`tongdun-risk`、`aws-waf`、`datadome`、`arkose-funcaptcha`、`mtcaptcha`、`keycaptcha`、`friendlycaptcha`、`altcha`、`yandex-smartcaptcha`、`captchafox`、`prosopo-procaptcha`、`trustcaptcha`、`private-captcha`、`capjs`、`mcaptcha`、`iconcaptcha`、`botdetect`、`securimage`、`visualcaptcha`、`amazon-captcha`、`cybersiara`、`aj-captcha`、`tianai-captcha`、`easycaptcha`、`happycaptcha`、`kaptcha`、`akamai-bot-manager`、`imperva-incapsula`、`perimeterx-human`、`kasada`、`netacea`、`radware-bot-manager`、`f5-bot-defense`、`custom-or-unknown`。

## 输出格式

面向用户输出时建议使用这个结构：

```json
{
  "captcha_type": "slider",
  "captcha_variant": null,
  "variant_confidence": null,
  "restore_strategy": null,
  "tile_restore_evidence": [],
  "provider": "geetest",
  "confidence": 0.91,
  "signals": ["命中 geetest 脚本 URL", "命中 captcha_id 参数", "页面文案包含滑块/拼图"],
  "recommended_playbook": "references/solution-playbooks.md#slider",
  "solution_options": {
    "open_source_first": ["ddddocr slide-match/slide-comparison", "OpenCV 模板/边缘/差分匹配", "轨迹模型与坐标校准"],
    "fallback_platforms": ["云码/JFBYM 滑块类型", "超级鹰滑块/坐标类型", "CapSolver", "2Captcha GeeTest/slider 类任务"],
    "when_to_switch": ["缺口弱边缘", "背景乱序/透明块", "厂商行为评分导致视觉偏移正确但验证失败"],
    "notes": "视觉偏移、DOM 坐标、拖动轨迹和厂商加密参数要分开分析。"
  },
  "summary": "疑似极验滑块验证。建议重点分析图片提取、缺口/偏移识别，以及授权测试流程中的参数绑定关系。",
  "missing_evidence": ["挑战区域 HTML", "背景图/滑块图 URL", "verify 接口名"]
}
```

默认优先建议开源/本地方案，例如 ddddocr、OpenCV、Tesseract、Whisper/faster-whisper、YOLO/CLIP/VLM；当开源方案样本通过率不足、题型过于复杂时，再建议用户自行选择打码平台或人工接管，例如云码/JFBYM、超级鹰、2Captcha、CapSolver、CapMonster Cloud、Anti-Captcha、YesCaptcha/NoCaptchaAI。不要替用户执行提交、token 注入或未授权绕过。

第二阶段执行计划建议使用这个结构：

```json
{
  "phase": "verification-flow",
  "chosen_solution": "open-source-slider",
  "authorization_scope": "用户确认的自有/授权测试目标",
  "preflight": ["证据足够", "依赖可用", "不需要真实网页操作"],
  "offline_steps": ["识别缺口偏移", "换算 DOM 坐标", "生成滑块轨迹 JSON"],
  "requires_live_browser": false,
  "requires_user_confirmation": ["如需在真实页面拖动并提交，必须再次确认"],
  "artifacts": ["offset/coordinates/track JSON"]
}
```
