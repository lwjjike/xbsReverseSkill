---

name: web-js-env-patcher

description: "面向网页端 JavaScript 的 Node.js 补环境 Skill。适用于网页端 JS/Node.js 补环境、env.js/runner.js、缺失环境追踪、Proxy 探测、真实对象固化、toString/native-like、属性描述符/原型链/访问器/实例对象保护、addon-first、新版 addon API、xbs.dom.createDocument、createNativeCollection/getMimeTypesAndPlugins/jsEnv、通用代码变更记忆、中文注释质量、signer/probe 模块化门禁、document.all、Canvas/WebGL/WebGPU/Audio/字体/DOM 几何等指纹终端 API 真实值回放、长指纹日志 4000/4096 截断防护、WebAPI 环境检测矩阵、iframe/Worker/PerformanceObserver/DOM-CSSOM/task queue/writer 分支行为 diff、定位 sign/x-s/a_bogus/h5st/token、cURL/HAR 校验、动态 HTML/JS 资源过期识别与运行时刷新、验证码接口确认与 web-verify-patcher 交接、JS bundle/chunk/sourcemap 收集、XHR/fetch Hook 与 source/entry/builder/writer 链路、Node 泄露阻断、Cookie 生成链路、补环境框架选择（默认不使用，可选 isolated-vm/vm/jsEnv）、TLS 指纹兼容请求客户端、XHR/fetch live session bridge、curl_cffi 同 session 桥接、浏览器对象私有状态泄露阻断、对象形状审计矩阵、中文阶段报告、最终总结/API回放分类明细、高强度检测通用门禁、native能力缺口、ruyiPage/RuyiTrace、Camoufox/MCP、CloakBrowser 取证、isTrusted 可信输入规避、addon / xbs isolated-vm ABI 恢复。不要用于 App/移动端/小程序/Windows/Native 逆向、纯算重写；默认不主动分析 JSVMP 源码。"
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

- `references/browser-acquisition.md`：每次开始新的网页端补环境任务时读取，用于在任何取证动作前让用户选择取证模式；当需要浏览器交互、目标站存在自动化/CDP/isTrusted 检测、用户提到 ruyiPage、RuyiTrace、Camoufox、camoufox-reverse-mcp、CloakBrowser，或出现登录/验证码/MFA 时也读取；其中包含 Camoufox / camoufox-reverse-mcp、CloakBrowser 安装检测、官方启动入口和反自动化/CDP/指纹启动硬约束。

- `references/fingerprint-baseline-consistency.md`：每个新 case 在任何浏览器取证、指纹采样、RuyiTrace / Camoufox / CloakBrowser 日志采集或生成 `fingerprint.fixture.json` 前读取；用于固化同一 case 的 fingerprint baseline、`baselineId`、profile / seed / 代理 / 语言 / 时区 / WebGL 等一致性，禁止多次随机指纹样本混用。

- `references/trusted-input-and-isTrusted.md`：当取证阶段需要自动点击、鼠标移动、拖拽、键盘输入、滚动、验证码交互，或目标可能检测 `event.isTrusted` 时读取；ruyiPage 必须优先 native BiDi / human actions，必要 JS 事件使用 `ruyi: true`；Camoufox / CloakBrowser 必须使用 humanize / 原生输入路径，不得把普通 `dispatchEvent` 作为主路径。

- `references/ruyi-tooling.md`：当用户选择或询问 ruyiPage / RuyiTrace、需要检测安装、安装指导、下载工具、采集或导入 RuyiTrace NDJSON 日志时读取；如果取证模式为 ruyiPage + RuyiTrace，补环境或环境异常排查时也必须读取，用于优先从 NDJSON 日志定位环境依赖。

- `references/camoufox-tooling.md`：当用户选择或询问 Camoufox / camoufox-reverse-mcp、需要检测安装、安装指导、MCP 配置、Camoufox 启动硬约束、网络取证、源码搜索、Hook、请求发起栈、环境对比、引擎层属性访问追踪或 Camoufox 临时产物清理时读取；Camoufox 只用于前置取证，不得进入最终 `result/`。

- `references/env-debug-loop.md`：当前置材料已确认，准备在 Node.js 中运行目标 JS、追踪缺失环境、生成 `env.js` / `runner.js` 骨架时读取。

- `references/trace-api-coverage.md`：当存在 RuyiTrace NDJSON、Node trace、Hook 环境访问日志、`missing-env.json` 或任何环境访问证据，并准备进入第一版 Node.js 补环境实现、signer probe、WebAPI 补齐或解释阶段报告里的计划外新增 WebAPI 时读取；用于强制把 Trace 命中的 WebAPI 转成 `trace-api-inventory.json`、`env-coverage-matrix.md` 和首轮实现 / 采样 / 暂不挂载 / native 能力缺口决策，禁止 Trace 已命中 API 后续被动遇错再补。
- `references/trace-runtime-conformance.md`：只要存在 Trace 且第一轮 env 已实现、准备运行 signer probe、判断 writer 或发送请求时读取；用于把原始 Trace 转成 `trace-runtime-contract.json`，在强制 no-send 模式运行当前 runtime，生成绑定 `contractHash` / `runtimeSourceHash` 的 Node audit，并逐项比较 realm、receiver、descriptor、brand、prototype、ownKeys、返回值、异常和调用顺序。P0/P1 未闭环时不得继续。

- `references/runtime-frameworks.md`：每次进入正式 Node.js 补环境阶段前读取，用于提醒用户选择是否使用补环境框架（默认不使用，可选 xbs isolated-vm / vm / jsEnv）；当存在 RuyiTrace / Node trace 日志时也读取，用于基于 Trace 评估项目复杂度、风险点和补环境优先级，但复杂度评估不得自动决定补环境框架选择；用户选择 isolated-vm 时必须使用随包魔改 xbs isolated-vm 并自检 `window.xbs` 17 个核心 API、`xbs.dom.createDocument` 和 DOM smoke test，用户选择 jsEnv 时必须先确认其项目路径、安装方式和入口文档，不得虚构 API。

- `references/env-object-model.md`：当需要补 `window`、`document`、`navigator`、`location`、`Storage`、`crypto`、`performance`、`fetch`、`XMLHttpRequest` 等对象模型时读取；该文件只决定“补哪些对象”，不降低对象真实性要求，已补对象必须默认遵循 addon-first、构造函数 / 原型链 / 实例工厂、属性描述符、访问器、`Symbol.toStringTag`、非法构造行为和 native-like 保护。

- `references/env-native-protection.md`：每次进入 Node.js 补环境阶段或准备编写 / 修改 env 模块时读取；toString、属性描述符、原型链、访问器、实例对象 toString 与 addon-first 不是等检测到才做，而是默认硬性基线，除非用户明确要求不保护或不使用 addon。
- `references/object-shape-private-state.md`：每次实现或修改 `window` / `document` / `navigator` / DOM / Event / Storage / XHR / fetch / Response / Headers / Performance 等浏览器可见对象时读取；用于强制私有状态不得以 `_` / `__` 自有属性泄露，必须使用 addon / xbs private API、原生内部槽或模块级 `WeakMap`，并生成 `browser-object-shape-baseline.json`、`node-object-shape-audit.json` 与 `object-shape-audit.md`。
- `references/addon-api.md`：每次进入补环境阶段、使用 `addon.node` 或 xbs native API、修改 `native-protect.js` / addon helper、处理 `createProtoChains` / `createNativeObject` / `createNativeCollection` / `createInterceptor` / `createUndetectable` / `getMimeTypesAndPlugins` / `getPrivate` / `setPrivate` / `hasPrivate` / `deletePrivate` / 注册表管理 API 时读取；新代码优先新版 API，禁止把旧式 `createProtoChains(name, chain)` 或 `createNativeObject(tag, proto, properties)` 写成主路径；`navigator.plugins` / `navigator.mimeTypes` 必须优先使用 `getMimeTypesAndPlugins(config)`。
- `references/node-version-recovery.md`：当 addon.node 或随包魔改 xbs isolated-vm 因 Node ABI 不兼容加载失败时读取；addon 兼容 Node.js v25.8.2，xbs isolated-vm 兼容 Node.js v26.3.1，必须先检测 nvm 并征得用户同意是否安装 / 切换兼容 Node，用户拒绝后才允许 fallback、提供匹配构建产物或改选框架。
- `references/xbs-isolated-vm-api.md`：当用户选择 `isolated-vm` 补环境框架、运行 `scripts/check_xbs_isolated_vm.js`、或在 isolated-vm Context 内编写 WebAPI 补环境代码时读取；该模式必须使用随包魔改 xbs isolated-vm，优先通过 `window.xbs` / `globalThis.xbs` 创建构造函数、访问器、集合对象、plugins/mimeTypes、`document.all`、私有状态，并通过 `xbs.dom.createDocument(options)` 创建基础 DOM；不要桥接旧 `addon.node`。
- `references/native-capability-gap.md`：当纯 JS fallback、当前 addon.node API、当前 xbs isolated-vm / xbs.dom API 都无法可靠表达目标浏览器行为时读取；必须输出 native 能力缺口报告、建议新增 API、最小行为测试用例和通过标准，等待用户扩展 native 能力或明确接受临时 workaround，不得硬凑或伪造成功。
- `references/code-change-memory.md`：复杂 case、修改 `case/result/` 源码、反复修同一文件 / 函数、或任何关键工程逻辑存在回退风险时读取；默认维护 `case/notes/代码变更记忆.md`，记录改了什么、为什么改、已失败尝试、禁止回退、验证范围和遗留风险。
- `references/code-style.md`：每次生成、重构或交付 `case/result/` 补环境代码前读取；用于约束最终代码简洁、模块化、可读、有中文注释、UTF-8 无乱码、中文注释不出现问号，并要求运行 `scripts/check_code_quality.js`、`scripts/check_object_shape_audit.js`、`scripts/check_xhr_fetch_session_bridge.js` 与 `scripts/check_webapi_addon_coverage.js`；`src/signer/`、`runtime_probe.js`、`probe.js`、`runner.js`、`diagnostic.js` 不得承载 navigator / document / canvas / webgl / performance 等 WebAPI 补环境主体，必须拆入 `src/env/` 或 `src/node-runtime/env/`；选择 isolated-vm 时补环境源码也必须按 `navigator.js` / `document.js` / `window.js` / `canvas.js` / `webgl.js` 等真实文件拆分，不得以大段 `String.raw` / `*_SCRIPT` 字符串作为主要交付形态；XHR/fetch 真实请求必须走 live session bridge，浏览器对象私有状态不得以 `_` / `__` 自有属性泄露。

- `references/fingerprint-value-replay.md`：当目标 JS 访问 Canvas / WebGL / WebGPU / Audio / 字体 / DOM 几何等指纹 API，或 Node.js 第三方库模拟结果与真实浏览器不一致时读取；用于真实浏览器采样、终端 API 值回放、长指纹日志 4000/4096 截断防护、禁止最终流程退回自动化；读取前应先按 `references/fingerprint-baseline-consistency.md` 固化本 case 指纹基线。

- `references/high-strength-browser-detection.md`：当目标出现 403 / 429 / challenge / bot block / verify / captcha / 风控页、入口 HTML 注入检测脚本、单 API 请求失败但浏览器入口页成功、或疑似 Cloudflare / Turnstile / Akamai / DataDome / Kasada / Shape / F5 等高强度检测时读取；用于抽象通用环境检测、指纹检测、自动化痕迹、入口页状态链、TLS / Header / Session 一致性和失败排查顺序，不写任何厂商专用绕过逻辑。

- `references/high-intensity-env-diff.md`：当目标疑似 Shape / F5 / Akamai / DataDome / Kasada / reese84 / bx-* 等高强度浏览器完整性检测，或出现异常模式、toString 多通道、DataCloneError、Error stack、属性枚举、原型链 walk、brand check、MutationObserver、userAgentData、window.chrome、canPlayType、mediaSession、Header / Client Hints 一致性、动态风控 JS 多版本回归等问题时读取；用于真实浏览器基线与 Node 补环境行为 diff、高强度检测覆盖矩阵和最终总结记录，但仍不得主动分析 JSVMP 源码。

- `references/webapi-env-detection-matrix.md`：当 Trace、RuyiTrace、阶段报告或失败 diff 出现 iframe / Window realm、Worker / MessagePort、PerformanceObserver / PerformanceTimeline、DOM / CSSOM、EventTarget、structuredClone / DataCloneError、timer / task queue、XHR / fetch / sendBeacon / image / favicon resource timing、对象形状 / 私有状态泄露、reload writer / form writer / final writer 分支差异时读取；用于生成 `browser-env-detection-baseline.json`、`node-env-detection-audit.json` 和 `webapi-env-detection-matrix.md`，把“API 已存在”升级为“浏览器行为一致”，检查不通过时不得继续真实请求验证。

- `references/node-leakage-and-silent-failure.md`：当进入 Node.js 运行、输出不一致、怀疑 Node 泄露、SDK init 缺参、时间随机或存储差异时读取；补环境前必须读取，用于阻断 `process/Buffer/require/module/global` 以及 Node 21+ `navigator`（不是 Node 20 官方新增）、Node 22.4+ `localStorage/sessionStorage`、`performance.nodeTiming/eventLoopUtilization/timerify`、宿主 `fetch/WebSocket`、`URL/TextEncoder/Streams/Events/crypto/WebAssembly` 等 Web API 兼容层泄露。

- `references/env-module-levels.md`：当需要把 env 按 Level 1/2/3 分层、选择环境模块、复制 `assets/env-modules/` 模板时读取。

- `references/fixture-validation.md`：当需要用浏览器真实样本验证 Node.js 输出、设计 fixtures、对比多组样本时读取。

