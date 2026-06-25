# Node.js 补环境调试循环

当前置阶段已经完成，并且用户确认进入补环境阶段时读取本文件。

## 目标

补环境阶段不是为了让目标 JS “勉强不报错”，而是为了让目标网页原始 JS 在 Node.js 中生成与浏览器样本一致的结果。

核心原则：

```text
先记录，后补齐；先最小，后扩展；真实性保护和 addon-first 从第一版 env 骨架开始；先样本验证，后交付。
```

对 Canvas / WebGL / WebGPU / Audio / 字体 / DOM 几何等浏览器指纹，额外遵循：

```text
先采真实浏览器终端 API 返回值，再在 Node.js 中回放；不要强行复刻渲染管线，不要把最终流程改成自动化浏览器。
```

真实性与 addon-first 额外遵循：

```text
先加载 / 记录 addon，再编写 env；toString、属性描述符、访问器、原型链和实例对象保护是默认基线，不等待检测触发。
```

如果本 case 的取证模式是 ruyiPage + RuyiTrace，或用户明确说“已经 trace 好日志 / 已提供 NDJSON”，补环境阶段再增加一条硬规则：

```text
先看 RuyiTrace NDJSON，再跑 Node trace；先用浏览器内核日志定位环境依赖，再用 Node.js 复现和固化。
```

## 进入条件

进入本阶段前必须确认：

- 目标属于网页端 JS。
- 已有目标 API、请求方法、加密参数名和参数位置。
- 至少有一份成功请求样本，最好有多组样本。
- 已经定位或初步定位加密入口。
- 相关 JS 文件已经保存到本地，或确认可以获取。
- 已经整理 `source → entry → builder → writer` 四层链路，至少确认 writer。
- 如用户选择 ruyiPage + RuyiTrace，已导入 NDJSON 日志并生成 `notes/ruyitrace-summary.md`；如果尚未导入，应先暂停要求用户提供或采集日志，除非用户明确确认无法提供。
- 已经检查 Node 泄露阻断，不把 `process/Buffer/require/module/global` 暴露给目标 JS。
- 已经在补环境初始化阶段加载 / 检测 addon，并决定 addon-first 或记录用户明确豁免 / addon 不可用降级原因。
- 用户未明确要求关闭真实性保护；默认会对新增 WebAPI 执行属性描述符、访问器、原型链、函数 / 访问器 / 实例对象 toString 保护。
- 已经执行六项纯计算预检，或明确该目标不依赖相关差异。
- 如果目标访问 Canvas / WebGL / WebGPU / Audio / 字体 / DOM 几何等指纹 API，已经采集或计划采集真实浏览器终端 API 返回值；缺少样本时不得进入“静默伪造默认值”的交付模式。
- 如果目标是验证码接口，已确认事件轨迹 fixture 或旧轨迹样本来源，并明确该轨迹只用于补环境生成加密参数，不代表最终验证码验证成功。
- 用户已确认进入 Node.js 补环境阶段。

如果缺少任一关键条件，先回到 `workflow.md` 的前置流程，不要直接写 `env.js`。

## 验证码事件轨迹 fixture 门禁

验证码接口补环境时，如果加密参数依赖鼠标、点击、拖动、触摸、滚轮或键盘事件，先使用浏览器取证得到的旧轨迹 fixture 跑通参数生成。该阶段目标是让目标 JS 在 Node.js 中生成加密参数，不要求验证码最终验证通过。

硬性要求：

- 将轨迹设计为可替换入口，例如 `motionTrack`、`eventFixture`、`verifyContext`、`clickPoints`、`dragPath`。
- 推荐保存到 `case/fixtures/motion.fixture.json` 或 `case/result/src/verify/motion-track.js`。
- 代码中必须有 UTF-8 中文注释，说明旧轨迹来源、用途和后续由 `web-verify-patcher` 替换。
- 不得把旧轨迹硬编码成不可替换逻辑，不得宣称旧轨迹能稳定通过验证码。
- 生成验证码加密参数后，如需识别图片、生成真实轨迹、坐标换算或提交验证，先运行 `scripts/check_web_verify_patcher.js --require --markdown`，确认 `web-verify-patcher` 可用后再交接。

