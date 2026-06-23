#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    caseDir: '',
    dir: '',
    file: '',
    json: false,
    markdown: false,
    warningsAsErrors: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--case-dir' || arg === '--case' || arg === '-d') args.caseDir = argv[++i] || '';
    else if (arg === '--dir') args.dir = argv[++i] || '';
    else if (arg === '--file' || arg === '-f') args.file = argv[++i] || '';
    else if (arg === '--json') args.json = true;
    else if (arg === '--markdown') args.markdown = true;
    else if (arg === '--warnings-as-errors') args.warningsAsErrors = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`未知参数：${arg}`);
  }

  if (!args.json && !args.markdown) args.markdown = true;
  return args;
}

function usage() {
  return `用法：
  node scripts/check_webapi_addon_coverage.js --case-dir case --markdown
  node scripts/check_webapi_addon_coverage.js --dir case/result/src/env --json
  node scripts/check_webapi_addon_coverage.js --file case/result/src/env/install-env.js --markdown

说明：检查补环境代码是否存在普通函数、普通对象、直接复用宿主 Web API、prototype 对象字面量等绕过 addon-first 的写法。该检查用于交付门禁，失败时不得交付最终项目。`;
}

function exists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function stat(filePath) {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function rel(root, filePath) {
  return (path.relative(root, filePath) || '.').replace(/\\/g, '/');
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function walk(filePath, out = []) {
  if (!exists(filePath)) return out;
  const st = stat(filePath);
  if (!st) return out;
  if (st.isDirectory()) {
    let names = [];
    try {
      names = fs.readdirSync(filePath);
    } catch {
      names = [];
    }
    for (const name of names) walk(path.join(filePath, name), out);
  } else if (st.isFile()) {
    out.push(filePath);
  }
  return out;
}

function isJsFile(filePath) {
  return ['.js', '.mjs', '.cjs'].includes(path.extname(filePath).toLowerCase());
}

function shouldSkip(root, filePath) {
  const relative = rel(root, filePath).toLowerCase();
  if (/(^|\/)(node_modules|dist|build|coverage|vendor|third_party|third-party)(\/|$)/.test(relative)) return true;
  if (/(^|\/)src\/target\/(original|vendor|bundle|bundles)(\/|$)/.test(relative)) return true;
  if (/(\.min\.js|bundle\.js|vendor\.js|package-lock\.json)$/i.test(relative)) return true;
  return false;
}

function lineOf(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function lineText(text, line) {
  const lines = text.split(/\r?\n/);
  return (lines[line - 1] || '').trim();
}

function addIssue(list, severity, file, line, type, message, suggestion, snippet) {
  list.push({
    severity,
    file,
    line,
    type,
    message,
    suggestion,
    snippet: String(snippet || '').slice(0, 220),
  });
}

function targetExpr(name) {
  return `(?:ctx|window|self|globalThis|globalObject|global)\\s*(?:\\.\\s*${name}|\\[\\s*['"]${name}['"]\\s*\\])`;
}

function escapedJoin(names) {
  return names.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
}

const CONSTRUCTORS = [
  'Blob',
  'File',
  'FormData',
  'Event',
  'CustomEvent',
  'MessageEvent',
  'XMLHttpRequest',
  'Worker',
  'Image',
  'MutationObserver',
  'IntersectionObserver',
  'ResizeObserver',
  'BroadcastChannel',
  'MessageChannel',
  'MessagePort',
  'AudioContext',
  'OfflineAudioContext',
  'Screen',
  'ScreenOrientation',
  'URL',
  'Headers',
  'Request',
  'Response',
  'WebSocket',
  'IDBFactory',
  'IDBOpenDBRequest',
  'IDBRequest',
  'IDBDatabase',
  'IDBTransaction',
  'IDBObjectStore',
  'IDBIndex',
  'IDBCursor',
  'IDBKeyRange',
  'HTMLCanvasElement',
  'CanvasRenderingContext2D',
  'WebGLRenderingContext',
  'WebGL2RenderingContext',
  'CSSStyleDeclaration',
  'HTMLCollection',
  'NodeList',
  'PluginArray',
  'MimeTypeArray',
  'Plugin',
  'MimeType',
  'DOMTokenList',
  'StyleSheetList',
];

const OBJECT_LITERAL_TARGETS = [
  'screen',
  'orientation',
  'indexedDB',
  'IDBKeyRange',
  'CSS',
  'navigator',
  'document',
  'location',
  'localStorage',
  'sessionStorage',
  'crypto',
  'performance',
  'history',
  'visualViewport',
];

const WEBAPI_METHODS = [
  'open',
  'deleteDatabase',
  'cmp',
  'databases',
  'createObjectURL',
  'revokeObjectURL',
  'supports',
  'escape',
  'getContext',
  'toDataURL',
  'toBlob',
  'getImageData',
  'putImageData',
  'measureText',
  'getParameter',
  'readPixels',
  'getSupportedExtensions',
  'getShaderPrecisionFormat',
  'startRendering',
  'createElement',
  'querySelector',
  'querySelectorAll',
  'getElementById',
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'postMessage',
  'close',
  'send',
  'abort',
  'setRequestHeader',
  'getResponseHeader',
  'getAllResponseHeaders',
  'item',
  'namedItem',
];

const HOST_REUSE = [
  'TextEncoder',
  'TextDecoder',
  'URL',
  'URLSearchParams',
  'WebAssembly',
  'fetch',
  'Headers',
  'Request',
  'Response',
  'Event',
  'EventTarget',
  'MessageChannel',
  'BroadcastChannel',
  'crypto',
  'ReadableStream',
  'WritableStream',
  'TransformStream',
  'Blob',
  'File',
  'FormData',
];

const COLLECTION_CONSTRUCTORS = [
  'HTMLCollection',
  'NodeList',
  'PluginArray',
  'MimeTypeArray',
  'DOMTokenList',
  'StyleSheetList',
];

const HELPER_EVIDENCE = /(?:createNativeFunction|createNativeConstructor|createGetter|createSetter|createNativeGetter|createNativeSetter|defineNativeGetter|defineNativeSetter|defineNativeAccessor|createProtoChains|createNativeObject|createNativeCollection|getMimeTypesAndPlugins|createInterceptor|createUndetectable|setPrivate|getPrivate|hasPrivate|deletePrivate|nativeApi|addon\.|xbs\.|window\.xbs\.|globalThis\.xbs\.)\s*\(/;

function scanMatches(text, pattern, onMatch) {
  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(text))) {
    onMatch(match);
    if (match[0].length === 0) pattern.lastIndex += 1;
  }
}

function hasConstructorAddonEvidence(text, name) {
  const quoted = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const createNative = new RegExp(`createNativeFunction\\s*\\(\\s*true\\s*,\\s*['"]${quoted}['"]`);
  const createCtor = new RegExp(`createNativeConstructor\\s*\\(\\s*['"]${quoted}['"]`);
  const protoChains = new RegExp(`createProtoChains\\s*\\([\\s\\S]{0,1200}name\\s*:\\s*['"]${quoted}['"]`);
  return createNative.test(text) || createCtor.test(text) || protoChains.test(text);
}

function inspectFile(root, filePath) {
  const relative = rel(root, filePath);
  const text = readText(filePath);
  const issues = [];
  const warnings = [];

  for (const name of CONSTRUCTORS) {
    const directFunction = new RegExp(`${targetExpr(name)}\\s*=\\s*(?:async\\s*)?function\\b`, 'g');
    scanMatches(text, directFunction, match => {
      const line = lineOf(text, match.index);
      addIssue(
        issues,
        'error',
        relative,
        line,
        'webapi-constructor-plain-function',
        `${name} 被直接赋值为普通 function，绕过了 addon-first 的构造函数与 toString 保护。`,
        `使用 addon.createProtoChains([{ name: '${name}', ... }]) 或 addon.createNativeFunction(true, '${name}', length, callback) 创建，并设置 prototype.constructor、Symbol.toStringTag、非法构造行为和描述符。`,
        lineText(text, line)
      );
    });

    const classDeclaration = new RegExp(`\\bclass\\s+${name}\\b`, 'g');
    scanMatches(text, classDeclaration, match => {
      const line = lineOf(text, match.index);
      addIssue(
        issues,
        'error',
        relative,
        line,
        'webapi-constructor-plain-class',
        `${name} 使用普通 class 实现，默认不具备浏览器 native-like 构造函数行为。`,
        `优先使用 addon.createProtoChains 或 addon.createNativeFunction(true, '${name}', ...)；addon 不可用时才用 JS fallback，并记录降级原因。`,
        lineText(text, line)
      );
    });

    const identifierAssign = new RegExp(`${targetExpr(name)}\\s*=\\s*${name}\\s*;`, 'g');
    scanMatches(text, identifierAssign, match => {
      if (hasConstructorAddonEvidence(text, name)) return;
      const line = lineOf(text, match.index);
      addIssue(
        warnings,
        'warning',
        relative,
        line,
        'webapi-constructor-no-addon-evidence',
        `${name} 被挂载到全局，但当前文件没有明显的 createProtoChains / createNativeFunction(true, '${name}') 证据。`,
        `确认 ${name} 的构造函数来自 addon-first helper；如果由其他模块创建，应在本文件或阶段报告中记录来源，并确保交付前整体运行本检查。`,
        lineText(text, line)
      );
    });
  }

  for (const name of OBJECT_LITERAL_TARGETS) {
    const objectLiteral = new RegExp(`${targetExpr(name)}\\s*=\\s*\\{`, 'g');
    scanMatches(text, objectLiteral, match => {
      const line = lineOf(text, match.index);
      addIssue(
        issues,
        'error',
        relative,
        line,
        'webapi-instance-plain-object',
        `${name} 被直接赋值为普通对象，缺少浏览器原型链、实例 toString、descriptor 和 addon-first 证据。`,
        `为 ${name} 建立对应构造函数和 prototype，例如 Screen / IDBFactory / CSS 等；使用 createProtoChains 创建实例，再用 defineProperty 安装属性和 native-like 方法。`,
        lineText(text, line)
      );
    });
  }

  const pluginMimeInstall = /\b(?:plugins|mimeTypes)\b/;
  const installsNavigatorPluginMime = /Object\s*\.\s*defineProperty\s*\(\s*(?:navigator|Navigator\s*\.\s*prototype)[\s\S]{0,260}['"](?:plugins|mimeTypes)['"]|(?:navigator|Navigator\s*\.\s*prototype)\s*\.\s*(?:plugins|mimeTypes)\s*=/.test(text);
  const hasMimePluginAddon = /\b(?:getMimeTypesAndPlugins|addon\s*\.\s*getMimeTypesAndPlugins|nativeApi\s*\.\s*getMimeTypesAndPlugins|xbs\s*\.\s*getMimeTypesAndPlugins|window\s*\.\s*xbs\s*\.\s*getMimeTypesAndPlugins|globalThis\s*\.\s*xbs\s*\.\s*getMimeTypesAndPlugins)\s*\(/.test(text);
  if (pluginMimeInstall && installsNavigatorPluginMime && !hasMimePluginAddon) {
    const index = text.search(/(?:plugins|mimeTypes)/);
    const line = lineOf(text, index >= 0 ? index : 0);
    addIssue(
      issues,
      'error',
      relative,
      line,
      'navigator-plugins-mimetypes-without-addon',
      '发现 navigator.plugins / navigator.mimeTypes 安装逻辑，但未发现 getMimeTypesAndPlugins addon-first 证据。',
      'addon.node 或 xbs isolated-vm 可用时必须优先使用 addon.getMimeTypesAndPlugins(config) / xbs.getMimeTypesAndPlugins(config) 或 addon-first helper；真实浏览器插件数据不同则传入 config。只有 native 能力不可用或用户明确禁用时才允许 JS fallback，并记录原因。',
      lineText(text, line)
    );
  }

  const pluginMimePlainArray = /(?:plugins|mimeTypes)\s*[:=]\s*\[\s*\]/g;
  scanMatches(text, pluginMimePlainArray, match => {
    const nearby = text.slice(Math.max(0, match.index - 240), Math.min(text.length, match.index + 240));
    if (/fallback|降级|addon 不可用|addon不可用|getMimeTypesAndPlugins/.test(nearby)) return;
    const line = lineOf(text, match.index);
    addIssue(
      issues,
      'error',
      relative,
      line,
      'navigator-plugins-mimetypes-plain-array',
      'plugins / mimeTypes 被实现为普通数组，缺少 PluginArray / MimeTypeArray 原型、item / namedItem、索引访问和 native-like 行为。',
      '使用 addon.getMimeTypesAndPlugins(config) 或 xbs.getMimeTypesAndPlugins(config)；native 能力不可用时至少通过 createNativeCollection fallback 并记录差异。',
      lineText(text, line)
    );
  });

  for (const name of COLLECTION_CONSTRUCTORS) {
    const mentionsCollection = new RegExp(`\\b${name}\\b`).test(text);
    if (!mentionsCollection) continue;
    const fromMimePluginApi = ['PluginArray', 'MimeTypeArray', 'Plugin', 'MimeType'].includes(name) && /getMimeTypesAndPlugins\s*\(/.test(text);
    const hasCollectionAddon = new RegExp(`createNativeCollection\\s*\\([\\s\\S]{0,800}name\\s*:\\s*['"]${name}['"]`).test(text) || fromMimePluginApi;
    const plainCollection = new RegExp(`(?:class\\s+${name}\\b|function\\s+${name}\\s*\\(|${targetExpr(name)}\\s*=\\s*(?:function|class|\\{)|\\b${name}\\s*=\\s*\\[)`, 'g');
    scanMatches(text, plainCollection, match => {
      if (hasCollectionAddon) return;
      const line = lineOf(text, match.index);
      addIssue(
        issues,
        'error',
        relative,
        line,
        'webapi-collection-without-createNativeCollection',
        `${name} 使用普通 JS 结构实现，未体现 createNativeCollection / getMimeTypesAndPlugins addon-first。`,
        `浏览器集合对象 ${name} 应优先使用 addon.createNativeCollection({ name: '${name}', ... })；PluginArray / MimeTypeArray 应优先由 addon.getMimeTypesAndPlugins(config) 返回。`,
        lineText(text, line)
      );
    });
  }

  const methodNames = escapedJoin(WEBAPI_METHODS);
  const methodAssign = new RegExp(`(?:\\.|['"])(${methodNames})(?:['"])?\\s*(?:=|:)\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)\\s*=>|[A-Za-z_$][\\w$]*\\s*\\([^)]*\\)\\s*\\{)`, 'g');
  scanMatches(text, methodAssign, match => {
    const index = match.index;
    const line = lineOf(text, index);
    const snippet = lineText(text, line);
    if (HELPER_EVIDENCE.test(snippet)) return;
    if (/^\s*\/\/|^\s*\*/.test(snippet)) return;
    addIssue(
      issues,
      'error',
      relative,
      line,
      'webapi-method-plain-function',
      `WebAPI 方法 ${match[1]} 使用普通函数或对象字面量方法，未体现 addon-first/native-like 创建。`,
      `将 ${match[1]} 提取为具名函数，并通过 addon.createNativeFunction(false, '${match[1]}', length, callback) 或 addon-first helper 安装到正确 prototype / 对象描述符上。`,
      snippet
    );
  });

  const urlStatic = /(?:ctx|window|self|globalThis|globalObject|global)\s*\.\s*URL\s*\.\s*(createObjectURL|revokeObjectURL)\s*=\s*(?:async\s*)?function\b/g;
  scanMatches(text, urlStatic, match => {
    const line = lineOf(text, match.index);
    addIssue(
      issues,
      'error',
      relative,
      line,
      'url-static-method-plain-function',
      `URL.${match[1]} 被直接赋值为普通 function。`,
      `使用 addon.createNativeFunction(false, '${match[1]}', ...) 创建，并用 Object.defineProperty 安装 descriptor。`,
      lineText(text, line)
    );
  });

  const prototypeLiteral = /\b(?:[A-Z][A-Za-z0-9_$]*\s*\.\s*)?prototype\s*=\s*\{/g;
  scanMatches(text, prototypeLiteral, match => {
    const line = lineOf(text, match.index);
    addIssue(
      issues,
      'error',
      relative,
      line,
      'prototype-object-literal',
      '发现 prototype 直接替换为对象字面量，容易丢失 constructor、属性描述符、Symbol.toStringTag 和 native-like 方法。',
      '使用 addon.createProtoChains 建立原型链，或至少 Object.defineProperties 安装 prototype.constructor、Symbol.toStringTag 和每个 addon-first 方法。',
      lineText(text, line)
    );
  });

  const hostNames = escapedJoin(HOST_REUSE);
  const hostReuse = new RegExp(`(?:ctx|window|self|globalThis|globalObject|global)\\s*(?:\\.\\s*(${hostNames})|\\[\\s*['"](${hostNames})['"]\\s*\\])\\s*=\\s*(?:globalThis|global|window)\\s*\\.\\s*(?:\\1|\\2)`, 'g');
  scanMatches(text, hostReuse, match => {
    const name = match[1] || match[2];
    const line = lineOf(text, match.index);
    addIssue(
      issues,
      'error',
      relative,
      line,
      'host-webapi-direct-reuse',
      `${name} 直接复用宿主同名 Web API，可能泄露 Node.js / undici / 宿主实现特征。`,
      `不要盲目透传宿主 ${name}；按浏览器样本、RuyiTrace 证据和 addon-first helper 创建可控实现。`,
      lineText(text, line)
    );
  });

  const atobBtoa = /\b(?:atob|btoa)\s*=\s*(?:async\s*)?function[\s\S]{0,240}\bBuffer\s*\.\s*from\b/g;
  scanMatches(text, atobBtoa, match => {
    const line = lineOf(text, match.index);
    addIssue(
      issues,
      'error',
      relative,
      line,
      'buffer-backed-atob-btoa',
      'atob / btoa 使用 Buffer.from 实现，可能暴露 Node.js 语义与错误信息差异。',
      '为 atob / btoa 使用浏览器样本校验过的实现，并通过 addon.createNativeFunction 或 addon-first helper 做 native-like 包装；不得在目标上下文暴露 Buffer。',
      lineText(text, line)
    );
  });

  const objectAssignWebApi = /Object\s*\.\s*assign\s*\([^)]*\{[\s\S]{0,1200}\b(?:history|indexedDB|CSS|screen)\s*:\s*\{[\s\S]{0,500}\b[A-Za-z_$][\w$]*\s*\([^)]*\)\s*\{/g;
  scanMatches(text, objectAssignWebApi, match => {
    const line = lineOf(text, match.index);
    addIssue(
      issues,
      'error',
      relative,
      line,
      'object-assign-webapi-methods',
      'Object.assign 中发现 WebAPI 对象字面量和普通方法，绕过 descriptor、原型链与 addon-first。',
      '拆分为对应模块：先 createProtoChains 创建构造函数和实例，再用 Object.defineProperty 安装 addon native-like 方法。',
      lineText(text, line)
    );
  });

  const genericIllegalConstructor = /throw\s+new\s+TypeError\s*\(\s*['"]Illegal constructor['"]\s*\)/g;
  scanMatches(text, genericIllegalConstructor, match => {
    const line = lineOf(text, match.index);
    addIssue(
      issues,
      'error',
      relative,
      line,
      'constructor-error-generic-message',
      '构造函数报错信息使用了泛化的 Illegal constructor，未证明与目标浏览器的错误类型和错误信息一致。',
      '先用已确认取证浏览器采样直接调用和 new 调用的错误：error.name、constructor.name、message、stack 首行；再用 addon.throwTypeError 或 throwBrowserTypeError 复现对应 TypeError / DOMException 等类型和 message。',
      lineText(text, line)
    );
  });

  const nonTypeErrorIllegalConstructor = /throw\s+new\s+(?!TypeError\b)([A-Za-z_$][\w$]*)\s*\(\s*['"][^'"]*(?:Illegal constructor|Please use the 'new' operator|constructor cannot be called)/g;
  scanMatches(text, nonTypeErrorIllegalConstructor, match => {
    const line = lineOf(text, match.index);
    addIssue(
      issues,
      'error',
      relative,
      line,
      'constructor-error-type-mismatch-risk',
      `构造函数相关报错使用 ${match[1]}，存在与浏览器 TypeError / DOMException 类型不一致的风险。`,
      '按浏览器样本确认错误类型；多数 DOM 构造函数错误应为 TypeError，但必须以目标浏览器采样为准。',
      lineText(text, line)
    );
  });

  const hardcodedConstructorMessage = /Failed to construct ['"][^'"]+['"]:\s*(?:Illegal constructor|Please use the ['"]new['"] operator)/g;
  const hasConstructorErrorProfile = /constructorErrors|constructor-errors\.fixture|构造函数报错样本|browserErrorProfile|errorProfile/.test(text);
  scanMatches(text, hardcodedConstructorMessage, match => {
    if (hasConstructorErrorProfile) return;
    const line = lineOf(text, match.index);
    addIssue(
      warnings,
      'warning',
      relative,
      line,
      'constructor-error-profile-missing',
      '源码硬编码了浏览器构造函数错误信息，但未发现构造函数报错样本或 error profile 证据。',
      '建议保存 constructor-errors fixture 或在阶段报告中记录目标浏览器采样结果，避免把看似合理的报错信息误当成浏览器一致。',
      lineText(text, line)
    );
  });

  const emptyNativeConstructor = /createNativeConstructor\s*\(\s*['"]([A-Z][A-Za-z0-9_$]*)['"]\s*,\s*\d+\s*,\s*function(?:\s+[A-Za-z_$][\w$]*)?\s*\([^)]*\)\s*\{\s*\}/g;
  scanMatches(text, emptyNativeConstructor, match => {
    const line = lineOf(text, match.index);
    addIssue(
      issues,
      'error',
      relative,
      line,
      'constructor-empty-behavior',
      `${match[1]} 构造函数 callback 为空，未体现直接调用 / new 调用行为、非法构造报错或实例初始化。`,
      '按浏览器采样补齐构造函数行为：可构造对象要初始化实例状态；不可构造对象要复现错误类型和 message。',
      lineText(text, line)
    );
  });

  const emptyAddonConstructor = /createNativeFunction\s*\(\s*true\s*,\s*['"]([A-Z][A-Za-z0-9_$]*)['"]\s*,\s*\d+\s*,\s*function(?:\s+[A-Za-z_$][\w$]*)?\s*\([^)]*\)\s*\{\s*\}/g;
  scanMatches(text, emptyAddonConstructor, match => {
    const line = lineOf(text, match.index);
    addIssue(
      issues,
      'error',
      relative,
      line,
      'constructor-empty-behavior',
      `${match[1]} addon 构造函数 callback 为空，无法证明构造行为与浏览器一致。`,
      '按浏览器采样实现 new / call 分支、错误类型和 message，或通过实例工厂初始化可构造对象状态。',
      lineText(text, line)
    );
  });

  const unknownMarkObjectType = /\b(?:native|nativeApi|protect)?\.?\s*markObjectType\s*\(/g;
  scanMatches(text, unknownMarkObjectType, match => {
    const line = lineOf(text, match.index);
    addIssue(
      issues,
      'error',
      relative,
      line,
      'unknown-mark-object-type',
      '发现 markObjectType 调用；该名称不是本 Skill 批准的 addon-first API，语义不明确。',
      '如果对象由 addon.createProtoChains / addon 构造函数实例工厂创建，不要额外标记对象类型；addon 已负责实例 Object.prototype.toString。只有 JS fallback 对象才允许使用 Symbol.toStringTag / markObjectToString，并记录 fallback 原因。',
      lineText(text, line)
    );
  });

  const markObjectToStringCall = /\b(?:native|nativeApi|protect)\s*\.\s*markObjectToString\s*\(/g;
  scanMatches(text, markObjectToStringCall, match => {
    const nearby = text.slice(Math.max(0, match.index - 240), Math.min(text.length, match.index + 240));
    if (/fallback|降级|addon 不可用|addon不可用|JS fallback|NativeProtect/.test(nearby)) return;
    const line = lineOf(text, match.index);
    addIssue(
      warnings,
      'warning',
      relative,
      line,
      'mark-object-to-string-without-fallback-reason',
      '发现 markObjectToString 调用但附近没有 fallback 原因；它只能作为 addon 不可用时的 JS fallback。',
      '优先用 addon 构造函数或 createProtoChains 实例工厂创建对象。addon 已创建的实例不应再用 markObjectToString 叠加伪装；只有普通 JS fallback 对象才需要该函数。',
      lineText(text, line)
    );
  });

  const hasPlainWebApiPattern = issues.some(issue => issue.file === relative);
  const usesAnyNativeHelper = /createNativeFunction|createGetter|createSetter|createProtoChains|createNativeCollection|getMimeTypesAndPlugins|createInterceptor|createUndetectable|setPrivate|getPrivate|hasPrivate|deletePrivate|loadNativeAddon|WEB_JS_ENV_PATCHER_ADDON|WEB_JS_ENV_PATCHER_XBS_ISOLATED_VM|addon\.node|isolated_vm\.node|xbs-isolated-vm|xbs\.|window\.xbs|globalThis\.xbs/.test(text);
  if (hasPlainWebApiPattern && !usesAnyNativeHelper) {
    addIssue(
      warnings,
      'warning',
      relative,
      1,
      'file-no-native-helper',
      '文件中存在 WebAPI 普通实现问题，且未发现任何 addon-first / native helper 证据。',
      '在模块初始化阶段注入 nativeApi / addon，并统一通过 helper 创建函数、访问器、构造函数和实例对象。',
      ''
    );
  }

  return { issues, warnings };
}

function resolveInputs(args) {
  if (args.file) {
    const file = path.resolve(args.file);
    return { root: path.dirname(file), files: [file] };
  }
  if (args.dir) {
    const root = path.resolve(args.dir);
    return { root, files: walk(root).filter(file => isJsFile(file) && !shouldSkip(root, file)) };
  }
  if (args.caseDir) {
    const caseDir = path.resolve(args.caseDir);
    const preferred = path.join(caseDir, 'result');
    const root = exists(preferred) ? preferred : caseDir;
    return { root, files: walk(root).filter(file => isJsFile(file) && !shouldSkip(root, file)) };
  }
  throw new Error('必须指定 --case-dir、--dir 或 --file。');
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# WebAPI addon 覆盖检查报告');
  lines.push('');
  lines.push(`- 检查结果：${result.passed ? '通过' : '不通过'}`);
  lines.push(`- 扫描文件数：${result.scannedFiles.length}`);
  lines.push(`- 错误数：${result.issueCount}`);
  lines.push(`- 警告数：${result.warningCount}`);
  lines.push('');

  if (result.issues.length) {
    lines.push('## 错误');
    lines.push('');
    lines.push('| 文件 | 行号 | 类型 | 问题 | 修复建议 |');
    lines.push('|---|---:|---|---|---|');
    for (const issue of result.issues) {
      lines.push(`| ${issue.file} | ${issue.line || ''} | ${issue.type} | ${issue.message} | ${issue.suggestion} |`);
    }
    lines.push('');
  }

  if (result.warnings.length) {
    lines.push('## 警告');
    lines.push('');
    lines.push('| 文件 | 行号 | 类型 | 提醒 | 建议 |');
    lines.push('|---|---:|---|---|---|');
    for (const warning of result.warnings) {
      lines.push(`| ${warning.file} | ${warning.line || ''} | ${warning.type} | ${warning.message} | ${warning.suggestion} |`);
    }
    lines.push('');
  }

  if (!result.issues.length && !result.warnings.length) {
    lines.push('未发现 WebAPI 普通函数、普通对象、宿主透传或 prototype 对象字面量等 addon-first 覆盖问题。');
    lines.push('');
  }

  lines.push('## 交付门禁说明');
  lines.push('');
  lines.push('- 该检查失败时不得交付最终补环境项目。');
  lines.push('- 修复方向不是“删除检查”，而是把 WebAPI 构造函数、普通方法、getter、setter、实例对象、集合对象、plugins/mimeTypes 和特殊对象统一迁移到 addon-first helper。');
  lines.push('- addon.node / xbs native API 不可用时才允许 NativeProtect / JS fallback，并必须在阶段报告与最终总结中记录原因。');
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }

  const { root, files } = resolveInputs(args);
  const jsFiles = files.filter(file => exists(file) && isJsFile(file));
  const issues = [];
  const warnings = [];

  for (const file of jsFiles) {
    const inspected = inspectFile(root, file);
    issues.push(...inspected.issues);
    warnings.push(...inspected.warnings);
  }

  const warningCount = warnings.length;
  const issueCount = issues.length + (args.warningsAsErrors ? warningCount : 0);
  const result = {
    passed: issueCount === 0,
    root,
    scannedFiles: jsFiles.map(file => rel(root, file)),
    issueCount,
    warningCount,
    warningsAsErrors: args.warningsAsErrors,
    issues,
    warnings,
  };

  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(renderMarkdown(result));

  if (!result.passed) process.exitCode = 1;
}

try {
  main();
} catch (err) {
  console.error(err && err.message ? err.message : String(err));
  process.exitCode = 2;
}
