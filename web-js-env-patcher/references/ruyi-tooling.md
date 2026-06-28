# ruyiPage / RuyiTrace 集成流程

当新 case 从一开始选择 ruyiPage / RuyiTrace 作为取证模式，或需要检测、安装、采集、导入 ruyiPage / RuyiTrace 材料时读取本文件。不要等确认目标站点存在自动化、CDP、JS Hook 或浏览器指纹检测后才使用 ruyiPage / RuyiTrace。

## 来源与定位

- ruyiPage：<https://github.com/LoseNine/ruyipage>
  - Python Firefox 自动化框架。
  - 基于 Firefox + WebDriver BiDi，不走 CDP。
  - 支持配套 Firefox runtime、指纹浏览器、网络抓包、请求拦截、Cookie、本地存储、拟人动作等。
- RuyiTrace / 如意 Trace：<https://github.com/LoseNine/Firefox-FingerPrint-Analyzer>
  - Windows x64 桌面工具，随包包含定制 Firefox trace 内核。
  - 采集 NDJSON 运行时 DOM / JS API 调用日志。
  - 探针在浏览器内核层，适合为补环境提供高保真环境访问日志。

仅在用户授权的网页端 JS 补环境、防御性分析、学术研究场景中使用。不要用这些工具绕过登录、验证码、MFA、付费墙、服务条款或业务风控。

## RuyiTrace 优先诊断原则

当用户确认取证模式为 **ruyiPage + RuyiTrace** 时，RuyiTrace NDJSON 不是可选参考，而是补环境阶段的优先证据源：

1. 进入 Node.js 补环境前，必须先确认是否已经采集并导入 RuyiTrace NDJSON。
2. 如果已有 NDJSON，先运行 `import_ruyitrace_log.js` 生成 `notes/ruyitrace-summary.md`，再阅读摘要和必要的原始日志片段。
3. 遇到 ReferenceError、TypeError、输出不一致、缺失指纹对象、静默失败、toString / descriptor / accessor / 原型链 / `document.all` 异常等环境问题时，先回看 NDJSON，而不是直接盲补 `env.js`。
4. 优先按以下证据定位：
   - `api` 调用频率和类别。
   - 与目标参数生成、请求发起、writer 写入时间邻近的调用。
   - `stack.file / line / col` 指向的 JS 文件、模块和函数。
   - navigator / screen / document / storage / canvas / WebGL / audio / crypto / performance / worker / iframe 等环境模块分类。
5. 只有在 NDJSON 缺失、未覆盖当前路径、日志时间段不对应、或日志结论不足时，才使用 `run_with_trace.js`、Proxy trace、Hook 或断点作为补充。
6. 输出补环境计划时，必须标明哪些环境依赖来自 RuyiTrace 证据，哪些只是 Node trace / 推断，避免把推断写成事实。
7. RuyiTrace 长字符串字段可能被截断。导入日志后，如果任意字符串字段达到或接近 4000 字符，必须标记为疑似截断：真实长度写 `unknown`，最小长度写可见长度，不能把 4000 或可见长度解释为加密参数或指纹值真实长度。涉及 WebAPI / 指纹具体值时，未截断 RuyiTrace 值优先；RuyiTrace 未选择、缺失、未覆盖或疑似截断时，必须使用当前用户确认的取证工具在同一 fingerprint baseline 下补采完整值，不能由 AI 猜值。

如果用户选择了 ruyiPage + RuyiTrace 但尚无日志，不能默认等待用户手动 trace。应先检测 RuyiTrace 是否已安装；检测通过后优先用 `scripts/capture_ruyitrace_log.js` 自动启动随 RuyiTrace 提供的 trace Firefox 捕获 NDJSON，再导入摘要。只有自动捕获失败、需要登录 / 验证 / 权限交互、目标路径未覆盖、工具不可控，或用户明确选择手动取证时，才暂停并让用户手动协助采集 / 提供 NDJSON；用户明确确认无法提供后，才降级为 ruyiPage 网络证据 + Node trace 流程。

如果用户选择了 ruyiPage + RuyiTrace 但检测到 RuyiTrace 未安装或目录不完整，不得自动改成“仅 ruyiPage”，也不要只建议“仅使用 ruyiPage”。必须先引导用户安装 / 提供 RuyiTrace 路径，或让用户明确确认降级；用户选择安装时，需要等待用户安装完成并再次验证通过后才继续任何依赖 NDJSON 的流程。

