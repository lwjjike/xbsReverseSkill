# 浏览器取证、ruyiPage / RuyiTrace / Camoufox / CloakBrowser 与登录处理

每次开始新的网页端 JS 补环境任务时读取本文件。不要等确认目标站存在自动化/CDP/JS Hook 检测后才选择工具；必须在任何取证动作前，让用户先确认取证模式。任务需要浏览器交互、用户提到 ruyiPage、RuyiTrace、Camoufox、camoufox-reverse-mcp、CloakBrowser，或出现登录、验证码、MFA 时也读取本文件。

## 取证模式选择触发时机

触发时机是：**新 case 开始后、范围确认通过后、任何取证动作之前**。

这里的“取证动作”包括但不限于：

- 打开目标页面。
- 抓包、导出 cURL / HAR。
- 收集 JS bundle / chunk / sourcemap。
- 注入 Hook、设置 XHR/fetch 断点、读取调用栈。
- 截图、读取页面标题、Cookie、localStorage、sessionStorage。
- 启动 ruyiPage、RuyiTrace、Camoufox、camoufox-reverse-mcp、CloakBrowser、Playwright、Puppeteer 或其他浏览器自动化工具。
- 采集 RuyiTrace NDJSON 日志。

不要把 ruyiPage / RuyiTrace / Camoufox 作为“确认存在自动化检测之后才启用”的补救方案。它们应作为用户从一开始选择的取证路线。用户未选择前，只能做离线文本检查和缺失信息提醒，不能开始浏览器取证。

## 取证模式选择

不要直接替用户决定工具。先给用户选择：

| 模式 | 说明 | 建议 |
|---|---|---|
| ruyiPage + RuyiTrace | ruyiPage 做 Firefox/BiDi 自动化取证，RuyiTrace 采集内核层 NDJSON 环境日志 | 高风控、需要补环境日志时推荐 |
| 仅 ruyiPage | 用 Firefox/BiDi 打开页面、抓包、收集 JS，不采集 RuyiTrace 日志 | 只需要取证，不需要环境日志时 |
| Camoufox + camoufox-reverse-mcp | 用 Camoufox 反指纹浏览器和 MCP 工具完成网络、脚本、Hook、调用栈与可选属性访问追踪 | 目标更适合 Firefox/Camoufox 路线、需要 MCP 工具链时 |
| 仅 Camoufox | 使用 Camoufox 官方 Python API 打开页面、抓包、收集 JS，不依赖 MCP | 用户已有 Camoufox 或只需轻量取证时 |
| CloakBrowser | 使用 Chromium/CloakBrowser 有头 + humanize 方案 | 目标更适合 Chromium 路线或用户已有 CloakBrowser 时 |
| 用户手动取证 | 用户提供 cURL、HAR、JS 文件、调用栈截图、RuyiTrace 日志 | 用户不允许自动化或需要真实登录态时 |
| AI 自行决定 | 根据目标风险、本机工具可用性初选，但必须回报选择结果并在启动前再次确认 | 用户不确定时 |

用户未选择前，不要启动 ruyiPage、RuyiTrace、Camoufox、camoufox-reverse-mcp、CloakBrowser、Playwright 或 Puppeteer。

用户确认后，将其记录为本 case 的“取证模式”。后续所有取证操作必须沿用该模式：

- 已选 ruyiPage + RuyiTrace：用 ruyiPage 做页面/网络/JS 取证，用 RuyiTrace 采集环境日志；不要临时改用普通 Playwright。
- 已选仅 ruyiPage：所有浏览器自动化取证使用 ruyiPage；如后续需要 RuyiTrace 日志，先请求用户确认升级为 ruyiPage + RuyiTrace。
- 已选 Camoufox + camoufox-reverse-mcp：所有浏览器自动化取证使用 camoufox-reverse-mcp 或 Camoufox 官方入口；如 MCP 缺失，不得静默降级为仅 Camoufox，必须先让用户选择安装 / 配置 MCP 或明确降级。
- 已选仅 Camoufox：所有浏览器自动化取证使用 Camoufox 官方 Python API；如后续需要 MCP 的网络、脚本、Hook 或属性访问追踪能力，先请求用户确认升级为 Camoufox + camoufox-reverse-mcp。
- 已选 CloakBrowser：所有浏览器自动化取证使用 CloakBrowser；如需切到 ruyiPage / RuyiTrace / Camoufox，先请求用户确认。
- 已选用户手动取证：不要启动本机浏览器自动化；只让用户提供 cURL、HAR、JS 文件、调用栈截图、RuyiTrace 日志等材料。
- 已选 AI 自行决定：先检测工具并提出将使用的模式；用户确认后才启动。

