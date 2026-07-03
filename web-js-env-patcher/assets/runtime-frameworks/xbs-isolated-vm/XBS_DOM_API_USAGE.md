# XBS DOM API 使用说明

本文说明当前 `xbsVm` 在 `isolated-vm` Context 内提供的 DOM 能力。入口统一为 `window.xbs.dom`，不会修改 host 侧 `isolated-vm` 的原始 API。

## 1. 当前公开 API

当前 `xbs.dom` 只保留一个公开方法：

```js
xbs.dom.createDocument(options)
```

以下 API 已删除，不再对外暴露：

- `attachDocument()` / `detachDocument()`
- `installConstructors()` / `getConstructors()`
- `createElement()`
- `createIframeDocument()` / `attachIframeDocument()` / `detachIframeDocument()`
- `patchApi()` / `removeApi()`
- `createProfile()` / `getProfile()` / `listProfiles()`
- `snapshotSurface()` / `restoreSurface()`
- `getLastError()`

`createDocument()` 中也不再支持 `profile` 参数。

## 2. 设计原则

- 默认不会把 `document` 挂到 `window` 上；调用方自行决定是否执行 `window.document = document`。
- `createDocument()` 会在返回的 document 对象上安装基础 DOM 属性、方法和原型链。
- DOM 构造函数不会默认挂到 `window` 上；对象仍然具有内部构造函数和原型链，例如 `document.constructor.name === "HTMLDocument"`。
- 删除或禁用某个 DOM API 应在创建 document 前通过配置声明，而不是运行时强删已发布的不可配置属性。
- C++ 文件中不再通过 JS bootstrap 字符串实现 DOM；DOM 相关逻辑位于 `src/xbs/dom/`。

## 3. 快速示例

```js
const ivm = require("isolated-vm");

const isolate = new ivm.Isolate();
const context = isolate.createContextSync();

const result = isolate.compileScriptSync(`
(() => {
  const document = xbs.dom.createDocument({
    url: "https://example.com/",
    html: '<main id="app"><span class="hot">hello</span></main>'
  });

  return {
    hasWindowDocument: "document" in window,
    text: document.querySelector(".hot").textContent,
    url: document.URL
  };
})()
`).runSync(context, { copy: true });

console.log(result);
```

## 4. createDocument(options)

### 参数

```js
const document = xbs.dom.createDocument({
  url: "https://example.com/path",
  html: '<div id="app">ok</div>',
  skeleton: true,
  omitApis: ["document.all"]
});
```

支持字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `url` | `string` | 设置 `document.URL`，默认是 `about:blank`。 |
| `html` | `string` | 创建后解析到 `document.body`，当前为简化 HTML 解析器。 |
| `skeleton` | `boolean` | 是否创建 `html/head/body` 骨架，默认 `true`。 |
| `omitApis` | `string[]` | 创建前不安装指定 API。 |
| `disabledApis` | `string[]` | `omitApis` 的兼容别名。 |
| `removedApis` | `string[]` | `omitApis` 的兼容别名。 |
| `features.documentAll` | `boolean` | 为 `false` 时不安装 `document.all`。 |
| `features.iframeContentDocument` | `boolean` | 为 `false` 时不安装 iframe 的 `contentDocument/contentWindow`。 |

## 5. 创建前禁用 API

示例：创建一个不带 `document.all` 的 document。

```js
const document = xbs.dom.createDocument({
  omitApis: ["document.all"]
});

console.log("all" in document); // false
```

示例：创建一个不带 `Document.prototype.createComment` 的 document。

```js
const document = xbs.dom.createDocument({
  omitApis: ["Document.prototype.createComment"]
});

console.log(typeof document.createComment); // undefined
```

示例：禁用 iframe 的 `contentDocument`。

```js
const document = xbs.dom.createDocument({
  omitApis: ["HTMLIFrameElement.prototype.contentDocument"]
});

const iframe = document.createElement("iframe");
console.log(typeof iframe.contentDocument); // undefined
```

也支持通配前缀：

```js
xbs.dom.createDocument({
  omitApis: ["Element.prototype.*"]
});
```

## 6. 常用 DOM 能力

当前基础实现包含以下对象和能力：

