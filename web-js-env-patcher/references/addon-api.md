# native addon API 使用规范

本文件用于网页端 Node.js 补环境阶段。每次进入补环境阶段、修改 `native-protect.js` / addon helper、创建或修复 WebAPI 对象模型、处理 `document.all`、`navigator.plugins` / `navigator.mimeTypes`、集合对象、私有状态或构造函数行为时必须读取。

## 选择 `isolated-vm` 框架时的 xbs 规则

如果用户选择 `isolated-vm` 补环境框架，必须使用随包魔改 xbs isolated-vm，并读取 `references/xbs-isolated-vm-api.md`。此时 WebAPI native-first 能力来自 Context 内的 `window.xbs` / `globalThis.xbs`，不要把本文件所述旧 `addon.node` 桥接进 isolated-vm。`xbs` API 名称与本文件主要 API 基本一致：`createNativeFunction`、`createGetter`、`createSetter`、`createProtoChains`、`createNativeCollection`、`getMimeTypesAndPlugins`、`createUndetectable` 等；补环境约束仍然是原型链、描述符、访问器、toString、集合对象和特殊对象优先走 native API。

## Skill 硬性规则

1. **addon-first 是默认硬性基线**：进入补环境阶段先加载 / 记录 addon，可用时优先调用 addon API；只有用户明确要求不使用 addon、当前平台缺失、ABI 不兼容或 API 调用失败时，才降级为 `NativeProtect` / JS fallback。
2. **新代码优先新版 API**：构造函数、原型链、别名、实例工厂、原型方法和静态方法优先使用 `createProtoChains(descriptors)`；禁止把旧式 `createProtoChains(name, chain)` 或 `createNativeObject(tag, proto, properties)` 写成新代码主路径。
3. **WebAPI 方法必须 native-like**：普通方法优先 `createNativeFunction(false, name, length, callback)`；构造函数优先 `createProtoChains` 或必要时 `createNativeFunction(true, ...)`；getter / setter 优先 `createGetter` / `createSetter`。
4. **集合对象优先 addon 集合 API**：`HTMLCollection`、`NodeList`、`PluginArray`、`MimeTypeArray`、`DOMTokenList`、`StyleSheetList` 等浏览器集合对象，addon 可用时优先使用 `createNativeCollection` 或 `getMimeTypesAndPlugins`，不要手写普通数组 / 普通对象作为主路径。
5. **plugins / mimeTypes 是强约束**：补 `navigator.plugins` 和 `navigator.mimeTypes` 时，addon 可用必须优先使用 `getMimeTypesAndPlugins([config])`；如果真实浏览器样本与内置 PDF 插件数据不同，传入 config 生成样本一致的插件和 MIME 类型。只有 addon 不可用或用户明确禁用 addon 时，才允许最小 JS fallback，并记录差异。
6. **特殊对象优先 native 能力**：`document.all` 优先 `createUndetectable`；需要 named / indexed property interceptor 的高级对象可用 `createInterceptor`；最终能表达为真实构造函数和集合结构时，仍应迁移到真实对象模型。
7. **内部状态优先 V8 Private**：对象内部状态优先使用 `setPrivate` / `getPrivate` / `hasPrivate` / `deletePrivate`，不要把状态直接挂成可枚举属性；addon 不可用时才用 `WeakMap` fallback。
8. **注册表管理只用于隔离和重置**：`getProtoChainRegistry`、`deleteProtoChainRegistryEntry`、`clearProtoChainRegistry` 主要用于测试隔离、环境重置或分阶段初始化管理；正式补环境应尽量一次性规划对象模型，避免运行中反复删除注册表。
9. **错误行为必须采样**：`constructorBehavior`、`callBehavior`、`constructorErrorMessage`、`callErrorMessage`、`illegalConstructor` 等配置要以目标浏览器采样为准，不要泛化写死 `Illegal constructor`。
10. **禁止本机强依赖**：Skill 文档和最终产物不得写入本机绝对路径；addon 默认从 `assets/native-addon/<platform>-<arch>/addon.node` 加载，用户自定义路径只能作为运行参数或环境变量。

## WebAPI 默认映射

| 场景 | addon-first API |
|---|---|
| 构造函数、原型链、别名、实例工厂 | `createProtoChains(descriptors)` |
| 普通 WebAPI 方法 | `createNativeFunction(false, name, length, callback)` |
| getter / setter | `createGetter(name, 0, callback)` / `createSetter(name, 1, callback)` |
| `document.all` / HTMLDDA 近似 | `createUndetectable(callback, handlers)` |
| `navigator.plugins` / `navigator.mimeTypes` | `getMimeTypesAndPlugins(config)` |
| `HTMLCollection` / `NodeList` / 类数组集合 | `createNativeCollection(options)` |
| named / indexed property interceptor | `createInterceptor(options)` |
| 内部状态 | `setPrivate` / `getPrivate` / `hasPrivate` / `deletePrivate` |
| 构造函数注册表隔离 | `getProtoChainRegistry` / `deleteProtoChainRegistryEntry` / `clearProtoChainRegistry` |
| 浏览器 TypeError | `throwTypeError(message)` |

## 降级记录要求

如果发生 NativeProtect / JS fallback，必须在 notes、阶段报告和最终总结写明：

- addon 加载路径或随包加载结果。
- 失败 API、错误信息、Node 版本、平台和 ABI。
- fallback 覆盖范围和已知差异。
- 是否为用户明确豁免。

---
# 项目对外 API 使用说明

本文档说明当前 Node.js native addon 对外可用 API、常用配置项、返回值、示例和注意事项。文档基于当前项目源码 `main.cc`、`undetect.cc`、`test.js` 与当前构建产物的可见导出整理。

