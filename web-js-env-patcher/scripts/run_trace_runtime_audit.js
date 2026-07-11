#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { contractHash } = require('./check_trace_runtime_conformance');

function parseArgs(argv) {
  const args = {
    caseDir: '',
    entry: '',
    contract: '',
    out: '',
    timeoutMs: 120000,
    json: false,
    markdown: false,
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--case-dir' || arg === '--case' || arg === '-d') args.caseDir = argv[++i] || '';
    else if (arg === '--entry') args.entry = argv[++i] || '';
    else if (arg === '--contract') args.contract = argv[++i] || '';
    else if (arg === '--out') args.out = argv[++i] || '';
    else if (arg === '--timeout-ms') args.timeoutMs = Number(argv[++i] || args.timeoutMs);
    else if (arg === '--json') args.json = true;
    else if (arg === '--markdown') args.markdown = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`未知参数：${arg}`);
  }
  if (!args.json && !args.markdown) args.markdown = true;
  return args;
}

function usage() {
  return `用法：
  node scripts/run_trace_runtime_audit.js --case-dir case --entry case/result/final.js --markdown
  node scripts/run_trace_runtime_audit.js --case-dir case --entry case/result/final.py --timeout-ms 180000 --json

说明：在强制 no-send 模式下运行项目审计入口。入口必须读取 WEB_JS_ENV_PATCHER_TRACE_AUDIT_OUT 并写出 observations；本脚本负责绑定 contractHash、runtimeSourceHash 和 probeVersion。`;
}

function exists(file) {
  try { return fs.existsSync(file); } catch { return false; }
}

function stat(file) {
  try { return fs.statSync(file); } catch { return null; }
}

