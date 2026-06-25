# 真实性保护、Proxy 风险与 native-like 行为

每次进入 Node.js 补环境阶段、准备编写 env 模块、或修改任何 WebAPI 对象模型时读取本文件。真实性保护不是等目标 JS 检测到再补，而是补环境默认基线；除非用户明确要求不做保护或不使用 addon，否则必须从补环境初始化开始执行。

新版 addon API 的详细调用方式见 `references/addon-api.md`。进入补环境阶段、修改 addon helper、创建构造函数 / 原型链 / 集合对象 / `document.all` / `navigator.plugins` / `navigator.mimeTypes` 时必须同时读取该文件。

如果用户明确选择 `isolated-vm` 补环境框架，则必须同时读取 `references/runtime-frameworks.md` 与 `references/xbs-isolated-vm-api.md`。该模式下不要把旧 `addon.node` 桥接进 isolated-vm；补环境代码运行在 isolated-vm Context 内，addon-first 应体现为 `window.xbs` / `globalThis.xbs` native-first。`xbs.createProtoChains`、`xbs.createNativeFunction`、`xbs.createGetter`、`xbs.createSetter`、`xbs.createNativeCollection`、`xbs.getMimeTypesAndPlugins`、`xbs.createUndetectable` 等 API 与 addon-first 同等作为优先主路径。

## 补环境初始化硬性基线（不等待检测）

进入补环境阶段后，先执行以下基线，再运行目标 JS：

1. 先加载 / 检测 native 能力：普通 Node runtime 运行 `scripts/load_native_addon.js --json` 或等价加载随包 `addon.node`；如果用户选择 `isolated-vm`，运行 `scripts/check_xbs_isolated_vm.js --markdown` 并在 Context 内自检 `window.xbs`。记录 available、path、exports / API、Node ABI、平台和失败原因。
2. 从第一版 env 骨架开始就使用 `assets/env-modules/native-protect.js` 或等价 addon-first helper；不要先用普通函数 / 普通赋值跑通，等检测到 `toString`、descriptor、原型链问题后再补保护。
3. 所有新增 WebAPI 默认使用 `Object.defineProperty` / `defineProperties`，并显式设置 `writable`、`enumerable`、`configurable`。
4. 所有方法、构造函数、getter、setter、实例对象都默认做 native-like / toString / `Symbol.toStringTag` / 原型链保护。
5. native 能力可用时必须优先调用 addon API 或 xbs API；只有用户明确要求不使用 native 能力、addon / xbs 缺失、ABI 不兼容或 API 调用失败时，才允许 `NativeProtect` / JS fallback，并记录豁免或降级原因。

该基线是规范性要求，不以“目标是否已经检测到”为触发条件。

## Proxy 只用于探测

JS `Proxy` 很适合发现缺失环境，但不适合作为最终交付。

目标 JS 可能通过以下方式发现异常：

```js
Object.keys(obj)
Reflect.ownKeys(obj)
Object.getOwnPropertyDescriptor(obj, 'xxx')
Object.getPrototypeOf(obj)
obj instanceof SomeConstructor
Object.prototype.toString.call(obj)
Function.prototype.toString.call(fn)
'xxx' in obj
obj.constructor.name
```

策略：

| 阶段 | 做法 |
|---|---|
| 初次运行 | 可以使用全量 Proxy 探测访问路径 |
| 中期调试 | 已知对象改为真实结构，只对未知分支继续 Proxy |
| 最终交付 | 尽量无 Proxy，用真实对象、描述符、原型链和 native-like 函数 |

即使 trace 暂时没有出现 `ownKeys`、`getOwnPropertyDescriptor`、`getPrototypeOf`、`toString`、`instanceof` 等信号，新增关键 WebAPI 也应按真实对象、描述符、原型链和 native-like 函数实现；当这些信号出现时，应立即把残留 Proxy 迁移到真实对象。


## 补环境阶段默认真实性清单

从补环境阶段开始，不能只补到“不报错”，也不能只在检测命中后才补保护。凡新增、修改或被 RuyiTrace / Node trace / 目标检测命中的 WebAPI，都必须逐项确认：

