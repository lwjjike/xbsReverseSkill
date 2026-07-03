// xbs isolated-vm runtime 模板：仅在用户明确选择 isolated-vm 时复制到最终项目。
// 默认加载随 Skill 携带的魔改 isolated-vm 二进制，并在隔离 Context 内使用 window.xbs / globalThis.xbs。
// 不要在该模式下桥接旧 addon.node；xbs API 就是 isolated-vm Context 内的 native-first 能力。
// 补环境源码应保存为真实 .js 文件，通过 runFile/runFiles 读取后注入 Context，避免大段 String.raw 聚合脚本。
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

function toPosixPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function resolveSourceRoot(options = {}) {
  const explicit = options.sourceRoot || options.projectRoot || process.env.WEB_JS_ENV_PATCHER_SOURCE_ROOT;
  return path.resolve(explicit || process.cwd());
}

function resolveSourceFilePath(sourceRoot, requestedPath, allowOutsideSourceRoot = false) {
  if (!requestedPath) throw new Error('runFile 需要传入文件路径');
  const resolved = path.resolve(sourceRoot, requestedPath);
  const relativePath = path.relative(sourceRoot, resolved);
  const escaped = relativePath.startsWith('..') || path.isAbsolute(relativePath);
  if (escaped && !allowOutsideSourceRoot) {
    throw new Error('runFile 路径逃逸 sourceRoot：' + requestedPath);
  }
  return resolved;
}

