# 补环境代码可读性与中文注释规范

每次生成、重构或交付 `case/result/` 中的补环境代码前读取本文件。目标是让最终代码 **简洁、可读、可维护、中文注释正常显示**，并避免生成压缩、堆叠、无注释或乱码代码。

## 硬性原则

1. **先规划目录，再写代码**  
   写代码前先列出最终目录、每个文件职责和调用关系。不要边写边临时堆文件。

2. **按职责拆模块**  
   不要把所有补环境逻辑塞进一个 `env.js`。推荐结构：

   ```text
   case/result/
   ├── final.js
   ├── 最终项目总结.md
   └── src/
       ├── env/
       │   ├── install-env.js
       │   ├── native-api.js
       │   ├── manifest.js
       │   ├── core/
       │   │   ├── descriptors.js
       │   │   └── cookie-store.js
       │   ├── browser-objects/
       │   │   ├── window.js
       │   │   ├── navigator.js
       │   │   ├── document.js
       │   │   ├── location.js
       │   │   ├── screen.js
       │   │   ├── xhr.js
       │   │   └── storage.js
       │   └── fingerprint/
       │       ├── canvas.js
       │       ├── webgl.js
       │       └── dom-geometry.js
       ├── target/
       │   └── entry.js
       ├── request/
       │   └── client.js
       └── utils/
           └── normalize.js
   ```

   如果需要 Node 诊断执行器、runtime probe 或 Akamai / Shape / F5 等高强度检测的本地执行器，应继续拆成下列职责，而不是把所有 WebAPI 放进 `src/signer/*probe*.js`：

   ```text
   case/result/src/
   ├── signer/
   │   ├── runtime_signer.py
   │   └── akamai_runtime_probe.js      # 只做入口和编排，建议少于 150 行
   └── node-runtime/
       ├── bootstrap/
       │   ├── read-stdin.js
       │   ├── execute-script.js
       │   └── result-recorder.js
       ├── utils/
       │   ├── hash.js
       │   ├── sanitize-url.js
       │   └── body-summary.js
       └── env/
           ├── install-env.js
           ├── native-api.js
           ├── node-leakage.js
           ├── browser-objects/
           │   ├── window.js
           │   ├── navigator.js
           │   ├── document.js
           │   ├── location.js
           │   ├── history.js
           │   ├── screen.js
           │   ├── storage.js
           │   ├── performance.js
           │   └── events.js
           ├── fingerprint/
           │   ├── canvas.js
           │   ├── webgl.js
           │   ├── audio.js
           │   └── dom-geometry.js
           └── network/
               ├── xhr.js
               ├── fetch.js
               └── beacon.js
   ```

3. **signer / probe 不得承载补环境主体**  
   `src/signer/`、`src/request/`、`src/resources/`、`runtime_probe.js`、`probe.js`、`runner.js`、`diagnostic.js` 等文件只允许做编排、进程入口、请求封装、资源刷新或安全摘要输出；只要文件内实现了 `navigator`、`document`、`window`、`screen`、`Storage`、`XMLHttpRequest`、`fetch`、`Canvas`、`WebGL`、`Audio`、`performance`、DOM 构造链、事件系统等浏览器 WebAPI 主体，就必须拆入 `src/env/` 或 `src/node-runtime/env/` 下的真实模块。不得因为文件名叫 probe、runtime、signer 或 diagnostic 就豁免模块化要求。

4. **补环境代码必须可读**  
   禁止压缩代码、单行堆叠多个语句、过度匿名函数、无意义变量名、超长函数和超深嵌套。原始目标 bundle 如必须保留，应放到 `src/target/original/` 或等价目录，并与手写补环境代码分离。

5. **中文注释必须正常显示**  
   所有交付源码使用 UTF-8 无 BOM。不要使用未指定编码的 PowerShell / cmd 重定向写中文源码。中文注释中不得出现问号、连续问号或替换字符。

