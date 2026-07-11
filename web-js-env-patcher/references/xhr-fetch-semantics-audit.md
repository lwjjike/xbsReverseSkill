# XHR/fetch 请求语义与生命周期审计

本文件用于解决“XHR/fetch 已桥接同一 TLS Session，但请求头、body、请求来源、失败语义、responseURL、事件顺序或 reload 生命周期仍错误”的问题。Session Bridge 只证明请求由哪个客户端发送；本审计证明发送的请求和浏览器行为是否正确。

## 核心原则

- 真实请求前必须先执行 `no-send` 审计：Node bridge 记录完整待发送请求，但不得访问目标网络。
- 浏览器成功样本与 Node no-send 结果必须生成可比较的 network transcript。
- document navigation、reload、image、script、XHR、fetch、sendBeacon 必须有明确 actor，禁止根据 URL 猜请求类型。
- 请求和响应的 `matched` 必须由 `check_xhr_fetch_semantics.js` 计算，不能手工填写。
- Header 名称、顺序、重复字段和 body 原始字节属于请求语义，不得只比较对象键值。

## 强制产物

```text
case/fixtures/browser-network-transcript.ndjson
case/tmp/node-network-transcript.ndjson
case/tmp/xhr-fetch-semantics-audit.json
case/notes/xhr-fetch-semantics-diff.md
```

两份 transcript 都必须记录 `baselineId`。Node transcript 还必须记录：

```json
{
  "type": "meta",
  "schemaVersion": "network-transcript/v2",
  "generatedBy": "runtime-network-recorder/v2",
  "baselineId": "fp-001",
  "mode": "no-send",
  "runtimeSourceHash": "...",
  "sessionId": "session-1"
}
```

## 每个请求必须记录

- correlation id / pair key。
- actor：`xhr` / `fetch` / `sendBeacon` / `document-navigation` / `reload` / `image` / `script` / 其他。
- realm id、navigation epoch、task id。
- method、完整 URL、query。
- 有序 Header 数组，保留重复字段。
- credentials、referrer、origin、Cookie 处理策略。
- body 类型、编码、原始 byte length、SHA256。
- Content-Type 和 multipart boundary。
- redirect、cache、timeout、abort 信息。
- session id。

浏览器与 Node 的原始 request id 可以不同，但必须在规范化阶段生成相同 `pairKey`。推荐使用“writer phase + actor + realm role + navigation epoch + 该 actor 第 N 次请求”，不得只用 URL 配对，因为同一 URL 可能同时用于 document navigation、reload 和 XHR。

## 每个响应必须记录

- status、statusText、responseURL。
- 响应头有序列表和脚本可见头列表。
- body byte length、SHA256、responseType。
- Set-Cookie 是否写入同一 session Cookie jar。
- readyState、readystatechange、load、error、abort、timeout、loadend 顺序。
- Promise resolve/reject 与 microtask/task 顺序。
- PerformanceResourceTiming 可见时机。

## 硬性浏览器语义

- 网络错误、CORS 拒绝、abort 等 `status=0` 场景，`responseURL` 必须为空，除非同 baseline 浏览器证据明确相反。
- completion 层不得用 request URL 为失败 XHR 回填 `responseURL`。
- document navigation/reload 不得进入 XHR completion。
- 首次 navigation 与 reload 必须创建各自正确的 document/realm 生命周期。
- reload 或 navigation commit 后，旧 realm 的 pending timer、XHR、fetch、MessagePort task 和 observer callback 必须取消或丢弃。
- 真实浏览器没有发出的 XHR/fetch，Node 不得多发；多余事件直接阻断。
- `getResponseHeader("set-cookie")`、Response Headers 的 Set-Cookie 可见性必须以目标浏览器 baseline 为准。

## body 类型矩阵

目标路径涉及时至少覆盖：

- `null` / `undefined`。
- string。
- `URLSearchParams`。
- `FormData` 与 multipart boundary。
- Blob。
- ArrayBuffer / TypedArray。
- Document。
- JSON string。

必须比较发送前 body byte length 和 SHA256，不能只比较序列化后的调试文本。

## Header 矩阵

必须检查：

- `setRequestHeader()` 的 trim、合并和重复行为。
- Header 名称大小写与发送顺序。
- 自动 Content-Type。
- Cookie、Origin、Referer、Accept、Accept-Language、Client Hints 等由哪一层生成。
- 禁止脚本设置的 Header 是否被正确过滤。
- curl/HAR 与当前浏览器 baseline 冲突时，以当前 baseline 为准。

## 检查命令

```bash
node scripts/check_xhr_fetch_semantics.js --case-dir case --require --require-no-send --out case/tmp/xhr-fetch-semantics-audit.json --markdown
node scripts/check_xhr_fetch_session_bridge.js --case-dir case --require-live --tls-client curl_cffi --markdown
node scripts/check_environment_closure.js --case-dir case --before-real-request --require-live --tls-client curl_cffi --markdown
```

只有 no-send 语义审计和 session bridge 运行时审计同时通过，才允许少量授权真实请求。不得等用户提出“比较请求头和请求体”后才执行本流程。