1. **原型链**：补构造函数、`prototype.constructor`、`Object.create(Constructor.prototype)`、必要的 `Object.setPrototypeOf` 多级链路，并验证 `instanceof`。
2. **属性描述符**：所有关键属性都用 `Object.defineProperty` / `defineProperties`；明确 `writable`、`enumerable`、`configurable`，不要用普通赋值替代。
3. **访问器**：真实浏览器中是 getter / setter 的属性，必须补成 accessor descriptor；不要为了省事改成 data descriptor。
4. **函数 toString 保护**：普通方法、构造函数、原型方法在 addon 可用时必须先用 `createNativeFunction`；addon 不可用或调用失败时才用 `NativeProtect.setNativeFunc` fallback。
5. **访问器 toString 保护**：getter / setter 本身也是函数；addon 可用时必须先用 `createGetter` / `createSetter`，失败时才用 `NativeProtect.setNativeFunc(getter, "get xxx")` / `setNativeFunc(setter, "set xxx")` fallback。
6. **实例对象 toString 保护**：对 `navigator`、`document`、`localStorage`、`screen`、`location` 等实例，优先用 addon 构造函数 / `createProtoChains` 实例工厂创建真实对象和原型链；addon 创建出的实例通常已经具备正确的 `Object.prototype.toString` 行为，不要再叠加 `markObjectType`、`markObjectToString` 或手写 `Symbol.toStringTag` 伪装。只有 addon 不可用、必须创建普通 JS fallback 对象时，才使用 `Symbol.toStringTag`、`NativeProtect.setObjFunc(obj, "Navigator")` / `markObjectToString`，并记录 fallback 原因。
7. **集合对象**：`HTMLCollection`、`NodeList`、`PluginArray`、`MimeTypeArray`、`DOMTokenList` 等集合对象必须优先用 addon `createNativeCollection` 或 `getMimeTypesAndPlugins`，不得以普通数组 / 普通对象作为主路径。
8. **plugins / mimeTypes**：`navigator.plugins` 和 `navigator.mimeTypes` 必须优先使用 addon `getMimeTypesAndPlugins(config)`；真实浏览器插件数据不同则传入 config 生成一致数据，不能手写 `[]` 或普通对象作为主路径。
9. **特殊对象**：`document.all` 这类 HTMLDDA / 不可检测对象必须优先使用 addon `createUndetectable`；JS fallback 只能标记为近似，不得声称完全一致。
10. **指纹终端 API**：Canvas / WebGL / WebGPU / Audio / 字体 / DOM 几何等指纹 API 必须优先回放真实浏览器采样值，同时保持 API 所在对象的原型链、描述符和 native-like `toString`；不得因为 Node.js 无法真实渲染就把最终流程改成自动化。

建议交付前运行：

```bash
node scripts/check_env_realism.js --case-dir case --markdown
node scripts/check_env_realism.js --case-dir case --require-document-all --require-ruyitrace --require-fingerprint-fixture --markdown
node scripts/check_fingerprint_fixture.js --case-dir case --require canvas,webgl --markdown
```

## 指纹值回放真实性

即使 `toDataURL`、`getParameter`、`getBoundingClientRect` 等方法只是返回 fixture 采样值，也要像浏览器 native API：

- 方法挂在正确 prototype 上，例如 `HTMLCanvasElement.prototype.toDataURL`。
- 函数名、`length`、`toString()` 尽量 native-like。
- 实例对象满足 `Object.prototype.toString.call(canvas)` / `instanceof HTMLCanvasElement` 等目标检测。
- 缺少采样值时抛出明确错误，不能悄悄返回空字符串、空数组或随机值。
- 不使用 `node-canvas` / `headless-gl` 作为最终指纹一致性方案；这些库可用于离线探索，但不能替代真实浏览器采样值。
## toString / native-like 保护优先级

推荐优先级：

1. 可选 native addon 或 xbs isolated-vm 创建 native-like 函数、getter、setter。
2. JS 层真实对象 + 描述符 + 原型链。
3. `NativeProtect` 作为 addon 不可用时的 fallback；必须同时覆盖普通函数、访问器 getter / setter 和实例对象 `Object.prototype.toString`。
4. 现有能力无法覆盖时，再考虑新增 C++ addon API。

## addon-first 门禁

进入补环境阶段第一步必须先检测 native 能力；普通 Node runtime 检测 addon，选择 isolated-vm 时检测 xbs isolated-vm；交付前还要复查 addon-first / xbs native-first 证据：

```bash
node scripts/load_native_addon.js --json
node scripts/check_xbs_isolated_vm.js --markdown   # 仅用户选择 isolated-vm 时必跑
```

实现规则：

