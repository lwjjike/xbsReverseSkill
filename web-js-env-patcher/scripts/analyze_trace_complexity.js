#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    caseDir: '',
    traces: [],
    maxLines: 200000,
    json: false,
    markdown: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--case-dir' || arg === '--case' || arg === '-d') args.caseDir = argv[++i] || '';
    else if (arg === '--trace' || arg === '--input' || arg === '-i') args.traces.push(argv[++i] || '');
    else if (arg === '--max-lines') args.maxLines = Number(argv[++i] || args.maxLines);
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
  node scripts/analyze_trace_complexity.js --case-dir case --markdown
  node scripts/analyze_trace_complexity.js --trace case/ruyi-trace/logs/trace.ndjson --json
  node scripts/analyze_trace_complexity.js --trace case/tmp/env-trace.jsonl --markdown

说明：基于 RuyiTrace / Node trace 日志评估补环境复杂度、风险点和优先级。复杂度评估只用于理解项目，不自动决定是否使用 isolated-vm、vm 或 jsEnv。`;
}

function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function stat(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

function walk(p, out = []) {
  if (!exists(p)) return out;
  const st = stat(p);
  if (!st) return out;
  if (st.isDirectory()) {
    let names = [];
    try {
      names = fs.readdirSync(p);
    } catch {
      names = [];
    }
    for (const name of names) walk(path.join(p, name), out);
  } else if (st.isFile()) {
    out.push(p);
  }
  return out;
}

function rel(root, p) {
  return (path.relative(root, p) || '.').replace(/\\/g, '/');
}

function uniq(arr) {
  return [...new Set(arr)].filter(Boolean).sort();
}

const CATEGORY_PATTERNS = [
  ['navigator', /\bnavigator\b|Navigator\.prototype|userAgent|webdriver|plugins|mimeTypes|hardwareConcurrency|deviceMemory/ig],
  ['document', /\bdocument\b|Document\.prototype|document\.cookie|querySelector|createElement|getElementById|documentElement|document\.all/ig],
  ['location', /\blocation\b|Location\.prototype|href|origin|hostname|pathname|search|hash/ig],
  ['screen', /\bscreen\b|Screen\.prototype|availWidth|availHeight|colorDepth|pixelDepth|orientation/ig],
  ['storage', /localStorage|sessionStorage|Storage\.prototype|getItem|setItem|removeItem/ig],
  ['cookie', /document\.cookie|Set-Cookie|\bcookie\b/ig],
  ['crypto', /\bcrypto\b|getRandomValues|randomUUID|SubtleCrypto|crypto\.subtle/ig],
  ['performance-time', /performance|performance\.now|timeOrigin|Date\.now|new Date|setTimeout|requestAnimationFrame/ig],
  ['canvas', /HTMLCanvasElement|CanvasRenderingContext2D|toDataURL|toBlob|getImageData|measureText|canvas/ig],
  ['webgl', /WebGLRenderingContext|WebGL2RenderingContext|getParameter|readPixels|getSupportedExtensions|getShaderPrecisionFormat|webgl/ig],
  ['webgpu', /navigator\.gpu|GPUAdapter|requestAdapter|webgpu/ig],
  ['audio', /AudioContext|OfflineAudioContext|AnalyserNode|startRendering|getChannelData/ig],
  ['dom-geometry', /getBoundingClientRect|DOMRect|offsetWidth|offsetHeight|clientWidth|clientHeight|getClientRects/ig],
  ['worker', /\bWorker\b|importScripts|postMessage|MessageChannel|MessagePort|BroadcastChannel/ig],
  ['wasm', /WebAssembly|instantiateStreaming|compileStreaming|\.wasm/ig],
  ['network', /\bfetch\b|XMLHttpRequest|Request\.prototype|Response\.prototype|Headers\.prototype|sendBeacon/ig],
  ['indexedDB', /indexedDB|IDBFactory|IDBRequest|IDBOpenDBRequest|IDBKeyRange|IDBDatabase/ig],
  ['history', /\bhistory\b|pushState|replaceState|popstate|referrer/ig],
];

const REALISM_PATTERNS = [
  ['Function.prototype.toString', /Function\.prototype\.toString|\.toString\s*\(\)/ig],
  ['Object.prototype.toString', /Object\.prototype\.toString|\[object\s+[A-Za-z]+]/ig],
  ['descriptor', /Object\.getOwnPropertyDescriptor|Object\.getOwnPropertyDescriptors|defineProperty|getOwnPropertyDescriptor/ig],
  ['prototype', /Object\.getPrototypeOf|setPrototypeOf|__proto__|prototype/ig],
  ['ownKeys', /Reflect\.ownKeys|Object\.keys|getOwnPropertyNames|getOwnPropertySymbols/ig],
  ['instanceof', /\binstanceof\b/ig],
  ['constructor.name', /constructor\.name|\.constructor\b/ig],
  ['Symbol.toStringTag', /Symbol\.toStringTag|@@toStringTag/ig],
];

const ASYNC_PATTERNS = [
  ['Promise', /\bPromise\b|queueMicrotask|then\(/ig],
  ['timer', /setTimeout|setInterval|requestAnimationFrame|cancelAnimationFrame/ig],
  ['message', /postMessage|MessageChannel|BroadcastChannel|message event/ig],
  ['observer', /MutationObserver|IntersectionObserver|ResizeObserver|PerformanceObserver/ig],
  ['xhr-fetch', /\bfetch\b|XMLHttpRequest|readystatechange|loadend/ig],
  ['indexedDB-async', /IDBRequest|onsuccess|onerror|transaction|openCursor/ig],
];

function countMatches(text, pattern) {
  pattern.lastIndex = 0;
  let count = 0;
  while (pattern.exec(text)) count += 1;
  return count;
}

function emptySignalMap(items) {
  return Object.fromEntries(items.map(([name]) => [name, 0]));
}

function discoverTraceFiles(args) {
  const files = [];
  for (const item of args.traces) {
    const resolved = path.resolve(item);
    if (exists(resolved)) files.push(resolved);
  }
  if (args.caseDir) {
    const caseDir = path.resolve(args.caseDir);
    const candidates = [
      path.join(caseDir, 'ruyi-trace', 'logs'),
      path.join(caseDir, 'tmp'),
      path.join(caseDir, 'notes'),
    ];
    for (const candidate of candidates) {
      for (const file of walk(candidate)) {
        if (/\.(ndjson|jsonl|json)$/i.test(file) && /trace|missing-env|ruyi|env/i.test(path.basename(file))) {
          files.push(file);
        }
      }
    }
  }
  return uniq(files);
}

function inspectLine(text, summary) {
  for (const [name, pattern] of CATEGORY_PATTERNS) {
    summary.categories[name] += countMatches(text, pattern);
  }
  for (const [name, pattern] of REALISM_PATTERNS) {
    summary.realism[name] += countMatches(text, pattern);
  }
  for (const [name, pattern] of ASYNC_PATTERNS) {
    summary.async[name] += countMatches(text, pattern);
  }

  const stackMatches = text.match(/(?:stack\.file|filename|file|url)["']?\s*[:=]\s*["']?([^"',\s)]+)/ig);
  if (stackMatches) {
    for (const raw of stackMatches.slice(0, 20)) summary.stackSignals.add(raw.slice(0, 160));
  }
}

function analyzeFile(file, args) {
  const result = {
    file,
    lines: 0,
    bytes: 0,
    truncatedByMaxLines: false,
    parseErrors: 0,
  };
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  result.bytes = Buffer.byteLength(text);
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    if (result.lines >= args.maxLines) {
      result.truncatedByMaxLines = true;
      break;
    }
    result.lines += 1;
  }
  return { result, lines: lines.slice(0, args.maxLines) };
}

function scoreSummary(summary) {
  const hitCategories = Object.entries(summary.categories).filter(([, count]) => count > 0).map(([name]) => name);
  const hitRealism = Object.entries(summary.realism).filter(([, count]) => count > 0).map(([name]) => name);
  const hitAsync = Object.entries(summary.async).filter(([, count]) => count > 0).map(([name]) => name);
  const fingerprintHits = ['canvas', 'webgl', 'webgpu', 'audio', 'dom-geometry'].filter(name => summary.categories[name] > 0);
  const stateHits = ['storage', 'cookie', 'indexedDB', 'history', 'performance-time', 'crypto'].filter(name => summary.categories[name] > 0);

  let score = 0;
  score += hitCategories.length * 2;
  score += hitRealism.length * 3;
  score += fingerprintHits.length * 4;
  score += hitAsync.length * 2;
  score += stateHits.length * 2;
  if (summary.stackSignals.size >= 10) score += 6;
  else if (summary.stackSignals.size >= 3) score += 3;

  let level = '未知';
  if (summary.files.length === 0 || summary.totalLines === 0) level = '未知';
  else if (score >= 45 || fingerprintHits.length >= 3 || hitRealism.length >= 5) level = '高';
  else if (score >= 18 || fingerprintHits.length >= 1 || hitRealism.length >= 2) level = '中';
  else level = '低';

  return {
    score,
    level,
    hitCategories,
    hitRealism,
    hitAsync,
    fingerprintHits,
    stateHits,
    stackSignalCount: summary.stackSignals.size,
  };
}

function analyze(args) {
  const files = discoverTraceFiles(args);
  const root = args.caseDir ? path.resolve(args.caseDir) : process.cwd();
  const summary = {
    files: files.map(file => rel(root, file)),
    totalLines: 0,
    totalBytes: 0,
    categories: emptySignalMap(CATEGORY_PATTERNS),
    realism: emptySignalMap(REALISM_PATTERNS),
    async: emptySignalMap(ASYNC_PATTERNS),
    fileSummaries: [],
    stackSignals: new Set(),
    parseErrors: 0,
  };

  for (const file of files) {
    const { result, lines } = analyzeFile(file, args);
    summary.fileSummaries.push({
      ...result,
      file: rel(root, file),
    });
    summary.totalLines += result.lines;
    summary.totalBytes += result.bytes;
    for (const line of lines) {
      if (!line.trim()) continue;
      inspectLine(line, summary);
    }
  }

  const score = scoreSummary(summary);
  return {
    passed: true,
    complexity: score.level,
    score: score.score,
    source: {
      files: summary.files,
      totalLines: summary.totalLines,
      totalBytes: summary.totalBytes,
      fileSummaries: summary.fileSummaries,
    },
    signals: {
      categories: summary.categories,
      realism: summary.realism,
      async: summary.async,
      hitCategories: score.hitCategories,
      hitRealism: score.hitRealism,
      hitAsync: score.hitAsync,
      fingerprintHits: score.fingerprintHits,
      stateHits: score.stateHits,
      stackSignalCount: score.stackSignalCount,
    },
    conclusion: {
      frameworkBinding: false,
      note: 'Trace 复杂度评估只用于补环境范围、风险点和优先级，不自动决定是否使用 isolated-vm、vm 或 jsEnv。',
    },
  };
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# Trace 复杂度评估报告');
  lines.push('');
  lines.push(`- 复杂度等级：${result.complexity}`);
  lines.push(`- 分数：${result.score}`);
  lines.push(`- Trace 文件数：${result.source.files.length}`);
  lines.push(`- Trace 总行数：${result.source.totalLines}`);
  lines.push('- 与补环境框架关系：复杂度评估不决定框架选择，是否使用 isolated-vm / vm / jsEnv 仍以用户确认为准。');
  lines.push('');

  if (!result.source.files.length) {
    lines.push('未发现可用 Trace 日志，无法基于日志评估复杂度。');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('## 命中的 WebAPI 类别');
  lines.push('');
  lines.push(result.signals.hitCategories.length ? result.signals.hitCategories.map(x => `- ${x}：${result.signals.categories[x]}`).join('\n') : '- 无明显命中');
  lines.push('');

  lines.push('## 真实性检测信号');
  lines.push('');
  lines.push(result.signals.hitRealism.length ? result.signals.hitRealism.map(x => `- ${x}：${result.signals.realism[x]}`).join('\n') : '- 无明显命中');
  lines.push('');

  lines.push('## 指纹、异步和状态风险');
  lines.push('');
  lines.push(`- 指纹 API：${result.signals.fingerprintHits.join('、') || '无明显命中'}`);
  lines.push(`- 异步链路：${result.signals.hitAsync.join('、') || '无明显命中'}`);
  lines.push(`- 状态依赖：${result.signals.stateHits.join('、') || '无明显命中'}`);
  lines.push(`- 调用栈分散信号数：${result.signals.stackSignalCount}`);
  lines.push('');

  lines.push('## 文件摘要');
  lines.push('');
  lines.push('| 文件 | 行数 | 字节数 | 达到最大行限制 |');
  lines.push('|---|---:|---:|---|');
  for (const item of result.source.fileSummaries) {
    lines.push(`| ${item.file} | ${item.lines} | ${item.bytes} | ${item.truncatedByMaxLines ? '是' : '否'} |`);
  }
  lines.push('');

  lines.push('## 使用说明');
  lines.push('');
  lines.push('- 该报告用于补环境范围、优先级和阶段报告。');
  lines.push('- 不要把复杂度等级写成自动选择补环境框架的依据。');
  lines.push('- 补环境框架选择仍然必须由用户确认；用户未选择时默认不使用框架。');
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  const result = analyze(args);
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(renderMarkdown(result));
}

try {
  main();
} catch (error) {
  console.error(error && error.message ? error.message : String(error));
  process.exitCode = 2;
}
