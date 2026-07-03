# native 能力缺口闭环

本文件用于补环境阶段遇到“纯 JS、addon.node 当前 API、xbs isolated-vm 当前 API 都无法可靠表达目标浏览器行为”的场景。遇到这类问题时，不要继续硬凑 JS fallback，不要假装 addon / xbs 已经解决，也不要把当前报错消失写成稳定结论。

## 读取时机

- 目标检测点涉及浏览器引擎级特殊语义，例如 `document.all` 的 HTMLDDA、内部槽 brand check、不可检测对象、跨 Realm 行为、DataCloneError、Error stack、不可通过普通 JS 控制的 `typeof` / `Boolean` / `== null` 行为。
- 已确认纯 JS fallback 无法满足真实浏览器行为。
- 已确认当前 addon.node 可用但没有对应 API，或已有 API 无法覆盖目标行为。
- 用户选择 `isolated-vm` 时，已确认当前 `window.xbs` / `xbs.dom` 可用但没有对应 API，或已有 API 无法覆盖目标行为。
- 反复修改同一 WebAPI 仍回到失败逻辑，需要给用户一个可验证的 native 扩展需求。

## 判定顺序

先排除以下两类问题，只有排除后才能标记为 native 能力缺口：

1. **当前补环境实现不完整**：原型链、属性描述符、访问器、构造函数行为、toString、`Symbol.toStringTag`、实例工厂、私有状态、指纹回放样本缺失。这类问题继续补代码，不得上升为 native 能力缺口。
2. **已有 native API 使用错误**：addon / xbs 已提供 `createProtoChains`、`createNativeFunction`、`createGetter`、`createSetter`、`createNativeCollection`、`getMimeTypesAndPlugins`、`createUndetectable`、`createInterceptor`、private slot 等能力，但当前代码没有优先使用或参数用错。这类问题先改为 addon-first / xbs native-first。
3. **native 能力缺口**：真实浏览器行为已经采样，纯 JS 无法可靠表达，当前 addon.node 与 xbs isolated-vm 也没有可用 API 或现有 API 行为不够。此时暂停补环境实现，进入能力缺口闭环。

## 必须输出的能力缺口报告

在 `case/notes/native-capability-gap.md` 写入报告，并在阶段报告中引用。报告至少包含：

```markdown
# native 能力缺口报告

## 阻塞点

- API / 行为：
- 触发位置：文件、行列、调用栈或 RuyiTrace 证据
- 目标代码检测表达式：
- 该行为是否为生成目标加密参数的必要路径：是 / 否 / 待确认

## 真实浏览器基线

- 取证工具：ruyiPage / Camoufox / CloakBrowser / 用户手动
- 浏览器版本：
- 采样代码：
- 期望结果摘要：

## 当前后端能力对比

| 后端 | 当前结果 | 差异 | 结论 |
|---|---|---|---|
| 纯 JS fallback |  |  | 可解决 / 不可靠 / 无法解决 |
| addon.node |  |  | 可解决 / API 用法错误 / 当前 API 缺失 |
| xbs isolated-vm |  |  | 可解决 / API 用法错误 / 当前 API 缺失 / 未选择该框架 |

## 无法继续硬补的原因

- 纯 JS 无法控制的语义：
- addon.node 当前缺少或不足的能力：
- xbs isolated-vm 当前缺少或不足的能力：

## 建议新增 native API

- 建议 API 名称：
- 适用后端：addon.node / xbs isolated-vm / 二者都需要
- 输入参数：
- 返回值：
- 需要复现的浏览器语义：
- 需要同时保护的检测点：typeof / Boolean / == null / descriptor / prototype / toString / Object.prototype.toString / instanceof / structuredClone / postMessage / 其他
- 错误类型与错误信息：

## 最小行为测试用例

见下方测试代码。只有新 API 让该测试通过，才能把此阻塞点标记为已解决。

## 用户选择

- 等待或扩展 native API / 接受临时 JS workaround / 改变任务范围 / 暂停 case
- 选择时间：
- 选择原因：
```

## 最小测试用例要求

测试用例是行为契约，不是演示代码。要求：

