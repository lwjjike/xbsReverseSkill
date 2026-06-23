---

name: web-js-env-patcher

description: "面向网页端 JavaScript 的 Node.js 补环境 Skill。适用于网页端 JS/Node.js 补环境、env.js/runner.js、缺失环境追踪、Proxy 探测、真实对象固化、toString/native-like、属性描述符/原型链/访问器/实例对象保护、addon-first、新版 addon API、createNativeCollection/getMimeTypesAndPlugins/jsEnv、通用代码变更记忆、中文注释质量、document.all、Canvas/WebGL/WebGPU/Audio/字体/DOM 几何等指纹终端 API 真实值回放、定位 sign/x-s/a_bogus/h5st/token、cURL/HAR 校验、动态 HTML/JS 资源过期识别与运行时刷新、JS bundle/chunk/sourcemap 收集、XHR/fetch Hook 与 source/entry/builder/writer 链路、Node 泄露与静默失败排查（含 Node 21+ navigator、Storage、performance、fetch/WebSocket 等宿主 Web API 泄露阻断）、Cookie 生成链路、Level 1/2/3 分层、补环境框架选择（默认不使用，可选 isolated-vm/vm/jsEnv）、Trace 复杂度评估但不绑定框架、TLS 指纹兼容请求客户端（CycleTLS/impers/curl-cffi/curl_cffi/cffi_curl/cyCronet）、按推进节点生成中文阶段报告并记录 WebAPI/功能/Bug/指纹/测试/清理增量、最终总结、ruyiPage/RuyiTrace、Camoufox/camoufox-reverse-mcp、CloakBrowser 取证。不要用于 App/移动端/小程序/Windows/Native 逆向、纯算重写；默认不主动分析 JSVMP 源码。"
---


# 网页端 JS Node.js 补环境


## 能力边界


使用本 Skill 处理 **网页端浏览器 JavaScript** 在 **Node.js** 中运行所需的前置分析、缺失环境追踪、环境对象补齐与样本验证。目标不是纯算重写算法，而是让目标网页原始 JS 在隔离且可控的 Node.js 运行上下文中运行，并用浏览器真实样本验证输出。


严格边界：


- 只处理网页端 / 浏览器端 JavaScript。

- 只处理 Node.js 补环境相关任务。

- 不处理 App、Android、iOS、小程序、Windows、EXE、DLL、Native、Frida、IDA、JADX、Ghidra 等任务。

- 默认不做纯算重写，除非用户明确改变任务范围。

- **不主动分析 JSVMP 源码**：遇到 JSVMP、虚拟机混淆、opcode、dispatch、字节码解释器等内容时，不主动阅读、还原、反混淆或解释虚拟机源码；本 Skill 只围绕网页端补环境、请求链路、writer、环境调用和样本验证推进。若必须进入 JSVMP 算法源码分析，先暂停并说明这已超出默认补环境流程，等待用户明确改变范围。


## 参考资料读取规则


根据任务需要按需读取以下文件，不要一次性加载无关内容：


- `references/intake-template.md`：当用户信息不完整、询问需要提供什么、或需要复制填写模板时读取。

- `references/workflow.md`：当需要规划或执行补环境前置流程时读取，包括请求校验、参数画像、入口定位、JS 文件收集和前置总结。

- `references/crypto-entry-location.md`：当需要定位加密入口、梳理 `source → entry → builder → writer`、分析 XHR/fetch/拦截器/SDK 链路时读取。

- `references/hook-templates.md`：当需要给用户生成浏览器 Hook、XHR/fetch 断点辅助脚本、或解释如何捕获调用栈时读取。

- `references/browser-acquisition.md`：每次开始新的网页端补环境任务时读取，用于在任何取证动作前让用户选择取证模式；当需要浏览器交互、目标站存在自动化/CDP 检测、用户提到 ruyiPage、RuyiTrace、Camoufox、camoufox-reverse-mcp、CloakBrowser，或出现登录/验证码/MFA 时也读取；其中包含 Camoufox / camoufox-reverse-mcp、CloakBrowser 安装检测、官方启动入口和反自动化/CDP/指纹启动硬约束。

- `references/ruyi-tooling.md`：当用户选择或询问 ruyiPage / RuyiTrace、需要检测安装、安装指导、下载工具、采集或导入 RuyiTrace NDJSON 日志时读取；如果取证模式为 ruyiPage + RuyiTrace，补环境或环境异常排查时也必须读取，用于优先从 NDJSON 日志定位环境依赖。

- `references/camoufox-tooling.md`：当用户选择或询问 Camoufox / camoufox-reverse-mcp、需要检测安装、安装指导、MCP 配置、Camoufox 启动硬约束、网络取证、源码搜索、Hook、请求发起栈、环境对比、引擎层属性访问追踪或 Camoufox 临时产物清理时读取；Camoufox 只用于前置取证，不得进入最终 `result/`。

- `references/env-debug-loop.md`：当前置材料已确认，准备在 Node.js 中运行目标 JS、追踪缺失环境、生成 `env.js` / `runner.js` 骨架时读取。

- `references/runtime-frameworks.md`：每次进入正式 Node.js 补环境阶段前读取，用于提醒用户选择是否使用补环境框架（默认不使用，可选 xbs isolated-vm / vm / jsEnv）；当存在 RuyiTrace / Node trace 日志时也读取，用于基于 Trace 评估项目复杂度、风险点和补环境优先级，但复杂度评估不得自动决定补环境框架选择；用户选择 isolated-vm 时必须使用随包魔改 xbs isolated-vm 并自检 `window.xbs`，用户选择 jsEnv 时必须先确认其项目路径、安装方式和入口文档，不得虚构 API。

- `references/env-object-model.md`：当需要补 `window`、`document`、`navigator`、`location`、`Storage`、`crypto`、`performance`、`fetch`、`XMLHttpRequest` 等对象模型时读取；该文件只决定“补哪些对象”，不降低对象真实性要求，已补对象必须默认遵循 addon-first、构造函数 / 原型链 / 实例工厂、属性描述符、访问器、`Symbol.toStringTag`、非法构造行为和 native-like 保护。

- `references/env-native-protection.md`：每次进入 Node.js 补环境阶段或准备编写 / 修改 env 模块时读取；toString、属性描述符、原型链、访问器、实例对象 toString 与 addon-first 不是等检测到才做，而是默认硬性基线，除非用户明确要求不保护或不使用 addon。
- `references/addon-api.md`：每次进入补环境阶段、使用 `addon.node` 或 xbs native API、修改 `native-protect.js` / addon helper、处理 `createProtoChains` / `createNativeObject` / `createNativeCollection` / `createInterceptor` / `createUndetectable` / `getMimeTypesAndPlugins` / `getPrivate` / `setPrivate` / `hasPrivate` / `deletePrivate` / 注册表管理 API 时读取；新代码优先新版 API，禁止把旧式 `createProtoChains(name, chain)` 或 `createNativeObject(tag, proto, properties)` 写成主路径；`navigator.plugins` / `navigator.mimeTypes` 必须优先使用 `getMimeTypesAndPlugins(config)`。
- `references/xbs-isolated-vm-api.md`：当用户选择 `isolated-vm` 补环境框架、运行 `scripts/check_xbs_isolated_vm.js`、或在 isolated-vm Context 内编写 WebAPI 补环境代码时读取；该模式必须使用随包魔改 xbs isolated-vm，优先通过 `window.xbs` / `globalThis.xbs` 创建构造函数、访问器、集合对象、plugins/mimeTypes、`document.all` 和私有状态，不要桥接旧 `addon.node`。
- `references/code-change-memory.md`：复杂 case、修改 `case/result/` 源码、反复修同一文件 / 函数、或任何关键工程逻辑存在回退风险时读取；默认维护 `case/notes/代码变更记忆.md`，记录改了什么、为什么改、已失败尝试、禁止回退、验证范围和遗留风险。
- `references/code-style.md`：每次生成、重构或交付 `case/result/` 补环境代码前读取；用于约束最终代码简洁、模块化、可读、有中文注释、UTF-8 无乱码、中文注释不出现问号，并要求运行 `scripts/check_code_quality.js` 与 `scripts/check_webapi_addon_coverage.js`。

