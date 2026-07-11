#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const BLOCKING_PRIORITIES = new Set(['P0', 'P1']);
const ASSERTION_FIELDS = [
  'owner',
  'brand',
  'constructorName',
  'descriptor',
  'prototypeChain',
  'ownKeys',
  'ownPropertyNames',
  'ownSymbols',
  'argsDigest',
  'resultDigest',
  'errorDigest',
  'sideEffectsDigest',
];

function parseArgs(argv) {
  const args = {
    caseDir: '',
    contract: '',
    nodeAudit: '',
    strictP2: false,
    json: false,
    markdown: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--case-dir' || arg === '--case' || arg === '-d') args.caseDir = argv[++i] || '';
    else if (arg === '--contract') args.contract = argv[++i] || '';
    else if (arg === '--node-audit') args.nodeAudit = argv[++i] || '';
    else if (arg === '--strict-p2') args.strictP2 = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--markdown') args.markdown = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`未知参数：${arg}`);
  }
  if (!args.json && !args.markdown) args.markdown = true;
  return args;
}

function usage() {
  return `用法：
  node scripts/check_trace_runtime_conformance.js --case-dir case --markdown
  node scripts/check_trace_runtime_conformance.js --contract case/notes/trace-runtime-contract.json --node-audit case/tmp/node-trace-runtime-audit.json --strict-p2 --json

说明：逐项比较 Trace 行为契约与 Node runtime audit。P0/P1 缺失或行为不一致会直接阻断，不能用手工填写 matched 绕过。`;
}

function exists(file) {
  try { return fs.existsSync(file); } catch { return false; }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function digest(value) {
  if (typeof value === 'undefined') return '';
  if (value && typeof value === 'object' && typeof value.digest === 'string') return value.digest;
  if (typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)) return value.toLowerCase();
  try { return sha256(JSON.stringify(stable(value))); } catch { return sha256(String(value)); }
}

function normalizeList(value) {
  if (typeof value === 'undefined') return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map(item => {
    if (item && typeof item === 'object' && typeof item.digest === 'string') return item.digest.toLowerCase();
    return digest(item);
  }).filter(Boolean).sort();
}

function itemKey(item) {
  if (item.id) return `id:${item.id}`;
  return ['key', item.api || item.path || item.name || '', item.accessType || item.operation || item.type || 'unknown', item.realm || item.realmId || 'main', item.receiver || item.receiverType || '', item.phase || ''].join('\u001f');
}

function normalizeItems(raw) {
  if (Array.isArray(raw)) return raw;
  for (const key of ['contracts', 'observations', 'items', 'apis', 'events']) {
    if (Array.isArray(raw && raw[key])) return raw[key];
  }
  return [];
}

function contractHash(contract) {
  if (contract.contractHash) return String(contract.contractHash);
  return sha256(JSON.stringify(stable({
    schemaVersion: contract.schemaVersion,
    baselineId: contract.baselineId,
    traceSourceHash: contract.traceSourceHash,
    contracts: normalizeItems(contract),
  })));
}

function expectedDigests(contractItem, field) {
  const assertions = contractItem.assertions || {};
  return normalizeList(assertions[field]);
}

function observedDigests(auditItem, field) {
  const observations = auditItem.observations || {};
  if (typeof observations[field] !== 'undefined') return normalizeList(observations[field]);
  if (typeof auditItem[field] !== 'undefined') return normalizeList(auditItem[field]);
  return [];
}

function compareItem(contractItem, auditItem) {
  const diffs = [];
  for (const field of ASSERTION_FIELDS) {
    const expected = expectedDigests(contractItem, field);
    if (!expected.length) continue;
    const observed = observedDigests(auditItem, field);
    if (!observed.length) {
      diffs.push({ field, type: 'missing-observation', expected, observed });
      continue;
    }
    const missing = expected.filter(item => !observed.includes(item));
    if (missing.length) diffs.push({ field, type: 'value-mismatch', expected, observed, missing });
  }
  if (Array.isArray(contractItem.sequences) && contractItem.sequences.length > 1 && Array.isArray(auditItem.sequences)) {
    const expectedOrder = [...contractItem.sequences].sort((a, b) => a - b);
    const observedOrder = [...auditItem.sequences].sort((a, b) => a - b);
    if (observedOrder.length < Math.min(expectedOrder.length, 2)) {
      diffs.push({ field: 'sequences', type: 'insufficient-sequence-evidence', expected: expectedOrder, observed: observedOrder });
    }
  }
  return diffs;
}