- `references/dynamic-resource-freshness.md`：当下载或保存 HTML、JS bundle、动态 chunk、challenge JS、首访页面、403/风控页面或任何可能过期的资源时读取；用于判定资源是否动态、写入 `resource-manifest.json`、区分分析快照与最终运行时刷新资源，并防止最终项目固定使用过期 HTML / JS。

- `references/captcha-flow-and-verify-handoff.md`：用户信息完整后、任何取证动作前必须读取并确认目标是否为验证码 / 风控验证 / challenge / WAF 接口；当需要从触发到验证采集网络、Hook、RuyiTrace 日志、事件轨迹 fixture，或在补环境生成验证码接口加密参数后交接 `web-verify-patcher` 做识别 / 轨迹 / 验证分析时也读取。

- `references/wasm-worker-postmessage.md`：当发现 Worker、WASM、iframe、postMessage 或异步消息链时读取。

- `references/trust-matrix.md`：当需要标注证据可信度、避免把推断写成事实、处理敏感 Cookie/token 来源时读取。

- `references/cookie-generation-analysis.md`：当 Cookie/token 过期、不需要登录的网站 Cookie 无效、参数位置为 Cookie、或需要分析 Set-Cookie / document.cookie / JS 计算 / Storage 派生 / challenge 生成链路时读取；用于区分登录态 Cookie 与非登录 Cookie，避免默认索要新 Cookie。

- `references/case-patterns.md`：当需要识别 Header/Query/Body/SDK/异步消息等常见补环境模式时读取。

- `references/delivery-templates.md`：只有 fixtures 通过并准备最终交付时读取；最终项目应是规范目录结构，但只能有一个直接执行入口 `final.js` 或 `final.py`，入口运行后完成生成加密参数、Node.js / Python 模拟请求和成功验证；不得交付多余测试文件、临时文件或浏览器自动化代码。

- `references/tls-request-validation.md`：每个需要最终发送真实请求的 case 从前置阶段就读取，用于让用户选择最终请求 TLS 指纹兼容客户端；当用户提到 CycleTLS、impers、curl-cffi-node、curl_cffi、cffi_curl、cyCronet，准备把请求逻辑写入 `final.js` / `final.py`，或需要将 curl_cffi 的 Firefox TLS / JA3 / JA4 / HTTP2 指纹对齐到 ruyiPage / Firefox baseline 时也读取；Firefox baseline 不得只改 UA，必须按 `ja3 + akamai + extra_fp + curl_options` 采样验证，cyCronet 默认只作为 Chromium / Chrome baseline 优先方案。

- `references/session-request-chain.md`：每个需要最终发送真实请求、交付 `final.js` / `final.py`、实现动态资源刷新或 Cookie / challenge 生成链路的 case 都读取；最终请求一律使用 Session 模式，同一 session 贯穿前置请求、动态资源刷新、参数生成前后请求和目标 API，请求结束后销毁 session。
- `references/xhr-fetch-session-bridge.md`：当补环境实现 `XMLHttpRequest`、`fetch`、`Request`、`Response`、`Headers`、`navigator.sendBeacon`，或目标 JS 通过 XHR/fetch 获取动态资源、challenge、Cookie、telemetry、resource timing 时读取；如果最终用户选择 curl_cffi / cffi_curl / cyCronet / CycleTLS / impers 等 TLS 指纹兼容客户端，JS 侧 XHR/fetch 必须通过 live session bridge 复用同一 session 真实发送，fixture/mock 只能标为离线诊断，不能宣称已解决 TLS 指纹。
- `references/xhr-fetch-semantics-audit.md`：每次实现或修改 XHR/fetch/sendBeacon、request/response bridge、reload/navigation 生命周期、Header/body 序列化或 response completion 时读取；真实请求前必须生成浏览器与 Node no-send network transcript，逐条比较 actor、realm、navigation epoch、URL、Header 顺序、body 字节 hash、status/responseURL、事件顺序、resource timing 和旧 realm 任务取消。不得等用户提出“对比请求头/请求体”后才执行。

- `references/validation.md`：当需要测试 Skill 行为、编写预期提醒、检查边界场景时读取。

- `references/stage-markdown-reports.md`：每个高难度、多轮对话或需要沉淀阶段结论的 case 从前置阶段开始读取；用于默认生成 `case/阶段报告/01-需求信息确认.md` 等中文命名 UTF-8 Markdown 阶段报告，并在每个合适推进节点记录项目进展、修改文件、Trace 计划内首轮实现 / 调整的 WebAPI、计划外新增 WebAPI 与原因、新增功能、Bug 修复、指纹能力、真实性保护、测试结果、清理状态、风险和下一步计划。

- `references/final-project-summary.md`：项目完成后或准备最终交付时必须读取并生成 `result/最终项目总结.md`；最终总结是默认硬性产物，除非用户明确要求不生成。报告文件名必须为中文，必须用 UTF-8 写入，必须包含 native addon / NativeProtect 使用情况、按类别分组的“环境与指纹 API 调用回放明细”（例如 navigator、document、window、canvas、webgl 等分类）、“WebAPI 环境检测矩阵”和“高强度环境检测覆盖矩阵”；RuyiTrace 章节仅在用户选择 ruyiPage + RuyiTrace 或提供 RuyiTrace NDJSON 时保留。

- `references/cleanup.md`：当创建 case 目录、临时文件、HAR、浏览器 Profile、hook 脚本、trace 或日志时读取。


## 必须执行的主流程

**新 case 第一回复硬门禁**：每次用户给出一个新网站、新接口、新 cURL / HAR、或要求“帮我分析 / 补环境 / 成功请求到数据”时，第一回复必须先输出“信息完整性检查 + 缺失项 + 下一步确认问题”。即使用户已经提供很长的 cURL、Cookie、现象描述、旧补环境文件或明确要求直接成功请求，也不得跳过该门禁。缺少取证模式、最终请求 TLS 指纹兼容客户端、目标参数确认、授权 / 登录状态、或目标参数位置时，只能做离线整理、缺失项提示和阶段报告初始化；不得启动浏览器取证、下载 JS、运行 Hook、写补环境代码、调用 `zhihu.js` / 旧代码、复用 cURL 中的动态参数，或发送真实请求。

第一回复至少包含：

- 已识别信息：目标网站 / 页面 / API / 方法 / cURL 样本 / 已知现象 / 已知旧代码文件。
- 缺失或待确认信息：取证模式、指纹基线状态、最终请求 TLS 客户端、最终请求 Session 模式、授权测试范围、是否需要登录、是否验证码 / 风控验证接口、目标加密参数列表、参数位置、用户 cURL 样本浏览器族与取证 baseline 浏览器族是否可能冲突、是否允许创建 case 与阶段报告。
- 从 cURL / HAR 中初步发现的可疑参数候选：只列候选与位置，不进入正式分析；必须让用户确认本次分析哪些参数。
- 明确声明：用户确认前不会开始取证、补环境、运行旧代码或发送真实请求。

如果用户已经在同一条消息中明确选择了取证模式和最终请求 TLS 客户端，也仍需先输出任务确认摘要并等待用户确认；只有确认后才进入后续阶段。


1. **范围确认**：确认任务属于网页端 JS 的 Node.js 补环境。如果不属于，停止并说明边界。

2. **取证模式先确认**：在开始请求校验、打开页面、抓包、收集 JS、Hook、断点、截图、RuyiTrace 日志采集等任何取证动作前，先让用户选择并确认取证模式：ruyiPage + RuyiTrace（推荐）、仅 ruyiPage、Camoufox + camoufox-reverse-mcp、仅 Camoufox、CloakBrowser、用户手动取证、或 AI 自行决定。用户未选择前不要启动任何浏览器工具。

3. **取证模式与指纹基线贯穿全流程**：把用户确认的模式记录为本 case 的取证模式；之后所有浏览器取证动作都必须使用该模式。第一次成功取证后必须读取 `references/fingerprint-baseline-consistency.md` 并固化 `case/notes/fingerprint-baseline.json` 与 `baselineId`；后续抓包、JS 收集、Hook、断点、RuyiTrace、Camoufox / CloakBrowser 采样、指纹 fixture 对比都必须复用同一 profile / seed / 代理 / 语言 / 时区 / UA / Client Hints / screen / WebGL 等基线。若后续发现该模式不可用、工具缺失、需要登录、必须切换工具或指纹基线冲突，先暂停并征得用户确认，不得自行改用普通 Playwright / Puppeteer / 系统 Firefox，也不得混用不同随机指纹样本。

4. **最终请求 TLS 客户端与 Session 模式先确认**：如果本 case 最终需要发送真实请求或交付 `final.js` / `final.py`，在前置阶段就让用户选择 TLS 指纹兼容请求客户端：Node.js CycleTLS、Node.js impers、Node.js curl-cffi / curl-cffi-node、Python curl_cffi / cffi_curl、Python cyCronet，或明确选择“不发真实请求，只输出本地 sign / 参数”。同时读取 `references/session-request-chain.md` 并声明最终请求一律使用 Session 模式：即使只有一个目标 API，也要创建 session client，前置请求、动态资源刷新、Cookie / challenge 生成、目标 API 都复用同一 session，并在成功或失败后销毁 session。不要等普通 fetch / requests 失败后才临时考虑 TLS 指纹兼容；最终真实请求必须限制为少量授权验证，不得用于批量访问或绕过登录、验证码、MFA、访问控制。若取证 baseline 是 Firefox 且最终请求选择 curl_cffi / curl-cffi-node，必须在发送真实请求前按 `references/tls-request-validation.md` 采样真实 Firefox TLS / HTTP2 指纹，并使用 `ja3`、`akamai`、`extra_fp`、`curl_options` 和 Header 对齐；只改 `User-Agent` 不视为对齐。若选择 cyCronet 对齐 Firefox，先实测 JA4 / HTTP2 是否可一致，不一致时改选 curl_cffi 或记录用户确认风险。

4a. **用户 cURL 样本与取证 baseline 冲突检测**：解析用户提供的 cURL / HAR 时必须识别样本浏览器族（Chrome / Chromium / Firefox / Safari / Unknown）以及 UA、Client Hints、Header、Cookie、TLS / HTTP2 线索；第一次成功取证并固化 `fingerprint-baseline.json` 后，必须对比取证 baseline 浏览器族。若用户 cURL 是 Chrome / Chromium，而实际取证是 ruyiPage Firefox、用户手动 Firefox 或其他 Firefox baseline，或出现任何 UA / Client Hints / Header / TLS / HTTP2 / Cookie 会话来源冲突，默认以取证样本为最终基线：cURL 只作为目标 URL、方法、请求结构、参数位置、可疑加密参数和业务字段线索，不得把 cURL 中的 Chrome UA、`sec-ch-ua`、Chrome TLS profile、Header 顺序、已生成动态参数或冲突 Cookie 固定进最终补环境与 `final.js` / `final.py`。冲突必须写入 `case/notes/sample-baseline-conflict.md`、阶段报告和最终总结；若用户坚持使用 cURL 的浏览器族，必须暂停并建议改用同浏览器族工具重新取证或让用户提供同浏览器族 HAR / cURL，不得混合两套 baseline。

5. **信息完整性检查**：确认用户至少提供：目标网站或目标页面 URL、目标接口 API URL、请求方法、目标加密参数名、参数位置、至少一份成功请求样本、取证模式、最终请求 TLS 指纹兼容客户端或“不发真实请求”选择，并确认最终请求将使用 Session 模式；在信息完整后确认是否属于验证码 / 风控验证接口。

6. **信息不完整时**：不要开始逆向分析或补环境代码。列出缺失项，并让用户按模板补充。

7. **信息完整时**：先整理任务确认信息，让用户确认后再继续。确认内容必须包含网站 URL、API、方法、参数名、参数位置、请求样本、响应样本、已知 JS 文件、是否需要登录、是否验证码 / 风控验证接口、取证模式、指纹基线状态、用户 cURL 样本浏览器族、取证 baseline 浏览器族、cURL 与取证 baseline 是否冲突及处理策略、最终请求 TLS 指纹兼容客户端和最终请求 Session 模式。

**高强度检测通用门禁**：如果用户材料、响应、页面或取证现象出现 403 / 429 / challenge / bot block / verify / captcha / security check / 风控页、入口 HTML 注入检测脚本、单独 API 请求失败但真实浏览器入口页成功、或疑似 Cloudflare / Turnstile / Akamai / DataDome / Kasada / Shape / F5 等高强度检测，必须先读取 `references/high-strength-browser-detection.md`。此时不得只围绕单个 API cURL 或单个加密参数盲补；必须确认入口 HTML、前置 JS / 检测脚本、Cookie / Storage、动态资源、指纹 baseline、自动化取证风险、TLS / Header / Client Hints / Session 请求链与目标 API 的关系。Cloudflare 等厂商只作为高强度检测样本来源，不写专用绕过、Cookie 伪造、challenge 破解或验证码 token 生成逻辑。

8. **阶段报告默认生成**：从需求信息确认阶段开始，默认读取 `references/stage-markdown-reports.md` 并生成中文命名阶段报告；即使信息不完整，也要写入 `case/阶段报告/01-需求信息确认.md`，记录已提供信息、缺失项、阻塞点和下一步需要用户确认的问题。后续不要只按固定编号机械生成，而要在每个合适推进节点结束后立即写入或更新阶段报告，例如取证方案确认、请求样本与可疑参数确认、JS 文件与入口定位、补环境前置分析、补环境实现、测试清理、WebAPI 补齐、指纹回放、Bug 修复、addon 接口更新、通用代码变更记忆更新等。阶段报告内容必须包含当前进展、修改文件、Trace 计划内首轮实现 / 调整的 WebAPI、计划外新增 WebAPI 与原因、新增功能、Bug 修复、指纹能力、真实性保护变化、测试结果、清理状态、风险和下一步计划；除非用户明确要求不生成阶段报告，否则不得只在最后生成一个总结文件。

