# XHR/fetch Live Session Bridge

本文件用于约束 Node.js 补环境中的 `XMLHttpRequest`、`fetch`、`Request`、`Response`、`Headers` 与 `navigator.sendBeacon`。当最终项目会发送真实请求，或这些 API 影响动态资源、Cookie、challenge、telemetry、resource timing、writer 分支时，JS 侧网络 API 必须复用最终确认的 TLS 指纹兼容 Session。

## 硬性规则

- `offline-fixture` 只能用于离线诊断：可以返回 fixture / 默认响应，但必须明确标注“不发送真实网络请求”，不得宣称 TLS 指纹问题已解决。
- `live-session-bridge` 用于真实验证：JS `XMLHttpRequest` / `fetch` / `sendBeacon` 必须把请求交给同一个 CycleTLS / impers / curl-cffi-node / curl_cffi / cffi_curl / cyCronet Session 发送。
- 不得在补环境网络对象内部直接调用 Node 宿主 `fetch`、`http`、`https`、`axios`、`undici` 或 Python 普通 `requests` 绕过已确认 TLS 客户端。
- 如果最终用户选择 Python `curl_cffi`，`final.py` 必须持有唯一 `curl_cffi.requests.Session()`；Node JS runtime 通过 stdio / IPC / 嵌入式 bridge 请求 Python 发送，Node 侧只实现浏览器 API 语义与桥接协议。
- Bridge 只能作为唯一 `final.js` / `final.py` 入口内部的受控模块存在，不得交付另一个手动启动入口、临时 HTTP server、调试 bridge 或常驻本地服务。
- XHR/fetch 对象本身不得通过 `_` / `__` 自有属性保存状态；状态用 addon / xbs private API 或模块级 `WeakMap`。
- Session Bridge 只证明“由哪个客户端发送”，不能证明请求语义正确。真实请求前必须继续按 `xhr-fetch-semantics-audit.md` 比较浏览器与 Node 的 no-send network transcript。
- 代码里出现 `curl_cffi`、`IPC`、`sessionBridge` 等关键词不算验收证据；必须有运行时 `xhr-fetch-bridge-audit.json` 和机器生成的 `xhr-fetch-semantics-audit.json`。

## 推荐架构

```text
目标 JS XMLHttpRequest/fetch
  -> src/env/network/xhr.js / fetch.js 浏览器语义层
  -> session bridge adapter
  -> final.js/final.py 持有的同一 TLS Session
  -> 目标网络请求
  -> response envelope
  -> JS XHR readyState / fetch Response / resource timing / Cookie 同步
```

Python `curl_cffi` 场景：

```text
final.py
  create curl_cffi.requests.Session()
  spawn Node runtime child process
  read NDJSON bridge request from child stdout / pipe
  session.request(...)
  write NDJSON bridge response back to child stdin / pipe
  finally session.close()
```

Node 侧不得自行发目标 URL 请求；只发 bridge envelope。Python 侧不得创建第二个 Session 给 XHR/fetch，必须复用最终请求同一个 session。

## Bridge 请求 envelope

至少记录：

```json
{
  "id": "bridge-req-1",
  "api": "XMLHttpRequest.send",
  "method": "POST",
  "url": "https://example.com/api",
  "headers": {},
  "bodyEncoding": "utf8/base64/bytes/none",
  "body": "",
  "credentials": "include/same-origin/omit",
  "referrer": "",
  "mode": "cors/same-origin/no-cors",
  "timeoutMs": 30000,
  "baselineId": "fp-001"
}
```

Bridge response 至少记录：

```json
{
  "id": "bridge-req-1",
  "ok": true,
  "status": 200,
  "statusText": "OK",
  "headers": {},
  "bodyEncoding": "utf8/base64/bytes",
  "body": "",
  "timing": {},
  "setCookieApplied": true
}
```

## 浏览器语义同步

