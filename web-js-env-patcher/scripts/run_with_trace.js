#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadNativeAddon } = require('./load_native_addon');

function parseArgs(argv) {
  const args = { target: '', entry: '', fixture: '', trace: '', summary: '', output: '', addon: '', timeout: 5000, json: false, markdown: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--target') args.target = argv[++i] || '';
    else if (a === '--entry') args.entry = argv[++i] || '';
    else if (a === '--fixture') args.fixture = argv[++i] || '';
    else if (a === '--trace') args.trace = argv[++i] || '';
    else if (a === '--summary') args.summary = argv[++i] || '';
    else if (a === '--output') args.output = argv[++i] || '';
    else if (a === '--addon') args.addon = argv[++i] || '';
    else if (a === '--timeout') args.timeout = Number(argv[++i] || '5000');
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
  node scripts/run_with_trace.js --target case/js/original/app.js --entry window.makeSign --fixture case/fixtures/sample.fixture.json --trace case/tmp/env-trace.jsonl --summary case/tmp/missing-env.json --output case/tmp/node-output.json

说明：该脚本用于探测模式。默认在 vm 探测上下文内定义浏览器桩函数，避免把宿主 require/process/Buffer 以及 Node 自带 navigator/performance/localStorage 等 Web API 兼容层暴露给目标 JS；正式交付不强制只能使用 vm。`;
}

function readJson(p) { return p ? JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '')) : {}; }
function ensureParent(p) { if (p) fs.mkdirSync(path.dirname(path.resolve(p)), { recursive: true }); }

function bootstrapSource(fixture) {
  const fixtureText = JSON.stringify(JSON.stringify(fixture || {}));
  return `
'use strict';
const __fixture = JSON.parse(${fixtureText});
Object.defineProperty(globalThis, '__events', { value: [], enumerable: false, configurable: true });
function __safe(v) {
  if (v == null || ['string', 'number', 'boolean'].includes(typeof v)) return v;
  if (Array.isArray(v)) return v.slice(0, 20).map(__safe);
  if (typeof v === 'function') return '[Function ' + (v.name || 'anonymous') + ']';
  if (typeof v === 'object') return '[Object ' + ((v.constructor && v.constructor.name) || 'Object') + ']';
  return '[' + typeof v + ']';
}
function __push(e) {
  try {
    e.ts = Date.now();
    __events.push(e);
  } catch (_) {}
}
Object.defineProperty(globalThis, '__push', { value: __push, enumerable: false, configurable: true });

function traceProxy(name, options) {
  options = options || {};
  const target = function traceProxyFunction() {};
  const cache = Object.create(null);
  const primitive = options.primitive == null ? '' : options.primitive;
  return new Proxy(target, {
    get(t, prop) {
      if (prop === Symbol.toPrimitive) return function(hint) { __push({ type: 'toPrimitive', path: name, hint: hint }); return hint === 'number' ? 0 : primitive; };
      if (prop === Symbol.toStringTag) return options.tag || name.split('.').pop() || 'Object';
      if (prop === 'then') return undefined;
      if (prop === 'toString') return function toString() { __push({ type: 'call', path: name + '.toString', args: [] }); return String(primitive || '[object ' + (options.tag || 'Object') + ']'); };
      if (prop === 'valueOf') return function valueOf() { __push({ type: 'call', path: name + '.valueOf', args: [] }); return primitive || 0; };
      const key = String(prop);
      __push({ type: 'get', path: name + '.' + key });
      if (!cache[key]) cache[key] = traceProxy(name + '.' + key);
      return cache[key];
    },
    set(t, prop, value) { const key = String(prop); __push({ type: 'set', path: name + '.' + key, value: __safe(value), valueType: typeof value }); cache[key] = value; return true; },
    has(t, prop) { __push({ type: 'has', path: name, prop: String(prop) }); return Object.prototype.hasOwnProperty.call(cache, String(prop)); },
    ownKeys() { __push({ type: 'ownKeys', path: name }); return Object.keys(cache); },
    getOwnPropertyDescriptor(t, prop) { __push({ type: 'getOwnPropertyDescriptor', path: name, prop: String(prop) }); return cache[String(prop)] ? { value: cache[String(prop)], enumerable: true, configurable: true, writable: true } : undefined; },
    getPrototypeOf() { __push({ type: 'getPrototypeOf', path: name }); return Function.prototype; },
    apply(t, thisArg, args) { __push({ type: 'call', path: name, args: Array.from(args).map(v => typeof v) }); return traceProxy(name + '()'); },
    construct(t, args) { __push({ type: 'new', path: name, args: Array.from(args).map(v => typeof v) }); return traceProxy('new ' + name); },
  });
}

function makeStorage(name, initial) {
  const data = new Map(Object.entries(initial || {}).map(([k, v]) => [String(k), String(v)]));
  const storage = {
    get length() { __push({ type: 'get', path: name + '.length' }); return data.size; },
    key(i) { __push({ type: 'call', path: name + '.key', args: ['number'] }); return Array.from(data.keys())[Number(i)] ?? null; },
    getItem(k) { __push({ type: 'call', path: name + '.getItem', args: ['string'] }); k = String(k); return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { __push({ type: 'call', path: name + '.setItem', args: ['string', 'string'] }); data.set(String(k), String(v)); },
    removeItem(k) { __push({ type: 'call', path: name + '.removeItem', args: ['string'] }); data.delete(String(k)); },
    clear() { __push({ type: 'call', path: name + '.clear', args: [] }); data.clear(); },
  };
  Object.defineProperty(storage, '__data', { value: data, enumerable: false });
  return storage;
}

function parseLocation(raw) {
  const s = String(raw || 'https://example.com/');
  const m = s.match(/^([a-z][a-z0-9+.-]*:)\\/\\/([^\\/?#]*)([^?#]*)(\\?[^#]*)?(#.*)?$/i);
  if (!m) return { href: s, origin: '', protocol: '', host: '', hostname: '', port: '', pathname: '', search: '', hash: '', toString() { return this.href; } };
  const protocol = m[1], host = m[2], pathname = m[3] || '/', search = m[4] || '', hash = m[5] || '';
  const hp = host.split(':');
  return { href: protocol + '//' + host + pathname + search + hash, origin: protocol + '//' + host, protocol, host, hostname: hp[0], port: hp[1] || '', pathname, search, hash, toString() { return this.href; } };
}

class URLSearchParams {
  constructor(init) {
    this._pairs = [];
    if (typeof init === 'string') {
      const text = init.replace(/^\\?/, '');
      if (text) for (const part of text.split('&')) {
        if (!part) continue;
        const idx = part.indexOf('=');
        const k = idx >= 0 ? part.slice(0, idx) : part;
        const v = idx >= 0 ? part.slice(idx + 1) : '';
        this.append(decodeURIComponent(k.replace(/\\+/g, ' ')), decodeURIComponent(v.replace(/\\+/g, ' ')));
      }
    } else if (init && typeof init === 'object') {
      for (const k of Object.keys(init)) this.append(k, init[k]);
    }
  }
  append(k, v) { this._pairs.push([String(k), String(v)]); }
  set(k, v) { k = String(k); this._pairs = this._pairs.filter(p => p[0] !== k); this.append(k, v); }
  get(k) { k = String(k); const p = this._pairs.find(x => x[0] === k); return p ? p[1] : null; }
  has(k) { k = String(k); return this._pairs.some(x => x[0] === k); }
  toString() { return this._pairs.map(p => encodeURIComponent(p[0]) + '=' + encodeURIComponent(p[1])).join('&'); }
}
globalThis.URLSearchParams = URLSearchParams;

class URL {
  constructor(input, base) {
    const loc = parseLocation(input || base || 'https://example.com/');
    Object.assign(this, loc);
    this.searchParams = new URLSearchParams(this.search);
  }
  toString() { return this.href; }
}
globalThis.URL = URL;

class TextEncoder {
  encode(input) {
    const s = unescape(encodeURIComponent(String(input)));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
}
class TextDecoder {
  decode(input) {
    const arr = Array.from(input || []);
    return decodeURIComponent(escape(String.fromCharCode.apply(null, arr)));
  }
}
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;

const __b64chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
function btoa(input) {
  let str = String(input), output = '';
  for (let block = 0, charCode, i = 0, map = __b64chars; str.charAt(i | 0) || (map = '=', i % 1); output += map.charAt(63 & block >> 8 - i % 1 * 8)) {
    charCode = str.charCodeAt(i += 3 / 4);
    if (charCode > 0xFF) throw new Error('字符超出 Latin1 范围');
    block = block << 8 | charCode;
  }
  return output;
}
function atob(input) {
  let str = String(input).replace(/=+$/, ''), output = '';
  if (str.length % 4 === 1) throw new Error('无效 base64');
  for (let bc = 0, bs = 0, buffer, i = 0; buffer = str.charAt(i++); ~buffer && (bs = bc % 4 ? bs * 64 + buffer : buffer, bc++ % 4) ? output += String.fromCharCode(255 & bs >> (-2 * bc & 6)) : 0) {
    buffer = __b64chars.indexOf(buffer);
  }
  return output;
}
globalThis.atob = atob;
globalThis.btoa = btoa;

const console = {};
for (const name of ['log', 'warn', 'error', 'info', 'debug', 'trace', 'group', 'groupEnd']) {
  console[name] = function() { __push({ type: 'console', path: 'console.' + name, args: Array.from(arguments).map(v => typeof v) }); };
}
globalThis.console = console;

let __timerId = 1;
globalThis.setTimeout = function(fn, delay) { __push({ type: 'call', path: 'setTimeout', args: [typeof fn, typeof delay] }); return __timerId++; };
globalThis.clearTimeout = function(id) { __push({ type: 'call', path: 'clearTimeout', args: [typeof id] }); };
globalThis.setInterval = function(fn, delay) { __push({ type: 'call', path: 'setInterval', args: [typeof fn, typeof delay] }); return __timerId++; };
globalThis.clearInterval = function(id) { __push({ type: 'call', path: 'clearInterval', args: [typeof id] }); };

globalThis.window = globalThis;
globalThis.self = globalThis;
globalThis.top = globalThis;
globalThis.parent = globalThis;

const browser = __fixture.browser || {};
const request = __fixture.request || {};
const runtime = __fixture.runtime || {};
globalThis.location = parseLocation(__fixture.pageUrl || __fixture.url || __fixture.apiUrl || 'https://example.com/');
globalThis.screen = Object.assign({ width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, pixelDepth: 24 }, browser.screen || {});
globalThis.devicePixelRatio = browser.devicePixelRatio || 1;
globalThis.history = traceProxy('history');
const __navigatorData = {
  userAgent: browser.userAgent || '',
  language: browser.language || 'zh-CN',
  languages: browser.languages || [browser.language || 'zh-CN', 'zh'],
  platform: browser.platform || 'Win32',
  hardwareConcurrency: browser.hardwareConcurrency || 8,
  deviceMemory: browser.deviceMemory || 8,
  webdriver: false,
  plugins: traceProxy('navigator.plugins', { tag: 'PluginArray' }),
  mimeTypes: traceProxy('navigator.mimeTypes', { tag: 'MimeTypeArray' }),
};
globalThis.navigator = {};
for (const key of Object.keys(__navigatorData)) {
  Object.defineProperty(globalThis.navigator, key, {
    get() { __push({ type: 'get', path: 'navigator.' + key }); return __navigatorData[key]; },
    enumerable: true,
    configurable: true,
  });
}

class Document {}
class HTMLDocument extends Document {}
globalThis.Document = Document;
globalThis.HTMLDocument = HTMLDocument;
const document = new HTMLDocument();
let cookieText = request.cookies && typeof request.cookies === 'object' ? Object.entries(request.cookies).map(([k, v]) => k + '=' + v).join('; ') : '';
Object.defineProperty(Document.prototype, 'cookie', {
  get() { __push({ type: 'get', path: 'document.cookie' }); return cookieText; },
  set(v) { __push({ type: 'set', path: 'document.cookie', valueType: typeof v }); cookieText = cookieText ? cookieText + '; ' + String(v).split(';')[0] : String(v).split(';')[0]; },
  enumerable: true,
  configurable: true,
});
document.URL = globalThis.location.href;
document.referrer = __fixture.referrer || '';
document.createElement = function(tag) { __push({ type: 'call', path: 'document.createElement', args: ['string'] }); return traceProxy('document.createElement(' + String(tag) + ')', { tag: String(tag).toUpperCase() }); };
document.querySelector = function() { __push({ type: 'call', path: 'document.querySelector', args: ['string'] }); return null; };
document.querySelectorAll = function() { __push({ type: 'call', path: 'document.querySelectorAll', args: ['string'] }); return []; };
Object.defineProperty(document, 'all', { get() { __push({ type: 'get', path: 'document.all' }); return undefined; }, enumerable: false, configurable: true });
globalThis.document = document;

globalThis.localStorage = makeStorage('localStorage', request.localStorage || __fixture.localStorage || {});
globalThis.sessionStorage = makeStorage('sessionStorage', request.sessionStorage || __fixture.sessionStorage || {});

const randomBytes = Array.isArray(runtime.randomBytes) ? runtime.randomBytes : [];
globalThis.crypto = {
  getRandomValues(arr) { __push({ type: 'call', path: 'crypto.getRandomValues', args: [arr && arr.constructor && arr.constructor.name || typeof arr] }); for (let i = 0; i < arr.length; i++) arr[i] = randomBytes[i] ?? 0; return arr; },
  randomUUID() { __push({ type: 'call', path: 'crypto.randomUUID', args: [] }); return runtime.randomUUID || '00000000-0000-4000-8000-000000000000'; },
  subtle: traceProxy('crypto.subtle'),
};
globalThis.performance = {
  now() { __push({ type: 'call', path: 'performance.now', args: [] }); return runtime.performanceNow ?? 0; },
  timeOrigin: runtime.timeOrigin ?? runtime.now ?? Date.now(),
};
globalThis.fetch = function fetchStub() { __push({ type: 'call', path: 'fetch', args: Array.from(arguments).map(v => typeof v) }); return Promise.reject(new Error('补环境探测模式默认不发起真实网络请求')); };
for (const name of ['XMLHttpRequest', 'Image', 'HTMLElement', 'HTMLCanvasElement', 'WebGLRenderingContext', 'Headers', 'Request', 'Response', 'WebSocket', 'Worker', 'MessageChannel']) {
  globalThis[name] = traceProxy(name);
}

if (runtime.now) {
  const RealDate = Date;
  function FixedDate() {
    const args = Array.from(arguments);
    if (!(this instanceof FixedDate)) return new RealDate(args.length ? args[0] : runtime.now).toString();
    return new RealDate(args.length ? args[0] : runtime.now);
  }
  FixedDate.now = function() { return runtime.now; };
  FixedDate.parse = RealDate.parse;
  FixedDate.UTC = RealDate.UTC;
  FixedDate.prototype = RealDate.prototype;
  globalThis.Date = FixedDate;
}

function __resolveEntry(entry) {
  const parts = String(entry || '').split('.').filter(Boolean);
  if (parts[0] === 'globalThis' || parts[0] === 'window') parts.shift();
  let cur = globalThis;
  for (const part of parts) { if (cur == null) return undefined; cur = cur[part]; }
  return cur;
}
function __serialize(v) {
  if (v == null || ['string', 'number', 'boolean'].includes(typeof v)) return v;
  if (typeof v === 'bigint') return String(v);
  if (typeof v === 'function') return '[Function ' + (v.name || 'anonymous') + ']';
  try { return JSON.parse(JSON.stringify(v)); } catch (_) { return String(v); }
}
Object.defineProperty(globalThis, '__callEntry', { value: function(entry, argsJson) {
  const fn = __resolveEntry(entry);
  if (typeof fn !== 'function') return JSON.stringify({ entryFound: false, output: undefined, error: { name: 'EntryError', message: '入口不是函数或不存在：' + entry } });
  try {
    const args = JSON.parse(argsJson || '[]');
    const ret = fn.apply(globalThis, Array.isArray(args) ? args : []);
    if (ret && typeof ret.then === 'function') return JSON.stringify({ entryFound: true, output: '[Promise]', async: true });
    return JSON.stringify({ entryFound: true, output: __serialize(ret), outputType: typeof ret });
  } catch (err) {
    return JSON.stringify({ entryFound: true, output: undefined, error: { name: err && err.name || 'Error', message: err && err.message || String(err) } });
  }
}, enumerable: false, configurable: true });
Object.defineProperty(globalThis, '__dumpEvents', { value: function() { return JSON.stringify(__events); }, enumerable: false, configurable: true });
Object.defineProperty(globalThis, '__leakageCheck', { value: function() {
  let functionProcess = 'error';
  let objectCtorProcess = 'error';
  let arrayCtorProcess = 'error';
  try { functionProcess = Function('return typeof process')(); } catch (err) { functionProcess = 'error:' + err.message; }
  try { objectCtorProcess = ({}).constructor.constructor('return typeof process')(); } catch (err) { objectCtorProcess = 'error:' + err.message; }
  try { arrayCtorProcess = ([]).constructor.constructor('return typeof process')(); } catch (err) { arrayCtorProcess = 'error:' + err.message; }
  const navUserAgent = typeof navigator !== 'undefined' && navigator ? String(navigator.userAgent || '') : 'undefined';
  const perfHas = function(name) { try { return typeof performance !== 'undefined' && performance ? (name in performance) : false; } catch (_) { return false; } };
  return JSON.stringify({
    process: typeof process,
    Buffer: typeof Buffer,
    require: typeof require,
    module: typeof module,
    exports: typeof exports,
    global: typeof global,
    setImmediate: typeof setImmediate,
    clearImmediate: typeof clearImmediate,
    functionProcess,
    objectCtorProcess,
    arrayCtorProcess,
    navigator: typeof navigator,
    navigatorUserAgent: navUserAgent,
    navigatorIsNodeUserAgent: /^Node\\.js\\//.test(navUserAgent),
    navigatorLocks: typeof navigator !== 'undefined' && navigator ? typeof navigator.locks : 'undefined',
    performance: typeof performance,
    performanceNodeTiming: perfHas('nodeTiming') ? 'present' : 'absent',
    performanceEventLoopUtilization: perfHas('eventLoopUtilization') ? 'present' : 'absent',
    performanceTimerify: perfHas('timerify') ? 'present' : 'absent',
    performanceMarkResourceTiming: perfHas('markResourceTiming') ? 'present' : 'absent',
    localStorage: typeof localStorage,
    localStorageConstructor: typeof localStorage !== 'undefined' && localStorage && localStorage.constructor ? localStorage.constructor.name : 'undefined',
    sessionStorage: typeof sessionStorage,
    sessionStorageConstructor: typeof sessionStorage !== 'undefined' && sessionStorage && sessionStorage.constructor ? sessionStorage.constructor.name : 'undefined',
    fetch: typeof fetch,
    webSocket: typeof WebSocket,
    broadcastChannel: typeof BroadcastChannel,
    messageChannel: typeof MessageChannel,
    crypto: typeof crypto,
    cryptoConstructor: typeof crypto !== 'undefined' && crypto && crypto.constructor ? crypto.constructor.name : 'undefined',
    subtleCrypto: typeof crypto !== 'undefined' && crypto && crypto.subtle ? typeof crypto.subtle : 'undefined',
    URL: typeof URL,
    URLConstructor: typeof URL !== 'undefined' && URL ? URL.name : 'undefined',
    URLSearchParams: typeof URLSearchParams,
    TextEncoder: typeof TextEncoder,
    TextDecoder: typeof TextDecoder,
    ReadableStream: typeof ReadableStream,
    EventTarget: typeof EventTarget,
    AbortController: typeof AbortController,
    WebAssembly: typeof WebAssembly,
    queueMicrotask: typeof queueMicrotask,
  });
}, enumerable: false, configurable: true });
`;
}

function classifyError(err) {
  const message = err && err.message ? err.message : String(err);
  const name = err && err.name ? err.name : 'Error';
  let m = message.match(/^([A-Za-z_$][\w$]*) is not defined$/);
  if (name === 'ReferenceError' && m) return { type: 'missing-global', name, message, missing: m[1] };
  m = message.match(/Cannot read (?:properties|property) of undefined \(reading ['"]([^'"]+)['"]\)/);
  if (m) return { type: 'missing-property', name, message, missing: m[1] };
  m = message.match(/([A-Za-z0-9_$\.]+) is not a function/);
  if (m) return { type: 'missing-method', name, message, missing: m[1] };
  return { type: 'runtime-error', name, message };
}

function summarize(events, errors, addonResult, leakageCheck) {
  const missingGlobals = [], missingMethods = [], missingProperties = [], specialObjects = [], proxyRiskSignals = [];
  for (const e of errors) {
    if (e.type === 'missing-global') missingGlobals.push(e.missing);
    if (e.type === 'missing-method') missingMethods.push(e.missing);
    if (e.type === 'missing-property') missingProperties.push(e.missing);
  }
  for (const e of events) {
    if (e.path === 'document.all' || (e.path && e.path.startsWith('document.all.'))) specialObjects.push('document.all');
    if (['ownKeys', 'getOwnPropertyDescriptor', 'getPrototypeOf', 'toPrimitive'].includes(e.type)) proxyRiskSignals.push(`${e.type}:${e.path || e.prop || ''}`);
    if (e.path && e.path.endsWith('.toString')) proxyRiskSignals.push(`toString:${e.path}`);
  }
  const uniq = a => [...new Set(a)].filter(Boolean);
  return {
    eventCount: events.length,
    missingGlobals: uniq(missingGlobals),
    missingMethods: uniq(missingMethods),
    missingProperties: uniq(missingProperties),
    specialObjects: uniq(specialObjects),
    nativeAddon: { available: !!(addonResult && addonResult.available), path: addonResult && addonResult.path || '', exports: addonResult && addonResult.exports || [] },
    nodeLeakage: leakageCheck || {},
    proxyRiskSignals: uniq(proxyRiskSignals).slice(0, 100),
    runtimeErrors: errors,
  };
}

function run(args) {
  if (!args.target) throw new Error('必须提供 --target');
  const targetFiles = args.target.split(',').map(s => s.trim()).filter(Boolean).map(p => path.resolve(p));
  for (const f of targetFiles) if (!fs.existsSync(f)) throw new Error(`目标 JS 文件不存在：${f}`);
  const fixture = readJson(args.fixture);
  const addonResult = loadNativeAddon({ addon: args.addon });
  const context = vm.createContext({}, { name: 'web-js-env-patcher' });
  const errors = [];
  let entryResult;
  let entryFound = false;

  new vm.Script(bootstrapSource(fixture), { filename: 'web-js-env-patcher-bootstrap.js' }).runInContext(context, { timeout: args.timeout });

  if (addonResult && addonResult.available && addonResult.addon && addonResult.addon.createUndetectable) {
    try {
      context.__documentAllAddon = addonResult.addon.createUndetectable(function () { return undefined; });
      vm.runInContext("Object.defineProperty(document, 'all', { get() { __push({ type: 'get', path: 'document.all' }); return globalThis.__documentAllAddon; }, enumerable: false, configurable: true });", context, { timeout: args.timeout });
    } catch (err) {
      errors.push({ type: 'native-addon-error', name: err.name || 'Error', message: err.message || String(err) });
    }
  }

  for (const file of targetFiles) {
    try {
      const script = new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
      script.runInContext(context, { timeout: args.timeout });
    } catch (err) { errors.push(classifyError(err)); }
  }

  const entry = args.entry || fixture.entry || '';
  if (entry) {
    try {
      const callCode = `__callEntry(${JSON.stringify(entry)}, ${JSON.stringify(JSON.stringify(Array.isArray(fixture.args) ? fixture.args : []))})`;
      const callResult = JSON.parse(vm.runInContext(callCode, context, { timeout: args.timeout }));
      entryFound = !!callResult.entryFound;
      entryResult = callResult.output;
      if (!entryFound) errors.push({ type: 'entry-not-found', name: 'EntryError', message: `入口不是函数或不存在：${entry}`, missing: entry });
      if (callResult.error) errors.push(classifyError(callResult.error));
    } catch (err) { errors.push(classifyError(err)); }
  }

  let events = [];
  let leakageCheck = {};
  try { events = JSON.parse(vm.runInContext('__dumpEvents()', context, { timeout: args.timeout })); } catch (_) { events = []; }
  try { leakageCheck = JSON.parse(vm.runInContext('__leakageCheck()', context, { timeout: args.timeout })); } catch (_) { leakageCheck = {}; }

  const output = { entry, entryFound, output: entryResult, errors };
  const summary = summarize(events, errors, addonResult, leakageCheck);
  if (args.trace) { ensureParent(args.trace); fs.writeFileSync(args.trace, events.map(e => JSON.stringify(e)).join('\n') + (events.length ? '\n' : ''), 'utf8'); }
  if (args.summary) { ensureParent(args.summary); fs.writeFileSync(args.summary, JSON.stringify(summary, null, 2) + '\n', 'utf8'); }
  if (args.output) { ensureParent(args.output); fs.writeFileSync(args.output, JSON.stringify(output, null, 2) + '\n', 'utf8'); }
  return { targetFiles, fixture: args.fixture || '', trace: args.trace || '', summaryFile: args.summary || '', outputFile: args.output || '', output, summary };
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# Node.js 缺失环境追踪结果');
  lines.push('');
  lines.push(`- 目标 JS：${result.targetFiles.join(', ')}`);
  lines.push(`- fixture：${result.fixture || '未提供'}`);
  lines.push(`- 入口函数：${result.output.entry || '未指定'}`);
  lines.push(`- 入口是否找到：${result.output.entry ? (result.output.entryFound ? '是' : '否') : '未指定'}`);
  lines.push(`- trace 文件：${result.trace || '未写入'}`);
  lines.push(`- 摘要文件：${result.summaryFile || '未写入'}`);
  lines.push(`- 输出文件：${result.outputFile || '未写入'}`);
  lines.push(`- native addon：${result.summary.nativeAddon.available ? '可用' : '不可用或未启用'}`);
  lines.push(`- trace 事件数量：${result.summary.eventCount}`);
  lines.push(`- 运行错误数量：${result.summary.runtimeErrors.length}`);
  if (result.summary.nodeLeakage && Object.keys(result.summary.nodeLeakage).length) {
    lines.push('');
    lines.push('## Node 泄露自检');
    for (const [k, v] of Object.entries(result.summary.nodeLeakage)) lines.push(`- ${k}：${v}`);
  }
  if (result.summary.runtimeErrors.length) {
    lines.push('');
    lines.push('## 运行错误');
    for (const e of result.summary.runtimeErrors) lines.push(`- ${e.type}：${e.message}`);
  }
  if (result.summary.proxyRiskSignals.length) {
    lines.push('');
    lines.push('## Proxy 检测风险信号');
    for (const e of result.summary.proxyRiskSignals.slice(0, 20)) lines.push(`- ${e}`);
  }
  return lines.join('\n') + '\n';
}

try {
  const args = parseArgs(process.argv);
  if (args.help) { console.log(usage()); process.exit(0); }
  const result = run(args);
  if (args.json) console.log(JSON.stringify(result, null, 2));
  if (args.markdown) process.stdout.write(renderMarkdown(result));
  if (result.output.errors.some(e => e.type === 'entry-not-found')) process.exit(2);
} catch (err) {
  console.error(err.message || String(err));
  console.error(usage());
  process.exit(1);
}
