# 验证码接口取证、事件轨迹 fixture 与 web-verify-patcher 交接

当目标 API、Cookie、Header、Body 或参数名体现 `captcha`、`verify`、`challenge`、`waf`、`risk`、`slide`、`track`、`motion`、`validate`、`ticket`、`seccode`、`geetest`、`tcaptcha`、`yidun`、`turnstile` 等验证码 / 风控验证特征，或用户明确说明本次是验证码接口时读取本文件。本文件只约束网页端 JS 补环境与授权取证流程，不提供未授权绕过、批量通过、登录规避、短信 / 邮箱 / MFA / 2FA 处理。

## 1. 取证前验证码接口确认门禁

用户信息完整并确认任务后，启动任何浏览器取证、RuyiTrace 捕获、Hook、断点、JS 下载、动态资源保存或接口重放之前，必须先确认：

```markdown
本次目标接口是否属于验证码 / 风控验证 / challenge / WAF / 人机验证接口？

- 如果不是：按普通 Web JS 补环境流程继续。
- 如果是：请选择验证码流程取证方式：
  1. 我提供从触发到验证的完整流程，你按已确认取证工具自动完成取证。
  2. 我自己在取证浏览器中完成触发到验证，你只负责提前开启抓包 / Hook / Trace，并在我回复“已经完成触发到验证流程”后继续分析。
```

用户未确认是否为验证码接口，或确认是验证码接口但未选择流程取证方式前，不得开始验证码相关取证。

## 2. 两种验证码流程取证方式

### 方式 A：用户提供流程，AI 自动执行取证

要求用户提供尽量完整的流程信息：

- 入口页面 URL。
- 触发验证码的操作：点击按钮、输入字段、提交表单、滚动、接口失败后弹出等。
- 验证码出现位置：iframe、弹窗、Shadow DOM、内联组件或跳转页面。
- 验证码类型线索：滑块、点选、旋转、文字、无感、WAF challenge、PoW、风险评分等。
- 从验证码展示到点击验证 / 提交的完整操作顺序。
- 目标请求接口名、URL 片段、参数名或响应特征。
- 是否需要登录、人工验证或权限确认。

AI 执行时必须使用用户已确认的取证模式，并从第一次打开目标页开始满足该工具的反检测硬约束和 `isTrusted` 可信输入规则。ruyiPage 优先 native BiDi / human actions，必要 JS 事件使用 `ruyi: true`；Camoufox / CloakBrowser 使用 humanize / 原生输入，不把普通 `dispatchEvent` 作为验证码交互主路径。自动流程只能做最小必要交互和取证，不做批量尝试，不穷举验证码答案，不绕过登录、MFA 或访问控制。

### 方式 B：用户手动完成流程，AI 只负责捕获

在用户开始操作前，先开启已确认取证工具的网络捕获、Hook、截图或 Trace：

- ruyiPage：先 `page.capture.start(...)`，再让用户在页面中完成触发和验证。
- ruyiPage + RuyiTrace：先确认 RuyiTrace 记录已经开始，要求日志覆盖“触发验证码 → 展示 → 交互 → 点击验证 / 提交 → verify 接口返回”的完整时间段。
- Camoufox / MCP：先 `network_capture(action="start")`，需要时启用最小 Hook 或属性访问追踪。
- CloakBrowser：先开启网络捕获 / 事件记录，再让用户操作。
- 用户手动取证：要求用户导出 HAR / cURL / 关键截图 / Trace 日志。

自动取证如需触发事件，必须遵守 `trusted-input-and-isTrusted.md`。如果无法保证可信输入，优先让用户手动完成触发到验证流程。

用户完成后必须明确回复：

```text
已经完成触发到验证流程
```

收到确认后再停止捕获、导入日志、整理请求链路和 JS 证据。未收到确认时，不要假设验证码链路已经覆盖。

## 3. RuyiTrace 验证码日志覆盖要求

验证码场景下，RuyiTrace NDJSON 不能只覆盖页面首屏加载。日志必须覆盖：

1. 触发验证码前的关键操作。
2. 验证码组件初始化。
3. 用户交互事件写入：click、mousemove、pointermove、drag、touch、wheel、keydown 等。
4. 加密参数生成入口。
5. verify / validate / check / challenge 接口发起与 writer 写入。
6. 结果回调或错误处理。

导入日志后，如果 `notes/ruyitrace-summary.md` 没有覆盖上述阶段，先要求补采日志，不得直接进入补环境。长字段仍遵循 RuyiTrace 截断规则：达到或接近 4000 字符时只记录可见长度、最小长度和 hash，真实长度写 `unknown`。