- `references/fingerprint-value-replay.md`：当目标 JS 访问 Canvas / WebGL / WebGPU / Audio / 字体 / DOM 几何等指纹 API，或 Node.js 第三方库模拟结果与真实浏览器不一致时读取；用于真实浏览器采样、终端 API 值回放、禁止最终流程退回自动化。

- `references/node-leakage-and-silent-failure.md`：当进入 Node.js 运行、输出不一致、怀疑 Node 泄露、SDK init 缺参、时间随机或存储差异时读取；补环境前必须读取，用于阻断 `process/Buffer/require/module/global` 以及 Node 21+ `navigator`（不是 Node 20 官方新增）、Node 22.4+ `localStorage/sessionStorage`、`performance.nodeTiming/eventLoopUtilization/timerify`、宿主 `fetch/WebSocket`、`URL/TextEncoder/Streams/Events/crypto/WebAssembly` 等 Web API 兼容层泄露。

- `references/env-module-levels.md`：当需要把 env 按 Level 1/2/3 分层、选择环境模块、复制 `assets/env-modules/` 模板时读取。

- `references/fixture-validation.md`：当需要用浏览器真实样本验证 Node.js 输出、设计 fixtures、对比多组样本时读取。

- `references/dynamic-resource-freshness.md`：当下载或保存 HTML、JS bundle、动态 chunk、challenge JS、首访页面、403/风控页面或任何可能过期的资源时读取；用于判定资源是否动态、写入 `resource-manifest.json`、区分分析快照与最终运行时刷新资源，并防止最终项目固定使用过期 HTML / JS。

- `references/wasm-worker-postmessage.md`：当发现 Worker、WASM、iframe、postMessage 或异步消息链时读取。

- `references/trust-matrix.md`：当需要标注证据可信度、避免把推断写成事实、处理敏感 Cookie/token 来源时读取。

- `references/cookie-generation-analysis.md`：当 Cookie/token 过期、不需要登录的网站 Cookie 无效、参数位置为 Cookie、或需要分析 Set-Cookie / document.cookie / JS 计算 / Storage 派生 / challenge 生成链路时读取；用于区分登录态 Cookie 与非登录 Cookie，避免默认索要新 Cookie。

- `references/case-patterns.md`：当需要识别 Header/Query/Body/SDK/异步消息等常见补环境模式时读取。

- `references/delivery-templates.md`：只有 fixtures 通过并准备最终交付时读取；最终项目应是规范目录结构，但只能有一个直接执行入口 `final.js` 或 `final.py`，入口运行后完成生成加密参数、Node.js / Python 模拟请求和成功验证；不得交付多余测试文件、临时文件或浏览器自动化代码。

- `references/tls-request-validation.md`：每个需要最终发送真实请求的 case 从前置阶段就读取，用于让用户选择最终请求 TLS 指纹兼容客户端；当用户提到 CycleTLS、impers、curl_cffi、cffi_curl、cyCronet，或准备把请求逻辑写入 `final.js` / `final.py` 时也读取。

- `references/validation.md`：当需要测试 Skill 行为、编写预期提醒、检查边界场景时读取。

- `references/stage-markdown-reports.md`：每个高难度、多轮对话或需要沉淀阶段结论的 case 从前置阶段开始读取；用于默认生成 `case/阶段报告/01-需求信息确认.md` 等中文命名 UTF-8 Markdown 阶段报告，并在每个合适推进节点记录项目进展、修改文件、新增 / 修改 WebAPI、新增功能、Bug 修复、指纹能力、真实性保护、测试结果、清理状态、风险和下一步计划。

- `references/final-project-summary.md`：项目完成后或准备最终交付时必须读取并生成 `result/最终项目总结.md`；最终总结是默认硬性产物，除非用户明确要求不生成。报告文件名必须为中文，必须用 UTF-8 写入，必须包含 native addon / NativeProtect 使用情况；RuyiTrace 章节仅在用户选择 ruyiPage + RuyiTrace 或提供 RuyiTrace NDJSON 时保留。

- `references/cleanup.md`：当创建 case 目录、临时文件、HAR、浏览器 Profile、hook 脚本、trace 或日志时读取。


## 必须执行的主流程

**新 case 第一回复硬门禁**：每次用户给出一个新网站、新接口、新 cURL / HAR、或要求“帮我分析 / 补环境 / 成功请求到数据”时，第一回复必须先输出“信息完整性检查 + 缺失项 + 下一步确认问题”。即使用户已经提供很长的 cURL、Cookie、现象描述、旧补环境文件或明确要求直接成功请求，也不得跳过该门禁。缺少取证模式、最终请求 TLS 指纹兼容客户端、目标参数确认、授权 / 登录状态、或目标参数位置时，只能做离线整理、缺失项提示和阶段报告初始化；不得启动浏览器取证、下载 JS、运行 Hook、写补环境代码、调用 `zhihu.js` / 旧代码、复用 cURL 中的动态参数，或发送真实请求。

第一回复至少包含：

- 已识别信息：目标网站 / 页面 / API / 方法 / cURL 样本 / 已知现象 / 已知旧代码文件。
- 缺失或待确认信息：取证模式、最终请求 TLS 客户端、授权测试范围、是否需要登录、目标加密参数列表、参数位置、是否允许创建 case 与阶段报告。
- 从 cURL / HAR 中初步发现的可疑参数候选：只列候选与位置，不进入正式分析；必须让用户确认本次分析哪些参数。
- 明确声明：用户确认前不会开始取证、补环境、运行旧代码或发送真实请求。

如果用户已经在同一条消息中明确选择了取证模式和最终请求 TLS 客户端，也仍需先输出任务确认摘要并等待用户确认；只有确认后才进入后续阶段。


1. **范围确认**：确认任务属于网页端 JS 的 Node.js 补环境。如果不属于，停止并说明边界。

2. **取证模式先确认**：在开始请求校验、打开页面、抓包、收集 JS、Hook、断点、截图、RuyiTrace 日志采集等任何取证动作前，先让用户选择并确认取证模式：ruyiPage + RuyiTrace（推荐）、仅 ruyiPage、Camoufox + camoufox-reverse-mcp、仅 Camoufox、CloakBrowser、用户手动取证、或 AI 自行决定。用户未选择前不要启动任何浏览器工具。

3. **取证模式贯穿全流程**：把用户确认的模式记录为本 case 的取证模式；之后所有浏览器取证动作都必须使用该模式。若后续发现该模式不可用、工具缺失、需要登录、或必须切换工具，先暂停并征得用户确认，不得自行改用普通 Playwright / Puppeteer / 系统 Firefox。

4. **最终请求 TLS 客户端先确认**：如果本 case 最终需要发送真实请求或交付 `final.js` / `final.py`，在前置阶段就让用户选择 TLS 指纹兼容请求客户端：Node.js CycleTLS、Node.js impers、Python curl_cffi / cffi_curl、Python cyCronet，或明确选择“不发真实请求，只输出本地 sign / 参数”。不要等普通 fetch / requests 失败后才临时考虑 TLS 指纹兼容；最终真实请求必须限制为少量授权验证，不得用于批量访问或绕过登录、验证码、MFA、访问控制。

5. **信息完整性检查**：确认用户至少提供：目标网站或目标页面 URL、目标接口 API URL、请求方法、目标加密参数名、参数位置、至少一份成功请求样本、取证模式、最终请求 TLS 指纹兼容客户端或“不发真实请求”选择。

6. **信息不完整时**：不要开始逆向分析或补环境代码。列出缺失项，并让用户按模板补充。

7. **信息完整时**：先整理任务确认信息，让用户确认后再继续。确认内容必须包含网站 URL、API、方法、参数名、参数位置、请求样本、响应样本、已知 JS 文件、是否需要登录、取证模式、最终请求 TLS 指纹兼容客户端。