- `HTMLDocument` / `Document`
- `Node` / `Element` / `HTMLElement` / `HTMLIFrameElement`
- `Text` / `Comment` / `CDATASection` / `ProcessingInstruction` / `DocumentFragment`
- `Attr`
- `DOMTokenList` / `NodeList` / `HTMLCollection`
- `HTMLAllCollection` / `HTMLFormControlsCollection` / `HTMLOptionsCollection` / `RadioNodeList`
- `NamedNodeMap` / `DOMStringMap`

常用示例：

```js
const document = xbs.dom.createDocument();
const div = document.createElement("div");

div.id = "box";
div.className = "a b";
div.classList.add("c");
div.innerHTML = '<span name="s1">text</span>';

document.body.appendChild(div);

console.log(document.querySelector("#box") === div); // true
console.log(div.querySelector("span").textContent);  // text
console.log(div.children.namedItem("s1").tagName);   // SPAN
```

## 7. 本阶段新增 DOM API

说明：`xbs.dom` 对外仍然只暴露 `createDocument()`。以下新增 API 是通过 `createDocument()` 返回的 `document`、其节点对象和原型链对外可用。

### 7.1 Document 新增属性

```js
const document = xbs.dom.createDocument();

document.documentURI;     // 与 document.URL 保持一致
document.embeds;          // HTMLCollection
document.plugins;         // HTMLCollection
```

当前 `Document` 可用的主要属性包括：

- `documentElement`
- `head`
- `body`
- `title`
- `readyState`
- `URL`
- `documentURI`
- `referrer`
- `characterSet`
- `compatMode`
- `contentType`
- `defaultView`
- `activeElement`
- `doctype`
- `implementation`
- `currentScript`
- `all`
- `scripts`
- `forms`
- `images`
- `links`
- `anchors`
- `embeds`
- `plugins`
- `children`

### 7.2 Document 新增创建方法

```js
const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg:rect");
console.log(svg.namespaceURI); // http://www.w3.org/2000/svg
console.log(svg.prefix);       // svg
console.log(svg.localName);    // rect

const attr = document.createAttribute("data-foo");
attr.value = "bar";

const attrNS = document.createAttributeNS("urn:x", "x:key");

const cdata = document.createCDATASection("abc");
console.log(cdata.nodeType);   // 4

const pi = document.createProcessingInstruction("xml-stylesheet", "href=x");
console.log(pi.nodeType);      // 7
```

当前 `Document` 可用的主要查询和创建方法包括：

- `getElementById()`
- `querySelector()`
- `querySelectorAll()`
- `getElementsByTagName()`
- `getElementsByClassName()`
- `getElementsByName()`
- `createElement()`
- `createElementNS()`
- `createTextNode()`
- `createComment()`
- `createDocumentFragment()`
- `createAttribute()`
- `createAttributeNS()`
- `createCDATASection()`
- `createProcessingInstruction()`

### 7.3 Node 新增方法

```js
const node = document.createTextNode("hello");
const clone = node.cloneNode(false);

console.log(node.isEqualNode(clone)); // true
```

新增或补齐的方法：

- `isEqualNode(otherNode)`
- `lookupNamespaceURI(prefix)`
- `lookupPrefix(namespaceURI)`
- `isDefaultNamespace(namespaceURI)`

当前 `Node` 可用的主要属性和方法包括：

- 属性：`nodeType`、`nodeName`、`nodeValue`、`textContent`、`parentNode`、`parentElement`、`childNodes`、`firstChild`、`lastChild`、`nextSibling`、`previousSibling`、`ownerDocument`、`isConnected`、`baseURI`
- 方法：`appendChild()`、`removeChild()`、`insertBefore()`、`replaceChild()`、`cloneNode()`、`contains()`、`hasChildNodes()`、`getRootNode()`、`isSameNode()`、`isEqualNode()`、`compareDocumentPosition()`、`normalize()`、`lookupNamespaceURI()`、`lookupPrefix()`、`isDefaultNamespace()`

### 7.4 Element 新增属性和方法

```js
const el = document.createElementNS("http://www.w3.org/2000/svg", "svg:rect");

console.log(el.namespaceURI); // http://www.w3.org/2000/svg
console.log(el.prefix);       // svg
console.log(el.localName);    // rect

el.setAttributeNS("urn:x", "x:key", "value");
console.log(el.getAttributeNS("urn:x", "key")); // value
console.log(el.hasAttributeNS("urn:x", "key")); // true

const attr = document.createAttribute("data-user-id");
attr.value = "10001";
el.setAttributeNode(attr);

console.log(el.getAttributeNode("data-user-id").ownerElement === el); // true
console.log(el.attributes.getNamedItem("data-user-id").value);        // 10001

console.log(el.dataset.userId); // 10001
el.dataset.token = "abc";
console.log(el.getAttribute("data-token")); // abc
delete el.dataset.token;
```

