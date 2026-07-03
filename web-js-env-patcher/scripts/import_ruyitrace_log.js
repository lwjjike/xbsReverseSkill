#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

function parseArgs(argv) {
  const args = {
    input: '',
    caseDir: '',
    name: '',
    maxExamples: 10,
    truncationThreshold: 3900,
    maxTruncationExamples: 50,
    json: false,
    markdown: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') args.input = argv[++i] || '';
    else if (a === '--case-dir' || a === '--dir') args.caseDir = argv[++i] || '';
    else if (a === '--name') args.name = argv[++i] || '';
    else if (a === '--max-examples') args.maxExamples = Number(argv[++i] || '10');
    else if (a === '--truncation-threshold') args.truncationThreshold = Number(argv[++i] || '3900');
    else if (a === '--max-truncation-examples') args.maxTruncationExamples = Number(argv[++i] || '50');
    else if (a === '--json') args.json = true;
    else if (a === '--markdown') args.markdown = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`未知参数：${a}`);
  }
  if (!Number.isFinite(args.truncationThreshold) || args.truncationThreshold < 1) args.truncationThreshold = 3900;
  if (!Number.isFinite(args.maxTruncationExamples) || args.maxTruncationExamples < 1) args.maxTruncationExamples = 50;
  if (!args.json && !args.markdown) args.markdown = true;
  return args;
}

function usage() {
  return `用法：
  node scripts/import_ruyitrace_log.js --input <trace.ndjson> --case-dir case --markdown
  node scripts/import_ruyitrace_log.js --input <trace.ndjson> --case-dir case --truncation-threshold 3900 --json

说明：复制 RuyiTrace NDJSON 日志到 case/ruyi-trace/logs/，生成 notes/ruyitrace-summary.md，并标记接近 4000 / 4096 字符的字段为“疑似被 RuyiTrace 截断”。`;
}

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function safeName(name) {
  return String(name || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 180);
}

function inc(map, key) {
  key = key || '(空)';
  map.set(key, (map.get(key) || 0) + 1);
}

function top(map, n) {
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n).map(([key, count]) => ({ key, count }));
}

function classifyApi(api) {
  api = String(api || '');
  if (/Canvas|CanvasRenderingContext2D|OffscreenCanvas/.test(api)) return 'canvas';
  if (/WebGL|GLRenderingContext/.test(api)) return 'webgl';
  if (/Audio|Oscillator|Analyser|OfflineAudioContext/.test(api)) return 'audio';
  if (/Navigator|navigator/.test(api)) return 'navigator';
  if (/Screen|screen/.test(api)) return 'screen';
  if (/Crypto|getRandomValues|randomUUID/.test(api)) return 'crypto';
  if (/Performance|performance/.test(api)) return 'performance';
  if (/Storage|localStorage|sessionStorage|IndexedDB|IDB/.test(api)) return 'storage';
  if (/WebRTC|RTCPeerConnection|MediaDevices/.test(api)) return 'webrtc';
  if (/Worker|ServiceWorker|postMessage|MessageChannel/.test(api)) return 'worker-message';
  if (/Document|Element|Node|CSS|Style|Layout|DOMRect/.test(api)) return 'dom-layout';
  return 'other';
}

function visibleHash(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function preview(value, side = 80) {
  const text = String(value || '');
  if (text.length <= side * 2) return text;
  return `${text.slice(0, side)}...${text.slice(-side)}`;
}

function stackBrief(evt) {
  const stack = Array.isArray(evt && evt.stack) ? evt.stack : [];
  const first = stack.find(s => s && (s.file || s.line || s.col));
  if (!first) return '';
  const loc = [first.file || '', first.line || '', first.col || ''].filter(v => v !== '').join(':');
  return loc;
}

function walkStrings(value, visitor, currentPath = '') {
  if (typeof value === 'string') {
    visitor(currentPath || '$', value);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) walkStrings(value[i], visitor, `${currentPath}[${i}]`);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const nextPath = currentPath ? `${currentPath}.${key}` : key;
    walkStrings(child, visitor, nextPath);
  }
}

