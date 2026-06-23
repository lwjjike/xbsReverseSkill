# 动态 HTML / JS 资源保鲜与运行时刷新

当目标站点的 HTML、JS bundle、动态 chunk、challenge JS、403/风控页面或内联脚本可能随时间、会话、Cookie、seed、nonce、地域、TLS 指纹或点击动作变化时读取本文件。目标是防止把已经过期的本地快照当作最终补环境输入。

## 核心规则

- 下载到本地的动态 HTML / JS 默认只是 **分析快照**，不能直接作为最终产物的固定依赖。
- 最终入口运行时必须先刷新当前有效资源，再加载当前资源生成加密参数并发送请求。
- 如果资源会过期，最终项目必须包含资源刷新模块，例如 `src/resources/fetch-runtime-resources.js` 或等价封装。
- cURL / HAR / fixture 中的旧 HTML、旧 JS、旧 seed、旧 token、旧 Cookie 只能作为证据和 expected，不得硬编码到最终 signer。
- 请求失败或参数不一致时，先检查资源是否过期、JS hash 是否变化、challenge seed 是否变化，再继续补 WebAPI。

## 动态性判定

任一条件命中时，将资源标记为动态或高风险：

| 证据 | 说明 |
|---|---|
| `Cache-Control: no-store/no-cache/private/max-age=0` | 不应长期复用 |
| `Expires` 已过期或 TTL 很短 | 需要运行时刷新 |
| URL 含 `t/ts/timestamp/nonce/rand/random/_` 等 query | 可能每次变化 |
| 同 URL 多次请求 body hash 不一致 | 不能固定本地文件 |
| HTML 内联 `seed/nonce/config/challenge/token` 每次变化 | 必须刷新入口页 |
| 403 / challenge 页面返回 JS | 通常与当前会话绑定 |
| 响应包含 `Set-Cookie` | 可能刷新设备 Cookie / 风控 Cookie |
| JS URL 从当前 HTML 动态拼接 | 需要最终入口重新解析 HTML |
| JS 内容依赖当前 Cookie / Storage / 地域 / TLS | 需要和请求客户端链路绑定 |

## 资源清单

每个已保存资源都记录到 `case/notes/resource-manifest.json`：

```json
{
  "resources": [
    {
      "url": "https://example.com/challenge.js?ts=...",
      "type": "js",
      "file": "case/js/snapshots/challenge-001.js",
      "capturedAt": "2026-06-23T00:00:00.000Z",
      "status": 200,
      "headers": {
        "cache-control": "no-store",
        "set-cookie": "脱敏记录"
      },
      "sha256": "body hash",
      "dynamic": true,
      "use": "analysis-snapshot",
      "requiredForFinal": true,
      "runtimeRefresh": true,
      "refreshEntry": "result/src/resources/fetch-runtime-resources.js",
      "dependsOn": ["Cookie", "HTML seed", "TLS client"]
    }
  ]
}
```

字段要求：

- `dynamic: true`：明确动态资源。
- `use: "analysis-snapshot"`：只用于分析，不进入最终主路径。
- `use: "runtime-refresh"` 或 `runtimeRefresh: true`：最终运行前刷新。
- `requiredForFinal: true`：最终生成参数需要它；此时必须提供运行时刷新方案。
- `refreshEntry`：最终项目中负责重新获取该资源的模块。

## 目录约定

```text
case/
├── js/
│   ├── snapshots/        # 动态资源快照，只用于分析
│   ├── static/           # 已确认可长期复用的静态 bundle
│   └── extracted/
├── notes/
│   └── resource-manifest.json
└── result/
    ├── final.js
    └── src/
        ├── resources/    # 运行时刷新 HTML / JS / challenge
        ├── env/
        ├── signer/
        └── request/
```

动态资源可以保存在 `case/js/snapshots/`，但不得原样复制到 `result/` 作为 signer 主输入。

## 最终入口流程

涉及动态 HTML / JS 时，最终入口应按以下顺序执行：

1. 使用用户已确认的 TLS 指纹兼容客户端请求入口页或 challenge 页。
2. 解析最新 HTML，提取当前 seed、nonce、config、动态 JS URL、Set-Cookie。
3. 按当前页面状态请求最新 JS / chunk / challenge 资源。
4. 验证资源 hash、状态码和关键字段，并更新运行时资源上下文。
5. 将当前 JS / seed / Cookie / Storage 注入补环境运行链路。
6. 生成目标加密参数。
7. 用同一会话 / Cookie / TLS 客户端发送最终请求。

不得在最终入口中只执行“加载旧本地 JS 快照 → 生成参数 → 请求”。

## 验证

进入最终交付前运行：

```bash
node scripts/check_dynamic_resources.js --case-dir case --markdown
node scripts/check_dynamic_resources.js --case-dir case --require-runtime-refresh --markdown
```

检查失败时先修复资源刷新链路，再继续补环境或最终请求。

## 输出模板

```markdown
## 动态资源保鲜检查

- 是否存在动态 HTML / JS：
- 动态资源清单：
- 是否只作为分析快照：
- 是否影响最终参数生成：
- 最终入口是否运行时刷新：
- 刷新模块：
- 当前资源 hash 是否与 fixture 一致：
- 失败时是否先排查资源过期：
```
