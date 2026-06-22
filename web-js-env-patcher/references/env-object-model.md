# 浏览器环境对象模型补齐指南

当需要从 RuyiTrace / Node trace / fixtures 编写 `env.js`、`runner.js` 或最终 `result/src/env/*` 时读取本文件。本文件用于决定“补哪些浏览器对象”，但不降低对象真实性要求；真实性保护细节必须同时遵循 `env-native-protection.md` 和 `addon-api.md`。

## 总体原则

核心规则：

```text
最小范围，完整真实性。只减少对象覆盖范围，不降低已补对象质量。
```

不要一开始伪造完整浏览器，但凡某个 WebAPI 进入补环境范围，就必须从第一版实现开始执行：

1. 先加载 / 记录 addon，addon 可用时优先使用 addon API。
2. 先建立构造函数、构造函数非法调用行为、原型链、实例工厂、`prototype.constructor` 和 `Symbol.toStringTag`。
3. 再安装属性描述符、getter / setter、方法、内部状态和真实样本值。
4. getter / setter / 方法 / 构造函数默认 native-like，优先 `createGetter` / `createSetter` / `createNativeFunction`。
5. 实例对象默认要满足 `Object.prototype.toString.call(obj)`、`constructor.name`、`instanceof` 和 descriptor 检查。
6. addon 不可用、ABI 不兼容或 API 调用失败时，才使用 `NativeProtect` / JS fallback，并记录降级原因。

“根据访问路径补最小对象模型”只表示不一次性补全所有 DOM / BOM，不表示可以先用普通对象、普通赋值或普通函数跑通后再补保护。

推荐补齐顺序：

```text
Node 泄露阻断 → addon 加载记录 → 目标对象范围确认 → 构造函数 / 原型链 / 实例工厂 → 属性描述符 / 访问器 / 方法 → 样本值写入 → fixtures 验证
```

对象范围由 RuyiTrace、Node trace、fixtures、请求样本和目标入口决定；对象质量由 addon-first、原型链、描述符、访问器、toString 保护、`Symbol.toStringTag` 和构造函数行为决定。

## 对象补齐硬性清单

每补一个浏览器对象，先检查以下项目：

| 项目 | 要求 |
|---|---|
| addon-first | 进入补环境阶段先加载 addon，可用时优先使用 addon API |
| 构造函数 | 优先 `createProtoChains(descriptors)`，构造函数名称、`length`、`prototype` 描述符要明确 |
| 非法构造行为 | 浏览器不可直接构造的对象要模拟 `Illegal constructor` 或对应 TypeError |
| 原型链 | 先建 `Constructor.prototype` 与父级链，再创建实例 |
| `prototype.constructor` | 通常不可枚举，指回构造函数 |
| `Symbol.toStringTag` | 挂在正确 prototype 或实例上，按浏览器样本设置 |
| 属性描述符 | 全部关键属性用 `Object.defineProperty` / `defineProperties` |
| 访问器 | 浏览器中是 getter / setter 的属性，不得降级为 data descriptor |
| 方法 | 优先 `addon.createNativeFunction`，fallback 才用 `NativeProtect.setNativeFunc` |
| 访问器 toString | 优先 `addon.createGetter` / `createSetter`，fallback 才保护 getter / setter 函数 |
| 实例 toString | 优先 addon 原型链 / 实例工厂，fallback 才用 `Symbol.toStringTag` / `NativeProtect.setObjFunc` |
| 内部状态 | 优先 `addon.setPrivate/getPrivate`，fallback 才用 `WeakMap` |
| 降级记录 | addon 不可用或用户豁免必须写入 notes、阶段报告和最终总结 |

## 全局对象

基础关系可按目标需要安装：

```js
globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.top = globalThis;
globalThis.parent = globalThis;
```

真实浏览器的 `window` 不是普通对象。只要补 `Window` / `window`，就默认需要考虑：

