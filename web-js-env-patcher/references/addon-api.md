# native addon API 使用规范

本文件用于网页端 Node.js 补环境阶段。每次编写或修改 `assets/env-modules/native-protect.js`、`case/result/src/env/*`、`document.all`、构造函数 / 原型链、getter / setter、`navigator.plugins` / `mimeTypes` 或 addon fallback 逻辑时读取。

## 总原则

1. **addon-first 是默认硬性基线**：进入补环境阶段先加载 / 记录 addon，可用时优先调用 addon API；只有用户明确要求不使用 addon、当前平台缺失、ABI 不兼容或调用失败时，才降级为 `NativeProtect` / JS fallback。
2. **新代码优先 `createProtoChains(descriptors)`**：构造函数、原型链、别名、实例工厂优先统一用 descriptors 数组定义。
3. **`createNativeObject(options)` 只做旧式兼容**：可以用于单对象兼容，但新增复杂 WebAPI 不要再写旧式 `tag, proto, properties` 形态。
4. **所有降级必须记录原因**：包括 addon 不存在、加载失败、API 抛错、用户明确豁免、当前平台无编译产物等。
5. **禁止把本机绝对路径写入 Skill 或最终产物**：addon 默认从 `assets/native-addon/<platform>-<arch>/addon.node` 加载；用户自定义路径只能作为运行时参数或环境变量。

## 推荐 API 表

| API | 推荐状态 | 主要用途 |
|---|---|---|
| `createNativeFunction(isConstructor, name, length, callback)` | 推荐 | 创建 native-like 函数或构造函数，`toString()` 显示 `[native code]` |
| `createGetter(name, length, callback)` | 推荐 | 创建 native-like getter，例如 `function get userAgent() { [native code] }` |
| `createSetter(name, length, callback)` | 推荐 | 创建 native-like setter，例如 `function set href() { [native code] }` |
| `createProtoChains(descriptors)` | 推荐 | 批量创建构造函数、原型链、构造函数继承、别名、实例工厂 |
| `getPrivate(object, key)` / `setPrivate(object, key, value)` | 推荐 | 保存不可枚举、不可通过普通 JS 属性访问的内部状态 |
| `getMimeTypesAndPlugins()` | 可用 | 创建浏览器风格 `navigator.mimeTypes` / `navigator.plugins` |
| `createUndetectable(callback[, handlers])` | 高级 | 创建 V8 undetectable 对象，常用于 `document.all` / HTMLDDA 近似 |
| `throwTypeError(message)` | 辅助 | 从 addon 抛出浏览器风格 `TypeError` |
| `throwBrowserTypeError(message)` / `throwIllegalConstructor(name)` / `throwConstructorRequiresNew(name)` | helper | `native-protect.js` 中的封装 helper，内部优先 `addon.throwTypeError`，用于复现浏览器采样到的构造函数错误信息 |
| `createNativeObject(options)` | 兼容 / 旧式 | 旧式单对象 API；新代码尽量迁移到 `createProtoChains` |
| `hello()` | 调试 | 不要在正式补环境中依赖 |

## 严禁写回的旧式调用

以下写法只能作为兼容层识别，不得作为新补环境代码主路径：

```js
addon.createProtoChains(name, chain);
addon.createNativeObject(tag, proto, properties);
```

如果在历史代码中发现上述形态，应迁移为：

```js
addon.createProtoChains([
  {
    name: 'Document',
    length: 0,
    constructor(isNew) {
      if (isNew) throw new TypeError("Failed to construct 'Document': Illegal constructor");
      throw new TypeError('Illegal constructor');
    },
    prototypeParent: 'Node',
    readOnlyPrototypeProperty: true,
    immutablePrototypeObject: true,
    immutableInstancePrototype: true,
    instanceFactoryName: 'createDocument',
    instanceInitializer(url) {
      Object.defineProperty(this, 'URL', {
        value: String(url),
        enumerable: true,
        configurable: true,
      });
    },
  },
]);
```

## `createNativeFunction`

```js
const getItem = addon.createNativeFunction(false, 'getItem', 1, function (key) {
  return storageMap.get(String(key)) ?? null;
});

Object.defineProperty(Storage.prototype, 'getItem', {
  value: getItem,
  writable: true,
  enumerable: true,
  configurable: true,
});
```

注意：

- 第一个参数为 `false` 时不可被 `new`。
- 第一个参数为 `true` 时允许构造；只有 `new Fn()` 时 callback 第一参数才是 `isNew === true`。
- `length` 会影响函数 `.length`，不要随意写错。
- 构造函数 callback 内的报错类型和 message 必须来自目标浏览器采样；不要统一写 `throw new TypeError('Illegal constructor')`。

构造函数错误推荐写法：

```js
const native = require('./native-protect');

const { Node } = native.createProtoChains([
  {
    name: 'Node',
    length: 0,
    constructor(isNew) {
      if (isNew) return native.throwIllegalConstructor('Node', addon);
      return native.throwIllegalConstructor('Node', addon);
    },
    instanceFactoryName: 'createNode',
  },
], addon);
```

如果浏览器采样结果不是 `Failed to construct 'Xxx': Illegal constructor`，不要使用该 helper，要按 `constructor-errors.fixture.json` 中的 `message` 调用 `throwBrowserTypeError(message)` 或实现对应错误类型。