如果所选工具不可用、路径缺失、runtime 不合格、需要登录、或后续必须更换工具，必须暂停并让用户确认，不得自动 fallback 到普通系统 Firefox、普通 Playwright、Puppeteer 或非 Camoufox 的 Playwright Firefox。

详细 ruyiPage / RuyiTrace 流程见 `ruyi-tooling.md`；详细 Camoufox 流程见 `camoufox-tooling.md`；自动点击、拖拽、键盘、滚动和验证码交互的 `isTrusted` 可信输入规则见 `trusted-input-and-isTrusted.md`。

## 指纹基线一致性硬约束

使用 ruyiPage、RuyiTrace、Camoufox、camoufox-reverse-mcp、CloakBrowser 或用户手动浏览器进行取证时，必须把“同一 case 的指纹一致性”作为前置门禁，而不是等发现指纹冲突后再补救。

- 第一次成功打开目标页并完成基础自检后，立即写入 `case/notes/fingerprint-baseline.json`，生成 `baselineId`。
- 后续抓包、Hook、RuyiTrace、截图、JS 收集、指纹采样和 fixture 对比必须复用同一 profile / userdir / seed / 代理 / locale / timezone / viewport / UA / Client Hints / screen / WebGL 基线。
- 禁止每次启动工具都重新随机指纹；如果工具默认会随机，必须通过持久 profile、固定 seed、固定配置或复用首次输出值来锁定本 case 基线。
- ruyiPage 与 RuyiTrace 如果不是同一浏览器或同一 profile，必须先对 baseline 做 diff；Camoufox / CloakBrowser 与其他工具交叉采样也同理。
- 发现 language、timezone、platform、UA、Client Hints、screen、DPR、WebGL、Canvas、Audio、字体或代理地区不一致时，暂停并写入 `case/notes/fingerprint-baseline-diff.md`；未经用户确认，不得混用样本。
- 用户明确更换代理、地区、profile 或工具时，生成新的 `baselineId`，旧样本只能保留为历史证据。

### WebAPI / 指纹值采样来源硬约束

当补环境需要具体值，例如 `navigator.userAgent`、`navigator.languages`、`screen.width`、`canvas.toDataURL()`、`WebGLRenderingContext.getParameter()`、`document.createElement()` 后的 DOM 几何、字体宽高、Audio / WebGPU 返回值等，必须遵循：

1. 用户选择 / 提供 RuyiTrace 或其他 trace 日志时，先查看 trace 中同一 `baselineId`、同一业务路径、未截断的真实值。
2. trace 未选择、缺失、未覆盖、疑似截断、真实长度为 `unknown` 或 baseline 不一致时，再用当前用户确认的取证工具采样；不得临时改用普通 Playwright、Puppeteer、系统浏览器或另一个随机指纹工具。
3. 自动化采样必须复用当前 case 的固定 profile / seed / 代理 / locale / timezone / UA / Client Hints / screen / WebGL 基线，并把采样结果写入 `case/fixtures/fingerprint.fixture.json` 或对应 fixture。
4. AI 不能根据经验猜值；静态分析只能帮助确定要采样的 API、调用参数和代码位置。
5. 每条采样值都要记录 `baselineId`、`source / capturedBy`、`traceStatus`、是否截断、长度 / hash 和采样时间。


## isTrusted 与原生输入硬约束

当取证阶段需要点击、鼠标移动、拖拽、键盘输入、滚动或验证码交互时，必须先按已确认工具选择可信输入路径：