8. **阶段报告默认生成**：从需求信息确认阶段开始，默认读取 `references/stage-markdown-reports.md` 并生成中文命名阶段报告；即使信息不完整，也要写入 `case/阶段报告/01-需求信息确认.md`，记录已提供信息、缺失项、阻塞点和下一步需要用户确认的问题。后续不要只按固定编号机械生成，而要在每个合适推进节点结束后立即写入或更新阶段报告，例如取证方案确认、请求样本与可疑参数确认、JS 文件与入口定位、补环境前置分析、补环境实现、测试清理、WebAPI 补齐、指纹回放、Bug 修复、addon 接口更新、通用代码变更记忆更新等。阶段报告内容必须包含当前进展、修改文件、新增 / 修改 WebAPI、新增功能、Bug 修复、指纹能力、真实性保护变化、测试结果、清理状态、风险和下一步计划；除非用户明确要求不生成阶段报告，否则不得只在最后生成一个总结文件。

9. **先做前置验证**：在写 `env.js` 或正式补环境代码之前，先确认请求样本中确实存在目标加密参数，并确认相关 JS 文件可以获取。

10. **可疑加密参数必须先全量列出并让用户确认**：解析 cURL / HAR / 请求样本时，必须列出所有可疑加密参数（Query / Header / Body / Cookie 中的 sign、token、a_bogus、h5st、x-s、x-t、mtgsig、w_rid 等以及其他高熵动态字段），即使用户已经指定了某个参数，也要提示是否还有其他参数需要一并分析。用户未确认“本次要分析哪些参数”前，不得进入正式补环境阶段。

11. **Cookie 过期先分类**：遇到 Cookie/token 无效、过期或请求因 Cookie 失败时，先判断它是否属于登录态 / 账号授权；对不需要登录或与登录无关的设备 Cookie、风控 Cookie、首访 Cookie、JS 生成 Cookie，必须分析生成或刷新链路并纳入 `source → entry → builder → writer`，不要默认要求用户重新提供一份新 Cookie。

12. **加密链路必须四层化**：入口定位输出必须包含 `source → entry → builder → writer`。只找到疑似函数但没确认 writer 时，不视为完成定位。

13. **动态 HTML / JS 不得固定化**：下载到本地的 HTML、JS bundle、动态 chunk、challenge JS、403/风控页面和内联脚本默认先视为分析快照，不得直接作为最终产物的长期依赖。收集每个资源时必须记录 URL、请求时间、响应头、状态码、Set-Cookie、body sha256、Cache-Control / Expires / ETag / Last-Modified、依赖 Cookie / seed / nonce、是否动态、是否允许进入最终产物，并写入 `case/notes/resource-manifest.json`。检测到 `no-store`、`no-cache`、短 TTL、随机 query、每次 hash 变化、页面内 seed / nonce / challenge、会话绑定 Cookie 或 403 生成脚本时，最终入口必须运行时重新获取当前有效 HTML / JS / seed / challenge，再加载当前资源生成参数；旧文件只能用于分析和 fixture 对比。不得把 `case/js/snapshots/` 或动态资源文件固定复制进 `result/` 作为 signer 主路径。

14. **Hook 优先，断点兜底**：授权调试中先用用户已确认的取证模式执行最小 Hook 捕获 fetch/XHR/Header/Query/Body/Cookie 写入，再用对应工具的断点或日志能力确认源码位置和调用栈。

15. **ruyiPage 强校验**：选择 ruyiPage 或 ruyiPage + RuyiTrace 时，必须先验证其使用 ruyiPage 定制 Firefox runtime；只检测到系统 Firefox fallback 时不视为通过，需暂停并询问用户是否已安装定制 Firefox 或提供安装目录。正式取证必须从第一次打开页面开始就使用有头模式、专用临时 Profile、`smart_fingerprint()`、`ctx.apply_emulation(page)`、一致的地理/时区/语言/窗口参数，并在导航后自检 `navigator.webdriver === false`；任一约束失败时不要继续取证。

16. **RuyiTrace 自动捕获优先，未安装不自动降级**：如果用户已选择 ruyiPage + RuyiTrace，先检测 RuyiTrace 安装与 `firefox/` 定制 trace 内核完整性。检测通过且用户未明确要求手动取证时，必须优先运行 `scripts/capture_ruyitrace_log.js` 或等价方式自动启动随 RuyiTrace 提供的 trace Firefox 捕获 NDJSON，并在捕获后导入日志；不要默认等待用户手动点击 RuyiTrace GUI 或手动提供日志。只有自动捕获失败、需要登录 / 验证码 / MFA / 权限交互、目标路径未覆盖、工具 GUI/内核不可控、或用户明确选择手动取证时，才暂停让用户手动协助采集。若检测到 RuyiTrace 未安装或目录不完整，必须暂停并提示用户二选一：安装 / 提供 RuyiTrace 路径，或明确确认降级为“仅 ruyiPage”。用户选择安装时，先输出下载 / 安装计划，等待用户安装并确认 `RuyiTrace.exe` 可打开且 `firefox/` 定制内核完整后再继续；在用户确认前不得继续需要 RuyiTrace NDJSON 的补环境流程。

17. **Camoufox 安装与启动强校验**：如果用户选择 Camoufox 或 Camoufox + camoufox-reverse-mcp，必须在启动任何浏览器前运行 `scripts/check_external_tools.js --require-camoufox --markdown`；选择 MCP 时必须加 `--require-camoufox-mcp`，必要时加 `--python`、`--camoufox-install-dir` 或 `--camoufox-mcp-project-dir`。未检测到 Camoufox Python 包、未执行 `python -m camoufox fetch` 下载浏览器本体、或 MCP 不可导入时暂停：已安装则要求用户提供 Python 解释器 / venv、Camoufox 缓存目录、浏览器路径或 MCP 项目目录；未安装则引导用户确认安装目录和安装方式。正式取证必须从第一次打开目标页开始使用 Camoufox 官方入口或 camoufox-reverse-mcp，默认有头、`humanize:true`，代理场景按授权启用 `geoip:true` / `block_webrtc:true`，不得先用普通 Playwright / Puppeteer / 系统浏览器探测。

18. **CloakBrowser 安装与启动强校验**：如果用户选择 CloakBrowser，必须在启动任何浏览器前运行 `scripts/check_external_tools.js --require-cloakbrowser --markdown`，必要时加 `--cloakbrowser-project-dir`、`--cloakbrowser-binary-path` 或 `--python`。未检测到包或 stealth Chromium 二进制时暂停：已安装则要求用户提供 Python 解释器、Node 项目目录或二进制路径；未安装则引导用户确认 Python / Node.js 安装路线并等待安装。正式取证必须从第一次打开目标页开始使用官方 `cloakbrowser` 包装器，默认 `headless:false`、`humanize:true`，不得先用普通 Playwright / Puppeteer / 系统浏览器探测，也不得直接 `chromium.launch()`。

19. **登录策略**：绝不索要账号、密码、验证码或 MFA 密钥。需要登录时暂停，让用户在所选取证工具或用户手动浏览器中完成登录；只有用户回复 `已经登录成功` 并确认登录后流程后，才继续。

20. **进入补环境阶段前再次确认**：只有在参数、入口、JS 文件、样本、取证模式和最终请求客户端都已确认后，才进入 Node.js 缺失环境追踪和补环境代码阶段。

21. **补环境框架由用户选择**：进入正式 Node.js 补环境前必须读取 `references/runtime-frameworks.md`，提醒用户选择是否使用补环境框架：不使用补环境框架（默认）、`isolated-vm`（随包魔改 xbs isolated-vm）、Node.js 内置 `vm`、`jsEnv`。用户未明确选择时，必须按“不使用补环境框架”继续；不得因为模型推断、项目看起来复杂或 Trace 复杂度高就自动启用框架。用户选择 `isolated-vm` 时先运行 `scripts/check_xbs_isolated_vm.js --markdown` 检测随包魔改二进制、Node ABI、平台和 Context 内 `window.xbs` 17 个 API；平台缺失或 ABI 不兼容时暂停，要求用户提供匹配魔改构建产物或改选，不得自动安装 / 降级 npm 原版 `isolated-vm`，也不得桥接旧 `addon.node`。用户选择 `vm` 时说明它是轻量隔离且弱于 `isolated-vm`；用户选择 `jsEnv` 时先要求用户提供 jsEnv 项目路径、安装方式、入口文件和使用文档，并检测可用性，未确认前不得虚构 jsEnv API 或复制 jsEnv runtime。最终项目只能保留用户选择的 runtime，未选择框架时不得混入 `isolated-vm` / `vm` / `jsEnv` runtime 代码或依赖。

