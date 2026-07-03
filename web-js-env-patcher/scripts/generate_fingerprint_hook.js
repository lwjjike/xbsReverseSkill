#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    types: 'canvas,webgl,dom-geometry',
    out: '',
    apiPattern: '',
    chunkSize: 3000,
    deprecatedMaxDataUrlLength: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--types') args.types = argv[++i] || args.types;
    else if (a === '--out') args.out = argv[++i] || '';
    else if (a === '--api-pattern') args.apiPattern = argv[++i] || '';
    else if (a === '--chunk-size') args.chunkSize = Number(argv[++i] || args.chunkSize);
    else if (a === '--max-data-url-length') {
      // 兼容旧参数名：历史版本用它裁剪 dataURL；当前版本严禁裁剪，只把它当作“分片大小”。
      args.deprecatedMaxDataUrlLength = Number(argv[++i] || args.chunkSize);
      args.chunkSize = args.deprecatedMaxDataUrlLength;
    }
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`未知参数：${a}`);
  }
  if (!Number.isFinite(args.chunkSize) || args.chunkSize < 512) args.chunkSize = 3000;
  return args;
}

function usage() {
  return `用法：
  node scripts/generate_fingerprint_hook.js --types canvas,webgl,dom-geometry --out case/hooks/fingerprint-hook.js
  node scripts/generate_fingerprint_hook.js --types canvas,webgl,webgpu,audio,dom-geometry --chunk-size 3000

说明：
  生成浏览器侧指纹终端 API 采样 Hook。该脚本只用于前置取证，不得进入最终 result/ 交付目录。
  长指纹值不会被裁剪为 4000 / 4096 字符；Canvas / WebGL / WebGPU / Audio 等大结果会完整保存或按 chunks 分片保存。
  旧参数 --max-data-url-length 已废弃裁剪语义，仅兼容为分片大小，不能用于截断最终值。`;
}

function q(v) { return JSON.stringify(String(v)); }

