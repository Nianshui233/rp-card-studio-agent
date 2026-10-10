import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const run = async (program, args) => (await exec(program, args, { timeout: 10000, maxBuffer: 2 * 1024 * 1024, windowsHide: true })).stdout;

export function parsePosixProcesses(text, cwdFor = () => null) {
  return String(text).split(/\r?\n/).map(line => line.match(/^\s*(\d+)\s+(.+)$/)).filter(Boolean)
    .filter(m => /(?:^|[\/\s])node(?:\.exe)?(?:\s|$)/i.test(m[2]))
    .map(m => ({ pid: Number(m[1]), command: m[2], cwd: cwdFor(Number(m[1])) }));
}
export function parseSsListeners(text) {
  return String(text).split(/\r?\n/).flatMap(line => {
    const address = line.trim().split(/\s+/)[3], port = Number(address?.match(/:(\d+)$/)?.[1]);
    if (!port) return [];
    const pids = [...line.matchAll(/pid=(\d+)/g)].map(m => Number(m[1]));
    return (pids.length ? pids : [null]).map(pid => ({ pid, port, address }));
  });
}
export function parseLsofListeners(text) {
  let pid = null;
  return String(text).split(/\r?\n/).flatMap(line => {
    if (/^p\d+$/.test(line)) pid = Number(line.slice(1));
    if (!line.startsWith('n')) return [];
    const port = Number(line.match(/:(\d+)$/)?.[1]);
    return port ? [{ pid, port, address: line.slice(1) }] : [];
  });
}

export async function collectLocalEnvironment({ platform = process.platform, execute = run } = {}) {
  const warnings = [], result = { processes: [], listeners: [], diskRoots: [], warnings, visibility: 'execution_environment' };
  if (platform === 'win32') {
    // One read-only native shell. Raw command lines are consumed in memory, never persisted.
    const script = "$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $OutputEncoding=[Console]::OutputEncoding; $p=@(); $l=@(); $r=@(); $w=@(); try { $p=@(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Select-Object @{n='pid';e={$_.ProcessId}},@{n='command';e={$_.CommandLine}}) } catch { $w+='无法读取本机进程' }; try { $l=@(Get-NetTCPConnection -State Listen | Select-Object @{n='pid';e={$_.OwningProcess}},@{n='port';e={$_.LocalPort}},@{n='address';e={$_.LocalAddress}}) } catch { $w+='无法读取监听端口' }; try { $r=@(Get-PSDrive -PSProvider FileSystem | Where-Object {$_.DisplayRoot -notlike '\\\\*'} | Select-Object -ExpandProperty Root) } catch { $w+='无法读取磁盘目录' }; @{processes=$p;listeners=$l;diskRoots=$r;warnings=$w}|ConvertTo-Json -Depth 4 -Compress";
    try { Object.assign(result, JSON.parse(await execute('powershell.exe', ['-NoProfile','-NonInteractive','-Command',script]))); }
    catch { warnings.push('无法读取本机进程、端口或磁盘信息'); }
  } else if (['linux','darwin'].includes(platform)) {
    try {
      const cwdFor = pid => { try { return fs.readlinkSync('/proc/' + pid + '/cwd'); } catch { return null; } };
      result.processes = parsePosixProcesses(await execute('ps', ['-eo','pid=,args=']), platform === 'linux' ? cwdFor : () => null);
    } catch { warnings.push('无法读取本机进程'); }
    try { result.listeners = platform === 'linux' ? parseSsListeners(await execute('ss', ['-ltnpH'])) : parseLsofListeners(await execute('lsof', ['-nP','-iTCP','-sTCP:LISTEN','-Fpn'])); }
    catch { warnings.push('无法读取监听端口；不能断言没有运行实例'); }
    // Bounded directory discovery, not arbitrary network mounts or all user data.
    result.diskRoots = platform === 'darwin' ? ['/Applications','/opt',os.homedir()] : ['/opt','/srv',os.homedir()];
  } else warnings.push('当前系统没有可用的进程/端口探测适配器');
  return result;
}

export function processHints(processes, { platform = process.platform } = {}) {
  const flavor = platform === 'win32' ? path.win32 : path.posix;
  return processes.map(p => {
    const tokens = String(p.command || '').match(/"[^"]*"|'[^']*'|[^\s]+/g)?.map(s => s.replace(/^["']|["']$/g, '')) || [];
    const script = tokens.find(s => /(?:^|[\\/])server\.js$/i.test(s));
    const directory = script && flavor.isAbsolute(script) ? flavor.dirname(script) : script && p.cwd ? p.cwd : null;
    const options = {};
    for (const name of ['port','configPath','dataRoot']) {
      const at = tokens.indexOf('--' + name), inline = tokens.find(t => t.startsWith('--' + name + '='));
      const value = at >= 0 ? tokens[at + 1] : inline?.slice(name.length + 3);
      if (value && !value.startsWith('--')) options[name] = value;
    }
    return { pid: p.pid, directory, options, serverScript: Boolean(script) };
  });
}
