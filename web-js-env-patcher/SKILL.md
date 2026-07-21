---
name: web-js-env-patcher
description: "面向网页端 JavaScript 的 Node.js 补环境 Skill。用于 env.js/runner.js、缺失环境追踪、RuyiTrace/Proxy 日志分析、Trace API 首轮覆盖与 runtime contract、浏览器对象模型与 native-like、addon/xbs native-first、私有状态泄露阻断、对象形状审计、iframe/Worker/DOM-CSSOM/Performance/WebAPI 行为矩阵、Canvas/WebGL/WebGPU/Audio/字体/DOM 几何真实值回放、XHR/fetch no-send 语义审计、TLS 指纹兼容 Session bridge、curl_cffi 同 Session、动态资源刷新、Cookie 生成链路、source/entry/builder/writer 定位、阶段报告和最终交付门禁。不要用于 App、移动端、小程序、Windows/Native 逆向或纯算重写；默认不主动分析 JSVMP 源码。"
---

# 网页端 JS Node.js 补环境

## 能力边界

本 Skill 只处理网页端浏览器 JavaScript 在 Node.js 中运行所需的环境分析、证据采集、WebAPI 实现和验证。

- 目标是运行原始网页 JS，而不是优先重写算法。
- 不处理 App、Android、iOS、小程序、EXE、DLL、Frida、IDA、JADX、Ghidra 等 Native 任务。
- 默认不主动还原 JSVMP、opcode 或虚拟机解释器；只定位环境依赖、请求链和 writer。需要进入 JSVMP 源码时先暂停并让用户明确改变范围。
- TLS 指纹兼容只用于授权验证浏览器网络栈差异，不得用于绕过登录、验证码、MFA、访问控制或批量访问。

## 工作模型

本 Skill 分三层：

1. `SKILL.md` 负责范围、决策、硬规则和主流程。
2. `references/` 负责场景细节、schema、采样方法和验收标准；只在触发对应场景时读取。
3. `scripts/` 负责确定性采集和门禁；脚本结果不能替代浏览器真实证据或工程判断。

不要一次性加载全部 references。先根据下方路由确定需要读取的文件。

## References 路由

### 任务确认与取证

- 新 case、信息缺失或需要确认模板：读取 `references/intake-template.md`、`references/workflow.md`、`references/delivery-templates.md`。
- 选择 ruyiPage、RuyiTrace、Camoufox、CloakBrowser、手动取证或 AI 决定：读取 `references/browser-acquisition.md`。
- 使用 ruyiPage / RuyiTrace、安装检测、自动捕获或导入 NDJSON：读取 `references/ruyi-tooling.md`。
- 使用 Camoufox / camoufox-reverse-mcp：读取 `references/camoufox-tooling.md`。
- 自动点击、拖拽、键盘、滚动或可能检测 `isTrusted`：读取 `references/trusted-input-and-isTrusted.md`。
- 验证码、challenge、WAF 或 verify 流程：读取 `references/captcha-flow-and-verify-handoff.md`。
- 固化同一 profile、seed、代理、语言、时区、UA、screen、WebGL：读取 `references/fingerprint-baseline-consistency.md`。
- 评估证据可信度或选择实现 / 回放 / 暂缓：读取 `references/trust-matrix.md`、`references/case-patterns.md`。

### 请求、资源与入口定位

- 解析请求、定位加密入口、XHR/fetch Hook 或梳理 `source → entry → builder → writer`：读取 `references/crypto-entry-location.md`、`references/hook-templates.md`。
- HTML、bundle、chunk、challenge JS、403 页面可能过期：读取 `references/dynamic-resource-freshness.md`。
- Cookie/token 失效或需要定位非登录 Cookie 生成链：读取 `references/cookie-generation-analysis.md`。
- 最终请求顺序、Cookie jar、Session 生命周期：读取 `references/session-request-chain.md`。
- UA、Client Hints、Header、TLS/HTTP2 与浏览器 baseline 对齐：读取 `references/tls-request-validation.md`。

### Trace 与环境实现