9. **验证码接口确认门禁**：用户信息完整并确认任务后，在启动任何浏览器取证、RuyiTrace 捕获、Hook、断点、截图、JS 下载、动态资源保存或接口重放前，必须先读取 `references/captcha-flow-and-verify-handoff.md`，确认目标 API / 参数是否属于验证码 / 风控验证 / challenge / WAF 人机验证接口。若是，必须让用户选择：提供从触发到验证的完整流程由 AI 按已确认取证工具自动取证，或用户自行完成触发到验证流程、AI 只负责提前开启抓包 / Hook / Trace 并等待用户回复“已经完成触发到验证流程”。RuyiTrace 日志也必须覆盖触发、展示、交互、验证提交和 verify 接口返回完整时间段；未覆盖时不得进入补环境。

10. **先做前置验证**：在写 `env.js` 或正式补环境代码之前，先确认请求样本中确实存在目标加密参数，并确认相关 JS 文件可以获取。

11. **可疑加密参数必须先全量列出并让用户确认**：解析 cURL / HAR / 请求样本时，必须列出所有可疑加密参数（Query / Header / Body / Cookie 中的 sign、token、a_bogus、h5st、x-s、x-t、mtgsig、w_rid 等以及其他高熵动态字段），即使用户已经指定了某个参数，也要提示是否还有其他参数需要一并分析。用户未确认“本次要分析哪些参数”前，不得进入正式补环境阶段。

12. **Cookie 过期先分类**：遇到 Cookie/token 无效、过期或请求因 Cookie 失败时，先判断它是否属于登录态 / 账号授权；对不需要登录或与登录无关的设备 Cookie、风控 Cookie、首访 Cookie、JS 生成 Cookie，必须分析生成或刷新链路并纳入 `source → entry → builder → writer`，不要默认要求用户重新提供一份新 Cookie。

13. **加密链路必须四层化**：入口定位输出必须包含 `source → entry → builder → writer`。只找到疑似函数但没确认 writer 时，不视为完成定位。

14. **动态 HTML / JS 不得固定化**：下载到本地的 HTML、JS bundle、动态 chunk、challenge JS、403/风控页面和内联脚本默认先视为分析快照，不得直接作为最终产物的长期依赖。收集每个资源时必须记录 URL、请求时间、响应头、状态码、Set-Cookie、body sha256、Cache-Control / Expires / ETag / Last-Modified、依赖 Cookie / seed / nonce、是否动态、是否允许进入最终产物，并写入 `case/notes/resource-manifest.json`。检测到 `no-store`、`no-cache`、短 TTL、随机 query、每次 hash 变化、页面内 seed / nonce / challenge、会话绑定 Cookie 或 403 生成脚本时，最终入口必须运行时重新获取当前有效 HTML / JS / seed / challenge，再加载当前资源生成参数；旧文件只能用于分析和 fixture 对比。不得把 `case/js/snapshots/` 或动态资源文件固定复制进 `result/` 作为 signer 主路径。

15. **Hook 优先，断点兜底**：授权调试中先用用户已确认的取证模式执行最小 Hook 捕获 fetch/XHR/Header/Query/Body/Cookie 写入，再用对应工具的断点或日志能力确认源码位置和调用栈。

16. **ruyiPage 强校验**：选择 ruyiPage 或 ruyiPage + RuyiTrace 时，必须先验证其使用 ruyiPage 定制 Firefox runtime；只检测到系统 Firefox fallback 时不视为通过，需暂停并询问用户是否已安装定制 Firefox 或提供安装目录。正式取证必须从第一次打开页面开始就使用有头模式、专用临时 Profile、`smart_fingerprint()`、`ctx.apply_emulation(page)`、一致的地理/时区/语言/窗口参数，并在首次成功后固化 fingerprint baseline；后续不得重新随机指纹或更换 profile / seed 混用样本，并在导航后自检 `navigator.webdriver === false`；任一约束失败时不要继续取证。

17. **RuyiTrace 自动捕获优先，未安装不自动降级**：如果用户已选择 ruyiPage + RuyiTrace，先检测 RuyiTrace 安装与 `firefox/` 定制 trace 内核完整性。检测通过且用户未明确要求手动取证时，必须优先运行 `scripts/capture_ruyitrace_log.js` 或等价方式自动启动随 RuyiTrace 提供的 trace Firefox 捕获 NDJSON，并在捕获后导入日志；不要默认等待用户手动点击 RuyiTrace GUI 或手动提供日志。只有自动捕获失败、需要登录 / 验证码 / MFA / 权限交互、目标路径未覆盖、工具 GUI/内核不可控、或用户明确选择手动取证时，才暂停让用户手动协助采集。若检测到 RuyiTrace 未安装或目录不完整，必须暂停并提示用户二选一：安装 / 提供 RuyiTrace 路径，或明确确认降级为“仅 ruyiPage”。用户选择安装时，先输出下载 / 安装计划，等待用户安装并确认 `RuyiTrace.exe` 可打开且 `firefox/` 定制内核完整后再继续；在用户确认前不得继续需要 RuyiTrace NDJSON 的补环境流程。

18. **Camoufox 安装与启动强校验**：如果用户选择 Camoufox 或 Camoufox + camoufox-reverse-mcp，必须在启动任何浏览器前运行 `scripts/check_external_tools.js --require-camoufox --markdown`；选择 MCP 时必须加 `--require-camoufox-mcp`，必要时加 `--python`、`--camoufox-install-dir` 或 `--camoufox-mcp-project-dir`。未检测到 Camoufox Python 包、未执行 `python -m camoufox fetch` 下载浏览器本体、或 MCP 不可导入时暂停：已安装则要求用户提供 Python 解释器 / venv、Camoufox 缓存目录、浏览器路径或 MCP 项目目录；未安装则引导用户确认安装目录和安装方式。正式取证必须从第一次打开目标页开始使用 Camoufox 官方入口或 camoufox-reverse-mcp，默认有头、`humanize:true`，代理场景按授权启用 `geoip:true` / `block_webrtc:true`，首次成功后固化并复用 fingerprint baseline，不得每次启动随机新指纹，不得先用普通 Playwright / Puppeteer / 系统浏览器探测。

19. **CloakBrowser 安装与启动强校验**：如果用户选择 CloakBrowser，必须在启动任何浏览器前运行 `scripts/check_external_tools.js --require-cloakbrowser --markdown`，必要时加 `--cloakbrowser-project-dir`、`--cloakbrowser-binary-path` 或 `--python`。未检测到包或 stealth Chromium 二进制时暂停：已安装则要求用户提供 Python 解释器、Node 项目目录或二进制路径；未安装则引导用户确认 Python / Node.js 安装路线并等待安装。正式取证必须从第一次打开目标页开始使用官方 `cloakbrowser` 包装器，默认 `headless:false`、`humanize:true`，首次成功后固化并复用 fingerprint baseline，不得每次启动随机新指纹，不得先用普通 Playwright / Puppeteer / 系统浏览器探测，也不得直接 `chromium.launch()`。

20. **isTrusted 可信输入硬约束**：如果取证阶段需要自动执行点击、鼠标移动、拖拽、键盘输入、滚动或验证码交互，必须先读取 `references/trusted-input-and-isTrusted.md`。ruyiPage 优先使用 `page.actions` / `human_move` / `human_click` / `drag` 等 native BiDi 或拟人动作；确实需要 JS 构造事件时必须使用 `ruyi: true`。Camoufox / CloakBrowser 必须从启动开始启用 `humanize` 并使用官方原生输入 / humanize 交互方法；不得把普通 `page.evaluate(() => dispatchEvent(...))`、`new MouseEvent(...)`、`new KeyboardEvent(...)` 作为高风控或验证码交互主路径。无法保证可信输入时暂停，让用户选择手动操作、切换工具或明确接受风险。

21. **登录策略**：绝不索要账号、密码、验证码或 MFA 密钥。需要登录时暂停，让用户在所选取证工具或用户手动浏览器中完成登录；只有用户回复 `已经登录成功` 并确认登录后流程后，才继续。

22. **进入补环境阶段前再次确认**：只有在参数、入口、JS 文件、样本、取证模式和最终请求客户端都已确认后，才进入 Node.js 缺失环境追踪和补环境代码阶段。

23. **补环境框架由用户选择**：进入正式 Node.js 补环境前必须读取 `references/runtime-frameworks.md`，提醒用户选择是否使用补环境框架：不使用补环境框架（默认）、`isolated-vm`（随包魔改 xbs isolated-vm）、Node.js 内置 `vm`、`jsEnv`。用户未明确选择时，必须按“不使用补环境框架”继续；不得因为模型推断、项目看起来复杂或 Trace 复杂度高就自动启用框架。用户选择 `isolated-vm` 时先运行 `scripts/check_xbs_isolated_vm.js --markdown` 检测随包魔改二进制、Node ABI、平台、Context 内 `window.xbs` 17 个核心 API、`xbs.dom.createDocument` 与 DOM smoke test；如出现 ABI 不兼容，先读取 `references/node-version-recovery.md` 并提示兼容 Node.js 版本为 v26.3.1，检测 nvm 后让用户选择自动安装 nvm、手动安装 nvm、提供已安装 nvm 路径，或拒绝切换 Node；用户同意后用 nvm 安装 / 切换 v26.3.1 并重新自检。只有用户拒绝切换或切换后仍失败时，才要求用户提供匹配魔改构建产物或改选框架；不得自动安装 / 降级 npm 原版 `isolated-vm`，也不得桥接旧 `addon.node`。用户选择 `vm` 时说明它是轻量隔离且弱于 `isolated-vm`；用户选择 `jsEnv` 时先要求用户提供 jsEnv 项目路径、安装方式、入口文件和使用文档，并检测可用性，未确认前不得虚构 jsEnv API 或复制 jsEnv runtime。最终项目只能保留用户选择的 runtime，未选择框架时不得混入 `isolated-vm` / `vm` / `jsEnv` runtime 代码或依赖。

24. **Trace 复杂度评估与框架选择解耦**：如果存在 RuyiTrace NDJSON、Node trace、`missing-env.json` 或其他环境访问日志，进入补环境阶段前或阶段推进时应运行 `scripts/analyze_trace_complexity.js --case-dir case --markdown` 或等价分析，输出 WebAPI 类别、真实性检测、指纹、异步、状态依赖和调用栈分散度，写入阶段报告。复杂度评估只用于补环境范围、风险点和优先级，不得自动决定是否使用 `isolated-vm` / `vm` / `jsEnv`；即使复杂度高也必须以用户框架选择为准。没有 Trace 时记录“无法基于 Trace 评估复杂度”。

24a. **Trace API 覆盖矩阵门禁**：只要存在 RuyiTrace NDJSON、Node trace、Hook 环境访问日志、`missing-env.json` 或等价环境访问证据，进入第一版 `env` / `node-runtime` / signer probe 前必须读取 `references/trace-api-coverage.md`，并生成 `case/notes/trace-api-inventory.json`、`case/notes/env-coverage-matrix.md` 和更新后的 `case/notes/missing-env-priority.md`。Trace 已命中的 P0/P1 WebAPI 必须在矩阵中明确为 `planned-first-pass` / `implemented-first-pass` / `needs-baseline-sampling` / `deferred-not-mounted` / `native-capability-gap` 等状态；不得保持 `unplanned`，也不得等 ReferenceError、TypeError、writer 不触发或 body 差异出现后再被动新增。Canvas / WebGL / Audio / DOM 几何 / Speech / Storage estimate / Permissions / Plugins / MimeTypes 等真实值类 API 如果 Trace 命中但值缺失、截断或 baseline 不一致，必须先标为 `needs-baseline-sampling` 并同 `baselineId` 采样，不得先挂空壳。运行 signer probe 前执行 `scripts/check_trace_api_coverage.js --case-dir case --markdown`；检查失败时下一阶段只能修复覆盖矩阵、补齐首轮实现、补采样本或进入 native 能力缺口闭环，不能继续新增功能、发送请求或宣称阶段验证通过。后续阶段报告若出现计划外新增 WebAPI，必须说明 `trace-not-covered`、`dynamic-resource-new-branch`、`baseline-mismatch`、`trace-truncated`、`native-gap` 或 `missed-from-trace`；其中 `missed-from-trace` 必须标为流程缺陷并补写矩阵与代码变更记忆。

24b. **Trace 必须形成可执行 runtime closure，不得只做 inventory**：第一轮 env 实现完成后、每次修改任何环境模块后、动态资源刷新后、切换 baseline 后，以及运行 signer probe / writer 判断 / 真实请求前，必须读取 `references/trace-runtime-conformance.md`。先运行 `scripts/build_trace_runtime_contract.js --case-dir case --baseline-id <baselineId> --markdown`，再由当前最终入口支持 `--audit-only` 和 `WEB_JS_ENV_PATCHER_NO_NETWORK=1`，运行 `scripts/run_trace_runtime_audit.js --case-dir case --entry case/result/final.js --markdown`（Python 入口改为 `final.py`），最后运行 `scripts/check_trace_runtime_conformance.js --case-dir case --markdown` 与 `scripts/check_trace_api_coverage.js --case-dir case --require-runtime-closure --markdown`。`implemented-first-pass` 必须对应真实存在且已加载的实现文件；Markdown/JSON 手工填写 `matched`、只保留 Top API、只有 target 名称、缺少返回值/descriptor/prototype/realm/sequence 观测均不算通过。Trace、contract 或 `result/` 源码哈希变化后旧 audit 自动失效。任一 P0/P1 契约缺失、行为不一致或 audit-only 阶段发生真实网络访问时，只能修复环境并重跑闭环，不得继续请求。