> 加载方式示例：
>
> ```js
> const addon = require("./build/Release/addon");
> ```

## 1. API 总览

| API | 推荐状态 | 主要用途 |
| --- | --- | --- |
| `createNativeFunction` | 推荐 | 创建 native-like 函数或构造函数，`Function.prototype.toString` 显示为 `[native code]`。 |
| `createGetter` | 推荐 | 创建 native-like getter 函数，例如 `function get userAgent() { [native code] }`。 |
| `createSetter` | 推荐 | 创建 native-like setter 函数，例如 `function set value() { [native code] }`。 |
| `createNativeObject` | 兼容 / 旧式 | 创建单个构造函数、实例对象和嵌套父级原型链。新代码更建议使用 `createProtoChains`。 |
| `createProtoChains` | 推荐 | 批量创建构造函数、原型链、构造函数继承、别名、实例工厂、原型方法和静态方法。 |
| `getProtoChainRegistry` | 推荐 | 查看 `createProtoChains` 的全局构造函数 / 别名注册表。 |
| `deleteProtoChainRegistryEntry` | 推荐 | 删除注册表中的构造函数或别名，并清理指向该构造函数的别名。 |
| `clearProtoChainRegistry` | 推荐 | 清空 `createProtoChains` 注册表，适合测试隔离或环境重新初始化。 |
| `getPrivate` | 推荐 | 读取 V8 Private 私有字段。 |
| `setPrivate` | 推荐 | 写入 V8 Private 私有字段。 |
| `hasPrivate` | 推荐 | 判断对象上是否存在指定 V8 Private 私有字段。 |
| `deletePrivate` | 推荐 | 删除对象上的指定 V8 Private 私有字段。 |
| `createInterceptor` | 高级 | 创建带 V8 named / indexed property interceptor 的对象。 |
| `createNativeCollection` | 推荐 | 通用浏览器集合对象工厂，可创建 `HTMLCollection`、`NodeList`、`PluginArray` 类似对象。 |
| `getMimeTypesAndPlugins` | 可用 | 创建浏览器风格 `navigator.mimeTypes` / `navigator.plugins`；支持默认数据和参数化配置。 |
| `createUndetectable` | 高级 | 创建 V8 undetectable 对象，常用于近似 `document.all` / HTMLDDA 行为。 |
| `throwTypeError` | 辅助 | 从 native addon 抛出 `TypeError`。 |
| `hello` | 历史调试 | 当前源码未导出，正式补环境逻辑不要依赖。 |

## 2. 通用注意事项

1. **API 都是 native 函数**：导出函数自身的 `Function.prototype.toString.call(api)` 通常为 `function xxx() { [native code] }`。
2. **参数类型要严格**：多数 API 在参数类型不满足时会直接不返回结果或抛错，调用前建议自行校验。
3. **构造回调参数差异**：
   - `createProtoChains` / `createNativeObject` 的构造回调总会把 `isNew` 作为第一个参数传入。
   - `createNativeFunction(true, ...)` 只有在 `new` 调用时才把 `isNew` 作为第一个参数传入；普通调用不会自动补这个布尔值。
4. **回调参数已按实际长度传递**：`createProtoChains` / `createNativeFunction` 内部会按调用参数数量动态构造参数数组；仍建议 WebAPI 形参保持和真实浏览器 `.length` 一致。
5. **命名全局注册**：`createProtoChains` 内部维护构造函数模板与别名注册表，同名构造函数会跨调用复用。请使用稳定且不冲突的名称；测试或重新初始化时可用注册表管理 API 清理。

## 3. `createNativeFunction(isConstructor, name, length, callback)`

创建一个 native-like 函数或构造函数。

### 参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `isConstructor` | `boolean` | 是 | `true` 表示允许 `new`，`false` 表示不可构造。 |
| `name` | `string` | 是 | 函数名 / 构造函数名。 |
| `length` | `number` | 是 | 函数形参长度，会影响 `.length`。 |
| `callback` | `function` | 是 | 实际执行逻辑。 |

### 行为

- `isConstructor === true`：
  - 允许 `new Fn()`。
  - 构造调用时，`callback` 的第一个参数是 `isNew === true`。
  - 构造调用最终返回 `this`，即使 `callback` 返回其他值。
  - 普通调用 `Fn()` 也允许，但不会自动传入 `isNew`。
- `isConstructor === false`：
  - 只能普通调用。
  - `new fn()` 会抛出不可构造相关错误。

### 示例

```js
const XBS = addon.createNativeFunction(true, "XBS", 0, function (isNew) {
  if (isNew) this.value = 111;
});

console.log(new XBS().value); // 111
console.log(XBS.toString());  // function XBS() { [native code] }

const add = addon.createNativeFunction(false, "add", 2, function (a, b) {
  return a + b;
});

console.log(add(1, 2));       // 3
console.log(add.toString());  // function add() { [native code] }
```

## 4. `createGetter(name, length, callback)`

创建 native-like getter 函数。

### 参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | `string` | 是 | getter 对应属性名。 |
| `length` | `number` | 是 | 当前实现会校验该参数，但实际 getter `.length` 固定为 `0`。 |
| `callback` | `function` | 是 | getter 实际逻辑。`this` 为访问该属性的对象。 |

### 示例

```js
class Navigator {}

Object.defineProperty(Navigator.prototype, "userAgent", {
  get: addon.createGetter("userAgent", 0, function () {
    if (!(this instanceof Navigator)) {
      addon.throwTypeError("Illegal invocation");
    }
    return "Mozilla/5.0";
  }),
  enumerable: true,
  configurable: true,
});

const getter = Object.getOwnPropertyDescriptor(Navigator.prototype, "userAgent").get;
console.log(getter.toString()); // function get userAgent() { [native code] }
```

