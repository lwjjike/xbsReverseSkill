// addon-first native-like 保护工具。
// 1) 创建函数、getter、setter、document.all、构造函数、原型链、集合对象和插件列表时，优先尝试 addon API。
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

function isAddonLike(value) {
  return !!(
    value &&
    (typeof value === 'object' || typeof value === 'function') &&
    (
      typeof value.createNativeFunction === 'function' ||
      typeof value.createProtoChains === 'function' ||
      typeof value.getMimeTypesAndPlugins === 'function' ||
      Object.prototype.hasOwnProperty.call(value, 'addon')
    )
  );
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
  } else if (second && typeof second === 'object' && isAddonLike(third)) {
    handlers = second;
    addon = third;
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

function createInterceptor(options = {}, addon) {
  const api = getAddonApi(addon || options.addon, 'createInterceptor');
  if (api) {
    try {
      const value = api(options);
      recordAddonUse('createInterceptor');
      return value;
    } catch (err) {
      recordAddonFallback('createInterceptor', err && err.message ? err.message : String(err));
    }
  } else {
    recordAddonFallback('createInterceptor', 'addon 不可用，使用 Proxy 近似 fallback');
  }

  const target = options.target && typeof options.target === 'object' ? options.target : {};
  const handlers = options.handlers || {};
  const proxy = new Proxy(target, {
    get(obj, property, receiver) {
      if (typeof handlers.getter === 'function') {
        const got = handlers.getter(obj, property);
        if (!got || got.intercept !== false) return got && Object.prototype.hasOwnProperty.call(got, 'value') ? got.value : got;
      }
      return Reflect.get(obj, property, receiver);
    },
    set(obj, property, value, receiver) {
      if (typeof handlers.setter === 'function') {
        const got = handlers.setter(obj, property, value);
        if (got && got.intercept === true) return Reflect.set(obj, property, got.value, receiver);
        if (got && got.intercept === false) return Reflect.set(obj, property, value, receiver);
      }
      return Reflect.set(obj, property, value, receiver);
    },
    getOwnPropertyDescriptor(obj, property) {
      if (typeof handlers.descriptor === 'function') {
        const desc = handlers.descriptor(obj, property);
        if (desc) return desc;
      }
      return Reflect.getOwnPropertyDescriptor(obj, property);
    },
    ownKeys(obj) {
      if (typeof handlers.enumerator === 'function') {
        const keys = handlers.enumerator(obj);
        if (Array.isArray(keys)) return keys;
      }
      return Reflect.ownKeys(obj);
    },
    deleteProperty(obj, property) {
      if (typeof handlers.deleter === 'function') return !!handlers.deleter(obj, property);
      return Reflect.deleteProperty(obj, property);
    },
    defineProperty(obj, property, descriptor) {
      if (typeof handlers.definer === 'function') {
        const got = handlers.definer(obj, property, descriptor);
        if (got === false || (got && got.intercept === false)) return false;
      }
      return Reflect.defineProperty(obj, property, descriptor);
    },
  });
  if (options.internalClassName) markObjectToString(proxy, options.internalClassName);
  return proxy;
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
      const isNew = !!new.target;
      const behavior = desc.illegalConstructor
        ? 'throw'
        : (isNew ? desc.constructorBehavior : desc.callBehavior) || 'allow';
      if (behavior === 'illegal' || behavior === 'throw') {
        const message = isNew
          ? (desc.constructorErrorMessage || illegalConstructorMessage(name))
          : (desc.callErrorMessage || 'Illegal constructor');
        return throwBrowserTypeError(message, null);
      }
      return callConstructorForFallback(desc, this, isNew, args);
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

    for (const method of Array.isArray(desc.prototypeMethods) ? desc.prototypeMethods : []) {
      if (!method || !method.name || typeof (method.callback || method.value) !== 'function') continue;
      defineValue(
        Ctor.prototype,
        method.name,
        createNativeFunction(method.name, method.length ?? 0, method.callback || method.value, null),
        {
          writable: method.writable ?? true,
          enumerable: method.enumerable ?? true,
          configurable: method.configurable ?? true,
        }
      );
    }

    for (const method of Array.isArray(desc.staticMethods) ? desc.staticMethods : []) {
      if (!method || !method.name || typeof (method.callback || method.value) !== 'function') continue;
      defineValue(
        Ctor,
        method.name,
        createNativeFunction(method.name, method.length ?? 0, method.callback || method.value, null),
        {
          writable: method.writable ?? true,
          enumerable: method.enumerable ?? true,
          configurable: method.configurable ?? true,
        }
      );
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
        markObjectToString(instance, desc.internalClassName || desc.toStringTag || name);
        return instance;
      };
      setFunctionMeta(factory, desc.instanceFactoryName, 0);
      markNativeFunction(factory, desc.instanceFactoryName);
      result[desc.instanceFactoryName] = factory;
    }

    if (desc.isCreateInstance && desc.instanceName) {
      const instance = Object.create(Ctor.prototype);
      if (typeof desc.instanceInitializer === 'function') desc.instanceInitializer.call(instance);
      markObjectToString(instance, desc.internalClassName || desc.toStringTag || name);
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

function getProtoChainRegistry(addon) {
  const api = getAddonApi(addon, 'getProtoChainRegistry');
  if (api) {
    try {
      const value = api();
      recordAddonUse('getProtoChainRegistry');
      return value;
    } catch (err) {
      recordAddonFallback('getProtoChainRegistry', err && err.message ? err.message : String(err));
    }
  } else {
    recordAddonFallback('getProtoChainRegistry', 'addon 不可用，无法读取 native 注册表');
  }
  return { constructors: [], aliases: {} };
}

function deleteProtoChainRegistryEntry(name, addon) {
  const api = getAddonApi(addon, 'deleteProtoChainRegistryEntry');
  if (api) {
    try {
      const ok = api(String(name));
      recordAddonUse('deleteProtoChainRegistryEntry');
      return ok;
    } catch (err) {
      recordAddonFallback('deleteProtoChainRegistryEntry', err && err.message ? err.message : String(err));
    }
  } else {
    recordAddonFallback('deleteProtoChainRegistryEntry', 'addon 不可用，无法删除 native 注册表项');
  }
  return false;
}

function clearProtoChainRegistry(addon) {
  const api = getAddonApi(addon, 'clearProtoChainRegistry');
  if (api) {
    try {
      const ok = api();
      recordAddonUse('clearProtoChainRegistry');
      return ok;
    } catch (err) {
      recordAddonFallback('clearProtoChainRegistry', err && err.message ? err.message : String(err));
    }
  } else {
    recordAddonFallback('clearProtoChainRegistry', 'addon 不可用，无法清空 native 注册表');
  }
  return false;
}

function normalizeCollectionItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => {
    if (item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, 'value')) {
      return { name: item.name == null ? '' : String(item.name), value: item.value };
    }
    return { name: item && item.name ? String(item.name) : String(index), value: item };
  });
}

