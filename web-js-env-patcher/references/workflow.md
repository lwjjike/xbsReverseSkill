# 补环境前置流程

本文件用于指导写补环境代码之前的详细流程。

## 阶段 -1：新 case 第一回复硬门禁

每次用户给出新网站、新接口、新 cURL / HAR、旧补环境文件，或要求“帮我分析 / 补环境 / 成功请求到数据”时，第一回复先做门禁检查，不直接进入取证或补环境。

即使用户提供了很长的 cURL、Cookie、403/200 现象、JS 文件线索、旧代码文件名，仍然不能把它视为已经通过主流程。cURL 只是请求样本，不等于取证模式已确认，也不等于最终请求 TLS 客户端已确认。

第一回复必须输出：

```markdown
## 信息完整性检查

### 已识别信息
- 目标网站 / 页面：
- 目标 API：
- 请求方法：
- 已提供请求样本：
- 已知响应现象：
- 已知旧代码 / JS 文件：
- 用户已明确的目标参数：

### 缺失 / 待确认信息
- 取证模式：未确认 / ruyiPage + RuyiTrace / 仅 ruyiPage / Camoufox + camoufox-reverse-mcp / 仅 Camoufox / CloakBrowser / 用户手动取证 / AI 自行决定
- 最终请求 TLS 指纹兼容客户端：未确认 / Node.js CycleTLS / Node.js impers / Node.js curl-cffi / Python curl_cffi / Python cffi_curl / Python cyCronet / 不发真实请求
- 是否有授权测试权限：
- 是否需要登录：
- 本次确认要分析的加密 / 风控参数：
- 是否允许创建 case 目录和阶段报告：

### 初步发现的可疑参数候选
| 参数名 | 位置 | 疑似原因 | 是否等待用户确认 |
|---|---|---|---|
|  | Query / Header / Body / Cookie |  | 是 |

### 暂停说明
在你确认取证模式、最终请求客户端和本次分析参数前，我不会启动浏览器取证、下载 JS、运行 Hook、修改或运行旧补环境代码、复用 cURL 中的动态参数，也不会发送真实请求。
```

如果缺少取证模式或最终请求 TLS 客户端，第一回复必须停在本阶段和阶段 0.5 / 0.6；只能继续做离线整理、列缺失项和生成 `case/阶段报告/01-需求信息确认.md`，不能进入请求验证、JS 收集、入口定位、Node trace 或补环境代码。

## 阶段 0：范围确认

确认以下事项：

- 目标是网页端 / 浏览器端 JavaScript。
- 用户要求的是 Node.js 补环境。
- 排除 App、移动端、小程序、Windows、Native 等方向。
- 当前目标不是纯算重写。
- 浏览器自动化只用于前置取证，不用于批量采集。
- 用户有授权测试范围。

任一条件不满足时，停止并说明 Skill 边界。

## 阶段 0.5：取证模式确认

在信息校验、请求样本验证、JS 文件收集、Hook、断点、截图、RuyiTrace 日志采集等任何取证动作之前，必须先让用户选择取证模式：

1. ruyiPage + RuyiTrace（推荐）。
2. 仅 ruyiPage。
3. Camoufox + camoufox-reverse-mcp。
4. 仅 Camoufox。
5. CloakBrowser。
6. 用户手动取证。
7. AI 自行决定。

确认后把选择记录为本 case 的取证模式，并在后续所有浏览器取证动作中沿用。不要等确认有自动化检测后再启用 ruyiPage / RuyiTrace。不要在用户已选择 ruyiPage / CloakBrowser / 手动取证后，自行改用普通 Playwright、Puppeteer 或系统 Firefox。

如果所选工具不可用或后续需要切换工具，暂停并重新让用户确认。

如果用户选择 ruyiPage + RuyiTrace，但检测到 RuyiTrace 未安装或目录不完整，不能自动降级为仅 ruyiPage。必须先提示用户选择“安装 / 提供 RuyiTrace 路径”或“明确降级为仅 ruyiPage”；用户选择安装时，等待用户完成安装并重新检测通过后，才继续需要 NDJSON 的流程。

