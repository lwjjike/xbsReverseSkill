# WASM / Worker / postMessage 处理

本文件用于网页端 JS 补环境中遇到 Worker、WASM、iframe 或 postMessage 的情况。范围仍然限定在网页端 JS 运行链路，不扩展到 Native 逆向。

## 判断信号

- 目标 JS 调用 `new Worker()`、`SharedWorker()`。
- 入口函数返回 Promise，实际签名在异步消息中完成。
- trace 出现 `postMessage`、`onmessage`、`MessageChannel`。
- Network 中额外加载 `.wasm` 或 worker chunk。
- 加密入口只负责封装消息，真正结果从回调返回。

## 处理顺序

1. 记录主线程调用 `postMessage` 的消息体。
2. 收集 Worker JS、动态 chunk、WASM 文件和初始化参数。
3. 确认 Worker 返回消息格式：成功、失败、初始化完成、签名结果。
4. 如果只是消息转发，优先在 Node 中模拟消息通道，不要直接改算法。
5. 如果 WASM 参与网页签名，只记录 JS 调用边界和导出函数名；不要扩大到 Native 工具链。
6. 读取 `webapi-env-detection-matrix.md`，把 Worker / iframe / postMessage 放入 WebAPI 环境检测矩阵；不只验证 API 存在，还要验证浏览器行为。
7. 用 fixtures 验证异步结果，不以 Promise resolved 为完成。

## Worker / postMessage 必查行为

- Worker scope 必须有独立 `performance`、`timeOrigin`、`performance.now()` 序列；不得无证据复用主线程 performance。
- Worker scope 的 `setTimeout` / `clearTimeout` 必须绑定 Worker 私有状态；`Worker.prototype.terminate()` 后 pending timer 和延迟 `postMessage` 必须清理或丢弃。
- `WorkerGlobalScope.self.postMessage()` 与 `MessagePort.prototype.postMessage()` 必须以后续 task 派发；不得同步触发对端 listener。
- `addEventListener` / `removeEventListener` / `dispatchEvent` 必须覆盖 listener object、capture、once、passive、stopImmediatePropagation 和 `handleEvent`。
- `MessagePort.prototype.postMessage(fn)`、`structuredClone(fn)` 的 `DataCloneError` name / message / stack 不能暴露 JS fallback 源码。
- iframe 参与消息链时，单独检查 `contentWindow`、`contentDocument`、`defaultView`、`srcdoc`、`document.write/close`、Window/IframeWindow ownKeys / ownNames。
- 如果真实浏览器进入 final writer，而 Node 停在 continuation / reload writer，必须把 Worker / performance / iframe / postMessage 时序列入 writer 分支 diff。

## 记录模板

```markdown
## Worker/WASM 消息链

- 主线程文件：
- Worker 文件：
- WASM 文件：
- 初始化消息：
- 签名请求消息：
- 签名响应消息：
- 依赖的浏览器环境：
- Node 模拟策略：真实 Worker / vm 模拟 / 手动封装消息通道
- 任务队列语义：同步 / 后续 task / microtask / timer
- Worker performance baseline：
- terminate 后 timer / postMessage 行为：
- iframe realm / ownKeys 状态：
- WebAPI 环境检测矩阵：
- 阻塞点：
```
