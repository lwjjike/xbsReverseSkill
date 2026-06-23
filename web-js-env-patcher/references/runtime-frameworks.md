# 补环境框架选择、xbs isolated-vm 与 Trace 复杂度评估

本文件用于进入 Node.js 补环境阶段前读取。核心原则：是否使用补环境框架由用户选择；Trace 复杂度只用于理解补环境范围、风险和优先级，不自动决定框架。

## 核心规则

1. 进入正式补环境前必须提醒用户选择补环境框架。
2. 默认不使用补环境框架；用户未明确选择时按“不使用补环境框架”继续。
3. 可选项只有：不使用、isolated-vm、Node.js 内置 vm、jsEnv。
4. 选择 isolated-vm 时必须使用本 Skill 随包魔改 xbs isolated-vm，并在 Context 内使用 window.xbs / globalThis.xbs。
5. 平台缺失或 Node ABI 不匹配时，要求用户提供匹配魔改构建产物或改选框架；不要自动 npm 安装或退回 npm 原版 isolated-vm。
6. 不要把旧 addon.node 桥接进 isolated-vm；该模式下 addon-first 表达为 xbs native-first。
7. 最终项目只保留用户选择的 runtime；未选择 isolated-vm 时不得复制 xbs-isolated-vm/ 或 isolated_vm.node。

## 补环境前询问模板

```markdown
请确认本次补环境是否使用补环境框架：

1. 不使用补环境框架，默认
2. 使用 isolated-vm：加载本 Skill 随包魔改 xbs isolated-vm，在隔离 Context 内使用 window.xbs / globalThis.xbs 提供 createProtoChains、createNativeFunction、createGetter、createSetter、createNativeCollection、getMimeTypesAndPlugins、createUndetectable 等 native-first 能力；需要当前 Node ABI 与二进制匹配
3. 使用 Node.js 内置 vm：轻量、无需额外安装，但隔离弱于 isolated-vm
4. 使用 jsEnv：请先提供 jsEnv 项目路径、安装方式、入口文件和使用文档；未检测通过前不会复制 jsEnv runtime 或虚构 API

如果你不明确选择，我将按“不使用补环境框架”继续。

说明：Trace 复杂度评估只用于理解补环境范围、风险点和优先级，不会自动决定是否使用补环境框架。
```

记录到 case/notes/补环境框架选择.md、阶段报告和最终项目总结。记录字段至少包括：框架选择、选择来源、Node 版本、Node ABI、平台、xbs 自检结果、是否发生切换、切换原因。

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

选择 isolated-vm 后必须先运行：

```bash
node scripts/check_xbs_isolated_vm.js --markdown
node scripts/check_xbs_isolated_vm.js --strict --json
```

检测内容必须包含：当前 Node 版本、ABI、平台、二进制路径、是否加载成功、window === globalThis、window.xbs 是否存在、17 个 xbs API 是否齐全。

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
- 选择 isolated-vm 时已记录 xbs 自检、Node ABI、平台、二进制来源。
- 选择 isolated-vm 时最终代码在 Context 内优先使用 xbs API，没有桥接旧 addon.node。
- 未选择 isolated-vm 时最终项目不含 xbs-isolated-vm/、isolated_vm.node 或 isolated-vm runtime。
- 未选择框架时最终项目不含 vm-runtime.js、isolated-vm-runtime.js、jsenv-runtime.js。