25. **普通上下文无法继续时再次征询框架选择**：如果用户默认未使用框架，但后续遇到普通上下文难以解决的 Node 泄露、Realm / intrinsic 差异、`Function("return this")()`、`constructor.constructor`、全局对象污染或多 fixture 互相影响等环境检测问题，必须暂停并再次提醒用户可选择 `isolated-vm`、`vm`、`jsEnv` 或继续不使用框架；不得擅自切换。

26. **RuyiTrace 优先诊断与长字段截断保护**：如果取证模式为 ruyiPage + RuyiTrace，或用户明确说已经 trace 好 / 已提供 NDJSON 日志，进入补环境阶段、编写 `env.js`、补任何 WebAPI，或遇到 ReferenceError、TypeError、输出不一致、指纹对象缺失、静默失败、toString / descriptor / 原型链异常等环境问题时，必须先导入并查看 RuyiTrace NDJSON 与 `notes/ruyitrace-summary.md`，按 `api`、`stack.file / line / col`、时间邻近度和目标参数生成链路定位环境依赖；必须把命中证据写入 `notes/trace-api-inventory.json`、`notes/env-coverage-matrix.md` 和 `notes/missing-env-priority.md` 后再补环境。RuyiTrace 中达到或接近 4000 / 4096 字符的字符串字段必须视为疑似截断：只能记录可见长度、最小长度和 hash，真实长度写 `unknown`，不得把 4000、4096 或可见长度当成加密参数、Canvas / WebGL / WebGPU / Audio 等长指纹值的真实长度；需要完整值时必须通过 HAR/cURL、ruyiPage 网络抓包、专用 Hook 分片落盘或最终 signer 输出补采。只有日志缺失、不覆盖该逻辑或结论不足时，才使用 `run_with_trace.js` / Proxy trace 作为补充。不得在已有可用 NDJSON 时跳过日志直接盲补 `env.js`；后续若新增的 WebAPI 已在 Trace 中命中但未进入覆盖矩阵，必须按 `missed-from-trace` 流程缺陷处理。

27. **指纹基线固定、Trace 优先与指纹值回放**：遇到 Canvas / WebGL / WebGPU / Audio / Speech / Fonts / DOM 几何 / Permissions / Plugins / MimeTypes、`navigator`、`screen`、`window`、`document` 等需要具体真实值的 WebAPI / 指纹 API 时，先读取 `references/fingerprint-baseline-consistency.md` 与 `references/fingerprint-value-replay.md`，确认 `case/notes/fingerprint-baseline.json` 和 `baselineId` 已创建且与当前取证 profile / seed / 代理 / 语言 / 时区 / UA / Client Hints / screen / WebGL 一致；不得混用不同随机指纹样本。指纹值来源优先级是硬性规则：①如果用户选择 / 提供了 RuyiTrace 或其他 trace 日志，优先使用 trace 中未截断、已确认完整的真实浏览器值；②未选择 trace、trace 未覆盖目标路径、trace 字符串 / 序列化值达到或接近 4000 / 4096 字符疑似截断、真实长度为 `unknown`、或日志与当前 `baselineId` 不一致时，必须使用用户当前确认的取证工具（ruyiPage、Camoufox、CloakBrowser、用户手动浏览器等）在同一 baseline 下重新采样完整值；③Canvas `toDataURL`、WebGL `readPixels`、WebGPU adapter 信息、Audio channel data 等长指纹值只要来自会截断的日志字段，就不得直接进入最终 fixture，即使可见片段看起来像完整值；④用户提供的真实浏览器材料可作为证据，但必须记录来源；⑤静态分析、AI 经验、默认值、随机值、mock 值、Node.js / jsdom / node-canvas / headless-gl 结果只能辅助定位，不能作为最终回放值。不要在 Node.js 中强行复刻渲染管线，也不要因模拟库结果不一致而建议最终改用浏览器自动化；应在 Node.js 交付环境中按调用特征回放已采样的真实终端 API 返回值。`fingerprint.fixture.json` 中每个样本必须绑定同一 `baselineId`，记录 `source / capturedBy / valueLength / sha256 / truncated` 等证据；长字符串或二进制结果可用分片存储，但必须记录完整 `valueLength`、分片数量和完整值 hash；缺少样本、来源不明、疑似截断或 baseline 冲突时必须阻塞并提示补采样 / 重采样，不得静默伪造默认值。自动化工具只允许用于前置采样，不能进入最终项目。

28. **Node 泄露先阻断**：正式运行目标 JS 前先确认目标 JS 所在运行上下文不暴露 `process/Buffer/require/module/exports/global/__dirname/__filename/setImmediate/clearImmediate` 等 Node 能力，也不得直接复用宿主 Node Web API 兼容层。按 Node 官方文档，`navigator` 是 Node 21+ 全局对象，不是 Node 20 官方新增；检测到宿主 `navigator` 时必须先删除或隔离，再安装浏览器式 `Navigator`；`navigator.userAgent` 不得为 `Node.js/<major>`，不得暴露 Node 来源的 `navigator.locks`。检测到 Node 22.4+ 宿主 `localStorage/sessionStorage`、宿主 `performance.nodeTiming/eventLoopUtilization/timerify/markResourceTiming`、宿主 `fetch/WebSocket/BroadcastChannel/MessageChannel` 时，必须删除、隔离或用浏览器样本覆盖。`URL/TextEncoder/Streams/Events/crypto/WebAssembly/queueMicrotask` 等浏览器同名 API 如果参与检测，也必须按浏览器样本或可控实现安装，不能盲目透传 Node 宿主构造器。可使用用户已确认的补环境框架、独立 Node 进程或显式隔离全局对象，但不因 Node 泄露阻断自动切换到 `vm` / `isolated-vm`，并执行六项纯计算预检或说明跳过原因。

29. **补环境初始化即 addon-first / xbs native-first**：进入 Node.js 补环境阶段的第一步就必须检测 native 能力：普通 Node runtime 运行 `scripts/load_native_addon.js --json` 或等价加载 / 记录 addon 可用性；如果用户选择 `isolated-vm`，运行 `scripts/check_xbs_isolated_vm.js --markdown` 并在 Context 内记录 `window.xbs` 与 `xbs.dom.createDocument` 可用性；不要等检测到 `toString`、属性描述符、原型链或 `document.all` 问题后才考虑 native 能力。创建 native-like 函数、WebAPI 普通方法、构造函数、getter、setter、实例对象、集合对象、`navigator.plugins` / `navigator.mimeTypes`、`document.all`、`createNativeObject` / `createProtoChains` / `createNativeCollection` / `getMimeTypesAndPlugins` 支持的对象时，addon.node 或 xbs native API 可用必须优先使用 native API；`Blob`、`File`、`FormData`、`Event`、`XMLHttpRequest`、`screen`、`indexedDB`、`navigator.plugins`、`navigator.mimeTypes`、`HTMLCollection`、`NodeList`、`PluginArray`、`MimeTypeArray`、`URL.createObjectURL`、`CSS.supports`、Observer、MessageChannel、Canvas/WebGL、Audio、Worker 等进入补环境范围后，也必须从第一版实现就走 native-first；其中 plugins / mimeTypes 必须优先走 `getMimeTypesAndPlugins(config)`，集合对象必须优先走 `createNativeCollection`。如果 addon.node 出现 ABI 不兼容，不得直接降级；先读取 `references/node-version-recovery.md`，提示 addon 兼容 Node.js v25.8.2，检测 nvm 后让用户选择自动安装 nvm、手动安装 nvm、提供已安装 nvm 路径，或拒绝切换 Node。用户同意后用 nvm 安装 / 切换 v25.8.2 并重新加载 addon；只有用户明确拒绝、当前平台缺失、切换后仍失败、用户明确要求不使用 native 能力或 API 调用失败时，才降级为 `NativeProtect` / JS fallback，并把豁免或降级原因写入 notes、阶段输出和最终总结。

30. **真实性保护默认开启**：补环境阶段采用探测 / 交付双模式，探测模式允许 Proxy 记录访问路径；从第一次编写 env 骨架开始就必须按真实浏览器对象模型固化关键 WebAPI，而不是等 trace 或目标检测命中后才补保护。所有新增或修改的关键 WebAPI 默认使用 `Object.defineProperty` / `defineProperties` 描述符、getter / setter、构造函数、原型链、函数 toString 保护、访问器 toString 保护、实例对象 `Object.prototype.toString` / `Symbol.toStringTag` 保护、`constructor` 和 `instanceof` 链路；构造函数失败时的错误类型、错误构造器、`message` 和直接调用 / `new` 调用差异必须按目标浏览器采样复现，不能统一写泛化 `Illegal constructor`；addon 构造函数 / `createProtoChains` 实例工厂创建出的对象不要再用 `markObjectType` 或 `markObjectToString` 二次伪装对象类型，只有 JS fallback 普通对象才允许 `markObjectToString` 并记录原因；禁止把 `ctx.X = function(){}`、`ctx.X = { method(){} }`、`prototype = { method(){} }`、`Object.assign(ctx, { ...method(){} })`、`ctx.X = globalThis.X` 作为 WebAPI 主路径。只有用户明确要求关闭保护时才可豁免并记录原因。

30a. **浏览器对象私有状态不得泄露**：每次实现或修改浏览器可见对象前必须读取 `references/object-shape-private-state.md`。任何能被目标 JS 拿到的对象、实例、prototype、构造函数、集合对象、XHR / fetch / Response / Headers / Request / Event / DOM 节点 / Storage / Performance 等，都不得通过 `this.__xxx`、`this._xxx`、`Object.defineProperty(obj, "__xxx"...)`、`defineValue(obj, "_xxx", ...)` 或自定义 Symbol 暴露内部状态；即使设为 non-enumerable，也会被 `Object.getOwnPropertyNames`、`Reflect.ownKeys`、descriptor、`in`、prototype walk 检测到。内部状态优先使用 addon / xbs 的 `setPrivate/getPrivate/hasPrivate/deletePrivate`，其次使用模块级 `WeakMap`；JS fallback 必须保证 `Object.keys`、`Object.getOwnPropertyNames`、`Reflect.ownKeys`、`for...in`、descriptor、`hasOwnProperty`、`propertyIsEnumerable` 与真实浏览器 baseline 一致。涉及高强度检测、XHR/fetch、DOM、EventTarget、Storage、Performance、iframe / Worker 时，真实请求前必须生成 `case/fixtures/browser-object-shape-baseline.json`、`case/tmp/node-object-shape-audit.json` 和 `case/notes/object-shape-audit.md`，并运行 `scripts/check_object_shape_audit.js --case-dir case --markdown`；存在 `_` / `__` 泄露或阻断状态时不得继续请求验证或交付。
31. **native 能力缺口闭环**：如果某个浏览器行为无法通过纯 JS fallback 可靠实现，并且当前 addon.node API 与 xbs isolated-vm / xbs.dom API 也无法覆盖，必须先读取 `references/native-capability-gap.md`，不要继续硬凑 JS workaround，也不要假装 addon / xbs 已解决。先区分“当前实现不完整”“已有 native API 用法错误”“确实缺少 native 能力”：前两类继续修补或改为 addon-first / xbs native-first；第三类暂停实现，输出 `case/notes/native-capability-gap.md`，说明阻塞 API / 行为、触发位置、真实浏览器基线、纯 JS / addon / xbs 当前结果、无法解决原因、建议新增 native API、最小行为测试用例和通过标准。测试用例必须能在真实浏览器与目标 native 后端运行，覆盖导致阻塞的关键表达式；只有用户更新 addon.node 或 xbs isolated-vm 并让测试通过后，才能把该点标记为已解决。用户选择临时 workaround 时必须写明“仅当前样本路径临时兼容”；用户拒绝扩展 native 能力且目标参数生成必须依赖该行为时，标记 case 阻塞，不得伪造成功。能力缺口报告、用户选择和测试结果必须写入阶段报告与最终总结。`document.all` / HTMLDDA、内部槽 brand check、跨 Realm 行为、DataCloneError、Error stack、不可检测对象等都适用该闭环。
32. **通用代码变更记忆默认维护**：复杂 case 或修改任何关键源码前必须读取 `references/code-change-memory.md`，并读取 / 创建 `case/notes/代码变更记忆.md`；修改前搜索相关文件名、函数名、参数名和错误关键词，避免写回已失败方案；修改后立即追加记录，写明修改前逻辑、问题证据、本次修改、修改理由、已失败尝试、禁止回退、验证命令、验证结果、当前验证范围、遗留风险和当前状态。不要把“当前报错消失”写成无验证范围的固定结论，只能写成“临时修复”“当前验证通过”“稳定基线”等有范围的状态；交付前必须按本轮变更运行 `scripts/check_change_memory.js --case-dir case --changed <file> --require-entry --markdown` 或说明用户明确豁免。

