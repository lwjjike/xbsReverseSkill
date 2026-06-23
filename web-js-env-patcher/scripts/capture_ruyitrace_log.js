#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

function parseArgs(argv) {
  const args = {
    url: '',
    caseDir: 'case',
    outDir: '',
    profileDir: '',
    ruyitraceHome: '',
    ruyitraceExe: '',
    duration: 60,
    limit: 200000,
    dryRun: false,
    importAfter: false,
    json: false,
    markdown: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i] || '';
    else if (a === '--case-dir' || a === '--dir') args.caseDir = argv[++i] || '';
    else if (a === '--out-dir') args.outDir = argv[++i] || '';
    else if (a === '--profile-dir') args.profileDir = argv[++i] || '';
    else if (a === '--ruyitrace-home') args.ruyitraceHome = argv[++i] || '';
    else if (a === '--ruyitrace-exe') args.ruyitraceExe = argv[++i] || '';
    else if (a === '--duration') args.duration = Number(argv[++i] || '60');
    else if (a === '--limit') args.limit = Number(argv[++i] || '200000');
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--import-after') args.importAfter = true;
    else if (a === '--json') args.json = true;
    else if (a === '--markdown') args.markdown = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`未知参数：${a}`);
  }
  if (!args.json && !args.markdown) args.markdown = true;
  if (!Number.isFinite(args.duration) || args.duration <= 0) args.duration = 60;
  if (!Number.isFinite(args.limit) || args.limit <= 0) args.limit = 200000;
  return args;
}

function usage() {
  return `用法：
  node scripts/capture_ruyitrace_log.js --url <target-page-url> --case-dir case --ruyitrace-home <RuyiTrace-dir> --markdown
  node scripts/capture_ruyitrace_log.js --url <target-page-url> --case-dir case --duration 90 --import-after --markdown
  node scripts/capture_ruyitrace_log.js --url <target-page-url> --case-dir case --dry-run --json

说明：确认 RuyiTrace 已安装后，优先使用随 RuyiTrace 提供的 trace Firefox 和 MOZ_DOM_TRACE 环境变量自动捕获 NDJSON。自动捕获失败、需要登录/验证码/权限交互、或目标路径未覆盖时，才要求用户手动协助。`;
}

function exists(p) {
  try { return !!p && fs.existsSync(p); } catch { return false; }
}

function isDir(p) {
  try { return !!p && fs.statSync(p).isDirectory(); } catch { return false; }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function run(cmd, args, timeout = 8000) {
  const ret = spawnSync(cmd, args, { encoding: 'utf8', timeout, windowsHide: true });
  return { ok: ret.status === 0, stdout: ret.stdout || '', stderr: ret.stderr || '' };
}

function whereCommand(name) {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const ret = run(cmd, [name]);
  return ret.ok ? ret.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) : [];
}

function normalizeTraceHome(args) {
  if (args.ruyitraceHome) return path.resolve(args.ruyitraceHome);
  if (args.ruyitraceExe) return path.dirname(path.resolve(args.ruyitraceExe));
  if (process.env.RUYI_TRACE_HOME) return path.resolve(process.env.RUYI_TRACE_HOME);
  if (process.env.RUYITRACE_HOME) return path.resolve(process.env.RUYITRACE_HOME);
  const found = whereCommand(process.platform === 'win32' ? 'RuyiTrace.exe' : 'RuyiTrace');
  return found.length ? path.dirname(found[0]) : '';
}

function detectRuyiTrace(args) {
  const home = normalizeTraceHome(args);
  const exeName = process.platform === 'win32' ? 'RuyiTrace.exe' : 'RuyiTrace';
  const exe = args.ruyitraceExe ? path.resolve(args.ruyitraceExe) : (home ? path.join(home, exeName) : '');
  const firefoxExe = home ? path.join(home, 'firefox', process.platform === 'win32' ? 'firefox.exe' : 'firefox') : '';
  const marker = home ? path.join(home, 'firefox', 'RUYI_DOMTRACE.txt') : '';
  const installed = exists(exe) && exists(firefoxExe) && exists(marker);
  return {
    installed,
    home,
    exe,
    exeExists: exists(exe),
    firefoxExe,
    firefoxExists: exists(firefoxExe),
    marker,
    markerExists: exists(marker),
    reason: installed ? '' : 'RuyiTrace 不完整：需要 RuyiTrace 可执行文件、firefox 可执行文件以及 firefox/RUYI_DOMTRACE.txt',
  };
}

