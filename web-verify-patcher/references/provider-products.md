# 厂商与产品特征

使用本文件把 HTML、JS、iframe、接口名和参数线索转成厂商判断。报告高置信度前，尽量要求两个以上独立信号。

验证码与风控产品是开放集合。本表覆盖调研到的主流公开产品、常见开源库和主要 WAF/Bot Management 产品；遇到未覆盖的新产品时，先输出 `custom-or-unknown`，并记录脚本 URL、iframe、DOM 标记、cookie/header、参数名和可见题型，后续再补充稳定信号。

## 厂商信号表

| 厂商标签 | 强信号 | 常见参数 | 常见类型 |
| --- | --- | --- | --- |
| `recaptcha` | `google.com/recaptcha`、`www.recaptcha.net/recaptcha`、`g-recaptcha`、`grecaptcha`、`/api2/anchor`、`/api2/reload` | `sitekey`、`k`、`s`、`action`、`enterprise`、`g-recaptcha-response` | `token-widget`、`grid`、`audio`、`risk-score`、`one-click` |
| `hcaptcha` | `hcaptcha.com/1/api.js`、`h-captcha`、`hcaptcha.render`、`newassets.hcaptcha.com`、`/checkcaptcha/` | `sitekey`、`rqdata`、`rqtoken`、`h-captcha-response` | `token-widget`、`grid`、`audio`、`semantic-reasoning` |
| `cloudflare-turnstile` | `challenges.cloudflare.com/turnstile`、`cf-turnstile`、`turnstile.render` | `sitekey`、`action`、`cdata`、`cf-turnstile-response` | `token-widget`、`risk-score`、`one-click` |
| `geetest` | `geetest`、`gt=`、`challenge=`、`captcha_id`、`lot_number`、`w`、`pass_token` | `gt`、`challenge`、`captcha_id`、`lot_number`、`w`、`gen_time` | `slider`、`click-select`、`token-widget` |
| `tencent-tcaptcha` | `captcha.gtimg.com`、`tencentcaptcha`、`TCaptcha`、`aid`、`randstr`、`ticket` | `aid`、`appid`、`randstr`、`ticket` | `slider`、`click-select`、`audio`、`one-click`、`risk-score`、`token-widget` |
| `netease-yidun` | `captcha.yidun`、`dun.163.com`、`yidun`、`网易易盾`、`NECaptcha` | `captchaId`、`validate`、`token`、`fp`、`acToken` | `slider`、`click-select`、`audio`、`risk-score`、`token-widget` |
| `aliyun-captcha` | `aliyun`、`aliyuncs.com`、`NoCaptcha`、`AWSC`、`nc_`、`afs` | `appkey`、`scene`、`sessionId`、`sig`、`token` | `slider`、`one-click`、`risk-score`、`image-restore`、`token-widget` |
| `shumei-captcha` | `castatic.fengkongcloud.cn`、`smcp.min.js`、`initSMCaptcha`、`SMCaptcha`、`数美验证码` | `organization`、`appendTo`、`mode`、`rid`、`pass` | `slider`、`click-select`、`semantic-reasoning`、`risk-score` |
| `dingxiang-captcha` | `dingxiang-inc.com`、`cdn.dingxiang-inc.com`、`dx-captcha`、`_dx.Captcha`、`captcha-ui/v5/index.js`、`顶象验证码` | `appId`、`constId`、`apiServer`、`dxToken` | `slider`、`click-select`、`rotate`、`scratch`、`semantic-reasoning`、`image-restore`、`area-select`、`difference-click`、`font-identify`、`audio`、`risk-score` |
| `baidu-captcha` | `cloud.baidu.com/product-s/afd_s/captcha`、`console.bce.baidu.com/afd/captcha`、`验证码 Captcha-百度智能云` | 应用 ID、服务端验签参数、SDK 配置 | `slider`、`text`、`click-select`、`trace-draw` |
| `jdcloud-captcha` | `docs.jdcloud.com/cn/captcha`、`Jcap.create`、`京东云验证码` | `appId`、`sceneId`、`productId`、回调字段 | `slider`、行为验证 |
| `yunpian-captcha` | `yunpian.com/product/captcha`、`riddler-sdk`、`YpRiddler`、`云片行为验证` | 初始化配置、验证 token、回调字段 | `slider`、`click-select` |
| `huawei-captcha` | `huaweicloud.com`、`OneAccess`、`图形验证码`、`captchaId`、`validateCode` | `captchaId`、`validateCode`、服务端校验参数 | `text`，也可能是自研/平台集成验证码 |
| `tongdun-risk` | `tongdun.cn`、`tongdun.net`、`fraudmetrix`、`blackbox`、`tokenId` | `blackbox`、`tokenId`、`riskToken` | 风控/无感验证，通常归 `waf-challenge` 或 `unknown-custom` |
| `cloudflare-waf` | `cf_clearance`、`/cdn-cgi/challenge-platform/`、`cf_chl`、`cf-mitigated`、`Just a moment` | `cf_clearance`、challenge token、Ray ID | `waf-challenge` |
| `aws-waf` | `aws-waf-token`、`awswaf`、`aws-waf-captcha`、`challenge.js`、`waf_captcha` | `aws-waf-token`、`captcha_voucher`、`iv`、`context` | `waf-challenge`，有时展示 `grid` |
| `datadome` | `datadome`、`x-datadome`、`ddcid`、`ddv`、`DataDome` | `datadome` cookie、`ddcid`、`cid`、`initialCid` | `waf-challenge` |
| `arkose-funcaptcha` | `arkoselabs`、`funcaptcha`、`client-api.arkoselabs.com`、`fc-token` | `public_key`、`pkey`、`surl`、`blob`、`fc-token` | `game-challenge`、`token-widget`、图片挑战 |
| `mtcaptcha` | `mtcaptcha.com`、`MTCaptcha`、`mtcaptchaConfig` | `sitekey`、`mtcaptcha-verifiedtoken` | `token-widget` |
| `keycaptcha` | `keycaptcha`、`s_s_c_user_id`、`s_s_c_session_id`、`kc_cid` | `user_id`、`session_id`、`web_server_sign` | 图片/交互挑战 |
| `friendlycaptcha` | `friendlycaptcha`、`frc-captcha`、`friendly-challenge` | `sitekey`、`solution` | `pow-challenge` |
| `altcha` | `altcha`、`altcha-widget`、`challengeurl` | `challenge`、`payload`、`signature` | `pow-challenge` |
| `yandex-smartcaptcha` | `smartcaptcha.yandexcloud.net`、`smart-captcha`、`window.smartCaptcha`、`SmartCaptcha` | `sitekey`、callback、invisible/checkbox 配置 | `token-widget` |
| `captchafox` | `captchafox.com`、`docs.captchafox.com`、`CaptchaFox`、`cf-captcha` | `sitekey`、callback、response token | `token-widget` |
| `prosopo-procaptcha` | `prosopo.io`、`procaptcha`、`@prosopo/procaptcha`、`Prosopo` | `sitekey`、challenge/token、回调字段 | `token-widget` |
| `trustcaptcha` | `trustcaptcha.com`、`trustcomponent.com`、`TrustCaptcha` | `sitekey`、verification token、回调字段 | `token-widget` |
| `private-captcha` | `privatecaptcha.com`、`PrivateCaptcha`、`private-captcha` | site key、challenge、PoW/token | `pow-challenge` |
| `capjs` | `@cap.js/widget`、`cap-widget`、`data-cap-api-endpoint`、`CapWidget` | API endpoint、challenge token、PoW payload | `pow-challenge` |
| `mcaptcha` | `mCaptcha`、`mcaptcha`、`mcaptcha-widget`、`data-mcaptcha` | site key、challenge、PoW solution | `pow-challenge` |
| `iconcaptcha` | `IconCaptcha`、`iconcaptcha`、`icon-captcha` | widget ID、challenge token、点击坐标 | `click-select` |
| `botdetect` | `BotDetect`、`captcha.com`、`BDC_CaptchaDiv`、`BDC_BackLink`、`captchaCode` | captcha ID、instance ID、输入字段 | `text` |
| `securimage` | `Securimage`、`securimage_show.php`、`securimage_play.php` | 音频/图片路径、输入字段 | `text` |
| `visualcaptcha` | `visualCaptcha`、`visualcaptcha.net` | image/audio challenge、answer 字段 | `click-select` 或 `text` |
| `amazon-captcha` | `opfcaptcha.amazon.com`、`/errors/validateCaptcha`、`amzn-captcha`、`validateCaptcha` | captcha 图片、输入字段、`amzn` 状态参数 | `text` |
| `cybersiara` | `CyberSiARA`、`SiARA`、`siara.js` | widget 配置、risk token、回调字段 | `waf-challenge`、`slider` |
| `aj-captcha` | `AJ-Captcha`、`anji-plus`、`blockPuzzle`、`clickWord`、`captchaVerification` | `captchaType`、`captchaVerification`、`pointJson` | `slider`、`click-select` |
| `tianai-captcha` | `tianai-captcha`、`TianaiCaptcha`、`TAC`、`天爱验证码` | `type`、`id`、`track`、`data` | `slider`、`rotate`、`click-select` |
| `easycaptcha` | `EasyCaptcha`、`easy-captcha` | 图片接口、输入字段 | `text`、`math` |
| `happycaptcha` | `HappyCaptcha`、`happy-captcha` | 图片接口、输入字段 | `text` |
| `kaptcha` | `Kaptcha`、`com.google.code.kaptcha` | 图片接口、输入字段 | `text` |
| `akamai-bot-manager` | `_abck`、`bm_sz`、`ak_bmsc`、`bm_sv`、`sensor_data`、Akamai Bot Manager | `_abck`、`bm_sz`、sensor payload | `waf-challenge` |
| `imperva-incapsula` | `Imperva`、`Incapsula`、`visid_incap`、`incap_ses`、`___utmvc`、`reese84` | Incapsula cookies、challenge JS | `waf-challenge` |
| `perimeterx-human` | `PerimeterX`、`HUMAN Security`、`px-captcha`、`_px3`、`pxvid`、`pxAppId` | `_px` cookies、collector payload、captcha token | `waf-challenge` |
| `kasada` | `Kasada`、`x-kpsdk`、`kpsdk`、`KP_UID`、`/p.js` | `x-kpsdk-*` headers、challenge JS | `waf-challenge` |
| `netacea` | `Netacea`、`netacea.com`、Bot Management | challenge token、bot response | `waf-challenge` |
| `radware-bot-manager` | `Radware Bot Manager`、`rbzid`、`rbzsessionid`、`TSPD_101` | Radware cookies、challenge JS | `waf-challenge` |
| `f5-bot-defense` | `F5 Bot Defense`、`Shape Security`、`TSPD_`、`f5_cspm`、`shape.js` | TS/TSPD cookies、sensor payload | `waf-challenge` |
| `custom-or-unknown` | 站点自研 canvas、无品牌脚本、通用 `/captcha` 接口 | 不固定 | 未知/自研 |