如果用户没有明确选择取证模式，不能因为用户提供了 cURL、Cookie、目标站 URL、旧代码或“请成功请求到数据”的要求而默认启动任何浏览器工具。只能给出取证模式选项并等待确认；如果用户选择“AI 自行决定”，也必须先检测工具并回报拟用方案，等待用户确认后再启动。

## 阶段 0.6：最终请求 TLS 指纹兼容客户端确认

如果本 case 最终需要发送真实请求或交付 `final.js` / `final.py`，必须在前置阶段就选择最终请求客户端，不要等普通 `fetch` / `requests` 失败后再临时切换。

可选项：

1. Node.js CycleTLS。
2. Node.js impers。
3. Python curl_cffi。
4. Python cffi_curl。
5. Python cyCronet。
6. 不发真实请求，只输出本地 sign / 参数。

确认后立即运行：

```bash
node scripts/check_tls_clients.js --markdown
node scripts/check_tls_clients.js --python python --markdown
```

如果用户选择的库未安装，先让用户确认安装、改选其他已安装客户端，或选择“不发真实请求”。TLS 指纹兼容仅用于授权范围内少量最终验证请求，不用于批量访问、绕过登录、验证码、MFA、付费墙或访问控制。

## 阶段 0.7：阶段报告初始化

从用户提供第一轮需求信息开始，默认创建 `case/阶段报告/01-需求信息确认.md`，记录目标 URL、API、取证选项、加密参数、加密文件 / JS 文件、已提供样本、缺失项和下一步待确认问题。即使信息不完整，也要生成该阶段报告。

推荐命令：

```bash
node scripts/write_stage_report.js --case-dir case --stage 需求信息确认 --data case/notes/需求信息.json --markdown
node scripts/check_stage_reports.js --case-dir case --require-stage 需求信息确认 --markdown
```

后续阶段结束时继续写入 `02-取证方案确认.md`、`03-请求样本与可疑参数确认.md`、`04-JS文件与入口定位.md`、`05-补环境前置分析.md`、`06-补环境实现记录.md`、`07-验证与清理记录.md`。所有 Markdown 文件名必须包含中文。

## 阶段 1：信息完整性检查

必填信息：

1. 目标网站或目标页面 URL。
2. 目标接口 API URL。
3. 请求方法。
4. 目标加密参数名。
5. 参数位置：Query / Header / Body / Cookie。
6. 至少一份成功请求样本，优先 Copy as cURL。
7. 取证模式：ruyiPage + RuyiTrace / 仅 ruyiPage / Camoufox + camoufox-reverse-mcp / 仅 Camoufox / CloakBrowser / 用户手动取证 / AI 自行决定。
8. 最终请求 TLS 指纹兼容客户端：Node.js CycleTLS / Node.js impers / Node.js curl-cffi / Python curl_cffi / Python cffi_curl / Python cyCronet / 不发真实请求。

如果信息不完整，列出缺失项，并使用 `intake-template.md` 让用户补充。

如果信息完整，先整理任务摘要并请求用户确认，不要直接进入分析。

强制阻断项：

- 未确认取证模式：不得打开网页、抓包、Hook、截图、下载 JS 或采集 RuyiTrace。
- 未确认最终请求 TLS 客户端且任务要求成功请求：不得发送真实请求，也不得先用普通 HTTP 客户端试错。
- 未确认本次分析参数：不得只盯用户指定参数进入补环境；必须先列出 Query / Header / Body / Cookie 中所有可疑候选并让用户确认。
- 未确认授权 / 登录状态：不得尝试绕过登录、验证码、MFA、风控或访问控制。

## 阶段 2：请求样本检查

检查内容：

| 检查项 | 目的 |
|---|---|
| URL 是否完整 | 是否包含协议、域名、路径 |
| 请求方法是否明确 | GET / POST / PUT 等 |
| 请求头是否完整 | UA、Content-Type、Cookie、Referer、Origin 等 |
| Body 是否完整 | POST / PUT 请求是否包含请求体 |
| 目标参数是否存在 | 是否能在用户声明的位置找到参数 |
| 响应样本是否成功 | 判断样本是否是有效请求 |
| 取证模式是否一致 | 后续抓包、JS 收集、Hook、截图和日志采集是否都沿用用户选择的工具 |
| Cookie/token 是否过期 | 先判断是登录态授权 Cookie，还是非登录生成型 Cookie |
| 最终请求客户端是否已选 | 从一开始确认 CycleTLS / impers / curl_cffi / cffi_curl / cyCronet / 不发真实请求 |

