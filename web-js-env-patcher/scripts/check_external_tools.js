#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

function parseArgs(argv) {
  const args = {
    python: '',
    ruyitraceHome: '',
    ruyitraceExe: '',
    ruyiPageInstallDir: '',
    ruyiPageBrowserPath: '',
    cloakBrowserProjectDir: '',
    cloakBrowserBinaryPath: '',
    camoufoxInstallDir: '',
    camoufoxMcpProjectDir: '',
    requireCloakBrowser: false,
    requireCamoufox: false,
    requireCamoufoxMcp: false,
    json: false,
    markdown: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--python') args.python = argv[++i] || '';
    else if (a === '--ruyitrace-home') args.ruyitraceHome = argv[++i] || '';
    else if (a === '--ruyitrace-exe') args.ruyitraceExe = argv[++i] || '';
    else if (a === '--ruyipage-install-dir') args.ruyiPageInstallDir = argv[++i] || '';
    else if (a === '--ruyipage-browser-path') args.ruyiPageBrowserPath = argv[++i] || '';
    else if (a === '--cloakbrowser-project-dir') args.cloakBrowserProjectDir = argv[++i] || '';
    else if (a === '--cloakbrowser-binary-path') args.cloakBrowserBinaryPath = argv[++i] || '';
    else if (a === '--camoufox-install-dir') args.camoufoxInstallDir = argv[++i] || '';
    else if (a === '--camoufox-mcp-project-dir') args.camoufoxMcpProjectDir = argv[++i] || '';
    else if (a === '--require-cloakbrowser') args.requireCloakBrowser = true;
    else if (a === '--require-camoufox') args.requireCamoufox = true;
    else if (a === '--require-camoufox-mcp') args.requireCamoufoxMcp = true;
    else if (a === '--json') args.json = true;
    else if (a === '--markdown') args.markdown = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`未知参数：${a}`);
  }
  if (args.requireCamoufoxMcp) args.requireCamoufox = true;
  if (!args.json && !args.markdown) args.markdown = true;
  return args;
}

function usage() {
  return `用法：
  node scripts/check_external_tools.js --markdown
  node scripts/check_external_tools.js --python python --ruyipage-install-dir <ruyipage-browsers-dir> --markdown
  node scripts/check_external_tools.js --python python --ruyipage-browser-path <firefox.exe> --ruyitrace-home <RuyiTrace-dir> --json
  node scripts/check_external_tools.js --require-cloakbrowser --cloakbrowser-project-dir <node-project-dir> --markdown
  node scripts/check_external_tools.js --python python --require-cloakbrowser --cloakbrowser-binary-path <chromium-or-chrome-path> --json
  node scripts/check_external_tools.js --python python --require-camoufox --camoufox-install-dir <camoufox-cache-dir> --markdown
  node scripts/check_external_tools.js --python python --require-camoufox --require-camoufox-mcp --camoufox-mcp-project-dir <camoufox-reverse-mcp-dir> --json

说明：检测 ruyiPage Python 包、ruyiPage 定制 Firefox runtime、是否误用系统 Firefox fallback、RuyiTrace 目录结构，以及 CloakBrowser Python / Node.js 包和 stealth Chromium 二进制状态，以及 Camoufox Python 包、浏览器本体 fetch 状态和 camoufox-reverse-mcp 可导入状态。
注意：选择 ruyiPage 时，只有“ruyiPage 包可用 + 定制 Firefox runtime 验证通过”才视为可用；普通系统 Firefox fallback 不视为通过。`;
}

function exists(p) {
  try { return !!p && fs.existsSync(p); } catch { return false; }
}

function isDir(p) {
  try { return !!p && fs.statSync(p).isDirectory(); } catch { return false; }
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch (err) { return { __parseError: err.message || String(err) }; }
}

function run(cmd, args, timeout = 15000, options = {}) {
  const ret = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout,
    windowsHide: true,
    cwd: options.cwd || undefined,
    env: options.env ? { ...process.env, ...options.env } : undefined,
  });
  return {
    ok: ret.status === 0,
    status: ret.status,
    stdout: (ret.stdout || '').trim(),
    stderr: (ret.stderr || '').trim(),
    error: ret.error ? ret.error.message : '',
    command: [cmd].concat(args).join(' '),
  };
}

