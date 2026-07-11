#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const BLOCKING_STATUSES = new Set([
  'needs-browser-baseline',
  'needs-node-audit',
  'mismatch',
  'native-capability-gap',
  'unknown',
]);

function parseArgs(argv) {
  const args = {
    caseDir: '',
    dir: '',
    matrix: '',
    browserBaseline: '',
    nodeAudit: '',
    require: false,
    json: false,
    markdown: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--case-dir' || a === '--case' || a === '-d') args.caseDir = argv[++i] || '';
    else if (a === '--dir') args.dir = argv[++i] || '';
    else if (a === '--matrix') args.matrix = argv[++i] || '';
    else if (a === '--browser-baseline') args.browserBaseline = argv[++i] || '';
    else if (a === '--node-audit') args.nodeAudit = argv[++i] || '';
    else if (a === '--require') args.require = true;
    else if (a === '--json') args.json = true;
    else if (a === '--markdown') args.markdown = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`未知参数：${a}`);
  }
  if (!args.json && !args.markdown) args.markdown = true;
  return args;
}

function usage() {
  return `用法：
  node scripts/check_object_shape_audit.js --case-dir case --markdown
  node scripts/check_object_shape_audit.js --case-dir case --require --json
  node scripts/check_object_shape_audit.js --dir case/result --matrix case/notes/object-shape-audit.md --browser-baseline case/fixtures/browser-object-shape-baseline.json --node-audit case/tmp/node-object-shape-audit.json --markdown

说明：检查浏览器对象是否泄露 _ / __ 私有状态，并校验对象形状 baseline、Node audit 与 object-shape-audit.md。`;
}

function exists(p) { try { return fs.existsSync(p); } catch { return false; } }
function stat(p) { try { return fs.statSync(p); } catch { return null; } }
function readText(p) { return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''); }
function readJson(p) { return JSON.parse(readText(p)); }
function rel(root, p) { return (path.relative(root, p) || '.').replace(/\\/g, '/'); }
function ext(p) { return path.extname(p).toLowerCase(); }

function walk(root, out = []) {
  if (!exists(root)) return out;
  const st = stat(root);
  if (!st) return out;
  if (st.isFile()) {
    out.push(root);
    return out;
  }
  if (!st.isDirectory()) return out;
  for (const name of fs.readdirSync(root)) walk(path.join(root, name), out);
  return out;
}

function isCodeFile(file) {
  return ['.js', '.mjs', '.cjs', '.ts'].includes(ext(file));
}

function shouldSkip(root, file) {
  const n = rel(root, file).toLowerCase();
  return /(^|\/)(node_modules|dist|build|coverage|vendor|third_party|third-party|src\/target\/original)(\/|$)/.test(n)
    || /(\.min\.js|bundle\.js|vendor\.js)$/i.test(n);
}

