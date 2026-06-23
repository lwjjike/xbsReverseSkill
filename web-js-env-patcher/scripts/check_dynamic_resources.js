#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function parseArgs(argv) {
  const args = {
    caseDir: 'case',
    manifest: '',
    requireRuntimeRefresh: false,
    json: false,
    markdown: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--case-dir' || a === '--case' || a === '-d') args.caseDir = argv[++i] || 'case';
    else if (a === '--manifest') args.manifest = argv[++i] || '';
    else if (a === '--require-runtime-refresh') args.requireRuntimeRefresh = true;
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
  node scripts/check_dynamic_resources.js --case-dir case --markdown
  node scripts/check_dynamic_resources.js --case-dir case --require-runtime-refresh --markdown
  node scripts/check_dynamic_resources.js --case-dir case --require-runtime-refresh --json

说明：检查 case/notes/resource-manifest.json 中的动态 HTML / JS / challenge 资源是否只作为分析快照，并确认影响最终参数生成的动态资源已设计运行时刷新模块；同时检查 result/ 中是否混入动态快照文件。`;
}

function exists(p) {
  try { fs.accessSync(p); return true; } catch { return false; }
}

function stat(p) {
  try { return fs.statSync(p); } catch { return null; }
}

function rel(root, p) {
  return (path.relative(root, p) || '.').replace(/\\/g, '/');
}

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

function sha256File(file) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  } catch {
    return '';
  }
}

function normalizeBool(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function isDynamicValue(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'string') return ['true', 'yes', 'dynamic', 'high-risk', '高风险', '动态'].includes(v.toLowerCase());
  return false;
}

function getHash(resource) {
  return resource.sha256 || resource.bodySha256 || resource.bodyHash || resource.hash || '';
}

function sanitizeRel(p) {
  return String(p || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function resolveCasePath(caseDir, maybePath) {
  const raw = String(maybePath || '').trim();
  if (!raw) return [];
  if (path.isAbsolute(raw)) return [raw];
  const normalized = sanitizeRel(raw);
  const parent = path.dirname(caseDir);
  const withoutCase = normalized.replace(/^case\//i, '');
  const candidates = [
    path.join(caseDir, normalized),
    path.join(parent, normalized),
    path.join(caseDir, withoutCase),
  ];
  if (!/^result\//i.test(normalized)) candidates.push(path.join(caseDir, 'result', normalized));
  return [...new Set(candidates.map(p => path.normalize(p)))];
}

function firstExisting(paths) {
  return paths.find(p => exists(p)) || '';
}

function readManifest(manifestPath) {
  const text = fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, '');
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return { raw: parsed, resources: parsed };
  const resources = Array.isArray(parsed.resources) ? parsed.resources : [];
  return { raw: parsed, resources };
}

function finalEntryFiles(resultDir) {
  const files = [];
  for (const name of ['final.js', 'final.mjs', 'final.cjs', 'final.py']) {
    const p = path.join(resultDir, name);
    if (exists(p)) files.push(p);
  }
  return files;
}

function readTextSafe(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch { return ''; }
}

function inspect(caseDir, args) {
  const problems = [];
  const warnings = [];
  const manifestPath = args.manifest ? path.resolve(args.manifest) : path.join(caseDir, 'notes', 'resource-manifest.json');
  const resultDir = path.join(caseDir, 'result');
  const snapshotsDir = path.join(caseDir, 'js', 'snapshots');

  const report = {
    ok: false,
    caseDir,
    manifestPath,
    manifestExists: exists(manifestPath),
    resources: [],
    dynamicCount: 0,
    requiredDynamicCount: 0,
    runtimeRefreshCount: 0,
    problems,
    warnings,
  };

  if (!report.manifestExists) {
    const hasSnapshots = exists(snapshotsDir) && walk(snapshotsDir).length > 0;
    const msg = `未找到资源清单：${rel(caseDir, manifestPath)}`;
    if (args.requireRuntimeRefresh || hasSnapshots) problems.push(hasSnapshots ? `${msg}；但已存在 js/snapshots 动态快照目录，必须补写 resource-manifest.json。` : `${msg}；当前要求强制检查运行时刷新。`);
    else warnings.push(`${msg}；如果本 case 没有下载 / 保存 HTML、JS 或 challenge 资源，可以忽略。`);
    report.ok = problems.length === 0;
    return report;
  }

  let manifest;
  try {
    manifest = readManifest(manifestPath);
  } catch (err) {
    problems.push(`resource-manifest.json 解析失败：${err.message}`);
    report.ok = false;
    return report;
  }

  if (!Array.isArray(manifest.resources)) {
    problems.push('resource-manifest.json 缺少 resources 数组。');
    report.ok = false;
    return report;
  }

  const resultFiles = walk(resultDir).filter(p => stat(p)?.isFile());
  const resultHashes = new Map();
  for (const file of resultFiles) resultHashes.set(file, sha256File(file));
  const resultRelList = resultFiles.map(file => rel(caseDir, file));

  for (let i = 0; i < manifest.resources.length; i++) {
    const r = manifest.resources[i] || {};
    const item = {
      index: i,
      url: r.url || '',
      type: r.type || '',
      file: r.file || '',
      sha256: getHash(r),
      dynamic: isDynamicValue(r.dynamic),
      requiredForFinal: normalizeBool(r.requiredForFinal),
      runtimeRefresh: normalizeBool(r.runtimeRefresh) || r.use === 'runtime-refresh',
      refreshEntry: r.refreshEntry || '',
      use: r.use || '',
      problems: [],
      warnings: [],
    };
    report.resources.push(item);

    const prefix = `resources[${i}]`;
    if (!item.url) item.problems.push(`${prefix} 缺少 url。`);
    if (!item.sha256) item.problems.push(`${prefix} 缺少 sha256 / bodySha256 / hash。`);
    if (typeof r.dynamic === 'undefined') item.problems.push(`${prefix} 缺少 dynamic 字段，必须明确 true / false。`);
    if (!item.use) item.problems.push(`${prefix} 缺少 use 字段，应标明 analysis-snapshot / runtime-refresh / static 等。`);

    if (item.dynamic) report.dynamicCount += 1;
    if (item.dynamic && item.requiredForFinal) report.requiredDynamicCount += 1;
    if (item.runtimeRefresh) report.runtimeRefreshCount += 1;

    if (item.dynamic && item.file && !/analysis-snapshot|runtime-refresh/i.test(item.use)) {
      item.warnings.push(`${prefix} 是动态资源，但 use 未标明 analysis-snapshot 或 runtime-refresh。`);
    }

    if (item.dynamic && item.requiredForFinal) {
      if (!item.runtimeRefresh) item.problems.push(`${prefix} 是影响最终参数生成的动态资源，但 runtimeRefresh 未设置为 true。`);
      if (!item.refreshEntry) item.problems.push(`${prefix} 是影响最终参数生成的动态资源，但缺少 refreshEntry。`);
      if (args.requireRuntimeRefresh && item.refreshEntry) {
        const refreshPath = firstExisting(resolveCasePath(caseDir, item.refreshEntry));
        if (!refreshPath) item.problems.push(`${prefix} 的 refreshEntry 不存在：${item.refreshEntry}。`);
      }
    }

    if (item.dynamic && item.file) {
      const resourcePath = firstExisting(resolveCasePath(caseDir, item.file));
      const resourceHash = resourcePath ? sha256File(resourcePath) : item.sha256;
      const resourceBase = path.basename(item.file).toLowerCase();
      for (const file of resultFiles) {
        const rr = rel(caseDir, file);
        const rrLower = rr.toLowerCase();
        const sameHash = resourceHash && resultHashes.get(file) === resourceHash;
        const snapshotPath = /(^|\/)result\/(?:.*\/)?(?:js\/)?snapshots\//i.test(rrLower) || /(^|\/)snapshots\//i.test(rrLower);
        if (sameHash) item.problems.push(`${prefix} 的动态快照内容疑似被复制到最终产物：${rr}。`);
        else if (snapshotPath) item.problems.push(`最终产物包含 snapshots 路径，不应交付动态快照：${rr}。`);
        else if (resourceBase && path.basename(file).toLowerCase() === resourceBase && /snapshot|challenge|dynamic/i.test(resourceBase)) {
          item.warnings.push(`${prefix} 的文件名与 result/ 中 ${rr} 相同，请确认不是复制动态快照。`);
        }
      }
    }

    for (const p of item.problems) problems.push(p);
    for (const w of item.warnings) warnings.push(w);
  }

  if (args.requireRuntimeRefresh && report.requiredDynamicCount > 0) {
    const entries = finalEntryFiles(resultDir);
    if (entries.length === 0) {
      warnings.push('result/ 中未发现 final.js / final.py；无法检查最终入口是否调用运行时刷新模块。');
    } else {
      const finalText = entries.map(readTextSafe).join('\n');
      const refreshNames = report.resources
        .filter(r => r.dynamic && r.requiredForFinal && r.refreshEntry)
        .map(r => path.basename(r.refreshEntry).replace(/\.[^.]+$/, ''))
        .filter(Boolean);
      const hasRefreshSignal = /fetchRuntimeResources|refreshRuntimeResources|loadRuntimeResources|resourceManifest|运行时刷新|动态资源/.test(finalText)
        || refreshNames.some(name => new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(finalText));
      if (!hasRefreshSignal) {
        problems.push('最终入口未发现运行时刷新调用痕迹；动态 HTML / JS 影响最终参数生成时，final.js / final.py 必须先刷新当前资源再生成参数。');
      }
    }
  }

  if (manifest.resources.length === 0) warnings.push('resource-manifest.json 中 resources 为空；如果已下载 HTML / JS，请补充清单。');
  if (resultRelList.some(x => /(^|\/)js\/snapshots\//i.test(x) || /(^|\/)snapshots\//i.test(x))) {
    problems.push('最终 result/ 中存在 snapshots 目录或文件；动态快照不得进入最终产物。');
  }

  report.ok = problems.length === 0;
  return report;
}

function toMarkdown(report) {
  const lines = [];
  lines.push('# 动态资源保鲜检查');
  lines.push('');
  lines.push(`- 检查结果：${report.ok ? '通过' : '未通过'}`);
  lines.push(`- case 目录：${report.caseDir}`);
  lines.push(`- manifest：${report.manifestExists ? report.manifestPath : '未找到'}`);
  lines.push(`- 资源数量：${report.resources.length}`);
  lines.push(`- 动态资源数量：${report.dynamicCount}`);
  lines.push(`- 影响最终参数生成的动态资源：${report.requiredDynamicCount}`);
  lines.push(`- 已声明运行时刷新的资源：${report.runtimeRefreshCount}`);
  lines.push('');

  if (report.resources.length) {
    lines.push('## 资源概览');
    lines.push('');
    lines.push('| 序号 | 类型 | 动态 | 最终依赖 | 运行时刷新 | use | refreshEntry | URL |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const r of report.resources) {
      lines.push(`| ${r.index} | ${r.type || '-'} | ${r.dynamic ? '是' : '否'} | ${r.requiredForFinal ? '是' : '否'} | ${r.runtimeRefresh ? '是' : '否'} | ${r.use || '-'} | ${r.refreshEntry || '-'} | ${String(r.url || '').replace(/\|/g, '%7C')} |`);
    }
    lines.push('');
  }

  if (report.problems.length) {
    lines.push('## 必须修复');
    lines.push('');
    for (const p of report.problems) lines.push(`- ${p}`);
    lines.push('');
  }

  if (report.warnings.length) {
    lines.push('## 提醒');
    lines.push('');
    for (const w of report.warnings) lines.push(`- ${w}`);
    lines.push('');
  }

  if (report.ok) {
    lines.push('## 结论');
    lines.push('');
    lines.push('- 未发现动态资源固定化交付问题。');
    if (report.requiredDynamicCount > 0) lines.push('- 影响最终参数生成的动态资源已声明运行时刷新方案。');
    else lines.push('- 当前 manifest 未声明影响最终参数生成的动态资源。');
  }
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  const caseDir = path.resolve(args.caseDir || 'case');
  const report = inspect(caseDir, args);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else console.log(toMarkdown(report));
  if (!report.ok) process.exitCode = 1;
}

try {
  main();
} catch (err) {
  console.error(`动态资源检查失败：${err.message}`);
  process.exit(1);
}
