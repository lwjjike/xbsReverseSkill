# 最终项目总结模板



项目完成后或准备最终交付时必须读取本文件并默认生成 `case/result/最终项目总结.md`。最终总结 / 项目复盘 / 任务报告不是按用户要求才生成，而是规范性硬性产物；只有用户明确要求不生成最终总结时才可跳过，并需在阶段输出中记录原因。总结报告必须使用 UTF-8 写入，避免 Windows PowerShell / cmd 默认编码把中文写成 “连续问号”。



## 编码硬规则



- 不要使用 `cmd > report.md` 或未指定编码的 PowerShell 重定向写中文 Markdown。

- 推荐使用本 Skill 提供的写入脚本：



```bash

node scripts/write_markdown_utf8.js --out case/result/最终项目总结.md --require-chinese-name --markdown < case/tmp/最终项目总结草稿.md

node scripts/write_markdown_utf8.js --input case/tmp/最终项目总结草稿.md --out case/result/最终项目总结.md --require-chinese-name --markdown

```



- 如果草稿内容已经出现大量 “连续问号” 且没有中文字符，先回到原始结论重新生成，不要覆盖最终报告。

- 报告中不得明文写入 Cookie、Authorization、localStorage、账号标识等敏感内容。



## 章节生成规则



- 必须保留“阶段报告索引”“native addon / NativeProtect 使用情况”章节。
- 必须保留“补环境框架选择与 Trace 复杂度评估”“加密参数生成与样本复用检查”“代码质量与中文注释”“最终交付结构”“测试结果”“清理结果”章节。
- 必须写入 `case/result/最终项目总结.md`；除非用户明确要求不生成，否则 `check_final_artifact.js` 会默认检查该中文命名文件。

- 只有用户选择 ruyiPage + RuyiTrace、或用户提供 RuyiTrace NDJSON 日志时，才保留 RuyiTrace 章节；否则删除整章。

- 如果用户选择“不发真实请求，只输出本地参数”，TLS 请求验证章节需写明该选择和原因。

- 不要把临时 hook、trace、HAR、浏览器 Profile、截图路径写成最终交付物。

- 最终总结必须引用本 case 已生成的 `case/阶段报告/` 中文阶段报告，例如 `01-需求信息确认.md`、`03-请求样本与可疑参数确认.md`，并说明关键决策来自哪个阶段。



## 模板



