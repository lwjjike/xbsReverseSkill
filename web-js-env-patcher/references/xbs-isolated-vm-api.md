# XBS API 使用说明

本文档说明当前魔改版 `isolated-vm` 中 `window.xbs` 的用法。  
`xbs` 只会注入到 isolated-vm 创建出的浏览器式 Context 内，即 `window.xbs` / `globalThis.xbs`，不会污染宿主侧 `require("isolated-vm")` 的原始 API。

## 1. 基本使用方式

```js
const ivm = require("./isolated-vm");

const isolate = new ivm.Isolate();
const context = isolate.createContextSync();

const result = isolate.compileScriptSync(`
  ({
    windowIsGlobal: window === globalThis,
    hasXbs: !!window.xbs,
    apiNames: Object.keys(window.xbs).sort(),
  })
`).runSync(context, { copy: true });
```

在 Context 内可以直接使用：

```js
const fn = xbs.createNativeFunction(false, "demo", 0, function () {
  return "ok";
});

fn(); // "ok"
```

当前 Context 默认具备以下基础关系：

```js
window === globalThis;                                  // true
self === window;                                       // true
top === window;                                        // true
parent === window;                                     // true
window instanceof Window;                              // true
Object.getPrototypeOf(window) === Window.prototype;    // true
Object.getPrototypeOf(Window.prototype) === WindowProperties.prototype; // true
Object.getPrototypeOf(WindowProperties.prototype) === EventTarget.prototype; // true
```

## 2. API 总览

当前 `window.xbs` 暴露 17 个 API：

| API | 说明 |
| --- | --- |
| `createNativeObject` | 创建带 native-like 构造函数、实例与原型链的对象。 |
| `createNativeFunction` | 创建 native-like 函数或构造函数。 |
| `createProtoChains` | 批量创建浏览器风格构造函数、原型链、别名、实例工厂与注册表。 |
| `createGetter` | 创建 native-like getter。 |
| `createSetter` | 创建 native-like setter。 |
| `createInterceptor` | 创建带 V8 属性拦截器的对象。 |
| `createNativeCollection` | 创建 `HTMLCollection` / `NodeList` 等浏览器集合风格对象。 |
| `getMimeTypesAndPlugins` | 创建浏览器风格 `navigator.mimeTypes` 与 `navigator.plugins`。 |
| `createUndetectable` | 创建 V8 undetectable 对象，常用于近似 `document.all`。 |
| `getPrivate` | 读取 V8 Private slot。 |
| `setPrivate` | 写入 V8 Private slot。 |
| `hasPrivate` | 判断 V8 Private slot 是否存在。 |
| `deletePrivate` | 删除 V8 Private slot。 |
| `getProtoChainRegistry` | 查看当前 isolate 的原型链注册表。 |
| `clearProtoChainRegistry` | 清空当前 isolate 的原型链注册表。 |
| `deleteProtoChainRegistryEntry` | 删除当前 isolate 注册表中的指定构造函数或别名。 |
| `throwTypeError` | 从 native 层抛出 `TypeError`。 |

## 3. `createNativeFunction(isConstructor, name, length, callback)`

创建 `Function.prototype.toString` 结果为 native-like 的函数。

### 参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `isConstructor` | `boolean` | 是否允许 `new` 调用。 |
| `name` | `string` | 函数名。 |
| `length` | `number` | 函数的 `length`。 |
| `callback` | `function` | 实际 JS 回调。 |

### 普通函数示例

```js
const add = xbs.createNativeFunction(false, "add", 2, function (a, b) {
  return a + b;
});

add(1, 2); // 3
Function.prototype.toString.call(add);
// "function add() { [native code] }"
```

### 构造函数示例

构造调用时，`callback` 的第一个参数是 `isNew`，后面才是实际传入参数。构造调用最终返回 `this`。

```js
const Storage = xbs.createNativeFunction(true, "Storage", 0, function (isNew) {
  this.createdByNew = isNew;
});

const storage = new Storage();
storage.createdByNew; // true
```

## 4. `createGetter(name, length, callback)`

