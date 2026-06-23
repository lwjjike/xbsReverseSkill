#!/usr/bin/env node
'use strict';

const path = require('path');
const {
  EXPECTED_XBS_APIS,
  createIsolatedVmRuntime,
  getBundledXbsIsolatedVmPath,
  isAbiMismatch,
  resolveXbsIsolatedVmPath,
} = require('../assets/runtime-frameworks/isolated-vm-runtime');

function parseArgs(argv) {
  const args = { binary: '', json: false, markdown: false, strict: false, timeoutMs: 5000 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--binary' || a === '--xbs-isolated-vm' || a === '--path') args.binary = argv[++i] || '';
    else if (a === '--timeout-ms') args.timeoutMs = Number(argv[++i] || 5000);
    else if (a === '--json') args.json = true;
    else if (a === '--markdown') args.markdown = true;
    else if (a === '--strict') args.strict = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error('未知参数：' + a);
  }
  if (!args.json && !args.markdown) args.markdown = true;
  return args;
}

function usage() {
  return [
    '用法：',
    '  node scripts/check_xbs_isolated_vm.js --markdown',
    '  node scripts/check_xbs_isolated_vm.js --json',
    '  node scripts/check_xbs_isolated_vm.js --binary <isolated_vm.node> --strict --json',
    '',
    '说明：检测随包魔改 xbs isolated-vm 是否能在当前 Node / 平台 / ABI 下加载，并在 Context 内自检 window.xbs 的 17 个 API。默认遇到平台缺失或 ABI 不匹配时输出中文解释但不崩溃；真实 case 已选择 isolated-vm 时可加 --strict 作为阻断门禁。',
  ].join('\n');
}

function baseResult(args) {
  const binaryPath = path.resolve(args.binary || resolveXbsIsolatedVmPath({}));
  return {
    tool: 'check_xbs_isolated_vm',
    nodeVersion: process.version,
    nodeAbi: process.versions && process.versions.modules ? process.versions.modules : '',
    platform: process.platform,
    arch: process.arch,
    platformKey: process.platform + '-' + process.arch,
    defaultBinary: getBundledXbsIsolatedVmPath(),
    binaryPath,
    expectedApis: EXPECTED_XBS_APIS.slice(),
    loaded: false,
    selfCheckPassed: false,
    abiMismatch: false,
    explainableFailure: false,
    status: 'not-run',
    error: '',
    xbs: null,
  };
}

async function runCheck(args) {
  const result = baseResult(args);
  let runtime = null;
  try {
    runtime = createIsolatedVmRuntime({ xbsIsolatedVmPath: args.binary || '', timeoutMs: args.timeoutMs, requireXbs: true });
    result.loaded = true;
    result.binaryPath = runtime.binaryPath || result.binaryPath;
    const initialized = await runtime.initialize({});
    result.xbs = initialized.xbs || runtime.getXbsApiSummary();
    result.selfCheckPassed = !!(result.xbs && result.xbs.ok);
    result.status = result.selfCheckPassed ? 'ok' : 'xbs-api-missing';
    if (!result.selfCheckPassed) result.error = '已加载二进制，但 Context 内 window.xbs 自检未通过。';
  } catch (error) {
    result.error = String(error && error.message ? error.message : error || '未知错误');
    result.abiMismatch = isAbiMismatch(error) || !!(error && error.abiMismatch);
    result.explainableFailure = result.abiMismatch || /未找到 isolated_vm\.node|未找到|no such file|cannot find/i.test(result.error);
    result.status = result.abiMismatch ? 'abi-mismatch' : (result.explainableFailure ? 'binary-missing' : 'load-failed');
  } finally {
    if (runtime && typeof runtime.dispose === 'function') await runtime.dispose().catch(() => {});
  }
  result.passed = !!(result.loaded && result.selfCheckPassed);
  return result;
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# xbs isolated-vm 自检报告');
  lines.push('');
  lines.push('- 检查结果：' + (result.passed ? '通过' : '未通过'));
  lines.push('- 状态：' + result.status);
  lines.push('- 当前 Node：' + result.nodeVersion);
  lines.push('- 当前 ABI：' + result.nodeAbi);
  lines.push('- 当前平台：' + result.platformKey);
  lines.push('- 二进制路径：' + result.binaryPath);
  lines.push('- 是否加载成功：' + (result.loaded ? '是' : '否'));
  lines.push('- Context 内 xbs API 自检：' + (result.selfCheckPassed ? '通过' : '未通过'));
  if (result.xbs) {
    lines.push('- window === globalThis：' + (result.xbs.windowIsGlobal ? '是' : '否'));
    lines.push('- window instanceof Window：' + (result.xbs.windowInstanceOfWindow ? '是' : '否'));
    lines.push('- 缺失 API：' + (result.xbs.missing && result.xbs.missing.length ? result.xbs.missing.join('、') : '无'));
    lines.push('- 额外 API：' + (result.xbs.extra && result.xbs.extra.length ? result.xbs.extra.join('、') : '无'));
  }
  if (result.error) {
    lines.push('');
    lines.push('## 说明');
    lines.push('');
    lines.push(result.error.replace(/\n/g, '\n\n'));
  }
  if (!result.passed && result.explainableFailure) {
    lines.push('');
    lines.push('## 处理建议');
    lines.push('');
    lines.push('- 如果用户已选择 isolated-vm，请让用户提供与当前平台 / 架构 / Node ABI 匹配的魔改 xbs isolated-vm 构建产物，或切换匹配 Node 版本。');
    lines.push('- 不要自动降级到 npm 原版 isolated-vm；如用户不想提供匹配二进制，应让用户改选不使用框架 / Node.js 内置 vm / jsEnv。');
  }
  return lines.join('\n') + '\n';
}

(async () => {
  const args = parseArgs(process.argv);
  if (args.help) { console.log(usage()); return; }
  const result = await runCheck(args);
  if (args.json) console.log(JSON.stringify(result, null, 2));
  if (args.markdown) process.stdout.write(renderMarkdown(result));
  if (!result.passed) process.exitCode = args.strict || !result.explainableFailure ? 1 : 0;
})().catch(error => {
  console.error(error && error.message ? error.message : String(error));
  process.exitCode = 2;
});
