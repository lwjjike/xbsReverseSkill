#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const args = {
    caseDir: '',
    requireLive: false,
    tlsClient: '',
    beforeRealRequest: false,
    strictP2: false,
    json: false,
    markdown: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--case-dir' || arg === '--case' || arg === '-d') args.caseDir = argv[++i] || '';
    else if (arg === '--require-live') args.requireLive = true;
    else if (arg === '--tls-client') args.tlsClient = argv[++i] || '';
    else if (arg === '--before-real-request') args.beforeRealRequest = true;
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
  node scripts/check_environment_closure.js --case-dir case --before-real-request --markdown
  node scripts/check_environment_closure.js --case-dir case --before-real-request --require-live --tls-client curl_cffi --json

说明：统一执行 Trace-runtime、WebAPI 行为、对象形状和 XHR/fetch 请求语义闭环。真实请求前必须使用 --before-real-request，任一组件失败都会阻断。`;
}

function exists(file) {
  try { return fs.existsSync(file); } catch { return false; }
}

function stat(file) {
  try { return fs.statSync(file); } catch { return null; }
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
  for (const name of fs.readdirSync(root)) walk(path.join(root, name), out);
  return out;
}

function hasTraceEvidence(caseDir) {
  const fixed = [
    path.join(caseDir, 'ruyi-trace'),
    path.join(caseDir, 'tmp', 'env-trace.jsonl'),
    path.join(caseDir, 'tmp', 'missing-env.json'),
    path.join(caseDir, 'notes', 'trace-api-inventory.json'),
    path.join(caseDir, 'notes', 'trace-runtime-contract.json'),
  ];
  if (fixed.some(exists)) return true;
  return walk(caseDir).some(file => {
    const relative = (path.relative(caseDir, file) || '.').replace(/\\/g, '/');
    if (/(^|\/)(node_modules|dist|build|coverage|vendor)(\/|$)/i.test(relative)) return false;
    return /(?:^|\/)(?:trace|ruyitrace|missing-env)[^/]*\.(?:json|jsonl|ndjson|log|txt)$/i.test(relative);
  });
}

function evidenceFiles(caseDir) {
  const roots = ['阶段报告', 'notes', 'tmp', 'fixtures', 'ruyi-trace', 'result'];
  const files = [];
  for (const root of roots) {
    for (const file of walk(path.join(caseDir, root))) {
      const relative = (path.relative(caseDir, file) || '.').replace(/\\/g, '/');
      if (/(^|\/)(node_modules|dist|build|coverage|vendor|third_party|third-party)(\/|$)/i.test(relative)) continue;
      if (!/\.(?:md|txt|log|json|jsonl|ndjson|js|mjs|cjs|ts|py|html)$/i.test(file)) continue;
      files.push(file);
      if (files.length >= 2000) return files;
    }
  }
  return files;
}

function scanCaseEvidence(caseDir) {
  const resultDir = path.join(caseDir, 'result');
  let hasBrowserEnv = false;
  let hasNetworkImpl = false;
  let networkEvidence = false;
  let webapiEvidence = false;
  let realmLifecycleEvidence = false;
  let domCrudEvidence = false;
  let objectShapeEvidence = false;
  const hits = {
    network: [],
    webapi: [],
    realmLifecycle: [],
    domCrud: [],
    objectShape: [],
  };
  const recordHit = (type, file) => {
    const relative = (path.relative(caseDir, file) || '.').replace(/\\/g, '/');
    if (hits[type].length < 8 && !hits[type].includes(relative)) hits[type].push(relative);
  };
  for (const file of evidenceFiles(caseDir)) {
    let text = '';
    try { text = fs.readFileSync(file, 'utf8').slice(0, 300000); } catch { continue; }
    const relative = (path.relative(caseDir, file) || '.').replace(/\\/g, '/');
    const inResult = relative.startsWith('result/');
    if (/\b(XMLHttpRequest|fetch|sendBeacon|Request|Response|Headers)\b|network-transcript|xhr-fetch/i.test(text)
      || /(?:browser|node)-network-transcript\.(?:json|ndjson)$/i.test(relative)) {
      networkEvidence = true;
      recordHit('network', file);
      if (inResult && /\.(?:js|mjs|cjs|ts|py)$/i.test(file)) hasNetworkImpl = true;
    }
    if (/\b(window|document|navigator|EventTarget|Storage|Performance|Element|Node)\b/.test(text)
      || /(?:browser|node)-env-detection-(?:baseline|audit)\.json$/i.test(relative)) {
      webapiEvidence = true;
      recordHit('webapi', file);
      if (inResult && /\.(?:js|mjs|cjs|ts|py)$/i.test(file)) hasBrowserEnv = true;
    }
    if (/iframe|contentWindow|contentDocument|defaultView|\bWorker\b|WorkerGlobalScope|MessageChannel|MessagePort|postMessage|terminate/i.test(text)) {
      realmLifecycleEvidence = true;
      webapiEvidence = true;
      recordHit('realmLifecycle', file);
      recordHit('webapi', file);
    }
    if (/appendChild|removeChild|insertBefore|replaceChild|replaceChildren|cloneNode|importNode|adoptNode|innerHTML|DOMParser|querySelector|MutationObserver|childNodes|getElementsBy/i.test(text)) {
      domCrudEvidence = true;
      webapiEvidence = true;
      recordHit('domCrud', file);
      recordHit('webapi', file);
    }
    if (/Object\.keys|Object\.getOwnPropertyNames|Object\.getOwnPropertyDescriptor|Reflect\.ownKeys|prototypeChain|ownKeys|private-state-leakage/i.test(text)) {
      objectShapeEvidence = true;
      recordHit('objectShape', file);
    }
  }
  for (const file of walk(resultDir)) {
    if (!/\.(js|mjs|cjs|ts|py)$/i.test(file)) continue;
    const relative = (path.relative(resultDir, file) || '.').replace(/\\/g, '/');
    if (/(^|\/)(node_modules|dist|build|coverage)(\/|$)/i.test(relative)) continue;
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    if (/(^|\/)src\/(?:env|node-runtime\/env)\//i.test(relative)
      || /\b(window|document|navigator|EventTarget|Storage|Performance|Element|Node)\b/.test(text)) {
      hasBrowserEnv = true;
    }
    if (/\b(XMLHttpRequest|fetch|sendBeacon|Request|Response|Headers)\b/.test(text)) hasNetworkImpl = true;
  }
  return {
    resultDir,
    hasBrowserEnv,
    hasNetworkImpl,
    networkEvidence,
    webapiEvidence,
    realmLifecycleEvidence,
    domCrudEvidence,
    objectShapeEvidence,
    hits,
  };
}

function collectMetrics(value, out = {}, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 6) return out;
  const keys = new Set([
    'baselineId',
    'traceSourceHash',
    'contractHash',
    'runtimeSourceHash',
    'blockingMismatches',
    'mismatched',
    'networkMismatches',
    'extraNodeRequests',
    'extraNodeEvents',
    'networkAttempts',
    'sameSessionVerified',
    'roundTripCount',
  ]);
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 50)) collectMetrics(item, out, depth + 1);
    return out;
  }
  for (const [key, item] of Object.entries(value)) {
    if (keys.has(key) && item !== '' && item !== null && typeof item !== 'undefined') {
      if (!out[key]) out[key] = [];
      const encoded = typeof item === 'object' ? JSON.stringify(item) : String(item);
      if (!out[key].includes(encoded) && out[key].length < 10) out[key].push(encoded);
    }
    if (item && typeof item === 'object') collectMetrics(item, out, depth + 1);
  }
  return out;
}

function summarizeComponentData(data) {
  if (!data || typeof data !== 'object') return data;
  return {
    schemaVersion: data.schemaVersion || '',
    clean: data.clean,
    passed: data.passed,
    metrics: collectMetrics(data),
    summary: data.summary && typeof data.summary === 'object' ? data.summary : undefined,
    problems: Array.isArray(data.problems) ? data.problems.slice(0, 20) : [],
    warnings: Array.isArray(data.warnings) ? data.warnings.slice(0, 10) : [],
  };
}

function runJson(scriptDir, script, args) {
  const command = [path.join(scriptDir, script), ...args, '--json'];
  const ret = spawnSync(process.execPath, command, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 180000,
  });
  let rawData = null;
  try { rawData = JSON.parse(String(ret.stdout || '').trim()); } catch {}
  return {
    script,
    exitCode: ret.status,
    clean: ret.status === 0 && rawData && rawData.clean !== false && rawData.passed !== false,
    data: summarizeComponentData(rawData),
    stderr: String(ret.stderr || '').trim().slice(0, 2000),
    stdoutPreview: rawData ? '' : String(ret.stdout || '').trim().slice(0, 2000),
  };
}

function check(args) {
  const caseDir = path.resolve(args.caseDir || '.');
  const scriptDir = __dirname;
  const signals = scanCaseEvidence(caseDir);
  const trace = hasTraceEvidence(caseDir);
  const components = [];

  if (trace) {
    const traceArgs = ['--case-dir', caseDir, '--require-runtime-closure'];
    if (args.beforeRealRequest) traceArgs.push('--require-stage-audit');
    components.push(runJson(scriptDir, 'check_trace_api_coverage.js', traceArgs));
  }
  if (signals.hasBrowserEnv
    || signals.webapiEvidence
    || signals.objectShapeEvidence
    || trace
    || args.beforeRealRequest) {
    components.push(runJson(scriptDir, 'check_object_shape_audit.js', ['--case-dir', caseDir, '--require']));
    components.push(runJson(scriptDir, 'check_webapi_env_detection_matrix.js', ['--case-dir', caseDir, '--require']));
  }
  if (signals.hasBrowserEnv || signals.hasNetworkImpl || signals.webapiEvidence || args.beforeRealRequest) {
    components.push(runJson(scriptDir, 'check_code_quality.js', ['--case-dir', caseDir]));
  }
  if (signals.hasBrowserEnv || signals.hasNetworkImpl || signals.webapiEvidence) {
    components.push(runJson(scriptDir, 'check_webapi_addon_coverage.js', ['--case-dir', caseDir, '--warnings-as-errors']));
  }
  if (signals.hasNetworkImpl || signals.networkEvidence || args.requireLive) {
    const semanticsArgs = ['--case-dir', caseDir, '--require', '--require-no-send', '--out', path.join(caseDir, 'tmp', 'xhr-fetch-semantics-audit.json')];
    components.push(runJson(scriptDir, 'check_xhr_fetch_semantics.js', semanticsArgs));
    const bridgeArgs = ['--case-dir', caseDir];
    if (args.requireLive || args.beforeRealRequest) bridgeArgs.push('--require-live');
    if (args.tlsClient) bridgeArgs.push('--tls-client', args.tlsClient);
    components.push(runJson(scriptDir, 'check_xhr_fetch_session_bridge.js', bridgeArgs));
  }

  const problems = [];
  for (const component of components) {
    if (!component.clean) {
      const detail = component.data && Array.isArray(component.data.problems)
        ? component.data.problems.slice(0, 20).join('；')
        : (component.stderr || component.stdoutPreview || `exit=${component.exitCode}`);
      problems.push(`${component.script} 未通过：${detail}`);
    }
  }
  if (args.beforeRealRequest && !components.length) problems.push('真实请求前没有触发任何环境闭环组件，说明 case 结构或检测信号缺失');
  return {
    schemaVersion: 'environment-closure/v3',
    generatedBy: 'check_environment_closure.js',
    caseDir,
    clean: problems.length === 0,
    beforeRealRequest: args.beforeRealRequest,
    requireLive: args.requireLive,
    tlsClient: args.tlsClient || '',
    signals: {
      trace,
      browserEnv: signals.hasBrowserEnv,
      networkImpl: signals.hasNetworkImpl,
      networkEvidence: signals.networkEvidence,
      webapiEvidence: signals.webapiEvidence,
      realmLifecycleEvidence: signals.realmLifecycleEvidence,
      domCrudEvidence: signals.domCrudEvidence,
      objectShapeEvidence: signals.objectShapeEvidence,
      evidenceFiles: signals.hits,
    },
    components,
    problems,
  };
}

function renderMarkdown(result) {
  const lines = [
    '# 补环境闭环总门禁',
    '',
    `- case：${result.caseDir}`,
    `- 真实请求前模式：${result.beforeRealRequest ? '是' : '否'}`,
    `- 要求 live session：${result.requireLive ? '是' : '否'}`,
    `- TLS 客户端：${result.tlsClient || '未指定'}`,
    `- 是否通过：${result.clean ? '是' : '否'}`,
    '',
    '## 检测信号',
    `- Trace：${result.signals.trace ? '是' : '否'}`,
    `- 浏览器环境实现：${result.signals.browserEnv ? '是' : '否'}`,
    `- XHR/fetch 实现：${result.signals.networkImpl ? '是' : '否'}`,
    `- 网络证据：${result.signals.networkEvidence ? '是' : '否'}`,
    `- Realm / 消息生命周期证据：${result.signals.realmLifecycleEvidence ? '是' : '否'}`,
    `- DOM CRUD 证据：${result.signals.domCrudEvidence ? '是' : '否'}`,
    '',
    '## 组件',
  ];
  if (!result.components.length) lines.push('- 无');
  for (const component of result.components) {
    lines.push(`- ${component.script}：${component.clean ? '通过' : '失败'}，exit=${component.exitCode}`);
    const metrics = component.data && component.data.metrics ? component.data.metrics : {};
    const metricText = Object.entries(metrics)
      .map(([key, values]) => `${key}=${values.join('|')}`)
      .join('；');
    if (metricText) lines.push(`  ${metricText}`);
  }
  if (result.problems.length) {
    lines.push('', '## 阻断问题');
    for (const problem of result.problems) lines.push(`- ${problem}`);
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

module.exports = { check };