## 取证工具选择权必须交给用户

新网页端补环境任务开始后、任何取证动作之前，先让用户选择：

```markdown
请先选择本 case 的取证模式。后续抓包、JS 收集、Hook、断点、截图、RuyiTrace 日志采集等取证操作都会沿用该模式；如果后续需要切换工具，我会再次请求确认。

1. ruyiPage + RuyiTrace（推荐）：用 ruyiPage 做 Firefox/BiDi 自动化取证，用 RuyiTrace 采集 NDJSON 环境日志辅助补环境。
2. 仅 ruyiPage：只用 ruyiPage 打开页面、抓包、收集 JS，不采集 RuyiTrace 日志。
3. CloakBrowser：沿用 Chromium/CloakBrowser 方案取证。
4. 用户手动取证：你手动提供 cURL、HAR、JS 文件、调用栈截图、RuyiTrace 日志。
5. AI 自行决定：我根据目标风险和本机工具可用性提出建议，但仍会在启动浏览器前再次确认。

请回复你选择的编号，并说明是否已经安装 ruyiPage / RuyiTrace / CloakBrowser。
```

用户未选择前，不要直接启动浏览器工具；用户选择后，后续所有浏览器取证动作都必须沿用该选择，不能临时 fallback 到普通 Playwright、Puppeteer 或系统 Firefox。

## 验证码场景的 RuyiTrace 覆盖

如果目标是验证码 / 风控验证 / challenge / WAF 接口，RuyiTrace 自动捕获或手动捕获都必须覆盖完整链路：触发验证码、验证码组件初始化、用户交互事件、加密参数生成、verify / validate / challenge 接口发起、结果回调。

- 用户提供完整流程时，自动捕获脚本应按该流程执行；若流程需要人工识别、登录、验证码答案或权限交互，暂停让用户完成。
- 用户选择自己完成流程时，先启动 RuyiTrace 记录，再让用户操作；只有用户回复“已经完成触发到验证流程”后，才停止记录并导入 NDJSON。
- 如果 `notes/ruyitrace-summary.md` 只覆盖页面加载、没有交互事件或 verify 接口附近调用栈，应要求重新采集，不得直接进入补环境。

## 本机工具检测

先运行检测脚本：

```bash
node scripts/check_external_tools.js --markdown
node scripts/check_external_tools.js --json
node scripts/check_external_tools.js --python python --ruyipage-install-dir <ruyipage-browsers-dir> --markdown
node scripts/check_external_tools.js --python python --ruyipage-browser-path <firefox.exe> --markdown
```

**强制要求**：选择 ruyiPage 时，不能只检测 `import ruyipage` 是否成功，也不能把系统 Firefox fallback 当作可用。必须确认：

- ruyiPage Python 包可导入。
- Python 环境具备 `requests`，或已准备 `smart_fingerprint(manual_geo=...)` 所需地理信息；否则默认智能指纹地理探测会失败。
- Firefox 可执行文件来自 ruyiPage managed runtime，或来自用户明确提供且可验证的 ruyiPage 定制 Firefox。
- runtime 根目录存在 `install.json`。
- `install.json.release`、`install.json.asset` 或 runtime 目录名体现 `ruyi` 定制标识，例如官方 manifest 当前使用的 `151-ruyi`。
- `install.json.executable` 指向的 Firefox 文件确实存在。

如果检测结果显示“系统 Firefox fallback / 未验证路径风险”，判定 ruyiPage 绕检测方案 **不通过**，暂停流程并要求用户提供定制 Firefox 路径或安装目录。

如果用户已安装但脚本未检测到，要求用户提供：

- ruyiPage：Python 解释器路径，或确认当前 `python` 可以 `import ruyipage`。
- ruyiPage runtime：`python -m ruyipage path` 输出的 Firefox 路径、`--ruyipage-install-dir` 指向的 managed runtime 根目录，或 `--ruyipage-browser-path` 指向的定制 Firefox 可执行文件路径。
- RuyiTrace：`RuyiTrace.exe` 所在目录，或 `RuyiTrace.exe` 路径；该目录中应保留 `firefox/` 子目录和 `firefox/RUYI_DOMTRACE.txt`。
- 日志目录：RuyiTrace 生成 NDJSON 的目录。

示例：

