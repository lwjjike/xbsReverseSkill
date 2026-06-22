#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const STAGES = {
  '需求信息确认': { index: '01', title: '需求信息确认' },
  'intake': { index: '01', title: '需求信息确认' },
  '取证方案确认': { index: '02', title: '取证方案确认' },
  'forensics': { index: '02', title: '取证方案确认' },
  '请求样本与可疑参数确认': { index: '03', title: '请求样本与可疑参数确认' },
  'params': { index: '03', title: '请求样本与可疑参数确认' },
  'JS文件与入口定位': { index: '04', title: 'JS文件与入口定位' },
  'entry': { index: '04', title: 'JS文件与入口定位' },
  '补环境前置分析': { index: '05', title: '补环境前置分析' },
  'pre-env': { index: '05', title: '补环境前置分析' },
  '补环境实现记录': { index: '06', title: '补环境实现记录' },
  'env': { index: '06', title: '补环境实现记录' },
  '验证与清理记录': { index: '07', title: '验证与清理记录' },
  'validation': { index: '07', title: '验证与清理记录' },
};

function parseArgs(argv) {
  const args = {
    caseDir: '',
    stage: '',
    index: '',
    template: '',
    input: '',
    data: '',
    out: '',
    append: false,
    json: false,
    markdown: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--case-dir' || a === '--dir' || a === '-d') args.caseDir = argv[++i] || '';
    else if (a === '--stage' || a === '-s') args.stage = argv[++i] || '';
    else if (a === '--index') args.index = argv[++i] || '';
    else if (a === '--template') args.template = argv[++i] || '';
    else if (a === '--input' || a === '-i') args.input = argv[++i] || '';
    else if (a === '--data') args.data = argv[++i] || '';
    else if (a === '--out' || a === '-o') args.out = argv[++i] || '';
    else if (a === '--append') args.append = true;
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
  node scripts/write_stage_report.js --case-dir case --stage 需求信息确认 --data case/notes/需求信息.json --markdown
  node scripts/write_stage_report.js --case-dir case --stage 请求样本与可疑参数确认 --input case/tmp/可疑参数草稿.md --markdown
  node scripts/write_stage_report.js --case-dir case --stage WebAPI补齐阶段报告 --index 08 --data case/notes/阶段进展.json --markdown
  node scripts/write_stage_report.js --case-dir case --stage Bug修复与回归测试报告 --index 11 --append --input case/tmp/回归测试.md --json

说明：以 UTF-8 写入中文命名阶段报告，固定阶段默认输出到 case/阶段报告/<编号-阶段名>.md；自定义中文阶段可用 --index 生成 <编号-阶段名>.md。`;
}

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function readText(file) { return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''); }
function readStdin() { try { return fs.readFileSync(0, 'utf8').replace(/^\uFEFF/, ''); } catch { return ''; } }
function hasChinese(s) { return /[\u4e00-\u9fff]/.test(String(s || '')); }
function ensureParent(file) { fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true }); }
function hasBadQuestionMarks(text) {
  const runs = text.match(/\?{3,}/g) || [];
  const count = runs.reduce((n, x) => n + x.length, 0);
  return count >= 8 && !hasChinese(text);
}
function loadJson(file) {
  if (!file) return {};
  return JSON.parse(readText(file));
}
function normalizeIndex(index) {
  const s = String(index || '').trim();
  if (!s) return '';
  if (!/^\d{1,3}$/.test(s)) throw new Error(`阶段编号必须是 1 到 3 位数字：${s}`);
  return s.padStart(2, '0');
}
function normalizeStage(stage, index) {
  const s = String(stage || '').trim();
  const ret = STAGES[s];
  const normalizedIndex = normalizeIndex(index);
  if (ret) return normalizedIndex ? { index: normalizedIndex, title: ret.title } : ret;
  if (!s) throw new Error('必须提供 --stage');
  if (!hasChinese(s)) throw new Error(`未知阶段：${s}。自定义阶段名称必须包含中文。`);
  return { index: normalizedIndex || '自定义', title: s };
}
function defaultOut(caseDir, stage) {
  const file = stage.index === '自定义' ? `${stage.title}.md` : `${stage.index}-${stage.title}.md`;
  return path.join(caseDir, '阶段报告', file);
}
function maskSensitiveString(s) {
  return String(s)
    .replace(/(authorization\s*[:=]\s*)([^\s;]+)/ig, '$1已脱敏')
    .replace(/(cookie\s*[:=]\s*)([^\n]+)/ig, '$1已脱敏')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, (m) => `${m.slice(0, 6)}...${m.slice(-6)}(已脱敏)`)
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, (m) => /\d/.test(m) ? `${m.slice(0, 4)}...${m.slice(-4)}(已脱敏)` : m);
}
function safeString(value) {
  if (value === undefined || value === null || value === '') return '未提供';
  if (Array.isArray(value)) return value.length ? value.map(safeString).join('、') : '未提供';
  if (typeof value === 'object') return Object.keys(value).length ? maskSensitiveString(JSON.stringify(value, null, 2)) : '未提供';
  const s = String(value);
  if (/^(authorization|cookie|token)$/i.test(s)) return '已脱敏';
  return maskSensitiveString(s);
}
function asArray(value) {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value;
  return [value];
}
function bulletLines(value, empty = '无') {
  const arr = asArray(value);
  if (!arr.length) return [`- ${empty}`];
  const lines = [];
  for (const item of arr) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const text = Object.entries(item).map(([k, v]) => `${k}：${safeString(v)}`).join('；');
      lines.push(`- ${text || empty}`);
    } else {
      lines.push(`- ${safeString(item)}`);
    }
  }
  return lines;
}
function numberedLines(value, empty = '待补充') {
  const arr = asArray(value);
  if (!arr.length) return [`1. ${empty}`];
  return arr.map((item, idx) => `${idx + 1}. ${safeString(item)}`);
}
function firstValue(obj, keys, fallback = '') {
  if (!obj || typeof obj !== 'object') return fallback;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return fallback;
}
function tableLines(rows, columns, emptyText) {
  const normalizedRows = asArray(rows).filter(Boolean);
  const header = `| ${columns.map(c => c.title).join(' | ')} |`;
  const sep = `| ${columns.map(() => '---').join(' | ')} |`;
  const lines = [header, sep];
  if (!normalizedRows.length) {
    lines.push(`| ${columns.map((_, i) => i === 0 ? emptyText : '未提供').join(' | ')} |`);
    return lines;
  }
  for (const row of normalizedRows) {
    if (typeof row === 'object' && !Array.isArray(row)) {
      lines.push(`| ${columns.map(c => safeString(firstValue(row, c.keys))).join(' | ')} |`);
    } else {
      lines.push(`| ${columns.map((_, i) => i === 0 ? safeString(row) : '未提供').join(' | ')} |`);
    }
  }
  return lines;
}
function renderProgress(progress) {
  const p = progress && typeof progress === 'object' && !Array.isArray(progress) ? progress : { done: progress };
  return [
    `- 已完成：${safeString(firstValue(p, ['done', 'finished', 'completed'], '未提供'))}`,
    `- 进行中：${safeString(firstValue(p, ['doing', 'current', 'inProgress'], '未提供'))}`,
    `- 尚未开始：${safeString(firstValue(p, ['todo', 'pending', 'notStarted'], '未提供'))}`,
    `- 阻塞点：${safeString(firstValue(p, ['blockers', 'blocked', 'issues'], '无'))}`,
  ];
}
function renderIntakeReport(stage, data) {
  const lines = [
    `# 阶段报告：${stage.title}`,
    '',
    `生成时间：${new Date().toISOString()}`,
    `阶段状态：${safeString(data.status || data.stageStatus || '待确认')}`,
    '',
    '## 1. 用户已提供信息',
    '',
  ];
  const fields = [
    ['目标网站 URL', data.targetUrl || data.siteUrl || data.url],
    ['目标页面 URL', data.pageUrl || data.page],
    ['目标 API', data.apiUrl || data.api],
    ['请求方法', data.method],
    ['加密参数', data.cryptoParams || data.params || data.param],
    ['参数位置', data.paramLocation || data.position],
    ['取证模式', data.acquisitionMode || data.forensicsMode],
    ['最终请求 TLS 指纹兼容客户端', data.tlsClient],
    ['已知 JS 文件 / 加密文件', data.jsFiles || data.cryptoFiles],
    ['是否需要登录', data.loginRequired],
  ];
  for (const [k, v] of fields) lines.push(`- ${k}：${safeString(v)}`);
  lines.push('', '## 2. 已提供样本与证据', '');
  for (const [k, v] of [
    ['cURL / HAR', data.requestSample || data.curl || data.har],
    ['响应样本', data.responseSample],
    ['浏览器 fixture', data.fixture],
    ['RuyiTrace NDJSON', data.ruyiTrace],
    ['Camoufox / CloakBrowser / ruyiPage 取证记录', data.browserEvidence],
  ]) lines.push(`- ${k}：${safeString(v)}`);
  lines.push('', '## 3. 缺失信息与阻塞点', '');
  lines.push(`- 缺失项：${safeString(data.missingItems || data.missing)}`);
  lines.push(`- 阻塞原因：${safeString(data.blockers)}`);
  lines.push(`- 需要用户确认：${safeString(data.needUserConfirm || data.confirmation)}`);
  lines.push('', '## 4. 下一步计划', '');
  const next = data.nextSteps || ['校验请求样本完整性', '列出所有可疑加密参数并等待用户确认', '确认取证工具和 TLS 请求客户端可用性'];
  lines.push(...numberedLines(next));
  return lines.join('\n') + '\n';
}
function renderDynamicReport(stage, data) {
  const title = stage.title;
  const protection = data.realismProtection || data.protection || {};
  const cleanup = data.cleanup || {};
  const lines = [
    `# 阶段报告：${title}`,
    '',
    `生成时间：${new Date().toISOString()}`,
    `阶段状态：${safeString(data.status || data.stageStatus || '待确认')}`,
    '',
    '## 1. 当前阶段目标',
    '',
    `- 本阶段要解决的问题：${safeString(data.goal || data.target || data.summary || data.conclusion)}`,
    `- 本阶段范围：${safeString(data.scope || data.range)}`,
    `- 不在本阶段处理的内容：${safeString(data.outOfScope || data.exclude)}`,
    '',
    '## 2. 当前项目进展',
    '',
  ];
  lines.push(...renderProgress(data.progress));
  lines.push('', '## 3. 本阶段修改文件', '');
  lines.push(...tableLines(data.changedFiles || data.files, [
    { title: '文件', keys: ['file', 'path', 'name'] },
    { title: '修改类型', keys: ['type', 'changeType', 'action'] },
    { title: '修改原因', keys: ['reason', 'why'] },
    { title: '影响范围', keys: ['impact', 'scope'] },
  ], '无修改文件'));
  lines.push('', '## 4. 本阶段新增 / 修改的 WebAPI', '');
  lines.push(...tableLines(data.webApis || data.webAPIs || data.apis, [
    { title: 'WebAPI', keys: ['api', 'webApi', 'name'] },
    { title: '挂载位置', keys: ['mount', 'mountPoint', 'location'] },
    { title: '类型', keys: ['type', 'kind'] },
    { title: '实现方式', keys: ['implementation', 'impl', 'strategy'] },
    { title: '是否 addon-first', keys: ['addonFirst', 'addon', 'addon_first'] },
    { title: '证据来源', keys: ['evidence', 'source'] },
    { title: '测试结果', keys: ['test', 'result', 'testResult'] },
  ], '无新增或修改 WebAPI'));
  lines.push('', '## 5. 本阶段新增功能', '');
  lines.push(...bulletLines(data.features || data.newFeatures, '无新增功能'));
  lines.push('', '## 6. 本阶段修复的 Bug', '');
  lines.push(...tableLines(data.bugs || data.bugFixes || data.fixes, [
    { title: 'Bug', keys: ['bug', 'title', 'issue'] },
    { title: '原因', keys: ['reason', 'cause'] },
    { title: '修复方式', keys: ['fix', 'solution'] },
    { title: '涉及文件', keys: ['files', 'file'] },
    { title: '验证结果', keys: ['test', 'result', 'validation'] },
    { title: '防回退记录', keys: ['memory', 'changeMemory', 'note'] },
  ], '无 Bug 修复'));
  lines.push('', '## 7. 本阶段新增 / 修改的指纹能力', '');
  lines.push(...tableLines(data.fingerprints || data.fingerprintCapabilities, [
    { title: '指纹类型', keys: ['type', 'fingerprintType'] },
    { title: 'API', keys: ['api', 'apis'] },
    { title: '实现策略', keys: ['strategy', 'implementation'] },
    { title: '样本来源', keys: ['source', 'sampleSource'] },
    { title: '回放方式', keys: ['replay', 'replayMode'] },
    { title: '风险', keys: ['risk', 'risks'] },
  ], '无指纹能力变化'));
  lines.push('', '## 8. 真实性保护变化', '');
  if (typeof protection === 'object' && !Array.isArray(protection)) {
    lines.push(`- 函数 toString 保护：${safeString(firstValue(protection, ['functionToString', 'funcToString', 'function']))}`);
    lines.push(`- 访问器 toString 保护：${safeString(firstValue(protection, ['accessorToString', 'accessor']))}`);
    lines.push(`- 属性描述符：${safeString(firstValue(protection, ['descriptors', 'descriptor']))}`);
    lines.push(`- 原型链：${safeString(firstValue(protection, ['prototypeChain', 'protoChain', 'prototype']))}`);
    lines.push(`- 实例对象 [object Xxx]：${safeString(firstValue(protection, ['objectToString', 'instanceToString', 'instance']))}`);
    lines.push(`- document.all / HTMLDDA：${safeString(firstValue(protection, ['documentAll', 'htmlDDA', 'htmldda']))}`);
    lines.push(`- addon 使用情况：${safeString(firstValue(protection, ['addonUsage', 'addon']))}`);
    lines.push(`- fallback 原因：${safeString(firstValue(protection, ['fallbackReason', 'fallback']))}`);
  } else {
    lines.push(...bulletLines(protection, '无真实性保护变化'));
  }
  lines.push('', '## 9. 本阶段测试内容与结果', '');
  lines.push(...tableLines(data.tests || data.validations, [
    { title: '测试项', keys: ['name', 'test', 'item'] },
    { title: '命令 / 方法', keys: ['command', 'method', 'cmd'] },
    { title: '结果', keys: ['result', 'status'] },
    { title: '备注', keys: ['note', 'remark'] },
  ], '无测试记录'));
  lines.push('', '## 10. 清理情况', '');
  if (typeof cleanup === 'object' && !Array.isArray(cleanup)) {
    lines.push(`- 已清理：${safeString(cleanup.removed || cleanup.cleaned)}`);
    lines.push(`- 保留证据：${safeString(cleanup.kept || cleanup.evidence)}`);
    lines.push(`- 敏感材料处理：${safeString(cleanup.sensitive || cleanup.sensitiveHandling)}`);
  } else {
    lines.push(...bulletLines(cleanup, '未记录清理情况'));
  }
  lines.push('', '## 11. 风险与遗留问题', '');
  lines.push(...bulletLines(data.risks || data.leftoverRisks, '无'));
  if (data.uncoveredSamples) lines.push(`- 未覆盖样本：${safeString(data.uncoveredSamples)}`);
  if (data.needUserConfirm) lines.push(`- 需要用户确认：${safeString(data.needUserConfirm)}`);
  lines.push('', '## 12. 下一步计划', '');
  lines.push(...numberedLines(data.nextSteps, '待补充'));
  return lines.join('\n') + '\n';
}
function renderDataReport(stage, data, template) {
  const mode = String(template || '').trim().toLowerCase();
  if (stage.title === '需求信息确认' && mode !== 'dynamic') return renderIntakeReport(stage, data);
  return renderDynamicReport(stage, data);
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.caseDir || !args.stage) {
    console.log(usage());
    process.exit(args.help ? 0 : 1);
  }
  const caseDir = path.resolve(args.caseDir);
  const stage = normalizeStage(args.stage, args.index);
  const out = path.resolve(args.out || defaultOut(caseDir, stage));
  if (!hasChinese(path.basename(out))) throw new Error(`阶段报告文件名必须包含中文：${out}`);
  let content = '';
  if (args.input) content = readText(args.input);
  else if (args.data) content = renderDataReport(stage, loadJson(args.data), args.template);
  else content = readStdin();
  if (!content.trim()) content = renderDataReport(stage, {}, args.template);
  if (hasBadQuestionMarks(content) || content.includes('\uFFFD')) throw new Error('阶段报告内容疑似存在中文编码损坏，请重新生成草稿。');
  ensureParent(out);
  if (args.append && exists(out)) fs.appendFileSync(out, '\n' + content, 'utf8');
  else fs.writeFileSync(out, content, 'utf8');
  const result = { ok: true, stage: stage.title, index: stage.index, out, bytes: Buffer.byteLength(content, 'utf8'), encoding: 'utf8', chineseFileName: hasChinese(path.basename(out)) };
  if (args.json) console.log(JSON.stringify(result, null, 2));
  if (args.markdown) {
    console.log('# 阶段报告写入结果');
    console.log('');
    console.log(`- 阶段：${result.stage}`);
    console.log(`- 阶段编号：${result.index}`);
    console.log(`- 输出文件：${result.out}`);
    console.log(`- 中文文件名：${result.chineseFileName ? '是' : '否'}`);
    console.log(`- 编码：${result.encoding}`);
    console.log('- 状态：写入完成');
  }
}

try { main(); } catch (err) { console.error(err.message || String(err)); console.error(usage()); process.exit(1); }