1. `load_native_addon.js` 返回 `{ available, addon, path, exports }`；env helper 必须同时兼容 raw addon 和这个包装对象，不能因为传入 `{ addon }` 而静默跳过 addon。
2. 创建函数、构造函数、getter、setter、集合对象、`navigator.plugins` / `mimeTypes`、`document.all`、`createNativeObject` / `createProtoChains` 支持的对象时，先调用 addon API；如果选择 xbs isolated-vm，则先调用 Context 内的 `xbs` API。
3. 只有用户明确要求不使用 addon、addon 不可用、ABI 不兼容或 API 抛错时，才降级到 `NativeProtect` / JS fallback，并在 `notes`、阶段输出和最终总结中记录豁免或降级原因。
4. 交付前运行 `check_env_realism.js --case-dir case --markdown`；该脚本默认强制 addon-first / xbs native-first。如果源码只出现 `NativeProtect` / `markNativeFunction`，却没有 addon API、`window.xbs` / `globalThis.xbs`、`options.addon` / `options.xbs` 或加载记录，应视为失败。只有用户明确要求不使用 native 能力时，才可传入 `--no-require-addon-first` 并记录原因。

## 构造函数报错必须与浏览器一致

构造函数行为不只包括“能不能 `new`”，还包括错误类型、错误对象构造器、错误信息和调用路径。不要把所有不可构造对象都简单写成：

```js
throw new TypeError('Illegal constructor');
```

要求：

1. 对进入补环境范围的每个构造函数，先用已确认取证浏览器采样：
   - `Ctor()` 直接调用的 `error.name`、`error.constructor.name`、`error.message`、`String(error)`、stack 首行。
   - `new Ctor()` 构造调用的同样字段。
   - 可构造对象的返回实例、`instanceof`、`Object.prototype.toString.call(instance)`。
2. 把采样结果写入 `case/fixtures/constructor-errors.fixture.json`、`case/notes/构造函数行为采样.md` 或阶段报告，不要只凭记忆猜测。
3. 多数 DOM 构造错误是 `TypeError`，但仍以目标浏览器采样为准；如果采样为 `DOMException` 或其他错误类型，必须按样本复现。
4. addon 可用时优先使用 `addon.throwTypeError(message)` 或 addon 提供的等价错误抛出能力；addon 不支持目标错误类型时，才用 JS fallback，并记录差异。
5. 错误信息要精确到浏览器版本和调用方式。例如 Chrome 中“需要 new 调用”和“非法构造”通常不是同一条 message。

推荐采样模板：

```js
function collectConstructorError(name) {
  const Ctor = globalThis[name];
  const result = { name, call: null, construct: null };
  for (const mode of ['call', 'construct']) {
    try {
      if (mode === 'call') Ctor();
      else Reflect.construct(Ctor, []);
      result[mode] = { ok: true };
    } catch (error) {
      result[mode] = {
        ok: false,
        errorName: error && error.name,
        errorConstructor: error && error.constructor && error.constructor.name,
        message: error && error.message,
        string: String(error),
        stackFirstLine: String(error && error.stack || '').split('\n')[0],
      };
    }
  }
  return result;
}
```

交付前用 `check_webapi_addon_coverage.js` 检查泛化 `Illegal constructor` 和错误类型风险；发现问题时先补采样，再修复构造函数。

## 可选 native addon

本 Skill 支持可选 `addon.node`，并随包放置在 `assets/native-addon/<platform>-<arch>/addon.node`。脚本会按当前 `process.platform-process.arch` 自动加载；如果当前平台缺失、Node ABI 不兼容或加载失败，必须降级到 JS fallback，并在报告中说明。用户也可以通过 `--addon` 或环境变量 `WEB_JS_ENV_PATCHER_ADDON` 显式覆盖路径，但不要在 Skill 中写入任何本机绝对路径。addon 可用时，“可选”只表示不是跨平台强依赖，不表示补环境时可以跳过；凡 addon 支持的 native-like 能力都必须优先调用 addon，除非用户明确要求不使用 addon。

已知可用 API：

```js
createNativeObject
createNativeFunction
createProtoChains
getProtoChainRegistry
deleteProtoChainRegistryEntry
clearProtoChainRegistry
getPrivate
setPrivate
hasPrivate
deletePrivate
createInterceptor
createNativeCollection
getMimeTypesAndPlugins
createGetter
createSetter
createUndetectable
throwTypeError
```

新版调用约束：

