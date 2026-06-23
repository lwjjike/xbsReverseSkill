# 信息收集模板

当用户没有提供完整信息时，使用本模板让用户补充。标注“必填”的字段缺失时，不要进入正式分析。

```markdown
# Web JS Node.js 补环境任务信息

## 0. 取证模式选择（必填）

请从一开始确认本 case 的取证模式。后续所有抓包、JS 收集、Hook、断点、截图、RuyiTrace 日志采集等取证动作都会沿用该模式；如果后续需要切换工具，我会再次请求确认。

- [ ] ruyiPage + RuyiTrace（推荐）
- [ ] 仅 ruyiPage
- [ ] Camoufox + camoufox-reverse-mcp
- [ ] 仅 Camoufox
- [ ] CloakBrowser
- [ ] 用户手动取证（你提供 cURL / HAR / JS 文件 / 调用栈截图 / RuyiTrace 日志）
- [ ] AI 自行决定（我会先检测工具并给出建议，启动前再次确认）

## 0.5 最终请求 TLS 指纹兼容客户端选择（必填）

如果本任务最终需要发送真实请求或交付 `final.js` / `final.py`，请从一开始选择最终请求客户端；不要等普通 `fetch` / `requests` 失败后再临时切换。

- [ ] Node.js CycleTLS
- [ ] Node.js impers
- [ ] Node.js curl-cffi
- [ ] Python curl_cffi
- [ ] Python cffi_curl
- [ ] Python cyCronet
- [ ] 不发真实请求，只输出本地 sign / 参数

说明：TLS 指纹兼容客户端只用于授权范围内的少量最终验证请求，不用于批量访问、绕过登录、验证码、MFA、付费墙或访问控制。

## 1. 目标说明

- 目标网站 URL（必填）：
- 目标页面 URL（建议）：
- 是否需要登录（必填）：是 / 否 / 不确定
- 是否有授权测试权限（必填）：是 / 否 / 不确定
- 目标业务场景（建议）：登录 / 搜索 / 列表接口 / 详情接口 / 下单 / 评论 / 其他

## 2. 目标接口

- 目标 API URL（必填）：
- 请求方法（必填）：GET / POST / PUT / DELETE / 其他
- 目标加密参数名（必填）：例如 sign / token / x-s / a_bogus / h5st
- 参数出现位置（必填）：Query / Header / Body / Cookie
- 目标接口用途（建议）：

## 3. 成功请求样本

请至少提供一份成功请求，优先使用浏览器 DevTools 的 Copy as cURL。

```bash
# 在这里粘贴 Copy as cURL
```

如果有多组样本，请继续粘贴：

```bash
# 样本 2
```

## 4. 成功响应样本（建议）

```json
{
  "示例": "响应内容"
}
```

## 5. 已知 JS 文件（建议）

- JS 文件 URL：
- 是否已下载到本地：是 / 否
- 本地文件路径：
- 是否混淆：是 / 否 / 不确定
- 是否有 sourcemap：是 / 否 / 不确定

## 6. DevTools 调试信息（建议）

- Network Initiator 截图或文本：
- 调用栈 Stack Trace：
- 断点位置：
- 可疑函数名：
- 可疑变量名：
- 可疑代码片段：

## 7. 浏览器环境（建议）

- 浏览器：Chrome / Edge / 其他
- 浏览器版本：
- User-Agent：
- 语言：
- 时区：
- 屏幕尺寸：
- 是否依赖 Cookie：是 / 否 / 不确定
- 是否依赖 localStorage：是 / 否 / 不确定
- 是否依赖 sessionStorage：是 / 否 / 不确定
- 是否可能依赖 canvas / WebGL / 浏览器指纹：是 / 否 / 不确定

## 8. 期望产物

- [ ] 只做前置分析
- [ ] 收集 JS 文件
- [ ] 定位加密入口
- [ ] 生成 Node.js 补环境骨架
- [ ] 生成 runner.js
- [ ] 生成测试 fixtures
- [ ] 输出分析笔记

## 9. 范围确认

- [x] 只做网页端 JS
- [x] 只做 Node.js 补环境
- [x] 不做 App / 小程序 / Windows / Native 逆向
- [x] 不做纯算重写
- [x] 不做浏览器自动化批量采集
```

如果必填字段缺失，只要求用户先补齐缺失的必填项，不要让用户一次性补充所有建议项。

特别注意：用户只提供 cURL、Cookie、旧补环境文件或“要求成功请求”时，仍视为未完成信息收集。缺少“取证模式”和“最终请求 TLS 指纹兼容客户端”任一项时，不得开始取证、补环境或发送真实请求。
