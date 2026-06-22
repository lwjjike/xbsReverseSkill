# 分阶段中文 Markdown 报告规则

本文件用于约束一个高难度 Web JS Node.js 补环境 case 在多轮对话中的阶段性总结产物。阶段报告不是最终总结的替代品，而是在每个合适的推进节点沉淀当前进展、修改内容、能力增量、WebAPI / 指纹变化、Bug 修复、测试结果、阻塞点和下一步计划，方便跨轮对话继续工作。

## 硬性规则

- 所有由 Skill 生成的 Markdown 报告文件名必须包含中文，不能只使用 `final-summary.md`、`stage-1.md`、`report.md` 这类英文文件名。
- 阶段报告统一写入 `case/阶段报告/`，最终总结统一写入 `case/result/最终项目总结.md`。
- Markdown 内容必须 UTF-8 写入；不要使用未指定编码的 shell 重定向写中文。
- 每个合适推进节点结束后立即写入或更新对应阶段报告，不要等项目完成后一次性补写；“合适推进节点”由执行者根据实际任务判断，不局限于固定流程阶段。
- 阶段报告既要写阶段结论、用户确认信息、证据摘要和下一步计划，也要写本阶段新增 / 修改的 WebAPI、补环境功能、指纹能力、Bug 修复、测试结果和清理状态；不要写入明文 Cookie、Authorization、账号、手机号、完整 token、完整 localStorage 等敏感内容。
- 阶段报告可以记录临时证据路径，但必须标注“临时证据 / 已清理 / 需用户确认保留”，不要把临时 hook、trace、HAR、截图、Profile 当成最终交付物。
- 如果用户明确要求不生成阶段报告，必须在对话和最终总结中记录该豁免；否则默认生成。

## 推荐阶段与中文文件名

| 阶段 | 文件名 | 触发时机 |
|---|---|---|
| 需求信息确认 | `01-需求信息确认.md` | 用户提供 URL、API、参数、样本、取证模式等初始材料后，或发现信息不完整并列出缺失项时 |
| 取证方案确认 | `02-取证方案确认.md` | 用户确认 ruyiPage / RuyiTrace / Camoufox / CloakBrowser / 手动取证 / AI 自行决定后 |
| 请求样本与可疑参数确认 | `03-请求样本与可疑参数确认.md` | 解析 cURL / HAR / 请求样本并列出所有可疑加密参数后 |
| JS文件与入口定位 | `04-JS文件与入口定位.md` | 收集 JS 文件、定位 source / entry / builder / writer 后 |
| 补环境前置分析 | `05-补环境前置分析.md` | 进入 Node.js 补环境前，完成日志、trace、依赖和风险优先级整理后 |
| 补环境实现记录 | `06-补环境实现记录.md` | env / signer / request 模块形成并通过主要 fixture 后 |
| 验证与清理记录 | `07-验证与清理记录.md` | 最终请求验证、代码质量检查、最终产物检查、清理检查完成后 |
| 最终项目总结 | `最终项目总结.md` | 项目完成后，写入 `case/result/最终项目总结.md` |

可以根据实际 case 增加中文命名阶段报告，例如 `08-addon接口更新阶段报告.md`、`09-通用代码变更记忆机制实现报告.md`、`10-WebAPI补齐阶段报告.md`、`11-指纹回放能力阶段报告.md`、`12-二次补样复盘.md`、`13-线上复测记录.md`，但文件名仍必须包含中文。

## 动态阶段报告触发时机

除了固定阶段外，执行者应在以下节点主动生成阶段报告：

- 完成一轮明确修改后，例如更新 Skill 流程、脚本、参考文档、addon helper、env 模块、signer 或 request 客户端。
- 新增、迁移或重构一批 WebAPI 后，例如新增 `Navigator`、`Document`、`Location`、`Storage`、`Canvas`、`WebGL` 等对象或方法。
- 新增或调整指纹能力后，例如 Canvas / WebGL / WebGPU / Audio / 字体 / DOM 几何的真实值采样与回放。
- 修复一个关键 Bug 后，例如参数不一致、旧式 addon API 回退、toString 保护缺失、属性描述符错误、原型链错误、TLS 客户端选择错误。
- 完成一轮测试后，例如 fixture 对比、addon smoke、RuyiTrace 证据检查、代码质量检查、最终产物检查。
- 发现阻塞点、需要用户确认、需要补样本或需要重新取证时。
- 长时间任务中已经推进较多但尚未最终交付时，主动写入进度快照。

动态阶段报告应优先采用“编号 + 中文主题”的文件名，例如：

```text
case/阶段报告/08-addon接口更新阶段报告.md
case/阶段报告/09-WebAPI补齐阶段报告.md
case/阶段报告/10-指纹回放能力阶段报告.md
case/阶段报告/11-Bug修复与回归测试报告.md
```

## 阶段报告写入命令

优先使用脚本生成或写入，避免编码问题：

```bash
node scripts/write_stage_report.js --case-dir case --stage 需求信息确认 --data case/notes/需求信息.json --markdown
node scripts/write_stage_report.js --case-dir case --stage 请求样本与可疑参数确认 --input case/tmp/可疑参数草稿.md --markdown
node scripts/write_stage_report.js --case-dir case --stage 验证与清理记录 --append --input case/tmp/清理结果.md --markdown
node scripts/write_stage_report.js --case-dir case --stage WebAPI补齐阶段报告 --index 08 --data case/notes/阶段进展.json --markdown
```

写入任意中文命名 Markdown 时使用：

```bash
node scripts/write_markdown_utf8.js --input case/tmp/总结草稿.md --out case/result/最终项目总结.md --require-chinese-name --markdown
```

