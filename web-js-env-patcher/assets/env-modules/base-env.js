// 基础 env 模板：提供网页端最小对象，并按描述符、原型链和 native-like 规则固化。
// 复制到 case/result 或 case/env 后，必须根据 fixtures 和 RuyiTrace 证据调整具体字段。
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

function defineGetter(obj, key, getter, options = {}) {
  Object.defineProperty(obj, key, {
    get: getter,
    enumerable: options.enumerable ?? true,
    configurable: options.configurable ?? true,
  });
  return getter;
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
  return defineGetter(obj, key, impl, options);
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

function installBaseEnv(globalObject, fixture = {}, options = {}) {
  const addon = options.addon || null;
  const browser = fixture.browser || {};
  const pageUrl = fixture.pageUrl || fixture.apiUrl || 'https://example.com/';
  const url = new URL(pageUrl);

  const Window = createNativeConstructor('Window', 0, function Window(isNew) {
    return throwIllegalConstructor('Window', addon);
  }, addon);
  const Location = createNativeConstructor('Location', 0, function Location(isNew) {
    return throwIllegalConstructor('Location', addon);
  }, addon);
  const Navigator = createNativeConstructor('Navigator', 0, function Navigator(isNew) {
    return throwIllegalConstructor('Navigator', addon);
  }, addon);

  defineValue(Window.prototype, 'constructor', Window, { writable: true, enumerable: false, configurable: true });
  defineValue(Location.prototype, 'constructor', Location, { writable: true, enumerable: false, configurable: true });
  defineValue(Navigator.prototype, 'constructor', Navigator, { writable: true, enumerable: false, configurable: true });
  markObjectToString(Window.prototype, 'Window');
  markObjectToString(Location.prototype, 'Location');
  markObjectToString(Navigator.prototype, 'Navigator');

  const location = Object.create(Location.prototype);
  const locationState = {
    href: url.href,
    origin: url.origin,
    protocol: url.protocol,
    host: url.host,
    hostname: url.hostname,
    port: url.port,
    pathname: url.pathname,
    search: url.search,
    hash: url.hash,
  };
  for (const key of ['href', 'origin', 'protocol', 'host', 'hostname', 'port', 'pathname', 'search', 'hash']) {
    defineNativeGetter(Location.prototype, key, function () { return locationState[key]; }, { enumerable: true, configurable: true, name: key }, addon);
  }
  defineNativeValue(Location.prototype, 'toString', function toString() { return this.href; }, { enumerable: false, configurable: true, writable: true, name: 'toString', length: 0 }, addon);
  markObjectToString(location, 'Location');

  const navigator = Object.create(Navigator.prototype);
  const navState = {
    userAgent: browser.userAgent || '',
    language: browser.language || 'zh-CN',
    languages: browser.languages || ['zh-CN', 'zh'],
    platform: browser.platform || 'Win32',
    hardwareConcurrency: browser.hardwareConcurrency ?? 8,
    deviceMemory: browser.deviceMemory ?? 8,
    webdriver: browser.webdriver ?? false,
    cookieEnabled: browser.cookieEnabled ?? true,
  };
  for (const key of Object.keys(navState)) {
    defineNativeGetter(Navigator.prototype, key, function () { return navState[key]; }, { enumerable: true, configurable: true, name: key }, addon);
  }
  markObjectToString(navigator, 'Navigator');

  defineValue(globalObject, 'Window', Window, { writable: true, enumerable: false, configurable: true });
  defineValue(globalObject, 'Location', Location, { writable: true, enumerable: false, configurable: true });
  defineValue(globalObject, 'Navigator', Navigator, { writable: true, enumerable: false, configurable: true });

  defineValue(globalObject, 'window', globalObject, { writable: false, enumerable: true, configurable: true });
  defineValue(globalObject, 'self', globalObject, { writable: false, enumerable: true, configurable: true });
  defineValue(globalObject, 'top', globalObject, { writable: false, enumerable: true, configurable: true });
  defineValue(globalObject, 'parent', globalObject, { writable: false, enumerable: true, configurable: true });
  defineValue(globalObject, 'location', location, { writable: false, enumerable: true, configurable: true });
  defineValue(globalObject, 'navigator', navigator, { writable: false, enumerable: true, configurable: true });
  markObjectToString(globalObject, 'Window');

  return { Window, Location, Navigator, location, navigator };
}

module.exports = { installBaseEnv };