- 新代码创建构造函数、原型链、别名和实例工厂时，优先使用 `createProtoChains(descriptors)`。
- `createNativeObject(options)` 仅作为旧式单对象兼容；不要把 `createNativeObject(tag, proto, properties)` 写入新代码主路径。
- 发现旧式 `createProtoChains(name, chain)` 时要迁移为 descriptors 数组；兼容层只能记录 fallback，不能把旧式形态继续作为 addon 主调用。
- `createUndetectable(callback, handlers)` 支持 `getter`、`setter`、`query`、`deleter`、`enumerator`、`definer`、`descriptor` 等 handlers；处理 `document.all` 时优先使用。
- `createProtoChains` 支持 `constructorBehavior`、`callBehavior`、`constructorErrorMessage`、`callErrorMessage`、`illegalConstructor`、`prototypeMethods`、`staticMethods`、`internalClassName`、`aliases`、`aliasOf`、`instanceFactoryName`、`instanceInitializer`；应一次性规划对象模型，减少后续反复改注册表。
- `getMimeTypesAndPlugins([config])` 是 `navigator.plugins` / `navigator.mimeTypes` 主路径；`createNativeCollection(options)` 是通用集合对象主路径。

检查方式：

```bash
node scripts/load_native_addon.js --json
node scripts/load_native_addon.js --addon <path-to-addon.node> --json
```

常见用途：

| 问题 | 推荐 API |
|---|---|
| `document.all` / HTMLDDA 特殊行为 | `createUndetectable` |
| native-like 函数 | `createNativeFunction` |
| native-like getter | `createGetter` |
| native-like setter | `createSetter` |
| 构造函数、实例、别名和实例工厂 | `createProtoChains(descriptors)` |
| 旧式单对象兼容 | `createNativeObject(options)` |
| `navigator.plugins` / `navigator.mimeTypes` | `getMimeTypesAndPlugins(config)` |
| `HTMLCollection` / `NodeList` / 类数组集合 | `createNativeCollection(options)` |
| named / indexed property interceptor | `createInterceptor(options)` |
| 内部私有状态 | `setPrivate` / `getPrivate` / `hasPrivate` / `deletePrivate` |
| 注册表查看与测试隔离 | `getProtoChainRegistry` / `deleteProtoChainRegistryEntry` / `clearProtoChainRegistry` |
| 浏览器式 TypeError | `throwTypeError` |

## `document.all`

`document.all` 的关键行为：

```js
typeof document.all              // 'undefined'
document.all == undefined        // true
document.all === undefined       // false
Boolean(document.all)             // false
'all' in document                 // true
```

addon 可用时：

```js
Object.defineProperty(document, 'all', {
  value: addon.createUndetectable(function () {
    return undefined;
  }),
  enumerable: false,
  configurable: true,
});
```

addon 不可用时只能近似：

```js
Object.defineProperty(document, 'all', {
  value: undefined,
  enumerable: false,
  configurable: true,
});
```

近似方案不能满足 `document.all !== undefined`，必须在报告中说明。

## native-like 函数

addon 可用时优先：

```js
const querySelector = addon.createNativeFunction(false, 'querySelector', 1, function (selector) {
  return null;
});

querySelector.toString();
// function querySelector() { [native code] }
```

getter / setter：

```js
const getUserAgent = addon.createGetter('userAgent', 0, function () {
  return userAgent;
});

Object.defineProperty(Navigator.prototype, 'userAgent', {
  get: getUserAgent,
  enumerable: true,
  configurable: true,
});
```

## 多通道 toString 与 DataCloneError 保护

高强度检测不会只调用 `fn.toString()`。凡进入补环境范围的函数、构造函数、getter、setter 都要按以下通道验证：

- `fn.toString()`
- `Function.prototype.toString.call(fn)`
- 目标 JS 先保存 `const FTS = Function.prototype.toString` 后再 `FTS.call(fn)`
- `String(fn)`
- `fn + ""`
- `fn.toString.toString()`
- `structuredClone(fn)` 抛出的 `DataCloneError` message / stack
- `MessagePort.prototype.postMessage(fn)` 抛出的 `DataCloneError` message / stack

用户实测 addon 创建的 native-like 函数对上述多通道 toString 检测没有问题，因此 addon / xbs native-first 仍是第一选择。只有 fallback 到 `NativeProtect` 时，才使用下方带 `structuredClone` / `postMessage` DataCloneError 改写的版本；旧版只 patch `Function.prototype.toString` 的 NativeProtect 不再作为主推荐。

## `NativeProtect` fallback