33. **补环境代码质量默认约束**：生成或修改最终补环境代码前必须先读取 `references/code-style.md`，先规划目录和文件职责，再编码；代码必须简洁、模块化、具名函数清晰、无压缩堆叠、无临时调试痕迹，属性描述符、构造函数 callback、WebAPI 方法安装、`Object.assign` 和较长 `try/catch` 不得压成一行，并在文件头、关键 WebAPI、getter / setter、addon-first、fallback、构造函数错误采样、指纹回放和加密入口处写中文注释。`src/signer/`、`src/request/`、`src/resources/`、`runtime_probe.js`、`probe.js`、`runner.js`、`diagnostic.js` 只允许做编排、入口、请求封装、资源刷新或安全摘要输出；只要文件里实现了 `navigator`、`document`、`window`、`screen`、`Storage`、`XMLHttpRequest`、`fetch`、Canvas、WebGL、Audio、performance、DOM 构造链、事件系统等 WebAPI 主体，就必须拆到 `src/env/` 或 `src/node-runtime/env/` 的真实模块中，不得以“只是 probe / signer / 诊断脚本”为理由豁免。存在 Trace 覆盖矩阵时，P0/P1 首轮实现文件路径必须和 `env-coverage-matrix.md` / `trace-api-inventory.json` 对齐，不能在 signer probe 中临时承载 Trace 已命中的 WebAPI 主体。选择 isolated-vm 时，`navigator`、`document`、`window`、`canvas`、`webgl`、`xhr`、`crypto` 等补环境实现必须是 `src/env/browser-objects/`、`src/env/fingerprint/` 等目录下的真实 `.js` 文件，由 runtime 按文件读取后注入 Context；不得把主要补环境源码写成 `String.raw` 大字符串、`CORE_SCRIPT` / `BROWSER_OBJECTS_SCRIPT` / `*_SCRIPT` 聚合文件，极小 bootstrap 例外需少于 40 行并说明原因。XHR/fetch 实现必须拆入 `src/env/network/` 或 `src/node-runtime/env/network/`，只允许通过 live session bridge 调用请求层；浏览器对象内部状态不得用 `_` / `__` 自有属性承载。中文注释必须 UTF-8 正常显示，不得包含问号、连续问号或乱码；交付前必须运行 `scripts/check_code_quality.js --case-dir case --markdown`、`scripts/check_object_shape_audit.js --case-dir case --markdown` 和 `scripts/check_xhr_fetch_session_bridge.js --case-dir case --markdown`，检查失败时必须先重构并复测，禁止继续请求验证或交付。

34. **按 Level 1/2/3 分层补齐**：先基础运行层，再指纹真实性层，最后目标 SDK 专用层；不要把站点私有逻辑污染通用 env。

35. **结果不一致先排查静默失败、指纹冲突与高强度请求链**：不报错但参数不一致时，若取证模式为 ruyiPage + RuyiTrace，先回看 NDJSON 中与 Date / performance / random / storage / navigator / canvas / WebGL / Worker / WASM 邻近的调用栈，再按请求样本、init 参数、存储、时间随机、加载顺序、toString、descriptor、原型链、Worker/WASM 顺序排查；若涉及 Canvas / WebGL / WebGPU / Audio / Speech / Fonts / DOM 几何 / Permissions / Plugins / MimeTypes，先检查 `baselineId`、真实浏览器采样值和回放匹配 key，确认没有混用不同 UA / 语言 / 时区 / WebGL / screen / profile 的样本。高强度检测下的结果不一致还必须按 `references/high-strength-browser-detection.md` 先排查是否拿到风控页、是否缺少入口 HTML / 前置 JS / Cookie / Storage 链路、TLS / Header / Client Hints / 代理 / Session 是否与取证 baseline 一致、请求顺序和时间间隔是否完整，最后才判断目标 JS 补环境缺失。

   **高强度环境行为 diff**：如果目标疑似 Shape / F5 / Akamai / DataDome / Kasada / reese84 / bx-* 等浏览器完整性检测，或出现异常模式、toString 多通道、DataCloneError、Error stack、属性枚举、原型链 walk、brand check、MutationObserver、userAgentData、window.chrome、canPlayType、mediaSession、Client Hints 一致性等检测迹象，必须先读取 `references/high-strength-browser-detection.md`，再读取 `references/high-intensity-env-diff.md`。先用真实浏览器采样行为基线，再在 Node 补环境中运行同类 probe 做 diff，输出 `case/notes/high-intensity-env-diff.md` 和最终总结覆盖矩阵；不得只因当前 sign 生成成功就跳过这些差异，也不得主动进入 JSVMP opcode / 字节码源码分析。

   **WebAPI 环境检测矩阵**：如果 trace、阶段报告或失败 diff 出现 iframe / Window realm、Worker / MessagePort、PerformanceObserver / PerformanceTimeline、DOM / CSSOM、EventTarget、structuredClone / DataCloneError、timer / task queue、XHR / fetch / sendBeacon / image / favicon resource timing、对象形状 / 私有状态泄露、reload writer / form writer / final writer 分支差异，必须读取 `references/webapi-env-detection-matrix.md`。在真实请求、长跑验证或 final writer 判定前生成 `case/fixtures/browser-env-detection-baseline.json`、`case/tmp/node-env-detection-audit.json` 和 `case/notes/webapi-env-detection-matrix.md`；矩阵中存在 `needs-browser-baseline`、`needs-node-audit`、`mismatch`、`native-capability-gap` 或 `unknown` 时，不得继续真实请求验证。若后续补的 WebAPI 是因为该矩阵遗漏已触发行为，按 `missed-from-webapi-env-matrix` 流程缺陷记录。

36. **样本验证优先**：不要以“不报错”为完成标准，必须用 fixtures 对比浏览器真实加密参数或关键输出。浏览器取证也不要以“抓到任意包”为成功标准；目标接口必须有非失败业务响应，跨域接口不能把单独的 `OPTIONS` preflight 当作成功。

37. **最终交付必须是规范项目且只有一个入口**：最终交付可以包含规范目录和必要模块，例如 `src/env/`、`src/signer/`、`src/request/`、`package.json` 或 Python 包模块；但只能有一个直接执行入口，默认 `result/final.js`，用户明确选择 Python 请求验证时可为 `result/final.py`。执行该入口必须自动完成“安装补环境 → 创建已确认 TLS 客户端的 session → 调用目标入口生成加密参数 → 在同一 session 中发送模拟请求或按用户选择只输出本地参数 → 输出请求成功/失败结果 → finally 销毁 session”。XHR/fetch live session bridge 只能作为该唯一入口内部受控 IPC / adapter 模块存在，不得成为另一个手动运行入口或常驻本地服务。不要把测试脚本、临时 runner、临时 server、临时 bridge、trace、HAR、hook、截图、Profile、缓存、指纹采样 Hook 或临时响应作为最终产物交付。

38. **最终项目禁止浏览器自动化代码**：最终项目内任何交付文件都不得包含 ruyiPage、RuyiTrace 启动、Camoufox、camoufox-reverse-mcp、CloakBrowser、Playwright、Puppeteer、Selenium、CDP、WebDriver、`launch_browser`、`network_capture`、`page.goto`、`browser.launch` 等自动化取证代码。ruyiPage / RuyiTrace / Camoufox / camoufox-reverse-mcp / CloakBrowser 只允许出现在前置取证和日志分析阶段，不能进入最终项目代码。

39. **最终发送请求只能用已确认的 Node.js 或 Python Session 客户端**：最终验证必须由 `final.js` 入口调用 Node.js CycleTLS / impers / curl-cffi-node 等 TLS 指纹兼容模块创建 session client，或由 `final.py` 入口调用 curl_cffi / cffi_curl / cyCronet 等模块创建 session client；即使只有一个请求也必须使用 session，动态资源刷新、Cookie / challenge 生成链路和目标 API 复用同一 Cookie jar / Header / UA / Client Hints / TLS 指纹 / 代理 / 指纹基线，并在成功或失败后销毁 session。不得先用普通客户端失败后再临时切换，不得生成加密参数后再通过浏览器自动化点击、导航或抓包验证。

39a. **XHR/fetch 必须接入同一 live session bridge**：当目标 JS 会调用 `XMLHttpRequest`、`fetch`、`Request`、`Response`、`Headers`、`navigator.sendBeacon`，或这些网络 API 影响 Cookie、challenge、动态资源、telemetry、resource timing、writer 分支时，必须读取 `references/xhr-fetch-session-bridge.md`。如果用户选择发送真实请求，JS 侧 XHR/fetch 不得只返回 fixture / 默认 200 / mock response，也不得直接使用 Node 宿主 `fetch`、`http`、`https`、`axios`、`undici` 绕过已确认 TLS 客户端；必须通过 live session bridge 交给同一个 CycleTLS / impers / curl-cffi-node / curl_cffi / cffi_curl / cyCronet session 发送，并把响应头、状态、body、Set-Cookie、Cookie jar、readyState / Promise / event 顺序同步回 JS 环境。若最终入口是 `final.py` 且客户端为 Python `curl_cffi`，则 `final.py` 必须持有唯一 session，并通过 stdio / IPC / 嵌入式 bridge 处理 Node JS runtime 发来的 XHR/fetch 请求；Node 侧只实现浏览器 API 语义和桥接协议，不自行发目标网络请求。离线 fixture 模式只能标注为 `offline-fixture` / `diagnostic-only`，不得写成 TLS 指纹已解决或真实请求已发送；交付前必须运行 `scripts/check_xhr_fetch_session_bridge.js --case-dir case --require-live --markdown`，或在用户明确选择“不发真实请求”时记录豁免。

39b. **XHR/fetch 必须先通过 no-send 请求语义审计**：每次实现或修改 XHR/fetch/sendBeacon、bridge envelope、Header/body 处理、response completion、redirect/CORS/abort/timeout、reload/navigation 或 resource timing 时，必须读取 `references/xhr-fetch-semantics-audit.md`。从同一成功浏览器 baseline 生成 `case/fixtures/browser-network-transcript.ndjson`，让当前 Node runtime 在 `no-send` 模式生成 `case/tmp/node-network-transcript.ndjson`，再运行 `scripts/check_xhr_fetch_semantics.js --case-dir case --require --require-no-send --out case/tmp/xhr-fetch-semantics-audit.json --markdown`。必须逐条一致比较请求 actor、realm、navigation epoch、method、URL、Header 有序列表、body byte length/SHA256、Cookie/referrer/credentials、status/statusText/responseURL、响应头可见性、readyState/event/Promise 顺序和旧 realm pending task 清理。`status=0` 时不得回填 request URL；document navigation/reload 不得进入 XHR completion；真实浏览器没有的 XHR/fetch 请求 Node 不得多发。代码里出现 `curl_cffi` / `IPC` / `live-session-bridge` 只算线索，只有运行时 bridge audit、同一 session 证明和机器生成的语义 diff 同时通过才允许真实请求。

40. **TLS 指纹兼容不是访问控制绕过**：TLS 指纹兼容客户端用于复现浏览器网络栈差异导致的最终验证请求。

41. **交付前自动检查、阶段报告与最终总结**：项目完成后默认先读取 `references/final-project-summary.md` 并使用 `scripts/write_markdown_utf8.js` 生成中文命名 `case/result/最终项目总结.md`；最终总结必须包含指纹基线一致性、最终请求 Session 请求链、XHR/fetch live session bridge、对象形状审计矩阵、WebAPI 环境检测矩阵、按类别分组的环境与指纹 API 调用回放明细，精确到访问的属性、调用的方法、构造函数、getter / setter、调用参数摘要、返回值 / 回放值摘要、来源证据、补环境实现方式、真实性保护和验证结果；同时确认 `case/阶段报告/` 至少存在 `01-需求信息确认.md`，并根据实际过程与合适推进节点生成其他阶段报告。阶段报告要覆盖 Trace 计划内首轮实现 / 调整的 WebAPI、计划外新增 WebAPI 与原因、XHR/fetch Session Bridge、对象形状审计矩阵、WebAPI 环境检测矩阵状态、功能、Bug 修复、指纹能力、真实性保护、测试与清理等能力增量；不得只写笼统“本阶段新增 / 修改的 WebAPI”。交付前可运行 `scripts/check_stage_reports.js --case-dir case --require-dynamic-fields --markdown` 检查。只有用户明确要求不生成最终总结或阶段报告时才可跳过并记录原因。交付前必须运行 `scripts/check_change_memory.js --case-dir case --markdown`、`scripts/check_code_quality.js --case-dir case --markdown`、`scripts/check_object_shape_audit.js --case-dir case --markdown`、`scripts/check_xhr_fetch_session_bridge.js --case-dir case --markdown`（发送真实请求时加 `--require-live`，使用 curl_cffi / cffi_curl 时加 `--tls-client curl_cffi` 或实际客户端名）、`scripts/check_webapi_addon_coverage.js --case-dir case --markdown`、存在 Trace 时运行 `scripts/analyze_trace_complexity.js --case-dir case --markdown` 与 `scripts/check_trace_api_coverage.js --case-dir case --require-stage-audit --markdown`、`scripts/check_webapi_env_detection_matrix.js --case-dir case --markdown`、`scripts/check_env_realism.js --case-dir case --markdown`（addon-first 默认强制；使用 RuyiTrace、涉及 `document.all` 或涉及指纹值回放时加对应参数），再运行 `scripts/check_final_artifact.js --case-dir case --markdown` 或等价人工检查。任何一个检查失败都不得继续真实请求验证、不得交付、不得只在总结中说明风险；必须先重构或修复后复测通过。尤其 `check_xhr_fetch_session_bridge.js` 发现 XHR/fetch 仍是 fixture/mock/default 200、未桥接同一 TLS session，或 `check_object_shape_audit.js` 发现 `_` / `__` 私有状态泄露、缺少对象形状 baseline / audit，或 `check_code_quality.js` 发现 signer/probe 承载补环境主体、文件过大、中文注释不足、函数过长或压缩堆叠时，或 `check_trace_api_coverage.js` 发现 Trace 命中 P0/P1 API 未规划、计划外新增未说明原因、`missed-from-trace` 流程缺陷时，或 `check_webapi_env_detection_matrix.js` 发现 iframe / Worker / PerformanceTimeline / DOM-CSSOM / EventTarget / timer / writer 分支触发后缺少 baseline、Node audit、矩阵类别或存在阻断状态时，必须先拆分到 `src/env/` / `src/node-runtime/env/`、修正覆盖矩阵或 WebAPI 行为矩阵、补采样并复跑 Node audit，再确认代码可读性与中文注释质量、对象形状审计、XHR/fetch live session bridge、WebAPI addon 覆盖、补环境真实性、addon-first/native fallback 记录、native 能力缺口闭环、补环境框架选择记录、Trace 复杂度评估与框架选择解耦、Trace API 覆盖矩阵、WebAPI 环境检测矩阵、通用代码变更记忆、RuyiTrace 证据沉淀、指纹 fixture 与回放实现、环境与指纹 API 调用回放分类明细、中文命名最终总结、阶段报告、最终项目只有一个执行入口、入口可直接运行、整个项目无自动化工具代码、请求由已确认的 Node.js / Python TLS 指纹兼容 Session 客户端实现并在结束后销毁、无多余测试/临时产物。

