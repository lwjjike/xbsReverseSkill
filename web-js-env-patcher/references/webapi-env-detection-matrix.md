# WebAPI 环境检测矩阵门禁

本文件用于解决另一类常见失败：Trace 已经列出了 API，补环境也实现了 API，但目标仍因 iframe、Worker、PerformanceTimeline、DOM/CSSOM、枚举、任务队列或 writer 分支行为不像真实浏览器而进入错误分支。Trace API 覆盖矩阵回答“访问了什么”，本矩阵回答“访问到的浏览器行为是否一致”。

本文件只用于授权范围内的网页端 Node.js 补环境、真实浏览器基线采样和 Node 行为 diff。不得把它解释为厂商专用绕过流程；遇到 JSVMP / opcode / 字节码解释器时仍只记录环境行为、请求链和 writer 分支，不主动分析虚拟机源码。

## 触发条件

出现以下任一信号时，在进入真实请求、长跑验证或 final writer 判定前必须建立 WebAPI 环境检测矩阵：

- Trace / 阶段报告中出现 `iframe`、`srcdoc`、`contentWindow`、`contentDocument`、`defaultView`、`document.write`、`document.close`。
- 出现 `Worker`、`SharedWorker`、`DedicatedWorkerGlobalScope`、`postMessage`、`MessageChannel`、`MessagePort`、`terminate`、Worker 内 timer 或 Worker 内 `performance`。
- 出现 `PerformanceObserver`、`PerformanceObserverEntryList.getEntries`、`PerformanceResourceTiming`、`PerformancePaintTiming`、`performance.mark`、`performance.getEntries*`、XHR / image / favicon resource timing。
- 出现 `XMLHttpRequest`、`fetch`、`Request`、`Response`、`Headers`、`navigator.sendBeacon`，且目标路径依赖动态资源、Cookie、challenge、telemetry、resource timing 或 writer 分支。
- 出现 `Object.keys`、`Object.getOwnPropertyNames`、`Reflect.ownKeys`、descriptor、getter / setter、prototype walk、brand check、`Function.prototype.toString` 多通道。
- 出现 `this.__xxx`、`this._xxx`、`__readyState`、`__headers`、`__children`、`Object.defineProperty(obj, "__xxx")`、`defineValue(obj, "_xxx")` 等浏览器对象私有状态泄露迹象。
- 出现 `structuredClone`、`DataCloneError`、`MessagePort.prototype.postMessage(fn)`、Error stack / message 差异。
- 出现 DOM / CSSOM 完整性检查：`DOMParser`、`innerHTML`、Comment/Text 原型、`HTMLUnknownElement`、`textarea`、`option`、`select`、`HTMLCollection`、`ShadowRoot`、`CSSStyleSheet.insertRule`、`CSSRuleList`、`getComputedStyle`、`document.links/images/forms/title/on*`。
- 出现 writer 分支差异，例如同一链路中 Node 停在 continuation / reload writer，而真实浏览器进入 form writer / final writer。

## 必须产物

触发本门禁后，进入真实请求验证前至少生成：

```text
case/fixtures/browser-env-detection-baseline.json
case/tmp/node-env-detection-audit.json
case/notes/webapi-env-detection-matrix.md
```

如果已经有高强度 diff 文件，也要在 `case/notes/high-intensity-env-diff.md` 中引用本矩阵结论。若暂时不能生成真实浏览器 baseline，必须在矩阵中标记为 `needs-browser-baseline` 并说明阻塞原因，不得把 Node probe 通过当作真实浏览器一致。

矩阵状态不能自行证明一致。浏览器 baseline 与 Node audit 的每个触发类别必须包含同名 probe 和实际观测值；`check_webapi_env_detection_matrix.js` 将深度比较观测结果。空类别数组、只有 `status: matched` 或只有证据路径而没有结果均视为未审计。两端必须记录相同 `probeSuiteVersion` 与 `probeSourceHash`，并用 case 内的 `probeSourceFile` 让门禁重算真实 SHA-256，证明运行的是同一份 probe 源码；Node audit 还必须记录 `runtimeSourceHash`、`probeVersion` 和可信 `generatedBy`，源码变化后旧 audit 失效。

