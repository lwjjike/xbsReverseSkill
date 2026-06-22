#!/usr/bin/env node
'use strict';

const NODE_CAPABILITY_GLOBALS = [
  'process', 'Buffer', 'global', 'setImmediate', 'clearImmediate',
];

const NODE_WEB_API_GLOBALS = [
  'navigator', 'localStorage', 'sessionStorage', 'performance', 'crypto', 'Crypto', 'SubtleCrypto',
  'fetch', 'Headers', 'Request', 'Response', 'FormData', 'File', 'Blob', 'WebSocket', 'EventSource',
  'BroadcastChannel', 'MessageChannel', 'MessagePort', 'CompressionStream', 'DecompressionStream',
  'URLPattern', 'CloseEvent', 'ErrorEvent', 'AbortController', 'AbortSignal', 'Event', 'EventTarget',
  'CustomEvent', 'MessageEvent', 'DOMException', 'structuredClone', 'atob', 'btoa', 'URL',
  'URLSearchParams', 'TextEncoder', 'TextDecoder', 'TextEncoderStream', 'TextDecoderStream',
  'ReadableStream', 'WritableStream', 'TransformStream', 'PerformanceEntry', 'PerformanceMark',
  'PerformanceMeasure', 'PerformanceObserver', 'PerformanceResourceTiming', 'CryptoKey',
  'WebAssembly', 'queueMicrotask',
];

const MODULE_SCOPE_NAMES = ['require', 'module', 'exports', '__dirname', '__filename'];

const DENY_LIST = [
  'process', 'Buffer', 'require', 'module', 'exports', 'global', '__dirname', '__filename',
  'setImmediate', 'clearImmediate', 'Error.prepareStackTrace', 'Node 专属堆栈路径',
  '宿主 navigator', 'navigator.userAgent=Node.js/<major>', 'navigator.locks',
  '宿主 localStorage', '宿主 sessionStorage',
  'performance.nodeTiming', 'performance.eventLoopUtilization', 'performance.timerify', 'performance.markResourceTiming',
  '宿主 fetch / undici', '宿主 WebSocket', '宿主 BroadcastChannel / MessageChannel',
  '宿主 URL / TextEncoder / Streams / Events / crypto 等浏览器兼容层直接透传',
];

function parseArgs(argv) {
  const args = { json: false, markdown: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--markdown') args.markdown = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`未知参数：${a}`);
  }
  if (!args.json && !args.markdown) args.markdown = true;
  return args;
}

function usage() {
  return `用法：
  node scripts/check_node_leakage.js --markdown
  node scripts/check_node_leakage.js --json

说明：检查当前 Node 宿主中常见泄露变量，并给出目标 JS 运行上下文的阻断清单。该上下文可为 vm、独立 Node 进程或显式隔离的 global。`;
}

function safeGet(fn, fallback = undefined) {
  try { return fn(); } catch (err) { return fallback === undefined ? `访问失败：${err.message || String(err)}` : fallback; }
}

function descriptorInfo(name) {
  const d = safeGet(() => Object.getOwnPropertyDescriptor(globalThis, name), null);
  if (!d) return null;
  return {
    enumerable: !!d.enumerable,
    configurable: !!d.configurable,
    writable: Object.prototype.hasOwnProperty.call(d, 'writable') ? !!d.writable : undefined,
    hasGetter: typeof d.get === 'function',
    hasSetter: typeof d.set === 'function',
    valueType: Object.prototype.hasOwnProperty.call(d, 'value') ? typeof d.value : undefined,
  };
}

function globalStatus(name) {
  const type = safeGet(() => typeof globalThis[name], '访问失败');
  const accessFailed = String(type).startsWith('访问失败');
  return {
    name,
    visibleOnGlobalThis: type !== 'undefined' && !accessFailed,
    type,
    descriptor: descriptorInfo(name),
  };
}

function collectNavigatorSnapshot() {
  if (typeof globalThis.navigator === 'undefined') return { visible: false };
  const nav = globalThis.navigator;
  const userAgent = safeGet(() => nav.userAgent, '访问失败');
  return {
    visible: true,
    constructorName: safeGet(() => nav.constructor && nav.constructor.name, ''),
    userAgent,
    isNodeUserAgent: /^Node\.js\//.test(String(userAgent || '')),
    platform: safeGet(() => nav.platform, ''),
    language: safeGet(() => nav.language, ''),
    languages: safeGet(() => Array.isArray(nav.languages) ? Array.from(nav.languages) : nav.languages, ''),
    hardwareConcurrency: safeGet(() => nav.hardwareConcurrency, ''),
    locksType: safeGet(() => typeof nav.locks, 'undefined'),
    prototypeKeys: safeGet(() => Object.getOwnPropertyNames(Object.getPrototypeOf(nav)).sort(), []),
  };
}

