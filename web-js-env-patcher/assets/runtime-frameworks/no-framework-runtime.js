// 默认 runtime 模板：不使用 isolated-vm、vm 或 jsEnv 框架。
// 复制到最终项目前，应先完成 Node 泄露阻断，并由 installEnv 安装浏览器环境对象。
'use strict';

function createNoFrameworkRuntime(options = {}) {
  const globalObject = options.globalObject || globalThis;
  const installEnv = options.installEnv || function installEnv() {};
  const loadTarget = options.loadTarget || function loadTarget() {};

  return {
    name: 'none',

    async initialize(fixture = {}) {
      // 在当前受控全局对象上安装补环境，字段值来自 fixture 和取证样本
      await installEnv(globalObject, fixture, options);
      return globalObject;
    },

    async load(sourceCode, meta = {}) {
      // 不使用框架时由调用方提供安全加载逻辑，不在模板中暴露 require/process
      return loadTarget(globalObject, sourceCode, meta);
    },

    async call(entry, args = []) {
      const fn = typeof entry === 'function' ? entry : globalObject[entry];
      if (typeof fn !== 'function') {
        throw new TypeError(`入口函数不存在：${String(entry)}`);
      }
      return fn.apply(globalObject, args);
    },

    async dispose() {
      // 默认模式没有额外 isolate 资源需要释放
    },
  };
}

module.exports = { createNoFrameworkRuntime };
