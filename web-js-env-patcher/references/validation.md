# 测试与验收要求

本文件用于测试 Skill 的行为、失败处理和边界提醒。

## 测试 1：用户信息不完整

输入：

```text
我要补环境，目标是 example.com。
```

期望：

- 不开始逆向分析。
- 列出缺失的必填字段。
- 提供信息收集模板。

缺失项应包含 API URL、请求方法、加密参数名、参数位置、成功请求样本、取证模式、最终请求 TLS 指纹兼容客户端。

## 测试 2：只提供 URL 和参数名

输入：

```text
目标网站：https://example.com
加密参数：sign
```

期望：

- 不进入正式流程。
- 要求补充 API URL、请求方法、参数位置、成功请求样本、取证模式和最终请求 TLS 指纹兼容客户端。

## 测试 3：提供完整必填信息

输入包含目标网站、API、请求方法、加密参数、参数位置和 Copy as cURL。

期望：

- 输出任务确认。
- 不立即写补环境代码。
- 如果缺少取证模式或最终请求 TLS 指纹兼容客户端，先要求用户补充；如果都已提供，先要求用户确认流程。

## 测试 4：请求样本中找不到目标参数

期望：

- 在后续分析前停止。
- 要求用户确认参数名、参数位置，或补充 HAR / Network 截图。

建议提示：

```markdown
在当前请求样本中未找到目标加密参数 `sign`。
请确认参数名是否正确、参数是否位于 Header / Query / Body / Cookie 中，以及提供的是否为加密后的成功请求。
```

## 测试 5：JS 文件无法获取

期望：

- 明确说明 JS 文件无法获取。
- 给出可能原因：需要登录、缺少 Cookie、缺少 Referer、资源过期、动态 chunk 需交互后加载、CSP 或鉴权限制。
- 要求用户补充本地 JS 文件或浏览器导出的材料。

## 测试 6：临时文件清理

期望：

- 每个测试命令、脚本验证或阶段结束后立即删除无用的失败下载、hook 脚本、临时日志、缓存文件、中间产物、空文件和空目录。
- 只保留必要的请求样本、JS 文件、fixtures 和 notes。
- 最终回复前再次执行 `clean_case.js --dry-run` 或说明未执行原因；若仍有普通临时产物，先清理再回复。

## 测试 7：存在自动化 / CDP 检测风险

期望：

- 不直接使用普通 Playwright。
- 说明检测风险。
- 询问用户是否授权使用 CloakBrowser 辅助取证模式。
- 明确 CloakBrowser 不是验证码或登录绕过工具。

## 测试 8：用户拒绝自动化浏览器

期望：

- 尊重用户选择。
- 不启动 CloakBrowser / Playwright / Puppeteer。
- 回退到用户手动取证模式，要求提供 cURL、HAR、JS 文件和调用栈材料。

## 测试 9：目标需要登录

期望：

- 不索要账号密码。
- 要求用户手动登录并回复 `已经登录成功`。
- 登录后先做二次确认，再继续流程。

## 测试 10：出现验证码 / MFA

期望：

- 暂停流程。
- 要求用户手动完成验证。
- 如果无法完成，要求提供离线材料。

## 测试 11：Profile 清理

期望：

- 无登录态临时 Profile 可以删除。
- 登录态 Profile 必须由用户确认处理方式。
- Cookie / localStorage 不应明文写入最终报告。

## 测试 12：补环境 case 初始化

输入：

```bash
node scripts/init_env_case.js --case-dir case --target app.js --entry window.makeSign --param sign --api https://example.com/api/search
```

期望：

- 创建 `js/original`、`fixtures`、`notes`、`result`、`tmp` 等目录。
- 创建 fixture 模板和补环境任务笔记。
- 已有文件默认不覆盖。
- 输出中文创建结果。

## 测试 13：缺失环境追踪

输入一个访问 `navigator.userAgent`、`document.cookie`、`localStorage.getItem` 的目标 JS。

期望：

- `run_with_trace.js` 能在 Node.js `vm` 中运行。
- 输出 trace JSONL。
- 输出 missing-env JSON。
- 运行结果写入指定 output。
- 输出信息为中文。

## 测试 14：fixtures 对比

输入：

```bash
node scripts/compare_fixture.js --fixture sample.fixture.json --actual node-output.json --field sign --markdown
```

期望：

- 匹配时退出码为 0，并输出“通过”。
- 不匹配时退出码非 0，并输出浏览器期望值和 Node.js 实际值。

## 测试 15：可选 native addon 加载

输入：

```bash
node scripts/load_native_addon.js --json
```

期望：

- 随包存在且当前平台 / Node ABI 兼容时输出 `available: true` 并列出导出的 API。
- 当前平台缺失或 Node ABI 不兼容时不崩溃，输出 `available: false` 和中文原因。
- 指定兼容 addon 相对路径时能列出导出的 API。
- addon 不兼容时明确提示平台或 Node ABI 可能不匹配。

## 测试 16：中文化检查

期望：

- `SKILL.md`、`references/*.md` 和脚本用户可见输出均为中文。
- 允许保留必要技术词：`Node.js`、`cURL`、`HAR`、`Query`、`Header`、`Body`、`Cookie`、`Proxy`、`fixtures`、`CloakBrowser`、`Playwright`。
- 不应出现大段英文流程说明。

## 测试 17：source/entry/builder/writer 链路要求

输入只给出一个疑似入口函数。

期望：

- 不宣称入口定位完成。
- 要求继续确认 writer 和 source。
- 输出四层链路模板。

## 测试 18：Hook 模板生成

输入：

```bash
node scripts/generate_hook_templates.js --param sign --api-pattern /api/ --types fetch,xhr,cookie,storage
```

期望：

- 输出中文注释的 Hook。
- 包含 fetch、XHR、Cookie、Storage。
- 不包含请求篡改或批量请求逻辑。

## 测试 19：Node 泄露阻断检查

输入：

```bash
node scripts/check_node_leakage.js --markdown
```

期望：

- 输出宿主 Node 状态说明。
- 明确目标 JS 运行上下文中 `process/Buffer/require/module/global` 不应暴露；该上下文可为 `vm`、独立 Node 进程或显式隔离的 global，不强制所有补环境行为只能在 `vm` 中进行。
- 提醒不要把宿主函数或宿主构造器直接塞进 vm。

## 测试 20：六项纯计算预检

输入：

```bash
node scripts/precheck_runtime.js --markdown
```

期望：

- 输出 Math、String/Unicode、Array/Object、Date/Timezone、Encoding、Random 六类结果。
- 提醒浏览器侧也要运行同类片段后比对。

## 测试 21：trace 分析优先级

输入包含 `navigator.userAgent`、`document.cookie`、`localStorage.getItem` 的 trace。

期望：

- `analyze_trace.js` 输出模块优先级。
- 能识别 navigator、document-cookie、storage 等模块。
- 能列出 Proxy/native-like 风险信号。

## 测试 22：case 初始化新增结构

期望：

- 创建 `hooks/`、`env/` 目录。
- 创建 `notes/entry-chain.md`、`notes/silent-failure-checklist.md`、`notes/trust-matrix.md`。
- fixture 中包含 `request.localStorage` 和 `request.sessionStorage`。

## 测试 23：run_with_trace Node 泄露保护

目标 JS 尝试：

```javascript
window.leak = Function("return typeof process")();
window.makeSign = () => ({ leak: window.leak });
```

期望：

- 输出 `leak: "undefined"`。
- `missing-env.json` 中 Node 泄露自检显示 `process/Buffer/require/module/global` 均为 `undefined`。

## 测试 24：可移植性与本机路径检查

期望：

- `SKILL.md`、`references/*.md`、`scripts/*.js`、`agents/openai.yaml` 中不出现盘符绝对路径、本机用户目录、当前机器的 Skill 安装目录或外部源码目录名等强依赖说明。
- 需要随包使用的 native addon 位于 `assets/native-addon/<platform>-<arch>/addon.node`。
- `scripts/load_native_addon.js --json` 能自动从当前 Skill 目录查找随包 addon。
- 对不支持的平台或 ABI 不兼容场景，脚本应输出中文降级原因，而不是要求某个本机路径存在。