- ruyiPage：优先 `page.actions` 原生 BiDi 动作链、`human_move`、`human_click`、`drag`；如果必须构造 JS 事件，必须使用 ruyiPage 特定的 `ruyi: true`。
- Camoufox：从启动开始 `humanize=True`，交互使用 Camoufox / Playwright 风格原生输入接口或 MCP 官方交互能力，不把 `page.evaluate(() => dispatchEvent(...))` 作为主路径。
- CloakBrowser：从启动开始 `humanize=True`，使用官方包装器 patch 后的 click / type / drag / scroll 等方法；如果退回 `page.evaluate` 合成事件，视为 `isTrusted=false` 风险并暂停确认。
- 用户手动：登录、MFA、验证码答案和高风险验证优先让用户在已确认取证浏览器中手动完成。

普通 `dispatchEvent(new MouseEvent(...))`、`new KeyboardEvent(...)`、`new PointerEvent(...)` 默认是高风险合成事件，不能作为验证码或高风控交互的主路径。无法保证可信输入时，暂停并让用户选择手动完成、切换工具或明确接受风险。

## 验证码接口取证门禁

信息完整并确认任务后、任何取证动作前，先确认目标是否为验证码 / 风控验证 / challenge / WAF 接口。若是，必须读取 `captcha-flow-and-verify-handoff.md` 并让用户选择取证方式：

1. 用户提供从触发到验证的完整流程，AI 使用已确认取证工具自动完成最小必要交互和取证。
2. 用户自己在取证浏览器中完成触发到验证，AI 只负责提前开启网络捕获、Hook、截图或 Trace，并等待用户回复“已经完成触发到验证流程”。

验证码场景不得只打开页面首屏就宣称取证完成；必须覆盖触发、展示、交互、点击验证 / 提交、verify 接口返回和结果回调。需要登录、验证码答案、MFA、账号授权或人工判断时暂停，让用户手动完成，不要尝试绕过。

## ruyiPage / RuyiTrace 定位

根据官方仓库说明：

- ruyiPage 是 Python Firefox 自动化框架，基于 Firefox + WebDriver BiDi，不依赖 CDP，支持网络控制、Cookie、本地存储、拟人动作、Firefox runtime 安装和指纹浏览器配合。
- RuyiTrace 是桌面工具，包含定制 Firefox trace 内核和 Electron 客户端，采集 NDJSON DOM / JS API 运行时调用日志。
- 推荐工作流是：ruyiPage 抓取站点整体轮廓和网络数据 → RuyiTrace 采集运行时日志 → 结合 JS 文件、网络包和日志补环境。

检测：

```bash
node scripts/check_external_tools.js --markdown
node scripts/check_external_tools.js --python python --ruyipage-install-dir <ruyipage-browsers-dir> --markdown
node scripts/check_external_tools.js --python python --ruyipage-browser-path <firefox.exe> --markdown
```

如用户选择 ruyiPage / RuyiTrace，立即检测工具是否已安装；未检测到时要求用户确认是否已安装并提供路径，或确认是否需要安装 / 下载。

如果用户选择的是 **ruyiPage + RuyiTrace**，但仅检测到 ruyiPage、未检测到可用 RuyiTrace，不得直接建议“仅使用 ruyiPage”，也不得静默降级。必须暂停并让用户选择：

- 安装 / 提供 RuyiTrace 路径，并等待安装完成与检测通过。
- 明确降级为“仅 ruyiPage”，后续不再假设存在 RuyiTrace NDJSON。

只有用户明确确认降级后，才可以进入仅 ruyiPage 取证；否则应保持 ruyiPage + RuyiTrace 模式，并先完成 RuyiTrace 安装 / 路径确认。RuyiTrace 检测通过后，默认优先自动捕获 NDJSON：运行 `scripts/capture_ruyitrace_log.js --url <target-page-url> --case-dir case --ruyitrace-home <RuyiTrace-dir> --import-after --markdown` 或等价方式，不要默认等待用户手动采集；只有自动捕获失败、需要登录 / 验证 / 权限交互或用户明确选择手动取证时，才要求用户手动打开 RuyiTrace GUI。

