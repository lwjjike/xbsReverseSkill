# 指纹基线一致性规则

本文件在每个新 case 的浏览器取证、指纹采样、RuyiTrace / Camoufox / CloakBrowser 日志采集、生成 `fingerprint.fixture.json` 或发现指纹冲突时读取。目标是保证同一 case 内所有浏览器证据来自同一套稳定指纹基线，避免多次随机化导致 navigator、screen、WebGL、语言、时区、UA、Client Hints 等互相冲突。

## 硬性规则

- 同一 case 必须维护一个指纹基线文件：`case/notes/fingerprint-baseline.json`。
- 第一次成功取证后立即固化 `baselineId`，后续抓包、Hook、RuyiTrace、指纹采样、fixture 对比、动态资源刷新取证都必须复用该基线。
- 禁止每次打开 ruyiPage、Camoufox、CloakBrowser 时重新随机一套指纹；不得把不同浏览器、不同 Profile、不同代理地区或不同随机 seed 的样本混用。
- ruyiPage 必须复用同一 case 的 `base_dir`、`userdir`、`smart_fingerprint` 输出和定制 Firefox runtime；RuyiTrace 若不是同一浏览器 / profile，必须先做基线 diff。
- Camoufox / CloakBrowser 必须优先使用持久 profile、固定 seed 或固定配置；只要工具支持随机指纹，就必须在第一次成功取证后把实际值固化，并在后续启动时复用，不得继续随机。
- 指纹 fixture、RuyiTrace 摘要、Hook 采样、最终总结都必须记录 `baselineId`。缺少 `baselineId` 或 baseline 文件时，涉及指纹的 case 不能进入最终交付。
- 如果 UA、Client Hints、language、timezone、platform、viewport、screen、DPR、WebGL vendor/renderer、Canvas、Audio、字体、DOM 几何、proxy/IP 地区之间出现冲突，暂停并重新采样或让用户确认切换基线；不得自动合并。
- 用户明确更换代理、地区、Profile、浏览器工具或登录态容器时，必须生成新的 `baselineId`，旧样本只能作为历史证据，不能和新基线混用。

## 基线文件建议结构

```json
{
  "version": 1,
  "baselineId": "fp-20260627-001",
  "caseId": "",
  "mode": "ruyiPage + RuyiTrace / Camoufox / CloakBrowser / 用户手动取证",
  "tool": {
    "name": "ruyiPage",
    "profile": "case/tmp/browser-profile",
    "fingerprintSeed": "",
    "browserPathDigest": "只写相对路径或脱敏摘要"
  },
  "network": {
    "proxyCountry": "",
    "ipCountry": "",
    "timezone": "Asia/Shanghai",
    "locale": "zh-CN"
  },
  "navigator": {
    "userAgent": "",
    "language": "zh-CN",
    "languages": ["zh-CN", "zh"],
    "platform": "",
    "hardwareConcurrency": 0,
    "deviceMemory": 0
  },
  "clientHints": {},
  "screen": {},
  "viewport": {},
  "webgl": {},
  "canvas": { "source": "fixture" },
  "audio": {},
  "font": {},
  "createdAt": "",
  "locked": true
}
```

## 采样与 diff 流程

1. 用户确认取证模式后，先准备本 case 专用 profile / userdir / fingerprint cache 目录。
2. 第一次成功打开目标页并完成基础自检后，采集 baseline，写入 `case/notes/fingerprint-baseline.json`。
3. 后续每次浏览器取证前读取 baseline；工具启动参数、profile、代理、locale、timezone、viewport 必须与 baseline 一致。
4. 多工具采样或重新启动浏览器后，先对比 baseline：
   - 一致：继续采样。
   - 不一致：写入 `case/notes/fingerprint-baseline-diff.md`，暂停并说明冲突字段。