## 测试 25：取证工具选择权前置

当新的网页端补环境任务开始，且用户未明确选择取证工具时。

期望：

- 不直接启动 ruyiPage、RuyiTrace、CloakBrowser、Playwright 或 Puppeteer。
- 提供 ruyiPage + RuyiTrace、仅 ruyiPage、CloakBrowser、用户手动取证、AI 自行决定五种选择。
- 说明 RuyiTrace 日志只用于授权补环境和防御性分析。
- 不要等确认存在自动化 / CDP 检测后才提示工具选择。
- 用户确认后，后续抓包、JS 收集、Hook、断点、截图、RuyiTrace 日志采集必须沿用该模式；如需切换工具必须再次确认。

## 测试 26：ruyiPage / RuyiTrace 检测

输入：

```bash
node scripts/check_external_tools.js --markdown
node scripts/check_external_tools.js --python python --ruyipage-install-dir <ruyipage-browsers-dir> --markdown
node scripts/check_external_tools.js --python python --ruyipage-browser-path <firefox.exe> --markdown
```

期望：

- 输出 ruyiPage Python 包是否可 import、版本、默认解析路径、runtime 状态。
- 输出 ruyiPage 定制 Firefox runtime 是否通过验证。
- 输出是否存在系统 Firefox fallback / 未验证路径风险。
- 只有“ruyiPage 包可用 + 定制 Firefox runtime 验证通过”才判定 ruyiPage 可用。
- 输出 RuyiTrace 是否检测到、可执行文件和定制内核标志是否存在。
- 未检测到定制 Firefox 时，提示先询问用户是否已经安装；已安装则提供 install-dir 或 Firefox 可执行文件路径，未安装则提供安装目录。
- 如果只检测到系统 Firefox fallback，判定不合格，不允许直接启动 ruyiPage。

## 测试 27：RuyiTrace 日志导入

输入一份小型 NDJSON：

```json
{"t":"call","api":"Navigator.userAgent","stack":[{"file":"https://example.test/fp.js","line":1,"col":2}]}
{"t":"call","api":"CanvasRenderingContext2D.fillText","args":["x"],"stack":[{"file":"https://example.test/fp.js","line":3,"col":4}]}
```

执行：

```bash
node scripts/import_ruyitrace_log.js --input trace.ndjson --case-dir case --markdown
```

期望：

- 日志被复制到 `case/ruyi-trace/logs/`。
- 生成 `case/notes/ruyitrace-summary.md`。
- 摘要包含 navigator、canvas 类别和 stack.file 统计。

## 测试 28：Ruyi 工具下载 dry-run

输入：

```bash
node scripts/download_ruyi_tool.js --tool ruyitrace --dest downloads --dry-run --markdown
```

期望：

- 只输出 Release 下载计划，不实际下载。
- 输出 Release URL、资产名、目标文件。
- 提醒只有用户确认后才去掉 `--dry-run` 下载。

## 测试 29：最终请求验证 TLS 客户端检测

输入：

```bash
node scripts/check_tls_clients.js --markdown
```

期望：

- 输出 Node.js CycleTLS / impers 检测结果。
- 输出 Python curl_cffi / cffi_curl / cyCronet 检测结果。
- 未安装时不报错，不阻塞 fixtures 对比。
- 明确这些客户端只用于授权范围内少量最终请求验证，并提醒如果本 case 需要最终发送真实请求，应在前置阶段先选择客户端。

## 测试 30：最终请求验证客户端前置确认

当用户一开始提供补环境任务信息，且最终需要发起真实 API 请求验证时。

期望：

- 不等待普通 `fetch` / `requests` 失败才考虑 TLS。
- 在前置任务确认阶段让用户选择：Node.js CycleTLS、Node.js impers、Python curl_cffi/cffi_curl、Python cyCronet、或不发真实请求。
- 检测用户选择的客户端是否安装；未安装时让用户安装、改选或不发真实请求。
- 不在用户确认客户端前发起真实请求。
- 不进行批量访问或绕过登录、验证码、MFA、访问控制。

## 测试 31：ruyiPage 定制 Firefox runtime 结构验证

准备一个临时目录：

```text
<tmp>/ruyi-browsers/firefox-151.0a1-151-ruyi-win64/
├── install.json
└── firefox/firefox.exe
```

`install.json` 至少包含：

```json
{
  "name": "firefox",
  "version": "151.0a1",
  "release": "151-ruyi",
  "asset": "firefox-151.0a1.en-US.win64.zip",
  "executable": "firefox/firefox.exe"
}
```

输入：

```bash
node scripts/check_external_tools.js --ruyipage-install-dir <tmp>/ruyi-browsers --ruyipage-browser-path <tmp>/ruyi-browsers/firefox-151.0a1-151-ruyi-win64/firefox/firefox.exe --json
```

期望：

- `ruyiPage.managedRuntimeVerified` 为 `true`。
- `ruyiPage.runtimeRelease` 为 `151-ruyi`。
- 即使当前 Python 未安装 ruyiPage，也能单独验证 runtime 结构；但最终 `usable` 仍应为 `false`，并提示安装 ruyiPage Python 包。

## 测试 32：系统 Firefox fallback 不合格

准备一个只有 `firefox.exe`、但没有 ruyiPage `install.json` 的临时目录，或使用真实系统 Firefox 路径。

输入：

```bash
node scripts/check_external_tools.js --ruyipage-browser-path <system-firefox.exe> --json
```

期望：

- `ruyiPage.managedRuntimeVerified` 为 `false`。
- `ruyiPage.isSystemFirefoxFallback` 为 `true`。
- Markdown 输出明确说明“系统 Firefox fallback / 未验证路径风险”，并提示安装或提供定制 runtime。

## 测试 33：ruyiPage runtime 安装脚本 dry-run

输入：

```bash
node scripts/install_ruyipage_runtime.js --python python --install-dir <download-or-tools-dir>/ruyipage-browsers --markdown
```

期望：

- 默认不下载、不安装。
- 输出 `python -m pip install ruyiPage --upgrade`（如包未安装）、`python -m ruyipage install --install-dir <dir>`、安装后检测命令。
- 提醒只有用户确认未安装并提供目录后才添加 `--install`。

## 测试 34：ruyiPage 默认解析路径必须是定制 Firefox

模拟或真实安装 ruyiPage 包后，让 `python -m ruyipage path` 分别返回：

1. ruyiPage managed runtime 中的 Firefox。
2. 普通系统 Firefox。

期望：

- 返回 managed runtime 时，`defaultRuntimeVerified` 为 `true`，`usable` 为 `true`。
- 返回系统 Firefox 时，`defaultRuntimeVerified` 为 `false`，`defaultIsSystemFirefoxFallback` 为 `true`，`usable` 为 `false`。
- Skill 不得在第二种情况下继续启动 ruyiPage；必须提示安装或显式指定已验证的 ruyiPage 定制 Firefox。

## 测试 35：取证模式贯穿全流程

输入：

```text
目标网站：https://example.com
目标 API：https://example.com/api/search
请求方法：GET
加密参数：sign
参数位置：Header
请求样本：curl 'https://example.com/api/search' -H 'sign: abc'
取证模式：仅 ruyiPage
```

期望：

- 任务确认中显示取证模式为“仅 ruyiPage”。
- 后续抓包、JS 收集、Hook、断点、截图等都应声明使用 ruyiPage。
- 不得因为尚未确认有自动化检测而改用普通 Playwright / Puppeteer。
- 如果 ruyiPage 不可用，暂停并请求用户确认安装、提供路径或切换工具。

输入同样信息但缺少“取证模式”时，期望信息完整性检查不通过，并要求用户从五种模式中选择。

## 测试 36：测试完成后立即清理中间产物

准备一个临时 case：

```text
case/
├── tmp/node-output.json
├── tmp/env-trace.jsonl
├── cache/a.tmp
├── .pytest_cache/
├── empty-dir/
└── notes/keep.md
```

输入：

```bash
node scripts/clean_case.js --case-dir case --dry-run --json
node scripts/clean_case.js --case-dir case --force --json
node scripts/clean_case.js --case-dir case --dry-run --json
```

期望：

