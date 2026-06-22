# Node 泄露阻断与静默失败排查

本文件用于进入 Node.js 补环境前后，防止目标 JS 误读 Node 环境，并排查“不报错但结果不一致”的问题。

## Node 泄露阻断原则

目标网页 JS 应看到浏览器环境，而不是 Node.js 环境。探测脚本和最终 runner 都必须先阻断 Node 能力变量，再安装浏览器式环境对象。

基础 Node 能力泄露清单：

```text
process, Buffer, require, module, exports, global, __dirname, __filename,
setImmediate, clearImmediate, Error.prepareStackTrace, Node 专属堆栈路径
```

新版 Node Web API 兼容层也可能成为泄露面，必须删除、隔离或用浏览器真实样本覆盖：

```text
navigator, localStorage, sessionStorage, performance, fetch, Headers,
Request, Response, FormData, File, Blob, WebSocket, EventSource,
BroadcastChannel, MessageChannel, MessagePort, CompressionStream,
DecompressionStream, URLPattern, CloseEvent, ErrorEvent
```

以下对象在浏览器中也常见，但 Node 的实现、原型、属性描述符、`toString`、异常类型、内部状态或网络栈可能与真实浏览器不同；只要目标 JS 会读取或参与签名，就不要盲目透传宿主实现，应按浏览器样本、RuyiTrace 证据或可控桩函数安装：

```text
AbortController, AbortSignal, Event, EventTarget, CustomEvent, MessageEvent,
DOMException, structuredClone, atob, btoa, URL, URLSearchParams, TextEncoder,
TextDecoder, TextEncoderStream, TextDecoderStream, ReadableStream,
WritableStream, TransformStream, PerformanceEntry, PerformanceMark,
PerformanceMeasure, PerformanceObserver, PerformanceResourceTiming,
Crypto, CryptoKey, SubtleCrypto, WebAssembly, queueMicrotask
```

版本结论以 Node 官方文档为准：

- `Navigator` / `navigator` 是 Node v21.0.0 新增，不是 Node 20 官方新增；`navigator.userAgent` 自 v21.1.0 起可能返回 `Node.js/<major>`。
- `navigator.language` / `languages` / `platform` 自 Node v21.2.0 起反映宿主系统或 ICU，`navigator.locks` 自 Node v24.5.0 起可能存在。
- `localStorage` / `sessionStorage` 是 Node v22.4.0 引入的 Web Storage 兼容层；Node v25+ 行为又有变化，不能当作页面级浏览器 Storage 直接复用。
- Node 的 `fetch` 基于 undici，可通过 `process.versions.undici` 看到宿主实现版本；最终真实请求仍应由已确认的 TLS 指纹兼容客户端完成，不要把宿主 `fetch` 当作浏览器网络栈。
- Node 全局 `performance` 是 `perf_hooks.performance`，可能暴露 `nodeTiming`、`eventLoopUtilization`、`timerify`、`markResourceTiming` 等浏览器没有或语义不同的字段。

特别注意：补环境前一旦检测到这些宿主对象，必须先移除、隔离或显式覆盖，再安装浏览器采样值；不得直接复用宿主对象。若目标真实浏览器也存在同名 API，例如 `navigator.locks`、`crypto`、`ReadableStream`，也应按浏览器样本补其值、描述符和原型链，而不是沿用 Node 宿主对象。

### 运行上下文隔离要求

