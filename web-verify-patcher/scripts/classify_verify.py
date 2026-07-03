#!/usr/bin/env python3
"""离线网页验证码/验证类型分类器。

脚本接收 HTML、文本、URL 和截图元信息；不会发送请求、打开浏览器、
提交答案或调用任何打码/solver 服务。
"""

from __future__ import annotations

import argparse
import html as html_lib
import json
import math
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


def configure_utf8_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


configure_utf8_stdio()


@dataclass(frozen=True)
class Signal:
    label: str
    pattern: str
    weight: float = 1.0


@dataclass(frozen=True)
class Match:
    label: str
    weight: float
    evidence: str
    source: str


@dataclass(frozen=True)
class EvidenceSource:
    kind: str
    text: str


SOURCE_WEIGHTS = {
    "url": 1.8,
    "text": 1.45,
    "screenshot_meta": 1.45,
    "html": 0.75,
}


HTML_FOCUS_KEYWORDS = re.compile(
    r"captcha|验证码|geetest|hcaptcha|recaptcha|turnstile|cf-turnstile|g-recaptcha|h-captcha|"
    r"yidun|NECaptcha|dun\.163|TCaptcha|TencentCaptcha|gtimg|AWSC|NoCaptcha|nc_|"
    r"TJCaptcha|turing\.captcha|aliyun|aws-waf|awswaf|DataDome|arkoselabs|FunCaptcha|"
    r"shumei|ishumei|fengkongcloud|initSMCaptcha|SMCaptcha|dingxiang|dx-captcha|_dx|"
    r"baidu|bdstatic|bce\.baidu|jdcloud|Jcap|yunpian|riddler-sdk|huawei|HuaWei|OneAccess|"
    r"tongdun|fraudmetrix|yandex|smart-captcha|CaptchaFox|procaptcha|prosopo|trustcaptcha|"
    r"privatecaptcha|cap-widget|@cap\.js|mcaptcha|IconCaptcha|BotDetect|BDC_|securimage|"
    r"visualcaptcha|opfcaptcha|validateCaptcha|amzn-captcha|CyberSiARA|siara|akamai|_abck|bm_sz|imperva|incapsula|reese84|"
    r"perimeterx|px-captcha|_px3|kasada|kpsdk|x-kpsdk|netacea|radware|f5|TSPD|"
    r"AJ-Captcha|aj-captcha|blockPuzzle|clickWord|tianai|TAC|happy-captcha|easy-captcha|"
    r"mtcaptcha|friendlycaptcha|slider|slide|jigsaw|picture-click|click|rotate|grid|"
    r"audio|voice|one-click|checkbox|press|hold|invisible|frictionless|risk[- ]?score|"
    r"proof-of-work|pow|hashcash|drag|drop|trace|draw|scratch|restore|unscramble|area|"
    r"difference|spot[- ]the[- ]difference|font|dice|game|3d|paged|multi[- ]step|logic|qa|"
    r"liveness|biometric|face|"
    r"语音|一键|一点即过|无感|无痕|评分|拖放|轨迹|绘制|连线|刮刮卡|还原|复原|乱序|"
    r"面积|区域|框选|差异|找茬|字体|空间语义|语义|小游戏|多轮|分页|问答|逻辑|活体|人脸|"
    r"sitekey|challenge",
    re.IGNORECASE,
)