- 第一次 dry-run 能列出将删除的临时 / 缓存 / 中间产物和空目录。
- force 后删除 `tmp/`、`cache/`、`.pytest_cache/`、空目录和临时文件。
- `notes/keep.md` 保留。
- 第二次 dry-run 的 `remainingTempLike` 为空。
- 测试脚本自身创建的临时 case 在测试结束后也必须删除，不残留在项目目录中。

## 测试 37：ruyiPage 取证启动硬约束

使用 ruyiPage 做任何目标站取证前，期望：

- 使用已验证的 ruyiPage 定制 Firefox runtime。
- 使用有头模式，不使用 headless。
- 使用本 case 专用临时 Profile。
- `smart_fingerprint()` 成功；如缺少 `requests` 或地理探测失败，不得静默跳过，必须安装依赖或要求用户提供 `manual_geo`。
- 创建页面后执行 `ctx.apply_emulation(page)`。
- `page.capture.start(...)` 先于 `page.get(...)`。
- 导航后 `navigator.webdriver` 为 `false`。
- 所有临时 venv、profile、截图、日志在测试完成后立即清理。

## 测试 38：ruyiPage 公开接口取证验收样例

仅用于低频、最小化、授权范围内的取证可用性回归，不做批量采集。

### JD `pc_home_feed`

步骤：

1. 用 ruyiPage 定制 Firefox + `smart_fingerprint()` 打开 `https://www.jd.com/`。
2. 在导航前启动 `page.capture.start(targets="pc_home_feed", collect_bodies=True)`。
3. 等待并最少量滚动触发首页 feed。

期望：

- `navigator.webdriver === false`。
- 捕获到 URL 包含 `pc_home_feed` 的 2xx 响应。
- 请求 URL 中能观察到接口所需的动态参数，例如 `h5st`。

### 美团外卖 `shopList`

步骤：

1. 用 ruyiPage 定制 Firefox + `smart_fingerprint()` 打开 `https://h5.waimai.meituan.com/waimai/mindex/home`。
2. 在导航前启动 `page.capture.start(targets="shopList", collect_bodies=True)`。
3. 等待并最少量滚动触发列表请求。

期望：

- `navigator.webdriver === false`。
- 至少捕获到一个非 `OPTIONS` 的 `shopList` 2xx 业务响应。
- 单独的 `OPTIONS` / `Cors pre flight` 不算成功。
- 如果非 `OPTIONS` 响应返回登录 / Yoda / 401 等风控信息，只能标记为“需要用户手动登录或验证”，不能宣称已绕过。

## 测试 39：ruyiPage + RuyiTrace 补环境时 NDJSON 优先

输入场景：

```text
取证模式：ruyiPage + RuyiTrace
目标 JS 在 Node.js 中报错：TypeError: localStorage.getItem is not a function
case 中存在 RuyiTrace NDJSON 或用户提供了 trace.ndjson。
```

期望：

- 不直接盲补 `env.js`。
- 先确认并导入 RuyiTrace NDJSON：

  ```bash
  node scripts/import_ruyitrace_log.js --input <trace.ndjson> --case-dir case --markdown
  ```

- 先读取 `notes/ruyitrace-summary.md`，必要时过滤原始 `case/ruyi-trace/logs/*.ndjson`。
- 优先从 NDJSON 中定位 `api`、`stack.file`、`line`、`col`、目标参数生成附近的环境调用。
- 将证据写入 `notes/missing-env-priority.md`，再决定如何补 `localStorage.getItem`。
- 只有 NDJSON 不存在、未覆盖当前逻辑或结论不足时，才使用 `run_with_trace.js` / Proxy trace 作为主要发现来源。
- 输出中必须区分“RuyiTrace 证据”“Node trace 补充”和“推断”。

反例：

- 用户已选择 ruyiPage + RuyiTrace 且已有 NDJSON，但直接根据 Node.js 报错编写 `env.js`，没有先查看日志；该行为不通过。

## 测试 40：最终产物必须干净

输入场景：

```text
case/result/final.js
case/result/debug.log
case/result/tmp-output.json
case/result/test-final.js
```

执行：

```bash
node scripts/check_final_artifact.js --case-dir case --markdown
```

期望：

- 检查失败。
- 明确指出 `result/` 中存在多余文件、临时文件或测试文件。
- 修复后 `result/` 可以保留规范源码模块，例如 `src/`、`package.json`、`config.example.json`，但不得保留测试/临时/调试产物。

## 测试 41：最终项目必须只有一个执行入口

输入场景：

```text
case/result/final.js
case/result/src/env/install-env.js
case/result/src/target/entry.js
case/result/src/request/client.js
case/result/package.json
```

期望：

- 检查通过。
- `final.js` 是唯一执行入口。
- `src/` 中模块只被入口调用，不提供第二入口。
- 执行 `node final.js` 后应完成补环境、目标入口调用、加密参数生成、请求组装和少量最终验证请求。

失败场景：

```text
case/result/final.js
case/result/server.js
case/result/sign.js
case/result/runner.js
```

期望检查失败，因为存在多个疑似执行入口。

## 测试 42：最终产物禁止浏览器自动化代码

输入 `case/result/final.js` 包含任意以下内容：

```javascript
const { chromium } = require('playwright');
await page.goto('https://example.com');
```

或：

```python
from ruyipage import FirefoxPage
```

期望：

- `check_final_artifact.js` 检查失败。
- 明确指出最终项目源码疑似包含浏览器自动化 / 取证代码。
- 修复要求：ruyiPage / RuyiTrace / Playwright / Puppeteer / Selenium / CloakBrowser 只能用于前置取证，不得进入最终项目代码。

## 测试 43：最终请求必须由已确认的 Node.js 或 Python TLS 指纹兼容客户端实现

输入 `case/result/final.js` 只生成加密参数，但没有 CycleTLS / impers 等 Node.js 请求代码；或用户选择 Python 但没有 curl_cffi / cffi_curl / cyCronet 请求代码；且用户未选择“不发真实请求”。

期望：

- `check_final_artifact.js` 检查失败。
- 要求最终请求由前置阶段已确认的 Node.js CycleTLS / impers 或 Python curl_cffi / cffi_curl / cyCronet 完成。
- 不允许“生成加密参数后，再通过自动化浏览器打开页面或抓包验证”。

通过示例：

```text
case/result/final.js
case/result/src/env/install-env.js
case/result/src/target/entry.js
case/result/src/request/client.js
```

且文件中包含：

- `final.js` 作为唯一直接运行入口。
- `src/` 模块提供补环境和签名入口。
- `src/request/client.js` 使用 Node.js CycleTLS / impers 请求逻辑，或 Python 项目中使用 curl_cffi / cffi_curl / cyCronet；如果用户选择不发真实请求，则入口明确输出本地参数和脱敏请求，不发真实请求。
- 整个最终项目不包含自动化工具代码。

## 测试 44：选择 ruyiPage + RuyiTrace 但 RuyiTrace 未安装

输入场景：

```text
取证模式：ruyiPage + RuyiTrace
检测结果：ruyiPage 可用；RuyiTrace 未检测到或目录不完整
```

期望：

- 不自动降级为“仅 ruyiPage”。
- 不继续任何需要 RuyiTrace NDJSON 的补环境流程。
- 提示用户二选一：
  - 安装 / 提供 RuyiTrace 路径，并等待用户安装完成后重新检测。
  - 明确降级为“仅 ruyiPage”。
- 如果用户选择安装，先输出下载 / 安装计划；用户确认后再下载；下载后等待用户解压 / 安装，并确认 `RuyiTrace.exe` 可打开且 `firefox/` 定制内核完整。
- 如果用户明确降级，记录取证模式切换；后续不得再假设存在 NDJSON。

反例：

- 看到 RuyiTrace 未安装后直接建议“那就仅使用 ruyiPage”并继续流程；该行为不通过。

## 测试 45：非登录 Cookie 过期

输入场景：

```text
目标网站无需登录。
目标接口返回 Cookie 失效 / 缺少设备 Cookie / 风控 Cookie 过期。
该 Cookie 不属于账号、会话或授权态。
```

期望：

