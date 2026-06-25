# 补环境框架选择、xbs isolated-vm 与 Trace 复杂度评估

本文件用于进入 Node.js 补环境阶段前读取。核心原则：是否使用补环境框架由用户选择；Trace 复杂度只用于理解补环境范围、风险和优先级，不自动决定框架。

## 核心规则

1. 进入正式补环境前必须提醒用户选择补环境框架。
2. 默认不使用补环境框架；用户未明确选择时按“不使用补环境框架”继续。
3. 可选项只有：不使用、isolated-vm、Node.js 内置 vm、jsEnv。
4. 选择 isolated-vm 时必须使用本 Skill 随包魔改 xbs isolated-vm，并在 Context 内使用 window.xbs / globalThis.xbs。
5. 平台缺失时要求用户提供匹配魔改构建产物或改选框架；Node ABI 不匹配时先读取 `node-version-recovery.md`，提示 xbs isolated-vm 兼容 Node.js v26.3.1，检测 nvm 并征得用户同意是否安装 / 切换兼容 Node，用户拒绝或切换后仍失败时才要求匹配构建产物或改选框架；不要自动 npm 安装或退回 npm 原版 isolated-vm。
6. 不要把旧 addon.node 桥接进 isolated-vm；该模式下 addon-first 表达为 xbs native-first。
7. 最终项目只保留用户选择的 runtime；未选择 isolated-vm 时不得复制 xbs-isolated-vm/ 或 isolated_vm.node。

## 补环境前询问模板

```markdown
请确认本次补环境是否使用补环境框架：

1. 不使用补环境框架，默认
2. 使用 isolated-vm：加载本 Skill 随包魔改 xbs isolated-vm，在隔离 Context 内使用 window.xbs / globalThis.xbs 提供 createProtoChains、createNativeFunction、createGetter、createSetter、createNativeCollection、getMimeTypesAndPlugins、createUndetectable 等 native-first 能力；兼容 Node.js v26.3.1，进入前会自检当前 Node ABI，ABI 不匹配时先询问是否通过 nvm 安装 / 切换 v26.3.1
3. 使用 Node.js 内置 vm：轻量、无需额外安装，但隔离弱于 isolated-vm
4. 使用 jsEnv：请先提供 jsEnv 项目路径、安装方式、入口文件和使用文档；未检测通过前不会复制 jsEnv runtime 或虚构 API

如果你不明确选择，我将按“不使用补环境框架”继续。

说明：Trace 复杂度评估只用于理解补环境范围、风险点和优先级，不会自动决定是否使用补环境框架。
```

记录到 case/notes/补环境框架选择.md、阶段报告和最终项目总结。记录字段至少包括：框架选择、选择来源、Node 版本、Node ABI、平台、xbs 自检结果、是否发生切换、切换原因；如发生 ABI 不兼容，记录 nvm 检测结果、用户是否同意切换 Node.js v26.3.1、重新自检结果或用户拒绝原因。

## Trace 复杂度评估

如果存在 RuyiTrace NDJSON、run_with_trace.js 产生的 JSONL、missing-env.json 或其他环境访问日志，必须用日志辅助理解复杂度。复杂度评估只用于：

- 判断补环境范围。
- 排定 WebAPI 补齐优先级。
- 识别指纹、异步、状态和真实性检测风险。
- 写入阶段报告。

复杂度评估不得用于自动选择 isolated-vm、vm、jsEnv 或“不使用框架”。

```bash
node scripts/analyze_trace_complexity.js --case-dir case --markdown
node scripts/analyze_trace_complexity.js --trace case/ruyi-trace/logs/trace.ndjson --json
node scripts/analyze_trace_complexity.js --trace case/tmp/env-trace.jsonl --markdown
```

## isolated-vm（随包魔改 xbs isolated-vm）

适用：用户明确选择 isolated-vm，或普通上下文后续遇到难以解决的环境检测并且用户确认切换。

必须读取：

- assets/runtime-frameworks/isolated-vm-runtime.js
- references/xbs-isolated-vm-api.md
- scripts/check_xbs_isolated_vm.js