创建 native-like getter，常配合 `Object.defineProperty` 使用。

```js
const navigator = {};

Object.defineProperty(navigator, "userAgent", {
  get: xbs.createGetter("userAgent", 0, function () {
    return "Mozilla/5.0";
  }),
  enumerable: true,
  configurable: true,
});

navigator.userAgent; // "Mozilla/5.0"
Function.prototype.toString.call(Object.getOwnPropertyDescriptor(navigator, "userAgent").get);
// "function get userAgent() { [native code] }"
```

## 5. `createSetter(name, length, callback)`

创建 native-like setter。

```js
const location = {};
let href = "https://example.com/";

Object.defineProperty(location, "href", {
  get: xbs.createGetter("href", 0, function () {
    return href;
  }),
  set: xbs.createSetter("href", 1, function (value) {
    href = String(value);
  }),
  enumerable: true,
  configurable: true,
});

location.href = "https://example.org/";
location.href; // "https://example.org/"
```

## 6. `createProtoChains(descriptors)`

批量创建构造函数、原型对象、继承关系、实例工厂和别名。该 API 是补浏览器对象模型时最常用的基础能力。

### 常用 descriptor 字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | `string` | 构造函数名称。必填。 |
| `length` | `number` | 构造函数 `length`。 |
| `constructor` | `function` | 构造函数回调。普通构造函数必填。 |
| `prototypeParent` | `string` | 原型父级构造函数名称。 |
| `constructorParent` | `string` / `null` | 构造函数对象父级。未设置时默认跟随 `prototypeParent`；设为 `null` 可禁用默认继承。 |
| `readOnlyPrototypeProperty` | `boolean` | 是否让构造函数的 `.prototype` 属性只读。 |
| `immutablePrototypeObject` | `boolean` | 是否禁止修改构造函数 `.prototype` 对象的原型。 |
| `immutableInstancePrototype` | `boolean` | 是否禁止修改实例对象的原型。 |
| `hasToStringTag` | `boolean` | 是否在 prototype 上设置 `Symbol.toStringTag`，默认 `true`。 |
| `toStringTag` | `string` | 自定义 `Symbol.toStringTag` 值。 |
| `aliases` | `string[]` | 当前构造函数的别名列表。 |
| `aliasOf` | `string` | 创建指向已有构造函数的别名。 |
| `internalClassName` | `string` | 设置内部类名，用于影响 `Object.prototype.toString`。 |
| `constructorBehavior` | `"allow" \| "throw" \| "illegal"` | 控制 `new Constructor()` 行为。 |
| `callBehavior` | `"allow" \| "throw" \| "illegal"` | 控制 `Constructor()` 直接调用行为。 |
| `constructorErrorMessage` | `string` | 构造调用报错信息。 |
| `callErrorMessage` | `string` | 直接调用报错信息。 |
| `prototypeMethods` | `Array` | 安装到 prototype 的 native-like 方法。 |
| `staticMethods` | `Array` | 安装到构造函数对象上的 native-like 静态方法。 |
| `instanceFactoryName` | `string` | 额外导出一个内部实例工厂。 |
| `instanceInitializer` | `function` | 实例工厂创建对象后的初始化函数。 |

### 创建继承链

```js
const chain = xbs.createProtoChains([
  {
    name: "EventTarget",
    length: 0,
    constructor: function () {},
    readOnlyPrototypeProperty: true,
    immutablePrototypeObject: true,
  },
  {
    name: "Node",
    length: 0,
    constructor: function () {},
    prototypeParent: "EventTarget",
    readOnlyPrototypeProperty: true,
    immutablePrototypeObject: true,
  },
]);

const EventTarget = chain.EventTarget;
const Node = chain.Node;

Object.getPrototypeOf(Node.prototype) === EventTarget.prototype; // true
Object.getPrototypeOf(Node) === EventTarget;                    // true
new Node() instanceof EventTarget;                              // true
```

### 非法构造 + 内部实例工厂

适合模拟 `Document`、`Location` 等不能直接 `new`，但框架内部需要创建实例的对象。

