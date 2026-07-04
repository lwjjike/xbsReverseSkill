# 授权验证流程

本文件用于第二阶段：用户已经看到 `solution_options`，并明确选择某个方案后，再进入验证流程。默认先离线验证；真实网页操作、打码平台调用、表单提交都必须再次确认。

## 进入条件

必须同时满足：

1. 已有第一阶段输出：`captcha_type`、`provider`、`confidence`、`signals`、`solution_options`。
2. 用户明确选择方案，例如“用 ddddocr + OpenCV 做滑块偏移”。
3. 如果需要真实网页验证或失败复盘，优先已有用户手动成功样本基线；不足时必须显式提示风险。

## 标准流程

1. 复述当前识别结论：类型、厂商、置信度、关键证据。
2. 复述用户选择的方案，并列出将使用的参考文件和脚本。
3. 做执行前检查：
   - 证据是否足够：图片、HTML、截图、题面、脚本 URL、元素尺寸、DPR、接口名。
   - 依赖是否可用：Python、OpenCV、ddddocr、Tesseract、Whisper、平台 API key 等。
   - 是否需要真实浏览器：只要涉及打开页面、点击、拖动、提交、抓 Cookie/Storage，就需要再次确认。
4. 评估成功样本基线：
   - 真实网页验证前，先检查 `success_samples`。
   - 默认同一授权目标至少 5 次用户手动成功样本。
   - 如果取证中观察到新的验证码类型，每个新类型至少 2 次成功样本。
   - 用 `scripts/evaluate_success_baseline.py` 输出 `success_baseline_status`、`success_baseline_summary` 和 `missing_success_samples`。
   - 基线不足时强提示：当前缺少真实成功流程对照，用户确认后仍可继续离线分析或受控验证。
5. 离线执行：
   - 用开源工具识别答案、偏移、角度、坐标、点列或 token 诊断结果。
   - 用 `scripts/map_coordinates.py` 换算坐标。
   - 用 `scripts/generate_motion_track.py` 生成轨迹 JSON。
   - 用 `scripts/solver_request_template.py` 生成打码平台请求模板。
6. 展示中间产物：
   - 识别结果、置信度、坐标/轨迹 JSON、缺失证据、失败原因。
   - 不要默认提交给真实页面。
7. 每次验证后记录 attempts JSON：
   - 记录方案、验证码类型、厂商、授权目标、输入证据、识别结果、坐标/轨迹、切片还原结论、环境检查结论、challenge 新鲜度、成功/失败和失败原因。
   - 同一授权目标、同一验证码类型、同一用户选择方案连续失败时，用 `scripts/evaluate_verification_attempts.py` 做失败复盘。
   - 只有达到 5 次失败且无一次成功，且图片/坐标/轨迹/切片还原/补环境/challenge 新鲜度都无明显异常时，才主动建议切换到平台对照。
8. 需要真实网页验证时：
   - 先读取 `references/browser-acquisition.md`。
   - 让用户确认 ruyiPage/Camoufox/CloakBrowser 模式。
   - 让用户确认具体动作：打开页面、截图、拖动、点击、提交或人工接管。
9. 结束时输出报告：
   - 使用方案、输入证据、产物、成功/失败、失败原因、下一步建议。

## 成功样本基线

成功样本基线用于回答“真实成功流程长什么样”。没有它时，失败复盘很容易把验证码动态切题、隐藏回调、服务端绑定或成功状态漏判为本地识别失败。

默认门槛：

1. 同一授权目标至少 5 次用户手动成功样本。
2. 如果观察到新的验证码类型，每个类型至少 2 次成功样本。
3. 每轮成功样本必须独立记录，不要只保存最后一轮。

评估脚本：

```bash
python scripts/evaluate_success_baseline.py --samples success_samples.json --pretty
```

脚本只做离线评估，不打开网页、不读取 Cookie/Storage、不提交验证。

成功样本最小结构：

```json
{
  "authorization_scope": "用户确认的自有/授权测试目标",
  "success_samples": [
    {
      "sample_id": "manual-success-001",
      "success": true,
      "captcha_type": "slider",
      "provider": "geetest",
      "captcha_variant": null,
      "evidence": {
        "screenshot_before": "<relative path or description>",
        "screenshot_after": "<relative path or description>",
        "dom_summary": "<captcha container summary>",
        "script_or_iframe_urls": ["<url without secrets>"],
        "network_summary": ["<request/response summary without secrets>"],
        "success_signal": "UI/callback/response 显示验证成功",
        "challenge_id": "<non-secret id if available>",
        "timeline": ["rendered", "user solved", "success observed"]
      }
    }
  ]
}
```