function timestamp() {
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
}

function buildPlan(args, trace) {
  const caseDir = path.resolve(args.caseDir || 'case');
  const outDir = path.resolve(args.outDir || path.join(caseDir, 'ruyi-trace', 'logs'));
  const profileDir = path.resolve(args.profileDir || path.join(caseDir, 'tmp', 'ruyitrace-profile'));
  const traceFile = path.join(outDir, `trace-${timestamp()}.ndjson`);
  const firefoxArgs = ['-no-remote', '-new-instance', '-profile', profileDir];
  if (args.url) firefoxArgs.push(args.url);
  return {
    caseDir,
    outDir,
    profileDir,
    traceFile,
    firefoxExe: trace.firefoxExe,
    firefoxArgs,
    env: {
      MOZ_DOM_TRACE: '1',
      MOZ_DOM_TRACE_FILE: traceFile,
      MOZ_DOM_TRACE_LIMIT: String(args.limit),
      MOZ_DISABLE_LAUNCHER_PROCESS: '1',
    },
  };
}

function listNdjsonFiles(dir, sinceMs) {
  if (!isDir(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.ndjson'))
    .map((name) => path.join(dir, name))
    .filter((file) => {
      try { return fs.statSync(file).mtimeMs >= sinceMs - 1000; } catch { return false; }
    })
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    child.once('exit', (code, signal) => finish({ exited: true, code, signal }));
    setTimeout(() => finish({ exited: false, code: null, signal: null }), timeoutMs).unref();
  });
}

function importLog(caseDir, file, markdown) {
  const script = path.join(__dirname, 'import_ruyitrace_log.js');
  const args = [script, '--input', file, '--case-dir', caseDir, '--truncation-threshold', '3900', markdown ? '--markdown' : '--json'];
  const ret = spawnSync(process.execPath, args, { encoding: 'utf8', windowsHide: true });
  return { ok: ret.status === 0, status: ret.status, stdout: ret.stdout || '', stderr: ret.stderr || '' };
}

async function capture(args, plan) {
  ensureDir(plan.outDir);
  ensureDir(plan.profileDir);
  const startedAt = Date.now();
  const child = spawn(plan.firefoxExe, plan.firefoxArgs, {
    env: { ...process.env, ...plan.env },
    stdio: 'ignore',
    windowsHide: false,
  });
  const result = {
    launched: true,
    pid: child.pid,
    waitedSeconds: args.duration,
    killAttempted: false,
    exit: null,
    logs: [],
    importResult: null,
  };
  child.on('error', (err) => { result.launchError = err.message || String(err); });
  await wait(args.duration * 1000);
  const exitBeforeKill = await waitForExit(child, 200);
  if (!exitBeforeKill.exited) {
    result.killAttempted = true;
    try { child.kill(); } catch (err) { result.killError = err.message || String(err); }
    result.exit = await waitForExit(child, 3000);
  } else {
    result.exit = exitBeforeKill;
  }
  result.logs = listNdjsonFiles(plan.outDir, startedAt);
  if (args.importAfter && result.logs.length) {
    result.importResult = importLog(plan.caseDir, result.logs[0], args.markdown);
  }
  return result;
}