22. **Trace 复杂度评估与框架选择解耦**：如果存在 RuyiTrace NDJSON、Node trace、`missing-env.json` 或其他环境访问日志，进入补环境阶段前或阶段推进时应运行 `scripts/analyze_trace_complexity.js --case-dir case --markdown` 或等价分析，输出 WebAPI 类别、真实性检测、指纹、异步、状态依赖和调用栈分散度，写入阶段报告。复杂度评估只用于补环境范围、风险点和优先级，不得自动决定是否使用 `isolated-vm` / `vm` / `jsEnv`；即使复杂度高也必须以用户框架选择为准。没有 Trace 时记录“无法基于 Trace 评估复杂度”。

23. **普通上下文无法继续时再次征询框架选择**：如果用户默认未使用框架，但后续遇到普通上下文难以解决的 Node 泄露、Realm / intrinsic 差异、`Function("return this")()`、`constructor.constructor`、全局对象污染或多 fixture 互相影响等环境检测问题，必须暂停并再次提醒用户可选择 `isolated-vm`、`vm`、`jsEnv` 或继续不使用框架；不得擅自切换。

24. **RuyiTrace 优先诊断与长字段截断保护**：如果取证模式为 ruyiPage + RuyiTrace，或用户明确说已经 trace 好 / 已提供 NDJSON 日志，进入补环境阶段、编写 `env.js`、补任何 WebAPI，或遇到 ReferenceError、TypeError、输出不一致、指纹对象缺失、静默失败、toString / descriptor / 原型链异常等环境问题时，必须先导入并查看 RuyiTrace NDJSON 与 `notes/ruyitrace-summary.md`，按 `api`、`stack.file / line / col`、时间邻近度和目标参数生成链路定位环境依赖；必须把命中证据写入 `notes/missing-env-priority.md` 后再补环境。RuyiTrace 中达到或接近 4000 字符的字符串字段必须视为疑似截断：只能记录可见长度、最小长度和 hash，真实长度写 `unknown`，不得把 4000 或可见长度当成加密参数真实长度；需要完整值时必须通过 HAR/cURL、ruyiPage 网络抓包、专用 Hook 分片落盘或最终 signer 输出补采。只有日志缺失、不覆盖该逻辑或结论不足时，才使用 `run_with_trace.js` / Proxy trace 作为补充。不得在已有可用 NDJSON 时跳过日志直接盲补 `env.js`。

25. **指纹值回放优先**：遇到 Canvas / WebGL / WebGPU / Audio / 字体 / DOM 几何等浏览器指纹时，不要在 Node.js 中强行复刻渲染管线，也不要因 node-canvas / headless-gl / jsdom 等结果不一致而建议最终改用浏览器自动化；应先用已确认取证模式采集真实浏览器终端 API 返回值、调用参数和调用栈，再在 Node.js 交付环境中按调用特征回放。缺少指纹样本时必须阻塞并提示补采样，不得静默伪造默认值。自动化工具只允许用于前置采样，不能进入最终项目。

26. **Node 泄露先阻断**：正式运行目标 JS 前先确认目标 JS 所在运行上下文不暴露 `process/Buffer/require/module/exports/global/__dirname/__filename/setImmediate/clearImmediate` 等 Node 能力，也不得直接复用宿主 Node Web API 兼容层。按 Node 官方文档，`navigator` 是 Node 21+ 全局对象，不是 Node 20 官方新增；检测到宿主 `navigator` 时必须先删除或隔离，再安装浏览器式 `Navigator`；`navigator.userAgent` 不得为 `Node.js/<major>`，不得暴露 Node 来源的 `navigator.locks`。检测到 Node 22.4+ 宿主 `localStorage/sessionStorage`、宿主 `performance.nodeTiming/eventLoopUtilization/timerify/markResourceTiming`、宿主 `fetch/WebSocket/BroadcastChannel/MessageChannel` 时，必须删除、隔离或用浏览器样本覆盖。`URL/TextEncoder/Streams/Events/crypto/WebAssembly/queueMicrotask` 等浏览器同名 API 如果参与检测，也必须按浏览器样本或可控实现安装，不能盲目透传 Node 宿主构造器。可使用用户已确认的补环境框架、独立 Node 进程或显式隔离全局对象，但不因 Node 泄露阻断自动切换到 `vm` / `isolated-vm`，并执行六项纯计算预检或说明跳过原因。

27. **补环境初始化即 addon-first / xbs native-first**：进入 Node.js 补环境阶段的第一步就必须检测 native 能力：普通 Node runtime 运行 `scripts/load_native_addon.js --json` 或等价加载 / 记录 addon 可用性；如果用户选择 `isolated-vm`，运行 `scripts/check_xbs_isolated_vm.js --markdown` 并在 Context 内记录 `window.xbs` 可用性；不要等检测到 `toString`、属性描述符、原型链或 `document.all` 问题后才考虑 native 能力。创建 native-like 函数、WebAPI 普通方法、构造函数、getter、setter、实例对象、集合对象、`navigator.plugins` / `navigator.mimeTypes`、`document.all`、`createNativeObject` / `createProtoChains` / `createNativeCollection` / `getMimeTypesAndPlugins` 支持的对象时，addon.node 或 xbs native API 可用必须优先使用 native API；`Blob`、`File`、`FormData`、`Event`、`XMLHttpRequest`、`screen`、`indexedDB`、`navigator.plugins`、`navigator.mimeTypes`、`HTMLCollection`、`NodeList`、`PluginArray`、`MimeTypeArray`、`URL.createObjectURL`、`CSS.supports`、Observer、MessageChannel、Canvas/WebGL、Audio、Worker 等进入补环境范围后，也必须从第一版实现就走 native-first；其中 plugins / mimeTypes 必须优先走 `getMimeTypesAndPlugins(config)`，集合对象必须优先走 `createNativeCollection`。只有用户明确要求不使用 native 能力、addon / xbs 缺失、ABI 不兼容或调用失败时，才降级为 `NativeProtect` / JS fallback，并把豁免或降级原因写入 notes、阶段输出和最终总结。

28. **真实性保护默认开启**：补环境阶段采用探测 / 交付双模式，探测模式允许 Proxy 记录访问路径；从第一次编写 env 骨架开始就必须按真实浏览器对象模型固化关键 WebAPI，而不是等 trace 或目标检测命中后才补保护。所有新增或修改的关键 WebAPI 默认使用 `Object.defineProperty` / `defineProperties` 描述符、getter / setter、构造函数、原型链、函数 toString 保护、访问器 toString 保护、实例对象 `Object.prototype.toString` / `Symbol.toStringTag` 保护、`constructor` 和 `instanceof` 链路；构造函数失败时的错误类型、错误构造器、`message` 和直接调用 / `new` 调用差异必须按目标浏览器采样复现，不能统一写泛化 `Illegal constructor`；addon 构造函数 / `createProtoChains` 实例工厂创建出的对象不要再用 `markObjectType` 或 `markObjectToString` 二次伪装对象类型，只有 JS fallback 普通对象才允许 `markObjectToString` 并记录原因；禁止把 `ctx.X = function(){}`、`ctx.X = { method(){} }`、`prototype = { method(){} }`、`Object.assign(ctx, { ...method(){} })`、`ctx.X = globalThis.X` 作为 WebAPI 主路径。只有用户明确要求关闭保护时才可豁免并记录原因。
29. **通用代码变更记忆默认维护**：复杂 case 或修改任何关键源码前必须读取 `references/code-change-memory.md`，并读取 / 创建 `case/notes/代码变更记忆.md`；修改前搜索相关文件名、函数名、参数名和错误关键词，避免写回已失败方案；修改后立即追加记录，写明修改前逻辑、问题证据、本次修改、修改理由、已失败尝试、禁止回退、验证命令、验证结果、当前验证范围、遗留风险和当前状态。不要把“当前报错消失”写成无验证范围的固定结论，只能写成“临时修复”“当前验证通过”“稳定基线”等有范围的状态；交付前必须按本轮变更运行 `scripts/check_change_memory.js --case-dir case --changed <file> --require-entry --markdown` 或说明用户明确豁免。