function pythonCandidates(explicit) {
  const out = [];
  if (explicit) out.push({ cmd: explicit, argsPrefix: [] });
  out.push({ cmd: 'python', argsPrefix: [] });
  out.push({ cmd: 'python3', argsPrefix: [] });
  out.push({ cmd: 'py', argsPrefix: ['-3'] });
  const seen = new Set();
  return out.filter(x => {
    const k = x.cmd + ' ' + x.argsPrefix.join(' ');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function normalizePath(p) {
  if (!p) return '';
  try { return path.resolve(p); } catch { return p; }
}

function samePath(a, b) {
  if (!a || !b) return false;
  const ra = normalizePath(a);
  const rb = normalizePath(b);
  return process.platform === 'win32' ? ra.toLowerCase() === rb.toLowerCase() : ra === rb;
}

function unique(items) {
  const seen = new Set();
  const out = [];
  for (const item of items.filter(Boolean)) {
    const k = process.platform === 'win32' ? String(item).toLowerCase() : String(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function detectRuyiPagePackage(explicitPython) {
  const code = [
    'import json',
    'try:',
    ' import ruyipage',
    ' try:',
    '  import requests',
    '  requests_ok=True',
    '  requests_error=""',
    ' except Exception as re:',
    '  requests_ok=False',
    '  requests_error=str(re)',
    ' print(json.dumps({"ok": True, "version": getattr(ruyipage, "__version__", ""), "requests_ok": requests_ok, "requests_error": requests_error}, ensure_ascii=False))',
    'except Exception as e:',
    ' print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))',
  ].join('\n');

  const checked = [];
  for (const c of pythonCandidates(explicitPython)) {
    const ret = run(c.cmd, c.argsPrefix.concat(['-c', code]));
    checked.push({ python: [c.cmd].concat(c.argsPrefix).join(' '), ok: ret.ok, stderr: ret.stderr || ret.error });
    if (!ret.ok) continue;
    let parsed = null;
    try { parsed = JSON.parse(ret.stdout.replace(/^\uFEFF/, '')); } catch { parsed = null; }
    if (parsed && parsed.ok) {
      return {
        packageInstalled: true,
        installed: true,
        python: c.cmd,
        pythonArgsPrefix: c.argsPrefix,
        version: parsed.version || '',
        requestsAvailable: !!parsed.requests_ok,
        requestsError: parsed.requests_error || '',
        checked,
      };
    }
  }
  return {
    packageInstalled: false,
    installed: false,
    requestsAvailable: false,
    requestsError: '',
    reason: '未检测到可 import ruyipage 的 Python 环境',
    checked,
  };
}

function getDefaultRuyiBrowsersDirs(explicitInstallDir) {
  const dirs = [];
  if (explicitInstallDir) dirs.push(path.resolve(explicitInstallDir));
  if (process.env.RUYIPAGE_BROWSERS_PATH) dirs.push(path.resolve(process.env.RUYIPAGE_BROWSERS_PATH));
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    dirs.push(path.join(base, 'ruyipage', 'browsers'));
  } else if (process.platform === 'darwin') {
    dirs.push(path.join(os.homedir(), 'Library', 'Caches', 'ruyipage', 'browsers'));
  } else {
    const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
    dirs.push(path.join(base, 'ruyipage', 'browsers'));
  }
  return unique(dirs);
}

function executableName() {
  return process.platform === 'win32' ? 'firefox.exe' : 'firefox';
}

function normalizeExecutableInput(input) {
  if (!input) return '';
  const p = path.resolve(input);
  if (isDir(p)) {
    const candidates = [
      path.join(p, 'firefox', executableName()),
      path.join(p, executableName()),
    ];
    for (const c of candidates) if (exists(c)) return c;
  }
  return p;
}

function findInstallJsonNearExecutable(exe) {
  const checked = [];
  let cur = path.dirname(path.resolve(exe));
  for (let i = 0; i < 8; i++) {
    const file = path.join(cur, 'install.json');
    checked.push(file);
    if (exists(file)) {
      const json = readJson(file);
      return { installJsonPath: file, installRoot: cur, installJson: json, checked };
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return { installJsonPath: '', installRoot: '', installJson: null, checked };
}

function findExecutablesFromInstallRoot(root) {
  const out = [];
  const installJsonPath = path.join(root, 'install.json');
  if (exists(installJsonPath)) {
    const json = readJson(installJsonPath);
    if (json && !json.__parseError && json.executable) out.push(path.join(root, json.executable));
    out.push(path.join(root, 'firefox', executableName()));
  }
  return unique(out);
}

function scanInstallDir(installDir) {
  const root = path.resolve(installDir);
  const candidates = [];
  for (const exe of findExecutablesFromInstallRoot(root)) candidates.push(exe);
  if (isDir(root)) {
    let entries = [];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { entries = []; }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const sub = path.join(root, ent.name);
      for (const exe of findExecutablesFromInstallRoot(sub)) candidates.push(exe);
    }
  }
  return unique(candidates);
}

function verifyRuyiRuntimeCandidate(label, executablePath) {
  const exe = normalizeExecutableInput(executablePath);
  const ret = {
    label,
    executable: exe,
    executableExists: exists(exe),
    installJsonPath: '',
    installJsonExists: false,
    installRoot: '',
    installJsonValid: false,
    runtimeName: '',
    runtimeVersion: '',
    runtimeRelease: '',
    runtimeAsset: '',
    runtimePlatform: '',
    executableDeclared: '',
    executableMatchesInstallJson: false,
    releaseLooksRuyi: false,
    assetLooksFirefox: false,
    pathLooksSystemFirefox: false,
    managedRuntimeInstalled: false,
    managedRuntimeVerified: false,
    isSystemFirefoxFallback: false,
    reason: '',
  };

  if (!exe) {
    ret.reason = '未提供 Firefox 可执行文件路径';
    return ret;
  }

  const lowered = exe.toLowerCase().replace(/\\/g, '/');
  ret.pathLooksSystemFirefox = /mozilla firefox\/firefox(\.exe)?$/.test(lowered)
    || lowered === '/usr/bin/firefox'
    || lowered === '/usr/local/bin/firefox'
    || lowered === '/snap/bin/firefox'
    || lowered.endsWith('/applications/firefox.app/contents/macos/firefox');

  if (!ret.executableExists) {
    ret.reason = 'Firefox 可执行文件不存在';
    return ret;
  }

  const near = findInstallJsonNearExecutable(exe);
  ret.installJsonPath = near.installJsonPath;
  ret.installRoot = near.installRoot;
  ret.installJsonExists = !!near.installJsonPath;

  if (!near.installJsonPath) {
    ret.isSystemFirefoxFallback = true;
    ret.reason = ret.pathLooksSystemFirefox
      ? '检测到普通系统 Firefox 路径；不是 ruyiPage managed runtime'
      : '未在 Firefox 路径上级目录找到 ruyiPage install.json，不能证明是定制 Firefox runtime';
    return ret;
  }

  const json = near.installJson;
  if (!json || json.__parseError) {
    ret.reason = `install.json 无法解析：${json && json.__parseError ? json.__parseError : '未知错误'}`;
    return ret;
  }

  ret.installJsonValid = true;
  ret.runtimeName = String(json.name || '');
  ret.runtimeVersion = String(json.version || '');
  ret.runtimeRelease = String(json.release || json.tag || '');
  ret.runtimeAsset = String(json.asset || '');
  ret.runtimePlatform = String(json.platform || '');
  ret.executableDeclared = json.executable ? path.join(near.installRoot, String(json.executable)) : '';
  ret.executableMatchesInstallJson = ret.executableDeclared ? samePath(ret.executableDeclared, exe) : false;

  const textForRuyi = [ret.runtimeRelease, ret.runtimeAsset, path.basename(near.installRoot)].join(' ');
  ret.releaseLooksRuyi = /ruyi/i.test(textForRuyi);
  ret.assetLooksFirefox = /firefox/i.test(ret.runtimeAsset || exe);
  ret.managedRuntimeInstalled = ret.installJsonValid && ret.executableExists;
  ret.managedRuntimeVerified = ret.managedRuntimeInstalled
    && ret.releaseLooksRuyi
    && ret.assetLooksFirefox
    && (!ret.executableDeclared || ret.executableMatchesInstallJson);
  ret.isSystemFirefoxFallback = !ret.managedRuntimeVerified;

  if (ret.managedRuntimeVerified) ret.reason = '已验证为 ruyiPage 定制 Firefox managed runtime';
  else if (!ret.releaseLooksRuyi) ret.reason = 'install.json 存在，但 release/asset/目录名未体现 ruyi 定制标识，不视为定制 Firefox';
  else if (ret.executableDeclared && !ret.executableMatchesInstallJson) ret.reason = 'Firefox 路径与 install.json 中声明的 executable 不一致';
  else ret.reason = 'runtime 结构不完整，不能验证为 ruyiPage 定制 Firefox';
  return ret;
}

function runtimePathFromRuyiPage(pkg, args) {
  if (!pkg.packageInstalled) return { defaultRuntimePath: '', defaultRuntimePathExists: false, pathCommandOk: false, pathCommandOutput: '', pathCommandError: '' };
  const pathArgs = ['-m', 'ruyipage', 'path'];
  if (args.ruyiPageInstallDir) pathArgs.push('--install-dir', args.ruyiPageInstallDir);
  const pathRet = run(pkg.python, pkg.pythonArgsPrefix.concat(pathArgs), 20000);
  const lines = (pathRet.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const last = lines.length ? lines[lines.length - 1] : '';
  return {
    defaultRuntimePath: pathRet.ok ? last : '',
    defaultRuntimePathExists: pathRet.ok && exists(last),
    pathCommandOk: pathRet.ok,
    pathCommandOutput: pathRet.stdout,
    pathCommandError: pathRet.stderr || pathRet.error,
    pathCommand: pathRet.command,
  };
}

function ruyiPageDoctor(pkg, args) {
  if (!pkg.packageInstalled) return { doctorOk: false, doctorJsonOk: false, doctorOutput: '', doctorJson: null };
  const baseArgs = ['-m', 'ruyipage', 'doctor'];
  if (args.ruyiPageInstallDir) baseArgs.push('--install-dir', args.ruyiPageInstallDir);
  const jsonRet = run(pkg.python, pkg.pythonArgsPrefix.concat(baseArgs, ['--json']), 20000);
  let doctorJson = null;
  try { doctorJson = JSON.parse((jsonRet.stdout || '').replace(/^\uFEFF/, '')); } catch { doctorJson = null; }
  if (jsonRet.ok && doctorJson) return { doctorOk: true, doctorJsonOk: true, doctorOutput: jsonRet.stdout, doctorJson };
  const ret = run(pkg.python, pkg.pythonArgsPrefix.concat(baseArgs), 20000);
  return { doctorOk: ret.ok, doctorJsonOk: false, doctorOutput: ret.stdout || ret.stderr || jsonRet.stderr || '', doctorJson: null };
}

function detectRuyiPage(args) {
  const pkg = detectRuyiPagePackage(args.python);
  const defaultPath = runtimePathFromRuyiPage(pkg, args);
  const doctor = ruyiPageDoctor(pkg, args);
  const checks = [];

  if (args.ruyiPageBrowserPath) {
    checks.push(verifyRuyiRuntimeCandidate('用户指定 --ruyipage-browser-path', args.ruyiPageBrowserPath));
  }
  if (process.env.RUYIPAGE_FIREFOX_EXECUTABLE_PATH) {
    checks.push(verifyRuyiRuntimeCandidate('环境变量 RUYIPAGE_FIREFOX_EXECUTABLE_PATH', process.env.RUYIPAGE_FIREFOX_EXECUTABLE_PATH));
  }
  if (process.env.RUYIPAGE_BROWSER_PATH) {
    checks.push(verifyRuyiRuntimeCandidate('环境变量 RUYIPAGE_BROWSER_PATH', process.env.RUYIPAGE_BROWSER_PATH));
  }
  if (defaultPath.defaultRuntimePath) {
    checks.push(verifyRuyiRuntimeCandidate('ruyiPage 默认解析路径（python -m ruyipage path）', defaultPath.defaultRuntimePath));
  }

  for (const dir of getDefaultRuyiBrowsersDirs(args.ruyiPageInstallDir)) {
    for (const exe of scanInstallDir(dir)) {
      checks.push(verifyRuyiRuntimeCandidate(`managed runtime 扫描：${dir}`, exe));
    }
  }

  const dedupedChecks = [];
  const seen = new Set();
  for (const c of checks) {
    const k = (c.executable || '') + '|' + (c.installJsonPath || '') + '|' + c.label;
    if (seen.has(k)) continue;
    seen.add(k);
    dedupedChecks.push(c);
  }

  const verified = dedupedChecks.filter(c => c.managedRuntimeVerified);
  const defaultCheck = dedupedChecks.find(c => c.label.startsWith('ruyiPage 默认解析路径')) || null;
  const explicitCheck = dedupedChecks.find(c => c.label.startsWith('用户指定')) || null;
  const selected = explicitCheck && explicitCheck.managedRuntimeVerified ? explicitCheck
    : (defaultCheck && defaultCheck.managedRuntimeVerified ? defaultCheck : verified[0] || null);
  const defaultIsSystemFallback = !!defaultCheck && !!defaultCheck.executable && !defaultCheck.managedRuntimeVerified;
  const explicitPathNotVerified = !!explicitCheck && !explicitCheck.managedRuntimeVerified;
  const managedRuntimeVerified = !!selected;

  const result = {
    ...pkg,
    packageInstalled: pkg.packageInstalled,
    installed: pkg.packageInstalled,
    defaultRuntimePath: defaultPath.defaultRuntimePath,
    defaultRuntimePathExists: defaultPath.defaultRuntimePathExists,
    pathCommandOk: defaultPath.pathCommandOk,
    pathCommandOutput: defaultPath.pathCommandOutput,
    pathCommandError: defaultPath.pathCommandError,
    doctorOk: doctor.doctorOk,
    doctorJsonOk: doctor.doctorJsonOk,
    doctorOutput: doctor.doctorOutput,
    smartFingerprintDependencyReady: !!pkg.requestsAvailable,
    smartFingerprintDependencyMissing: pkg.packageInstalled && !pkg.requestsAvailable,
    requestsAvailable: !!pkg.requestsAvailable,
    requestsError: pkg.requestsError || '',
    managedRuntimeInstalled: verified.length > 0,
    managedRuntimeVerified,
    defaultRuntimeVerified: !!defaultCheck && defaultCheck.managedRuntimeVerified,
    defaultIsSystemFirefoxFallback: defaultIsSystemFallback,
    explicitBrowserPathVerified: !!explicitCheck && explicitCheck.managedRuntimeVerified,
    explicitBrowserPathNotVerified: explicitPathNotVerified,
    runtimeRelease: selected ? selected.runtimeRelease : '',
    runtimeVersion: selected ? selected.runtimeVersion : '',
    runtimeAsset: selected ? selected.runtimeAsset : '',
    runtimeExecutable: selected ? selected.executable : '',
    runtimeInstallJson: selected ? selected.installJsonPath : '',
    isSystemFirefoxFallback: defaultIsSystemFallback || explicitPathNotVerified || dedupedChecks.some(c => c.isSystemFirefoxFallback && c.executableExists),
    mustInstallManagedRuntime: !managedRuntimeVerified,
    usable: pkg.packageInstalled && managedRuntimeVerified,
    recommendedForAntiDetectionProbe: pkg.packageInstalled && managedRuntimeVerified && !!pkg.requestsAvailable,
    conclusion: '',
    runtimeChecks: dedupedChecks,
    scannedInstallDirs: getDefaultRuyiBrowsersDirs(args.ruyiPageInstallDir),
  };

  if (!pkg.packageInstalled && !managedRuntimeVerified) result.conclusion = '不可使用：未检测到 ruyiPage 包，也未检测到定制 Firefox runtime。';
  else if (!pkg.packageInstalled) result.conclusion = '暂不可使用：已检测到定制 Firefox runtime，但当前 Python 环境未安装 ruyiPage 包。';
  else if (!managedRuntimeVerified) result.conclusion = '不可使用：ruyiPage 包存在，但未验证到 ruyiPage 定制 Firefox runtime；不能把系统 Firefox fallback 当作通过。';
  else if (!pkg.requestsAvailable) result.conclusion = '可启动但不建议取证：ruyiPage 包和定制 Firefox runtime 可用，但缺少 requests，默认 smart_fingerprint 地理探测会失败；请安装 requests 或显式提供 manual_geo。';
  else if (!result.defaultRuntimeVerified && result.runtimeExecutable) result.conclusion = '可使用但需显式指定：ruyiPage 包存在，且找到定制 Firefox runtime；启动时应通过 browser_path / set_browser_path 指向已验证路径。';
  else result.conclusion = '可使用：ruyiPage 包存在，默认解析路径已验证为定制 Firefox runtime。';

  return result;
}

function whereCommand(name) {
  const cmd = process.platform === 'win32' ? 'where' : 'which';
  const ret = run(cmd, [name], 8000);
  return ret.ok ? ret.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
}

function normalizeTraceHome(args) {
  if (args.ruyitraceHome) return path.resolve(args.ruyitraceHome);
  if (args.ruyitraceExe) return path.dirname(path.resolve(args.ruyitraceExe));
  if (process.env.RUYI_TRACE_HOME) return path.resolve(process.env.RUYI_TRACE_HOME);
  if (process.env.RUYITRACE_HOME) return path.resolve(process.env.RUYITRACE_HOME);
  const found = whereCommand(process.platform === 'win32' ? 'RuyiTrace.exe' : 'RuyiTrace');
  if (found.length) return path.dirname(found[0]);
  return '';
}

function detectRuyiTrace(args) {
  const home = normalizeTraceHome(args);
  if (!home) return {
    installed: false,
    reason: '未检测到 RuyiTrace；如已安装，请提供 --ruyitrace-home 或设置 RUYI_TRACE_HOME',
  };
  const exeName = process.platform === 'win32' ? 'RuyiTrace.exe' : 'RuyiTrace';
  const exe = args.ruyitraceExe ? path.resolve(args.ruyitraceExe) : path.join(home, exeName);
  const firefoxExe = process.platform === 'win32' ? path.join(home, 'firefox', 'firefox.exe') : path.join(home, 'firefox', 'firefox');
  const marker = path.join(home, 'firefox', 'RUYI_DOMTRACE.txt');
  return {
    installed: exists(exe) && exists(marker),
    home,
    exe,
    exeExists: exists(exe),
    firefoxExe,
    firefoxExists: exists(firefoxExe),
    marker,
    markerExists: exists(marker),
    reason: exists(exe) && exists(marker) ? '' : 'RuyiTrace 目录不完整：需要 RuyiTrace 可执行文件以及 firefox/RUYI_DOMTRACE.txt',
  };
}



function detectCamoufoxPackage(explicitPython) {
  const code = [
    'import json, importlib.metadata as md',
    'try:',
    ' import camoufox',
    ' from camoufox.sync_api import Camoufox',
    ' async_ok=True',
    ' async_error=""',
    ' try:',
    '  from camoufox.async_api import AsyncCamoufox',
    ' except Exception as ae:',
    '  async_ok=False',
    '  async_error=str(ae)',
    ' version=getattr(camoufox, "__version__", "")',
    ' try:',
    '  version=version or md.version("camoufox")',
    ' except Exception:',
    '  pass',
    ' print(json.dumps({"ok": True, "version": version, "async_ok": async_ok, "async_error": async_error}, ensure_ascii=False))',
    'except Exception as e:',
    ' print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))',
  ].join('\n');

  const checked = [];
  for (const c of pythonCandidates(explicitPython)) {
    const ret = run(c.cmd, c.argsPrefix.concat(['-c', code]), 15000);
    const checkedItem = { python: [c.cmd].concat(c.argsPrefix).join(' '), ok: ret.ok, stderr: ret.stderr || ret.error };
    checked.push(checkedItem);
    if (!ret.ok) continue;
    let parsed = null;
    try { parsed = JSON.parse((ret.stdout || '').replace(/^\uFEFF/, '')); } catch { parsed = null; }
    if (parsed && parsed.ok) {
      return {
        packageInstalled: true,
        installed: true,
        python: c.cmd,
        pythonArgsPrefix: c.argsPrefix,
        version: parsed.version || '',
        syncApiAvailable: true,
        asyncApiAvailable: !!parsed.async_ok,
        asyncApiError: parsed.async_error || '',
        checked,
      };
    }
    if (parsed && parsed.error) checkedItem.error = parsed.error;
  }
  return {
    packageInstalled: false,
    installed: false,
    syncApiAvailable: false,
    asyncApiAvailable: false,
    asyncApiError: '',
    reason: '未检测到可 import camoufox / camoufox.sync_api.Camoufox 的 Python 环境',
    checked,
  };
}

function camoufoxCli(pkg, subcommand, timeout = 20000) {
  if (!pkg.packageInstalled) return { ok: false, stdout: '', stderr: '', error: 'Camoufox Python 包未安装', command: '' };
  return run(pkg.python, (pkg.pythonArgsPrefix || []).concat(['-m', 'camoufox', subcommand]), timeout);
}

function getDefaultCamoufoxDirs(explicitInstallDir) {
  const dirs = [];
  if (explicitInstallDir) dirs.push(path.resolve(explicitInstallDir));
  if (process.env.CAMOUFOX_CACHE_DIR) dirs.push(path.resolve(process.env.CAMOUFOX_CACHE_DIR));
  if (process.env.CAMOUFOX_BROWSER_PATH) {
    const p = path.resolve(process.env.CAMOUFOX_BROWSER_PATH);
    dirs.push(isDir(p) ? p : path.dirname(p));
  }
  if (process.platform === 'win32') {
    const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    dirs.push(path.join(base, 'camoufox', 'camoufox', 'Cache'));
    dirs.push(path.join(base, 'camoufox'));
  } else if (process.platform === 'darwin') {
    dirs.push(path.join(os.homedir(), 'Library', 'Caches', 'camoufox'));
  } else {
    const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
    dirs.push(path.join(base, 'camoufox'));
  }
  return unique(dirs);
}

function looksLikeCamoufoxBinary(p) {
  if (!p) return false;
  const base = path.basename(p).toLowerCase();
  if (process.platform === 'win32') return base === 'camoufox.exe' || base === 'firefox.exe' && /camoufox/i.test(p);
  if (process.platform === 'darwin') return base === 'camoufox.app' || (/camoufox/i.test(p) && base === 'firefox');
  return base === 'camoufox-bin' || base === 'camoufox' || (/camoufox/i.test(p) && base === 'firefox');
}

function scanCamoufoxDir(root, maxEntries = 2000) {
  const out = [];
  const resolved = path.resolve(root);
  if (!exists(resolved)) return out;
  if (!isDir(resolved)) return looksLikeCamoufoxBinary(resolved) ? [resolved] : out;
  const queue = [{ dir: resolved, depth: 0 }];
  let visited = 0;
  while (queue.length && visited < maxEntries) {
    const { dir, depth } = queue.shift();
    visited++;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { entries = []; }
    for (const ent of entries) {
      const child = path.join(dir, ent.name);
      if (looksLikeCamoufoxBinary(child)) out.push(child);
      if (ent.isDirectory() && depth < 5 && !['node_modules', '.git', '__pycache__'].includes(ent.name)) queue.push({ dir: child, depth: depth + 1 });
    }
  }
  return unique(out);
}

function detectCamoufox(args) {
  const pkg = detectCamoufoxPackage(args.python);
  const pathCmd = camoufoxCli(pkg, 'path', 20000);
  const versionCmd = camoufoxCli(pkg, 'version', 20000);
  const listCmd = camoufoxCli(pkg, 'list', 20000);
  const pathLines = (pathCmd.stdout || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const cliBrowserPath = pathCmd.ok && pathLines.length ? pathLines[pathLines.length - 1] : '';
  const cliBrowserPathExists = !!cliBrowserPath && exists(cliBrowserPath);
  const scannedDirs = getDefaultCamoufoxDirs(args.camoufoxInstallDir);
  let scannedBinaries = [];
  for (const dir of scannedDirs) scannedBinaries = scannedBinaries.concat(scanCamoufoxDir(dir));
  scannedBinaries = unique(scannedBinaries);
  const browserFetched = cliBrowserPathExists || scannedBinaries.length > 0;
  const recommendedBrowserPath = cliBrowserPathExists ? cliBrowserPath : (scannedBinaries[0] || '');
  let conclusion = '';
  if (!pkg.packageInstalled && !browserFetched) conclusion = '不可使用：未检测到 Camoufox Python 包，也未检测到 Camoufox 浏览器本体。';
  else if (!pkg.packageInstalled && browserFetched) conclusion = '暂不可使用：检测到疑似 Camoufox 浏览器本体，但当前 Python 环境未安装 camoufox 包；需提供可导入 camoufox 的 Python / venv。';
  else if (pkg.packageInstalled && !browserFetched) conclusion = '可安装但未完成 fetch：Camoufox Python 包存在，但未检测到 `python -m camoufox fetch` 下载的浏览器本体；正式取证前必须先 fetch 或提供缓存目录。';
  else conclusion = '可使用：检测到 Camoufox Python 包和浏览器本体；正式取证仍必须从第一次打开目标页开始使用 Camoufox 官方入口和反检测启动参数。';
  return {
    requested: !!args.requireCamoufox,
    packageInstalled: !!pkg.packageInstalled,
    browserFetched,
    python: pkg,
    pathCommandOk: !!pathCmd.ok,
    pathCommand: pathCmd.command,
    pathCommandOutput: pathCmd.stdout || '',
    pathCommandError: pathCmd.stderr || pathCmd.error || '',
    versionCommandOk: !!versionCmd.ok,
    versionCommandOutput: versionCmd.stdout || '',
    listCommandOk: !!listCmd.ok,
    listCommandOutput: listCmd.stdout || '',
    cliBrowserPath,
    cliBrowserPathExists,
    scannedDirs,
    scannedBinaries,
    recommendedBrowserPath,
    usable: !!pkg.packageInstalled && browserFetched,
    installCommands: [
      'python -m pip install -U "camoufox[geoip]"',
      'python -m camoufox fetch',
      'python -m camoufox version',
      'python -m camoufox path',
    ],
    usageMusts: [
      '从第一次打开目标页开始使用 Camoufox，不要先用普通 Playwright / Puppeteer / 系统浏览器探测。',
      '默认 headless:false、humanize:true；Linux 无显示环境且用户确认时才使用官方 headless:"virtual"。',
      '代理场景按授权启用 geoip:true，必要时 block_webrtc:true，并保持 locale / timezone / geolocation 与出口 IP 一致。',
      '用户选择 MCP 时，必须先检测 camoufox-reverse-mcp；MCP 不可用时不得静默降级。',
      'Camoufox 只用于前置取证、采样和日志收集，不得进入最终 result/ 交付代码。',
    ],
    conclusion,
  };
}

function detectCamoufoxReverseMcp(args) {
  const projectDir = args.camoufoxMcpProjectDir ? path.resolve(args.camoufoxMcpProjectDir) : '';
  const pyPathEntries = [];
  if (projectDir) {
    if (exists(path.join(projectDir, 'src'))) pyPathEntries.push(path.join(projectDir, 'src'));
    pyPathEntries.push(projectDir);
  }
  const env = pyPathEntries.length ? { PYTHONPATH: pyPathEntries.concat(process.env.PYTHONPATH ? [process.env.PYTHONPATH] : []).join(path.delimiter) } : {};
  const code = [
    'import json, importlib.metadata as md',
    'try:',
    ' import camoufox_reverse_mcp as m',
    ' version=""',
    ' try:',
    '  version=md.version("camoufox-reverse-mcp")',
    ' except Exception:',
    '  pass',
    ' print(json.dumps({"ok": True, "version": version, "module_file": getattr(m, "__file__", "")}, ensure_ascii=False))',
    'except Exception as e:',
    ' print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))',
  ].join('\n');
  const checked = [];
  for (const c of pythonCandidates(args.python)) {
    const ret = run(c.cmd, c.argsPrefix.concat(['-c', code]), 15000, { cwd: projectDir || undefined, env });
    const item = { python: [c.cmd].concat(c.argsPrefix).join(' '), ok: ret.ok, stderr: ret.stderr || ret.error };
    checked.push(item);
    if (!ret.ok) continue;
    let parsed = null;
    try { parsed = JSON.parse((ret.stdout || '').replace(/^\uFEFF/, '')); } catch { parsed = null; }
    if (parsed && parsed.ok) {
      return {
        requested: !!args.requireCamoufoxMcp,
        installed: true,
        importable: true,
        python: c.cmd,
        pythonArgsPrefix: c.argsPrefix,
        version: parsed.version || '',
        moduleFile: parsed.module_file || '',
        projectDir,
        projectDirExists: projectDir ? exists(projectDir) : false,
        checked,
        mcpCommand: [c.cmd].concat(c.argsPrefix, ['-m', 'camoufox_reverse_mcp']).join(' '),
        conclusion: '可使用：camoufox-reverse-mcp 可导入；启动 MCP 前仍需确认客户端配置使用同一 Python / venv。',
      };
    }
    if (parsed && parsed.error) item.error = parsed.error;
  }
  return {
    requested: !!args.requireCamoufoxMcp,
    installed: false,
    importable: false,
    projectDir,
    projectDirExists: projectDir ? exists(projectDir) : false,
    checked,
    installCommands: [
      'git clone https://github.com/WhiteNightShadow/camoufox-reverse-mcp.git <install-dir>',
      'cd <install-dir>',
      'python -m pip install -e .',
      'python -c "import camoufox_reverse_mcp; print(\'ok\')"',
    ],
    configExample: {
      mcpServers: {
        'camoufox-reverse': {
          command: 'python',
          args: ['-m', 'camoufox_reverse_mcp'],
        },
      },
    },
    conclusion: '不可使用：未检测到可 import camoufox_reverse_mcp 的 Python 环境；如已安装，请提供 Python / venv 或 --camoufox-mcp-project-dir。',
  };
}

function detectPythonCloakBrowser(explicitPython) {
  const code = [
    'import json',
    'try:',
    ' import cloakbrowser',
    ' info = {}',
    ' try:',
    '  info = cloakbrowser.binary_info()',
    ' except Exception as be:',
    '  info = {"error": str(be)}',
    ' print(json.dumps({"ok": True, "version": getattr(cloakbrowser, "__version__", ""), "binaryInfo": info}, ensure_ascii=False))',
    'except Exception as e:',
    ' print(json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False))',
  ].join('\n');
  const checked = [];
  for (const c of pythonCandidates(explicitPython)) {
    const ret = run(c.cmd, c.argsPrefix.concat(['-c', code]), 15000);
    checked.push({ python: [c.cmd].concat(c.argsPrefix).join(' '), ok: ret.ok, stderr: ret.stderr || ret.error });
    if (!ret.ok) continue;
    let parsed = null;
    try { parsed = JSON.parse((ret.stdout || '').replace(/^\uFEFF/, '')); } catch { parsed = null; }
    if (parsed && parsed.ok) {
      const info = parsed.binaryInfo || {};
      return {
        packageInstalled: true,
        python: c.cmd,
        pythonArgsPrefix: c.argsPrefix,
        version: parsed.version || '',
        binaryInfo: info,
        binaryInstalled: info.installed === true || info.installed === 'true',
        binaryPath: info.binary_path || info.path || '',
        cacheDir: info.cache_dir || '',
        checked,
      };
    }
  }
  return { packageInstalled: false, binaryInstalled: false, binaryPath: '', checked, reason: '未检测到可 import cloakbrowser 的 Python 环境' };
}

function detectNodeCloakBrowser(projectDir) {
  const cwd = projectDir ? path.resolve(projectDir) : process.cwd();
  const code = `
(async () => {
  const out = { ok: false, version: '', binaryInfo: null, keys: [], error: '' };
  try {
    const mod = await import('cloakbrowser');
    out.ok = true;
    out.keys = Object.keys(mod).sort();
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      let pkgPath = '';
      try {
        const pkgUrl = import.meta.resolve ? import.meta.resolve('cloakbrowser/package.json') : '';
        if (pkgUrl) pkgPath = fileURLToPath(pkgUrl);
      } catch {}
      if (!pkgPath && import.meta.resolve) {
        try {
          let dir = path.dirname(fileURLToPath(import.meta.resolve('cloakbrowser')));
          for (let i = 0; i < 6; i++) {
            const candidate = path.join(dir, 'package.json');
            if (fs.existsSync(candidate)) { pkgPath = candidate; break; }
            const parent = path.dirname(dir);
            if (parent === dir) break;
            dir = parent;
          }
        } catch {}
      }
      if (!pkgPath) {
        try {
          const { createRequire } = await import('node:module');
          const require = createRequire(import.meta.url);
          pkgPath = require.resolve('cloakbrowser/package.json');
        } catch {}
      }
      if (pkgPath) out.version = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version || '';
    } catch {}
    try { if (typeof mod.binaryInfo === 'function') out.binaryInfo = await mod.binaryInfo(); } catch (e) { out.binaryInfo = { error: String(e && e.message || e) }; }
  } catch (e) { out.error = String(e && e.message || e); }
  console.log(JSON.stringify(out));
})().catch(e => { console.log(JSON.stringify({ ok:false, error:String(e && e.message || e) })); });`;
  const ret = run('node', ['-e', code], 15000, { cwd });
  let parsed = null;
  try { parsed = JSON.parse((ret.stdout || '').replace(/^\uFEFF/, '')); } catch { parsed = null; }
  if (ret.ok && parsed && parsed.ok) {
    const info = parsed.binaryInfo || {};
    return {
      packageInstalled: true,
      projectDir: cwd,
      version: parsed.version || '',
      keys: parsed.keys || [],
      binaryInfo: info,
      binaryInstalled: info.installed === true || info.installed === 'true',
      binaryPath: info.binary_path || info.path || '',
      cacheDir: info.cache_dir || '',
      error: '',
    };
  }
  return {
    packageInstalled: false,
    projectDir: cwd,
    binaryInstalled: false,
    binaryPath: '',
    error: parsed && parsed.error ? parsed.error : (ret.stderr || ret.error || '未检测到 Node.js cloakbrowser 包'),
  };
}

function fileExistsOrEmpty(p) {
  if (!p) return false;
  return exists(path.resolve(p));
}

function detectCloakBrowser(args) {
  const python = detectPythonCloakBrowser(args.python);
  const nodePkg = detectNodeCloakBrowser(args.cloakBrowserProjectDir);
  const explicitBinary = args.cloakBrowserBinaryPath || process.env.CLOAKBROWSER_BINARY_PATH || '';
  const explicitBinaryExists = fileExistsOrEmpty(explicitBinary);
  const packageInstalled = python.packageInstalled || nodePkg.packageInstalled;
  const binaryInstalled = explicitBinaryExists || python.binaryInstalled || nodePkg.binaryInstalled;
  let recommendedRuntime = '';
  if (explicitBinaryExists) recommendedRuntime = path.resolve(explicitBinary);
  else if (python.binaryPath) recommendedRuntime = python.binaryPath;
  else if (nodePkg.binaryPath) recommendedRuntime = nodePkg.binaryPath;
  let conclusion = '';
  if (!packageInstalled && !binaryInstalled) conclusion = '不可使用：未检测到 Python / Node.js CloakBrowser 包，也未检测到可用 stealth Chromium 二进制。';
  else if (!packageInstalled && binaryInstalled) conclusion = '暂不可使用：检测到二进制路径，但未检测到 Python / Node.js cloakbrowser 包；需安装包装器或提供可调用项目。';
  else if (packageInstalled && !binaryInstalled) conclusion = '可安装但未预下载二进制：CloakBrowser 包存在，首次 launch 会尝试自动下载；正式取证前建议先运行 python -m cloakbrowser install 或 npx cloakbrowser install。';
  else conclusion = '可使用：检测到 CloakBrowser 包和 stealth Chromium 二进制。正式取证仍需按 headless:false + humanize:true 等硬约束启动。';
  return {
    requested: !!args.requireCloakBrowser,
    packageInstalled,
    binaryInstalled,
    explicitBinaryPath: explicitBinary ? path.resolve(explicitBinary) : '',
    explicitBinaryExists,
    recommendedRuntime,
    python,
    node: nodePkg,
    installCommands: [
      'python -m pip install cloakbrowser playwright --upgrade',
      'python -m cloakbrowser install',
      'npm install cloakbrowser playwright-core',
      'npx cloakbrowser install',
    ],
    usageMusts: [
      '从第一次打开目标页开始使用 CloakBrowser，不要先用普通 Playwright / Puppeteer 探测。',
      '默认 headless:false、humanize:true；如果用户授权使用代理，配合 proxy + geoip:true 保持时区 / locale / WebRTC 一致。',
      '优先 import { launch, launchPersistentContext } from \'cloakbrowser\'，不得直接 chromium.launch()。',
      '高风控或需要登录态时优先 launchPersistentContext，并把 userDataDir 放在 case/tmp/ 下，结束后按敏感 Profile 处理。',
      '减少 page.evaluate / waitForTimeout 等可能增加 CDP 可见信号的调用；等待用原生 sleep。',
    ],
    conclusion,
  };
}
function detect(args) {
  return {
    ruyiPage: detectRuyiPage(args),
    ruyiTrace: detectRuyiTrace(args),
    camoufox: detectCamoufox(args),
    camoufoxReverseMcp: detectCamoufoxReverseMcp(args),
    cloakBrowser: detectCloakBrowser(args),
    nextRequiredInput: [],
  };
}

function withNextSteps(result) {
  const next = [];
  const rp = result.ruyiPage;
  if (!rp.packageInstalled) {
    next.push('如果选择 ruyiPage，请先确认当前 Python 环境是否应安装 ruyiPage；未安装时需用户确认后执行 python -m pip install ruyiPage requests --upgrade。');
  }
  if (rp.smartFingerprintDependencyMissing) {
    next.push('如果选择 ruyiPage 做高保真取证，请安装 Python requests 依赖，或在 smart_fingerprint 中显式提供 manual_geo；否则默认地理位置 / 时区 / 指纹一致性初始化可能失败。');
  }
  if (!rp.managedRuntimeVerified) {
    next.push('未检测到 ruyiPage 定制 Firefox runtime。请先询问用户是否已经提前安装：已安装则提供 install-dir 或 firefox 可执行文件路径；未安装则提供安装目录，并在用户确认后安装。');
  }
  if (rp.defaultIsSystemFirefoxFallback || rp.explicitBrowserPathNotVerified) {
    next.push('检测到可能的系统 Firefox fallback 或未验证 Firefox 路径：这不视为 ruyiPage 绕检测方案通过，必须改用 ruyiPage managed runtime / release 含 ruyi 标识的定制 Firefox。');
  }
  if (!result.ruyiTrace.installed) next.push('如果本 case 选择 ruyiPage + RuyiTrace，当前 RuyiTrace 未通过检测时不得自动降级为仅 ruyiPage；请让用户选择安装 / 提供 RuyiTrace.exe 所在目录，或明确确认降级为仅 ruyiPage。用户选择安装时，需等待 RuyiTrace.exe 可打开且 firefox/RUYI_DOMTRACE.txt 存在后再继续。');
  const cf = result.camoufox;
  if (cf && cf.requested) {
    if (!cf.packageInstalled && !cf.browserFetched) {
      next.push('如果本 case 选择 Camoufox，当前未检测到 Camoufox Python 包或浏览器本体。请先询问用户是否已安装：已安装则提供 Python / venv、`python -m camoufox path` 输出或 Camoufox 缓存目录；未安装则让用户确认 Python / venv 和下载缓存目录后再安装。');
    } else if (cf.packageInstalled && !cf.browserFetched) {
      next.push('检测到 Camoufox Python 包但未检测到浏览器本体：正式取证前必须让用户确认执行 `python -m camoufox fetch`，或提供已 fetch 的缓存目录 / 浏览器路径。');
    } else if (!cf.packageInstalled && cf.browserFetched) {
      next.push('检测到疑似 Camoufox 浏览器本体但未检测到 Python 包：不得直接用普通 Playwright 指向该浏览器；需提供可调用 Camoufox 官方 API 的 Python / venv。');
    }
  }
  const cm = result.camoufoxReverseMcp;
  if (cm && cm.requested && !cm.importable) {
    next.push('如果本 case 选择 Camoufox + camoufox-reverse-mcp，当前 MCP 未通过检测时不得自动降级为仅 Camoufox；请让用户选择安装 / 提供 camoufox-reverse-mcp 项目目录，或明确确认降级为仅 Camoufox。');
  }
  const cb = result.cloakBrowser;
  if (cb && cb.requested) {
    if (!cb.packageInstalled && !cb.binaryInstalled) {
      next.push('如果本 case 选择 CloakBrowser，当前未检测到 Python / Node.js cloakbrowser 包或 stealth Chromium 二进制。请先询问用户是否已安装：已安装则提供 Python 解释器、Node 项目目录或 CLOAKBROWSER_BINARY_PATH；未安装则让用户确认安装路线与安装目录后再安装。');
    } else if (!cb.packageInstalled && cb.binaryInstalled) {
      next.push('检测到 CloakBrowser 二进制但未检测到 Python / Node.js 包：不得直接用普通 Playwright 指向该二进制启动；需安装 cloakbrowser 包装器，或让用户提供可调用的 cloakbrowser 项目环境。');
    } else if (cb.packageInstalled && !cb.binaryInstalled) {
      next.push('检测到 cloakbrowser 包但未检测到 stealth Chromium 二进制：正式取证前应让用户确认运行 python -m cloakbrowser install / npx cloakbrowser install，或提供已下载二进制路径。');
    }
  }
  result.nextRequiredInput = next;
  return result;
}

function renderRuntimeCheck(c) {
  const status = c.managedRuntimeVerified ? '通过' : '不通过';
  const lines = [`  - ${c.label}：${status}`];
  if (c.executable) lines.push(`    - Firefox：${c.executableExists ? '存在' : '不存在'} - ${c.executable}`);
  if (c.installJsonPath) lines.push(`    - install.json：${c.installJsonExists ? '存在' : '不存在'} - ${c.installJsonPath}`);
  if (c.runtimeRelease) lines.push(`    - release：${c.runtimeRelease}`);
  if (c.runtimeVersion) lines.push(`    - version：${c.runtimeVersion}`);
  if (c.runtimeAsset) lines.push(`    - asset：${c.runtimeAsset}`);
  lines.push(`    - 原因：${c.reason || '无'}`);
  return lines;
}

function renderMarkdown(result) {
  const lines = ['# 外部浏览器工具检测结果', ''];
  const rp = result.ruyiPage;
  lines.push('## ruyiPage');
  lines.push(`- Python 包是否检测到：${rp.packageInstalled ? '是' : '否'}`);
  if (rp.packageInstalled) {
    lines.push(`- Python：${[rp.python].concat(rp.pythonArgsPrefix || []).join(' ')}`.trim());
    lines.push(`- ruyiPage 版本：${rp.version || '未知'}`);
    lines.push(`- smart_fingerprint 依赖 requests 是否可用：${rp.requestsAvailable ? '是' : '否'}`);
    if (rp.requestsError) lines.push(`- requests 检测错误：${rp.requestsError}`);
    lines.push(`- 默认解析路径：${rp.defaultRuntimePath || '未检测到'}`);
    lines.push(`- 默认解析路径是否存在：${rp.defaultRuntimePathExists ? '是' : '否'}`);
    lines.push(`- 默认解析路径是否为定制 Firefox：${rp.defaultRuntimeVerified ? '是' : '否'}`);
  } else {
    lines.push(`- 原因：${rp.reason}`);
  }
  lines.push(`- 定制 Firefox runtime 是否通过验证：${rp.managedRuntimeVerified ? '是' : '否'}`);
  if (rp.runtimeExecutable) lines.push(`- 已验证 runtime Firefox：${rp.runtimeExecutable}`);
  if (rp.runtimeRelease) lines.push(`- runtime release：${rp.runtimeRelease}`);
  if (rp.runtimeVersion) lines.push(`- runtime version：${rp.runtimeVersion}`);
  if (rp.runtimeInstallJson) lines.push(`- runtime install.json：${rp.runtimeInstallJson}`);
  lines.push(`- 是否存在系统 Firefox fallback / 未验证路径风险：${rp.isSystemFirefoxFallback ? '是' : '否'}`);
  lines.push(`- 是否需要安装或提供定制 runtime：${rp.mustInstallManagedRuntime ? '是' : '否'}`);
  lines.push(`- 是否满足推荐取证启动条件：${rp.recommendedForAntiDetectionProbe ? '是' : '否'}`);
  lines.push(`- ruyiPage 结论：${rp.conclusion}`);
  if (rp.runtimeChecks && rp.runtimeChecks.length) {
    lines.push('', '### ruyiPage runtime 路径验证明细');
    for (const c of rp.runtimeChecks) lines.push(...renderRuntimeCheck(c));
  }

  lines.push('', '## RuyiTrace');
  lines.push(`- 是否检测到：${result.ruyiTrace.installed ? '是' : '否'}`);
  if (result.ruyiTrace.home) lines.push(`- 目录：${result.ruyiTrace.home}`);
  if (result.ruyiTrace.exe) lines.push(`- 可执行文件：${result.ruyiTrace.exeExists ? '存在' : '不存在'} - ${result.ruyiTrace.exe}`);
  if (result.ruyiTrace.firefoxExe) lines.push(`- trace Firefox：${result.ruyiTrace.firefoxExists ? '存在' : '不存在'} - ${result.ruyiTrace.firefoxExe}`);
  if (result.ruyiTrace.marker) lines.push(`- 定制内核标志：${result.ruyiTrace.markerExists ? '存在' : '不存在'} - ${result.ruyiTrace.marker}`);
  if (result.ruyiTrace.reason) lines.push(`- 原因：${result.ruyiTrace.reason}`);
  if (result.ruyiTrace.installed) {
    lines.push('- 自动捕获策略：RuyiTrace 已检测通过时，后续应优先运行 `scripts/capture_ruyitrace_log.js` 自动捕获并导入 NDJSON；只有自动捕获失败、需要登录 / 验证 / 权限交互或用户明确选择手动时，才要求用户手动采集。');
    lines.push('- 自动捕获示例：`node scripts/capture_ruyitrace_log.js --url <target-page-url> --case-dir case --ruyitrace-home <RuyiTrace-dir> --duration 90 --import-after --markdown`');
  }


  lines.push('', '## Camoufox');
  const cf = result.camoufox;
  lines.push(`- 是否要求检测：${cf.requested ? '是' : '否'}`);
  lines.push(`- Python 包是否检测到：${cf.packageInstalled ? '是' : '否'}`);
  if (cf.python && cf.python.packageInstalled) {
    lines.push(`- Python：${[cf.python.python].concat(cf.python.pythonArgsPrefix || []).join(' ')}`.trim());
    lines.push(`- Camoufox 版本：${cf.python.version || '未知'}`);
    lines.push(`- sync_api.Camoufox 是否可导入：${cf.python.syncApiAvailable ? '是' : '否'}`);
    lines.push(`- async_api.AsyncCamoufox 是否可导入：${cf.python.asyncApiAvailable ? '是' : '否'}`);
    if (cf.python.asyncApiError) lines.push(`- Async API 检测错误：${cf.python.asyncApiError}`);
  } else if (cf.python && cf.python.reason) lines.push(`- Python 检测原因：${cf.python.reason}`);
  lines.push(`- path 命令是否成功：${cf.pathCommandOk ? '是' : '否'}`);
  if (cf.pathCommand) lines.push(`- path 命令：${cf.pathCommand}`);
  lines.push(`- path 输出浏览器路径：${cf.cliBrowserPath || '未检测到'}`);
  lines.push(`- path 输出路径是否存在：${cf.cliBrowserPathExists ? '是' : '否'}`);
  lines.push(`- 浏览器本体是否已 fetch / 可定位：${cf.browserFetched ? '是' : '否'}`);
  if (cf.recommendedBrowserPath) lines.push(`- 推荐浏览器路径：${cf.recommendedBrowserPath}`);
  if (cf.scannedDirs && cf.scannedDirs.length) lines.push(`- 扫描目录：${cf.scannedDirs.join('、')}`);
  if (cf.scannedBinaries && cf.scannedBinaries.length) lines.push(`- 扫描命中：${cf.scannedBinaries.join('、')}`);
  if (cf.pathCommandError) lines.push(`- path 命令错误：${cf.pathCommandError}`);
  if (cf.versionCommandOutput) lines.push(`- version 输出：${cf.versionCommandOutput}`);
  lines.push(`- Camoufox 结论：${cf.conclusion}`);
  if (cf.installCommands && cf.installCommands.length) {
    lines.push('', '### Camoufox 安装 / fetch 命令');
    for (const cmd of cf.installCommands) lines.push(`- \`${cmd}\``);
  }
  lines.push('', '### Camoufox 启动硬约束');
  for (const item of cf.usageMusts || []) lines.push(`- ${item}`);

  lines.push('', '## camoufox-reverse-mcp');
  const cm = result.camoufoxReverseMcp;
  lines.push(`- 是否要求检测：${cm.requested ? '是' : '否'}`);
  lines.push(`- 是否可导入：${cm.importable ? '是' : '否'}`);
  if (cm.projectDir) lines.push(`- 项目目录：${cm.projectDirExists ? '存在' : '不存在'} - ${cm.projectDir}`);
  if (cm.importable) {
    lines.push(`- Python：${[cm.python].concat(cm.pythonArgsPrefix || []).join(' ')}`.trim());
    lines.push(`- 版本：${cm.version || '未知'}`);
    if (cm.moduleFile) lines.push(`- 模块文件：${cm.moduleFile}`);
    if (cm.mcpCommand) lines.push(`- MCP 命令：${cm.mcpCommand}`);
  } else if (cm.checked && cm.checked.length) {
    const last = cm.checked[cm.checked.length - 1];
    if (last.error || last.stderr) lines.push(`- 检测原因：${last.error || last.stderr}`);
  }
  lines.push(`- MCP 结论：${cm.conclusion}`);
  if (cm.installCommands && cm.installCommands.length) {
    lines.push('', '### camoufox-reverse-mcp 安装命令');
    for (const cmd of cm.installCommands) lines.push(`- \`${cmd}\``);
  }
  if (cm.configExample) {
    lines.push('', '### MCP 配置示例');
    lines.push('```json');
    lines.push(JSON.stringify(cm.configExample, null, 2));
    lines.push('```');
  }

  lines.push('', '## CloakBrowser');
  const cb = result.cloakBrowser;
  lines.push(`- 是否要求检测：${cb.requested ? '是' : '否'}`);
  lines.push(`- Python 包是否检测到：${cb.python.packageInstalled ? '是' : '否'}`);
  if (cb.python.packageInstalled) {
    lines.push(`- Python：${[cb.python.python].concat(cb.python.pythonArgsPrefix || []).join(' ')}`.trim());
    lines.push(`- Python cloakbrowser 版本：${cb.python.version || '未知'}`);
    if (cb.python.binaryPath) lines.push(`- Python binaryInfo 路径：${cb.python.binaryPath}`);
    if (cb.python.cacheDir) lines.push(`- Python 缓存目录：${cb.python.cacheDir}`);
  } else if (cb.python.reason) lines.push(`- Python 检测原因：${cb.python.reason}`);
  lines.push(`- Node.js 包是否检测到：${cb.node.packageInstalled ? '是' : '否'}`);
  lines.push(`- Node.js 项目目录：${cb.node.projectDir || '未指定，使用当前工作目录'}`);
  if (cb.node.packageInstalled) {
    lines.push(`- Node.js cloakbrowser 版本：${cb.node.version || '未知'}`);
    if (cb.node.binaryPath) lines.push(`- Node.js binaryInfo 路径：${cb.node.binaryPath}`);
    if (cb.node.cacheDir) lines.push(`- Node.js 缓存目录：${cb.node.cacheDir}`);
  } else if (cb.node.error) lines.push(`- Node.js 检测原因：${cb.node.error}`);
  lines.push(`- 显式二进制路径：${cb.explicitBinaryPath || '未提供'}`);
  lines.push(`- 显式二进制是否存在：${cb.explicitBinaryExists ? '是' : '否'}`);
  lines.push(`- stealth Chromium 二进制是否检测到：${cb.binaryInstalled ? '是' : '否'}`);
  if (cb.recommendedRuntime) lines.push(`- 推荐使用二进制：${cb.recommendedRuntime}`);
  lines.push(`- CloakBrowser 结论：${cb.conclusion}`);
  if (cb.installCommands && cb.installCommands.length) {
    lines.push('', '### CloakBrowser 安装 / 预下载命令');
    for (const cmd of cb.installCommands) lines.push(`- \`${cmd}\``);
  }
  lines.push('', '### CloakBrowser 官方启动硬约束');
  for (const item of cb.usageMusts || []) lines.push(`- ${item}`);

  if (result.nextRequiredInput.length) {
    lines.push('', '## 下一步需要用户确认');
    for (const item of result.nextRequiredInput) lines.push(`- ${item}`);
  }
  return lines.join('\n') + '\n';
}

try {
  const args = parseArgs(process.argv);
  if (args.help) { console.log(usage()); process.exit(0); }
  const result = withNextSteps(detect(args));
  if (args.json) console.log(JSON.stringify(result, null, 2));
  if (args.markdown) process.stdout.write(renderMarkdown(result));
} catch (err) {
  console.error(err.message || String(err));
  console.error(usage());
  process.exit(1);
}
