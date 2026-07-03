# 高强度浏览器环境检测通用排查指南

本文件用于从 Cloudflare / Turnstile / Akamai / DataDome / Kasada / Shape / F5 等高强度检测样本中抽象通用补环境要求。它不是任何厂商的专用绕过流程，也不用于生成或伪造 challenge、验证码、访问控制 Cookie 或第三方防护 token；只用于授权范围内的网页端 Node.js 补环境、取证一致性检查和最终请求链验证。

## 触发条件

出现以下任一现象时读取本文件，并把结论写入阶段报告：

- HTTP 403 / 429 / 503、challenge 页面、security check、bot block、verify、captcha、WAF / risk control 页面。
- HTML 中注入 challenge / detection / telemetry / fingerprint 脚本，或目标 API 依赖入口页 Cookie、Storage、seed、nonce、动态 JS。
- 目标 JS 访问大量环境 API、指纹 API、自动化检测 honeypot，或 trace 中 API 类别分散。
- 单独请求 API 失败，但真实浏览器从入口页访问后成功。
- 请求成功依赖 UA / Client Hints / CookieJar / Storage / TLS / 代理 / 请求顺序一致。

## 非目标

不得把本文件解释为：

- 生成或伪造 `cf_clearance`、`__cf_bm`、验证码 token、Turnstile token、设备校验 token 或访问控制凭证。
- 自动破解验证码、绕过登录、绕过 MFA 或绕过访问控制。
- 把浏览器自动化作为最终交付项目的一部分。
- 主动分析 JSVMP opcode / 字节码源码；遇到 JSVMP 只围绕环境调用、writer、行为 diff 和请求链推进。

## 高强度检测面总览

| 类别 | 重点排查 | 通用处理原则 |
|---|---|---|
| 环境真实性 | 原型链、属性描述符、getter/setter、非法构造、brand check、枚举顺序、Error stack、DataCloneError、toString 多通道 | 按 `env-object-model.md`、`env-native-protection.md`、`addon-api.md`，addon-first / xbs native-first |
| 指纹值 | Canvas、WebGL、WebGPU、Audio、Speech、Fonts、DOM geometry、Permissions、Plugins、MimeTypes、MediaDevices、WebRTC、screen、UA-CH | `fingerprint-value-replay.md`：Trace 未截断优先，截断 / 缺失则真实浏览器采样，禁止 AI 猜值和随机化 |
| 自动化痕迹 | `navigator.webdriver`、Selenium / PhantomJS / NightmareJS / ChromeDriver 痕迹、CDP / DevTools 侧信道、headless 差异、`isTrusted` | 从第一次取证起使用用户确认的 ruyiPage / Camoufox / CloakBrowser / 手动浏览器，固定 baseline |
| 浏览器状态 | Cookie、localStorage、sessionStorage、IndexedDB、Cache、ServiceWorker、权限状态、visibility、focus、history | 入口页优先，记录生成 / 刷新链路，不把过期状态误判为补环境失败 |
| 网络一致性 | TLS JA3/JA4、HTTP/2、Header 顺序、Accept-Encoding、UA、UA-CH、Sec-Fetch、Referer、Origin、Accept-Language、代理地区 | `tls-request-validation.md` + `session-request-chain.md`，最终请求使用 Session + TLS 指纹兼容客户端 |
| 请求链与时序 | 入口 HTML、动态 JS、检测脚本、前置接口、目标 API、请求间隔、Cookie 变化 | 不孤立重放单个 API，保存 request-chain manifest 与失败排查结论 |

## 入口页优先原则

高强度检测下，单个 API cURL 通常不是完整状态来源。进入补环境前必须确认：

1. 入口 HTML URL 与目标 API URL 的关系。
2. 入口页是否注入检测脚本、动态 seed、nonce、challenge 资源或 Set-Cookie。
3. 目标 API 是否依赖入口页产生的 Cookie / Storage / JS runtime 状态。
4. 是否存在动态 HTML / JS 资源过期风险，必要时按 `dynamic-resource-freshness.md` 在最终入口运行时刷新。
5. 如果用户只提供 API cURL 且返回风控 / challenge，应暂停要求入口页、HAR、浏览器取证证据或用户确认无法提供，不得直接盲补 API 参数。