检查阶段报告：

```bash
node scripts/check_stage_reports.js --case-dir case --require-stage 需求信息确认 --markdown
node scripts/check_stage_reports.js --case-dir case --require-stage 需求信息确认 --require-stage 请求样本与可疑参数确认 --json
node scripts/check_stage_reports.js --case-dir case --require-stage WebAPI补齐阶段报告 --require-dynamic-fields --require-capability-report --markdown
```

## 阶段 1：需求信息确认报告内容

当用户刚提供需求信息时，优先生成 `case/阶段报告/01-需求信息确认.md`。内容至少包含：

- 目标网站 URL。
- 目标页面 URL。
- 目标 API。
- 请求方法。
- 用户声明的加密参数。
- 请求样本中发现的可疑加密参数。
- 参数位置：Query / Header / Body / Cookie。
- 取证模式选择：ruyiPage + RuyiTrace / 仅 ruyiPage / Camoufox + camoufox-reverse-mcp / 仅 Camoufox / CloakBrowser / 用户手动取证 / AI 自行决定。
- 最终请求 TLS 指纹兼容客户端选择。
- 已提供的 JS 文件 / 加密文件 / bundle / chunk / sourcemap。
- 是否需要登录，以及是否等待用户手动登录。
- 已提供材料列表与缺失材料列表。
- 下一步需要用户确认的问题。

如果信息不完整，也要生成该阶段报告，明确“当前不能进入正式分析”的原因和待补充项。

## 阶段报告模板

```markdown
# 阶段报告：需求信息确认

生成时间：
阶段状态：信息完整 / 信息不完整 / 等待用户确认

## 1. 用户已提供信息

- 目标网站 URL：
- 目标页面 URL：
- 目标 API：
- 请求方法：
- 加密参数：
- 参数位置：
- 取证模式：
- 最终请求 TLS 指纹兼容客户端：
- 已知 JS 文件 / 加密文件：
- 是否需要登录：

## 2. 已提供样本与证据

- cURL / HAR：
- 响应样本：
- 浏览器 fixture：
- RuyiTrace NDJSON：
- Camoufox / CloakBrowser / ruyiPage 取证记录：

## 3. 缺失信息与阻塞点

- 缺失项：
- 阻塞原因：
- 需要用户确认：

## 4. 下一步计划

1. 
2. 
3. 
```

## 动态阶段报告模板

当本阶段涉及代码、能力、WebAPI、指纹或 Bug 修复时，优先使用以下模板。该模板可以用于任意中文阶段名，例如 `WebAPI补齐阶段报告`、`指纹回放能力阶段报告`、`Bug修复与回归测试报告`。

```markdown
# 阶段报告：WebAPI补齐阶段报告

生成时间：
阶段状态：进行中 / 已完成 / 阻塞 / 待用户确认

## 1. 当前阶段目标

- 本阶段要解决的问题：
- 本阶段范围：
- 不在本阶段处理的内容：

## 2. 当前项目进展

- 已完成：
- 进行中：
- 尚未开始：
- 阻塞点：

## 3. 本阶段修改文件

| 文件 | 修改类型 | 修改原因 | 影响范围 |
|---|---|---|---|
| result/src/env/navigator.js | 新增 / 修改 / 删除 |  |  |

## 4. 本阶段新增 / 修改的 WebAPI

| WebAPI | 挂载位置 | 类型 | 实现方式 | 是否 addon-first | 证据来源 | 测试结果 |
|---|---|---|---|---|---|---|
| navigator.userAgent | Navigator.prototype | getter | createGetter | 是 | RuyiTrace / 浏览器样本 | 通过 |

## 5. 本阶段新增功能

- 新增功能：
- 功能入口：
- 使用方式：
- 对最终产物的影响：

## 6. 本阶段修复的 Bug

| Bug | 原因 | 修复方式 | 涉及文件 | 验证结果 | 防回退记录 |
|---|---|---|---|---|---|
|  |  |  |  |  | notes/代码变更记忆.md |

## 7. 本阶段新增 / 修改的指纹能力

| 指纹类型 | API | 实现策略 | 样本来源 | 回放方式 | 风险 |
|---|---|---|---|---|---|
| Canvas | toDataURL | 真实值回放 | 浏览器采样 | 按调用参数匹配 | 样本不足 |

## 8. 真实性保护变化

- 函数 toString 保护：
- 访问器 toString 保护：
- 属性描述符：
- 原型链：
- 实例对象 `[object Xxx]`：
- `document.all` / HTMLDDA：
- addon 使用情况：
- fallback 原因：

## 9. 本阶段测试内容与结果

| 测试项 | 命令 / 方法 | 结果 | 备注 |
|---|---|---|---|
|  |  | 通过 / 失败 |  |

## 10. 清理情况

- 已清理：
- 保留证据：
- 敏感材料处理：

## 11. 风险与遗留问题

- 风险：
- 未覆盖样本：
- 需要用户确认：

## 12. 下一步计划

1.
2.
3.
```

## 最终总结与阶段报告关系

- 阶段报告记录“当时的状态”和“阶段性结论”，允许出现待确认项。
- 动态阶段报告还要记录“本阶段能力增量”，包括新增 WebAPI、功能、指纹、Bug 修复、真实性保护和测试结果。
- `result/最终项目总结.md` 记录最终结论，必须引用阶段报告中的关键决策，但不要重复粘贴所有中间日志。
- 最终交付检查时，应确认 `case/阶段报告/` 中至少存在 `01-需求信息确认.md`，并确认文件名和内容均为 UTF-8 中文正常显示。
