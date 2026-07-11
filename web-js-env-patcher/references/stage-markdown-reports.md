# 分阶段中文 Markdown 报告规则

本文件用于约束一个高难度 Web JS Node.js 补环境 case 在多轮对话中的阶段性总结产物。阶段报告不是最终总结的替代品，而是在每个合适的推进节点沉淀当前进展、修改内容、能力增量、WebAPI / 指纹变化、Bug 修复、测试结果、阻塞点、native 能力缺口和下一步计划，方便跨轮对话继续工作。

## 硬性规则

- 所有由 Skill 生成的 Markdown 报告文件名必须包含中文，不能只使用 `final-summary.md`、`stage-1.md`、`report.md` 这类英文文件名。
- 阶段报告统一写入 `case/阶段报告/`，最终总结统一写入 `case/result/最终项目总结.md`。
- Markdown 内容必须 UTF-8 写入；不要使用未指定编码的 shell 重定向写中文。
- 每个合适推进节点结束后立即写入或更新对应阶段报告，不要等项目完成后一次性补写；“合适推进节点”由执行者根据实际任务判断，不局限于固定流程阶段。
- 阶段报告既要写阶段结论、用户确认信息、证据摘要和下一步计划，也要写 Trace 计划内首轮实现 / 调整的 WebAPI、计划外新增 WebAPI 与原因、WebAPI 环境检测矩阵状态、补环境功能、指纹能力、Bug 修复、测试结果和清理状态；不要写入明文 Cookie、Authorization、账号、手机号、完整 token、完整 localStorage 等敏感内容。
- 阶段报告可以记录临时证据路径，但必须标注“临时证据 / 已清理 / 需用户确认保留”，不要把临时 hook、trace、HAR、截图、Profile 当成最终交付物。
- 如果用户明确要求不生成阶段报告，必须在对话和最终总结中记录该豁免；否则默认生成。

## 推荐阶段与中文文件名

| 阶段 | 文件名 | 触发时机 |
|---|---|---|
| 需求信息确认 | `01-需求信息确认.md` | 用户提供 URL、API、参数、样本、取证模式等初始材料后，或发现信息不完整并列出缺失项时 |
| 取证方案确认 | `02-取证方案确认.md` | 用户确认 ruyiPage / RuyiTrace / Camoufox / CloakBrowser / 手动取证 / AI 自行决定后 |
| 请求样本与可疑参数确认 | `03-请求样本与可疑参数确认.md` | 解析 cURL / HAR / 请求样本并列出所有可疑加密参数后 |
| JS文件与入口定位 | `04-JS文件与入口定位.md` | 收集 JS 文件、定位 source / entry / builder / writer 后 |
| 补环境前置分析 | `05-补环境前置分析.md` | 进入 Node.js 补环境前，完成日志、trace、依赖和风险优先级整理后 |
| 补环境实现记录 | `06-补环境实现记录.md` | env / signer / request 模块形成并通过主要 fixture 后 |
| 验证与清理记录 | `07-验证与清理记录.md` | 最终请求验证、代码质量检查、最终产物检查、清理检查完成后 |
| 最终项目总结 | `最终项目总结.md` | 项目完成后，写入 `case/result/最终项目总结.md` |

可以根据实际 case 增加中文命名阶段报告，例如 `08-addon接口更新阶段报告.md`、`09-通用代码变更记忆机制实现报告.md`、`10-WebAPI补齐阶段报告.md`、`11-指纹回放能力阶段报告.md`、`12-二次补样复盘.md`、`13-线上复测记录.md`，但文件名仍必须包含中文。

## 动态阶段报告触发时机

除了固定阶段外，执行者应在以下节点主动生成阶段报告：

