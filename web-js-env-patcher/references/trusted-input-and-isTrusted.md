# isTrusted 事件检测与可信输入取证规则

当用户选择 ruyiPage、Camoufox、CloakBrowser 自动执行点击、拖拽、鼠标移动、键盘输入、滚动或验证码交互时读取本文件。目标是在前置取证阶段尽量使用浏览器原生输入路径，避免普通 JavaScript 合成事件导致 `event.isTrusted === false` 被目标站检测。

## 核心硬性规则

1. 取证交互从第一次打开目标页开始就使用用户确认的工具原生输入路径，不要先用普通 Playwright、Puppeteer、Selenium、CDP 或 `dispatchEvent` 试探。
2. 普通 `element.dispatchEvent(new MouseEvent(...))`、`new KeyboardEvent(...)`、`new PointerEvent(...)` 默认视为不可信事件风险，不能作为验证码、高风控点击、拖拽、输入的主路径。
3. 如果必须构造事件，只能在工具明确提供可信事件补丁时使用，并在阶段报告中标记工具、事件类型、参数和风险。
4. 用户手动操作天然优先于自动化合成事件。登录、MFA、验证码答案、设备确认和高风险验证优先让用户在已确认取证浏览器中手动完成。
5. 可信输入只用于授权前置取证、最小必要交互和样本采集。最终 `result/` 不得包含浏览器自动化代码。

## ruyiPage

ruyiPage 模式优先使用 Firefox / WebDriver BiDi 原生动作链和拟人动作：

```python
page.actions.move_to(page.ele("#btn")).click().perform()
page.actions.drag(page.ele("#source"), page.ele("#target"), duration=640, steps=16).perform()
page.actions.release()
page.actions.human_move(ele, algorithm="windmouse").perform()
page.actions.human_click(ele, algorithm="windmouse").perform()
```

如果确实必须在页面内构造 JS 事件，必须使用 ruyiPage 支持的 `ruyi: true` 参数，并说明这是 ruyiPage 特定能力，不要迁移到普通浏览器或最终项目：

```javascript
new Event('change', { bubbles: true, ruyi: true });
new InputEvent('input', { bubbles: true, data: 'A', inputType: 'insertText', ruyi: true });
new MouseEvent('click', { bubbles: true, clientX: 12, clientY: 24, ruyi: true });
new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', code: 'Enter', ruyi: true });
new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 3, clientY: 5, ruyi: true });
new WheelEvent('wheel', { bubbles: true, deltaY: 120, ruyi: true });
```

ruyiPage 取证报告中要记录：使用的是 native BiDi action、human action、`ruyi: true` 事件，还是用户手动操作。普通 JS 合成事件不能被写成可信操作。

## Camoufox

Camoufox 模式从启动开始使用官方入口，默认 `headless=False` 和 `humanize=True`。鼠标、键盘、拖拽、滚动优先使用 Camoufox / Playwright 风格的原生输入接口或 MCP 的官方交互能力，不要通过 `page.evaluate(() => element.dispatchEvent(...))` 合成事件。

如果某个流程必须依赖页面内合成事件，应先暂停并说明 `isTrusted=false` 风险，让用户选择：

- 改为用户手动操作。
- 切换到 ruyiPage 并使用 native BiDi action 或 `ruyi: true`。
- 在授权范围内接受该风险，仅用于非关键取证。

## CloakBrowser

CloakBrowser 模式必须通过官方包装器启动，并默认 `humanize=True`。点击、输入、滚动、拖拽使用 CloakBrowser humanize patch 后的交互方法，不要用普通 `page.evaluate` 合成事件。

CloakBrowser 源码中的 fallback 到 `page.evaluate` 路径应视为可检测风险。若交互链路无法使用 humanize / 原生输入，应暂停并让用户确认是否手动完成或切换工具。

## 验证码与轨迹 fixture

验证码前置取证的真实浏览器交互必须遵守本文件。旧 `motionTrack` / `eventFixture` 只用于 Node.js 补环境阶段让 signer 生成加密参数，不代表真实浏览器事件的 `isTrusted`，也不保证最终验证码验证通过。

交付给 `web-verify-patcher` 前，必须说明轨迹来源、是否由可信输入采集、是否只是旧样本，以及后续需要重新生成真实轨迹或由用户确认人工轨迹。