41a. **真实请求前统一执行 environment closure**：只要当前 case 存在 Trace、浏览器环境实现或 XHR/fetch，真实请求前必须运行 `scripts/check_environment_closure.js --case-dir case --before-real-request --markdown`；真实请求模式增加 `--require-live` 和实际 `--tls-client`。该总门禁必须包含 Trace-runtime contract/audit 深度比较、对象形状逐字段比较、WebAPI 每个类别逐 probe 比较、XHR/fetch no-send transcript 比较和运行时同 session bridge 证明。阶段报告与最终总结必须记录 `traceSourceHash`、`contractHash`、`runtimeSourceHash`、baselineId、P0/P1 mismatch 数、network transcript mismatch 数和多余 Node 请求数。任何检查只凭关键词、target 名称、空类别数组或手工 `matched` 通过时，视为门禁实现缺陷，不得交付。

42. **清理策略**：每个测试命令、脚本验证或阶段结束后立即清理本步骤产生的临时 hook、trace、日志、缓存、失败下载、无用 HAR、临时截图、临时响应、空文件和空目录；不要等项目完全结束后再统一清理。最终回复前必须复查清理结果。登录态 Profile、Cookie、localStorage 按敏感材料处理，删除前必须确认用户意图。
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

用于检查 `case/notes/resource-manifest.json` 是否记录了已保存 HTML、JS bundle、动态 chunk、challenge JS、403/风控页面和内联脚本；若资源 `dynamic: true` 且 `requiredForFinal: true`，必须存在运行时刷新模块，最终入口必须在同一请求 session 中先刷新当前有效 HTML / JS / seed / challenge，再生成加密参数和发送请求。检查失败时不得把旧快照固定交付。


### 检查 web-verify-patcher 是否安装

```bash

node scripts/check_web_verify_patcher.js --markdown

node scripts/check_web_verify_patcher.js --require --json

```

验证码接口的加密参数已经能通过补环境生成后，如果需要识别验证码、生成真实轨迹、坐标换算或验证提交分析，先运行该检查。未安装时先让用户选择自动安装或自行安装；自动安装必须确认仓库 / 分支中存在 `web-verify-patcher/` 目录，不得假装安装成功。


### 加载可选 native addon


```bash

node scripts/load_native_addon.js --json

node scripts/load_native_addon.js --addon <path-to-addon.node> --json

node scripts/check_node_runtime_compat.js --target addon --markdown

```


本 Skill 随包携带可选 native addon，默认从 `assets/native-addon/<platform>-<arch>/addon.node` 自动加载；“可选”只表示不是跨平台强依赖，不表示可以在补环境时跳过。进入补环境阶段就要尝试加载并记录结果；一旦当前平台可用，创建函数、访问器、`document.all`、原型链等 addon 支持能力时必须优先使用 addon。如果 Node ABI 不兼容，先执行 Node 版本兼容恢复流程：addon 兼容 Node.js v25.8.2，检测 nvm 并征得用户同意是否安装 / 切换；用户拒绝后才允许降级到 `NativeProtect` / JS fallback。当前平台缺失、addon 调用失败或用户明确要求不使用 addon 时，也必须记录原因；用户可显式提供 `--addon` / `WEB_JS_ENV_PATCHER_ADDON` 覆盖路径。不要在 Skill 文档或脚本中写入本机绝对路径。


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

### Trace API 覆盖矩阵检查

```bash
node scripts/check_trace_api_coverage.js --case-dir case --markdown
node scripts/check_trace_api_coverage.js --case-dir case --require-stage-audit --require-runtime-closure --json
node scripts/check_trace_api_coverage.js --inventory case/notes/trace-api-inventory.json --matrix case/notes/env-coverage-matrix.md --markdown
```

用于在存在 RuyiTrace / Node trace / Hook 环境访问日志时检查：是否已生成 `trace-api-inventory.json`、`env-coverage-matrix.md`，P0/P1 Trace 命中 API 是否都有首轮实现 / 采样 / 暂不挂载 / native 能力缺口决策，后续阶段报告中的计划外新增 WebAPI 是否说明原因。检查失败时不得进入 signer probe、不得继续新增功能、不得发送真实请求或宣称阶段验证通过。

### Trace-runtime 可执行一致性检查

```bash
node scripts/build_trace_runtime_contract.js --case-dir case --baseline-id <baselineId> --markdown
node scripts/run_trace_runtime_audit.js --case-dir case --entry case/result/final.js --markdown
node scripts/check_trace_runtime_conformance.js --case-dir case --markdown
```

用于把原始 Trace 变成逐 API / realm / receiver / phase 的机器行为契约，并在当前 runtime 的 no-send audit-only 模式下深比 descriptor、brand、prototype、ownKeys、返回值、异常、副作用和顺序。`contractHash`、`runtimeSourceHash` 或 baseline 不一致时旧 audit 失效；P0/P1 差异未清零时不得继续。

### WebAPI 环境检测矩阵检查

```bash
node scripts/check_webapi_env_detection_matrix.js --case-dir case --markdown
node scripts/check_webapi_env_detection_matrix.js --case-dir case --require --require-writer-branch --json
node scripts/check_webapi_env_detection_matrix.js --matrix case/notes/webapi-env-detection-matrix.md --browser-baseline case/fixtures/browser-env-detection-baseline.json --node-audit case/tmp/node-env-detection-audit.json --markdown
```

用于检查 iframe / Window realm、Worker / MessagePort task queue、PerformanceObserver / PerformanceTimeline、DOM / CSSOM、EventTarget、DataCloneError、clock / timer、writer branch 等行为是否已建立真实浏览器 baseline、Node audit 和矩阵结论。该检查补充 Trace API 覆盖矩阵：Trace 说明 API 被访问，本检查说明行为是否像浏览器。检查失败时不得继续真实请求验证、不得宣称 reload writer / form writer / final writer 分支已闭环。

### 对象形状与私有状态泄露检查

```bash
node scripts/check_object_shape_audit.js --case-dir case --markdown
node scripts/check_object_shape_audit.js --case-dir case --require --json
node scripts/check_object_shape_audit.js --dir case/result --matrix case/notes/object-shape-audit.md --browser-baseline case/fixtures/browser-object-shape-baseline.json --node-audit case/tmp/node-object-shape-audit.json --markdown
```

用于检查浏览器可见对象是否泄露 `_` / `__` 自有属性、是否存在 `Object.defineProperty(obj, "__xxx")` / `this.__xxx` / `defineValue(obj, "_xxx")` 等私有状态泄露，以及 `Object.keys`、`Object.getOwnPropertyNames`、`Reflect.ownKeys`、descriptor、`in`、prototype walk 的真实浏览器 baseline 和 Node audit 是否闭环。检查失败时必须改用 addon / xbs private API 或模块级 `WeakMap`，不得继续真实请求验证。

### XHR/fetch live session bridge 检查

```bash
node scripts/check_xhr_fetch_session_bridge.js --case-dir case --markdown
node scripts/check_xhr_fetch_session_bridge.js --case-dir case --require-live --json
node scripts/check_xhr_fetch_session_bridge.js --case-dir case --tls-client curl_cffi --require-live --markdown
```

用于检查 `XMLHttpRequest` / `fetch` / `Request` / `Response` / `Headers` / `sendBeacon` 是否只停留在 fixture / mock / 默认 200 诊断模式，还是已通过 live session bridge 交给最终确认的 CycleTLS / impers / curl-cffi-node / curl_cffi / cffi_curl / cyCronet session 真实发送。用户选择 Python `curl_cffi` 时，必须检测到 Python session 持有者和 Node IPC bridge 证据；检查失败时不得宣称 TLS 指纹问题已解决。

### XHR/fetch no-send 请求语义检查

```bash
node scripts/check_xhr_fetch_semantics.js --case-dir case --require --require-no-send --out case/tmp/xhr-fetch-semantics-audit.json --markdown
node scripts/check_environment_closure.js --case-dir case --before-real-request --require-live --tls-client curl_cffi --markdown
```

用于逐条比较浏览器与 Node transcript 的请求来源、realm、navigation epoch、URL、Header 顺序、body SHA256、status/responseURL、事件顺序和 reload 后旧 realm 清理。静态 bridge 关键词、手工 `matched`、只有 Session 但请求语义不一致均不算通过。

### 补环境框架模板

```text
assets/runtime-frameworks/no-framework-runtime.js
assets/runtime-frameworks/vm-runtime.js
assets/runtime-frameworks/isolated-vm-runtime.js
assets/runtime-frameworks/xbs-isolated-vm/<platform>-<arch>/isolated_vm.node  # 仅选择 isolated-vm 时复制
assets/runtime-frameworks/jsenv-runtime.js
assets/runtime-frameworks/runtime-factory.js
```

只有用户明确选择对应补环境框架时才复制对应 runtime。选择 `isolated-vm` 时必须同时复制随包魔改 `xbs-isolated-vm/<platform>-<arch>/isolated_vm.node` 并在 Context 内使用 `window.xbs` 与 `xbs.dom.createDocument(options)`。用户未选择时默认不使用补环境框架，最终项目不得混入 `isolated-vm` / `vm` / `jsEnv` runtime 代码或依赖。

### 检查 xbs isolated-vm 可用性

```bash
node --no-node-snapshot scripts/check_xbs_isolated_vm.js --markdown
node --no-node-snapshot scripts/check_xbs_isolated_vm.js --strict --json
node scripts/check_node_runtime_compat.js --target isolated-vm --markdown
```

仅在用户选择 `isolated-vm` 时执行。默认自检会检查 `window.xbs` 17 个核心 API、`xbs.dom.createDocument` 和基础 DOM 行为；遇到 ABI 不匹配会输出中文可解释失败和 v26.3.1 恢复建议；真实 case 已确认使用 isolated-vm 时，`--strict` 可作为阻断门禁。ABI 不匹配时先征得用户同意是否通过 nvm 安装 / 切换 Node.js v26.3.1，用户拒绝后才允许提供匹配魔改构建产物或改选框架。

### 检查补环境代码可读性与中文注释

```bash
node scripts/check_code_quality.js --case-dir case --markdown
node scripts/check_code_quality.js --dir case/result --json
node scripts/check_code_quality.js --file case/result/src/env/install-env.js --markdown
```

用于交付前检查最终代码是否简洁、模块化、具名函数清晰、无压缩堆叠、无调试断点，且中文注释使用 UTF-8 正常显示、没有连续问号、没有乱码、中文注释不包含问号；同时会阻断 `src/signer/`、`runtime_probe.js`、`probe.js` 等文件承载多域 WebAPI 补环境主体。检查失败时必须先重构代码、拆分 WebAPI 模块和修复注释，再继续补环境验证或最终交付。

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

用于多轮高难度 case 的阶段性沉淀。阶段报告默认写入 `case/阶段报告/`，文件名必须包含中文，例如 `01-需求信息确认.md`、`03-请求样本与可疑参数确认.md`、`08-WebAPI补齐阶段报告.md`、`11-Bug修复与回归测试报告.md`。信息不完整时也要生成 `01-需求信息确认.md`，记录已提供信息、缺失项和下一步需要用户确认的问题；完成一轮 WebAPI 补齐、指纹回放、Bug 修复、测试清理或工程机制更新后，应生成动态阶段报告，记录 Trace 计划内首轮实现 / 调整的 WebAPI、计划外新增 WebAPI 与原因、新增功能、修复 Bug、指纹能力、真实性保护、测试结果、清理情况、风险和下一步计划。


### 检查最终一体化产物


```bash

node scripts/check_final_artifact.js --case-dir case --markdown

node scripts/check_final_artifact.js --case-dir case --file case/result/final.js --json

```


用于交付前检查：最终项目是否只有一个执行入口、是否不包含 ruyiPage / Playwright / Puppeteer / Selenium / CloakBrowser 等自动化代码、是否由 Node.js / Python TLS 指纹兼容 Session 客户端发起最终请求、是否混入临时文件或测试文件、是否已默认生成 UTF-8 中文命名最终总结 `result/最终项目总结.md`。若用户明确要求不生成最终总结，检查时才可传入 `--no-require-final-summary`。


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

- 用户 cURL 样本浏览器族：Chrome / Chromium / Firefox / Safari / Unknown；识别依据：UA / Client Hints / Header / HAR / TLS 线索

- 取证 baseline 浏览器族：Firefox / Chrome / Chromium / Safari / Camoufox / CloakBrowser / 用户手动 / Unknown；`baselineId`：

- cURL 与取证 baseline 是否冲突：否 / 是 / 待取证后确认；冲突字段：UA / Client Hints / Header / TLS / HTTP2 / Cookie / 动态参数 / 其他