随包二进制路径：assets/runtime-frameworks/xbs-isolated-vm/<platform>-<arch>/isolated_vm.node。

随包二进制导出形态可能是 `require(binaryPath)` 直接返回 isolated-vm API，也可能返回 `{ ivm }`；runtime 必须先归一化为含 `Isolate` / `ExternalCopy` 的对象，不得假设 `require(binaryPath).Isolate` 一定存在。

选择 isolated-vm 后必须先运行；如果 ABI 不兼容，再运行 Node 版本兼容检查并按用户确认结果处理：

```bash
node --no-node-snapshot scripts/check_xbs_isolated_vm.js --markdown
node --no-node-snapshot scripts/check_xbs_isolated_vm.js --strict --json
node scripts/check_node_runtime_compat.js --target isolated-vm --markdown
```

检测内容必须包含：当前 Node 版本、ABI、平台、二进制路径、是否加载成功、window === globalThis、window.xbs 是否存在、17 个 xbs 核心 API 是否齐全、xbs.dom.createDocument 是否可用、基础 DOM smoke test 是否通过。ABI 不兼容时不得直接改选或降级，先询问用户是否通过 nvm 安装 / 切换 Node.js v26.3.1；用户拒绝后才允许提供匹配构建产物或改选不使用框架 / vm / jsEnv。

window.xbs 期望 API：

```text
clearProtoChainRegistry
createGetter
createInterceptor
createNativeCollection
createNativeFunction
createNativeObject
createProtoChains
createSetter
createUndetectable
deletePrivate
deleteProtoChainRegistryEntry
getMimeTypesAndPlugins
getPrivate
getProtoChainRegistry
hasPrivate
setPrivate
throwTypeError
```

补环境代码必须运行在 isolated-vm Context 内，优先使用 xbs.createProtoChains、xbs.createNativeFunction、xbs.createGetter、xbs.createSetter、xbs.createNativeCollection、xbs.getMimeTypesAndPlugins、xbs.createUndetectable、xbs.setPrivate / getPrivate 等 API。

## xbs DOM 入口要求

- `xbs.dom.createDocument(options)` 是当前 xbs DOM 的唯一公开入口；不要使用已删除的 attachDocument、installConstructors、createElement、createIframeDocument、patchApi、createProfile、snapshotSurface、getLastError 等旧 API。
- `createDocument()` 支持 `url`、`html`、`skeleton`、`omitApis`、`disabledApis`、`removedApis`、`features.documentAll`、`features.iframeContentDocument`。
- 默认不会把 `document` 挂到 `window`，补环境代码必须按 case 需要自行安装 `window.document`。
- DOM 构造函数不会默认挂到 `window`，但 document / element 实例自身应具备正确内部构造函数和原型链，例如 `document.constructor.name === "HTMLDocument"`。
- 禁用 DOM API 必须在创建 document 前通过 `omitApis` 或 `features` 声明，不要运行时强删已经发布的不可配置属性。
- iframe 不再使用旧 `createIframeDocument()` / `attachIframeDocument()`；iframe 的 `contentDocument` / `contentWindow` 由 iframe 元素按需创建，禁用时使用 `omitApis: ["HTMLIFrameElement.prototype.contentDocument"]`。
- 当前 DOM 是补环境基础实现，不是完整浏览器内核；真实布局、CSSOM、MutationObserver、Canvas、WebGL 等仍按本 Skill 对应指纹 / 高强度 diff 流程补齐。

Context 内示例：

```js
const chain = xbs.createProtoChains([
  { name: "EventTarget", length: 0, constructorBehavior: "allow" },
  {
    name: "Navigator",
    length: 0,
    prototypeParent: "EventTarget",
    constructorBehavior: "illegal",
    callBehavior: "illegal",
    constructorErrorMessage: "Illegal constructor",
    callErrorMessage: "Illegal constructor",
    instanceFactoryName: "createNavigator",
  },
]);
Object.defineProperty(chain.Navigator.prototype, "userAgent", {
  get: xbs.createGetter("userAgent", 0, function () {
    return __fixture__.navigator.userAgent;
  }),
  enumerable: true,
  configurable: true,
});
globalThis.navigator = chain.createNavigator();
```

