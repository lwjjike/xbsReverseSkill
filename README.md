# xbsReverseSkill

这是一个面向 Web/JS 逆向分析的 skill 仓库，当前主要包含 3 个方向的能力模块，分别覆盖 AST 反混淆、纯算/协议逆向，以及浏览器补环境。

## 注意
使用最新web-js-env-patcher补环境skill，使用前关闭其他3个skill防止冲突

## 使用
1. codex安装
将ast-deobfuscation、web-reverse-algorithm和web-reverse-env三个文件夹复制到`C:\Users\用户名\.codex\skills`目录下即可使用
2. claude cli使用
将ast-deobfuscation、web-reverse-algorithm和web-reverse-env三个文件夹复制到`C:\Users\用户名\.claude\skills`目录下即可使用，没有skills目录手动创建一个即可，创建完成之后重新打开claude cli并输入/skills来验证是否已经识别到

## Claude Cli安装教程

Node和git先安装(node -v 和 git -v 查看是否安装成功)

1. npm install -g @anthropic-ai/claude-code
2. 配置用户环境变量CLAUDE_CODE_GIT_BASH_PATH, 值为C:\Program Files\Git\bin\bash.exe (此处为你实际bash.exe文件位置，需要自行查找）
3. 打开cmd，输入claude即可使用
4. 如果是第三方中转接口, cmd中运行以下命令配置环境变量ANTHROPIC_AUTH_TOKEN和ANTHROPIC_BASE_URL
```
setx ANTHROPIC_AUTH_TOKEN "第三方接口token(sk开头的那个)"
setx ANTHROPIC_BASE_URL "第三方接口地址"
```

## Skill 简介

### web-js-env-patcher(最新补环境skill)
使用该skill前可将ast-deobfuscation和web-js-env-patcher和web-reverse-env关闭，防止冲突，使用模板如下:
```
请帮我分析网站: https://hk.trip.com/hotels/list?city=30&provinceId=0&countryId=1&checkIn=2026-06-18&checkOut=2026-06-19&lat=0&lon=0&districtId=0&barCurr=HKD&searchType=CT&searchValue=___&crn=1&adult=2&children=0&searchBoxArg=t&ctm_ref=ix_sb_dl&travelPurpose=0&domestic=true
以下是curl命令
curl 'https://hk.trip.com/hotels/list?city=30&provinceId=0&countryId=1&checkIn=2026-06-18&checkOut=2026-06-19&lat=0&lon=0&districtId=0&barCurr=HKD&searchType=CT&searchValue=___&crn=1&adult=2&children=0&searchBoxArg=t&ctm_ref=ix_sb_dl&travelPurpose=0&domestic=true' \
  -H 'accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7' \
  -H 'accept-language: zh-CN,zh;q=0.9' \
  -b 'GUID=09034081319500581032; GUID.sig=bVwVBDoosWTSu71M1dbr9TPEbEE9Zya3Zt4t_YyvoP0; UBT_VID=1781795784225.c4793L4Ganwm; ibu_online_jump_site_result={"isShowSuggestion":false,"isRedirect":false}; Union=AllianceID=8035980&SID=304032758&OUID=ctag.hash.iTzLk8GoVRkH&Expires=1784387784228&createtime=1781795784; ibusite=HK; ibugroup=trip; ibulanguage=HK; ibulocale=zh_hk; cookiePricesDisplayed=HKD; ibu_country=HK; ibu_cookie_strict=0; ubtc_trip_pwa=2; _tp_search_latest_channel_name=hotels; _bfa=1.1781795784225.c4793L4Ganwm.1.1781795797589.1781795797589.1.1.10320668088; _gcl_au=1.1.721846105.1781795801; _gcl_gs=2.1.k1$i1781795787$u30159398; _twpid=tw.1781795802116.378472634907363858; _uetsid=b60b95006b2811f1828149a4e7bbd0c1; _uetvid=b60bbf506b2811f1bbb8d3c0ba1df125; _fwb=236OiQ7bfHBqDlWPVbCu8SH.1781795802319; wcs_bt=s_33fb334966e9:1781795802; _abtest_userid=ec82b5ce-cfd1-480f-8526-3087c7d0c7b1; g_state={"i_l":0,"i_ll":1781795805787,"i_b":"Naf6TWfvBArLXQMe9vg1rTAq5MshZC8ukyyQMHV5JYQ","i_e":{"enable_itp_optimization":24},"i_et":1781795805781}; _RGUID=3b8edd5f-4678-4b59-86e5-e8711744fb29' \
  -H 'priority: u=0, i' \
  -H 'referer: https://hk.trip.com/?business=seo&sendmsg=%E6%97%85%E8%A1%8C%20cn&Allianceid=8035980&SID=304032758&trip_sub1=hk33&trip_sub3=D15280785&gad_source=1' \
  -H 'sec-ch-ua: "Chromium";v="137", "Not/A)Brand";v="24"' \
  -H 'sec-ch-ua-mobile: ?0' \
  -H 'sec-ch-ua-platform: "Windows"' \
  -H 'sec-fetch-dest: document' \
  -H 'sec-fetch-mode: navigate' \
  -H 'sec-fetch-site: same-origin' \
  -H 'sec-fetch-user: ?1' \
  -H 'upgrade-insecure-requests: 1' \
  -H 'user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36'
请求成功响应状态码为200
请求响应体内容为一个html数据，内容如下:
<!DOCTYPE html>
<html lang="zh-HK" data-cargo="locale:zh-HK,language:hk,currency:HKD,contextType:online,site:HK,group:Trip,country:HK" dir="ltr">
    <head>
        <meta charSet="utf-8"/>
        <link rel="preconnect" href="https://ak-d.tripcdn.com/"/>
        <link rel="preconnect" href="https://aw-d.tripcdn.com/"/>
        <link rel="preconnect" href="https://aw-s.tripcdn.com/"/>
        <link rel="preconnect" href="https://ak-s.tripcdn.com/"/>
        <link rel="dns-prefetch" href="//webresource.tripcdn.com"/>
        <link rel="dns-prefetch" href="//pic.tripcdn.com"/>
        <link rel="dns-prefetch" href="//www.trip.com"/>
        <link rel="dns-prefetch" href="//static.tripcdn.com"/>......
帮我使用补环境的方式得到响应的加密参数并且能正常请求到结果
```
以上为提示词模板，如果curl内容过多，可以将curl内容放到文件中，然后告诉curl文件路径即可，以上只是提示词模板，如果模板不符合规范，skill也会提醒用户补充必要的信息

### ast-deobfuscation

使用 Babel AST 对 JavaScript 做分层、可回退的定向反混淆。
适合处理 `_0x` 标识符、字符串表、自执行解码包装、dispatcher 对象、虚假分支、`while/for + switch` 控制流平坦化，以及 `if (literal === opcode)` 分发链等场景。对于 reese84、顶象、极验4、同花顺、网易易盾、小红书、OB 变种等站点或混淆家族，也提供了专门的模式识别与流水线脚本。

### web-reverse-algorithm

面向 Web/JS 逆向中的纯算与协议分析场景。
主要用于复杂 header/cookie 签名、混合加密、JSVMP/VMP、Wasm、PoW、响应解密、验证码参数还原、challenge/verify 流程分析，以及从最终请求或最终输出反推 writer、builder、entry、source 的完整链路。适合将逆向结果进一步沉淀为 solver、SDK、脚本或服务。

### web-reverse-env(已废弃)

面向浏览器补环境与运行时修补场景。
覆盖 Proxy 吐环境、原型链修复、native `toString` 保护、描述符保护，以及 `navigator`、`document`、`storage`、`canvas`、`WebGL`、`crypto`、`performance`、`WebRTC`、`Worker` 等模块化环境构建。适合处理浏览器环境缺失、反检测、指纹对齐和高强度风控环境修补问题。


