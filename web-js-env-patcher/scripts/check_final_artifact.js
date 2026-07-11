#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    caseDir: null,
    file: null,
    requireFinalSummary: true,
    finalSummaryOptOut: false,
    json: false,
    markdown: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--case-dir' || a === '--dir' || a === '-d') args.caseDir = argv[++i];
    else if (a === '--file' || a === '-f') args.file = argv[++i];
    else if (a === '--no-require-final-summary' || a === '--allow-no-final-summary') {
      args.requireFinalSummary = false;
      args.finalSummaryOptOut = true;
    }
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
  node scripts/check_final_artifact.js --case-dir case --markdown
  node scripts/check_final_artifact.js --case-dir case --no-require-final-summary --markdown
  node scripts/check_final_artifact.js --case-dir case --file case/result/final.js --json

说明：检查最终交付项目是否是规范目录、只有一个执行入口、无浏览器自动化代码，并确认入口链路最终由已确认的 TLS 指纹兼容 Node.js / Python Session 请求客户端发起少量模拟请求，或明确不发真实请求；同时检查是否硬编码 / 复用了 cURL 或 fixture 中的样本加密参数值。最终总结 result/最终项目总结.md 是默认硬性要求，且必须包含 Trace-runtime 可执行闭环、XHR/fetch Session Bridge、XHR/fetch 请求语义审计、对象形状审计矩阵、WebAPI 环境检测矩阵和高强度环境检测覆盖矩阵；只有用户明确要求不生成最终总结时，才允许传入 --no-require-final-summary 并在阶段输出中记录原因。`;
}

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function stat(p) {
  try { return fs.statSync(p); } catch { return null; }
}

function readText(p) {
  return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
}

function walk(p, out = []) {
  if (!exists(p)) return out;
  const st = stat(p);
  if (!st) return out;
  if (st.isDirectory()) {
    let names = [];
    try { names = fs.readdirSync(p); } catch { names = []; }
    for (const name of names) walk(path.join(p, name), out);
  }
  out.push(p);
  return out;
}

function rel(root, p) {
  return (path.relative(root, p) || '.').replace(/\\/g, '/');
}

function ext(p) {
  return path.extname(p).toLowerCase();
}

const AUTOMATION_PATTERNS = [
  /\bruyipage\b/i,
  /\bFirefoxPage\b/,
  /\bRuyiTrace\b/i,
  /\bplaywright\b/i,
  /\bpuppeteer\b/i,
  /\bpyppeteer\b/i,
  /\bselenium\b/i,
  /\bwebdriver\b/i,
  /\bCloakBrowser\b/i,
  /\bcloakbrowser\b/i,
  /\bcamoufox\b/i,
  /\bcamoufox_reverse_mcp\b/i,
  /\bCamoufox\b/,
  /\bAsyncCamoufox\b/,
  /\bbrowser\.new_page\b/i,
  /\bbrowser\.newPage\b/i,
  /\blaunch_browser\s*\(/i,
  /\bnetwork_capture\s*\(/i,
  /\bbrowser-use\b/i,
  /\bchromium\.launch\b/i,
  /\bfirefox\.launch\b/i,
  /\bbrowser\.launch\b/i,
  /\bpage\.goto\s*\(/i,
  /\bpage\.capture\b/i,
  /\bCDP\b/,
  /\bMarionette\b/i,
];

const JS_REQUEST_PATTERNS = [
  /\bcycleTLS\s*\(/i,
  /\bCycleTLS\b/,
  /\bcycletls\b/i,
  /\bimpers\b/i,
  /\bimpersFetch\b/i,
  /\bcurl-cffi\b/i,
  /\bcurl-cffi-node\b/i,
  /require\s*\(\s*['"]curl-cffi['"]\s*\)/,
  /from\s+['"]curl-cffi['"]/,
  /\bCurlSession\b/,
  /\bCurlRequest\b/,
  /\breq\.request\s*\(/,
];

const REQUEST_SESSION_PATTERNS = [
  /\bcreateRequestSession\s*\(/i,
  /\bcreate_request_session\s*\(/i,
  /\bSession\s*\(/,
  /\brequests\.Session\s*\(/,
  /\bCurlSession\b/,
  /\bCookieJar\b/i,
  /\btough-cookie\b/i,
  /\bcookieJar\b/,
  /\bsession\.request\s*\(/i,
  /\bsession\.close\s*\(/i,
  /\bjar\.setCookie/i,
  /Set-Cookie/i,
  /销毁\s*session/i,
  /清理\s*Cookie\s*jar/i,
];

const PY_REQUEST_PATTERNS = [
  /\bcurl_cffi\b/,
  /\bcffi_curl\b/,
  /\bcyCronet\b/i,
  /\bcycronet\b/i,
];

const NO_REAL_REQUEST_PATTERNS = [
  /不发真实请求/,
  /不发送真实请求/,
  /只输出本地\s*(sign|参数)/i,
  /仅输出本地\s*(sign|参数)/i,
  /\bnoRealRequest\b/i,
  /\bno-real-request\b/i,
  /\bdryRunOnly\b/i,
  /\blocalSignOnly\b/i,
];

const FINGERPRINT_RENDER_PATTERNS = [
  /\b(require|import)\s*\(?\s*['"](?:canvas|node-canvas|gl|headless-gl)['"]|from\s+['"](?:canvas|node-canvas|gl|headless-gl)['"]/i,
  /__WEB_JS_ENV_PATCHER_FINGERPRINT__/,
  /generate_fingerprint_hook/i,
];

function findMatches(text, patterns) {
  const hits = [];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) hits.push(pattern.toString());
  }
  return hits;
}

function isTextLikeFile(p) {
  return ['.js', '.mjs', '.cjs', '.py', '.json', '.md', '.txt', '.yaml', '.yml', '.curl', '.http', '.har'].includes(ext(p));
}

function isCodeLikeFile(p) {
  return ['.js', '.mjs', '.cjs', '.py', '.json'].includes(ext(p));
}

function isTempOrTestFile(p) {
  const n = path.basename(p).toLowerCase();
  const normalized = String(p).replace(/\\/g, '/').toLowerCase();
  if (/(^|\/)(tmp|\.tmp|temp|\.temp|cache|\.cache|browser-profile|firefox-profile|chrome-profile|profile|screenshots|hooks|ruyi-trace|logs|trace)(\/|$)/.test(normalized)) return true;
  if (/\.(tmp|temp|log|jsonl|har|png|jpg|jpeg|webp|trace|cache|bak|old|orig|retry|partial|download|crdownload)$/i.test(n)) return true;
  if (/^(test-|tmp-|temp-|debug-|scratch-)/i.test(n)) return true;
  if (/\b(test|spec|debug|scratch|trace|hook|fixture|mock)\b/i.test(n)) return true;
  return false;
}

function isRootSecondEntry(resultDir, p, primary) {
  if (path.dirname(p) !== resultDir) return false;
  if (path.resolve(p) === path.resolve(primary)) return false;
  const n = path.basename(p).toLowerCase();
  if (n === 'package.json' || n === 'requirements.txt' || n === 'config.example.json') return false;
  return ['.js', '.mjs', '.cjs', '.py'].includes(ext(p));
}

function inspectPackageJson(resultDir, problems, warnings) {
  const pkg = path.join(resultDir, 'package.json');
  if (!exists(pkg)) return;
  let data;
  try {
    data = JSON.parse(readText(pkg));
  } catch (err) {
    problems.push(`package.json 解析失败：${err.message}`);
    return;
  }
  const scripts = data.scripts || {};
  for (const [name, cmd] of Object.entries(scripts)) {
    const lowerName = name.toLowerCase();
    const lowerCmd = String(cmd).toLowerCase();
    if (lowerName === 'start') {
      if (!/\bnode\s+(\.\/)?final\.js\b/.test(lowerCmd)) warnings.push('package.json 的 start 脚本建议只指向 node final.js');
    } else if (/(test|debug|dev|server|serve|watch|browser|playwright|puppeteer)/i.test(lowerName + ' ' + lowerCmd)) {
      problems.push(`package.json 存在非交付用途脚本：${name}=${cmd}`);
    }
  }
}

const CRYPTO_PARAM_NAME_RE = /^(?:sign|signature|_signature|x[-_]?sign|x[-_]?s|x[-_]?t|a[_-]?bogus|h5st|mtgsig|w[_-]?rid|x[-_]?bogus|x[-_]?(?:ladon|argus|gorgon|khronos|ss[-_]?stub|mini[-_]?wua|umt)|token|access[-_]?token|auth[-_]?token|x[-_]?token|csrf[-_]?token|csrftoken|verify|digest|hash|hmac|mac|nonce|sig)$/i;

function isPlaceholderValue(value) {
  const s = String(value || '');
  return !s || s.length < 8 || /^(?:xxx+|test+|example|placeholder|todo|replace|redacted|your[_-]?)/i.test(s) || /^[*]+$/.test(s);
}

function isLikelyConcatenationFragment(value) {
  const s = String(value || '');
  const t = s.trim();
  return /(?:^|\s)\+\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\s*\+\s*)?$/.test(s)
    || /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\s*\+(?:\s|$)/.test(t)
    || (/^\+/.test(t) || /\+$/.test(t)) && /\s/.test(s);
}

function maskCryptoValue(value) {
  const s = String(value || '');
  if (s.length <= 8) return '*'.repeat(s.length);
  return `${s.slice(0, 4)}...${s.slice(-4)}(len=${s.length})`;
}

function addSampleCryptoValue(out, name, value, sourceFile, sourcePath) {
  if (!CRYPTO_PARAM_NAME_RE.test(String(name || ''))) return;
  if (isPlaceholderValue(value)) return;
  const key = `${String(name).toLowerCase()}:${String(value)}`;
  if (out.has(key)) return;
  out.set(key, { name: String(name), value: String(value), masked: maskCryptoValue(value), sourceFile, sourcePath });
}

function decodeURIComponentSafe(s) { try { return decodeURIComponent(s); } catch { return s; } }

function extractJsonCryptoValues(obj, out, sourceFile, prefix = 'json') {
  if (!obj || typeof obj !== 'object') return;
  for (const [k, v] of Object.entries(obj)) {
    const p = `${prefix}.${k}`;
    if (v && typeof v === 'object') extractJsonCryptoValues(v, out, sourceFile, p);
    else addSampleCryptoValue(out, k, v, sourceFile, p);
  }
}

function extractSampleCryptoValuesFromText(text, sourceFile) {
  const out = new Map();
  const urlRe = /https?:\/\/[^\s'"<>]+/g;
  let m;
  while ((m = urlRe.exec(text))) {
    try {
      const u = new URL(m[0]);
      for (const [k, v] of u.searchParams.entries()) addSampleCryptoValue(out, k, v, sourceFile, `query.${k}`);
    } catch (_) {}
  }
  try { extractJsonCryptoValues(JSON.parse(text), out, sourceFile, 'json'); } catch (_) {}
  const pairRe = /["']?([A-Za-z_$][\w$-]{0,80})["']?\s*(?::|=)\s*["']([^"'\r\n&;,}\s]{8,})["']/g;
  while ((m = pairRe.exec(text))) addSampleCryptoValue(out, m[1], m[2], sourceFile, `pair.${m[1]}`);
  const formRe = /(?:^|[?&\s])([A-Za-z_$][\w$-]{0,80})=([^&\s'"<>]{8,})/g;
  while ((m = formRe.exec(text))) addSampleCryptoValue(out, m[1], decodeURIComponentSafe(m[2]), sourceFile, `form.${m[1]}`);
  const headerRe = /(?:^|\s)(?:-H|--header)\s+['"]([^:'"]{1,100})\s*:\s*([^'"\r\n]+)['"]/g;
  while ((m = headerRe.exec(text))) {
    const headerName = m[1].trim();
    const headerValue = m[2].trim();
    addSampleCryptoValue(out, headerName, headerValue, sourceFile, `header.${headerName}`);
    if (headerName.toLowerCase() === 'cookie') {
      for (const part of headerValue.split(';')) {
        const idx = part.indexOf('=');
        if (idx !== -1) {
          const cookieName = part.slice(0, idx).trim();
          const cookieValue = part.slice(idx + 1).trim();
          addSampleCryptoValue(out, cookieName, cookieValue, sourceFile, `cookie.${cookieName}`);
        }
      }
    }
  }
  return [...out.values()];
}

function collectSampleCryptoValues(caseDir) {
  const roots = ['requests', 'fixtures'].map(d => path.join(caseDir, d)).filter(exists);
  const values = [];
  for (const root of roots) {
    for (const f of walk(root).filter(p => stat(p) && stat(p).isFile() && isTextLikeFile(p))) {
      for (const item of extractSampleCryptoValuesFromText(readText(f), rel(caseDir, f))) values.push(item);
    }
  }
  return values;
}

function inspectReusedSampleCryptoValues(caseDir, resultFiles, textFiles) {
  const sampleValues = collectSampleCryptoValues(caseDir);
  const reused = [];
  for (const sample of sampleValues) {
    for (const f of textFiles) {
      const text = readText(f);
      if (text.includes(sample.value)) reused.push({ file: rel(caseDir, f), name: sample.name, value: sample.masked, source: sample.sourceFile, sourcePath: sample.sourcePath });
    }
  }
  const hardcoded = [];
  const hardcodedRe = /["']?([A-Za-z_$][\w$-]{0,80})["']?\s*(?::|=)\s*["']([^"'\r\n]{8,})["']/g;
  for (const f of resultFiles.filter(isCodeLikeFile)) {
    const text = readText(f);
    let m;
    while ((m = hardcodedRe.exec(text))) {
      const name = m[1];
      const value = m[2];
      if (CRYPTO_PARAM_NAME_RE.test(name) && !isPlaceholderValue(value) && !isLikelyConcatenationFragment(value)) {
        hardcoded.push({ file: rel(caseDir, f), name, value: maskCryptoValue(value) });
      }
    }
  }
  const generationEvidence = [];
  const generationRe = /install.*env|补环境|signer|makeSign|generate(?:Sign|Token|Params?)|compute(?:Sign|Token|Params?)|build(?:Sign|Token|Params?)|runTarget|target[\\/]entry|src[\\/]signer|vm\.Script|load.*(?:bundle|target|js)|createContext/i;
  for (const f of resultFiles.filter(isCodeLikeFile)) {
    const text = readText(f);
    if (generationRe.test(text)) generationEvidence.push(rel(caseDir, f));
  }
  return {
    sampleValues: sampleValues.map(x => ({ name: x.name, value: x.masked, source: x.sourceFile, sourcePath: x.sourcePath })),
    reused,
    hardcoded,
    generationEvidence,
  };
}


function inspectStageReports(caseDir) {
  const stageDir = path.join(caseDir, '阶段报告');
  const result = { dir: stageDir, present: exists(stageDir), files: [], initialPresent: false, chineseFileNames: true, mojibakeSuspected: false };
  const problems = [];
  const warnings = [];
  if (!result.present) {
    problems.push('缺少阶段报告目录 case/阶段报告；至少应在前置阶段生成中文命名阶段报告 01-需求信息确认.md。');
    return { result, problems, warnings };
  }
  let names = [];
  try { names = fs.readdirSync(stageDir); } catch { names = []; }
  for (const name of names) {
    const file = path.join(stageDir, name);
    const st = stat(file);
    if (!st || !st.isFile() || ext(file) !== '.md') continue;
    const item = { file, chineseFileName: /[\u4e00-\u9fff]/.test(name), utf8Readable: false, mojibakeSuspected: false };
    if (!item.chineseFileName) result.chineseFileNames = false;
    try {
      const text = readText(file);
      item.utf8Readable = true;
      const questionRuns = text.match(/\?{3,}/g) || [];
      item.mojibakeSuspected = text.includes('\uFFFD') || (questionRuns.reduce((n, x) => n + x.length, 0) >= 8 && !/[\u4e00-\u9fff]/.test(text));
      if (item.mojibakeSuspected) result.mojibakeSuspected = true;
    } catch (_) {}
    result.files.push(item);
  }
  result.initialPresent = result.files.some(x => path.basename(x.file) === '01-需求信息确认.md');
  if (!result.files.length) problems.push('case/阶段报告 中没有 Markdown 阶段报告。');
  if (!result.initialPresent) problems.push('缺少前置阶段报告：case/阶段报告/01-需求信息确认.md。');
  if (!result.chineseFileNames) problems.push('阶段报告文件名必须包含中文，不能只使用英文文件名。');
  if (result.mojibakeSuspected) problems.push('阶段报告疑似存在中文乱码或连续问号。');
  return { result, problems, warnings };
}

const FINAL_SUMMARY_REQUIRED_SECTIONS = [
  /阶段报告索引/,
  /native addon\s*\/\s*NativeProtect 使用情况/i,
  /环境与指纹\s*API\s*调用回放明细/i,
  /Trace-runtime 可执行闭环/i,
  /XHR\/fetch Session Bridge/i,
  /XHR\/fetch 请求语义审计/i,
  /对象形状审计矩阵与私有状态泄露/,
  /WebAPI 环境检测矩阵/,
  /高强度环境检测覆盖矩阵/,
  /加密参数生成与样本复用检查/,
  /代码质量与中文注释/,
  /最终交付结构/,
  /指纹基线一致性/,
  /Session\s*请求链|Session 模式|TLS 请求验证与 Session 请求链/i,
  /测试结果/,
  /清理结果/,
];

function inspectFinalSummary(resultDir, requireFinalSummary) {
  const finalSummary = path.join(resultDir, '最终项目总结.md');
  const legacyFinalSummary = path.join(resultDir, 'final-summary.md');
  const result = {
    required: !!requireFinalSummary,
    file: exists(finalSummary) ? finalSummary : '',
    legacyFile: exists(legacyFinalSummary) ? legacyFinalSummary : '',
    present: exists(finalSummary),
    utf8Readable: false,
    mojibakeSuspected: false,
    missingSections: [],
  };
  const problems = [];
  const warnings = [];
  if (!requireFinalSummary) return { result, problems, warnings };
  if (!result.present) {
    if (exists(legacyFinalSummary)) problems.push('最终总结必须使用中文文件名 result/最终项目总结.md；当前只检测到旧文件名 result/final-summary.md，请改名或重新写入。');
    else problems.push('项目完成后必须默认生成最终总结 result/最终项目总结.md；只有用户明确要求不生成时才可跳过，并需运行检查脚本时传入 --no-require-final-summary。');
    return { result, problems, warnings };
  }
  let text = '';
  try {
    text = readText(finalSummary);
    result.utf8Readable = true;
  } catch (err) {
    problems.push(`最终总结无法按 UTF-8 读取：${err.message || String(err)}`);
    return { result, problems, warnings };
  }
  if (/\uFFFD/.test(text) || /\?{6,}/.test(text) || (!/[\u4e00-\u9fff]/.test(text) && /[?]{3,}/.test(text))) {
    result.mojibakeSuspected = true;
    problems.push('最终总结疑似存在中文编码乱码或连续问号，请使用 write_markdown_utf8.js 重新生成 UTF-8 Markdown。');
  }
  for (const pattern of FINAL_SUMMARY_REQUIRED_SECTIONS) {
    if (!pattern.test(text)) result.missingSections.push(pattern.toString());
  }
  if (result.missingSections.length) {
    problems.push(`最终总结缺少必要章节：${result.missingSections.join('、')}。项目完成后的总结必须包含 native addon / NativeProtect 使用情况、指纹基线一致性、环境与指纹 API 调用回放明细、Trace-runtime 可执行闭环、XHR/fetch Session Bridge、XHR/fetch 请求语义审计、对象形状审计矩阵与私有状态泄露、WebAPI 环境检测矩阵、高强度环境检测覆盖矩阵、最终请求 Session 请求链、加密参数生成与样本复用检查、代码质量与中文注释、最终交付结构、测试结果和清理结果。`);
  }
  if (!/^#\s+/.test(text.trim())) warnings.push('最终总结建议以一级标题开头。');
  return { result, problems, warnings };
}


function check(args) {
  if (!args.caseDir && !args.file) throw new Error('必须提供 --case-dir 或 --file');
  const caseDir = args.caseDir ? path.resolve(args.caseDir) : path.resolve(path.dirname(args.file), '..');
  const resultDir = path.join(caseDir, 'result');
  const problems = [];
  const warnings = [];

  if (!exists(caseDir)) problems.push(`case 目录不存在：${caseDir}`);
  if (!exists(resultDir)) problems.push(`结果目录不存在：${resultDir}`);

  const candidate = args.file ? path.resolve(args.file) : null;
  let primary = candidate;
  if (!primary && exists(resultDir)) {
    const candidates = ['final.js', 'final.py'].map(name => path.join(resultDir, name)).filter(exists);
    if (candidates.length === 1) primary = candidates[0];
    else if (candidates.length === 0) problems.push('未找到唯一执行入口：result/final.js 或 result/final.py');
    else problems.push('同时存在 final.js 和 final.py；最终项目只能有一个执行入口');
  }

  const resultFiles = exists(resultDir) ? walk(resultDir).filter(p => stat(p) && stat(p).isFile()) : [];
  const textFiles = resultFiles.filter(isTextLikeFile);
  const codeFiles = resultFiles.filter(isCodeLikeFile);

  if (primary && !exists(primary)) problems.push(`指定执行入口不存在：${primary}`);
  if (primary && exists(primary)) {
    const primaryExt = ext(primary);
    if (!['.js', '.py'].includes(primaryExt)) problems.push('执行入口必须是 final.js 或 final.py');
    if (path.dirname(primary) !== resultDir) warnings.push('执行入口不在 case/result/ 目录中，建议移动到 result/final.js 或 result/final.py');

    const text = readText(primary);
    if (primaryExt === '.js' && !/require\.main\s*===\s*module|import\.meta\.url|main\s*\(\s*\)\.catch|await\s+main\s*\(/.test(text)) {
      warnings.push('未检测到清晰的 Node.js 直接运行入口；建议提供 main() 并在命令行运行时调用');
    }
    if (primaryExt === '.py' && !/if\s+__name__\s*==\s*['"]__main__['"]/.test(text)) {
      warnings.push('未检测到 Python 直接运行入口 if __name__ == "__main__"');
    }

    const rootSecondEntries = resultFiles.filter(p => isRootSecondEntry(resultDir, p, primary));
    if (rootSecondEntries.length) {
      problems.push(`结果目录根部存在多个疑似执行入口：${rootSecondEntries.map(p => rel(caseDir, p)).join('、')}`);
    }

    const requestPatterns = primaryExt === '.py' ? PY_REQUEST_PATTERNS : JS_REQUEST_PATTERNS;
    const requestSearchFiles = codeFiles.filter(p => primaryExt === '.py' ? ext(p) === '.py' : ['.js', '.mjs', '.cjs'].includes(ext(p)));
    const requestHits = [];
    const noRealRequestHits = [];
    for (const f of requestSearchFiles) {
      const text = readText(f);
      const hits = findMatches(text, requestPatterns);
      if (hits.length) requestHits.push({ file: rel(caseDir, f), hits });
      const noRealHits = findMatches(text, NO_REAL_REQUEST_PATTERNS);
      if (noRealHits.length) noRealRequestHits.push({ file: rel(caseDir, f), hits: noRealHits });
    }
    const sessionHits = [];
    for (const f of requestSearchFiles) {
      const text = readText(f);
      const hits = findMatches(text, REQUEST_SESSION_PATTERNS);
      if (hits.length) sessionHits.push({ file: rel(caseDir, f), hits });
    }
    if (!requestHits.length && !noRealRequestHits.length) {
      problems.push('未检测到已确认的 TLS 指纹兼容请求客户端（Node.js CycleTLS / impers / curl-cffi-node，或 Python curl_cffi / cffi_curl / cyCronet）；最终验证不能依赖普通 fetch/requests 或浏览器自动化。如用户不发真实请求，入口必须明确只输出本地 sign / 参数。');
    }
    if (requestHits.length && !noRealRequestHits.length && !sessionHits.length) {
      problems.push('最终请求必须使用 Session 模式：即使只有一个请求，也要创建 session client，复用 Cookie jar / Header / UA / Client Hints / TLS 指纹，并在成功或失败后销毁 session。未检测到 createRequestSession / requests.Session / CookieJar / session.close 等证据。');
    }
  }

  const automationHits = [];
  for (const f of codeFiles) {
    const hits = findMatches(readText(f), AUTOMATION_PATTERNS);
    if (hits.length) automationHits.push({ file: rel(caseDir, f), hits });
  }
  if (automationHits.length) {
    problems.push(`最终项目源码疑似包含浏览器自动化 / 取证代码：${automationHits.map(x => `${x.file}(${x.hits.join('、')})`).join('；')}`);
  }

  const fingerprintRenderHits = [];
  for (const f of codeFiles) {
    const hits = findMatches(readText(f), FINGERPRINT_RENDER_PATTERNS);
    if (hits.length) fingerprintRenderHits.push({ file: rel(caseDir, f), hits });
  }
  if (fingerprintRenderHits.length) {
    problems.push(`最终项目源码疑似包含指纹采样 Hook 或 Node.js 渲染库：${fingerprintRenderHits.map(x => `${x.file}(${x.hits.join('、')})`).join('；')}。指纹应由真实浏览器采样 fixture + 终端 API 值回放实现，采样 Hook 不得进入 result/。`);
  }

  const reuse = exists(resultDir) ? inspectReusedSampleCryptoValues(caseDir, resultFiles, textFiles) : { sampleValues: [], reused: [], hardcoded: [], generationEvidence: [] };
  if (reuse.reused.length) {
    problems.push(`最终项目疑似直接复用了请求样本 / fixture 中的加密参数值：${reuse.reused.map(x => `${x.file} 中 ${x.name}=${x.value}（来源 ${x.source}:${x.sourcePath}）`).join('；')}。这些值只能作为 expected fixture，必须通过补环境重新生成。`);
  }
  if (reuse.hardcoded.length) {
    problems.push(`最终项目疑似硬编码加密参数字面量：${reuse.hardcoded.map(x => `${x.file} 中 ${x.name}=${x.value}`).join('；')}。应调用补环境后的目标 JS 入口或 signer 模块生成，不能写死 cURL 里的值。`);
  }
  if (reuse.sampleValues.length && !reuse.generationEvidence.length) {
    warnings.push('发现请求样本中存在可疑加密参数，但最终项目未明显体现补环境 / signer / 目标 JS 入口调用痕迹；请人工确认不是直接复用样本参数。');
  }

  const tempLike = resultFiles.filter(p => isTempOrTestFile(rel(resultDir, p)));
  if (tempLike.length) problems.push(`结果目录存在临时 / 测试 / 调试产物：${tempLike.map(p => rel(caseDir, p)).join('、')}`);

  inspectPackageJson(resultDir, problems, warnings);

  const stageReports = inspectStageReports(caseDir);
  problems.push(...stageReports.problems);
  warnings.push(...stageReports.warnings);

  const finalSummary = exists(resultDir) ? inspectFinalSummary(resultDir, args.requireFinalSummary) : {
    result: { required: !!args.requireFinalSummary, file: '', present: false, utf8Readable: false, mojibakeSuspected: false, missingSections: [] },
    problems: [],
    warnings: [],
  };
  problems.push(...finalSummary.problems);
  warnings.push(...finalSummary.warnings);

  return {
    caseDir,
    resultDir,
    entryFile: primary || null,
    clean: problems.length === 0,
    problems,
    warnings,
    reusedCryptoCheck: reuse,
    finalSummary: finalSummary.result,
    stageReports: stageReports.result,
    finalSummaryOptOut: args.finalSummaryOptOut,
    resultFiles: resultFiles.map(p => rel(caseDir, p)),
  };
}

function renderMarkdown(result) {
  const lines = [
    '# 最终项目检查结果',
    '',
    `case 目录：${result.caseDir}`,
    `结果目录：${result.resultDir}`,
    `唯一执行入口：${result.entryFile || '未找到'}`,
    `是否通过：${result.clean ? '是' : '否'}`,
    '',
    '## 检查项',
    `- 是否只有一个执行入口：${result.problems.some(p => p.includes('执行入口')) ? '否' : '是'}`,
    `- 是否不含浏览器自动化代码：${result.problems.some(p => p.includes('自动化')) ? '否' : '是'}`,
    `- 是否检测到 TLS 指纹兼容请求客户端或明确不发真实请求：${result.problems.some(p => p.includes('TLS 指纹兼容请求客户端')) ? '否' : '是'}`,
    `- 是否使用 Session 模式并具备销毁逻辑：${result.problems.some(p => p.includes('Session 模式')) ? '否' : '是'}`,
    `- 是否不含指纹采样 Hook / Node.js 渲染库：${result.problems.some(p => p.includes('指纹采样 Hook') || p.includes('渲染库')) ? '否' : '是'}`,
    `- 是否未复用 cURL / fixture 中的加密参数样本值：${result.reusedCryptoCheck.reused.length || result.reusedCryptoCheck.hardcoded.length ? '否' : '是'}`,
    `- 是否已生成中文命名最终总结且包含 API 调用回放明细、Trace-runtime 闭环、XHR/fetch Session Bridge、请求语义审计、对象形状审计矩阵、WebAPI 环境检测矩阵和高强度检测矩阵：${result.finalSummary.required ? (result.finalSummary.present && !result.finalSummary.mojibakeSuspected && !result.finalSummary.missingSections.length ? '是' : '否') : (result.finalSummaryOptOut ? '用户明确豁免' : '未强制检查')}`,
    `- result 目录是否无临时 / 测试产物：${result.problems.some(p => p.includes('临时') || p.includes('测试')) ? '否' : '是'}`,
    '',
    '## 样本加密参数复用检查',
    `- 样本中发现的可疑加密参数值数量：${result.reusedCryptoCheck.sampleValues.length}`,
    `- 直接复用样本值：${result.reusedCryptoCheck.reused.length ? '是' : '否'}`,
    `- 硬编码加密参数字面量：${result.reusedCryptoCheck.hardcoded.length ? '是' : '否'}`,
    `- 补环境 / signer 生成痕迹：${result.reusedCryptoCheck.generationEvidence.length ? result.reusedCryptoCheck.generationEvidence.join('、') : '未明显发现'}`,
    '',
    '## 阶段报告检查',
    `- 目录：${result.stageReports.dir}`,
    `- 是否存在 01-需求信息确认.md：${result.stageReports.initialPresent ? '是' : '否'}`,
    `- 文件名是否均含中文：${result.stageReports.chineseFileNames ? '是' : '否'}`,
    `- 疑似乱码：${result.stageReports.mojibakeSuspected ? '是' : '否'}`,
    `- 报告数量：${result.stageReports.files.length}`,
    '',
    '## 最终总结检查',
    `- 默认要求：${result.finalSummary.required ? '是' : '否'}`,
    `- 文件：${result.finalSummary.file ? rel(result.resultDir, result.finalSummary.file) : '未发现，应为 最终项目总结.md'}`,
    `- UTF-8 可读：${result.finalSummary.utf8Readable ? '是' : '否'}`,
    `- 疑似乱码：${result.finalSummary.mojibakeSuspected ? '是' : '否'}`,
    `- 缺少章节：${result.finalSummary.missingSections.length ? result.finalSummary.missingSections.join('、') : '无'}`,
    '',
  ];
  if (result.problems.length) {
    lines.push('## 问题');
    for (const p of result.problems) lines.push(`- ${p}`);
    lines.push('');
  }
  if (result.warnings.length) {
    lines.push('## 提醒');
    for (const w of result.warnings) lines.push(`- ${w}`);
    lines.push('');
  }
  lines.push('## result 文件列表');
  if (result.resultFiles.length) for (const f of result.resultFiles) lines.push(`- ${f}`);
  else lines.push('- 无');
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

module.exports = { check, extractSampleCryptoValuesFromText };
