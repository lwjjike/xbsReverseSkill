# 厂商执行注意点

本文件用于第二阶段的授权验证流程。厂商识别只决定注意点，不代表可以自动通过。

## 国内行为验证码

### 极验

- 常见类型：`slider`、`click-select`、`risk-score`、`token-widget`。
- 常见材料：`captcha_id`、`lot_number`、`pass_token`、`gen_time`、`w`。
- 注意点：视觉答案、行为轨迹和加密载荷分离；challenge 可能短期有效并绑定浏览器状态。

### 腾讯 TCaptcha

- 常见类型：`slider`、`click-select`、`audio`、`one-click`、`risk-score`。
- 常见材料：`aid`/`appid`、`randstr`、`ticket`。
- 注意点：`ticket` 和 `randstr` 往往与 session、页面和行为采集绑定。

### 网易易盾

- 常见类型：`slider`、`click-select`、`audio`、`risk-score`。
- 常见材料：`captchaId`、`validate`、`fp`、`acToken`。
- 注意点：指纹采集和行为采集可能影响可见题结果。

### 阿里云验证码

- 常见类型：`slider`、`image-restore`、`one-click`、`risk-score`。
- 常见材料：`appkey`、`scene`、`sessionId`、`sig`、`token`。
- 注意点：智能验证和风控模式可能没有可见题，优先做官方接入和服务端校验诊断。

### 数美、顶象、百度、京东云、云片

- 数美：注意 `organization`、`rid`、`pass`，可见题和无感模式分开分析。
- 顶象：题型多，命中厂商后不要固定判滑块。
- 百度：数字、文字、滑块、轨迹绘制都可能出现。
- 京东云：保留 `Jcap.create`、`appId`、`sceneId` 等配置。
- 云片：区分网页行为验证和短信/语音验证码服务。

## 海外 token/组件类

### reCAPTCHA

- v2 checkbox/invisible 多为 `token-widget` 或 `one-click`。
- v3/Enterprise score/action 归 `risk-score`。
- 注意点：服务端可能校验 hostname、action、score、session、IP。

### hCaptcha

- 常见 `token-widget`、`grid`、`audio`、语义图片题。
- 注意点：`rqdata`、`rqtoken` 和企业载荷可能影响平台任务。

### Cloudflare Turnstile

- 常见 `token-widget`、`one-click`、`risk-score`。
- 与 Cloudflare WAF challenge page 区分：`cf_clearance` 和 `/cdn-cgi/challenge-platform/` 是 WAF 流程。

### Arkose / FunCaptcha

- 常见 `game-challenge` 或组件初始化。
- 注意点：public key、surl、blob、会话绑定和 3D/小游戏状态。
- 开源方案通常只适合识别题面和状态，稳定验证常需要人工接管或授权平台对照。

## PoW 类

FriendlyCaptcha、ALTCHA、Private Captcha、Cap.js、mCaptcha 主要是 `pow-challenge`。

优先检查官方协议：

- challenge/payload 是否有效。
- difficulty、nonce、solution 是否匹配。
- TTL、防重放和服务端签名是否正确。

通常不需要打码平台；自有系统应先修复接入。

## WAF / Bot Management

Cloudflare WAF、AWS WAF、DataDome、Akamai、Imperva、PerimeterX/HUMAN、Kasada、Netacea、Radware、F5 都优先归 `waf-challenge`。

优先诊断：

- 响应头、状态码、cookie 名。
- JS challenge 是否加载和执行。
- 浏览器 API、Canvas/WebGL/字体/Audio 等环境。
- TLS/HTTP 指纹、UA、IP、session 粘性。
- WAF 服务端日志和误伤样本。

不要把 WAF challenge 当成普通 OCR 题。

## 活体/人脸

`biometric-liveness` 只做识别、官方 SDK 接入检查、人工审核、可访问性替代和隐私合规建议。不要生成绕过、伪造或替身方案。