### ruyiPage 定制 Firefox 强制校验

ruyiPage 的价值在于使用 Firefox + WebDriver BiDi，并配合其 managed runtime / 定制 Firefox 降低普通自动化与 CDP 检测风险。执行 ruyiPage 流程前必须确认：

- ruyiPage Python 包可导入。
- `requests` 可导入，或用户已提供 `smart_fingerprint(manual_geo=...)` 所需地理信息；不要在智能指纹失败时静默降级。
- `check_external_tools.js` 输出“定制 Firefox runtime 是否通过验证：是”。
- 如果默认解析路径不是定制 Firefox，但检测到了已验证 runtime，启动示例必须显式 `set_browser_path("<verified-ruyipage-managed-firefox>")`。
- 如果只检测到系统 Firefox fallback，判定为不合格，不启动 ruyiPage；先询问用户是否已经安装定制 Firefox。

选择 ruyiPage 后，从第一次打开目标页开始就必须使用 ruyiPage 启动硬约束：

- 有头模式，不使用 headless。
- 专用临时 Profile，不复用脏 profile；同一 case 后续取证复用该 profile / userdir，不得每次随机新 profile。
- `opts.smart_fingerprint(...)` 成功，并在创建页面后执行 `ctx.apply_emulation(page)`。
- 第一次成功后固化 `case/notes/fingerprint-baseline.json` 与 `baselineId`，后续复用 `base_dir`、`userdir` 和智能指纹输出。
- geolocation / timezone / locale / viewport 与出口 IP、智能指纹和 fingerprint baseline 保持一致。
- `page.capture.start(...)` 先于 `page.get(...)`。
- 导航后验证 `navigator.webdriver === false`。
- 对跨域接口，不能把单独的 `OPTIONS` preflight 当作业务取证成功。
- 自动交互优先使用 `page.actions` 原生 BiDi / human actions；确需 JS 事件时必须带 `ruyi: true`，普通 `dispatchEvent` 不视为可信输入。

如果任一硬约束失败，暂停并说明原因；不要自动切回普通 Playwright / Puppeteer / 系统 Firefox。

未检测到定制 Firefox 时使用以下提示：

```markdown
当前没有检测到 ruyiPage 定制 Firefox runtime，或 ruyiPage 可能会退回系统 Firefox。系统 Firefox 不视为通过。

请确认：
1. 你是否已经提前安装好 ruyiPage 定制 Firefox？
2. 如果已经安装，请提供 ruyiPage browsers 安装目录或定制 Firefox 可执行文件路径。
3. 如果没有安装，请提供希望安装到的目录；我会先输出安装计划，确认后再安装。
```


## Camoufox / camoufox-reverse-mcp 定位

Camoufox 来源：<https://github.com/daijro/camoufox>，官方文档核对时间：2026-06-20。camoufox-reverse-mcp 来源：<https://github.com/WhiteNightShadow/camoufox-reverse-mcp>，官方 README 核对时间：2026-06-20。

Camoufox 是基于 Firefox 的反指纹浏览器方案，Python API 与 Playwright 风格兼容；官方安装流程不是只安装 Python 包，还必须执行 `python -m camoufox fetch` 下载浏览器本体。camoufox-reverse-mcp 是围绕 Camoufox 的 MCP 工具集，适合在授权范围内进行网络捕获、脚本列表 / 源码保存、关键字搜索、Hook、请求详情、请求 initiator、Cookie / Storage 和可选属性访问追踪。

选择 Camoufox 或 Camoufox + camoufox-reverse-mcp 后，必须在启动任何浏览器前检测：

```bash
node scripts/check_external_tools.js --python python --require-camoufox --markdown
node scripts/check_external_tools.js --python python --require-camoufox --camoufox-install-dir <camoufox-cache-dir> --markdown
node scripts/check_external_tools.js --python python --require-camoufox --require-camoufox-mcp --camoufox-mcp-project-dir <camoufox-reverse-mcp-dir> --json
```

放行条件：