`browser-env-detection-baseline.json` 至少记录：

```json
{
  "schemaVersion": "webapi-env-detection-baseline/v2",
  "baselineId": "fp-example-001",
  "capturedBy": "ruyiPage+RuyiTrace",
  "browser": "Firefox",
  "probeSuiteVersion": "webapi-realm-lifecycle/v2",
  "probeSourceFile": "fixtures/webapi-env-probe-suite.js",
  "probeSourceHash": "<same-sha256-on-browser-and-node>",
  "categories": {
    "iframe-realm": [
      {
        "id": "global-relations",
        "capability": "realm-global-relations",
        "observation": {"selfIsWindow": true, "parentIsMain": true, "defaultViewIsFrame": true}
      }
    ],
    "worker-task": [
      {
        "id": "immediate-terminate",
        "capability": "worker-terminate-immediate",
        "observation": {"messagesAfterTerminate": []}
      }
    ],
    "message-lifecycle": [
      {
        "id": "sender-close",
        "capability": "message-port-close-sender",
        "observation": {"delivered": false}
      }
    ],
    "performance-timeline": [{"id": "resource-entry-order", "observation": {"entries": []}}],
    "dom-cssom": [{"id": "current-path-involved", "observation": {"involved": false}}],
    "dom-crud": [
      {
        "id": "valid-combinator-selector",
        "capability": "dom-selector-validity",
        "observation": {"selector": "div > span", "throws": false}
      }
    ],
    "event-clone-error": [{"id": "xhr-brand", "observation": {"brand": "[object XMLHttpRequest]"}}],
    "xhr-fetch-session-bridge": [{"id": "network-mode", "observation": {"mode": "live-session-bridge"}}],
    "object-shape": [{"id": "xhr-prototype-chain", "observation": {"chain": ["XMLHttpRequest", "XMLHttpRequestEventTarget", "EventTarget", "Object"]}}],
    "private-state-leakage": [{"id": "xhr-private-own-keys", "observation": {"keys": []}}],
    "clock-timer": [{"id": "current-path-involved", "observation": {"involved": false}}],
    "writer-branch": [{"id": "final-writer-path", "observation": {"writer": "form-writer"}}]
  }
}
```

`node-env-detection-audit.json` 至少记录同一组类别、同一 probe 名称、同一 `capability` 和 Node 实际观测值，并额外包含 `generatedBy`、`probeVersion`、`probeSuiteVersion`、`probeSourceFile`、`probeSourceHash`、`runtimeSourceHash`。`not-involved` 也必须以明确 probe 观测表达，不能使用空数组。

以下字段才算实际观测：`observation`、`observed`、`result`、`value`、`output` 或 `expected`。`evidence`、`notes`、`status`、文件路径和人工结论不属于实际观测。

## 状态枚举

矩阵中每个检测项必须选择一个状态：

| 状态 | 含义 | 是否允许真实请求 |
|---|---|---|
| `matched` | 浏览器 baseline 与 Node audit 一致 | 允许 |
| `accepted-diff` | 差异已评估为不影响当前路径，并有证据 | 允许，但必须写风险 |
| `not-involved` | 当前 Trace / writer 路径未涉及 | 允许 |
| `needs-browser-baseline` | 缺真实浏览器基线 | 不允许 |
| `needs-node-audit` | 缺 Node 同 probe audit | 不允许 |
| `mismatch` | 存在未修复行为差异 | 不允许 |
| `native-capability-gap` | 当前 JS / addon / xbs 均无法可靠表达 | 不允许，进入 native 能力缺口闭环 |
| `unknown` | 未判断 | 不允许 |

Realm identity、对象形状、私有状态、Worker/MessagePort 生命周期、DOM CRUD、当前网络 writer 和请求语义属于 P0/P1 时不得使用 `accepted-diff`。这些差异必须修复、补采真实 baseline，或进入明确的 native capability gap。

## 强制 capability

触发下列类别时，browser 与 Node 两端都必须包含这些 capability；probe 名称可以按项目细化，但 capability id 不得省略：