function header(args) {
  return `// 指纹终端 API 采样 Hook，仅用于授权前置取证。
// 使用方式：在用户已确认的取证工具中注入，触发最少量业务动作后执行：
//   copy(JSON.stringify(await window.__WEB_JS_ENV_PATCHER_FINALIZE_FINGERPRINT__(), null, 2))
// 如果控制台不支持 await，可先执行：
//   window.__WEB_JS_ENV_PATCHER_FINALIZE_FINGERPRINT__().then(v => copy(JSON.stringify(v, null, 2)))
// 注意：长指纹值必须完整保存或分片保存，不得裁剪为 4000 / 4096 字符，也不得把 Trace 可见片段当最终值。
// 不要把本 Hook 放入最终 result/ 交付目录。
(function installFingerprintSampler() {
  if (window.__WEB_JS_ENV_PATCHER_FINGERPRINT_HOOKED__) return;
  Object.defineProperty(window, "__WEB_JS_ENV_PATCHER_FINGERPRINT_HOOKED__", { value: true, configurable: true });
  const chunkSize = ${Number(args.chunkSize) || 3000};
  const apiPattern = ${q(args.apiPattern)};
  const store = window.__WEB_JS_ENV_PATCHER_FINGERPRINT__ = window.__WEB_JS_ENV_PATCHER_FINGERPRINT__ || {
    version: 2,
    source: {
      pageUrl: location.href,
      userAgent: navigator.userAgent,
      language: navigator.language,
      languages: Array.from(navigator.languages || []),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      capturedAt: new Date().toISOString(),
      capturedBy: "真实浏览器指纹采样 Hook",
      traceStatus: "browser-complete-sampled",
      apiPattern
    },
    canvas: { toDataURL: [], toBlob: [], measureText: [], getImageData: [] },
    webgl: { getParameter: [], getSupportedExtensions: null, getExtension: [], getShaderPrecisionFormat: [], readPixels: [] },
    webgpu: { requestAdapter: [] },
    audio: { startRendering: [], getChannelData: [] },
    domGeometry: { getBoundingClientRect: [], getClientRects: [], offset: [] }
  };
  function stack() { try { return new Error().stack || ""; } catch(e) { return ""; } }
  function chunkString(value, encoding) {
    const text = String(value == null ? "" : value);
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) chunks.push(text.slice(i, i + chunkSize));
    return {
      encoding,
      valueLength: text.length,
      chunkSize,
      chunks,
      truncated: false,
      sha256: "",
      sha256Of: encoding === "base64-chunks" ? "base64-string" : "string",
      hashStatus: "pending-finalize"
    };
  }
  function b64FromArrayLike(arr) {
    try {
      const bytes = new Uint8Array(arr.buffer || arr, arr.byteOffset || 0, arr.byteLength || arr.length || 0);
      let s = "";
      const step = 0x8000;
      for (let i = 0; i < bytes.length; i += step) {
        const sub = bytes.subarray(i, Math.min(i + step, bytes.length));
        s += String.fromCharCode.apply(null, sub);
      }
      return btoa(s);
    } catch(e) { return ""; }
  }
  function chunkArrayLikeAsBase64(arr) {
    const encoded = b64FromArrayLike(arr);
    const out = chunkString(encoded, "base64-chunks");
    try {
      const bytes = new Uint8Array(arr.buffer || arr, arr.byteOffset || 0, arr.byteLength || arr.length || 0);
      out.rawByteLength = bytes.byteLength;
    } catch(e) {}
    return out;
  }
  function clonePlain(value, depth) {
    if (depth <= 0) return String(value);
    if (value == null) return value;
    if (typeof value === "string") return value.length >= 3900 ? chunkString(value, "string-chunks") : value;
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (Array.isArray(value)) return value.map(v => clonePlain(v, depth - 1));
    if (value instanceof Set) return Array.from(value).map(v => clonePlain(v, depth - 1));
    if (value instanceof Map) return Array.from(value.entries()).map(([k, v]) => [clonePlain(k, depth - 1), clonePlain(v, depth - 1)]);
    if (typeof value === "object") {
      const out = {};
      for (const key of Object.keys(value)) {
        try { out[key] = clonePlain(value[key], depth - 1); } catch(e) { out[key] = "<read-error>"; }
      }
      return out;
    }
    return String(value);
  }
  function selectorOf(el) {
    try {
      if (!el) return "";
      if (el.id) return "#" + el.id;
      if (el.className && typeof el.className === "string") return "." + el.className.trim().split(/\\s+/)[0];
      return String(el.tagName || "").toLowerCase();
    } catch(e) { return ""; }
  }
  async function sha256Text(text) {
    const input = new TextEncoder().encode(String(text));
    const digest = await crypto.subtle.digest("SHA-256", input);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  async function fillChunkHashes(node) {
    if (!node || typeof node !== "object") return;
    if ((node.encoding === "string-chunks" || node.encoding === "base64-chunks") && Array.isArray(node.chunks)) {
      const text = node.chunks.join("");
      node.valueLength = text.length;
      node.truncated = false;
      try {
        node.sha256 = await sha256Text(text);
        node.hashStatus = "ok";
      } catch(e) {
        node.hashStatus = "failed:" + (e && e.message || String(e));
      }
    }
    if (Array.isArray(node)) {
      for (const item of node) await fillChunkHashes(item);
    } else {
      for (const key of Object.keys(node)) await fillChunkHashes(node[key]);
    }
  }
  window.__WEB_JS_ENV_PATCHER_FINALIZE_FINGERPRINT__ = async function finalizeFingerprint() {
    await fillChunkHashes(store);
    store.source.finalizedAt = new Date().toISOString();
    store.source.finalizeNote = "长指纹值已完整保存或分片保存，sha256 针对完整字符串或完整 base64 字符串计算，truncated 必须为 false。";
    return store;
  };
`;
}

function footer() {
  return `  console.info("[web-js-env-patcher] 指纹采样 Hook 已安装。触发目标动作后执行：copy(JSON.stringify(await window.__WEB_JS_ENV_PATCHER_FINALIZE_FINGERPRINT__(), null, 2))");
})();`;
}

