# Trace API 覆盖矩阵门禁

本文件用于解决“Trace 已经命中 WebAPI，但补环境阶段仍反复遇错新增 WebAPI”的流程问题。只要存在 RuyiTrace NDJSON、Node trace、`missing-env.json`、Hook 环境访问日志或等价环境日志，进入第一版 Node.js 补环境实现前必须读取本文件。

## 核心原则

- Trace 不是调试参考，而是首轮补环境范围的主输入。
- 已在 Trace 中命中的 WebAPI 不得等到 `ReferenceError`、`undefined.prototype`、writer 不触发或 body 长度异常时再临时补。
- Node probe 只用于验证覆盖、发现 Trace 未覆盖的新动态分支和定位行为差异；不得把 probe 当作主要 WebAPI 发现机制。
- Trace 能确认“访问了什么”，但不一定能确认“真实返回值是什么”。需要真实值或浏览器行为语义的 API 必须在矩阵中标为“需要同 baseline 采样”，不得先挂空壳。
- inventory 不能证明 runtime 正确。第一轮实现后必须继续按 `trace-runtime-conformance.md` 生成可执行行为契约、运行 no-send Node audit 并完成 P0/P1 深度 diff。
- `implemented-first-pass` 不是人工状态；只有实现文件存在、runtime 实际加载且 Trace-runtime audit 通过后才能使用。

## 必须产物

进入第一版 `env` / `node-runtime` / signer probe 前，必须生成并写入：

```text
case/notes/trace-api-inventory.json
case/notes/env-coverage-matrix.md
case/notes/missing-env-priority.md
case/notes/trace-runtime-contract.json
case/tmp/node-trace-runtime-audit.json
case/notes/trace-runtime-diff.md
```

`trace-api-inventory.json` 至少包含：

```json
{
  "schemaVersion": "trace-api-coverage/v1",
  "source": "RuyiTrace NDJSON / Node trace / Hook",
  "baselineId": "fp-example-001",
  "apis": [
    {
      "api": "navigator.userAgent",
      "category": "navigator",
      "priority": "P0",
      "accessTypes": ["get"],
      "count": 12,
      "evidence": ["stack.file:line:col"],
      "traceStatus": "complete",
      "implementationStatus": "planned-first-pass",
      "implementationFile": "result/src/node-runtime/env/browser-objects/navigator.js",
      "samplingRequired": false,
      "reason": "Trace 命中，基础 navigator 字段必须首轮实现"
    }
  ]
}
```

`env-coverage-matrix.md` 至少包含：

- Trace 来源、日志覆盖范围、`baselineId`、是否存在 profile / baseline 冲突。
- P0/P1/P2 分类规则。
- 每个 Trace 命中 API 的处理状态。
- 首轮必须实现清单。
- 需要同 baseline 采样后实现清单。
- 暂不挂载清单及原因。
- native 能力缺口清单。
- 计划外新增 WebAPI 记录方式。

## API 状态枚举

每个 Trace 命中的 API 必须选择一个状态：

| 状态 | 含义 | 是否允许进入第一版 env |
|---|---|---|
| `planned-first-pass` | Trace 已命中，首轮必须实现 | 允许，但必须在第一版 env 实现后再 probe |
| `implemented-first-pass` | 已在第一版 env 中实现 | 允许 |
| `needs-baseline-sampling` | 需要同一 `baselineId` 下采样真实值或行为 | 允许作为阻塞采样项，不允许挂空壳 |
| `deferred-not-mounted` | 暂不挂载，且有明确证据说明目标路径不需要或挂载会扰动 writer | 允许，但必须写原因 |
| `native-capability-gap` | 纯 JS / addon / xbs 当前能力都无法可靠表达 | 阻塞，进入 native 能力缺口闭环 |
| `unplanned` | 未规划 | 不允许进入补环境实现 |
| `live-discovered` | Trace 未覆盖，后续 live probe 新分支发现 | 允许后续新增，但必须说明为什么 Trace 未覆盖 |
| `missed-from-trace` | Trace 已命中但前置矩阵遗漏 | 流程缺陷；必须修正矩阵并记录防回退 |