- 冲突处理策略：默认以取证 baseline 为准 / 重新使用同浏览器族取证 / 切换取证工具 / 用户确认风险；说明：cURL 仅作为请求结构和参数线索，不得把冲突 Header、TLS profile、Cookie 或已生成动态参数固定进最终产物

- 已提供响应样本：是 / 否

- 已知 JS 文件：

- 是否需要登录：

- 是否验证码 / 风控验证接口：否 / 是 / 待确认

- 验证码流程取证方式：不涉及 / 用户提供流程由 AI 自动执行 / 用户自己完成流程，AI 捕获 / 待确认

- 取证模式：ruyiPage + RuyiTrace / 仅 ruyiPage / Camoufox + camoufox-reverse-mcp / 仅 Camoufox / CloakBrowser / 用户手动取证 / AI 自行决定

- 取证一致性：后续抓包、JS 收集、Hook、断点、截图、日志采集均使用上述模式；如需切换将再次请求确认

- 指纹基线一致性：未创建 / 已创建 `case/notes/fingerprint-baseline.json` / 待采样；`baselineId`：；后续取证、RuyiTrace、Camoufox / CloakBrowser、Hook 与指纹 fixture 必须复用同一 profile / seed / 代理 / 语言 / 时区 / UA / Client Hints / screen / WebGL 基线，不得每次随机化

- 指纹值来源优先级：如选择 / 提供 Trace，优先使用未截断 Trace 真实值；Trace 未选择、缺失、未覆盖或 4000 / 4096 长字段疑似截断时，使用当前已确认取证工具在同一 `baselineId` 下采样完整浏览器真实值；禁止把 trace 可见片段、AI 猜值、默认值、随机值或 Node.js 模拟库结果作为最终回放值

- 取证事件可信性：自动点击 / 拖拽 / 键盘 / 滚动 / 验证码交互默认防 `isTrusted` 检测；ruyiPage 优先 native BiDi / human actions，必要 JS 事件使用 `ruyi: true`；Camoufox / CloakBrowser 使用 humanize / 原生输入，不把普通 `dispatchEvent` 作为主路径

- RuyiTrace 状态：已安装并将优先自动捕获 / 未检测到 / 待安装 / 自动捕获失败需手动协助 / 用户明确降级为仅 ruyiPage

- 验证码 Trace 覆盖要求：若是验证码接口，RuyiTrace / Hook / 抓包必须覆盖触发到验证完整流程；用户手动流程需等待“已经完成触发到验证流程”

- Cookie 过期处理：登录态需用户手动登录或授权样本；非登录 Cookie 将分析生成 / 刷新链路，不默认索要新 Cookie

- 最终请求 TLS 指纹兼容客户端：Node.js CycleTLS / Node.js impers / Node.js curl-cffi / curl-cffi-node / Python curl_cffi / Python cffi_curl / Python cyCronet / 不发真实请求

- Firefox / curl_cffi TLS 对齐状态：不涉及 / 待采样 / 已采样待对比 / 已通过 `ja3 + akamai + extra_fp + curl_options` 对齐 / 未通过需改选客户端或用户确认风险

- 最终请求基线来源：取证样本 / 用户同浏览器族 HAR / 用户确认风险；最终请求 Header、UA、Client Hints、TLS / HTTP2 指纹和 Cookie 链路不得直接沿用与取证 baseline 冲突的 cURL 字段

- 最终请求 Session 模式：一律启用；同一 session 覆盖动态资源刷新、Cookie / challenge 生成、加密参数生成前后请求和目标 API；请求成功或失败后必须销毁 session / Cookie jar / 敏感运行态

- XHR/fetch 网络模式：offline-fixture（仅诊断，不发送真实网络）/ live-session-bridge（通过同一 TLS Session 真实发送）/ 未涉及；如最终客户端为 Python `curl_cffi`，Node JS runtime 必须通过 IPC bridge 使用 `final.py` 持有的同一 session

- 补环境框架选择：不使用补环境框架（默认） / isolated-vm（随包魔改 xbs isolated-vm，需自检 `window.xbs` 17 个核心 API、`xbs.dom.createDocument` 和 DOM smoke test） / Node.js 内置 vm / jsEnv；如未明确选择，将按“不使用补环境框架”继续；选择 isolated-vm 时若 ABI 不兼容，先询问是否通过 nvm 安装 / 切换 Node.js v26.3.1；选择 jsEnv 时需提供项目路径、入口和使用文档

- Trace 复杂度评估：已有 RuyiTrace / Node trace / missing-env 等日志时，将基于日志评估复杂度、风险点和补环境优先级；复杂度评估不自动决定补环境框架

- Trace API 覆盖矩阵：已有 Trace / Hook / missing-env 等日志时，进入第一版 env / signer probe 前必须生成 `case/notes/trace-api-inventory.json`、`case/notes/env-coverage-matrix.md` 和更新后的 `case/notes/missing-env-priority.md`；Trace 已命中的 P0/P1 WebAPI 必须明确首轮实现、同 baseline 采样、暂不挂载或 native 能力缺口，不能等遇错后再补

- WebAPI 环境检测矩阵：如果日志、阶段报告或 diff 触发 iframe / Worker / PerformanceTimeline / DOM-CSSOM / EventTarget / DataCloneError / XHR / fetch / sendBeacon / 对象形状 / 私有状态泄露 / timer / writer 分支行为，真实请求或 final writer 判定前必须生成 `case/fixtures/browser-env-detection-baseline.json`、`case/tmp/node-env-detection-audit.json` 和 `case/notes/webapi-env-detection-matrix.md`，并通过 `check_webapi_env_detection_matrix.js`

- 对象形状审计矩阵：如果补了 DOM / Event / Storage / Performance / XHR / fetch / Headers / Response / Request 等浏览器对象，必须生成 `case/fixtures/browser-object-shape-baseline.json`、`case/tmp/node-object-shape-audit.json` 和 `case/notes/object-shape-audit.md`，并确认不存在 `_` / `__` 私有状态泄露

- 补环境真实性保护：默认启用 toString / 属性描述符 / 原型链 / 访问器 / 实例对象保护，默认 addon-first；addon ABI 不兼容时先询问是否通过 nvm 安装 / 切换 Node.js v25.8.2，用户拒绝后才降级；选择 xbs isolated-vm 时以 `window.xbs` native-first 表达；如需关闭必须明确说明

- native 能力缺口处理：如果纯 JS、当前 addon.node API、当前 xbs isolated-vm / xbs.dom API 都无法覆盖目标浏览器语义，将暂停硬补，输出能力缺口报告、建议新增 native API、最小行为测试用例和通过标准；用户扩展 native 能力并通过测试后再继续，或明确接受临时 workaround / 暂停 case

- 通用代码变更记忆：复杂 case 默认维护 `case/notes/代码变更记忆.md`；修改关键源码前读取，修改后记录失败尝试、禁止回退、验证范围和遗留风险

- 阶段报告：默认从 `case/阶段报告/01-需求信息确认.md` 开始，并在每个合适推进节点生成中文命名 Markdown；内容包含项目进展、修改文件、Trace 计划内首轮实现 / 调整的 WebAPI、计划外新增 WebAPI 与原因、WebAPI 环境检测矩阵状态、新增功能、Bug 修复、指纹能力、测试和清理；如不需要生成必须明确说明

- 最终总结：默认生成 `result/最终项目总结.md`，并包含按 navigator / document / window / canvas / webgl 等类别分组的环境与指纹 API 调用回放明细；如不需要生成必须明确说明

- 高强度环境检测覆盖矩阵：如果涉及 Shape / F5 / Akamai / DataDome / Kasada / reese84 / bx-* 或类似浏览器完整性检测，最终总结默认记录异常模式、Node 泄露、toString 多通道、DataCloneError、Error stack、属性枚举、原型链、MutationObserver、userAgentData、window.chrome、媒体能力、网络 Header / Client Hints 一致性和动态 JS 多版本回归的采样 / diff / 修复状态；未涉及也要写明“未涉及”。

- web-verify-patcher 状态：验证码后续识别 / 轨迹 / 验证分析前检测是否已安装；未安装时先让用户选择自动安装或自行安装


确认后我将按以下流程执行：

1. 校验请求样本完整性。

2. 解析请求样本，列出所有可疑加密参数，并由用户确认本次需要分析哪些参数。

3. 确认用户选定的目标加密参数是否存在于请求中。

4. 检测用户选择的 TLS 指纹兼容客户端是否已安装；未安装时先让用户确认安装、改选其他客户端或选择不发真实请求；若会发真实请求，初始化最终请求 Session 方案，确认后续全部请求链共用同一 session 并在结束后销毁。

5. 在任何取证动作前确认是否为验证码 / 风控验证接口；若是，先确认用户提供完整触发到验证流程，或用户自己完成流程、AI 负责捕获并等待“已经完成触发到验证流程”。

6. 如涉及 Cookie/token 无效或过期，先区分登录态与非登录生成型 Cookie；非登录 Cookie 将定位生成链路并纳入补环境。

7. 初步判断参数变化和依赖。

8. 定位请求发起位置与加密入口。

9. 输出 source / entry / builder / writer 四层链路。

10. 收集相关 JS 文件。

11. 检查 JS 文件是否可正常获取。

12. 如用户选择 RuyiTrace，检测已安装后优先自动捕获 NDJSON 日志；捕获成功后立即导入、输出环境访问摘要，并把相关 `api` / `stack.file` / `line` / `col` 作为后续补环境优先依据；捕获和导入前后必须核对 fingerprint baseline 与 `baselineId`。只有自动捕获失败、需要登录 / 验证 / 权限交互或用户明确选择手动时，才要求用户手动采集 / 提供 NDJSON。

13. 如果存在 RuyiTrace / Node trace / missing-env 等日志，执行 Trace 复杂度评估并写入阶段报告；复杂度只影响风险和补环境优先级，不决定补环境框架。

14. 如果存在 Trace / Hook / missing-env 等环境访问证据，读取 `references/trace-api-coverage.md`，生成 `trace-api-inventory.json`、`env-coverage-matrix.md` 和更新后的 `missing-env-priority.md`，并运行 `check_trace_api_coverage.js`；检查通过后才允许进入第一版 env / signer probe。Trace 已命中的 P0/P1 API 如果尚未实现，必须先明确首轮实现文件、同 baseline 采样计划、暂不挂载原因或 native 能力缺口。

14a. 第一轮 env 完成后立即读取 `references/trace-runtime-conformance.md`，从原始 Trace 生成 `trace-runtime-contract.json`，让最终入口以 audit-only/no-send 模式运行并写出 `node-trace-runtime-audit.json`，再执行深度 diff。之后每次修改 env、切换 baseline 或刷新动态资源都必须重新运行；P0/P1 差异清零前不得进入真实请求。

15. 如果日志、阶段报告或 diff 触发 iframe / Worker / PerformanceTimeline / DOM-CSSOM / EventTarget / DataCloneError / XHR / fetch / sendBeacon / 对象形状 / 私有状态泄露 / timer / writer 分支行为，读取 `references/webapi-env-detection-matrix.md`，生成浏览器 baseline、Node audit 和 `webapi-env-detection-matrix.md`，并运行 `check_webapi_env_detection_matrix.js`；存在阻断状态时只能补 baseline、修 Node 行为或进入 native 能力缺口闭环。

16. 如果 Trace / Hook / 目标 JS 显示会调用 XHR / fetch / sendBeacon，或最终请求依赖动态资源 / Cookie / challenge / telemetry，读取 `references/xhr-fetch-session-bridge.md`，确定 `offline-fixture` 或 `live-session-bridge` 模式；用户选择发送真实请求时，必须规划同一 TLS Session bridge，尤其 Python `curl_cffi` 场景由 `final.py` 持有 session 并服务 Node runtime 的 XHR/fetch IPC 请求。

16a. 同时读取 `references/xhr-fetch-semantics-audit.md`，先采集浏览器 network transcript，再让 Node bridge 在 no-send 模式输出待发送 transcript，比较请求 actor、realm、URL、Header 顺序、body hash、status/responseURL、事件顺序和 reload realm 清理。只有语义 audit 与运行时同 session bridge audit 同时通过才允许真实请求。

17. 在正式补环境前提醒用户选择补环境框架：不使用补环境框架（默认） / isolated-vm（随包魔改 xbs isolated-vm） / Node.js 内置 vm / jsEnv；用户未明确选择时按“不使用补环境框架”继续；选择 isolated-vm 时先自检 `window.xbs`、`xbs.dom.createDocument`、DOM smoke test 和 Node ABI；如果 ABI 不兼容，先按 nvm + Node.js v26.3.1 恢复流程询问用户，用户拒绝后才让用户提供匹配构建产物或改选框架；选择 jsEnv 时先确认安装路径、入口文件和使用文档。

18. 执行 Node 泄露阻断、六项纯计算预检，并在进入补环境阶段第一步加载 / 记录 addon.node 或 xbs native 能力；addon ABI 不兼容时先按 nvm + Node.js v25.8.2 恢复流程询问用户，用户拒绝后才允许 NativeProtect / JS fallback；Node 泄露阻断必须覆盖基础 Node 能力和 Node 21+ `navigator`（不是 Node 20 官方新增）、Node 22.4+ Storage、Node `performance`、宿主网络 / 消息 Web API 兼容层，以及 `URL/TextEncoder/Streams/Events/crypto/WebAssembly` 等浏览器同名宿主实现；创建 / 读取 `case/notes/代码变更记忆.md`，按 addon-first、真实性保护基线、私有状态不泄露、Trace API 覆盖矩阵、WebAPI 环境检测矩阵、XHR/fetch live session bridge、通用代码变更记忆和代码可读性规范初始化 env；如果目标涉及 JSVMP，只定位环境依赖、请求链路和 writer，不主动分析 JSVMP 源码。