addon 不可用、ABI 不兼容或调用失败时，可以在目标 JS 所在运行上下文内使用以下 fallback。必须在加载目标 JS 之前执行。

```js
class NativeProtect {
    #map = new Map();
    #objMap = new Map();
    #clonePatched = false;

    static #instance = null;

    static getInstance() {
        if (!NativeProtect.#instance) {
            NativeProtect.#instance = new NativeProtect();

            const instance = NativeProtect.#instance;
            const _toString = Function.prototype.toString;

            const patchedToString = {
                toString() {
                    if (instance.#map.has(this)) {
                        const name = instance.#map.get(this);
                        return `function ${name || this.name}() { [native code] }`;
                    }
                    return _toString.call(this);
                }
            }.toString;

            Object.defineProperty(Function.prototype, "toString", {
                value: patchedToString,
                writable: true,
                enumerable: false,
                configurable: true,
            });

            instance.#map.set(Function.prototype.toString, "toString");

            const _objToString = Object.prototype.toString;
            const patchedObjToString = {
                toString() {
                    if (instance.#objMap.has(this)) {
                        const name = instance.#objMap.get(this);
                        return `[object ${name}]`;
                    }
                    return _objToString.call(this);
                }
            }.toString;

            Object.defineProperty(Object.prototype, "toString", {
                value: patchedObjToString,
                writable: true,
                enumerable: false,
                configurable: true,
            });

            instance.#map.set(Object.prototype.toString, "toString");
            instance.#patchCloneErrorLeak();
        }

        return NativeProtect.#instance;
    }

    constructor() {
        if (NativeProtect.#instance) {
            throw new Error("NativeProtect类只能实例化一次");
        }
    }

    setNativeFunc(func, name = "") {
        this.#map.set(func, name);
    }

    setObjFunc(obj, name = "") {
        this.#objMap.set(obj, name);
    }

    #patchCloneErrorLeak() {
        if (this.#clonePatched) return;
        this.#clonePatched = true;

        const rawStructuredClone = globalThis.structuredClone;
        const rawMessagePortPostMessage =
            typeof MessagePort !== "undefined" &&
            MessagePort.prototype &&
            MessagePort.prototype.postMessage;

        if (typeof rawStructuredClone === "function") {
            const self = this;

            function structuredClone(value, options) {
                try {
                    return rawStructuredClone.apply(this, arguments);
                } catch (err) {
                    self.#rewriteDataCloneError(err, value);
                }
            }

            this.#copyFunctionMeta(structuredClone, rawStructuredClone, "structuredClone");

            const desc =
                Object.getOwnPropertyDescriptor(globalThis, "structuredClone") || {
                    writable: true,
                    enumerable: true,
                    configurable: true,
                };

            Object.defineProperty(globalThis, "structuredClone", {
                ...desc,
                value: structuredClone,
            });

            this.setNativeFunc(structuredClone, "structuredClone");
        }

        if (typeof rawMessagePortPostMessage === "function") {
            const self = this;

            function postMessage(value, transferList) {
                try {
                    return rawMessagePortPostMessage.apply(this, arguments);
                } catch (err) {
                    self.#rewriteDataCloneError(err, value);
                }
            }

            this.#copyFunctionMeta(postMessage, rawMessagePortPostMessage, "postMessage");

            const desc =
                Object.getOwnPropertyDescriptor(MessagePort.prototype, "postMessage") || {
                    writable: true,
                    enumerable: true,
                    configurable: true,
                };

            Object.defineProperty(MessagePort.prototype, "postMessage", {
                ...desc,
                value: postMessage,
            });

            this.setNativeFunc(postMessage, "postMessage");
        }
    }

    #rewriteDataCloneError(err, value) {
        if (!err || err.name !== "DataCloneError") {
            throw err;
        }

        const fn = this.#findFunction(value);
        if (!fn) {
            throw err;
        }

        const fakeSource = this.#getFunctionSource(fn);
        const msg = `${fakeSource} could not be cloned.`;

        try {
            Object.defineProperty(err, "message", {
                value: msg,
                configurable: true,
            });
        } catch (_) {}

        try {
            if (typeof err.stack === "string") {
                const lines = err.stack.split(/\r?\n/);
                lines[0] = `${err.name}: ${msg}`;

                Object.defineProperty(err, "stack", {
                    value: lines.join("\n"),
                    configurable: true,
                });
            }
        } catch (_) {}

        throw err;
    }

    #getFunctionSource(fn) {
        try {
            return Function.prototype.toString.call(fn);
        } catch (_) {
            return "function () { [native code] }";
        }
    }

    #findFunction(value, seen = new WeakSet()) {
        if (typeof value === "function") return value;
        if (value === null || typeof value !== "object") return null;
        if (seen.has(value)) return null;
        seen.add(value);

        if (value instanceof Map) {
            for (const [k, v] of value) {
                const fk = this.#findFunction(k, seen);
                if (fk) return fk;

                const fv = this.#findFunction(v, seen);
                if (fv) return fv;
            }
        }

        if (value instanceof Set) {
            for (const v of value) {
                const fv = this.#findFunction(v, seen);
                if (fv) return fv;
            }
        }

        for (const key of Reflect.ownKeys(value)) {
            let desc;

            try {
                desc = Object.getOwnPropertyDescriptor(value, key);
            } catch (_) {
                continue;
            }

            if (desc && "value" in desc) {
                const f = this.#findFunction(desc.value, seen);
                if (f) return f;
            }
        }

        return null;
    }

    #copyFunctionMeta(target, source, name) {
        try {
            Object.defineProperty(target, "name", {
                value: name || source.name,
                writable: false,
                enumerable: false,
                configurable: true,
            });
        } catch (_) {}

        try {
            Object.defineProperty(target, "length", {
                value: source.length,
                writable: false,
                enumerable: false,
                configurable: true,
            });
        } catch (_) {}
    }
}
```