## 5. `createSetter(name, length, callback)`

创建 native-like setter 函数。

### 参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | `string` | 是 | setter 对应属性名。 |
| `length` | `number` | 是 | 当前实现会校验该参数，但实际 setter `.length` 固定为 `1`。 |
| `callback` | `function` | 是 | setter 实际逻辑。`this` 为访问该属性的对象。 |

### 示例

```js
const state = new WeakMap();
class Location {}

Object.defineProperty(Location.prototype, "href", {
  get: addon.createGetter("href", 0, function () {
    return state.get(this) || "";
  }),
  set: addon.createSetter("href", 1, function (value) {
    state.set(this, String(value));
  }),
  enumerable: true,
  configurable: true,
});
```

## 6. `createNativeObject(options)`

旧式单对象创建 API。它会创建一个构造函数、一个实例对象，并可通过嵌套 `parent` 创建父级构造函数和原型链。

### 配置项

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `name` | `string` | 无 | 构造函数名，必填。 |
| `length` | `number` | 无 | 构造函数 `.length`，必填。 |
| `constructor` | `function` | 无 | 构造回调，必填。第一个参数固定为 `isNew`。 |
| `isReadOnlyPrototype` | `boolean` | `false` | 使构造函数 `.prototype` 属性只读。 |
| `isImmutableProto` | `boolean` | `false` | 使构造函数的 `prototype` 对象原型不可更改。 |
| `isImmutableInstanceProto` | `boolean` | `false` | 使创建出的实例对象原型不可更改。 |
| `parent` | `object` | 无 | 父级描述符，结构与当前 options 类似，可继续嵌套。 |

### 返回值

```ts
{
  instance: object,
  constructor: Function,
  prototypeChains?: Function[]
}
```

### 示例

```js
const result = addon.createNativeObject({
  name: "Window",
  length: 0,
  constructor(isNew) {
    if (isNew) throw new TypeError("Failed to construct 'Window': Illegal constructor");
    throw new TypeError("Illegal constructor");
  },
  isReadOnlyPrototype: true,
  isImmutableProto: true,
  isImmutableInstanceProto: true,
  parent: {
    name: "EventTarget",
    length: 0,
    constructor(isNew) {
      if (!isNew) throw new TypeError("Please use the 'new' operator");
    },
    isReadOnlyPrototype: true,
    isImmutableProto: true,
  },
});

const window = result.instance;
const Window = result.constructor;
console.log(window instanceof Window); // true
```

### 建议

新功能优先使用 `createProtoChains`，因为它支持字符串父级引用、构造函数父级、跨调用复用、别名和实例工厂。

## 7. `createProtoChains(descriptors)`

批量创建构造函数、原型链和实例相关对象，是当前推荐的构造函数 / 原型链 API。

### 基本调用

```js
const chain = addon.createProtoChains([
  {
    name: "EventTarget",
    length: 0,
    constructor(isNew) {
      if (!isNew) {
        throw new TypeError(
          "Failed to construct 'EventTarget': Please use the 'new' operator"
        );
      }
    },
  },
  {
    name: "Node",
    length: 0,
    constructor(isNew) {},
    prototypeParent: "EventTarget",
  },
]);

const { EventTarget, Node } = chain;
console.log(new Node() instanceof EventTarget); // true
```

### 普通构造函数描述符

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `name` | `string` | 无 | 构造函数名，必填。 |
| `constructor` | `function` | 无 | 构造回调，必填。第一个参数固定为 `isNew`。 |
| `length` | `number` | `0` | 构造函数 `.length`。 |
| `prototypeParent` | `string` | 无 | 原型父级。设置后会使 `Child.prototype -> Parent.prototype`。 |
| `parent` | `string` | 无 | `prototypeParent` 的旧字段别名。 |
| `constructorParent` | `string` / `null` | 默认同 `prototypeParent` | 构造函数对象自身的父级。设置后会使 `Child -> Parent`，用于静态属性继承。传 `null` 可显式禁用默认继承。 |
| `readOnlyPrototypeProperty` | `boolean` | `false` | 使构造函数 `.prototype` 属性只读。 |
| `isReadOnlyPrototype` | `boolean` | `false` | `readOnlyPrototypeProperty` 的旧字段别名。 |
| `immutablePrototypeObject` | `boolean` | `false` | 使 `Constructor.prototype` 的 `[[Prototype]]` 不可更改。 |
| `isImmutableProto` | `boolean` | `false` | `immutablePrototypeObject` 的旧字段别名。 |
| `immutableInstancePrototype` | `boolean` | `false` | 使通过模板创建的实例对象 `[[Prototype]]` 不可更改。 |
| `isImmutableInstanceProto` | `boolean` | `false` | `immutableInstancePrototype` 的旧字段别名。 |
| `hasToStringTag` | `boolean` | `true` | 是否在 `Constructor.prototype` 上设置 `Symbol.toStringTag`。 |
| `toStringTag` | `string` | `name` | `Symbol.toStringTag` 的值。 |
| `internalClassName` | `string` | 无 | 写入 addon 内部类型名。即使没有 `Symbol.toStringTag`，也能让 addon 创建的实例在 `Object.prototype.toString.call(instance)` 中显示指定标签。 |
| `constructorBehavior` | `"allow"` / `"illegal"` / `"throw"` | `"allow"` | 控制 `new Constructor()` 的 native 层行为。`illegal` 与 `throw` 都会在进入 JS 回调前抛出 `TypeError`。 |
| `callBehavior` | `"allow"` / `"illegal"` / `"throw"` | `"allow"` | 控制 `Constructor()` 直接调用的 native 层行为。 |
| `constructorErrorMessage` | `string` | 自动生成 | `constructorBehavior` 抛错时使用的错误信息。 |
| `callErrorMessage` | `string` | `"Illegal constructor"` | `callBehavior` 抛错时使用的错误信息。 |
| `illegalConstructor` | `boolean` | `false` | 便捷配置；为 `true` 时同时把 `constructorBehavior` 和 `callBehavior` 设置为 `"illegal"`。 |
| `prototypeMethods` | `NativeMember[]` | `[]` | 批量定义到 `Constructor.prototype` 的 native-like 方法。 |
| `staticMethods` | `NativeMember[]` | `[]` | 批量定义到构造函数自身的 native-like 静态方法。 |
| `aliases` | `string[]` | `[]` | 为当前构造函数注册一个或多个别名，别名导出的是同一个函数对象。 |
| `instanceFactoryName` | `string` | 无 | 创建实例工厂函数的导出名。用于公开构造函数不能 `new`，但内部仍要创建实例的场景。 |
| `instanceInitializer` | `function` | 无 | factory 创建实例后调用，`this` 指向实例，factory 参数会原样传入。必须配合 `instanceFactoryName` 使用。 |
| `isCreateInstance` | `boolean` | `false` | 旧式立即创建实例开关。 |
| `instanceName` | `string` | 无 | 旧式实例导出名，配合 `isCreateInstance: true` 使用。 |

