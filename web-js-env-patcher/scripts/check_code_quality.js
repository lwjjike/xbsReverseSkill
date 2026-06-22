#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    caseDir: '',
    dir: '',
    file: '',
    maxLineLength: 180,
    maxFileLines: 500,
    maxFunctionLines: 90,
    json: false,
    markdown: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--case-dir' || a === '--case' || a === '-d') args.caseDir = argv[++i] || '';
    else if (a === '--dir') args.dir = argv[++i] || '';
    else if (a === '--file' || a === '-f') args.file = argv[++i] || '';
    else if (a === '--max-line-length') args.maxLineLength = Number(argv[++i] || args.maxLineLength);
    else if (a === '--max-file-lines') args.maxFileLines = Number(argv[++i] || args.maxFileLines);
    else if (a === '--max-function-lines') args.maxFunctionLines = Number(argv[++i] || args.maxFunctionLines);
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
  node scripts/check_code_quality.js --case-dir case --markdown
  node scripts/check_code_quality.js --dir case/result --json
  node scripts/check_code_quality.js --file case/result/src/env/install-env.js --markdown

说明：检查最终补环境代码是否简洁、可读、模块化，并验证中文注释为 UTF-8、无乱码、无连续问号、中文注释不含问号。`;
}

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function stat(p) { try { return fs.statSync(p); } catch { return null; } }
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

function isCodeFile(p) {
  return ['.js', '.mjs', '.cjs', '.py'].includes(ext(p));
}

function shouldSkipFile(root, p) {
  const r = rel(root, p).toLowerCase();
  if (/(^|\/)(node_modules|dist|build|coverage|vendor|third_party|third-party)(\/|$)/.test(r)) return true;
  if (/(^|\/)src\/target\/(original|vendor|bundle|bundles)(\/|$)/.test(r)) return true;
  if (/(\.min\.js|bundle\.js|vendor\.js|package-lock\.json)$/i.test(r)) return true;
  return false;
}

function readUtf8Strict(file) {
  const buf = fs.readFileSync(file);
  const hasBom = buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const text = buf.toString('utf8');
  return { text: text.replace(/^\uFEFF/, ''), hasBom };
}

function hasChinese(s) {
  return /[\u4e00-\u9fff]/.test(String(s || ''));
}

function extractJsComments(text) {
  const comments = [];
  const blockRe = /\/\*[\s\S]*?\*\//g;
  let m;
  while ((m = blockRe.exec(text))) {
    for (const line of m[0].split(/\r?\n/)) comments.push(line.replace(/^\/\*+|\*+\/$/g, '').replace(/^\s*\*\s?/, '').trim());
  }
  const lineRe = /(^|\s)\/\/(.*)$/gm;
  while ((m = lineRe.exec(text))) comments.push((m[2] || '').trim());
  return comments.filter(Boolean);
}

function extractPyComments(text) {
  const comments = [];
  const lineRe = /^\s*#(.*)$/gm;
  let m;
  while ((m = lineRe.exec(text))) comments.push((m[1] || '').trim());
  return comments.filter(Boolean);
}

function extractComments(file, text) {
  return ext(file) === '.py' ? extractPyComments(text) : extractJsComments(text);
}

function firstNonEmptyLines(text, count = 8) {
  return text.split(/\r?\n/).map(x => x.trim()).filter(Boolean).slice(0, count);
}

function stripJsLine(line) {
  return line
    .replace(/\/\*.*?\*\//g, '')
    .replace(/\/\/.*$/g, '')
    .trim();
}

function codeLineCount(file, lines) {
  if (ext(file) === '.py') return lines.filter(line => line.trim() && !line.trim().startsWith('#')).length;
  return lines.filter(line => stripJsLine(line)).length;
}

function maxJsBraceDepth(lines) {
  let depth = 0;
  let maxDepth = 0;
  for (const raw of lines) {
    const line = stripJsLine(raw);
    for (const ch of line) {
      if (ch === '{') {
        depth += 1;
        if (depth > maxDepth) maxDepth = depth;
      } else if (ch === '}') {
        depth = Math.max(0, depth - 1);
      }
    }
  }
  return maxDepth;
}

function maxPyIndentDepth(lines) {
  let maxDepth = 0;
  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const spaces = raw.match(/^\s*/)[0].replace(/\t/g, '    ').length;
    maxDepth = Math.max(maxDepth, Math.floor(spaces / 2));
  }
  return maxDepth;
}

function inspectJsFunctions(lines, maxFunctionLines) {
  const problems = [];
  const warnings = [];
  const starters = [
    /\bfunction\s+([A-Za-z_$][\w$]*)?\s*\([^)]*\)\s*\{/,
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/,
    /\b(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/
  ];
  for (let i = 0; i < lines.length; i++) {
    const line = stripJsLine(lines[i]);
    if (!line.includes('{')) continue;
    if (!starters.some(re => re.test(line))) continue;
    let depth = 0;
    let end = i;
    let seenOpen = false;
    for (let j = i; j < lines.length; j++) {
      const cur = stripJsLine(lines[j]);
      for (const ch of cur) {
        if (ch === '{') { depth += 1; seenOpen = true; }
        else if (ch === '}') depth -= 1;
      }
      if (seenOpen && depth <= 0) { end = j; break; }
    }
    const size = end - i + 1;
    if (size > maxFunctionLines) problems.push(`第 ${i + 1} 行附近函数过长：${size} 行，建议拆分到 ${maxFunctionLines} 行以内。`);
    const prev = lines.slice(Math.max(0, i - 3), i).join('\n');
    if (size > 15 && !hasChinese(prev)) warnings.push(`第 ${i + 1} 行附近函数较长但前置中文说明不足，建议补充职责、输入和输出说明。`);
  }
  return { problems, warnings };
}

function inspectPyFunctions(lines, maxFunctionLines) {
  const problems = [];
  const warnings = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)def\s+([A-Za-z_]\w*)\s*\(/);
    if (!m) continue;
    const baseIndent = m[1].replace(/\t/g, '    ').length;
    let end = i;
    for (let j = i + 1; j < lines.length; j++) {
      if (!lines[j].trim()) { end = j; continue; }
      const indent = lines[j].match(/^\s*/)[0].replace(/\t/g, '    ').length;
      if (indent <= baseIndent) break;
      end = j;
    }
    const size = end - i + 1;
    if (size > maxFunctionLines) problems.push(`第 ${i + 1} 行附近函数过长：${size} 行，建议拆分到 ${maxFunctionLines} 行以内。`);
    const prev = lines.slice(Math.max(0, i - 3), i).join('\n');
    if (size > 15 && !hasChinese(prev)) warnings.push(`第 ${i + 1} 行附近函数较长但前置中文说明不足，建议补充职责、输入和输出说明。`);
  }
  return { problems, warnings };
}

function inspectFile(root, file, args) {
  const relFile = rel(root, file);
  const problems = [];
  const warnings = [];
  const { text, hasBom } = readUtf8Strict(file);
  const lines = text.split(/\r?\n/);
  const comments = extractComments(file, text);
  const chineseComments = comments.filter(hasChinese);
  const codeLines = codeLineCount(file, lines);

  if (hasBom) problems.push('文件带 UTF-8 BOM，建议使用无 BOM UTF-8。');
  if (/\uFFFD/.test(text)) problems.push('文件包含替换字符，疑似 UTF-8 解码或写入异常。');
  if (/\?{6,}/.test(text)) problems.push('文件包含连续问号，疑似中文编码问题。');

  for (let i = 0; i < comments.length; i++) {
    const c = comments[i];
    if (hasChinese(c) && /[?？]/.test(c)) problems.push(`中文注释包含问号：第 ${i + 1} 条注释“${c.slice(0, 60)}”。`);
    if (/\uFFFD|\?{3,}/.test(c)) problems.push(`注释疑似乱码：第 ${i + 1} 条注释“${c.slice(0, 60)}”。`);
  }

  const header = firstNonEmptyLines(text, 8).join('\n');
  if (!hasChinese(header) || !/^\s*(\/\/|\/\*|\*|#)/m.test(header)) {
    problems.push('文件开头缺少中文职责注释；请在文件顶部说明模块用途、数据来源和边界。');
  }

  if (codeLines > 20 && chineseComments.length === 0) problems.push('代码超过 20 行但没有中文注释。');
  if (codeLines > 80 && chineseComments.length < Math.ceil(codeLines / 120)) {
    problems.push(`中文注释过少：代码约 ${codeLines} 行，中文注释 ${chineseComments.length} 条。`);
  }

  if (lines.length > args.maxFileLines) problems.push(`文件过大：${lines.length} 行，建议拆分到 ${args.maxFileLines} 行以内。`);
  lines.forEach((line, idx) => {
    if (line.length > args.maxLineLength) problems.push(`第 ${idx + 1} 行过长：${line.length} 字符，建议拆分到 ${args.maxLineLength} 字符以内。`);
    if (line.length > 320) problems.push(`第 ${idx + 1} 行疑似压缩或堆叠代码。`);
  });

  const semicolonDense = lines.filter(line => (line.match(/;/g) || []).length >= 6);
  if (semicolonDense.length) problems.push(`发现 ${semicolonDense.length} 行包含大量分号，疑似压缩或多语句堆叠。`);

  const denseLineProblems = [];
  lines.forEach((rawLine, idx) => {
    const line = stripJsLine(rawLine);
    if (!line) return;
    const lineNo = idx + 1;
    const defineCount = (line.match(/\b(?:Object\.defineProperty|Object\.defineProperties|defineValue|defineNativeValue|defineNativeGetter|defineNativeSetter|defineNativeAccessor)\s*\(/g) || []).length;
    if (defineCount >= 2) {
      denseLineProblems.push(`第 ${lineNo} 行同时包含 ${defineCount} 个属性定义调用，应拆成多行并补充 descriptor 说明。`);
    }
    if (/(?:Object\.defineProperty|Object\.defineProperties)\s*\([^;]+\{[^{}\n]*(?:value|get|set|writable|enumerable|configurable)[^{}\n]*\}[^;]*;?$/.test(line) && line.length > 110) {
      denseLineProblems.push(`第 ${lineNo} 行把属性描述符压在一行，建议展开 value/get/set/writable/enumerable/configurable。`);
    }
    if (/\bObject\.assign\s*\([^;]*\{.*\{.*\}/.test(line)) {
      denseLineProblems.push(`第 ${lineNo} 行疑似用 Object.assign 堆叠对象和方法，补环境代码应拆为 createProtoChains 与 defineProperty。`);
    }
    if (/\b(?:ctx|window|globalThis|globalObject|self)\s*(?:\.|\[).*=.*\{.*(?:function\b|=>|\b[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{)/.test(line)) {
      denseLineProblems.push(`第 ${lineNo} 行把全局 WebAPI 对象、方法或函数堆在一行，建议拆成模块化安装函数。`);
    }
    if (/\b(?:if|for|while|try|catch|finally)\b[^{;\n]*\{[^{}\n]*;[^{}\n]*\}/.test(line) && line.length > 120) {
      denseLineProblems.push(`第 ${lineNo} 行存在较长的单行控制流代码块，建议展开为多行。`);
    }
    if (/\bfunction\b[^{;\n]*\{[^{}\n]*;[^{}\n]*\}/.test(line) && line.length > 120) {
      denseLineProblems.push(`第 ${lineNo} 行存在单行函数体，建议提取为具名函数并展开实现。`);
    }
  });
  if (denseLineProblems.length) problems.push(...denseLineProblems.slice(0, 30));
  if (denseLineProblems.length > 30) problems.push(`还有 ${denseLineProblems.length - 30} 个疑似单行堆叠问题未逐条展示，请先格式化源码后重新检查。`);

  if (/\bdebugger\s*;/.test(text)) problems.push('存在 debugger 语句，最终代码不得保留调试断点。');
  if (/TODO|FIXME|临时|随便|测试用|先这样|debug/i.test(text)) warnings.push('发现 TODO/FIXME/临时/调试类标记，交付前建议清理或改为正式说明。');
  if (/\b(?:var\s+[a-z]\b|function\s+[a-z]\s*\(|const\s+[a-z]\s*=|let\s+[a-z]\s*=)/.test(text)) warnings.push('发现过短变量或函数名，建议使用表达业务含义的命名。');

  const depth = ext(file) === '.py' ? maxPyIndentDepth(lines) : maxJsBraceDepth(lines);
  if (depth > 8) problems.push(`嵌套层级过深：最大层级 ${depth}，建议拆分函数或提前返回。`);
  else if (depth > 6) warnings.push(`嵌套层级偏深：最大层级 ${depth}，建议优化结构。`);

  const funcs = ext(file) === '.py' ? inspectPyFunctions(lines, args.maxFunctionLines) : inspectJsFunctions(lines, args.maxFunctionLines);
  problems.push(...funcs.problems);
  warnings.push(...funcs.warnings);

  const anonymousCount = (text.match(/\bfunction\s*\(/g) || []).length + (text.match(/=>\s*\{/g) || []).length;
  if (anonymousCount > 8) warnings.push(`匿名函数较多：${anonymousCount} 个，建议提取为具名函数提升可读性。`);

  return {
    file: relFile,
    clean: problems.length === 0,
    lines: lines.length,
    codeLines,
    chineseCommentCount: chineseComments.length,
    maxDepth: depth,
    problems,
    warnings,
  };
}

function check(args) {
  const root = args.file
    ? path.resolve(path.dirname(args.file))
    : args.dir
      ? path.resolve(args.dir)
      : path.join(path.resolve(args.caseDir || 'case'), 'result');
  const files = args.file ? [path.resolve(args.file)] : walk(root).filter(p => isCodeFile(p) && !shouldSkipFile(root, p));
  const problems = [];
  const warnings = [];
  if (!files.length) problems.push(`未找到可检查的最终代码文件：${root}`);
  const fileResults = files.map(f => inspectFile(root, f, args));
  for (const r of fileResults) {
    for (const p of r.problems) problems.push(`${r.file}: ${p}`);
    for (const w of r.warnings) warnings.push(`${r.file}: ${w}`);
  }
  return {
    root,
    clean: problems.length === 0,
    filesChecked: fileResults.length,
    limits: {
      maxLineLength: args.maxLineLength,
      maxFileLines: args.maxFileLines,
      maxFunctionLines: args.maxFunctionLines,
    },
    problems,
    warnings,
    fileResults,
  };
}

function renderMarkdown(result) {
  const lines = [
    '# 补环境代码质量检查结果',
    '',
    `检查范围：${result.root}`,
    `是否通过：${result.clean ? '是' : '否'}`,
    `检查文件数：${result.filesChecked}`,
    '',
    '## 质量规则',
    `- 单行长度上限：${result.limits.maxLineLength}`,
    `- 单文件行数上限：${result.limits.maxFileLines}`,
    `- 单函数行数上限：${result.limits.maxFunctionLines}`,
    '- 必须有中文职责注释，中文注释不得包含问号、连续问号或乱码。',
    '- 禁止压缩代码、过度堆叠语句、调试断点和临时测试标记。',
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
  lines.push('## 文件摘要');
  for (const f of result.fileResults) {
    lines.push(`- ${f.file}：${f.clean ? '通过' : '失败'}，总行数 ${f.lines}，代码行 ${f.codeLines}，中文注释 ${f.chineseCommentCount}，最大嵌套 ${f.maxDepth}`);
  }
  if (!result.fileResults.length) lines.push('- 无');
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

module.exports = { check, inspectFile, extractComments };