- Camoufox Python 包可导入，并能导入 `camoufox.sync_api.Camoufox`。
- `python -m camoufox path` 返回的浏览器路径存在，或在用户提供 / 默认缓存目录中检测到 Camoufox 浏览器本体。
- 用户选择 MCP 时，`camoufox_reverse_mcp` 可导入；如果用户提供项目目录，应优先通过该目录的 `src/` 检测。
- 用户选择 MCP 但 MCP 不可用时，不得静默降级为仅 Camoufox。必须让用户选择：安装 / 提供 MCP 项目目录，或明确降级为仅 Camoufox。

未检测到 Camoufox 时，使用以下提示：

```markdown
当前没有检测到可用 Camoufox，或只检测到 Python 包但未检测到 `python -m camoufox fetch` 下载的浏览器本体。

请确认：
1. 你是否已经在某个 Python / venv 中安装 Camoufox？如果已安装，请提供 Python 解释器路径或 venv 激活方式。
2. 你是否已经执行过 `python -m camoufox fetch`？如果已执行，请提供 `python -m camoufox path` 输出，或 Camoufox 缓存目录。
3. 如果没有安装，请提供希望使用的 Python / venv 和下载缓存目录；如果你未提供目录，我会说明将使用 Camoufox 默认缓存目录。
```

未检测到 camoufox-reverse-mcp 时，使用以下提示：

```markdown
当前没有检测到 camoufox-reverse-mcp。你选择的是 Camoufox + camoufox-reverse-mcp，因此不能直接降级为仅 Camoufox。

请确认：
1. 是否已经克隆并安装 camoufox-reverse-mcp？如果已安装，请提供项目目录或可导入该包的 Python / venv。
2. 如果未安装，请提供希望克隆到的目录；我会先输出安装计划，确认后再执行 `git clone` 与 `python -m pip install -e .`。
3. 如果你不想安装 MCP，请明确回复“降级为仅 Camoufox”。
```

### Camoufox 启动硬约束

从第一次打开目标页开始就使用 Camoufox 官方入口或 MCP，不得先用普通 Playwright / Puppeteer / 系统浏览器探测。默认约束：

- 使用有头模式：`headless=False`。Linux 无显示环境且用户确认时才可使用官方 `headless="virtual"`。
- 开启拟人鼠标：`humanize=True`。
- 代理场景必须考虑指纹一致性：用户授权代理时优先 `geoip=True`，必要时 `block_webrtc=True`，并让 locale / timezone / geolocation 与出口 IP 和 fingerprint baseline 一致。
- 不要每次启动随机窗口尺寸、字体、WebGL 等指纹值；首次成功取证后必须固化真实样本或工具输出，后续复用同一 baseline。
- 高风险或需要登录态时，优先使用持久上下文，并将 profile 放在 case 临时目录，结束后按敏感 Profile 处理。
- MCP 模式先调用 `check_environment`，再 `launch_browser(headless=false, humanize=true, geoip=true, block_webrtc=true)`；需要属性访问日志时才加 `enable_trace=true`，并记录 trace 文件位置。
- 鼠标、键盘、拖拽和滚动使用 Camoufox / MCP 原生输入路径；不要用 `page.evaluate` 合成事件作为高风控交互主路径。

仅 Camoufox Python API 示例只用于前置取证，不得复制进最终 `result/`：

```python
from camoufox.sync_api import Camoufox

with Camoufox(headless=False, humanize=True, geoip=True, block_webrtc=True) as browser:
    page = browser.new_page()
    page.goto("https://example.com")
```

MCP 取证顺序：

1. `check_environment`：确认 MCP、Camoufox、浏览器状态。
2. `launch_browser(headless=false, humanize=true, geoip=true, block_webrtc=true)`：从第一次打开页面就启用反检测配置。
3. `network_capture(action="start")`：先于 `navigate` 开始捕获。
4. `navigate(url="目标页面")`：打开页面；需要登录时暂停，让用户手动登录并回复“已经登录成功”。
5. `list_network_requests` / `get_network_request`：筛选目标接口，请求详情只保存授权分析所需字段。
6. `get_request_initiator`：定位请求发起栈。
7. `scripts(action="list|get|save")` / `search_code`：收集相关 JS 文件和关键词命中。
8. `inject_hook_preset("xhr"/"fetch"/"cookie"/"crypto")` 或 `hook_function`：只做最小必要 Hook，并在阶段结束后 `reset_browser_state`。
9. 可选 `trace_property_access(duration=0, mode="summary", collect_values=True)`：当需要浏览器环境访问日志辅助补环境时使用；这不是 RuyiTrace 的替代品，只作为 Camoufox 侧增强。