6. **WebAPI 实现必须可审计**  
   补环境源码不得把 WebAPI 写成无法审查的一行堆叠代码。禁止一行连续堆多个 `Object.defineProperty`、`Object.defineProperties`、`Object.assign`、函数定义或对象字面量方法。`install-env.js` 只负责装配，不应成为巨型文件；`navigator`、`screen`、`document`、`storage`、`indexedDB`、`canvas`、`webgl`、`events`、`worker`、`request` 等应按职责拆模块。

7. **普通 WebAPI 函数必须 addon-first**  
   不要在 WebAPI 主路径中直接写 `ctx.Blob = function(){}`、`ctx.indexedDB = { open() {} }`、`prototype = { getContext() {} }` 或 `ctx.URL.createObjectURL = function(){}`。普通函数也要提取为具名函数，并通过 addon-first helper 包装后再安装 descriptor。addon 不可用时才用 `NativeProtect` / JS fallback，并在注释与阶段报告中说明原因。

8. **构造函数错误必须可追溯**  
   构造函数的报错类型和 message 必须来自目标浏览器采样。不要写泛化 `throw new TypeError('Illegal constructor')`；需要在注释、fixture 或阶段报告中说明该错误来自哪个浏览器、哪个调用方式。

9. **addon 实例不再二次标记对象类型**  
   `markObjectType` 不是批准 API。addon 构造函数 / `createProtoChains` 实例工厂创建出的实例本身应已处理 `Object.prototype.toString`；只有 JS fallback 普通对象才允许 `markObjectToString` / `Symbol.toStringTag`，并必须写明 fallback 原因。

10. **注释说明“为什么”和“来源”**  
   注释不是逐行翻译代码，而是说明模块职责、浏览器样本来源、RuyiTrace 证据、fixture 匹配规则、addon-first 决策和 fallback 原因。

11. **isolated-vm 也必须文件化模块交付**  
   isolated-vm 底层确实需要把源码字符串交给 V8，但最终项目不得把补环境源码写成大段 `String.raw`、`CORE_SCRIPT`、`BROWSER_OBJECTS_SCRIPT`、`*_SCRIPT` 聚合字符串。正确做法是把 `navigator.js`、`document.js`、`window.js`、`canvas.js`、`webgl.js` 等作为真实源码文件保存，由宿主侧 runtime 使用 `fs.readFileSync` 读取，再通过 `compileScriptSync(source, { filename })` 或等价方法注入同一个 isolated-vm Context。只有少量 bootstrap 片段允许字符串形式，且必须少于 40 行、不能承载主要 WebAPI 实现，并写明原因。

## 中文注释要求

必须写中文注释的位置：

- 文件顶部：说明模块职责、输入来源和边界。
- 每个环境对象模块：说明模拟哪个浏览器对象。
- 关键 getter / setter：说明真实值来自 fixture、RuyiTrace、请求样本还是用户配置。
- native-like 函数和构造函数：说明挂载位置、浏览器行为和 addon-first 处理。
- fallback 分支：说明 addon 不可用、ABI 不兼容、API 调用失败或用户明确豁免的原因。
- 指纹值回放函数：说明匹配 key、采样来源和缺失样本时的处理。
- 加密参数生成入口：说明输入、输出和 fixtures 验证方式。

禁止：

```js
// 不合格：用问句解释实现
// 不合格：连续问号乱码示例
// 临时先这样
```

推荐：

```js
// 安装 Navigator 相关环境对象，字段值来自浏览器 fixture
function installNavigatorEnv(globalObject, fixture, nativeApi) {
  // Navigator 构造函数错误信息来自 constructor-errors.fixture.json 中的浏览器采样
  const Navigator = nativeApi.createNativeConstructor('Navigator', 0, function Navigator(isNew) {
    if (isNew) {
      return nativeApi.throwIllegalConstructor('Navigator');
    }
    return nativeApi.throwIllegalConstructor('Navigator');
  });

  // userAgent 使用真实浏览器采样值，不在 Node.js 中伪造默认值
  nativeApi.defineNativeGetter(Navigator.prototype, 'userAgent', function getUserAgent() {
    return fixture.browser.userAgent;
  });
}
```

## 命名与函数拆分

