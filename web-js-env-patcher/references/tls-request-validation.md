# 最终请求验证与 TLS 指纹兼容

当新 case 需要最终发送真实请求、交付 `final.js` / `final.py`，或用户提到 CycleTLS、impers、curl-cffi-node、curl_cffi、cffi_curl、cyCronet 时读取本文件。TLS 指纹兼容客户端的选择应从前置阶段开始确认，不要等普通 `fetch` / `requests` 失败后才临时切换；最终请求一律使用 Session 模式。

## 使用边界

- 只用于用户授权范围内的网页端 JS 补环境结果验证。
- 只做低频、最小化请求，优先复现用户已提供的成功 cURL / HAR。
- TLS 指纹兼容只解决普通 HTTP 客户端与浏览器在 TLS ClientHello、ALPN、HTTP/2、JA3/JA4、Cronet / curl-impersonate 网络栈上的差异；不能替代登录态、验证码、一次性 token、设备校验或业务授权。
- 最终真实请求必须写入一体化 `final.js` 或 `final.py`，由 Node.js / Python TLS 指纹兼容 Session 客户端直接发起；不得生成加密参数后再使用 ruyiPage、Playwright、Puppeteer、Selenium、CloakBrowser 或其他浏览器自动化验证。

## 前置阶段必须选择客户端

在信息完整性检查和任务确认时，加入以下字段：

```markdown
- 最终请求 TLS 指纹兼容客户端：Node.js CycleTLS / Node.js impers / Node.js curl-cffi / curl-cffi-node / Python curl_cffi / Python cffi_curl / Python cyCronet / 不发真实请求
- 最终请求 Session 模式：一律启用 / 不发真实请求
- 是否已安装：是 / 否 / 待检测
- 若未安装：安装该客户端 / 改选其他客户端 / 不发真实请求
```

选择后立即检测：

```bash
node scripts/check_tls_clients.js --markdown
node scripts/check_tls_clients.js --python python --markdown
```

如果用户选择的库未安装，不要默认退回普通 `fetch` / `requests` 发真实请求。应让用户确认安装、改选其他已安装客户端，或选择“不发真实请求，只输出本地 sign / 参数”。

## 工具选择

| 运行环境 | 可选工具 | 适用场景 |
|---|---|---|
| Node.js | CycleTLS / cycletls / @luminati-io/cycletls | 需要在 Node.js `final.js` 中指定 JA3 / User-Agent / Header 并发起少量验证请求 |
| Node.js | impers | Node.js curl-impersonate 路线；需要浏览器 TLS / JA3 / HTTP2/HTTP3 指纹时优先考虑 |
| Node.js | curl-cffi-node / curl-cffi | Node.js 侧 curl_cffi / curl-impersonate 路线；需要用 Node.js 维持 session 与 Cookie jar 时可选 |
| Python | curl_cffi / cffi_curl | Python curl-impersonate 路线；常用于 Chrome / Firefox / Safari impersonate |
| Python | cyCronet / cycronet | Python Cronet-Cloak / Chromium 网络栈路线；适合需要 Chrome 系网络栈特征时 |
| 不发真实请求 | 无 | 只交付本地参数生成结果，不进行最终接口验证 |

注意：不同机器安装包名、导入名、版本和 API 可能不同。先运行检测脚本，不要在 Skill 中硬编码本机路径或版本。库 API 变动时，以本机安装版本的 README / 官方文档为准。

## 安装提示

只在用户确认后安装；不要在未确认时自动安装依赖。

```bash
# Node.js
npm install cycletls
npm install @luminati-io/cycletls
npm install impers
npm install curl-cffi

# Python
python -m pip install curl_cffi
python -m pip install cffi_curl
python -m pip install cycronet
```

## 高强度网络指纹一致性

高强度检测中，TLS 指纹兼容不是单独开关，而是要与浏览器取证 baseline 一起看。最终请求前必须核对：