function canvasSnippet() {
  return `
  // ===== Canvas 终端 API 采样 =====
  if (window.HTMLCanvasElement) {
    const rawToDataURL = HTMLCanvasElement.prototype.toDataURL;
    if (rawToDataURL && !rawToDataURL.__wjep_hooked__) {
      HTMLCanvasElement.prototype.toDataURL = function patchedToDataURL(type, quality) {
        const result = rawToDataURL.apply(this, arguments);
        store.canvas.toDataURL.push({
          match: { width: this.width, height: this.height, type: type || "image/png" },
          result: chunkString(result, "string-chunks"),
          source: { capturedBy: "真实浏览器 Hook", tool: "用户选择的取证浏览器", traceStatus: "browser-complete-sampled" },
          stack: stack()
        });
        return result;
      };
      HTMLCanvasElement.prototype.toDataURL.__wjep_hooked__ = true;
    }
    const rawToBlob = HTMLCanvasElement.prototype.toBlob;
    if (rawToBlob && !rawToBlob.__wjep_hooked__) {
      HTMLCanvasElement.prototype.toBlob = function patchedToBlob(callback, type, quality) {
        const width = this.width, height = this.height, callStack = stack();
        return rawToBlob.call(this, function(blob) {
          store.canvas.toBlob.push({
            match: { width, height, type: type || (blob && blob.type) || "image/png" },
            result: { type: blob && blob.type || type || "", size: blob && blob.size || 0 },
            source: { capturedBy: "真实浏览器 Hook", tool: "用户选择的取证浏览器", traceStatus: "browser-complete-sampled" },
            stack: callStack
          });
          return callback && callback.apply(this, arguments);
        }, type, quality);
      };
      HTMLCanvasElement.prototype.toBlob.__wjep_hooked__ = true;
    }
  }
  if (window.CanvasRenderingContext2D) {
    const p = CanvasRenderingContext2D.prototype;
    const rawMeasureText = p.measureText;
    if (rawMeasureText && !rawMeasureText.__wjep_hooked__) {
      p.measureText = function patchedMeasureText(text) {
        const ret = rawMeasureText.apply(this, arguments);
        store.canvas.measureText.push({
          match: { text: String(text), font: this.font },
          result: {
            width: ret.width,
            actualBoundingBoxLeft: ret.actualBoundingBoxLeft,
            actualBoundingBoxRight: ret.actualBoundingBoxRight,
            actualBoundingBoxAscent: ret.actualBoundingBoxAscent,
            actualBoundingBoxDescent: ret.actualBoundingBoxDescent,
            fontBoundingBoxAscent: ret.fontBoundingBoxAscent,
            fontBoundingBoxDescent: ret.fontBoundingBoxDescent
          },
          source: { capturedBy: "真实浏览器 Hook", tool: "用户选择的取证浏览器", traceStatus: "browser-complete-sampled" },
          stack: stack()
        });
        return ret;
      };
      p.measureText.__wjep_hooked__ = true;
    }
    const rawGetImageData = p.getImageData;
    if (rawGetImageData && !rawGetImageData.__wjep_hooked__) {
      p.getImageData = function patchedGetImageData(sx, sy, sw, sh) {
        const ret = rawGetImageData.apply(this, arguments);
        store.canvas.getImageData.push({
          match: { sx, sy, sw, sh },
          result: { width: ret.width, height: ret.height, dataBase64: chunkArrayLikeAsBase64(ret.data) },
          source: { capturedBy: "真实浏览器 Hook", tool: "用户选择的取证浏览器", traceStatus: "browser-complete-sampled" },
          stack: stack()
        });
        return ret;
      };
      p.getImageData.__wjep_hooked__ = true;
    }
  }
`;
}