- 运行目标 JS、Proxy 探测、缺失环境定位：读取 `references/env-debug-loop.md`。
- Trace 首轮 API inventory、覆盖矩阵和计划外新增原因：读取 `references/trace-api-coverage.md`。
- Trace contract、audit-only/no-send 和 runtime 深度一致性：读取 `references/trace-runtime-conformance.md`。
- 选择不使用框架、isolated-vm、`vm` 或 jsEnv：读取 `references/runtime-frameworks.md`。
- 使用随包魔改 xbs isolated-vm：读取 `references/xbs-isolated-vm-api.md`。
- addon.node 或 xbs ABI 不兼容：读取 `references/node-version-recovery.md`。
- addon 新版 API、private API、native collection、plugins/mimeTypes：读取 `references/addon-api.md`。
- 浏览器对象清单、构造函数、原型链、descriptor 和访问器：读取 `references/env-object-model.md`。
- addon-first、toString、`document.all`、brand 和 native-like：读取 `references/env-native-protection.md`。
- Node 全局对象或宿主 WebAPI 泄露、静默失败：读取 `references/node-leakage-and-silent-failure.md`。
- Level 1/2/3 模块划分：读取 `references/env-module-levels.md`。
- 纯 JS、addon 和 xbs 都无法表达真实行为：读取 `references/native-capability-gap.md`。

### WebAPI、对象形状与指纹

- iframe、Worker、PerformanceTimeline、DOM/CSSOM、EventTarget、timer、writer 分支：读取 `references/webapi-env-detection-matrix.md`。
- 对象 ownKeys、descriptor、prototype walk 或 `_` / `__` 私有状态泄露：读取 `references/object-shape-private-state.md`。
- Canvas、WebGL、WebGPU、Audio、字体、DOM 几何等真实值采样和回放：读取 `references/fingerprint-value-replay.md`。
- 浏览器与 Node fixture 对比：读取 `references/fixture-validation.md`。
- Worker、WASM、MessagePort、structuredClone：读取 `references/wasm-worker-postmessage.md`。
- 高强度浏览器完整性检测或复杂行为 diff：读取 `references/high-strength-browser-detection.md`、`references/high-intensity-env-diff.md`。

### XHR/fetch 与最终请求

- XHR/fetch/sendBeacon 需要复用最终 TLS Session：读取 `references/xhr-fetch-session-bridge.md`。
- 请求头、请求体、actor、realm、生命周期、status、responseURL、reload 行为比较：读取 `references/xhr-fetch-semantics-audit.md`。

### 工程质量与交付

- 修改复杂 case 或关键源码：读取 `references/code-change-memory.md`。
- 编写或重构最终补环境代码：读取 `references/code-style.md`。
- 中文阶段报告：读取 `references/stage-markdown-reports.md`。
- 最终总结和环境 / 指纹 API 回放明细：读取 `references/final-project-summary.md`。
- 临时文件和敏感材料清理：读取 `references/cleanup.md`。
- 回归场景与 skill 自测：读取 `references/validation.md`。

## 硬规则

1. **先确认信息**：至少确认目标页面、目标 API、方法、加密参数名与位置、成功请求样本、已知 JS、取证模式、最终 TLS 客户端或“不发真实请求”。信息不足时只输出已知信息、缺失项和下一步，不启动取证、下载 JS、运行旧代码或写 env。

2. **取证模式先于取证动作**：打开网页、抓包、Hook、断点、截图、下载资源或采集 Trace 前，先确认 ruyiPage + RuyiTrace、仅 ruyiPage、Camoufox + MCP、仅 Camoufox、CloakBrowser、手动取证或 AI 决定。不得先用普通 Playwright / Puppeteer / 系统浏览器失败后再切换。

3. **固定 fingerprint baseline**：第一次成功取证后生成 `case/notes/fingerprint-baseline.json` 和 `baselineId`。后续网络、Trace、Hook、指纹和 Node audit 必须使用同一 profile / seed / 代理 / 语言 / 时区 / UA / Client Hints / screen / WebGL。切换工具或 baseline 前必须暂停确认。

4. **验证码和登录前置确认**：任何取证前先判断是否为验证码、风控验证、challenge 或 WAF 接口。需要登录时不索要账号、密码、验证码或 MFA；让用户在已确认工具中完成并回复成功。验证码 Trace 必须覆盖触发、展示、交互、提交和 verify 返回。

