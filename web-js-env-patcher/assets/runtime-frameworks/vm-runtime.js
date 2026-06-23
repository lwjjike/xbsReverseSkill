// Node.js vm runtime 模板：仅在用户明确选择 vm 时复制到最终项目。
// vm 是轻量隔离，不是强安全边界；仍需严格阻断 Node 泄露。
'use strict';

const vm = require('vm');

function createVmRuntime(options = {}) {
  const installEnv = options.installEnv || function installEnv() {};
  const sandbox = Object.create(null);
  const context = vm.createContext(sandbox, {
    name: options.name || 'web-js-env-patcher-context',
    codeGeneration: options.codeGeneration || {
      strings: true,
      wasm: false,
    },
  });

  return {
    name: 'vm',
    context,
    sandbox,

    async initialize(fixture = {}) {
      // 先安装浏览器式环境对象，不向目标上下文注入 process、Buffer、require、module
      await installEnv(sandbox, fixture, options);
      return sandbox;
    },

    async load(sourceCode, meta = {}) {
      const script = new vm.Script(String(sourceCode), {
        filename: meta.filename || 'target.js',
        displayErrors: true,
      });
      return script.runInContext(context, {
        timeout: options.timeoutMs || 5000,
        displayErrors: true,
      });
    },

    async call(entry, args = []) {
      const fn = typeof entry === 'function' ? entry : sandbox[entry];
      if (typeof fn !== 'function') {
        throw new TypeError(`入口函数不存在：${String(entry)}`);
      }
      return fn.apply(sandbox, args);
    },

    async dispose() {
      // vm context 没有显式释放 API，敏感状态由外层清理 case 临时目录时处理
    },
  };
}

module.exports = { createVmRuntime };
