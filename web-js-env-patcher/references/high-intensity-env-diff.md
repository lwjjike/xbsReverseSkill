# 高强度环境检测与浏览器行为 diff

当目标出现 Shape / F5 / Akamai / DataDome / Kasada / reese84 / bx-* 等浏览器完整性检测、环境分数异常、302/403 风控跳转、环境 trace 很分散，或出现异常模式、toString、堆栈、属性枚举、原型链、MutationObserver、userAgentData、window.chrome、媒体能力、Client Hints 一致性等问题时读取本文件。

本文件只用于网页端 Node.js 补环境和授权样本验证；遇到 JSVMP / opcode / 字节码解释器时，仍遵循“不主动分析 JSVMP 源码”的边界，只记录其为高强度风控风险，并围绕环境调用、writer、行为 diff 与请求链路推进。

## 核心原则

- 真实浏览器是标准答案；补环境不是只追求“不报错”或“当前 sign 一致”，还要让关键环境行为与取证浏览器一致。
- RuyiTrace / Node trace 用于定位访问了哪些 API；行为是否一致必须通过浏览器基线采样与 Node 补环境输出 diff 验证。
- 高强度检测覆盖要写入阶段报告和最终总结，不能只在调试输出中口头说明。
- 所有 probe、Hook、trace、浏览器自动化脚本只允许出现在前置取证和 notes / tmp 中，不得进入最终 `result/` 交付代码。

## 推荐流程

1. 根据 RuyiTrace / Hook / Node trace 生成环境 API 清单。
2. 在用户确认的真实浏览器取证模式中运行最小行为 probe，生成 `case/fixtures/browser-env-baseline.json`。
3. 在 Node 补环境中运行同一组 probe，生成 `case/tmp/node-env-audit.json`。
4. 输出 `case/notes/high-intensity-env-diff.md`，逐项记录一致 / 不一致 / 未涉及 / 未采样。
5. 按差异修复 env，并把修复内容写入 `case/notes/代码变更记忆.md` 和阶段报告。
6. 交付前把覆盖矩阵写入 `case/result/最终项目总结.md`。

## 高强度检测类别

| 类别 | 需要对比的内容 | 典型证据 |
|---|---|---|
| 异常模式 | `error.name`、`constructor.name`、`message`、`String(error)`、stack 首行；循环 `__proto__`、incompatible receiver、非法 `call/apply` | browser baseline / Node audit |
| Node 泄露 | `process`、`process.env`、`NODE_DISABLE_COLORS`、`NO_COLOR`、`errno`、`error`、`Buffer`、`global`、`require`、`module`、本机路径、`node:internal` | Node 泄露检查 / stack probe |
| toString 多通道 | `fn.toString()`、`Function.prototype.toString.call(fn)`、保存旧 FTS 调用、`String(fn)`、`fn + ""`、`fn.toString.toString()` | addon / NativeProtect 自检 |
| DataCloneError | `structuredClone(fn)`、`MessagePort.prototype.postMessage(fn)` 的错误 message / stack 是否暴露 fallback 函数源码 | browser baseline / Node audit |
| 属性枚举与描述符 | `Object.getOwnPropertyDescriptor`、`__lookupGetter__`、`__lookupSetter__`、`Object.getOwnPropertyNames`、`Object.keys`、`Reflect.ownKeys`、`in`、`hasOwnProperty`、`propertyIsEnumerable`、`for...in` | descriptor baseline |
| 原型链与 brand check | `Object.getPrototypeOf` walk、`__proto__`、`constructor.name`、`Symbol.toStringTag`、`Object.prototype.toString.call`、`instanceof`、跨原型 `call/apply` | prototype baseline |
| DOM 行为 | `document.createElement(tag)` tag 映射、HTML 元素继承链、`MutationObserver.observe` 异步 records、`attributeFilter`、参数错误 | DOM probe |
| Chrome / Navigator | `navigator.userAgentData`、`getHighEntropyValues`、`window.chrome`、`chrome.csi`、`chrome.loadTimes`、`chrome.app`、`navigator.mediaSession` | browser baseline |
| 媒体能力 | `HTMLMediaElement.prototype.canPlayType` MIME 返回表、Audio / Video 构造链、mediaSession | media probe |
| 指纹终端 API | Canvas / WebGL / WebGPU / Audio / 字体 / DOM 几何真实采样值与调用参数 | fingerprint fixture |
| 网络一致性 | `User-Agent`、`sec-ch-ua`、`sec-ch-ua-platform`、`sec-fetch-*`、Referer、Origin、Cookie 顺序、Header 顺序、HTTP/2 pseudo-header 顺序 | HAR / echo 服务 / TLS 客户端配置 |
| 动态 JS 多版本 | 多次首访 / challenge / JS bundle 的 hash、seed、nonce、Set-Cookie、writer 是否稳定 | resource manifest / 多 fixture |

## toString 与 DataCloneError 要点

- addon / xbs native-first 创建的函数应作为首选；用户实测 addon 对多通道 toString 检测没有问题。
- NativeProtect 只是 fallback；如果使用 NativeProtect，必须采用带 `structuredClone` / `MessagePort.prototype.postMessage` DataCloneError 改写的版本，避免错误信息暴露 fallback 函数源码。
- 如果当前上下文不存在 `structuredClone` 或 `MessagePort`，记录“不涉及 / 宿主不可用”；不得为了测试而把宿主 Node 实现透传给目标 JS。

## API 与网络指纹一致性

补环境中的 JS 指纹值必须与最终请求头一致：

- `navigator.userAgent` 对齐 `User-Agent`。
- `navigator.userAgentData.brands/fullVersionList/platform/mobile` 对齐 `sec-ch-ua`、`sec-ch-ua-platform`、`sec-ch-ua-mobile`。
- `navigator.language/languages` 对齐 `Accept-Language`。
- `location.href/origin/referrer` 对齐 `Referer`、`Origin`、`sec-fetch-site`。
- TLS 客户端选择不能替代 Header / Client Hints / Fetch Metadata 一致性；两者都要记录。

## 输出要求

阶段报告和最终总结至少记录：

- 是否启用高强度环境行为 diff：是 / 否，原因。
- 浏览器基线文件和 Node audit 文件。
- 已覆盖类别、未涉及类别、未采样类别。
- 每个不一致项的修复状态、fallback 原因和遗留风险。
- 是否存在动态风控 JS 多版本回归，以及回归样本数量。