- `Window` 构造函数和非法构造行为。
- `Object.prototype.toString.call(window)`。
- `window instanceof Window`。
- `window.window === window`、`window.self === window`。
- `window.navigator`、`window.document`、`window.location` 的 descriptor。
- `globalThis`、`self`、`top`、`parent` 的关系和只读程度。

探测模式可以最小化；交付模式不得把普通对象当作最终 `window` 真实性方案。

## 属性定义工具与模板模块

本 Skill 随包提供可复制模板：

- `assets/env-modules/native-protect.js`：`NativeProtect` 与 addon-first helper。
- `assets/env-modules/base-env.js`：`Window` / `Location` / `Navigator` 原型链、描述符和 getter 保护。
- `assets/env-modules/storage-env.js`：`Storage` 构造函数、实例、方法和 `length` getter。
- `assets/env-modules/document-env.js`：`EventTarget → Node → Document → HTMLDocument` 基础链路、cookie accessor、DOM 方法、`document.all` addon 优先处理。

复制模板后必须按当前目标的 RuyiTrace / fixtures 修改字段值，不要把模板默认值当成真实采集值。不要随意赋值：

```js
navigator.userAgent = 'xxx';
```

关键属性必须统一使用 descriptor，并优先把 getter / setter / 方法交给 addon 创建：

```js
Object.defineProperty(Navigator.prototype, 'userAgent', {
  get: addon.createGetter('userAgent', 0, function () {
    return fixture.browser.userAgent;
  }),
  enumerable: true,
  configurable: true,
});
```

描述符来源优先级：

1. 用户真实浏览器控制台采集。
2. ruyiPage / Camoufox / CloakBrowser / 真实浏览器取证样本。
3. RuyiTrace 环境访问证据。
4. 常见浏览器行为模板。
5. 目标 JS 检测结果。

## navigator

常见字段：

| 字段 | 来源 |
|---|---|
| `userAgent` | 必须尽量来自真实请求 UA |
| `language` / `languages` | 来自浏览器样本 |
| `platform` | 来自浏览器样本 |
| `hardwareConcurrency` | 来自浏览器样本或用户确认 |
| `deviceMemory` | 来自浏览器样本或用户确认 |
| `webdriver` | 普通浏览器通常应为 `false` 或不存在，取决于目标环境 |
| `plugins` / `mimeTypes` | 优先真实采集，addon 可用时优先 `getMimeTypesAndPlugins()` |

补 `navigator` 时不要先手写普通 `function Navigator(){}` 作为主路径。推荐：

1. 优先用 `addon.createProtoChains(descriptors)` 创建 `Navigator` 构造函数、`Navigator.prototype` 和 `navigator` 实例工厂。
2. `Navigator` 构造函数按浏览器行为模拟非法构造，直接调用或 `new Navigator()` 应抛出合适 TypeError。
3. `Navigator.prototype.constructor`、`Symbol.toStringTag = "Navigator"`、实例原型链在第一版就补齐。
4. `userAgent`、`language`、`languages`、`platform`、`hardwareConcurrency`、`plugins`、`mimeTypes` 等优先用 addon getter。
5. addon 不可用时，才使用 JS 构造函数 + `Object.defineProperty` + `NativeProtect` fallback。

不要只补返回值。getter 的 `Function.prototype.toString.call(descriptor.get)`、实例的 `Object.prototype.toString.call(navigator)`、`navigator.constructor.name` 都属于默认真实性基线。

## location

`location` 经常参与签名。不要用空字符串猜测。

值应从目标页面 URL 解析：

```js
const u = new URL(fixture.pageUrl);
```

补 `location` 时默认需要：

- 优先建立 `Location` 构造函数和 `Location.prototype`。
- `Location` 构造函数按浏览器行为模拟非法构造。
- `href`、`origin`、`protocol`、`host`、`hostname`、`port`、`pathname`、`search`、`hash` 优先按真实浏览器 descriptor 安装。
- 浏览器中是 getter / setter 的属性保持 accessor，不要降级成普通字段。
- getter / setter 优先 `addon.createGetter` / `createSetter`。
- 内部 URL 状态优先 `addon.setPrivate/getPrivate`，fallback 才用 `WeakMap`。
- 安装 `Symbol.toStringTag = "Location"`，并验证 `Object.prototype.toString.call(location)`。