PROVIDER_SIGNALS: dict[str, list[Signal]] = {
    "recaptcha": [
        Signal("命中 Google reCAPTCHA 脚本", r"(?:google\.com|recaptcha\.net)/recaptcha", 3),
        Signal("命中 g-recaptcha 标记", r"\bg-recaptcha\b", 2.5),
        Signal("命中 grecaptcha API", r"\bgrecaptcha\b", 2),
        Signal("命中 reCAPTCHA api2 iframe", r"/api2/(?:anchor|reload|bframe)", 2.5),
        Signal("命中 reCAPTCHA Enterprise", r"recaptcha/(?:enterprise|enterprise\.js)", 2.5),
        Signal("命中 g-recaptcha-response 字段", r"g-recaptcha-response", 2),
    ],
    "hcaptcha": [
        Signal("命中 hCaptcha 脚本", r"hcaptcha\.com/(?:1/)?api\.js|newassets\.hcaptcha\.com", 3),
        Signal("命中 h-captcha 标记", r"\bh-captcha\b", 2.5),
        Signal("命中 hcaptcha API", r"\bhcaptcha\b", 2),
        Signal("命中 hCaptcha get/check 接口", r"/(?:getcaptcha|checkcaptcha)/", 2),
        Signal("命中 h-captcha-response 字段", r"h-captcha-response", 2),
        Signal("命中 hCaptcha rqdata/rqtoken", r"\brq(?:data|token)\b", 1.5),
    ],
    "cloudflare-turnstile": [
        Signal("命中 Turnstile 脚本", r"challenges\.cloudflare\.com/turnstile", 3),
        Signal("命中 cf-turnstile 标记", r"\bcf-turnstile\b", 3),
        Signal("命中 turnstile API", r"\bturnstile\.(?:render|execute|reset)\b", 2),
        Signal("命中 cf-turnstile-response 字段", r"cf-turnstile-response", 2.5),
        Signal("命中 Turnstile cdata/action", r"\b(?:cdata|data-cdata|data-action)\b", 1),
    ],
    "geetest": [
        Signal("命中极验关键词", r"\bgeetest\b|极验", 2.5),
        Signal("命中极验 gt/challenge", r"\bgt\s*[:=]|challenge\s*[:=]", 1.5),
        Signal("命中极验 captcha_id", r"\bcaptcha_id\b", 2),
        Signal("命中极验 v4 lot/pass/gen 参数", r"\b(?:lot_number|pass_token|gen_time)\b", 2),
        Signal("命中极验 w 载荷", r"(?<![a-z0-9_])w\s*[:=]\s*[\"'][A-Za-z0-9_-]{20,}", 1),
    ],
    "tencent-tcaptcha": [
        Signal("命中腾讯验证码文档/产品 URL", r"cloud\.tencent\.com/(?:document/product/1110|product/1110)|tencentcloud\.com/products/captcha|007\.qq\.com", 3),
        Signal("命中腾讯验证码域名", r"captcha\.gtimg\.com|ssl\.captcha\.qq\.com|turing\.captcha\.qcloud\.com", 3),
        Signal("命中腾讯验证码 API", r"\b(?:TCaptcha|TJCaptcha|TencentCaptcha|tencentcaptcha)\b", 2.5),
        Signal("命中腾讯 aid/appid", r"\b(?:aid|appid|CaptchaAppId)\s*[:=]", 1),
        Signal("命中腾讯 randstr/ticket", r"\brandstr\b|\brandstr\b.{0,80}\bticket\b|\bticket\b.{0,80}\brandstr\b", 2),
        Signal("命中腾讯验证码文案", r"腾讯(?:验证码|防水墙)", 2),
    ],
    "netease-yidun": [
        Signal("命中易盾域名", r"captcha\.yidun|dun\.163\.com", 3),
        Signal("命中易盾关键词", r"\byidun\b|网易易盾|易盾|NECaptcha", 2.5),
        Signal("命中易盾 captchaId", r"(?:NECaptcha|yidun|易盾|dun\.163\.com|captcha\.yidun).{0,120}\bcaptchaId\b|\bcaptchaId\b.{0,120}(?:NECaptcha|yidun|易盾|dun\.163\.com|captcha\.yidun)", 1.5),
        Signal("命中易盾 validate/fp", r"(?:NECaptcha|yidun|易盾|dun\.163\.com|captcha\.yidun).{0,120}\b(?:validate|acToken|fp)\b|\b(?:validate|acToken|fp)\b.{0,120}(?:NECaptcha|yidun|易盾|dun\.163\.com|captcha\.yidun)", 0.8),
    ],
    "aliyun-captcha": [
        Signal("命中阿里云域名", r"aliyun\.com|aliyuncs\.com|g\.alicdn\.com/(?:AWSC|nc)", 1.5),
        Signal("命中阿里云 AWSC/NoCaptcha", r"g\.alicdn\.com/AWSC|AWSC\.use|NoCaptcha|\bnc_", 2.5),
        Signal("命中阿里云 afs/文案", r"\bafs\b|阿里云(?:验证码|滑块|智能验证)", 2),
        Signal("命中阿里云 appkey/scene", r"\b(?:appkey|scene|sessionId|sig)\b", 1),
    ],
    "shumei-captcha": [
        Signal("命中数美验证码文档/域名", r"help\.ishumei\.com/docs/tw/captcha|ishumei\.com/.{0,80}(?:captcha|验证码)", 3),
        Signal("命中数美验证码静态资源", r"castatic(?:-[a-z0-9]+)?\.fengkongcloud\.cn/pr/.{0,80}smcp\.min\.js|fengkongcloud\.cn/.{0,80}smcp", 3),
        Signal("命中数美验证码 API", r"\b(?:initSMCaptcha|SMCaptcha|smCaptchaCallback)\b", 2.8),
        Signal("命中数美组织/结果参数", r"\b(?:organization|appendTo|rid|pass)\b.{0,120}(?:SMCaptcha|initSMCaptcha|fengkongcloud|数美)|(?:SMCaptcha|initSMCaptcha|fengkongcloud|数美).{0,120}\b(?:organization|appendTo|rid|pass)\b", 1.5),
        Signal("命中数美中文名称", r"数美(?:智能)?验证码|数美", 1.5),
    ],
    "dingxiang-captcha": [
        Signal("命中顶象官网/资源", r"dingxiang-inc\.com/.{0,120}(?:captcha|验证码)|cdn\.dingxiang-inc\.com/.{0,120}(?:captcha|ctu-group)", 3),
        Signal("命中顶象验证码脚本", r"(?:dx-captcha|dxCaptcha|DXCaptcha|_dx\.Captcha|dx\.Captcha|captcha-ui/v\d+/index\.js)", 3),
        Signal("命中顶象参数", r"\b(?:appId|constId|apiServer|dxToken|dx_captcha)\b.{0,120}(?:dingxiang|顶象|dx-captcha|_dx)|(?:dingxiang|顶象|dx-captcha|_dx).{0,120}\b(?:appId|constId|apiServer|dxToken|dx_captcha)\b", 1.8),
        Signal("命中顶象中文名称", r"顶象(?:验证码|无感验证|第五代验证码)|智能无感验证", 2.2),
    ],
    "baidu-captcha": [
        Signal("命中百度智能云验证码产品页", r"cloud\.baidu\.com/(?:product-s/afd_s/captcha|doc/AFD/)", 3),
        Signal("命中百度验证码资源/控制台", r"bce\.bdstatic\.com/.{0,120}(?:captcha|验证码)|console\.bce\.baidu\.com/afd/captcha", 2.5),
        Signal("命中百度验证码中文名称", r"百度(?:智能云)?(?:智能安全)?验证码|验证码 Captcha-百度智能云", 2.5),
        Signal("命中百度验证码形态", r"(?:滑块验证码|数字验证码|文字验证码|轨迹绘制).{0,120}百度", 1.5),
    ],
    "jdcloud-captcha": [
        Signal("命中京东云验证码文档/域名", r"docs\.jdcloud\.com/(?:cn/)?captcha|jdcloud\.com/.{0,80}验证码", 3),
        Signal("命中京东云 Jcap SDK", r"\b(?:Jcap|jcap)\.(?:create|init|verify|destroy)\b|Jcap\.create", 3),
        Signal("命中京东云验证码名称", r"京东云(?:验证码|行为空间验证)|PC/M端 SDK接入.{0,40}验证码", 2),
        Signal("命中京东云参数", r"\b(?:appId|sceneId|productId)\b.{0,120}(?:Jcap|jdcloud|京东云)|(?:Jcap|jdcloud|京东云).{0,120}\b(?:appId|sceneId|productId)\b", 1.5),
    ],
    "yunpian-captcha": [
        Signal("命中云片行为验证产品页", r"yunpian\.com/(?:product/captcha|official/.{0,80}captcha)", 3),
        Signal("命中云片 Riddler SDK", r"riddler-sdk|YpRiddler|Riddler", 3),
        Signal("命中云片中文名称", r"云片(?:行为验证|行为式验证码|验证码)", 2.5),
        Signal("命中云片验证形态", r"(?:滑动拼图|图中点选|触发式|嵌入式).{0,120}云片", 1.5),
    ],
    "huawei-captcha": [
        Signal("命中华为云/OneAccess 验证码文档", r"support\.huaweicloud\.com/.{0,120}(?:captcha|验证码)|huaweicloud\.com/.{0,120}(?:captcha|验证码|图形验证码)", 2.8),
        Signal("命中华为图形验证码接口", r"(?:HuaWei|Huawei|huaweicloud).{0,120}(?:captcha|图形验证码|captchaId|validateCode)|(?:captchaId|validateCode).{0,120}(?:HuaWei|Huawei|huaweicloud|华为)", 2),
        Signal("命中华为中文名称", r"华为云.{0,40}(?:验证码|图形验证码|人机验证)|OneAccess.{0,80}(?:验证码|图形验证码)", 2),
    ],
    "tongdun-risk": [
        Signal("命中同盾/数科风控域名", r"tongdun\.cn|tongdun\.net|fraudmetrix\.cn|fraudmetrix\.com", 2.8),
        Signal("命中同盾设备/风控参数", r"\b(?:blackbox|tokenId|riskToken)\b.{0,120}(?:tongdun|fraudmetrix|同盾)|(?:tongdun|fraudmetrix|同盾).{0,120}\b(?:blackbox|tokenId|riskToken)\b", 1.8),
        Signal("命中同盾中文名称", r"同盾(?:科技|数科)?.{0,40}(?:验证码|人机|无感|风控验证)", 2),
    ],
    "cloudflare-waf": [
        Signal("命中 Cloudflare challenge 平台", r"/cdn-cgi/challenge-platform|cf_chl|cf-mitigated", 3),
        Signal("命中 Cloudflare clearance", r"\bcf_clearance\b", 3),
        Signal("命中 Cloudflare challenge 文案", r"Just a moment|Checking if the site connection is secure|Checking your browser", 2.5),
        Signal("命中 Cloudflare Ray ID", r"Cloudflare Ray ID|cf-ray", 1.5),
    ],
    "aws-waf": [
        Signal("命中 AWS WAF 文档/域名", r"docs\.aws\.amazon\.com/waf|AWS WAF", 3),
        Signal("命中 AWS WAF token", r"aws-waf-token", 3),
        Signal("命中 AWS WAF 关键词", r"\bawswaf\b|aws-waf-captcha|waf_captcha", 2.5),
        Signal("命中 AWS WAF challenge.js", r"challenge\.js.*aws|aws.*challenge\.js", 2),
        Signal("命中 AWS WAF captcha_voucher", r"\bcaptcha_voucher\b", 2),
    ],
    "datadome": [
        Signal("命中 DataDome 关键词", r"\bdatadome\b|DataDome", 3),
        Signal("命中 x-datadome header", r"x-datadome", 2.5),
        Signal("命中 DataDome 标识参数", r"\b(?:ddcid|ddv|initialCid|cid)\b", 1.5),
    ],
    "arkose-funcaptcha": [
        Signal("命中 Arkose 域名", r"arkoselabs\.com|client-api\.arkoselabs", 3),
        Signal("命中 FunCaptcha 关键词", r"\bfuncaptcha\b|FunCaptcha", 2.5),
        Signal("命中 Arkose fc-token", r"\bfc-token\b", 2),
        Signal("命中 Arkose public key/blob", r"\b(?:public_key|pkey|surl|blob)\b", 1.5),
    ],
    "mtcaptcha": [
        Signal("命中 MTCaptcha 域名", r"mtcaptcha\.com", 3),
        Signal("命中 MTCaptcha 配置", r"\bMTCaptcha\b|\bmtcaptchaConfig\b|mtcaptcha-verifiedtoken", 2),
    ],
    "keycaptcha": [
        Signal("命中 KeyCaptcha 关键词", r"\bkeycaptcha\b|\bKeyCaptcha\b", 3),
        Signal("命中 KeyCaptcha 参数", r"\bs_s_c_(?:user_id|session_id|web_server_sign)\b|\bkc_cid\b", 2),
    ],
    "friendlycaptcha": [
        Signal("命中 FriendlyCaptcha 关键词", r"friendlycaptcha|friendly-challenge|frc-captcha", 3),
    ],
    "altcha": [
        Signal("命中 ALTCHA 关键词", r"\baltcha\b|altcha-widget|challengeurl", 3),
    ],
    "yandex-smartcaptcha": [
        Signal("命中 Yandex SmartCaptcha 脚本/域名", r"smartcaptcha\.yandexcloud\.net|yandex\.cloud/.{0,80}smartcaptcha", 3),
        Signal("命中 SmartCaptcha 标记/API", r"smart-captcha|window\.smartCaptcha|smartCaptcha\.(?:render|execute|reset)", 3),
        Signal("命中 Yandex SmartCaptcha 名称", r"Yandex SmartCaptcha|SmartCaptcha", 2.5),
    ],
    "captchafox": [
        Signal("命中 CaptchaFox 域名", r"captchafox\.com|docs\.captchafox\.com|api\.captchafox\.com", 3),
        Signal("命中 CaptchaFox API/标记", r"\bCaptchaFox\b|captchafox\.(?:render|execute|reset)|cf-captcha", 2.5),
    ],
    "prosopo-procaptcha": [
        Signal("命中 Prosopo/Procaptcha 域名", r"prosopo\.io|procaptcha\.com|portal\.prosopo\.io", 3),
        Signal("命中 Procaptcha 资源/API", r"\b(?:procaptcha|Prosopo)\b|@prosopo/(?:procaptcha|captcha)|prosopo-procaptcha", 2.8),
    ],
    "trustcaptcha": [
        Signal("命中 TrustCaptcha 域名", r"trustcaptcha\.com|trustcomponent\.com", 3),
        Signal("命中 TrustCaptcha API/组件", r"\bTrustCaptcha\b|trustcaptcha(?:Init|\.render)?|trustcaptcha-container", 2.5),
    ],
    "private-captcha": [
        Signal("命中 Private Captcha 域名", r"privatecaptcha\.com|api\.privatecaptcha\.com", 3),
        Signal("命中 PrivateCaptcha 组件", r"\bPrivateCaptcha\b|private-captcha|privatecaptcha(?:\.render)?", 2.5),
    ],
    "capjs": [
        Signal("命中 Cap.js 包/站点", r"@cap\.js/(?:widget|server)|capjs\.js\.org|trycap\.dev", 3),
        Signal("命中 Cap.js 组件", r"\bcap-widget\b|data-cap-api-endpoint|\bCapWidget\b", 2.8),
    ],
    "mcaptcha": [
        Signal("命中 mCaptcha 域名/名称", r"mcaptcha\.org|\bmCaptcha\b|\bmcaptcha\b", 3),
        Signal("命中 mCaptcha PoW/组件", r"proof[- ]of[- ]work.{0,80}mcaptcha|mcaptcha-widget|data-mcaptcha", 2),
    ],
    "iconcaptcha": [
        Signal("命中 IconCaptcha 组件", r"\bIconCaptcha\b|iconcaptcha(?:\.render|\.init)?|icon-captcha", 3),
        Signal("命中 IconCaptcha 资源", r"iconcaptcha\.com|fabianwennink/IconCaptcha", 2.5),
    ],
    "botdetect": [
        Signal("命中 BotDetect 域名/名称", r"captcha\.com|BotDetect|BotDetectCaptcha", 3),
        Signal("命中 BotDetect DOM/字段", r"\bBDC_(?:CaptchaDiv|BackLink|ReloadIcon|SoundIcon)\b|captchaCode", 2.5),
    ],
    "securimage": [
        Signal("命中 Securimage 名称", r"\bSecurimage\b|securimage\.com", 3),
        Signal("命中 Securimage 文件", r"securimage_(?:show|play)\.php|securimage\.php", 2.8),
    ],
    "visualcaptcha": [
        Signal("命中 visualCaptcha 名称/资源", r"\bvisualCaptcha\b|visualcaptcha\.net|emotionLoop/visualCaptcha", 3),
        Signal("命中 visualCaptcha 图片选择", r"visualcaptcha.{0,120}(?:image|audio|accessibility)|(?:image|audio).{0,120}visualcaptcha", 1.8),
    ],
    "amazon-captcha": [
        Signal("命中 Amazon CAPTCHA 资源", r"opfcaptcha\.amazon\.com|/errors/validateCaptcha", 3),
        Signal("命中 Amazon CAPTCHA 表单", r"\b(?:amzn-captcha|validateCaptcha|cvf_captcha)\b", 2.5),
        Signal("命中 Amazon 图片验证码文案", r"Enter the characters you see below|Type the characters you see in this image", 2),
    ],
    "cybersiara": [
        Signal("命中 CyberSiARA 域名/名称", r"cybersiara\.com|\bCyberSiARA\b|\bSiARA\b", 3),
        Signal("命中 CyberSiARA 组件/脚本", r"siara\.js|siara(?:Captcha|Protection|SDK)", 2.2),
    ],
    "aj-captcha": [
        Signal("命中 AJ-Captcha 名称", r"\bAJ-Captcha\b|anji-plus|ajcaptcha", 3),
        Signal("命中 AJ-Captcha 常见接口/类型", r"\b(?:blockPuzzle|clickWord|captchaVerification)\b.{0,120}(?:AJ-Captcha|ajcaptcha|anji)|(?:AJ-Captcha|ajcaptcha|anji).{0,120}\b(?:blockPuzzle|clickWord|captchaVerification)\b", 2.2),
    ],
    "tianai-captcha": [
        Signal("命中 Tianai Captcha 名称", r"tianai-captcha|TianaiCaptcha|天爱验证码", 3),
        Signal("命中 Tianai 前端标记", r"\bTAC\b.{0,120}(?:captcha|slider|rotate)|(?:captcha|slider|rotate).{0,120}\bTAC\b", 1.8),
    ],
    "easycaptcha": [
        Signal("命中 EasyCaptcha 名称", r"EasyCaptcha|easy-captcha|ele-admin/EasyCaptcha", 2.8),
    ],
    "happycaptcha": [
        Signal("命中 HappyCaptcha 名称", r"HappyCaptcha|happy-captcha", 2.8),
    ],
    "kaptcha": [
        Signal("命中 Kaptcha 名称", r"\bKaptcha\b|google kaptcha|com\.google\.code\.kaptcha", 2.5),
    ],
    "akamai-bot-manager": [
        Signal("命中 Akamai Bot Manager 名称", r"Akamai Bot Manager|Akamai Bot|Akamai.*(?:sensor|challenge)", 3),
        Signal("命中 Akamai Bot cookie/参数", r"\b(?:_abck|bm_sz|ak_bmsc|bm_sv|sensor_data)\b", 2.8),
        Signal("命中 Akamai challenge 资源", r"akamai|abck|bmak|_bm", 1.5),
    ],
    "imperva-incapsula": [
        Signal("命中 Imperva/Incapsula 名称", r"Imperva|Incapsula", 3),
        Signal("命中 Imperva cookie/脚本", r"\b(?:visid_incap|incap_ses|___utmvc|reese84|utmvc)\b", 2.8),
        Signal("命中 Imperva challenge 文案", r"Request unsuccessful\. Incapsula|Generated by cloudfront.*Incapsula", 1.8),
    ],
    "perimeterx-human": [
        Signal("命中 HUMAN/PerimeterX 名称", r"PerimeterX|HUMAN Security|Human Bot Defender", 3),
        Signal("命中 PerimeterX cookie/字段", r"\b(?:px-captcha|_px(?:2|3)?|pxvid|pxhd|pxcts)\b", 2.8),
        Signal("命中 PerimeterX 脚本/接口", r"collector-\w+\.px-cloud\.net|/api/v\d+/collector|pxAppId", 2),
    ],
    "kasada": [
        Signal("命中 Kasada 名称/域名", r"Kasada|kasada\.io", 3),
        Signal("命中 Kasada kpsdk", r"\b(?:x-kpsdk|kpsdk|_kpsdk|KP_UIDz|KP_UID)\b", 2.8),
        Signal("命中 Kasada 脚本", r"/(?:p|ips)\.js|/fp\?x-kpsdk", 1.8),
    ],
    "netacea": [
        Signal("命中 Netacea 名称", r"Netacea|netacea\.com", 3),
        Signal("命中 Netacea Bot Management", r"netacea.{0,80}(?:bot|challenge|captcha)|(?:bot|challenge|captcha).{0,80}netacea", 2),
    ],
    "radware-bot-manager": [
        Signal("命中 Radware Bot Manager 名称", r"Radware Bot Manager|radware\.com/.{0,80}bot", 3),
        Signal("命中 Radware challenge/cookie", r"\b(?:rbzid|rbzsessionid|RWD|TSPD_101)\b|radware.{0,80}challenge", 2.2),
    ],
    "f5-bot-defense": [
        Signal("命中 F5 Bot Defense 名称", r"F5 Bot Defense|Shape Security|F5 Distributed Cloud Bot Defense", 3),
        Signal("命中 F5/Shape cookie/脚本", r"\b(?:_imp_apg_r_|TS[0-9a-f]{3,}|TSPD_\d+)\b|shape(?:security)?\.js|f5_cspm", 2.3),
    ],
}