```js
const chain = xbs.createProtoChains([
  {
    name: "Document",
    length: 0,
    constructor() {},
    constructorBehavior: "throw",
    constructorErrorMessage: "Illegal constructor",
    callBehavior: "throw",
    callErrorMessage: "Illegal constructor",
    instanceFactoryName: "createDocument",
    instanceInitializer(url) {
      this.URL = url;
    },
  },
]);

const Document = chain.Document;
const document = chain.createDocument("https://example.com/");

document instanceof Document; // true
new Document();               // TypeError: Illegal constructor
```

## 7. 原型链注册表 API

`createProtoChains` 创建的构造函数会登记到当前 isolate 的注册表中。注册表按 isolate 隔离，不同 `new ivm.Isolate()` 之间不会互相污染。

```js
const registry = xbs.getProtoChainRegistry();
registry.constructors; // 构造函数名称数组
registry.aliases;      // 别名映射对象

xbs.deleteProtoChainRegistryEntry("URL"); // 删除指定构造函数或别名
xbs.clearProtoChainRegistry();            // 清空当前 isolate 的注册表
```

## 8. `createNativeObject(options)`

创建带 native-like 构造函数、实例对象与可选父级原型链的对象。新代码更推荐使用 `createProtoChains`，但该 API 仍可用于兼容旧逻辑。

```js
const result = xbs.createNativeObject({
  name: "Navigator",
  length: 0,
  constructor: function () {},
  isReadOnlyPrototype: true,
  isImmutableProto: true,
});

result.constructor; // Navigator 构造函数
result.instance;    // Navigator 实例
```

## 9. `createInterceptor(options)`

创建带 V8 属性拦截器的对象，用于模拟需要自定义读取、写入、枚举、描述符等行为的宿主对象。

### handlers

| handler | 签名 | 说明 |
| --- | --- | --- |
| `getter` | `(target, property)` | 读取属性时调用。返回 `{ intercept: false }` 可放行默认读取。 |
| `setter` | `(target, property, value)` | 写属性时调用。可返回 `{ intercept: true, value }` 改写保存值。 |
| `query` | `(target, property)` | 属性存在性查询。 |
| `deleter` | `(target, property)` | 删除属性时调用。 |
| `enumerator` | `(target)` | 枚举属性名时调用。 |
| `definer` | `(target, property, descriptor)` | `Object.defineProperty` 时调用。 |
| `descriptor` | `(target, property)` | `Object.getOwnPropertyDescriptor` 时调用。 |

### 示例

```js
const target = { existing: 1 };

const obj = xbs.createInterceptor({
  target,
  internalClassName: "MagicObject",
  handlers: {
    getter(targetObject, property) {
      if (property === "virtual") {
        return { value: 42 };
      }
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

obj.virtual;                         // 42
obj.existing;                        // 1
obj.created = 123;
target.created;                      // "123"
Object.keys(obj);                    // ["virtual"]
Object.prototype.toString.call(obj); // "[object MagicObject]"
```

## 10. `createNativeCollection(options)`

创建浏览器集合对象，例如 `HTMLCollection`、`NodeList`、`PluginArray` 类似对象。

```js
const first = { id: 1 };
const second = { id: 2 };

const result = xbs.createNativeCollection({
  name: "HTMLCollection",
  items: [
    { name: "first", value: first },
    { name: "second", value: second },
  ],
  hasToStringTag: false,
  internalClassName: "HTMLCollection",
});

const collection = result.collection;

collection.length;                         // 2
collection[0] === first;                   // true
collection.first === first;                // true
collection.item(1) === second;             // true
collection.namedItem("second") === second; // true
collection.namedItem("missing");           // null
[...collection];                           // [first, second]
Object.prototype.toString.call(collection); // "[object HTMLCollection]"
```

返回对象通常包含：

- `collection`：集合实例。
- `constructor`：集合构造函数。
- `[name]`：以集合名称命名的构造函数，例如 `result.HTMLCollection`。

## 11. `getMimeTypesAndPlugins([config])`

创建浏览器风格 `PluginArray`、`MimeTypeArray`、`Plugin`、`MimeType`，适合补 `navigator.plugins` 和 `navigator.mimeTypes`。

