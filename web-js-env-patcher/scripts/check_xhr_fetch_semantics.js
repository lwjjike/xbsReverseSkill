#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const AUDIT_SCHEMA = 'xhr-fetch-semantics-audit/v3';
const TRANSCRIPT_SCHEMA = 'network-transcript/v3';
const SHA256_RE = /^[a-f0-9]{64}$/i;

const COMMON_FIELDS = ['actor', 'realmId', 'navigationEpoch', 'sessionId'];
const REQUEST_FIELDS = ['method', 'url', 'credentials', 'referrer'];
const RESPONSE_FIELDS = [
  'status',
  'statusText',
  'responseURL',
  'responseType',
  'bodyLength',
  'bodySha256',
];
const OPTIONAL_REQUEST_FIELDS = [
  'taskId',
  'origin',
  'cookiePolicy',
  'bodyType',
  'redirect',
  'cache',
  'timeout',
  'withCredentials',
  'async',
];

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

说明：先验证 browser/Node transcript 是否包含完整的真实观测字段，再逐事件比较 XHR/fetch/navigation 的请求、响应、Header 顺序、body 摘要、Session 与生命周期。缺失字段不会被默认值掩盖。`;
}

function exists(file) {
  try { return fs.existsSync(file); } catch { return false; }
}

function hasOwn(value, key) {
  return Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
}

function firstOwn(value, keys) {
  for (const key of keys) {
    if (hasOwn(value, key)) return { present: true, key, value: value[key] };
  }
  return { present: false, key: '', value: undefined };
}

function parseTranscript(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  if (/\.json$/i.test(file)) {
    const raw = JSON.parse(text);
    return {
      meta: raw.meta || raw.metadata || (Array.isArray(raw) ? {} : raw),
      events: Array.isArray(raw.events)
        ? raw.events
        : (Array.isArray(raw.items) ? raw.items : (Array.isArray(raw) ? raw : [])),
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

function sha256Text(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function normalizeHeaderValue(value) {
  if (typeof value === 'string') {
    return {
      sha256: sha256Text(value),
      length: Buffer.byteLength(value, 'utf8'),
      redacted: false,
    };
  }
  if (value && typeof value === 'object') {
    return {
      sha256: String(value.sha256 || '').toLowerCase(),
      length: Number(value.length),
      redacted: value.redacted === true,
    };
  }
  return {
    sha256: '',
    length: Number.NaN,
    redacted: false,
  };
}

function headerEntryParts(item) {
  if (Array.isArray(item)) return { name: item[0], value: item[1] };
  if (item && typeof item === 'object') {
    return {
      name: hasOwn(item, 'name') ? item.name : item.key,
      value: item.value,
    };
  }
  return { name: undefined, value: undefined };
}

function validateAndNormalizeHeaders(value, label, problems, options = {}) {
  if (!Array.isArray(value)) {
    problems.push(`${label} 必须是保留顺序与重复字段的 Header 数组`);
    return [];
  }
  if (options.requireNonEmpty && value.length === 0) {
    problems.push(`${label} 不能为空；完整 network transcript 必须记录实际发送的 Header`);
  }
  const normalized = [];
  for (const [index, item] of value.entries()) {
    const parts = headerEntryParts(item);
    const name = typeof parts.name === 'string' ? parts.name.trim().toLowerCase() : '';
    if (!name) problems.push(`${label}[${index}] 缺少 Header 名称`);
    const headerValue = normalizeHeaderValue(parts.value);
    if (typeof parts.value === 'string') {
      if (parts.value.length === 0) {
        problems.push(`${label}[${index}] ${name || '<unknown>'} 的值为空；应记录真实值或脱敏摘要`);
      }
    } else if (parts.value && typeof parts.value === 'object') {
      if (parts.value.redacted !== true
        || !SHA256_RE.test(String(parts.value.sha256 || ''))
        || !Number.isInteger(Number(parts.value.length))
        || Number(parts.value.length) < 0) {
        problems.push(`${label}[${index}] ${name || '<unknown>'} 的脱敏值必须包含 redacted=true、length 和 SHA-256`);
      }
    } else {
      problems.push(`${label}[${index}] ${name || '<unknown>'} 缺少 Header 值`);
    }
    normalized.push([name, headerValue]);
  }
  return normalized;
}

function kindValue(event) {
  return String(firstOwn(event, ['kind', 'event', 'type']).value || '').toLowerCase();
}

function eventClass(kind) {
  if (/^(request|send|network-request)$/.test(kind) || /-request$/.test(kind)) return 'request';
  if (/^(response|complete|loadend|network-response)$/.test(kind) || /-response$/.test(kind)) return 'response';
  if (/realm-destroyed|navigation|reload|pagehide|unload|lifecycle/.test(kind)) return 'lifecycle';
  return 'unknown';
}

function normalizeActor(actor) {
  const value = String(actor || '').toLowerCase();
  return value === 'xmlhttprequest' ? 'xhr' : value;
}

function normalizeEvent(event, index, normalizedHeaders = {}) {
  const body = event.body && typeof event.body === 'object' ? event.body : {};
  const navigationEpoch = firstOwn(event, ['navigationEpoch', 'epoch']);
  const sequence = firstOwn(event, ['sequence', 'seq']);
  return {
    index,
    pairKey: String(firstOwn(event, ['pairKey', 'requestKey', 'logicalId']).value || ''),
    kind: kindValue(event),
    actor: normalizeActor(firstOwn(event, ['actor', 'initiator', 'api']).value),
    realmId: String(firstOwn(event, ['realmId', 'realm']).value || ''),
    navigationEpoch: Number(navigationEpoch.value),
    taskId: String(event.taskId || ''),
    method: String(event.method || '').toUpperCase(),
    url: String(firstOwn(event, ['url', 'requestURL']).value || ''),
    credentials: String(event.credentials || ''),
    referrer: String(event.referrer || ''),
    origin: String(event.origin || ''),
    cookiePolicy: String(event.cookiePolicy || ''),
    bodyType: String(event.bodyType || body.type || ''),
    contentType: String(event.contentType || body.contentType || ''),
    bodyLength: Number(firstOwn(event, ['bodyLength']).present ? event.bodyLength : (body.length ?? body.byteLength)),
    bodySha256: String(event.bodySha256 || body.sha256 || '').toLowerCase(),
    headers: normalizedHeaders.headers || [],
    responseHeaders: normalizedHeaders.responseHeaders || [],
    status: Number(event.status),
    statusText: String(hasOwn(event, 'statusText') ? event.statusText : ''),
    responseURL: String(hasOwn(event, 'responseURL') ? event.responseURL : ''),
    responseType: String(hasOwn(event, 'responseType') ? event.responseType : ''),
    lifecycle: Array.isArray(event.lifecycle) ? event.lifecycle.map(String) : [],
    validRealm: event.validRealm !== false,
    cancelledReason: String(event.cancelledReason || event.cancelReason || ''),
    sessionId: String(event.sessionId || ''),
    sequence: Number(sequence.value),
    redirect: event.redirect,
    cache: event.cache,
    timeout: event.timeout,
    withCredentials: event.withCredentials,
    async: event.async,
  };
}

function requireField(event, aliases, label, problems, options = {}) {
  const found = firstOwn(event, aliases);
  if (!found.present) {
    problems.push(`${label} 缺少 ${aliases[0]}`);
    return undefined;
  }
  if (options.nonEmpty && String(found.value || '') === '') {
    problems.push(`${label} 的 ${aliases[0]} 不能为空`);
  }
  return found.value;
}

function validateSha256(value, label, problems) {
  if (!SHA256_RE.test(String(value || ''))) problems.push(`${label} 必须是完整 SHA-256`);
}

function validateLength(value, label, problems) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) problems.push(`${label} 必须是非负整数`);
}

function requestHasBody(event) {
  const method = String(event.method || '').toUpperCase();
  const body = event.body && typeof event.body === 'object' ? event.body : {};
  return /^(POST|PUT|PATCH)$/.test(method)
    || hasOwn(event, 'bodyLength')
    || hasOwn(event, 'bodySha256')
    || hasOwn(event, 'contentType')
    || Object.keys(body).length > 0;
}

function validateEvent(event, index, sourceLabel, problems) {
  const label = `${sourceLabel} event[${index}]`;
  const problemStart = problems.length;
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    problems.push(`${label} 必须是对象`);
    const normalized = normalizeEvent({}, index);
    normalized.validationProblems = problems.slice(problemStart);
    return normalized;
  }
  const kind = requireField(event, ['kind', 'event'], label, problems, { nonEmpty: true });
  const cls = eventClass(String(kind || '').toLowerCase());
  if (cls === 'unknown') problems.push(`${label} 的 kind 无法归类为 request/response/lifecycle`);
  requireField(event, ['pairKey', 'requestKey', 'logicalId'], label, problems, { nonEmpty: true });
  requireField(event, ['actor', 'initiator', 'api'], label, problems, { nonEmpty: true });
  requireField(event, ['realmId', 'realm'], label, problems, { nonEmpty: true });
  const epoch = requireField(event, ['navigationEpoch', 'epoch'], label, problems);
  if (!Number.isInteger(Number(epoch)) || Number(epoch) < 0) problems.push(`${label} 的 navigationEpoch 必须是非负整数`);
  const sequence = requireField(event, ['sequence', 'seq'], label, problems);
  if (!Number.isFinite(Number(sequence))) problems.push(`${label} 的 sequence 必须是数字`);
  requireField(event, ['sessionId'], label, problems, { nonEmpty: true });

  const normalizedHeaders = {};
  if (cls === 'request') {
    requireField(event, ['method'], label, problems, { nonEmpty: true });
    requireField(event, ['url', 'requestURL'], label, problems, { nonEmpty: true });
    requireField(event, ['credentials'], label, problems, { nonEmpty: true });
    requireField(event, ['referrer'], label, problems);
    const headers = requireField(event, ['headers', 'requestHeaders'], label, problems);
    normalizedHeaders.headers = validateAndNormalizeHeaders(
      headers,
      `${label}.headers`,
      problems,
      { requireNonEmpty: true },
    );
    if (requestHasBody(event)) {
      const bodyLength = requireField(event, ['bodyLength'], label, problems);
      const bodySha256 = requireField(event, ['bodySha256'], label, problems);
      const contentType = requireField(event, ['contentType'], label, problems);
      validateLength(bodyLength, `${label}.bodyLength`, problems);
      validateSha256(bodySha256, `${label}.bodySha256`, problems);
      if (Number(bodyLength) > 0 && String(contentType || '') === '') {
        problems.push(`${label} 有请求体但 contentType 为空`);
      }
    }
  } else if (cls === 'response') {
    const status = requireField(event, ['status'], label, problems);
    requireField(event, ['statusText'], label, problems);
    const responseURL = requireField(event, ['responseURL'], label, problems);
    requireField(event, ['responseType'], label, problems);
    const bodyLength = requireField(event, ['bodyLength'], label, problems);
    const bodySha256 = requireField(event, ['bodySha256'], label, problems);
    const responseHeaders = requireField(event, ['responseHeaders'], label, problems);
    const lifecycle = requireField(event, ['lifecycle'], label, problems);
    if (!Number.isInteger(Number(status)) || Number(status) < 0 || Number(status) > 599) {
      problems.push(`${label}.status 必须是 0 到 599 的整数`);
    }
    if (Number(status) > 0 && String(responseURL || '') === '') {
      problems.push(`${label} status>0 时必须记录最终 responseURL`);
    }
    validateLength(bodyLength, `${label}.bodyLength`, problems);
    validateSha256(bodySha256, `${label}.bodySha256`, problems);
    normalizedHeaders.responseHeaders = validateAndNormalizeHeaders(
      responseHeaders,
      `${label}.responseHeaders`,
      problems,
    );
    if (!Array.isArray(lifecycle) || lifecycle.length === 0) {
      problems.push(`${label}.lifecycle 必须记录 readyState/event/Promise 顺序`);
    }
  } else if (cls === 'lifecycle') {
    const lifecycle = requireField(event, ['lifecycle'], label, problems);
    if (!Array.isArray(lifecycle) || lifecycle.length === 0) {
      problems.push(`${label}.lifecycle 必须是非空数组`);
    }
  }
  const normalized = normalizeEvent(event, index, normalizedHeaders);
  normalized.validationProblems = problems.slice(problemStart);
  return normalized;
}

function validateMeta(meta, sourceLabel, options, problems) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    problems.push(`${sourceLabel} transcript 缺少 meta 对象`);
    return;
  }
  if (meta.schemaVersion !== TRANSCRIPT_SCHEMA) {
    problems.push(`${sourceLabel} transcript schemaVersion 必须是 ${TRANSCRIPT_SCHEMA}`);
  }
  if (!String(meta.baselineId || '')) problems.push(`${sourceLabel} transcript 缺少 baselineId`);
  const producer = String(meta.generatedBy || meta.capturedBy || '');
  if (!producer) {
    problems.push(`${sourceLabel} transcript 缺少 generatedBy/capturedBy`);
  } else if (options.browser && !/browser|ruyi|camoufox|cloak|firefox|chrome|chromium|webkit|manual/i.test(producer)) {
    problems.push(`${sourceLabel} transcript 生成来源不可识别：${producer}`);
  } else if (!options.browser && !/node|runtime|audit|probe|recorder/i.test(producer)) {
    problems.push(`${sourceLabel} transcript generatedBy 不可信：${producer}`);
  }
  if (options.browser) {
    if (meta.mode !== 'browser-baseline') {
      problems.push(`${sourceLabel} transcript mode 必须是 browser-baseline`);
    }
  } else {
    if (!SHA256_RE.test(String(meta.runtimeSourceHash || ''))) {
      problems.push(`${sourceLabel} transcript 缺少有效 runtimeSourceHash`);
    }
    if (options.requireNoSend) {
      if (meta.mode !== 'no-send' && meta.networkMode !== 'no-send') {
        problems.push(`${sourceLabel} transcript 必须来自 no-send 模式`);
      }
      if (!hasOwn(meta, 'networkAttempts') || Number(meta.networkAttempts) !== 0) {
        problems.push(`${sourceLabel} transcript 必须明确记录 networkAttempts=0`);
      }
    }
  }
}

function validateTranscript(raw, sourceLabel, options, problems) {
  validateMeta(raw.meta, sourceLabel, options, problems);
  if (!Array.isArray(raw.events) || raw.events.length === 0) {
    problems.push(`${sourceLabel} transcript 没有事件`);
    return [];
  }
  const events = raw.events.map((event, index) => validateEvent(event, index, sourceLabel, problems));
  let previous = Number.NEGATIVE_INFINITY;
  const seen = new Set();
  for (const event of events) {
    if (seen.has(event.sequence)) problems.push(`${sourceLabel} transcript sequence 重复：${event.sequence}`);
    seen.add(event.sequence);
    if (!(event.sequence > previous)) {
      problems.push(`${sourceLabel} transcript 事件必须按严格递增 sequence 写入`);
    }
    previous = event.sequence;
  }
  return events;
}

function compareField(expected, observed, field, diffs) {
  if (!Object.is(expected[field], observed[field])) {
    diffs.push({ field, expected: expected[field], observed: observed[field] });
  }
}

function compareOptionalField(expectedRaw, observedRaw, expected, observed, field, diffs) {
  const expectedPresent = hasOwn(expectedRaw, field);
  const observedPresent = hasOwn(observedRaw, field);
  if (!expectedPresent && !observedPresent) return;
  if (expectedPresent !== observedPresent || expected[field] !== observed[field]) {
    diffs.push({
      field,
      expected: expectedPresent ? expected[field] : '<missing>',
      observed: observedPresent ? observed[field] : '<missing>',
    });
  }
}

function compareHeaders(expected, observed, field, diffs) {
  if (JSON.stringify(expected[field]) !== JSON.stringify(observed[field])) {
    diffs.push({ field, expected: expected[field], observed: observed[field] });
  }
}

function compareLifecycle(expected, observed, diffs) {
  if (JSON.stringify(expected.lifecycle) !== JSON.stringify(observed.lifecycle)) {
    diffs.push({ field: 'lifecycle', expected: expected.lifecycle, observed: observed.lifecycle });
  }
}

function eventKey(event) {
  return `${eventClass(event.kind)}:${event.pairKey}`;
}

function hardInvariants(events) {
  const problems = [];
  const destroyedRealms = new Map();
  for (const event of events) {
    const cls = eventClass(event.kind);
    if (/realm-destroyed|navigation-commit|reload-commit/.test(event.kind)) {
      destroyedRealms.set(`${event.realmId}:${event.navigationEpoch}`, event.sequence);
      if (event.actor === 'xhr') {
        problems.push(`${event.pairKey}：document navigation/reload 被错误归类为 XHR`);
      }
      continue;
    }
    if (cls === 'response' && event.status === 0 && event.responseURL !== '') {
      problems.push(`${event.pairKey}：status=0 时 responseURL 必须为空，当前为 ${event.responseURL}`);
    }
    const destroyedAt = destroyedRealms.get(`${event.realmId}:${event.navigationEpoch}`);
    if (typeof destroyedAt !== 'undefined' && event.sequence > destroyedAt && !event.cancelledReason) {
      problems.push(`${event.pairKey}：旧 realm ${event.realmId}/${event.navigationEpoch} 销毁后仍产生未取消的 timer/XHR/task`);
    }
    if (event.validRealm === false && !event.cancelledReason) {
      problems.push(`${event.pairKey}：失效 realm 的事件缺少取消原因`);
    }
  }
  return problems;
}

function compareEvent(expectedRaw, observedRaw, expected, observed) {
  const diffs = [];
  if (expected.validationProblems.length) {
    diffs.push({
      field: 'browserTranscriptCompleteness',
      expected: 'complete',
      observed: `${expected.validationProblems.length} problem(s)`,
    });
  }
  if (observed.validationProblems.length) {
    diffs.push({
      field: 'nodeTranscriptCompleteness',
      expected: 'complete',
      observed: `${observed.validationProblems.length} problem(s)`,
    });
  }
  for (const field of COMMON_FIELDS) compareField(expected, observed, field, diffs);
  const cls = eventClass(expected.kind);
  if (cls !== eventClass(observed.kind)) {
    diffs.push({ field: 'kindClass', expected: cls, observed: eventClass(observed.kind) });
    return diffs;
  }
  if (cls === 'request') {
    for (const field of REQUEST_FIELDS) compareField(expected, observed, field, diffs);
    compareHeaders(expected, observed, 'headers', diffs);
    const expectedBody = requestHasBody(expectedRaw);
    const observedBody = requestHasBody(observedRaw);
    if (expectedBody !== observedBody) {
      diffs.push({ field: 'bodyPresence', expected: expectedBody, observed: observedBody });
    } else if (expectedBody) {
      for (const field of ['contentType', 'bodyLength', 'bodySha256']) {
        compareField(expected, observed, field, diffs);
      }
    }
    for (const field of OPTIONAL_REQUEST_FIELDS) {
      compareOptionalField(expectedRaw, observedRaw, expected, observed, field, diffs);
    }
  } else if (cls === 'response') {
    for (const field of RESPONSE_FIELDS) compareField(expected, observed, field, diffs);
    compareHeaders(expected, observed, 'responseHeaders', diffs);
    compareLifecycle(expected, observed, diffs);
  } else if (cls === 'lifecycle') {
    compareLifecycle(expected, observed, diffs);
    for (const field of ['method', 'url']) {
      compareOptionalField(expectedRaw, observedRaw, expected, observed, field, diffs);
    }
  }
  return diffs;
}

function emptyResult(caseDir, browserPath, nodePath, problems, warnings = []) {
  return {
    schemaVersion: AUDIT_SCHEMA,
    generatedBy: 'check_xhr_fetch_semantics.js',
    clean: false,
    caseDir,
    browserPath,
    nodePath,
    problems,
    warnings,
    results: [],
    summary: {},
  };
}

function extraEventsByKey(expectedEvents, observedEvents) {
  const remaining = new Map();
  for (const event of expectedEvents) {
    const key = eventKey(event);
    remaining.set(key, (remaining.get(key) || 0) + 1);
  }
  const extra = [];
  for (const event of observedEvents) {
    const key = eventKey(event);
    const count = remaining.get(key) || 0;
    if (count > 0) remaining.set(key, count - 1);
    else extra.push(event);
  }
  return extra;
}

function check(args) {
  const caseDir = path.resolve(args.caseDir || '.');
  const browserPath = path.resolve(args.browser || path.join(caseDir, 'fixtures', 'browser-network-transcript.ndjson'));
  const nodePath = path.resolve(args.node || path.join(caseDir, 'tmp', 'node-network-transcript.ndjson'));
  const problems = [];
  const warnings = [];
  if ((args.require || exists(browserPath) || exists(nodePath)) && !exists(browserPath)) {
    problems.push(`缺少浏览器 network transcript：${browserPath}`);
  }
  if ((args.require || exists(browserPath) || exists(nodePath)) && !exists(nodePath)) {
    problems.push(`缺少 Node network transcript：${nodePath}`);
  }
  if (problems.length) return emptyResult(caseDir, browserPath, nodePath, problems, warnings);

  if (!exists(browserPath) && !exists(nodePath)) {
    return {
      ...emptyResult(caseDir, browserPath, nodePath, [], ['未触发 network transcript 审计']),
      clean: true,
    };
  }

  let browserRaw;
  let nodeRaw;
  try { browserRaw = parseTranscript(browserPath); } catch (err) { problems.push(`浏览器 transcript 无法解析：${err.message}`); }
  try { nodeRaw = parseTranscript(nodePath); } catch (err) { problems.push(`Node transcript 无法解析：${err.message}`); }
  if (!browserRaw || !nodeRaw) return emptyResult(caseDir, browserPath, nodePath, problems, warnings);

  const browserEvents = validateTranscript(browserRaw, '浏览器', { browser: true }, problems);
  const nodeEvents = validateTranscript(
    nodeRaw,
    'Node',
    { browser: false, requireNoSend: args.requireNoSend },
    problems,
  );
  if (browserRaw.meta.baselineId && nodeRaw.meta.baselineId
    && nodeRaw.meta.baselineId !== browserRaw.meta.baselineId) {
    problems.push(`network transcript baselineId 不一致：${browserRaw.meta.baselineId} != ${nodeRaw.meta.baselineId}`);
  }
  for (const invariant of hardInvariants(browserEvents)) problems.push(`浏览器 transcript：${invariant}`);
  for (const invariant of hardInvariants(nodeEvents)) problems.push(`Node transcript：${invariant}`);

  const browserTimeline = browserEvents.map(eventKey);
  const nodeTimeline = nodeEvents.map(eventKey);
  if (JSON.stringify(browserTimeline) !== JSON.stringify(nodeTimeline)) {
    problems.push('browser/Node network event timeline 不一致；请求、响应或生命周期顺序发生变化');
  }

  const results = [];
  const count = Math.max(browserEvents.length, nodeEvents.length);
  for (let index = 0; index < count; index++) {
    const expected = browserEvents[index];
    const observed = nodeEvents[index];
    if (!expected || !observed) {
      const key = expected ? eventKey(expected) : eventKey(observed);
      const diffs = [{
        field: '*',
        expected: expected ? 'browser event' : 'missing',
        observed: observed ? 'node event' : 'missing',
      }];
      results.push({ key, index, clean: false, diffs });
      continue;
    }
    const diffs = compareEvent(
      browserRaw.events[index],
      nodeRaw.events[index],
      expected,
      observed,
    );
    if (diffs.length) {
      problems.push(`${eventKey(expected)}：${diffs.map(diff => diff.field).join('、')} 不一致`);
    }
    results.push({ key: eventKey(expected), index, clean: diffs.length === 0, diffs });
  }

  const extraNode = extraEventsByKey(browserEvents, nodeEvents);
  const missingNode = extraEventsByKey(nodeEvents, browserEvents);
  const extraNodeEvents = extraNode.length;
  const extraNodeRequests = extraNode.filter(event => eventClass(event.kind) === 'request').length;
  if (extraNodeEvents) {
    problems.push(`Node transcript 比浏览器多出 ${extraNodeEvents} 个事件，其中 ${extraNodeRequests} 个请求`);
  }
  if (missingNode.length) {
    problems.push(`Node transcript 比浏览器少 ${missingNode.length} 个事件`);
  }

  const browserSessionIds = [...new Set(browserEvents.map(event => event.sessionId).filter(Boolean))];
  const nodeSessionIds = [...new Set(nodeEvents.map(event => event.sessionId).filter(Boolean))];
  if (browserSessionIds.length !== 1) {
    problems.push(`浏览器 transcript 必须使用一个 sessionId，当前为 ${browserSessionIds.join('、') || '未记录'}`);
  }
  if (nodeSessionIds.length !== 1) {
    problems.push(`Node transcript 必须使用一个 sessionId，当前为 ${nodeSessionIds.join('、') || '未记录'}`);
  }

  const summary = {
    browserEvents: browserEvents.length,
    nodeEvents: nodeEvents.length,
    matched: results.filter(item => item.clean).length,
    mismatched: results.filter(item => !item.clean).length,
    networkMismatches: results.filter(item => !item.clean).length,
    extraNodeEvents,
    extraNodeRequests,
    browserSessionIds,
    nodeSessionIds,
    baselineId: browserRaw.meta.baselineId || nodeRaw.meta.baselineId || '',
    runtimeSourceHash: nodeRaw.meta.runtimeSourceHash || '',
    networkMode: nodeRaw.meta.mode || nodeRaw.meta.networkMode || '',
    networkAttempts: nodeRaw.meta.networkAttempts,
  };
  return {
    schemaVersion: AUDIT_SCHEMA,
    generatedBy: 'check_xhr_fetch_semantics.js',
    clean: problems.length === 0,
    caseDir,
    browserPath,
    nodePath,
    problems,
    warnings,
    results,
    summary,
  };
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
    lines.push(`- Node 多余请求：${result.summary.extraNodeRequests}`);
    lines.push(`- Node sessionId：${result.summary.nodeSessionIds.join('、') || '未记录'}`);
    lines.push(`- no-send 网络尝试：${String(result.summary.networkAttempts ?? '未记录')}`);
  }
  const bad = result.results.filter(item => !item.clean);
  if (bad.length) {
    lines.push('', '## 逐项差异');
    for (const item of bad.slice(0, 100)) {
      lines.push(`- ${item.index}/${item.key}：${item.diffs.map(diff => diff.field).join('、')}`);
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

module.exports = {
  check,
  eventClass,
  hardInvariants,
  normalizeEvent,
  validateAndNormalizeHeaders,
  validateTranscript,
};
