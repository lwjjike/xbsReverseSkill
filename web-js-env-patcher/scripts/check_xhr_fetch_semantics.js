#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REQUEST_FIELDS = [
  'actor',
  'realmId',
  'navigationEpoch',
  'method',
  'url',
  'credentials',
  'referrer',
  'contentType',
  'bodyLength',
  'bodySha256',
];

const RESPONSE_FIELDS = ['status', 'statusText', 'responseURL', 'responseType', 'bodyLength', 'bodySha256'];

function parseArgs(argv) {
  const args = {
    caseDir: '',
    browser: '',
    node: '',
    out: '',
    require: false,
    requireNoSend: false,
    json: false,
    markdown: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--case-dir' || arg === '--case' || arg === '-d') args.caseDir = argv[++i] || '';
    else if (arg === '--browser') args.browser = argv[++i] || '';
    else if (arg === '--node') args.node = argv[++i] || '';
    else if (arg === '--out') args.out = argv[++i] || '';
    else if (arg === '--require') args.require = true;
    else if (arg === '--require-no-send') args.requireNoSend = true;
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
  node scripts/check_xhr_fetch_semantics.js --case-dir case --require --require-no-send --markdown
  node scripts/check_xhr_fetch_semantics.js --browser case/fixtures/browser-network-transcript.ndjson --node case/tmp/node-network-transcript.ndjson --out case/tmp/xhr-fetch-semantics-audit.json --json

说明：逐条比较浏览器与 Node 的 XHR/fetch/navigation transcript，包括请求来源、URL、Header 顺序、body 字节摘要、status=0、responseURL、事件顺序和 reload realm 生命周期。`;
}

function exists(file) {
  try { return fs.existsSync(file); } catch { return false; }
}

function parseTranscript(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  if (/\.json$/i.test(file)) {
    const raw = JSON.parse(text);
    return {
      meta: raw.meta || raw.metadata || raw,
      events: Array.isArray(raw.events) ? raw.events : (Array.isArray(raw.items) ? raw.items : (Array.isArray(raw) ? raw : [])),
    };
  }
  const events = [];
  let meta = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.type === 'meta' || event.event === 'meta') meta = { ...meta, ...event };
    else events.push(event);
  }
  return { meta, events };
}

function normalizeHeaders(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(item => {
      if (Array.isArray(item)) return [String(item[0] || '').toLowerCase(), String(item[1] || '')];
      return [String(item.name || item.key || '').toLowerCase(), String(item.value || '')];
    });
  }
  return Object.entries(value).map(([name, headerValue]) => [String(name).toLowerCase(), String(headerValue)]);
}

function normalizeEvent(event, index) {
  const body = event.body && typeof event.body === 'object' ? event.body : {};
  return {
    id: String(event.id || event.requestId || event.correlationId || index),
    pairKey: String(event.pairKey || event.requestKey || event.logicalId || event.id || event.requestId || index),
    kind: String(event.kind || event.event || event.type || '').toLowerCase(),
    actor: String(event.actor || event.initiator || event.api || '').toLowerCase(),
    realmId: String(event.realmId || event.realm || 'main'),
    navigationEpoch: Number(event.navigationEpoch || event.epoch || 0),
    taskId: String(event.taskId || ''),
    method: String(event.method || '').toUpperCase(),
    url: String(event.url || event.requestURL || ''),
    credentials: String(event.credentials || ''),
    referrer: String(event.referrer || ''),
    contentType: String(event.contentType || body.contentType || ''),
    bodyLength: Number(event.bodyLength ?? body.length ?? body.byteLength ?? 0),
    bodySha256: String(event.bodySha256 || body.sha256 || ''),
    headers: normalizeHeaders(event.headers || event.requestHeaders),
    responseHeaders: normalizeHeaders(event.responseHeaders),
    status: Number(event.status ?? 0),
    statusText: String(event.statusText || ''),
    responseURL: String(event.responseURL || ''),
    responseType: String(event.responseType || ''),
    lifecycle: Array.isArray(event.lifecycle) ? event.lifecycle.map(String) : [],
    validRealm: event.validRealm !== false,
    cancelledReason: String(event.cancelledReason || event.cancelReason || ''),
    sessionId: String(event.sessionId || ''),
    sequence: Number(event.sequence || event.seq || index),
  };
}

function eventClass(kind) {
  if (/request|send|open/.test(kind)) return 'request';
  if (/response|complete|loadend/.test(kind)) return 'response';
  if (/realm-destroyed|navigation-commit|reload/.test(kind)) return 'lifecycle';
  return kind || 'unknown';
}

function compareField(expected, observed, field, diffs) {
  if (typeof expected[field] === 'undefined' || expected[field] === '') return;
  if (expected[field] !== observed[field]) diffs.push({ field, expected: expected[field], observed: observed[field] });
}

function compareHeaders(expected, observed, diffs) {
  if (!expected.headers.length) return;
  const left = JSON.stringify(expected.headers);
  const right = JSON.stringify(observed.headers);
  if (left !== right) diffs.push({ field: 'headers', expected: expected.headers, observed: observed.headers });
}

function compareLifecycle(expected, observed, diffs) {
  if (!expected.lifecycle.length) return;
  if (JSON.stringify(expected.lifecycle) !== JSON.stringify(observed.lifecycle)) {
    diffs.push({ field: 'lifecycle', expected: expected.lifecycle, observed: observed.lifecycle });
  }
}

function eventKey(event) {
  return [eventClass(event.kind), event.pairKey].join(':');
}

function hardInvariants(events) {
  const problems = [];
  const destroyedRealms = new Map();
  for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
    if (/realm-destroyed|navigation-commit|reload-commit/.test(event.kind)) {
      destroyedRealms.set(`${event.realmId}:${event.navigationEpoch}`, event.sequence);
      continue;
    }
    if (event.status === 0 && event.responseURL !== '') {
      problems.push(`${event.pairKey}：status=0 时 responseURL 必须为空，当前为 ${event.responseURL}`);
    }
    if ((event.actor === 'xhr' || event.actor === 'xmlhttprequest') && /navigation|reload/.test(event.kind)) {
      problems.push(`${event.pairKey}：document navigation/reload 被错误归类为 XHR`);
    }
    const destroyedAt = destroyedRealms.get(`${event.realmId}:${event.navigationEpoch}`);
    if (destroyedAt && event.sequence > destroyedAt && !event.cancelledReason) {
      problems.push(`${event.pairKey}：旧 realm ${event.realmId}/${event.navigationEpoch} 销毁后仍产生未取消的 timer/XHR/task`);
    }
    if (event.validRealm === false && !event.cancelledReason) {
      problems.push(`${event.pairKey}：失效 realm 的事件缺少取消原因`);
    }
  }
  return problems;
}

function check(args) {
  const caseDir = path.resolve(args.caseDir || '.');
  const browserPath = path.resolve(args.browser || path.join(caseDir, 'fixtures', 'browser-network-transcript.ndjson'));
  const nodePath = path.resolve(args.node || path.join(caseDir, 'tmp', 'node-network-transcript.ndjson'));
  const problems = [];
  const warnings = [];
  if ((args.require || exists(browserPath) || exists(nodePath)) && !exists(browserPath)) problems.push(`缺少浏览器 network transcript：${browserPath}`);
  if ((args.require || exists(browserPath) || exists(nodePath)) && !exists(nodePath)) problems.push(`缺少 Node network transcript：${nodePath}`);
  if (problems.length) return { schemaVersion: 'xhr-fetch-semantics-audit/v2', generatedBy: 'check_xhr_fetch_semantics.js', clean: false, caseDir, browserPath, nodePath, problems, warnings, results: [], summary: {} };

  if (!exists(browserPath) && !exists(nodePath)) {
    return { schemaVersion: 'xhr-fetch-semantics-audit/v2', generatedBy: 'check_xhr_fetch_semantics.js', clean: true, caseDir, browserPath, nodePath, problems, warnings: ['未触发 network transcript 审计'], results: [], summary: {} };
  }

  let browserRaw;
  let nodeRaw;
  try { browserRaw = parseTranscript(browserPath); } catch (err) { problems.push(`浏览器 transcript 无法解析：${err.message}`); }
  try { nodeRaw = parseTranscript(nodePath); } catch (err) { problems.push(`Node transcript 无法解析：${err.message}`); }
  if (!browserRaw || !nodeRaw) return { schemaVersion: 'xhr-fetch-semantics-audit/v2', generatedBy: 'check_xhr_fetch_semantics.js', clean: false, caseDir, browserPath, nodePath, problems, warnings, results: [], summary: {} };

  if (browserRaw.meta.baselineId && nodeRaw.meta.baselineId !== browserRaw.meta.baselineId) {
    problems.push(`network transcript baselineId 不一致：${browserRaw.meta.baselineId} != ${nodeRaw.meta.baselineId || '未记录'}`);
  }
  if (args.requireNoSend && nodeRaw.meta.mode !== 'no-send' && nodeRaw.meta.networkMode !== 'no-send') {
    problems.push(`Node network transcript 必须来自 no-send 模式，当前为：${nodeRaw.meta.mode || nodeRaw.meta.networkMode || '未记录'}`);
  }
  if (!nodeRaw.meta.runtimeSourceHash) problems.push('Node network transcript 缺少 runtimeSourceHash');
  if (!nodeRaw.meta.generatedBy) problems.push('Node network transcript 缺少 generatedBy');

  const browserEvents = browserRaw.events.map(normalizeEvent);
  const nodeEvents = nodeRaw.events.map(normalizeEvent);
  for (const invariant of hardInvariants(nodeEvents)) problems.push(invariant);

  const nodeByKey = new Map();
  for (const event of nodeEvents) {
    const key = eventKey(event);
    if (!nodeByKey.has(key)) nodeByKey.set(key, []);
    nodeByKey.get(key).push(event);
  }
  const results = [];
  for (const expected of browserEvents) {
    const key = eventKey(expected);
    const queue = nodeByKey.get(key) || [];
    const observed = queue.shift();
    if (!observed) {
      results.push({ key, clean: false, diffs: [{ field: '*', expected: 'browser event', observed: 'missing' }] });
      problems.push(`${key}：Node transcript 缺少对应事件`);
      continue;
    }
    const diffs = [];
    const fields = eventClass(expected.kind) === 'response' ? RESPONSE_FIELDS : REQUEST_FIELDS;
    for (const field of fields) compareField(expected, observed, field, diffs);
    if (eventClass(expected.kind) === 'request') compareHeaders(expected, observed, diffs);
    compareLifecycle(expected, observed, diffs);
    if (expected.sessionId && observed.sessionId !== expected.sessionId) {
      diffs.push({ field: 'sessionId', expected: expected.sessionId, observed: observed.sessionId });
    }
    if (diffs.length) problems.push(`${key}：${diffs.map(diff => diff.field).join('、')} 不一致`);
    results.push({ key, clean: diffs.length === 0, diffs });
  }
  const extra = [...nodeByKey.values()].flat();
  if (extra.length) {
    problems.push(`Node transcript 比浏览器多出 ${extra.length} 个事件，可能存在伪 XHR、错误 reload 或多余资源请求`);
  }
  const sessionIds = [...new Set(nodeEvents.map(event => event.sessionId).filter(Boolean))];
  if (sessionIds.length > 1) problems.push(`Node transcript 使用了多个 sessionId：${sessionIds.join('、')}`);

  const summary = {
    browserEvents: browserEvents.length,
    nodeEvents: nodeEvents.length,
    matched: results.filter(item => item.clean).length,
    mismatched: results.filter(item => !item.clean).length,
    extraNodeEvents: extra.length,
    sessionIds,
    baselineId: browserRaw.meta.baselineId || nodeRaw.meta.baselineId || '',
    runtimeSourceHash: nodeRaw.meta.runtimeSourceHash || '',
    networkMode: nodeRaw.meta.mode || nodeRaw.meta.networkMode || '',
  };
  return { schemaVersion: 'xhr-fetch-semantics-audit/v2', generatedBy: 'check_xhr_fetch_semantics.js', clean: problems.length === 0, caseDir, browserPath, nodePath, problems, warnings, results, summary };
}

function renderMarkdown(result) {
  const lines = [
    '# XHR/fetch 请求语义审计结果',
    '',
    `- 浏览器 transcript：${result.browserPath}`,
    `- Node transcript：${result.nodePath}`,
    `- 是否通过：${result.clean ? '是' : '否'}`,
  ];
  if (result.summary && typeof result.summary.browserEvents !== 'undefined') {
    lines.push(`- 浏览器事件：${result.summary.browserEvents}`);
    lines.push(`- Node 事件：${result.summary.nodeEvents}`);
    lines.push(`- matched：${result.summary.matched}`);
    lines.push(`- mismatch：${result.summary.mismatched}`);
    lines.push(`- Node 多余事件：${result.summary.extraNodeEvents}`);
    lines.push(`- sessionId：${result.summary.sessionIds.join('、') || '未记录'}`);
  }
  const bad = result.results.filter(item => !item.clean);
  if (bad.length) {
    lines.push('', '## 逐项差异');
    for (const item of bad.slice(0, 100)) lines.push(`- ${item.key}：${item.diffs.map(diff => diff.field).join('、')}`);
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
    if (args.out) {
      const out = path.resolve(args.out);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    }
    if (args.json) console.log(JSON.stringify(result, null, 2));
    if (args.markdown) process.stdout.write(renderMarkdown(result));
    process.exit(result.clean ? 0 : 1);
  } catch (err) {
    console.error(err.message || String(err));
    console.error(usage());
    process.exit(1);
  }
}

module.exports = { check, normalizeEvent, hardInvariants };
