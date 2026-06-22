// addon-first native-like 保护工具。
// 1) 创建函数、getter、setter、document.all、构造函数和原型链时，优先尝试 addon API。
// 2) addon.node 缺失、ABI 不兼容或调用失败时，才降级到 NativeProtect / JS fallback。
// 3) 本模块自动尝试加载随 Skill 携带的 addon.node，并记录 usedApis / fallbacks，便于写入 notes 和最终总结。
// 注意：复制到 case/result 时不要写死本机绝对路径，优先使用相对 assets/native-addon 或 WEB_JS_ENV_PATCHER_ADDON。

'use strict';

let fs = null;
let path = null;
try { fs = require('fs'); path = require('path'); } catch {}

class NativeProtect {
  #map = new Map();
  #objMap = new Map();
  static #instance = null;

  static getInstance() {
    if (!NativeProtect.#instance) {
      NativeProtect.#instance = new NativeProtect();
      const rawFunctionToString = Function.prototype.toString;
      const patchedFunctionToString = {
        toString() {
          if (NativeProtect.#instance.#map.has(this)) {
            const name = NativeProtect.#instance.#map.get(this);
            return `function ${name || this.name}() { [native code] }`;
          }
          return rawFunctionToString.call(this);
        }
      }.toString;
      Object.defineProperty(Function.prototype, 'toString', {
        value: patchedFunctionToString,
        writable: true,
        enumerable: false,
        configurable: true,
      });
      NativeProtect.#instance.#map.set(Function.prototype.toString, 'toString');

      const rawObjectToString = Object.prototype.toString;
      const patchedObjectToString = {
        toString() {
          if (NativeProtect.#instance.#objMap.has(this)) {
            const name = NativeProtect.#instance.#objMap.get(this);
            return `[object ${name}]`;
          }
          return rawObjectToString.call(this);
        }
      }.toString;
      Object.defineProperty(Object.prototype, 'toString', {
        value: patchedObjectToString,
        writable: true,
        enumerable: false,
        configurable: true,
      });
      NativeProtect.#instance.#map.set(Object.prototype.toString, 'toString');
    }
    return NativeProtect.#instance;
  }