## 置信度规则

- 高置信度：两个强厂商信号，或一个官方脚本/iframe URL 加上厂商特有参数名。
- 中置信度：出现厂商特有关键词，但缺少官方脚本/iframe URL。
- 低置信度：只有 `captcha`、`verify`、`challenge` 这类通用词，或只有视觉形态。

不要只凭截图过度判断厂商。滑块 UI 可能来自极验、腾讯、易盾、阿里云，也可能是自研。

## 产品说明

### reCAPTCHA

v2 checkbox/invisible 常见信号是 `g-recaptcha`、`api.js?render=explicit`、`/api2/anchor` 或隐藏字段 `g-recaptcha-response`。v3 常见信号是 `grecaptcha.execute(sitekey, {action: ...})`、`render=sitekey` 和 `action`。Enterprise 版本可能使用 `/recaptcha/enterprise.js` 或 enterprise payload。

如果没有可见图片题，v2/enterprise 组件通常报 `token-widget`；checkbox 明确可见时可报 `one-click`；出现九宫格图片题时报 `grid`；v3/score/action 证据明确时报 `risk-score`。需要提醒用户：v3 是评分/action 绑定，拿到 token 不代表一定通过服务端校验。

### hCaptcha

常见信号包括 `h-captcha`、`hcaptcha.render`、`rqdata`、`rqtoken`、`/getcaptcha/`、`/checkcaptcha/`。hCaptcha 经常在 checkbox 后进入图片网格或语义选择题。