推荐输出：

```markdown
## 请求样本检查结果

- 请求是否完整：
- 目标参数是否存在：
- 参数位置是否一致：
- 是否缺少关键 Header：
- 是否缺少 Cookie / token：
- Cookie/token 是否过期：
- Cookie 分类：登录态 / 非登录生成型 / 未确认
- 最终请求 TLS 指纹兼容客户端：
- 是否可以进入下一步：
```

## 阶段 2.2：可疑加密参数发现与用户确认

在正式补环境前，必须先从 cURL / HAR / 请求样本中列出所有可疑加密参数，并让用户确认本次要分析哪些。不要只复用用户给出的 `--param`，也不要只盯一个参数。

执行建议：

```bash
node scripts/parse_curl.js --input request.curl --json
node scripts/parse_curl.js --input request.curl --markdown
```

必须覆盖的位置：Query、Header、Body、Cookie。重点关注 sign、token、a_bogus、h5st、x-s、x-t、mtgsig、w_rid、_signature、nonce、hash、设备 Cookie、风控 Cookie、JS 生成 Cookie 等。

输出给用户确认：

```markdown
## 发现的可疑加密参数

| 参数名 | 位置 | 样本值摘要 | 疑似原因 | 是否建议分析 |
|---|---|---|---|---|
|  | Query/Header/Body/Cookie | 脱敏 |  | 是/否 |

请确认本次要分析哪些参数。确认前我不会进入正式补环境。
```

同时写入 `case/阶段报告/03-请求样本与可疑参数确认.md`，记录候选参数、用户确认状态和未确认项。

确认规则：

- 如果用户已经指定目标参数，也要提示其他候选参数，询问是否需要一并分析。
- 用户未确认目标参数列表前，不进入 `env.js` 编写、Node trace 或补环境阶段。
- cURL 中已有参数值只能作为浏览器真实样本 / fixture expected，不能作为最终产物中的固定值。
- 如果某个候选是登录态 token / Authorization，先回到登录与授权边界，不做绕过。

## 阶段 2.5：Cookie 过期与来源分类

当请求失败疑似由 Cookie/token 过期、Cookie 缺失、Cookie 写入失败或参数位置为 Cookie 引起时，先分类，不要默认要求用户重新给一份新 Cookie。

| 类型 | 处理方式 |
|---|---|
| 登录态 / 授权 Cookie | 不绕过登录；让用户手动登录或提供授权样本 |
| 服务端 `Set-Cookie` 首访 Cookie | 分析是否可通过前置 Node.js / Python 请求刷新，并写入最终请求客户端 |
| `document.cookie` 写入 Cookie | Hook setter 或用 RuyiTrace 查 `document.cookie` / `Document.cookie` 调用栈，定位 writer |
| JS 计算生成 Cookie | 按 `source → entry → builder → writer` 定位生成函数，并纳入补环境 |
| Storage / 指纹 / challenge 派生 Cookie | 分析 localStorage / sessionStorage / 指纹对象 / server seed / timestamp 等依赖 |
| 一次性服务端 challenge 或账号绑定 Cookie | 说明不可或不应复现，要求用户授权交互或离线样本 |

输出模板：

```markdown
## Cookie 过期处理判断

- Cookie 名称：
- 是否需要登录：
- 是否账号 / 授权相关：
- 来源判断：Set-Cookie / document.cookie / JS 计算 / Storage 派生 / challenge / 未确认
- 是否可生成或刷新：
- 生成链路 source / entry / builder / writer：
- 是否纳入补环境：
- 是否需要用户手动登录：是 / 否
```

结论规则：

- 对不需要登录的网站，优先分析非登录 Cookie 如何生成 / 刷新。
- 只有 Cookie 明确属于登录态 / 授权态、服务端一次性下发且无法 / 不应复现、或用户确认只做一次离线样本复现时，才要求用户重新提供有效 Cookie。

