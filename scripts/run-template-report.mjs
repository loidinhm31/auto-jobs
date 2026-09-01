import { spawn } from 'node:child_process';

import { createRuntimeDirectory, removeRuntimeDirectory } from './report-runtime.mjs';

let activeChild;
let activeSignal;
let signalTimer;

function signalExitCode(signal) {
  return signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1;
}

function killChild(child, signal) {
  if (process.platform !== 'win32' && child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // Fall through to the direct child when the process group is already gone.
    }
  }
  try { child.kill(signal); } catch { /* The child already exited. */ }
}

function forwardSignal(signal) {
  activeSignal = signal;
  if (activeChild === undefined) return;
  killChild(activeChild, signal);
  clearTimeout(signalTimer);
  signalTimer = setTimeout(() => {
    if (activeChild !== undefined) killChild(activeChild, 'SIGKILL');
  }, 5_000);
  signalTimer.unref();
}

function run(command, args, env, cwd) {
  return new Promise((resolve) => {
    const isWindowsBatch = process.platform === 'win32' && /\.(cmd|bat)$/iu.test(command);
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: 'inherit',
      detached: process.platform !== 'win32',
      ...(isWindowsBatch ? { shell: true } : {}),
    });
    activeChild = child;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (activeChild === child) activeChild = undefined;
      clearTimeout(signalTimer);
      resolve(result);
    };
    child.once('error', (error) => finish({ code: 1, error }));
    child.once('close', (code, signal) => finish({ code: code ?? signalExitCode(signal), signal }));
  });
}

export function parseLaunchArguments(values) {
  const args = [];
  const environment = {};
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (argument === '--env') {
      const assignment = values[index + 1];
      const separator = assignment?.indexOf('=');
      if (assignment === undefined || separator === undefined || separator <= 0) {
        throw new Error('--env requires NAME=VALUE');
      }
      const name = assignment.slice(0, separator);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) throw new Error('--env name is invalid');
      environment[name] = assignment.slice(separator + 1);
      index += 1;
      continue;
    }
    args.push(argument);
  }
  return { args, environment };
}

function npmBuildCommand() {
  const npmPath = process.env['npm_execpath'];
  if (npmPath === undefined) {
    return { command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['run', 'build'] };
  }
  return { command: process.execPath, args: [npmPath, 'run', 'build'] };
}

async function main() {
  const { args, environment: environmentOverrides } = parseLaunchArguments(process.argv.slice(2));
  const runtime = await createRuntimeDirectory();
  const environment = {
    ...process.env,
    ...environmentOverrides,
    TMPDIR: runtime.directory,
    TMP: runtime.directory,
    TEMP: runtime.directory,
    NODE_DISABLE_COMPILE_CACHE: '1',
  };
  let exitCode = activeSignal === undefined ? 1 : signalExitCode(activeSignal);
  try {
    if (activeSignal === undefined) {
      const buildCommand = npmBuildCommand();
      const build = await run(buildCommand.command, buildCommand.args, environment, runtime.projectRoot);
      if (build.code !== 0 || activeSignal !== undefined) {
        exitCode = activeSignal === undefined ? build.code : signalExitCode(activeSignal);
      } else {
        const report = await run(process.execPath, ['.runner-build/templates/template-report-cli.js', ...args], environment, runtime.projectRoot);
        exitCode = activeSignal === undefined ? report.code : signalExitCode(activeSignal);
      }
    }
  } finally {
    runtime.stopHeartbeat();
    const cleaned = await removeRuntimeDirectory(runtime.directory, runtime.projectRoot);
    if (activeSignal !== undefined) exitCode = signalExitCode(activeSignal);
    else if (!cleaned && exitCode === 0) exitCode = 1;
  }
  process.exitCode = exitCode;
}

process.once('SIGINT', () => forwardSignal('SIGINT'));
process.once('SIGTERM', () => forwardSignal('SIGTERM'));

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