30. **补环境代码质量默认约束**：生成或修改最终补环境代码前必须先读取 `references/code-style.md`，先规划目录和文件职责，再编码；代码必须简洁、模块化、具名函数清晰、无压缩堆叠、无临时调试痕迹，属性描述符、构造函数 callback、WebAPI 方法安装、`Object.assign` 和较长 `try/catch` 不得压成一行，并在文件头、关键 WebAPI、getter / setter、addon-first、fallback、构造函数错误采样、指纹回放和加密入口处写中文注释。中文注释必须 UTF-8 正常显示，不得包含问号、连续问号或乱码；交付前必须运行 `scripts/check_code_quality.js --case-dir case --markdown`。

31. **按 Level 1/2/3 分层补齐**：先基础运行层，再指纹真实性层，最后目标 SDK 专用层；不要把站点私有逻辑污染通用 env。

32. **结果不一致先排查静默失败**：不报错但参数不一致时，若取证模式为 ruyiPage + RuyiTrace，先回看 NDJSON 中与 Date / performance / random / storage / navigator / canvas / WebGL / Worker / WASM 邻近的调用栈，再按请求样本、init 参数、存储、时间随机、加载顺序、toString、descriptor、原型链、Worker/WASM 顺序排查；若涉及 Canvas / WebGL / WebGPU / Audio / 字体 / DOM 几何，先检查真实浏览器采样值和回放匹配 key。

33. **样本验证优先**：不要以“不报错”为完成标准，必须用 fixtures 对比浏览器真实加密参数或关键输出。浏览器取证也不要以“抓到任意包”为成功标准；目标接口必须有非失败业务响应，跨域接口不能把单独的 `OPTIONS` preflight 当作成功。

34. **最终交付必须是规范项目且只有一个入口**：最终交付可以包含规范目录和必要模块，例如 `src/env/`、`src/signer/`、`src/request/`、`package.json` 或 Python 包模块；但只能有一个直接执行入口，默认 `result/final.js`，用户明确选择 Python 请求验证时可为 `result/final.py`。执行该入口必须自动完成“安装补环境 → 调用目标入口生成加密参数 → 使用已确认的 Node.js / Python TLS 指纹兼容客户端发送模拟请求或按用户选择只输出本地参数 → 输出请求成功/失败结果”。不要把测试脚本、临时 runner、server、bridge、trace、HAR、hook、截图、Profile、缓存、指纹采样 Hook 或临时响应作为最终产物交付。

35. **最终项目禁止浏览器自动化代码**：最终项目内任何交付文件都不得包含 ruyiPage、RuyiTrace 启动、Camoufox、camoufox-reverse-mcp、CloakBrowser、Playwright、Puppeteer、Selenium、CDP、WebDriver、`launch_browser`、`network_capture`、`page.goto`、`browser.launch` 等自动化取证代码。ruyiPage / RuyiTrace / Camoufox / camoufox-reverse-mcp / CloakBrowser 只允许出现在前置取证和日志分析阶段，不能进入最终项目代码。

36. **最终发送请求只能用已确认的 Node.js 或 Python 客户端**：最终验证必须由 `final.js` 入口调用 Node.js CycleTLS / impers 等模块，或由 `final.py` 入口调用 curl_cffi / cffi_curl / cyCronet 等模块发起请求；不得先用普通客户端失败后再临时切换，不得生成加密参数后再通过浏览器自动化点击、导航或抓包验证。

37. **TLS 指纹兼容不是访问控制绕过**：TLS 指纹兼容客户端用于复现浏览器网络栈差异导致的最终验证请求。

38. **交付前自动检查、阶段报告与最终总结**：项目完成后默认先读取 `references/final-project-summary.md` 并使用 `scripts/write_markdown_utf8.js` 生成中文命名 `case/result/最终项目总结.md`；同时确认 `case/阶段报告/` 至少存在 `01-需求信息确认.md`，并根据实际过程与合适推进节点生成其他阶段报告。阶段报告要覆盖本阶段新增 / 修改 WebAPI、功能、Bug 修复、指纹能力、真实性保护、测试与清理等能力增量，交付前可运行 `scripts/check_stage_reports.js --case-dir case --require-dynamic-fields --markdown` 检查。只有用户明确要求不生成最终总结或阶段报告时才可跳过并记录原因。交付前必须运行 `scripts/check_change_memory.js --case-dir case --markdown`、`scripts/check_code_quality.js --case-dir case --markdown`、`scripts/check_webapi_addon_coverage.js --case-dir case --markdown`、存在 Trace 时运行 `scripts/analyze_trace_complexity.js --case-dir case --markdown`、`scripts/check_env_realism.js --case-dir case --markdown`（addon-first 默认强制；使用 RuyiTrace、涉及 `document.all` 或涉及指纹值回放时加对应参数），再运行 `scripts/check_final_artifact.js --case-dir case --markdown` 或等价人工检查，确认代码可读性与中文注释质量、WebAPI addon 覆盖、补环境真实性、addon-first/native fallback 记录、补环境框架选择记录、Trace 复杂度评估与框架选择解耦、通用代码变更记忆、RuyiTrace 证据沉淀、指纹 fixture 与回放实现、中文命名最终总结、阶段报告、最终项目只有一个执行入口、入口可直接运行、整个项目无自动化工具代码、请求由已确认的 Node.js / Python 客户端实现、无多余测试/临时产物。

39. **清理策略**：每个测试命令、脚本验证或阶段结束后立即清理本步骤产生的临时 hook、trace、日志、缓存、失败下载、无用 HAR、临时截图、临时响应、空文件和空目录；不要等项目完全结束后再统一清理。最终回复前必须复查清理结果。登录态 Profile、Cookie、localStorage 按敏感材料处理，删除前必须确认用户意图。

## 辅助脚本


这些脚本只作为稳定性辅助，不能替代人工判断。


### 检查用户信息完整性


```bash

node scripts/check_intake.js --input task.md --markdown

node scripts/check_intake.js --input task.md --json

```


### 检查 cURL / 请求样本


```bash

node scripts/parse_curl.js --input request.curl --param sign --position header --markdown

node scripts/parse_curl.js --input request.curl --json

```


`parse_curl.js` 会输出所有可疑加密参数候选。进入正式补环境前，必须把候选列表交给用户确认；cURL 中已有的加密参数值只能作为 fixture 期望值，不得写入最终产物作为固定值。


### 创建补环境 case 目录


```bash

node scripts/init_env_case.js --case-dir case --target app.js --entry window.makeSign --param sign --api https://example.com/api/search

```


### 检查动态 HTML / JS 资源保鲜

```bash

node scripts/check_dynamic_resources.js --case-dir case --markdown

node scripts/check_dynamic_resources.js --case-dir case --require-runtime-refresh --json

```

用于检查 `case/notes/resource-manifest.json` 是否记录了已保存 HTML、JS bundle、动态 chunk、challenge JS、403/风控页面和内联脚本；若资源 `dynamic: true` 且 `requiredForFinal: true`，必须存在运行时刷新模块，最终入口必须先刷新当前有效 HTML / JS / seed / challenge，再生成加密参数和发送请求。检查失败时不得把旧快照固定交付。


### 加载可选 native addon


```bash

node scripts/load_native_addon.js --json

node scripts/load_native_addon.js --addon <path-to-addon.node> --json

```


本 Skill 随包携带可选 native addon，默认从 `assets/native-addon/<platform>-<arch>/addon.node` 自动加载；“可选”只表示不是跨平台强依赖，不表示可以在补环境时跳过。进入补环境阶段就要尝试加载并记录结果；一旦当前平台可用，创建函数、访问器、`document.all`、原型链等 addon 支持能力时必须优先使用 addon。只有用户明确要求不使用 addon、当前平台缺失、Node ABI 不兼容或 addon 调用失败时，才降级到 `NativeProtect` / JS fallback，或由用户显式提供 `--addon` / `WEB_JS_ENV_PATCHER_ADDON` 覆盖路径。不要在 Skill 文档或脚本中写入本机绝对路径。