```bash
node scripts/check_external_tools.js --python python --ruyitrace-home <RuyiTrace-dir> --markdown
node scripts/check_external_tools.js --python python --ruyipage-browser-path <verified-ruyipage-firefox.exe> --markdown
```

## ruyiPage + RuyiTrace 但 RuyiTrace 未安装

当本 case 的取证模式已经确认为 **ruyiPage + RuyiTrace**，检测脚本返回 RuyiTrace 未安装、`RuyiTrace.exe` 不存在、`firefox/` 子目录缺失，或 `firefox/RUYI_DOMTRACE.txt` 缺失时，按以下强制流程处理：

1. **不要自动降级**：不得把取证模式静默切换为“仅 ruyiPage”，也不得继续进入需要 RuyiTrace NDJSON 的补环境分析。
2. **暂停并提示用户选择**：必须让用户在“安装 / 提供 RuyiTrace 路径”和“明确降级为仅 ruyiPage”之间选择。
3. **用户选择安装 / 提供路径时**：
   - 若已安装但未检测到，要求用户提供 `RuyiTrace.exe` 路径或所在目录。
   - 若未安装，要求用户提供下载 / 安装目录。
   - 先用 `download_ruyi_tool.js --tool ruyitrace --dest <download-dir> --dry-run --markdown` 输出下载计划。
   - 用户确认后才下载；下载后提示用户解压 / 安装。
   - 等用户确认 `RuyiTrace.exe` 可打开、`firefox/` 定制内核目录存在、日志目录可选择后，再重新运行检测。
4. **用户选择降级时**：
   - 记录“取证模式已由 ruyiPage + RuyiTrace 经用户确认降级为仅 ruyiPage”。
   - 后续不得再假设存在 NDJSON。
   - 补环境阶段使用 ruyiPage 网络证据、Hook / 断点证据、Node trace / Proxy trace 作为替代来源，并在输出中标明缺少 RuyiTrace 高保真日志。

提示模板：

```markdown
你选择的是 ruyiPage + RuyiTrace，但当前未检测到可用的 RuyiTrace。该模式需要 RuyiTrace NDJSON 作为补环境优先证据源。

请选择：
1. 安装 / 提供 RuyiTrace 路径：我会先输出下载 / 安装计划，并等待你确认安装完成后再继续。
2. 明确降级为“仅 ruyiPage”：后续不采集 RuyiTrace NDJSON，补环境将使用 ruyiPage 网络证据 + Hook / Node trace 作为替代。

在你确认前，我不会自动降级，也不会继续需要 RuyiTrace 日志的流程。
```

## 未安装时的安装流程

只有当用户明确说未安装，并确认允许下载 / 安装时，才进入本节。

### ruyiPage

先询问用户：

```markdown
未检测到 ruyiPage 定制 Firefox runtime，或当前 ruyiPage 可能会退回系统 Firefox。请确认：

1. 你是否已经提前安装好 ruyiPage 定制 Firefox？
2. 如果已经安装，请提供 ruyiPage browsers 安装目录，或提供定制 Firefox 的可执行文件路径。
3. 如果没有安装，请提供希望安装到的目录。我会先输出安装计划；你确认后再执行安装。
```

推荐让用户自行在 Python 环境中安装：

```bash
python -m pip install ruyiPage --upgrade
python -m pip install requests --upgrade
python -m ruyipage install --install-dir <ruyipage-browsers-dir>
python -m ruyipage doctor --install-dir <ruyipage-browsers-dir>
python -m ruyipage path --install-dir <ruyipage-browsers-dir>
```

如果用户需要 async 支持：

```bash
python -m pip install "ruyiPage[async]" --upgrade
```

也可以使用随包安装脚本输出计划或在用户确认后安装：

```bash
node scripts/install_ruyipage_runtime.js --python python --install-dir <ruyipage-browsers-dir> --markdown
node scripts/install_ruyipage_runtime.js --python python --install-dir <ruyipage-browsers-dir> --install --markdown
```

如果用户已自行准备 Firefox、便携版 Firefox 或 Firefox 指纹浏览器，只有在它确认为 ruyiPage 定制 Firefox 或用户明确说明是等价指纹浏览器时才可跳过 runtime 安装；普通系统 Firefox 不能作为绕自动化检测的 ruyiPage 方案。

### RuyiTrace

RuyiTrace 是桌面工具。安装原则：