function isRelevantBrowserEnvFile(root, file, text) {
  const r = rel(root, file);
  if (/(^|\/)src\/(?:env|node-runtime\/env)\//i.test(r)) return true;
  if (/(^|\/)src\/signer\//i.test(r) && /\b(?:window|document|navigator|XMLHttpRequest|fetch|EventTarget|Storage|Performance|Element|Node)\b/.test(text)) return true;
  if (/(?:probe|runtime|runner|diagnostic)/i.test(path.basename(r)) && /\b(?:window|document|navigator|XMLHttpRequest|fetch|EventTarget|Storage|Performance|Element|Node)\b/.test(text)) return true;
  return false;
}

const ALLOWED_DOUBLE_UNDERSCORE = new Set([
  '__proto__',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  '__esModule',
]);

function allowedName(name) {
  return ALLOWED_DOUBLE_UNDERSCORE.has(String(name));
}

function stripComments(line) {
  return line.replace(/\/\/.*$/g, '').replace(/\/\*.*?\*\//g, '');
}

function inspectPrivateLeaks(root, file) {
  const text = readText(file);
  if (!isRelevantBrowserEnvFile(root, file, text)) return [];
  const leaks = [];
  const lines = text.split(/\r?\n/);
  const patterns = [
    { id: 'this-dot', re: /\bthis\s*\.\s*(_{1,2}[A-Za-z][\w$]*)\s*=/g, message: '在浏览器实例 this 上写入 _ / __ 私有字段' },
    { id: 'object-dot', re: /\b(?:obj|target|instance|xhr|event|node|element|globalObject|window|document)\s*\.\s*(_{1,2}[A-Za-z][\w$]*)\s*=/g, message: '在浏览器对象上写入 _ / __ 私有字段' },
    { id: 'bracket', re: /\[\s*['"](_{1,2}[A-Za-z][\w$]*)['"]\s*\]\s*=/g, message: '通过 bracket 写入 _ / __ 私有字段' },
    { id: 'define-property', re: /\b(?:Object\.defineProperty|Reflect\.defineProperty)\s*\([^,\n]+,\s*['"](_{1,2}[A-Za-z][\w$]*)['"]/g, message: '通过 defineProperty 暴露 _ / __ 私有字段' },
    { id: 'define-value', re: /\b(?:defineValue|defineNativeValue|defineHidden|defineInternal)\s*\([^,\n]+,\s*['"](_{1,2}[A-Za-z][\w$]*)['"]/g, message: '通过 helper 暴露 _ / __ 私有字段' },
    { id: 'descriptor-object', re: /['"](_{1,2}[A-Za-z][\w$]*)['"]\s*:\s*\{[^}]*\b(?:value|get|set|enumerable|configurable|writable)\b/g, message: '在 descriptor 对象中定义 _ / __ 私有字段' },
  ];
  for (let i = 0; i < lines.length; i++) {
    const line = stripComments(lines[i]);
    for (const pattern of patterns) {
      pattern.re.lastIndex = 0;
      let m;
      while ((m = pattern.re.exec(line))) {
        const name = m[1];
        if (allowedName(name)) continue;
        leaks.push({
          file: rel(root, file),
          line: i + 1,
          name,
          type: pattern.id,
          message: pattern.message,
          text: lines[i].trim().slice(0, 180),
        });
      }
    }
  }
  return leaks;
}

function extractStatusesFromMarkdown(text) {
  const statuses = [];
  for (const status of ['matched', 'accepted-diff', 'not-involved', 'needs-browser-baseline', 'needs-node-audit', 'mismatch', 'native-capability-gap', 'unknown']) {
    const matches = text.match(new RegExp(`\\b${status}\\b`, 'g'));
    if (matches) statuses.push({ status, count: matches.length });
  }
  return statuses;
}

function normalizeTargets(raw) {
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw.targets)) return raw.targets.map(item => item.name || item.path || item.target || '').filter(Boolean);
  if (Array.isArray(raw.items)) return raw.items.map(item => item.name || item.path || item.target || '').filter(Boolean);
  if (raw.targets && typeof raw.targets === 'object') return Object.keys(raw.targets);
  return [];
}

function normalizeTargetRecords(raw) {
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw.targets)) return raw.targets;
  if (Array.isArray(raw.items)) return raw.items;
  if (raw.targets && typeof raw.targets === 'object') {
    return Object.entries(raw.targets).map(([name, value]) => ({ name, ...(value && typeof value === 'object' ? value : { value }) }));
  }
  return [];
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function sameValue(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

const SHAPE_FIELDS = [
  'objectKeys',
  'ownPropertyNames',
  'ownSymbols',
  'reflectOwnKeys',
  'descriptors',
  'inChecks',
  'forIn',
  'prototypeChain',
  'toString',
  'constructorName',
  'instanceof',
];

function inspectJson(file, label, problems) {
  if (!exists(file)) {
    problems.push(`缺少 ${label}：${file}`);
    return { exists: false, parseOk: false, baselineId: '', targets: [] };
  }
  try {
    const raw = readJson(file);
    return {
      exists: true,
      parseOk: true,
      baselineId: raw.baselineId || '',
      schemaVersion: raw.schemaVersion || '',
      targets: normalizeTargets(raw),
      targetRecords: normalizeTargetRecords(raw),
      runtimeSourceHash: raw.runtimeSourceHash || '',
      generatedBy: raw.generatedBy || '',
      probeVersion: raw.probeVersion || '',
    };
  } catch (err) {
    problems.push(`${label} 无法解析为 JSON：${err.message}`);
    return { exists: true, parseOk: false, baselineId: '', targets: [], targetRecords: [], runtimeSourceHash: '', generatedBy: '', probeVersion: '' };
  }
}

function compareTargetRecords(browser, nodeAudit, problems) {
  const nodeByName = new Map(nodeAudit.targetRecords.map(item => [item.name || item.path || item.target, item]));
  for (const expected of browser.targetRecords) {
    const name = expected.name || expected.path || expected.target;
    if (!name) {
      problems.push('浏览器对象形状 baseline 存在未命名 target');
      continue;
    }
    const observed = nodeByName.get(name);
    if (!observed) {
      problems.push(`Node 对象形状 audit 缺少 target：${name}`);
      continue;
    }
    for (const field of SHAPE_FIELDS) {
      if (typeof expected[field] === 'undefined') continue;
      if (typeof observed[field] === 'undefined') {
        problems.push(`${name} 缺少 Node 观测字段：${field}`);
      } else if (!sameValue(expected[field], observed[field])) {
        problems.push(`${name} 对象形状不一致：${field}`);
      }
    }
  }
}

function check(args) {
  const caseDir = path.resolve(args.caseDir || '.');
  const root = path.resolve(args.dir || path.join(caseDir, 'result'));
  const matrixPath = path.resolve(args.matrix || path.join(caseDir, 'notes', 'object-shape-audit.md'));
  const browserPath = path.resolve(args.browserBaseline || path.join(caseDir, 'fixtures', 'browser-object-shape-baseline.json'));
  const nodeAuditPath = path.resolve(args.nodeAudit || path.join(caseDir, 'tmp', 'node-object-shape-audit.json'));
  const files = walk(root).filter(file => stat(file) && stat(file).isFile() && isCodeFile(file) && !shouldSkip(root, file));
  const problems = [];
  const warnings = [];
  const leaks = files.flatMap(file => inspectPrivateLeaks(root, file));

  for (const leak of leaks) {
    problems.push(`${leak.file}:${leak.line} ${leak.message}：${leak.name}`);
  }

  const requireArtifacts = args.require || leaks.length > 0 || files.some(file => {
    try {
      const text = readText(file);
      return isRelevantBrowserEnvFile(root, file, text) && /Object\.keys|Object\.getOwnPropertyNames|Reflect\.ownKeys|hasOwnProperty|propertyIsEnumerable/.test(text);
    } catch {
      return false;
    }
  });

  let matrix = { exists: exists(matrixPath), statuses: [], blockingStatuses: [], missingKeywords: [] };
  if (requireArtifacts) {
    if (!matrix.exists) problems.push(`缺少对象形状审计矩阵：${matrixPath}`);
    if (matrix.exists) {
      const text = readText(matrixPath);
      matrix.statuses = extractStatusesFromMarkdown(text);
      matrix.blockingStatuses = matrix.statuses.filter(item => BLOCKING_STATUSES.has(item.status));
      for (const item of matrix.blockingStatuses) problems.push(`对象形状审计矩阵存在阻断状态 ${item.status}，数量 ${item.count}`);
      matrix.missingKeywords = ['Object.keys', 'Object.getOwnPropertyNames', 'Reflect.ownKeys', 'descriptor', '私有状态'].filter(key => !text.includes(key));
      for (const key of matrix.missingKeywords) problems.push(`对象形状审计矩阵缺少关键字段：${key}`);
    }
  }

  const browser = requireArtifacts
    ? inspectJson(browserPath, '浏览器对象形状 baseline', problems)
    : { exists: exists(browserPath), parseOk: false, baselineId: '', targets: [], targetRecords: [], runtimeSourceHash: '', generatedBy: '', probeVersion: '' };
  const nodeAudit = requireArtifacts
    ? inspectJson(nodeAuditPath, 'Node 对象形状 audit', problems)
    : { exists: exists(nodeAuditPath), parseOk: false, baselineId: '', targets: [], targetRecords: [], runtimeSourceHash: '', generatedBy: '', probeVersion: '' };

  if (browser.baselineId && nodeAudit.baselineId && browser.baselineId !== nodeAudit.baselineId) {
    problems.push(`对象形状 baselineId 与 Node audit baselineId 不一致：${browser.baselineId} != ${nodeAudit.baselineId}`);
  }
  if (requireArtifacts && browser.parseOk && nodeAudit.parseOk) {
    const missingTargets = browser.targets.filter(target => !nodeAudit.targets.includes(target));
    if (missingTargets.length) problems.push(`Node 对象形状 audit 缺少浏览器 baseline target：${missingTargets.join('、')}`);
    compareTargetRecords(browser, nodeAudit, problems);
    if (!nodeAudit.runtimeSourceHash) problems.push('Node 对象形状 audit 缺少 runtimeSourceHash，无法判断代码修改后审计是否过期');
    if (!nodeAudit.probeVersion) problems.push('Node 对象形状 audit 缺少 probeVersion');
    if (!/audit|probe|recorder/i.test(nodeAudit.generatedBy)) problems.push(`Node 对象形状 audit generatedBy 不可信：${nodeAudit.generatedBy || '未记录'}`);
  }
  if (!files.length) problems.push(`未找到可检查的 result 代码文件：${root}`);
  if (!leaks.length && !requireArtifacts) warnings.push('未发现对象形状审计触发信号；如目标存在属性枚举 / descriptor 检测，建议使用 --require 强制检查。');

  return {
    caseDir,
    root,
    clean: problems.length === 0,
    requireArtifacts,
    filesChecked: files.length,
    leaks,
    matrixPath,
    browserPath,
    nodeAuditPath,
    matrix,
    browser,
    nodeAudit,
    problems,
    warnings,
  };
}

function renderMarkdown(result) {
  const lines = [
    '# 对象形状审计检查结果',
    '',
    `case 目录：${result.caseDir}`,
    `检查范围：${result.root}`,
    `是否需要审计产物：${result.requireArtifacts ? '是' : '否'}`,
    `是否通过：${result.clean ? '是' : '否'}`,
    '',
    '## 文件',
    `- 矩阵：${result.matrixPath}`,
    `- 浏览器 baseline：${result.browserPath}`,
    `- Node audit：${result.nodeAuditPath}`,
    '',
    '## 摘要',
    `- 检查文件数：${result.filesChecked}`,
    `- _ / __ 私有状态泄露数量：${result.leaks.length}`,
    `- 浏览器 baseline：存在=${result.browser.exists ? '是' : '否'}，JSON=${result.browser.parseOk ? '是' : '否'}，baselineId=${result.browser.baselineId || '未记录'}`,
    `- Node audit：存在=${result.nodeAudit.exists ? '是' : '否'}，JSON=${result.nodeAudit.parseOk ? '是' : '否'}，baselineId=${result.nodeAudit.baselineId || '未记录'}`,
  ];
  if (result.matrix.exists) {
    lines.push(`- 矩阵状态：${result.matrix.statuses.map(item => `${item.status}=${item.count}`).join('、') || '未记录'}`);
  }
  if (result.leaks.length) {
    lines.push('', '## 私有状态泄露');
    for (const leak of result.leaks.slice(0, 50)) {
      lines.push(`- ${leak.file}:${leak.line} ${leak.name}：${leak.text}`);
    }
    if (result.leaks.length > 50) lines.push(`- 还有 ${result.leaks.length - 50} 条未展示。`);
  }
  if (result.problems.length) {
    lines.push('', '## 问题');
    for (const problem of result.problems) lines.push(`- ${problem}`);
  }
  if (result.warnings.length) {
    lines.push('', '## 提醒');
    for (const warning of result.warnings) lines.push(`- ${warning}`);
  }
  return `${lines.join('\n')}\n`;
}

try {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  const result = check(args);
  if (args.json) console.log(JSON.stringify(result, null, 2));
  if (args.markdown) process.stdout.write(renderMarkdown(result));
  process.exit(result.clean ? 0 : 1);
} catch (err) {
  console.error(err.message || String(err));
  console.error(usage());
  process.exit(1);
}

module.exports = { check, inspectPrivateLeaks };