### 检测 ruyiPage / RuyiTrace / Camoufox / CloakBrowser / 外部浏览器工具


```bash

node scripts/check_external_tools.js --markdown

node scripts/check_external_tools.js --python python --ruyipage-install-dir <ruyipage-browsers-dir> --markdown

node scripts/check_external_tools.js --python python --ruyipage-browser-path <firefox.exe> --ruyitrace-home <RuyiTrace-dir> --json

node scripts/check_external_tools.js --require-cloakbrowser --cloakbrowser-project-dir <node-project-dir> --markdown

node scripts/check_external_tools.js --python python --require-cloakbrowser --cloakbrowser-binary-path <chromium-or-chrome-path> --json

node scripts/check_external_tools.js --python python --require-camoufox --camoufox-install-dir <camoufox-cache-dir> --markdown

node scripts/check_external_tools.js --python python --require-camoufox --require-camoufox-mcp --camoufox-mcp-project-dir <camoufox-reverse-mcp-dir> --json

```


ruyiPage 只有在“Python 包可用 + 定制 Firefox runtime 验证通过”时才视为可用；普通系统 Firefox fallback 不能作为通过结果。

CloakBrowser 只有在检测到官方 Python / Node.js 包并能确认 stealth Chromium 二进制或用户确认预下载流程后，才可进入正式取证；不得用普通 Playwright / Puppeteer 代替。

Camoufox 只有在检测到 Python 包、官方 `python -m camoufox fetch` 下载的浏览器本体、并确认使用 `Camoufox(...)` / `AsyncCamoufox(...)` 或 camoufox-reverse-mcp 官方入口启动时，才可进入正式取证；不得把普通 Playwright Firefox 当作 Camoufox。


### 安装 ruyiPage 定制 Firefox runtime


只有用户确认未安装并提供安装目录后才执行真实安装；默认先 dry-run 输出计划：


```bash

node scripts/install_ruyipage_runtime.js --python python --install-dir <ruyipage-browsers-dir> --markdown

node scripts/install_ruyipage_runtime.js --python python --install-dir <ruyipage-browsers-dir> --install --markdown

```


### 下载 Ruyi 工具 Release 资产


只有用户确认未安装并提供下载目录后才运行：


```bash

node scripts/download_ruyi_tool.js --tool ruyitrace --dest <download-dir> --dry-run --markdown

node scripts/download_ruyi_tool.js --tool ruyitrace --dest <download-dir> --markdown

node scripts/download_ruyi_tool.js --tool ruyipage-firefox --dest <download-dir> --dry-run --markdown

```


### 自动捕获并导入 RuyiTrace NDJSON 日志


用户选择 ruyiPage + RuyiTrace 且检测到 RuyiTrace 已安装时，优先自动捕获；只有自动捕获失败、需要登录 / 验证 / 权限交互或用户明确选择手动模式时，才让用户手动提供 NDJSON。


```bash

node scripts/capture_ruyitrace_log.js --url <target-page-url> --case-dir case --ruyitrace-home <RuyiTrace-dir> --dry-run --markdown
node scripts/capture_ruyitrace_log.js --url <target-page-url> --case-dir case --ruyitrace-home <RuyiTrace-dir> --duration 90 --import-after --markdown

node scripts/import_ruyitrace_log.js --input <trace.ndjson> --case-dir case --markdown
node scripts/import_ruyitrace_log.js --input <trace.ndjson> --case-dir case --truncation-threshold 3900 --json

```


### 运行目标 JS 并追踪缺失环境


```bash

node scripts/run_with_trace.js --target case/js/original/app.js --entry window.makeSign --fixture case/fixtures/sample.fixture.json --trace case/tmp/env-trace.jsonl --summary case/tmp/missing-env.json --output case/tmp/node-output.json

```


用于探测模式：脚本可使用自身受控上下文记录目标 JS 环境访问，这不等同于用户已选择最终补环境框架；最终是否使用 `isolated-vm` / `vm` / `jsEnv` 仍以用户确认结果为准。关键要求是不把宿主 `process/Buffer/require/module/global` 暴露给目标 JS，也不透传宿主 `navigator`、`performance`、`localStorage/sessionStorage`、`fetch/WebSocket` 等 Node Web API 兼容层，并记录环境访问、函数调用、构造调用和运行错误。


### 分析 trace 并给出补齐优先级


```bash

node scripts/analyze_trace.js --trace case/tmp/env-trace.jsonl --summary case/tmp/missing-env.json --markdown

```


### Trace 复杂度评估

```bash
node scripts/analyze_trace_complexity.js --case-dir case --markdown
node scripts/analyze_trace_complexity.js --trace case/ruyi-trace/logs/trace.ndjson --json
node scripts/analyze_trace_complexity.js --trace case/tmp/env-trace.jsonl --markdown
```

用于在存在 RuyiTrace / Node trace 日志时评估项目复杂度、WebAPI 范围、真实性检测、指纹、异步和状态依赖风险。该评估只用于补环境优先级和阶段报告，不得自动决定是否使用 `isolated-vm`、`vm` 或 `jsEnv`；补环境框架仍以用户选择为准，用户未选择时默认不使用。

### 补环境框架模板

```text
assets/runtime-frameworks/no-framework-runtime.js
assets/runtime-frameworks/vm-runtime.js
assets/runtime-frameworks/isolated-vm-runtime.js
assets/runtime-frameworks/xbs-isolated-vm/<platform>-<arch>/isolated_vm.node  # 仅选择 isolated-vm 时复制
assets/runtime-frameworks/jsenv-runtime.js
assets/runtime-frameworks/runtime-factory.js
```

只有用户明确选择对应补环境框架时才复制对应 runtime。选择 `isolated-vm` 时必须同时复制随包魔改 `xbs-isolated-vm/<platform>-<arch>/isolated_vm.node` 并在 Context 内使用 `window.xbs`。用户未选择时默认不使用补环境框架，最终项目不得混入 `isolated-vm` / `vm` / `jsEnv` runtime 代码或依赖。

### 检查 xbs isolated-vm 可用性

```bash
node scripts/check_xbs_isolated_vm.js --markdown
node scripts/check_xbs_isolated_vm.js --strict --json
```

仅在用户选择 `isolated-vm` 时执行。默认自检遇到 ABI 不匹配会输出中文可解释失败；真实 case 已确认使用 isolated-vm 时，`--strict` 可作为阻断门禁。

### 检查补环境代码可读性与中文注释

```bash
node scripts/check_code_quality.js --case-dir case --markdown
node scripts/check_code_quality.js --dir case/result --json
node scripts/check_code_quality.js --file case/result/src/env/install-env.js --markdown
```

用于交付前检查最终代码是否简洁、模块化、具名函数清晰、无压缩堆叠、无调试断点，且中文注释使用 UTF-8 正常显示、没有连续问号、没有乱码、中文注释不包含问号。检查失败时必须先重构代码和修复注释，再继续最终交付。

### 检查 WebAPI addon 覆盖

```bash
node scripts/check_webapi_addon_coverage.js --case-dir case --markdown
node scripts/check_webapi_addon_coverage.js --dir case/result/src/env --json
node scripts/check_webapi_addon_coverage.js --file case/result/src/env/install-env.js --markdown
```

用于交付前检查补环境代码是否存在普通 WebAPI 函数、普通对象、`prototype = {}`、`Object.assign` 堆叠方法、直接复用宿主 `globalThis.X`、`Buffer.from` 版 `atob/btoa` 等绕过 addon-first 的写法。该检查失败时必须先把对应 WebAPI 迁移为 `createProtoChains`、`createNativeFunction`、`createGetter`、`createSetter`、`createNativeCollection`、`getMimeTypesAndPlugins`、`createInterceptor`、`createUndetectable` 或 addon-first helper；只有 addon 不可用或用户明确豁免时才允许 `NativeProtect` / JS fallback，并记录原因。