证据里有 “select all images containing...” 这类题面时，分类为 `grid`；有音频替代入口时报 `audio`；如果只有站点组件、sitekey 和回调，默认 `token-widget`。

### Cloudflare Turnstile

Turnstile 使用 `challenges.cloudflare.com/turnstile` 和 `cf-turnstile`，模式可能是 managed、non-interactive、invisible 或 checkbox。记录 `sitekey`、`action`、`cdata`、callback 名。证据明确是 invisible/managed/no user interaction 时可报 `risk-score`；checkbox/一键按钮明显时可报 `one-click`；只有组件参数时报 `token-widget`。

不要把 Turnstile 和 Cloudflare WAF challenge page 混为一谈。Turnstile 是组件；`cf_clearance`、“Just a moment”、`/cdn-cgi/challenge-platform/` 更像 WAF/challenge 流程。

### GeeTest 极验

极验 v3 常见 `gt` 和 `challenge`。极验 v4 常见 `captcha_id`、`lot_number`、`pass_token`、`gen_time`、`w`。产品形态包括滑块、点选/icon、gobang、自适应/无感等。

对国内厂商，视觉识别只是其中一层。要把图片偏移/点击坐标和加密参数、浏览器绑定分开说明。

### 腾讯 TCaptcha

常见信号是 `captcha.gtimg.com`、`TCaptcha`、`TencentCaptcha`、`aid`、`appid`、`randstr`、`ticket`。公开产品形态包括滑块、图形/点选、语音、一键、无感/隐形等；证据不足时不要固定成滑块。