function check(args) {
  const caseDir = path.resolve(args.caseDir || '.');
  const contractPath = path.resolve(args.contract || path.join(caseDir, 'notes', 'trace-runtime-contract.json'));
  const auditPath = path.resolve(args.nodeAudit || path.join(caseDir, 'tmp', 'node-trace-runtime-audit.json'));
  const problems = [];
  const warnings = [];
  if (!exists(contractPath)) problems.push(`缺少 Trace runtime contract：${contractPath}`);
  if (!exists(auditPath)) problems.push(`缺少 Node runtime audit：${auditPath}`);
  if (problems.length) {
    return { caseDir, contractPath, auditPath, clean: false, problems, warnings, results: [], summary: {} };
  }

  let contract;
  let audit;
  try { contract = readJson(contractPath); } catch (err) { problems.push(`Trace runtime contract 无法解析：${err.message}`); }
  try { audit = readJson(auditPath); } catch (err) { problems.push(`Node runtime audit 无法解析：${err.message}`); }
  if (!contract || !audit) return { caseDir, contractPath, auditPath, clean: false, problems, warnings, results: [], summary: {} };

  if (contract.schemaVersion !== 'trace-runtime-contract/v2') problems.push(`不支持的 contract schemaVersion：${contract.schemaVersion || '未记录'}`);
  if (!/^node-trace-runtime-audit\/v2$/.test(String(audit.schemaVersion || ''))) {
    problems.push(`Node audit 必须使用 node-trace-runtime-audit/v2，当前为：${audit.schemaVersion || '未记录'}`);
  }
  if (audit.generatedBy !== 'run_trace_runtime_audit.js' && audit.generatedBy !== 'runtime-audit-recorder/v2') {
    problems.push(`Node audit generatedBy 不可信：${audit.generatedBy || '未记录'}`);
  }
  const expectedContractHash = contractHash(contract);
  if (!audit.contractHash || audit.contractHash !== expectedContractHash) {
    problems.push(`Node audit contractHash 与当前 contract 不一致：${audit.contractHash || '未记录'} != ${expectedContractHash}`);
  }
  if (contract.baselineId && audit.baselineId !== contract.baselineId) {
    problems.push(`baselineId 不一致：${contract.baselineId} != ${audit.baselineId || '未记录'}`);
  }
  if (!audit.runtimeSourceHash) problems.push('Node audit 缺少 runtimeSourceHash，无法判断审计是否已因源码变化失效');
  if (!audit.probeVersion) problems.push('Node audit 缺少 probeVersion');
  if (audit.networkMode !== 'no-send') problems.push(`Trace runtime audit 必须在 no-send 模式执行，当前为：${audit.networkMode || '未记录'}`);

  const contractItems = normalizeItems(contract);
  const auditItems = normalizeItems(audit);
  const auditByKey = new Map();
  for (const item of auditItems) {
    auditByKey.set(itemKey(item), item);
    if (item.id) auditByKey.set(`id:${item.id}`, item);
  }
  const results = [];
  for (const contractItem of contractItems) {
    const key = contractItem.id ? `id:${contractItem.id}` : itemKey(contractItem);
    const auditItem = auditByKey.get(key) || auditByKey.get(itemKey(contractItem));
    const priority = String(contractItem.priority || 'P2').toUpperCase();
    const blocking = BLOCKING_PRIORITIES.has(priority) || args.strictP2;
    const diffs = auditItem ? compareItem(contractItem, auditItem) : [{ field: '*', type: 'missing-runtime-observation' }];
    const clean = diffs.length === 0;
    if (!clean) {
      const message = `${priority} ${contractItem.api || contractItem.name || contractItem.id}：${diffs.map(item => `${item.field}:${item.type}`).join('、')}`;
      if (blocking) problems.push(message);
      else warnings.push(message);
    }
    results.push({
      id: contractItem.id || '',
      api: contractItem.api || contractItem.name || '',
      priority,
      clean,
      blocking,
      diffs,
    });
  }
  const unexpectedAuditItems = auditItems.filter(item => {
    const key = item.id ? `id:${item.id}` : itemKey(item);
    return !contractItems.some(contractItem => (contractItem.id ? `id:${contractItem.id}` : itemKey(contractItem)) === key);
  });
  if (unexpectedAuditItems.length) warnings.push(`Node audit 出现 ${unexpectedAuditItems.length} 个 Trace contract 未记录的 runtime 观测项，必须分类为新动态分支或宿主泄露`);

  const summary = {
    contractCount: contractItems.length,
    auditCount: auditItems.length,
    matched: results.filter(item => item.clean).length,
    mismatched: results.filter(item => !item.clean).length,
    blockingMismatches: results.filter(item => !item.clean && item.blocking).length,
    unexpectedAuditItems: unexpectedAuditItems.length,
    contractHash: expectedContractHash,
    runtimeSourceHash: audit.runtimeSourceHash || '',
  };
  return { caseDir, contractPath, auditPath, clean: problems.length === 0, problems, warnings, results, summary };
}

function renderMarkdown(result) {
  const lines = [
    '# Trace-runtime 一致性检查结果',
    '',
    `- contract：${result.contractPath}`,
    `- Node audit：${result.auditPath}`,
    `- 是否通过：${result.clean ? '是' : '否'}`,
  ];
  if (result.summary && typeof result.summary.contractCount !== 'undefined') {
    lines.push(`- 契约项：${result.summary.contractCount}`);
    lines.push(`- Node audit 项：${result.summary.auditCount}`);
    lines.push(`- matched：${result.summary.matched}`);
    lines.push(`- mismatch：${result.summary.mismatched}`);
    lines.push(`- P0/P1 阻断差异：${result.summary.blockingMismatches}`);
    lines.push(`- runtimeSourceHash：${result.summary.runtimeSourceHash || '未记录'}`);
  }
  const bad = result.results.filter(item => !item.clean);
  if (bad.length) {
    lines.push('', '## 差异');
    for (const item of bad.slice(0, 100)) {
      lines.push(`- ${item.priority} ${item.api || item.id}：${item.diffs.map(diff => `${diff.field}:${diff.type}`).join('、')}`);
    }
  }
  if (result.problems.length) {
    lines.push('', '## 阻断问题');
    for (const problem of result.problems) lines.push(`- ${problem}`);
  }
  if (result.warnings.length) {
    lines.push('', '## 提醒');
    for (const warning of result.warnings) lines.push(`- ${warning}`);
  }
  return `${lines.join('\n')}\n`;
}

if (require.main === module) {
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
}

module.exports = { check, compareItem, contractHash };