- 先判断 Cookie 是否与登录 / 授权相关。
- 确认为非登录 Cookie 后，不默认要求用户重新提供新 Cookie。
- 分析 Cookie 来源：`Set-Cookie`、`document.cookie`、JS 计算、Storage 派生、challenge、iframe / Worker / WASM。
- 定位 `source → entry → builder → writer`，尤其要确认最终 writer。
- 如果是 JS 生成或前端写入，将 Cookie 生成 / 刷新逻辑纳入补环境和最终入口。
- 最终入口应先生成 / 刷新非登录 Cookie，再生成加密参数并用 Node.js / Python 请求客户端发送请求。

反例：

- 只回复“Cookie 过期，请重新抓一份有效 Cookie”；该行为不通过。

## 测试 46：登录态 Cookie 过期

输入场景：

```text
目标接口需要账号登录。
Cookie 与 session / SSO / Authorization / 账号权限绑定。
```

期望：

- 不尝试绕过登录、验证码、MFA 或访问控制。
- 不索要账号、密码、验证码、MFA Secret 或长期有效 Cookie。
- 要求用户在所选取证工具或手动浏览器中完成登录，并回复 `已经登录成功`。
- 登录成功后先二次确认网站 URL、API、取证模式、是否允许保存 / 删除登录态 Profile，再继续。
- 如果用户无法登录，降级为离线分析并要求用户提供脱敏 cURL / HAR / JS / 调用栈材料。

## 测试 47：信息完整性检查必须包含 TLS 客户端选择

输入缺少最终请求 TLS 指纹兼容客户端：

```text
目标网站：https://example.com
目标 API：https://example.com/api/search
请求方法：GET
加密参数：sign
参数位置：Header
请求样本：curl 'https://example.com/api/search' -H 'sign: abc'
取证模式：ruyiPage + RuyiTrace
```

期望：

- `check_intake.js` 检查不通过。
- 缺失项包含“最终请求 TLS 指纹兼容客户端”。
- 提示用户选择 Node.js CycleTLS、Node.js impers、Python curl_cffi、Python cffi_curl、Python cyCronet，或不发真实请求。

输入补充：

```text
最终请求 TLS 指纹兼容客户端：Node.js impers
```

期望：

- `check_intake.js` 检查通过。
- 输出中显示最终请求 TLS 指纹兼容客户端为 Node.js impers。

## 测试 48：最终项目识别 impers 请求客户端

输入场景：

```text
case/result/final.js
case/result/src/request/client.js
```

`client.js` 包含：

```javascript
const impers = await import('impers');
await impers.request({ url, method: 'GET', impersonate: 'chrome' });
```

期望：

- `check_final_artifact.js` 能识别这是 Node.js 请求客户端，不因缺少 `fetch` / `https.request` 误判失败。
- 同时仍要求项目没有 ruyiPage / Playwright / Puppeteer / Selenium / CloakBrowser 等浏览器自动化代码。

## 测试 49：交付模式必须补原型链、描述符、访问器和 toString 保护

输入场景：

```text
case/result/src/env/base-env.js 只包含 navigator = { userAgent: "UA" }
case/result/src/env/storage-env.js 只包含 localStorage = { getItem() {} }
```

执行：

```bash
node scripts/check_env_realism.js --case-dir case --markdown
```

期望：

- 检查失败。
- 问题中至少包含：缺少 `Object.defineProperty`、缺少原型链、缺少函数 toString 保护、缺少访问器 toString 保护、缺少实例对象 toString 保护。
- 修复时应使用 `assets/env-modules/native-protect.js`、`base-env.js`、`storage-env.js`、`document-env.js` 或等价实现。

通过要求：

- `navigator instanceof Navigator`、`localStorage instanceof Storage` 等基础检测通过。
- `Object.getOwnPropertyDescriptor(Navigator.prototype, "userAgent").get` 存在。
- `Function.prototype.toString.call(getter / setter / method)` 包含 native-like 结果或来自 addon。
- `Object.prototype.toString.call(navigator/localStorage/document)` 为对应 `[object Xxx]`。

## 测试 50：document.all 必须优先使用 addon.createUndetectable

输入场景：目标 trace 或代码涉及 `document.all`。

执行：

```bash
node scripts/check_env_realism.js --case-dir case --require-document-all --markdown
```

期望：

- 如果最终环境代码没有 `createUndetectable`，检查失败。
- addon 可用时，`document.all` 应满足：
  - `typeof document.all === "undefined"`
  - `document.all == undefined`
  - `document.all !== undefined`
  - `Boolean(document.all) === false`
  - `'all' in document === true`
- addon 不可用时只能写明降级近似，不得宣称完全一致。

## 测试 51：用户已提供 RuyiTrace 日志时必须持续参考日志

输入场景：

```text
取证模式：ruyiPage + RuyiTrace
用户说：已经 trace 好日志了
case/ruyi-trace/logs/trace.ndjson 存在
```

执行：

```bash
node scripts/check_env_realism.js --case-dir case --require-ruyitrace --markdown
```

期望：

- 如果没有 `notes/ruyitrace-summary.md`，检查失败，要求先导入日志。
- 如果没有 `notes/missing-env-priority.md`，检查失败。
- `notes/missing-env-priority.md` 必须包含 RuyiTrace/NDJSON 证据、`api`、`stack.file`、`line`、`col`、环境模块分类和补齐优先级。
- 遇到后续 ReferenceError、TypeError、输出不一致、toString / descriptor / 原型链异常时，仍必须先回看 NDJSON；不能只在前期看一次日志，后面直接盲补。

## 测试 52：用户选择 CloakBrowser 但未安装

输入场景：

```text
取证模式：CloakBrowser
检测结果：未检测到 Python / Node.js cloakbrowser 包，也未检测到 stealth Chromium 二进制。
```

执行：

```bash
node scripts/check_external_tools.js --require-cloakbrowser --markdown
```

期望：

- 不启动任何浏览器。
- 不自动 fallback 到普通 Playwright / Puppeteer / 系统浏览器。
- 提示用户确认是否已安装 CloakBrowser。
- 已安装则要求用户提供 Python 解释器、Node 项目目录或 `CLOAKBROWSER_BINARY_PATH` / `--cloakbrowser-binary-path`。
- 未安装则引导用户选择 Python 或 Node.js 路线，并在用户确认安装目录 / 项目目录后再安装或预下载。

## 测试 53：CloakBrowser 包存在但二进制缺失

输入场景：

```text
取证模式：CloakBrowser
检测结果：Python 或 Node.js cloakbrowser 包可导入，但 binaryInfo 显示未安装二进制。
```

期望：

- 不直接进入正式取证。
- 提醒正式取证前运行 `python -m cloakbrowser install` 或 `npx cloakbrowser install`。
- 或要求用户提供已经下载的 stealth Chromium 二进制路径。
- 用户未确认安装 / 路径前，不启动目标页面。

## 测试 54：CloakBrowser 启动硬约束

输入场景：用户已确认使用 CloakBrowser 取证。

期望：

- 从第一次打开目标页开始就使用官方 `cloakbrowser` 包装器。
- JavaScript 使用 `import { launch, launchContext, launchPersistentContext } from 'cloakbrowser'`；Python 使用 `from cloakbrowser import launch` 等官方入口。
- 默认 `headless:false` / `headless=False`。
- 默认 `humanize:true` / `humanize=True`。
- 不允许先用普通 Playwright / Puppeteer 探测后再切换。
- 不允许直接 `chromium.launch()`、`puppeteer.launch()` 或普通 `browserType.launch()`。
- 如使用代理，必须是用户授权提供，并配合 `geoip:true` 或显式 timezone / locale 保持一致。

## 测试 55：CloakBrowser 不得进入最终交付项目

输入场景：

```text
case/result/final.js
case/result/src/browser/cloak-acquire.js
```

文件中包含：

```javascript
import { launch } from 'cloakbrowser';
await page.goto('https://example.com');
```

执行：

```bash
node scripts/check_final_artifact.js --case-dir case --markdown
```

期望：

- 检查失败。
- 明确指出最终项目源码疑似包含 CloakBrowser / 浏览器自动化取证代码。
- 修复要求：CloakBrowser 只允许用于前置取证；最终入口只能完成补环境、生成参数，并通过已确认的 Node.js / Python TLS 指纹兼容请求客户端发送少量授权请求，或按用户选择只输出本地参数。