### alias-only 描述符

用于给已有构造函数注册别名。

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `name` | `string` | 是 | 别名导出名。 |
| `aliasOf` | `string` | 是 | 指向的真实构造函数名或已有别名。 |

alias-only 描述符不能定义 `constructor`、`length`、父级、不可变选项、`toStringTag`、`aliases`、实例或 factory 相关字段。

### 返回值

返回一个普通对象，包含：

1. 所有本次创建或解析到的构造函数：`result[name]`。
2. 所有可导出的别名：`result[alias]`，值与真实构造函数严格相等。
3. 使用旧式 `isCreateInstance + instanceName` 创建的实例。
4. 使用 `instanceFactoryName` 创建的 factory 函数。

### `prototypeParent` 与 `constructorParent`

```js
const { Base, Child } = addon.createProtoChains([
  { name: "Base", length: 0, constructor() {} },
  { name: "Child", length: 0, constructor() {}, prototypeParent: "Base" },
]);

Object.getPrototypeOf(Child.prototype) === Base.prototype; // true
Object.getPrototypeOf(Child) === Base;                     // true，因为 constructorParent 默认同 prototypeParent
```

- `prototypeParent` 控制实例链：`new Child() instanceof Base`。
- `constructorParent` 控制构造函数对象链：`Child.__proto__ === Base`，用于静态属性继承。
- 如果只想继承实例链，不想继承构造函数对象链：

```js
addon.createProtoChains([
  { name: "Base", length: 0, constructor() {} },
  {
    name: "Child",
    length: 0,
    constructor() {},
    prototypeParent: "Base",
    constructorParent: null,
  },
]);
```

### 只读与不可变选项区别

| 选项 | 影响对象 | 效果 |
| --- | --- | --- |
| `readOnlyPrototypeProperty` | 构造函数的 `.prototype` 属性 | `.prototype` 属性不可写。 |
| `immutablePrototypeObject` | `Constructor.prototype` 对象 | 不能通过 `Object.setPrototypeOf(Constructor.prototype, ...)` 改它的原型。 |
| `immutableInstancePrototype` | 创建出的实例对象 | 不能通过 `Object.setPrototypeOf(instance, ...)` 改实例原型。 |

### `Symbol.toStringTag`

默认会设置：

```js
Constructor.prototype[Symbol.toStringTag] === name;
Object.prototype.toString.call(new Constructor()); // [object name]
```

关闭：

```js
{ name: "NoTag", constructor() {}, hasToStringTag: false }
```

自定义：

```js
{ name: "URL", constructor() {}, toStringTag: "URL" }
```

### 内部 `[[Class]]` / 无 `Symbol.toStringTag` 标签

有些浏览器对象没有暴露 `Symbol.toStringTag`，但 `Object.prototype.toString.call(obj)` 仍然需要返回指定标签。此时可以关闭 `hasToStringTag`，并使用 `internalClassName`：

```js
const { createDocument } = addon.createProtoChains([
  {
    name: "Document",
    constructor() {},
    hasToStringTag: false,
    internalClassName: "Document",
    instanceFactoryName: "createDocument",
  },
]);

const document = createDocument();
console.log(document[Symbol.toStringTag]);              // undefined
console.log(Object.prototype.toString.call(document));  // [object Document]
```

实现注意：

- `internalClassName` 使用 V8 Private 保存，不会成为普通 JS 可枚举属性。
- addon 会安装 native-like 的 `Object.prototype.toString` 包装函数；普通对象、`null`、`undefined` 会回退原始行为。
- 如果同时设置了 `Symbol.toStringTag` 和 `internalClassName`，实际检测结果应以目标浏览器样本为准，建议二选一保持结构清晰。

### 构造函数行为模式

`constructorBehavior` 和 `callBehavior` 用于在 native 层提前控制公开构造函数能否被 `new` 或直接调用。适合“公开构造函数不可用，但内部 factory 可以创建实例”的 DOM 场景。

```js
const { Document, createDocument } = addon.createProtoChains([
  {
    name: "Document",
    constructor() {
      throw new Error("不会执行到这里");
    },
    constructorBehavior: "throw",
    constructorErrorMessage: "Failed to construct 'Document': Illegal constructor",
    callBehavior: "throw",
    callErrorMessage: "Illegal constructor",
    instanceFactoryName: "createDocument",
  },
]);

try { new Document(); } catch (err) { console.log(err.message); }
try { Document(); } catch (err) { console.log(err.message); }

const document = createDocument();
console.log(document instanceof Document); // true
```

