// Document 模块模板：提供最小 document / DOM 原型链，并优先用 addon.createUndetectable 处理 document.all。
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

function defineNativeSetter(obj, key, impl, options = {}, addon) {
  if (protect && protect.defineNativeSetter) return protect.defineNativeSetter(obj, key, impl, options, addon);
  Object.defineProperty(obj, key, { set: impl, enumerable: options.enumerable ?? true, configurable: options.configurable ?? true });
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

function throwConstructorRequiresNew(name, addon) {
  if (protect && protect.throwConstructorRequiresNew) return protect.throwConstructorRequiresNew(name, addon);
  throw new TypeError(`Failed to construct '${name}': Please use the 'new' operator, this DOM object constructor cannot be called as a function.`);
}

function installDocumentAll(document, addon) {
  let value;
  let exact = false;
  if (protect && typeof protect.createUndetectable === 'function') {
    value = protect.createUndetectable(function documentAll() { return undefined; }, addon);
    exact = value !== undefined;
  } else if (addon && typeof addon.createUndetectable === 'function') {
    try {
      value = addon.createUndetectable(function documentAll() { return undefined; });
      exact = true;
    } catch {}
  }
  if (!exact) value = undefined;
  Object.defineProperty(document, 'all', {
    value,
    writable: false,
    enumerable: false,
    configurable: true,
  });
  return { exact, value };
}

function installDocumentEnv(globalObject, fixture = {}, options = {}) {
  const addon = options.addon || null;
  const pageUrl = fixture.pageUrl || fixture.apiUrl || (globalObject.location && globalObject.location.href) || 'https://example.com/';
  const url = new URL(pageUrl);
  const cookieJar = new Map();
  const initialCookie = (fixture.request && fixture.request.cookie) || fixture.cookie || '';
  if (initialCookie) {
    for (const pair of String(initialCookie).split(';')) {
      const idx = pair.indexOf('=');
      if (idx > 0) cookieJar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }

  const EventTarget = createNativeConstructor('EventTarget', 0, function EventTarget(isNew) {
    if (!isNew) return throwConstructorRequiresNew('EventTarget', addon);
  }, addon);
  const Node = createNativeConstructor('Node', 0, function Node(isNew) {
    return throwIllegalConstructor('Node', addon);
  }, addon);
  const Document = createNativeConstructor('Document', 0, function Document(isNew) {
    return throwIllegalConstructor('Document', addon);
  }, addon);
  const HTMLDocument = createNativeConstructor('HTMLDocument', 0, function HTMLDocument(isNew) {
    return throwIllegalConstructor('HTMLDocument', addon);
  }, addon);
  const Element = createNativeConstructor('Element', 0, function Element(isNew) {
    return throwIllegalConstructor('Element', addon);
  }, addon);
  const HTMLElement = createNativeConstructor('HTMLElement', 0, function HTMLElement(isNew) {
    return throwIllegalConstructor('HTMLElement', addon);
  }, addon);
  const HTMLHtmlElement = createNativeConstructor('HTMLHtmlElement', 0, function HTMLHtmlElement(isNew) {
    return throwIllegalConstructor('HTMLHtmlElement', addon);
  }, addon);

  for (const ctor of [EventTarget, Node, Document, HTMLDocument, Element, HTMLElement, HTMLHtmlElement]) {
    defineValue(ctor.prototype, 'constructor', ctor, { writable: true, enumerable: false, configurable: true });
    markObjectToString(ctor.prototype, ctor.name);
  }

  Object.setPrototypeOf(Node.prototype, EventTarget.prototype);
  Object.setPrototypeOf(Document.prototype, Node.prototype);
  Object.setPrototypeOf(HTMLDocument.prototype, Document.prototype);
  Object.setPrototypeOf(Element.prototype, Node.prototype);
  Object.setPrototypeOf(HTMLElement.prototype, Element.prototype);
  Object.setPrototypeOf(HTMLHtmlElement.prototype, HTMLElement.prototype);

  const document = Object.create(HTMLDocument.prototype);
  const documentElement = Object.create(HTMLHtmlElement.prototype);
  markObjectToString(document, 'HTMLDocument');
  markObjectToString(documentElement, 'HTMLHtmlElement');

  defineNativeGetter(Document.prototype, 'URL', function () { return url.href; }, { enumerable: true, configurable: true, name: 'URL' }, addon);
  defineNativeGetter(Document.prototype, 'documentURI', function () { return url.href; }, { enumerable: true, configurable: true, name: 'documentURI' }, addon);
  defineNativeGetter(Document.prototype, 'referrer', function () { return fixture.referrer || ''; }, { enumerable: true, configurable: true, name: 'referrer' }, addon);
  defineNativeGetter(Document.prototype, 'hidden', function () { return false; }, { enumerable: true, configurable: true, name: 'hidden' }, addon);
  defineNativeGetter(Document.prototype, 'visibilityState', function () { return 'visible'; }, { enumerable: true, configurable: true, name: 'visibilityState' }, addon);
  defineNativeGetter(Document.prototype, 'documentElement', function () { return documentElement; }, { enumerable: true, configurable: true, name: 'documentElement' }, addon);
  defineNativeGetter(Document.prototype, 'defaultView', function () { return globalObject.window || globalObject; }, { enumerable: true, configurable: true, name: 'defaultView' }, addon);

  const getCookie = function () {
    return Array.from(cookieJar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  };
  const setCookie = function (value) {
    const first = String(value || '').split(';')[0];
    const idx = first.indexOf('=');
    if (idx > 0) cookieJar.set(first.slice(0, idx).trim(), first.slice(idx + 1).trim());
  };
  const cookieGetter = protect && protect.createNativeGetter ? protect.createNativeGetter('cookie', getCookie, addon) : getCookie;
  const cookieSetter = protect && protect.createNativeSetter ? protect.createNativeSetter('cookie', setCookie, addon) : setCookie;
  Object.defineProperty(Document.prototype, 'cookie', { get: cookieGetter, set: cookieSetter, enumerable: true, configurable: true });

  defineNativeValue(Document.prototype, 'querySelector', function querySelector() { return null; }, { enumerable: true, configurable: true, writable: true, name: 'querySelector', length: 1 }, addon);
  defineNativeValue(Document.prototype, 'getElementById', function getElementById() { return null; }, { enumerable: true, configurable: true, writable: true, name: 'getElementById', length: 1 }, addon);
  defineNativeValue(Document.prototype, 'createElement', function createElement(tagName) {
    const el = Object.create(HTMLElement.prototype);
    defineValue(el, 'tagName', String(tagName || '').toUpperCase(), { writable: false, enumerable: true, configurable: true });
    defineValue(el, 'nodeName', String(tagName || '').toUpperCase(), { writable: false, enumerable: true, configurable: true });
    markObjectToString(el, 'HTMLElement');
    return el;
  }, { enumerable: true, configurable: true, writable: true, name: 'createElement', length: 1 }, addon);

  const allStatus = installDocumentAll(document, addon);

  for (const ctor of [EventTarget, Node, Document, HTMLDocument, Element, HTMLElement, HTMLHtmlElement]) {
    defineValue(globalObject, ctor.name, ctor, { writable: true, enumerable: false, configurable: true });
  }
  defineValue(globalObject, 'document', document, { writable: false, enumerable: true, configurable: true });

  return { document, documentElement, allStatus, EventTarget, Node, Document, HTMLDocument, Element, HTMLElement, HTMLHtmlElement };
}

module.exports = { installDocumentEnv, installDocumentAll };