19. 输出补环境前置分析结论。


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

- 验证码接口确认状态：不涉及 / 已确认是验证码接口 / 待确认；如涉及，记录用户选择的触发到验证取证方式。

- 验证码流程覆盖状态：用户提供流程由 AI 自动取证 / 用户手动完成流程且已回复“已经完成触发到验证流程” / RuyiTrace 或抓包未覆盖完整流程。

- 已确认最终请求 TLS 指纹兼容客户端与可用性。

- 用户 cURL 样本与取证 baseline 冲突检测记录：用户 cURL 浏览器族、取证 baseline 浏览器族、冲突字段（UA / Client Hints / Header / TLS / HTTP2 / Cookie / 动态参数）、处理策略（默认以取证 baseline 为准 / 重新取证 / 切换工具 / 用户确认风险）和 `case/notes/sample-baseline-conflict.md` 写入状态。

- Firefox / curl_cffi TLS 对齐记录（若取证 baseline 为 Firefox 且最终请求使用 curl_cffi / curl-cffi-node）：真实浏览器采样端点、baselineId、原始 curl_cffi profile、对齐参数、JA3 / JA4 / HTTP2 对比结果、未对齐风险或改选客户端结论。

- 最终请求 Session 模式记录：session client 类型、Cookie jar 策略、请求链是否共用同一 session、结束后销毁方式。

- XHR/fetch Session Bridge 记录：未涉及 / offline-fixture 仅诊断 / live-session-bridge；若选择真实请求，记录 JS XHR/fetch 是否通过同一 TLS Session 发送、Python `curl_cffi` 是否由 `final.py` 持有 session 并服务 Node IPC bridge。
- XHR/fetch 请求语义审计记录：浏览器 / Node network transcript、baselineId、no-send 模式、runtimeSourceHash、请求 actor / realm / navigation epoch、Header 有序 diff、body length/SHA256、status=0/responseURL、事件顺序、reload 后旧 realm 清理、多余 Node 请求数和 `check_xhr_fetch_semantics.js` 结果。

- 指纹基线一致性记录：`case/notes/fingerprint-baseline.json`、`baselineId`、profile / seed / 代理 / 语言 / 时区 / UA / Client Hints / screen / WebGL 是否固定，是否存在 baseline diff。

- 请求样本基线优先级记录：用户提供 cURL / HAR 只用于请求结构、参数位置、可疑加密参数和业务字段线索；最终 UA / Header / Client Hints / TLS / HTTP2 / Cookie 链路 / 指纹值以已确认取证 baseline 为准；如两者冲突，是否已阻止把 cURL 冲突字段写入最终项目。

- 补环境框架选择记录：不使用补环境框架（默认） / isolated-vm / Node.js 内置 vm / jsEnv；选择来源为用户明确选择或未选择按默认不使用；如选择 jsEnv，记录项目路径、入口文件和检测结果。

- Trace 复杂度评估状态：已基于日志评估 / 无可用 Trace，未评估；复杂度评估不决定框架选择。
- Trace API 覆盖矩阵状态：已生成 `trace-api-inventory.json` / 已生成 `env-coverage-matrix.md` / 已运行 `check_trace_api_coverage.js` / 无可用 Trace 未生成；P0/P1 Trace 命中 API 是否已全部规划，是否存在 `unplanned`、`missed-from-trace` 或待补采阻塞项。
- Trace-runtime 可执行闭环状态：`trace-runtime-contract.json`、`node-trace-runtime-audit.json`、`trace-runtime-diff.md` 的生成状态；`traceSourceHash`、`contractHash`、`runtimeSourceHash`、baselineId、probeVersion、P0/P1 matched/mismatch 数、audit-only 真实网络尝试数，以及源码变化后是否已重新审计。

- WebAPI 环境检测矩阵状态：未触发 / 已生成 `case/notes/webapi-env-detection-matrix.md` / 已生成 `case/fixtures/browser-env-detection-baseline.json` / 已生成 `case/tmp/node-env-detection-audit.json` / 已运行 `check_webapi_env_detection_matrix.js`；触发类别是否包含 iframe-realm、worker-task、performance-timeline、dom-cssom、event-clone-error、xhr-fetch-session-bridge、object-shape、private-state-leakage、clock-timer、writer-branch，是否存在阻断状态。

- 对象形状审计矩阵状态：未触发 / 已生成 `case/notes/object-shape-audit.md` / 已生成 `case/fixtures/browser-object-shape-baseline.json` / 已生成 `case/tmp/node-object-shape-audit.json` / 已运行 `check_object_shape_audit.js`；是否发现 `_` / `__` 私有状态泄露、额外 ownKeys、descriptor 差异或 prototype walk 差异。

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

- 如果选择 isolated-vm：先给出 `window.xbs` 17 个核心 API、`xbs.dom.createDocument`、DOM smoke test、Node ABI 和二进制来源的自检摘要；需要 DOM 时说明 document 是否由 `xbs.dom.createDocument(options)` 创建、是否挂到 `window.document`、`omitApis` / `features` 配置，以及没有使用已删除旧 DOM API；同时说明补环境源码是否按真实文件模块加载，例如 `browser-objects/navigator.js`、`browser-objects/document.js`、`fingerprint/canvas.js`，不得以大段字符串脚本作为主要实现。

- Trace 复杂度评估摘要：复杂度等级、主要证据和补环境优先级；明确该评估不自动决定 `isolated-vm` / `vm` / `jsEnv` 使用。
- Trace API 覆盖矩阵摘要：`trace-api-inventory.json`、`env-coverage-matrix.md` 和 `missing-env-priority.md` 的生成状态；P0/P1 Trace 命中 API 的首轮实现 / 同 baseline 采样 / 暂不挂载 / native 能力缺口决策；`check_trace_api_coverage.js` 结果；后续新增 WebAPI 是否属于计划内调整、Trace 未覆盖新分支、动态资源新分支、baseline 不一致、Trace 截断、native gap 或 `missed-from-trace` 流程缺陷。

- WebAPI 环境检测矩阵摘要：`webapi-env-detection-matrix.md`、`browser-env-detection-baseline.json`、`node-env-detection-audit.json` 的生成状态；iframe / Window realm、Worker / MessagePort task queue、PerformanceObserver / PerformanceTimeline、DOM / CSSOM、EventTarget / DataCloneError、XHR / fetch session bridge、object shape、private state leakage、clock / timer、writer branch 的 matched / mismatch / needs-baseline / native-gap 状态；`check_webapi_env_detection_matrix.js` 结果；如果 Node 停在 reload writer / continuation 而真实浏览器进入 form writer，必须记录 final writer 前环境事件类别差异。

- 对象形状审计矩阵摘要：`object-shape-audit.md`、`browser-object-shape-baseline.json`、`node-object-shape-audit.json` 的生成状态；`Object.keys`、`Object.getOwnPropertyNames`、`Reflect.ownKeys`、descriptor、`in`、for...in、prototype walk、`Object.prototype.toString` 和 `instanceof` 的 matched / mismatch / needs-baseline / native-gap 状态；`check_object_shape_audit.js` 结果；浏览器对象内部状态是否使用 addon / xbs private API 或 `WeakMap`，是否不存在 `_` / `__` 自有属性泄露。

- XHR/fetch Session Bridge 摘要：网络模式为 `offline-fixture` / `live-session-bridge` / 未涉及；如果是真实请求，说明 JS `XMLHttpRequest` / `fetch` / `sendBeacon` 是否通过同一 TLS Session 发送，Python `curl_cffi` 场景是否由 `final.py` 持有 session 并处理 Node IPC bridge，Cookie jar / Set-Cookie / document.cookie / `getResponseHeader("set-cookie")` 语义是否同步，`check_xhr_fetch_session_bridge.js` 结果。

- 缺失环境列表与补齐优先级。

- Proxy 检测风险与迁移到真实对象的计划。

- `toString`、属性描述符、原型链、`document.all` 等真实性处理记录。

- native addon / NativeProtect 使用情况：addon.node 在补环境初始化阶段的检测结果、实际使用 API、NativeProtect fallback、用户豁免或降级原因。

- native 能力缺口闭环记录：如存在纯 JS、addon.node 当前 API、xbs isolated-vm 当前 API 均无法解决的浏览器语义，说明阻塞点、真实浏览器基线、各后端对比、建议新增 API、最小测试用例、用户选择和测试通过状态；如未发生写“未发生”。

- 通用代码变更记忆记录状态：本轮修改涉及文件、修改理由、已失败尝试、禁止回退、验证命令、验证范围和遗留风险。

- Canvas / WebGL / WebGPU / Audio / 字体 / DOM 几何、`navigator`、`screen`、`window`、`document` 等 WebAPI / 指纹终端 API 的真实值来源优先级执行记录：是否优先查看 Trace、Trace 是否未截断可用、是否因缺失 / 未覆盖 / 4000 或 4096 长字段疑似截断改用已确认取证工具采样完整值、采样工具、`baselineId` 绑定、完整 `valueLength` / `sha256` / 分片信息、baseline diff、缺失样本处理记录，以及是否明确禁止 AI 猜值。

- 环境与指纹 API 调用回放明细：按类别分组记录 `window / global`、`navigator`、`document / DOM`、`location / history`、`screen`、`storage / cookie`、`crypto / random`、`performance / timing`、`network`、`canvas`、`webgl`、`webgpu`、`audio`、`font / CSS / DOM geometry`、`events / trusted input`、`worker / wasm / postMessage`、`其他` 等分类；每条记录必须精确到 API 路径（如 `navigator.userAgent`、`Document.prototype.createElement`、`HTMLCanvasElement.prototype.getContext`）、访问类型、来源证据、参数摘要、返回值 / 回放值摘要、补环境实现、真实性保护和验证结果。未涉及的分类写“未涉及”，不得伪造调用；敏感值和超长值只写脱敏摘要、完整长度、完整 hash、分片信息或截断说明；若来源是疑似截断日志，必须写明已补采或阻塞，不能写成最终值。

- 高强度环境检测覆盖矩阵：如目标涉及高强度浏览器完整性检测，记录真实浏览器基线、Node 补环境审计、diff 结果、已修复项、fallback 项、未采样项和遗留风险；尤其覆盖异常模式、toString 多通道、structuredClone / postMessage DataCloneError、Error stack、属性枚举、原型链 walk、brand check、MutationObserver、userAgentData、window.chrome、canPlayType、mediaSession、网络 Header / Client Hints 一致性和动态 JS 多版本回归。

- fixtures 对比结果。

- 验证码事件轨迹 fixture：如目标为验证码接口，说明 `motionTrack` / `eventFixture` / `verifyContext` 等可替换入口、旧轨迹来源、中文注释质量，以及当前轨迹只用于补环境生成加密参数，不保证最终验证通过。

- web-verify-patcher 交接状态：如需要后续识别 / 轨迹 / 验证分析，说明 `check_web_verify_patcher.js --require` 检测结果、安装状态和交接材料。

- 非登录 Cookie 生成 / 刷新逻辑是否已纳入最终入口的记录（若涉及）。

- 临时 trace / 日志清理结果。

- 最终规范项目目录：入口 `result/final.js` 或 `result/final.py`，必要模块位于 `result/src/` 等目录，并默认包含 `result/最终项目总结.md`。

- 阶段报告写入状态：本阶段 Trace 计划内首轮实现 / 调整的 WebAPI、计划外新增 WebAPI 与原因、新增功能、Bug 修复、指纹能力、真实性保护、测试内容、清理结果、风险与下一步计划是否已写入中文阶段报告。

- 最终项目检查结果：只有一个执行入口、无多余测试/临时文件、无浏览器自动化代码、补环境代码简洁可读且中文注释 UTF-8 正常、浏览器对象无 `_` / `__` 私有状态泄露、指纹值由 Node.js 终端 API 回放实现并绑定同一 fingerprint baseline、最终请求由已确认的 Node.js / Python TLS 指纹兼容 Session 客户端实现且结束后销毁，或用户明确选择不发真实请求；若 XHR/fetch 参与参数、Cookie、challenge、动态资源或 telemetry，已通过 live session bridge 复用同一 session，offline fixture 仅作为诊断模式；若 Firefox baseline 使用 curl_cffi / curl-cffi-node，最终总结已记录 `ja3`、`akamai`、`extra_fp`、`curl_options` 对齐证据和 JA3 / JA4 / HTTP2 验收结果；最终项目未硬编码或复用 cURL / fixture 中的加密参数样本值，也未沿用与取证 baseline 冲突的 cURL UA / Client Hints / Header / TLS profile / Cookie，而是通过补环境后的目标 JS 入口 / signer 生成动态参数，并以已确认取证 baseline 组织最终请求；最终项目只包含用户确认的 runtime，未选择框架时不包含 `isolated-vm` / `vm` / `jsEnv` runtime 代码或依赖，未选择 isolated-vm 时不包含 `xbs-isolated-vm/` 或 `isolated_vm.node`；如发生 native 能力缺口，最终总结已记录阻塞点、建议 API、最小测试用例和通过状态；最终总结已生成且包含 XHR/fetch Session Bridge、对象形状审计矩阵、WebAPI 环境检测矩阵、高强度环境检测覆盖矩阵、环境与指纹 API 调用回放分类明细，UTF-8 中文正常，除非用户明确要求不生成。
- environment closure 结果：真实请求前已运行统一总门禁；Trace-runtime P0/P1 差异为零，WebAPI / 对象形状逐 probe 深比通过，XHR/fetch no-send transcript 无多余请求且请求头/body/status/responseURL/事件顺序一致，live bridge 有同一 session 运行时证明；不存在仅靠关键词、空矩阵或手工 `matched` 通过的检查。