行为说明：

- `allow`：允许调用并进入 `constructor` JS 回调。
- `illegal` / `throw`：在 native 层抛 `TypeError`，不会执行 `constructor` JS 回调。
- `illegalConstructor: true` 是快捷写法，等价于公开构造和直接调用都走非法构造路径。
- 错误信息建议来自目标浏览器采样，不要随意泛化。

### 批量定义原型方法和静态方法

`prototypeMethods` 与 `staticMethods` 的元素结构如下：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `name` | `string` | 无 | 方法名。 |
| `callback` | `function` | 无 | 实际执行逻辑。也兼容字段名 `value`。 |
| `length` | `number` | `0` | 方法 `.length`。 |
| `writable` | `boolean` | `true` | descriptor 的 `writable`。 |
| `enumerable` | `boolean` | `true` | descriptor 的 `enumerable`。 |
| `configurable` | `boolean` | `true` | descriptor 的 `configurable`。 |

```js
const { URL } = addon.createProtoChains([
  {
    name: "URL",
    constructor(isNew, href) {
      if (isNew) this.href = String(href);
    },
    prototypeMethods: [
      {
        name: "toJSON",
        length: 0,
        enumerable: false,
        callback() {
          return this.href;
        },
      },
    ],
    staticMethods: [
      {
        name: "canParse",
        length: 1,
        callback(value) {
          return typeof value === "string" && value.length > 0;
        },
      },
    ],
  },
]);

const url = new URL("https://example.com/");
console.log(url.toJSON());       // https://example.com/
console.log(URL.canParse("/"));  // true
console.log(url.toJSON.toString()); // function toJSON() { [native code] }
```

### 别名：`aliases` 与 `aliasOf`

适合模拟 `URL` / `webkitURL` 这类同一构造函数多个名字的场景。

```js
const { URL, webkitURL } = addon.createProtoChains([
  {
    name: "URL",
    aliases: ["webkitURL"],
    length: 0,
    constructor() {},
  },
]);

console.log(webkitURL === URL); // true
console.log(webkitURL.name);    // URL
```

也可以单独注册：

```js
const first = addon.createProtoChains([
  { name: "URL", length: 0, constructor() {} },
]);

const second = addon.createProtoChains([
  { name: "webkitURL", aliasOf: "URL" },
]);

console.log(second.webkitURL === first.URL); // true
```

### 实例工厂：`instanceFactoryName` / `instanceInitializer`

用于“公开构造函数不能被 `new`，但内部仍需要创建一个合法实例”的场景。

```js
const { Document, createDocument } = addon.createProtoChains([
  {
    name: "Document",
    length: 0,
    constructor(isNew) {
      if (isNew) {
        throw new TypeError("Failed to construct 'Document': Illegal constructor");
      }
      throw new TypeError("Illegal constructor");
    },
    instanceFactoryName: "createDocument",
    instanceInitializer(url) {
      this.url = url;
    },
  },
]);

try {
  new Document();
} catch (err) {
  console.log(err.message); // Failed to construct 'Document': Illegal constructor
}

const doc = createDocument("https://example.com/");
console.log(doc instanceof Document); // true
console.log(doc.url);                 // https://example.com/
```

特点：

- factory 通过 native `InstanceTemplate` 创建实例，不调用公开构造函数回调。
- factory 自身不可 `new`。
- `instanceInitializer` 的 `this` 是新实例。
- factory 名不能和构造函数名、别名、旧式 `instanceName` 或其他 factory 重名。

### 旧式立即创建实例

仍然可用，但新代码更推荐使用实例工厂。

```js
const { Window, window } = addon.createProtoChains([
  {
    name: "Window",
    length: 0,
    constructor(isNew) {
      if (isNew) throw new TypeError("Illegal constructor");
    },
    isCreateInstance: true,
    instanceName: "window",
  },
]);

console.log(window instanceof Window); // true
```

### 跨调用复用与冲突规则

- 同名构造函数会复用已注册的 `FunctionTemplate` / `Function`。
- 已注册别名也会参与后续父级解析。
- 别名不能和真实构造函数名冲突。
- `aliasOf` 必须指向当前调用中存在或之前已注册的构造函数 / 别名。
- 对已经创建并发布过的构造函数，不建议后续再尝试改变它自身的父级或原型继承关系；请尽量一次性完成该构造函数的结构定义。

### 注册表管理 API

`createProtoChains` 会把构造函数模板、构造函数对象和别名写入内部注册表，便于后续跨调用复用父级和别名。新增了三个管理 API：

| API | 参数 | 返回值 | 说明 |
| --- | --- | --- | --- |
| `getProtoChainRegistry()` | 无 | `{ constructors: string[], aliases: object }` | 查看当前已注册构造函数名和别名映射。 |
| `deleteProtoChainRegistryEntry(name)` | `name: string` | `boolean` | 删除指定构造函数或别名。删除构造函数时，也会清理指向它的别名。 |
| `clearProtoChainRegistry()` | 无 | `boolean` | 清空全部构造函数和别名注册。 |

```js
addon.createProtoChains([
  {
    name: "URL",
    aliases: ["webkitURL"],
    constructor() {},
  },
]);

console.log(addon.getProtoChainRegistry());
// { constructors: ["URL"], aliases: { webkitURL: "URL" } }

addon.deleteProtoChainRegistryEntry("URL");
addon.clearProtoChainRegistry();
```

注意：