报告中保留命中的参数名，因为 `ticket` 和 `randstr` 往往与页面/session 状态绑定。

### 网易易盾

常见信号是 `captcha.yidun`、`dun.163.com`、`NECaptcha`、`captchaId`、`validate`、`fp`。产品形态包括滑块、点选和无感/风控验证。

易盾通常会把行为采集和指纹采集与可见题面混在一起，不要只按图片题处理。

### 阿里云验证码

常见信号是 `AWSC`、`NoCaptcha`、`nc_`、`afs`、`aliyuncs.com`、`appkey`、`scene`。产品形态包括滑块、一点即过、无痕/无感、拼图和图像复原等。

`sessionId`、`sig`、`token` 都可能是绑定材料，示例中可使用占位符表示。

### 数美验证码

数美 Web SDK 常见信号是 `castatic.fengkongcloud.cn/pr/.../smcp.min.js`、`initSMCaptcha`、`SMCaptcha.getResult()`、`organization`、`appendTo`、`rid`、`pass`。产品可能是滑块、点选、智能验证或无感验证。

报告中不要只输出“数美”。要同时说明命中的 SDK、配置项和可见题型。如果只有 `organization` 这类通用词，必须要求更多证据。

### 顶象验证码

顶象产品页强调智能无感验证和多种二次验证形态，常见信号包括 `dingxiang-inc.com`、`cdn.dingxiang-inc.com`、`captcha-ui/v5/index.js`、`dx-captcha`、`_dx.Captcha`、`appId`、`constId`、`apiServer`。

顶象可见形态很多：滑动拼图、文字点选、图标点选、语序点选、刮刮卡、空间语义、乱序拼图、旋转、面积验证、差异点击、语音验证、字体识别、滑动还原等。厂商判断和类型判断要分开，不能命中顶象后固定判成滑块。

### 百度智能云验证码

百度智能云验证码产品页常见信号是 `cloud.baidu.com/product-s/afd_s/captcha`、`console.bce.baidu.com/afd/captcha`、`验证码 Captcha-百度智能云`。产品形态包括滑块验证码、数字验证码、文字验证码和轨迹绘制。

如果只有 `bdstatic` 或 `baidu`，置信度不足；需要配合验证码产品页、控制台路径、题型文案或 SDK 接入材料。

### 京东云验证码

京东云验证码文档常见信号是 `docs.jdcloud.com/cn/captcha`、`Jcap.create`、`PC/M端 SDK接入` 和京东云验证码产品名。常见材料包括 `appId`、`sceneId`、回调结果和验证 token。

`jd.com`、`joya.js`、`qidian-sdk` 只是京东生态常见资源，不足以单独判断为京东云验证码。

### 云片行为验证