5. 指纹 fixture 写入 `baselineId`，并在 `source` 中记录采样工具、页面、UA、时区、语言、采样时间。
6. 最终总结记录 baseline 文件、`baselineId`、是否发生 diff、冲突字段和处理方式。

## 冲突处理

## 用户 cURL 样本与取证 baseline 冲突处理

用户提供的 cURL / HAR 可能来自 Chrome / Chromium，但实际取证可能使用 ruyiPage 定制 Firefox、用户手动 Firefox、Camoufox 或 CloakBrowser。两者浏览器族、UA、Client Hints、TLS / HTTP2 指纹、Header 顺序和 Cookie 会话来源不一致时，不能把它们拼接成同一个最终 baseline。

硬性规则：

- 解析 cURL / HAR 时先识别“用户样本浏览器族”：Chrome / Chromium / Firefox / Safari / Unknown，并记录识别依据，例如 `User-Agent`、`sec-ch-ua`、`sec-ch-ua-platform`、HAR 浏览器信息、TLS / HTTP2 线索。
- 第一次成功取证并生成 `case/notes/fingerprint-baseline.json` 后，识别“取证 baseline 浏览器族”，并与用户 cURL 样本浏览器族对比。
- 如果用户 cURL 是 Chrome / Chromium，而取证 baseline 是 Firefox，默认以取证 baseline 为最终基线；Firefox baseline 下不得沿用 Chrome 的 `sec-ch-ua`、Chrome UA、Chrome TLS profile 或 Chrome HTTP/2 行为。
- cURL 在冲突场景中只作为请求结构线索：目标 URL、方法、Query / Header / Body / Cookie 字段名、参数位置、可疑加密参数、业务字段和历史响应现象；不得把 cURL 中已有的动态加密参数值、冲突 Cookie、冲突 Header 或冲突网络指纹固定到最终产物。
- 最终补环境值、指纹 fixture、Header、TLS / HTTP2、Cookie / Storage 链路和 Session 请求链必须以当前已确认取证 baseline 为准。
- 发现冲突时写入 `case/notes/sample-baseline-conflict.md`，内容至少包括：用户 cURL 浏览器族、取证 baseline 浏览器族、冲突字段、证据来源、默认处理策略、用户是否要求重新取证或接受风险。
- 如果用户坚持以 cURL 的浏览器族为准，必须暂停并建议改用同浏览器族取证工具重新取证，或让用户提供同浏览器族、同 profile、同代理、同登录态的 HAR / cURL；不得自动混用。

示例：

```text
用户 cURL：Chrome/137 + sec-ch-ua + Chrome 风格请求头
实际取证：ruyiPage Firefox 151 baseline
处理结果：目标 API、参数位置、Cookie 字段名和可疑加密参数可参考 cURL；最终 navigator.userAgent、Header、Client Hints、TLS / HTTP2、Cookie 链路和指纹 fixture 均以 Firefox 取证样本为准，并删除 / 不使用 Chrome UA-CH。
```


发现冲突时优先处理顺序：

1. 判断是否更换了代理、地区、profile 或浏览器工具。
2. 如果是误切换，回到原 baseline 的 profile / seed / 配置重新采样。
3. 如果用户确认切换，生成新 baseline，并标记旧 fixture 不再用于当前最终交付。
4. 如果无法确认真实一致性，阻塞最终交付，不要把多个 baseline 的指纹值拼接进同一个 env。

## 输出记录

阶段报告和最终总结至少记录：

- `baselineId`。
- baseline 文件路径。
- 取证工具、profile / seed / 配置来源。
- UA / Client Hints / locale / timezone / viewport / screen / WebGL / Canvas / Audio / 字体 / DOM 几何是否一致。
- 是否发生 baseline diff，冲突字段与处理方式。
- 用户 cURL 样本浏览器族、取证 baseline 浏览器族、是否发生样本基线冲突，以及 `case/notes/sample-baseline-conflict.md` 的处理结论。
- `fingerprint.fixture.json` 是否绑定同一 `baselineId`。