新增或补齐的属性：

- `namespaceURI`
- `prefix`
- `localName`
- `slot`
- `dir`
- `shadowRoot`
- `assignedSlot`
- `attributes`
- `dataset`

新增或补齐的方法：

- `getAttributeNS()`
- `setAttributeNS()`
- `hasAttributeNS()`
- `getAttributeNode()`
- `setAttributeNode()`
- `removeAttributeNode()`
- `webkitMatchesSelector()`

当前 `Element` 可用的主要属性和方法包括：

- 属性：`tagName`、`id`、`className`、`classList`、`attributes`、`innerHTML`、`outerHTML`、`innerText`、`textContent`、`children`、`firstElementChild`、`lastElementChild`、`nextElementSibling`、`previousElementSibling`、`childElementCount`、`namespaceURI`、`prefix`、`localName`、`style`、`dataset`、`slot`、`dir`、`shadowRoot`、`assignedSlot`
- 方法：`getAttribute()`、`setAttribute()`、`hasAttribute()`、`removeAttribute()`、`toggleAttribute()`、`getAttributeNames()`、`getAttributeNS()`、`setAttributeNS()`、`hasAttributeNS()`、`getAttributeNode()`、`setAttributeNode()`、`removeAttributeNode()`、`matches()`、`webkitMatchesSelector()`、`closest()`、`querySelector()`、`querySelectorAll()`、`getElementsByTagName()`、`getElementsByClassName()`、`append()`、`prepend()`、`before()`、`after()`、`remove()`、`replaceWith()`、`replaceChildren()`、`insertAdjacentHTML()`、`insertAdjacentElement()`、`insertAdjacentText()`、`focus()`、`blur()`、`click()`、`getBoundingClientRect()`、`getClientRects()`、`scrollIntoView()`

### 7.5 Attr

`Attr` 表示属性节点，可由 `document.createAttribute()` 或 `document.createAttributeNS()` 创建，也可通过 `element.getAttributeNode()` 取得。

```js
const attr = document.createAttribute("data-id");
attr.value = "1";

console.log(attr.name);        // data-id
console.log(attr.value);       // 1
console.log(attr.nodeType);    // 2
console.log(attr.nodeName);    // data-id
console.log(attr.nodeValue);   // 1
console.log(attr.textContent); // 1
```

主要属性：

- `name`
- `value`
- `namespaceURI`
- `prefix`
- `localName`
- `specified`
- `ownerElement`
- `nodeType`
- `nodeName`
- `nodeValue`
- `textContent`

### 7.6 NamedNodeMap

`element.attributes` 返回 `NamedNodeMap`，用于访问元素属性节点。

```js
const el = document.createElement("div");
el.setAttribute("id", "box");

console.log(el.attributes.length);                 // 1
console.log(el.attributes.item(0).name);           // id
console.log(el.attributes.getNamedItem("id").value); // box
```

主要 API：

- `length`
- `item(index)`
- `getNamedItem(name)`
- `getNamedItemNS(namespaceURI, localName)`
- `setNamedItem(attr)`
- `setNamedItemNS(attr)`
- `removeNamedItem(name)`
- `removeNamedItemNS(namespaceURI, localName)`

### 7.7 DOMStringMap

`element.dataset` 返回 `DOMStringMap`，会映射到元素的 `data-*` 属性。

```js
const el = document.createElement("div");

el.dataset.userId = "10001";
console.log(el.getAttribute("data-user-id")); // 10001
console.log(el.dataset.userId);               // 10001

delete el.dataset.userId;
console.log(el.hasAttribute("data-user-id")); // false
```

### 7.8 集合对象

本阶段新增和补齐的集合对象：

- `HTMLAllCollection`
  - 来源：`document.all`
  - 特性：保持不可检测语义，`typeof document.all === "undefined"`，但仍可访问 `length`、`item()`、`namedItem()`
- `HTMLFormControlsCollection`
  - 预留给表单控件集合能力
  - 支持 `length`、`item()`、`namedItem()`
- `HTMLOptionsCollection`
  - 预留给 `select.options` 类场景
  - 支持 `length`、`selectedIndex`、`item()`、`namedItem()`、`add()`、`remove()`
