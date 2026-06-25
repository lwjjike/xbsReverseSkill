# Camoufox / camoufox-reverse-mcp 取证参考

本文件只在用户选择或询问 Camoufox / camoufox-reverse-mcp 时读取。Camoufox 用于前置取证、采样、网络捕获、源码定位与日志收集，不得进入最终 `result/` 交付代码。

## 来源与定位

- Camoufox：<https://github.com/daijro/camoufox>，官方文档：<https://camoufox.com/python/installation/>、<https://camoufox.com/python/usage/>。
- camoufox-reverse-mcp：<https://github.com/WhiteNightShadow/camoufox-reverse-mcp>。

Camoufox 官方流程要求先安装 Python 包，再下载浏览器本体：

```bash
python -m pip install -U "camoufox[geoip]"
python -m camoufox fetch
python -m camoufox version
python -m camoufox path
```

`geoip` 在代理场景强烈建议安装，因为它用于根据出口 IP 计算经纬度、时区、国家和 locale。只安装 Python 包但没有执行 `python -m camoufox fetch`，不能视为可用于正式取证。

## 取证模式

| 模式 | 使用条件 | 阻塞条件 |
|---|---|---|
| Camoufox + camoufox-reverse-mcp | 需要 MCP 网络捕获、脚本搜索、Hook、请求 initiator、Cookie / Storage 或可选属性访问追踪 | Camoufox 或 MCP 任一不可用时暂停，不得静默降级 |
| 仅 Camoufox | 只需要用 Camoufox 官方 Python API 打开页面、轻量采样或手工导出材料 | Camoufox 包不存在或浏览器本体未 fetch 时暂停 |

如果用户选择 MCP，但未检测到 MCP：要求用户提供项目目录 / Python 环境，或确认安装；只有用户明确回复“降级为仅 Camoufox”才可以不用 MCP 继续。

## 安装检测

每次启动浏览器前先运行检测脚本：

```bash
node scripts/check_external_tools.js --python python --require-camoufox --markdown
node scripts/check_external_tools.js --python python --require-camoufox --camoufox-install-dir <camoufox-cache-dir> --markdown
node scripts/check_external_tools.js --python python --require-camoufox --require-camoufox-mcp --camoufox-mcp-project-dir <camoufox-reverse-mcp-dir> --json
```

检测通过标准：

- `camoufox` Python 包可导入。
- `from camoufox.sync_api import Camoufox` 可导入。
- `python -m camoufox path` 返回的路径存在，或在用户提供 / 默认缓存目录检测到浏览器本体。
- 选择 MCP 时，`camoufox_reverse_mcp` 可导入，或用户提供的项目目录可通过 `src/` 导入。

## 安装引导

如果用户确认未安装 Camoufox，先让用户提供 Python / venv 和下载缓存目录；如果用户不提供目录，说明将使用 Camoufox 默认缓存目录，然后执行：

```bash
python -m pip install -U "camoufox[geoip]"
python -m camoufox fetch
python -m camoufox version
python -m camoufox path
```

如果用户确认未安装 camoufox-reverse-mcp，先让用户提供克隆目录；如果用户不提供，使用当前项目外的用户确认目录或系统临时下载目录，不要把安装仓库混入最终 case 产物：

```bash
git clone https://github.com/WhiteNightShadow/camoufox-reverse-mcp.git <install-dir>
cd <install-dir>
python -m pip install -e .
python -c "import camoufox_reverse_mcp; print('ok')"
```

MCP 客户端配置示例：

```json
{
  "mcpServers": {
    "camoufox-reverse": {
      "command": "python",
      "args": ["-m", "camoufox_reverse_mcp"]
    }
  }
}
```

带代理且用户授权时，可在 MCP 参数中加入 `--proxy`、`--geoip`、`--humanize`、`--block-webrtc`。不要修改 AiMaMi 或其他本地代理配置；只输出用户可自行应用的配置建议。

## 启动硬约束

从第一次打开目标站开始就使用 Camoufox，不得先使用普通 Playwright、Puppeteer、Selenium、系统 Firefox 或系统 Chrome 试探。

必选约束：