1. 先让用户提供下载目录。
2. 仅在用户确认后下载 Release 资产。
3. 下载完成后提示用户解压 / 安装，并保持 `RuyiTrace.exe` 与 `firefox/` 子目录在同一目录。
4. 等用户确认 `RuyiTrace.exe` 可以打开且“定制内核”状态正常后，再继续。

可用脚本查看下载计划或下载：

```bash
node scripts/download_ruyi_tool.js --tool ruyitrace --dest <download-dir> --dry-run --markdown
node scripts/download_ruyi_tool.js --tool ruyitrace --dest <download-dir> --markdown
```

如只需要 ruyiPage 配套 Firefox runtime，优先使用 `python -m ruyipage install`；需要离线下载时再使用：

```bash
node scripts/download_ruyi_tool.js --tool ruyipage-firefox --dest <download-dir> --dry-run --markdown
```

下载脚本只负责下载，不默认解压、安装或启动桌面程序。

## ruyiPage 取证流程

用户选择 ruyiPage 后：

1. 检查 ruyiPage 包、`requests` 依赖和 Firefox runtime，并确认 runtime 是 ruyiPage 定制 Firefox。
   - 如果只检测到系统 Firefox fallback，立即暂停，不启动浏览器。
   - 如果已找到定制 Firefox 但不是默认解析路径，启动时必须显式指定 `browser_path` / `set_browser_path`。
   - 如果缺少 `requests`，必须安装依赖或让用户提供 `manual_geo`；不要静默跳过智能指纹。
2. 按“ruyiPage 启动硬约束”启动；任一硬约束失败时，停止并报告，不要继续取证。
3. 确认是否需要登录；需要登录时让用户手动完成。
4. 使用有头模式打开页面。
5. 触发最少量必要业务动作。
6. 收集：
   - Network / cURL / HAR。
   - JS bundle / chunk / sourcemap URL。
   - Cookie、本地存储键名、请求头、响应状态。
   - source / entry / builder / writer 链路证据。
7. 单个取证动作完成并沉淀必要结论后，立即清理临时截图、失败下载、临时日志和无登录态 profile；登录态 profile 单独询问用户是否保留。

### ruyiPage 启动硬约束

不要把“能启动浏览器”当作 ruyiPage 取证成功。每次 ruyiPage 取证都必须从一开始满足以下约束：

| 约束 | 要求 |
|---|---|
| 定制内核 | 必须显式使用已验证的 ruyiPage 定制 Firefox runtime；不得使用系统 Firefox fallback |
| 有头模式 | 必须 `headless(False)` 或等价有头模式；不要用 headless 做高风控取证 |
| 独立 Profile | 使用本 case 专用临时 `user_dir` / profile，不复用脏 profile |
| 智能指纹 | 默认调用 `opts.smart_fingerprint(require_country=None, base_dir=..., userdir=...)`；如果地理探测失败，要求安装 `requests` 或提供 `manual_geo`，不要静默跳过 |
| 仿真注入 | 如果 `smart_fingerprint()` 返回 `ctx`，创建页面后必须执行 `ctx.apply_emulation(page)` |
| 指纹一致性 | 第一次成功取证后写入 `case/notes/fingerprint-baseline.json` 和 `baselineId`；geolocation、timezone、locale、viewport、UA、Client Hints、screen、WebGL 与 `smart_fingerprint` 输出和出口 IP 保持一致；后续复用同一 `base_dir` / `userdir`，不要每次随机新指纹 |
| 拟人动作 | 设置 `set_human_algorithm("windmouse")` 或 `"bezier"`，优先使用拟人滚动 / 点击触发业务动作 |
| 取证时机 | `page.capture.start(...)` 必须在 `page.get(...)` 之前执行 |
| 自检 | 导航后检查 `navigator.webdriver`，期望为 `false`；若为 `true`，判定当前取证不合格 |
| 验收 | 目标接口必须捕获到非失败响应；对跨域接口不要把单独的 `OPTIONS` preflight 当作业务取证成功 |
| isTrusted | 点击、拖拽、鼠标、键盘、滚动优先使用原生 BiDi / human actions；确需 JS 构造事件时必须带 `ruyi: true`；普通 `dispatchEvent` 不视为可信输入 |

这些约束只能降低普通自动化 / CDP / 指纹检测风险，不能保证绕过所有业务风控、登录、验证码、MFA、设备验证或服务端策略。

## ruyiPage / RuyiTrace 指纹基线固定