- `RadioNodeList`
  - 预留给同名 radio 控件集合
  - 支持 `length`、`value`、`item()`、`namedItem()`

示例：

```js
const document = xbs.dom.createDocument({
  html: '<main id="app"><span name="s1">text</span></main>'
});

console.log(document.all.length >= 1);           // true
console.log(document.all.item(0));               // html 元素
console.log(document.body.children.namedItem("s1").tagName); // SPAN
```

### 7.9 手动创建 document.all

如果用户不使用 `xbs.dom.createDocument()`，而是自己创建 `document`，再通过 `xbs.createUndetectable()` 创建 `all` 并挂载到 `document` 上，需要注意：

- `xbs.createUndetectable()` 只负责 HTMLDDA/不可检测语义，例如 `typeof all === "undefined"`、`Boolean(all) === false`、`all == null`。
- `document.all.length`、`item()`、`namedItem()`、`[0]`、命名属性、枚举和描述符，需要由 `HTMLAllCollection.prototype` 与 handlers 配合实现。
- all 创建建议都传入 handlers。handler 未命中时返回 `{ intercept: false }`，让 V8 继续查找 backing target 或原型链。
- `length / item / namedItem / constructor` 等原型链已有属性不要定义成 `document.all` 自有属性，否则会和真实浏览器不一致。

最小结构示例：

```js
const all = xbs.createUndetectable(function (value) {
  if (arguments.length === 0 || value == null) return null;
  // 这里根据自己的 document 元素表处理索引或 id/name 查询
  return null;
}, {
  getter(target, property) {
    // 命中索引或 id/name 时，可 Object.defineProperty(target, property, descriptor)
    // 未命中或遇到 length/item/namedItem 等原型属性时必须放行
    return { intercept: false };
  },
  query(target, property) {
    return { intercept: false };
  },
  descriptor(target, property) {
    return { intercept: false };
  },
  enumerator(target) {
    return Object.getOwnPropertyNames(target);
  },
});

Object.setPrototypeOf(all, HTMLAllCollection.prototype);
```

如果直接挂到 `document`：

```js
Object.defineProperty(document, "all", {
  value: all,
  enumerable: true,
  configurable: true,
});
```

则 `Object.hasOwn(document, "all")` 会是 `true`。如果要更接近真实浏览器，应挂到 `Document.prototype`：

```js
Object.defineProperty(Document.prototype, "all", {
  get: xbs.createGetter("all", 0, function () {
    return all;
  }),
  enumerable: true,
  configurable: true,
});
```

## 8. 新增 API 的 omitApis 路径

新增 API 仍然遵循创建前禁用规则。常用路径示例：

```js
const document = xbs.dom.createDocument({
  omitApis: [
    "Document.prototype.createElementNS",
    "Document.prototype.createAttribute",
    "Document.prototype.createCDATASection",
    "Document.prototype.createProcessingInstruction",
    "Element.prototype.dataset",
    "Element.prototype.getAttributeNS",
    "Element.prototype.setAttributeNS",
    "Element.prototype.webkitMatchesSelector",
    "Node.prototype.isEqualNode",
    "Node.prototype.lookupNamespaceURI",
    "Attr.prototype.value",
    "NamedNodeMap.prototype.getNamedItem"
  ]
});
```

也可以继续使用通配前缀：

```js
xbs.dom.createDocument({
  omitApis: [
    "Document.prototype.*",
    "Element.prototype.*",
    "Node.prototype.*"
  ]
});
```

## 9. iframe 行为

不再提供 `createIframeDocument()` 或 `attachIframeDocument()`。现在 iframe 的 `contentDocument` 会按需创建。

```js
const document = xbs.dom.createDocument({
  html: '<iframe id="f"></iframe>'
});

const iframe = document.getElementById("f");
console.log(iframe.contentDocument.body.tagName); // BODY
console.log(iframe.contentWindow.document === iframe.contentDocument); // true
```

## 10. 当前边界

当前 DOM 是补环境用的基础实现，不是完整浏览器内核：

- HTML parser 为简化实现，适合基础标签、属性、文本和注释。
- selector 目前支持标签、`#id`、`.class`、简单属性选择器和逗号分组。
- 暂不支持完整 HTML5 解析、复杂 CSS selector、真实布局、CSSOM、事件系统、MutationObserver、Canvas、WebGL 等。