- 这些 API 主要用于测试隔离、环境重置或分阶段初始化管理。
- 删除注册表不会主动销毁 JS 中已经拿到的构造函数引用，只是不再让后续 `createProtoChains` 通过注册表复用它。
- 正式补环境中建议一次性规划好对象模型，减少运行中清理注册表。

## 8. V8 Private 私有槽 API

基于 V8 `Private::ForApi` 给对象保存不可通过普通 JS 属性枚举访问的私有值。

### 参数

| API | 参数 | 返回值 |
| --- | --- | --- |
| `setPrivate` | `object: object, key: string, value: any` | `boolean`，写入是否成功。 |
| `getPrivate` | `object: object, key: string` | 保存的值；不存在时通常为 `undefined`。 |
| `hasPrivate` | `object: object, key: string` | `boolean`，指定私有槽是否存在。 |
| `deletePrivate` | `object: object, key: string` | `boolean`，删除是否成功。 |

### 示例

```js
const obj = {};

addon.setPrivate(obj, "internalState", { ok: true });
console.log(obj.internalState); // undefined
console.log(addon.hasPrivate(obj, "internalState")); // true
console.log(addon.getPrivate(obj, "internalState")); // { ok: true }

addon.deletePrivate(obj, "internalState");
console.log(addon.hasPrivate(obj, "internalState")); // false
console.log(addon.getPrivate(obj, "internalState")); // undefined
```

## 9. `getMimeTypesAndPlugins([config])`

创建一组浏览器风格插件对象，通常用于补 `navigator.mimeTypes` 和 `navigator.plugins`。不传参数时使用项目内置 PDF 插件数据；传入 `config` 时按配置生成插件和 MIME 类型。

### 返回值

```ts
{
  mimeTypes: MimeTypeArrayLike,
  plugins: PluginArrayLike,
  PluginArray: Function,
  MimeTypeArray: Function,
  MimeType: Function,
  Plugin: Function
}
```

### 当前内置数据

- `mimeTypes.length === 2`
  - `application/pdf`
  - `text/pdf`
- `plugins.length === 5`
  - `PDF Viewer`
  - `Chrome PDF Viewer`
  - `Chromium PDF Viewer`
  - `Microsoft Edge PDF Viewer`
  - `WebKit built-in PDF`

### 参数化配置

```ts
type MimePluginConfig = {
  plugins?: Array<{
    name: string;
    filename?: string;
    description?: string;
    mimeTypes?: Array<{
      type: string;
      suffixes?: string;
      description?: string;
    }>;
  }>;
};
```

配置规则：

- `plugins` 不是数组时按空数组处理。
- 每个 plugin 会生成一个 `Plugin` 实例，并写入 `name`、`filename`、`description`、`length`。
- 每个 MIME 配置会生成一个 `MimeType` 实例，并写入 `type`、`suffixes`、`description`、`enabledPlugin`。
- 返回的 `plugins` 与 `mimeTypes` 都由 `createNativeCollection` 生成，支持 `length`、数字索引、`item()`、`namedItem()`、迭代和 `Symbol.toStringTag`。

```js
const result = addon.getMimeTypesAndPlugins({
  plugins: [
    {
      name: "Custom PDF Viewer",
      filename: "custom-pdf-viewer",
      description: "Custom Portable Document Format",
      mimeTypes: [
        {
          type: "application/x-custom-pdf",
          suffixes: "cpdf",
          description: "Custom PDF",
        },
      ],
    },
  ],
});

console.log(result.plugins.length);       // 1
console.log(result.mimeTypes.length);     // 1
console.log(result.plugins[0].name);      // Custom PDF Viewer
console.log(result.plugins.namedItem("Custom PDF Viewer") === result.plugins[0]); // true
console.log(result.mimeTypes[0].enabledPlugin === result.plugins[0]);             // true
```

### 支持行为

- `mimeTypes.item(index)` / `plugins.item(index)`。
- `mimeTypes.namedItem(name)` / `plugins.namedItem(name)`。
- 数字索引访问和名称访问。
- `Plugin.prototype[Symbol.iterator]` 近似使用数组迭代器。
- `PluginArray`、`MimeTypeArray`、`MimeType`、`Plugin` 构造函数都会模拟非法构造：直接调用或 `new` 都会抛出 TypeError。

### 示例

```js
const {
  mimeTypes,
  plugins,
  PluginArray,
  MimeTypeArray,
  MimeType,
  Plugin,
} = addon.getMimeTypesAndPlugins();

Object.defineProperty(navigator, "mimeTypes", {
  value: mimeTypes,
  enumerable: true,
  configurable: true,
});

Object.defineProperty(navigator, "plugins", {
  value: plugins,
  enumerable: true,
  configurable: true,
});

console.log(mimeTypes.item(0) === mimeTypes[0]);
console.log(mimeTypes.namedItem("application/pdf"));

try { new Plugin(); } catch (err) { console.log(err.message); }
```

### 注意

当前源码中 `MimeType` 的部分 className / `Symbol.toStringTag` 拼写为 `MimeTpye`，如果目标检测非常严格，需要按实际输出决定是否修正源码或在 JS 层额外处理。

## 10. `createInterceptor(options)`

创建一个带 V8 named / indexed property interceptor 的对象。它适合做受控的“虚拟属性 + backing target”对象，能拦截读取、写入、查询、删除、枚举和属性描述符。

### 参数

```ts
type InterceptorOptions = {
  target?: object;
  handlers?: {
    getter?: (target: object, property: string | number | symbol) => any;
    setter?: (target: object, property: string | number | symbol, value: any) => any;
    query?: (target: object, property: string | number | symbol) => number;
    deleter?: (target: object, property: string | number | symbol) => boolean;
    enumerator?: (target: object) => Array<string | number>;
    definer?: (target: object, property: string | number | symbol, descriptor: object) => any;
    descriptor?: (target: object, property: string | number | symbol) => PropertyDescriptor;
  };
  immutablePrototype?: boolean;
  internalClassName?: string;
};
```