## 阶段 3：加密参数画像

仅对用户确认要分析的参数做画像。对未确认的候选参数，只保留在 notes 中作为备选证据，不要擅自进入补环境。

在补环境前先描述参数特征：

| 维度 | 要回答的问题 |
|---|---|
| 参数名 | sign / x-s / a_bogus / h5st / token 等 |
| 参数位置 | Query / Header / Body / Cookie |
| 是否动态 | 每次请求是否变化 |
| 是否依赖请求体 | Body 改变后参数是否变化 |
| 是否依赖 URL | path / query 是否参与签名 |
| 是否依赖 Cookie | 是否受登录态影响 |
| 是否依赖存储 | 是否读取 localStorage / sessionStorage |
| 是否依赖浏览器指纹 | navigator / canvas / WebGL / screen 等 |
| 是否依赖时间或随机数 | timestamp / nonce / random / server seed 等 |
| 是否已有 RuyiTrace 日志 | 是否有 NDJSON 环境访问日志可用于补环境优先级 |

推荐输出：

```markdown
## 加密参数画像

- 参数名：
- 位置：
- 是否动态：
- 已知依赖：
- 疑似依赖：
- 需要补充的样本：
```

## 阶段 4：加密入口定位

目标是找到生成加密参数的函数或模块。

定位必须按 `source → entry → builder → writer` 四层链路记录：

| 层级 | 必须回答 |
|---|---|
| source | 签名输入来自 URL、Body、Cookie、Storage、时间随机数、指纹中的哪些字段 |
| entry | 哪个函数或模块生成签名或中间签名 |
| builder | 哪个请求构造函数把签名拼入请求对象 |
| writer | 最终由 fetch/XHR/Header/Query/Body/Cookie 哪个位置写入网络请求 |

如果只找到 `entry` 但无法确认 `writer`，只能标记为“疑似入口”，不能进入正式补环境。阶段结束时写入 `case/阶段报告/04-JS文件与入口定位.md`。

优先方法：

1. 查看 Network Initiator。
2. 使用 XHR / fetch 断点。
3. 搜索参数名。
4. Hook 关键 API 记录调用栈。
5. 分析 Stack Trace。
6. 如果有 sourcemap，优先结合 sourcemap。
7. 定位 webpack / vite / runtime 模块和动态 chunk。

Hook 模板见 `hook-templates.md`。复杂链路见 `crypto-entry-location.md`。

常用搜索词：

```text
sign
token
x-s
a_bogus
h5st
setRequestHeader
fetch(
XMLHttpRequest
JSON.stringify
localStorage.getItem
document.cookie
crypto
```

推荐输出：

```markdown
## 加密入口定位

- 入口函数：
- 所在 JS 文件：
- 行列号：
- 调用链：
- 输入参数：
- 输出参数：
- 是否依赖浏览器环境：
- 是否需要继续补充 DevTools 信息：
```

## 阶段 5：JS 文件收集

只收集加密链路需要的文件：

- 主 bundle。
- 动态 chunk。
- runtime chunk。
- sourcemap。
- WASM 文件仅限网页端 JS 依赖，不扩展到 Native 逆向。
- 加密入口函数所在文件。

建议 case 目录：

```text
case/
├── js/
│   ├── original/
│   ├── pretty/
│   └── extracted/
├── requests/
├── fixtures/
├── notes/
└── tmp/
```

推荐输出：

```markdown
## JS 文件收集结果

- 已获取 JS 文件：
- 未获取 JS 文件：
- 是否存在 sourcemap：
- 是否存在动态 chunk：
- 是否存在 runtime：
- 是否存在 WASM：
- 是否可以进入补环境准备：
```

## 阶段 5.2：动态 HTML / JS 资源保鲜检查

下载或保存 HTML、JS bundle、动态 chunk、challenge JS、403/风控页面和内联脚本后，先判断这些资源是长期静态文件，还是会随时间、会话、Cookie、seed、nonce、地域或 TLS 指纹变化的动态资源。

强制规则：