Camoufox 与 MCP 只用于前置取证、采样和日志收集。最终交付项目不得包含 `Camoufox`、`AsyncCamoufox`、`camoufox_reverse_mcp`、`launch_browser`、`network_capture`、`page.goto`、`browser.new_page` 等浏览器自动化 / 取证代码。

## CloakBrowser 定位

CloakBrowser 来源：<https://github.com/CloakHQ/CloakBrowser>，官方文档核对时间：2026-06-18。

它是带源码层指纹补丁的定制 Chromium，并提供 Python / JavaScript 包装器，官方定位为 Playwright / Puppeteer 的替换式启动入口。它适合在授权范围内，降低普通 Playwright / Puppeteer / CDP 自动化取证时被浏览器指纹、自动化特征或 CDP 行为检测命中的风险。

允许用途：

- 打开目标页面。
- 触发最少量必要业务动作。
- 采集 Network 请求。
- 查看 Initiator 与调用栈。
- 收集 JS bundle / chunk / sourcemap URL。
- 验证加密参数和 JS 文件是否存在。

禁止用途：

- 绕过登录。
- 破解验证码。
- 绕过 MFA。
- 账号滥用、注册滥用、撞库、越权访问。
- 批量采集或高频请求。

CloakBrowser 可以降低很多浏览器指纹和 CDP 检测风险，但不能保证绕过所有风控。IP 信誉、账号风险、行为检测、验证码和服务端自研逻辑仍可能导致阻断。

### CloakBrowser 安装检测必须前置

只要用户选择或要求使用 CloakBrowser 进行取证、采集数据、收集 JS、Hook、断点或截图，就必须在启动任何浏览器前先检测：

```bash
node scripts/check_external_tools.js --require-cloakbrowser --markdown
node scripts/check_external_tools.js --require-cloakbrowser --cloakbrowser-project-dir <node-project-dir> --markdown
node scripts/check_external_tools.js --python python --require-cloakbrowser --cloakbrowser-binary-path <chromium-or-chrome-path> --json
```

判断规则：

- 检测到 Python `cloakbrowser` 包或 Node.js `cloakbrowser` 包，并且检测到 stealth Chromium 二进制，才视为“可直接进入 CloakBrowser 取证”。
- 只检测到二进制但没有 Python / Node.js 包，不得直接用普通 Playwright 指向该二进制启动；应先安装或提供官方包装器环境。
- 只检测到包但没有二进制，正式取证前应让用户确认运行 `python -m cloakbrowser install` / `npx cloakbrowser install`，或提供已下载二进制路径。
- 未检测到包和二进制时，不得继续启动浏览器；先询问用户是否已安装。已安装则让用户提供 Python 解释器、Node 项目目录或 `CLOAKBROWSER_BINARY_PATH`；未安装则引导安装。

未安装时使用以下提示：

```markdown
当前未检测到可用 CloakBrowser 环境。

请确认：
1. 你是否已经提前安装好 CloakBrowser？
2. 如果已经安装，请提供 Python 解释器 / Node 项目目录 / CloakBrowser Chromium 二进制路径。
3. 如果没有安装，请确认希望使用 Python 路线还是 Node.js 路线，并提供安装目录或项目目录；我会先输出安装计划，确认后再安装或预下载二进制。

在 CloakBrowser 检测通过前，我不会改用普通 Playwright / Puppeteer 取证。
```

### 官方安装与预下载命令

Python 路线：

```bash
python -m pip install cloakbrowser playwright --upgrade
python -m cloakbrowser install
python -m cloakbrowser info
python -m cloakbrowser update
python -m cloakbrowser clear-cache
```

