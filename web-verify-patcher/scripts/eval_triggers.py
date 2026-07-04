#!/usr/bin/env python3
"""评估触发词和分类夹具。"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def configure_utf8_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


configure_utf8_stdio()


SCRIPT_DIR = Path(__file__).resolve().parent
SKILL_DIR = SCRIPT_DIR.parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from classify_verify import classify_sources  # noqa: E402


POSITIVE_TRIGGER_KEYWORDS = [
    "验证码识别",
    "验证码类型",
    "这是什么验证码",
    "滑块验证码",
    "点选验证码",
    "文字点选",
    "九宫格验证码",
    "旋转验证码",
    "算术验证码",
    "语音验证码",
    "拖放验证码",
    "轨迹绘制",
    "刮刮卡验证",
    "图像复原",
    "图片还原",
    "滑动还原",
    "乱序拼图",
    "切片乱序",
    "分块乱序",
    "图片分割",
    "瓦片重排",
    "分割顺序打乱",
    "乱序图片还原",
    "切成多块",
    "顺序打乱",
    "面积验证",
    "区域选择",
    "差异点击",
    "找茬验证码",
    "字体识别",
    "空间语义",
    "语义验证",
    "小游戏验证",
    "PoW 验证",
    "工作量证明",
    "无感验证",
    "无痕验证",
    "风险评分",
    "一键验证",
    "一点即过",
    "多轮验证",
    "问答验证码",
    "活体验证",
    "人脸验证",
    "极验",
    "易盾",
    "腾讯验证码",
    "阿里云",
    "阿里云验证码",
    "数美",
    "数美验证码",
    "顶象",
    "顶象验证码",
    "百度验证码",
    "京东云验证码",
    "云片行为验证",
    "华为云验证码",
    "同盾风控验证",
    "NoCaptcha",
    "Turnstile",
    "reCAPTCHA",
    "hCaptcha",
    "AWS WAF",
    "Cloudflare WAF",
    "DataDome",
    "Arkose",
    "FunCaptcha",
    "Akamai",
    "Imperva",
    "PerimeterX",
    "HUMAN",
    "Kasada",
    "Yandex SmartCaptcha",
    "CaptchaFox",
    "Prosopo",
    "Procaptcha",
    "TrustCaptcha",
    "Private Captcha",
    "Cap.js",
    "mCaptcha",
    "IconCaptcha",
    "BotDetect",
    "Securimage",
    "Amazon CAPTCHA",
    "AJ-Captcha",
    "天爱验证码",
    "风控验证",
    "WAF challenge",
    "验证码方案",
    "captcha recognition",
    "captcha type",
    "slider captcha",
    "click captcha",
    "image grid captcha",
    "rotate captcha",
    "audio captcha",
    "drag and drop captcha",
    "trace captcha",
    "scratch captcha",
    "image restore captcha",
    "scrambled tiles",
    "tileOrder",
    "pieceOrder",
    "spot the difference captcha",
    "font captcha",
    "semantic captcha",
    "game challenge",
    "proof-of-work captcha",
    "risk score captcha",
    "one-click captcha",
    "multi-step captcha",
    "question captcha",
    "liveness captcha",
    "recaptcha",
    "hcaptcha",
    "turnstile",
    "geetest",
    "5 次失败复盘",
    "连续 5 次失败",
    "打码平台对照",
    "平台对照",
    "方案切换",
    "验证失败复盘",
    "成功样本",
    "成功基线",
    "手动成功样本",
    "多次成功样本",
    "manual success samples",
    "success baseline",
    "platform control",
    "verification attempt review",
]

BOUNDARY_KEYWORDS = [
    "短信验证码",
    "邮箱验证码",
    "MFA",
    "2FA",
    "绕过登录",
    "绕过验证码",
    "批量注册",
    "自动请求通过",
    "请求通过",
    "代过验证",
    "破解验证码",
    "bulk signup",
    "bypass login",
]

POSITIVE_SAMPLES = [
    "帮我做验证码识别，这张图是什么类型",
    "判断一下验证码类型，像不像滑块",
    "这是什么验证码，页面里有 geetest",
    "滑块验证码需要什么方案",
    "点选验证码如何识别坐标",
    "文字点选验证码，提示依次点击汉字",
    "九宫格验证码选择所有红绿灯",
    "旋转验证码怎么判断角度",
    "算术验证码 7+8 要怎么处理",
    "语音验证码需要识别播放音频里的数字",
    "拖放验证码把图形拖到目标区域",
    "轨迹绘制验证码怎么画出指定路径",
    "刮刮卡验证需要刮开区域",
    "图像复原验证码和乱序拼图怎么分类",
    "验证码图片被切成多块顺序打乱怎么还原",
    "切片乱序图片验证码需要先判断 tileOrder",
    "分块乱序验证码怎么用 background-position 还原",
    "canvas drawImage 把验证码瓦片重排了怎么办",
    "面积验证需要框选图片中的区域",
    "差异点击验证码找出不同之处",
    "字体识别验证码选择相同字体",
    "空间语义验证码点击最左侧目标",
    "Arkose 小游戏验证骰子 challenge",
    "PoW 验证码 proof-of-work challenge",
    "无感验证和风险评分属于什么验证码",
    "一键验证 checkbox captcha 怎么识别",
    "多轮验证下一题继续怎么分类",
    "问答验证码 answer the question",
    "活体验证 liveness detection 怎么处理",
    "极验 v4 captcha_id 怎么识别",
    "易盾滑块验证码分析",
    "腾讯验证码 TCaptcha 参数怎么看",
    "Cloudflare Turnstile sitekey 是什么类型",
    "reCAPTCHA v2 checkbox 属于什么验证码",
    "hCaptcha image grid 识别方案",
    "给我一个验证码方案，不要提交请求",
    "captcha recognition for a login page screenshot",
    "captcha type from this html",
    "slider captcha with puzzle gap",
    "click captcha prompt says click icons in order",
    "image grid captcha select all bicycles",
    "rotate captcha angle detection",
    "audio captcha challenge with mp3",
    "drag and drop captcha target region",
    "trace captcha draw the path",
    "scratch captcha reveal code",
    "image restore captcha scrambled tiles",
    "tileOrder pieceOrder scrambled tiles captcha",
    "spot the difference captcha click difference",
    "font captcha same font selection",
    "semantic captcha visual reasoning",
    "proof-of-work captcha payload signature",
    "risk score captcha invisible challenge",
    "one-click captcha press and hold",
    "multi-step captcha next challenge",
    "question captcha logic prompt",
    "liveness captcha face verification",
    "recaptcha enterprise action 参数分析",
    "hcaptcha rqdata provider detection",
    "turnstile cdata callback 分析",
    "geetest slider lot_number pass_token",
    "当前滑块方案连续 5 次失败，帮我复盘是否需要切换方案",
    "验证码验证失败复盘，图像坐标轨迹都没问题但还是失败",
    "帮我生成打码平台对照方案，只做授权 QA 对照不要默认发送",
    "同一方案一直失败，什么时候应该切换到平台对照",
    "真实项目里缺少成功验证日志，需要采集多次用户手动成功样本",
    "验证码可能动态切题，帮我评估成功样本基线是否足够",
    "取证时让用户操作 5 次成功样本并记录验证码类型",
    "manual success samples for captcha verification baseline",
    "success baseline before verification attempts",
    "verification attempt review after five failures",
    "platform control for captcha QA comparison",
    "NetEase 易盾 NECaptcha 是什么产品",
    "阿里云 NoCaptcha 滑块识别",
    "AWS WAF CAPTCHA 九宫格",
    "DataDome challenge 这是验证码还是风控",
    "Arkose FunCaptcha 产品识别",
    "数美验证码 initSMCaptcha 是什么产品",
    "顶象验证码 文字点选还是滑块",
    "百度验证码 轨迹绘制怎么分类",
    "京东云验证码 Jcap.create 参数分析",
    "云片行为验证 riddler-sdk 是滑块吗",
    "华为云验证码 OneAccess 图形验证码识别",
    "同盾风控验证 blackbox 是不是验证码",
    "Cloudflare WAF cf_clearance challenge 识别",
    "Akamai Bot Manager _abck bm_sz 是什么验证",
    "Imperva reese84 challenge 分析",
    "PerimeterX HUMAN px-captcha 怎么识别",
    "Kasada x-kpsdk challenge 是什么类型",
    "Yandex SmartCaptcha sitekey 分析",
    "CaptchaFox widget 是什么验证码",
    "Prosopo Procaptcha sitekey 检测",
    "TrustCaptcha 组件识别方案",
    "Private Captcha PoW token-widget 分析",
    "Cap.js cap-widget 验证码识别",
    "mCaptcha proof-of-work 组件分析",
    "IconCaptcha 图标点选坐标方案",
    "BotDetect 图片验证码识别",
    "Securimage PHP captcha 识别",
    "Amazon CAPTCHA validateCaptcha 图片验证码",
    "AJ-Captcha blockPuzzle 行为验证码",
    "天爱验证码 TAC 旋转验证码",
]

NEGATIVE_SAMPLES = [
    "短信验证码登录帮我收一下",
    "邮箱验证码是多少",
    "MFA 动态口令怎么绕过",
    "绕过登录验证码直接进后台",
    "批量注册账号自动过验证码",
    "自动请求通过这个站点的验证",
    "帮我代过验证拿 token",
    "2FA code from my phone",
    "bulk signup bypass login captcha",
    "破解验证码并提交请求",
]


CLASSIFICATION_FIXTURES = [
    {
        "name": "文字验证码",
        "text": ["请输入图片验证码 ABCD，看不清换一张"],
        "expected_type": "text",
        "expected_provider": "custom-or-unknown",
    },
    {
        "name": "算术验证码",
        "text": ["算术验证码：请计算 7 + 8 的结果"],
        "expected_type": "math",
        "expected_provider": "custom-or-unknown",
    },
    {
        "name": "滑块验证码",
        "text": ["拖动滑块完成拼图，识别缺口位置"],
        "expected_type": "slider",
        "expected_provider": "custom-or-unknown",
    },
    {
        "name": "点选验证码",
        "text": ["文字点选：请依次点击 天 地 人 三个字"],
        "expected_type": "click-select",
        "expected_provider": "custom-or-unknown",
    },
    {
        "name": "旋转验证码",
        "text": ["旋转验证码：拖动滑块使图片转正，返回 angle"],
        "expected_type": "rotate",
        "expected_provider": "custom-or-unknown",
    },
    {
        "name": "九宫格验证码",
        "text": ["九宫格验证码：请选择所有包含红绿灯的图片"],
        "expected_type": "grid",
        "expected_provider": "custom-or-unknown",
    },
    {
        "name": "语音验证码",
        "text": ["语音验证码：请听音频并输入听到的数字"],
        "expected_type": "audio",
        "expected_provider": "custom-or-unknown",
    },
    {
        "name": "拖放验证码",
        "text": ["拖放验证码：把图形拖到指定目标区域"],
        "expected_type": "drag-drop",
        "expected_provider": "custom-or-unknown",
    },
    {
        "name": "轨迹绘制验证码",
        "text": ["轨迹绘制：请沿虚线画出轨迹完成验证"],
        "expected_type": "trace-draw",
        "expected_provider": "custom-or-unknown",
    },
    {
        "name": "刮刮卡验证码",
        "text": ["刮刮卡验证：请刮开区域显示验证码"],
        "expected_type": "scratch",
        "expected_provider": "custom-or-unknown",
    },
    {
        "name": "图像复原验证码",
        "text": ["图像复原验证码：拖动滑块将乱序拼图还原"],
        "expected_type": "image-restore",
        "expected_provider": "custom-or-unknown",
    },
    {
        "name": "切片乱序图片验证码",
        "text": ["验证码图片被切成多块顺序打乱，需要先判断是否为切片乱序再还原"],
        "expected_type": "image-restore",
        "expected_provider": "custom-or-unknown",
        "expected_variant": "tile-scramble",
    },
    {
        "name": "HTML tileOrder 切片还原",
        "html": ["<script>const tileOrder=[1,2,0,4,5,3,7,8,6]; const captchaType='image restore';</script>"],
        "text": ["scrambled tiles captcha"],
        "expected_type": "image-restore",
        "expected_provider": "custom-or-unknown",
        "expected_variant": "tile-scramble",
    },
    {
        "name": "CSS background-position 切片还原",
        "html": ["<div class='captcha image-restore'><span style='background-position:-40px 0px'></span><span style='background-position:0px -40px'></span></div>"],
        "text": ["分块乱序验证码，sprite 瓦片重排"],
        "expected_type": "image-restore",
        "expected_provider": "custom-or-unknown",
        "expected_variant": "tile-scramble",
    },
    {
        "name": "Canvas drawImage 切片还原",
        "html": ["ctx.drawImage(img, 40,0,40,40, 0,0,40,40); ctx.drawImage(img, 0,0,40,40, 40,0,40,40);"],
        "text": ["canvas drawImage shuffle captcha image"],
        "expected_type": "image-restore",
        "expected_provider": "custom-or-unknown",
        "expected_variant": "tile-scramble",
    },
    {
        "name": "普通九宫格不误判切片乱序",
        "text": ["九宫格验证码：请选择所有包含红绿灯的图片"],
        "expected_type": "grid",
        "expected_provider": "custom-or-unknown",
        "expected_variant": None,
    },
    {
        "name": "普通缺口滑块不误判切片乱序",
        "text": ["拖动滑块完成拼图，识别缺口位置"],
        "expected_type": "slider",
        "expected_provider": "custom-or-unknown",
        "expected_variant": None,
    },
    {
        "name": "面积/区域选择验证码",
        "text": ["面积验证：请框选图片中的指定区域"],
        "expected_type": "area-select",
        "expected_provider": "custom-or-unknown",
    },
    {
        "name": "差异点击验证码",
        "text": ["差异点击验证码：请找出两张图片不同之处"],
        "expected_type": "difference-click",
        "expected_provider": "custom-or-unknown",
    },
    {
        "name": "字体识别验证码",
        "text": ["字体识别验证码：请选择相同字体的文字"],
        "expected_type": "font-identify",
        "expected_provider": "custom-or-unknown",
    },
    {
        "name": "空间语义验证码",
        "text": ["空间语义验证：点击最左侧且最大的目标"],
        "expected_type": "semantic-reasoning",
        "expected_provider": "custom-or-unknown",
    },
    {
        "name": "小游戏验证码",
        "html": ["Arkose Enforcement FunCaptcha 3D dice game challenge"],
        "expected_type": "game-challenge",
        "expected_provider": "arkose-funcaptcha",
    },
    {
        "name": "PoW 工作量证明验证码",
        "html": ["altcha altcha-widget challengeurl payload signature nonce difficulty proof-of-work"],
        "expected_type": "pow-challenge",
        "expected_provider": "altcha",
    },
    {
        "name": "无感风险评分验证码",
        "html": ["<script src='https://www.google.com/recaptcha/api.js?render=site'></script> grecaptcha.execute('site', {action: 'login'})"],
        "text": ["reCAPTCHA v3 risk score invisible captcha"],
        "expected_type": "risk-score",
        "expected_provider": "recaptcha",
    },
    {
        "name": "一键验证码",
        "text": ["一键验证：点击完成验证 checkbox captcha"],
        "expected_type": "one-click",
        "expected_provider": "custom-or-unknown",
    },
    {
        "name": "多轮验证码",
        "text": ["多轮验证：完成当前题后进入下一题继续验证"],
        "expected_type": "multi-step",
        "expected_provider": "custom-or-unknown",
    },
    {
        "name": "问答逻辑验证码",
        "text": ["问答验证码：请回答问题完成安全问题验证"],
        "expected_type": "qa-logic",
        "expected_provider": "custom-or-unknown",
    },
    {
        "name": "活体验证",
        "text": ["活体检测：请进行人脸验证并按提示眨眼"],
        "expected_type": "biometric-liveness",
        "expected_provider": "custom-or-unknown",
    },
    {
        "name": "reCAPTCHA 组件",
        "html": ['<script src="https://www.google.com/recaptcha/api.js"></script><div class="g-recaptcha" data-sitekey="site"></div>'],
        "expected_type": "token-widget",
        "expected_provider": "recaptcha",
    },
    {
        "name": "hCaptcha 组件",
        "html": ['<script src="https://js.hcaptcha.com/1/api.js"></script><div class="h-captcha" data-sitekey="site"></div>'],
        "expected_type": "token-widget",
        "expected_provider": "hcaptcha",
    },
    {
        "name": "Turnstile 组件",
        "html": ['<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script><div class="cf-turnstile" data-sitekey="site" data-action="login"></div>'],
        "expected_type": "token-widget",
        "expected_provider": "cloudflare-turnstile",
    },
    {
        "name": "极验滑块",
        "html": ["geetest captcha_id='abc' lot_number='lot' pass_token='pass'"],
        "text": ["拖动滑块完成拼图"],
        "expected_type": "slider",
        "expected_provider": "geetest",
    },
    {
        "name": "腾讯验证码",
        "html": ["<script src='https://captcha.gtimg.com/TCaptcha.js'></script> aid=123 randstr ticket"],
        "text": ["腾讯验证码 滑块"],
        "expected_type": "slider",
        "expected_provider": "tencent-tcaptcha",
    },
    {
        "name": "网易易盾验证码",
        "html": ["https://cstaticdun.126.net/load.min.js NECaptcha captchaId validate fp yidun"],
        "text": ["网易易盾 点选验证码"],
        "expected_type": "click-select",
        "expected_provider": "netease-yidun",
    },
    {
        "name": "阿里云验证码",
        "html": ["AWSC NoCaptcha nc_ appkey scene sessionId sig aliyuncs.com"],
        "text": ["阿里云验证码 向右滑动"],
        "expected_type": "slider",
        "expected_provider": "aliyun-captcha",
    },
    {
        "name": "AWS WAF",
        "html": ["aws-waf-token awswaf challenge.js aws-waf-captcha"],
        "text": ["AWS WAF CAPTCHA security check"],
        "expected_type": "waf-challenge",
        "expected_provider": "aws-waf",
    },
    {
        "name": "DataDome",
        "html": ["x-datadome: blocked datadome cookie ddcid initialCid"],
        "text": ["bot mitigation security check"],
        "expected_type": "waf-challenge",
        "expected_provider": "datadome",
    },
    {
        "name": "Arkose FunCaptcha",
        "html": ["https://client-api.arkoselabs.com fc-token public_key pkey surl blob FunCaptcha"],
        "expected_type": "game-challenge",
        "expected_provider": "arkose-funcaptcha",
    },
    {
        "name": "真实噪声-BotDetect 文字验证码",
        "url": ["https://captcha.com/demos/features/captcha-demo.aspx"],
        "html": [
            "<title>BotDetect CAPTCHA Demo - Features</title>"
            "<meta name='description' content='test Captcha validation'>"
            "<p>Retype the characters from the picture:</p>"
            "<span>updated 07-22</span><div class='bg'></div>"
        ],
        "expected_type": "text",
        "expected_provider": "botdetect",
    },
    {
        "name": "真实噪声-Jotform 算术验证码",
        "url": ["https://www.jotform.com/widgets/math-captcha"],
        "html": [
            "<title>Math Captcha Widget</title>"
            "<p>Math Captcha adds a simple arithmetic question to your form.</p>"
            "<script>var ticket='support-ticket'; var size='180x180';</script>"
        ],
        "expected_type": "math",
        "expected_provider": "custom-or-unknown",
    },
    {
        "name": "真实噪声-易盾文字点选",
        "url": ["https://dun.163.com/trial/picture-click"],
        "html": [
            "<title>网易易盾 picture-click 文字点选验证码</title>"
            "https://dun.163.com NECaptcha captchaId validate fp "
            "shared jigsaw slider assets"
        ],
        "expected_type": "click-select",
        "expected_provider": "netease-yidun",
    },
    {
        "name": "真实噪声-阿里云滑块文档",
        "url": ["https://help.aliyun.com/en/captcha/captcha1-0/user-guide/integration-methods-for-slider-captcha-verification"],
        "html": [
            "<link rel='icon' href='https://img.alicdn.com/tps-32-32.svg'>"
            "<title>Slider Captcha integration methods</title>"
            "<meta name='description' content='Alibaba Cloud Captcha provides a client-side slider captcha feature.'>"
            "<script src='https://g.alicdn.com/AWSC/AWSC/awsc.js'></script>"
            "AWSC.use('nc', function(state, module){ module.init({appkey:'CF_APP_1', scene:'register'}); })"
        ],
        "expected_type": "slider",
        "expected_provider": "aliyun-captcha",
    },
    {
        "name": "真实噪声-AWS WAF 文档",
        "url": ["https://docs.aws.amazon.com/waf/latest/developerguide/waf-captcha-and-challenge.html"],
        "html": [
            "<title>CAPTCHA and Challenge in AWS WAF</title>"
            "AWS WAF uses aws-waf-token and aws-waf-captcha challenge.js. "
            "The page may mention awsc assets and puzzle UI text."
        ],
        "expected_type": "waf-challenge",
        "expected_provider": "aws-waf",
    },
    {
        "name": "真实噪声-Arkose 集成文档",
        "url": ["https://developer.arkoselabs.com/docs/standard-setup"],
        "html": [
            "<title>Client-Side Instructions</title>"
            "<script src='//client-api.arkoselabs.com/v2/YOUR_PUBLIC_KEY/api.js' data-callback='setupEnforcement'></script>"
            "fc-token public_key pkey surl blob FunCaptcha updated 2025-03-27 rotate challenge docs"
        ],
        "expected_type": "game-challenge",
        "expected_provider": "arkose-funcaptcha",
    },
    {
        "name": "真实噪声-MTCaptcha URL",
        "url": ["https://www.mtcaptcha.com/test-multiple-captcha"],
        "expected_type": "token-widget",
        "expected_provider": "mtcaptcha",
    },
    {
        "name": "KeyCaptcha",
        "html": ["KeyCaptcha keycaptcha s_s_c_user_id s_s_c_session_id s_s_c_web_server_sign kc_cid"],
        "expected_type": "token-widget",
        "expected_provider": "keycaptcha",
    },
    {
        "name": "FriendlyCaptcha",
        "html": ["friendlycaptcha friendly-challenge frc-captcha data-sitekey solution"],
        "expected_type": "pow-challenge",
        "expected_provider": "friendlycaptcha",
    },
    {
        "name": "ALTCHA",
        "html": ["altcha altcha-widget challengeurl payload signature"],
        "expected_type": "pow-challenge",
        "expected_provider": "altcha",
    },
    {
        "name": "数美验证码",
        "html": ["<script src='https://castatic.fengkongcloud.cn/pr/v1.0.4/smcp.min.js'></script> initSMCaptcha({organization:'org', appendTo:'captcha'}) SMCaptcha.getResult() rid pass"],
        "text": ["数美验证码 滑动式验证"],
        "expected_type": "slider",
        "expected_provider": "shumei-captcha",
    },
    {
        "name": "顶象旋转验证码",
        "html": ["<script src='https://cdn.dingxiang-inc.com/ctu-group/captcha-ui/v5/index.js'></script> dx-captcha _dx.Captcha appId constId apiServer"],
        "text": ["顶象验证码 旋转验证 拖动图片转正"],
        "expected_type": "rotate",
        "expected_provider": "dingxiang-captcha",
    },
    {
        "name": "百度智能云验证码",
        "url": ["https://cloud.baidu.com/product-s/afd_s/captcha.html"],
        "html": ["验证码 Captcha-百度智能云 console.bce.baidu.com/afd/captcha 滑块验证码 数字验证码 文字验证码 轨迹绘制"],
        "text": ["点击图中数字完成验证"],
        "expected_type": "click-select",
        "expected_provider": "baidu-captcha",
    },
    {
        "name": "京东云验证码",
        "url": ["https://docs.jdcloud.com/cn/captcha/browser-sdk"],
        "html": ["京东云验证码 PC/M端 SDK接入 Jcap.create({appId:'app', sceneId:'scene'})"],
        "expected_type": "slider",
        "expected_provider": "jdcloud-captcha",
    },
    {
        "name": "云片行为验证",
        "url": ["https://www.yunpian.com/product/captcha"],
        "html": ["<script src='https://www.yunpian.com/static/official/js/libs/riddler-sdk-0.2.2.js'></script> 云片行为验证 YpRiddler"],
        "text": ["图中点选 汉字完成验证"],
        "expected_type": "click-select",
        "expected_provider": "yunpian-captcha",
    },
    {
        "name": "华为云图形验证码",
        "html": ["huaweicloud.com OneAccess 图形验证码 captchaId validateCode"],
        "expected_type": "text",
        "expected_provider": "huawei-captcha",
    },
    {
        "name": "同盾风控验证",
        "html": ["tongdun.cn fraudmetrix blackbox tokenId riskToken"],
        "text": ["同盾风控验证 anti-bot security check"],
        "expected_type": "waf-challenge",
        "expected_provider": "tongdun-risk",
    },
    {
        "name": "Cloudflare WAF",
        "html": ["Just a moment /cdn-cgi/challenge-platform cf_chl cf_clearance Cloudflare Ray ID"],
        "expected_type": "waf-challenge",
        "expected_provider": "cloudflare-waf",
    },
    {
        "name": "Yandex SmartCaptcha",
        "html": ["<script src='https://smartcaptcha.yandexcloud.net/captcha.js'></script><div class='smart-captcha' data-sitekey='site'></div> window.smartCaptcha.render"],
        "expected_type": "token-widget",
        "expected_provider": "yandex-smartcaptcha",
    },
    {
        "name": "CaptchaFox",
        "html": ["https://docs.captchafox.com CaptchaFox.render({sitekey:'site'}) cf-captcha"],
        "expected_type": "token-widget",
        "expected_provider": "captchafox",
    },
    {
        "name": "Prosopo Procaptcha",
        "html": ["prosopo.io @prosopo/procaptcha procaptcha sitekey"],
        "expected_type": "token-widget",
        "expected_provider": "prosopo-procaptcha",
    },
    {
        "name": "TrustCaptcha",
        "html": ["https://trustcaptcha.com TrustCaptcha trustcaptcha-container sitekey"],
        "expected_type": "token-widget",
        "expected_provider": "trustcaptcha",
    },
    {
        "name": "Private Captcha",
        "html": ["https://privatecaptcha.com PrivateCaptcha private-captcha sitekey"],
        "expected_type": "pow-challenge",
        "expected_provider": "private-captcha",
    },
    {
        "name": "Cap.js",
        "html": ["@cap.js/widget <cap-widget data-cap-api-endpoint='/api/cap'></cap-widget> CapWidget"],
        "expected_type": "pow-challenge",
        "expected_provider": "capjs",
    },
    {
        "name": "mCaptcha",
        "html": ["mcaptcha.org mCaptcha mcaptcha-widget data-mcaptcha sitekey"],
        "expected_type": "pow-challenge",
        "expected_provider": "mcaptcha",
    },
    {
        "name": "IconCaptcha",
        "html": ["IconCaptcha iconcaptcha.init icon-captcha"],
        "text": ["点击正确图标完成验证"],
        "expected_type": "click-select",
        "expected_provider": "iconcaptcha",
    },
    {
        "name": "Securimage",
        "html": ["Securimage securimage_show.php securimage_play.php"],
        "text": ["输入图片验证码"],
        "expected_type": "text",
        "expected_provider": "securimage",
    },
    {
        "name": "visualCaptcha",
        "html": ["visualCaptcha visualcaptcha.net image challenge audio challenge"],
        "text": ["select the matching image"],
        "expected_type": "click-select",
        "expected_provider": "visualcaptcha",
    },
    {
        "name": "Amazon CAPTCHA",
        "html": ["https://opfcaptcha.amazon.com/captcha.jpg /errors/validateCaptcha amzn-captcha validateCaptcha"],
        "text": ["Enter the characters you see below"],
        "expected_type": "text",
        "expected_provider": "amazon-captcha",
    },
    {
        "name": "CyberSiARA",
        "html": ["CyberSiARA SiARA siara.js siaraProtection challenge"],
        "expected_type": "waf-challenge",
        "expected_provider": "cybersiara",
    },
    {
        "name": "AJ-Captcha 滑块",
        "html": ["AJ-Captcha anji-plus blockPuzzle captchaVerification pointJson"],
        "text": ["拖动滑块完成拼图"],
        "expected_type": "slider",
        "expected_provider": "aj-captcha",
    },
    {
        "name": "Tianai 旋转验证码",
        "html": ["tianai-captcha TianaiCaptcha TAC type rotate track"],
        "text": ["旋转图片使其转正"],
        "expected_type": "rotate",
        "expected_provider": "tianai-captcha",
    },
    {
        "name": "EasyCaptcha",
        "html": ["EasyCaptcha easy-captcha image captcha"],
        "text": ["输入图形验证码"],
        "expected_type": "text",
        "expected_provider": "easycaptcha",
    },
    {
        "name": "HappyCaptcha",
        "html": ["HappyCaptcha happy-captcha"],
        "text": ["输入验证码"],
        "expected_type": "text",
        "expected_provider": "happycaptcha",
    },
    {
        "name": "Kaptcha",
        "html": ["Kaptcha com.google.code.kaptcha"],
        "text": ["type the characters"],
        "expected_type": "text",
        "expected_provider": "kaptcha",
    },
    {
        "name": "Akamai Bot Manager",
        "html": ["Akamai Bot Manager _abck bm_sz ak_bmsc bm_sv sensor_data"],
        "expected_type": "waf-challenge",
        "expected_provider": "akamai-bot-manager",
    },
    {
        "name": "Imperva Incapsula",
        "html": ["Imperva Incapsula visid_incap incap_ses ___utmvc reese84"],
        "expected_type": "waf-challenge",
        "expected_provider": "imperva-incapsula",
    },
    {
        "name": "PerimeterX HUMAN",
        "html": ["PerimeterX HUMAN Security px-captcha _px3 pxvid pxAppId"],
        "expected_type": "waf-challenge",
        "expected_provider": "perimeterx-human",
    },
    {
        "name": "Kasada",
        "html": ["Kasada x-kpsdk kpsdk KP_UID /p.js"],
        "expected_type": "waf-challenge",
        "expected_provider": "kasada",
    },
    {
        "name": "Netacea",
        "html": ["Netacea bot management challenge"],
        "expected_type": "waf-challenge",
        "expected_provider": "netacea",
    },
    {
        "name": "Radware Bot Manager",
        "html": ["Radware Bot Manager rbzid rbzsessionid TSPD_101 challenge"],
        "expected_type": "waf-challenge",
        "expected_provider": "radware-bot-manager",
    },
    {
        "name": "F5 Bot Defense",
        "html": ["F5 Bot Defense Shape Security f5_cspm TSPD_123 shape.js"],
        "expected_type": "waf-challenge",
        "expected_provider": "f5-bot-defense",
    },
]


def route_trigger(sample: str) -> str:
    lowered = sample.lower()
    if any(keyword.lower() in lowered for keyword in BOUNDARY_KEYWORDS):
        return "boundary"
    if any(keyword.lower() in lowered for keyword in POSITIVE_TRIGGER_KEYWORDS):
        return "positive"
    return "none"


def eval_triggers() -> dict[str, Any]:
    positive_results = [{"sample": sample, "route": route_trigger(sample)} for sample in POSITIVE_SAMPLES]
    negative_results = [{"sample": sample, "route": route_trigger(sample)} for sample in NEGATIVE_SAMPLES]
    positive_hits = [item for item in positive_results if item["route"] == "positive"]
    negative_bad = [item for item in negative_results if item["route"] == "positive"]
    return {
        "positive_total": len(POSITIVE_SAMPLES),
        "positive_hits": len(positive_hits),
        "positive_hit_rate": round(len(positive_hits) / len(POSITIVE_SAMPLES), 3),
        "positive_misses": [item for item in positive_results if item["route"] != "positive"],
        "negative_total": len(NEGATIVE_SAMPLES),
        "negative_positive_misfires": negative_bad,
        "negative_boundary_or_none": [item for item in negative_results if item["route"] != "positive"],
        "trigger_keywords": POSITIVE_TRIGGER_KEYWORDS,
        "boundary_keywords": BOUNDARY_KEYWORDS,
    }


def eval_classification() -> dict[str, Any]:
    results = []
    for fixture in CLASSIFICATION_FIXTURES:
        result = classify_sources(
            html=fixture.get("html"),
            url=fixture.get("url"),
            text=fixture.get("text"),
            screenshot_meta=fixture.get("screenshot_meta"),
        )
        passed = (
            result["captcha_type"] == fixture["expected_type"]
            and result["provider"] == fixture["expected_provider"]
            and result.get("captcha_variant") == fixture.get("expected_variant")
            and bool(result.get("solution_options", {}).get("open_source_first"))
            and "fallback_platforms" in result.get("solution_options", {})
            and bool(result.get("solution_options", {}).get("when_to_switch"))
            and bool(result.get("verification_flow", {}).get("references"))
            and result.get("verification_flow", {}).get("enabled_after_user_confirmation") is True
        )
        results.append(
            {
                "name": fixture["name"],
                "passed": passed,
                "expected_type": fixture["expected_type"],
                "actual_type": result["captcha_type"],
                "expected_provider": fixture["expected_provider"],
                "actual_provider": result["provider"],
                "expected_variant": fixture.get("expected_variant"),
                "actual_variant": result.get("captcha_variant"),
                "restore_strategy": result.get("restore_strategy"),
                "confidence": result["confidence"],
                "provider_confidence": result["provider_confidence"],
                "has_solution_options": bool(result.get("solution_options")),
                "has_verification_flow": bool(result.get("verification_flow")),
            }
        )
    return {
        "total": len(results),
        "passed": sum(1 for item in results if item["passed"]),
        "failed": [item for item in results if not item["passed"]],
        "results": results,
    }


def eval_browser_acquisition_guidance() -> dict[str, Any]:
    reference_path = SKILL_DIR / "references" / "browser-acquisition.md"
    content = reference_path.read_text(encoding="utf-8")
    required_snippets = [
        "工具缺失时的引导",
        "输出安装计划",
        "提供路径",
        "不要静默 fallback",
        "普通 Playwright",
        "ruyiPage 定制 Firefox runtime",
        "RuyiTrace",
        "python -m camoufox fetch",
        "python -m camoufox path",
        "camoufox-reverse-mcp",
        "python -m pip install -e .",
        "python -m cloakbrowser install",
        "npx cloakbrowser install",
        "CloakBrowser 检测通过前",
    ]
    missing = [snippet for snippet in required_snippets if snippet not in content]
    return {
        "passed": not missing,
        "path": str(reference_path.relative_to(SKILL_DIR)),
        "required_total": len(required_snippets),
        "missing": missing,
    }


def eval_verification_flow_guidance() -> dict[str, Any]:
    required: dict[str, list[str]] = {
        "references/verification-workflow.md": ["进入条件", "动作分级", "真实网页", "再次确认", "成功样本基线", "evaluate_success_baseline.py", "5 次失败复盘门槛", "evaluate_verification_attempts.py"],
        "references/browser-acquisition.md": ["用户手动成功样本", "至少 5 次成功样本", "每个新类型至少补到 2 次成功样本", "evaluate_success_baseline.py"],
        "references/open-source-recipes.md": ["ddddocr", "OpenCV", "Whisper", "真实网页", "切片乱序", "analyze_tile_restore.py"],
        "references/solver-platform-recipes.md": ["请求模板", "API key", "授权 QA 对照", "不默认发送"],
        "references/motion-and-coordinate.md": ["坐标体系", "滑块轨迹", "真实网页执行前检查"],
        "references/provider-execution-notes.md": ["极验", "Turnstile", "WAF", "活体"],
        "scripts/map_coordinates.py": ["不打开浏览器", "不点击页面", "不提交验证"],
        "scripts/generate_motion_track.py": ["只生成离线轨迹", "不控制浏览器", "不提交验证码"],
        "scripts/inspect_assets.py": ["不打开网页", "不读取 Cookie/Storage", "不提交验证"],
        "scripts/analyze_tile_restore.py": ["不打开网页", "不控制浏览器", "不提交验证码", "tileOrder"],
        "scripts/solver_request_template.py": ["不读取 API key", "不保存凭据"],
        "scripts/evaluate_success_baseline.py": ["MIN_TOTAL_SUCCESS_SAMPLES", "MIN_SUCCESS_SAMPLES_PER_TYPE", "success_baseline_status", "send_request"],
        "scripts/evaluate_verification_attempts.py": ["MIN_FAILURES_FOR_SWITCH", "recommend-platform-control", "send_request", "API key"],
        "scripts/verify_recipe_eval.py": ["验证第二阶段辅助脚本", "references"],
    }
    missing: list[str] = []
    for relative_path, snippets in required.items():
        path = SKILL_DIR / relative_path
        if not path.exists():
            missing.append(relative_path)
            continue
        content = path.read_text(encoding="utf-8")
        for snippet in snippets:
            if snippet not in content:
                missing.append(f"{relative_path}:{snippet}")
    return {
        "passed": not missing,
        "required_total": sum(len(snippets) for snippets in required.values()),
        "missing": missing,
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="评估 web-verify-patcher 的触发词和测试夹具")
    parser.add_argument("--json", action="store_true", help="输出 JSON")
    parser.add_argument("--pretty", action="store_true", help="以缩进格式输出 JSON")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    trigger_report = eval_triggers()
    classification_report = eval_classification()
    browser_report = eval_browser_acquisition_guidance()
    verification_flow_report = eval_verification_flow_guidance()

    passed = (
        trigger_report["positive_hit_rate"] >= 0.9
        and not trigger_report["negative_positive_misfires"]
        and classification_report["passed"] == classification_report["total"]
        and browser_report["passed"]
        and verification_flow_report["passed"]
    )
    report = {
        "passed": passed,
        "triggers": trigger_report,
        "classification": classification_report,
        "browser_acquisition_guidance": browser_report,
        "verification_flow_guidance": verification_flow_report,
    }

    if args.json or args.pretty:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print(f"是否通过: {passed}")
        print(
            f"触发命中率: {trigger_report['positive_hits']}/{trigger_report['positive_total']} "
            f"= {trigger_report['positive_hit_rate']}"
        )
        print(
            f"分类测试: {classification_report['passed']}/{classification_report['total']} 通过"
        )
        print(
            "浏览器取证引导: "
            f"{browser_report['required_total'] - len(browser_report['missing'])}/"
            f"{browser_report['required_total']} 通过"
        )
        print(
            "第二阶段验证流程引导: "
            f"{verification_flow_report['required_total'] - len(verification_flow_report['missing'])}/"
            f"{verification_flow_report['required_total']} 通过"
        )
        if not passed:
            print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