云片行为验证常见信号是 `yunpian.com/product/captcha`、`riddler-sdk`、`YpRiddler`、`行为式验证码`。可见产品形态包括滑动拼图和图中点选。

云片同时提供短信/语音验证码服务。遇到“短信验证码”“语音验证码”时，不进入网页验证码求解方案，只能说明安全边界或让用户改为人工流程。

### 华为/同盾类风控验证

华为云公开材料里更多见的是平台图形验证码或 OneAccess 集成场景；同盾更多是设备风险、无感和风控链路。它们不一定是独立可见验证码产品。

命中 `huaweicloud`、`OneAccess`、`tongdun`、`fraudmetrix`、`blackbox`、`tokenId` 时，优先输出“疑似平台/风控验证”，要求补充脚本 URL、接口名和可见题面。不要把它们强行归成滑块。

### AWS WAF

常见信号是 `aws-waf-token`、`awswaf`、`aws-waf-captcha`、`challenge.js`、图片分类题面。AWS WAF 可能展示类似验证码的九宫格，但本质是 WAF challenge 流程的一部分。

除非用户只关心可见网格题的分类，否则整体类型优先报 `waf-challenge`。

### DataDome

常见信号是 `datadome` cookie、`x-datadome` header、`ddcid`、DataDome JS。它主要是 bot mitigation 和设备/session 绑定，不是简单图片验证码。

重点放在环境诊断和自有/授权测试边界。

### Arkose / FunCaptcha

常见信号是 `arkoselabs`、`funcaptcha`、`client-api.arkoselabs.com`、`fc-token`、`public_key`、`pkey`、`surl`、`blob`。Arkose 可能展示 3D、小游戏或图片任务。

只有组件参数但命中 Arkose/FunCaptcha 时通常先报 `game-challenge`，并说明尚未看到具体题面；如果现场证据显示只是嵌入组件且未出题，可补充 `token-widget`。看到具体题面后，再按 `click-select`、`grid`、`rotate` 或其他子类型补充。

### 海外组件与 PoW 产品

Yandex SmartCaptcha、CaptchaFox、Prosopo/Procaptcha、TrustCaptcha、MTCaptcha、KeyCaptcha 更接近组件/token 类产品。FriendlyCaptcha、ALTCHA、Private Captcha、Cap.js、mCaptcha 更接近 `pow-challenge`。常见判断依据是官方脚本域名、`sitekey`、callback、隐藏 response 字段、PoW challenge 或产品专有 DOM 标记。

没有展示图片题时，组件类默认分类为 `token-widget`，PoW 类默认分类为 `pow-challenge`。如果后续出现具体图片网格、点选、旋转或小游戏题，再按可见题面补充或改判类型。

### 传统图片验证码库

BotDetect、Securimage、Amazon CAPTCHA、Kaptcha、EasyCaptcha、HappyCaptcha 多数是传统文字/图片验证码库。强信号包括 `BotDetect`、`BDC_CaptchaDiv`、`securimage_show.php`、`opfcaptcha.amazon.com`、`/errors/validateCaptcha`、`Kaptcha` 等库名或文件名。

这类通常分类为 `text` 或 `math`。重点是提取精确图片、确认字符集和刷新行为。

### 自托管行为验证码库

AJ-Captcha 和 Tianai Captcha 常见于自托管 Java/Web 项目。AJ-Captcha 常见 `blockPuzzle`、`clickWord`、`captchaVerification`；Tianai 常见 `tianai-captcha`、`TAC`、滑块/旋转/点选类型配置。

这类产品经常被站点二次封装。识别时保留库名、接口路径和可见题型，避免把业务自己的 `/captcha/get`、`/captcha/check` 泛化成某个具体库。

### Bot Management / WAF 产品

Cloudflare WAF、Akamai Bot Manager、Imperva/Incapsula、PerimeterX/HUMAN、Kasada、Netacea、Radware Bot Manager、F5 Bot Defense 和 DataDome 都应优先视为 `waf-challenge`。常见证据是 challenge 页面、clearance cookie、传感器脚本、专有 cookie/header、状态码和响应头。

这类产品即使展示可见验证码，也不等于普通图片验证码。报告应优先说明产品识别、浏览器环境、TLS/HTTP 指纹、cookie/session 绑定、JS challenge 过期和授权测试边界。