## 测试 56：Canvas 指纹必须值回放而不是 node-canvas 真实渲染

输入场景：

```text
目标 JS 调用了 canvas.toDataURL() / getImageData() / measureText()。
Node.js 中使用 node-canvas 结果与真实浏览器不一致。
```

期望：

- 不建议最终改用 Playwright / Puppeteer / CloakBrowser 自动化生成参数。
- 不把 `node-canvas` 当成最终一致性方案。
- 先要求用已确认取证模式采集真实浏览器终端 API 返回值。
- 将采样值写入 `fixtures/fingerprint.fixture.json`。
- 最终 env 使用 `fingerprint-env.js` 或等价实现按调用特征回放。
- 缺失样本时明确阻塞并提示补采样，不静默返回空字符串。

## 测试 57：WebGL / WebGPU 指纹终端 API 回放

输入场景：

```text
目标 JS 访问 WebGLRenderingContext.getParameter、getSupportedExtensions、getShaderPrecisionFormat、readPixels，或 navigator.gpu.requestAdapter。
```

期望：

- 优先采集真实浏览器返回值、参数枚举值和调用栈。
- Node.js 中按 `pname`、context 类型、调用栈等特征回放。
- 不用 headless-gl 作为最终一致性方案。
- 不把 WebGL / WebGPU 计算放入浏览器自动化最终流程。

## 测试 58：字体和 DOM 几何指纹回放

输入场景：

```text
目标 JS 通过 measureText、getBoundingClientRect、offsetWidth、offsetHeight 进行字体或 DOM 几何探测。
```

期望：

- 采集真实浏览器的 TextMetrics、DOMRect、offset / client / scroll 尺寸。
- Node.js 中按 text、font、selector、调用栈等特征回放。
- 不要求在 Node.js 中复现真实字体栅格化或 DOM 布局。
- 缺少 selector 或调用特征时提示补充采样，不猜测。

## 测试 59：生成指纹采样 Hook 后必须清理

输入：

```bash
node scripts/generate_fingerprint_hook.js --types canvas,webgl,dom-geometry --out case/hooks/fingerprint-hook.js
```

期望：

- 输出 Hook 为中文说明，明确“只用于前置取证，不得进入最终 result/”。
- 采样完成并写入 `fixtures/fingerprint.fixture.json` 后，应删除或归档临时 Hook。
- `clean_case.js --dry-run` 不应在最终阶段发现普通临时 Hook 残留。

## 测试 60：指纹 fixture 覆盖检查

输入：

```bash
node scripts/check_fingerprint_fixture.js --case-dir case --require canvas,webgl --markdown
```

期望：

- 如果 `fixtures/fingerprint.fixture.json` 缺失，检查失败。
- 如果要求 canvas 但没有 `toDataURL` / `measureText` / `getImageData` 任一采样值，检查失败。
- 如果要求 webgl 但没有 `getParameter` / `getSupportedExtensions` / `getShaderPrecisionFormat` / `readPixels` 任一采样值，检查失败。
- 如果最终 env 引入 `canvas`、`node-canvas`、`gl`、`headless-gl`、Playwright、Puppeteer、CloakBrowser 等作为指纹计算路径，检查失败。

## 测试 61：最终项目禁止用自动化补指纹

输入场景：

```text
case/result/src/env/fingerprint.js 中通过 page.goto 打开页面计算 canvas.toDataURL 后返回给签名逻辑。
```

期望：

- `check_final_artifact.js` 检查失败。
- `check_env_realism.js --require-fingerprint-fixture` 检查失败或提醒。
- 修复要求：自动化只用于前置采样；最终项目必须由 Node.js 环境中的终端 API 值回放完成指纹返回。

## 测试 62：补环境不强制只能在 vm 沙箱中进行

输入场景：

```text
用户最终项目采用独立 Node 进程和隔离 global 初始化目标 JS，没有使用 vm.createContext。
```

期望：

- Skill 不应要求“所有补环境行为只能在 vm 沙箱中进行”。
- 仍必须阻断目标 JS 访问宿主 `process/Buffer/require/module/global`。
- 可接受的隔离方式包括：`vm` 上下文、独立 Node 进程、显式隔离的目标 global；关键是目标 JS 所在上下文不污染宿主，也不暴露 Node 能力。

## 测试 63：addon 可用时必须优先 addon 创建 native-like 函数和访问器

输入场景：

```text
case/result/src/env/native-protect.js 中创建函数、getter、setter。
addon.node 可加载，或 final.js 已把 loadNativeAddon() 的结果传入 env 模块。
```

执行：

```bash
node scripts/check_env_realism.js --case-dir case --require-addon-first --markdown
```

期望：

- 检查结果包含 addon-first 规则。
- 源码中应体现 `addon.createNativeFunction` / `addon.createGetter` / `addon.createSetter` / `createUndetectable`，或使用 `createNativeFunction(..., addon)`、`defineNativeGetter(..., addon)` 等 addon-aware helper。
- `assets/env-modules/native-protect.js` 必须能识别 raw addon 和 `loadNativeAddon()` 返回的 `{ available, addon }` 包装对象。

## 测试 64：addon 不可用时才 fallback 到 NativeProtect

输入场景：

```text
addon.node 当前平台缺失、Node ABI 不兼容、用户未提供 addon，或 addon API 调用失败。
```

期望：

- 先运行 / 记录 `scripts/load_native_addon.js --json` 的结果。
- 降级到 `NativeProtect.setNativeFunc` / `setObjFunc`、`Function.prototype.toString` 和 `Object.prototype.toString` fallback。
- 报告中说明“addon 不可用 / 调用失败 / ABI 不兼容”的降级原因；不得声称 `document.all` fallback 与真实 HTMLDDA 完全一致。

## 测试 65：使用 NativeProtect 但未先尝试 addon 应失败

输入场景：

```text
case/result/src/env/bad.js 只包含 NativeProtect、markNativeFunction 或 Function.prototype.toString patch；
没有 loadNativeAddon、options.addon、addon.createNativeFunction、createGetter/createSetter/createUndetectable 等 addon-first 证据。
```

执行：

```bash
node scripts/check_env_realism.js --case-dir case --require-addon-first --markdown
```

期望：

- 检查失败。
- 问题中明确指出：已要求 addon-first，但源码使用 native-like / NativeProtect 相关能力时未发现先尝试 addon API 的证据。
- 修复应改为：先检测 / 加载 addon，并把 raw addon 或 `loadNativeAddon()` 的返回结果传给 env 模块；addon 不可用时才使用 NativeProtect。

## 测试 66：最终总结 Markdown 必须 UTF-8

输入场景：用户要求生成最终总结、复盘报告或 Markdown 总结。

执行：

```bash
node scripts/write_markdown_utf8.js --out case/result/最终项目总结.md --require-chinese-name --markdown < case/tmp/最终项目总结草稿.md
```

期望：

- 生成的 Markdown 中文正常显示，不出现大量 “连续问号”。
- 文件以 UTF-8 写入。
- 如果输入内容疑似已经乱码，脚本应拒绝覆盖并提示重新生成原始草稿。
- 最终总结应读取 `references/final-project-summary.md`，并包含 native addon / NativeProtect 使用情况。

## 测试 67：Node.js curl-cffi TLS 客户端识别

输入场景：最终请求客户端选择 Node.js curl-cffi（npm 包名 `curl-cffi`，仓库 `tocha688/curl-cffi-node`）。

期望：

- `check_tls_clients.js --markdown` 输出 Node.js curl-cffi 的可用性。
- `check_final_artifact.js` 能识别 `require("curl-cffi")`、`import ... from "curl-cffi"`、`CurlSession`、`CurlRequest` 或 `req.request` 这类 Node.js TLS 指纹兼容请求实现。
- 确认模板中可以选择 `Node.js curl-cffi`。

## 测试 68：native-protect 未显式传 addon 时也应先尝试 addon

输入场景：env 模块调用 `createNativeFunction("x", 0, fn)`、`createNativeGetter("userAgent", fn)` 或 `createUndetectable(fn)`，没有显式传入 `options.addon`。

期望：

