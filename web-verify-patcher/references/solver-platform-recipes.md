# 打码平台与请求模板

## 平台选择

| 场景 | 常见平台 |
| --- | --- |
| 图片文字、计算题 | 云码/JFBYM、超级鹰、2Captcha、Anti-Captcha |
| 坐标、点选、滑块 | 云码/JFBYM、超级鹰、2Captcha Coordinates、CapSolver ComplexImageTask |
| reCAPTCHA、hCaptcha、Turnstile | 2Captcha、CapSolver、CapMonster Cloud、Anti-Captcha、YesCaptcha/NoCaptchaAI |
| GeeTest、FunCaptcha/Arkose | 2Captcha、CapSolver、CapMonster Cloud、Anti-Captcha |
| AWS WAF、DataDome、复杂 WAF | 平台支持不稳定，优先厂商日志和环境诊断 |
| PoW、活体、人脸 | 通常不建议平台；优先官方接入、人工审核或厂商支持 |

## 使用原则

1. 先确认授权范围和目标环境。
2. 先用开源方案跑样本；通过率不足再考虑平台。
3. 平台参数只使用非秘密字段：sitekey、pageurl、action、图片 base64、题面、坐标模式等。
4. API key 由用户在运行时提供，不写入 skill 文件，不输出到报告。
5. token 类结果只用于授权测试和服务端集成诊断，不注入未授权流程。

## 请求模板脚本

使用 `scripts/solver_request_template.py` 生成模板：

```bash
python scripts/solver_request_template.py --platform 2captcha --captcha-type token-widget --provider recaptcha --pretty
python scripts/solver_request_template.py --platform jfbym --captcha-type click-select --pretty
python scripts/solver_request_template.py --platform capsolver --captcha-type game-challenge --provider arkose-funcaptcha --pretty
```

脚本输出 JSON 模板。

## 字段提示

### 图片文字/算术

常见字段：

- 图片：文件或 base64。
- 题型：文字、数字、算术。
- 字符约束：长度、数字/字母、大小写。

### 坐标/点选/九宫格

常见字段：

- 完整截图或图片 base64。
- 题面文本。
- 输出模式：单点、多点、有序坐标、格子编号。
- 坐标原点和图片尺寸。

### 滑块/旋转

常见字段：

- 背景图、滑块图或单张挑战图。
- 轨道宽度、显示尺寸、DPR。
- 输出模式：偏移、角度、坐标。

### token widget

常见字段：

- `websiteURL` / pageurl。
- `websiteKey` / sitekey。
- `action`、`cdata`、`rqdata`、enterprise 标记。
- user-agent、代理和 session 是否需要绑定。

### FunCaptcha/Arkose

常见字段：

- public key / pkey。
- surl。
- blob。
- pageurl。
- 题面类型和是否需要代理绑定。

## 平台失败排查

- 题型选错：平台返回无解或低通过。
- 图片裁剪错：坐标和页面元素不一致。
- pageurl/action/sitekey 不匹配：token 服务端校验失败。
- token 过期：TTL 太短或提交太晚。
- session/IP/UA 不一致：平台结果无法绑定当前浏览器。
- 代理质量差：风控产品直接拒绝。