| 类别 | capability |
|---|---|
| `iframe-realm` | `realm-global-relations`、`realm-ecma-constructor-isolation`、`realm-webapi-constructor-isolation`、`realm-object-isolation`、`realm-document-relations`、`realm-navigation-lifecycle` |
| `worker-task` | `worker-global-surface`、`worker-constructor-isolation`、`worker-object-isolation`、`worker-message-order`、`worker-terminate-immediate`、`worker-terminate-deferred` |
| `message-lifecycle` | `message-order`、`message-port-start`、`message-port-close-sender`、`message-port-close-receiver`、`message-port-transfer` |
| `dom-crud` | `dom-tree-mutation`、`dom-live-collections`、`dom-selector-validity`、`dom-html-parsing`、`dom-document-relations`、`dom-mutation-observer` |

## 必查类别

### iframe / Window realm

检查：

- `iframe.contentWindow` / `contentDocument` / `defaultView` 关系。
- `srcdoc`、sandbox、`document.write()`、`document.close()`、load 事件顺序。
- 主窗口与 iframe Window 的 `eval`、`fetch`、`location`、`navigator` descriptor。
- 主窗口与 iframe 的 `Object/Function/Array/Promise`、`Event/EventTarget`、`URL/Blob`、`Headers/Request/Response/XHR` 构造器 identity 必须不同。
- iframe 的 `self/window/globalThis/frames` 指向自身，`parent/top` 指向正确上层；`document.defaultView/contentWindow/contentDocument/frameElement` 关系必须闭合。
- 允许共享同源 Cookie/Storage 后端和 TLS Session，但 navigator/performance/crypto/storage wrapper/fetch/timer 等公开对象不能直接复用主 Realm 实例。
- `Object.keys`、`Object.getOwnPropertyNames`、`Reflect.ownKeys` 的数量、顺序和过滤策略。
- `document.all`、`currentScript`、`readyState`、`defaultView` 是否按目标浏览器可见。

禁止为了推进链路全量放开 raw ownNames；只能基于浏览器 baseline 做窄范围 A/B，并记录为什么该项可见。

### Worker / Message task queue

检查：

- Worker scope 是否有独立 `performance`、`timeOrigin`、`performance.now()` 序列和 UA / baseline 选择。
- Worker 的 `self/globalThis`、构造器图和实例必须独立；Window-only API 必须缺失，主 Window 也不得错误暴露 WorkerGlobalScope-only API。
- Worker 内 `setTimeout` / `clearTimeout` 是否绑定 Worker 私有状态。
- `Worker.prototype.terminate()` 后 pending timer、延迟 `postMessage` 是否清理。
- 立即 terminate 与延迟 terminate 必须分开检测。
- `WorkerGlobalScope.self.postMessage()` 与 `MessagePort.prototype.postMessage()` 是否后续 task 派发，而不是同步栈内派发。
- `addEventListener` / `removeEventListener` / `dispatchEvent` 是否支持 listener object、capture、once、passive、stopImmediatePropagation。

Promise resolved、Worker 回包出现或 probe 不报错都不能单独视为完成；必须验证同步 / 异步顺序和 terminate 后行为。

### MessagePort / postMessage 生命周期

检查：

- `postMessage` 相对当前同步栈、Promise microtask、queueMicrotask、timer 的顺序。
- `start()` 与设置 `onmessage` 的隐式启动行为。
- sender close、receiver close、双方 close、消息入队后 close。
- transfer 后原端口是否失效、目标端口是否保持 entangled。
- `close()` 是否清除监听、待派发 task 和 peer 关系；不能只在发送时检查“对端是否 closed”。

### Performance timeline / resource timing

检查：

- `performance.getEntries()`、`getEntriesByType()`、`getEntriesByName()` 的排序。
- `PerformanceObserver.observe()` 对 `buffered` 与非 `buffered` 的差异。
- `PerformanceObserverEntryList.getEntries()` 回调内容和触发时机。
- XHR readyState 4 / load / loadend 前后 resource entry 是否可见。
- image、favicon、Turnstile / third-party script、flow、`/d/`、`/peek` 等资源是否进入正确 timeline。
- `PerformanceEntry.toJSON()`、paint、mark、resource entry 序列化是否一致。