## 4. 验证码补环境中的事件轨迹 fixture

验证码接口的加密参数经常依赖用户事件。`web-js-env-patcher` 的目标是让目标 JS 在 Node.js 中生成加密参数；此阶段允许先使用旧轨迹、旧点击序列或旧事件 fixture，目的只是让 signer 跑通并输出加密参数，不宣称最终验证码验证一定成功。注意：Node.js 中的 `motionTrack` / `eventFixture` 只是参数生成输入，不代表真实浏览器事件的 `isTrusted`。

必须把轨迹设计成可替换入口，不得写死在不可修改的 signer 逻辑中。推荐文件：

```text
case/fixtures/motion.fixture.json
case/fixtures/event.fixture.json
case/result/src/verify/motion-track.js
case/result/src/verify/event-fixture.js
```

推荐 JS 结构：

```javascript
// 验证码事件轨迹输入，当前先使用浏览器取证得到的旧轨迹样本。
// 后续可由 web-verify-patcher 根据识别结果替换坐标和时间间隔。
const motionTrack = [
  { x: 12, y: 18, t: 0, type: 'mousemove' },
  { x: 36, y: 19, t: 18, type: 'mousemove' },
  { x: 88, y: 21, t: 43, type: 'mouseup' }
];

async function makeVerifyParams(requestInput) {
  return signer.generate({
    request: requestInput,
    motionTrack,
    eventFixture: { source: 'old-browser-sample' }
  });
}
```

中文注释必须 UTF-8 正常显示，不得出现问号、连续问号或乱码。变量名应清晰，例如 `motionTrack`、`eventFixture`、`verifyContext`、`clickPoints`、`dragPath`。阶段报告中要写明：当前轨迹只用于补环境生成参数，最终识别和验证通过率交给 `web-verify-patcher` 继续处理。

## 5. 与 web-verify-patcher 的交接

当验证码接口的加密参数已经能通过补环境生成，且下一步需要识别验证码图片、生成真实轨迹、坐标换算、滑块偏移、点选顺序、旋转角度、验证码提交验证等任务时，应交给 `web-verify-patcher`。

调用前必须先检测是否已安装：

```bash
node scripts/check_web_verify_patcher.js --require --markdown
```

如果已安装，输出交接材料：

- 验证码类型和厂商初判。
- 入口页面、验证码 iframe / 脚本 URL、verify 接口。
- 图片 / 背景 / 滑块 / 点选素材来源。
- DOM 坐标系、设备像素比、容器位置和缩放。
- 旧 `motionTrack` / `eventFixture` 路径。
- 已补好的加密参数入口。
- 网络请求和 RuyiTrace / Hook 证据。

如果未安装，先让用户选择：

1. **自动安装**：用户提供安装目录；若用户未提供目录，说明将使用默认 Skill 目录。克隆 `https://github.com/lwjjike/xbsReverseSkill` 后必须检查仓库中是否存在 `web-verify-patcher/` 目录；如果不存在，不得假装安装成功，必须要求用户提供正确分支、正确仓库、压缩包或本地目录。
2. **自行安装**：告诉用户把 `web-verify-patcher` 文件夹放到 Codex Skill 目录，例如 Windows：`%USERPROFILE%\.codex\skills\web-verify-patcher`，macOS / Linux：`$HOME/.codex/skills/web-verify-patcher`。如当前环境使用 `.agents/skills`，可同步放到 `$HOME/.agents/skills/web-verify-patcher`。安装后重启 / 刷新 Codex，再重新检测。

## 6. 输出模板

```markdown
## 验证码接口取证确认

- 是否验证码 / 风控验证接口：是 / 否 / 待确认
- 验证码流程取证方式：用户提供流程由 AI 自动执行 / 用户自己完成流程，AI 捕获 / 不涉及
- 触发到验证流程是否已覆盖：是 / 否
- RuyiTrace 是否覆盖完整验证码流程：是 / 否 / 未使用
- 事件轨迹 fixture：`case/fixtures/motion.fixture.json` / 未涉及
- 轨迹入口变量：`motionTrack` / `eventFixture` / 其他
- 当前轨迹用途：仅用于补环境生成加密参数 / 用于后续识别验证
- web-verify-patcher 状态：已安装 / 未安装 / 待用户选择安装方式
- 下一步：继续补环境 / 交接 web-verify-patcher / 等待用户完成触发到验证流程
```
