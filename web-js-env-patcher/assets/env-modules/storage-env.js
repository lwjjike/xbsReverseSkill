// Storage 模块模板：按 fixture 注入 localStorage / sessionStorage，并固化原型链、描述符和 native-like 方法。
'use strict';

let protect = null;
try { protect = require('./native-protect'); } catch { protect = null; }

function defineValue(obj, key, value, options = {}) {
  if (protect && protect.defineValue) return protect.defineValue(obj, key, value, options);
  Object.defineProperty(obj, key, {
    value,
    writable: options.writable ?? false,
    enumerable: options.enumerable ?? true,
    configurable: options.configurable ?? true,
  });
  return value;
}

function markNativeFunction(fn, name) {
  if (protect && protect.markNativeFunction) return protect.markNativeFunction(fn, name);
  return fn;
}

function markObjectToString(obj, tag) {
  if (protect && protect.markObjectToString) return protect.markObjectToString(obj, tag);
  try { Object.defineProperty(obj, Symbol.toStringTag, { value: tag, enumerable: false, configurable: true }); } catch {}
  return obj;
}

function defineNativeGetter(obj, key, impl, options = {}, addon) {
  if (protect && protect.defineNativeGetter) return protect.defineNativeGetter(obj, key, impl, options, addon);
  Object.defineProperty(obj, key, { get: impl, enumerable: options.enumerable ?? true, configurable: options.configurable ?? true });
  return impl;
}

function defineNativeValue(obj, key, impl, options = {}, addon) {
  if (protect && protect.defineNativeValue) return protect.defineNativeValue(obj, key, impl, options, addon);
  return defineValue(obj, key, impl, { writable: true, ...options });
}

function createNativeConstructor(name, length, impl, addon) {
  if (protect && protect.createNativeConstructor) return protect.createNativeConstructor(name, length, impl, addon);
  function Ctor(...args) { return impl.call(this, new.target ? true : false, ...args); }
  try { Object.defineProperty(Ctor, 'name', { value: name, configurable: true }); } catch {}
  return markNativeFunction(Ctor, name);
}

function throwIllegalConstructor(name, addon) {
  if (protect && protect.throwIllegalConstructor) return protect.throwIllegalConstructor(name, addon);
  throw new TypeError(`Failed to construct '${name}': Illegal constructor`);
}

function installStorage(globalObject, fixture = {}, options = {}) {
  const addon = options.addon || null;
  const request = fixture.request || {};

  const Storage = createNativeConstructor('Storage', 0, function Storage(isNew) {
    return throwIllegalConstructor('Storage', addon);
  }, addon);
  defineValue(Storage.prototype, 'constructor', Storage, { writable: true, enumerable: false, configurable: true });
  markObjectToString(Storage.prototype, 'Storage');

  defineNativeGetter(Storage.prototype, 'length', function () { return this.__data.size; }, { enumerable: true, configurable: true, name: 'length' }, addon);
  defineNativeValue(Storage.prototype, 'key', function key(index) { return Array.from(this.__data.keys())[Number(index)] ?? null; }, { enumerable: true, configurable: true, writable: true, name: 'key', length: 1 }, addon);
  defineNativeValue(Storage.prototype, 'getItem', function getItem(key) { key = String(key); return this.__data.has(key) ? this.__data.get(key) : null; }, { enumerable: true, configurable: true, writable: true, name: 'getItem', length: 1 }, addon);
  defineNativeValue(Storage.prototype, 'setItem', function setItem(key, value) { this.__data.set(String(key), String(value)); }, { enumerable: true, configurable: true, writable: true, name: 'setItem', length: 2 }, addon);
  defineNativeValue(Storage.prototype, 'removeItem', function removeItem(key) { this.__data.delete(String(key)); }, { enumerable: true, configurable: true, writable: true, name: 'removeItem', length: 1 }, addon);
  defineNativeValue(Storage.prototype, 'clear', function clear() { this.__data.clear(); }, { enumerable: true, configurable: true, writable: true, name: 'clear', length: 0 }, addon);

  function createStorage(initial = {}) {
    const data = new Map(Object.entries(initial).map(([k, v]) => [String(k), String(v)]));
    const storage = Object.create(Storage.prototype);
    defineValue(storage, '__data', data, { enumerable: false, configurable: false, writable: false });
    markObjectToString(storage, 'Storage');
    return storage;
  }

  const localStorage = createStorage(request.localStorage || fixture.localStorage || {});
  const sessionStorage = createStorage(request.sessionStorage || fixture.sessionStorage || {});

  defineValue(globalObject, 'Storage', Storage, { writable: true, enumerable: false, configurable: true });
  defineValue(globalObject, 'localStorage', localStorage, { writable: false, enumerable: true, configurable: true });
  defineValue(globalObject, 'sessionStorage', sessionStorage, { writable: false, enumerable: true, configurable: true });

  return { Storage, localStorage, sessionStorage, createStorage };
}

function createStorage(initial = {}, options = {}) {
  const context = {};
  return installStorage(context, { localStorage: initial }, options).localStorage;
}

module.exports = { createStorage, installStorage };