禁止无条件 synthetic 初始 callback；禁止用插入顺序替代浏览器 `startTime` 排序，除非目标 baseline 证明如此。

### DOM / CSSOM 短值行为

检查：

- `document.createElement(tag)` 的 tag 到构造器映射，特别是未知 tag、`html`、`textarea`、`option`、`select`、`form`、`input`、`img`、`iframe`。
- `innerHTML` / `DOMParser.parseFromString()` 后 Text、CDATA、Comment、Element 原型与 `[object Xxx]`。
- `appendChild/removeChild/insertBefore/replaceChild/replaceChildren` 的移动、重复插入、DocumentFragment 展开、错误类型和 ownerDocument/isConnected 更新。
- `childNodes`、`children`、`getElementsBy*` 的 live 语义与 `querySelectorAll` 的 static 语义。
- 合法选择器如 `div > span` 不得错误抛出 `SyntaxError`；非法选择器必须按浏览器 baseline 抛错。
- HTML parser 不得丢弃 Comment/Text；`innerHTML`、clone/import/adopt 后 document/parent/sibling 关系必须一致。
- `MutationObserver` 的 record 内容、合并策略和 microtask 时序。
- `HTMLCollection`、`NodeList`、`HTMLOptionsCollection` 是否 native-like，是否实时或快照符合目标路径。
- `attachShadow()`、`ShadowRoot.host/mode`、`shadowRoot` descriptor。
- `CSSStyleSheet.insertRule()`、`CSSStyleRule.selectorText/style`、`CSSRuleList.item()`、`getComputedStyle()` 对目标选择器的最小一致性。
- `document.links/images/forms/title/on*`、`document.cookie` 可见性与 descriptor。

### Error / clone / native shape

检查：

- `structuredClone(fn)`、`MessagePort.prototype.postMessage(fn)` 的错误 name / message / stack。
- `Function.prototype.toString.call(fn)`、`fn + ""`、`String(fn)`、保存旧 FTS 后调用。
- 构造函数直接调用 / `new` 调用错误差异。
- `Object.getOwnPropertyDescriptor`、`__lookupGetter__`、`__lookupSetter__`、`hasOwnProperty`、`propertyIsEnumerable`、`for...in`。
- `Object.prototype.toString.call`、`Symbol.toStringTag`、`instanceof`、prototype walk。

### XHR / fetch session bridge

检查：

- `XMLHttpRequest.send()` / `fetch()` / `navigator.sendBeacon()` 是否为 `offline-fixture` 诊断模式，还是 `live-session-bridge` 真实请求模式。
- 真实请求模式是否通过同一 CycleTLS / impers / curl-cffi-node / curl_cffi / cffi_curl / cyCronet Session 发送。
- Python `curl_cffi` 场景是否由 `final.py` 持有唯一 session，并通过 IPC 服务 Node JS runtime 的 XHR/fetch 请求。
- Cookie jar、`document.cookie`、`Set-Cookie`、`getResponseHeader("set-cookie")`、Response headers、body、readyState / Promise / event 顺序是否与浏览器 baseline 一致。
- XHR / fetch 请求是否产生正确的 PerformanceResourceTiming 可见性。

禁止把 fixture / 默认 200 / mock response 写成真实请求成功；禁止在 XHR/fetch 内部直接调用 Node 宿主 `fetch`、`http`、`https`、`axios` 或 Python 普通 `requests`。

### Object shape

检查：

- `Object.keys`、`Object.getOwnPropertyNames`、`Object.getOwnPropertySymbols`、`Reflect.ownKeys` 的数量、顺序和字段名。
- `Object.getOwnPropertyDescriptor`、`hasOwnProperty`、`propertyIsEnumerable`、`for...in`、`in`、`__lookupGetter__`、`__lookupSetter__`。
- 构造函数、prototype、实例对象、集合对象、iframe realm、Worker realm 的 prototype walk。
- `Object.prototype.toString.call(obj)`、`Symbol.toStringTag`、`constructor.name`、`instanceof`。

如对象形状涉及内部状态，应同时生成 `object-shape-audit.md`、`browser-object-shape-baseline.json` 和 `node-object-shape-audit.json`。

### Private state leakage

检查：