function collectTruncationSignals(evt, lineNo, threshold, maxExamples, state) {
  const api = evt.api || evt.name || evt.path || '';
  walkStrings(evt, (fieldPath, value) => {
    const visibleLength = value.length;
    if (visibleLength < threshold) return;
    state.totalSuspectedFields++;
    state.maxVisibleLength = Math.max(state.maxVisibleLength, visibleLength);
    inc(state.byFieldPath, fieldPath);
    inc(state.byApi, api || '(空)');
    if (state.examples.length >= maxExamples) return;
    state.examples.push({
      line: lineNo,
      api: api || '(空)',
      fieldPath,
      visibleLength,
      minLength: visibleLength,
      actualLength: 'unknown',
      truncationSuspected: true,
      reason: `字段可见长度达到阈值 ${threshold}，RuyiTrace 可能已截断长字符串，不能把可见长度当成真实长度。`,
      stack: stackBrief(evt),
      visibleSha256: visibleHash(value),
      visiblePreview: preview(value),
    });
  });
}

function sanitizeLongStrings(value, threshold, currentPath = '') {
  if (typeof value === 'string') {
    if (value.length < threshold) return value;
    return {
      __ruyiTraceLongString__: true,
      fieldPath: currentPath || '$',
      visibleLength: value.length,
      minLength: value.length,
      actualLength: 'unknown',
      truncationSuspected: true,
      visibleSha256: visibleHash(value),
      visiblePreview: preview(value),
      note: '该字符串接近或超过 RuyiTrace 截断阈值，示例中不保留完整可见内容，真实长度未知。',
    };
  }
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item, index) => sanitizeLongStrings(item, threshold, `${currentPath}[${index}]`));
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    const nextPath = currentPath ? `${currentPath}.${key}` : key;
    out[key] = sanitizeLongStrings(child, threshold, nextPath);
  }
  return out;
}

async function summarizeNdjson(file, options) {
  const apiCounts = new Map();
  const typeCounts = new Map();
  const categoryCounts = new Map();
  const fileCounts = new Map();
  const examples = [];
  const truncationState = { totalSuspectedFields: 0, maxVisibleLength: 0, byFieldPath: new Map(), byApi: new Map(), examples: [] };
  let lines = 0, parsed = 0, invalid = 0;

  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const raw of rl) {
    const line = raw.replace(/^\uFEFF/, '').trim();
    if (!line) continue;
    lines++;
    let evt;
    try { evt = JSON.parse(line); parsed++; } catch { invalid++; continue; }
    const api = evt.api || evt.name || evt.path || '';
    inc(apiCounts, api);
    inc(typeCounts, evt.t || evt.type || '');
    inc(categoryCounts, classifyApi(api));
    const stack = Array.isArray(evt.stack) ? evt.stack : [];
    for (const s of stack) if (s && s.file) inc(fileCounts, s.file);
    collectTruncationSignals(evt, lines, options.truncationThreshold, options.maxTruncationExamples, truncationState);
    if (examples.length < options.maxExamples) examples.push(sanitizeLongStrings(evt, options.truncationThreshold));
  }
  return {
    lines,
    parsed,
    invalid,
    topApis: top(apiCounts, 30),
    topTypes: top(typeCounts, 20),
    topCategories: top(categoryCounts, 20),
    topStackFiles: top(fileCounts, 30),
    truncation: {
      threshold: options.truncationThreshold,
      totalSuspectedFields: truncationState.totalSuspectedFields,
      maxVisibleLength: truncationState.maxVisibleLength,
      topFieldPaths: top(truncationState.byFieldPath, 20),
      topApis: top(truncationState.byApi, 20),
      examples: truncationState.examples,
      rule: '可见长度达到阈值的字符串一律按疑似截断处理；Canvas / WebGL / WebGPU / Audio 等长指纹值不得使用日志可见片段作为最终值，真实长度为 unknown，只能确认至少达到可见长度。',
    },
    examples,
  };
}

