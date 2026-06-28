# 浏览器指纹值采样与回放指南

当目标 JS 访问 Canvas、WebGL、WebGPU、Audio、字体、DOM 几何、CSS 渲染等浏览器指纹 API，或 Node.js 中第三方库模拟结果与真实浏览器不一致时读取本文件。

## 核心原则

补环境的目标是让目标网页原始 JS 在 Node.js 中看到与真实浏览器一致的结果，而不是在 Node.js 中复刻完整浏览器渲染管线。

必须遵循：

- **指纹基线先固定**：采样前先读取 `fingerprint-baseline-consistency.md`，确认 `case/notes/fingerprint-baseline.json` 和 `baselineId` 已创建；所有采样必须来自同一 profile / seed / 代理 / 语言 / 时区 / UA / Client Hints / screen / WebGL 基线。
- **Trace 未截断值优先**：如果用户选择 / 提供了 RuyiTrace 或其他 trace 日志，先使用 trace 中未截断、与当前 `baselineId` 一致、能确认完整性的真实浏览器值。
- **Trace 不可用再采样**：未选择 trace、trace 缺失、trace 未覆盖目标路径、trace 字符串达到或接近 4000 字符疑似截断、真实长度为 `unknown`、或 trace baseline 冲突时，必须使用用户当前确认的取证工具采集真实浏览器最终返回值、调用参数、调用栈和调用顺序。
- **禁止 AI 猜指纹值**：AI 经验、静态分析、默认值、随机值、mock 值、Node.js / jsdom / node-canvas / headless-gl 的结果不能作为最终指纹回放值，只能辅助定位和设计采样点。
- **终端 API 值回放优先**：在 Node.js 中拦截目标真正读取指纹结果的 API，并返回采样值。
- **不真实模拟渲染过程**：不要为了 Canvas / WebGL / 字体 / DOM 几何去强行复现 Skia、GPU、字体栅格化、抗锯齿、颜色管理或浏览器布局。
- **不退回自动化作为最终方案**：Node.js 无法真实渲染时，不得建议把最终生成参数或最终验证改成浏览器自动化；自动化只允许用于前置取证和采样。
- **缺样本即显式阻塞**：没有采到的指纹值不要乱猜，不要静默返回空值；应提示补采样本或降级说明。

错误方向：

```text
node-canvas / headless-gl / 自己实现 DOM 布局 → 结果与真实浏览器仍不一致 → 建议最终用自动化浏览器
```

正确方向：

```text
真实浏览器采集终端 API 返回值 → Node.js 按调用特征匹配并回放 → fixtures 多样本验证
```

## 指纹值来源优先级

采集任何具体 WebAPI / 指纹值时，必须按以下顺序判断，不能跳级猜值：

1. **Trace 未截断真实值**：用户已选择 RuyiTrace / 提供 NDJSON，且字段未达到截断阈值、日志覆盖当前业务路径、调用栈与目标参数生成链路相关、`baselineId` 与当前 case 一致。
2. **同一取证工具补采完整值**：Trace 未选择、缺失、未覆盖、疑似截断或 baseline 不一致时，使用用户已确认的取证模式采样，例如 ruyiPage、Camoufox、CloakBrowser、用户手动浏览器或对应 MCP / Hook。采样必须复用同一 profile / seed / 代理 / locale / timezone / UA / Client Hints / screen / WebGL 基线。
3. **用户提供的真实浏览器材料**：用户明确提供的 HAR、Hook 输出、浏览器控制台输出、完整响应或截图可作为证据，但必须记录来源、时间、页面、baseline 信息和完整性。
4. **静态分析 / AI 推断仅辅助定位**：只能用于判断应该采样哪个 API、哪个调用参数、哪个 JS 位置，不能直接写入最终 fixture 的 `result`。

如果 trace 中字符串达到或接近 4000 字符，必须标记为“疑似截断”：`truncated: true`、`realLength: "unknown"`、`visibleLength`、`sha256OfVisible`。该值不得作为最终回放值；必须用同一 case 已确认取证工具补采完整值。

每个最终写入 fixture 的样本都要能回答：

- 值来自哪里：RuyiTrace 未截断值 / ruyiPage 采样 / Camoufox 采样 / CloakBrowser 采样 / 用户手动浏览器材料 / 其他真实浏览器证据。
- 是否完整：`truncated: false` 或记录完整长度与 hash；疑似截断值不得用于最终回放。
- 属于哪个基线：`baselineId` 必须与 `case/notes/fingerprint-baseline.json` 一致。
- 为什么不用 Trace：如果没有使用 trace，写明未选择、缺失、未覆盖、截断、baseline 冲突或用户明确降级。


## 过程 API 与终端 API

### 过程 API

过程 API 只描述绘制、布局或状态构造过程。补环境时可记录必要状态，但通常不需要真实执行渲染。