### 通用代码变更记忆

```bash
node scripts/check_change_memory.js --case-dir case --init --markdown
node scripts/check_change_memory.js --case-dir case --markdown
node scripts/check_change_memory.js --case-dir case --changed result/src/env/install-env.js --require-entry --markdown
```

用于复杂 case 或关键源码修改的防回退检查。修改关键源码前先读取 `case/notes/代码变更记忆.md`，修改后立即记录修改前逻辑、问题证据、本次修改、修改理由、已失败尝试、禁止回退、验证命令、验证结果、当前验证范围、遗留风险和当前状态。检查失败时必须先补齐记录或说明用户明确豁免。

### 检查补环境真实性与 RuyiTrace 证据


```bash

node scripts/check_env_realism.js --case-dir case --markdown

node scripts/check_env_realism.js --case-dir case --require-document-all --require-ruyitrace --require-fingerprint-fixture --json

```


用于进入最终交付前检查：是否按规则补了属性描述符、原型链、函数 / 访问器 / 实例对象 toString 保护、addon-first/native fallback 记录、`document.all` 不可检测对象、指纹终端 API 值回放；如果 case 使用 RuyiTrace 或用户已提供 NDJSON，还会检查 `notes/ruyitrace-summary.md` 与 `notes/missing-env-priority.md` 是否存在并体现 trace 证据。


### 生成浏览器 Hook 模板


```bash

node scripts/generate_hook_templates.js --param sign --api-pattern /api/ --types fetch,xhr,cookie,storage --out case/hooks/hooks.js

```


### 生成指纹终端 API 采样 Hook


```bash

node scripts/generate_fingerprint_hook.js --types canvas,webgl,dom-geometry --out case/hooks/fingerprint-hook.js

node scripts/generate_fingerprint_hook.js --types canvas,webgl,webgpu,audio,dom-geometry --max-data-url-length 100000

```


该 Hook 只用于前置取证采样，不得放入最终 `result/` 交付目录。


### 检查指纹 fixture 与回放实现


```bash

node scripts/check_fingerprint_fixture.js --case-dir case --require canvas,webgl --markdown

node scripts/check_fingerprint_fixture.js --fixture case/fixtures/fingerprint.fixture.json --env-file case/result/src/env/fingerprint-env.js --json

```


### Node 泄露阻断与纯计算预检


```bash

node scripts/check_node_leakage.js --markdown
node scripts/check_node_leakage.js --json

node scripts/precheck_runtime.js --markdown

```


### 检测最终请求验证的 TLS 指纹兼容客户端


```bash

node scripts/check_tls_clients.js --markdown

node scripts/check_tls_clients.js --python python --json

```


### 对比 fixtures 验证输出


```bash

node scripts/compare_fixture.js --fixture case/fixtures/sample.fixture.json --actual case/tmp/node-output.json --field sign --markdown

```


### 写入 UTF-8 Markdown 报告


```bash

node scripts/write_markdown_utf8.js --input case/tmp/最终项目总结草稿.md --out case/result/最终项目总结.md --require-chinese-name --markdown

node scripts/write_markdown_utf8.js --out case/result/最终项目总结.md --require-chinese-name --markdown < case/tmp/最终项目总结草稿.md

```


用于项目完成后默认生成中文命名 `case/result/最终项目总结.md`，以及其他复盘报告等中文 Markdown 写入，避免 Windows shell 默认编码导致中文变成 “连续问号”。如果脚本检测到草稿疑似已经乱码，会拒绝覆盖并要求重新生成。除非用户明确要求不生成最终总结，否则交付前必须生成该文件。


### 写入阶段性中文 Markdown 报告

```bash
node scripts/write_stage_report.js --case-dir case --stage 需求信息确认 --data case/notes/需求信息.json --markdown
node scripts/write_stage_report.js --case-dir case --stage 请求样本与可疑参数确认 --input case/tmp/可疑参数草稿.md --markdown
node scripts/write_stage_report.js --case-dir case --stage WebAPI补齐阶段报告 --index 08 --data case/notes/阶段进展.json --markdown
node scripts/write_stage_report.js --case-dir case --stage Bug修复与回归测试报告 --index 11 --data case/notes/回归测试.json --markdown
node scripts/check_stage_reports.js --case-dir case --require-stage 需求信息确认 --markdown
node scripts/check_stage_reports.js --case-dir case --require-stage WebAPI补齐阶段报告 --require-dynamic-fields --require-capability-report --markdown
```

用于多轮高难度 case 的阶段性沉淀。阶段报告默认写入 `case/阶段报告/`，文件名必须包含中文，例如 `01-需求信息确认.md`、`03-请求样本与可疑参数确认.md`、`08-WebAPI补齐阶段报告.md`、`11-Bug修复与回归测试报告.md`。信息不完整时也要生成 `01-需求信息确认.md`，记录已提供信息、缺失项和下一步需要用户确认的问题；完成一轮 WebAPI 补齐、指纹回放、Bug 修复、测试清理或工程机制更新后，应生成动态阶段报告，记录本阶段新增 / 修改 WebAPI、新增功能、修复 Bug、指纹能力、真实性保护、测试结果、清理情况、风险和下一步计划。


### 检查最终一体化产物


```bash

node scripts/check_final_artifact.js --case-dir case --markdown

node scripts/check_final_artifact.js --case-dir case --file case/result/final.js --json

```


用于交付前检查：最终项目是否只有一个执行入口、是否不包含 ruyiPage / Playwright / Puppeteer / Selenium / CloakBrowser 等自动化代码、是否由 Node.js / Python 请求客户端发起最终请求、是否混入临时文件或测试文件、是否已默认生成 UTF-8 中文命名最终总结 `result/最终项目总结.md`。若用户明确要求不生成最终总结，检查时才可传入 `--no-require-final-summary`。


### 清理临时 case 目录


```bash

node scripts/clean_case.js --case-dir case --dry-run --markdown

node scripts/clean_case.js --case-dir case --force --markdown

node scripts/clean_case.js --case-dir case --force --include-profiles --markdown

```


必须先使用 `--dry-run` 查看将要清理的内容。每次测试或阶段完成后应立即执行清理；最终回复前再次 dry-run 复查。除非用户明确确认，否则不要使用 `--include-profiles` 删除包含登录态的 Profile。


## 信息完整后的确认模板