- ruyiPage 第一次成功取证后，把 `smart_fingerprint` 输出、profile / userdir、UA、Client Hints、locale、timezone、viewport、screen、WebGL 等写入 `case/notes/fingerprint-baseline.json`。
- RuyiTrace 自动捕获或手动采集前先确认使用同一 case profile / baseline；如果 RuyiTrace 定制内核不能复用同一 profile，必须采样核心字段并写入 `case/notes/fingerprint-baseline-diff.md`，不一致时暂停。
- 后续 Hook、截图、网络抓包、指纹 fixture 采样必须带同一 `baselineId`；缺少 `baselineId` 时不得把样本用于最终 env。
- 如果用户更换代理、地区、语言、profile 或工具，生成新的 baseline，旧样本不能和新样本混用。

### ruyiPage isTrusted 交互规则

高风控点击、拖拽、键盘输入、滚动和验证码交互优先使用 ruyiPage 原生 BiDi / human actions：

```python
page.actions.move_to(page.ele("#btn")).click().perform()
page.actions.drag(page.ele("#source"), page.ele("#target"), duration=640, steps=16).perform()
page.actions.release()
page.actions.human_move(ele, algorithm="windmouse").perform()
page.actions.human_click(ele, algorithm="windmouse").perform()
```

如果必须构造 JS 事件，只允许使用 ruyiPage 的 `ruyi: true` 特定能力，并在取证报告中说明事件类型和参数：

```javascript
new MouseEvent('click', { bubbles: true, clientX: 12, clientY: 24, ruyi: true });
new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', code: 'Enter', ruyi: true });
new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 3, clientY: 5, ruyi: true });
```

普通 `dispatchEvent(new MouseEvent(...))`、`new KeyboardEvent(...)` 不得作为验证码或高风控交互主路径。无法保证可信输入时，暂停并让用户手动完成或切换工具。

示例骨架：

```python
from ruyipage import FirefoxOptions, FirefoxPage

opts = FirefoxOptions()
opts.set_browser_path("<verified-ruyipage-managed-firefox>")
opts.set_user_dir("<case-browser-profile>")
opts.headless(False)
opts.set_window_size(1366, 900)
opts.set_human_algorithm("windmouse")

ctx = opts.smart_fingerprint(
    require_country=None,
    # 同一 case 固定该目录，避免每次随机生成不同指纹。
    base_dir="<case-tmp-fingerprint-dir>",
    # 同一 case 固定该 profile，后续 RuyiTrace / Hook / 指纹采样复用同一基线。
    userdir="<case-browser-profile>",
)

page = FirefoxPage(opts)
ctx.apply_emulation(page)
page.capture.start(targets="<target-api-keyword>", collect_bodies=True)
page.get("<target-page-url>")
assert page.run_js("return navigator.webdriver") is False
packets = page.capture.wait(timeout=30, count=1)
```

只有当 `node scripts/check_external_tools.js --markdown` 显示“默认解析路径是否为定制 Firefox：是”时，才可直接 `FirefoxPage()` 或 `launch(headless=False)`。否则必须显式指定已验证的定制 Firefox 路径。

### ruyiPage 取证验收标准

- JD `pc_home_feed` 类接口：至少捕获到 URL 包含 `pc_home_feed` 的 2xx 响应，并能看到请求 URL 中的加密 / 风控参数，例如 `h5st`。
- 美团外卖 `shopList` 类跨域接口：必须区分 `OPTIONS` preflight 与真实业务请求；只有捕获到非 `OPTIONS` 的 2xx `shopList` 响应，才算取证成功。若返回登录 / Yoda / 401 风控信息，应按“需要登录 / 风控验证”流程暂停，不要宣称已绕过。

## RuyiTrace 日志采集流程

用户选择 RuyiTrace 后，采集策略是 **自动捕获优先，手动采集兜底**。

### 自动捕获优先

检测到 `RuyiTrace.exe`、`firefox/` 子目录、`firefox/firefox.exe` 和 `firefox/RUYI_DOMTRACE.txt` 完整后，不要默认让用户手动打开 GUI。优先使用随包脚本自动启动 RuyiTrace 的 trace Firefox，并通过 `MOZ_DOM_TRACE` 环境变量写出 NDJSON：

```bash
node scripts/capture_ruyitrace_log.js --url <target-page-url> --case-dir case --ruyitrace-home <RuyiTrace-dir> --dry-run --markdown
node scripts/capture_ruyitrace_log.js --url <target-page-url> --case-dir case --ruyitrace-home <RuyiTrace-dir> --duration 90 --import-after --markdown
```