TYPE_SIGNALS: dict[str, list[Signal]] = {
    "audio": [
        Signal("命中语音验证码中文文案", r"语音验证码|音频验证码|听音验证|听到的(?:数字|字符|内容)|播放(?:语音|音频).*验证码", 3),
        Signal("命中语音验证码英文文案", r"\b(?:audio captcha|voice captcha|audio challenge|listen to the audio|play audio)\b", 3),
        Signal("命中音频播放资源", r"(?:captcha|challenge).{0,80}\.(?:mp3|wav|ogg)|(?:audio|voice)[-_]?(?:captcha|challenge)", 1.8),
    ],
    "drag-drop": [
        Signal("命中拖放中文文案", r"拖放|拖拽到|拖动(?:图形|图片|物体|方块|卡片|元素).{0,40}(?:目标|指定位置|区域|框内)|把.{0,20}拖到.{0,20}(?:目标|位置|区域)", 3),
        Signal("命中拖放英文文案", r"\b(?:drag[- ]and[- ]drop|drag the (?:item|object|shape|image)|drop (?:it|the item) (?:on|into|to)|drag to the target)\b", 3),
        Signal("命中拖放组件线索", r"\b(?:draggable|droppable|dropzone|drag-target)\b.{0,120}(?:captcha|verify|challenge)|(?:captcha|verify|challenge).{0,120}\b(?:draggable|droppable|dropzone|drag-target)\b", 1.8),
    ],
    "trace-draw": [
        Signal("命中轨迹绘制中文文案", r"轨迹绘制|绘制轨迹|画出轨迹|描绘轨迹|按轨迹滑动|连线验证|划线验证|画线验证", 3),
        Signal("命中轨迹绘制英文文案", r"\b(?:trace captcha|draw the path|draw a line|connect the dots|trace the pattern|draw captcha)\b", 3),
        Signal("命中轨迹字段", r"\b(?:track|trace|drawPath|trajectory|pathPoints)\b.{0,120}(?:captcha|verify|challenge)|(?:captcha|verify|challenge).{0,120}\b(?:track|trace|drawPath|trajectory|pathPoints)\b", 1.5),
    ],
    "scratch": [
        Signal("命中刮刮卡中文文案", r"刮刮卡|刮开|刮动|刮出验证码|刮开验证", 3),
        Signal("命中刮刮卡英文文案", r"\b(?:scratch card|scratch captcha|scratch to reveal|scratch verification)\b", 3),
    ],
    "image-restore": [
        Signal("命中图像还原中文文案", r"图像复原|图片复原|图片还原|图像还原|滑动还原|拼图还原|乱序拼图|拼图复原|还原图片|还原图像|切片乱序|分块乱序|图片分割|瓦片重排|分割顺序打乱|乱序图片还原|图片被切成多块", 3),
        Signal("命中图像还原英文文案", r"\b(?:image restore|image restoration|restore the image|unscramble|scrambled image|scrambled tiles|tile scramble|reorder the puzzle|reorder tiles|puzzle restoration)\b", 3),
        Signal("命中还原字段", r"\b(?:restore|restoreImage|scramble|unscramble|tileOrder|pieceOrder|tile_order|piece_order|restoreOrder|sliceOrder|background-position|drawImage|sprite|shuffle)\b.{0,120}(?:captcha|verify|challenge|image)|(?:captcha|verify|challenge|image).{0,120}\b(?:restore|restoreImage|scramble|unscramble|tileOrder|pieceOrder|tile_order|piece_order|restoreOrder|sliceOrder|background-position|drawImage|sprite|shuffle)\b", 1.8),
    ],
    "area-select": [
        Signal("命中区域选择中文文案", r"面积验证|区域选择|框选|圈出|选中区域|请选择区域|点击并拖拽选择|选择图片中.{0,20}区域", 3),
        Signal("命中区域选择英文文案", r"\b(?:area select|select the area|mark the area|draw a box|bounding box|region selection)\b", 3),
    ],
    "difference-click": [
        Signal("命中差异点击中文文案", r"差异点击|找不同|找茬|点击不同|点击差异|找出不同之处", 3),
        Signal("命中差异点击英文文案", r"\b(?:spot the difference|find the difference|difference click|click the difference)\b", 3),
    ],
    "font-identify": [
        Signal("命中字体识别中文文案", r"字体识别|同字体|不同字体|相同字体|字体相同|字体不同|选择.*字体", 3),
        Signal("命中字体识别英文文案", r"\b(?:font recognition|same font|different font|select the font|font captcha)\b", 3),
    ],
    "semantic-reasoning": [
        Signal("命中空间语义中文文案", r"空间语义|语义验证|语义推理|逻辑推理|点击(?:最左|最右|上方|下方|最大|最小|相邻|重叠|被遮挡).{0,30}(?:目标|物体|图形)", 3),
        Signal("命中空间语义英文文案", r"\b(?:semantic captcha|visual reasoning|spatial reasoning|select the (?:leftmost|rightmost|largest|smallest)|logic image challenge)\b", 3),
    ],
    "game-challenge": [
        Signal("命中小游戏中文文案", r"小游戏验证|游戏式验证|3D验证|三维验证|骰子|转动骰子|Arkose Enforcement|FunCaptcha", 3),
        Signal("命中小游戏英文文案", r"\b(?:game challenge|mini[- ]game|3d challenge|dice challenge|arkose enforcement|funcaptcha)\b", 3),
        Signal("命中 Arkose 游戏线索", r"\b(?:client-api\.arkoselabs|arkoselabs|fc-token)\b.{0,160}\b(?:game|3d|dice|enforcement)\b|\b(?:game|3d|dice|enforcement)\b.{0,160}\b(?:client-api\.arkoselabs|arkoselabs|fc-token)\b", 2),
    ],
    "pow-challenge": [
        Signal("命中 PoW 中文文案", r"工作量证明|算力证明|哈希难题|本地计算挑战|浏览器计算验证", 3),
        Signal("命中 PoW 英文文案", r"\b(?:proof[- ]of[- ]work|pow challenge|hashcash|computational puzzle|cryptographic puzzle)\b", 3),
        Signal("命中 PoW 组件", r"\b(?:friendlycaptcha|friendly-challenge|frc-captcha|altcha|privatecaptcha|private-captcha|cap-widget|@cap\.js|mcaptcha|mcaptcha-widget)\b", 2.5),
        Signal("命中 PoW 结果字段", r"\b(?:challengeurl|payload|signature|nonce|solution|difficulty|salt)\b.{0,120}(?:captcha|pow|challenge)|(?:captcha|pow|challenge).{0,120}\b(?:challengeurl|payload|signature|nonce|solution|difficulty|salt)\b", 1.6),
    ],
    "risk-score": [
        Signal("命中无感/评分中文文案", r"无感验证|无痕验证|智能无感|风险评分|评分验证|静默验证|后台评分|行为评分|无需用户操作", 3),
        Signal("命中无感/评分英文文案", r"\b(?:frictionless|invisible captcha|invisible challenge|risk score|score-based|passive captcha|behavior score|background verification|recaptcha v3)\b", 3),
        Signal("命中 reCAPTCHA v3", r"recaptcha/(?:api\.js|enterprise\.js).{0,120}\brender=.*?6L|\bgrecaptcha\.execute\b.{0,120}\baction\b|reCAPTCHA v3", 2.5),
    ],
    "one-click": [
        Signal("命中一键/点击中文文案", r"一键验证|一键通过|一点即过|点击完成验证|点击按钮完成验证|点此验证|按住完成验证|长按完成验证", 3),
        Signal("命中一键/点击英文文案", r"\b(?:one[- ]click captcha|one[- ]click verification|click to verify|press and hold|hold to verify|checkbox captcha|i am not a robot)\b", 3),
        Signal("命中 checkbox 组件线索", r"\b(?:checkbox|check-box)\b.{0,80}(?:captcha|verify|challenge)|(?:captcha|verify|challenge).{0,80}\b(?:checkbox|check-box)\b", 1.6),
    ],
    "multi-step": [
        Signal("命中多轮中文文案", r"多轮验证|多步验证|分页验证|下一题|继续验证|第\s*\d+\s*轮", 3),
        Signal("命中多轮英文文案", r"\b(?:multi[- ]step challenge|multi[- ]round captcha|paged challenge|next challenge|continue verification)\b", 3),
    ],
    "qa-logic": [
        Signal("命中问答中文文案", r"问答验证码|问题验证码|回答问题|请回答|安全问题验证|逻辑题验证码", 3),
        Signal("命中问答英文文案", r"\b(?:question captcha|qa captcha|answer the question|logic captcha|security question challenge)\b", 3),
    ],
    "biometric-liveness": [
        Signal("命中活体/生物识别中文文案", r"活体检测|人脸验证|刷脸验证|真人检测|眨眼|张嘴|摇头|点头", 3),
        Signal("命中活体/生物识别英文文案", r"\b(?:liveness detection|face verification|biometric verification|face captcha|selfie verification)\b", 3),
    ],
    "math": [
        Signal("命中算术文案", r"算术|请计算|计算(?:结果|答案)|math captcha|arithmetic", 3),
        Signal("命中算术表达式", r"\b\d{1,3}\s*(?:[+\-*/xX×÷])\s*\d{1,3}\b", 3),
        Signal("命中中文运算符", r"\d+\s*(?:加|减|乘以?|除以?)\s*\d+", 2.5),
    ],
    "slider": [
        Signal("命中滑块中文文案", r"滑块|拖动(?:滑块|拼图|手柄|滑条|滑动)|拖拽(?:滑块|拼图|手柄|滑条|滑动)|拼图|缺口|向右滑动|完成拼图|滑动验证|滑动式验证|滑动式|滑动拼图", 3),
        Signal("命中滑块英文文案", r"\b(?:slider|slide|jigsaw|puzzle|drag the slider|drag to complete|slider-captcha|slide verification)\b", 2.5),
        Signal("命中滑块图片命名", r"(?:bg|background|slice|piece|jigsaw)[-_]?(?:img|image|url)?", 1),
        Signal("命中滑块 class 名", r"class=[\"'][^\"']*(?:slider|slide|jigsaw|puzzle)", 1.5),
    ],
    "click-select": [
        Signal("命中点选中文文案", r"点选|文字点选|依次点击|请点击|按顺序点击|点击下图|点击图中|图中点选|点击.*(?:文字|数字|图标|目标)", 3),
        Signal("命中点选英文文案", r"picture-click|click-select|click captcha|icon captcha|\b(?:click|select|tap)\b.{0,40}\b(?:word|icon|object|target|in order|picture|image)\b", 2.5),
        Signal("命中坐标文案", r"坐标|目标点|click coordinates|target coordinates", 2),
    ],
    "rotate": [
        Signal("命中旋转中文文案", r"旋转|转正|拖动.*(?:角度|旋转)|调整.*方向", 3),
        Signal("命中旋转英文文案", r"\b(?:rotate|rotation|angle|upright|orientation)\b", 2.5),
        Signal("命中旋转 class 名", r"class=[\"'][^\"']*(?:rotate|rotation|angle)", 1.5),
    ],
    "grid": [
        Signal("命中九宫格中文文案", r"九宫格|9宫格|选择所有|请选择所有|宫格", 3),
        Signal("命中九宫格英文文案", r"\b(?:image grid|grid captcha|select all images|traffic lights|crosswalks|bicycles|bus|motorcycles)\b", 3),
        Signal("命中网格布局线索", r"\b(?:3x3|3 x 3|nine-grid|tile|tiles|cell|cells)\b", 1.5),
        Signal("命中 reCAPTCHA/hCaptcha 图片题线索", r"/recaptcha/api/fallback|\b(?:rc-imageselect|task-image|challenge-view|prompt-text)\b", 2),
    ],
    "token-widget": [
        Signal("命中 sitekey", r"\b(?:sitekey|data-sitekey|site-key)\b", 2.5),
        Signal("命中 callback/action", r"\b(?:callback|data-callback|action|data-action|enterprise)\b", 1),
        Signal("命中 response 字段", r"(?:g-recaptcha|h-captcha|cf-turnstile)-response", 2),
        Signal("命中组件模式文案", r"\b(?:managed|non-interactive|widget)\b", 1),
    ],
    "waf-challenge": [
        Signal("命中 Cloudflare challenge 线索", r"Just a moment|cf_clearance|cf_chl|/cdn-cgi/challenge-platform|cf-mitigated", 3),
        Signal("命中 WAF/反自动化文案", r"\b(?:WAF|web application firewall|bot mitigation|anti-bot|security check|checking your browser)\b", 2),
        Signal("命中 WAF token/cookie", r"aws-waf-token|datadome|akamai|imperva|incapsula|perimeterx|kasada|netacea|radware|px-captcha|_abck|bm_sz|x-kpsdk|reese84|cf_clearance|TSPD", 2.5),
    ],
    "text": [
        Signal("命中文字验证码中文文案", r"图形验证码|图片验证码|文字验证码|字符验证码|输入.*验证码|请输入.*验证码|看不清|换一张", 2),
        Signal("命中文字验证码英文文案", r"\b(?:text captcha|image captcha|verification code|enter the code|type the characters|image to text|retype the characters)\b", 1.5),
        Signal("命中验证码图片线索", r"<img[^>]+(?:captcha|verify|code)|(?:captcha|verify|code)[-_]?(?:img|image|url)", 1.5),
    ],
}


