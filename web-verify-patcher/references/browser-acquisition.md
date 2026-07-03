# 浏览器取证与打开网页规则

本文件用于验证码识别任务中必须打开真实网页、截图、抓包、收集脚本或观察验证组件时。默认优先离线分析用户已提供的 HTML、截图、URL、脚本片段和页面文案；只有证据不足且用户确认授权范围后，才进入浏览器取证。

## 何时读取

出现以下任一情况时读取本文件：

- 需要打开目标网页。
- 需要截图、查看页面标题、读取组件 DOM 或 iframe。
- 需要抓包、导出 HAR/cURL、查看请求 initiator。
- 需要收集 JS bundle、chunk、sourcemap。
- 需要注入最小 Hook、观察 XHR/fetch、Cookie 或 Storage 写入。
- 页面出现验证码、登录、MFA、设备验证或风控验证。
- 用户明确要求避免普通自动化、CDP 或 WebDriver 检测。

## 硬性规则

- 启动任何浏览器前，先让用户确认取证模式。
- 用户未确认前，只能做离线材料分析和缺失证据提示。
- 不要直接使用普通 Playwright、Puppeteer、Selenium、系统 Chrome、系统 Firefox 或 CDP 路线打开目标页。
- 已选模式后，后续所有浏览器取证动作都沿用该模式。
- 工具不可用、路径缺失、runtime 不合格、需要登录或必须更换工具时，暂停并让用户确认；不要静默 fallback 到普通浏览器自动化。
- 出现登录、验证码、MFA、设备验证时暂停，让用户手动完成；不要自动破解、代过验证、注入 token 或调用第三方打码服务。
- 浏览器取证只用于识别和证据采集，不进入最终交付方案作为自动化执行路径。

## 取证模式

让用户从以下模式中选择：

| 模式 | 说明 | 建议 |
| --- | --- | --- |
| ruyiPage + RuyiTrace | 使用 ruyiPage 打开页面并采集网络/页面证据，RuyiTrace 采集运行时日志 | 高风控、需要环境日志时推荐 |
| 仅 ruyiPage | 使用 ruyiPage 打开页面、截图、抓包、收集 JS，不采集 RuyiTrace 日志 | 只需要网页证据时 |
| Camoufox + camoufox-reverse-mcp | 使用 Camoufox 反指纹浏览器和 MCP 工具做网络、脚本、Hook 与调用栈取证 | 需要 Firefox/Camoufox 路线和 MCP 工具链时 |
| 仅 Camoufox | 使用 Camoufox 官方 API 做轻量取证 | 用户已有 Camoufox 或只需打开页面时 |
| CloakBrowser | 使用 CloakBrowser 有头 + humanize 的 Chromium 路线 | 目标更适合 Chromium 或用户已有 CloakBrowser 时 |
| 用户手动取证 | 用户自行提供 HTML、截图、HAR、cURL、JS 文件、调用栈截图 | 不允许自动化或需要真实登录态时 |
| AI 自行决定 | 先检测本机工具，提出将使用的模式，用户确认后再启动 | 用户不确定时 |

## 各模式最低要求

### ruyiPage / RuyiTrace

- 使用有头模式。
- 使用专用临时 profile。
- 从第一次打开目标页开始使用 ruyiPage，不先用普通浏览器探测。
- 如果选择 ruyiPage + RuyiTrace，但 RuyiTrace 不可用，不得静默降级；让用户确认安装、提供路径或明确降级为仅 ruyiPage。
- 导航后应确认 `navigator.webdriver === false`。
- 只检测到系统 Firefox fallback 不视为通过；必须确认 ruyiPage 定制 Firefox runtime 可用。

### Camoufox / camoufox-reverse-mcp

- 使用 Camoufox 官方入口或 MCP 工具，不用普通 Playwright 指向系统浏览器。
- 默认有头：`headless=False`。
- 默认启用拟人行为：`humanize=True`。
- 如使用代理，需考虑语言、时区、地理位置、WebRTC 与出口 IP 的一致性。
- 选择 MCP 但 MCP 不可用时，不得静默降级为仅 Camoufox；先让用户确认。