### handler 返回约定

| handler | 返回值约定 |
| --- | --- |
| `getter` | 返回 `{ value }` 表示拦截并返回该值；返回 `{ intercept: false }` 表示放弃拦截并回落到 `target`。 |
| `setter` | 返回 `{ intercept: true, value }` 可改写写入 `target` 的值；返回 `{ intercept: false }` 可放弃 native 拦截。 |
| `descriptor` | 返回标准属性描述符对象。 |
| `enumerator` | 返回枚举属性名数组；indexed enumerator 内部只接受可转成 uint32 的索引。 |
| `query` | 可返回 V8 属性特性数字；未返回时会尝试从 `descriptor` 或 `target` 推导。 |
| `deleter` | 返回布尔值可作为删除结果。 |
| `definer` | 返回 `false` 或 `{ intercept: false }` 可放弃拦截，否则 descriptor 会定义到 `target`。 |

### 示例

```js
const target = { existing: 1 };
const obj = addon.createInterceptor({
  target,
  internalClassName: "MagicInterceptor",
  handlers: {
    getter(targetObject, property) {
      if (property === "virtual") return { value: 42 };
      return { intercept: false };
    },
    setter(targetObject, property, value) {
      return { intercept: true, value: String(value) };
    },
    descriptor(targetObject, property) {
      if (property === "virtual") {
        return {
          value: 42,
          writable: true,
          enumerable: true,
          configurable: true,
        };
      }
    },
    enumerator() {
      return ["virtual"];
    },
  },
});

console.log(obj.virtual);                         // 42
console.log(obj.existing);                        // 1
obj.created = 123;
console.log(target.created);                      // "123"
console.log(Object.keys(obj));                    // ["virtual"]
console.log(Object.prototype.toString.call(obj)); // [object MagicInterceptor]
```

注意：`createInterceptor` 适合高级探测和特殊对象；最终 WebAPI 若能用真实对象、描述符和 `createProtoChains` 表达，仍优先使用真实结构。

## 11. `createNativeCollection(options)`

通用浏览器集合对象工厂，用于创建 `HTMLCollection`、`NodeList`、`PluginArray`、`MimeTypeArray` 等“有 length、数字索引、名称索引、item、namedItem、可迭代”的集合对象。

### 参数

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `name` | `string` | `"NativeCollection"` | 集合构造函数名。 |
| `items` | `Array<any | { name?: string, value: any }>` | `[]` | 集合元素。对象项的 `value` 是实际元素，`name` 用于命名访问和 `namedItem()`。 |
| `itemMethod` | `boolean` | `true` | 是否在 prototype 上安装 `item(index)`。 |
| `namedItemMethod` | `boolean` | `true` | 是否在 prototype 上安装 `namedItem(name)`。 |
| `indexedAccess` | `boolean` | `true` | 是否定义数字索引属性。 |
| `namedAccess` | `boolean` | `true` | 是否定义名称属性。 |
| `namedEnumerable` | `boolean` | `false` | 名称属性是否可枚举。 |
| `iterable` | `boolean` | `true` | 是否安装 `Symbol.iterator`。 |
| `hasToStringTag` | `boolean` | `true` | 是否设置 `Symbol.toStringTag`。 |
| `toStringTag` | `string` | 同 `name` | `Symbol.toStringTag` 的值。 |
| `internalClassName` | `string` | 无 | 不暴露 `Symbol.toStringTag` 时使用的内部对象标签。 |
| `immutableInstancePrototype` | `boolean` | `false` | 是否使集合实例原型不可改。 |

### 返回值

```ts
{
  collection: object;
  constructor: Function;
  [name: string]: Function;
}
```

### 示例

```js
const first = { id: 1 };
const second = { id: 2 };

const result = addon.createNativeCollection({
  name: "HTMLCollection",
  items: [
    { name: "first", value: first },
    { name: "second", value: second },
  ],
  hasToStringTag: false,
  internalClassName: "HTMLCollection",
});

const collection = result.collection;
const HTMLCollection = result.HTMLCollection;

console.log(result.constructor === HTMLCollection); // true
console.log(collection.length);                     // 2
console.log(collection[0] === first);               // true
console.log(collection.first === first);            // true
console.log(collection.item(1) === second);         // true
console.log(collection.namedItem("second") === second);
console.log([...collection]);                       // [first, second]
console.log(Object.prototype.toString.call(collection)); // [object HTMLCollection]

try { new HTMLCollection(); } catch (err) { console.log(err.message); }
```

## 12. `createUndetectable(callback[, handlers])`

创建一个 V8 `MarkAsUndetectable()` 对象，适合模拟 `document.all` 这类特殊对象。

### 参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `callback` | `function` | 是 | 对象被当作函数调用时执行。`this` 为内部 target。 |
| `handlers` | `object` | 否 | 属性拦截处理器集合。 |

### handler 列表