- 完成一轮明确修改后，例如更新 Skill 流程、脚本、参考文档、addon helper、env 模块、signer 或 request 客户端。
- 新增、迁移或重构一批 WebAPI 后，例如新增 `Navigator`、`Document`、`Location`、`Storage`、`Canvas`、`WebGL` 等对象或方法；报告必须说明这些 WebAPI 是 Trace 覆盖矩阵中的计划内首轮实现 / 调整，还是 Trace 未覆盖、动态资源新分支、baseline 不一致、Trace 截断、native 能力缺口或前置矩阵遗漏导致的计划外新增。
- 新增或调整 `XMLHttpRequest`、`fetch`、`Request`、`Response`、`Headers`、`navigator.sendBeacon` 后，报告必须说明网络模式是 `offline-fixture` 还是 `live-session-bridge`，真实请求是否复用同一 TLS Session，Python `curl_cffi` 场景是否由 `final.py` 持有 session 并服务 Node IPC bridge。
- 新增或调整任何浏览器对象内部状态后，报告必须说明对象形状审计状态、`_` / `__` 自有属性泄露检查结果，以及内部状态使用 addon / xbs private API 还是 WeakMap。
- 新增或调整 iframe、Worker、PerformanceObserver、DOM/CSSOM、EventTarget、MessagePort、`structuredClone`、timer、writer 分支相关行为后，报告必须说明 `webapi-env-detection-matrix.md` 是否已更新，浏览器 baseline / Node audit 是否存在，哪些检测项仍阻断真实请求。
- 新增或调整指纹能力后，例如 Canvas / WebGL / WebGPU / Audio / 字体 / DOM 几何的真实值采样与回放，并记录是否绑定同一 `baselineId`。
- 固化或变更 fingerprint baseline 后，例如创建 `case/notes/fingerprint-baseline.json`、发现 baseline diff、切换代理 / profile / 工具。
- 建立或调整最终请求 Session 请求链后，例如改为同一 session 刷新动态资源、生成 Cookie / challenge、发送目标 API 并销毁 session。
- 修复一个关键 Bug 后，例如参数不一致、旧式 addon API 回退、toString 保护缺失、属性描述符错误、原型链错误、TLS 客户端选择错误。
- 发现纯 JS、addon.node 当前 API、xbs isolated-vm 当前 API 都无法覆盖的 native 能力缺口后，需要记录阻塞行为、浏览器基线、建议新增 API、最小行为测试用例、用户选择和通过状态。
- 完成一轮测试后，例如 fixture 对比、addon smoke、RuyiTrace 证据检查、代码质量检查、最终产物检查。
- 发现阻塞点、需要用户确认、需要补样本或需要重新取证时。
- 长时间任务中已经推进较多但尚未最终交付时，主动写入进度快照。

动态阶段报告应优先采用“编号 + 中文主题”的文件名，例如：

```text
case/阶段报告/08-addon接口更新阶段报告.md
case/阶段报告/09-WebAPI补齐阶段报告.md
case/阶段报告/10-指纹回放能力阶段报告.md
case/阶段报告/11-Bug修复与回归测试报告.md
```

## 阶段报告写入命令

优先使用脚本生成或写入，避免编码问题：

```bash
node scripts/write_stage_report.js --case-dir case --stage 需求信息确认 --data case/notes/需求信息.json --markdown
node scripts/write_stage_report.js --case-dir case --stage 请求样本与可疑参数确认 --input case/tmp/可疑参数草稿.md --markdown
node scripts/write_stage_report.js --case-dir case --stage 验证与清理记录 --append --input case/tmp/清理结果.md --markdown
node scripts/write_stage_report.js --case-dir case --stage WebAPI补齐阶段报告 --index 08 --data case/notes/阶段进展.json --markdown
```

写入任意中文命名 Markdown 时使用：

```bash
node scripts/write_markdown_utf8.js --input case/tmp/总结草稿.md --out case/result/最终项目总结.md --require-chinese-name --markdown
```

检查阶段报告：

```bash
node scripts/check_stage_reports.js --case-dir case --require-stage 需求信息确认 --markdown
node scripts/check_stage_reports.js --case-dir case --require-stage 需求信息确认 --require-stage 请求样本与可疑参数确认 --json
node scripts/check_stage_reports.js --case-dir case --require-stage WebAPI补齐阶段报告 --require-dynamic-fields --require-capability-report --markdown
```

## 阶段 1：需求信息确认报告内容

当用户刚提供需求信息时，优先生成 `case/阶段报告/01-需求信息确认.md`。内容至少包含：

- 目标网站 URL。
- 目标页面 URL。
- 目标 API。
- 请求方法。
- 用户声明的加密参数。
- 请求样本中发现的可疑加密参数。
- 参数位置：Query / Header / Body / Cookie。
- 取证模式选择：ruyiPage + RuyiTrace / 仅 ruyiPage / Camoufox + camoufox-reverse-mcp / 仅 Camoufox / CloakBrowser / 用户手动取证 / AI 自行决定。
- 最终请求 TLS 指纹兼容客户端选择。
- 最终请求 Session 模式：默认启用；session client 类型、Cookie jar 策略和销毁方式。
- 指纹基线状态：未创建 / 已创建 / 待采样；`baselineId` 与 baseline 文件路径。
- 已提供的 JS 文件 / 加密文件 / bundle / chunk / sourcemap。
- 是否需要登录，以及是否等待用户手动登录。
- 已提供材料列表与缺失材料列表。
- 下一步需要用户确认的问题。