5. **请求样本不等于最终 baseline**：cURL/HAR 只提供 URL、方法、结构、参数位置和业务字段线索。若样本浏览器族与取证 baseline 冲突，默认以取证 baseline 的 UA、Client Hints、Header、TLS/HTTP2、Cookie 和指纹为准，并记录冲突。

6. **参数和链路先确认**：列出 Query、Header、Body、Cookie 中全部可疑动态参数，让用户确认本次范围；入口定位必须输出 `source → entry → builder → writer`。非登录 Cookie 失效时先分析生成 / 刷新链，不默认索要新 Cookie。

7. **动态资源不得固定化**：HTML、bundle、chunk、challenge JS、403 页面和内联 seed 默认只是分析快照。记录资源 freshness；影响最终参数时必须在同一 Session 内运行时刷新。

8. **Trace 命中必须首轮规划**：存在 RuyiTrace、Node trace、Hook 环境日志或 `missing-env.json` 时，在第一版 env / signer probe 前生成 `trace-api-inventory.json` 和 `env-coverage-matrix.md`。P0/P1 必须首轮实现、同 baseline 采样、明确暂不挂载或进入 native gap；不得等报错或 writer 分支失败后再补。`missed-from-trace` 必须作为流程缺陷记录。

9. **Trace 必须形成可执行 closure**：第一轮 env、每次环境修改、动态资源刷新或 baseline 变化后，重新生成 v3 Trace runtime contract，并让当前最终入口在 audit-only/no-send 模式输出 Node audit。必须比较 realm、receiver、descriptor、brand、prototype、ownKeys、结果 / 异常和原始状态时间线；不得从分组 observation 反推顺序。自动发现多份 Trace 时显式选择当前 baseline，禁止跨历史采集静默合并。手写 `matched`、同名 target、证据文本、关键词或 Top API 列表都不算观测；P0/P1 mismatch 或网络访问会阻断。

10. **框架由用户决定**：正式补环境前确认不使用框架（默认）、xbs isolated-vm、Node `vm` 或 jsEnv。Trace 复杂度只决定风险和优先级，不自动选择框架。isolated-vm 必须验证随包二进制、Node ABI、`window.xbs` 和 `xbs.dom.createDocument`；jsEnv 未提供真实项目和文档时不得虚构 API。

11. **Node 泄露和 native 能力前置**：运行目标 JS 前隔离 `process`、`Buffer`、`require`、`module`、`global`、Node `navigator`、Storage、performance 和宿主网络 / 消息 WebAPI。补环境初始化即检测 addon.node 或 xbs；可用时函数、访问器、构造函数、集合对象、plugins/mimeTypes、`document.all` 等必须 native-first。ABI 不兼容先按版本恢复流程处理，用户拒绝或恢复失败后才允许有记录的 fallback。

12. **真实浏览器对象模型默认开启**：关键 WebAPI 从第一版就处理 descriptor、getter/setter、构造行为、prototype、`instanceof`、toString、brand 和非法 receiver，不得用普通对象或简单函数糊住。iframe/Worker 必须拥有独立全局、构造器图、公开对象和生命周期；只允许共享有浏览器证据的底层同源状态，不得复用主 Realm wrapper。探测 Proxy 只能用于诊断，最终交付应固化真实对象。

13. **浏览器对象私有状态不得泄露**：目标 JS 可见对象不得通过 `_`、`__` 或自定义 Symbol 自有属性保存内部状态。优先 addon/xbs private API，其次模块级 `WeakMap`。对象形状必须以浏览器 baseline 与 Node audit 逐字段比较，不能只检查属性前缀或 target 名称。

14. **指纹值必须有真实证据**：优先使用同 baseline、未截断的 Trace 值；Trace 缺失、接近 4000/4096 截断、长度未知或 baseline 冲突时，用已确认浏览器工具补采。AI 猜值、随机值、默认值、mock、jsdom、node-canvas、headless-gl 不能作为最终回放值。长值记录完整长度、hash、分片和来源。