TILE_SCRAMBLE_SIGNALS = [
    Signal("命中切片乱序中文文案", r"切片乱序|分块乱序|图片分割|瓦片重排|分割顺序打乱|乱序图片还原|图片被切成多块|切成多块顺序打乱", 3),
    Signal("命中切片乱序英文文案", r"\b(?:scrambled tiles|tile scramble|scrambled image tiles|image tile restore|reorder tiles|slice order|piece order)\b", 3),
    Signal("命中切片顺序字段", r"\b(?:tileOrder|pieceOrder|tile_order|piece_order|restoreOrder|sliceOrder)\b", 2.5),
    Signal("命中 CSS sprite/背景定位切片", r"background-position|background-size|sprite", 2),
    Signal("命中 Canvas drawImage 切片绘制", r"\bdrawImage\s*\(", 2),
    Signal("命中 shuffle/scramble 切片逻辑", r"\b(?:shuffle|scramble|unscramble)\b.{0,100}\b(?:tile|piece|slice|image|captcha)\b|\b(?:tile|piece|slice|image|captcha)\b.{0,100}\b(?:shuffle|scramble|unscramble)\b", 1.8),
]


PLAYBOOKS = {
    "audio": "references/solution-playbooks.md#audio",
    "drag-drop": "references/solution-playbooks.md#drag-drop",
    "trace-draw": "references/solution-playbooks.md#trace-draw",
    "scratch": "references/solution-playbooks.md#scratch",
    "image-restore": "references/solution-playbooks.md#image-restore",
    "area-select": "references/solution-playbooks.md#area-select",
    "difference-click": "references/solution-playbooks.md#difference-click",
    "font-identify": "references/solution-playbooks.md#font-identify",
    "semantic-reasoning": "references/solution-playbooks.md#semantic-reasoning",
    "game-challenge": "references/solution-playbooks.md#game-challenge",
    "pow-challenge": "references/solution-playbooks.md#pow-challenge",
    "risk-score": "references/solution-playbooks.md#risk-score",
    "one-click": "references/solution-playbooks.md#one-click",
    "multi-step": "references/solution-playbooks.md#multi-step",
    "qa-logic": "references/solution-playbooks.md#qa-logic",
    "biometric-liveness": "references/solution-playbooks.md#biometric-liveness",
    "text": "references/solution-playbooks.md#text",
    "math": "references/solution-playbooks.md#math",
    "slider": "references/solution-playbooks.md#slider",
    "click-select": "references/solution-playbooks.md#click-select",
    "rotate": "references/solution-playbooks.md#rotate",
    "grid": "references/solution-playbooks.md#grid",
    "token-widget": "references/solution-playbooks.md#token-widget",
    "waf-challenge": "references/solution-playbooks.md#waf-challenge",
    "unknown-custom": "references/solution-playbooks.md#unknown-custom",
}