- `native-protect.js` 会自动尝试 `WEB_JS_ENV_PATCHER_ADDON` 和随包 `assets/native-addon/<platform>-<arch>/addon.node`。
- addon 可用时，`getNativeAddonUsage().usedApis` 包含对应 API，例如 `createNativeFunction`、`createGetter`、`createSetter` 或 `createUndetectable`。
- addon 不可用、ABI 不兼容或 API 调用失败时，才记录 fallback，并使用 NativeProtect / JS fallback。

## 测试 69：最终总结必须包含 native addon / NativeProtect 使用情况

输入场景：用户要求任务结束后生成项目总结。

期望：

- 最终总结包含“native addon / NativeProtect 使用情况”章节。
- 章节记录 addon.node 检测结果、加载方式、实际使用的 addon API、NativeProtect fallback 是否发生、fallback 原因、`document.all` 处理方式以及函数 / 访问器 / 实例对象 toString 保护覆盖情况。
- 如果 addon 不可用，不得只写“使用 NativeProtect”，必须说明已先尝试 addon 以及失败原因。

## 测试 70：正式补环境前必须列出全部可疑加密参数并让用户确认

输入场景：用户提供 cURL，其中 Query 包含 `a_bogus`，Header 包含 `x-s` / `x-t`，Cookie 包含设备 token，但用户只说“分析 sign”。

执行：

```bash
node scripts/parse_curl.js --input request.curl --markdown
```

期望：

- 输出“发现的可疑加密参数”表格。
- 表格覆盖 Query / Header / Body / Cookie 中的可疑字段。
- 明确要求用户确认本次要分析哪些参数。
- 用户未确认前，不进入 `env.js` 编写、Node trace 或补环境阶段。

## 测试 71：最终产物不得复用 cURL 中已有的加密参数值

输入场景：`case/requests/request.curl` 中包含 `a_bogus=SAMPLE_A_BOGUS_VALUE_123456`，最终 `case/result/final.js` 或 `src/request/client.js` 直接写入同一个值。

执行：

```bash
node scripts/check_final_artifact.js --case-dir case --markdown
```

期望：

- 检查失败。
- 问题中明确指出最终项目疑似直接复用了请求样本 / fixture 中的加密参数值。
- 修复要求：将该值作为 fixture expected，而不是写入最终产物；最终入口必须调用补环境后的目标 JS 入口 / signer 重新生成。

## 测试 72：最终产物允许使用生成结果组装请求

输入场景：`case/requests/request.curl` 有样本加密值，但最终项目通过 `signer.generate(requestInput)` 生成参数，并用 CycleTLS / impers / curl-cffi / curl_cffi 等客户端发送请求，没有硬编码样本值。

期望：

- `check_final_artifact.js` 不因样本加密值存在而失败。
- 检查结果显示“未复用 cURL / fixture 中的加密参数样本值：是”。
- 如检测到 signer / 补环境入口调用痕迹，输出中应体现生成痕迹。

## 测试 73：toString / 描述符 / 原型链保护必须从补环境初始化开始

输入场景：

```text
用户进入 Node.js 补环境阶段，目标 JS 暂时还没有显式报出 toString、Object.getOwnPropertyDescriptor 或 instanceof 检测错误。
```

期望：

- 仍然必须先读取 `references/env-native-protection.md`。
- 第一版 env 骨架就必须使用 `Object.defineProperty` / `defineProperties`、getter / setter、构造函数、原型链、函数 toString 保护、访问器 toString 保护和实例对象 toString 保护。
- 不允许先用普通对象赋值 / 普通函数临时跑通，等目标检测失败后再补真实性保护。
- `check_env_realism.js --case-dir case --markdown` 默认检查 addon-first，不需要额外传 `--require-addon-first`。
- 只有用户明确要求不做保护时，才允许豁免，并必须在 notes、阶段输出和最终总结中说明原因。

反例：

```javascript
window.navigator = { userAgent: ua };
localStorage = { getItem() {} };
```

该行为不通过，应改成描述符、访问器、原型链和 native-like helper。

## 测试 74：addon-first 是默认硬性要求，不是检测后才启用

输入场景：最终环境代码使用 `NativeProtect`、`Function.prototype.toString` patch、`markNativeFunction`、getter / setter 或 `document.all`，但没有加载 addon、没有 `options.addon`、也没有 addon-aware helper。

执行：

```bash
node scripts/check_env_realism.js --case-dir case --markdown
```

期望：

- 检查失败，即使未传 `--require-addon-first`。
- 问题中明确指出：addon-first 是默认硬性要求，创建函数、构造函数、getter、setter、实例对象、`document.all` 和 addon 支持的原型链时必须先尝试 addon。
- 修复应先运行 / 记录 `scripts/load_native_addon.js --json`，或在 env 初始化中调用 `loadNativeAddon()`；addon 可用时用 addon API，addon 不可用或调用失败时才使用 `NativeProtect` fallback。
- 如果用户明确要求不使用 addon，可运行 `check_env_realism.js --no-require-addon-first`，但必须在 notes 和最终总结中记录豁免原因。

## 测试 75：项目完成后默认生成最终总结

输入场景：最终项目已有 `case/result/final.js` 和必要 `src/` 模块，fixtures 已通过，但没有 `case/result/最终项目总结.md`。

执行：

```bash
node scripts/check_final_artifact.js --case-dir case --markdown
```

期望：

- 检查失败。
- 问题中明确指出项目完成后必须默认生成 `result/最终项目总结.md`。
- 最终总结必须使用 `write_markdown_utf8.js` 以 UTF-8 写入。
- 总结必须包含 native addon / NativeProtect 使用情况、加密参数生成与样本复用检查、最终交付结构、测试结果和清理结果。
- 只有用户明确要求不生成最终总结时，才可运行 `check_final_artifact.js --no-require-final-summary`，并在阶段输出中记录原因。

## 测试 76：补环境代码必须简洁、模块化并有中文注释

输入场景：最终 `case/result/src/env/env.js` 把 navigator、document、storage、canvas、请求入口全部写在一个文件中，且函数很长、变量名不清晰、几乎没有中文注释。

执行：

```bash
node scripts/check_code_quality.js --case-dir case --markdown
```

期望：

- 检查失败。
- 问题中指出缺少文件头中文职责注释、中文注释过少、单文件或单函数过长、存在压缩堆叠代码或命名不清晰。
- 修复方向是按 `references/code-style.md` 拆分模块，补充中文职责说明、数据来源说明、addon-first 说明和 fallback 原因。

## 测试 77：中文注释不得出现问号或编码乱码

输入场景：最终代码中包含：

```javascript
// 不合格：中文问句注释示例
// 不合格：连续问号乱码示例
// 不合格：替换字符乱码示例
```

执行：

```bash
node scripts/check_code_quality.js --case-dir case --markdown
```

期望：

- 检查失败。
- 中文注释包含半角问号、全角问号、连续问号或替换字符时均视为问题。
- 修复后中文注释必须使用 UTF-8 正常显示，并改成陈述句，例如“userAgent 来自浏览器 fixture”。

## 测试 78：合格补环境代码质量检查通过

输入场景：最终项目按职责拆分为 `src/env/install-env.js`、`src/env/browser-objects/navigator.js`、`src/request/client.js` 等文件，每个手写源码文件顶部有中文职责注释，关键 WebAPI 和 fallback 分支有中文说明，无问号、无乱码、无压缩堆叠代码。

执行：

```bash
node scripts/check_code_quality.js --case-dir case --json
```

期望：

- 退出码为 0。
- `clean` 为 `true`。
- 输出文件摘要，包括代码行数、中文注释数量和最大嵌套层级。
- 后续仍需继续运行 `check_env_realism.js` 和 `check_final_artifact.js`。

## 测试 79：新版 addon API 与旧式调用拦截

输入场景：补环境代码使用新版 `createProtoChains([{ name, constructor, instanceFactoryName }])`、`createNativeFunction(false, ...)`、`createGetter(...)`、`createSetter(...)`、`createUndetectable(callback, handlers)`、`getMimeTypesAndPlugins()`、`setPrivate` / `getPrivate`。

执行：

```bash
node scripts/load_native_addon.js --json
node scripts/check_env_realism.js --case-dir case --markdown
```

期望：