15. **XHR/fetch 必须同时满足语义和 Session**：真实请求时，XHR/fetch/sendBeacon 必须通过同一 TLS Session bridge，不能直接使用 Node 宿主网络，也不能返回默认 200 或 fixture 冒充成功。Python `curl_cffi` 场景由 `final.py` 持有唯一 Session 并服务 Node IPC。真实请求前生成完整 `network-transcript/v3` 并完成 no-send diff；URL、Header 实值/脱敏 hash、body/response hash、responseURL、响应头、actor/realm/epoch、全局事件顺序、reload 清理、Session 和多余请求任一缺失都阻断，双方同缺字段也不算 matched。

16. **代码质量和 native gap 不得绕过**：signer、probe、runner、diagnostic 只做编排，WebAPI 主体必须拆到 `src/env/` 或 `src/node-runtime/env/`；isolated-vm 不得用大段 `String.raw` 聚合源码。真实请求前必须通过代码质量与 addon-first 门禁。纯 JS、addon、xbs 都无法可靠实现时，输出 native 能力缺口、建议 API、最小浏览器/native 测试和通过标准，不得伪造成功。

17. **真实请求前统一总门禁**：只要 case 的 Trace、阶段报告、notes、fixtures、transcript 或 runtime 出现浏览器环境/XHR/fetch 信号，必须执行 `check_environment_closure.js --before-real-request`。总门禁主动聚合 Trace-runtime、对象形状、WebAPI/Realm/消息/DOM 行为矩阵、XHR/fetch no-send、同 Session、代码质量和 addon-first；任一失败都不得发送真实请求或交付。

18. **最终项目和清理**：最终项目只能有一个可直接运行入口 `result/final.js` 或 `result/final.py`，内部完成环境安装、Session 创建、动态资源刷新、参数生成、可选请求和 `finally` 销毁。不得包含浏览器自动化、临时 server/bridge、Trace、HAR、Hook、截图、Profile 或测试缓存。每个阶段及时清理临时产物；登录态和 Cookie 等敏感材料删除前确认用户意图。

## 主流程

### A. Intake 与取证确认

1. 确认任务属于网页端 JS Node.js 补环境；否则说明边界并停止。
2. 运行信息完整性检查，列出已知信息、缺失项和全部可疑参数。
3. 确认取证模式、最终 TLS 客户端或不发请求、最终 Session 模式、补环境框架选择时机。
4. 写入 `case/阶段报告/01-需求信息确认.md`；只有用户明确要求不生成报告时才记录豁免。
5. 信息完整后，先确认验证码 / 登录 / 权限交互，再开始取证。
6. 解析 cURL/HAR 与浏览器族，记录与 fingerprint baseline 的冲突。

### B. 证据与首轮环境计划

7. 使用已确认工具从第一次打开页面开始取证，固定 `baselineId`，收集成功请求、相关 JS 和动态资源 freshness。
8. 定位 `source → entry → builder → writer`，确认目标参数真实写入请求的位置。
9. 有 Trace 时先导入并生成 API inventory、覆盖矩阵和复杂度摘要；复杂度不决定框架。
10. 第一版 env 前完成全部 Trace P0/P1 决策；真实值类 API 缺样本时标记采样，不挂空壳。
11. 第一版 env 后立即生成 runtime contract，运行 audit-only/no-send Node audit 和深度 diff。
12. 触发 iframe、Worker、MessagePort、Performance、DOM CRUD/CSSOM、EventTarget、timer、writer、对象 shape 或网络行为时，用同一 probe suite 分别生成含实际 observation 的浏览器 baseline 与 Node audit；证据路径和手工 status 不能替代结果。

### C. 实现与迭代

13. 按用户选择初始化 runtime，执行 Node 泄露阻断，加载 addon/xbs 能力并记录 fallback。
14. 按 Level 1 基础运行层、Level 2 指纹真实性层、Level 3 目标 SDK 层实现；站点逻辑不得污染通用 env。
15. 所有浏览器对象采用模块化、native-first、真实性保护和私有状态隔离；维护 `case/notes/代码变更记忆.md`。
16. 指纹 API 只回放同 baseline 的真实浏览器值；缺失或截断时补采。
17. XHR/fetch 先实现浏览器语义和 no-send transcript，再接入已确认 TLS Session bridge。
18. 每次修改 env、baseline、动态资源或网络桥接后，重跑受影响的 runtime audit 和矩阵，不等新报错再补环境。

