# 最终请求 Session 模式规则

本文件在每个需要发送真实请求、交付 `final.js` / `final.py`、实现动态资源刷新、Cookie / challenge 生成链路或最终请求验证时读取。最终请求不再区分单请求或请求链：只要进入最终验证或交付入口，必须使用 Session 模式。

## 硬性规则

- 最终请求一律使用 Session 模式；即使当前看起来只有一个目标 API，也必须创建 session client。
- 前置请求、动态 HTML / JS / challenge 刷新、Cookie / token / 设备参数生成链路、加密参数生成前后的请求、目标 API 请求必须复用同一 session。
- 同一 session 内保持一致的 Cookie jar、UA、Client Hints、Accept-Language、Referer、Origin、Header 顺序、代理 / IP、TLS 指纹客户端和指纹基线。
- 不得在最终入口中用无状态 `fetch`、`axios`、`requests.request` 或临时单次客户端直接发送真实请求。
- 请求成功、失败或异常退出后都必须销毁 session，关闭底层客户端，并清理 Cookie jar、敏感 header、token、临时响应和运行态缓存。
- 如果用户选择“不发真实请求”，可以不创建真实网络 session，但最终入口仍应明确输出“未发请求”，不得伪造 session 验证成功。

## Node.js 实现要求

`result/src/request/client.js` 应封装 session client，而不是只导出单次 `sendRequest`。建议形态：

```javascript
'use strict';

async function createRequestSession(options) {
  // 中文说明：这里封装已确认的 TLS 指纹兼容客户端，并维护同一 Cookie jar。
  const state = {
    cookieJar: new Map(),
    headers: { ...(options.headers || {}) },
    closed: false,
  };

  async function request(input) {
    if (state.closed) throw new Error('Session 已销毁，不能继续发送请求');
    // 这里调用 CycleTLS / impers / curl-cffi-node 等已确认客户端。
    // 请求前合并 Cookie jar，请求后解析 Set-Cookie 写回同一 jar。
    throw new Error('请按已确认客户端补齐请求实现');
  }

  async function close() {
    state.closed = true;
    state.cookieJar.clear();
    // 如果底层客户端有 exit / close / dispose，这里必须调用。
  }

  return { request, close, state };
}

module.exports = { createRequestSession };
```

注意：CycleTLS / impers / curl-cffi-node 等不同版本的 API 差异较大。实际实现以本机安装版本为准，但必须保留统一 session 封装、Cookie jar 回写和 `close()`。

## Python 实现要求

Python 项目优先使用 `curl_cffi.requests.Session()` 或所选 cffi_curl / cyCronet 的 session / client 形态。建议形态：

```python
from curl_cffi import requests


def create_request_session(headers=None, impersonate="chrome"):
    # 中文说明：所有请求复用同一个 Session，保证 Cookie、TLS 指纹和 Header 状态一致。
    session = requests.Session(impersonate=impersonate)
    session.headers.update(headers or {})
    return session


def close_request_session(session):
    try:
        session.cookies.clear()
    finally:
        session.close()
```

如 cffi_curl / cyCronet 当前版本没有现成 Session，需要在 `src/request_client.py` 自行维护 Cookie jar 和底层连接生命周期，并提供 `close_request_session(...)`。

## 高强度入口页与请求顺序

如果目标存在 403 / 429 / challenge / bot block / verify / captcha / 风控页、动态 JS、首访 Cookie、检测脚本或 API 依赖入口页状态，最终请求链不能只包含目标 API。必须在同一 session 中记录和必要时复现：

1. 入口 HTML 请求及其响应状态、Set-Cookie、Cache-Control、body hash、动态 seed / nonce。
2. 关键 JS / challenge / telemetry / fingerprint 资源请求，及其是否需要运行时刷新。
3. Cookie / localStorage / sessionStorage / IndexedDB / device token 的生成或刷新点。
4. 业务前置接口与目标 API 的 Referer / Origin / Sec-Fetch 关系。
5. 请求顺序和必要的时间间隔；不要把浏览器中的多步链路压成无状态单请求。
6. 失败时记录是否返回风控页、Cookie 过期、请求链缺失、TLS / Header 不一致，还是目标 JS 参数错误。

最终项目仍不得包含浏览器自动化代码；入口页和动态资源刷新必须由已确认的 Node.js / Python TLS 指纹兼容 Session 客户端完成，或用户明确选择只输出本地参数。

## final 入口顺序

`final.js` / `final.py` 必须采用以下顺序：

1. 读取本地配置和脱敏请求样本。
2. 创建 session client。
3. 在同一 session 中刷新动态资源 / challenge / seed。
4. 在同一 session 状态下调用补环境后的目标 JS 入口生成加密参数。
5. 在同一 session 中发送目标 API 请求。
6. 输出脱敏结果和业务成功判断。
7. `finally` 中销毁 session 并清理敏感运行态。

## 输出记录

阶段报告、`notes/final-request-validation.md` 和最终总结至少记录：

- Session client 类型：CycleTLS / impers / curl-cffi-node / curl_cffi / cffi_curl / cyCronet / 不发真实请求。
- 请求链：动态资源刷新、Cookie / challenge 生成、目标 API 请求是否在同一 session。
- Cookie jar 来源、更新点和是否已脱敏。
- 是否复用同一 UA / Client Hints / locale / timezone / proxy / 指纹基线。
- session 销毁方式：`close()` / `exit()` / `dispose()` / Cookie jar 清理。
- 成功或失败后是否存在敏感状态残留。
