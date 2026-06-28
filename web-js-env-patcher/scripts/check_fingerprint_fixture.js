#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = { caseDir: '', fixture: '', envFile: '', require: '', json: false, markdown: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--case-dir' || a === '--dir' || a === '-d') args.caseDir = argv[++i] || '';
    else if (a === '--fixture') args.fixture = argv[++i] || '';
    else if (a === '--env-file') args.envFile = argv[++i] || '';
    else if (a === '--require') args.require = argv[++i] || '';
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
  node scripts/check_fingerprint_fixture.js --case-dir case --require canvas,webgl --markdown
  node scripts/check_fingerprint_fixture.js --fixture case/fixtures/fingerprint.fixture.json --env-file case/result/src/env/fingerprint-env.js --json

说明：检查浏览器指纹 fixture 是否覆盖 Canvas / WebGL / WebGPU / Audio / DOM 几何等终端 API，是否绑定同一 fingerprint baseline，并检查最终 env 是否避免 node-canvas / headless-gl / 自动化浏览器等错误方向。`;
}

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function stat(p) { try { return fs.statSync(p); } catch { return null; } }
function readText(p) { return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''); }
function readJson(p) { return JSON.parse(readText(p)); }
function rel(root, p) { return (path.relative(root, p) || '.').replace(/\\/g, '/'); }
function ext(p) { return path.extname(p).toLowerCase(); }

function walk(p, out = []) {
  if (!exists(p)) return out;
  const st = stat(p);
  if (!st) return out;
  if (st.isDirectory()) {
    let names = [];
    try { names = fs.readdirSync(p); } catch { names = []; }
    for (const name of names) walk(path.join(p, name), out);
  } else if (st.isFile()) out.push(p);
  return out;
}

function countArray(v) { return Array.isArray(v) ? v.length : 0; }
function hasResultObject(v) { return !!v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(v, 'result'); }
function pickBaselineId(obj) {
  if (!obj || typeof obj !== 'object') return '';
  return String(obj.baselineId || (obj.source && obj.source.baselineId) || '');
}


const BAD_VALUE_SOURCE_RE = /(AI\s*(?:推断|猜|生成|guess)|猜测|编造|伪造|默认值|随机值|mock|fake|placeholder|static\s*analysis|静态分析|inferred|guessed|random\s*value|jsdom|node-canvas|headless-gl)/i;
const REAL_VALUE_SOURCE_RE = /(RuyiTrace|NDJSON|ruyiPage|Camoufox|CloakBrowser|手动|真实浏览器|browser|Hook|HAR|MCP|用户提供|console|network)/i;
const TRACE_TOOL_RE = /(RuyiTrace|NDJSON)/i;
const AUTOMATION_OR_USER_TOOL_RE = /(ruyiPage|Camoufox|CloakBrowser|手动|真实浏览器|browser|Hook|HAR|MCP|用户提供|console|network)/i;

function jsonText(v) {
  try { return JSON.stringify(v || {}); } catch { return String(v || ''); }
}

function sourceLabel(source) {
  if (!source || typeof source !== 'object') return '';
  return [source.capturedBy, source.tool, source.mode, source.sourceType, source.type, source.origin, source.evidence]
    .filter(Boolean).map(String).join(' ');
}

function traceStatusOf(source, record) {
  return String((record && record.traceStatus) || (source && source.traceStatus) || '');
}

function hasSourceMeta(source) {
  if (!source || typeof source !== 'object') return false;
  return !!(source.capturedBy || source.tool || source.mode || source.sourceType || source.type || source.origin || source.evidence);
}

function isTruncatedTraceStatus(status) {
  const s = String(status || '');
  if (/used-untruncated|untruncated|not-truncated/i.test(s)) return false;
  return /(^|[-_\s])truncated($|[-_\s])|疑似截断|截断/i.test(s);
}

function isTraceValueSource(source, record) {
  const status = traceStatusOf(source, record);
  const label = sourceLabel(source);
  if (/used-untruncated/i.test(status)) return true;
  if (/truncated|missing|not-covered|baseline-conflict|unused/i.test(status) && AUTOMATION_OR_USER_TOOL_RE.test(label) && !TRACE_TOOL_RE.test(String(source && source.capturedBy || ''))) return false;
  return TRACE_TOOL_RE.test(label);
}

function collectStringLengths(value, out = []) {
  if (typeof value === 'string') out.push(value.length);
  else if (Array.isArray(value)) for (const item of value) collectStringLengths(item, out);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) collectStringLengths(item, out);
  return out;
}

function collectResultRecords(node, out = [], pathParts = []) {
  if (!node || typeof node !== 'object') return out;
  if (Object.prototype.hasOwnProperty.call(node, 'result')) {
    out.push({ path: pathParts.join('.') || '$', record: node, value: node.result });
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === 'source' || key === 'valueSource' || key === 'match') continue;
    if (value && typeof value === 'object') collectResultRecords(value, out, pathParts.concat(key));
  }
  return out;
}

function validateValueSources(fp) {
  const problems = [];
  const warnings = [];
  const sourceSummary = { totalRecords: 0, inheritedSource: 0, explicitSource: 0, traceSource: 0, sampledSource: 0, longValueRecords: 0, badSourceRecords: 0 };
  const rootSource = fp && fp.source;

  function validateSource(source, label, record, inherited) {
    if (!source || typeof source !== 'object') {
      problems.push(`${label} 缺少真实值来源 source / capturedBy；必须优先使用未截断 Trace，Trace 不可用时用已确认取证工具采样，不能由 AI 猜值。`);
      return;
    }
    const sourceText = jsonText(source);
    const labelText = sourceLabel(source);
    const isFixtureRoot = label === 'fixture.source';
    if (!hasSourceMeta(source)) problems.push(`${label} 的 source 缺少 mode / capturedBy / tool / sourceType 等来源字段。`);
    if (!REAL_VALUE_SOURCE_RE.test(sourceText)) problems.push(`${label} 的 source 未体现真实浏览器证据来源；请记录 RuyiTrace 未截断值，或 ruyiPage / Camoufox / CloakBrowser / 手动浏览器采样来源。`);
    if (BAD_VALUE_SOURCE_RE.test(sourceText)) {
      if (!isFixtureRoot) sourceSummary.badSourceRecords += 1;
      problems.push(`${label} 的 source 疑似为 AI 猜值、静态分析、默认值、随机值、mock 值或 Node.js 模拟库结果，不能作为最终指纹回放值。`);
    }
    const status = traceStatusOf(source, record);
    if (!status) warnings.push(`${label} 缺少 traceStatus；建议记录 used-untruncated / unused / missing / not-covered / truncated / baseline-conflict，明确是否优先检查 Trace。`);
    if (!isFixtureRoot && isTraceValueSource(source, record)) sourceSummary.traceSource += 1;
    if (!isFixtureRoot && AUTOMATION_OR_USER_TOOL_RE.test(labelText)) sourceSummary.sampledSource += 1;
  }

  validateSource(rootSource, 'fixture.source', null, false);
  const records = collectResultRecords(fp);
  sourceSummary.totalRecords = records.length;
  for (const item of records) {
    const source = item.record.source || item.record.valueSource || rootSource;
    const inherited = !(item.record.source || item.record.valueSource);
    if (inherited) sourceSummary.inheritedSource += 1;
    else sourceSummary.explicitSource += 1;
    validateSource(source, `样本 ${item.path}`, item.record, inherited);

    const lengths = collectStringLengths(item.value);
    const maxLen = lengths.length ? Math.max(...lengths) : 0;
    if (maxLen >= 3900) sourceSummary.longValueRecords += 1;
    const valueIsMarkedTruncated = item.record.truncated === true || (source && source.truncated === true);
    const status = traceStatusOf(source, item.record);
    if (valueIsMarkedTruncated) problems.push(`样本 ${item.path} 标记为 truncated=true，不能作为最终回放值；请用同一 baseline 下的取证工具补采完整值。`);
    if (isTraceValueSource(source, item.record) && (maxLen >= 3900 || isTruncatedTraceStatus(status) || valueIsMarkedTruncated)) {
      problems.push(`样本 ${item.path} 来自 Trace 且疑似长字段截断；不能把 RuyiTrace 可见片段作为完整指纹值，请用 ruyiPage / Camoufox / CloakBrowser / 手动浏览器补采完整值。`);
    }
    if (maxLen >= 3900 && inherited) {
      problems.push(`样本 ${item.path} 是长字符串 / 大结果但未记录每条样本自己的 source、valueLength 和 hash；请补充完整采样来源，避免误把 Trace 4000 字符可见片段当成真实值。`);
    }
    if (maxLen >= 3900 && !('valueLength' in item.record) && !(source && 'valueLength' in source) && !('sha256' in item.record) && !(source && 'sha256' in source)) {
      warnings.push(`样本 ${item.path} 长度达到 ${maxLen}，建议记录完整 valueLength 与 sha256，便于确认不是截断片段。`);
    }
  }
  return { problems, warnings, sourceSummary };
}

function inspectFixture(file) {
  const problems = [];
  const warnings = [];
  const counts = {
    canvasToDataURL: 0,
    canvasToBlob: 0,
    canvasMeasureText: 0,
    canvasGetImageData: 0,
    webglGetParameter: 0,
    webglGetSupportedExtensions: 0,
    webglGetExtension: 0,
    webglGetShaderPrecisionFormat: 0,
    webglReadPixels: 0,
    webgpuRequestAdapter: 0,
    audioStartRendering: 0,
    audioGetChannelData: 0,
    domGetBoundingClientRect: 0,
    domOffset: 0,
  };
  let fixture = null;
  if (!file || !exists(file)) {
    problems.push(`未找到指纹 fixture：${file || '未指定'}`);
    return { fixture, counts, problems, warnings };
  }
  try { fixture = readJson(file); } catch (err) {
    problems.push(`指纹 fixture JSON 解析失败：${err.message}`);
    return { fixture, counts, problems, warnings };
  }
  const fp = fixture.fingerprint && typeof fixture.fingerprint === 'object' ? fixture.fingerprint : fixture;
  counts.canvasToDataURL = countArray(fp.canvas && fp.canvas.toDataURL);
  counts.canvasToBlob = countArray(fp.canvas && fp.canvas.toBlob);
  counts.canvasMeasureText = countArray(fp.canvas && fp.canvas.measureText);
  counts.canvasGetImageData = countArray(fp.canvas && fp.canvas.getImageData);
  counts.webglGetParameter = countArray(fp.webgl && fp.webgl.getParameter);
  counts.webglGetSupportedExtensions = hasResultObject(fp.webgl && fp.webgl.getSupportedExtensions) ? 1 : countArray(fp.webgl && fp.webgl.getSupportedExtensions);
  counts.webglGetExtension = countArray(fp.webgl && fp.webgl.getExtension);
  counts.webglGetShaderPrecisionFormat = countArray(fp.webgl && fp.webgl.getShaderPrecisionFormat);
  counts.webglReadPixels = countArray(fp.webgl && fp.webgl.readPixels);
  counts.webgpuRequestAdapter = countArray(fp.webgpu && fp.webgpu.requestAdapter);
  counts.audioStartRendering = countArray(fp.audio && fp.audio.startRendering);
  counts.audioGetChannelData = countArray(fp.audio && fp.audio.getChannelData);
  counts.domGetBoundingClientRect = countArray(fp.domGeometry && fp.domGeometry.getBoundingClientRect);
  counts.domOffset = countArray(fp.domGeometry && fp.domGeometry.offset);

  const baselineId = pickBaselineId(fp);
  if (!baselineId) problems.push('指纹 fixture 缺少 baselineId；必须先创建 case/notes/fingerprint-baseline.json，并让 fixture 绑定同一 baselineId。');
  if (!fp.source) problems.push('指纹 fixture 缺少 source 字段；必须记录真实值来源，优先使用未截断 Trace，Trace 不可用时使用已确认取证工具采样。');
  const sourceResult = validateValueSources(fp);
  problems.push(...sourceResult.problems);
  warnings.push(...sourceResult.warnings);
  return { fixture: fp, baselineId, counts, problems, warnings, sourceSummary: sourceResult.sourceSummary };
}

function inspectBaseline(caseDir, fixtureResult) {
  const problems = [];
  const warnings = [];
  const baselineFile = path.join(caseDir, 'notes', 'fingerprint-baseline.json');
  const result = { file: baselineFile, present: exists(baselineFile), baselineId: '', conflicts: [] };
  if (!result.present) {
    problems.push('缺少指纹基线文件 case/notes/fingerprint-baseline.json；涉及指纹采样时必须先固定同一 case 的 fingerprint baseline。');
    return { result, problems, warnings };
  }
  let baseline;
  try { baseline = readJson(baselineFile); } catch (err) {
    problems.push(`指纹基线 JSON 解析失败：${err.message}`);
    return { result, problems, warnings };
  }
  result.baselineId = String(baseline.baselineId || '');
  if (!result.baselineId) problems.push('fingerprint-baseline.json 缺少 baselineId。');
  if (fixtureResult.baselineId && result.baselineId && fixtureResult.baselineId !== result.baselineId) {
    problems.push(`指纹 fixture baselineId 与基线不一致：fixture=${fixtureResult.baselineId}，baseline=${result.baselineId}。不得混用不同随机指纹样本。`);
  }
  const fp = fixtureResult.fixture || {};
  const source = fp.source || {};
  const checks = [
    ['userAgent', source.userAgent, baseline.navigator && baseline.navigator.userAgent],
    ['timezone', source.timezone, baseline.network && baseline.network.timezone],
    ['locale', source.locale, baseline.network && baseline.network.locale],
  ];
  for (const [name, a, b] of checks) {
    if (a && b && String(a) !== String(b)) result.conflicts.push({ field: name, fixture: String(a), baseline: String(b) });
  }
  if (result.conflicts.length) {
    problems.push(`指纹 fixture 与 baseline 核心字段冲突：${result.conflicts.map(x => `${x.field}: fixture=${x.fixture}, baseline=${x.baseline}`).join('；')}。请重新采样或生成新 baseline。`);
  }
  return { result, problems, warnings };
}

const REQUIRE_RULES = {
  canvas: ['canvasToDataURL', 'canvasMeasureText', 'canvasGetImageData'],
  webgl: ['webglGetParameter', 'webglGetSupportedExtensions', 'webglGetShaderPrecisionFormat', 'webglReadPixels'],
  webgpu: ['webgpuRequestAdapter'],
  audio: ['audioStartRendering', 'audioGetChannelData'],
  'dom-geometry': ['domGetBoundingClientRect', 'domOffset'],
  dom: ['domGetBoundingClientRect', 'domOffset'],
  font: ['canvasMeasureText', 'domOffset'],
  fonts: ['canvasMeasureText', 'domOffset'],
};

const BAD_RENDER_PATTERNS = [
  { name: 'node-canvas/canvas', pattern: /\b(require|import)\s*\(?\s*['"](?:canvas|node-canvas)['"]|from\s+['"](?:canvas|node-canvas)['"]/i },
  { name: 'headless-gl/gl', pattern: /\b(require|import)\s*\(?\s*['"](?:gl|headless-gl)['"]|from\s+['"](?:gl|headless-gl)['"]/i },
  { name: '浏览器自动化', pattern: /\b(playwright|puppeteer|selenium|cloakbrowser|ruyipage|page\.goto|browser\.launch|chromium\.launch)\b/i },
];

function inspectEnvCode(files, root) {
  const problems = [];
  const warnings = [];
  const hits = [];
  for (const file of files) {
    if (!exists(file)) continue;
    const text = readText(file);
    for (const item of BAD_RENDER_PATTERNS) {
      if (item.pattern.test(text)) hits.push({ file: rel(root, file), type: item.name });
    }
    if (/toDataURL|getImageData|measureText|getParameter|getBoundingClientRect/.test(text) && !/fingerprint|回放|replay|fixture/i.test(text)) {
      warnings.push(`${rel(root, file)} 涉及指纹终端 API，但未明显体现 fixture / replay；请确认不是在 Node.js 中伪造渲染过程。`);
    }
  }
  if (hits.length) {
    problems.push(`发现不推荐的指纹实现方向：${hits.map(h => `${h.file}(${h.type})`).join('、')}。应使用真实浏览器采样值回放，不要在最终项目中依赖渲染库或自动化浏览器计算指纹。`);
  }
  return { problems, warnings, hits };
}

function defaultFixture(caseDir) {
  const candidates = [
    path.join(caseDir, 'fixtures', 'fingerprint.fixture.json'),
    path.join(caseDir, 'fixtures', 'sample.fixture.json'),
  ];
  return candidates.find(exists) || candidates[0];
}

function defaultEnvFiles(caseDir) {
  const result = path.join(caseDir, 'result');
  return walk(result).filter(p => ['.js', '.mjs', '.cjs'].includes(ext(p)));
}

function check(args) {
  const caseDir = args.caseDir ? path.resolve(args.caseDir) : (args.fixture ? path.resolve(path.dirname(args.fixture), '..') : process.cwd());
  const fixtureFile = args.fixture ? path.resolve(args.fixture) : defaultFixture(caseDir);
  const envFiles = args.envFile ? [path.resolve(args.envFile)] : defaultEnvFiles(caseDir);
  const required = String(args.require || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const problems = [];
  const warnings = [];

  const fixtureResult = inspectFixture(fixtureFile);
  problems.push(...fixtureResult.problems);
  warnings.push(...fixtureResult.warnings);

  for (const item of required) {
    const rules = REQUIRE_RULES[item] || [];
    if (!rules.length) warnings.push(`未知 require 类型：${item}`);
    const ok = rules.some(k => fixtureResult.counts[k] > 0);
    if (!ok) problems.push(`要求 ${item} 指纹样本，但 fixture 中未发现对应终端 API 返回值。`);
  }

  const baselineResult = inspectBaseline(caseDir, fixtureResult);
  problems.push(...baselineResult.problems);
  warnings.push(...baselineResult.warnings);

  const envResult = inspectEnvCode(envFiles, caseDir);
  problems.push(...envResult.problems);
  warnings.push(...envResult.warnings);

  return {
    caseDir,
    fixtureFile,
    envFiles: envFiles.map(p => rel(caseDir, p)),
    required,
    clean: problems.length === 0,
    baseline: baselineResult.result,
    fixtureBaselineId: fixtureResult.baselineId || '',
    counts: fixtureResult.counts,
    sourceSummary: fixtureResult.sourceSummary || { totalRecords: 0, inheritedSource: 0, explicitSource: 0, traceSource: 0, sampledSource: 0, longValueRecords: 0, badSourceRecords: 0 },
    badImplementationHits: envResult.hits,
    problems,
    warnings,
  };
}

function renderMarkdown(result) {
  const lines = [
    '# 指纹 fixture 与回放实现检查',
    '',
    `case 目录：${result.caseDir}`,
    `fixture：${result.fixtureFile}`,
    `是否通过：${result.clean ? '是' : '否'}`,
    '',
    '## 指纹基线',
    `- baseline 文件：${result.baseline.file}`,
    `- baseline 是否存在：${result.baseline.present ? '是' : '否'}`,
    `- baselineId：${result.baseline.baselineId || '未发现'}`,
    `- fixture baselineId：${result.fixtureBaselineId || '未发现'}`,
    `- 核心字段冲突：${result.baseline.conflicts.length ? '是' : '否'}`,
    '',
    '## 样本覆盖统计',
  ];
  for (const [k, v] of Object.entries(result.counts)) lines.push(`- ${k}：${v}`);
  lines.push('', '## 指纹值来源检查');
  lines.push(`- result 样本数量：${result.sourceSummary.totalRecords}`);
  lines.push(`- 显式 source 样本：${result.sourceSummary.explicitSource}`);
  lines.push(`- 继承全局 source 样本：${result.sourceSummary.inheritedSource}`);
  lines.push(`- Trace 来源样本：${result.sourceSummary.traceSource}`);
  lines.push(`- 自动化 / 手动浏览器采样来源样本：${result.sourceSummary.sampledSource}`);
  lines.push(`- 长字段样本：${result.sourceSummary.longValueRecords}`);
  lines.push(`- 疑似猜值 / 默认值 / 模拟库来源样本：${result.sourceSummary.badSourceRecords}`);
  lines.push('', '## 检查的 env 文件');
  if (result.envFiles.length) for (const f of result.envFiles) lines.push(`- ${f}`);
  else lines.push('- 未发现 result 下的 JS env 文件');
  if (result.problems.length) {
    lines.push('', '## 问题');
    for (const p of result.problems) lines.push(`- ${p}`);
  }
  if (result.warnings.length) {
    lines.push('', '## 提醒');
    for (const w of result.warnings) lines.push(`- ${w}`);
  }
  return lines.join('\n') + '\n';
}

try {
  const args = parseArgs(process.argv);
  if (args.help) { console.log(usage()); process.exit(0); }
  const result = check(args);
  if (args.json) console.log(JSON.stringify(result, null, 2));
  if (args.markdown) process.stdout.write(renderMarkdown(result));
  process.exit(result.clean ? 0 : 1);
} catch (err) {
  console.error(err.message || String(err));
  console.error(usage());
  process.exit(1);
}