function renderMarkdown(obj) {
  const { args, trace, plan, result } = obj;
  const lines = ['# RuyiTrace 自动捕获日志', ''];
  lines.push(`- RuyiTrace 检测结果：${trace.installed ? '通过' : '不通过'}`);
  if (trace.home) lines.push(`- RuyiTrace 目录：${trace.home}`);
  if (trace.exe) lines.push(`- RuyiTrace 可执行文件：${trace.exeExists ? '存在' : '不存在'} - ${trace.exe}`);
  if (trace.firefoxExe) lines.push(`- trace Firefox：${trace.firefoxExists ? '存在' : '不存在'} - ${trace.firefoxExe}`);
  if (trace.marker) lines.push(`- trace 标志文件：${trace.markerExists ? '存在' : '不存在'} - ${trace.marker}`);
  if (trace.reason) lines.push(`- 原因：${trace.reason}`);
  lines.push('', '## 自动捕获计划');
  lines.push(`- 目标页面：${args.url || '未提供'}`);
  lines.push(`- 输出目录：${plan.outDir}`);
  lines.push(`- Profile 目录：${plan.profileDir}`);
  lines.push(`- 计划 trace 文件：${plan.traceFile}`);
  lines.push(`- 采集时长：${args.duration} 秒`);
  lines.push(`- DOM trace 行数上限：${args.limit}`);
  lines.push(`- 启动参数：${[plan.firefoxExe].concat(plan.firefoxArgs).join(' ')}`);
  lines.push('- 环境变量：MOZ_DOM_TRACE=1，MOZ_DOM_TRACE_FILE=<case trace file>，MOZ_DOM_TRACE_LIMIT=<limit>，MOZ_DISABLE_LAUNCHER_PROCESS=1');
  if (args.dryRun) {
    lines.push('', '## Dry-run 结果');
    lines.push('- 未启动浏览器，未创建日志文件。');
    if (trace.installed) {
      lines.push('- RuyiTrace 检测通过且用户授权后，应优先执行本脚本自动捕获 NDJSON，而不是默认等待用户手动 trace。');
    } else {
      lines.push('- RuyiTrace 检测未通过，不能进入自动捕获；应先让用户安装 / 提供 RuyiTrace 路径，或明确确认降级为仅 ruyiPage。');
    }
    return lines.join('\n') + '\n';
  }
  lines.push('', '## 捕获结果');
  if (result.launchError) lines.push(`- 启动错误：${result.launchError}`);
  lines.push(`- 是否已启动：${result.launched ? '是' : '否'}`);
  if (result.pid) lines.push(`- 进程 PID：${result.pid}`);
  lines.push(`- 是否尝试结束进程：${result.killAttempted ? '是' : '否'}`);
  lines.push(`- 发现 NDJSON 数量：${result.logs.length}`);
  for (const file of result.logs) lines.push(`  - ${file}`);
  if (!result.logs.length) {
    lines.push('- 未发现 NDJSON：应检查 RuyiTrace trace Firefox 是否能写入日志、目标页面是否触发了环境访问、是否需要登录/验证码/权限交互；自动捕获失败后才要求用户手动协助采集。');
  }
  if (result.importResult) {
    lines.push('', '## 导入结果');
    lines.push(`- 导入是否成功：${result.importResult.ok ? '是' : '否'}`);
    if (result.importResult.stdout.trim()) lines.push('', '```text', result.importResult.stdout.trim(), '```');
    if (result.importResult.stderr.trim()) lines.push('', '```text', result.importResult.stderr.trim(), '```');
  }
  return lines.join('\n') + '\n';
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.url) throw new Error('缺少 --url；自动捕获需要目标页面 URL。');
  const trace = detectRuyiTrace(args);
  const plan = buildPlan(args, trace);
  if (!trace.installed) {
    const obj = { args, trace, plan, result: { launched: false, logs: [] } };
    if (args.json) process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
    if (args.markdown) process.stdout.write(renderMarkdown(obj));
    process.exitCode = 2;
    return;
  }
  if (args.dryRun) {
    const obj = { args, trace, plan, result: { launched: false, logs: [] } };
    if (args.json) process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
    if (args.markdown) process.stdout.write(renderMarkdown(obj));
    return;
  }
  const result = await capture(args, plan);
  const obj = { args, trace, plan, result };
  if (args.json) process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  if (args.markdown) process.stdout.write(renderMarkdown(obj));
  if (!result.logs.length) process.exitCode = 3;
}

main().catch((err) => {
  console.error(err.message || String(err));
  console.error(usage());
  process.exit(1);
});