- `XMLHttpRequest.open()`、`setRequestHeader()`、`send()`、`abort()`、`timeout`、`responseType`、`readyState`、`status`、`responseText`、`responseURL`、`getResponseHeader()`、`getAllResponseHeaders()` 按目标浏览器采样实现。
- `fetch()` 返回 `Promise<Response>`，`Headers`、`Request`、`Response.clone()`、`text()`、`json()`、`arrayBuffer()`、body used 状态应可审计。
- `Set-Cookie` 由 session client 写回 Cookie jar，并同步到 JS cookie store；`xhr.getResponseHeader("set-cookie")` 和 `fetch Response.headers.get("set-cookie")` 默认应为 `null`，除非目标浏览器 baseline 证明可见。
- `document.cookie` 写入必须进入同一 Cookie jar 或在 bridge 请求前合并；服务端 `Set-Cookie` 必须更新同一 jar 和 JS cookie store。
- resource timing 如果被目标检测，必须在 `PerformanceResourceTiming` 中记录与真实浏览器 baseline 一致的最小字段和可见时机。
- CORS、redirect、referrer、credentials、cache、keepalive、sendBeacon 是否完整实现取决于目标路径；未覆盖时在矩阵中标 `needs-browser-baseline` 或 `native-capability-gap`，不得静默 mock。

## 必须产物

真实请求场景至少生成：

```text
case/notes/xhr-fetch-session-bridge.md
case/tmp/xhr-fetch-bridge-audit.json
case/fixtures/browser-network-transcript.ndjson
case/tmp/node-network-transcript.ndjson
case/tmp/xhr-fetch-semantics-audit.json
```

`xhr-fetch-session-bridge.md` 记录：

- 网络模式：`offline-fixture` / `live-session-bridge` / 不涉及。
- 最终 TLS Session 客户端：CycleTLS / impers / curl-cffi-node / curl_cffi / cffi_curl / cyCronet。
- Session 持有者：`final.js` / `final.py`。
- JS bridge 文件：例如 `result/src/env/network/xhr.js`、`result/src/env/network/fetch.js`。
- 请求层文件：例如 `result/src/request/client.js` 或 `result/src/request/session_client.py`。
- Cookie / Set-Cookie 同步策略。
- readyState / Promise / event 顺序验证。
- resource timing 是否涉及。
- 离线 fixture 是否仅用于诊断。
- Session id、运行时 bridge round trip 数、`sameSessionVerified`、`runtimeSourceHash`。
- no-send 请求语义审计结果：请求来源、Header 顺序、body SHA256、status/responseURL、事件顺序、reload realm 清理。

`xhr-fetch-bridge-audit.json` 必须由运行时 bridge 在至少一次受控 round trip 后写出：

```json
{
  "schemaVersion": "xhr-fetch-session-bridge-audit/v2",
  "generatedBy": "runtime-session-bridge/v2",
  "mode": "live-session-bridge",
  "tlsClient": "curl_cffi",
  "sessionOwner": "final.py",
  "sessionId": "session-1",
  "transportRoundTrips": 1,
  "sameSessionVerified": true,
  "runtimeSourceHash": "...",
  "cookieSyncVerified": true
}
```

不得在没有实际 bridge round trip 时生成该文件。Node no-send transcript 和最终请求 session 必须记录同一 session identity 或可验证的 session lineage。

## 检查命令

```bash
node scripts/check_xhr_fetch_session_bridge.js --case-dir case --markdown
node scripts/check_xhr_fetch_session_bridge.js --case-dir case --require-live --json
node scripts/check_xhr_fetch_session_bridge.js --case-dir case --tls-client curl_cffi --require-live --markdown
node scripts/check_xhr_fetch_semantics.js --case-dir case --require --require-no-send --out case/tmp/xhr-fetch-semantics-audit.json --markdown
```

检查失败时，下一步只能补 live session bridge、补 Cookie 同步、修正 XHR/fetch 浏览器语义、改为明确不发真实请求，或记录用户豁免。不得继续真实请求验证或写“TLS 指纹已解决”。
