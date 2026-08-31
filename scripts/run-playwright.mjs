import { spawn } from 'node:child_process';
import * as path from 'node:path';

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

function executableForPlatform(command) {
  if (process.platform !== 'win32' || /\.[a-z0-9]+$/iu.test(command)) return command;
  return `${command}.cmd`;
}

function parseLaunchArguments(values) {
  const remaining = [...values];
  const environment = {};
  while (remaining[0] === '--env') {
    remaining.shift();
    const assignment = remaining.shift();
    const separator = assignment?.indexOf('=');
    if (assignment === undefined || separator === undefined || separator <= 0) {
      throw new Error('--env requires NAME=VALUE');
    }
    const name = assignment.slice(0, separator);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) throw new Error('--env name is invalid');
    environment[name] = assignment.slice(separator + 1);
  }
  const [command, ...args] = remaining;
  return { command, args, environment };
}

function run(command, args, environment, cwd) {
  return new Promise((resolve) => {
    const childEnvironment = process.platform === 'win32'
      ? (() => {
          const pathKey = Object.keys(environment).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
          return {
            ...environment,
            [pathKey]: `${path.join(cwd, 'node_modules', '.bin')}${path.delimiter}${environment[pathKey] ?? ''}`,
          };
        })()
      : environment;
    const child = spawn(executableForPlatform(command), args, {
      cwd,
      env: childEnvironment,
      stdio: 'inherit',
      detached: process.platform !== 'win32',
      ...(process.platform === 'win32' ? { shell: true } : {}),
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
    child.once('error', (error) => {
      console.error(error.message);
      finish({ code: 1, error });
    });
    child.once('close', (code, signal) => finish({
      code: code ?? signalExitCode(signal),
      signal,
    }));
  });
}

async function main() {
  const { command, args, environment: environmentOverrides } = parseLaunchArguments(process.argv.slice(2));
  if (command === undefined) throw new Error('project-runtime command is required');

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
      const result = await run(command, args, environment, runtime.projectRoot);
      exitCode = activeSignal === undefined ? result.code : signalExitCode(activeSignal);
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