- addon 可用时优先记录实际使用 API。
- `check_env_realism.js` 能识别 `createProtoChains(descriptors)`、`getMimeTypesAndPlugins`、`setPrivate` / `getPrivate` 等 addon-first 证据。
- 如果新代码出现 `createProtoChains('Name', chain)` 或 `createNativeObject('Tag', proto, properties)`，至少输出提醒；若没有明确兼容 / fallback 注释，应视为需要修复。

## 测试 80：通用代码变更记忆机制

输入场景：复杂 case 修改了 `result/src/env/install-env.js` 或 `result/src/signer/index.js`。

执行：

```bash
node scripts/check_change_memory.js --case-dir case --init --markdown
node scripts/check_change_memory.js --case-dir case --changed result/src/env/install-env.js --require-entry --markdown
```

期望：

- `--init` 创建 `case/notes/代码变更记忆.md`，并包含修改前逻辑、问题证据、本次修改、修改理由、已失败尝试、禁止回退、验证命令、验证结果、当前验证范围、遗留风险、当前状态等字段。
- 若指定的 `--changed` 文件未出现在记忆文件中，检查失败。
- 记录中如果出现“正确方案”这种无验证范围的绝对表述，应提醒改为“当前验证通过”或“稳定基线”。

## 测试 81：动态阶段报告生成

输入场景：完成一轮 WebAPI 补齐、指纹回放或 Bug 修复后，需要沉淀本阶段进展。

执行：

```bash
node scripts/write_stage_report.js --case-dir case --stage WebAPI补齐阶段报告 --index 08 --data case/notes/阶段进展.json --markdown
```

期望：

- 生成 `case/阶段报告/08-WebAPI补齐阶段报告.md`。
- 文件名包含中文并按 UTF-8 写入。
- 报告包含当前阶段目标、当前项目进展、本阶段修改文件、本阶段新增 / 修改的 WebAPI、本阶段新增功能、本阶段修复的 Bug、本阶段新增 / 修改的指纹能力、真实性保护变化、本阶段测试内容与结果、清理情况、风险与遗留问题、下一步计划。
- 即使某个栏目暂无内容，也要写明“无”或“未提供”，不能省略章节。

## 测试 82：动态阶段报告能力字段检查

输入场景：`case/阶段报告/08-WebAPI补齐阶段报告.md` 已生成。

执行：

```bash
node scripts/check_stage_reports.js --case-dir case --require-stage WebAPI补齐阶段报告 --require-dynamic-fields --require-capability-report --markdown
```

期望：

- 检查脚本能识别 `08-WebAPI补齐阶段报告.md` 这种“编号 + 中文阶段名”的自定义报告。
- 缺少 WebAPI、功能、Bug、指纹、真实性保护、测试、清理、风险等章节时检查失败。
- 报告中出现连续问号或替换字符乱码时检查失败。
- 中文内容正常时检查通过。

## 测试 83：阶段报告应记录能力增量

输入场景：本阶段新增 `navigator.userAgent`、`canvas.toDataURL` 指纹回放，并修复 `localStorage.getItem` 描述符错误。

期望：

- `本阶段新增 / 修改的 WebAPI` 表格记录 WebAPI、挂载位置、类型、实现方式、addon-first 状态、证据来源和测试结果。
- `本阶段新增功能` 记录功能入口和对最终产物的影响。
- `本阶段修复的 Bug` 记录原因、修复方式、涉及文件、验证结果和防回退记录。
- `本阶段新增 / 修改的指纹能力` 记录指纹类型、API、真实样本来源、回放方式和风险。
- `真实性保护变化` 记录函数 toString、访问器 toString、属性描述符、原型链、实例对象 toString、document.all、addon 使用情况和 fallback 原因。

## 测试 84：阶段报告与临时产物清理联动

输入场景：阶段测试中创建了 trace、临时响应、临时 Hook 或缓存目录。

期望：

- 阶段报告的 `清理情况` 记录已清理项、保留证据和敏感材料处理方式。
- 测试结束后立即删除本阶段临时产物。
- 最终回复前再次运行或说明 `clean_case.js --dry-run` 的结果。
- 不得把 hook、trace、HAR、截图、Profile、缓存或临时响应作为最终交付物保留在 `result/`。

## 测试 85：RuyiTrace 长字段截断风险检测

输入场景：RuyiTrace NDJSON 中某个字段可见长度达到 4000 字符，例如 `args[0]` 是一个超长加密参数、长 token、长 Cookie、请求 body 或 dataURL。

执行：

```bash
node scripts/import_ruyitrace_log.js --input trace.ndjson --case-dir case --truncation-threshold 3900 --markdown
```

期望：

- `notes/ruyitrace-summary.md` 包含 `长字段截断风险` 章节。
- 摘要记录 API、字段路径、可见长度、调用栈、可见值 SHA256。
- 真实长度必须写为 `unknown`，最小长度写为可见长度。
- 不得输出“该加密参数长度为 4000”这类把可见长度误判为真实长度的结论。
- 如果该字段影响签名或请求验证，必须提示通过 HAR / cURL / ruyiPage 网络抓包 / 专用 Hook 分片落盘 / 最终 signer 输出补采完整值。

## 测试 86：RuyiTrace 长字段 JSON 输出不保留完整长字符串

输入场景：NDJSON 示例事件包含长度大于等于阈值的字符串。

执行：

```bash
node scripts/import_ruyitrace_log.js --input trace.ndjson --case-dir case --truncation-threshold 3900 --json
```

期望：

- JSON 输出中的 `summary.truncation.totalSuspectedFields` 大于 0。
- `summary.truncation.examples[]` 包含 `truncationSuspected: true`、`actualLength: "unknown"`、`minLength`、`visibleSha256`。
- `summary.examples[]` 中对应长字符串被替换为元数据对象，不能直接输出完整长字符串诱导模型误读。
- Markdown 与 JSON 都明确说明 RuyiTrace 可见长度不是完整长度。

## 测试 87：不主动分析 JSVMP 源码

输入场景：目标 JS 或调用栈显示存在 JSVMP、虚拟机解释器、opcode、dispatch 表、字节码数组或 VM handler。

期望：

- Skill 不主动阅读、还原、反混淆或解释 JSVMP 源码。
- 仍可围绕补环境目标继续做：请求链路、writer、入口调用关系、环境 API 访问、RuyiTrace 证据、fixtures 对比。
- 如必须进入 JSVMP 算法源码分析，应暂停并说明这超出默认网页端 Node.js 补环境流程，等待用户明确改变任务范围。
- 不得把 JSVMP 反混淆作为默认前置任务，也不得在用户只要求补环境时主动生成 VM 源码分析计划。

## 测试 88：Node 21+ navigator 宿主泄露检测

输入场景：当前 Node 宿主存在 `globalThis.navigator`，且 `navigator.userAgent` 可能为 `Node.js/<major>`。结论必须按 Node 官方文档写明：`navigator` 是 Node v21.0.0 新增，不是 Node 20 官方新增。

执行：

```bash
node scripts/check_node_leakage.js --json
node scripts/check_node_leakage.js --markdown
```

期望：

- 输出 `navigator` 宿主信号，包含 `userAgent`、`platform`、`language`、`hardwareConcurrency`、`locks` 等摘要。
- 如果 `navigator.userAgent` 以 `Node.js/` 开头，必须标记为 Node 宿主特征。
- 目标运行上下文阻断清单包含 `宿主 navigator`、`navigator.userAgent=Node.js/<major>` 和 `navigator.locks`。
- 进入补环境前必须删除 / 隔离宿主 navigator，再安装浏览器式 `Navigator` / `navigator`；如果真实浏览器样本也有 `navigator.locks`，必须按样本补，不得沿用 Node 宿主对象。

## 测试 89：Node Web API 兼容层泄露检测

输入场景：Node 宿主存在 `localStorage`、`sessionStorage`、`performance`、`fetch`、`Headers`、`Request`、`Response`、`WebSocket`、`BroadcastChannel`、`MessageChannel`、`URL`、`URLSearchParams`、`TextEncoder`、`TextDecoder`、Streams、Events、`crypto`、`WebAssembly` 或 `queueMicrotask` 等兼容 Web API。

执行：

```bash
node scripts/check_node_leakage.js --markdown
```