function createNativeCollection(options = {}, addon) {
  const api = getAddonApi(addon || options.addon, 'createNativeCollection');
  if (api) {
    try {
      const value = api(options);
      recordAddonUse('createNativeCollection');
      return value;
    } catch (err) {
      recordAddonFallback('createNativeCollection', err && err.message ? err.message : String(err));
    }
  } else {
    recordAddonFallback('createNativeCollection', 'addon 不可用，使用最小集合 JS fallback');
  }

  const name = options.name || 'NativeCollection';
  const Ctor = createNativeConstructor(name, 0, function () {
    throwTypeError(`Failed to construct '${name}': Illegal constructor`, null);
  }, null);
  const collection = Object.create(Ctor.prototype);
  const items = normalizeCollectionItems(options.items);
  const values = items.map(item => item.value);

  defineValue(collection, 'length', values.length, { writable: false, enumerable: false, configurable: true });
  if (options.indexedAccess !== false) {
    values.forEach((value, index) => {
      defineValue(collection, String(index), value, { writable: false, enumerable: true, configurable: true });
    });
  }
  if (options.namedAccess !== false) {
    for (const item of items) {
      if (!item.name) continue;
      defineValue(collection, item.name, item.value, {
        writable: false,
        enumerable: !!options.namedEnumerable,
        configurable: true,
      });
    }
  }
  if (options.itemMethod !== false) {
    defineValue(Ctor.prototype, 'item', createNativeFunction('item', 1, function (index) {
      const n = Number(index);
      return Number.isInteger(n) && n >= 0 ? (this[String(n)] || null) : null;
    }, null), { writable: true, enumerable: false, configurable: true });
  }
  if (options.namedItemMethod !== false) {
    defineValue(Ctor.prototype, 'namedItem', createNativeFunction('namedItem', 1, function (key) {
      return this[String(key)] || null;
    }, null), { writable: true, enumerable: false, configurable: true });
  }
  if (options.iterable !== false) {
    defineValue(Ctor.prototype, Symbol.iterator, createNativeFunction('values', 0, function () {
      return values[Symbol.iterator]();
    }, null), { writable: true, enumerable: false, configurable: true });
  }
  if (options.hasToStringTag !== false) {
    try {
      Object.defineProperty(Ctor.prototype, Symbol.toStringTag, {
        value: options.toStringTag || name,
        writable: false,
        enumerable: false,
        configurable: true,
      });
    } catch {}
  }
  markObjectToString(collection, options.internalClassName || options.toStringTag || name);
  if (options.immutableInstancePrototype) {
    try { Object.preventExtensions(collection); } catch {}
  }
  return { collection, constructor: Ctor, [name]: Ctor };
}

function normalizeMimePluginArgs(configOrAddon, maybeAddon) {
  if (configOrAddon && typeof configOrAddon === 'object' && Object.prototype.hasOwnProperty.call(configOrAddon, 'config')) {
    return { config: configOrAddon.config, addon: configOrAddon.addon || maybeAddon };
  }
  if (isAddonLike(configOrAddon)) return { config: undefined, addon: configOrAddon };
  return { config: configOrAddon, addon: maybeAddon };
}