## `createGetter` / `createSetter`

```js
Object.defineProperty(Navigator.prototype, 'userAgent', {
  get: addon.createGetter('userAgent', 0, function () {
    if (!(this instanceof Navigator)) addon.throwTypeError('Illegal invocation');
    return userAgent;
  }),
  enumerable: true,
  configurable: true,
});

Object.defineProperty(Location.prototype, 'href', {
  get: addon.createGetter('href', 0, function () {
    return state.get(this)?.href || '';
  }),
  set: addon.createSetter('href', 1, function (value) {
    state.set(this, { href: String(value) });
  }),
  enumerable: true,
  configurable: true,
});
```

getter / setter 本身也要满足 native-like `toString()`，不要用普通函数替代。

## `createProtoChains(descriptors)`

常用字段：

| 字段 | 说明 |
|---|---|
| `name` | 构造函数名，必填 |
| `constructor(isNew, ...args)` | 构造回调，第一个参数固定为 `isNew` |
| `length` | 构造函数 `.length`，默认 `0` |
| `prototypeParent` / `parent` | 实例原型父级名称 |
| `constructorParent` | 构造函数对象自身父级；不想继承构造函数对象链时传 `null` |
| `readOnlyPrototypeProperty` / `isReadOnlyPrototype` | 构造函数 `.prototype` 只读 |
| `immutablePrototypeObject` / `isImmutableProto` | `Constructor.prototype` 的原型不可改 |
| `immutableInstancePrototype` / `isImmutableInstanceProto` | factory / 模板创建的实例原型不可改 |
| `hasToStringTag` / `toStringTag` | 控制 `Symbol.toStringTag` |
| `aliases` | 为构造函数注册别名 |
| `aliasOf` | alias-only 描述符，指向已有构造函数 |
| `instanceFactoryName` | 导出内部实例工厂 |
| `instanceInitializer` | factory 创建实例后的初始化函数 |
| `isCreateInstance` / `instanceName` | 旧式立即创建实例，能不用就不用 |

推荐一次性把继承、别名、不可变选项定义完整，避免后续跨调用复用时重复修改同一构造函数结构。

`createProtoChains` 通过 addon 创建出的实例通常已经具备正确的 `Object.prototype.toString.call(instance)` 行为。不要再对 addon 创建出的实例额外调用 `markObjectType`、`markObjectToString` 或手写 `Symbol.toStringTag`。这些只允许用于 addon 不可用时的 JS fallback。

`markObjectType` 不是本 Skill 批准的 API 名称；如果在生成代码中出现，应视为错误并改为：

- addon 可用：使用 `createProtoChains` / addon 构造函数实例工厂。
- addon 不可用：使用 `Symbol.toStringTag` + `NativeProtect.setObjFunc` / `markObjectToString` fallback，并记录降级原因。

## `createUndetectable(callback[, handlers])`

用于 `document.all` 这类 JS 层难以完整模拟的特殊对象：

```js
const all = addon.createUndetectable(
  function () {
    return undefined;
  },
  {
    getter(target, property) {
      return { intercept: false };
    },
    descriptor(target, property) {
      if (property === Symbol.toStringTag) {
        return { value: 'HTMLAllCollection', enumerable: false, configurable: true };
      }
    },
  }
);

Object.defineProperty(document, 'all', {
  value: all,
  enumerable: false,
  configurable: true,
});
```

handler 支持：`getter`、`setter`、`query`、`deleter`、`enumerator`、`definer`、`descriptor`。

## `getMimeTypesAndPlugins()`

```js
const mimePlugin = addon.getMimeTypesAndPlugins();

Object.defineProperties(Navigator.prototype, {
  plugins: {
    get: addon.createGetter('plugins', 0, function () {
      return mimePlugin.plugins;
    }),
    enumerable: true,
    configurable: true,
  },
  mimeTypes: {
    get: addon.createGetter('mimeTypes', 0, function () {
      return mimePlugin.mimeTypes;
    }),
    enumerable: true,
    configurable: true,
  },
});
```

如果目标检测非常严格，需要用真实浏览器样本确认插件数量、名称、`Symbol.toStringTag` 和构造函数非法调用行为。

## `setPrivate` / `getPrivate`

用于保存内部状态，不要把内部状态直接挂成可枚举属性：

```js
addon.setPrivate(location, 'state', { href: 'https://example.com/' });
const state = addon.getPrivate(location, 'state');
```

## 推荐落地顺序

1. 初始化 env 时加载 addon，并记录 `available`、`path`、`exports`、失败原因。
2. 用 `createProtoChains(descriptors)` 先建立构造函数和原型链。
3. 用 `createNativeFunction` / `createGetter` / `createSetter` 安装方法和访问器。
4. 对 `document.all` 优先使用 `createUndetectable`。
5. 对 `navigator.plugins` / `mimeTypes` 优先使用 `getMimeTypesAndPlugins`。
6. 对内部状态优先使用 `setPrivate` / `getPrivate`，不可用时再用 `WeakMap` fallback。
7. 最后运行真实性检查，确认没有新代码主路径写回旧式 API。
