# xbsReverseSkill

这是一个面向 Web/JS 逆向分析的 skill 仓库，当前主要包含 3 个方向的能力模块，分别覆盖 AST 反混淆、纯算/协议逆向，以及浏览器补环境。

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

### ast-deobfuscation

使用 Babel AST 对 JavaScript 做分层、可回退的定向反混淆。
适合处理 `_0x` 标识符、字符串表、自执行解码包装、dispatcher 对象、虚假分支、`while/for + switch` 控制流平坦化，以及 `if (literal === opcode)` 分发链等场景。对于 reese84、顶象、极验4、同花顺、网易易盾、小红书、OB 变种等站点或混淆家族，也提供了专门的模式识别与流水线脚本。

### web-reverse-algorithm

面向 Web/JS 逆向中的纯算与协议分析场景。
主要用于复杂 header/cookie 签名、混合加密、JSVMP/VMP、Wasm、PoW、响应解密、验证码参数还原、challenge/verify 流程分析，以及从最终请求或最终输出反推 writer、builder、entry、source 的完整链路。适合将逆向结果进一步沉淀为 solver、SDK、脚本或服务。

### web-reverse-env

面向浏览器补环境与运行时修补场景。
覆盖 Proxy 吐环境、原型链修复、native `toString` 保护、描述符保护，以及 `navigator`、`document`、`storage`、`canvas`、`WebGL`、`crypto`、`performance`、`WebRTC`、`Worker` 等模块化环境构建。适合处理浏览器环境缺失、反检测、指纹对齐和高强度风控环境修补问题。