### CloakBrowser

- 使用 CloakBrowser 官方包装器入口。
- 默认有头并启用 `humanize`。
- 不直接调用普通 `chromium.launch()`、`puppeteer.launch()` 或普通 browserType 启动。
- 需要登录态或高风控时，优先使用持久化 profile；profile 是否保留或删除由用户确认。

## 工具缺失时的引导

所选模式的工具缺失、包可导入但浏览器本体缺失、路径缺失或 runtime 不合格时，必须先向用户说明当前缺口，并提供“已安装则提供路径 / 未安装则确认安装目录和安装方式 / 明确降级或切换模式”的选项。不要静默 fallback 到普通 Playwright、Puppeteer、Selenium、系统 Chrome、系统 Firefox 或 CDP 路线。

真实安装、下载、克隆或修改环境前，先输出安装计划，等待用户确认后再执行。安装计划中只使用相对目录、用户提供目录或占位符，不要写入当前机器的绝对路径。

### ruyiPage / RuyiTrace 缺失

优先检测：

```bash
python -c "import ruyi; print('ruyiPage package ok')"
python -c "import requests; print('requests ok')"
python -c "from pathlib import Path; print('请在检测脚本或用户提供路径中校验 ruyiPage 定制 Firefox runtime')"
```

如果已有外部检测脚本，可使用等价命令检查 ruyiPage browsers 目录、定制 Firefox 可执行文件和 RuyiTrace 目录：

```bash
node scripts/check_external_tools.js --markdown
node scripts/check_external_tools.js --python <python> --ruyipage-install-dir <ruyipage-browsers-dir> --markdown
node scripts/check_external_tools.js --python <python> --ruyipage-browser-path <firefox-exe> --ruyitrace-home <RuyiTrace-dir> --json
```

未检测到 ruyiPage 定制 Firefox runtime 时，使用这个提示：

```markdown
当前没有检测到 ruyiPage 定制 Firefox runtime，或 ruyiPage 可能会退回系统 Firefox。系统 Firefox 不视为通过。

请确认：
1. 你是否已经提前安装好 ruyiPage 定制 Firefox？
2. 如果已经安装，请提供 ruyiPage browsers 安装目录或定制 Firefox 可执行文件路径。
3. 如果没有安装，请提供希望安装到的目录；我会先输出安装计划，确认后再安装或下载 runtime。

在检测通过前，我不会改用普通 Playwright、Puppeteer、系统 Firefox 或 CDP 取证。
```

选择 `ruyiPage + RuyiTrace` 但未检测到 RuyiTrace 时，使用这个提示：

```markdown
当前没有检测到可用 RuyiTrace，或 RuyiTrace 目录不完整。你选择的是 ruyiPage + RuyiTrace，因此不能静默降级为仅 ruyiPage。

请确认：
1. 是否已经安装 RuyiTrace？如果已安装，请提供 RuyiTrace 目录。
2. 如果没有安装，请提供希望下载或解压到的目录；我会先输出安装计划，确认后再下载或安装。
3. 如果暂时不需要 RuyiTrace NDJSON，请明确回复“降级为仅 ruyiPage”。
```

### Camoufox / camoufox-reverse-mcp 缺失

优先检测：

```bash
python -c "from camoufox.sync_api import Camoufox; print('Camoufox package ok')"
python -m camoufox path
```

Camoufox 官方流程不只是安装 Python 包，还需要下载浏览器本体。常见安装和下载命令：

```bash
python -m pip install camoufox --upgrade
python -m camoufox fetch
python -m camoufox path
```

如果已有外部检测脚本，可使用等价命令检查 Python 包、浏览器缓存目录和 MCP 项目目录：

```bash
node scripts/check_external_tools.js --python <python> --require-camoufox --markdown
node scripts/check_external_tools.js --python <python> --require-camoufox --camoufox-install-dir <camoufox-cache-dir> --markdown
node scripts/check_external_tools.js --python <python> --require-camoufox --require-camoufox-mcp --camoufox-mcp-project-dir <camoufox-reverse-mcp-dir> --json
```

未检测到 Camoufox 或未检测到 `python -m camoufox fetch` 下载的浏览器本体时，使用这个提示：