## RuyiTrace 优先诊断门禁

当取证模式为 ruyiPage + RuyiTrace 时，进入任何 `env.js` 编写、缺失对象补齐或环境问题排查前，先执行以下门禁：

1. 确认 `case/ruyi-trace/logs/*.ndjson` 或用户指定 NDJSON 存在。
2. 如果尚未导入，先执行：

   ```bash
   node scripts/import_ruyitrace_log.js --input <trace.ndjson> --case-dir case --markdown
   ```

3. 先阅读 `case/notes/ruyitrace-summary.md`，再按需过滤原始 NDJSON。
4. 针对当前错误或不一致，优先搜索：
   - 缺失对象名：如 `navigator`、`document`、`screen`、`localStorage`。
   - 缺失方法名：如 `getItem`、`getContext`、`getParameter`、`toDataURL`。
   - 目标 JS 文件名、入口函数名、writer 附近调用栈。
   - 与目标请求发起时间邻近的 `api` 调用。
5. 把命中证据写入 `notes/missing-env-priority.md`，至少包含 `api`、`stack.file`、`line`、`col`、所属环境模块、补齐优先级和“RuyiTrace 证据 / Node trace 补充 / 推断”分类，再决定 Level 1/2/3 补齐顺序。
6. 只有 NDJSON 缺失、未覆盖该逻辑或结论不足时，才把 `run_with_trace.js` / Proxy trace 作为主要发现来源。

不要在已有可用 RuyiTrace 日志时，直接根据 Node.js 报错盲目补环境。

## 推荐 case 目录

```text
case/
├── js/
│   ├── original/
│   ├── pretty/
│   └── extracted/
├── requests/
├── fixtures/
├── notes/
├── hooks/
├── env/
├── ruyi-trace/
│   └── logs/
├── browser/
│   └── ruyipage/
├── result/
└── tmp/
```

使用脚本创建：

```bash
node scripts/init_env_case.js --case-dir case --target app.js --entry window.makeSign --param sign --api https://example.com/api/search
```

目录含义：

| 目录 | 用途 |
|---|---|
| `js/original/` | 原始 JS、chunk、runtime、sourcemap |
| `js/pretty/` | 格式化后的 JS |
| `js/extracted/` | 抽取出的入口模块或片段 |
| `requests/` | 脱敏后的 cURL、HAR、请求说明 |
| `fixtures/` | 浏览器真实样本和期望输出 |
| `notes/` | 分析笔记、入口定位、环境依赖说明 |
| `hooks/` | 浏览器 Hook 模板和临时断点脚本；调用栈确认并写入 notes 后立即清理或归档 |
| `env/` | 分层 env 模块草稿 |
| `ruyi-trace/logs/` | 用户确认导入的 RuyiTrace NDJSON 原始日志 |
| `browser/ruyipage/` | ruyiPage 取证配置、非敏感脚本和用户确认保留的材料 |
| `result/` | 最终规范项目目录；唯一执行入口为 `final.js` 或 `final.py`，必要模块可放入 `src/`；不要放临时 runner、测试脚本或浏览器自动化代码 |
| `tmp/` | trace、临时 runner、日志、失败产物；每次测试或阶段完成后立即清理 |

## 双模式策略

### 探测模式

探测模式用于发现目标 JS 实际访问了哪些浏览器环境。

允许使用：

- JS `Proxy`。
- getter / setter hook。
- 函数调用记录。
- 构造调用记录。
- trace 文件。

运行示例：

```bash
node scripts/run_with_trace.js \
  --target case/js/original/app.js \
  --entry window.makeSign \
  --fixture case/fixtures/sample.fixture.json \
  --trace case/tmp/env-trace.jsonl \
  --summary case/tmp/missing-env.json
```

探测模式允许对象“不完全像浏览器”，但必须明确标记其用途只是调试，不要把全量 Proxy 作为最终交付。

### 交付模式

交付模式用于最终稳定运行。

要求：