Node.js / Playwright 路线：

```bash
npm install cloakbrowser playwright-core
npx cloakbrowser install
npx cloakbrowser info
npx cloakbrowser update
npx cloakbrowser clear-cache
```

Node.js / Puppeteer 路线只有用户明确要求 Puppeteer 风格 API 时才使用：

```bash
npm install cloakbrowser puppeteer-core
```

不要在 Skill 中硬编码某个本机安装目录或二进制版本；每个 case 以检测脚本和 `info` 输出为准。

### CloakBrowser 官方启动硬约束

如果用户选择 CloakBrowser，则从第一次打开目标页开始就必须使用 CloakBrowser，不要先用普通 Playwright / Puppeteer / 系统浏览器探测后再切换。

必须满足：

- 使用官方包装器入口：JavaScript 优先 `import { launch, launchContext, launchPersistentContext } from 'cloakbrowser'`；Python 使用 `from cloakbrowser import launch, launch_context, launch_persistent_context`。
- 默认有头模式：`headless: false` / `headless=False`。
- 默认启用拟人行为：`humanize: true` / `humanize=True`。
- 不直接调用 `chromium.launch()`、`puppeteer.launch()` 或普通 `browserType.launch()`。
- 如用户授权使用代理，才配置 `proxy`；需要让时区、语言、WebRTC 与出口 IP、fingerprint baseline 保持一致时再启用 `geoip: true` / `geoip=True`。
- 高风控、需要登录态、或目标检测空白无痕 Profile 时，优先使用 `launchPersistentContext` / `launch_persistent_context`，并把 Profile 放到 `case/tmp/cloak-profile/`；首次成功后固化并复用该 baseline，不得每次随机新指纹。Profile 可能含登录态，清理前必须询问用户。
- 减少 `page.evaluate`、大量 `waitForTimeout`、异常鼠标轨迹等会增加可见自动化信号的动作；只执行最小必要业务动作。
- 点击、输入、滚动、拖拽必须走 CloakBrowser humanize / 官方交互方法；如果工具退回 `page.evaluate` 合成事件，视为 `isTrusted=false` 风险并暂停确认。
- 出现登录、验证码、MFA、设备验证时暂停，让用户手动完成；不要破解或绕过。
- CloakBrowser 只用于前置取证。最终交付项目中不得包含 CloakBrowser / Playwright / Puppeteer / CDP / WebDriver 自动化代码。

JavaScript 基础有头模式：

```js
import { launch } from 'cloakbrowser';

const browser = await launch({
  headless: false,
  humanize: true,
});

const page = await browser.newPage();
await page.goto('https://example.com');
await browser.close();
```

JavaScript 持久化 Profile：

```js
import { launchPersistentContext } from 'cloakbrowser';

const ctx = await launchPersistentContext({
  userDataDir: './case/tmp/cloak-profile',
  headless: false,
  humanize: true,
});

const page = await ctx.newPage();
await page.goto('https://example.com');
await ctx.close();
```

Python 基础有头模式：

```python
from cloakbrowser import launch

browser = launch(headless=False, humanize=True)
page = browser.new_page()
page.goto("https://example.com")
browser.close()
```

高风控站点的可选配置，仅在用户授权后考虑：

```js
const browser = await launch({
  proxy: 'http://user:pass@residential-proxy:port',
  geoip: true,
  headless: false,
  humanize: true,
});
```

```python
browser = launch(
    proxy="http://user:pass@residential-proxy:port",
    geoip=True,
    headless=False,
    humanize=True,
)
```

## CloakBrowser 取证流程