function collectPerformanceSnapshot() {
  if (typeof globalThis.performance === 'undefined') return { visible: false };
  const perf = globalThis.performance;
  return {
    visible: true,
    constructorName: safeGet(() => perf.constructor && perf.constructor.name, ''),
    hasNodeTiming: safeGet(() => 'nodeTiming' in perf, false),
    hasEventLoopUtilization: safeGet(() => 'eventLoopUtilization' in perf, false),
    hasTimerify: safeGet(() => 'timerify' in perf, false),
    hasMarkResourceTiming: safeGet(() => 'markResourceTiming' in perf, false),
    prototypeKeys: safeGet(() => Object.getOwnPropertyNames(Object.getPrototypeOf(perf)).sort(), []),
  };
}

function collectStorageSnapshot(name) {
  const type = safeGet(() => typeof globalThis[name], '访问失败');
  if (type === 'undefined' || String(type).startsWith('访问失败')) return { visible: false, name, type };
  const storage = safeGet(() => globalThis[name], null);
  return {
    visible: true,
    name,
    type,
    constructorName: safeGet(() => storage && storage.constructor && storage.constructor.name, ''),
    descriptor: descriptorInfo(name),
  };
}

function collect() {
  const moduleScope = Object.fromEntries(MODULE_SCOPE_NAMES.map(name => [name, safeGet(() => eval(`typeof ${name}`) !== 'undefined', false)]));
  const capabilityGlobals = NODE_CAPABILITY_GLOBALS.map(globalStatus);
  const webApiGlobals = NODE_WEB_API_GLOBALS.map(globalStatus);
  const navigatorSnapshot = collectNavigatorSnapshot();
  const performanceSnapshot = collectPerformanceSnapshot();
  const storageSnapshots = [collectStorageSnapshot('localStorage'), collectStorageSnapshot('sessionStorage')];
  const hostSignals = [];
  if (navigatorSnapshot.visible && navigatorSnapshot.isNodeUserAgent) hostSignals.push(`navigator.userAgent=${navigatorSnapshot.userAgent}`);
  if (navigatorSnapshot.visible && navigatorSnapshot.locksType !== 'undefined') hostSignals.push('navigator.locks 可见');
  if (performanceSnapshot.hasNodeTiming) hostSignals.push('performance.nodeTiming 可见');
  if (performanceSnapshot.hasEventLoopUtilization) hostSignals.push('performance.eventLoopUtilization 可见');
  if (performanceSnapshot.hasTimerify) hostSignals.push('performance.timerify 可见');
  if (typeof process !== 'undefined' && process.versions && process.versions.undici) hostSignals.push(`process.versions.undici=${process.versions.undici}`);
  return {
    note: '当前脚本运行在 Node 宿主中，存在这些变量是正常现象；目标网页 JS 所在运行上下文中不应暴露 Node 能力，也不应直接复用宿主 Node Web API 兼容层。',
    host: { node: process.version, platform: process.platform, arch: process.arch, v8: process.versions.v8, undici: process.versions.undici || '' },
    capabilityGlobals,
    webApiGlobals,
    moduleScope,
    navigator: navigatorSnapshot,
    performance: performanceSnapshot,
    storage: storageSnapshots,
    hostSignals,
    denyList: DENY_LIST,
    contextExpectations: {
      process: 'undefined',
      Buffer: 'undefined',
      require: 'undefined',
      module: 'undefined',
      global: 'undefined',
      functionProcess: 'Function("return typeof process")() 应为 "undefined"',
      navigatorUserAgent: '不能以 Node.js/ 开头，必须来自浏览器采样或 fixture',
      navigatorLocks: '不应暴露 Node 的 navigator.locks，除非已按浏览器样本明确实现',
      performanceNodeTiming: 'performance.nodeTiming 应不存在',
      performanceEventLoopUtilization: 'performance.eventLoopUtilization 应不存在',
      performanceTimerify: 'performance.timerify 应不存在',
      storage: 'localStorage/sessionStorage 必须是浏览器页面级 Storage 实现，不得复用 Node 宿主 Storage',
      network: 'fetch/WebSocket 等不得透传宿主实现，探测模式用桩函数，最终请求用已确认 TLS 指纹客户端',
      webCompatGlobals: 'URL/TextEncoder/Streams/Events/crypto/WebAssembly 等浏览器同名 API 如参与检测，也必须按浏览器样本或补环境实现安装，不得盲目透传宿主构造器',
    },
    recommendations: [
      '不要把宿主函数、宿主数组、宿主 URL/TextEncoder 构造器直接塞进目标 JS 运行上下文。',
      'Node 官方文档显示 navigator 是 v21.0.0 新增，不是 Node 20；如存在宿主 navigator，先删除或隔离，再安装浏览器式 Navigator。',
      'Node 22.4+ 如存在宿主 localStorage/sessionStorage，先删除或隔离，再安装浏览器式 Storage。',
      '不要透传宿主 performance；需移除 nodeTiming、eventLoopUtilization、timerify 等 Node 专属能力。',
      'Web Streams、Events、URL、TextEncoder、crypto、WebAssembly、queueMicrotask 等同名 API 也要按目标浏览器样本决定是否覆盖，不能默认复用 Node 宿主对象。',
      '在目标 JS 运行上下文内部定义 fetch、XHR、atob、console 等函数，避免 constructor.constructor 泄露。',
      '目标 JS 运行前检查 Function("return typeof process")()。',
      '最终 runner 中不要为了调试暴露 require、process、Buffer。',
    ],
  };
}