NEXT_EVIDENCE = {
    "audio": ["音频文件或播放接口", "题面文本", "答案格式", "是否有视觉替代方案"],
    "drag-drop": ["完整挑战截图", "被拖动元素和目标区域边界", "坐标系", "释放判定接口"],
    "trace-draw": ["轨迹图/题面截图", "目标路径坐标", "画布尺寸", "轨迹采样格式"],
    "scratch": ["刮刮卡区域截图", "刮开前后状态", "画布尺寸", "通过阈值"],
    "image-restore": ["乱序/待还原图片", "分块边界", "目标排列规则", "tileOrder/pieceOrder 或 CSS/canvas 切片线索", "拖动或滑动映射"],
    "area-select": ["完整题面截图", "待选择区域", "元素边界", "坐标原点"],
    "difference-click": ["两张对比图或完整截图", "差异点坐标", "题面", "点击次数要求"],
    "font-identify": ["题面文本", "候选文字截图", "字体目标规则", "点击顺序"],
    "semantic-reasoning": ["完整题面", "截图", "目标关系描述", "坐标系"],
    "game-challenge": ["小游戏截图/帧", "题面", "交互控件", "厂商 public key 或 challenge id"],
    "pow-challenge": ["组件脚本 URL", "challenge/payload", "difficulty/nonce 字段", "服务端校验接口"],
    "risk-score": ["脚本/iframe URL", "sitekey/action", "score/阈值文档", "服务端校验结果"],
    "one-click": ["组件 HTML", "按钮/checkbox 截图", "callback 名", "是否存在二次挑战"],
    "multi-step": ["每一轮题面截图", "轮次状态", "上一轮结果", "最终成功标记"],
    "qa-logic": ["问题原文", "答案格式", "语言/知识范围", "是否为动态题库"],
    "biometric-liveness": ["SDK/厂商标识", "活体动作要求", "授权和隐私边界", "人工复核流程"],
    "text": ["验证码图片或元素截图", "期望字符集/长度", "刷新接口或刷新行为"],
    "math": ["表达式图片/文本", "运算符集合", "服务端接受的答案格式"],
    "slider": ["背景图", "滑块/拼图块图片", "轨道宽度", "厂商 verify 接口名"],
    "click-select": ["题面文本", "完整挑战截图", "元素边界框", "目标点击顺序"],
    "rotate": ["挑战图片", "轨道宽度", "角度范围", "已知校准样本"],
    "grid": ["题面文本", "完整网格截图", "格子边界", "轮次/状态信息"],
    "token-widget": ["脚本/iframe URL", "sitekey", "页面 URL", "action/cdata/rqdata", "callback 名"],
    "waf-challenge": ["响应头", "challenge HTML", "cookie 名", "状态码", "challenge JS URL"],
    "unknown-custom": ["组件附近 HTML", "脚本 URL", "截图", "网络接口名"],
}


VERIFICATION_FLOW_BY_TYPE: dict[str, dict[str, list[str]]] = {
    "text": {
        "references": ["references/verification-workflow.md", "references/open-source-recipes.md"],
        "scripts": ["scripts/inspect_assets.py", "scripts/solver_request_template.py"],
    },
    "math": {
        "references": ["references/verification-workflow.md", "references/open-source-recipes.md"],
        "scripts": ["scripts/inspect_assets.py", "scripts/solver_request_template.py"],
    },
    "slider": {
        "references": [
            "references/verification-workflow.md",
            "references/open-source-recipes.md",
            "references/motion-and-coordinate.md",
            "references/provider-execution-notes.md",
        ],
        "scripts": ["scripts/inspect_assets.py", "scripts/map_coordinates.py", "scripts/generate_motion_track.py"],
    },
    "click-select": {
        "references": ["references/verification-workflow.md", "references/open-source-recipes.md", "references/motion-and-coordinate.md"],
        "scripts": ["scripts/inspect_assets.py", "scripts/map_coordinates.py", "scripts/solver_request_template.py"],
    },
    "rotate": {
        "references": ["references/verification-workflow.md", "references/open-source-recipes.md", "references/motion-and-coordinate.md"],
        "scripts": ["scripts/inspect_assets.py", "scripts/map_coordinates.py", "scripts/generate_motion_track.py"],
    },
    "grid": {
        "references": ["references/verification-workflow.md", "references/open-source-recipes.md", "references/motion-and-coordinate.md"],
        "scripts": ["scripts/inspect_assets.py", "scripts/map_coordinates.py", "scripts/solver_request_template.py"],
    },
    "audio": {
        "references": ["references/verification-workflow.md", "references/open-source-recipes.md"],
        "scripts": ["scripts/inspect_assets.py", "scripts/solver_request_template.py"],
    },
    "drag-drop": {
        "references": ["references/verification-workflow.md", "references/motion-and-coordinate.md"],
        "scripts": ["scripts/inspect_assets.py", "scripts/map_coordinates.py", "scripts/generate_motion_track.py"],
    },
    "trace-draw": {
        "references": ["references/verification-workflow.md", "references/motion-and-coordinate.md", "references/open-source-recipes.md"],
        "scripts": ["scripts/inspect_assets.py", "scripts/generate_motion_track.py"],
    },
    "scratch": {
        "references": ["references/verification-workflow.md", "references/motion-and-coordinate.md"],
        "scripts": ["scripts/inspect_assets.py", "scripts/generate_motion_track.py"],
    },
    "image-restore": {
        "references": ["references/verification-workflow.md", "references/open-source-recipes.md", "references/motion-and-coordinate.md"],
        "scripts": ["scripts/inspect_assets.py", "scripts/analyze_tile_restore.py", "scripts/map_coordinates.py", "scripts/solver_request_template.py"],
    },
    "area-select": {
        "references": ["references/verification-workflow.md", "references/open-source-recipes.md", "references/motion-and-coordinate.md"],
        "scripts": ["scripts/inspect_assets.py", "scripts/map_coordinates.py", "scripts/solver_request_template.py"],
    },
    "difference-click": {
        "references": ["references/verification-workflow.md", "references/open-source-recipes.md", "references/motion-and-coordinate.md"],
        "scripts": ["scripts/inspect_assets.py", "scripts/map_coordinates.py", "scripts/solver_request_template.py"],
    },
    "font-identify": {
        "references": ["references/verification-workflow.md", "references/open-source-recipes.md", "references/motion-and-coordinate.md"],
        "scripts": ["scripts/inspect_assets.py", "scripts/map_coordinates.py", "scripts/solver_request_template.py"],
    },
    "semantic-reasoning": {
        "references": ["references/verification-workflow.md", "references/open-source-recipes.md", "references/motion-and-coordinate.md"],
        "scripts": ["scripts/inspect_assets.py", "scripts/map_coordinates.py", "scripts/solver_request_template.py"],
    },
    "game-challenge": {
        "references": [
            "references/verification-workflow.md",
            "references/provider-execution-notes.md",
            "references/solver-platform-recipes.md",
        ],
        "scripts": ["scripts/inspect_assets.py", "scripts/solver_request_template.py"],
    },
    "pow-challenge": {
        "references": ["references/verification-workflow.md", "references/provider-execution-notes.md"],
        "scripts": ["scripts/inspect_assets.py", "scripts/solver_request_template.py"],
    },
    "risk-score": {
        "references": [
            "references/verification-workflow.md",
            "references/provider-execution-notes.md",
            "references/solver-platform-recipes.md",
        ],
        "scripts": ["scripts/inspect_assets.py", "scripts/solver_request_template.py"],
    },
    "one-click": {
        "references": ["references/verification-workflow.md", "references/provider-execution-notes.md", "references/solver-platform-recipes.md"],
        "scripts": ["scripts/inspect_assets.py", "scripts/solver_request_template.py"],
    },
    "multi-step": {
        "references": ["references/verification-workflow.md", "references/open-source-recipes.md", "references/motion-and-coordinate.md"],
        "scripts": ["scripts/inspect_assets.py", "scripts/map_coordinates.py", "scripts/generate_motion_track.py"],
    },
    "qa-logic": {
        "references": ["references/verification-workflow.md", "references/open-source-recipes.md"],
        "scripts": ["scripts/inspect_assets.py", "scripts/solver_request_template.py"],
    },
    "biometric-liveness": {
        "references": ["references/verification-workflow.md", "references/provider-execution-notes.md"],
        "scripts": ["scripts/inspect_assets.py"],
    },
    "token-widget": {
        "references": [
            "references/verification-workflow.md",
            "references/provider-execution-notes.md",
            "references/solver-platform-recipes.md",
        ],
        "scripts": ["scripts/inspect_assets.py", "scripts/solver_request_template.py"],
    },
    "waf-challenge": {
        "references": [
            "references/verification-workflow.md",
            "references/browser-acquisition.md",
            "references/provider-execution-notes.md",
        ],
        "scripts": ["scripts/inspect_assets.py", "scripts/solver_request_template.py"],
    },
    "unknown-custom": {
        "references": ["references/verification-workflow.md", "references/captcha-types.md", "references/provider-products.md"],
        "scripts": ["scripts/inspect_assets.py", "scripts/solver_request_template.py"],
    },
}


