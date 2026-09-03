import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';

import { createSecretStore, isValidSecretKey } from '../../src/reporting/report-server-secret-store.js';
import { createReportServer } from '../../src/reporting/report-server.js';
import { SECRETS_FILE_NAME } from '../../src/reporting/report-server-constants.js';

test.describe('SecretStore Backend Module', () => {
  let configRoot: string;
  let reportRoot: string;

  test.beforeEach(async () => {
    configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-store-cfg-'));
    reportRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-store-rpt-'));
  });

  test.afterEach(async () => {
    fs.rmSync(configRoot, { recursive: true, force: true });
    fs.rmSync(reportRoot, { recursive: true, force: true });
  });

  test('validates secret keys correctly with isValidSecretKey', () => {
    expect(isValidSecretKey('JENKINS_USER')).toBe(true);
    expect(isValidSecretKey('_PRIVATE_KEY_123')).toBe(true);
    expect(isValidSecretKey('simpleKey')).toBe(true);
    expect(isValidSecretKey('123numberFirst')).toBe(false);
    expect(isValidSecretKey('kebab-case-key')).toBe(false);
    expect(isValidSecretKey('key.with.dots')).toBe(false);
    expect(isValidSecretKey('../traversal')).toBe(false);
    expect(isValidSecretKey('__proto__')).toBe(false);
    expect(isValidSecretKey('prototype')).toBe(false);
    expect(isValidSecretKey('constructor')).toBe(false);
    expect(isValidSecretKey('')).toBe(false);
  });

  test('returns empty map when secrets.local.json is absent', async () => {
    const store = await createSecretStore(configRoot);
    expect(await store.readSecrets()).toEqual({});
    expect(await store.listSecretNames()).toEqual([]);
  });

  test('puts and reads secrets with sorted keys and immutable return', async () => {
    const store = await createSecretStore(configRoot);
    await store.putSecret('ZEBRA_KEY', 'zebra-val');
    await store.putSecret('ALPHA_KEY', 'alpha-val');
    await store.putSecret('BETA_KEY', 'beta-val');

    const names = await store.listSecretNames();
    expect(names).toEqual(['ALPHA_KEY', 'BETA_KEY', 'ZEBRA_KEY']);

    const secrets = await store.readSecrets();
    expect(secrets).toEqual({
      ALPHA_KEY: 'alpha-val',
      BETA_KEY: 'beta-val',
      ZEBRA_KEY: 'zebra-val',
    });
    expect(Object.isFrozen(secrets)).toBe(true);

    const fileContent = fs.readFileSync(path.join(configRoot, SECRETS_FILE_NAME), 'utf8');
    const diskKeys = Object.keys(JSON.parse(fileContent));
    expect(diskKeys).toEqual(['ALPHA_KEY', 'BETA_KEY', 'ZEBRA_KEY']);
  });

  test('supports bulk put and selective deletion', async () => {
    const store = await createSecretStore(configRoot);
    await store.putSecrets({
      API_TOKEN: 'secret-token-123',
      WEBHOOK_KEY: 'secret-webhook-456',
      TEMP_KEY: 'to-be-deleted',
    });

    expect(await store.listSecretNames()).toEqual(['API_TOKEN', 'TEMP_KEY', 'WEBHOOK_KEY']);
    await store.deleteSecret('TEMP_KEY');
    expect(await store.listSecretNames()).toEqual(['API_TOKEN', 'WEBHOOK_KEY']);

    await store.deleteSecrets(['API_TOKEN', 'NON_EXISTENT']);
    expect(await store.listSecretNames()).toEqual(['WEBHOOK_KEY']);
  });

  test('rejects invalid key names and non-string values without leaking secret in error', async () => {
    const store = await createSecretStore(configRoot);
    const sensitiveValue = 'SUPER_SENSITIVE_PLAINTEXT_12345';

    await expect(store.putSecret('invalid-key!', sensitiveValue)).rejects.toThrow();
    try {
      await store.putSecret('invalid-key!', sensitiveValue);
    } catch (err: unknown) {
      expect((err as Error).message).not.toContain(sensitiveValue);
      expect((err as Error).message).toContain('invalid-key!');
    }

    // @ts-expect-error test non-string value runtime check
    await expect(store.putSecret('VALID_KEY', 12345)).rejects.toThrow(/must be a string/);
    try {
      // @ts-expect-error test non-string value runtime check
      await store.putSecret('VALID_KEY', 12345);
    } catch (err: unknown) {
      expect((err as Error).message).not.toContain(sensitiveValue);
    }
  });

  test('handles concurrent mutations cleanly with in-memory lock', async () => {
    const store = await createSecretStore(configRoot);
    const count = 20;

    await Promise.all(
      Array.from({ length: count }, (_, i) => store.putSecret(`CONCURRENT_KEY_${String(i).padStart(2, '0')}`, `val-${i}`))
    );

    const names = await store.listSecretNames();
    expect(names).toHaveLength(count);
    const secrets = await store.readSecrets();
    for (let i = 0; i < count; i++) {
      expect(secrets[`CONCURRENT_KEY_${String(i).padStart(2, '0')}`]).toBe(`val-${i}`);
    }
  });

  test('handles malformed JSON and empty secrets file safely', async () => {
    const secretsPath = path.join(configRoot, SECRETS_FILE_NAME);
    fs.writeFileSync(secretsPath, '', 'utf8');
    const store = await createSecretStore(configRoot);
    expect(await store.readSecrets()).toEqual({});

    fs.writeFileSync(secretsPath, '{"NOT_VALID_JSON', 'utf8');
    await expect(store.readSecrets()).rejects.toThrow(/malformed JSON/);
  });
  test('rejects non-existent directory and non-object file content', async () => {
    await expect(createSecretStore(path.join(configRoot, 'does-not-exist'))).rejects.toThrow(/config root does not exist/);
    const secretsPath = path.join(configRoot, SECRETS_FILE_NAME);
    fs.writeFileSync(secretsPath, JSON.stringify(['not', 'an', 'object']), 'utf8');
    const store = await createSecretStore(configRoot);
    await expect(store.readSecrets()).rejects.toThrow(/must contain a JSON object/);
  });


  test('wires secretStore into createReportServer in control mode', async () => {
    fs.writeFileSync(path.join(configRoot, 'default.json'), JSON.stringify({ schemaVersion: 1, projects: [] }), 'utf8');
    const server = await createReportServer(reportRoot, {
      mode: 'control',
      configRoot,
      host: '127.0.0.1',
      port: 0,
    });

    try {
      expect(server.secretStore).toBeDefined();
      await server.secretStore!.putSecret('TEST_SERVER_KEY', 'test-value');
      expect(await server.secretStore!.readSecrets()).toEqual({ TEST_SERVER_KEY: 'test-value' });
      expect(fs.existsSync(path.join(configRoot, SECRETS_FILE_NAME))).toBe(true);
    } finally {
      await server.close();
    }
  });
});