```markdown

# Web JS Node.js 补环境项目总结



生成时间：

任务范围：网页端 JS Node.js 补环境



## 1. 目标与边界



- 目标网站 URL：

- 目标页面：

- 目标 API：

- 请求方法：

- 目标加密参数：

- 参数位置：Query / Header / Body / Cookie

- 是否需要登录：

- 取证模式：ruyiPage + RuyiTrace / 仅 ruyiPage / Camoufox + camoufox-reverse-mcp / 仅 Camoufox / CloakBrowser / 用户手动取证 / AI 自行决定

- 最终请求 TLS 指纹兼容客户端：Node.js CycleTLS / Node.js impers / Node.js curl-cffi / Python curl_cffi / Python cffi_curl / Python cyCronet / 不发真实请求

- 补环境框架选择：不使用补环境框架（默认） / isolated-vm（随包魔改 xbs isolated-vm） / Node.js 内置 vm / jsEnv

- 明确排除：App / 移动端 / Windows / Native / 批量爬虫 / 绕过登录或验证码



## 2. 用户提供材料



- 成功请求样本：

- 响应样本：

- 已知 JS 文件：

- HAR / cURL：

- 浏览器真实输出 fixture：

- RuyiTrace NDJSON：有 / 无 / 未使用

- 其他说明：



## 3. 阶段报告索引

- `阶段报告/01-需求信息确认.md`：已生成 / 未生成
- `阶段报告/02-取证方案确认.md`：已生成 / 未生成 / 未涉及
- `阶段报告/03-请求样本与可疑参数确认.md`：已生成 / 未生成 / 未涉及
- `阶段报告/04-JS文件与入口定位.md`：已生成 / 未生成 / 未涉及
- `阶段报告/05-补环境前置分析.md`：已生成 / 未生成 / 未涉及
- `阶段报告/06-补环境实现记录.md`：已生成 / 未生成 / 未涉及
- `阶段报告/07-验证与清理记录.md`：已生成 / 未生成 / 未涉及
- 阶段报告缺失原因或用户豁免：

## 4. 前置校验结果



- 请求样本完整性：

- 加密参数是否存在：

- JS 文件可获取性：

- 是否需要用户手动登录：

- Cookie / token 状态：

- 临时文件清理状态：



## 5. 取证流程与证据来源



- 使用的取证工具：

- 工具安装 / 可用性检查：

- 抓包 / Hook / 断点策略：

- JS 文件收集来源：

- 关键调用栈来源：

- 可信度说明：



<!-- 未使用 RuyiTrace 时删除本章节 -->

## 6. RuyiTrace 日志使用情况



- NDJSON 路径或来源：

- 导入脚本：

- 命中的 WebAPI：

- 关键证据：`api` / `stack.file` / `line` / `col`

- 由日志推导出的环境依赖：

- 后续环境异常排查是否继续参考 NDJSON：



## 7. 加密参数定位结论



- source：

- entry：

- builder：

- writer：

- 参数写入位置：

- 关键 JS 文件：

- 关键函数 / 类 / SDK：

- 未确认项：



## 8. Cookie / Storage / Token 分析



- 类型：登录态 / 设备 Cookie / 风控 Cookie / JS 生成 Cookie / 其他

- 生成或刷新链路：

- 是否纳入最终入口：

- 敏感字段脱敏说明：



## 9. 补环境框架选择与 Trace 复杂度评估

- 补环境框架选择：不使用补环境框架（默认） / isolated-vm（随包魔改 xbs isolated-vm） / Node.js 内置 vm / jsEnv

- 选择来源：用户明确选择 / 用户未选择，按默认不使用

- 是否发生二次提醒或切换：

- Trace 是否存在：有 / 无

- Trace 复杂度等级：低 / 中 / 高 / 未知

- 复杂度依据：WebAPI 类别 / 真实性检测 / 指纹 / 异步 / 状态依赖 / 调用栈分散度

- 重要说明：复杂度评估只用于补环境范围、风险点和优先级，不自动决定补环境框架

- 最终项目 runtime 文件：

- xbs isolated-vm 状态（仅选择 isolated-vm 时填写）：未选择 / 已加载 / ABI 不兼容 / 平台缺失 / API 自检失败

- xbs isolated-vm 二进制来源：随 Skill 资产 / 用户提供替换产物 / 不适用

- Node 版本 / ABI / 平台：

- `window.xbs` API 自检：通过 / 未通过 / 不适用；缺失 API：

- 未选择框架时是否确认无 isolated-vm / vm / jsEnv runtime、`xbs-isolated-vm/` 或 `isolated_vm.node`：是 / 否 / 不适用



## 10. 补环境实现概览



- 运行隔离方式：不使用框架 / xbs isolated-vm / vm / jsEnv / 独立 Node 进程 / 显式隔离 global

- Level 1 基础环境：

- Level 2 指纹真实性：

- Level 3 目标 SDK 专用环境：

- Node 泄露阻断：

- 属性描述符 / 原型链 / 访问器处理：

- 函数、访问器、实例对象 toString 保护：



## 11. native addon / NativeProtect 使用情况



- native 能力检测结果：addon.node 可用 / xbs isolated-vm 可用 / 不可用 / 用户明确豁免（不得写“未使用”而不说明原因）

- native 加载路径：仅写相对路径或“随 Skill 资产加载”；选择 xbs isolated-vm 时写 `xbs-isolated-vm/<platform>-<arch>/isolated_vm.node`，不要写本机绝对路径

- native 导出 API：addon.node 导出 API 或 `window.xbs` 17 个 API：

- 实际使用的 native API：`createNativeFunction` / `createGetter` / `createSetter` / `createNativeObject` / `createProtoChains` / `createNativeCollection` / `createInterceptor` / `getMimeTypesAndPlugins` / `createUndetectable` / `setPrivate` / `getPrivate` / `hasPrivate` / `deletePrivate` / 注册表管理 / 其他；选择 xbs isolated-vm 时注明调用来源为 `window.xbs`

- NativeProtect fallback：未发生 / 已发生；选择 xbs isolated-vm 时如发生 fallback，需说明为什么没有使用 `window.xbs`

- fallback 原因：用户明确要求不使用 native 能力 / addon 或 xbs 缺失 / ABI 不兼容 / native API 调用失败 / 当前 API 不支持 / 其他

- `document.all` 处理：addon `createUndetectable` / xbs `createUndetectable` / JS 近似 fallback / 未涉及

- `navigator.plugins` / `navigator.mimeTypes` 处理：addon `getMimeTypesAndPlugins(config)` / xbs `getMimeTypesAndPlugins(config)` / JS fallback / 未涉及

- 集合对象处理：addon `createNativeCollection` / xbs `createNativeCollection` / JS fallback / 未涉及

- toString 保护覆盖：函数 / 构造函数 / getter / setter / 实例对象

- 阶段输出或 notes 中的补环境初始化加载记录、用户豁免或降级记录：



## 12. 指纹值回放



- 是否涉及指纹 API：

- 真实浏览器采样来源：

- 覆盖范围：Canvas / WebGL / WebGPU / Audio / 字体 / DOM 几何 / 其他

- fixture 文件：

- 回放匹配规则：

- 缺失样本处理：



## 13. 加密参数生成与样本复用检查

- cURL / HAR / fixture 中的样本加密值是否只作为 expected：
- 最终入口如何生成参数：目标 JS 入口 / signer / 其他
- 是否发现硬编码样本值：否
- `check_final_artifact.js` 复用检查结果：

## 14. 代码质量与中文注释

- 是否已运行 `check_code_quality.js`：
- 模块拆分情况：
- 单文件 / 单函数复杂度：
- 中文注释覆盖：文件头 / WebAPI / getter / setter / addon-first / fallback / 指纹回放 / 加密入口
- 中文注释编码：UTF-8 正常 / 存在问题
- 中文注释是否包含问号、连续问号或乱码：否
- 修复过的可读性问题：

## 15. TLS 请求验证



- 是否发送真实请求：是 / 否

- 客户端：Node.js CycleTLS / Node.js impers / Node.js curl-cffi / Python curl_cffi / Python cffi_curl / Python cyCronet / 不发真实请求

- TLS / JA3 / HTTP2 / Header 顺序策略：

- 请求次数与授权范围：

- 响应状态：

- 业务成功判断：

- 失败原因或限制：



## 16. 最终交付结构



- result 目录：

- 唯一入口：`final.js` / `final.py`

- 必要模块：

- 配置模板：

- 是否包含浏览器自动化代码：否

- 是否包含临时测试文件：否

- 最终请求实现：Node.js / Python TLS 指纹兼容客户端 / 不发真实请求



## 17. 测试结果



- 信息完整性测试：

- addon-first 默认硬性测试：
- 代码质量与中文注释测试：

- UTF-8 Markdown / 默认最终总结生成测试：

- 补环境真实性检查：

- 最终产物检查：

- 清理 dry-run：



## 18. 清理结果



- 已删除的临时文件：

- 保留的必要文件：

- 敏感材料处理：

- 仍需用户确认处理的文件：



## 19. 风险与后续建议



- 未确认风险：

- 需要补充样本：

- 可优化点：

- 后续复测建议：

```