- 本地动态 HTML / JS 只能作为分析快照，不得直接进入最终产物主路径。
- 对每个资源记录 URL、请求时间、状态码、响应头、Set-Cookie、body sha256、Cache-Control、Expires、ETag、Last-Modified、依赖 Cookie / seed / nonce、动态性判定、最终使用方式。
- 将清单写入 `case/notes/resource-manifest.json`。
- 命中 `no-store/no-cache/private/max-age=0`、短 TTL、随机 query、同 URL 多次 hash 变化、HTML 内 seed / nonce / challenge 变化、403 challenge JS、会话绑定 Cookie 时，最终入口必须实现运行时刷新。
- 最终入口应先重新请求当前 HTML / JS / challenge / seed，再运行补环境生成参数和发送请求。

推荐命令：

```bash
node scripts/check_dynamic_resources.js --case-dir case --markdown
node scripts/check_dynamic_resources.js --case-dir case --require-runtime-refresh --markdown
```

推荐输出：

```markdown
## 动态资源保鲜检查

- 动态 HTML / JS：有 / 无
- 分析快照目录：
- 资源 manifest：
- 影响最终生成参数的动态资源：
- 最终运行时刷新模块：
- 是否允许进入补环境准备：
```

如果动态资源影响目标参数生成，但尚未设计运行时刷新链路，不得进入最终交付；如果因此请求失败，先刷新资源和 seed，再判断是否继续补 WebAPI。

## 阶段 5.5：RuyiTrace NDJSON 优先分析

如果取证模式为 ruyiPage + RuyiTrace，本阶段必须在进入 Node.js 补环境前执行。不要等 Node.js 报错后才临时查看日志。

1. 确认是否已有 RuyiTrace NDJSON。
   - 如果 RuyiTrace 未安装或目录不完整，先回到“阶段 0.5：取证模式确认”，要求用户安装 / 提供路径或明确降级；不得直接跳过本阶段进入 Node trace。
2. 尚未导入时先执行：

   ```bash
   node scripts/import_ruyitrace_log.js --input <trace.ndjson> --case-dir case --markdown
   ```

3. 阅读 `notes/ruyitrace-summary.md`，按目标参数生成、目标 API 请求发起、writer 写入附近的 `api` 和 `stack.file / line / col` 汇总环境依赖。
4. 将结论写入：
   - `notes/ruyitrace-summary.md`
   - `notes/missing-env-priority.md`
   - `notes/entry-chain.md`
5. 只有日志缺失、未覆盖当前逻辑或结论不足时，才把 Node trace / Proxy trace 作为主要发现来源。

遇到后续环境问题时，也先回到本阶段复查 NDJSON，再决定是否补充 Node trace。

推荐输出：

```markdown
## RuyiTrace NDJSON 优先分析

- 日志状态：已导入 / 未提供 / 未覆盖当前逻辑
- 摘要文件：
- 目标参数生成附近 API：
- 关键调用栈：
- 优先补齐环境模块：
- 需要 Node trace 补充的原因：
```

## 阶段 6：前置总结

在真正写 `env.js` 前，再次让用户确认：

```markdown
补环境前置任务已完成，请确认：

- 目标网站 URL：
- 目标 API：
- 发现的可疑加密参数：
- 用户确认要分析的参数：
- 参数位置：
- 加密入口：
- source / entry / builder / writer：
- 相关 JS 文件：
- 样本数量：
- 当前判断的依赖：
- 取证模式：
- 最终请求 TLS 指纹兼容客户端：
- TLS 客户端可用性：已安装 / 未安装需用户确认 / 不发真实请求
- 是否需要切换取证工具：否 / 是，原因：
- RuyiTrace 日志：已导入并优先分析 / 未提供 / 未覆盖当前逻辑 / 不需要
- RuyiTrace 优先证据：api / stack.file / line / col 摘要
- Node 泄露阻断检查：
- 六项纯计算预检：
- 最终交付要求：生成规范项目目录；只有 `result/final.js` 或 `result/final.py` 一个执行入口；入口运行后通过补环境后的目标 JS 入口 / signer 生成加密参数，并使用已确认的 TLS 指纹兼容客户端发送少量授权模拟请求，或按用户选择只输出本地参数；不交付自动化取证代码；不得硬编码或复用 cURL / fixture 中的加密参数样本值。

确认后将进入 Node.js 补环境阶段。
```