| handler | 调用签名 | 说明 |
| --- | --- | --- |
| `getter` | `(target, property)` | 属性读取前调用。返回普通对象（例如 `{}`）时会继续从内部 target 读取同名属性；返回 `{ intercept: false }` 表示放弃 native 拦截并回落到外层对象默认读取。当前 addon 中如果只定义 `setter` 而不定义 `getter`，读取刚写入的属性可能得到 `undefined`，因此需要读写内部 target 属性时必须显式提供 `getter() { return {}; }`。 |
| `setter` | `(target, property, value)` | 属性写入时调用。可返回 `{ intercept: true, value }` 改写保存值，或 `{ intercept: false, value }` 放弃拦截。 |
| `query` | `(target, property)` | 用于属性存在性 / 属性特性查询。 |
| `deleter` | `(target, property)` | 删除属性时调用。返回布尔值可直接作为删除结果。 |
| `enumerator` | `(target)` | 枚举属性名。返回数组时使用该数组，否则使用 target 自有属性。 |
| `definer` | `(target, property, descriptor)` | `Object.defineProperty` 时调用。返回 `false` 或 `{ intercept: false }` 可放弃拦截。 |
| `descriptor` | `(target, property)` | `Object.getOwnPropertyDescriptor` 时调用。返回 descriptor 可覆盖默认结果。 |

### 示例：近似 `document.all`

```js
const all = addon.createUndetectable(function () {
  return undefined;
});

Object.defineProperty(document, "all", {
  value: all,
  enumerable: false,
  configurable: true,
});
```

### 示例：带属性拦截

```js
const special = addon.createUndetectable(
  function (...args) {
    return undefined;
  },
  {
    getter(target, property) {
      return {};
    },
    setter(target, property, value) {
      return { intercept: true, value: String(value) };
    },
    descriptor(target, property) {
      if (property === "hidden") {
        return { value: 1, writable: true, enumerable: false, configurable: true };
      }
    },
  }
);

special.foo = 123;
console.log(special.foo); // "123"
```

## 13. `throwTypeError(message)`

从 native addon 抛出 `TypeError`。

### 参数

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `message` | `string` | 是 | 错误消息。 |

### 示例

```js
function assertIllegalInvocation(thisValue, Ctor) {
  if (!(thisValue instanceof Ctor)) {
    addon.throwTypeError("Illegal invocation");
  }
}
```

如果没有传参，会抛出：`the number of parameters must be at least one.`

如果第一个参数不是字符串，会抛出：`the first parameter require is a string.`

## 14. `hello()`

历史调试 API。当前源码中 `NODE_SET_METHOD(exports, "hello", Method);` 已注释，当前重新构建后的导出列表不包含 `hello`。请不要在正式补环境逻辑中依赖它。

## 15. 推荐组合用法

### 创建普通 native-like 方法

```js
Storage.prototype.getItem = addon.createNativeFunction(false, "getItem", 1, function (key) {
  return storageMap.get(String(key)) ?? null;
});
```

更推荐配合 `Object.defineProperty`：

```js
Object.defineProperty(Storage.prototype, "getItem", {
  value: addon.createNativeFunction(false, "getItem", 1, function (key) {
    return storageMap.get(String(key)) ?? null;
  }),
  writable: true,
  enumerable: true,
  configurable: true,
});
```

### 创建不可直接构造但可内部实例化的 DOM 构造函数

```js
const { Document, createDocument } = addon.createProtoChains([
  {
    name: "Document",
    length: 0,
    constructor(isNew) {
      if (isNew) throw new TypeError("Failed to construct 'Document': Illegal constructor");
      throw new TypeError("Illegal constructor");
    },
    readOnlyPrototypeProperty: true,
    immutablePrototypeObject: true,
    immutableInstancePrototype: true,
    instanceFactoryName: "createDocument",
    instanceInitializer(url) {
      Object.defineProperty(this, "URL", {
        value: String(url),
        enumerable: true,
        configurable: true,
      });
    },
  },
]);

const document = createDocument("https://example.com/");
```

### 创建带别名的构造函数

```js
const { URL, webkitURL } = addon.createProtoChains([
  {
    name: "URL",
    aliases: ["webkitURL"],
    length: 1,
    constructor(isNew, url) {
      if (!isNew) throw new TypeError("Class constructor URL cannot be invoked without 'new'");
      this.href = String(url);
    },
  },
]);

console.log(URL === webkitURL); // true
```

## 16. 建议实践

1. 优先使用 `createProtoChains` 管理构造函数、原型链、别名、实例工厂、原型方法和静态方法。
2. 对 WebAPI 关键属性统一使用 `Object.defineProperty` / `Object.defineProperties` 明确描述符。
3. 对不能被脚本直接构造的 DOM 类型，使用 `constructor` 抛错 + `instanceFactoryName` 内部创建实例。
4. 需要 `URL` / `webkitURL` 这类别名时，使用 `aliases` 或 `aliasOf`，不要复制两个函数。
5. 避免在多个阶段重复定义同一个构造函数名称；如果必须跨调用复用，请确保第一次创建时已经设置好继承与不可变选项。
6. `createNativeObject` 保留给旧代码；新代码尽量迁移到 `createProtoChains`。
7. 对 `document.all` 优先用 `createUndetectable`，JS fallback 很难完整模拟 HTMLDDA 行为。
8. 对浏览器集合对象优先用 `createNativeCollection`，避免手写普通数组或普通对象导致描述符、迭代器和 `toStringTag` 不一致。
9. 对需要临时拦截访问的高级对象可用 `createInterceptor`，但最终可表达为真实结构时仍应迁移到真实对象模型。
10. 测试之间需要隔离构造函数注册状态时，使用 `clearProtoChainRegistry()` 或 `deleteProtoChainRegistryEntry(name)`。

## 17. 快速自检代码

```js
const addon = require("./build/Release/addon");

console.log(Object.keys(addon).sort());

const f = addon.createNativeFunction(false, "demo", 0, () => 1);
console.log(f());
console.log(f.toString());

const { A, createA } = addon.createProtoChains([
  {
    name: "A",
    constructor(isNew) {
      if (isNew) throw new TypeError("Illegal constructor");
    },
    instanceFactoryName: "createA",
  },
]);

console.log(createA() instanceof A);
```