function getMimeTypesAndPlugins(configOrAddon, maybeAddon) {
  const { config, addon } = normalizeMimePluginArgs(configOrAddon, maybeAddon);
  const api = getAddonApi(addon, 'getMimeTypesAndPlugins');
  if (api) {
    try {
      const result = config === undefined ? api() : api(config);
      recordAddonUse('getMimeTypesAndPlugins');
      return result;
    } catch (err) {
      recordAddonFallback('getMimeTypesAndPlugins', err && err.message ? err.message : String(err));
    }
  } else {
    recordAddonFallback('getMimeTypesAndPlugins', 'addon 不可用，使用最小 PluginArray / MimeTypeArray fallback');
  }

  const Plugin = createNativeConstructor('Plugin', 0, function () {
    throwTypeError("Failed to construct 'Plugin': Illegal constructor", null);
  }, null);
  const MimeType = createNativeConstructor('MimeType', 0, function () {
    throwTypeError("Failed to construct 'MimeType': Illegal constructor", null);
  }, null);
  const pluginConfigs = config && Array.isArray(config.plugins)
    ? config.plugins
    : [
      { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', mimeTypes: [{ type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' }] },
      { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', mimeTypes: [{ type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' }] },
    ];
  const pluginItems = [];
  const mimeItems = [];

  for (const pluginConfig of pluginConfigs) {
    const plugin = Object.create(Plugin.prototype);
    defineValue(plugin, 'name', String(pluginConfig.name || ''), { writable: false, enumerable: true, configurable: true });
    defineValue(plugin, 'filename', String(pluginConfig.filename || ''), { writable: false, enumerable: true, configurable: true });
    defineValue(plugin, 'description', String(pluginConfig.description || ''), { writable: false, enumerable: true, configurable: true });
    markObjectToString(plugin, 'Plugin');

    const localMimes = [];
    for (const mimeConfig of Array.isArray(pluginConfig.mimeTypes) ? pluginConfig.mimeTypes : []) {
      const mime = Object.create(MimeType.prototype);
      defineValue(mime, 'type', String(mimeConfig.type || ''), { writable: false, enumerable: true, configurable: true });
      defineValue(mime, 'suffixes', String(mimeConfig.suffixes || ''), { writable: false, enumerable: true, configurable: true });
      defineValue(mime, 'description', String(mimeConfig.description || ''), { writable: false, enumerable: true, configurable: true });
      defineValue(mime, 'enabledPlugin', plugin, { writable: false, enumerable: true, configurable: true });
      markObjectToString(mime, 'MimeType');
      localMimes.push(mime);
      mimeItems.push({ name: mime.type, value: mime });
    }

    defineValue(plugin, 'length', localMimes.length, { writable: false, enumerable: false, configurable: true });
    localMimes.forEach((mime, index) => defineValue(plugin, String(index), mime, { writable: false, enumerable: true, configurable: true }));
    defineValue(plugin, Symbol.iterator, createNativeFunction('values', 0, function () {
      return localMimes[Symbol.iterator]();
    }, null), { writable: true, enumerable: false, configurable: true });
    pluginItems.push({ name: plugin.name, value: plugin });
  }

  const pluginCollection = createNativeCollection({ name: 'PluginArray', items: pluginItems, toStringTag: 'PluginArray' }, null);
  const mimeCollection = createNativeCollection({ name: 'MimeTypeArray', items: mimeItems, toStringTag: 'MimeTypeArray' }, null);
  const plugins = pluginCollection.collection;
  const mimeTypes = mimeCollection.collection;
  const PluginArray = pluginCollection.PluginArray || pluginCollection.constructor;
  const MimeTypeArray = mimeCollection.MimeTypeArray || mimeCollection.constructor;
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

function hasPrivate(object, key, addon) {
  const api = getAddonApi(addon, 'hasPrivate');
  if (api) {
    try {
      const ok = api(object, String(key));
      recordAddonUse('hasPrivate');
      return ok;
    } catch (err) {
      recordAddonFallback('hasPrivate', err && err.message ? err.message : String(err));
    }
  } else {
    recordAddonFallback('hasPrivate', 'addon 不可用，使用 WeakMap fallback');
  }
  const map = privateStore.get(object);
  return !!(map && map.has(String(key)));
}

function deletePrivate(object, key, addon) {
  const api = getAddonApi(addon, 'deletePrivate');
  if (api) {
    try {
      const ok = api(object, String(key));
      recordAddonUse('deletePrivate');
      return ok;
    } catch (err) {
      recordAddonFallback('deletePrivate', err && err.message ? err.message : String(err));
    }
  } else {
    recordAddonFallback('deletePrivate', 'addon 不可用，使用 WeakMap fallback');
  }
  const map = privateStore.get(object);
  return map ? map.delete(String(key)) : false;
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
  createInterceptor,
  createNativeObject,
  createProtoChains,
  getProtoChainRegistry,
  deleteProtoChainRegistryEntry,
  clearProtoChainRegistry,
  createNativeCollection,
  getMimeTypesAndPlugins,
  setPrivate,
  getPrivate,
  hasPrivate,
  deletePrivate,
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
