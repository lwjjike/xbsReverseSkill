#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const CATEGORIES = [
  {
    id: 'iframe-realm',
    label: 'iframe / Window realm',
    patterns: [/iframe/i, /contentWindow/i, /contentDocument/i, /defaultView/i, /frameElement/i, /srcdoc/i, /document\.write/i, /document\.close/i],
  },
  {
    id: 'worker-task',
    label: 'Worker / Message task queue',
    patterns: [/\bWorker\b/i, /\bSharedWorker\b/i, /WorkerGlobalScope/i, /DedicatedWorkerGlobalScope/i, /SharedWorkerGlobalScope/i, /importScripts/i, /terminate/i],
  },
  {
    id: 'message-lifecycle',
    label: 'MessagePort / postMessage lifecycle',
    patterns: [/postMessage/i, /MessageChannel/i, /MessagePort/i, /entangled/i, /structuredClone/i, /\.close\s*\(/i],
  },
  {
    id: 'performance-timeline',
    label: 'Performance timeline',
    patterns: [/PerformanceObserver/i, /PerformanceResourceTiming/i, /PerformanceEntry/i, /getEntries/i, /PerformancePaintTiming/i, /performance\.mark/i],
  },
  {
    id: 'dom-cssom',
    label: 'DOM / CSSOM',
    patterns: [/DOMParser/i, /innerHTML/i, /Comment/i, /ShadowRoot/i, /CSSStyleSheet/i, /CSSRuleList/i, /getComputedStyle/i, /document\.links/i, /document\.images/i, /document\.forms/i],
  },
  {
    id: 'dom-crud',
    label: 'DOM CRUD state machine',
    patterns: [
      /appendChild/i, /removeChild/i, /insertBefore/i, /replaceChild/i, /replaceChildren/i,
      /cloneNode/i, /importNode/i, /adoptNode/i, /isConnected/i, /ownerDocument/i,
      /childNodes/i, /\bchildren\b/i, /querySelector/i, /getElementById/i,
      /getElementsBy/i, /\.matches\s*\(/i, /\.closest\s*\(/i, /MutationObserver/i,
    ],
  },
  {
    id: 'event-clone-error',
    label: 'Event / clone / native shape',
    patterns: [/EventTarget/i, /structuredClone/i, /DataCloneError/i, /ownKeys/i, /ownNames/i, /getOwnPropertyNames/i, /Reflect\.ownKeys/i, /toString/i],
  },
  {
    id: 'xhr-fetch-session-bridge',
    label: 'XHR / fetch session bridge',
    patterns: [/\bXMLHttpRequest\b/i, /\bfetch\s*\(/i, /\bRequest\b/i, /\bResponse\b/i, /\bHeaders\b/i, /\bsendBeacon\b/i, /live-session-bridge/i, /offline-fixture/i, /curl_cffi/i, /curl-cffi/i],
  },
  {
    id: 'object-shape',
    label: 'Object shape audit',
    patterns: [/Object\.keys/i, /Object\.getOwnPropertyNames/i, /Object\.getOwnPropertyDescriptor/i, /Object\.getOwnPropertySymbols/i, /Reflect\.ownKeys/i, /hasOwnProperty/i, /propertyIsEnumerable/i, /prototype walk/i, /brand check/i],
  },
  {
    id: 'private-state-leakage',
    label: 'Private state leakage',
    patterns: [/__readyState/i, /__headers/i, /__children/i, /__parentNode/i, /__responseHeaders/i, /private state/i, /私有状态/i, /Object\.defineProperty\s*\([^)]*['"]_{1,2}[A-Za-z]/i, /\bthis\s*\.\s*_{1,2}[A-Za-z]/i],
  },
  {
    id: 'clock-timer',
    label: 'Clock / timer',
    patterns: [/Date\.now/i, /performance\.now/i, /setTimeout/i, /timer/i, /queueMicrotask/i],
  },
  {
    id: 'writer-branch',
    label: 'Writer branch',
    patterns: [/reload writer/i, /form writer/i, /final writer/i, /HTMLFormElement\.submit/i, /Location\.reload/i, /generatedForm/i, /cf-chl-gen/i, /cf-chl-out/i],
  },
];

const REQUIRED_CAPABILITIES = {
  'iframe-realm': [
    'realm-global-relations',
    'realm-ecma-constructor-isolation',
    'realm-webapi-constructor-isolation',
    'realm-object-isolation',
    'realm-document-relations',
    'realm-navigation-lifecycle',
  ],
  'worker-task': [
    'worker-global-surface',
    'worker-constructor-isolation',
    'worker-object-isolation',
    'worker-message-order',
    'worker-terminate-immediate',
    'worker-terminate-deferred',
  ],
  'message-lifecycle': [
    'message-order',
    'message-port-start',
    'message-port-close-sender',
    'message-port-close-receiver',
    'message-port-transfer',
  ],
  'dom-crud': [
    'dom-tree-mutation',
    'dom-live-collections',
    'dom-selector-validity',
    'dom-html-parsing',
    'dom-document-relations',
    'dom-mutation-observer',
  ],
};

const OBSERVATION_KEYS = ['observation', 'observed', 'result', 'value', 'output', 'expected'];

const BLOCKING_STATUSES = new Set([
  'needs-browser-baseline',
  'needs-node-audit',
  'mismatch',
  'native-capability-gap',
  'unknown',
]);

const SELF_OUTPUT_FILES = new Set([
  'webapi-env-detection-matrix.md',
  'node-env-detection-audit.json',
]);

function parseArgs(argv) {
  const args = {
    caseDir: '',
    matrix: '',
    browserBaseline: '',
    nodeAudit: '',
    require: false,
    requireWriterBranch: false,
    json: false,
    markdown: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--case-dir' || a === '--dir' || a === '-d') args.caseDir = argv[++i] || '';
    else if (a === '--matrix') args.matrix = argv[++i] || '';
    else if (a === '--browser-baseline') args.browserBaseline = argv[++i] || '';
    else if (a === '--node-audit') args.nodeAudit = argv[++i] || '';
    else if (a === '--require') args.require = true;
    else if (a === '--require-writer-branch') args.requireWriterBranch = true;
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
  node scripts/check_webapi_env_detection_matrix.js --case-dir case --markdown
  node scripts/check_webapi_env_detection_matrix.js --case-dir case --require --require-writer-branch --json
  node scripts/check_webapi_env_detection_matrix.js --matrix case/notes/webapi-env-detection-matrix.md --browser-baseline case/fixtures/browser-env-detection-baseline.json --node-audit case/tmp/node-env-detection-audit.json --markdown

说明：检查 WebAPI 环境检测矩阵、真实浏览器 baseline、Node audit，以及 iframe / Worker / Performance / DOM-CSSOM / XHR/fetch session bridge / 对象形状 / 私有状态泄露 / writer 分支等行为 diff 是否闭环。`;
}

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function stat(p) {
  try { return fs.statSync(p); } catch { return null; }
}

function readText(p) {
  return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
}

function readJson(p) {
  return JSON.parse(readText(p));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function rel(root, file) {
  return (path.relative(root, file) || '.').replace(/\\/g, '/');
}

function walk(root, out = []) {
  if (!exists(root)) return out;
  const st = stat(root);
  if (!st) return out;
  if (st.isFile()) {
    out.push(root);
    return out;
  }
  if (!st.isDirectory()) return out;
  for (const name of fs.readdirSync(root)) {
    walk(path.join(root, name), out);
  }
  return out;
}

function listCandidateFiles(caseDir) {
  const dirs = ['阶段报告', 'notes', 'tmp', 'ruyi-trace', 'result'];
  const files = [];
  for (const dir of dirs) {
    const full = path.join(caseDir, dir);
    for (const file of walk(full)) {
      const relative = rel(caseDir, file);
      if (/(^|\/)(node_modules|dist|build|coverage)(\/|$)/i.test(relative)) continue;
      if (/\.(md|json|jsonl|ndjson|txt|js|mjs|cjs|ts|py|html)$/i.test(file)) files.push(file);
    }
  }
  return files.filter(file => !SELF_OUTPUT_FILES.has(path.basename(file).toLowerCase()));
}

function scanTriggers(caseDir) {
  const hits = new Map(CATEGORIES.map(category => [category.id, { ...category, count: 0, files: [] }]));
  for (const file of listCandidateFiles(caseDir)) {
    let text = '';
    try {
      text = readText(file).slice(0, 200000);
    } catch {
      continue;
    }
    for (const category of CATEGORIES) {
      let matched = 0;
      for (const pattern of category.patterns) {
        const result = text.match(pattern);
        if (result) matched += result.length || 1;
      }
      if (matched) {
        const entry = hits.get(category.id);
        entry.count += matched;
        if (entry.files.length < 8) entry.files.push(rel(caseDir, file));
      }
    }
  }
  return [...hits.values()].filter(item => item.count > 0);
}

function stripStatusDocumentation(text) {
  const lines = text.split(/\r?\n/);
  const kept = [];
  let inFence = false;
  let skippingStatusEnum = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      if (!skippingStatusEnum) kept.push(line);
      continue;
    }
    if (!inFence && /^#{1,6}\s*状态枚举\b/.test(trimmed)) {
      skippingStatusEnum = true;
      continue;
    }
    if (skippingStatusEnum && !inFence && /^#{1,6}\s+/.test(trimmed)) {
      skippingStatusEnum = false;
    }
    if (!skippingStatusEnum) kept.push(line);
  }
  return kept.join('\n');
}

function extractStatuses(text) {
  const auditText = stripStatusDocumentation(text);
  const statuses = [];
  const allowed = [
    'matched',
    'accepted-diff',
    'not-involved',
    'needs-browser-baseline',
    'needs-node-audit',
    'mismatch',
    'native-capability-gap',
    'unknown',
  ];
  for (const status of allowed) {
    const re = new RegExp(`\\b${status}\\b`, 'g');
    const matches = auditText.match(re);
    if (matches) statuses.push({ status, count: matches.length });
  }
  return statuses;
}

function normalizeCategoriesFromJson(raw) {
  if (!raw || typeof raw !== 'object') return [];
  if (Array.isArray(raw.categories)) return raw.categories.map(String);
  if (raw.categories && typeof raw.categories === 'object') return Object.keys(raw.categories);
  if (raw.checks && typeof raw.checks === 'object') return Object.keys(raw.checks);
  if (Array.isArray(raw.items)) return raw.items.map(item => item.category || item.type).filter(Boolean);
  return [];
}

function normalizeCategoryRecords(raw) {
  if (!raw || typeof raw !== 'object') return {};
  if (raw.categories && typeof raw.categories === 'object' && !Array.isArray(raw.categories)) return raw.categories;
  if (raw.checks && typeof raw.checks === 'object' && !Array.isArray(raw.checks)) return raw.checks;
  if (Array.isArray(raw.items)) {
    const out = {};
    for (const item of raw.items) {
      const category = item.category || item.type;
      if (!category) continue;
      if (!out[category]) out[category] = [];
      out[category].push(item);
    }
    return out;
  }
  return {};
}

function stable(value, ignoreRecordMetadata = false) {
  if (Array.isArray(value)) return value.map(item => stable(item, ignoreRecordMetadata));
  if (!value || typeof value !== 'object') return value;
  const ignored = new Set(['status', 'evidence', 'file', 'notes', 'note', 'handling', 'updatedAt', 'capturedAt']);
  return Object.fromEntries(
    Object.keys(value)
      .filter(key => !ignoreRecordMetadata || !ignored.has(key))
      .sort()
      .map(key => [key, stable(value[key], ignoreRecordMetadata)]),
  );
}

function recordId(item, index) {
  return String(item && (item.id || item.name || item.probe || item.path || item.api) || index);
}

function recordPayload(item) {
  if (!item || typeof item !== 'object') return item;
  for (const key of ['observation', 'observed', 'result', 'value', 'output', 'expected']) {
    if (typeof item[key] !== 'undefined') return stable(item[key]);
  }
  return stable(item, true);
}

function assertJsonCategoryCoverage(source, label, expectedCategories, problems, warnings) {
  if (!source.parseOk || expectedCategories.length === 0) return;
  if (!source.categories.length) {
    problems.push(`${label} 未记录 categories / checks / items 类别，无法确认已覆盖触发的 WebAPI 行为类别`);
    return;
  }
  const missing = expectedCategories.filter(id => !source.categories.includes(id));
  if (missing.length) problems.push(`${label} 缺少触发类别：${missing.join('、')}`);
}

function checkJsonFile(caseDir, file, label, problems, warnings) {
  if (!exists(file)) {
    problems.push(`缺少 ${label}：${rel(caseDir, file)}`);
    return {
      exists: false, parseOk: false, baselineId: '', categories: [], categoryRecords: {},
      runtimeSourceHash: '', generatedBy: '', capturedBy: '', probeVersion: '',
      probeSuiteVersion: '', probeSourceHash: '', probeSourceFile: '',
    };
  }
  try {
    const raw = readJson(file);
    return {
      exists: true,
      parseOk: true,
      baselineId: raw.baselineId || '',
      categories: normalizeCategoriesFromJson(raw),
      categoryRecords: normalizeCategoryRecords(raw),
      schemaVersion: raw.schemaVersion || '',
      runtimeSourceHash: raw.runtimeSourceHash || '',
      generatedBy: raw.generatedBy || '',
      capturedBy: raw.capturedBy || '',
      probeVersion: raw.probeVersion || '',
      probeSuiteVersion: raw.probeSuiteVersion || '',
      probeSourceHash: raw.probeSourceHash || '',
      probeSourceFile: raw.probeSourceFile || '',
    };
  } catch (err) {
    problems.push(`${label} 无法解析为 JSON：${rel(caseDir, file)}：${err.message}`);
    return {
      exists: true, parseOk: false, baselineId: '', categories: [], categoryRecords: {},
      runtimeSourceHash: '', generatedBy: '', capturedBy: '', probeVersion: '',
      probeSuiteVersion: '', probeSourceHash: '', probeSourceFile: '',
    };
  }
}

function actualObservation(item) {
  if (!item || typeof item !== 'object') return { present: false, value: undefined };
  for (const key of OBSERVATION_KEYS) {
    if (typeof item[key] !== 'undefined') return { present: true, value: stable(item[key]), key };
  }
  return { present: false, value: undefined, key: '' };
}

function recordCapabilities(item) {
  if (!item || typeof item !== 'object') return [];
  const values = [];
  if (Array.isArray(item.capabilities)) values.push(...item.capabilities);
  for (const key of ['capability', 'probeKind', 'behavior']) {
    if (item[key]) values.push(item[key]);
  }
  return [...new Set(values.map(String).filter(Boolean))];
}

function validateObservationRecords(source, label, expectedCategories, problems) {
  if (!source.parseOk) return;
  for (const category of expectedCategories) {
    const records = Array.isArray(source.categoryRecords[category]) ? source.categoryRecords[category] : [];
    for (const [index, item] of records.entries()) {
      const id = recordId(item, index);
      if (!actualObservation(item).present) {
        problems.push(`${label} 的 ${category}/${id} 只有 probe/status/evidence，没有实际 observation；证据文本不能作为行为一致性证明`);
      }
    }
  }
}

function validateRequiredCapabilities(source, label, expectedCategories, problems) {
  if (!source.parseOk) return;
  for (const category of expectedCategories) {
    const required = REQUIRED_CAPABILITIES[category] || [];
    if (!required.length) continue;
    const records = Array.isArray(source.categoryRecords[category]) ? source.categoryRecords[category] : [];
    const covered = new Set(records.flatMap(recordCapabilities));
    const missing = required.filter(capability => !covered.has(capability));
    if (missing.length) {
      problems.push(`${label} 的 ${category} 缺少强制行为能力：${missing.join('、')}`);
    }
  }
}

function validateProbeSourceFile(caseDir, source, label, problems) {
  if (!source.probeSourceFile) {
    problems.push(`${label} 缺少 probeSourceFile`);
    return;
  }
  const file = path.resolve(caseDir, source.probeSourceFile);
  const relative = path.relative(caseDir, file);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    problems.push(`${label} probeSourceFile 必须位于 case 内：${source.probeSourceFile}`);
    return;
  }
  if (!exists(file)) {
    problems.push(`${label} probeSourceFile 不存在：${source.probeSourceFile}`);
    return;
  }
  const actual = sha256(fs.readFileSync(file));
  if (actual !== String(source.probeSourceHash || '').toLowerCase()) {
    problems.push(`${label} probeSourceHash 与实际源文件不一致：${source.probeSourceHash || '未记录'} != ${actual}`);
  }
}

function validateProbeProvenance(caseDir, browser, nodeAudit, problems) {
  if (!browser.parseOk || !nodeAudit.parseOk) return;
  if (!browser.probeSuiteVersion) problems.push('浏览器环境 baseline 缺少 probeSuiteVersion');
  if (!nodeAudit.probeSuiteVersion) problems.push('Node 环境 audit 缺少 probeSuiteVersion');
  if (browser.probeSuiteVersion && nodeAudit.probeSuiteVersion
    && browser.probeSuiteVersion !== nodeAudit.probeSuiteVersion) {
    problems.push(`browser/node probeSuiteVersion 不一致：${browser.probeSuiteVersion} != ${nodeAudit.probeSuiteVersion}`);
  }
  if (!browser.probeSourceHash) problems.push('浏览器环境 baseline 缺少 probeSourceHash，无法证明 browser/node 使用同一 probe 源码');
  if (!nodeAudit.probeSourceHash) problems.push('Node 环境 audit 缺少 probeSourceHash，无法证明 browser/node 使用同一 probe 源码');
  if (browser.probeSourceHash && nodeAudit.probeSourceHash
    && browser.probeSourceHash !== nodeAudit.probeSourceHash) {
    problems.push(`browser/node probeSourceHash 不一致：${browser.probeSourceHash} != ${nodeAudit.probeSourceHash}`);
  }
  validateProbeSourceFile(caseDir, browser, '浏览器环境 baseline', problems);
  validateProbeSourceFile(caseDir, nodeAudit, 'Node 环境 audit', problems);
  if (!browser.generatedBy && !browser.capturedBy) {
    problems.push('浏览器环境 baseline 缺少 generatedBy/capturedBy');
  }
}

function compareCategoryRecords(browser, nodeAudit, expectedCategories, problems) {
  for (const category of expectedCategories) {
    const expected = Array.isArray(browser.categoryRecords[category]) ? browser.categoryRecords[category] : [];
    const observed = Array.isArray(nodeAudit.categoryRecords[category]) ? nodeAudit.categoryRecords[category] : [];
    if (!expected.length) {
      problems.push(`浏览器环境 baseline 的 ${category} 类别没有 probe 观测值，空数组不能作为已覆盖`);
      continue;
    }
    if (!observed.length) {
      problems.push(`Node 环境 audit 的 ${category} 类别没有 probe 观测值`);
      continue;
    }
    const observedById = new Map(observed.map((item, index) => [recordId(item, index), item]));
    for (const [index, expectedItem] of expected.entries()) {
      const id = recordId(expectedItem, index);
      const observedItem = observedById.get(id);
      if (!observedItem) {
        problems.push(`Node 环境 audit 缺少 ${category}/${id}`);
        continue;
      }
      const expectedObservation = actualObservation(expectedItem);
      const observedObservation = actualObservation(observedItem);
      if (!expectedObservation.present || !observedObservation.present) continue;
      if (JSON.stringify(expectedObservation.value) !== JSON.stringify(observedObservation.value)) {
        problems.push(`WebAPI 行为不一致：${category}/${id}`);
      }
    }
  }
}

function check(args) {
  const caseDir = args.caseDir ? path.resolve(args.caseDir) : process.cwd();
  const matrixPath = path.resolve(args.matrix || path.join(caseDir, 'notes', 'webapi-env-detection-matrix.md'));
  const browserPath = path.resolve(args.browserBaseline || path.join(caseDir, 'fixtures', 'browser-env-detection-baseline.json'));
  const nodeAuditPath = path.resolve(args.nodeAudit || path.join(caseDir, 'tmp', 'node-env-detection-audit.json'));
  const triggered = scanTriggers(caseDir);
  const problems = [];
  const warnings = [];
  const requireMatrix = args.require || triggered.length > 0;

  if (requireMatrix && !exists(matrixPath)) {
    problems.push(`检测到 WebAPI 环境检测信号，但缺少矩阵：${rel(caseDir, matrixPath)}`);
  }

  const browser = requireMatrix
    ? checkJsonFile(caseDir, browserPath, '浏览器环境 baseline', problems, warnings)
    : {
      exists: exists(browserPath), parseOk: false, baselineId: '', categories: [], categoryRecords: {},
      runtimeSourceHash: '', generatedBy: '', capturedBy: '', probeVersion: '',
      probeSuiteVersion: '', probeSourceHash: '', probeSourceFile: '',
    };
  const nodeAudit = requireMatrix
    ? checkJsonFile(caseDir, nodeAuditPath, 'Node 环境 audit', problems, warnings)
    : {
      exists: exists(nodeAuditPath), parseOk: false, baselineId: '', categories: [], categoryRecords: {},
      runtimeSourceHash: '', generatedBy: '', capturedBy: '', probeVersion: '',
      probeSuiteVersion: '', probeSourceHash: '', probeSourceFile: '',
    };

  const expectedCategories = triggered.length
    ? triggered.map(item => item.id)
    : [...new Set([...browser.categories, ...nodeAudit.categories])];
  if (args.require && !expectedCategories.length) {
    problems.push('要求 WebAPI 行为审计，但未发现触发类别，且 baseline/audit 没有 categories；不得用空矩阵通过');
  }

  let matrix = {
    exists: exists(matrixPath),
    missingCategories: [],
    missingKeywords: [],
    statuses: [],
    blockingStatuses: [],
  };

  if (matrix.exists) {
    const text = readText(matrixPath);
    const requiredKeywords = ['baselineId', '浏览器', 'Node', '状态', '证据'];
    matrix.missingKeywords = requiredKeywords.filter(key => !text.includes(key));
    for (const key of matrix.missingKeywords) problems.push(`矩阵缺少关键字段：${key}`);
    matrix.missingCategories = expectedCategories.filter(id => !text.includes(id));
    for (const id of matrix.missingCategories) problems.push(`矩阵缺少触发类别：${id}`);
    matrix.statuses = extractStatuses(text);
    matrix.blockingStatuses = matrix.statuses.filter(item => BLOCKING_STATUSES.has(item.status));
    for (const item of matrix.blockingStatuses) {
      problems.push(`矩阵存在阻断状态 ${item.status}，数量 ${item.count}`);
    }
    if (args.requireWriterBranch && !text.includes('writer-branch')) {
      problems.push('要求 writer 分支审计，但矩阵缺少 writer-branch');
    }
    if (args.requireWriterBranch && !/reload writer|form writer|final writer|continuation/i.test(text)) {
      problems.push('要求 writer 分支审计，但矩阵缺少 writer 类型证据');
    }
  }

  assertJsonCategoryCoverage(browser, '浏览器环境 baseline', expectedCategories, problems, warnings);
  assertJsonCategoryCoverage(nodeAudit, 'Node 环境 audit', expectedCategories, problems, warnings);
  if (requireMatrix && browser.parseOk && nodeAudit.parseOk) {
    validateProbeProvenance(caseDir, browser, nodeAudit, problems);
    validateObservationRecords(browser, '浏览器环境 baseline', expectedCategories, problems);
    validateObservationRecords(nodeAudit, 'Node 环境 audit', expectedCategories, problems);
    validateRequiredCapabilities(browser, '浏览器环境 baseline', expectedCategories, problems);
    validateRequiredCapabilities(nodeAudit, 'Node 环境 audit', expectedCategories, problems);
    compareCategoryRecords(browser, nodeAudit, expectedCategories, problems);
    if (!nodeAudit.runtimeSourceHash) problems.push('Node 环境 audit 缺少 runtimeSourceHash，代码变化后旧审计不得继续使用');
    if (!nodeAudit.probeVersion) problems.push('Node 环境 audit 缺少 probeVersion');
    if (!/audit|probe|recorder/i.test(nodeAudit.generatedBy)) problems.push(`Node 环境 audit generatedBy 不可信：${nodeAudit.generatedBy || '未记录'}`);
  }

  if (browser.baselineId && nodeAudit.baselineId && browser.baselineId !== nodeAudit.baselineId) {
    problems.push(`浏览器 baselineId 与 Node audit baselineId 不一致：${browser.baselineId} != ${nodeAudit.baselineId}`);
  }

  return {
    caseDir,
    clean: problems.length === 0,
    requireMatrix,
    matrixPath,
    browserPath,
    nodeAuditPath,
    triggered,
    requiredCapabilities: Object.fromEntries(
      expectedCategories
        .filter(category => REQUIRED_CAPABILITIES[category])
        .map(category => [category, REQUIRED_CAPABILITIES[category]]),
    ),
    matrix,
    browser,
    nodeAudit,
    problems,
    warnings,
  };
}

function renderMarkdown(result) {
  const lines = [
    '# WebAPI 环境检测矩阵检查结果',
    '',
    `case 目录：${result.caseDir}`,
    `是否需要矩阵：${result.requireMatrix ? '是' : '否'}`,
    `是否通过：${result.clean ? '是' : '否'}`,
    '',
    '## 文件',
    `- 矩阵：${result.matrixPath}`,
    `- 浏览器 baseline：${result.browserPath}`,
    `- Node audit：${result.nodeAuditPath}`,
    '',
    '## 触发类别',
  ];
  if (result.triggered.length) {
    for (const item of result.triggered) {
      lines.push(`- ${item.id}：${item.count}；证据 ${item.files.join('、') || '未记录'}`);
    }
  } else {
    lines.push('- 未在阶段报告 / notes / tmp / ruyi-trace 中发现明显触发信号。');
  }
  lines.push('', '## Baseline 摘要');
  lines.push(`- 浏览器 baseline：存在=${result.browser.exists ? '是' : '否'}，JSON=${result.browser.parseOk ? '是' : '否'}，baselineId=${result.browser.baselineId || '未记录'}`);
  lines.push(`- Node audit：存在=${result.nodeAudit.exists ? '是' : '否'}，JSON=${result.nodeAudit.parseOk ? '是' : '否'}，baselineId=${result.nodeAudit.baselineId || '未记录'}`);
  if (result.matrix.exists) {
    lines.push('', '## 矩阵摘要');
    lines.push(`- 缺少类别：${result.matrix.missingCategories.join('、') || '无'}`);
    lines.push(`- 缺少关键字段：${result.matrix.missingKeywords.join('、') || '无'}`);
    lines.push(`- 状态：${result.matrix.statuses.map(item => `${item.status}=${item.count}`).join('、') || '未记录'}`);
  }
  if (result.problems.length) {
    lines.push('', '## 问题');
    for (const problem of result.problems) lines.push(`- ${problem}`);
  } else {
    lines.push('', '## 结论', '- WebAPI 环境检测矩阵检查通过。');
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