- 浏览器可见对象是否存在自定义 `_` / `__` 自有属性，包括 non-enumerable 属性。
- 是否使用 `this.__state`、`this._headers`、`Object.defineProperty(obj, "__readyState")`、`defineValue(obj, "_store")` 或自定义 Symbol 保存内部状态。
- 内部状态是否迁移到 addon / xbs private API、原生内部槽或模块级 `WeakMap`。

发现 `_` / `__` 私有状态泄露时直接阻断；不能用 `enumerable:false` 作为豁免。

### Clock / timer

检查：

- `Date.now()`、`new Date()`、主线程 `performance.now()`、Worker `performance.now()` 是否来自同一 baseline 策略。
- 虚拟 timer driver 是否只运行到期 timer，不因 sleep cap 把 10s / 30s timer 一轮快进。
- `queueMicrotask`、Promise job、timer task、MessagePort task、PerformanceObserver callback 的相对顺序。

### Writer branch

检查：

- 请求链中每个关键响应对应的 writer 类型：continuation program、reload writer、form writer、final writer。
- Node 与真实浏览器在 final writer 前 300 到 1000 个环境事件的类别差异。
- 是否出现 `HTMLFormElement.submit(true)`、hidden input 创建、`cf_chl_rc_ni` 删除、`Location.reload` 等分支证据。
- 不得把拿到 Cookie、Set-Cookie 或 reload writer 响应写成最终成功；必须记录 writer 类型。

## 阻断规则

- 存在 `mismatch`、`needs-browser-baseline`、`needs-node-audit`、`native-capability-gap` 或 `unknown` 的 P0/P1 检测项时，不得执行真实请求验证、不得宣称 final writer 已闭环。
- 只有类别名称或手工 `matched`、没有逐 probe 浏览器值和 Node 值时，直接阻断。
- browser/Node 的 `probeSuiteVersion`、`probeSourceFile` 或 `probeSourceHash` 缺失，hash 不一致，源文件不在 case 内，或声明 hash 与实际文件不一致，直接阻断。
- iframe/Worker 构造器或公开对象复用主 Realm、MessagePort 只实现单侧 close、DOM probe 把合法 selector 当非法、HTML parser 丢 Comment，直接阻断。
- 存在 `xhr-fetch-session-bridge` 阻断项时，不得宣称 TLS 指纹已解决；fixture/mock 只能作为离线诊断结论。
- 存在 `private-state-leakage` 阻断项时，不得交付；必须迁移到 addon / xbs private API 或 WeakMap。
- 如果后续阶段新增 WebAPI 是因为本矩阵遗漏了已触发检测项，必须标为 `missed-from-webapi-env-matrix` 流程缺陷，并补写矩阵与代码变更记忆。
- 如果真实请求失败但矩阵未覆盖 Worker / performance / iframe / DOM/CSS / writer branch，而 Trace 或阶段报告已经出现这些信号，下一步只能补矩阵和离线 diff，不能继续盲目真实请求。

## 阶段报告记录模板

```markdown
## WebAPI 环境检测矩阵

- 矩阵文件：case/notes/webapi-env-detection-matrix.md
- 浏览器 baseline：case/fixtures/browser-env-detection-baseline.json
- Node audit：case/tmp/node-env-detection-audit.json
- baselineId：
- 触发类别：iframe-realm / worker-task / message-lifecycle / performance-timeline / dom-cssom / dom-crud / event-clone-error / xhr-fetch-session-bridge / object-shape / private-state-leakage / clock-timer / writer-branch
- 阻断项：无 / 列表
- writer 分支：真实浏览器 = form writer；Node = reload writer / continuation / form writer

| 类别 | 检测项 | 浏览器证据 | Node 证据 | 状态 | 处理 |
|---|---|---|---|---|---|
| worker-task | postMessage async task | fixtures/... | tmp/... | matched | 保持 |
```

## 检查命令

```bash
node scripts/check_webapi_env_detection_matrix.js --case-dir case --markdown
node scripts/check_webapi_env_detection_matrix.js --case-dir case --require --require-writer-branch --json
```

检查失败时，下一步只能补浏览器 baseline、Node audit、矩阵、native 能力缺口或离线 diff；不能继续真实请求验证。
