#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    caseDir: '',
    file: '',
    requireDocumentAll: false,
    requireRuyiTrace: false,
    requireFingerprintFixture: false,
    requireAddonFirst: true,
    addonFirstOptOut: false,
    fingerprintFixture: '',
    json: false,
    markdown: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--case-dir' || a === '--dir' || a === '-d') args.caseDir = argv[++i] || '';
    else if (a === '--file' || a === '-f') args.file = argv[++i] || '';
    else if (a === '--require-document-all') args.requireDocumentAll = true;
    else if (a === '--require-ruyitrace') args.requireRuyiTrace = true;
    else if (a === '--require-fingerprint-fixture') args.requireFingerprintFixture = true;
    else if (a === '--require-addon-first') args.requireAddonFirst = true;
    else if (a === '--no-require-addon-first' || a === '--allow-no-addon-first') {
      args.requireAddonFirst = false;
      args.addonFirstOptOut = true;
    }
    else if (a === '--fingerprint-fixture') args.fingerprintFixture = argv[++i] || '';
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
  node scripts/check_env_realism.js --case-dir case --markdown
  node scripts/check_env_realism.js --case-dir case --no-require-addon-first --markdown
  node scripts/check_env_realism.js --case-dir case --require-document-all --require-ruyitrace --require-fingerprint-fixture --require-addon-first --json
  node scripts/check_env_realism.js --file case/result/src/env/index.js --markdown