### D. 验证、请求与交付

19. 用 fixtures 比较浏览器与 Node 的关键输出；“不报错”不算完成，单独 OPTIONS preflight 不算目标请求成功。
20. 参数或请求不一致时，先排查 baseline、资源 freshness、Cookie/Storage、请求顺序、Header/TLS/Session、Trace 截断和自动化暴露，再修改 env。
21. 真实请求前执行统一 environment closure；真实模式增加 `--require-live` 和实际 `--tls-client`。
22. 只在 closure 通过后，由唯一入口使用同一 Session 执行少量授权验证。
23. 生成阶段报告和 `result/最终项目总结.md`，记录 hashes、mismatch 数、矩阵、回放来源、Session 链、风险和清理结果。
24. 运行最终产物检查，修复所有阻断项，清理临时文件后再交付。

## 统一命令入口

以下命令是主入口；更细的命令参数按对应 reference 使用。

```bash
# Intake
node scripts/check_intake.js --input task.md --markdown

# 真实请求前统一环境闭环
node scripts/check_environment_closure.js --case-dir case --before-real-request --markdown
node scripts/check_environment_closure.js --case-dir case --before-real-request --require-live --tls-client curl_cffi --markdown

# 阶段报告与最终产物
node scripts/check_stage_reports.js --case-dir case --require-dynamic-fields --markdown
node scripts/check_final_artifact.js --case-dir case --markdown
```

Trace 场景的最小闭环：

```bash
node scripts/build_trace_runtime_contract.js --case-dir case --baseline-id <baselineId> --markdown
node scripts/run_trace_runtime_audit.js --case-dir case --entry case/result/final.js --markdown
node scripts/check_trace_api_coverage.js --case-dir case --require-runtime-closure --markdown
```

XHR/fetch 场景的最小闭环：

```bash
node scripts/check_xhr_fetch_semantics.js --case-dir case --require --require-no-send --out case/tmp/xhr-fetch-semantics-audit.json --markdown
node scripts/check_xhr_fetch_session_bridge.js --case-dir case --require-live --tls-client curl_cffi --markdown
```

## 必需证据

根据触发场景生成，不得手工填写 `matched` 代替机器观测：

- 基线：`case/notes/fingerprint-baseline.json` 与统一 `baselineId`。
- Trace：`trace-api-inventory.json`、`env-coverage-matrix.md`、`trace-runtime-contract.json`、`node-trace-runtime-audit.json`。
- WebAPI：同 `probeSuiteVersion/probeSourceFile/probeSourceHash` 且含实际 observation 的 `browser-env-detection-baseline.json`、`node-env-detection-audit.json`、`webapi-env-detection-matrix.md`。
- 对象形状：`browser-object-shape-baseline.json`、`node-object-shape-audit.json`、`object-shape-audit.md`。
- 网络：浏览器 / Node network transcript、`xhr-fetch-semantics-audit.json`、`xhr-fetch-session-bridge-audit/v2`。
- 指纹：真实来源、`baselineId`、完整长度、SHA-256、截断状态和回放 key。
- 工程：阶段报告、代码变更记忆、最终总结、唯一入口和最终检查结果。

阶段报告与最终总结至少记录：

- `traceSourceHash`、`contractHash`、`runtimeSourceHash`、`baselineId`、probe version。
- Trace P0/P1 matched/mismatch、network mismatch、额外 Node 请求和 audit-only 网络尝试数。
- XHR/fetch Session 持有者、TLS 客户端、round trip 和 same-session 证明。
- WebAPI / 对象形状矩阵的触发类别、阻断项、真实值来源和 native fallback。
- 本阶段计划内 WebAPI、计划外新增原因、功能、Bug、指纹、测试、风险和清理。

## 交付约束

- 最终入口必须动态生成参数，不得硬编码 cURL、fixture 或历史请求中的加密值。
- 最终请求必须复用取证 baseline 对应的 UA、Client Hints、Header、TLS/HTTP2、代理、Cookie jar 和 Session。
- 自动化工具只用于前置取证，不得进入 `result/`。
- 用户选择不发真实请求时，只输出本地参数并明确未进行网络验证。
- 任一门禁失败时先修复和复测，不得只在总结中声明风险后交付。