执行要求：

1. 自动创建或使用 `case/ruyi-trace/logs/` 作为日志目录，使用 `case/tmp/ruyitrace-profile/` 或用户确认的临时 Profile。
2. 使用 RuyiTrace 随包 trace Firefox，而不是普通系统 Firefox、普通 Playwright、Puppeteer 或 ruyiPage 的 Firefox runtime。
3. 设置 `MOZ_DOM_TRACE=1`、`MOZ_DOM_TRACE_FILE=<case trace file>`、`MOZ_DOM_TRACE_LIMIT=<limit>` 和 `MOZ_DISABLE_LAUNCHER_PROCESS=1`。
4. 打开目标页面后触发最少量必要业务动作；如果需要登录、验证码、MFA、设备验证或权限确认，暂停让用户在该 trace Firefox 中手动完成，再继续采集。
5. 自动捕获结束后，立即运行 `import_ruyitrace_log.js` 导入日志、生成 `notes/ruyitrace-summary.md`，并检查长字段截断风险。
6. 如果自动捕获没有生成 NDJSON，先记录失败原因和已执行命令，再进入手动兜底；不要把“没有日志”误写成目标没有环境访问。

自动捕获成功后继续：

```bash
node scripts/import_ruyitrace_log.js --input <trace.ndjson> --case-dir case --truncation-threshold 3900 --markdown
```

### 手动采集兜底

只有在以下情况才要求用户手动采集：

- 自动捕获启动失败或 RuyiTrace trace Firefox 无法写日志。
- 目标必须由用户登录、验证、MFA、设备确认或完成复杂交互。
- 用户明确要求使用 RuyiTrace GUI。
- 自动采集的日志未覆盖目标参数生成路径，需要用户按指定动作重新采集。

手动流程：

1. 打开 `RuyiTrace.exe`。
2. 填写启动页面。
3. 选择日志目录，建议选择当前 case 的 `ruyi-trace/logs/` 或用户指定目录。
4. 点击“开始采集”。
5. 在浏览器中正常浏览并触发目标指纹 / 加密参数生成逻辑。
6. 点击“停止采集”。
7. 找到 `trace_<时间戳>_<PID>.ndjson`。
8. 使用脚本复制到 case 并生成摘要：

```bash
node scripts/import_ruyitrace_log.js --input <trace.ndjson> --case-dir case --markdown
node scripts/import_ruyitrace_log.js --input <trace.ndjson> --case-dir case --truncation-threshold 3900 --markdown
```

高级手动启动方式仅在用户理解环境变量时使用：

```cmd
set MOZ_DOM_TRACE=1
set MOZ_DOM_TRACE_FILE=<trace-output.ndjson>
set MOZ_DOM_TRACE_LIMIT=<max-lines>
set MOZ_DISABLE_LAUNCHER_PROCESS=1
<ruyitrace-firefox.exe> -no-remote -new-instance <target-page-url>
```

可选环境变量：

| 变量 | 用途 |
|---|---|
| `MOZ_DOM_TRACE=1` | 开启 trace |
| `MOZ_DOM_TRACE_FILE=<path>` | 输出路径，PID 自动追加 |
| `MOZ_DOM_TRACE_LIMIT=<n>` | 单进程行数上限 |
| `MOZ_DOM_TRACE_PTYPE=<list>` | 启用 trace 的进程类型 |
| `MOZ_DISABLE_LAUNCHER_PROCESS=1` | Windows 下避免 launcher 提前退出 |


## RuyiTrace 长字段截断保护

RuyiTrace NDJSON 适合作为高保真环境访问日志，但长字符串字段可能因工具显示或记录限制被截断。典型风险是某个加密参数、长 token、长 Cookie、请求 body、dataURL 或大型对象序列化值真实长度为数万字符，但日志中只保留约 4000 字符。

硬性规则：

- 导入 NDJSON 时必须运行带截断检测的脚本，默认阈值为 3900：

```bash
node scripts/import_ruyitrace_log.js --input <trace.ndjson> --case-dir case --truncation-threshold 3900 --markdown
```

- 任何字符串字段长度达到或接近阈值时，统一标记：
  - `truncationSuspected: true`
  - `visibleLength: <日志中可见长度>`
  - `minLength: <日志中可见长度>`
  - `actualLength: unknown`