说明：检查补环境交付代码是否体现原型链、属性描述符、访问器、函数 / 访问器 / 实例对象 toString 保护、addon-first/native fallback 规则、document.all 特殊对象处理、指纹终端 API 值回放策略，以及选择 RuyiTrace 时是否沉淀 NDJSON 证据。addon-first 是默认硬性要求；如果选择 xbs isolated-vm，则 window.xbs / globalThis.xbs 视为 native-first 证据；只有用户明确要求不使用 addon / 不做 addon-first 时，才允许传入 --no-require-addon-first 并在总结中记录豁免原因。`;
}

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }
function stat(p) { try { return fs.statSync(p); } catch { return null; } }
function readText(p) { return fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''); }
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

function codeFiles(root) {
  return walk(root).filter(p => ['.js', '.mjs', '.cjs', '.py'].includes(ext(p)));
}

function has(pattern, text) { return pattern.test(text); }
function any(pattern, files) { return files.some(f => has(pattern, readText(f))); }
function matchingFiles(pattern, files, root) {
  return files.filter(f => has(pattern, readText(f))).map(f => rel(root, f));
}

function listNdjson(caseDir) {
  const dir = path.join(caseDir, 'ruyi-trace', 'logs');
  if (!exists(dir)) return [];
  return walk(dir).filter(p => p.toLowerCase().endsWith('.ndjson'));
}

function inspectRuyiTrace(caseDir, requireRuyiTrace) {
  const problems = [];
  const warnings = [];
  const ndjson = listNdjson(caseDir);
  const shouldCheck = requireRuyiTrace || ndjson.length > 0;
  const summary = path.join(caseDir, 'notes', 'ruyitrace-summary.md');
  const priority = path.join(caseDir, 'notes', 'missing-env-priority.md');
  const result = {
    required: shouldCheck,
    ndjson: ndjson.map(p => rel(caseDir, p)),
    summary: exists(summary) ? rel(caseDir, summary) : '',
    priority: exists(priority) ? rel(caseDir, priority) : '',
  };
  if (!shouldCheck) return { result, problems, warnings };
  if (!ndjson.length) problems.push('已要求 RuyiTrace 优先诊断，但 case/ruyi-trace/logs/ 下未找到 NDJSON 日志。');
  if (!exists(summary)) problems.push('已要求 RuyiTrace 优先诊断，但未找到 notes/ruyitrace-summary.md；应先运行 import_ruyitrace_log.js。');
  else {
    const text = readText(summary);
    if (!/API|api|调用栈|stack|类别统计|RuyiTrace/i.test(text)) warnings.push('ruyitrace-summary.md 内容较弱，建议包含 API 统计、stack.file 和环境模块分类。');
  }
  if (!exists(priority)) problems.push('已选择 / 提供 RuyiTrace 日志，但未找到 notes/missing-env-priority.md；补环境前应把 NDJSON 命中的 api、stack.file、line、col 和补齐优先级写入该文件。');
  else {
    const text = readText(priority);
    if (!/RuyiTrace|NDJSON|api|stack\.file|line|col|证据/.test(text)) {
      problems.push('missing-env-priority.md 未体现 RuyiTrace/NDJSON 证据、api 或 stack.file/line/col；不能证明补环境阶段持续参考了 trace 日志。');
    }
  }
  return { result, problems, warnings };
}

function readJsonSafe(file) {
  try { return JSON.parse(readText(file)); } catch (err) { return { __error: err.message || String(err) }; }
}

function countArray(v) { return Array.isArray(v) ? v.length : 0; }

function fingerprintFixturePath(caseDir, explicit) {
  if (explicit) return path.resolve(explicit);
  const candidates = [
    path.join(caseDir, 'fixtures', 'fingerprint.fixture.json'),
    path.join(caseDir, 'fixtures', 'sample.fixture.json'),
  ];
  return candidates.find(exists) || candidates[0];
}

function inspectFingerprint(caseDir, files, args) {
  const problems = [];
  const warnings = [];
  const allText = files.map(f => readText(f)).join('\n');
  const terminalApiMentioned = /toDataURL|getImageData|measureText|getParameter|getSupportedExtensions|getShaderPrecisionFormat|readPixels|getBoundingClientRect|offsetWidth|offsetHeight|requestAdapter|OfflineAudioContext/.test(allText);
  const valueReplayMentioned = /fingerprint|回放|replay|fixture|findReplay|installFingerprintValueReplay|fingerprint\.fixture/i.test(allText);
  const badRenderLib = /\b(require|import)\s*\(?\s*['"](?:canvas|node-canvas|gl|headless-gl)['"]|from\s+['"](?:canvas|node-canvas|gl|headless-gl)['"]/i.test(allText);
  const automationForFingerprint = /\b(playwright|puppeteer|selenium|cloakbrowser|ruyipage|page\.goto|browser\.launch|chromium\.launch)\b/i.test(allText);
  const fixtureFile = fingerprintFixturePath(caseDir, args.fingerprintFixture);
  let fixtureExists = exists(fixtureFile);
  let counts = {};

  if (fixtureExists) {
    const raw = readJsonSafe(fixtureFile);
    if (raw.__error) {
      problems.push(`指纹 fixture 解析失败：${raw.__error}`);
    } else {
      const fp = raw.fingerprint && typeof raw.fingerprint === 'object' ? raw.fingerprint : raw;
      counts = {
        canvas: countArray(fp.canvas && fp.canvas.toDataURL) + countArray(fp.canvas && fp.canvas.measureText) + countArray(fp.canvas && fp.canvas.getImageData) + countArray(fp.canvas && fp.canvas.toBlob),
        webgl: countArray(fp.webgl && fp.webgl.getParameter) + countArray(fp.webgl && fp.webgl.getShaderPrecisionFormat) + countArray(fp.webgl && fp.webgl.readPixels) + (fp.webgl && fp.webgl.getSupportedExtensions ? 1 : 0),
        webgpu: countArray(fp.webgpu && fp.webgpu.requestAdapter),
        audio: countArray(fp.audio && fp.audio.startRendering) + countArray(fp.audio && fp.audio.getChannelData),
        domGeometry: countArray(fp.domGeometry && fp.domGeometry.getBoundingClientRect) + countArray(fp.domGeometry && fp.domGeometry.offset),
      };
    }
  }

  if (badRenderLib) problems.push('发现 node-canvas / headless-gl 等渲染库依赖；指纹补环境应优先真实浏览器采样值回放，不要在 Node.js 中强行模拟渲染管线。');
  if (automationForFingerprint) problems.push('补环境源码疑似包含浏览器自动化库或 page.goto / browser.launch；自动化只能用于前置取证采样，不能进入最终 env。');
  if ((args.requireFingerprintFixture || terminalApiMentioned) && !fixtureExists) {
    problems.push(`已涉及或要求指纹终端 API 值回放，但未找到指纹 fixture：${fixtureFile}`);
  }
  if (terminalApiMentioned && !valueReplayMentioned) {
    warnings.push('源码涉及指纹终端 API，但未明显体现 fingerprint fixture / replay；请确认不是静默伪造默认值。');
  }
  if (args.requireFingerprintFixture && fixtureExists && Object.values(counts).reduce((a, b) => a + b, 0) === 0) {
    problems.push('已要求指纹 fixture，但未发现 Canvas / WebGL / WebGPU / Audio / DOM 几何终端 API 采样值。');
  }

  return {
    result: {
      required: !!args.requireFingerprintFixture || terminalApiMentioned,
      fixture: fixtureExists ? rel(caseDir, fixtureFile) : '',
      terminalApiMentioned,
      valueReplayMentioned,
      badRenderLib,
      automationForFingerprint,
      counts,
    },
    problems,
    warnings,
  };
}

function inspectAddonFirst(files, requireAddonFirst) {
  const allText = files.map(f => readText(f)).join('\n');
  const result = {
    required: !!requireAddonFirst,
    usesNativeProtectFallback: /NativeProtect|markNativeFunction\s*\(|markObjectToString\s*\(|setNativeFunc\s*\(|setObjFunc\s*\(|Function\.prototype\.toString|Object\.prototype\.toString/.test(allText),
    usesNativeLikeCreation: /\b(?:createNativeFunction|createNativeConstructor|createNativeGetter|createNativeSetter|defineNativeValue|defineNativeGetter|defineNativeSetter|defineNativeAccessor|createUndetectable|createInterceptor|createNativeObject|createProtoChains|createNativeCollection|getMimeTypesAndPlugins|createDocument|getProtoChainRegistry|deleteProtoChainRegistryEntry|clearProtoChainRegistry|setPrivate|getPrivate|hasPrivate|deletePrivate|throwTypeError)\s*\(/.test(allText),
    directAddonApi: /(?:\b(?:addon|nativeAddon|addonApi)\.|\bxbs\s*\.\s*(?:dom\s*\.\s*)?|\b(?:window|globalThis)\s*\.\s*xbs\s*\.\s*(?:dom\s*\.\s*)?)(?:createNativeFunction|createGetter|createSetter|createNativeObject|createProtoChains|createUndetectable|createInterceptor|createNativeCollection|getMimeTypesAndPlugins|getProtoChainRegistry|deleteProtoChainRegistryEntry|clearProtoChainRegistry|getPrivate|setPrivate|hasPrivate|deletePrivate|throwTypeError|createDocument)\s*\(/.test(allText),
    addonAwareHelper: /\b(?:createNativeFunction|createNativeConstructor|createNativeGetter|createNativeSetter|defineNativeValue|defineNativeGetter|defineNativeSetter|defineNativeAccessor|createUndetectable|createInterceptor|createNativeObject|createProtoChains|createNativeCollection|getMimeTypesAndPlugins|createDocument|getProtoChainRegistry|deleteProtoChainRegistryEntry|clearProtoChainRegistry|setPrivate|getPrivate|hasPrivate|deletePrivate|throwTypeError)\s*\([\s\S]{0,260}\b(?:addon|nativeAddon|options\.addon|addonResult|xbs|options\.xbs|xbsApi)\b/.test(allText),
    normalizesAddonResult: /\b(?:normalizeAddon|getAddonApi)\s*\(|\baddonLike\.addon\b|\baddonResult\.addon\b|\baddon\s*&&\s*addon\.addon\b/.test(allText),
    loadsAddon: /loadNativeAddon\s*\(|load_native_addon|WEB_JS_ENV_PATCHER_ADDON|WEB_JS_ENV_PATCHER_XBS_ISOLATED_VM|assets[\\/]+native-addon|native-addon|addon\.node|xbs-isolated-vm|isolated_vm\.node|window\.xbs|globalThis\.xbs|require\s*\([^)]*\.node/.test(allText),
    acceptsAddonInput: /\boptions\.(?:addon|xbs|xbsIsolatedVmPath)\b|function\s+\w+\s*\([^)]*\b(?:addon|xbs)\b|,\s*(?:addon|xbs)\s*\)|\{\s*(?:addon|xbs)\s*\}/.test(allText),
    fallbackDocumented: /fallback|降级|addon 不可用|addon不可用|NativeProtect fallback|JS fallback/.test(allText),
    newProtoChainsApi: /\bcreateProtoChains\s*\(\s*\[|\.(?:createProtoChains)\s*\(\s*\[/.test(allText),
    oldStyleCreateProtoChains: /\bcreateProtoChains\s*\(\s*['"][^'"]+['"]\s*,/.test(allText),
    oldStyleCreateNativeObject: /\bcreateNativeObject\s*\(\s*['"][^'"]+['"]\s*,/.test(allText),
  };
  result.addonFirstEvidence = result.directAddonApi || result.addonAwareHelper || result.normalizesAddonResult || result.newProtoChainsApi;
  result.needsAddonFirst = result.usesNativeProtectFallback || result.usesNativeLikeCreation;

  const problems = [];
  const warnings = [];
  if (requireAddonFirst && result.needsAddonFirst && !result.addonFirstEvidence) {
    problems.push('已要求 addon-first，但源码使用 native-like / NativeProtect 相关能力时未发现先尝试 addon.node 或 xbs native API 的证据；创建函数、getter、setter、document.all、原型链等应先走 native API，native 能力不可用时才降级 NativeProtect。');
  }
  if (requireAddonFirst && result.needsAddonFirst && !result.loadsAddon && !result.acceptsAddonInput) {
    problems.push('已要求 addon-first，但源码既未加载 addon.node / xbs isolated-vm，也未显式接收 addon/options.addon/options.xbs；无法保证补环境时优先使用 native API。');
  }
  if ((requireAddonFirst || result.usesNativeProtectFallback) && result.usesNativeProtectFallback && !result.addonFirstEvidence && !result.fallbackDocumented) {
    warnings.push('源码使用 NativeProtect / JS fallback，但未明显记录 addon.node / xbs native API 不可用或调用失败的降级原因；建议输出 native 能力可用性和降级说明。');
  }
  if (result.oldStyleCreateProtoChains) {
    const msg = '发现旧式 createProtoChains(name, chain) 调用；新补环境代码应迁移为 createProtoChains(descriptors)，旧式形态只能出现在兼容层并记录迁移 / fallback 原因。';
    if (/旧式|兼容|fallback|迁移|历史/.test(allText)) warnings.push(msg);
    else problems.push(msg);
  }
  if (result.oldStyleCreateNativeObject) {
    const msg = '发现旧式 createNativeObject(tag, proto, properties) 调用；新补环境代码应使用 createNativeObject(options) 或优先 createProtoChains(descriptors)，旧式形态只能出现在兼容层并记录迁移 / fallback 原因。';
    if (/旧式|兼容|fallback|迁移|历史/.test(allText)) warnings.push(msg);
    else problems.push(msg);
  }
  return { result, problems, warnings };
}

function check(args) {
  if (!args.caseDir && !args.file) throw new Error('必须提供 --case-dir 或 --file');
  const caseDir = args.caseDir ? path.resolve(args.caseDir) : path.resolve(path.dirname(args.file), '..', '..');
  const root = args.file ? path.dirname(path.resolve(args.file)) : path.join(caseDir, 'result');
  const files = args.file ? [path.resolve(args.file)] : codeFiles(root);
  const allText = files.map(f => readText(f)).join('\n');
  const problems = [];
  const warnings = [];

  if (!files.length) problems.push(`未找到可检查的补环境源码文件：${root}`);

  const checks = {
    descriptors: any(/Object\.definePropert(?:y|ies)\s*\(/, files),
    prototypeChain: any(/Object\.setPrototypeOf\s*\(|Object\.create\s*\([^\n;]*\.prototype|createProtoChains\s*\(/, files),
    functionToString: any(/NativeProtect|Function\.prototype\.toString|createNativeFunction\s*\(|createNativeConstructor\s*\(|markNativeFunction\s*\(|setNativeFunc\s*\(/, files),
    accessorToString: any(/createGetter\s*\(|createSetter\s*\(|createNativeGetter\s*\(|createNativeSetter\s*\(|defineNativeGetter\s*\(|defineNativeSetter\s*\(|defineNativeAccessor\s*\(|setNativeFunc\s*\([^\n]*(get|set)\s+/i, files),
    instanceToString: any(/setObjFunc\s*\(|markObjectToString\s*\(|Symbol\.toStringTag|createNativeObject\s*\(|createProtoChains\s*\(/, files),
    documentAllExact: any(/(?:createUndetectable\s*\(|xbs\s*\.\s*dom\s*\.\s*createDocument\s*\(|\bdom\s*\.\s*createDocument\s*\()/, files),
    documentAllMentioned: /document\.all|['"]all['"]/.test(allText),
    fingerprintValueReplay: any(/installFingerprintValueReplay|findReplay|fingerprint\.fixture|指纹.*回放|value replay/i, files),
  };

  if (!checks.descriptors) problems.push('未发现 Object.defineProperty / defineProperties；补环境不能只用普通赋值，必须显式属性描述符。');
  if (!checks.prototypeChain) problems.push('未发现 Object.create(...prototype) / Object.setPrototypeOf / createProtoChains；需要按规则补构造函数和原型链。');
  if (!checks.functionToString) problems.push('未发现函数 toString 保护（NativeProtect / createNativeFunction / markNativeFunction 等）。');
  if (!checks.accessorToString) problems.push('未发现访问器 getter/setter 的 toString 保护（createGetter/createSetter/defineNativeGetter/defineNativeSetter 等）。');
  if (!checks.instanceToString) problems.push('未发现实例对象 Object.prototype.toString 保护（Symbol.toStringTag / setObjFunc / createNativeObject 等）。');
  if (args.requireDocumentAll && !checks.documentAllExact) problems.push('本 case 要求 document.all，但未发现 xbs.dom.createDocument 或 createUndetectable；document.all 不应仅用普通对象或 undefined 近似，isolated-vm 下优先 xbs.dom.createDocument，手写 document 时才用 xbs/createUndetectable handlers。');
  if (!args.requireDocumentAll && checks.documentAllMentioned && !checks.documentAllExact) warnings.push('源码提到 document.all 但未发现 xbs.dom.createDocument 或 createUndetectable；如目标检测 HTMLDDA，isolated-vm 下优先 xbs.dom.createDocument，手写 document 时才用 xbs/createUndetectable handlers。');

  const addonFirst = inspectAddonFirst(files, args.requireAddonFirst);
  problems.push(...addonFirst.problems);
  warnings.push(...addonFirst.warnings);
  const ruyi = inspectRuyiTrace(caseDir, args.requireRuyiTrace);
  problems.push(...ruyi.problems);
  warnings.push(...ruyi.warnings);
  const fingerprint = inspectFingerprint(caseDir, files, args);
  problems.push(...fingerprint.problems);
  warnings.push(...fingerprint.warnings);

  return {
    caseDir,
    checkedRoot: root,
    clean: problems.length === 0,
    checks,
    matching: {
      descriptors: matchingFiles(/Object\.definePropert(?:y|ies)\s*\(/, files, caseDir),
      prototypeChain: matchingFiles(/Object\.setPrototypeOf\s*\(|Object\.create\s*\([^\n;]*\.prototype|createProtoChains\s*\(/, files, caseDir),
      functionToString: matchingFiles(/NativeProtect|Function\.prototype\.toString|createNativeFunction\s*\(|createNativeConstructor\s*\(|markNativeFunction\s*\(|setNativeFunc\s*\(/, files, caseDir),
      accessorToString: matchingFiles(/createGetter\s*\(|createSetter\s*\(|createNativeGetter\s*\(|createNativeSetter\s*\(|defineNativeGetter\s*\(|defineNativeSetter\s*\(|defineNativeAccessor\s*\(|setNativeFunc\s*\([^\n]*(get|set)\s+/i, files, caseDir),
      instanceToString: matchingFiles(/setObjFunc\s*\(|markObjectToString\s*\(|Symbol\.toStringTag|createNativeObject\s*\(|createProtoChains\s*\(/, files, caseDir),
      documentAllExact: matchingFiles(/(?:createUndetectable\s*\(|xbs\s*\.\s*dom\s*\.\s*createDocument\s*\(|\bdom\s*\.\s*createDocument\s*\()/, files, caseDir),
      fingerprintValueReplay: matchingFiles(/installFingerprintValueReplay|findReplay|fingerprint\.fixture|指纹.*回放|value replay/i, files, caseDir),
    addonFirstEvidence: matchingFiles(/(?:\b(?:addon|nativeAddon|addonApi)\.|\bxbs\s*\.\s*(?:dom\s*\.\s*)?|\b(?:window|globalThis)\s*\.\s*xbs\s*\.\s*(?:dom\s*\.\s*)?)(?:createNativeFunction|createGetter|createSetter|createNativeObject|createProtoChains|createUndetectable|createInterceptor|createNativeCollection|getMimeTypesAndPlugins|getProtoChainRegistry|deleteProtoChainRegistryEntry|clearProtoChainRegistry|getPrivate|setPrivate|hasPrivate|deletePrivate|throwTypeError|createDocument)\s*\(|\b(?:createNativeFunction|createNativeConstructor|createNativeGetter|createNativeSetter|defineNativeValue|defineNativeGetter|defineNativeSetter|defineNativeAccessor|createUndetectable|createInterceptor|createNativeObject|createProtoChains|createNativeCollection|getMimeTypesAndPlugins|createDocument|getProtoChainRegistry|deleteProtoChainRegistryEntry|clearProtoChainRegistry|setPrivate|getPrivate|hasPrivate|deletePrivate|throwTypeError)\s*\([\s\S]{0,260}\b(?:addon|nativeAddon|options\.addon|addonResult|xbs|options\.xbs|xbsApi)\b|\b(?:normalizeAddon|getAddonApi)\s*\(|\bcreateProtoChains\s*\(\s*\[/, files, caseDir),
    },
    addonFirst: addonFirst.result,
    addonFirstOptOut: args.addonFirstOptOut,
    ruyiTrace: ruyi.result,
    fingerprint: fingerprint.result,
    problems,
    warnings,
    files: files.map(f => rel(caseDir, f)),
  };
}

function renderMarkdown(result) {
  const lines = [
    '# 补环境真实性与 RuyiTrace 证据检查',
    '',
    `case 目录：${result.caseDir}`,
    `检查范围：${result.checkedRoot}`,
    `是否通过：${result.clean ? '是' : '否'}`,
    '',
    '## 真实性检查项',
    `- 属性描述符：${result.checks.descriptors ? '通过' : '缺失'}`,
    `- 原型链 / 构造函数：${result.checks.prototypeChain ? '通过' : '缺失'}`,
    `- 函数 toString 保护：${result.checks.functionToString ? '通过' : '缺失'}`,
    `- 访问器 toString 保护：${result.checks.accessorToString ? '通过' : '缺失'}`,
    `- 实例对象 toString 保护：${result.checks.instanceToString ? '通过' : '缺失'}`,
    `- addon-first 规则：${result.addonFirst.required ? (result.addonFirst.addonFirstEvidence ? '已发现先尝试 addon.node / xbs native API 的证据' : '缺失 native 优先证据') : (result.addonFirstOptOut ? '用户明确豁免，未强制检查' : '未强制检查')}`,
    `  - 直接 addon API：${result.addonFirst.directAddonApi ? '是' : '否'}；addon-aware helper：${result.addonFirst.addonAwareHelper ? '是' : '否'}；加载 addon/xbs：${result.addonFirst.loadsAddon ? '是' : '否'}；接收 addon/xbs 输入：${result.addonFirst.acceptsAddonInput ? '是' : '否'}；新版 createProtoChains：${result.addonFirst.newProtoChainsApi ? '是' : '否'}`,
    `  - 旧式 API：createProtoChains(name, chain)=${result.addonFirst.oldStyleCreateProtoChains ? '发现' : '未发现'}；createNativeObject(tag, proto, properties)=${result.addonFirst.oldStyleCreateNativeObject ? '发现' : '未发现'}`,
    `- document.all 不可检测对象：${result.checks.documentAllExact ? '已使用 xbs.dom.createDocument / createUndetectable' : (result.checks.documentAllMentioned ? '提到但未精确处理' : '未涉及')}`,
    `- 指纹终端 API 值回放：${result.checks.fingerprintValueReplay ? '已体现' : (result.fingerprint.terminalApiMentioned ? '涉及指纹 API 但未明显体现回放' : '未涉及')}`,
    '',
    '## RuyiTrace 证据检查',
    `- 是否要求检查：${result.ruyiTrace.required ? '是' : '否'}`,
    `- NDJSON：${result.ruyiTrace.ndjson.length ? result.ruyiTrace.ndjson.join('、') : '未发现'}`,
    `- 摘要：${result.ruyiTrace.summary || '未发现'}`,
    `- 优先级笔记：${result.ruyiTrace.priority || '未发现'}`,
    '',
    '## 指纹值回放检查',
    `- 是否要求检查：${result.fingerprint.required ? '是' : '否'}`,
    `- 指纹 fixture：${result.fingerprint.fixture || '未发现'}`,
    `- 是否涉及终端 API：${result.fingerprint.terminalApiMentioned ? '是' : '否'}`,
    `- 是否体现 fixture / replay：${result.fingerprint.valueReplayMentioned ? '是' : '否'}`,
    `- 是否发现渲染库依赖：${result.fingerprint.badRenderLib ? '是' : '否'}`,
    `- 是否发现自动化代码：${result.fingerprint.automationForFingerprint ? '是' : '否'}`,
    `- 样本计数：${JSON.stringify(result.fingerprint.counts || {})}`,
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
  lines.push('## 检查文件');
  for (const f of result.files) lines.push(`- ${f}`);
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