- 从第一版可交付 env 开始就启用真实性保护，不等检测命中后再补。
- 进入本模式前已经加载 / 记录 addon；addon 可用时所有 native-like 函数、getter、setter、特殊对象和原型链 helper 都必须 addon-first。
- 尽量不用全局 Proxy。
- 将 trace 中发现的访问路径固化为真实对象结构。
- 显式定义属性描述符。
- 建立必要原型链。
- 对构造函数、普通方法、getter、setter 做 native-like `toString` 保护；访问器函数也必须保护。
- 对实例对象设置正确 `Object.prototype.toString` / `Symbol.toStringTag`，并对 `document.all` 等特殊对象优先使用可选 native addon。
- 不输出调试 trace。
- 用 fixtures 验证输出。

## 分层补齐策略

补齐顺序固定为：

1. **Level 1 基础运行层**：window/self/globalThis、location、URLSearchParams、Storage、Date、crypto、console、定时器。
2. **Level 2 指纹与真实性层**：navigator、screen、document、plugins/mimeTypes、Canvas / WebGL / WebGPU / Audio / 字体 / DOM 几何终端 API 值回放、属性描述符、原型链、native-like toString。
3. **Level 3 目标 SDK 专用层**：SDK init、动态 chunk、Worker、WASM、postMessage、站点私有缓存。

模块选择细节见 `env-module-levels.md`。输出不一致时先读取 `node-leakage-and-silent-failure.md`，不要盲目继续补对象。

## 运行顺序

```text
1. 创建 case 目录和 fixtures。
2. 如果取证模式为 ruyiPage + RuyiTrace，先导入 / 阅读 NDJSON 摘要，形成环境依赖优先级。
3. 执行 Node 泄露阻断检查和六项纯计算预检。
4. 运行 native addon 优先门禁：加载 / 检测随包 addon；可用时后续 native-like 函数、访问器、`document.all`、原型链等先走 addon，失败时记录降级状态。
5. 用最小浏览器环境运行目标 JS。
6. 捕获 ReferenceError / TypeError / 输出不一致。
7. 如已选择 RuyiTrace，先用 NDJSON 证据解释缺失路径；解释不足时再用 Proxy 记录实际访问路径。
8. 生成缺失环境报告，并用 `analyze_trace.js` 输出模块优先级。
9. 如果 trace 或 NDJSON 显示 Canvas / WebGL / WebGPU / Audio / 字体 / DOM 几何指纹，先读取 `fingerprint-value-replay.md`，生成采样 Hook，采集 `fixtures/fingerprint.fixture.json`，再接入 `assets/env-modules/fingerprint-env.js` 做终端 API 值回放。
10. 按 RuyiTrace 证据 + Node trace 补充结论，分 Level 1/2/3 补齐环境。
11. 发现 Proxy、toString、descriptor、accessor、prototype、instanceof、constructor.name 或 `document.all` 检测信号时，迁移到真实对象 / addon-first 模式；addon 不可用时才使用 NativeProtect fallback。
12. 如果是验证码接口，先注入可替换的 `motionTrack` / `eventFixture` 旧轨迹 fixture，仅用于生成验证码接口加密参数。
13. 调用加密入口。
14. 和浏览器样本对比；如果缺少指纹样本，补采样而不是改用自动化浏览器。
15. 多样本通过后整理规范项目目录，把补环境、入口调用、参数生成和最终 Node.js / Python 请求逻辑串联到唯一入口 `result/final.js` 或 `result/final.py`；必要模块可放入 `result/src/`。
16. 先运行 `check_env_realism.js --require-addon-first`，确认原型链、属性描述符、访问器、toString 保护、实例对象 toString 保护、addon-first/native fallback 记录、document.all、RuyiTrace 证据和指纹值回放证据；再运行 `check_fingerprint_fixture.js` 与 `check_final_artifact.js`，确认最终主文件不含 ruyiPage / Playwright / Puppeteer / Selenium / CloakBrowser 等自动化代码。
17. 清理 trace、临时日志、失败 runner、测试脚本、指纹采样 Hook 和多余文件。
```

## 错误分类

### ReferenceError

示例：

```text
ReferenceError: XMLHttpRequest is not defined
```

记录为：

```json
{
  "type": "missing-global",
  "name": "XMLHttpRequest"
}
```