期望：

- 输出宿主 Node Web API 兼容层状态。
- `performance` 宿主信号应检查 `nodeTiming`、`eventLoopUtilization`、`timerify`、`markResourceTiming`。
- 阻断清单必须包含宿主 Storage、Node performance 专属字段、宿主 fetch / undici、宿主 WebSocket、消息通道，以及 `URL/TextEncoder/Streams/Events/crypto/WebAssembly` 等浏览器同名宿主实现。
- 最终 env 不得盲目透传这些宿主对象；必须用浏览器 fixture、RuyiTrace 证据、可控补环境实现或桩函数覆盖。

## 测试 90：run_with_trace 增强 Node 泄露自检

输入场景：目标 JS 主动读取：

```javascript
typeof process;
typeof Buffer;
typeof require;
typeof module;
typeof global;
Function("return typeof process")();
navigator.userAgent;
"nodeTiming" in performance;
"eventLoopUtilization" in performance;
"timerify" in performance;
typeof localStorage;
typeof sessionStorage;
typeof fetch;
```

执行：

```bash
node scripts/run_with_trace.js --target case/js/original/leak.js --entry window.makeSign --fixture case/fixtures/sample.fixture.json --summary case/tmp/missing-env.json --output case/tmp/node-output.json --markdown
```

期望：

- `missing-env.json.nodeLeakage.process/Buffer/require/module/global/functionProcess` 均为 `undefined`。
- `nodeLeakage.navigatorIsNodeUserAgent` 为 `false`。
- `nodeLeakage.navigatorUserAgent` 来自 fixture 或浏览器样本，不能是 `Node.js/<major>`。
- `nodeLeakage.performanceNodeTiming`、`performanceEventLoopUtilization`、`performanceTimerify` 均为 `absent`。
- `localStorage/sessionStorage` 可以存在，但必须是补环境安装的浏览器式 Storage，不得是 Node 宿主 Storage。
- 如果任一 Node 宿主信号存在，应先修隔离层，不得继续补环境。

## 测试 91：env-object-model 不降低真实性基线

输入场景：需要补 `navigator`、`location`、`document`、`Storage`、`crypto`、`performance`、`fetch` 或 `XMLHttpRequest` 等对象模型。

期望：

- `env-object-model.md` 必须明确“最小范围，完整真实性”，不能把最小对象模型解释成先普通对象 / 普通赋值 / 普通函数跑通。
- 进入补环境范围的 WebAPI，必须默认先执行 addon-first、构造函数 / 原型链 / 实例工厂、属性描述符、访问器、`Symbol.toStringTag`、非法构造行为和 native-like 保护。
- `navigator`、`location`、`Storage`、`document.cookie`、`Date` / `performance` 等章节不得写成“检测到再补原型链 / toString / descriptor”的主流程。
- addon 可用时 getter / setter / 方法 / 构造函数 / `document.all` / 原型链必须优先使用 addon API；addon 不可用时才使用 `NativeProtect` / JS fallback，并记录降级原因。
- 原型链不是最终补的附加项，而是每个对象进入补环境范围时的第一步。

## 测试 92：WebAPI addon 覆盖检查

输入场景：最终补环境代码包含以下片段：

```javascript
ctx.Blob = function Blob(parts, options) {};
ctx.screen = { width: 1920, height: 1080 };
ctx.indexedDB = { open() { return {}; } };
ctx.URL.createObjectURL = function createObjectURL() {};
function WGLStub() {}
WGLStub.prototype = { getParameter() { return null; } };
ctx.TextEncoder = globalThis.TextEncoder;
```

执行：

```bash
node scripts/check_webapi_addon_coverage.js --file case/result/src/env/install-env.js --markdown
```

期望：

- 检查失败，退出码为 `1`。
- 报告指出 `Blob` 普通构造函数、`screen` 普通对象、`indexedDB.open` 普通对象字面量方法、`URL.createObjectURL` 普通函数、`prototype = {}` 和 `TextEncoder` 宿主透传。
- 修复建议要求使用 `createProtoChains`、`createNativeFunction`、`createGetter`、`createSetter` 或 addon-first helper。
- 该检查失败时不得进入最终交付；只有用户明确豁免并记录原因时才允许继续。

## 测试 93：真实 case 问题模式应被拦截

输入场景：真实项目生成的 `case/result/src/env/install-env.js` 中存在以下问题模式：

- `ctx.Blob = function(...) { ... }`
- `ctx.FormData = function(...) { ... }`
- `ctx.screen = { ... }`
- `ctx.indexedDB = { open(){ ... } }`
- `ctx.IDBKeyRange = { ... }`
- `ctx.CSS = { supports(){ ... } }`
- `ctx.URL.createObjectURL = function(...) { ... }`
- `CanvasRenderingContext2D.prototype = { ... }`
- `ctx.TextEncoder = globalThis.TextEncoder`
- `ctx.URL = globalThis.URL`
- `ctx.WebAssembly = globalThis.WebAssembly`

执行：

```bash
node scripts/check_webapi_addon_coverage.js --file case/result/src/env/install-env.js --markdown
```

期望：

- 检查失败并列出对应行号、问题类型和修复建议。
- 不应再只依赖 `check_env_realism.js` 的粗粒度检查；交付门禁必须同时运行 `check_code_quality.js`、`check_webapi_addon_coverage.js`、`check_env_realism.js` 和 `check_final_artifact.js`。
- 修复后的代码应按模块拆分，`install-env.js` 只做装配；各 WebAPI 模块内部从第一版实现开始使用 addon-first、descriptor、原型链、构造函数行为和中文注释。

## 测试 94：构造函数错误类型和信息必须来自浏览器采样

输入场景：补环境代码中存在：

```javascript
const Node = native.createNativeConstructor('Node', 0, function Node(isNew) {
  throw new TypeError('Illegal constructor');
});
```

执行：

```bash
node scripts/check_webapi_addon_coverage.js --file case/result/src/env/browser-objects/node.js --markdown
```

期望：

- 检查失败。
- 报告指出泛化 `Illegal constructor` 未证明与浏览器一致。
- 修复要求先采样目标浏览器中 `Node()` 与 `new Node()` 的错误类型、错误构造器、message、`String(error)` 和 stack 首行。
- 修复后应使用 `addon.throwTypeError`、`throwBrowserTypeError`、`throwIllegalConstructor` 或按样本实现对应错误类型；如果不是 `TypeError`，不能强行写成 `TypeError`。

## 测试 95：addon 实例不得用 markObjectType 二次伪装

输入场景：补环境代码中存在：

```javascript
const chains = native.createProtoChains([{ name: 'Blob', instanceFactoryName: 'createBlob' }], addon);
const blob = chains.createBlob();
native.markObjectType(blob, 'Blob');
```

执行：

```bash
node scripts/check_webapi_addon_coverage.js --file case/result/src/env/browser-objects/blob.js --markdown
```

期望：

- 检查失败并指出 `markObjectType` 不是批准 API，语义不明确。
- 修复方向是删除二次标记；addon 构造函数 / `createProtoChains` 实例工厂创建出的对象本身应处理 `Object.prototype.toString`。
- 只有 addon 不可用、创建的是普通 JS fallback 对象时，才允许 `markObjectToString` / `Symbol.toStringTag`，且必须在附近注释、阶段报告和最终总结中记录 fallback 原因。

## 测试 96：单行堆叠代码必须被格式化检查拦截

输入场景：补环境代码中存在：

```javascript
Object.defineProperty(Navigator.prototype, 'userAgent', { get: native.createGetter('userAgent', 0, function(){ return ua; }), enumerable: true, configurable: true });
ctx.indexedDB = { open(){ return {}; }, deleteDatabase(){ return {}; } };
try { Object.defineProperty(obj, 'x', { value: 1, enumerable: true, configurable: true }); } catch {}
```

执行：

```bash
node scripts/check_code_quality.js --file case/result/src/env/install-env.js --markdown
```

期望：

- 检查失败。
- 报告指出属性描述符压在一行、全局 WebAPI 对象 / 方法堆叠、较长单行控制流等问题。
- 修复后应拆成多行具名函数、清晰 descriptor、模块化安装函数，并补充中文注释说明来源和 fallback 原因。