- TLS / JA3 / JA4、ALPN、HTTP/2 / HTTP/3 能力与所选 impersonate 浏览器族一致。
- `User-Agent` 与 `navigator.userAgent` 一致。
- `sec-ch-ua`、`sec-ch-ua-platform`、`sec-ch-ua-mobile` 与 `navigator.userAgentData` 一致；取证浏览器是 Firefox 时不要伪造 Chrome Client Hints。
- `Accept-Language` 与 `navigator.language/languages` 一致。
- `Accept-Encoding`、Header 顺序、HTTP/2 pseudo-header 顺序、`sec-fetch-*`、`Referer`、`Origin` 与 HAR / 浏览器请求链一致。
- 代理 / IP / 地区、timezone、locale、WebRTC 策略与 fingerprint baseline 一致。
- Cookie jar 和 Storage 状态来自同一 session 链路，不复制旧 cURL 中已过期的风控状态。

如果以上任一项冲突，先修正请求链和 fixture，不要把失败直接归因于 JS 补环境。

## Session 模式硬规则

最终请求不再区分单请求或请求链。只要用户选择发送真实请求或交付可请求的 `final.js` / `final.py`，必须读取 `session-request-chain.md` 并满足：

1. 创建 session client，不使用无状态单次请求。
2. 动态资源刷新、Cookie / challenge 生成、加密参数生成前后请求和目标 API 都走同一 session。
3. 同一 session 复用 Cookie jar、UA、Client Hints、Accept-Language、Referer、Origin、Header 顺序、代理、TLS 指纹和 fingerprint baseline。
4. 成功、失败或异常退出后，在 `finally` 中调用 `close()` / `exit()` / `dispose()`，并清理 Cookie jar、敏感 header、token 和临时响应。
5. 最终总结记录 session client 类型、请求链、Cookie jar 来源、销毁方式和敏感状态清理结果。

## Node.js CycleTLS 模板

CycleTLS 的包名和导出在不同版本中可能不同，先用 `check_tls_clients.js` 确认。最终项目中建议封装成 `result/src/request/client.js`，只由 `result/final.js` 调用。

```javascript
'use strict';

async function createCycleTLSSession({ ja3, userAgent, headers = {} }) {
  const initCycleTLS = require('cycletls');
  const cycleTLS = await initCycleTLS();
  const cookieJar = new Map();

  async function request({ url, method = 'GET', headers: extraHeaders = {}, body }) {
    const response = await cycleTLS(url, {
      method,
      headers: { ...headers, ...extraHeaders },
      body,
      ja3,
      userAgent,
    }, method.toUpperCase());
    // 中文说明：这里按项目需要解析 Set-Cookie 并写回 cookieJar，后续请求复用。
    return { status: response.status, headers: response.headers, body: response.body };
  }

  async function close() {
    cookieJar.clear();
    if (typeof cycleTLS.exit === 'function') cycleTLS.exit();
  }

  return { request, close, cookieJar };
}

module.exports = { createCycleTLSSession };
```

## Node.js impers 模板

`impers` 是 Node.js curl-impersonate 路线，官方说明它处于 alpha 状态，API 可能变化。使用时优先按本机安装版本确认导出。常见用法是指定 `impersonate`，例如 `chrome`。

```javascript
// ESM 示例；若最终项目使用 CommonJS，可把请求客户端单独写成 .mjs 或动态 import。
import * as impers from 'impers';

export async function sendRequestWithImpers({ url, method = 'GET', headers = {}, body, impersonate = 'chrome' }) {
  const fn = method.toLowerCase();
  if (typeof impers[fn] === 'function' && !body) {
    return await impers[fn](url, { headers, impersonate });
  }
  return await impers.request({ url, method, headers, body, impersonate });
}
```

## Python curl_cffi 模板

```python
from curl_cffi import requests


def create_curl_cffi_session(headers=None, impersonate="chrome"):
    session = requests.Session(impersonate=impersonate)
    session.headers.update(headers or {})
    return session


def send_request_with_curl_cffi(session, url, method="GET", data=None, json_data=None, headers=None):
    resp = session.request(
        method=method,
        url=url,
        headers=headers or {},
        data=data,
        json=json_data,
        timeout=30,
    )
    return {"status": resp.status_code, "headers": dict(resp.headers), "text": resp.text}


def close_curl_cffi_session(session):
    try:
        session.cookies.clear()
    finally:
        session.close()
```