SOLUTION_OPTIONS: dict[str, dict[str, Any]] = {
    "text": {
        "open_source_first": ["ddddocr", "Tesseract + 字符白名单", "OpenCV 预处理后 OCR"],
        "fallback_platforms": ["云码/JFBYM", "超级鹰", "2Captcha ImageToText", "Anti-Captcha Image"],
        "when_to_switch": ["字符扭曲严重", "干扰线/背景噪声导致本地 OCR 低于目标通过率", "需要人工兜底"],
        "notes": "先做图片裁剪、二值化、降噪、字符集和长度约束；平台方案只作为授权 QA 的备选。",
    },
    "math": {
        "open_source_first": ["ddddocr/Tesseract 识别表达式", "正则归一化运算符", "安全表达式求值"],
        "fallback_platforms": ["云码/JFBYM 计算题类型", "超级鹰", "2Captcha Normal Captcha"],
        "when_to_switch": ["表达式被强干扰", "中文数字/竖排/应用题导致 OCR 不稳定"],
        "notes": "输出归一化表达式和结果，遇到歧义不要猜。",
    },
    "slider": {
        "open_source_first": ["ddddocr slide-match/slide-comparison", "OpenCV 模板/边缘/差分匹配", "轨迹模型与坐标校准"],
        "fallback_platforms": ["云码/JFBYM 滑块类型", "超级鹰滑块/坐标类型", "CapSolver", "2Captcha GeeTest/slider 类任务"],
        "when_to_switch": ["缺口弱边缘", "背景乱序/透明块", "厂商行为评分导致视觉偏移正确但验证失败"],
        "notes": "视觉偏移、DOM 坐标、拖动轨迹和厂商加密参数要分开分析。",
    },
    "click-select": {
        "open_source_first": ["OCR + 模板匹配", "YOLO/目标检测", "VLM 返回坐标与顺序"],
        "fallback_platforms": ["云码/JFBYM 坐标/点选类型", "超级鹰坐标类型", "2Captcha Coordinates/ClickCaptcha", "CapSolver ComplexImageTask"],
        "when_to_switch": ["目标重叠", "题面语义复杂", "多轮点选或顺序评分导致本地模型不稳定"],
        "notes": "必须同时输出题面、目标顺序、截图坐标和元素相对坐标。",
    },
    "rotate": {
        "open_source_first": ["OpenCV 特征/主方向检测", "图像匹配估计角度", "VLM 辅助判断正向"],
        "fallback_platforms": ["云码/JFBYM 旋转类型", "超级鹰旋转/坐标类型", "CapSolver/2Captcha 的图片任务"],
        "when_to_switch": ["图片对称", "角度映射非线性", "固定偏移需要大量样本校准"],
        "notes": "返回角度、拖动距离、轨道宽度和校准偏移。",
    },
    "grid": {
        "open_source_first": ["图像分割 + 分类模型", "YOLO/CLIP/VLM 按题面分类", "每格置信度复核"],
        "fallback_platforms": ["2Captcha Grid/reCAPTCHA", "CapSolver", "CapMonster Cloud", "Anti-Captcha", "NopeCHA"],
        "when_to_switch": ["reCAPTCHA/hCaptcha 多轮题", "目标跨格或低分辨率", "题面语义超出本地模型"],
        "notes": "输出格子编号和中心坐标，预期多轮验证。",
    },
    "audio": {
        "open_source_first": ["faster-whisper/Whisper 本地转写", "降噪和静音裁剪", "数字/字符白名单纠错"],
        "fallback_platforms": ["2Captcha Audio", "CapMonster/Anti-Captcha 支持的音频或人工任务", "人工复核"],
        "when_to_switch": ["强噪声", "口音/多语言", "音频一次性有效且本地 ASR 不稳定"],
        "notes": "只处理网页音频验证码，不处理电话语音 OTP、短信、邮箱或 MFA。",
    },
    "drag-drop": {
        "open_source_first": ["OpenCV/目标检测定位源对象和目标区", "VLM 判断拖放关系", "DOM 坐标和释放点校准"],
        "fallback_platforms": ["云码/JFBYM 坐标类型", "超级鹰坐标类型", "CapSolver ComplexImageTask", "人工接管"],
        "when_to_switch": ["目标区域不明确", "动画/吸附规则复杂", "拖放路径被行为评分"],
        "notes": "和水平滑块不同，重点是源对象、目标区域和释放点。",
    },
    "trace-draw": {
        "open_source_first": ["OpenCV 边缘/颜色分割", "骨架化提取路径", "点列重采样和轨迹平滑"],
        "fallback_platforms": ["云码/JFBYM 轨迹类型", "超级鹰坐标/轨迹类", "人工标注"],
        "when_to_switch": ["路径被遮挡", "轨迹采样格式未知", "需要大量样本校准速度/间隔"],
        "notes": "输出点列格式、采样间隔、坐标原点和画布尺寸。",
    },
    "scratch": {
        "open_source_first": ["canvas 区域识别", "规则化覆盖轨迹", "刮开前后状态差分"],
        "fallback_platforms": ["人工接管", "云码/JFBYM 其他类型定制", "超级鹰人工/定制"],
        "when_to_switch": ["通过阈值未知", "移动端触摸事件差异", "刮开后还有二次文字/图像题"],
        "notes": "优先分析覆盖比例和状态变化；刮开后出现题面再转入对应子类型。",
    },
    "image-restore": {
        "open_source_first": ["先判定 tile-scramble 切片乱序", "优先从 tileOrder/pieceOrder/CSS background-position/canvas drawImage 还原顺序", "再用 OpenCV/Pillow 边缘连续性和纹理匹配"],
        "fallback_platforms": ["云码/JFBYM 滑块/拼图/其他类型", "超级鹰滑块/坐标类型", "CapSolver/2Captcha 图片任务"],
        "when_to_switch": ["重复纹理", "随机裁剪", "页面顺序字段被加密或缺失", "视觉复原与提交参数强绑定"],
        "notes": "区别于 slider：目标是复原完整图片或分块顺序；切片乱序时先找页面逻辑，再做图片边缘匹配。",
    },
    "area-select": {
        "open_source_first": ["目标检测/图像分割", "SAM/YOLO + 题面解析", "VLM 返回框/多边形"],
        "fallback_platforms": ["云码/JFBYM 坐标/区域类型", "超级鹰坐标类型", "CapSolver ComplexImageTask"],
        "when_to_switch": ["边界模糊", "多目标区域", "平台要求多边形而不是单点"],
        "notes": "输出矩形、多边形或中心点集合，并说明坐标原点。",
    },
    "difference-click": {
        "open_source_first": ["图像配准 + 差分", "显著性检测", "VLM 复核差异点"],
        "fallback_platforms": ["云码/JFBYM 坐标类型", "超级鹰坐标类型", "人工标注"],
        "when_to_switch": ["压缩噪声强", "差异极细微", "差异点数量/顺序不明确"],
        "notes": "先配准再差分，避免把平移缩放误判为差异。",
    },
    "font-identify": {
        "open_source_first": ["OCR 识别内容 + 字形特征比对", "模板匹配", "VLM 判断字体关系"],
        "fallback_platforms": ["云码/JFBYM 坐标/定制类型", "超级鹰人工/坐标类型", "人工标注"],
        "when_to_switch": ["字体相近", "抗锯齿/缩放影响字形", "题面要求复杂排序"],
        "notes": "不要只看文字内容，核心是字形/字体关系。",
    },
    "semantic-reasoning": {
        "open_source_first": ["YOLO/目标检测 + 规则推理", "CLIP/VLM 语义理解", "候选目标置信度复核"],
        "fallback_platforms": ["云码/JFBYM 坐标/定制类型", "超级鹰人工/坐标类型", "CapSolver ComplexImageTask"],
        "when_to_switch": ["空间关系歧义", "目标遮挡", "VLM 置信度低或输出不稳定"],
        "notes": "输出选择理由和坐标，题面歧义时让用户确认。",
    },
    "game-challenge": {
        "open_source_first": ["截图/帧状态识别", "VLM 解析题面", "必要时拆成 rotate/grid/click-select 子类型"],
        "fallback_platforms": ["2Captcha FunCaptcha/Arkose", "CapSolver FunCaptcha", "Anti-Captcha FunCaptcha", "NopeCHA Arkose"],
        "when_to_switch": ["3D 状态连续变化", "题目频繁更新", "纯视觉模型无法稳定控制交互"],
        "notes": "优先人工接管或授权 QA 模型辅助，不提供未授权自动通关脚本。",
    },
    "pow-challenge": {
        "open_source_first": ["按官方协议实现 challenge 校验", "检查 difficulty/nonce/TTL/防重放", "ALTCHA/Cap.js/mCaptcha 自托管校验"],
        "fallback_platforms": ["通常不需要打码平台", "2Captcha/Anti-Captcha 的 ALTCHA 或 PoW 支持仅作兼容备选"],
        "when_to_switch": ["第三方组件接入失败", "payload/session 绑定异常", "服务端签名校验不通过"],
        "notes": "这是计算挑战，不是图片识别；自有系统应优先修正集成。",
    },
    "risk-score": {
        "open_source_first": ["官方服务端校验日志", "action/hostname/score 阈值诊断", "误伤样本回放"],
        "fallback_platforms": ["2Captcha reCAPTCHA v3/Enterprise", "CapSolver", "CapMonster Cloud", "Anti-Captcha"],
        "when_to_switch": ["授权测试需要对比人工/平台 token", "评分低但无法定位 action/session/环境原因"],
        "notes": "不要把低分规避写成方案；优先做集成诊断和阈值评估。",
    },
    "one-click": {
        "open_source_first": ["组件状态和 callback 诊断", "人工点击/按住复现", "失败后识别升级出的子类型"],
        "fallback_platforms": ["2Captcha/CapSolver/CapMonster 对 Turnstile/reCAPTCHA/hCaptcha 的 token 任务", "人工接管"],
        "when_to_switch": ["点击后升级二次挑战", "组件状态和服务端校验不同步", "行为评分不稳定"],
        "notes": "普通表单 checkbox 不是验证码，必须有验证码/厂商证据。",
    },
    "multi-step": {
        "open_source_first": ["逐轮截图和状态记录", "每轮按具体子类型选择工具", "轮次状态机复盘"],
        "fallback_platforms": ["按子类型选择平台", "人工接管多轮流程"],
        "when_to_switch": ["上一轮结果影响下一轮", "局部成功被误判为完成", "多轮题型混合"],
        "notes": "它是流程标签，报告里应同时列每轮的具体类型和方案。",
    },
    "qa-logic": {
        "open_source_first": ["文本解析/规则库", "本地 LLM/VLM 解析题面", "人工复核"],
        "fallback_platforms": ["云码/JFBYM 文字/定制类型", "超级鹰人工类型", "2Captcha Normal Captcha"],
        "when_to_switch": ["题库动态变化", "问题依赖上下文", "自然语言歧义"],
        "notes": "简单算术应转为 math；安全问题/MFA 不进入验证码求解方案。",
    },
    "biometric-liveness": {
        "open_source_first": ["官方 SDK 接入诊断", "设备权限/摄像头/动作提示检查", "人工复核和可访问性替代"],
        "fallback_platforms": ["不建议使用打码平台", "仅在合规授权下联系厂商或人工审核服务"],
        "when_to_switch": ["涉及隐私/合规", "误识别/设备兼容", "需要人工审核链路"],
        "notes": "不提供绕过、伪造、替身或自动化活体方案。",
    },
    "token-widget": {
        "open_source_first": ["官方测试 key/测试环境", "sitekey/action/callback/TTL 诊断", "服务端校验日志复核"],
        "fallback_platforms": ["2Captcha", "CapSolver", "CapMonster Cloud", "Anti-Captcha", "YesCaptcha/NoCaptchaAI"],
        "when_to_switch": ["授权 QA 需要对照平台 token", "本地无法稳定复现人工验证", "只需验证集成链路而非训练模型"],
        "notes": "记录 pageurl、sitekey、action、callback 和 token TTL；不要注入 token 到未授权流程。",
    },
    "waf-challenge": {
        "open_source_first": ["真实浏览器取证", "服务端/WAF 日志", "TLS/HTTP/JS 环境一致性诊断"],
        "fallback_platforms": ["CapSolver/CapMonster/2Captcha 对 AWS WAF、Turnstile、DataDome 等的授权测试支持", "厂商支持/人工复核"],
        "when_to_switch": ["自有系统误伤真实用户", "challenge cookie/session 绑定异常", "环境指纹诊断无法定位"],
        "notes": "这不是普通图片验证码，优先定位风控产品和环境问题。",
    },
    "unknown-custom": {
        "open_source_first": ["收集 HTML/脚本/截图/接口名", "先归入最接近的可见类型", "建立小样本测试夹具"],
        "fallback_platforms": ["云码/JFBYM 定制", "超级鹰人工/定制", "2Captcha/CapSolver 通用图片或坐标任务"],
        "when_to_switch": ["证据不足", "自研 canvas 混淆", "现有分类无法稳定覆盖"],
        "notes": "先补证据，不要只凭一张截图过拟合。",
    },
}