### 默认用法

```js
const {
  mimeTypes,
  plugins,
  PluginArray,
  MimeTypeArray,
  MimeType,
  Plugin,
} = xbs.getMimeTypesAndPlugins();

navigator.plugins = plugins;
navigator.mimeTypes = mimeTypes;
```

### 参数化配置

```js
const result = xbs.getMimeTypesAndPlugins({
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

result.plugins.length;       // 1
result.mimeTypes.length;     // 1
result.plugins[0].name;      // "Custom PDF Viewer"
result.mimeTypes[0].type;    // "application/x-custom-pdf"
result.mimeTypes[0].enabledPlugin === result.plugins[0]; // true
```

## 12. `createUndetectable(callback[, handlers])`

创建 V8 `MarkAsUndetectable()` 对象，常用于近似 `document.all` / HTMLDDA 行为。

```js
const all = xbs.createUndetectable(function () {
  return undefined;
});

typeof all;        // "undefined"
Boolean(all);      // false
all == null;       // true
all === undefined; // false
all();             // undefined
```

模拟 `document.all`：

```js
const document = {};

Object.defineProperty(document, "all", {
  value: xbs.createUndetectable(function () {
    return undefined;
  }),
  enumerable: false,
  configurable: true,
});
```

`createUndetectable` 也支持与 `createInterceptor` 类似的 `handlers`，可用于描述符、枚举、删除等特殊行为。实际补环境时建议先覆盖目标代码会检测的核心路径，再补充 handler。

## 13. Private slot API

基于 V8 `Private::ForApi` 实现，适合把内部状态存放到 JS 对象上，同时避免普通属性枚举或直接访问。

```js
const obj = {};

xbs.hasPrivate(obj, "slot");       // false
xbs.setPrivate(obj, "slot", 123);  // true
xbs.hasPrivate(obj, "slot");       // true
xbs.getPrivate(obj, "slot");       // 123
xbs.deletePrivate(obj, "slot");    // true
xbs.hasPrivate(obj, "slot");       // false
```

## 14. `throwTypeError(message)`

从 native 层抛出 `TypeError`。

```js
function assertIllegalInvocation(thisValue, Ctor) {
  if (!(thisValue instanceof Ctor)) {
    xbs.throwTypeError("Illegal invocation");
  }
}
```

注意：

- 不传参数会抛出参数数量错误。
- 第一个参数不是字符串会抛出类型错误。

## 15. 推荐实践

1. 所有非 WebAPI 的辅助能力都放在 `window.xbs` 下，不要直接污染 `window`。
2. 对外可见的浏览器对象优先使用 `createProtoChains` 创建构造函数与原型链。
3. 对 `document.all` 这类特殊对象优先使用 `createUndetectable`。
4. 对 `navigator.plugins` / `navigator.mimeTypes` 优先使用 `getMimeTypesAndPlugins`。
5. 对集合对象优先使用 `createNativeCollection`，不要直接用普通数组代替。
6. 对内部状态优先使用 private slot，减少普通属性泄露。
7. 多 isolate 场景下，原型链注册表会按 isolate 隔离；清理 isolate 时会同步清理对应 XBS 注册表。
8. 宿主侧 `isolated-vm` API 保持原样，`xbs` 只存在于创建出的 Context 内。

## 16. 快速自检

```js
const expected = [
  "clearProtoChainRegistry",
  "createGetter",
  "createInterceptor",
  "createNativeCollection",
  "createNativeFunction",
  "createNativeObject",
  "createProtoChains",
  "createSetter",
  "createUndetectable",
  "deletePrivate",
  "deleteProtoChainRegistryEntry",
  "getMimeTypesAndPlugins",
  "getPrivate",
  "getProtoChainRegistry",
  "hasPrivate",
  "setPrivate",
  "throwTypeError",
];

Object.keys(window.xbs).sort().join("\n") === expected.join("\n");
```

也可以直接运行项目内测试：

```powershell
node --no-node-snapshot tests\xbs-basic.js
```