常见过程 API：

- Canvas 2D：`fillText`、`strokeText`、`drawImage`、`arc`、`rect`、`fillRect`、`putImageData`。
- WebGL：`createShader`、`shaderSource`、`compileShader`、`attachShader`、`linkProgram`、`bufferData`。
- DOM：`appendChild`、`insertBefore`、`removeChild`、`style.xxx = ...`、`className = ...`。
- 字体：设置 `ctx.font`、创建 span/div、设置 CSS。

### 终端 API

终端 API 是目标 JS 真正读取指纹结果的位置。这里必须优先回放真实浏览器采样值。

| 类别 | 终端 API |
|---|---|
| Canvas | `HTMLCanvasElement.prototype.toDataURL`、`toBlob`、`CanvasRenderingContext2D.prototype.getImageData`、`measureText` |
| WebGL | `getParameter`、`getSupportedExtensions`、`getExtension`、`getShaderPrecisionFormat`、`readPixels`、`getContextAttributes` |
| WebGPU | `navigator.gpu.requestAdapter`、`adapter.info`、`adapter.limits`、`adapter.features`、`requestDevice` |
| Audio | `OfflineAudioContext.startRendering`、`AudioBuffer.getChannelData`、`AnalyserNode.getFloatFrequencyData` |
| 字体 | `measureText`、`document.fonts.check`、DOM 字体探测元素的宽高 |
| DOM 几何 | `getBoundingClientRect`、`getClientRects`、`offsetWidth`、`offsetHeight`、`scrollWidth`、`scrollHeight`、`clientWidth`、`clientHeight` |
| CSS / 媒体 | `getComputedStyle`、`matchMedia`、`CSS.supports` |

## 采样格式

推荐把指纹样本放入 `case/fixtures/fingerprint.fixture.json`，或合并进业务 fixture 的 `fingerprint` 字段。fixture 必须包含 `baselineId`，并与 `case/notes/fingerprint-baseline.json` 一致。

```json
{
  "version": 1,
  "baselineId": "fp-20260627-001",
  "source": {
    "baselineId": "fp-20260627-001",
    "mode": "ruyiPage + RuyiTrace / Camoufox / CloakBrowser / 手动取证",
    "valuePriority": "trace-untruncated-first",
    "traceStatus": "unused / used-untruncated / missing / not-covered / truncated / baseline-conflict",
    "traceFallbackReason": "trace 字段疑似截断，已使用 ruyiPage 在同一 baseline 下补采完整值",
    "pageUrl": "https://example.com/page",
    "userAgent": "",
    "timezone": "Asia/Shanghai",
    "locale": "zh-CN",
    "capturedAt": ""
  },
  "canvas": {
    "toDataURL": [
      {
        "match": { "width": 300, "height": 150, "type": "image/png", "stackIncludes": "fingerprint.js" },
        "source": { "capturedBy": "ruyiPage", "traceStatus": "truncated", "baselineId": "fp-20260627-001", "truncated": false, "valueLength": 123456, "sha256": "..." },
        "result": "data:image/png;base64,..."
      }
    ],
    "measureText": [
      {
        "match": { "text": "abcdef", "font": "16px Arial" },
        "result": { "width": 123.45, "actualBoundingBoxLeft": 0, "actualBoundingBoxRight": 123.45 }
      }
    ],
    "getImageData": [
      {
        "match": { "sx": 0, "sy": 0, "sw": 16, "sh": 16 },
        "result": { "width": 16, "height": 16, "dataBase64": "..." }
      }
    ]
  },
  "webgl": {
    "getParameter": [
      { "match": { "pname": 37445 }, "result": "Google Inc. (NVIDIA)" },
      { "match": { "pname": 37446 }, "result": "ANGLE (...)" }
    ],
    "getSupportedExtensions": { "result": ["ANGLE_instanced_arrays", "WEBGL_debug_renderer_info"] },
    "readPixels": [
      { "match": { "x": 0, "y": 0, "width": 16, "height": 16 }, "result": { "dataBase64": "..." } }
    ]
  },
  "domGeometry": {
    "getBoundingClientRect": [
      { "match": { "selector": "#fp" }, "result": { "x": 0, "y": 0, "width": 100, "height": 20, "top": 0, "left": 0, "right": 100, "bottom": 20 } }
    ],
    "offset": [
      { "match": { "selector": "#font-probe" }, "result": { "offsetWidth": 123, "offsetHeight": 19 } }
    ]
  }
}
```

注意：