1. 能在真实浏览器中运行并得到期望结果。
2. 能在目标后端运行，例如普通 Node + addon、或 isolated-vm Context + xbs。
3. 覆盖导致阻塞的关键表达式，不只覆盖当前报错行。
4. 包含 `expected` 与 `actual`，失败时输出具体差异。
5. 不放入最终 `result/` 交付目录。能力未补齐时可保存在 `case/notes/native-capability-gap-test.js` 或 `case/native-capability-gap/<name>.js`，补齐并验证后按清理规则处理，最终总结只保留报告摘要和测试结果。

## 示例：document.all / HTMLDDA 行为契约

```js
function collectDocumentAllBehavior(document) {
  const value = document.all;
  return {
    typeofValue: typeof document.all,
    looseNull: document.all == null,
    strictUndefined: document.all === undefined,
    booleanValue: Boolean(document.all),
    hasAllInDocument: 'all' in document,
    lengthType: typeof document.all.length,
    itemType: typeof document.all.item,
    namedItemType: typeof document.all.namedItem,
    objectToString: Object.prototype.toString.call(document.all),
    ownLength: Object.hasOwn(document.all, 'length'),
    ownItem: Object.hasOwn(document.all, 'item'),
    ownNamedItem: Object.hasOwn(document.all, 'namedItem'),
    sameReference: value === document.all,
  };
}

const expected = {
  typeofValue: 'undefined',
  looseNull: true,
  strictUndefined: false,
  booleanValue: false,
  hasAllInDocument: true,
  lengthType: 'number',
  itemType: 'function',
  namedItemType: 'function',
  objectToString: '[object HTMLAllCollection]',
  ownLength: false,
  ownItem: false,
  ownNamedItem: false,
  sameReference: true,
};

function assertDocumentAllBehavior(document) {
  const actual = collectDocumentAllBehavior(document);
  const failed = [];
  for (const key of Object.keys(expected)) {
    if (actual[key] !== expected[key]) {
      failed.push({ key, expected: expected[key], actual: actual[key] });
    }
  }
  return { ok: failed.length === 0, actual, failed };
}

const result = assertDocumentAllBehavior(document);
if (!result.ok) {
  throw new Error(JSON.stringify(result.failed, null, 2));
}
result;
```

如果纯 JS、当前 addon `createUndetectable(callback, handlers)`、当前 xbs `createUndetectable(callback, handlers)` 或 `xbs.dom.createDocument()` 都无法让该测试通过，才允许把它标记为 native 能力缺口。标记前必须先排除用法错误：选择 isolated-vm 时应优先使用 `xbs.dom.createDocument()` 默认提供的 `document.all`；手动创建时 handlers 未命中必须返回 `{ intercept: false }`，并把 `length / item / namedItem / Symbol.toStringTag` 放到 `HTMLAllCollection.prototype`，不能把它们做成 `document.all` 自有属性。确认仍无法通过后，再建议新增或修正 API，例如增强 `createUndetectable()` / `xbs.dom.createDocument()` 的 HTMLAllCollection 能力。

## 建议 API 设计输出格式

给用户的建议不能只写“需要改 addon”。必须尽量具体到 API 契约：

```js
// 示例名称仅用于表达需求，真实名称由 native 实现决定。
const all = native.createHTMLDDACollection({
  className: 'HTMLAllCollection',
  length: elements.length,
  items: elements,
  itemName: 'item',
  namedItemName: 'namedItem',
});
```

需要说明：

- `typeof all` 的期望。
- `Boolean(all)` 的期望。
- `all == null` 与 `all === undefined` 的期望。
- `length`、索引、`item()`、`namedItem()` 的期望。
- 原型链、构造函数、`Object.prototype.toString`、函数 toString、描述符枚举行为。
- 与 `document.all` getter / value descriptor 的安装方式。

## 继续推进规则

- 用户更新 addon.node 或 xbs isolated-vm 后，先运行能力缺口测试用例，再继续补环境。
- 测试未通过时，不得把该点标记为已解决。
- 用户选择临时 JS workaround 时，必须把范围写成“仅当前样本路径临时兼容”，不得写成稳定方案。
- 用户拒绝扩展 native 能力且目标参数生成必须依赖该行为时，标记 case 阻塞，不要伪造成功。
- 阻塞报告、用户选择、测试用例结果必须写入阶段报告和最终总结。