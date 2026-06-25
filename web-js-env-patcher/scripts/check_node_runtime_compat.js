#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');
const os = require('os');

const TARGETS = {
  addon: {
    label: 'native addon.node',
    version: '25.8.1',
    nextCheck: 'node scripts/load_native_addon.js --json',
  },
  'isolated-vm': {
    label: 'xbs isolated-vm',
    version: '26.3.1',
    nextCheck: 'node scripts/check_xbs_isolated_vm.js --strict --json',
  },
  xbs: {
    label: 'xbs isolated-vm',
    version: '26.3.1',
    nextCheck: 'node scripts/check_xbs_isolated_vm.js --strict --json',
  },
};

function parseArgs(argv) {
  const args = { target: 'addon', requiredVersion: '', json: false, markdown: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target') args.target = argv[++i] || '';
    else if (a === '--required-version') args.requiredVersion = (argv[++i] || '').replace(/^v/i, '');
    else if (a === '--json') args.json = true;
    else if (a === '--markdown') args.markdown = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error('未知参数：' + a);
  }
  if (!args.json && !args.markdown) args.markdown = true;
  return args;
}

function usage() {
  return [
    '用法：',
    '  node scripts/check_node_runtime_compat.js --target addon --markdown',
    '  node scripts/check_node_runtime_compat.js --target isolated-vm --json',
    '  node scripts/check_node_runtime_compat.js --required-version 25.8.1 --markdown',
    '',
    '说明：只检测当前 Node / ABI / nvm 可用性并输出中文恢复建议，不会安装或切换 Node。',
  ].join('\n');
}

function tryExec(command, args, options = {}) {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: options.timeout || 5000,
      }).trim(),
      error: '',
    };
  } catch (error) {
    return { ok: false, stdout: '', error: String(error && error.message ? error.message : error) };
  }
}

function detectNvm() {
  if (process.platform === 'win32') {
    const where = tryExec('where.exe', ['nvm']);
    const version = tryExec('nvm', ['version']);
    const root = tryExec('nvm', ['root']);
    return {
      available: version.ok,
      kind: 'nvm-windows',
      path: where.stdout.split(/\r?\n/).filter(Boolean)[0] || '',
      version: version.stdout,
      root: root.stdout,
      error: version.ok ? '' : (where.error || version.error),
    };
  }

  const shell = tryExec('bash', ['-lc', 'if command -v nvm >/dev/null 2>&1; then nvm --version; elif [ -s "$NVM_DIR/nvm.sh" ]; then . "$NVM_DIR/nvm.sh" && nvm --version; elif [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh" && nvm --version; else exit 127; fi']);
  return {
    available: shell.ok,
    kind: 'nvm-sh',
    path: shell.ok ? '$NVM_DIR/nvm.sh 或 $HOME/.nvm/nvm.sh' : '',
    version: shell.stdout,
    root: '',
    error: shell.error,
  };
}

function buildResult(args) {
  const target = TARGETS[args.target] || null;
  const requiredVersion = args.requiredVersion || (target && target.version) || args.target.replace(/^v/i, '');
  const currentVersion = process.version.replace(/^v/i, '');
  const nvm = detectNvm();
  const label = target ? target.label : '自定义 Node native 组件';
  const nextCheck = target ? target.nextCheck : '';
  return {
    tool: 'check_node_runtime_compat',
    target: args.target,
    label,
    requiredVersion,
    currentVersion,
    currentVersionWithV: process.version,
    versionMatched: currentVersion === requiredVersion,
    nodeAbi: process.versions && process.versions.modules ? process.versions.modules : '',
    platform: process.platform,
    arch: process.arch,
    os: os.platform() + '-' + os.arch(),
    nvm,
    needsUserConfirmation: currentVersion !== requiredVersion,
    installCommands: requiredVersion ? [
      `nvm install ${requiredVersion}`,
      `nvm use ${requiredVersion}`,
      'node -v',
      'node -p "process.versions.modules"',
      nextCheck,
    ].filter(Boolean) : [],
  };
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# Node 版本兼容检查');
  lines.push('');
  lines.push('- 目标组件：' + result.label);
  lines.push('- 需要 Node：v' + result.requiredVersion);
  lines.push('- 当前 Node：' + result.currentVersionWithV);
  lines.push('- 当前 ABI：' + result.nodeAbi);
  lines.push('- 平台：' + result.platform + '-' + result.arch);
  lines.push('- 版本是否匹配：' + (result.versionMatched ? '是' : '否'));
  lines.push('- nvm 是否可用：' + (result.nvm.available ? '是' : '否'));
  if (result.nvm.version) lines.push('- nvm 版本：' + result.nvm.version);
  if (result.nvm.path) lines.push('- nvm 路径：' + result.nvm.path);
  if (result.nvm.root) lines.push('- nvm root：' + result.nvm.root);
  if (!result.versionMatched) {
    lines.push('');
    lines.push('## 处理建议');
    lines.push('');
    lines.push('- 不要直接降级；先让用户确认是否通过 nvm 安装 / 切换兼容 Node。');
    lines.push('- 用户同意后再执行以下命令：');
    lines.push('');
    lines.push('```bash');
    for (const cmd of result.installCommands) lines.push(cmd);
    lines.push('```');
    if (!result.nvm.available) {
      lines.push('');
      lines.push('- 当前未检测到 nvm。先让用户选择自动安装 nvm、手动安装 nvm、提供已安装 nvm 路径，或拒绝安装后再进入降级 / 改选流程。');
    }
  }
  return lines.join('\n') + '\n';
}

try {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  const result = buildResult(args);
  if (args.json) console.log(JSON.stringify(result, null, 2));
  if (args.markdown) process.stdout.write(renderMarkdown(result));
} catch (error) {
  console.error(error && error.message ? error.message : String(error));
  console.error(usage());
  process.exit(1);
}
