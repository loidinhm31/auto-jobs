import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';

import { expect, test } from '@playwright/test';

import { main, parseTemplateServerArgs } from '../../src/templates/template-server-cli.js';
import type { TemplateServerHandle } from '../../src/templates/template-server.js';

const execFileAsync = promisify(execFile);
const CLI_PATH = path.resolve('.runner-build/templates/template-server-cli.js');

test.describe('template-server-cli', () => {
  test.describe('parseTemplateServerArgs', () => {
    test('uses defaults when no arguments or env are provided', () => {
      const config = parseTemplateServerArgs([], {});
      expect(config).toEqual({
        host: '127.0.0.1',
        port: 4174,
        help: false,
      });
    });

    test('respects TEMPLATE_HOST and TEMPLATE_PORT environment variables', () => {
      const config = parseTemplateServerArgs([], {
        TEMPLATE_HOST: 'localhost',
        TEMPLATE_PORT: '5555',
      });
      expect(config).toEqual({
        host: 'localhost',
        port: 5555,
        help: false,
      });
    });

    test('overrides environment variables with CLI arguments', () => {
      const config = parseTemplateServerArgs(
        ['--host', '127.0.0.1', '--port', '8080'],
        {
          TEMPLATE_HOST: '10.0.0.1',
          TEMPLATE_PORT: '9999',
        },
      );
      expect(config).toEqual({
        host: '127.0.0.1',
        port: 8080,
        help: false,
      });
    });

    test('supports --host= and --port= inline syntax', () => {
      const config = parseTemplateServerArgs(['--host=localhost', '--port=9000'], {});
      expect(config).toEqual({
        host: 'localhost',
        port: 9000,
        help: false,
      });
    });

    test('handles --help and -h flags', () => {
      expect(parseTemplateServerArgs(['--help'], {}).help).toBe(true);
      expect(parseTemplateServerArgs(['-h'], {}).help).toBe(true);
    });

    test('validates port number format and range', () => {
      expect(() => parseTemplateServerArgs(['--port', 'abc'], {})).toThrow(
        /--port must be a port number between 0 and 65535/,
      );
      expect(() => parseTemplateServerArgs(['--port', '-1'], {})).toThrow(
        /--port must be a port number between 0 and 65535/,
      );
      expect(() => parseTemplateServerArgs(['--port', '70000'], {})).toThrow(
        /--port must be a port number between 0 and 65535/,
      );
      expect(() => parseTemplateServerArgs([], { TEMPLATE_PORT: 'invalid' })).toThrow(
        /TEMPLATE_PORT must be a port number between 0 and 65535/,
      );
    });

    test('validates missing values for options', () => {
      expect(() => parseTemplateServerArgs(['--host'], {})).toThrow(/--host requires a value/);
      expect(() => parseTemplateServerArgs(['--host', ''], {})).toThrow(/--host requires a value/);
      expect(() => parseTemplateServerArgs(['--host', '   '], {})).toThrow(/--host requires a value/);
      expect(() => parseTemplateServerArgs(['--host', '--port'], {})).toThrow(/--host requires a value/);
      expect(() => parseTemplateServerArgs(['--host', '-h'], {})).toThrow(/--host requires a value/);
      expect(() => parseTemplateServerArgs(['--host='], {})).toThrow(/--host requires a value/);
      expect(() => parseTemplateServerArgs(['--port'], {})).toThrow(/--port requires a value/);
      expect(() => parseTemplateServerArgs(['--port', ''], {})).toThrow(/--port requires a value/);
      expect(() => parseTemplateServerArgs(['--port', '-h'], {})).toThrow(/--port requires a value/);
    });

    test('rejects unknown arguments', () => {
      expect(() => parseTemplateServerArgs(['--unknown-flag'], {})).toThrow(
        /unknown template server option: --unknown-flag/,
      );
    });
  });

  test.describe('main', () => {
    test('returns undefined and prints usage when --help is passed', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => {
        logs.push(msg);
      };
      try {
        const handle = await main(['--help'], {});
        expect(handle).toBeUndefined();
        expect(logs.some((msg) => msg.includes('Usage:'))).toBe(true);
      } finally {
        console.log = originalLog;
      }
    });

    test('starts server on ephemeral port, cleans up signals, and returns active handle', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => {
        logs.push(msg);
      };
      const initialSigint = process.listenerCount('SIGINT');
      const initialSigterm = process.listenerCount('SIGTERM');

      let handle: TemplateServerHandle | undefined;
      try {
        handle = await main(['--port', '0'], {});
        expect(handle).toBeDefined();
        expect(handle?.port).toBeGreaterThan(0);
        expect(logs.some((msg) => msg.includes(`Template server: ${handle?.url}`))).toBe(true);

        expect(process.listenerCount('SIGINT')).toBe(initialSigint + 1);
        expect(process.listenerCount('SIGTERM')).toBe(initialSigterm + 1);

        const res = await fetch(`${handle?.url}`);
        expect([200, 302, 404]).toContain(res.status);

        if (handle) {
          const loginRes = await fetch(handle.fixture.loginUrl);
          expect(loginRes.status).toBe(200);
          expect(await loginRes.text()).toContain('Jenkins');
        }
      } finally {
        console.log = originalLog;
        if (handle) {
          await handle.close();
        }
        expect(process.listenerCount('SIGINT')).toBe(initialSigint);
        expect(process.listenerCount('SIGTERM')).toBe(initialSigterm);
      }
    });
  });

  test.describe('compiled CLI process execution', () => {
    test('runs --help with exit code 0 and prints usage', async () => {
      test.skip(!fs.existsSync(CLI_PATH), 'CLI script not compiled yet');
      const { stdout } = await execFileAsync(process.execPath, [CLI_PATH, '--help']);
      expect(stdout).toContain('Usage: npm run serve:templates');
    });

    test('fails with exit code 1 on unknown option', async () => {
      test.skip(!fs.existsSync(CLI_PATH), 'CLI script not compiled yet');
      await expect(
        execFileAsync(process.execPath, [CLI_PATH, '--invalid-option']),
      ).rejects.toThrow();
    });
  });
});