function webglSnippet() {
  return `
  // ===== WebGL 终端 API 采样 =====
  for (const Ctor of [window.WebGLRenderingContext, window.WebGL2RenderingContext].filter(Boolean)) {
    const p = Ctor.prototype;
    if (p.getParameter && !p.getParameter.__wjep_hooked__) {
      const raw = p.getParameter;
      p.getParameter = function patchedGetParameter(pname) {
        const ret = raw.apply(this, arguments);
        store.webgl.getParameter.push({
          match: { pname },
          result: clonePlain(ret, 3),
          source: { capturedBy: "真实浏览器 Hook", tool: "用户选择的取证浏览器", traceStatus: "browser-complete-sampled" },
          stack: stack()
        });
        return ret;
      };
      p.getParameter.__wjep_hooked__ = true;
    }
    if (p.getSupportedExtensions && !p.getSupportedExtensions.__wjep_hooked__) {
      const raw = p.getSupportedExtensions;
      p.getSupportedExtensions = function patchedGetSupportedExtensions() {
        const ret = raw.apply(this, arguments);
        store.webgl.getSupportedExtensions = {
          result: Array.from(ret || []),
          source: { capturedBy: "真实浏览器 Hook", tool: "用户选择的取证浏览器", traceStatus: "browser-complete-sampled" },
          stack: stack()
        };
        return ret;
      };
      p.getSupportedExtensions.__wjep_hooked__ = true;
    }
    if (p.getExtension && !p.getExtension.__wjep_hooked__) {
      const raw = p.getExtension;
      p.getExtension = function patchedGetExtension(name) {
        const ret = raw.apply(this, arguments);
        store.webgl.getExtension.push({
          match: { name: String(name) },
          result: ret ? { exists: true, keys: Object.keys(ret).slice(0, 50) } : null,
          source: { capturedBy: "真实浏览器 Hook", tool: "用户选择的取证浏览器", traceStatus: "browser-complete-sampled" },
          stack: stack()
        });
        return ret;
      };
      p.getExtension.__wjep_hooked__ = true;
    }
    if (p.getShaderPrecisionFormat && !p.getShaderPrecisionFormat.__wjep_hooked__) {
      const raw = p.getShaderPrecisionFormat;
      p.getShaderPrecisionFormat = function patchedGetShaderPrecisionFormat(shaderType, precisionType) {
        const ret = raw.apply(this, arguments);
        store.webgl.getShaderPrecisionFormat.push({
          match: { shaderType, precisionType },
          result: ret ? { rangeMin: ret.rangeMin, rangeMax: ret.rangeMax, precision: ret.precision } : null,
          source: { capturedBy: "真实浏览器 Hook", tool: "用户选择的取证浏览器", traceStatus: "browser-complete-sampled" },
          stack: stack()
        });
        return ret;
      };
      p.getShaderPrecisionFormat.__wjep_hooked__ = true;
    }
    if (p.readPixels && !p.readPixels.__wjep_hooked__) {
      const raw = p.readPixels;
      p.readPixels = function patchedReadPixels(x, y, width, height, format, type, pixels) {
        const ret = raw.apply(this, arguments);
        store.webgl.readPixels.push({
          match: { x, y, width, height, format, type },
          result: { dataBase64: pixels ? chunkArrayLikeAsBase64(pixels) : chunkString("", "base64-chunks") },
          source: { capturedBy: "真实浏览器 Hook", tool: "用户选择的取证浏览器", traceStatus: "browser-complete-sampled" },
          stack: stack()
        });
        return ret;
      };
      p.readPixels.__wjep_hooked__ = true;
    }
  }
`;
}

function webgpuSnippet() {
  return `
  // ===== WebGPU 终端 API 采样 =====
  if (navigator.gpu && navigator.gpu.requestAdapter && !navigator.gpu.requestAdapter.__wjep_hooked__) {
    const rawRequestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
    navigator.gpu.requestAdapter = async function patchedRequestAdapter(options) {
      const adapter = await rawRequestAdapter(options);
      const info = adapter && adapter.info ? clonePlain(adapter.info, 4) : null;
      store.webgpu.requestAdapter.push({
        match: { options: clonePlain(options || {}, 4) },
        result: {
          info,
          features: adapter && adapter.features ? Array.from(adapter.features) : [],
          limits: adapter && adapter.limits ? clonePlain(adapter.limits, 3) : {}
        },
        source: { capturedBy: "真实浏览器 Hook", tool: "用户选择的取证浏览器", traceStatus: "browser-complete-sampled" },
        stack: stack()
      });
      return adapter;
    };
    navigator.gpu.requestAdapter.__wjep_hooked__ = true;
  }
`;
}

function audioSnippet() {
  return `
  // ===== Audio 指纹终端 API 采样 =====
  if (window.AudioBuffer && AudioBuffer.prototype.getChannelData && !AudioBuffer.prototype.getChannelData.__wjep_hooked__) {
    const rawGetChannelData = AudioBuffer.prototype.getChannelData;
    AudioBuffer.prototype.getChannelData = function patchedGetChannelData(channel) {
      const ret = rawGetChannelData.apply(this, arguments);
      try {
        store.audio.getChannelData.push({
          match: { channel, length: this.length, sampleRate: this.sampleRate, numberOfChannels: this.numberOfChannels },
          result: { channelBase64: chunkArrayLikeAsBase64(ret) },
          source: { capturedBy: "真实浏览器 Hook", tool: "用户选择的取证浏览器", traceStatus: "browser-complete-sampled" },
          stack: stack()
        });
      } catch(e) {}
      return ret;
    };
    AudioBuffer.prototype.getChannelData.__wjep_hooked__ = true;
  }
  if (window.OfflineAudioContext && OfflineAudioContext.prototype.startRendering && !OfflineAudioContext.prototype.startRendering.__wjep_hooked__) {
    const rawStartRendering = OfflineAudioContext.prototype.startRendering;
    OfflineAudioContext.prototype.startRendering = function patchedStartRendering() {
      const callStack = stack();
      const ret = rawStartRendering.apply(this, arguments);
      if (ret && typeof ret.then === "function") {
        return ret.then(buffer => {
          try {
            const data = buffer.getChannelData(0);
            store.audio.startRendering.push({
              match: { length: buffer.length, sampleRate: buffer.sampleRate, numberOfChannels: buffer.numberOfChannels },
              result: { channel0Base64: chunkArrayLikeAsBase64(data) },
              source: { capturedBy: "真实浏览器 Hook", tool: "用户选择的取证浏览器", traceStatus: "browser-complete-sampled" },
              stack: callStack
            });
          } catch(e) {}
          return buffer;
        });
      }
      return ret;
    };
    OfflineAudioContext.prototype.startRendering.__wjep_hooked__ = true;
  }
`;
}

