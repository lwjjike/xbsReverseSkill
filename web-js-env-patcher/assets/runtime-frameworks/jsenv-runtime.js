// jsEnv runtime 适配模板：仅在用户明确选择 jsEnv 且提供项目路径、入口和文档后复制到最终项目。
// 本模板不假设任何具体 jsEnv API；必须由 case 根据用户提供的 jsEnv 文档注入 adapter。
'use strict';

function loadJsEnvAdapter(options = {}) {
  if (options.adapter && typeof options.adapter === 'object') return options.adapter;
  if (typeof options.adapterFactory === 'function') return options.adapterFactory(options);
  if (options.adapterPath) {
    // adapterPath 应为最终项目内的相对路径或用户运行时显式提供的路径，不要写入本机绝对路径。
    return require(options.adapterPath);
  }
  throw new Error('已选择 jsEnv，但未提供 adapter、adapterFactory 或 adapterPath；请先根据 jsEnv 文档完成适配。');
}

function assertAdapter(adapter) {
  const missing = [];
  for (const name of ['initialize', 'load', 'call']) {
    if (typeof adapter[name] !== 'function') missing.push(name);
  }
  if (missing.length) {
    throw new Error(`jsEnv adapter 缺少必要方法：${missing.join(', ')}`);
  }
}

function createJsEnvRuntime(options = {}) {
  const adapter = loadJsEnvAdapter(options);
  assertAdapter(adapter);
  let runtimeState = null;

  return {
    name: 'jsEnv',

    async initialize(fixture = {}) {
      runtimeState = await adapter.initialize({
        fixture,
        options,
      });
      return runtimeState;
    },

    async load(sourceCode, meta = {}) {
      if (!runtimeState) throw new Error('jsEnv runtime 尚未初始化');
      return adapter.load(runtimeState, String(sourceCode), meta);
    },

    async call(entry, args = []) {
      if (!runtimeState) throw new Error('jsEnv runtime 尚未初始化');
      return adapter.call(runtimeState, entry, args);
    },

    async dispose() {
      if (adapter.dispose && runtimeState) {
        await adapter.dispose(runtimeState);
      }
      runtimeState = null;
    },
  };
}

module.exports = { createJsEnvRuntime };