- 函数名使用业务含义，例如 `installNavigatorEnv`、`createStorageArea`、`replayCanvasToDataURL`。
- 避免 `a`、`b`、`fn1`、`tmp`、`xxx` 作为长期变量名。
- 单函数建议不超过 90 行。
- 单文件建议不超过 500 行。
- 单行建议不超过 180 字符。
- 属性描述符、构造函数 callback、WebAPI 方法安装、`Object.assign`、`try/catch` 较长逻辑不得压成一行。
- 嵌套层级尽量不超过 6 层；复杂逻辑用提前返回或拆函数。

## isolated-vm 文件化加载示例

推荐由 `install-env.js` 只负责装配，由 runtime 顺序读取文件：

```js
const ENV_FILES = [
  'src/env/core/descriptors.js',
  'src/env/browser-objects/window.js',
  'src/env/browser-objects/navigator.js',
  'src/env/browser-objects/document.js',
  'src/env/fingerprint/canvas.js',
  'src/env/fingerprint/webgl.js',
];

function installEnv(runtime, config) {
  runtime.setCopy('__ENV_CONFIG__', config);
  runtime.runFiles(ENV_FILES);
  runtime.runFile('src/env/install-all.js');
}
```

每个文件都应是正常 JavaScript 文件，文件顶部用中文说明模块职责。Context 内不需要也不应该直接 `require('./navigator.js')`；由宿主 runtime 读取文件内容后注入，既保持 isolated-vm 隔离，又保留源码文件结构、中文注释和 filename 栈定位。

## 最终交付前检查

交付前必须运行：

```bash
node scripts/check_code_quality.js --case-dir case --markdown
node scripts/check_webapi_addon_coverage.js --case-dir case --markdown
node scripts/check_env_realism.js --case-dir case --markdown
node scripts/check_final_artifact.js --case-dir case --markdown
```

如果 `check_code_quality.js` 或 `check_webapi_addon_coverage.js` 失败，必须立即停止后续补环境验证、真实请求验证和交付；先重构代码、拆分 signer/probe 中的 WebAPI 主体、修复中文注释、编码问题、普通 WebAPI 函数、普通对象和宿主透传，再重新运行检查。不得以“当前请求能跑通”“只是诊断脚本”“只是 probe”为理由跳过失败项。

## 常见修复方式

| 问题 | 修复方式 |
|---|---|
| 单个 `env.js` 太大 | 按 navigator、document、storage、fingerprint 拆模块 |
| isolated-vm 生成大段 `String.raw` | 改为真实 `.js` 文件，由 runtime.runFile / runtime.runFiles 读取后注入 Context |
| `script-browser-objects.js` / `script-core.js` 承载主要补环境 | 拆成 `browser-objects/navigator.js`、`document.js`、`window.js`、`fingerprint/canvas.js` 等模块 |
| 没有中文注释 | 增加文件头、对象说明、来源说明和 fallback 原因 |
| 中文注释有问号或乱码 | 用 UTF-8 重新写入，避免默认 shell 重定向 |
| 函数过长 | 拆成解析 fixture、创建构造函数、安装属性、安装实例四步 |
| 普通赋值太多 | 改为统一 helper，例如 `defineValue`、`defineNativeGetter` |
| 普通 WebAPI 函数 | 提取具名 callback，用 `addon.createNativeFunction` 或 addon-first helper 包装 |
| 普通 WebAPI 对象 | 用 `createProtoChains` 建立构造函数、prototype 和实例工厂，再安装 descriptor |
| 泛化 `Illegal constructor` | 先采样浏览器错误类型和 message，再用 `throwBrowserTypeError` / `throwIllegalConstructor` 等 helper 复现 |
| `markObjectType` | 删除该调用；addon 实例不需要二次标记，JS fallback 才用 `markObjectToString` 并记录原因 |
| `prototype = {}` | 改为 `createProtoChains` 或 `Object.defineProperties`，保留 `constructor` 和 `Symbol.toStringTag` |
| 直接复用宿主 Web API | 按浏览器样本和目标调用范围重建可控实现，不盲目透传 Node 宿主对象 |
| target bundle 混入手写代码 | 原始 bundle 放 `src/target/original/`，入口包装放 `src/target/entry.js` |