function walk(root, out = []) {
  if (!exists(root)) return out;
  const st = stat(root);
  if (!st) return out;
  if (st.isFile()) {
    out.push(root);
    return out;
  }
  if (!st.isDirectory()) return out;
  for (const name of fs.readdirSync(root)) walk(path.join(root, name), out);
  return out;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function runtimeSourceHash(resultDir) {
  const entries = [];
  for (const file of walk(resultDir)) {
    const relative = (path.relative(resultDir, file) || '.').replace(/\\/g, '/');
    if (/(^|\/)(node_modules|dist|build|coverage|tmp)(\/|$)/i.test(relative)) continue;
    if (!/\.(js|mjs|cjs|ts|py|json)$/i.test(file)) continue;
    entries.push([relative, sha256(fs.readFileSync(file))]);
  }
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  return sha256(JSON.stringify(entries));
}

function resolveCommand(entry) {
  if (/\.py$/i.test(entry)) return { command: process.env.PYTHON || 'python', args: [entry, '--audit-only'] };
  return { command: process.execPath, args: [entry, '--audit-only'] };
}

function normalizeObservations(raw) {
  if (Array.isArray(raw)) return raw;
  for (const key of ['observations', 'items', 'events', 'apis']) {
    if (Array.isArray(raw && raw[key])) return raw[key];
  }
  return [];
}

function runAudit(args) {
  const caseDir = path.resolve(args.caseDir || '.');
  const resultDir = path.join(caseDir, 'result');
  const entry = path.resolve(args.entry || path.join(resultDir, 'final.js'));
  const contractPath = path.resolve(args.contract || path.join(caseDir, 'notes', 'trace-runtime-contract.json'));
  const out = path.resolve(args.out || path.join(caseDir, 'tmp', 'node-trace-runtime-audit.json'));
  if (!exists(entry)) throw new Error(`审计入口不存在：${entry}`);
  if (!exists(contractPath)) throw new Error(`Trace runtime contract 不存在：${contractPath}`);
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8').replace(/^\uFEFF/, ''));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  try { if (exists(out)) fs.rmSync(out); } catch {}

  const command = resolveCommand(entry);
  const env = {
    ...process.env,
    WEB_JS_ENV_PATCHER_AUDIT_ONLY: '1',
    WEB_JS_ENV_PATCHER_NO_NETWORK: '1',
    WEB_JS_ENV_PATCHER_NETWORK_MODE: 'no-send',
    WEB_JS_ENV_PATCHER_TRACE_CONTRACT: contractPath,
    WEB_JS_ENV_PATCHER_TRACE_AUDIT_OUT: out,
  };
  const child = spawnSync(command.command, command.args, {
    cwd: resultDir,
    env,
    encoding: 'utf8',
    timeout: Number.isFinite(args.timeoutMs) && args.timeoutMs > 0 ? args.timeoutMs : 120000,
    windowsHide: true,
  });
  const problems = [];
  if (child.error) problems.push(`审计入口执行失败：${child.error.message}`);
  if (child.status !== 0) problems.push(`审计入口退出码不是 0：${child.status}; stderr=${String(child.stderr || '').slice(0, 1000)}`);
  if (!exists(out)) problems.push(`审计入口没有写出 ${out}`);
  if (problems.length) {
    return { clean: false, caseDir, entry, contractPath, out, command, problems, stdout: child.stdout || '', stderr: child.stderr || '' };
  }

  let raw;
  try { raw = JSON.parse(fs.readFileSync(out, 'utf8').replace(/^\uFEFF/, '')); }
  catch (err) {
    return { clean: false, caseDir, entry, contractPath, out, command, problems: [`Node audit 无法解析：${err.message}`], stdout: child.stdout || '', stderr: child.stderr || '' };
  }
  const observations = normalizeObservations(raw);
  if (!observations.length) problems.push('Node audit 没有 observations / items / events');
  const networkAttempts = Number(raw.networkAttempts || raw.realNetworkRequests || 0);
  if (networkAttempts > 0) problems.push(`audit-only 阶段检测到 ${networkAttempts} 次真实网络尝试`);
  const audit = {
    schemaVersion: 'node-trace-runtime-audit/v2',
    generatedBy: 'run_trace_runtime_audit.js',
    generatedAt: new Date().toISOString(),
    baselineId: contract.baselineId || raw.baselineId || '',
    contractHash: contractHash(contract),
    traceSourceHash: contract.traceSourceHash || '',
    runtimeSourceHash: runtimeSourceHash(resultDir),
    probeVersion: raw.probeVersion || 'runtime-audit/v2',
    networkMode: 'no-send',
    networkAttempts,
    observations,
    runtimeMeta: raw.runtimeMeta || {},
  };
  fs.writeFileSync(out, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  return {
    clean: problems.length === 0,
    caseDir,
    entry,
    contractPath,
    out,
    command,
    problems,
    audit: {
      observationCount: observations.length,
      contractHash: audit.contractHash,
      runtimeSourceHash: audit.runtimeSourceHash,
      networkAttempts,
    },
    stdout: child.stdout || '',
    stderr: child.stderr || '',
  };
}

function renderMarkdown(result) {
  const lines = [
    '# Node Trace-runtime audit 执行结果',
    '',
    `- 入口：${result.entry}`,
    `- contract：${result.contractPath}`,
    `- audit：${result.out}`,
    `- 是否通过：${result.clean ? '是' : '否'}`,
  ];
  if (result.audit) {
    lines.push(`- 观测项：${result.audit.observationCount}`);
    lines.push(`- contractHash：${result.audit.contractHash}`);
    lines.push(`- runtimeSourceHash：${result.audit.runtimeSourceHash}`);
    lines.push(`- 真实网络尝试：${result.audit.networkAttempts}`);
  }
  if (result.problems.length) {
    lines.push('', '## 问题');
    for (const problem of result.problems) lines.push(`- ${problem}`);
  }
  return `${lines.join('\n')}\n`;
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv);
    if (args.help) {
      console.log(usage());
      process.exit(0);
    }
    const result = runAudit(args);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    if (args.markdown) process.stdout.write(renderMarkdown(result));
    process.exit(result.clean ? 0 : 1);
  } catch (err) {
    console.error(err.message || String(err));
    console.error(usage());
    process.exit(1);
  }
}

module.exports = { runAudit, runtimeSourceHash };
