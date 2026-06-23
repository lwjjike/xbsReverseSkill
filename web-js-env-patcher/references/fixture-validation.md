# fixtures 样本验证指南

当需要判断补环境结果是否可交付时读取本文件。

## 完成标准

补环境完成标准不是“不报错”，而是：

```text
Node.js 中生成的目标加密参数 == 浏览器真实请求中的目标加密参数
```

若目标参数包含时间戳、随机数、服务端 token 或一次性 nonce，应先固定或记录这些依赖，否则不能用单次输出直接判断。

发起最终真实请求前必须先通过 fixtures。若普通 HTTP 客户端疑似因 TLS 指纹、ALPN、HTTP/2 或 JA3/JA4 差异失败，再读取 `tls-request-validation.md`，并让用户确认是否使用 CycleTLS / curl_cffi / cffi_curl / cyCronet 做少量验证请求。

## fixture 文件格式

推荐每个样本保存为独立 JSON：

```json
{
  "name": "sample-001",
  "pageUrl": "https://example.com/search?q=test",
  "apiUrl": "https://example.com/api/search",
  "method": "POST",
  "param": "sign",
  "paramLocation": "Header",
  "browser": {
    "userAgent": "Mozilla/5.0 ...",
    "language": "zh-CN",
    "timezone": "Asia/Shanghai",
    "screen": { "width": 1920, "height": 1080 }
  },
  "request": {
    "query": {},
    "headers": { "content-type": "application/json" },
    "body": { "keyword": "test" },
    "cookies": {}
  },
  "runtime": {
    "now": 1710000000000,
    "performanceNow": 123.456,
    "randomBytes": [1, 2, 3, 4]
  },
  "resources": {
    "capturedAt": "2026-06-23T00:00:00.000Z",
    "htmlSha256": "入口 HTML body hash",
    "jsSha256": "关键 JS / challenge body hash",
    "resourceManifestRef": "case/notes/resource-manifest.json",
    "challengeSeed": "脱敏后的 seed / nonce / config 摘要"
  },
  "entry": "window.makeSign",
  "args": [
    { "keyword": "test" }
  ],
  "expected": {
    "sign": "browser-real-sign-value"
  }
}
```

最少字段：

```json
{
  "entry": "window.makeSign",
  "args": ["/api/demo"],
  "expected": { "sign": "abc123" }
}
```

## 运行与对比

探测运行：

```bash
node scripts/run_with_trace.js \
  --target case/js/original/app.js \
  --entry window.makeSign \
  --fixture case/fixtures/sample-001.json \
  --output case/tmp/node-output.json \
  --trace case/tmp/env-trace.jsonl \
  --summary case/tmp/missing-env.json
```

对比：

```bash
node scripts/compare_fixture.js \
  --fixture case/fixtures/sample-001.json \
  --actual case/tmp/node-output.json \
  --field sign \
  --markdown
```

## 多样本要求

至少建议准备：

| 样本 | 用途 |
|---|---|
| 固定请求重复样本 | 判断随机数 / 时间依赖 |
| Body 改变样本 | 判断请求体是否参与签名 |
| URL 改变样本 | 判断 path / query 是否参与签名 |
| Cookie / token 改变样本 | 判断登录态是否参与签名 |
| 不同 UA / 语言 / 时区样本 | 判断浏览器指纹是否参与签名 |

如果只有一份样本，只能说明“当前样本通过”，不能说明补环境已稳定。

## 动态资源版本记录

如果样本来自动态 HTML、动态 JS、动态 chunk、challenge JS 或 403 / 风控页面，fixture 必须记录资源版本信息：`capturedAt`、入口 `htmlSha256`、关键 `jsSha256`、`resourceManifestRef`、`challengeSeed` 或等价 seed / nonce / config 摘要。

当当前资源 hash 与 fixture 不一致时，不要立即判断补环境失败；先读取 `references/dynamic-resource-freshness.md`，检查资源是否已过期、HTML seed 是否变化、challenge JS 是否更新、Cookie / Set-Cookie 是否刷新，再决定是刷新资源、补采样本还是继续补 WebAPI。旧资源只作为 expected 证据，不得固定到最终 signer。

## 输出报告模板

```markdown
## fixtures 验证结果

- 样本总数：
- 通过数量：
- 失败数量：
- 目标参数：
- 是否固定时间：
- 是否固定随机数：
- 是否依赖 Cookie / localStorage：

| 样本 | 浏览器期望值 | Node.js 输出值 | 结果 | 备注 |
|---|---|---|---|---|
| sample-001 | ... | ... | 通过 / 失败 | ... |

## 结论

- 是否可以交付：是 / 否
- 仍需补齐的环境：
- 仍需补充的样本：
```

## 失败时优先排查

- 入口函数是否正确。
- `args` 是否与浏览器调用一致。
- 请求 URL、Body、Header、Cookie 是否一致。
- 时间、随机数是否固定。
- UA、语言、时区、屏幕、指纹相关字段是否一致。
- `localStorage` / `sessionStorage` 是否缺值。
- `document.cookie` 是否脱敏后影响签名。
- native-like `toString` 是否启用。
- `document.all` 是否被目标 JS 检测。
- 是否还有 Proxy 检测信号。
- 动态 HTML / JS / challenge 是否已经过期，当前资源 hash 是否与 fixture 中记录一致。
- 如果资源 hash 不一致，是否已先运行 `check_dynamic_resources.js --require-runtime-refresh` 并确认最终入口会刷新当前资源。

## 敏感信息处理

fixtures 中的 Cookie、Authorization、账号 ID、手机号、邮箱等信息应脱敏。若脱敏会影响签名，应在本地私有 fixtures 中保留真实值，但不要写入公开报告或最终说明。