function domSnippet() {
  return `
  // ===== DOM 几何 / 字体探测终端 API 采样 =====
  if (window.Element) {
    const p = Element.prototype;
    const rawRect = p.getBoundingClientRect;
    if (rawRect && !rawRect.__wjep_hooked__) {
      p.getBoundingClientRect = function patchedGetBoundingClientRect() {
        const ret = rawRect.apply(this, arguments);
        store.domGeometry.getBoundingClientRect.push({
          match: { selector: selectorOf(this) },
          result: { x: ret.x, y: ret.y, width: ret.width, height: ret.height, top: ret.top, left: ret.left, right: ret.right, bottom: ret.bottom },
          source: { capturedBy: "真实浏览器 Hook", tool: "用户选择的取证浏览器", traceStatus: "browser-complete-sampled" },
          stack: stack()
        });
        return ret;
      };
      p.getBoundingClientRect.__wjep_hooked__ = true;
    }
    const rawRects = p.getClientRects;
    if (rawRects && !rawRects.__wjep_hooked__) {
      p.getClientRects = function patchedGetClientRects() {
        const ret = rawRects.apply(this, arguments);
        store.domGeometry.getClientRects.push({
          match: { selector: selectorOf(this) },
          result: Array.from(ret || []).map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, left: r.left, right: r.right, bottom: r.bottom })),
          source: { capturedBy: "真实浏览器 Hook", tool: "用户选择的取证浏览器", traceStatus: "browser-complete-sampled" },
          stack: stack()
        });
        return ret;
      };
      p.getClientRects.__wjep_hooked__ = true;
    }
    for (const key of ["offsetWidth", "offsetHeight", "scrollWidth", "scrollHeight", "clientWidth", "clientHeight"]) {
      const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, key) || Object.getOwnPropertyDescriptor(Element.prototype, key);
      if (!desc || !desc.get || desc.get.__wjep_hooked__) continue;
      Object.defineProperty(HTMLElement.prototype, key, {
        get: function patchedGeometryGetter() {
          const value = desc.get.call(this);
          store.domGeometry.offset.push({
            match: { selector: selectorOf(this) },
            result: { [key]: value },
            source: { capturedBy: "真实浏览器 Hook", tool: "用户选择的取证浏览器", traceStatus: "browser-complete-sampled" },
            stack: stack()
          });
          return value;
        },
        enumerable: desc.enumerable,
        configurable: true
      });
      try { Object.getOwnPropertyDescriptor(HTMLElement.prototype, key).get.__wjep_hooked__ = true; } catch(e) {}
    }
  }
`;
}

function build(args) {
  const types = new Set(String(args.types || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean));
  const parts = [header(args)];
  if (types.has('canvas')) parts.push(canvasSnippet());
  if (types.has('webgl')) parts.push(webglSnippet());
  if (types.has('webgpu')) parts.push(webgpuSnippet());
  if (types.has('audio')) parts.push(audioSnippet());
  if (types.has('dom') || types.has('dom-geometry') || types.has('font') || types.has('fonts')) parts.push(domSnippet());
  parts.push(footer());
  return parts.join('\n');
}

try {
  const args = parseArgs(process.argv);
  if (args.help) { console.log(usage()); process.exit(0); }
  const code = build(args);
  if (args.out) {
    const out = path.resolve(args.out);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, code, 'utf8');
    const compatNote = args.deprecatedMaxDataUrlLength ? '\n- 兼容提醒：--max-data-url-length 已按分片大小处理，没有裁剪任何值。' : '';
    console.log(`# 指纹采样 Hook 已生成\n- 输出文件：${out}\n- 类型：${args.types}\n- 分片大小：${args.chunkSize}\n- 提醒：该 Hook 只用于前置取证，不得放入最终 result/ 目录；长指纹值必须 finalize 后完整分片保存。${compatNote}`);
  } else {
    process.stdout.write(code + '\n');
  }
} catch (err) {
  console.error(err.message || String(err));
  console.error(usage());
  process.exit(1);
}