BOUNDARY_PATTERNS = [
    r"绕过登录|绕过验证码|自动请求通过|请求通过|批量注册|薅羊毛|撞库|代过验证|破解验证码",
    r"\b(?:bypass|circumvent|mass signup|bulk signup|credential stuffing|account takeover)\b",
    r"短信验证码|邮箱验证码|手机验证码|动态口令|\bMFA\b|\b2FA\b|一次性密码|\bOTP\b",
]


def read_value(value: str | None) -> str:
    if not value:
        return ""
    path = Path(value)
    if path.exists() and path.is_file():
        for encoding in ("utf-8", "utf-8-sig", "gb18030"):
            try:
                return path.read_text(encoding=encoding)
            except UnicodeDecodeError:
                continue
        return path.read_text(errors="replace")
    return value


def read_many(values: Iterable[str] | None) -> list[str]:
    if not values:
        return []
    return [read_value(value) for value in values if value is not None]


def focus_html(value: str) -> str:
    decoded = html_lib.unescape(value)
    snippets: list[str] = []

    for pattern in (
        r"<title[^>]*>(.*?)</title>",
        r"<meta[^>]+(?:name|property)=[\"'](?:description|keywords|og:title|og:description)[\"'][^>]+content=[\"']([^\"']+)",
        r"<meta[^>]+content=[\"']([^\"']+)[\"'][^>]+(?:name|property)=[\"'](?:description|keywords|og:title|og:description)[\"']",
    ):
        for match in re.finditer(pattern, decoded, flags=re.IGNORECASE | re.DOTALL):
            snippets.append(re.sub(r"<[^>]+>", " ", match.group(1)))

    for match in HTML_FOCUS_KEYWORDS.finditer(decoded):
        start = max(0, match.start() - 260)
        end = min(len(decoded), match.end() + 260)
        snippets.append(decoded[start:end])
        if len(snippets) >= 80:
            break

    focused = "\n".join(snippets) if snippets else decoded[:20000]
    focused = re.sub(r"<svg\b.*?</svg>", " ", focused, flags=re.IGNORECASE | re.DOTALL)
    focused = re.sub(r"\bd=[\"'][^\"']{80,}[\"']", " ", focused)
    focused = re.sub(r"[A-Za-z0-9+/=_-]{120,}", " ", focused)
    return focused


def build_sources(
    html: Iterable[str] | None = None,
    url: Iterable[str] | None = None,
    text: Iterable[str] | None = None,
    screenshot_meta: Iterable[str] | None = None,
) -> list[EvidenceSource]:
    sources: list[EvidenceSource] = []
    for kind, values in (
        ("url", url),
        ("text", text),
        ("screenshot_meta", screenshot_meta),
        ("html", html),
    ):
        for value in values or []:
            if not value:
                continue
            prepared = focus_html(value) if kind == "html" else value
            sources.append(EvidenceSource(kind, prepared))
    return sources


def compact(text: str, limit: int = 90) -> str:
    cleaned = re.sub(r"\s+", " ", text.strip())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1] + "…"


def is_noise_match(signal: Signal, evidence: str, context: str, source_kind: str) -> bool:
    if signal.label == "命中算术表达式":
        expr = re.sub(r"\s+", "", evidence)
        dimension = re.fullmatch(r"(\d{2,3})[xX×](\d{2,3})", expr)
        if dimension and max(int(dimension.group(1)), int(dimension.group(2))) >= 20:
            return True

        date_like = re.fullmatch(r"(\d{1,4})-(\d{1,2})(?:-\d{1,2})?", expr)
        if date_like and not re.search(r"算术|请计算|计算(?:结果|答案)|math captcha|arithmetic", context, re.IGNORECASE):
            return True

        if source_kind == "html" and not re.search(
            r"算术|请计算|计算(?:结果|答案)|math captcha|arithmetic|captcha",
            context,
            re.IGNORECASE,
        ):
            return True
    return False


def collect_matches(source: EvidenceSource, signals: list[Signal]) -> list[Match]:
    matches: list[Match] = []
    for signal in signals:
        found = re.search(signal.pattern, source.text, flags=re.IGNORECASE | re.DOTALL)
        if found:
            start = max(0, found.start() - 90)
            end = min(len(source.text), found.end() + 90)
            context = source.text[start:end]
            evidence = compact(found.group(0))
            if is_noise_match(signal, evidence, context, source.kind):
                continue
            source_weight = SOURCE_WEIGHTS.get(source.kind, 1.0)
            matches.append(Match(signal.label, signal.weight * source_weight, evidence, source.kind))
    return matches


def score_matches(matches: list[Match]) -> float:
    return sum(match.weight for match in matches)


def confidence_from_score(score: float, provider_score: float = 0.0) -> float:
    if score <= 0:
        return 0.35 if provider_score else 0.2
    raw = 1 - math.exp(-(score + min(provider_score, 3) * 0.25) / 4.0)
    return round(max(0.45, min(0.98, raw)), 2)


def classify_provider(sources: list[EvidenceSource]) -> tuple[str, float, dict[str, list[dict[str, Any]]]]:
    provider_matches: dict[str, list[dict[str, Any]]] = {}
    scored: list[tuple[str, float]] = []
    for provider, signals in PROVIDER_SIGNALS.items():
        matches: list[Match] = []
        for source in sources:
            matches.extend(collect_matches(source, signals))
        if matches:
            score = score_matches(matches)
            scored.append((provider, score))
            provider_matches[provider] = [
                {"label": match.label, "evidence": match.evidence, "weight": match.weight, "source": match.source}
                for match in matches
            ]
    if not scored:
        return "custom-or-unknown", 0.0, provider_matches
    scored.sort(key=lambda item: item[1], reverse=True)
    return scored[0][0], scored[0][1], provider_matches