处理：如果选择 ruyiPage + RuyiTrace，先在 NDJSON 中确认浏览器真实调用栈、构造方式和相关属性，再补全 `globalThis.XMLHttpRequest`，必要时建立构造函数和原型。

### TypeError：不是函数

示例：

```text
TypeError: localStorage.getItem is not a function
```

记录为：

```json
{
  "type": "missing-method",
  "path": "localStorage.getItem"
}
```

处理：如果选择 ruyiPage + RuyiTrace，先在 NDJSON 中确认该方法真实是否被调用、调用参数和调用栈，再补全对应方法。若 addon 可用，优先创建 native-like 函数。

### TypeError：读取 undefined 属性

示例：

```text
Cannot read properties of undefined (reading 'userAgent')
```

处理：优先结合 RuyiTrace NDJSON 判断浏览器真实路径；NDJSON 不足时再结合 Node trace，补齐缺失对象或属性。

### 输出不一致

如果不再报错但签名不一致，且已选择 ruyiPage + RuyiTrace，先回看目标请求前后的 NDJSON 调用，再检查：

- 请求 URL、Query、Body 是否完全一致。
- `Date.now`、`performance.now`。
- `Math.random`、`crypto.getRandomValues`。
- `navigator.userAgent`、语言、时区、屏幕信息。
- `document.cookie`、`localStorage`、`sessionStorage`。
- `location.href`、`origin`、`pathname`。
- 是否启用 native-like `toString`。
- `document.all` 是否走了 native addon 路径。
- `Object.getOwnPropertyDescriptor` 返回的 descriptor 是否与真实浏览器一致。
- getter / setter / 构造函数 / 原型方法的 `Function.prototype.toString.call(...)` 是否为 native-like。
- 实例对象的 `Object.prototype.toString.call(...)`、`constructor.name`、`instanceof` 是否一致。

如果 NDJSON 中没有覆盖目标参数生成时间段，明确标记“RuyiTrace 未覆盖”，再使用 Node trace / Hook / 断点补充。

## trace 输出

推荐临时文件：

```text
case/tmp/
├── env-trace.jsonl
├── missing-env.json
├── runtime-error.log
└── env-access-summary.md
```

`env-trace.jsonl` 示例：

```json
{"type":"get","path":"navigator.userAgent"}
{"type":"get","path":"document.cookie"}
{"type":"call","path":"localStorage.getItem","args":["string"]}
```

`missing-env.json` 示例：

```json
{
  "missingGlobals": ["XMLHttpRequest"],
  "missingMethods": ["localStorage.getItem"],
  "missingProperties": ["navigator.userAgent", "document.cookie"],
  "specialObjects": ["document.all"],
  "nativeAddon": {
    "available": true,
    "usedApis": ["createUndetectable", "createNativeFunction", "createGetter"]
  },
  "proxyRiskSignals": ["Object.getOwnPropertyDescriptor", "Function.prototype.toString"],
  "runtimeErrors": []
}
```

## 输出要求

阶段输出应包含：

```markdown
## Node.js 补环境运行结果

- 目标 JS：
- 入口函数：
- fixtures：
- native addon：可用 / 不可用 / 用户明确豁免；必须说明是否在补环境初始化阶段已加载 / 记录
- 真实性检查：已运行 `check_env_realism.js`（默认 addon-first）/ 未运行（需说明原因）
- RuyiTrace NDJSON：已优先分析 / 未提供 / 未覆盖当前问题
- 运行状态：成功 / 失败

## 缺失环境摘要

- RuyiTrace 证据：api、stack.file、line、col、相关时间窗口
- 缺失全局对象：
- 缺失方法：
- 缺失属性：
- 特殊对象：
- Proxy 检测风险：

## 下一轮补齐计划

1. ...
2. ...

## 清理检查

- [ ] 已清理临时 trace。
- [ ] 已清理失败 runner。
- [ ] 已把关键结论写入 notes。
- [ ] 已生成规范项目目录，且唯一执行入口为 `result/final.js` 或 `result/final.py`。
- [ ] 已确认最终项目所有源码不包含浏览器自动化代码。
- [ ] 已确认最终请求由 Node.js / Python HTTP 客户端实现。
- [ ] 已生成 `result/最终项目总结.md`，除非用户明确要求不生成。
```
