// xbs isolated-vm runtime 模板：仅在用户明确选择 isolated-vm 时复制到最终项目。
// 默认加载随 Skill 携带的魔改 isolated-vm 二进制，并在隔离 Context 内使用 window.xbs / globalThis.xbs。
// 不要在该模式下桥接旧 addon.node；xbs API 就是 isolated-vm Context 内的 native-first 能力。
'use strict';

const fs = require('fs');
const path = require('path');

const EXPECTED_XBS_APIS = Object.freeze([
  'clearProtoChainRegistry',
  'createGetter',
  'createInterceptor',
  'createNativeCollection',
  'createNativeFunction',
  'createNativeObject',
  'createProtoChains',
  'createSetter',
  'createUndetectable',
  'deletePrivate',
  'deleteProtoChainRegistryEntry',
  'getMimeTypesAndPlugins',
  'getPrivate',
  'getProtoChainRegistry',
  'hasPrivate',
  'setPrivate',
  'throwTypeError',
]);

function getPlatformKey() {
  return process.platform + '-' + process.arch;
}

function getBundledXbsIsolatedVmPath() {
  return path.join(__dirname, 'xbs-isolated-vm', getPlatformKey(), 'isolated_vm.node');
}

function resolveXbsIsolatedVmPath(options = {}) {
  const explicit = options.xbsIsolatedVmPath || process.env.WEB_JS_ENV_PATCHER_XBS_ISOLATED_VM;
  return path.resolve(explicit || getBundledXbsIsolatedVmPath());
}

function isAbiMismatch(error) {
  const message = String(error && error.message ? error.message : error || '');
  return /NODE_MODULE_VERSION|Module version mismatch|was compiled against a different Node\.js version|ABI/i.test(message);
}

function formatLoadFailure(error, binaryPath) {
  const message = String(error && error.message ? error.message : error || '未知错误');
  const lines = [
    '无法加载随包魔改版 xbs isolated-vm。',
    '二进制路径：' + binaryPath,
    '当前平台：' + getPlatformKey(),
    '当前 Node：' + process.version + '，ABI：' + (process.versions && process.versions.modules ? process.versions.modules : 'unknown'),
    '原始错误：' + message,
  ];
  if (!fs.existsSync(binaryPath)) {
    lines.push('当前平台目录下未找到 isolated_vm.node；请提供当前平台 / 架构 / Node ABI 匹配的魔改构建产物，或改选不使用框架 / vm / jsEnv。');
  } else if (isAbiMismatch(error)) {
    lines.push('这是 Node ABI 不匹配问题；请提供与当前 Node ABI 匹配的魔改 xbs isolated-vm 构建产物，或切换到匹配 Node 版本，或改选不使用框架 / vm / jsEnv。');
  } else {
    lines.push('请确认该二进制来自魔改 xbs isolated-vm，且与当前平台、架构、Node ABI 兼容。不要自动退回 npm 原版 isolated-vm。');
  }
  return lines.join('\n');
}

function loadXbsIsolatedVm(options = {}) {
  const binaryPath = resolveXbsIsolatedVmPath(options);
  try {
    const ivm = require(binaryPath);
    return {
      ivm,
      binaryPath,
      platformKey: getPlatformKey(),
      nodeVersion: process.version,
      nodeAbi: process.versions && process.versions.modules ? process.versions.modules : '',
      expectedApis: EXPECTED_XBS_APIS.slice(),
    };
  } catch (error) {
    const wrapped = new Error(formatLoadFailure(error, binaryPath));
    wrapped.cause = error;
    wrapped.binaryPath = binaryPath;
    wrapped.abiMismatch = isAbiMismatch(error);
    throw wrapped;
  }
}

async function maybeAwait(value) {
  return value && typeof value.then === 'function' ? await value : value;
}

async function createContext(isolate) {
  if (typeof isolate.createContextSync === 'function') return isolate.createContextSync();
  return maybeAwait(isolate.createContext());
}

async function compileScript(isolate, source, options) {
  if (typeof isolate.compileScriptSync === 'function') return isolate.compileScriptSync(String(source), options);
  return maybeAwait(isolate.compileScript(String(source), options));
}

async function runCompiledScript(script, context, options) {
  if (typeof script.runSync === 'function') return script.runSync(context, options);
  return maybeAwait(script.run(context, options));
}

async function runSource(isolate, context, source, options = {}) {
  const script = await compileScript(isolate, source, { filename: options.filename || 'anonymous.js' });
  return runCompiledScript(script, context, {
    timeout: options.timeoutMs || 5000,
    copy: options.copy !== false,
  });
}

function copyIntoIsolate(ivm, value) {
  if (ivm && typeof ivm.ExternalCopy === 'function') {
    return new ivm.ExternalCopy(value).copyInto();
  }
  return value;
}

async function setGlobalValue(ivm, globalRef, name, value) {
  const copied = copyIntoIsolate(ivm, value);
  if (globalRef && typeof globalRef.setSync === 'function') return globalRef.setSync(name, copied);
  if (globalRef && typeof globalRef.set === 'function') return maybeAwait(globalRef.set(name, copied));
  throw new Error('isolated-vm global 对象不支持 set：' + name);
}

async function getGlobalValue(globalRef, name) {
  if (globalRef && typeof globalRef.getSync === 'function') return globalRef.getSync(name);
  if (globalRef && typeof globalRef.get === 'function') return maybeAwait(globalRef.get(name));
  throw new Error('isolated-vm global 对象不支持 get：' + name);
}