- `baselineId` 是硬性字段；缺失或与 baseline 文件不一致时，不能把该 fixture 用于最终交付。
- `source` / `capturedBy` / `traceStatus` / `truncated` 是硬性溯源字段；不能只写“AI 推断”“默认值”“静态分析得到”。
- 如果样本继承全局 `source`，仍建议在长字符串、二进制、Canvas / WebGL / Audio 结果上写入每条记录自己的 `source`、`valueLength` 和 `sha256`。
- `match` 是调用特征，不是安全边界；只用于选择回放样本。
- `stackIncludes` 可记录目标 JS 文件名、函数名或调用栈片段。
- 对 ArrayBuffer / Uint8ClampedArray / Float32Array 等二进制结果使用 base64 存储。
- 真实 Cookie、账号标识、Authorization 不要写入指纹 fixture。

## 回放匹配顺序

Node.js 交付环境中匹配指纹样本时，按以下顺序：

1. API 名称。
2. 显式参数，例如 `type`、`quality`、`pname`、`text`、`font`、`x/y/w/h`。
3. 对象状态，例如 canvas `width/height`、当前 `ctx.font`、WebGL context 类型。
4. 调用栈特征，例如 `stackIncludes`。
5. 调用顺序，仅作为最后兜底。

如果无法唯一匹配：

- 优先报错并输出缺失的 call key。
- 不要返回随机值。
- 不要为了通过而返回空字符串、空数组或固定默认值。

## 禁止与允许

禁止：

- 最终项目引入 `playwright`、`puppeteer`、`selenium`、`cloakbrowser`、`ruyipage` 来计算指纹。
- 最终项目用自动化打开页面生成指纹，再把结果传回 Node.js。
- 因 `node-canvas` / `headless-gl` / `jsdom` 输出不一致而建议改用自动化作为最终方案。
- 未采样时静默伪造 Canvas / WebGL / DOM 几何结果。

允许：

- 前置取证阶段用用户确认的工具采集指纹 API 参数、返回值和调用栈。
- Node.js 交付环境中用 `assets/env-modules/fingerprint-env.js` 模板回放采样值。
- 对不影响目标参数的 API 做明确降级，但必须在 notes 中说明证据等级。
- 对目标未访问的 API 不补。

## 真实性保护要求

即使终端 API 只是返回采样值，也要保持浏览器对象真实性：

- 用 `Object.defineProperty` 定义属性。
- 建立 `HTMLCanvasElement`、`CanvasRenderingContext2D`、`WebGLRenderingContext`、`DOMRect` 等必要原型链。
- 保护方法、getter、setter 的 `Function.prototype.toString`。
- 设置实例对象 `Symbol.toStringTag` / `Object.prototype.toString`。
- 按浏览器行为抛出 `TypeError` 或 `Illegal invocation`，不要暴露 Node.js 错误。

## 推荐执行流程

1. 先读取 `fingerprint-baseline-consistency.md`，确认或创建 `case/notes/fingerprint-baseline.json` 与 `baselineId`。
2. 用 RuyiTrace NDJSON 或 Hook 找到目标 JS 是否访问指纹 API；如果用户选择 / 提供 RuyiTrace，先判断 trace 中是否已有未截断真实值可用。
3. 如果访问的是 Canvas / WebGL / WebGPU / Audio / 字体 / DOM 几何，且 trace 没有未截断完整值，再生成采样 Hook：

   ```bash
   node scripts/generate_fingerprint_hook.js --types canvas,webgl,dom-geometry --out case/hooks/fingerprint-hook.js
   ```

4. 在用户确认的取证工具中运行采样 Hook，触发最少量业务动作。
5. 把采样结果保存为 `case/fixtures/fingerprint.fixture.json`。
6. 运行覆盖检查：

   ```bash
   node scripts/check_fingerprint_fixture.js --fixture case/fixtures/fingerprint.fixture.json --require canvas,webgl --markdown
   ```

7. 把 `assets/env-modules/fingerprint-env.js` 复制到最终项目 `result/src/env/`，按 fixture 接入。
8. 对目标 JS 运行 fixtures，若缺样本，补采样而不是改用自动化。
9. 交付前运行：

   ```bash
   node scripts/check_env_realism.js --case-dir case --require-fingerprint-fixture --markdown
   node scripts/check_final_artifact.js --case-dir case --markdown
   ```

## 输出记录要求

补环境报告或 notes 中至少记录：

- `baselineId`、baseline 文件路径和是否发生 baseline diff。
- 哪些指纹 API 被目标 JS 访问。
- 哪些值来自 RuyiTrace 未截断日志，哪些值因为 trace 缺失 / 未覆盖 / 截断 / baseline 冲突而改用自动化取证工具采样。
- 哪些值来自 ruyiPage / Camoufox / CloakBrowser / Hook / 用户手动浏览器材料，并记录采样工具、时间、完整长度和 hash。
- 是否存在疑似截断字段；如果存在，必须写明补采状态，不能把可见长度当成真实长度。
- 哪些 API 做了近似降级及原因。
- 缺失样本是否阻塞。
- 最终项目是否完全不包含浏览器自动化代码。