## document 与 cookie

常见访问：

- `document.cookie`
- `document.referrer`
- `document.URL`
- `document.documentElement`
- `document.createElement`
- `document.querySelector`
- `document.all`

补 `document` 时默认先建立：

```text
EventTarget → Node → Document → HTMLDocument
```

然后再创建 `document` 实例。`Document` / `HTMLDocument` 构造函数、`prototype.constructor`、`Symbol.toStringTag`、实例 `Object.prototype.toString` 和非法构造行为都属于默认真实性基线。

`document.cookie` 必须作为 accessor descriptor 处理。即使当前样本只读取 cookie，也建议同时准备最小 setter，setter 可以只实现当前 case 需要的写入、覆盖和过期策略，但不得把 cookie 做成普通 data 属性。getter / setter 优先 addon；fallback 才用 `NativeProtect` 保护访问器函数。

DOM 方法如 `createElement`、`querySelector`、`querySelectorAll`、`getElementById` 进入补环境范围后，优先用 `addon.createNativeFunction`，并挂在正确 prototype 上。

## `document.all`

`document.all` 是特殊对象，必须优先使用 addon `createUndetectable`：

```js
Object.defineProperty(document, 'all', {
  value: addon.createUndetectable(function () {
    return undefined;
  }),
  enumerable: false,
  configurable: true,
});
```

期望关键行为：

```js
typeof document.all === 'undefined'
document.all == undefined
document.all !== undefined
Boolean(document.all) === false
'all' in document
```

addon 不可用时只能用 `undefined` 近似，并必须在 notes、阶段报告和最终总结中标记真实性不足；不得声称完全一致。

## Storage

实现 `localStorage` / `sessionStorage` 时，不要以普通对象或普通函数作为主路径。推荐：

1. 优先用 `addon.createProtoChains(descriptors)` 创建 `Storage` 构造函数、`Storage.prototype` 和实例工厂。
2. `Storage` 构造函数按浏览器行为模拟非法构造。
3. `localStorage` / `sessionStorage` 由实例工厂创建，并设置正确 `Symbol.toStringTag`、原型链和 `constructor`。
4. `getItem`、`setItem`、`removeItem`、`clear`、`key` 优先 `addon.createNativeFunction`。
5. `length` 优先 `addon.createGetter`，保持 accessor descriptor。
6. 内部键值状态优先 `addon.setPrivate/getPrivate`，fallback 才用 `WeakMap` / `Map`。

如果 addon 不可用，才使用 JS fallback：

```js
function Storage() {
  throw new TypeError("Illegal constructor");
}
const localStorage = Object.create(Storage.prototype);
```

fallback 仍必须显式 descriptor、原型链、`Symbol.toStringTag`、方法 toString 和访问器 toString，不得只用普通赋值。

## crypto

`crypto.getRandomValues`、`crypto.subtle`、`crypto.randomUUID` 可能参与签名。

原则：

- 如果签名依赖随机数，fixtures 必须记录对应随机输入或控制随机源。
- 不能随意用真实随机数比较固定期望值。
- `Crypto` / `SubtleCrypto` 构造函数、`crypto` 实例、`getRandomValues`、`randomUUID` 进入补环境范围后，要按 addon-first 建立构造函数、原型链、descriptor 和 native-like 方法。
- `getRandomValues` 在测试模式下可使用 fixture 中的固定字节序列，但函数形态仍要像浏览器 native API。

## performance 与时间

`Date.now()`、`new Date()`、`performance.now()` 经常影响签名。

探测模式可以临时固定：

```js
const fixedNow = fixture.runtime.now;
```