- 使用 `vm.createContext` 时，不要把宿主函数、宿主数组、宿主类直接塞进目标运行上下文。
- `URL`、`TextEncoder`、`fetch`、`atob`、`console` 等应在目标运行上下文内定义，或确认不会通过 `constructor.constructor` 拿到宿主 `process`。
- 禁止把 `require`、`process`、`Buffer` 作为调试便利变量暴露给目标 JS。
- 禁止直接复用宿主 `navigator`、`performance`、`localStorage`、`sessionStorage`、`fetch`、`WebSocket` 等 Node Web API 兼容层；这些对象必须由 `env.js` 按浏览器样本显式安装。
- 如果最终 runner 无法使用隔离 global，启动后第一步先 `Reflect.deleteProperty(globalThis, "navigator")` 等方式移除宿主 Web API，再用 `Object.defineProperty` 安装浏览器式对象。
- 对 `URL`、`URLSearchParams`、`TextEncoder`、`TextDecoder`、`crypto`、`WebAssembly`、Streams、Events 等“浏览器也有但 Node 也提供”的对象，先判断目标是否会检测原型、描述符、异常或输出；若会检测，使用浏览器采样值或补环境实现，不要直接透传宿主构造器。
- 目标 JS 需要的环境对象要通过 `env.js` 明确安装，不要把 Node 全局对象透传。
- 最终交付前运行 `scripts/check_node_leakage.js`，并在 notes 中记录阻断结论。

### 快速自检表达式

在目标 JS 所在运行上下文中执行以下表达式，期望均不暴露 Node 能力：

```javascript
typeof process === "undefined"
typeof Buffer === "undefined"
typeof require === "undefined"
typeof module === "undefined"
typeof global === "undefined"
Function("return typeof process")() === "undefined"
!/^Node\.js\//.test(String(navigator && navigator.userAgent || ""))
!("nodeTiming" in performance)
!("eventLoopUtilization" in performance)
!("timerify" in performance)
typeof process === "undefined" || !process.versions || !process.versions.undici
```

如果任一表达式暴露 Node 能力，或 `navigator.userAgent` 显示 `Node.js/<major>`，或 `performance` 暴露 `nodeTiming` / `eventLoopUtilization` / `timerify`，先修运行上下文隔离，不要继续补环境。


### Node 21+ navigator 与 Node Web API 覆盖规则

- 检测到 `globalThis.navigator` 存在时，不要假设它是浏览器 navigator；先检查 `navigator.userAgent` 是否以 `Node.js/` 开头。
- 若宿主 Node 提供 `navigator`，补环境初始化前必须删除或遮蔽宿主对象，再按浏览器 fixture 安装 `Navigator.prototype`、getter、`plugins`、`mimeTypes`、`languages` 等。
- 检测到宿主 `performance` 时，必须确认目标上下文不暴露 Node 专属 `nodeTiming`、`eventLoopUtilization`、`timerify`、`markResourceTiming`。
- 检测到宿主 `localStorage` / `sessionStorage` 时，必须替换为浏览器页面级 Storage 语义，并使用请求样本、RuyiTrace 或 fixture 中的键值。
- 检测到宿主 `fetch` / `WebSocket` / `BroadcastChannel` / `MessageChannel` 等时，不要直接透传到目标 JS；探测模式使用桩函数记录调用，最终请求由已确认 TLS 指纹兼容客户端实现。

## 静默失败排查清单

当目标 JS 能跑完但 sign/token 不一致，按以下顺序排查：

1. **请求样本一致性**：URL、Query 排序、Body 字符串、Header 大小写、Content-Type、Referer、Origin 是否一致。
2. **SDK 初始化参数**：appId、版本号、平台、渠道、页面路径、nonce、server seed、初始化时机是否一致。
3. **登录态和存储**：Cookie、localStorage、sessionStorage、IndexedDB 摘要是否一致；敏感值不要写入最终报告。
4. **时间和随机数**：`Date.now`、`new Date()`、`performance.now`、`Math.random`、`crypto.getRandomValues` 是否可复现。
5. **浏览器指纹**：UA、language、timezone、screen、devicePixelRatio、plugins、mimeTypes、canvas、WebGL。
6. **加载顺序**：目标 JS 是否在 env 安装前读取环境；入口模块是否需要先执行 runtime chunk。
7. **toString/native-like**：函数、getter、setter、构造函数是否返回浏览器风格字符串。
8. **属性描述符**：enumerable、configurable、writable、getter/setter 是否与浏览器接近。
9. **原型链**：实例 `constructor`、`instanceof`、`Object.prototype.toString` 是否合理。
10. **特殊对象**：`document.all`、`HTMLAllCollection`、`navigator.plugins`、`mimeTypes` 是否被检测。
11. **动态代码**：eval、new Function、setTimeout 字符串、混淆解包结果是否漏执行。
12. **Worker/WASM**：是否实际在 Worker、iframe、WASM 中生成参数，需要单独搬运消息链。