function buildXbsSelfCheckSource() {
  const expectedJson = JSON.stringify(EXPECTED_XBS_APIS.slice().sort());
  return '(() => {\n' +
    '  const expected = ' + expectedJson + ';\n' +
    '  const api = globalThis.xbs || (typeof window !== "undefined" && window.xbs);\n' +
    '  const apiNames = api ? Object.keys(api).sort() : [];\n' +
    '  const missing = expected.filter(name => !apiNames.includes(name));\n' +
    '  const extra = apiNames.filter(name => !expected.includes(name));\n' +
    '  return {\n' +
    '    windowIsGlobal: typeof window !== "undefined" && window === globalThis,\n' +
    '    selfIsWindow: typeof self !== "undefined" && typeof window !== "undefined" && self === window,\n' +
    '    topIsWindow: typeof top !== "undefined" && typeof window !== "undefined" && top === window,\n' +
    '    parentIsWindow: typeof parent !== "undefined" && typeof window !== "undefined" && parent === window,\n' +
    '    hasWindowConstructor: typeof Window === "function",\n' +
    '    windowInstanceOfWindow: typeof Window === "function" && typeof window !== "undefined" && window instanceof Window,\n' +
    '    hasXbs: !!api, apiNames, missing, extra\n' +
    '  };\n' +
    '})()';
}

async function inspectXbsApi(isolate, context, timeoutMs = 5000) {
  const result = await runSource(isolate, context, buildXbsSelfCheckSource(), {
    filename: 'xbs-self-check.js',
    timeoutMs,
    copy: true,
  });
  const ok = !!(result && result.windowIsGlobal && result.hasXbs && Array.isArray(result.missing) && result.missing.length === 0);
  return Object.assign({ ok }, result || {});
}

function buildXbsSelfCheckError(selfCheck) {
  return [
    'xbs isolated-vm Context 自检失败。',
    'window === globalThis：' + (selfCheck && selfCheck.windowIsGlobal ? '是' : '否'),
    '是否存在 xbs：' + (selfCheck && selfCheck.hasXbs ? '是' : '否'),
    '缺失 API：' + (selfCheck && selfCheck.missing && selfCheck.missing.length ? selfCheck.missing.join(', ') : '无'),
    '额外 API：' + (selfCheck && selfCheck.extra && selfCheck.extra.length ? selfCheck.extra.join(', ') : '无'),
    '请确认加载的是魔改版 xbs isolated-vm，而不是 npm 原版 isolated-vm。',
  ].join('\n');
}

function createIsolatedVmRuntime(options = {}) {
  const loaded = loadXbsIsolatedVm(options);
  const ivm = loaded.ivm;
  const installEnvSource = options.installEnvSource || '';
  const memoryLimit = options.memoryLimitMb || 128;
  const isolate = new ivm.Isolate({ memoryLimit });
  let context = null;
  let jail = null;
  let xbsSelfCheck = null;

  return {
    name: 'xbs-isolated-vm',
    mode: 'isolated-vm',
    isolate,
    binaryPath: loaded.binaryPath,
    nodeAbi: loaded.nodeAbi,
    platformKey: loaded.platformKey,

    async initialize(fixture = {}) {
      context = await createContext(isolate);
      jail = context.global;
      await setGlobalValue(ivm, jail, '__fixture__', fixture);
      xbsSelfCheck = await inspectXbsApi(isolate, context, options.timeoutMs || 5000);
      if (options.requireXbs !== false && !xbsSelfCheck.ok) throw new Error(buildXbsSelfCheckError(xbsSelfCheck));
      if (installEnvSource) {
        await runSource(isolate, context, String(installEnvSource), {
          filename: 'install-env.js',
          timeoutMs: options.timeoutMs || 5000,
          copy: true,
        });
      }
      return { context, jail, xbs: xbsSelfCheck, binaryPath: loaded.binaryPath, nodeAbi: loaded.nodeAbi, platformKey: loaded.platformKey };
    },

    async load(sourceCode, meta = {}) {
      if (!context) throw new Error('xbs isolated-vm runtime 尚未初始化');
      return runSource(isolate, context, String(sourceCode), {
        filename: meta.filename || 'target.js',
        timeoutMs: options.timeoutMs || 5000,
        copy: meta.copy !== false,
      });
    },

    async call(entry, args = []) {
      if (!context) throw new Error('xbs isolated-vm runtime 尚未初始化');
      const fn = await getGlobalValue(context.global, String(entry));
      if (!fn || typeof fn.apply !== 'function') throw new TypeError('入口函数不存在或不可调用：' + String(entry));
      const copiedArgs = copyIntoIsolate(ivm, args);
      return maybeAwait(fn.apply(undefined, copiedArgs, {
        arguments: { copy: true },
        result: { copy: true },
        timeout: options.timeoutMs || 5000,
      }));
    },

    getXbsApiSummary() {
      return xbsSelfCheck ? Object.assign({}, xbsSelfCheck) : null;
    },

    async dispose() {
      if (isolate && !isolate.isDisposed && typeof isolate.dispose === 'function') isolate.dispose();
    },
  };
}

module.exports = {
  EXPECTED_XBS_APIS,
  buildXbsSelfCheckError,
  createIsolatedVmRuntime,
  createXbsIsolatedVmRuntime: createIsolatedVmRuntime,
  getBundledXbsIsolatedVmPath,
  getPlatformKey,
  inspectXbsApi,
  isAbiMismatch,
  loadXbsIsolatedVm,
  resolveXbsIsolatedVmPath,
};