1. 确认授权范围，并确认只做补环境前置取证。
2. 和用户确认取证模式为 CloakBrowser，并记录为本 case 后续唯一浏览器取证路线。
3. 运行 `check_external_tools.js --require-cloakbrowser` 检测包、二进制和用户提供路径。
4. 如果未安装或二进制缺失，暂停并让用户提供路径、确认安装或确认切换取证模式；不得自动 fallback 到普通 Playwright / Puppeteer。
5. 创建临时目录：`case/tmp/browser/`、`case/tmp/cloak-profile/`、`case/tmp/har/`、`case/tmp/screenshots/`，并准备 `case/notes/fingerprint-baseline.json`。
6. 使用 CloakBrowser 官方包装器从第一次导航开始启动，有头模式并启用 `humanize`；首次成功后固化 `baselineId`，后续复用同一 profile / 指纹配置。
7. 如果需要登录，进入手动登录等待流程。
8. 触发最少量必要业务动作。
9. 采集 Network、cURL、HAR、Initiator、调用栈、JS URL。
10. 验证加密参数和 JS 文件是否存在。
11. 输出前置总结，并请求用户确认。
12. 清理普通临时文件；登录态 Profile 单独询问用户处理方式。

## 登录处理

绝不要求用户提供：

- 账号密码。
- 短信或邮箱验证码。
- MFA Token 或 MFA Secret。
- 长期有效 Cookie 或 Authorization Token。

需要登录时，使用以下提示：

```markdown
当前目标站点需要登录。
请你在浏览器中手动完成登录、验证码、MFA 或其他安全验证。
完成后请回复：已经登录成功。

注意：请不要把真实账号密码直接发给我。在你确认登录成功前，我不会继续采集请求或分析接口。
```

用户回复 `已经登录成功` 后，不要立刻继续，先确认：

```markdown
已收到你确认登录成功。我将先检查当前登录态是否能够访问目标接口，然后按以下流程继续。

- 网站 URL：
- 目标页面：
- 目标 API：
- 请求方法：
- 加密参数：
- 参数位置：Query / Header / Body / Cookie
- 登录状态：用户已手动确认登录成功
- 取证模式：ruyiPage + RuyiTrace / 仅 ruyiPage / Camoufox + camoufox-reverse-mcp / 仅 Camoufox / CloakBrowser / 用户手动取证 / AI 自行决定
- 已知 JS 文件：
- 是否已有 Copy as cURL：
- 是否已有 HAR：
- 是否允许保存临时 Profile：
- 是否需要任务结束后删除登录态 Profile：

请确认以上信息是否正确。确认后我再继续。
```

## Cookie 过期与登录的区别

不要把所有 Cookie 失效都当作“需要用户重新给一份有效 Cookie”。处理顺序：

1. 先判断 Cookie 是否属于登录态 / 账号授权 / 会话权限，例如 session、SSO、Authorization、账号绑定 token。
2. 如果属于登录态或授权态，按登录流程暂停，让用户手动登录或提供授权样本；不要尝试绕过登录。
3. 如果目标站点不需要登录，或该 Cookie 明显是设备 Cookie、首访 Cookie、风控 Cookie、JS 生成 Cookie、challenge 派生 Cookie，则进入生成链路分析，而不是默认索要新 Cookie。
   - 非登录 Cookie 将分析生成 / 刷新链路，并尽量纳入最终入口。
4. 对非登录 Cookie，优先定位写入者：`Set-Cookie`、`document.cookie = ...`、JS 计算、Storage 派生、iframe / Worker / WASM、或服务端 challenge；并将 writer 纳入 `source → entry → builder → writer` 链路。
5. 最终交付时，非登录 Cookie 应由入口脚本生成 / 刷新后再用 Node.js 或 Python 请求客户端发送；不要把浏览器自动化作为最终验证方式。

## 验证码、MFA 与风控验证

如果出现验证码、MFA、设备验证或风险验证：

- 暂停流程。
- 让用户手动完成验证。
- 不自动破解验证码。
- 不调用第三方打码服务。
- 不索要 MFA 密钥。
- 如果用户无法完成验证，降级为离线分析，并要求用户提供 cURL、HAR、JS 文件、Initiator、调用栈样本。

## Profile 敏感性

浏览器 Profile 可能包含 Cookie、localStorage、IndexedDB 和缓存，必须按敏感材料处理。

- 默认不要把登录态 Profile 放入最终交付物。
- 删除或保留登录态 Profile 前必须询问用户。
- 不要把真实 Cookie / token 明文写入公开笔记。
- 优先保存脱敏后的请求样本。