## Python cffi_curl / cyCronet 模板

`cffi_curl` 与 `cyCronet` / `cycronet` 的 API 版本差异较大，Skill 不应硬编码某个本机版本。使用方式：

1. 先运行 `check_tls_clients.js --python python --json` 确认导入名。
2. 在 `result/src/request_client.py` 封装一个统一函数 `send_request(...)`。
3. 只在封装内部处理库差异；`final.py` 不直接散落库调用。
4. 若当前包 API 与模板不一致，以本机包文档为准，并在 `notes/final-request-validation.md` 记录使用版本和参数。

伪代码：

```python
def send_request(url, method="GET", headers=None, body=None):
    # 这里根据用户已确认且本机已安装的 cffi_curl / cyCronet API 实现。
    # 必须返回 status、headers、text/body。
    raise NotImplementedError("请根据本机 cffi_curl / cyCronet 版本补齐请求客户端封装")
```

## 最终验证流程

1. 前置阶段确认最终请求客户端和是否已安装。
2. 确认 fixtures 已通过，Node.js 生成参数与浏览器样本一致。
3. 读取用户提供的成功 cURL / HAR，不凭空构造请求。
4. 脱敏保存请求样本；真实 Cookie / token 只保存在本地，不写入最终报告。
5. 使用已确认的 CycleTLS / impers / curl-cffi-node / curl_cffi / cffi_curl / cyCronet 创建 session client，并在同一 session 中仅发起少量验证请求；若用户选择“不发真实请求”，则只输出本地 sign / 参数。
6. 对比：
   - HTTP 状态码。
   - 响应 JSON 中关键字段。
   - 服务端是否接受新生成的加密参数。
   - 是否出现风控 / 验证码 / 登录失效。
7. 写入 `notes/final-request-validation.md`。
8. 在 `finally` 中销毁 session，清理 Cookie jar、临时响应、日志和敏感请求副本。
9. 将最终请求逻辑整合进 `result/final.js` 或 `result/final.py`，并运行 `check_final_artifact.js` 确认不包含浏览器自动化代码和多余产物。

## 输出模板

```markdown
## 最终请求验证

- 是否执行真实请求：是 / 否
- 用户授权：是 / 否
- 前置阶段已选客户端：Node.js CycleTLS / Node.js impers / Node.js curl-cffi / curl-cffi-node / Python curl_cffi / Python cffi_curl / Python cyCronet / 不发真实请求
- 客户端安装状态：已安装 / 未安装改选 / 未安装不发请求
- Session 模式：已创建 session / 不发真实请求
- 请求链是否复用同一 session：是 / 否，原因：
- Session 销毁方式：close / exit / dispose / Cookie jar 清理 / 不适用
- 最终项目入口：final.js / final.py
- 是否包含浏览器自动化代码：否
- 请求来源：cURL / HAR / 用户样本
- TLS 指纹兼容原因：用户前置选择 / 目标接口要求浏览器网络栈一致 / 未启用
- 请求次数：
- 状态码：
- 目标加密参数是否被接受：
- 响应关键字段：
- 是否触发验证码 / 风控：
- 敏感材料处理：已脱敏 / 仅本地保存 / 已清理
```

## 排查提示

如果 TLS 指纹兼容客户端仍失败，优先排查：

- Cookie / Authorization 是否过期。
- Header 顺序、大小写、HTTP/2 伪头、Content-Length 是否与样本一致。
- Body 是否保持原始字符串，未被 JSON 重新序列化。
- Query 编码、排序、空值、数组序列化是否一致。
- 时间戳、nonce、随机数、server seed 是否过期。
- IP / 代理 / 地域 / 账号风控是否变化。
- 目标接口是否绑定浏览器会话、Service Worker、一次性 token 或挑战结果。