如果信息不完整，也要生成该阶段报告，明确“当前不能进入正式分析”的原因和待补充项。

## 阶段报告模板

```markdown
# 阶段报告：需求信息确认

生成时间：
阶段状态：信息完整 / 信息不完整 / 等待用户确认

## 1. 用户已提供信息

- 目标网站 URL：
- 目标页面 URL：
- 目标 API：
- 请求方法：
- 加密参数：
- 参数位置：
- 取证模式：
- 最终请求 TLS 指纹兼容客户端：
- 最终请求 Session 模式：
- 指纹基线状态：
- 已知 JS 文件 / 加密文件：
- 是否需要登录：

## 2. 已提供样本与证据

- cURL / HAR：
- 响应样本：
- 浏览器 fixture：
- RuyiTrace NDJSON：
- Camoufox / CloakBrowser / ruyiPage 取证记录：

## 3. 缺失信息与阻塞点

- 缺失项：
- 阻塞原因：
- 需要用户确认：

## 4. 下一步计划

1. 
2. 
3. 
```

## 动态阶段报告模板

当本阶段涉及代码、能力、WebAPI、指纹或 Bug 修复时，优先使用以下模板。该模板可以用于任意中文阶段名，例如 `WebAPI补齐阶段报告`、`指纹回放能力阶段报告`、`Bug修复与回归测试报告`。

