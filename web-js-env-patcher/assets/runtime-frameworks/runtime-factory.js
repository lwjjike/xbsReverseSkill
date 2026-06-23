// runtime 工厂模板：根据用户确认的补环境框架选择加载对应 runtime。
// 未选择框架时默认 none；不要因为 Trace 复杂度高而自动切换到 isolated-vm、vm 或 jsEnv。
'use strict';

function normalizeRuntimeMode(mode) {
  const value = String(mode || 'none').trim().toLowerCase();
  if (value === 'isolated-vm' || value === 'isolated_vm' || value === 'ivm') return 'isolated-vm';
  if (value === 'vm' || value === 'node-vm' || value === 'nodejs-vm') return 'vm';
  if (value === 'jsenv' || value === 'js-env' || value === 'js_env') return 'jsEnv';
  return 'none';
}

function createRuntime(options = {}) {
  const mode = normalizeRuntimeMode(options.mode);

  if (mode === 'isolated-vm') {
    const { createIsolatedVmRuntime } = require('./isolated-vm-runtime');
    return createIsolatedVmRuntime(options);
  }

  if (mode === 'vm') {
    const { createVmRuntime } = require('./vm-runtime');
    return createVmRuntime(options);
  }

  if (mode === 'jsEnv') {
    const { createJsEnvRuntime } = require('./jsenv-runtime');
    return createJsEnvRuntime(options);
  }

  const { createNoFrameworkRuntime } = require('./no-framework-runtime');
  return createNoFrameworkRuntime(options);
}

module.exports = {
  createRuntime,
  normalizeRuntimeMode,
};
