#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    caseDir: '',
    traces: [],
    out: '',
    baselineId: '',
    json: false,
    markdown: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--case-dir' || arg === '--case' || arg === '-d') args.caseDir = argv[++i] || '';
    else if (arg === '--trace' || arg === '--input' || arg === '-i') args.traces.push(argv[++i] || '');
    else if (arg === '--out') args.out = argv[++i] || '';
    else if (arg === '--baseline-id') args.baselineId = argv[++i] || '';
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
  node scripts/build_trace_runtime_contract.js --case-dir case --markdown
  node scripts/build_trace_runtime_contract.js --trace case/ruyi-trace/logs/trace.ndjson --out case/notes/trace-runtime-contract.json --baseline-id fp-001 --json

说明：从原始 Trace 生成逐 API、realm、receiver、访问类型和行为观测组成的 runtime 契约。该契约是后续 Node audit 的机器可验证输入，不是人工填写的覆盖清单。`;
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function digestValue(value) {
  if (typeof value === 'undefined') return '';
  try { return sha256(JSON.stringify(stable(value))); } catch { return sha256(String(value)); }
}

function rel(root, file) {
  return (path.relative(root, file) || '.').replace(/\\/g, '/');
}

function discoverTraceFiles(args, caseDir) {
  const files = [];
  for (const item of args.traces) {
    const file = path.resolve(item);
    if (exists(file)) files.push(file);
  }
  if (!args.traces.length) {
    const roots = [
      path.join(caseDir, 'ruyi-trace', 'logs'),
      path.join(caseDir, 'tmp'),
    ];
    for (const root of roots) {
      for (const file of walk(root)) {
        const name = path.basename(file);
        if (/\.(ndjson|jsonl|json)$/i.test(file) && /trace|ruyi|env/i.test(name) && !/audit|contract|summary/i.test(name)) {
          files.push(file);
        }
      }
    }
  }
  return [...new Set(files.map(file => path.resolve(file)))].sort();
}

function parseTraceFile(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  if (/\.json$/i.test(file)) {
    const raw = JSON.parse(text);
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.events)) return raw.events;
    if (Array.isArray(raw.items)) return raw.items;
    if (Array.isArray(raw.logs)) return raw.logs;
    return [raw];
  }
  const events = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      event.__line = index + 1;
      events.push(event);
    } catch (err) {
      events.push({ type: 'parse-error', api: `line:${index + 1}`, error: { name: 'SyntaxError', message: err.message }, __line: index + 1 });
    }
  }
  return events;
}

function firstValue(object, keys, fallback) {
  if (arguments.length < 3) fallback = '';
  for (const key of keys) {
    if (object && typeof object[key] !== 'undefined' && object[key] !== null && object[key] !== '') return object[key];
  }
  return fallback;
}

function normalizeText(value) {
  if (typeof value === 'string') return value;
  if (value === null || typeof value === 'undefined') return '';
  if (typeof value === 'object') {
    return firstValue(value, ['name', 'type', 'id', 'path', 'value'], JSON.stringify(stable(value)));
  }
  return String(value);
}

function normalizeStack(event) {
  const stack = Array.isArray(event.stack) ? event.stack : [];
  const frame = stack.find(item => item && (item.file || item.filename || item.url || item.line || item.lineNumber));
  if (!frame) return '';
  const file = firstValue(frame, ['file', 'filename', 'url'], '');
  const line = firstValue(frame, ['line', 'lineNumber'], '');
  const col = firstValue(frame, ['col', 'column', 'columnNumber'], '');
  return [file, line, col].filter(value => value !== '').join(':');
}

function priorityOf(api, event) {
  const explicit = normalizeText(firstValue(event, ['priority', 'level'], '')).toUpperCase();
  if (/^P[0-2]$/.test(explicit)) return explicit;
  if (/XMLHttpRequest|fetch|sendBeacon|window|document|location|navigator|cookie|Storage|Function\.prototype\.toString|reload|writer/i.test(api)) return 'P0';
  if (/Object\.|Reflect\.|prototype|descriptor|EventTarget|Performance|Worker|Message|Canvas|WebGL|Audio|screen|Permissions|Plugin|MimeType|DOM|CSS/i.test(api)) return 'P1';
  return 'P2';
}

function normalizeObservation(event) {
  const api = normalizeText(firstValue(event, ['api', 'path', 'name', 'prop'], ''));
  if (!api) return null;
  const accessType = normalizeText(firstValue(event, ['accessType', 'operation', 'op', 'type'], 'unknown'));
  const realm = normalizeText(firstValue(event, ['realmId', 'realm', 'contextId', 'frameId', 'workerId'], 'main'));
  const receiver = normalizeText(firstValue(event, ['receiver', 'receiverType', 'thisType', 'target', 'object'], ''));
  const phase = normalizeText(firstValue(event, ['phase', 'writer', 'navigationPhase', 'stage'], ''));
  const descriptor = firstValue(event, ['descriptor', 'propertyDescriptor'], undefined);
  const prototypeChain = firstValue(event, ['prototypeChain', 'prototypes', 'protoChain'], undefined);
  const ownKeys = firstValue(event, ['ownKeys', 'reflectOwnKeys'], undefined);
  const ownPropertyNames = firstValue(event, ['ownPropertyNames', 'propertyNames'], undefined);
  const ownSymbols = firstValue(event, ['ownSymbols', 'ownPropertySymbols'], undefined);
  const result = firstValue(event, ['returnValue', 'result', 'value'], undefined);
  const args = firstValue(event, ['arguments', 'args', 'parameters'], undefined);
  const error = firstValue(event, ['error', 'exception', 'throw'], undefined);
  const brand = normalizeText(firstValue(event, ['brand', 'toStringTag', 'objectToString'], ''));
  const constructorName = normalizeText(firstValue(event, ['constructorName', 'constructor'], ''));
  const owner = normalizeText(firstValue(event, ['owner', 'definedOn', 'prototypeOwner'], ''));
  const sideEffects = firstValue(event, ['sideEffects', 'effects', 'mutations'], undefined);
  return {
    api,
    accessType,
    realm,
    receiver,
    phase,
    owner,
    brand,
    constructorName,
    descriptor,
    prototypeChain,
    ownKeys,
    ownPropertyNames,
    ownSymbols,
    argsDigest: digestValue(args),
    resultDigest: digestValue(result),
    errorDigest: digestValue(error),
    sideEffectsDigest: digestValue(sideEffects),
    stack: normalizeStack(event),
    sequence: Number(firstValue(event, ['sequence', 'seq', 'index', '__line'], 0)) || 0,
  };
}

function contractKey(item) {
  return [item.api, item.accessType, item.realm, item.receiver, item.phase].join('\u001f');
}

function addDistinct(target, value, limit = 20) {
  if (value === '' || typeof value === 'undefined') return;
  const digest = digestValue(value);
  if (target.some(item => item.digest === digest)) return;
  if (target.length < limit) target.push({ digest, value });
}

function buildContract(args) {
  const caseDir = path.resolve(args.caseDir || '.');
  const files = discoverTraceFiles(args, caseDir);
  if (!files.length) throw new Error('未找到原始 Trace 文件；请使用 --trace 指定，或把日志放入 case/ruyi-trace/logs/。');
  const sourceFiles = [];
  const groups = new Map();
  let eventCount = 0;
  for (const file of files) {
    const text = fs.readFileSync(file);
    sourceFiles.push({ file: rel(caseDir, file), sha256: sha256(text), bytes: text.length });
    const events = parseTraceFile(file);
    for (const event of events) {
      eventCount += 1;
      const item = normalizeObservation(event);
      if (!item) continue;
      const key = contractKey(item);
      if (!groups.has(key)) {
        groups.set(key, {
          id: sha256(key).slice(0, 24),
          api: item.api,
          accessType: item.accessType,
          realm: item.realm,
          receiver: item.receiver,
          phase: item.phase,
          priority: priorityOf(item.api, event),
          count: 0,
          sequences: [],
          stacks: [],
          assertions: {
            owner: [],
            brand: [],
            constructorName: [],
            descriptor: [],
            prototypeChain: [],
            ownKeys: [],
            ownPropertyNames: [],
            ownSymbols: [],
            argsDigest: [],
            resultDigest: [],
            errorDigest: [],
            sideEffectsDigest: [],
          },
        });
      }
      const group = groups.get(key);
      group.count += 1;
      if (item.sequence && group.sequences.length < 50) group.sequences.push(item.sequence);
      if (item.stack && !group.stacks.includes(item.stack) && group.stacks.length < 10) group.stacks.push(item.stack);
      for (const field of Object.keys(group.assertions)) addDistinct(group.assertions[field], item[field]);
    }
  }
  const contracts = [...groups.values()].sort((a, b) =>
    a.priority.localeCompare(b.priority) || a.api.localeCompare(b.api) || a.realm.localeCompare(b.realm)
  );
  const traceSourceHash = sha256(JSON.stringify(sourceFiles.map(item => [item.file, item.sha256])));
  const contract = {
    schemaVersion: 'trace-runtime-contract/v2',
    generatedBy: 'build_trace_runtime_contract.js',
    generatedAt: new Date().toISOString(),
    baselineId: args.baselineId || '',
    traceSourceHash,
    sourceFiles,
    eventCount,
    contractCount: contracts.length,
    contracts,
  };
  contract.contractHash = sha256(JSON.stringify(stable({
    schemaVersion: contract.schemaVersion,
    baselineId: contract.baselineId,
    traceSourceHash: contract.traceSourceHash,
    contracts: contract.contracts,
  })));
  const out = path.resolve(args.out || path.join(caseDir, 'notes', 'trace-runtime-contract.json'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
  return { caseDir, out, contract };
}

function renderMarkdown(result) {
  const p0 = result.contract.contracts.filter(item => item.priority === 'P0').length;
  const p1 = result.contract.contracts.filter(item => item.priority === 'P1').length;
  return [
    '# Trace-runtime 行为契约生成结果',
    '',
    `- 输出：${result.out}`,
    `- baselineId：${result.contract.baselineId || '未指定'}`,
    `- Trace 文件数：${result.contract.sourceFiles.length}`,
    `- Trace 事件数：${result.contract.eventCount}`,
    `- 行为契约数：${result.contract.contractCount}`,
    `- P0：${p0}`,
    `- P1：${p1}`,
    `- traceSourceHash：${result.contract.traceSourceHash}`,
    `- contractHash：${result.contract.contractHash}`,
    '',
    '下一步必须运行 Node audit 并使用 check_trace_runtime_conformance.js 深度比较；不得手工把契约状态改成 matched。',
  ].join('\n') + '\n';
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv);
    if (args.help) {
      console.log(usage());
      process.exit(0);
    }
    const result = buildContract(args);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    if (args.markdown) process.stdout.write(renderMarkdown(result));
  } catch (err) {
    console.error(err.message || String(err));
    console.error(usage());
    process.exit(1);
  }
}

module.exports = { buildContract, normalizeObservation, digestValue, stable };
