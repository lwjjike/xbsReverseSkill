# 最终项目总结模板



项目完成后或准备最终交付时必须读取本文件并默认生成 `case/result/最终项目总结.md`。最终总结 / 项目复盘 / 任务报告不是按用户要求才生成，而是规范性硬性产物；只有用户明确要求不生成最终总结时才可跳过，并需在阶段输出中记录原因。总结报告必须使用 UTF-8 写入，避免 Windows PowerShell / cmd 默认编码把中文写成 “连续问号”。



## 编码硬规则



- 不要使用 `cmd > report.md` 或未指定编码的 PowerShell 重定向写中文 Markdown。

- 推荐使用本 Skill 提供的写入脚本：



```bash

node scripts/write_markdown_utf8.js --out case/result/最终项目总结.md --require-chinese-name --markdown < case/tmp/最终项目总结草稿.md

node scripts/write_markdown_utf8.js --input case/tmp/最终项目总结草稿.md --out case/result/最终项目总结.md --require-chinese-name --markdown

```



- 如果草稿内容已经出现大量 “连续问号” 且没有中文字符，先回到原始结论重新生成，不要覆盖最终报告。

- 报告中不得明文写入 Cookie、Authorization、localStorage、账号标识等敏感内容。



## 章节生成规则



- 必须保留“阶段报告索引”“native addon / NativeProtect 使用情况”“指纹基线一致性”“环境与指纹 API 调用回放明细”“高强度环境检测覆盖矩阵”章节。
- 必须保留“动态资源保鲜与运行时刷新”“补环境框架选择与 Trace 复杂度评估”“最终请求 Session 请求链”“加密参数生成与样本复用检查”“代码质量与中文注释”“最终交付结构”“测试结果”“清理结果”章节。
- 必须写入 `case/result/最终项目总结.md`；除非用户明确要求不生成，否则 `check_final_artifact.js` 会默认检查该中文命名文件。

- 只有用户选择 ruyiPage + RuyiTrace、或用户提供 RuyiTrace NDJSON 日志时，才保留 RuyiTrace 章节；否则删除整章。

- 如果用户选择“不发真实请求，只输出本地参数”，TLS 请求验证和 Session 请求链章节需写明该选择和原因。

- 不要把临时 hook、trace、HAR、浏览器 Profile、截图路径写成最终交付物。

- 最终总结必须引用本 case 已生成的 `case/阶段报告/` 中文阶段报告，例如 `01-需求信息确认.md`、`03-请求样本与可疑参数确认.md`，并说明关键决策来自哪个阶段。

- “环境与指纹 API 调用回放明细”必须按类别分组，例如 `window / global`、`navigator`、`document / DOM`、`canvas`、`webgl` 等；每条记录必须精确到访问的属性、调用的方法、构造函数或 getter / setter，不得只写“补了 navigator / canvas”。

- “指纹值回放”必须记录值来源优先级执行情况：是否优先查看 Trace、Trace 是否未截断可用、Trace 缺失 / 未覆盖 / 4000 或 4096 长字段疑似截断时使用了哪个已确认取证工具补采、是否绑定同一 `baselineId`、是否存在 AI 猜值 / 默认值 / 静态推断进入最终 fixture；长指纹值必须记录完整 `valueLength`、完整 `sha256`、分片信息和 `truncated: false`。

- “高强度环境检测覆盖矩阵”用于记录异常模式、toString 多通道、DataCloneError、Error stack、属性枚举、原型链、MutationObserver、userAgentData、window.chrome、媒体能力、网络 Header / Client Hints 一致性、动态 JS 多版本回归等是否涉及、是否采样、是否已修复和遗留风险。高强度通用排查文档 `high-strength-browser-detection.md` 的入口页优先、指纹随机化风险、自动化痕迹、TLS / Header / Session 一致性和失败排查顺序也必须体现在本矩阵中。



## 模板