## isolated-vm 文件化补环境加载模式

- isolated-vm 底层执行的仍然是源码字符串，但最终交付源码必须是普通文件；宿主 runtime 负责读取文件内容并传给 `compileScriptSync(source, { filename })`。
- 禁止把主要补环境代码集中写入 `String.raw` 大字符串、`CORE_SCRIPT`、`BROWSER_OBJECTS_SCRIPT` 或 `script-browser-objects.js` 这类聚合脚本。
- runtime 必须提供或等价实现 `runFile(relativePath, options)` 和 `runFiles(fileList, options)`，默认从项目根目录或显式 `sourceRoot` 读取 UTF-8 文件，并限制路径不能逃逸 sourceRoot。
- `runFile` 必须给 isolated-vm 编译选项传入可读 `filename`，让错误栈能定位到 `src/env/browser-objects/navigator.js`、`document.js`、`canvas.js` 等具体文件。
- `install-env.js` 只做装配：设置 fixture / config / 宿主桥接引用，按 manifest 顺序调用 `runtime.runFiles([...])`，再执行极小的安装入口。
- Context 内不要直接实现 CommonJS `require` 来加载本地文件；除非用户明确要求复杂模块系统，默认采用宿主按顺序注入文件的方式，简单、安全、可审计。
- 文件组织建议：`src/env/core/` 放 descriptor、cookie-store、native helper；`src/env/browser-objects/` 放 window、navigator、document、location、screen、xhr、storage；`src/env/fingerprint/` 放 canvas、webgl、audio、dom-geometry。
- 质量检查必须运行 `scripts/check_code_quality.js --case-dir case --markdown`；如果检测到大段 `String.raw` WebAPI 脚本或缺少文件化模块，应先重构再交付。

## Node.js 内置 vm

用户明确选择 vm 时才使用 assets/runtime-frameworks/vm-runtime.js。仍需显式构造干净 context，不得暴露 process、Buffer、require、module、global，也不得把 vm 当强安全边界。

## jsEnv

用户明确选择 jsEnv 时才使用 assets/runtime-frameworks/jsenv-runtime.js。必须先确认 jsEnv 项目路径、版本、安装命令、入口模块、初始化函数、如何注入 env、如何加载目标 JS、如何调用 signer、如何释放资源；未提供文档时只能生成待适配模板，不能虚构 API。

## 最终项目复制规则

- 不使用框架：不得复制 vm-runtime.js、isolated-vm-runtime.js、jsenv-runtime.js、xbs-isolated-vm/。
- 选择 vm：复制 runtime-factory.js 和 vm-runtime.js。
- 选择 isolated-vm：复制 runtime-factory.js、isolated-vm-runtime.js 和 xbs-isolated-vm/<platform>-<arch>/isolated_vm.node；用户提供替换二进制时复制到相对结构或通过配置引用，不要把本机绝对路径写入最终产物。
- 选择 jsEnv：复制 runtime-factory.js、jsenv-runtime.js，并根据用户文档补 adapter。

## 二次提醒触发条件

如果默认未使用框架，但后续出现普通上下文无法阻断 Function("return this")()、constructor.constructor、Realm / intrinsic 差异、全局对象污染、多 fixture 互相影响等问题，暂停并询问是否切换。不得自动启用框架。

## 交付检查

- 框架选择已记录。
- Trace 复杂度评估已写入阶段报告（如果存在 Trace）。
- 选择 isolated-vm 时已记录 xbs 自检、Node ABI、平台、二进制来源；如 ABI 不兼容，已记录 nvm + Node.js v26.3.1 恢复流程、用户选择和重新检测结果。
- 选择 isolated-vm 时最终代码在 Context 内优先使用 xbs API，没有桥接旧 addon.node；补环境源码按真实文件模块组织，并由 runtime.runFile / runtime.runFiles 注入 Context，没有大段 `String.raw` 作为主要实现。
- 未选择 isolated-vm 时最终项目不含 xbs-isolated-vm/、isolated_vm.node 或 isolated-vm runtime。
- 未选择框架时最终项目不含 vm-runtime.js、isolated-vm-runtime.js、jsenv-runtime.js。