```markdown

我已整理出本次 Web JS Node.js 补环境前置任务信息，请确认是否正确：


- 目标网站 URL：

- 目标页面：

- 目标 API：

- 请求方法：

- 请求样本中发现的可疑加密参数：

- 本次确认要分析的加密参数：

- 参数位置：Query / Header / Body / Cookie

- 已提供请求样本：是 / 否

- 已提供响应样本：是 / 否

- 已知 JS 文件：

- 是否需要登录：

- 取证模式：ruyiPage + RuyiTrace / 仅 ruyiPage / Camoufox + camoufox-reverse-mcp / 仅 Camoufox / CloakBrowser / 用户手动取证 / AI 自行决定

- 取证一致性：后续抓包、JS 收集、Hook、断点、截图、日志采集均使用上述模式；如需切换将再次请求确认

- RuyiTrace 状态：已安装并将优先自动捕获 / 未检测到 / 待安装 / 自动捕获失败需手动协助 / 用户明确降级为仅 ruyiPage

- Cookie 过期处理：登录态需用户手动登录或授权样本；非登录 Cookie 将分析生成 / 刷新链路，不默认索要新 Cookie

- 最终请求 TLS 指纹兼容客户端：Node.js CycleTLS / Node.js impers / Node.js curl-cffi / Python curl_cffi / Python cffi_curl / Python cyCronet / 不发真实请求

- 补环境框架选择：不使用补环境框架（默认） / isolated-vm（随包魔改 xbs isolated-vm，需自检 `window.xbs`） / Node.js 内置 vm / jsEnv；如未明确选择，将按“不使用补环境框架”继续；选择 jsEnv 时需提供项目路径、入口和使用文档

- Trace 复杂度评估：已有 RuyiTrace / Node trace / missing-env 等日志时，将基于日志评估复杂度、风险点和补环境优先级；复杂度评估不自动决定补环境框架

- 补环境真实性保护：默认启用 toString / 属性描述符 / 原型链 / 访问器 / 实例对象保护，默认 addon-first；选择 xbs isolated-vm 时以 `window.xbs` native-first 表达；如需关闭必须明确说明

- 通用代码变更记忆：复杂 case 默认维护 `case/notes/代码变更记忆.md`；修改关键源码前读取，修改后记录失败尝试、禁止回退、验证范围和遗留风险

- 阶段报告：默认从 `case/阶段报告/01-需求信息确认.md` 开始，并在每个合适推进节点生成中文命名 Markdown；内容包含项目进展、修改文件、新增 / 修改 WebAPI、新增功能、Bug 修复、指纹能力、测试和清理；如不需要生成必须明确说明

- 最终总结：默认生成 `result/最终项目总结.md`；如不需要生成必须明确说明


确认后我将按以下流程执行：

1. 校验请求样本完整性。

2. 解析请求样本，列出所有可疑加密参数，并由用户确认本次需要分析哪些参数。

3. 确认用户选定的目标加密参数是否存在于请求中。

4. 检测用户选择的 TLS 指纹兼容客户端是否已安装；未安装时先让用户确认安装、改选其他客户端或选择不发真实请求。

5. 如涉及 Cookie/token 无效或过期，先区分登录态与非登录生成型 Cookie；非登录 Cookie 将定位生成链路并纳入补环境。

6. 初步判断参数变化和依赖。

7. 定位请求发起位置与加密入口。

8. 输出 source / entry / builder / writer 四层链路。

9. 收集相关 JS 文件。

10. 检查 JS 文件是否可正常获取。

11. 如用户选择 RuyiTrace，检测已安装后优先自动捕获 NDJSON 日志；捕获成功后立即导入、输出环境访问摘要，并把相关 `api` / `stack.file` / `line` / `col` 作为后续补环境优先依据。只有自动捕获失败、需要登录 / 验证 / 权限交互或用户明确选择手动时，才要求用户手动采集 / 提供 NDJSON。

12. 如果存在 RuyiTrace / Node trace / missing-env 等日志，执行 Trace 复杂度评估并写入阶段报告；复杂度只影响风险和补环境优先级，不决定补环境框架。

13. 在正式补环境前提醒用户选择补环境框架：不使用补环境框架（默认） / isolated-vm（随包魔改 xbs isolated-vm） / Node.js 内置 vm / jsEnv；用户未明确选择时按“不使用补环境框架”继续；选择 isolated-vm 时先自检 `window.xbs` 和 Node ABI；选择 jsEnv 时先确认安装路径、入口文件和使用文档。

14. 执行 Node 泄露阻断、六项纯计算预检，并在进入补环境阶段第一步加载 / 记录 addon.node 或 xbs native 能力；Node 泄露阻断必须覆盖基础 Node 能力和 Node 21+ `navigator`（不是 Node 20 官方新增）、Node 22.4+ Storage、Node `performance`、宿主网络 / 消息 Web API 兼容层，以及 `URL/TextEncoder/Streams/Events/crypto/WebAssembly` 等浏览器同名宿主实现；创建 / 读取 `case/notes/代码变更记忆.md`，按 addon-first、真实性保护基线、通用代码变更记忆和代码可读性规范初始化 env；如果目标涉及 JSVMP，只定位环境依赖、请求链路和 writer，不主动分析 JSVMP 源码。

15. 输出补环境前置分析结论。


请确认以上信息是否正确。确认后我再继续。

```


## 前置阶段应输出的内容


- 请求样本检查结果。

- 请求样本中发现的全部可疑加密参数列表。

- 用户确认要分析的加密参数列表。

- 加密参数画像。

- 加密入口定位记录。

- JS 文件收集结果。

- 缺失信息或阻塞点。

- 已确认取证模式与工具可用性。

- 已确认最终请求 TLS 指纹兼容客户端与可用性。

- 补环境框架选择记录：不使用补环境框架（默认） / isolated-vm / Node.js 内置 vm / jsEnv；选择来源为用户明确选择或未选择按默认不使用；如选择 jsEnv，记录项目路径、入口文件和检测结果。

- Trace 复杂度评估状态：已基于日志评估 / 无可用 Trace，未评估；复杂度评估不决定框架选择。

- 如果选择 ruyiPage + RuyiTrace：RuyiTrace NDJSON 导入状态、摘要位置、长字段截断风险、完整值补采状态和优先环境依赖结论。

- Cookie 过期分类与生成 / 刷新链路判断（若涉及）。

- 临时文件清理检查表。

- 通用代码变更记忆文件初始化状态：`case/notes/代码变更记忆.md` 是否已创建，以及是否存在历史禁止回退项。

- 进入 Node.js 补环境阶段前的用户确认。

- Node 泄露阻断结果：基础 Node 能力变量、宿主 `navigator`、宿主 Storage、Node `performance` 专属字段、宿主网络 / 消息 Web API、`URL/TextEncoder/Streams/Events/crypto/WebAssembly` 等浏览器同名宿主实现是否已删除、隔离或覆盖。

- 阶段报告写入状态：至少 `case/阶段报告/01-需求信息确认.md`，并按实际进度和合适推进节点生成后续中文命名阶段报告，记录当前能力增量、测试和清理结果。


## 补环境阶段应输出的内容


- case 目录与样本文件说明。

- 目标 JS 加载方式与入口函数。

- 探测模式 trace 摘要。

- Node 泄露自检摘要：`process/Buffer/require/module/global` 为 `undefined`，`navigator.userAgent` 非 `Node.js/<major>`，`performance.nodeTiming/eventLoopUtilization/timerify` 不存在，Storage 与网络 API 不复用宿主实现。

- 如果选择 ruyiPage + RuyiTrace：先给出 NDJSON 证据摘要和长字段截断风险，再说明 Node trace / Proxy 只是补充验证。

- Trace 复杂度评估摘要：复杂度等级、主要证据和补环境优先级；明确该评估不自动决定 `isolated-vm` / `vm` / `jsEnv` 使用。

- 缺失环境列表与补齐优先级。

- Proxy 检测风险与迁移到真实对象的计划。

- `toString`、属性描述符、原型链、`document.all` 等真实性处理记录。

- native addon / NativeProtect 使用情况：addon.node 在补环境初始化阶段的检测结果、实际使用 API、NativeProtect fallback、用户豁免或降级原因。

- 通用代码变更记忆记录状态：本轮修改涉及文件、修改理由、已失败尝试、禁止回退、验证命令、验证范围和遗留风险。

- Canvas / WebGL / WebGPU / Audio / 字体 / DOM 几何等指纹终端 API 的真实浏览器采样值、回放匹配规则和缺失样本处理记录。

- fixtures 对比结果。

- 非登录 Cookie 生成 / 刷新逻辑是否已纳入最终入口的记录（若涉及）。

- 临时 trace / 日志清理结果。

- 最终规范项目目录：入口 `result/final.js` 或 `result/final.py`，必要模块位于 `result/src/` 等目录，并默认包含 `result/最终项目总结.md`。

- 阶段报告写入状态：本阶段新增 / 修改 WebAPI、新增功能、Bug 修复、指纹能力、真实性保护、测试内容、清理结果、风险与下一步计划是否已写入中文阶段报告。

- 最终项目检查结果：只有一个执行入口、无多余测试/临时文件、无浏览器自动化代码、补环境代码简洁可读且中文注释 UTF-8 正常、指纹值由 Node.js 终端 API 回放实现、最终请求由已确认的 Node.js / Python TLS 指纹兼容客户端实现，或用户明确选择不发真实请求；最终项目未硬编码或复用 cURL / fixture 中的加密参数样本值，而是通过补环境后的目标 JS 入口 / signer 生成；最终项目只包含用户确认的 runtime，未选择框架时不包含 `isolated-vm` / `vm` / `jsEnv` runtime 代码或依赖，未选择 isolated-vm 时不包含 `xbs-isolated-vm/` 或 `isolated_vm.node`；最终总结已生成且 UTF-8 中文正常，除非用户明确要求不生成。
