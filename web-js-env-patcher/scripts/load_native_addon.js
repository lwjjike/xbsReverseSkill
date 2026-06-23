#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_EXPORTS = [
  'createNativeObject',
  'createNativeFunction',
  'createProtoChains',
  'getProtoChainRegistry',
  'deleteProtoChainRegistryEntry',
  'clearProtoChainRegistry',
  'getPrivate',
  'setPrivate',
  'hasPrivate',
  'deletePrivate',
  'createInterceptor',
  'createNativeCollection',
  'getMimeTypesAndPlugins',
  'createGetter',
  'createSetter',
  'createUndetectable',
  'throwTypeError',
];

function parseArgs(argv) {
  const args = { addon: '', json: false, strict: false, markdown: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--addon' || a === '--path') args.addon = argv[++i] || '';
    else if (a === '--json') args.json = true;
    else if (a === '--markdown') args.markdown = true;
    else if (a === '--strict') args.strict = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`未知参数：${a}`);
  }
  if (!args.json && !args.markdown) args.markdown = true;
  return args;
}

function usage() {
  return `用法：
  node scripts/load_native_addon.js --json
  node scripts/load_native_addon.js --addon <path-to-addon.node> --json

说明：不指定 --addon 时，会尝试从当前 Skill 的 assets/native-addon/<platform>-<arch>/addon.node 加载；也可用 WEB_JS_ENV_PATCHER_ADDON 显式覆盖。`;
}

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function resolvePortablePath(input, skillDir) {
  if (!input) return '';
  if (path.isAbsolute(input)) return path.resolve(input);
  const cwdPath = path.resolve(input);
  if (exists(cwdPath)) return cwdPath;
  return path.resolve(skillDir, input);
}

function candidatePaths(explicitPath) {
  const out = [];
  const skillDir = path.resolve(__dirname, '..');
  if (explicitPath) out.push(resolvePortablePath(explicitPath, skillDir));
  if (process.env.WEB_JS_ENV_PATCHER_ADDON) out.push(resolvePortablePath(process.env.WEB_JS_ENV_PATCHER_ADDON, skillDir));
  const platformArch = `${process.platform}-${process.arch}`;
  out.push(path.join(skillDir, 'assets', 'native-addon', platformArch, 'addon.node'));
  out.push(path.join(skillDir, 'assets', 'native-addon', platformArch, `addon-${platformArch}.node`));
  out.push(path.join(skillDir, 'assets', 'native-addon', 'addon.node'));
  return [...new Set(out)];
}

function loadNativeAddon(options = {}) {
  const paths = candidatePaths(options.addon || options.path || '');
  const attempts = [];
  for (const p of paths) {
    if (!exists(p)) {
      attempts.push({ path: p, ok: false, reason: '文件不存在' });
      continue;
    }
    try {
      const addon = require(p);
      const exports = Object.keys(addon).sort();
      const missingExports = REQUIRED_EXPORTS.filter(k => !(k in addon));
      return {
        available: true,
        addon,
        path: p,
        exports,
        missingExports,
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        modules: process.versions.modules,
        attempts,
      };
    } catch (err) {
      attempts.push({ path: p, ok: false, reason: err && err.message ? err.message : String(err) });
    }
  }
  return {
    available: false,
    addon: null,
    path: '',
    exports: [],
    missingExports: REQUIRED_EXPORTS.slice(),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    modules: process.versions.modules,
    attempts,
    reason: '未找到可加载的 addon.node，或当前平台 / Node ABI 不兼容',
  };
}

function publicResult(result) {
  const { addon, ...rest } = result;
  return rest;
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# native addon 加载检查');
  lines.push('');
  lines.push(`- 是否可用：${result.available ? '是' : '否'}`);
  lines.push(`- 平台：${result.platform}-${result.arch}`);
  lines.push(`- Node.js：${result.node}`);
  lines.push(`- Node ABI：${result.modules}`);
  if (result.path) lines.push(`- 加载路径：${result.path}`);
  if (result.reason) lines.push(`- 原因：${result.reason}`);
  if (result.exports && result.exports.length) lines.push(`- 导出 API：${result.exports.join(', ')}`);
  if (result.missingExports && result.missingExports.length) lines.push(`- 缺少预期 API：${result.missingExports.join(', ')}`);
  if (result.attempts && result.attempts.length) {
    lines.push('');
    lines.push('## 尝试记录');
    for (const a of result.attempts) lines.push(`- ${a.path}：${a.reason}`);
  }
  return lines.join('\n') + '\n';
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv);
    if (args.help) { console.log(usage()); process.exit(0); }
    const result = loadNativeAddon({ addon: args.addon });
    const output = publicResult(result);
    if (args.json) console.log(JSON.stringify(output, null, 2));
    if (args.markdown) process.stdout.write(renderMarkdown(output));
    if (args.strict && !result.available) process.exit(2);
  } catch (err) {
    console.error(err.message || String(err));
    console.error(usage());
    process.exit(1);
  }
}

module.exports = { loadNativeAddon, REQUIRED_EXPORTS };