def classify_type(sources: list[EvidenceSource], provider: str, provider_score: float) -> tuple[str, float, dict[str, list[dict[str, Any]]]]:
    type_matches: dict[str, list[dict[str, Any]]] = {}
    scored: list[tuple[str, float]] = []
    for captcha_type, signals in TYPE_SIGNALS.items():
        matches: list[Match] = []
        for source in sources:
            matches.extend(collect_matches(source, signals))
        if matches:
            score = score_matches(matches)
            scored.append((captcha_type, score))
            type_matches[captcha_type] = [
                {"label": match.label, "evidence": match.evidence, "weight": match.weight, "source": match.source}
                for match in matches
            ]

    provider_type_boosts: dict[str, dict[str, float]] = {
        "recaptcha": {"token-widget": 2.0, "risk-score": 0.8, "one-click": 0.4, "grid": 0.2, "audio": 0.2},
        "hcaptcha": {"token-widget": 2.0, "grid": 0.4, "audio": 0.2},
        "cloudflare-turnstile": {"token-widget": 2.2, "risk-score": 0.8, "one-click": 0.4},
        "cloudflare-waf": {"waf-challenge": 3.0},
        "aws-waf": {"waf-challenge": 3.0},
        "datadome": {"waf-challenge": 3.0},
        "arkose-funcaptcha": {"game-challenge": 2.5, "token-widget": 1.4},
        "mtcaptcha": {"token-widget": 2.5},
        "keycaptcha": {"token-widget": 2.0},
        "friendlycaptcha": {"pow-challenge": 3.0, "token-widget": 0.8},
        "altcha": {"pow-challenge": 3.0, "token-widget": 0.8},
        "yandex-smartcaptcha": {"token-widget": 3.0},
        "captchafox": {"token-widget": 3.0},
        "prosopo-procaptcha": {"token-widget": 3.0},
        "trustcaptcha": {"token-widget": 3.0},
        "private-captcha": {"pow-challenge": 3.0, "token-widget": 0.8},
        "capjs": {"pow-challenge": 3.0, "token-widget": 0.8},
        "mcaptcha": {"pow-challenge": 3.0, "token-widget": 0.8},
        "iconcaptcha": {"click-select": 2.5},
        "botdetect": {"text": 2.5, "audio": 0.4},
        "securimage": {"text": 2.5, "audio": 0.4},
        "visualcaptcha": {"click-select": 2.0, "audio": 0.4},
        "amazon-captcha": {"text": 2.0},
        "cybersiara": {"waf-challenge": 1.5, "slider": 0.6},
        "aj-captcha": {"slider": 1.2, "click-select": 0.8},
        "tianai-captcha": {"slider": 1.0, "rotate": 0.6, "click-select": 0.6},
        "easycaptcha": {"text": 2.0},
        "happycaptcha": {"text": 2.0},
        "kaptcha": {"text": 2.0},
        "geetest": {"slider": 1.0, "risk-score": 0.2},
        "tencent-tcaptcha": {"slider": 0.8, "one-click": 0.5, "audio": 0.4, "risk-score": 0.4},
        "netease-yidun": {"slider": 0.4, "click-select": 0.4, "audio": 0.2, "risk-score": 0.2},
        "aliyun-captcha": {"slider": 0.7, "image-restore": 0.6, "one-click": 0.5, "risk-score": 0.5},
        "shumei-captcha": {"slider": 0.7, "click-select": 0.3, "semantic-reasoning": 0.2, "risk-score": 0.2},
        "dingxiang-captcha": {
            "slider": 0.6,
            "click-select": 0.5,
            "rotate": 0.4,
            "scratch": 0.3,
            "area-select": 0.3,
            "difference-click": 0.3,
            "font-identify": 0.3,
            "image-restore": 0.3,
            "semantic-reasoning": 0.3,
            "audio": 0.2,
            "risk-score": 0.3,
        },
        "baidu-captcha": {"slider": 0.6, "click-select": 0.5, "trace-draw": 0.5, "text": 0.3},
        "jdcloud-captcha": {"slider": 1.4},
        "yunpian-captcha": {"slider": 0.7, "click-select": 0.4},
        "huawei-captcha": {"text": 1.2},
        "tongdun-risk": {"waf-challenge": 2.0},
        "akamai-bot-manager": {"waf-challenge": 3.0},
        "imperva-incapsula": {"waf-challenge": 3.0},
        "perimeterx-human": {"waf-challenge": 3.0},
        "kasada": {"waf-challenge": 3.0},
        "netacea": {"waf-challenge": 3.0},
        "radware-bot-manager": {"waf-challenge": 3.0},
        "f5-bot-defense": {"waf-challenge": 3.0},
    }
    for boosted_type, boost in provider_type_boosts.get(provider, {}).items():
        if provider_score:
            scored.append((boosted_type, boost))
            type_matches.setdefault(boosted_type, []).append(
                {"label": f"厂商 {provider} 的默认类型倾向", "evidence": provider, "weight": boost, "source": "provider"}
            )

    if not scored:
        return "unknown-custom", 0.0, type_matches

    totals: dict[str, float] = {}
    for captcha_type, score in scored:
        totals[captcha_type] = totals.get(captcha_type, 0.0) + score

    # 更具体的可见挑战形态应优先于通用组件信号。
    specificity_order = {
        "biometric-liveness": 16,
        "game-challenge": 15,
        "difference-click": 14,
        "semantic-reasoning": 13,
        "area-select": 12,
        "font-identify": 12,
        "image-restore": 11,
        "scratch": 10,
        "trace-draw": 10,
        "drag-drop": 10,
        "audio": 9,
        "waf-challenge": 8,
        "grid": 7,
        "click-select": 6,
        "slider": 5,
        "rotate": 5,
        "pow-challenge": 5,
        "risk-score": 4,
        "one-click": 4,
        "math": 4,
        "multi-step": 3,
        "qa-logic": 3,
        "token-widget": 2,
        "text": 1,
    }
    best_type, best_score = sorted(
        totals.items(), key=lambda item: (item[1], specificity_order.get(item[0], 0)), reverse=True
    )[0]

    if best_type == "text":
        # 通用 captcha 文案不应覆盖强厂商组件信号。
        if provider in {
            "recaptcha",
            "hcaptcha",
            "cloudflare-turnstile",
            "arkose-funcaptcha",
            "mtcaptcha",
            "keycaptcha",
            "friendlycaptcha",
            "yandex-smartcaptcha",
            "captchafox",
            "prosopo-procaptcha",
            "trustcaptcha",
            "private-captcha",
            "capjs",
            "mcaptcha",
        }:
            widget_score = totals.get("token-widget", 0)
            if widget_score >= best_score:
                return "token-widget", widget_score, type_matches

    if provider in {
        "arkose-funcaptcha",
        "mtcaptcha",
        "keycaptcha",
        "friendlycaptcha",
        "yandex-smartcaptcha",
        "captchafox",
        "prosopo-procaptcha",
        "trustcaptcha",
        "private-captcha",
        "capjs",
        "mcaptcha",
    }:
        widget_score = totals.get("token-widget", 0)
        if widget_score and widget_score >= best_score - 1.0:
            return "token-widget", widget_score, type_matches

    return best_type, best_score, type_matches


def classify_tile_scramble_variant(sources: list[EvidenceSource], captcha_type: str) -> dict[str, Any]:
    if captcha_type != "image-restore":
        return {}

    matches: list[Match] = []
    for source in sources:
        matches.extend(collect_matches(source, TILE_SCRAMBLE_SIGNALS))
    if not matches:
        return {}

    score = score_matches(matches)
    labels = {match.label for match in matches}
    if any(label in labels for label in ("命中切片顺序字段", "命中 CSS sprite/背景定位切片", "命中 Canvas drawImage 切片绘制")):
        strategy = "page-order"
    elif score >= 4:
        strategy = "image-edge-match"
    else:
        strategy = "manual-or-platform"

    return {
        "captcha_variant": "tile-scramble",
        "variant_confidence": confidence_from_score(score),
        "restore_strategy": strategy,
        "tile_restore_evidence": [
            {
                "label": match.label,
                "evidence": match.evidence,
                "weight": match.weight,
                "source": match.source,
            }
            for match in matches
        ],
    }


def boundary_flags(text: str) -> list[str]:
    flags: list[str] = []
    for pattern in BOUNDARY_PATTERNS:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            flags.append(compact(match.group(0), 60))
    return flags


def classify_sources(
    html: Iterable[str] | None = None,
    url: Iterable[str] | None = None,
    text: Iterable[str] | None = None,
    screenshot_meta: Iterable[str] | None = None,
) -> dict[str, Any]:
    sources = build_sources(html=html, url=url, text=text, screenshot_meta=screenshot_meta)
    combined = "\n".join(f"[{source.kind}] {source.text}" for source in sources)
    provider, provider_score, provider_matches = classify_provider(sources)
    captcha_type, type_score, type_matches = classify_type(sources, provider, provider_score)
    confidence = confidence_from_score(type_score, provider_score)
    provider_confidence = confidence_from_score(provider_score) if provider_score else 0.2
    boundary = boundary_flags(combined)
    tile_variant = classify_tile_scramble_variant(sources, captcha_type)

    flat_signals: list[dict[str, Any]] = []
    for matched_provider, matches in provider_matches.items():
        for match in matches:
            flat_signals.append({"category": "provider", "name": matched_provider, **match})
    for matched_type, matches in type_matches.items():
        for match in matches:
            flat_signals.append({"category": "type", "name": matched_type, **match})

    if not combined.strip():
        captcha_type = "unknown-custom"
        provider = "custom-or-unknown"
        confidence = 0.0
        provider_confidence = 0.0

    result = {
        "captcha_type": captcha_type,
        "provider": provider,
        "confidence": confidence,
        "provider_confidence": provider_confidence,
        "signals": flat_signals,
        "recommended_playbook": PLAYBOOKS.get(captcha_type, PLAYBOOKS["unknown-custom"]),
        "solution_options": SOLUTION_OPTIONS.get(captcha_type, SOLUTION_OPTIONS["unknown-custom"]),
        "verification_flow": {
            "enabled_after_user_confirmation": True,
            "requires_authorization_scope": True,
            "live_browser_requires_confirmation": True,
            "default_mode": "offline-first",
            **VERIFICATION_FLOW_BY_TYPE.get(captcha_type, VERIFICATION_FLOW_BY_TYPE["unknown-custom"]),
        },
        "next_evidence": NEXT_EVIDENCE.get(captcha_type, NEXT_EVIDENCE["unknown-custom"]),
        "safety_boundary": {
            "triggered": bool(boundary),
            "matched_terms": boundary,
            "guidance": (
                "请将工作限定在类型识别、厂商判断和授权验证分析。不要自动化登录绕过、"
                "批量注册、token 注入，也不要处理短信/邮箱/MFA 验证码。"
            )
            if boundary
            else "",
        },
    }
    result.update(tile_variant)
    return result


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="离线网页验证码/验证类型分类器")
    parser.add_argument("--html", action="append", help="HTML 片段或 HTML 文件路径")
    parser.add_argument("--url", action="append", help="页面/脚本/iframe URL 证据")
    parser.add_argument("--text", action="append", help="页面可见挑战文案或分析备注")
    parser.add_argument("--screenshot-meta", action="append", help="截图元信息或 OCR 备注")
    parser.add_argument("--pretty", action="store_true", help="以缩进格式输出 JSON")
    parser.add_argument("--compact", action="store_true", help="以紧凑格式输出 JSON")
    parser.add_argument("--json", action="store_true", help="兼容参数；脚本始终输出 JSON")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    result = classify_sources(
        html=read_many(args.html),
        url=read_many(args.url),
        text=read_many(args.text),
        screenshot_meta=read_many(args.screenshot_meta),
    )
    indent = None if args.compact else 2
    if args.pretty:
        indent = 2
    print(json.dumps(result, ensure_ascii=False, indent=indent, sort_keys=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