基线不足时输出：

- `success_baseline_status: insufficient`
- `missing_success_samples`
- `recommended_next_route: collect-more-manual-success-samples`
- 强提示“缺少真实成功流程对照”；用户明确确认后，仍可继续离线分析或受控验证。

## 5 次失败复盘门槛

当用户已经选择方案并确认授权后，不要无限沿用当前方案。每次尝试结束都要把结果追加到 attempts JSON，再按以下规则判断：

1. 先确认复盘对象是否是同一授权目标、同一验证码类型、同一用户选择方案。
2. 如果连续失败不足 5 次，继续收集样本和诊断证据，不急于切平台。
3. 如果同一方案已有至少 1 次成功，不触发切换；输出“当前方案可用但需优化稳定性”，并继续分析失败样本。
4. 如果失败原因仍明确属于图片识别、坐标映射、轨迹、切片乱序未还原、补环境/浏览器环境或 challenge 过期，优先修复对应问题，不急于切平台。
5. 如果连续 5 次失败且无成功，图片/坐标/轨迹/切片还原/补环境/challenge 新鲜度均为 `ok`，输出 `escalation_decision: recommend-platform-control`，主动建议切换到打码平台做授权 QA 对照。
6. `pow-challenge`、`waf-challenge`、`biometric-liveness` 不默认推荐普通打码平台；优先走官方协议、浏览器环境/厂商日志诊断、人工复核或厂商支持。

复盘脚本示例：

```bash
python scripts/evaluate_verification_attempts.py --attempts attempts.json --pretty
```

脚本只做离线判断，不打开网页、不读取 API key、不发送平台请求。

attempts JSON 可以使用这个最小结构：

```json
{
  "authorization_scope": "用户确认的自有/授权测试目标",
  "captcha_type": "slider",
  "provider": "geetest",
  "chosen_solution": "open-source-slider",
  "attempts": [
    {
      "success": false,
      "diagnosis_status": {
        "image": "ok",
        "coordinates": "ok",
        "track": "ok",
        "browser_env": "ok",
        "challenge_freshness": "ok"
      },
      "failure_reason": "服务端仍判定失败，视觉偏移与轨迹检查未发现异常"
    }
  ]
}
```

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
  "success_baseline_status": "insufficient",
  "success_baseline_summary": {
    "total_success_samples": 0,
    "min_total_success_samples": 5,
    "min_success_samples_per_type": 2,
    "observed_captcha_types": []
  },
  "missing_success_samples": [],
  "attempt_summary": {
    "consecutive_same_context": 0,
    "failures": 0,
    "successes": 0
  },
  "diagnosis_status": {},
  "switch_triggered": false,
  "recommended_next_route": "continue-current-route-with-diagnostics",
  "platform_control_plan": {
    "role": "授权 QA 对照，不默认替代所有本地方案",
    "send_request": false
  },
  "requires_user_confirmation": [
    "如需真实页面拖动或提交，需要再次确认"
  ],
  "artifacts": []
}
```

## 失败处理

- 证据不足：要求补充最小证据，不猜测。
- 成功样本基线不足：先建议用户手动完成更多成功样本；用户确认后仍可继续离线分析或受控验证，但报告必须标记风险。
- 开源工具低通过率：先给出失败样本原因；若连续 5 次失败且图像/坐标/轨迹/还原/补环境/challenge 新鲜度均无明显异常，再建议平台作为授权 QA 对照或人工接管。
- 失败不足 5 次：继续收集样本、运行本地诊断，不触发方案切换。
- 已有 1 次成功：当前方案可用但稳定性不足，继续优化失败样本，不触发平台切换。
- 图像识别、坐标映射、轨迹、切片乱序还原、补环境或 challenge 过期仍有明确异常：优先修复对应问题，不切换平台。
- 平台任务失败：检查题型、sitekey/pageurl/action、TTL、代理/IP/session、图片坐标系。
- 真实网页失败：优先诊断环境、浏览器模式、DPR、坐标映射、challenge 过期和厂商绑定。