## 指纹值不能随机化

高强度检测中，随机化或伪装不一致的 Canvas / WebGL / Audio / 字体 / DOM 几何结果，可能比固定真实值更容易暴露。硬性规则：

- 不使用 `Math.random()`、时间戳、机器默认值或 AI 经验生成指纹结果。
- 不把 `node-canvas`、`headless-gl`、`jsdom` 等 Node 模拟库结果当最终真实值。
- 不每次取证生成一套新 UA / 语言 / 时区 / screen / WebGL / Canvas / Audio 指纹。
- 优先 RuyiTrace / trace 未截断值；trace 缺失、未覆盖或疑似截断时，用用户确认的取证工具在同一 `baselineId` 下采样。
- 每条 fixture 记录 `source / capturedBy / traceStatus / baselineId / valueLength / hash / truncated`。

## 自动化与 CDP 风险清单

取证阶段出现以下信号时，不要继续普通自动化路径，应回到 `browser-acquisition.md` 重新确认工具和 baseline：

- `navigator.webdriver`、`window._selenium`、`window.callSelenium`、`window.callPhantom`、`window._phantom`、`window.__nightmare`、`window.domAutomation`、`window.domAutomationController`。
- `HeadlessChrome` UA、无插件 / 无 mimeTypes / permissions 异常、WebGL / Canvas 被隐私插件随机化或伪装。
- CDP / DevTools / Runtime 侧信道、异常 `console` / stack 行为、被页面检测到调试器或自动化 hook。
- 普通 `dispatchEvent` 产生 `isTrusted=false`，或鼠标 / 键盘 / 拖拽轨迹不可信。
- Profile 为空导致 Cookie / Storage / 权限状态缺失，或每次启动工具重新随机指纹。

## 高强度失败排查顺序

遇到最终请求失败、参数不一致、403 / 429 / 风控页、静默失败时，按以下顺序排查，不要直接反复改补环境代码：

1. 是否拿到 challenge / 风控页而非业务页。
2. 是否缺少入口 HTML、前置 JS、检测脚本或前置接口请求。
3. Cookie / Storage / device token / challenge 状态是否过期、缺失或不属于同一 session。
4. UA、UA-CH、Accept-Language、timezone、locale、screen、WebGL、Canvas、代理 / IP 是否与取证 baseline 一致。
5. TLS JA3/JA4、HTTP/2、Header 顺序、Sec-Fetch、Referer、Origin 是否与浏览器取证链一致。
6. fingerprint fixture 是否混用 baseline，trace 中长字段是否被截断。
7. Canvas / WebGL / WebGPU / Audio / Speech / Fonts / DOM geometry / Permissions / Plugins / MimeTypes 是否缺失真实样本或被随机化。
8. 取证阶段是否暴露 webdriver / CDP / headless / isTrusted 风险。
9. 请求顺序、请求间隔、Cookie jar 回写、动态资源刷新是否完整。
10. 以上排除后，再判断目标 JS 补环境对象、入口、writer 或 signer 逻辑是否缺失。

## 输出要求

阶段报告、`case/notes/high-intensity-env-diff.md`、`case/notes/final-request-validation.md` 和最终总结至少记录：

- 是否触发高强度检测通用排查，触发证据是什么。
- 入口页、目标 API、动态资源、Cookie / Storage、请求链是否完整。
- 指纹 baseline 与 fixture 来源，是否存在随机化、猜值或 trace 截断。
- 自动化 / CDP / headless / isTrusted 风险检查结果。
- TLS / Header / Client Hints / Session 请求链一致性检查结果。
- 失败排查顺序执行结果，以及最终认为是环境问题、请求链问题、状态过期、取证工具问题还是目标 JS 逻辑问题。