- 不得写“该加密参数长度为 4000”。只能写“RuyiTrace 可见长度为 4000，疑似被截断，真实长度未知，至少 4000”。
- 不得把 RuyiTrace 中的长字段可见值直接作为 fixture 期望值或最终参数值。
- 如果该字段影响签名、指纹回放或最终请求验证，必须从以下来源补采完整值：
  1. HAR / cURL / Network 完整请求。
  2. ruyiPage `collect_bodies=True` 网络抓包。
  3. 专用 Hook 对 writer 或加密入口做分片落盘，并记录完整长度、SHA256、前后片段。
  4. 最终 Node.js signer 输出，并与浏览器样本的完整长度或 hash 对比。
- 写入 `notes/missing-env-priority.md`、阶段报告或最终总结时，必须区分“RuyiTrace 未截断可用值”“RuyiTrace 可见但疑似截断值”和“其他来源补采完整值”。
- 对 Canvas / WebGL / WebGPU / Audio / 字体 / DOM 几何、`navigator`、`screen`、`window`、`document` 等具体值：RuyiTrace 未截断值是优先来源；只要日志缺失、未覆盖或疑似截断，就改用已确认的 ruyiPage / Camoufox / CloakBrowser / 手动浏览器采样，并记录 `baselineId`、`capturedBy`、完整长度和 hash。不得把 AI 猜值、静态推断或 Node.js 模拟库结果写入最终 fixture。

摘要中出现 `## 长字段截断风险` 时，后续分析要先处理完整值补采问题，再判断参数长度、结构、hash、编码或是否可复现。

如果截断字段是指纹 / WebAPI 返回值，例如 dataURL、WebGL 参数、字体探测结果、DOM 序列化结果或 Audio buffer 摘要，不得把 trace 可见片段直接写入 `fingerprint.fixture.json` 的最终 `result`；必须使用同一 case 已确认取证工具补采完整值，或显式阻塞等待用户提供完整真实浏览器材料。

## 根据 RuyiTrace 日志补环境

日志导入后按以下顺序分析。选择 ruyiPage + RuyiTrace 的 case，必须先完成本节，再进入 Node.js 缺失环境追踪：

1. 统计 `api` 调用频率，优先处理高频或和目标参数生成邻近的 API。
2. 按 `stack.file / line / col` 聚合，定位具体 JS 文件和函数。
3. 分类到环境模块：
   - Navigator / Screen / Location / Storage。
   - Canvas / WebGL / Audio / WebRTC。
   - Crypto / Performance / Date / Random。
   - DOM / Element / CSS / Layout。
   - Worker / Service Worker / iframe。
4. 将日志结论写入：
   - `notes/ruyitrace-summary.md`
   - `notes/missing-env-priority.md`：必须包含命中的 `api`、`stack.file`、`line`、`col`、环境模块分类、补齐优先级，以及“RuyiTrace 证据 / Node trace 补充 / 推断”标记。
   - `notes/entry-chain.md`
5. 再进入 Node.js 缺失环境追踪和 fixtures 验证。

遇到环境错误时的处理顺序：

1. 先在 `notes/ruyitrace-summary.md` 中搜索缺失对象、方法或相关模块，例如 `navigator`、`document.cookie`、`localStorage`、`canvas`、`WebGL`、`performance`。
2. 摘要不足时，在原始 `case/ruyi-trace/logs/*.ndjson` 中按目标 JS 文件名、目标 API 关键词、调用栈行列号或时间窗口过滤。
3. 将命中的 `api`、`stack.file`、`line`、`col`、参数摘要写入 `notes/missing-env-priority.md`。
4. 再用 Node trace 复现缺失路径，确认哪些对象需要在 `env.js` 中固化；固化时要同时处理属性描述符、访问器、原型链、函数 / 访问器 / 实例对象 toString 保护。
5. 如果 RuyiTrace 没有相关证据，明确标记“RuyiTrace 未覆盖”，再使用 Proxy trace / Hook / 断点继续排查。
6. 交付前运行 `node scripts/check_env_realism.js --case-dir case --require-ruyitrace --markdown`；涉及 `document.all` 时加 `--require-document-all`。

日志可能很大。大文件处理原则：

- 不把完整日志直接写入最终报告。
- 先导入并生成摘要。
- 必要时按行分块，优先分析和目标 API / 参数生成时间段相关的片段。
- 原始日志保存在 case 内，任务结束前询问是否保留。