交付模式不要直接写：

```js
Date.now = () => fixedNow;
performance.now = () => fixture.runtime.performanceNow ?? 0;
```

交付模式要求：

- `Date` 构造函数、`Date.now`、`Date.parse`、`Date.UTC` 的 `name`、`length`、`toString` 和调用行为要受保护。
- `new Date()` 与 `Date()` 两种调用路径都要按样本验证。
- `Performance` 构造函数、`Performance.prototype.now`、`timeOrigin`、相关 descriptor 要明确。
- `performance.now` 优先 `addon.createNativeFunction`，不要暴露 Node `performance.nodeTiming/eventLoopUtilization/timerify`。

## Canvas / WebGL / WebGPU / 字体 / DOM 几何指纹

这类指纹不要优先在 Node.js 中真实模拟渲染。真实浏览器的 Skia、GPU、字体、抗锯齿、颜色管理和布局细节很难由 `node-canvas` / `headless-gl` / `jsdom` 精确复现。

处理原则：

- 先读取 `fingerprint-value-replay.md`。
- 用用户确认的取证模式采集终端 API 返回值，例如 `toDataURL`、`getImageData`、`measureText`、`getParameter`、`readPixels`、`getBoundingClientRect`。
- 在 Node.js 中用 `assets/env-modules/fingerprint-env.js` 按调用特征回放采样值。
- 回放函数也要挂在正确 prototype 上，并保持原型链、属性描述符、native-like `toString` 和实例对象 `Object.prototype.toString`。
- 缺少采样值时阻塞并提示补采样，不要静默返回空值或改用自动化浏览器作为最终方案。

示例接入：

```js
const { installFingerprintValueReplay } = require('./fingerprint-env');
const fingerprintFixture = require('../../fixtures/fingerprint.fixture.json');

installFingerprintValueReplay(globalThis, fingerprintFixture, {
  strict: true,
  addon,
});
```

最终项目中不得包含用于采样的 Hook、Playwright、Puppeteer、CloakBrowser、ruyiPage 或其他浏览器自动化代码。

## fetch 与 XMLHttpRequest

补环境阶段默认不应让目标 JS 真的发网络请求。

策略：

- 如果目标 JS 只构造请求或计算签名，`fetch` / `XMLHttpRequest` 可以记录调用并返回离线 fixture。
- `fetch`、`Headers`、`Request`、`Response`、`XMLHttpRequest` 一旦进入补环境范围，仍要建立构造函数、原型链、方法、访问器、descriptor 和 native-like 行为。
- 不要直接透传 Node 宿主 `fetch` / undici，也不要把最终验证交给浏览器自动化。
- 如果必须访问网络，先确认用户授权和访问范围；最终真实请求应由已确认的 Node.js / Python TLS 指纹兼容客户端完成。
- 不要把补环境 runner 变成批量请求工具。

## 原型链

原型链不是最后补的附加项，而是每个对象进入补环境范围时的第一步。

以下内容默认要考虑：

```js
navigator instanceof Navigator
document instanceof Document
Object.getPrototypeOf(navigator)
navigator.constructor.name
Object.prototype.toString.call(navigator)
Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent')
Function.prototype.toString.call(Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent').get)
```

基础链路示例：

```text
EventTarget → Node → Document → HTMLDocument
EventTarget → XMLHttpRequestEventTarget → XMLHttpRequest
HTMLElement → HTMLCanvasElement
```

优先用 addon `createProtoChains(descriptors)` 一次性定义构造函数、父级、实例工厂、`Symbol.toStringTag`、只读 prototype 和不可变原型设置。只有 addon 不可用时，才用 JS `Object.setPrototypeOf` / `Object.create` fallback，并用 `NativeProtect` 做函数和实例保护。

不要为了“完整”一次性补所有 DOM。只补 RuyiTrace / Node trace / fixtures / 目标检测证明目标 JS 会访问或依赖的部分；但已补的部分必须完整真实性。