function renderMarkdown(result) {
  const lines = ['# RuyiTrace 日志导入摘要', '', `- 原始日志：${result.input}`, `- 复制后日志：${result.copiedTo}`, `- 行数：${result.summary.lines}`, `- 成功解析：${result.summary.parsed}`, `- 解析失败：${result.summary.invalid}`];
  lines.push('', '## API 类别统计');
  for (const item of result.summary.topCategories) lines.push(`- ${item.key}：${item.count}`);
  lines.push('', '## 高频 API');
  for (const item of result.summary.topApis.slice(0, 20)) lines.push(`- ${item.key}：${item.count}`);
  lines.push('', '## 高频调用栈文件');
  if (!result.summary.topStackFiles.length) lines.push('- 未发现 stack.file');
  for (const item of result.summary.topStackFiles.slice(0, 20)) lines.push(`- ${item.key}：${item.count}`);

  const truncation = result.summary.truncation;
  lines.push('', '## 长字段截断风险');
  lines.push(`- 检测阈值：${truncation.threshold}`);
  lines.push(`- 疑似截断字段数：${truncation.totalSuspectedFields}`);
  lines.push(`- 最大可见长度：${truncation.maxVisibleLength}`);
  lines.push('- 规则：达到或接近阈值的字符串只能说明“至少达到该可见长度”，真实长度记为 unknown，不能把 4000 或可见长度当成真实长度。');
  if (!truncation.examples.length) {
    lines.push('- 未发现达到阈值的长字符串字段。');
  } else {
    lines.push('', '| 行号 | API | 字段路径 | 可见长度 | 真实长度判断 | 调用栈 | 可见值 SHA256 |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const item of truncation.examples.slice(0, 20)) {
      lines.push(`| ${item.line} | ${item.api} | ${item.fieldPath} | ${item.visibleLength} | unknown，疑似被 RuyiTrace 截断 | ${item.stack || '未记录'} | ${item.visibleSha256} |`);
    }
    lines.push('', '### 长字段补采要求');
    lines.push('- 不要根据 RuyiTrace 中的 4000 / 4096 字符可见值判断完整加密参数、长 token、长 Cookie、长 body、Canvas dataURL、WebGL readPixels、WebGPU adapter 信息或 Audio channel data 的真实长度。');
    lines.push('- 如果该字段影响签名、补环境验证或指纹回放，必须通过 HAR/cURL、ruyiPage / Camoufox / CloakBrowser / 手动浏览器采样、专用 Hook 分片落盘、或最终 Node.js signer 输出重新确认完整值。');
    lines.push('- 写入 `notes/missing-env-priority.md` 时标明 `actualLength: unknown`、`minLength: 可见长度`、`truncationSuspected: true`。');
  }

  lines.push('', '## 建议下一步');
  lines.push('- 将高频 API 映射到 `env-module-levels.md` 的 Level 1/2/3 环境模块。');
  lines.push('- 结合 stack.file / line / col 更新 `notes/entry-chain.md` 和 `notes/missing-env-priority.md`。');
  lines.push('- 对长字段优先补采完整值或记录 hash / 长度 / 前后片段，避免把 RuyiTrace 的截断值误当作完整值。');
  lines.push('- 仅把摘要写入最终报告，原始 NDJSON 作为本地证据文件保存或由用户确认删除。');
  return lines.join('\n') + '\n';
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) { console.log(usage()); return; }
  if (!args.input) throw new Error('必须提供 --input');
  if (!args.caseDir) throw new Error('必须提供 --case-dir');
  const input = path.resolve(args.input);
  const caseDir = path.resolve(args.caseDir);
  if (!exists(input)) throw new Error(`日志文件不存在：${input}`);
  if (!exists(caseDir)) fs.mkdirSync(caseDir, { recursive: true });
  const logDir = path.join(caseDir, 'ruyi-trace', 'logs');
  const notesDir = path.join(caseDir, 'notes');
  fs.mkdirSync(logDir, { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });
  const dstName = safeName(args.name || path.basename(input) || `trace-${Date.now()}.ndjson`);
  const copiedTo = path.join(logDir, dstName.endsWith('.ndjson') ? dstName : `${dstName}.ndjson`);
  fs.copyFileSync(input, copiedTo);
  const summary = await summarizeNdjson(copiedTo, args);
  const result = { input, copiedTo, summary };
  const md = renderMarkdown(result);
  fs.writeFileSync(path.join(notesDir, 'ruyitrace-summary.md'), md, 'utf8');
  if (args.json) console.log(JSON.stringify(result, null, 2));
  if (args.markdown) process.stdout.write(md);
}

main().catch(err => {
  console.error(err.message || String(err));
  console.error(usage());
  process.exit(1);
});