使用示例：

```js
const nativeProtect = NativeProtect.getInstance();

function getItem(key) {
  return storageMap.get(String(key)) ?? null;
}

nativeProtect.setNativeFunc(getItem, 'getItem');

Object.defineProperty(Storage.prototype, 'getItem', {
  value: getItem,
  writable: true,
  enumerable: true,
  configurable: true,
});
```

注意：

- 只在目标 JS 所在运行上下文内 patch，不要污染宿主 Node.js 全局环境；该上下文可以是 `vm`、独立 Node 进程或显式隔离的全局对象。
- `NativeProtect` 是 fallback，不是第一选择；如果 addon 可加载但源码直接手写函数再 `setNativeFunc`，应回退修改为 addon-first。
- 使用 `NativeProtect` fallback 时必须使用带 `structuredClone` / `MessagePort.prototype.postMessage` DataCloneError 改写的版本；如果目标会通过 `structuredClone(fn)` 或 `postMessage(fn)` 检测函数源码，旧版 NativeProtect 会暴露非 native 函数。
- 如果目标 JS 提前保存了原始 `Function.prototype.toString`，后 patch 可能失效。
- 如果使用 `vm`，要确保 patch 发生在目标 JS 所在 context 内；如果不用 `vm`，要确保入口文件以独立进程 / 隔离 global 初始化并在结束后不污染其他任务。

## 属性描述符、访问器与原型链

常见检查：

```js
Object.getOwnPropertyDescriptor(navigator, 'userAgent')
Object.getOwnPropertyDescriptor(window, 'navigator')
Object.getPrototypeOf(document)
navigator.constructor.name
```

处理原则：

- 所有关键属性都用 `Object.defineProperty`，禁止用普通赋值替代关键 WebAPI。
- 对不可写、不可枚举、只读 getter 要显式设置；真实浏览器是 accessor 的属性不得降级为 data descriptor。
- getter / setter 的 `Function.prototype.toString.call(descriptor.get)` / `descriptor.set` 也要 native-like。
- `constructor` 通常不可枚举，并且构造函数本身也要做 toString 保护。
- `Symbol.toStringTag` 与 `NativeProtect.setObjFunc(obj, "Xxx")` 只能用于 JS fallback 的 `[object Xxx]`；addon 创建的实例不要再额外调用 `markObjectType` / `markObjectToString`。
- 发现 `instanceof`、`Object.getPrototypeOf`、`constructor.name` 检测时，补构造函数和完整原型链。

## 网络代理检测

如果用户所说“代理检测”是网络代理 / IP 检测，而不是 JS `Proxy`：

- 默认回退到用户真实浏览器手动取证。
- 不默认启用网络代理。
- 如果必须使用代理，必须由用户提供授权代理并确认使用范围。
- 代理被检测时，不尝试绕过风控；应暂停并让用户选择：
  1. 换回用户真实浏览器手动取证。
  2. 提供 HAR / cURL / JS 文件离线分析。
  3. 在授权环境中更换合规网络环境。