```markdown
当前没有检测到可用 Camoufox，或只检测到 Python 包但未检测到 `python -m camoufox fetch` 下载的浏览器本体。

请确认：
1. 你是否已经在某个 Python / venv 中安装 Camoufox？如果已安装，请提供 Python 解释器路径或 venv 激活方式。
2. 你是否已经执行过 `python -m camoufox fetch`？如果已执行，请提供 `python -m camoufox path` 输出，或 Camoufox 缓存目录。
3. 如果没有安装，请提供希望使用的 Python / venv 和下载缓存目录；如果不提供目录，我会说明将使用 Camoufox 默认缓存目录。

在检测通过前，我不会改用普通 Playwright、Puppeteer、系统 Firefox 或 CDP 取证。
```

选择 `Camoufox + camoufox-reverse-mcp` 但 MCP 缺失时，使用这个提示：

```markdown
当前没有检测到 camoufox-reverse-mcp。你选择的是 Camoufox + camoufox-reverse-mcp，因此不能直接降级为仅 Camoufox。

请确认：
1. 是否已经克隆并安装 camoufox-reverse-mcp？如果已安装，请提供项目目录或可导入该包的 Python / venv。
2. 如果未安装，请提供希望克隆到的目录；我会先输出安装计划，确认后再执行 `git clone <camoufox-reverse-mcp-repo-url> <camoufox-reverse-mcp-dir>` 与 `python -m pip install -e .`。
3. 如果你不想安装 MCP，请明确回复“降级为仅 Camoufox”。
```

### CloakBrowser 缺失

优先检测 Python 或 Node.js 包，以及 stealth Chromium 二进制是否存在：

```bash
python -c "import cloakbrowser; print('CloakBrowser Python package ok')"
python -m cloakbrowser info
npx cloakbrowser info
```

如果已有外部检测脚本，可使用等价命令检查 Python 包、Node 项目目录和二进制路径：

```bash
node scripts/check_external_tools.js --require-cloakbrowser --markdown
node scripts/check_external_tools.js --require-cloakbrowser --cloakbrowser-project-dir <node-project-dir> --markdown
node scripts/check_external_tools.js --python <python> --require-cloakbrowser --cloakbrowser-binary-path <chromium-or-chrome-path> --json
```

未检测到 CloakBrowser 时，使用这个提示：

```markdown
当前未检测到可用 CloakBrowser 环境。

请确认：
1. 你是否已经提前安装好 CloakBrowser？
2. 如果已经安装，请提供 Python 解释器 / Node 项目目录 / CloakBrowser Chromium 二进制路径。
3. 如果没有安装，请确认希望使用 Python 路线还是 Node.js 路线，并提供安装目录或项目目录；我会先输出安装计划，确认后再安装或预下载二进制。

在 CloakBrowser 检测通过前，我不会改用普通 Playwright、Puppeteer、系统 Chrome 或 CDP 取证。
```

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

## 取证顺序

1. 确认授权范围和目标页面。
2. 让用户确认取证模式。
3. 检测用户选择的工具是否可用。
4. 工具不可用时，暂停并让用户确认安装、提供路径、降级或切换模式。
5. 按确认模式从第一次导航开始打开页面。
6. 如需要登录、验证码、MFA 或设备验证，暂停等待用户手动完成。
7. 只执行最少必要操作：截图、网络捕获、脚本列表、接口 initiator、页面文案和组件特征。
8. 用采集到的 HTML、URL、文案或截图元信息运行 `scripts/classify_verify.py`。
9. 输出类型、厂商、命中信号、置信度和推荐方案。

## 用户确认模板

```markdown
本次需要打开真实网页取证。为避免普通自动化或 CDP 特征影响验证码判断，请先确认取证模式：

- ruyiPage + RuyiTrace
- 仅 ruyiPage
- Camoufox + camoufox-reverse-mcp
- 仅 Camoufox
- CloakBrowser
- 用户手动取证
- AI 自行决定

在你确认前，我不会打开页面、截图、抓包、读取 Cookie/Storage 或启动浏览器工具。
```