```markdown

# Web JS Node.js 补环境项目总结



生成时间：

任务范围：网页端 JS Node.js 补环境



## 1. 目标与边界



- 目标网站 URL：

- 目标页面：

- 目标 API：

- 请求方法：

- 目标加密参数：

- 参数位置：Query / Header / Body / Cookie

- 是否需要登录：

- 取证模式：ruyiPage + RuyiTrace / 仅 ruyiPage / Camoufox + camoufox-reverse-mcp / 仅 Camoufox / CloakBrowser / 用户手动取证 / AI 自行决定

- 最终请求 TLS 指纹兼容客户端：Node.js CycleTLS / Node.js impers / Node.js curl-cffi / curl-cffi-node / Python curl_cffi / Python cffi_curl / Python cyCronet / 不发真实请求

- 最终请求 Session 模式：启用 / 不发真实请求

- 补环境框架选择：不使用补环境框架（默认） / isolated-vm（随包魔改 xbs isolated-vm） / Node.js 内置 vm / jsEnv

- 明确排除：App / 移动端 / Windows / Native / 批量爬虫 / 绕过登录或验证码



## 2. 用户提供材料



- 成功请求样本：

- 响应样本：

- 已知 JS 文件：

- HAR / cURL：

- 浏览器真实输出 fixture：

- RuyiTrace NDJSON：有 / 无 / 未使用

- 其他说明：



## 3. 阶段报告索引

- `阶段报告/01-需求信息确认.md`：已生成 / 未生成
- `阶段报告/02-取证方案确认.md`：已生成 / 未生成 / 未涉及
- `阶段报告/03-请求样本与可疑参数确认.md`：已生成 / 未生成 / 未涉及
- `阶段报告/04-JS文件与入口定位.md`：已生成 / 未生成 / 未涉及
- `阶段报告/05-补环境前置分析.md`：已生成 / 未生成 / 未涉及
- `阶段报告/06-补环境实现记录.md`：已生成 / 未生成 / 未涉及
- `阶段报告/07-验证与清理记录.md`：已生成 / 未生成 / 未涉及
- 阶段报告缺失原因或用户豁免：

## 4. 前置校验结果



- 请求样本完整性：

- 加密参数是否存在：

- JS 文件可获取性：

- 是否需要用户手动登录：

- Cookie / token 状态：

- 临时文件清理状态：



## 5. 取证流程与证据来源



- 使用的取证工具：

- 工具安装 / 可用性检查：

- 抓包 / Hook / 断点策略：

- JS 文件收集来源：

- 关键调用栈来源：

- 可信度说明：



<!-- 未使用 RuyiTrace 时删除本章节 -->

## 6. RuyiTrace 日志使用情况



- NDJSON 路径或来源：

- 导入脚本：

- 命中的 WebAPI：

- 关键证据：`api` / `stack.file` / `line` / `col`

- 由日志推导出的环境依赖：

- 后续环境异常排查是否继续参考 NDJSON：



## 7. 动态资源保鲜与运行时刷新



- 是否存在动态 HTML / JS / challenge：有 / 无

- resource manifest：`case/notes/resource-manifest.json` / 未涉及

- 动态资源类型：入口 HTML / JS bundle / 动态 chunk / challenge JS / 403 风控页面 / 内联脚本 / 其他

- 动态性证据：Cache-Control / 短 TTL / 随机 query / hash 变化 / seed / nonce / Set-Cookie / 会话绑定 / 其他

- 是否影响最终参数生成：是 / 否

- 运行时刷新模块：`result/src/resources/fetch-runtime-resources.js` / 未涉及

- 最终入口刷新顺序：刷新当前资源 → 更新 Cookie / Storage / runtime context → 运行 signer → 发送请求

- 动态快照是否进入 result：否

- `check_dynamic_resources.js` 检查结果：通过 / 未执行，原因



## 8. 加密参数定位结论



- source：

- entry：

- builder：

- writer：

- 参数写入位置：

- 关键 JS 文件：

- 关键函数 / 类 / SDK：

- 未确认项：



## 9. Cookie / Storage / Token 分析



- 类型：登录态 / 设备 Cookie / 风控 Cookie / JS 生成 Cookie / 其他

- 生成或刷新链路：

- 是否纳入最终入口：

- 敏感字段脱敏说明：



## 10. 补环境框架选择与 Trace 复杂度评估

- 补环境框架选择：不使用补环境框架（默认） / isolated-vm（随包魔改 xbs isolated-vm） / Node.js 内置 vm / jsEnv

- 选择来源：用户明确选择 / 用户未选择，按默认不使用

- 是否发生二次提醒或切换：

- Trace 是否存在：有 / 无

- Trace 复杂度等级：低 / 中 / 高 / 未知

- 复杂度依据：WebAPI 类别 / 真实性检测 / 指纹 / 异步 / 状态依赖 / 调用栈分散度

- 重要说明：复杂度评估只用于补环境范围、风险点和优先级，不自动决定补环境框架

- 最终项目 runtime 文件：

- xbs isolated-vm 状态（仅选择 isolated-vm 时填写）：未选择 / 已加载 / ABI 不兼容 / 平台缺失 / API 自检失败

- xbs isolated-vm 二进制来源：随 Skill 资产 / 用户提供替换产物 / 不适用

- Node 版本 / ABI / 平台：

- `window.xbs` API 自检：通过 / 未通过 / 不适用；缺失 API：

- 未选择框架时是否确认无 isolated-vm / vm / jsEnv runtime、`xbs-isolated-vm/` 或 `isolated_vm.node`：是 / 否 / 不适用



## 11. 补环境实现概览



- 运行隔离方式：不使用框架 / xbs isolated-vm / vm / jsEnv / 独立 Node 进程 / 显式隔离 global

- Level 1 基础环境：

- Level 2 指纹真实性：

- Level 3 目标 SDK 专用环境：

- Node 泄露阻断：

- 属性描述符 / 原型链 / 访问器处理：

- 函数、访问器、实例对象 toString 保护：



## 12. native addon / NativeProtect 使用情况



- native 能力检测结果：addon.node 可用 / xbs isolated-vm 可用 / 不可用 / 用户明确豁免（不得写“未使用”而不说明原因）

- native 加载路径：仅写相对路径或“随 Skill 资产加载”；选择 xbs isolated-vm 时写 `xbs-isolated-vm/<platform>-<arch>/isolated_vm.node`，不要写本机绝对路径

- native 导出 API：addon.node 导出 API 或 `window.xbs` 17 个 API：

- 实际使用的 native API：`createNativeFunction` / `createGetter` / `createSetter` / `createNativeObject` / `createProtoChains` / `createNativeCollection` / `createInterceptor` / `getMimeTypesAndPlugins` / `createUndetectable` / `setPrivate` / `getPrivate` / `hasPrivate` / `deletePrivate` / 注册表管理 / 其他；选择 xbs isolated-vm 时注明调用来源为 `window.xbs`

- NativeProtect fallback：未发生 / 已发生；选择 xbs isolated-vm 时如发生 fallback，需说明为什么没有使用 `window.xbs`

- fallback 原因：用户明确要求不使用 native 能力 / addon 或 xbs 缺失 / ABI 不兼容 / native API 调用失败 / 当前 API 不支持 / 其他

- `document.all` 处理：addon `createUndetectable` / xbs `createUndetectable` / JS 近似 fallback / 未涉及

- `navigator.plugins` / `navigator.mimeTypes` 处理：addon `getMimeTypesAndPlugins(config)` / xbs `getMimeTypesAndPlugins(config)` / JS fallback / 未涉及

- 集合对象处理：addon `createNativeCollection` / xbs `createNativeCollection` / JS fallback / 未涉及

- toString 保护覆盖：函数 / 构造函数 / getter / setter / 实例对象

- 阶段输出或 notes 中的补环境初始化加载记录、用户豁免或降级记录：


## 12.1 native 能力缺口闭环



- 是否发生 native 能力缺口：未发生 / 已发生

- 阻塞 API / 行为：

- 触发位置与证据：RuyiTrace / Hook / Node trace / 目标源码位置 / fixture

- 真实浏览器基线摘要：

- 纯 JS fallback 当前结果与差异：

- addon.node 当前结果与差异：

- xbs isolated-vm 当前结果与差异：未选择 isolated-vm / 已测试 / 不适用

- 建议新增或增强 native API：

- 最小行为测试用例位置：`case/notes/native-capability-gap-test.js` / `case/native-capability-gap/<name>.js` / 不适用

- 测试通过状态：已通过 / 未通过 / 等待用户更新 native 能力 / 用户接受临时 workaround / case 阻塞

- 用户选择与原因：扩展 addon.node / 扩展 xbs isolated-vm / 临时 workaround / 暂停 case / 其他

- 临时 workaround 风险说明：仅当前样本路径临时兼容 / 不涉及



## 13. 指纹基线一致性

- baseline 文件：`case/notes/fingerprint-baseline.json` / 未生成，原因：
- baselineId：
- 取证工具与 profile / seed：
- 是否复用同一 profile / seed / 代理 / 语言 / 时区 / UA / Client Hints / screen / WebGL：是 / 否
- 是否发生 baseline diff：否 / 是，diff 文件：`case/notes/fingerprint-baseline-diff.md`
- 冲突字段与处理方式：
- `fingerprint.fixture.json` 是否绑定同一 baselineId：是 / 否 / 不涉及
- 未涉及指纹采样时说明：未涉及 / 仅记录取证基线

## 14. 环境与指纹 API 调用回放明细



- 明细文件：`case/notes/webapi-call-replay-details.md` / `case/notes/webapi-call-replay-details.json` / 未生成，原因：

- 数据来源：RuyiTrace NDJSON / Node trace / Proxy trace / Hook / fixture / 静态分析 / 手动确认

- 值来源优先级：Trace 未截断值优先 / Trace 缺失或未覆盖已补采 / Trace 疑似截断已补采 / 未涉及具体值

- 禁止猜值检查：是否存在 AI 猜值、默认值、随机值、Node.js 模拟库结果进入最终回放：否 / 是，处理方式：

- 记录规则：按 API 类别分组；每条精确到属性访问、属性写入、getter、setter、方法调用、构造函数调用或静态方法调用

- 敏感值处理：Cookie / Authorization / token / localStorage 等不写明文，只写脱敏摘要

- 长字段处理：超过采集上限或 4000 / 4096 疑似截断的字段只写可见长度、最小长度、hash 和 `真实长度 unknown`；不得作为最终回放值，必须记录补采工具、完整 `valueLength`、完整 `sha256`、分片信息和 `truncated: false`，否则写明阻塞

- API 总数：

- 属性读取数量：

- 属性写入数量：

- getter / setter 数量：

- 方法调用数量：

- 构造函数调用数量：

- 指纹 API 数量：

- 未补齐 API 数量：

- fallback API 数量：



### 14.1 分类汇总



| 分类 | 是否涉及 | 典型 API | 属性读取 | 方法调用 | 构造调用 | 指纹 API | 主要证据来源 | 补齐状态 | 备注 |
|---|---|---|---:|---:|---:|---:|---|---|---|
| window / global | 未涉及 / 已涉及 | `window.innerWidth`、`globalThis` |  |  |  |  |  |  |  |
| navigator | 未涉及 / 已涉及 | `navigator.userAgent`、`Navigator.prototype.webdriver` |  |  |  |  |  |  |  |
| document / DOM | 未涉及 / 已涉及 | `document.createElement`、`document.cookie` |  |  |  |  |  |  |  |
| location / history | 未涉及 / 已涉及 | `location.href`、`history.pushState` |  |  |  |  |  |  |  |
| screen | 未涉及 / 已涉及 | `screen.width`、`screen.colorDepth` |  |  |  |  |  |  |  |
| storage / cookie | 未涉及 / 已涉及 | `localStorage.getItem`、`document.cookie` |  |  |  |  |  |  |  |
| crypto / random | 未涉及 / 已涉及 | `crypto.getRandomValues`、`Math.random` |  |  |  |  |  |  |  |
| performance / timing | 未涉及 / 已涉及 | `performance.now`、`Date.now` |  |  |  |  |  |  |  |
| network | 未涉及 / 已涉及 | `fetch`、`XMLHttpRequest.prototype.open` |  |  |  |  |  |  |  |
| canvas | 未涉及 / 已涉及 | `HTMLCanvasElement.prototype.getContext`、`toDataURL` |  |  |  |  |  |  |  |
| webgl | 未涉及 / 已涉及 | `WebGLRenderingContext.prototype.getParameter` |  |  |  |  |  |  |  |
| webgpu | 未涉及 / 已涉及 | `navigator.gpu`、`GPUAdapter` |  |  |  |  |  |  |  |
| audio | 未涉及 / 已涉及 | `AudioContext`、`AnalyserNode.prototype.getFloatFrequencyData` |  |  |  |  |  |  |  |
| font / CSS / DOM geometry | 未涉及 / 已涉及 | `getComputedStyle`、`getBoundingClientRect` |  |  |  |  |  |  |  |
| events / trusted input | 未涉及 / 已涉及 | `Event.prototype.isTrusted`、`MouseEvent` |  |  |  |  |  |  |  |
| worker / wasm / postMessage | 未涉及 / 已涉及 | `Worker`、`WebAssembly.instantiate`、`postMessage` |  |  |  |  |  |  |  |
| 其他 | 未涉及 / 已涉及 |  |  |  |  |  |  |  |  |



### 14.2 分类明细



> 未涉及的分类写“未涉及”；涉及的分类必须列出明细。来源为推断时必须标记“静态推断 / 未验证”，不得写成事实。



#### window / global



| API 路径 | 类型 | 所属对象 / 原型 | 来源证据 | 调用参数摘要 | 返回值 / 回放值摘要 | 补环境实现 | 真实性保护 | 验证结果 | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| 未涉及 |  |  |  |  |  |  |  |  |  |



#### navigator



| API 路径 | 类型 | 所属对象 / 原型 | 来源证据 | 调用参数摘要 | 返回值 / 回放值摘要 | 补环境实现 | 真实性保护 | 验证结果 | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| `navigator.userAgent` | getter / 属性读取 | `Navigator.prototype` | RuyiTrace / fixture / Hook | 无 | UA 脱敏摘要 | addon / xbs getter / fallback | descriptor + getter toString | 通过 / 未验证 | 示例行，真实报告中按 case 填写 |



#### document / DOM



| API 路径 | 类型 | 所属对象 / 原型 | 来源证据 | 调用参数摘要 | 返回值 / 回放值摘要 | 补环境实现 | 真实性保护 | 验证结果 | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| `Document.prototype.createElement` | 方法调用 | `Document.prototype` | RuyiTrace / Hook | `"canvas"` | `HTMLCanvasElement` 实例摘要 | addon / xbs native function | 原型链 + function toString | 通过 / 未验证 | 示例行，真实报告中按 case 填写 |



#### canvas



| API 路径 | 类型 | 所属对象 / 原型 | 来源证据 | 调用参数摘要 | 返回值 / 回放值摘要 | 补环境实现 | 真实性保护 | 验证结果 | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| `HTMLCanvasElement.prototype.getContext` | 方法调用 | `HTMLCanvasElement.prototype` | RuyiTrace / Hook / fixture | `"2d"` | `CanvasRenderingContext2D` 摘要 | addon / xbs native function + fixture replay | native-like + 原型链 | 通过 / 未验证 | 示例行，真实报告中按 case 填写 |



#### webgl



| API 路径 | 类型 | 所属对象 / 原型 | 来源证据 | 调用参数摘要 | 返回值 / 回放值摘要 | 补环境实现 | 真实性保护 | 验证结果 | 备注 |
|---|---|---|---|---|---|---|---|---|---|
| `WebGLRenderingContext.prototype.getParameter` | 方法调用 | `WebGLRenderingContext.prototype` | RuyiTrace / Hook / fixture | 参数枚举值摘要 | 真实浏览器回放值摘要 | addon / xbs native function + fixture replay | native-like + 原型链 | 通过 / 未验证 | 示例行，真实报告中按 case 填写 |



#### 其他分类



按实际涉及的 `location / history`、`screen`、`storage / cookie`、`crypto / random`、`performance / timing`、`network`、`webgpu`、`audio`、`font / CSS / DOM geometry`、`events / trusted input`、`worker / wasm / postMessage` 或其他 WebAPI 分类补充同样表格。



## 15. 高强度环境检测覆盖矩阵



- 是否启用高强度环境行为 diff：是 / 否，原因：

- 浏览器基线文件：`case/fixtures/browser-env-baseline.json` / 未生成，原因：

- Node 补环境审计文件：`case/tmp/node-env-audit.json` / 未生成，原因：

- diff 记录：`case/notes/high-intensity-env-diff.md` / 未生成，原因：

- 是否涉及 JSVMP：否 / 是；处理方式：不主动分析源码，仅围绕环境调用、writer 和行为 diff 推进

- 动态风控 JS 多版本回归：未涉及 / 已执行；样本数量：



| 检测类别 | 是否涉及 | 浏览器基线 | Node 对比 | 修复状态 | 遗留风险 / 说明 |
|---|---|---|---|---|---|
| 异常模式指纹 | 未涉及 / 已涉及 | 已采样 / 未采样 | 已对比 / 未对比 | 通过 / 部分通过 / 未修复 |  |
| Node 泄露与本机路径 | 未涉及 / 已涉及 | 已采样 / 未采样 | 已对比 / 未对比 | 通过 / 部分通过 / 未修复 |  |
| toString 多通道 | 未涉及 / 已涉及 | 已采样 / 未采样 | 已对比 / 未对比 | 通过 / 部分通过 / 未修复 | addon 优先；NativeProtect fallback 需覆盖多通道 |
| structuredClone / postMessage DataCloneError | 未涉及 / 已涉及 | 已采样 / 未采样 | 已对比 / 未对比 | 通过 / 部分通过 / 未修复 | NativeProtect fallback 需改写 clone error 泄露 |
| Error stack / eval stack | 未涉及 / 已涉及 | 已采样 / 未采样 | 已对比 / 未对比 | 通过 / 部分通过 / 未修复 |  |
| 属性描述符与枚举顺序 | 未涉及 / 已涉及 | 已采样 / 未采样 | 已对比 / 未对比 | 通过 / 部分通过 / 未修复 |  |
| 原型链 walk 与 brand check | 未涉及 / 已涉及 | 已采样 / 未采样 | 已对比 / 未对比 | 通过 / 部分通过 / 未修复 |  |
| MutationObserver / Observer 行为 | 未涉及 / 已涉及 | 已采样 / 未采样 | 已对比 / 未对比 | 通过 / 部分通过 / 未修复 |  |
| navigator.userAgentData / Client Hints | 未涉及 / 已涉及 | 已采样 / 未采样 | 已对比 / 未对比 | 通过 / 部分通过 / 未修复 |  |
| window.chrome | 未涉及 / 已涉及 | 已采样 / 未采样 | 已对比 / 未对比 | 通过 / 部分通过 / 未修复 |  |
| canPlayType / mediaSession | 未涉及 / 已涉及 | 已采样 / 未采样 | 已对比 / 未对比 | 通过 / 部分通过 / 未修复 |  |
| 网络 Header / Client Hints 一致性 | 未涉及 / 已涉及 | 已采样 / 未采样 | 已对比 / 未对比 | 通过 / 部分通过 / 未修复 |  |
| 动态 JS 多版本回归 | 未涉及 / 已涉及 | 已采样 / 未采样 | 已对比 / 未对比 | 通过 / 部分通过 / 未修复 |  |
| TLS / JA3 / JA4 / Header 顺序 / Session 链 | 未涉及 / 已涉及 | 已采样 / 未采样 | 已对比 / 未对比 | 通过 / 部分通过 / 未修复 | 最终请求与取证 baseline 一致 |
| 自动化 / CDP / Headless / isTrusted 风险 | 未涉及 / 已涉及 | 已采样 / 未采样 | 已对比 / 未对比 | 通过 / 部分通过 / 未修复 | 取证阶段从一开始使用已确认高保真工具 |
| Permissions / Plugins / MimeTypes | 未涉及 / 已涉及 | 已采样 / 未采样 | 已对比 / 未对比 | 通过 / 部分通过 / 未修复 | addon-first，禁止普通数组 / 空对象主路径 |
| Canvas / WebGL / Audio / Speech / Fonts / DOM 几何随机化风险 | 未涉及 / 已涉及 | 已采样 / 未采样 | 已对比 / 未对比 | 通过 / 部分通过 / 未修复 | 禁止 AI 猜值、默认值和每次随机化 |
| 入口 HTML / 前置 JS / 状态链 | 未涉及 / 已涉及 | 已采样 / 未采样 | 已对比 / 未对比 | 通过 / 部分通过 / 未修复 | 不得只围绕单 API cURL 判断 |



## 16. 指纹值回放



- 是否涉及指纹 API：

- 值来源优先级执行情况：已优先检查 Trace / 未选择 Trace / Trace 缺失 / Trace 未覆盖 / Trace 4000 或 4096 长字段疑似截断 / Trace baseline 冲突 / 不涉及

- Trace 未截断可用值：API、字段路径、证据文件、长度、hash：

- Trace 不可用或疑似截断时的补采工具：ruyiPage / Camoufox / CloakBrowser / 用户手动浏览器 / 其他；采样是否复用同一 `baselineId`：

- 长指纹值完整性：涉及的 Canvas / WebGL / WebGPU / Audio / 字体 / DOM 几何 API、trace 可见长度、真实长度是否 unknown、是否已补采完整值、`valueLength`、`sha256`、分片数量、`truncated: false`：

- 真实浏览器采样来源：

- 禁止猜值检查：AI 猜值 / 默认值 / 随机值 / Node.js 模拟库结果是否进入最终 fixture：否 / 是，处理方式：

- 覆盖范围：Canvas / WebGL / WebGPU / Audio / 字体 / DOM 几何 / navigator / screen / window / document / 其他

- fixture 文件：

- 回放匹配规则：

- 缺失样本处理：



## 17. 加密参数生成与样本复用检查

- cURL / HAR / fixture 中的样本加密值是否只作为 expected：
- 最终入口如何生成参数：目标 JS 入口 / signer / 其他
- 是否发现硬编码样本值：否
- `check_final_artifact.js` 复用检查结果：

## 18. 代码质量与中文注释

- 是否已运行 `check_code_quality.js`：
- 模块拆分情况：
- isolated-vm 文件化模块情况：未选择 isolated-vm / 已按真实文件拆分 / 仍存在字符串脚本，原因：
- isolated-vm 环境模块清单：`src/env/browser-objects/navigator.js` / `document.js` / `window.js` / `src/env/fingerprint/canvas.js` / `webgl.js` / 其他
- 单文件 / 单函数复杂度：
- 中文注释覆盖：文件头 / WebAPI / getter / setter / addon-first / fallback / 指纹回放 / 加密入口
- 中文注释编码：UTF-8 正常 / 存在问题
- 中文注释是否包含问号、连续问号或乱码：否
- 修复过的可读性问题：

## 19. TLS 请求验证与 Session 请求链



- 是否发送真实请求：是 / 否

- 客户端：Node.js CycleTLS / Node.js impers / Node.js curl-cffi / curl-cffi-node / Python curl_cffi / Python cffi_curl / Python cyCronet / 不发真实请求

- Session 模式：已启用 / 不发真实请求

- Session client 文件：`result/src/request/client.js` / `result/src/request_client.py` / 不适用

- 请求链是否共用同一 session：是 / 否；包含：动态资源刷新 / Cookie 生成 / challenge / 目标 API

- Cookie jar 来源与更新点：

- 是否复用同一 UA / Client Hints / Accept-Language / Referer / Origin / proxy / fingerprint baseline：

- Session 销毁方式：close / exit / dispose / Cookie jar 清理 / 不适用

- TLS / JA3 / HTTP2 / Header 顺序策略：

- 请求次数与授权范围：

- 响应状态：

- 业务成功判断：

- 失败原因或限制：



## 20. 最终交付结构



- result 目录：

- 唯一入口：`final.js` / `final.py`

- 必要模块：

- 配置模板：

- 是否包含浏览器自动化代码：否

- 是否包含临时测试文件：否

- isolated-vm 是否包含大段 `String.raw` / `*_SCRIPT` 补环境源码：否 / 不适用

- 最终请求实现：Node.js / Python TLS 指纹兼容 Session 客户端 / 不发真实请求



## 21. 测试结果



- 信息完整性测试：

- addon-first 默认硬性测试：
- 代码质量与中文注释测试：

- UTF-8 Markdown / 默认最终总结生成测试：

- 补环境真实性检查：

- 高强度环境检测覆盖矩阵检查：

- 指纹基线一致性检查：

- Session 请求链检查：

- 最终产物检查：

- 清理 dry-run：



## 22. 清理结果



- 已删除的临时文件：

- 保留的必要文件：

- 敏感材料处理：

- 仍需用户确认处理的文件：



## 23. 风险与后续建议



- 未确认风险：

- 需要补充样本：

- 可优化点：

- 后续复测建议：

```