## Cookie 过期的静默失败排查

Cookie 相关失败先分类，再决定是否让用户补样本：

1. **登录态 / 授权 Cookie**：如果 Cookie 与账号、会话、SSO、Authorization 或权限绑定，不要尝试绕过；让用户在所选取证工具中手动登录，或提供授权样本。
2. **非登录 Cookie**：如果目标不需要登录，或 Cookie 是设备标识、首访标识、风控标识、JS 生成值、challenge 派生值，不要默认要求用户重新提供新 Cookie；应分析生成链路。
3. **来源定位**：
   - 服务端 `Set-Cookie`：检查是否需要先发起首访 / challenge 请求，并在最终 Node.js / Python 请求客户端中维护 Cookie jar。
   - 前端 `document.cookie = ...`：用 Hook / RuyiTrace 查 writer 和调用栈。
   - JS 计算：按 `source → entry → builder → writer` 纳入补环境。
   - Storage 派生：检查 localStorage / sessionStorage / IndexedDB 摘要是否与浏览器样本一致。
4. **最终交付**：非登录 Cookie 的生成或刷新应进入最终入口脚本；入口运行后先生成 / 刷新 Cookie，再生成加密参数并发送 Node.js / Python 模拟请求。

不要把“重新拿一份新 Cookie”作为默认答案；它只能用于登录态 / 授权态、不可复现的一次性服务端状态，或用户明确只做离线样本复现的场景。

## 六项纯计算预检

补环境前先证明 Node 与浏览器的基础纯计算差异不会影响结果。若差异明显，先记录，不要直接归咎于环境对象。

| 项目 | 检查内容 | 目的 |
|---|---|---|
| Math | `Math.imul`、浮点精度、三角函数边界 | 排除 JS 引擎数学差异 |
| String/Unicode | UTF-8、emoji、中文、surrogate pair | 排除编码差异 |
| Array/Object | sort、JSON.stringify、属性枚举顺序 | 排除序列化差异 |
| Date/Timezone | 时区、ISO 字符串、时间戳 | 排除时间格式差异 |
| Encoding | atob/btoa、TextEncoder、URLSearchParams | 排除编码和 Query 序列化差异 |
| Random | Math.random、crypto.getRandomValues 是否被依赖 | 判断是否要固定随机源 |

使用：

```bash
node scripts/precheck_runtime.js --markdown
node scripts/precheck_runtime.js --json
```

浏览器侧也运行同类片段，把结果放入 `notes/runtime-precheck-browser.json`，再与 Node 结果比对。

## init 参数检查

很多 SDK 签名失败不是缺环境，而是初始化参数不完整。补环境前必须确认：

- SDK 初始化函数是否已执行。
- appId / tenantId / clientId / channel / version 是否来自页面配置。
- 初始化是否读取 meta 标签、script 标签、window 全局配置或 localStorage。
- 是否需要先加载 runtime chunk、vendor chunk、polyfill chunk。
- 初始化是否异步等待网络、Worker、WASM 或事件。
- 入口函数调用前是否需要触发页面事件或队列 flush。

输出模板：

```markdown
## SDK / 入口初始化检查

- 初始化函数：
- 初始化参数来源：
- 必需全局配置：
- 必需存储值：
- 必需 Cookie：
- 必需加载顺序：
- 当前缺失：
- 是否可以调用入口：是 / 否
```
