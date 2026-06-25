# Node 版本兼容恢复、nvm 检测与用户确认流程

当 `addon.node`、随包魔改 `xbs isolated-vm` 或其他 native 产物因为 Node ABI 不兼容无法加载时读取本文件。原则是先让用户确认是否安装 / 切换兼容 Node，再决定是否降级；不得在用户未同意前直接改全局 Node 环境。

## 兼容版本表

| native 组件 | 兼容 Node.js 版本 | 失败后的默认处理 |
|---|---:|---|
| `assets/native-addon/<platform>-<arch>/addon.node` | `v25.8.2` | 先询问是否通过 nvm 安装 / 切换到 `v25.8.2`，用户拒绝后才允许 NativeProtect / JS fallback |
| `assets/runtime-frameworks/xbs-isolated-vm/<platform>-<arch>/isolated_vm.node` | `v26.3.1` | 先询问是否通过 nvm 安装 / 切换到 `v26.3.1`，用户拒绝后才允许改选框架或提供匹配构建产物；不得退回 npm 原版 isolated-vm |

## 触发条件

遇到以下任一情况时启动本流程：

- Node 报错包含 `NODE_MODULE_VERSION`、`was compiled against a different Node.js version`、`Module did not self-register`、`The module was compiled against`。
- `scripts/load_native_addon.js --json` 输出 `abiMismatch: true`。
- `scripts/check_xbs_isolated_vm.js --json` 输出 `status: "abi-mismatch"` 或 `abiMismatch: true`。
- 当前 Node 版本不是对应兼容版本，且 native 组件加载失败。

## 先检测当前 Node 与 nvm

```bash
node scripts/check_node_runtime_compat.js --target addon --markdown
node scripts/check_node_runtime_compat.js --target isolated-vm --markdown
```

也可以手动检测：

```bash
node -v
node -p "process.versions.modules"
```

Windows：

```powershell
where.exe nvm
nvm version
nvm root
```

macOS / Linux：

```bash
bash -lc 'command -v nvm || true; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm --version || true'
```

## 用户确认模板

### addon ABI 不兼容

```markdown
当前 addon.node 与当前 Node ABI 不兼容。addon-first 是补环境硬性基线，因此不应直接降级到 NativeProtect。

兼容 Node.js 版本：v25.8.2。

请选择：
1. 自动检测 / 安装 nvm，并安装切换 Node.js v25.8.2 后重新加载 addon。
2. 我手动安装 nvm；安装完成后回复“nvm 已安装成功”。
3. 我已经安装 nvm，但当前未检测到；我提供 nvm 路径或可用 shell。
4. 不安装兼容 Node，允许本 case 降级到 NativeProtect / JS fallback，并记录差异。

在你确认前，我不会直接降级，也不会修改全局 Node 版本。
```

### isolated-vm ABI 不兼容

```markdown
当前随包魔改 xbs isolated-vm 与当前 Node ABI 不兼容。你已选择 isolated-vm 补环境框架，因此应先尝试兼容 Node，而不是退回 npm 原版 isolated-vm。

兼容 Node.js 版本：v26.3.1。

请选择：
1. 自动检测 / 安装 nvm，并安装切换 Node.js v26.3.1 后重新运行 xbs isolated-vm 自检。
2. 我手动安装 nvm；安装完成后回复“nvm 已安装成功”。
3. 我已经安装 nvm，但当前未检测到；我提供 nvm 路径或可用 shell。
4. 不安装兼容 Node，改为提供当前 Node ABI 匹配的魔改 isolated_vm.node 构建产物，或改选不使用框架 / vm / jsEnv。

在你确认前，我不会改用 npm 原版 isolated-vm，也不会桥接旧 addon.node。
```

## nvm 安装与切换

只有用户明确选择自动安装时，才输出安装计划并执行。用户选择手动安装时，只给教程并等待用户确认成功。

Windows 推荐 nvm-windows：

```powershell
winget install CoreyButler.NVMforWindows
# 或让用户从 nvm-windows 官方 Release 手动安装
nvm version
```

macOS / Linux 常用 nvm-sh：

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
bash -lc 'source "$HOME/.nvm/nvm.sh" && nvm --version'
```

安装 / 检测 nvm 成功后按目标组件切换：

```bash
# addon.node
nvm install 25.8.2
nvm use 25.8.2
node -v
node -p "process.versions.modules"
node scripts/load_native_addon.js --json

# xbs isolated-vm
nvm install 26.3.1
nvm use 26.3.1
node -v
node -p "process.versions.modules"
node --no-node-snapshot scripts/check_xbs_isolated_vm.js --strict --json
```

## 记录要求

无论最终是否切换成功，都写入阶段报告、`case/notes/代码变更记忆.md` 和最终总结：

- 触发组件：addon.node / xbs isolated-vm。
- 原 Node 版本、原 ABI、平台、架构。
- 用户选择：自动安装、手动安装、提供 nvm 路径、拒绝安装、提供匹配二进制或改选框架。
- 新 Node 版本、新 ABI 和重新检测结果。
- 如果降级，写明 fallback 范围、已知差异和用户确认记录。