  constructor() {
    if (NativeProtect.#instance) throw new Error('NativeProtect 类只能实例化一次');
  }

  setNativeFunc(func, name = '') { this.#map.set(func, name); }
  setObjFunc(obj, name = '') { this.#objMap.set(obj, name); }
}

function getNativeProtect() {
  return NativeProtect.getInstance();
}

function markNativeFunction(func, name = '') {
  if (typeof func === 'function') getNativeProtect().setNativeFunc(func, name || func.name || '');
  return func;
}

function markObjectToString(obj, tag = '') {
  if (!obj || !tag) return obj;
  try {
    Object.defineProperty(obj, Symbol.toStringTag, {
      value: tag,
      writable: false,
      enumerable: false,
      configurable: true,
    });
  } catch {}
  getNativeProtect().setObjFunc(obj, tag);
  return obj;
}

const nativeAddonUsage = {
  available: false,
  path: '',
  autoLoadAttempted: false,
  usedApis: [],
  fallbacks: [],
  attempts: [],
};

let cachedNativeAddon = null;
let nativeAddonResolved = false;
const privateStore = new WeakMap();

function addCandidate(out, p) {
  if (!p || !path) return;
  try { out.push(path.resolve(p)); } catch { out.push(String(p)); }
}

function addAddonFileCandidates(out, base, platformArch) {
  if (!base) return;
  if (platformArch) {
    addCandidate(out, path.join(base, platformArch, 'addon.node'));
    addCandidate(out, path.join(base, platformArch, `addon-${platformArch}.node`));
  }
  addCandidate(out, path.join(base, 'addon.node'));
}

function nativeAddonCandidates(extra) {
  const out = [];
  if (Array.isArray(extra)) for (const p of extra) addCandidate(out, p);
  else if (extra) addCandidate(out, extra);

  const hasProcess = typeof process !== 'undefined' && process && process.versions;
  const platformArch = hasProcess ? `${process.platform}-${process.arch}` : '';
  if (hasProcess && process.env && process.env.WEB_JS_ENV_PATCHER_ADDON) addCandidate(out, process.env.WEB_JS_ENV_PATCHER_ADDON);

  if (path && hasProcess && process.cwd) {
    addAddonFileCandidates(out, path.join(process.cwd(), 'assets', 'native-addon'), platformArch);
    addAddonFileCandidates(out, path.join(process.cwd(), 'native-addon'), platformArch);
  }

  if (path && typeof __dirname !== 'undefined') {
    const bases = [
      path.join(__dirname, 'native-addon'),
      path.join(__dirname, 'assets', 'native-addon'),
      path.join(__dirname, '..', 'native-addon'),
      path.join(__dirname, '..', 'assets', 'native-addon'),
      path.join(__dirname, '..', '..', 'native-addon'),
      path.join(__dirname, '..', '..', 'assets', 'native-addon'),
      path.join(__dirname, '..', '..', '..', 'native-addon'),
      path.join(__dirname, '..', '..', '..', 'assets', 'native-addon'),
    ];
    for (const base of bases) addAddonFileCandidates(out, base, platformArch);
  }

  return [...new Set(out)];
}

function tryRequireAddon(p) {
  try {
    if (fs && !fs.existsSync(p)) {
      nativeAddonUsage.attempts.push({ path: p, ok: false, reason: '文件不存在' });
      return null;
    }
    const addon = require(p);
    nativeAddonUsage.available = true;
    nativeAddonUsage.path = p;
    nativeAddonUsage.attempts.push({ path: p, ok: true, reason: '' });
    return addon;
  } catch (err) {
    nativeAddonUsage.attempts.push({ path: p, ok: false, reason: err && err.message ? err.message : String(err) });
    return null;
  }
}

function loadNativeAddon(options = {}) {
  const hasExplicit = !!(options.addon || options.path || options.candidates);
  if (nativeAddonResolved && !options.force && !hasExplicit) return cachedNativeAddon;
  nativeAddonUsage.autoLoadAttempted = true;
  for (const p of nativeAddonCandidates(options.addon || options.path || options.candidates)) {
    const addon = tryRequireAddon(p);
    if (addon) {
      cachedNativeAddon = addon;
      nativeAddonResolved = true;
      return addon;
    }
  }
  if (!hasExplicit || !cachedNativeAddon) nativeAddonResolved = true;
  return cachedNativeAddon;
}

function normalizeAddon(addonLike, allowAutoLoad = true) {
  if (addonLike && typeof addonLike === 'object' && Object.prototype.hasOwnProperty.call(addonLike, 'available') && addonLike.available === false) return null;
  if (addonLike && typeof addonLike === 'object' && Object.prototype.hasOwnProperty.call(addonLike, 'addon')) return normalizeAddon(addonLike.addon, false);
  if (addonLike && (typeof addonLike === 'object' || typeof addonLike === 'function')) return addonLike;
  if (allowAutoLoad) return cachedNativeAddon || loadNativeAddon();
  return null;
}

function setNativeAddon(addonLike) {
  const addon = normalizeAddon(addonLike, false);
  cachedNativeAddon = addon;
  nativeAddonResolved = true;
  nativeAddonUsage.available = !!addon;
  nativeAddonUsage.path = addonLike && addonLike.path || nativeAddonUsage.path || '';
  if (addonLike && Array.isArray(addonLike.attempts)) nativeAddonUsage.attempts.push(...addonLike.attempts);
  return addon;
}

function getNativeAddon() {
  return normalizeAddon(null, true);
}

function getAddonApi(addonLike, apiName) {
  const addon = normalizeAddon(addonLike, true);
  if (addon && typeof addon[apiName] === 'function') {
    nativeAddonUsage.available = true;
    return addon[apiName].bind(addon);
  }
  return null;
}

function recordAddonUse(apiName) {
  if (!nativeAddonUsage.usedApis.includes(apiName)) nativeAddonUsage.usedApis.push(apiName);
}

function recordAddonFallback(apiName, reason) {
  nativeAddonUsage.fallbacks.push({ api: apiName, reason: reason || 'addon 不可用，使用 JS fallback' });
}

function getNativeAddonUsage() {
  return {
    available: nativeAddonUsage.available,
    path: nativeAddonUsage.path,
    autoLoadAttempted: nativeAddonUsage.autoLoadAttempted,
    usedApis: nativeAddonUsage.usedApis.slice(),
    fallbacks: nativeAddonUsage.fallbacks.slice(),
    attempts: nativeAddonUsage.attempts.slice(),
  };
}

function defineValue(obj, key, value, options = {}) {
  Object.defineProperty(obj, key, {
    value,
    writable: options.writable ?? false,
    enumerable: options.enumerable ?? true,
    configurable: options.configurable ?? true,
  });
  return value;
}

function defineGetter(obj, key, getter, options = {}) {
  Object.defineProperty(obj, key, {
    get: getter,
    enumerable: options.enumerable ?? true,
    configurable: options.configurable ?? true,
  });
  return getter;
}

function defineSetter(obj, key, setter, options = {}) {
  Object.defineProperty(obj, key, {
    set: setter,
    enumerable: options.enumerable ?? true,
    configurable: options.configurable ?? true,
  });
  return setter;
}

function setFunctionMeta(fn, name, length) {
  try { if (name) Object.defineProperty(fn, 'name', { value: name, configurable: true }); } catch {}
  try { if (Number.isFinite(length)) Object.defineProperty(fn, 'length', { value: length, configurable: true }); } catch {}
  return fn;
}

function createNativeFunction(name, length, impl, addon) {
  const api = getAddonApi(addon, 'createNativeFunction');
  if (api) {
    try {
      const fn = api(false, name, length ?? impl.length ?? 0, impl);
      recordAddonUse('createNativeFunction');
      return fn;
    } catch (err) {
      recordAddonFallback('createNativeFunction', err && err.message ? err.message : String(err));
    }
  } else {
    recordAddonFallback('createNativeFunction', 'addon 不可用，使用 NativeProtect fallback');
  }
  return markNativeFunction(setFunctionMeta(impl, name, length ?? impl.length ?? 0), name);
}

function createNativeConstructor(name, length, impl, addon) {
  const api = getAddonApi(addon, 'createNativeFunction');
  if (api) {
    try {
      const ctor = api(true, name, length ?? 0, impl);
      recordAddonUse('createNativeFunction');
      return ctor;
    } catch (err) {
      recordAddonFallback('createNativeFunction', err && err.message ? err.message : String(err));
    }
  } else {
    recordAddonFallback('createNativeFunction', 'addon 不可用，构造函数使用 NativeProtect fallback');
  }
  const ctor = function (...args) {
    return impl.call(this, new.target ? true : false, ...args);
  };
  return markNativeFunction(setFunctionMeta(ctor, name, length ?? 0), name);
}

function createNativeGetter(name, impl, addon) {
  const api = getAddonApi(addon, 'createGetter');
  if (api) {
    try {
      const getter = api(name, 0, impl);
      recordAddonUse('createGetter');
      return getter;
    } catch (err) {
      recordAddonFallback('createGetter', err && err.message ? err.message : String(err));
    }
  } else {
    recordAddonFallback('createGetter', 'addon 不可用，getter 使用 NativeProtect fallback');
  }
  return markNativeFunction(setFunctionMeta(impl, `get ${name}`, 0), `get ${name}`);
}

function createNativeSetter(name, impl, addon) {
  const api = getAddonApi(addon, 'createSetter');
  if (api) {
    try {
      const setter = api(name, 1, impl);
      recordAddonUse('createSetter');
      return setter;
    } catch (err) {
      recordAddonFallback('createSetter', err && err.message ? err.message : String(err));
    }
  } else {
    recordAddonFallback('createSetter', 'addon 不可用，setter 使用 NativeProtect fallback');
  }
  return markNativeFunction(setFunctionMeta(impl, `set ${name}`, 1), `set ${name}`);
}

const UNDETECTABLE_HANDLER_NAMES = new Set(['getter', 'setter', 'query', 'deleter', 'enumerator', 'definer', 'descriptor']);

function splitAddonAndHandlers(second, third) {
  let addon = null;
  let handlers = null;
  if (second && typeof second === 'object' && (second.addon || second.handlers)) {
    addon = second.addon || null;
    handlers = second.handlers || third || null;
  } else if (second && typeof second === 'object' && [...UNDETECTABLE_HANDLER_NAMES].some(k => typeof second[k] === 'function')) {
    handlers = second;
    addon = third || null;
  } else {
    addon = second || null;
    handlers = third || null;
  }
  return { addon, handlers };
}

function createUndetectable(impl, addonOrHandlers, maybeHandlers) {
  const { addon, handlers } = splitAddonAndHandlers(addonOrHandlers, maybeHandlers);
  const api = getAddonApi(addon, 'createUndetectable');
  if (api) {
    try {
      const value = handlers ? api(impl, handlers) : api(impl);
      recordAddonUse('createUndetectable');
      return value;
    } catch (err) {
      recordAddonFallback('createUndetectable', err && err.message ? err.message : String(err));
    }
  } else {
    recordAddonFallback('createUndetectable', 'addon 不可用，document.all 只能使用近似 fallback');
  }
  return undefined;
}

function isDescriptorObject(value) {
  return value && typeof value === 'object' && ('value' in value || 'get' in value || 'set' in value);
}

function createNativeObjectFallback(tag, proto, properties = {}) {
  const obj = Object.create(proto || Object.prototype);
  for (const [key, desc] of Object.entries(properties || {})) {
    try {
      Object.defineProperty(obj, key, isDescriptorObject(desc) ? desc : {
        value: desc,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } catch {}
  }
  if (tag) markObjectToString(obj, tag);
  return obj;
}

function createNativeObjectFromOptionsFallback(options = {}) {
  const name = options.name || 'NativeObject';
  const ctor = createNativeConstructor(name, options.length ?? 0, options.constructor || function () {}, null);
  if (options.parent && typeof options.parent === 'object') {
    const parent = createNativeObjectFromOptionsFallback(options.parent);
    try { Object.setPrototypeOf(ctor.prototype, parent.constructor.prototype); } catch {}
    try { Object.setPrototypeOf(ctor, parent.constructor); } catch {}
  }
  if (options.isReadOnlyPrototype) {
    try { Object.defineProperty(ctor, 'prototype', { writable: false }); } catch {}
  }
  if (options.isImmutableProto) {
    try { Object.preventExtensions(ctor.prototype); } catch {}
  }
  const instance = Object.create(ctor.prototype);
  if (typeof options.constructor === 'function') {
    try { options.constructor.call(instance, false); } catch {}
  }
  if (options.isImmutableInstanceProto) {
    try { Object.preventExtensions(instance); } catch {}
  }
  markObjectToString(instance, name);
  return { instance, constructor: ctor, prototypeChains: [] };
}

function createNativeObject(arg1, arg2, arg3, arg4) {
  const isOptions = arg1 && typeof arg1 === 'object' && !Array.isArray(arg1) && typeof arg1.name === 'string';
  const addon = isOptions ? arg2 : arg4;
  const api = getAddonApi(addon, 'createNativeObject');

  if (isOptions && api) {
    try {
      const result = api(arg1);
      recordAddonUse('createNativeObject');
      return result;
    } catch (err) {
      recordAddonFallback('createNativeObject', err && err.message ? err.message : String(err));
    }
  } else if (!isOptions) {
    recordAddonFallback('createNativeObject', '检测到旧式 createNativeObject(tag, proto, properties) 调用，新代码应迁移为 createNativeObject(options) 或 createProtoChains(descriptors)');
  } else {
    recordAddonFallback('createNativeObject', 'addon 不可用，使用 JS options fallback');
  }

  if (isOptions) return createNativeObjectFromOptionsFallback(arg1);
  return createNativeObjectFallback(arg1, arg2, arg3 || {});
}

function normalizeProtoChainArgs(arg1, arg2, arg3) {
  if (Array.isArray(arg1)) return { descriptors: arg1, addon: arg2, legacy: false };
  if (arg1 && typeof arg1 === 'object' && Array.isArray(arg1.descriptors)) return { descriptors: arg1.descriptors, addon: arg1.addon || arg2, legacy: false };
  return { descriptors: Array.isArray(arg2) ? arg2 : [], addon: arg3, legacy: true, name: arg1 };
}

function callConstructorForFallback(desc, thisValue, isNew, args) {
  if (typeof desc.constructor !== 'function') return undefined;
  return desc.constructor.apply(thisValue, [isNew, ...args]);
}

function createProtoChainsFallback(descriptors = []) {
  const registry = new Map();
  const result = {};

  for (const desc of descriptors) {
    if (!desc || typeof desc !== 'object' || !desc.name) continue;

    if (desc.aliasOf) {
      const aliased = registry.get(desc.aliasOf) || result[desc.aliasOf];
      if (aliased) {
        registry.set(desc.name, aliased);
        result[desc.name] = aliased;
      }
      continue;
    }

    const name = desc.name;
    const Ctor = function (...args) {
      return callConstructorForFallback(desc, this, new.target ? true : false, args);
    };
    setFunctionMeta(Ctor, name, desc.length ?? 0);
    markNativeFunction(Ctor, name);

    try {
      Object.defineProperty(Ctor.prototype, 'constructor', {
        value: Ctor,
        writable: true,
        enumerable: false,
        configurable: true,
      });
    } catch {}

    const parentName = desc.prototypeParent || desc.parent;
    const parentCtor = parentName ? registry.get(parentName) : null;
    if (parentCtor) {
      try { Object.setPrototypeOf(Ctor.prototype, parentCtor.prototype); } catch {}
    }

    const constructorParentName = Object.prototype.hasOwnProperty.call(desc, 'constructorParent') ? desc.constructorParent : parentName;
    if (constructorParentName) {
      const parent = registry.get(constructorParentName);
      if (parent) try { Object.setPrototypeOf(Ctor, parent); } catch {}
    }

    if (desc.hasToStringTag !== false) {
      try {
        Object.defineProperty(Ctor.prototype, Symbol.toStringTag, {
          value: desc.toStringTag || name,
          writable: false,
          enumerable: false,
          configurable: true,
        });
      } catch {}
    }

    if (desc.readOnlyPrototypeProperty || desc.isReadOnlyPrototype) {
      try { Object.defineProperty(Ctor, 'prototype', { writable: false }); } catch {}
    }
    if (desc.immutablePrototypeObject || desc.isImmutableProto) {
      try { Object.preventExtensions(Ctor.prototype); } catch {}
    }

    registry.set(name, Ctor);
    result[name] = Ctor;

    for (const alias of Array.isArray(desc.aliases) ? desc.aliases : []) {
      registry.set(alias, Ctor);
      result[alias] = Ctor;
    }

    if (desc.instanceFactoryName) {
      const factory = function (...args) {
        const instance = Object.create(Ctor.prototype);
        if (typeof desc.instanceInitializer === 'function') desc.instanceInitializer.apply(instance, args);
        if (desc.immutableInstancePrototype || desc.isImmutableInstanceProto) {
          try { Object.preventExtensions(instance); } catch {}
        }
        markObjectToString(instance, desc.toStringTag || name);
        return instance;
      };
      setFunctionMeta(factory, desc.instanceFactoryName, 0);
      markNativeFunction(factory, desc.instanceFactoryName);
      result[desc.instanceFactoryName] = factory;
    }

    if (desc.isCreateInstance && desc.instanceName) {
      const instance = Object.create(Ctor.prototype);
      if (typeof desc.instanceInitializer === 'function') desc.instanceInitializer.call(instance);
      markObjectToString(instance, desc.toStringTag || name);
      result[desc.instanceName] = instance;
    }
  }

  return result;
}

function createProtoChains(arg1, arg2, arg3) {
  const { descriptors, addon, legacy } = normalizeProtoChainArgs(arg1, arg2, arg3);
  const api = getAddonApi(addon, 'createProtoChains');

  if (!legacy && api) {
    try {
      const result = api(descriptors);
      recordAddonUse('createProtoChains');
      return result;
    } catch (err) {
      recordAddonFallback('createProtoChains', err && err.message ? err.message : String(err));
    }
  } else if (legacy) {
    recordAddonFallback('createProtoChains', '检测到旧式 createProtoChains(name, chain) 调用，新代码应迁移为 createProtoChains(descriptors)');
  } else {
    recordAddonFallback('createProtoChains', 'addon 不可用，使用 JS 构造函数 / 原型链 fallback');
  }

  if (legacy) {
    let current = null;
    const created = [];
    for (const item of descriptors) {
      const proto = Object.create(current || Object.prototype);
      if (item && item.name) markObjectToString(proto, item.name);
      created.push(proto);
      current = proto;
    }
    return created;
  }

  return createProtoChainsFallback(descriptors);
}

function getMimeTypesAndPlugins(addon) {
  const api = getAddonApi(addon, 'getMimeTypesAndPlugins');
  if (api) {
    try {
      const result = api();
      recordAddonUse('getMimeTypesAndPlugins');
      return result;
    } catch (err) {
      recordAddonFallback('getMimeTypesAndPlugins', err && err.message ? err.message : String(err));
    }
  } else {
    recordAddonFallback('getMimeTypesAndPlugins', 'addon 不可用，使用最小 PluginArray / MimeTypeArray fallback');
  }

  function makeIllegalCtor(name) {
    return createNativeFunction(name, 0, function () {
      throw new TypeError(`Illegal constructor`);
    }, null);
  }
  const PluginArray = makeIllegalCtor('PluginArray');
  const MimeTypeArray = makeIllegalCtor('MimeTypeArray');
  const Plugin = makeIllegalCtor('Plugin');
  const MimeType = makeIllegalCtor('MimeType');
  const plugins = [];
  const mimeTypes = [];
  defineValue(plugins, 'item', createNativeFunction('item', 1, i => plugins[i] || null, null), { writable: true, enumerable: false, configurable: true });
  defineValue(plugins, 'namedItem', createNativeFunction('namedItem', 1, name => plugins.find(v => v && v.name === name) || null, null), { writable: true, enumerable: false, configurable: true });
  defineValue(mimeTypes, 'item', createNativeFunction('item', 1, i => mimeTypes[i] || null, null), { writable: true, enumerable: false, configurable: true });
  defineValue(mimeTypes, 'namedItem', createNativeFunction('namedItem', 1, type => mimeTypes.find(v => v && v.type === type) || null, null), { writable: true, enumerable: false, configurable: true });
  markObjectToString(plugins, 'PluginArray');
  markObjectToString(mimeTypes, 'MimeTypeArray');
  return { mimeTypes, plugins, PluginArray, MimeTypeArray, MimeType, Plugin };
}

function setPrivate(object, key, value, addon) {
  const api = getAddonApi(addon, 'setPrivate');
  if (api) {
    try {
      const ok = api(object, String(key), value);
      recordAddonUse('setPrivate');
      return ok;
    } catch (err) {
      recordAddonFallback('setPrivate', err && err.message ? err.message : String(err));
    }
  } else {
    recordAddonFallback('setPrivate', 'addon 不可用，使用 WeakMap fallback');
  }
  let map = privateStore.get(object);
  if (!map) {
    map = new Map();
    privateStore.set(object, map);
  }
  map.set(String(key), value);
  return true;
}

function getPrivate(object, key, addon) {
  const api = getAddonApi(addon, 'getPrivate');
  if (api) {
    try {
      const value = api(object, String(key));
      recordAddonUse('getPrivate');
      return value;
    } catch (err) {
      recordAddonFallback('getPrivate', err && err.message ? err.message : String(err));
    }
  } else {
    recordAddonFallback('getPrivate', 'addon 不可用，使用 WeakMap fallback');
  }
  const map = privateStore.get(object);
  return map ? map.get(String(key)) : undefined;
}

function throwTypeError(message, addon) {
  const api = getAddonApi(addon, 'throwTypeError');
  if (api) {
    recordAddonUse('throwTypeError');
    return api(String(message));
  }
  throw new TypeError(String(message));
}

function throwBrowserTypeError(message, addon) {
  return throwTypeError(String(message), addon);
}

function illegalConstructorMessage(name) {
  return `Failed to construct '${String(name)}': Illegal constructor`;
}

function constructorRequiresNewMessage(name) {
  return `Failed to construct '${String(name)}': Please use the 'new' operator, this DOM object constructor cannot be called as a function.`;
}

function throwIllegalConstructor(name, addon) {
  return throwBrowserTypeError(illegalConstructorMessage(name), addon);
}

function throwConstructorRequiresNew(name, addon) {
  return throwBrowserTypeError(constructorRequiresNewMessage(name), addon);
}

function defineNativeValue(obj, key, impl, options = {}, addon) {
  const fn = createNativeFunction(options.name || String(key), options.length ?? impl.length, impl, addon);
  return defineValue(obj, key, fn, {
    writable: options.writable ?? true,
    enumerable: options.enumerable ?? true,
    configurable: options.configurable ?? true,
  });
}

function defineNativeGetter(obj, key, impl, options = {}, addon) {
  const getter = createNativeGetter(options.name || String(key), impl, addon);
  return defineGetter(obj, key, getter, options);
}

function defineNativeSetter(obj, key, impl, options = {}, addon) {
  const setter = createNativeSetter(options.name || String(key), impl, addon);
  return defineSetter(obj, key, setter, options);
}

function defineNativeAccessor(obj, key, accessors = {}, options = {}, addon) {
  const descriptor = {
    enumerable: options.enumerable ?? true,
    configurable: options.configurable ?? true,
  };
  if (typeof accessors.get === 'function') descriptor.get = createNativeGetter(options.getName || String(key), accessors.get, addon);
  if (typeof accessors.set === 'function') descriptor.set = createNativeSetter(options.setName || String(key), accessors.set, addon);
  Object.defineProperty(obj, key, descriptor);
  return descriptor;
}

module.exports = {
  NativeProtect,
  getNativeProtect,
  markNativeFunction,
  markObjectToString,
  nativeAddonCandidates,
  loadNativeAddon,
  setNativeAddon,
  getNativeAddon,
  normalizeAddon,
  getAddonApi,
  getNativeAddonUsage,
  defineValue,
  defineGetter,
  defineSetter,
  createNativeFunction,
  createNativeConstructor,
  createNativeGetter,
  createNativeSetter,
  createUndetectable,
  createNativeObject,
  createProtoChains,
  getMimeTypesAndPlugins,
  setPrivate,
  getPrivate,
  throwTypeError,
  throwBrowserTypeError,
  illegalConstructorMessage,
  constructorRequiresNewMessage,
  throwIllegalConstructor,
  throwConstructorRequiresNew,
  defineNativeValue,
  defineNativeGetter,
  defineNativeSetter,
  defineNativeAccessor,
};
