# Trace-runtime 可执行一致性闭环

本文件用于解决“Trace 已命中并进入 inventory，但当前 runtime 仍存在大量未补、错误返回、错误原型或错误分支”的问题。Trace inventory 只说明 API 被发现；只有本文件定义的行为契约、Node audit 和深度 diff 全部通过，才能说明环境闭环。

## 硬性原则

- Trace 必须转换成机器可验证的 `trace-runtime-contract.json`，不能只生成 API 名称和人工状态。
- `implemented-first-pass` 只有在实现文件存在、runtime 实际加载、audit-only 执行成功且 P0/P1 深度 diff 为零时才成立。
- `matched` 必须由 `check_trace_runtime_conformance.js` 计算，不得由 Markdown 或手写 JSON 自行声明。
- 每次修改 `result/`、刷新动态 JS、切换 baseline 或重新采集 Trace 后，旧 audit 立即失效；必须重新计算 `traceSourceHash`、`contractHash` 和 `runtimeSourceHash`。
- Trace-runtime audit 必须在 `no-send` 模式运行。审计阶段禁止访问目标网络，XHR/fetch 只允许记录准备发送的 transcript。
- 在 P0/P1 runtime closure 完成前，不得运行真实请求、不得继续扩大 POST 次数、不得把 writer 未触发归因于流程或 TLS。

## 强制产物

```text
case/notes/trace-runtime-contract.json
case/tmp/node-trace-runtime-audit.json
case/notes/trace-runtime-diff.md
```

`trace-runtime-contract.json` 必须由以下命令从原始 Trace 生成：

```bash
node scripts/build_trace_runtime_contract.js --case-dir case --baseline-id <baselineId> --markdown
```

不得手工创建空 contract，也不得只保留 Top 30 API。所有不同的 API、access type、realm、receiver 和 phase 组合都必须进入契约。

## 契约维度

Trace 有证据时必须记录：

- API path、访问类型、receiver、realm、writer/navigation phase。
- owner、descriptor、getter/setter 所在 prototype。
- `Object.prototype.toString` brand、constructor name、`instanceof`。
- `Object.keys`、own names、own symbols、`Reflect.ownKeys`。
- prototype chain，包括 XHR/EventTarget 等中间原型层。
- 参数、返回值、异常和副作用的稳定摘要。
- 调用顺序、stack 证据和 navigation epoch。

缺少真实值时应标记为待同 baseline 采样，而不是用空值或默认值生成匹配契约。

## audit-only 入口

最终入口或专用内部审计模式必须支持：

```text
--audit-only
WEB_JS_ENV_PATCHER_AUDIT_ONLY=1
WEB_JS_ENV_PATCHER_NO_NETWORK=1
WEB_JS_ENV_PATCHER_NETWORK_MODE=no-send
WEB_JS_ENV_PATCHER_TRACE_CONTRACT=<contract path>
WEB_JS_ENV_PATCHER_TRACE_AUDIT_OUT=<audit path>
```

audit-only 模式：

- 必须安装与正常运行完全相同的 env/runtime。
- 必须执行目标初始化和当前 signer/writer 路径，但网络层只记录请求，不发送目标网络。
- 必须把逐项观测写入 `WEB_JS_ENV_PATCHER_TRACE_AUDIT_OUT`。
- 不得额外安装“只在审计时存在”的假 API。
- 不得通过读取 contract 后直接复制 expected 值生成 audit。
- 必须记录真实网络尝试次数；大于零直接失败。

入口写出的原始 observations 至少使用以下结构：

```json
{
  "probeVersion": "case-runtime-audit/v2",
  "networkAttempts": 0,
  "observations": [
    {
      "id": "contract item id",
      "api": "XMLHttpRequest",
      "accessType": "construct",
      "realm": "main",
      "receiver": "Window",
      "phase": "challenge-init",
      "observations": {
        "owner": ["XMLHttpRequest"],
        "brand": ["[object XMLHttpRequest]"],
        "constructorName": ["XMLHttpRequest"],
        "prototypeChain": [["XMLHttpRequest", "XMLHttpRequestEventTarget", "EventTarget", "Object"]],
        "ownKeys": [[]]
      }
    }
  ]
}
```

`id` 应直接使用 contract item id。观测值必须来自当前 runtime 的真实 probe，不得复制 contract 中的 digest；`run_trace_runtime_audit.js` 会统一计算并写入可信元数据。

运行：

```bash
node scripts/run_trace_runtime_audit.js --case-dir case --entry case/result/final.js --markdown
node scripts/check_trace_runtime_conformance.js --case-dir case --markdown
```

Python 入口使用 `case/result/final.py`。

## 阻断条件

- contract 或 Node audit 缺失。
- `contractHash`、`traceSourceHash`、`baselineId` 不一致。
- Node audit 缺少 `runtimeSourceHash` 或 `probeVersion`。
- audit-only 阶段发生真实网络访问。
- 任一 P0/P1 契约缺少 runtime observation。
- owner、descriptor、brand、prototype、ownKeys、返回值、异常或副作用不一致。
- Node 多出 Trace 未记录的宿主 API 观测，且未分类为动态新分支或 Node 泄露。

P2 差异可记录为风险，但涉及当前 writer、请求生成、Cookie、fingerprint 或检测分支时必须提升为 P0/P1。

## 强制循环

```text
原始 Trace
  -> build_trace_runtime_contract
  -> 第一轮 env
  -> run_trace_runtime_audit(no-send)
  -> check_trace_runtime_conformance
  -> 修复差异
  -> 重新 audit
  -> P0/P1 差异清零
  -> XHR/fetch 请求语义审计
  -> 真实请求
```

用户不需要额外提出“把 Trace 和当前环境一一对比”；只要存在 Trace，该循环就是默认流程。