function renderGlobalList(lines, title, items) {
  lines.push('', title);
  for (const g of items) lines.push(`- ${g.name}：${g.visibleOnGlobalThis ? '宿主可见' : '宿主不可见'}（${g.type}）`);
}

function renderMarkdown(result) {
  const lines = ['# Node 泄露阻断检查', '', `- Node.js：${result.host.node}`, `- 平台：${result.host.platform}-${result.host.arch}`, `- undici：${result.host.undici || '未暴露'}`, '', `说明：${result.note}`];
  renderGlobalList(lines, '## 宿主 Node 能力变量状态', result.capabilityGlobals);
  renderGlobalList(lines, '## 宿主 Node Web API 兼容层状态', result.webApiGlobals);
  lines.push('', '## 模块作用域变量');
  for (const [k, v] of Object.entries(result.moduleScope)) lines.push(`- ${k}：${v ? '存在' : '不存在'}`);
  lines.push('', '## navigator 宿主信号');
  if (!result.navigator.visible) lines.push('- 宿主 navigator 不可见');
  else {
    lines.push(`- userAgent：${result.navigator.userAgent}`);
    lines.push(`- 是否 Node userAgent：${result.navigator.isNodeUserAgent ? '是' : '否'}`);
    lines.push(`- platform：${result.navigator.platform}`);
    lines.push(`- language：${result.navigator.language}`);
    lines.push(`- hardwareConcurrency：${result.navigator.hardwareConcurrency}`);
    lines.push(`- locks：${result.navigator.locksType}`);
  }
  lines.push('', '## performance 宿主信号');
  if (!result.performance.visible) lines.push('- 宿主 performance 不可见');
  else {
    lines.push(`- nodeTiming：${result.performance.hasNodeTiming ? '可见' : '不可见'}`);
    lines.push(`- eventLoopUtilization：${result.performance.hasEventLoopUtilization ? '可见' : '不可见'}`);
    lines.push(`- timerify：${result.performance.hasTimerify ? '可见' : '不可见'}`);
    lines.push(`- markResourceTiming：${result.performance.hasMarkResourceTiming ? '可见' : '不可见'}`);
  }
  if (result.hostSignals.length) {
    lines.push('', '## 已发现宿主特征信号');
    for (const item of result.hostSignals) lines.push(`- ${item}`);
  }
  lines.push('', '## 目标运行上下文阻断清单');
  for (const name of result.denyList) lines.push(`- ${name}`);
  lines.push('', '## 建议');
  for (const item of result.recommendations) lines.push(`- ${item}`);
  return lines.join('\n') + '\n';
}

try {
  const args = parseArgs(process.argv);
  if (args.help) { console.log(usage()); process.exit(0); }
  const result = collect();
  if (args.json) console.log(JSON.stringify(result, null, 2));
  if (args.markdown) process.stdout.write(renderMarkdown(result));
} catch (err) {
  console.error(err.message || String(err));
  console.error(usage());
  process.exit(1);
}