- 默认有头：`headless=False`。Linux 无显示环境且用户确认时才使用官方 `headless="virtual"`。
- 默认拟人：`humanize=True`。
- 代理场景按授权启用 `geoip=True`，必要时 `block_webrtc=True`。
- 不固定窗口、字体、WebGL、locale 等指纹，除非已有真实样本或用户明确要求。
- 登录态场景使用持久上下文时，把 profile 放入 case 临时目录并标记为敏感材料。
- 点击、输入、滚动、拖拽使用 Camoufox / Playwright 原生输入路径或 MCP 官方交互能力；不要使用 `page.evaluate(() => dispatchEvent(...))` 作为高风控交互主路径。

Python API 取证示例：

```python
from camoufox.sync_api import Camoufox

with Camoufox(headless=False, humanize=True, geoip=True, block_webrtc=True) as browser:
    page = browser.new_page()
    page.goto("https://example.com")
```

该示例只能用于前置取证，不得复制到最终 `result/`。

## isTrusted 与可信输入

Camoufox 可以降低自动化和指纹检测风险，但前置取证仍应避免普通 JS 合成事件。鼠标、键盘、拖拽、滚动优先使用 Camoufox 官方 API 的原生输入路径；如果某个流程只能通过 `page.evaluate` 合成事件完成，应先标记 `isTrusted=false` 风险并暂停，让用户选择手动操作、切换到 ruyiPage 的 native BiDi / `ruyi: true`，或在授权范围内接受该风险。

## MCP 取证流程

1. `check_environment`：确认 MCP、Camoufox、浏览器状态。
2. `launch_browser(headless=false, humanize=true, geoip=true, block_webrtc=true)`：启动时即启用反检测约束。
3. `network_capture(action="start")`：在 `navigate` 前开始捕获。
4. `navigate(url="目标页面")`：打开页面；需要登录时暂停并让用户手动登录。
5. 用户回复“已经登录成功”后，再继续触发最小必要业务动作。
6. `list_network_requests`：按 URL、方法、资源类型筛选目标接口。
7. `get_network_request`：保存请求头、query、body、响应摘要；敏感字段做脱敏记录。
8. `get_request_initiator`：定位请求发起栈。
9. `scripts(action="list|get|save")` 和 `search_code`：收集相关 JS 文件和关键字命中。
10. `inject_hook_preset("xhr"/"fetch"/"cookie"/"crypto")` 或 `hook_function`：最小必要 Hook；阶段结束后 `reset_browser_state`。
11. 可选 `trace_property_access(duration=0, mode="summary", collect_values=True)`：当需要浏览器环境访问日志辅助补环境时使用，结果复制到 case 的 `evidence/` 或 `notes/`，并在阶段结束后清理缓存中的无关大文件。

## 登录处理

不要索要账号、密码、验证码或 MFA。需要登录时：

1. 暂停自动动作。
2. 让用户在当前 Camoufox / MCP 打开的页面中手动登录。
3. 用户回复“已经登录成功”后，复述将继续的取证动作并再次确认。
4. 只采集授权分析所需的最小请求、Cookie / Storage 摘要和 JS 证据。

## 与补环境的关系

Camoufox 采集到的 Network、Initiator、脚本源码、Hook 日志、环境访问日志只作为补环境输入。进入 Node.js 补环境后仍然要遵守本 Skill 的 addon-first、属性描述符、原型链、toString 保护、指纹值回放和 fixture 验证规则。

如果同时存在 RuyiTrace NDJSON，且用户选择了 ruyiPage + RuyiTrace，则补环境优先依据 RuyiTrace NDJSON；Camoufox 的属性访问追踪只作为补充证据。

## 最终交付禁入

最终 `result/` 目录不得包含：

- `Camoufox`、`AsyncCamoufox`、`camoufox_reverse_mcp`。
- `launch_browser`、`network_capture`、`navigate`、`page.goto`、`browser.new_page`。
- Playwright / Puppeteer / Selenium / CDP / WebDriver 启动代码。
- Camoufox profile、trace 缓存、截图、HAR、Hook 临时代码或无关大文件。

最终验证必须由 Node.js / Python TLS 指纹兼容请求客户端发起少量授权模拟请求，或按用户确认只输出本地参数。