function readSourceFile(sourceRoot, requestedPath, options = {}) {
  const filePath = resolveSourceFilePath(sourceRoot, requestedPath, !!options.allowOutsideSourceRoot);
  const source = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const filename = options.filename || toPosixPath(path.relative(sourceRoot, filePath));
  return { filePath, filename, source };
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

function normalizeIvmExport(loadedModule) {
  if (loadedModule && typeof loadedModule.Isolate === 'function') return loadedModule;
  if (loadedModule && loadedModule.ivm && typeof loadedModule.ivm.Isolate === 'function') return loadedModule.ivm;
  if (loadedModule && loadedModule.default && typeof loadedModule.default.Isolate === 'function') return loadedModule.default;
  if (loadedModule && loadedModule.default && loadedModule.default.ivm && typeof loadedModule.default.ivm.Isolate === 'function') return loadedModule.default.ivm;
  throw new TypeError('魔改 isolated_vm.node 已加载，但未导出可用的 Isolate 构造函数。');
}

function loadXbsIsolatedVm(options = {}) {
  const binaryPath = resolveXbsIsolatedVmPath(options);
  try {
    const loadedModule = require(binaryPath);
    const ivm = normalizeIvmExport(loadedModule);
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
    '  const dom = { ok: false, hasDom: false, hasCreateDocument: false };\n' +
    '  try {\n' +
    '    dom.hasDom = !!(api && api.dom);\n' +
    '    dom.hasCreateDocument = !!(api && api.dom && typeof api.dom.createDocument === "function");\n' +
    '    dom.windowDocumentWasPreinstalled = typeof window !== "undefined" && "document" in window;\n' +
    '    if (dom.hasCreateDocument) {\n' +
    '      const document = api.dom.createDocument({\n' +
    '        url: "https://example.com/path?q=1",\n' +
    '        html: "<main id=\\"app\\"><span class=\\"hot\\">hello</span><iframe id=\\"f\\"></iframe></main>"\n' +
    '      });\n' +
    '      const withoutAll = api.dom.createDocument({ omitApis: ["document.all"] });\n' +
    '      const iframe = document.getElementById("f");\n' +
    '      dom.documentCtor = document && document.constructor ? document.constructor.name : "";\n' +
    '      dom.url = document.URL;\n' +
    '      dom.documentURI = document.documentURI;\n' +
    '      dom.text = document.querySelector(".hot").textContent;\n' +
    '      dom.hasAll = "all" in document;\n' +
    '      dom.allType = typeof document.all;\n' +
    '      const allValue = document.all;\n' +
    '      dom.allLooseNull = document.all == null;\n' +
    '      dom.allStrictUndefined = document.all === undefined;\n' +
    '      dom.allBoolean = Boolean(document.all);\n' +
    '      dom.allLengthType = typeof document.all.length;\n' +
    '      dom.allItemType = typeof document.all.item;\n' +
    '      dom.allNamedItemType = typeof document.all.namedItem;\n' +
    '      dom.allObjectToString = Object.prototype.toString.call(document.all);\n' +
    '      dom.allOwnLength = Object.hasOwn(document.all, \"length\");\n' +
    '      dom.allOwnItem = Object.hasOwn(document.all, \"item\");\n' +
    '      dom.allOwnNamedItem = Object.hasOwn(document.all, \"namedItem\");\n' +
    '      dom.allSameReference = allValue === document.all;\n' +
    '      dom.omitAllWorks = !("all" in withoutAll);\n' +
    '      dom.iframeContentDocument = !!(iframe && iframe.contentDocument && iframe.contentWindow && iframe.contentWindow.document === iframe.contentDocument);\n' +
    '      dom.ok = dom.documentCtor === "HTMLDocument" && dom.text === "hello" &&\n' +
    '        dom.url === "https://example.com/path?q=1" && dom.documentURI === dom.url &&\n' +
    '        dom.hasAll && dom.allType === "undefined" && dom.allLooseNull &&\n' +
    '        !dom.allStrictUndefined && dom.allBoolean === false &&\n' +
    '        dom.allLengthType === "number" && dom.allItemType === "function" &&\n' +
    '        dom.allNamedItemType === "function" && dom.allObjectToString === "[object HTMLAllCollection]" &&\n' +
    '        dom.allOwnLength === false && dom.allOwnItem === false && dom.allOwnNamedItem === false &&\n' +
    '        dom.allSameReference && dom.omitAllWorks;\n' +
    '    }\n' +
    '  } catch (error) {\n' +
    '    dom.error = String(error && error.message ? error.message : error);\n' +
    '  }\n' +
    '  return {\n' +
    '    windowIsGlobal: typeof window !== "undefined" && window === globalThis,\n' +
    '    selfIsWindow: typeof self !== "undefined" && typeof window !== "undefined" && self === window,\n' +
    '    topIsWindow: typeof top !== "undefined" && typeof window !== "undefined" && top === window,\n' +
    '    parentIsWindow: typeof parent !== "undefined" && typeof window !== "undefined" && parent === window,\n' +
    '    hasWindowConstructor: typeof Window === "function",\n' +
    '    windowInstanceOfWindow: typeof Window === "function" && typeof window !== "undefined" && window instanceof Window,\n' +
    '    hasXbs: !!api, hasXbsDom: dom.hasDom, hasCreateDocument: dom.hasCreateDocument, apiNames, missing, extra, dom\n' +
    '  };\n' +
    '})()';
}

async function inspectXbsApi(isolate, context, timeoutMs = 5000) {
  const result = await runSource(isolate, context, buildXbsSelfCheckSource(), {
    filename: 'xbs-self-check.js',
    timeoutMs,
    copy: true,
  });
  const ok = !!(
    result &&
    result.windowIsGlobal &&
    result.hasXbs &&
    Array.isArray(result.missing) &&
    result.missing.length === 0 &&
    result.hasXbsDom &&
    result.hasCreateDocument &&
    result.dom &&
    result.dom.ok
  );
  return Object.assign({ ok }, result || {});
}

function buildXbsSelfCheckError(selfCheck) {
  const dom = selfCheck && selfCheck.dom ? selfCheck.dom : null;
  return [
    'xbs isolated-vm Context 自检失败。',
    'window === globalThis：' + (selfCheck && selfCheck.windowIsGlobal ? '是' : '否'),
    '是否存在 xbs：' + (selfCheck && selfCheck.hasXbs ? '是' : '否'),
    '缺失核心 API：' + (selfCheck && selfCheck.missing && selfCheck.missing.length ? selfCheck.missing.join(', ') : '无'),
    '额外 API：' + (selfCheck && selfCheck.extra && selfCheck.extra.length ? selfCheck.extra.join(', ') : '无'),
    '是否存在 xbs.dom：' + (selfCheck && selfCheck.hasXbsDom ? '是' : '否'),
    '是否存在 xbs.dom.createDocument：' + (selfCheck && selfCheck.hasCreateDocument ? '是' : '否'),
    'DOM smoke test：' + (dom && dom.ok ? '通过' : '未通过'),
    'DOM 错误：' + (dom && dom.error ? dom.error : '无'),
    '请确认加载的是魔改版 xbs isolated-vm，而不是 npm 原版 isolated-vm。',
  ].join('\n');
}

function buildInstallDomSource() {
  return '(() => {\n' +
    '  const options = Object.assign({}, globalThis.__xbsDomOptions__ || {});\n' +
    '  const attachToWindow = options.attachToWindow !== false;\n' +
    '  delete options.enabled;\n' +
    '  delete options.attachToWindow;\n' +
    '  const document = xbs.dom.createDocument(options);\n' +
    '  if (attachToWindow) {\n' +
    '    Object.defineProperty(window, "document", {\n' +
    '      value: document,\n' +
    '      writable: true,\n' +
    '      enumerable: true,\n' +
    '      configurable: true\n' +
    '    });\n' +
    '  }\n' +
    '  globalThis.__xbsDocument__ = document;\n' +
    '  return {\n' +
    '    enabled: true,\n' +
    '    attachToWindow,\n' +
    '    hasWindowDocument: typeof window !== "undefined" && "document" in window,\n' +
    '    documentCtor: document && document.constructor ? document.constructor.name : "",\n' +
    '    url: document.URL,\n' +
    '    documentURI: document.documentURI,\n' +
    '    hasAll: "all" in document,\n' +
    '    allType: typeof document.all,\n' +
    '    allLooseNull: document.all == null,\n' +
    '    allStrictUndefined: document.all === undefined,\n' +
    '    allBoolean: Boolean(document.all),\n' +
    '    allLengthType: typeof document.all.length,\n' +
    '    allItemType: typeof document.all.item,\n' +
    '    allNamedItemType: typeof document.all.namedItem,\n' +
    '    allObjectToString: Object.prototype.toString.call(document.all),\n' +
    '    allOwnLength: Object.hasOwn(document.all, \"length\"),\n' +
    '    allOwnItem: Object.hasOwn(document.all, \"item\"),\n' +
    '    allOwnNamedItem: Object.hasOwn(document.all, \"namedItem\")\n' +
    '  };\n' +
    '})()';
}

function createIsolatedVmRuntime(options = {}) {
  const loaded = loadXbsIsolatedVm(options);
  const ivm = loaded.ivm;
  const installEnvSource = options.installEnvSource || '';
  const memoryLimit = options.memoryLimitMb || 128;
  const sourceRoot = resolveSourceRoot(options);
  const isolate = new ivm.Isolate({ memoryLimit });
  let context = null;
  let jail = null;
  let xbsSelfCheck = null;
  let domInstallSummary = null;

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
      if (options.dom && options.dom.enabled) {
        await setGlobalValue(ivm, jail, '__xbsDomOptions__', options.dom);
        domInstallSummary = await runSource(isolate, context, buildInstallDomSource(), {
          filename: 'xbs-dom-install.js',
          timeoutMs: options.timeoutMs || 5000,
          copy: true,
        });
      }
      if (installEnvSource) {
        await runSource(isolate, context, String(installEnvSource), {
          filename: 'install-env.js',
          timeoutMs: options.timeoutMs || 5000,
          copy: true,
        });
      }
      return { context, jail, xbs: xbsSelfCheck, dom: domInstallSummary, binaryPath: loaded.binaryPath, nodeAbi: loaded.nodeAbi, platformKey: loaded.platformKey };
    },

    async load(sourceCode, meta = {}) {
      if (!context) throw new Error('xbs isolated-vm runtime 尚未初始化');
      return runSource(isolate, context, String(sourceCode), {
        filename: meta.filename || 'target.js',
        timeoutMs: options.timeoutMs || 5000,
        copy: meta.copy !== false,
      });
    },

    async runFile(filePath, meta = {}) {
      if (!context) throw new Error('xbs isolated-vm runtime 尚未初始化');
      const loadedFile = readSourceFile(sourceRoot, filePath, {
        filename: meta.filename,
        allowOutsideSourceRoot: meta.allowOutsideSourceRoot || options.allowOutsideSourceRoot,
      });
      return runSource(isolate, context, loadedFile.source, {
        filename: loadedFile.filename,
        timeoutMs: meta.timeoutMs || options.timeoutMs || 5000,
        copy: meta.copy !== false,
      });
    },

    async runFiles(files, meta = {}) {
      if (!Array.isArray(files)) throw new TypeError('runFiles 需要传入文件路径数组');
      const results = [];
      for (const item of files) {
        const fileItem = typeof item === 'string' ? { path: item } : Object(item || {});
        results.push(await this.runFile(fileItem.path || fileItem.file, Object.assign({}, meta, fileItem.options || {}, {
          filename: fileItem.filename || (fileItem.options && fileItem.options.filename),
        })));
      }
      return results;
    },

    getSourceRoot() {
      return sourceRoot;
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

    getDomInstallSummary() {
      return domInstallSummary ? Object.assign({}, domInstallSummary) : null;
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
  buildInstallDomSource,
  isAbiMismatch,
  loadXbsIsolatedVm,
  normalizeIvmExport,
  readSourceFile,
  resolveSourceFilePath,
  resolveSourceRoot,
  resolveXbsIsolatedVmPath,
  toPosixPath,
};
