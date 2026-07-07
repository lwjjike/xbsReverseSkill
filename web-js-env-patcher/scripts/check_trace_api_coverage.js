#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ALLOWED_STATUSES = new Set([
  'planned-first-pass',
  'implemented-first-pass',
  'needs-baseline-sampling',
  'deferred-not-mounted',
  'native-capability-gap',
  'live-discovered',
  'missed-from-trace',
]);

const PRIORITIES_REQUIRING_DECISION = new Set(['P0', 'P1']);

function parseArgs(argv) {
  const args = {
    caseDir: '',
    inventory: '',
    matrix: '',
    requireStageAudit: false,
    json: false,
    markdown: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--case-dir' || a === '--dir' || a === '-d') args.caseDir = argv[++i] || '';
    else if (a === '--inventory') args.inventory = argv[++i] || '';
    else if (a === '--matrix') args.matrix = argv[++i] || '';
    else if (a === '--require-stage-audit') args.requireStageAudit = true;
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
  node scripts/check_trace_api_coverage.js --case-dir case --markdown
  node scripts/check_trace_api_coverage.js --case-dir case --require-stage-audit --json
  node scripts/check_trace_api_coverage.js --inventory case/notes/trace-api-inventory.json --matrix case/notes/env-coverage-matrix.md --markdown

说明：检查 Trace API inventory、env coverage matrix，以及后续阶段报告中计划外新增 WebAPI 是否说明原因。`;
}

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function readText(p) {
  return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
}

function readJson(p) {
  return JSON.parse(readText(p));
}

function rel(root, file) {
  return (path.relative(root, file) || '.').replace(/\\/g, '/');
}

function normalizePriority(value) {
  const text = String(value || '').trim().toUpperCase();
  if (/^P?[0-2]$/.test(text)) return text.startsWith('P') ? text : `P${text}`;
  return text || 'UNKNOWN';
}

function normalizeStatus(value) {
  return String(value || '').trim();
}

function normalizeInventory(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.apis)) return raw.apis;
  if (raw.inventory && Array.isArray(raw.inventory.apis)) return raw.inventory.apis;
  if (raw.apiInventory && Array.isArray(raw.apiInventory)) return raw.apiInventory;
  return [];
}

function listMarkdown(dir) {
  if (!exists(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name);
    try {
      if (fs.statSync(file).isFile() && name.toLowerCase().endsWith('.md')) out.push(file);
    } catch {}
  }
  return out.sort();
}

function hasTraceEvidence(caseDir) {
  const candidates = [
    path.join(caseDir, 'ruyi-trace'),
    path.join(caseDir, 'notes', 'ruyitrace-summary.md'),
    path.join(caseDir, 'tmp', 'env-trace.jsonl'),
    path.join(caseDir, 'tmp', 'missing-env.json'),
  ];
  return candidates.some(exists);
}

function auditMatrixText(text) {
  const required = ['Trace', 'baselineId', 'P0', 'P1', '首轮', '采样', '暂不挂载', '计划外'];
  return required.filter(key => !text.includes(key));
}

function auditStageReports(caseDir) {
  const stageDir = path.join(caseDir, '阶段报告');
  const files = listMarkdown(stageDir);
  const findings = [];
  const reasonPattern = /trace-not-covered|dynamic-resource-new-branch|baseline-mismatch|trace-truncated|native-gap|missed-from-trace|Trace 未覆盖|动态资源新分支|baseline|截断|能力缺口|矩阵遗漏|流程缺陷/;
  for (const file of files) {
    const text = readText(file);
    const mentionsOldHeading = text.includes('本阶段新增 / 修改的 WebAPI');
    const hasPlanned = text.includes('Trace 计划内') || text.includes('计划内首轮');
    const hasUnplanned = text.includes('计划外新增');
    if (mentionsOldHeading && !hasPlanned && !hasUnplanned) {
      findings.push({
        file: rel(caseDir, file),
        problem: '阶段报告仍使用笼统的“本阶段新增 / 修改的 WebAPI”，未拆分 Trace 计划内与计划外新增。',
      });
    }
    if (hasUnplanned) {
      const section = text.slice(text.indexOf('计划外新增'));
      if (!reasonPattern.test(section)) {
        findings.push({
          file: rel(caseDir, file),
          problem: '计划外新增 WebAPI 缺少原因枚举或证据说明。',
        });
      }
    }
  }
  return findings;
}

function check(args) {
  const caseDir = args.caseDir ? path.resolve(args.caseDir) : process.cwd();
  const notesDir = path.join(caseDir, 'notes');
  const inventoryPath = path.resolve(args.inventory || path.join(notesDir, 'trace-api-inventory.json'));
  const matrixPath = path.resolve(args.matrix || path.join(notesDir, 'env-coverage-matrix.md'));
  const problems = [];
  const warnings = [];
  const traceDetected = hasTraceEvidence(caseDir);

  if (traceDetected && !exists(inventoryPath)) problems.push(`存在 Trace 证据，但缺少 ${rel(caseDir, inventoryPath)}`);
  if (traceDetected && !exists(matrixPath)) problems.push(`存在 Trace 证据，但缺少 ${rel(caseDir, matrixPath)}`);

  let apis = [];
  let inventoryMeta = {};
  if (exists(inventoryPath)) {
    try {
      const raw = readJson(inventoryPath);
      inventoryMeta = {
        schemaVersion: raw.schemaVersion || '',
        source: raw.source || '',
        baselineId: raw.baselineId || '',
      };
      apis = normalizeInventory(raw);
      if (!apis.length) problems.push('trace-api-inventory.json 没有可识别的 apis 数组');
    } catch (err) {
      problems.push(`trace-api-inventory.json 无法解析为 JSON：${err.message}`);
    }
  }

  const apiResults = [];
  for (const item of apis) {
    const api = item.api || item.path || item.name || '(unknown)';
    const priority = normalizePriority(item.priority || item.level);
    const status = normalizeStatus(item.implementationStatus || item.status || item.coverageStatus);
    const reason = String(item.reason || item.decisionReason || '').trim();
    const implementationFile = String(item.implementationFile || item.file || '').trim();
    const samplingRequired = Boolean(item.samplingRequired || status === 'needs-baseline-sampling');
    const result = { api, priority, status, reason, implementationFile, samplingRequired, clean: true, problems: [] };

    if (!status || status === 'unplanned') {
      result.problems.push('缺少实现状态或状态为 unplanned');
    } else if (!ALLOWED_STATUSES.has(status)) {
      result.problems.push(`未知状态：${status}`);
    }
    if (PRIORITIES_REQUIRING_DECISION.has(priority) && status === 'planned-first-pass' && !implementationFile) {
      result.problems.push('P0/P1 首轮实现项缺少 implementationFile');
    }
    if (['needs-baseline-sampling', 'deferred-not-mounted', 'native-capability-gap', 'missed-from-trace', 'live-discovered'].includes(status) && !reason) {
      result.problems.push(`${status} 必须写明 reason`);
    }
    if (status === 'missed-from-trace') {
      result.problems.push('Trace 已命中但矩阵遗漏，必须作为流程缺陷修复后再继续');
    }
    if (samplingRequired && status !== 'needs-baseline-sampling' && !reason) {
      result.problems.push('samplingRequired=true 时必须说明采样策略或阻塞原因');
    }
    if (result.problems.length) {
      result.clean = false;
      for (const p of result.problems) problems.push(`${api}：${p}`);
    }
    apiResults.push(result);
  }

  let matrixMissing = [];
  if (exists(matrixPath)) {
    const text = readText(matrixPath);
    matrixMissing = auditMatrixText(text);
    if (matrixMissing.length) problems.push(`env-coverage-matrix.md 缺少关键内容：${matrixMissing.join('、')}`);
  }

  const stageFindings = args.requireStageAudit ? auditStageReports(caseDir) : [];
  for (const finding of stageFindings) problems.push(`${finding.file}：${finding.problem}`);

  return {
    caseDir,
    traceDetected,
    inventoryPath,
    matrixPath,
    inventoryMeta,
    clean: problems.length === 0,
    problems,
    warnings,
    apiCount: apiResults.length,
    apiResults,
    matrixMissing,
    stageFindings,
  };
}

function renderMarkdown(result) {
  const lines = [
    '# Trace API 覆盖矩阵检查结果',
    '',
    `case 目录：${result.caseDir}`,
    `检测到 Trace 证据：${result.traceDetected ? '是' : '否'}`,
    `inventory：${result.inventoryPath}`,
    `matrix：${result.matrixPath}`,
    `是否通过：${result.clean ? '是' : '否'}`,
    '',
    '## Inventory 摘要',
    `- schemaVersion：${result.inventoryMeta.schemaVersion || '未记录'}`,
    `- source：${result.inventoryMeta.source || '未记录'}`,
    `- baselineId：${result.inventoryMeta.baselineId || '未记录'}`,
    `- API 数量：${result.apiCount}`,
  ];

  if (result.apiResults.length) {
    lines.push('', '## API 状态');
    for (const item of result.apiResults.slice(0, 80)) {
      lines.push(`- ${item.clean ? '通过' : '失败'} ${item.priority} ${item.api}：${item.status || '未记录'}${item.implementationFile ? `；文件 ${item.implementationFile}` : ''}`);
      for (const problem of item.problems) lines.push(`  - ${problem}`);
    }
    if (result.apiResults.length > 80) lines.push(`- 其余 ${result.apiResults.length - 80} 条略。`);
  }

  if (result.matrixMissing.length) {
    lines.push('', '## Matrix 缺失项');
    for (const item of result.matrixMissing) lines.push(`- ${item}`);
  }
  if (result.stageFindings.length) {
    lines.push('', '## 阶段报告问题');
    for (const item of result.stageFindings) lines.push(`- ${item.file}：${item.problem}`);
  }
  if (result.problems.length) {
    lines.push('', '## 问题');
    for (const problem of result.problems) lines.push(`- ${problem}`);
  }
  if (!result.problems.length) lines.push('', '## 结论', '- Trace API 覆盖矩阵检查通过。');
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
