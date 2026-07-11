# 对象形状审计与私有状态泄露规则

本文件用于约束浏览器可见对象的内部状态保存方式和对象形状审计。高强度检测常用 `Object.keys`、`Object.getOwnPropertyNames`、`Reflect.ownKeys`、descriptor、`in`、`for...in`、prototype walk、brand check、`Object.prototype.toString` 和 `Function.prototype.toString` 发现 Node 补环境痕迹；非枚举 `_` / `__` 属性也会成为检测点。

## 硬性规则

- 任何目标 JS 能拿到的对象、实例、prototype、构造函数、集合对象、XHR / fetch / Response / Headers / Request / Event / DOM 节点 / Storage / Performance 等，都不得暴露自定义 `_` / `__` 字符串自有属性。
- 禁止 `this.__state = ...`、`this._headers = ...`、`Object.defineProperty(obj, "__readyState", ...)`、`defineValue(obj, "_impl", ...)`、`Reflect.defineProperty(obj, "_x", ...)`、`obj["_x"] = ...` 等写法；即使 `enumerable:false` 也不允许。
- 禁止用自定义 `Symbol("private")`、`Symbol.for("private")` 等在浏览器对象上保存状态，除非真实浏览器 baseline 存在同名可见 symbol。
- 允许的内部状态位置：addon / xbs `setPrivate/getPrivate/hasPrivate/deletePrivate`、浏览器 native 内部槽、模块级 `WeakMap`、闭包私有变量。
- JS fallback 使用 `WeakMap` 时，key 必须是浏览器可见实例，value 不能被挂回实例；销毁对象或 session 时清理 WeakMap 中关联状态。
- 状态字段名可以在 WeakMap value 里使用 `_` / `__`，因为目标 JS 无法通过对象枚举访问；但不得把 value 暴露回浏览器对象。

## 对象形状审计矩阵

触发以下任一情况时，真实请求或最终交付前必须建立对象形状审计矩阵：

- Trace / RuyiTrace / Hook 中出现 `Object.keys`、`Object.getOwnPropertyNames`、`Object.getOwnPropertyDescriptor`、`Reflect.ownKeys`、`for...in`、`hasOwnProperty`、`propertyIsEnumerable`、`__lookupGetter__`、`__lookupSetter__`。
- 目标涉及 iframe / Window realm、Worker、MessagePort、EventTarget、DOM、CSSOM、XHR/fetch、Headers/Response/Request、Performance、Storage、Canvas/WebGL、plugins/mimeTypes。
- 阶段报告或失败 diff 出现属性枚举、descriptor、prototype walk、brand check、`[object Xxx]`、`instanceof`、constructor、toString 多通道差异。
- 代码中新增或修改了浏览器对象内部状态、缓存、headers、readyState、listeners、children、parentNode、ownerDocument、response body、storage map 等。

必须产物：

```text
case/fixtures/browser-object-shape-baseline.json
case/tmp/node-object-shape-audit.json
case/notes/object-shape-audit.md
```

## baseline / audit 最小结构

```json
{
  "schemaVersion": "object-shape-audit/v1",
  "baselineId": "fp-001",
  "targets": [
    {
      "name": "XMLHttpRequest instance",
      "path": "new XMLHttpRequest()",
      "objectKeys": [],
      "ownPropertyNames": [],
      "ownSymbols": [],
      "reflectOwnKeys": [],
      "descriptors": {},
      "inChecks": {},
      "forIn": [],
      "prototypeChain": [],
      "toString": "[object XMLHttpRequest]",
      "constructorName": "XMLHttpRequest"
    }
  ]
}
```

`node-object-shape-audit.json` 使用同一 target 名称和 probe 名称，并记录 `status`：`matched` / `accepted-diff` / `not-involved` / `needs-browser-baseline` / `needs-node-audit` / `mismatch` / `native-capability-gap` / `unknown`。

`status` 只用于报告，不能作为通过依据。`check_object_shape_audit.js` 会对每个同名 target 深度比较 `objectKeys`、own names、own symbols、`Reflect.ownKeys`、descriptors、`inChecks`、`forIn`、prototype chain、brand、constructor 和 `instanceof`。Node audit 必须包含 `runtimeSourceHash`、`probeVersion` 与可信 `generatedBy`；只有 target 名称相同但观测字段缺失时检查失败。