```markdown
# 阶段报告：WebAPI补齐阶段报告

生成时间：
阶段状态：进行中 / 已完成 / 阻塞 / 待用户确认

## 1. 当前阶段目标

- 本阶段要解决的问题：
- 本阶段范围：
- 不在本阶段处理的内容：

## 2. 当前项目进展

- 已完成：
- 进行中：
- 尚未开始：
- 阻塞点：

## 3. 本阶段修改文件

| 文件 | 修改类型 | 修改原因 | 影响范围 |
|---|---|---|---|
| result/src/env/navigator.js | 新增 / 修改 / 删除 |  |  |

## 4. Trace 计划内首轮实现 / 调整的 WebAPI

| WebAPI | 挂载位置 | 类型 | 实现方式 | 是否 addon-first | Trace 矩阵状态 | 证据来源 | 测试结果 |
|---|---|---|---|---|---|---|---|
| navigator.userAgent | Navigator.prototype | getter | createGetter | 是 | implemented-first-pass | RuyiTrace / 浏览器样本 | 通过 |

## 4a. 计划外新增 WebAPI 与原因

计划外新增只能使用以下原因：`trace-not-covered` / `dynamic-resource-new-branch` / `baseline-mismatch` / `trace-truncated` / `native-gap` / `missed-from-trace`。如果原因是 `missed-from-trace`，必须标为流程缺陷，并补写 `trace-api-inventory.json`、`env-coverage-matrix.md` 和 `notes/代码变更记忆.md` 后再继续。

| WebAPI | 新增原因 | 为什么未在 Trace 覆盖矩阵首轮处理 | 证据 | 处理结果 |
|---|---|---|---|---|
| 无 | - | - | - | - |

## 4b. Trace-runtime 可执行闭环

- contract：case/notes/trace-runtime-contract.json / 未生成，原因：
- Node audit：case/tmp/node-trace-runtime-audit.json / 未生成，原因：
- traceSourceHash：
- contractHash：
- runtimeSourceHash：
- baselineId：
- P0/P1 matched / mismatch：
- audit-only 真实网络尝试数：
- 检查结果：`check_trace_runtime_conformance.js` 通过 / 未通过 / 未运行，原因：

## 4c. XHR/fetch Session Bridge

- 网络模式：offline-fixture / live-session-bridge / 未涉及
- Session 持有者：final.js / final.py / 未涉及
- TLS 客户端：CycleTLS / impers / curl-cffi-node / curl_cffi / cffi_curl / cyCronet / 不发真实请求
- JS bridge 文件：
- Cookie / Set-Cookie 同步：
- readyState / Promise / event 顺序：
- 检查结果：`check_xhr_fetch_session_bridge.js` 通过 / 未通过 / 未运行，原因：

## 4d. XHR/fetch 请求语义审计

- 浏览器 transcript：case/fixtures/browser-network-transcript.ndjson / 未生成，原因：
- Node no-send transcript：case/tmp/node-network-transcript.ndjson / 未生成，原因：
- runtimeSourceHash：
- Header/body mismatch：
- status=0 / responseURL：
- readyState / event / Promise 顺序：
- reload 后旧 realm 清理：
- 多余 Node 请求数：
- 检查结果：`check_xhr_fetch_semantics.js` 通过 / 未通过 / 未运行，原因：

## 4e. 对象形状审计矩阵

- 矩阵文件：case/notes/object-shape-audit.md / 未触发，原因：
- 浏览器 baseline：case/fixtures/browser-object-shape-baseline.json / 未生成，原因：
- Node audit：case/tmp/node-object-shape-audit.json / 未生成，原因：
- 私有状态实现：addon/xbs private API / WeakMap / native / 未涉及
- `_` / `__` 自有属性泄露：无 / 列表
- 阻断项：无 / 列表

| 对象 | Probe | 浏览器证据 | Node 证据 | 状态 | 处理 |
|---|---|---|---|---|---|
| 未涉及 | - | - | - | not-involved | - |

## 5. 本阶段新增功能

- 新增功能：
- 功能入口：
- 使用方式：
- 对最终产物的影响：

## 5a. WebAPI 环境检测矩阵

- 矩阵文件：case/notes/webapi-env-detection-matrix.md / 未触发，原因：
- 浏览器 baseline：case/fixtures/browser-env-detection-baseline.json / 未生成，原因：
- Node audit：case/tmp/node-env-detection-audit.json / 未生成，原因：
- baselineId：
- 触发类别：iframe-realm / worker-task / performance-timeline / dom-cssom / event-clone-error / xhr-fetch-session-bridge / object-shape / private-state-leakage / clock-timer / writer-branch / 未涉及
- 阻断项：无 / 列表
- writer 分支：真实浏览器 = ；Node = 

| 类别 | 检测项 | 浏览器证据 | Node 证据 | 状态 | 处理 |
|---|---|---|---|---|---|
| 未涉及 | - | - | - | not-involved | - |

## 6. 本阶段修复的 Bug

| Bug | 原因 | 修复方式 | 涉及文件 | 验证结果 | 防回退记录 |
|---|---|---|---|---|---|
|  |  |  |  |  | notes/代码变更记忆.md |

## 7. 本阶段新增 / 修改的指纹能力

| 指纹类型 | API | 实现策略 | 样本来源 | baselineId | 回放方式 | 风险 |
|---|---|---|---|---|---|---|
| Canvas | toDataURL | 真实值回放 | 浏览器采样 |  | 按调用参数匹配 | 样本不足 |

## 8. 真实性保护变化

- 函数 toString 保护：
- 访问器 toString 保护：
- 属性描述符：
- 原型链：
- 实例对象 `[object Xxx]`：
- `document.all` / HTMLDDA：
- addon 使用情况：
- fallback 原因：

## 9. Session 请求链与指纹基线

- fingerprint baseline：未涉及 / 已创建 / 已复用 / 发生 diff，文件：
- baselineId：
- 最终请求 Session：未涉及 / 已启用 / 不发真实请求
- session 覆盖请求链：动态资源刷新 / Cookie 生成 / challenge / 目标 API
- session 销毁方式：

## 10. 本阶段测试内容与结果

| 测试项 | 命令 / 方法 | 结果 | 备注 |
|---|---|---|---|
|  |  | 通过 / 失败 |  |

## 11. 清理情况

- 已清理：
- 保留证据：
- 敏感材料处理：

## 12. 风险与遗留问题

- 风险：
- 未覆盖样本：
- 需要用户确认：

## 13. 下一步计划

1.
2.
3.
```

## 最终总结与阶段报告关系

- 阶段报告记录“当时的状态”和“阶段性结论”，允许出现待确认项。
- 动态阶段报告还要记录“本阶段能力增量”，包括 Trace 计划内 WebAPI 实现 / 调整、计划外新增 WebAPI 与原因、Trace-runtime 可执行闭环、XHR/fetch 请求语义审计、功能、指纹、Bug 修复、真实性保护和测试结果。
- `result/最终项目总结.md` 记录最终结论，必须引用阶段报告中的关键决策，但不要重复粘贴所有中间日志。
- 最终交付检查时，应确认 `case/阶段报告/` 中至少存在 `01-需求信息确认.md`，并确认文件名和内容均为 UTF-8 中文正常显示。
