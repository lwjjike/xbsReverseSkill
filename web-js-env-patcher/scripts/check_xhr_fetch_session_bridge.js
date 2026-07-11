#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    caseDir: '',
    dir: '',
    tlsClient: '',
    requireLive: false,
    json: false,
    markdown: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--case-dir' || a === '--case' || a === '-d') args.caseDir = argv[++i] || '';
    else if (a === '--dir') args.dir = argv[++i] || '';
    else if (a === '--tls-client') args.tlsClient = argv[++i] || '';
    else if (a === '--require-live') args.requireLive = true;
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
  node scripts/check_xhr_fetch_session_bridge.js --case-dir case --markdown
  node scripts/check_xhr_fetch_session_bridge.js --case-dir case --require-live --json
  node scripts/check_xhr_fetch_session_bridge.js --case-dir case --tls-client curl_cffi --require-live --markdown

说明：检查 XMLHttpRequest / fetch / sendBeacon 是否只是 fixture/mock/default 200，或是否已通过 live session bridge 复用同一 TLS 指纹兼容 Session。`;
}

function exists(p) { try { return fs.existsSync(p); } catch { return false; } }
function stat(p) { try { return fs.statSync(p); } catch { return null; } }
function readText(p) { return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''); }
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
  return ['.js', '.mjs', '.cjs', '.py', '.ts'].includes(ext(file));
}

function shouldSkip(file) {
  const n = file.replace(/\\/g, '/').toLowerCase();
  return /(^|\/)(node_modules|dist|build|coverage|vendor|third_party|third-party)(\/|$)/.test(n)
    || /(\.min\.js|bundle\.js|vendor\.js)$/i.test(n);
}

function findLines(text, pattern, limit = 10) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i])) out.push({ line: i + 1, text: lines[i].trim().slice(0, 180) });
    if (out.length >= limit) break;
  }
  return out;
}

const NETWORK_API_RE = /\b(XMLHttpRequest|fetch|Request|Response|Headers|sendBeacon)\b/;
const XHR_IMPL_RE = /\b(class|function)\s+XMLHttpRequest\b|XMLHttpRequest\.prototype|\bXMLHttpRequest\s*=\s*(?:class|function)|\bopen\s*\([^)]*\)\s*\{[\s\S]{0,400}\bsend\s*\(/;
const FETCH_IMPL_RE = /\b(?:window|globalThis|ctx|self)\.fetch\s*=|\bfunction\s+fetch\s*\(|\basync\s+function\s+fetch\s*\(|\bfetch\s*:\s*(?:async\s*)?function|\binstallFetch\b/i;
const OFFLINE_RE = /offline-fixture|diagnostic-only|fixture|mock|defaultResponse|default response|xhrResponseForRequest|responseForRequest|fake|stub|不发送真实网络请求|不发真实请求|does not send real network|默认\s*200|status\s*[:=]\s*200/i;
const LIVE_BRIDGE_RE = /live-session-bridge|xhr-fetch-session-bridge|sessionBridge|bridgeRequest|sendViaSession|requestThroughSession|bridge envelope|IPC|stdio|process\.send|parentPort|createRequestSession|create_request_session|requests\.Session|curl_cffi|curl-cffi|cffi_curl|cyCronet|cycronet|CycleTLS|cycletls|impers/i;
const ORDINARY_CLIENT_RE = /\b(?:http|https)\.request\s*\(|\baxios\s*\(|\bundici\b|\bnode-fetch\b|\bglobalThis\.fetch\s*\(|\bfetch\s*\(\s*(?:url|requestUrl|targetUrl)|\brequests\.request\s*\(/i;
const PYTHON_SESSION_BRIDGE_RE = /final\.py|create_request_session|requests\.Session|curl_cffi|session\.request\s*\(|subprocess\.Popen|stdin|stdout|IPC|bridge/i;

function inspectFiles(root, files) {
  const result = {
    networkFiles: [],
    offlineHits: [],
    liveBridgeHits: [],
    ordinaryClientHits: [],
    xhrImplHits: [],
    fetchImplHits: [],
    pythonSessionBridgeHits: [],
  };
  for (const file of files) {
    const text = readText(file);
    const r = rel(root, file);
    if (!NETWORK_API_RE.test(text) && !/curl_cffi|CycleTLS|impers|sessionBridge|bridge/i.test(text)) continue;
    result.networkFiles.push(r);
    const offline = findLines(text, OFFLINE_RE, 5);
    if (offline.length) result.offlineHits.push({ file: r, lines: offline });
    const live = findLines(text, LIVE_BRIDGE_RE, 8);
    if (live.length) result.liveBridgeHits.push({ file: r, lines: live });
    const ordinary = findLines(text, ORDINARY_CLIENT_RE, 5);
    if (ordinary.length) result.ordinaryClientHits.push({ file: r, lines: ordinary });
    const xhr = findLines(text, XHR_IMPL_RE, 5);
    if (xhr.length) result.xhrImplHits.push({ file: r, lines: xhr });
    const fetch = findLines(text, FETCH_IMPL_RE, 5);
    if (fetch.length) result.fetchImplHits.push({ file: r, lines: fetch });
    const pyBridge = findLines(text, PYTHON_SESSION_BRIDGE_RE, 8);
    if (pyBridge.length) result.pythonSessionBridgeHits.push({ file: r, lines: pyBridge });
  }
  return result;
}

function inspectBridgeNotes(caseDir) {
  const notesFile = path.join(caseDir, 'notes', 'xhr-fetch-session-bridge.md');
  const auditFile = path.join(caseDir, 'tmp', 'xhr-fetch-bridge-audit.json');
  const semanticsFile = path.join(caseDir, 'tmp', 'xhr-fetch-semantics-audit.json');
  const notes = {
    notesFile,
    auditFile,
    semanticsFile,
    notesPresent: exists(notesFile),
    auditPresent: exists(auditFile),
    semanticsPresent: exists(semanticsFile),
    mode: '',
    auditOk: false,
    semanticsOk: false,
    audit: {},
    semantics: {},
  };
  if (notes.notesPresent) {
    const text = readText(notesFile);
    if (/live-session-bridge/i.test(text)) notes.mode = 'live-session-bridge';
    else if (/offline-fixture/i.test(text)) notes.mode = 'offline-fixture';
  }
  if (notes.auditPresent) {
    try {
      const raw = JSON.parse(readText(auditFile));
      notes.audit = raw;
      notes.auditOk = raw.schemaVersion === 'xhr-fetch-session-bridge-audit/v2'
        && /runtime|bridge/i.test(String(raw.generatedBy || ''))
        && raw.mode === 'live-session-bridge'
        && raw.sameSessionVerified === true
        && Number(raw.transportRoundTrips || 0) > 0
        && Boolean(raw.sessionId)
        && Boolean(raw.runtimeSourceHash);
      if (!notes.mode && raw.mode) notes.mode = String(raw.mode);
    } catch (_) {
      notes.auditOk = false;
    }
  }
  if (notes.semanticsPresent) {
    try {
      const raw = JSON.parse(readText(semanticsFile));
      notes.semantics = raw;
      notes.semanticsOk = raw.schemaVersion === 'xhr-fetch-semantics-audit/v2'
        && raw.generatedBy === 'check_xhr_fetch_semantics.js'
        && raw.clean === true
        && raw.summary
        && raw.summary.networkMode === 'no-send'
        && Boolean(raw.summary.runtimeSourceHash);
    } catch (_) {
      notes.semanticsOk = false;
    }
  }
  return notes;
}

function isCurlCffiClient(tlsClient) {
  return /curl[_-]?cffi|cffi_curl/i.test(String(tlsClient || ''));
}

function check(args) {
  const caseDir = path.resolve(args.caseDir || '.');
  const root = path.resolve(args.dir || path.join(caseDir, 'result'));
  const files = walk(root).filter(file => stat(file) && stat(file).isFile() && isCodeFile(file) && !shouldSkip(file));
  const problems = [];
  const warnings = [];
  const evidence = inspectFiles(root, files);
  const bridgeNotes = inspectBridgeNotes(caseDir);
  const hasNetworkImpl = evidence.xhrImplHits.length > 0 || evidence.fetchImplHits.length > 0;
  const hasLiveBridgeCodeEvidence = evidence.liveBridgeHits.length > 0;
  const hasLiveBridge = bridgeNotes.auditOk && bridgeNotes.semanticsOk;
  const hasOffline = bridgeNotes.mode === 'offline-fixture' || evidence.offlineHits.length > 0;

  if (!files.length) problems.push(`未找到可检查的 result 代码文件：${root}`);
  if (hasNetworkImpl && evidence.ordinaryClientHits.length) {
    problems.push('XHR/fetch 网络对象疑似直接调用普通 Node/Python HTTP 客户端，必须改为 live session bridge 复用已确认 TLS Session。');
  }
  if (args.requireLive && hasNetworkImpl && !hasLiveBridge) {
    problems.push('要求 live session bridge，但缺少可信运行时 bridge audit 或 no-send 请求语义审计；代码关键词和手工 matched 不能作为通过证据。');
  }
  if (args.requireLive && hasOffline && !hasLiveBridge) {
    problems.push('检测到 offline fixture / mock / 默认响应，但缺少 live session bridge。真实请求场景不得把 fixture 响应写成 TLS 已解决。');
  }
  if (isCurlCffiClient(args.tlsClient) && hasNetworkImpl) {
    const audit = bridgeNotes.audit || {};
    if (!evidence.pythonSessionBridgeHits.length) {
      problems.push('最终 TLS 客户端为 curl_cffi / cffi_curl，但未检测到 final.py 持有 Session 并服务 Node IPC bridge 的代码线索。');
    }
    if (audit.sessionOwner !== 'final.py' || !/curl[_-]?cffi|cffi_curl/i.test(String(audit.tlsClient || '')) || audit.sameSessionVerified !== true) {
      problems.push('curl_cffi 场景缺少可信运行时证明：sessionOwner 必须为 final.py、tlsClient 必须匹配，且 sameSessionVerified=true。');
    }
  }
  if (hasNetworkImpl && !bridgeNotes.notesPresent) {
    warnings.push('建议生成 case/notes/xhr-fetch-session-bridge.md，记录 offline-fixture 或 live-session-bridge 模式、Session 持有者和 Cookie 同步策略。');
  }
  if (!hasNetworkImpl && args.requireLive) {
    problems.push('传入了 --require-live，但未检测到明确 XHR/fetch 实现；不得以“可能由外部模块提供”作为豁免。');
  }
  if (args.requireLive && !bridgeNotes.auditPresent) {
    problems.push('真实请求模式缺少 case/tmp/xhr-fetch-bridge-audit.json。');
  }
  if (args.requireLive && !bridgeNotes.semanticsPresent) {
    problems.push('真实请求模式缺少 case/tmp/xhr-fetch-semantics-audit.json。');
  }
  if (args.requireLive && hasLiveBridgeCodeEvidence && !bridgeNotes.auditOk) {
    warnings.push('发现 live bridge 代码关键词，但运行时 bridge audit 未通过；静态关键词不计入验收。');
  }

  return {
    caseDir,
    root,
    clean: problems.length === 0,
    requireLive: args.requireLive,
    tlsClient: args.tlsClient || '',
    hasNetworkImpl,
    hasLiveBridge,
    hasLiveBridgeCodeEvidence,
    hasOffline,
    filesChecked: files.length,
    bridgeNotes,
    evidence,
    problems,
    warnings,
  };
}

function renderHitList(items) {
  if (!items.length) return ['- 无'];
  const out = [];
  for (const item of items) {
    out.push(`- ${item.file}`);
    for (const line of item.lines) out.push(`  - 第 ${line.line} 行：${line.text}`);
  }
  return out;
}

function renderMarkdown(result) {
  const lines = [
    '# XHR/fetch Session Bridge 检查结果',
    '',
    `case 目录：${result.caseDir}`,
    `检查范围：${result.root}`,
    `是否要求 live bridge：${result.requireLive ? '是' : '否'}`,
    `TLS 客户端：${result.tlsClient || '未指定'}`,
    `是否通过：${result.clean ? '是' : '否'}`,
    '',
    '## 摘要',
    `- 检查文件数：${result.filesChecked}`,
    `- 检测到 XHR/fetch 实现：${result.hasNetworkImpl ? '是' : '否'}`,
    `- 检测到 live session bridge 证据：${result.hasLiveBridge ? '是' : '否'}`,
    `- 仅检测到 live bridge 代码关键词：${result.hasLiveBridgeCodeEvidence ? '是' : '否'}`,
    `- 检测到 offline fixture / mock 证据：${result.hasOffline ? '是' : '否'}`,
    `- bridge 记录：${result.bridgeNotes.notesPresent ? result.bridgeNotes.notesFile : '未发现'}`,
    `- bridge audit：${result.bridgeNotes.auditPresent ? result.bridgeNotes.auditFile : '未发现'}`,
    `- 请求语义 audit：${result.bridgeNotes.semanticsPresent ? result.bridgeNotes.semanticsFile : '未发现'}`,
    '',
    '## XHR 实现证据',
    ...renderHitList(result.evidence.xhrImplHits),
    '',
    '## fetch 实现证据',
    ...renderHitList(result.evidence.fetchImplHits),
    '',
    '## live bridge 证据',
    ...renderHitList(result.evidence.liveBridgeHits),
    '',
    '## offline fixture / mock 证据',
    ...renderHitList(result.evidence.offlineHits),
  ];
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

module.exports = { check };