## 必查目标

按目标涉及范围选择，不得伪造“未涉及”：

- `window`、`globalThis`、`self`、iframe `contentWindow`。
- `navigator`、`Navigator.prototype`、`plugins`、`mimeTypes`。
- `document`、`Document.prototype`、`Element`、`HTMLElement`、Text、Comment、HTMLCollection、NodeList。
- `XMLHttpRequest` 构造函数、prototype、实例；`fetch`、`Request`、`Response`、`Headers`、`navigator.sendBeacon`。
- `EventTarget`、Event、MouseEvent、KeyboardEvent、MessagePort、Worker。
- `Storage`、`localStorage`、`sessionStorage`、Cookie store。
- `performance`、PerformanceObserver、PerformanceEntry。
- Canvas / WebGL / Audio / CSSStyleDeclaration / DOMRect 等指纹对象。

每个目标至少检查：

- `Object.keys(obj)`。
- `Object.getOwnPropertyNames(obj)`。
- `Object.getOwnPropertySymbols(obj)`。
- `Reflect.ownKeys(obj)`。
- `Object.getOwnPropertyDescriptor(obj, key)`。
- `key in obj`。
- `obj.hasOwnProperty(key)`。
- `obj.propertyIsEnumerable(key)`。
- `for...in` 顺序。
- `Object.getPrototypeOf` 逐层 walk。
- `Object.prototype.toString.call(obj)`。
- `obj.constructor && obj.constructor.name`。
- `obj instanceof Constructor`。

## 修复策略

- XHR 状态：用 `const xhrState = new WeakMap()`，构造时 `xhrState.set(instance, {...})`；getter / method 中 `xhrState.get(this)`。
- Event listener：用 `WeakMap<EventTarget, ListenerStore>`；`addEventListener` / `removeEventListener` 不在实例上创建 `_listeners`。
- DOM 节点关系：用 addon / xbs native DOM 能力优先；JS fallback 用 WeakMap 保存 parent / children / ownerDocument，不能在节点对象上挂 `__children`、`__parentNode`。
- Headers / Response body：用 WeakMap 保存 normalized headers、body buffer、bodyUsed；`Headers` 自身 ownKeys 必须按浏览器 baseline。
- Storage：真实可枚举 key 只应该是 storage 业务 key；内部 map 不得是 `_store` / `__items` own property。

## 阻断规则

- 发现浏览器可见对象存在自定义 `_` / `__` own property，直接阻断。
- `Object.getOwnPropertyNames` / `Reflect.ownKeys` 比 baseline 多出内部字段，直接阻断，除非真实浏览器 baseline 也有该字段。
- baseline 缺失、Node audit 缺失、状态为 `mismatch` / `native-capability-gap` / `unknown` 时，不得继续真实请求验证。
- 需要 native 内部槽而纯 JS / 当前 addon / xbs 均无法表达时，进入 `native-capability-gap.md` 闭环，不得用 non-enumerable 属性硬凑。

## 阶段报告模板

```markdown
## 对象形状审计矩阵

- 矩阵文件：case/notes/object-shape-audit.md
- 浏览器 baseline：case/fixtures/browser-object-shape-baseline.json
- Node audit：case/tmp/node-object-shape-audit.json
- baselineId：
- 私有状态实现：addon/xbs private API / WeakMap / native / 未涉及
- `_` / `__` 自有属性泄露：无 / 列表
- 阻断项：无 / 列表

| 对象 | Probe | 浏览器证据 | Node 证据 | 状态 | 处理 |
|---|---|---|---|---|---|
| XMLHttpRequest instance | Reflect.ownKeys | fixtures/... | tmp/... | matched | 使用 WeakMap 保存 readyState |
```

## 检查命令

```bash
node scripts/check_object_shape_audit.js --case-dir case --markdown
node scripts/check_object_shape_audit.js --case-dir case --require --json
```

检查失败时，下一步只能迁移私有状态到 addon / xbs private API 或 WeakMap、补浏览器 baseline、补 Node audit、修 descriptor / prototype / ownKeys 差异，或进入 native 能力缺口闭环。