## 优先级规则

P0：影响 JS 能否执行、writer 是否可达、Cookie / Storage / XHR / fetch / sendBeacon / window / document / location / navigator 基础字段 / Function.toString / Node 泄露阻断的 API。

P1：影响高强度检测分支、指纹结构、DOM / CSSOM / 事件 / performance / time / random / screen / Permissions / Plugins / MimeTypes 的 API。

P2：业务页分支、第三方脚本、低频能力、非当前 writer 路径的 API。

P0/P1 中 Trace 已命中的基础 WebAPI 不允许“先不补，遇错再补”。如果暂不实现，必须是 `needs-baseline-sampling`、`deferred-not-mounted` 或 `native-capability-gap`，并写清证据。

进入 signer probe、真实请求或 final writer 判断前，所有 P0/P1 必须进一步通过：

```bash
node scripts/build_trace_runtime_contract.js --case-dir case --baseline-id <baselineId> --markdown
node scripts/run_trace_runtime_audit.js --case-dir case --entry case/result/final.js --markdown
node scripts/check_trace_runtime_conformance.js --case-dir case --markdown
node scripts/check_trace_api_coverage.js --case-dir case --require-runtime-closure --markdown
```

具体契约字段、audit-only 环境变量和哈希失效规则见 `trace-runtime-conformance.md`。

## 真实值类 API

以下 API 不允许先挂空壳或随机值：

- Canvas：`toDataURL`、`getImageData`、`measureText`
- WebGL / WebGPU：`getParameter`、`readPixels`、adapter / renderer 信息
- Audio：`getChannelData`、OfflineAudioContext 渲染结果
- DOM 几何：`getBoundingClientRect`、`offsetWidth`、`clientWidth`、字体测量
- Speech / voices、Storage estimate、Permissions 状态、Plugins / MimeTypes

处理方式：

1. Trace 已命中但值缺失、截断、baseline 不一致时，矩阵标为 `needs-baseline-sampling`。
2. 在同一 `baselineId` 下采样完整值或短行为。
3. 接入 fixture 回放。
4. 输出 `fingerprintReplayMisses` 或等价 miss 明细。
5. miss 非空时不得声明指纹回放闭环。

## 后续阶段新增 WebAPI 规则

阶段报告中不得再笼统写“本阶段新增 / 修改的 WebAPI”而不解释来源。必须拆成：

1. Trace 计划内首轮实现 / 调整的 WebAPI。
2. 计划外新增 WebAPI 与原因。

如果新增 / 调整涉及 `XMLHttpRequest`、`fetch`、`sendBeacon`，阶段报告还必须记录 XHR/fetch Session Bridge 模式；如果涉及浏览器对象内部状态、属性枚举或 descriptor，阶段报告还必须记录对象形状审计矩阵和 `_` / `__` 私有状态泄露检查结果。

计划外新增只能属于以下原因之一：

- `trace-not-covered`：原 Trace 没覆盖该动态分支。
- `dynamic-resource-new-branch`：运行时刷新到新的动态 JS / chunk / challenge 分支。
- `baseline-mismatch`：Trace profile 与 fixed baseline 不一致，需重新采样后实现。
- `trace-truncated`：Trace 字段疑似 4000 / 4096 截断，需补采。
- `native-gap`：前置矩阵已标记为 native 能力缺口。
- `missed-from-trace`：Trace 已命中但矩阵遗漏。该项必须标为流程缺陷，补写矩阵和代码变更记忆后才能继续。

如果计划外新增 WebAPI 的真实原因是 `missed-from-trace`，不得把它写成普通能力增量。

## 检查命令

存在 Trace 的 case 在进入 signer probe 前和交付前都应运行：

```bash
node scripts/check_trace_api_coverage.js --case-dir case --markdown
node scripts/check_trace_api_coverage.js --case-dir case --require-stage-audit --require-runtime-closure --json
```

检查失败时，下一阶段只能修复 Trace 覆盖矩阵或补齐首轮实现，不能继续新增 signer、发送请求或宣称阶段验证通过。
