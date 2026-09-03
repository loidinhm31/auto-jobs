import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  assertValidSecretKey,
  createSecretStore,
  isValidSecretKey,
} from '../../src/reporting/report-server-secret-store.js';
import { SECRETS_FILE_NAME } from '../../src/reporting/report-server-constants.js';

test.describe('Control SecretStore - Unit & Lifecycle', () => {
  let configRoot: string;

  test.beforeEach(async () => {
    configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'control-secret-store-test-'));
  });

  test.afterEach(async () => {
    fs.rmSync(configRoot, { recursive: true, force: true });
  });

  test('verifies empty store on missing file', async () => {
    const store = await createSecretStore(configRoot);
    const names = await store.listSecretNames();
    expect(names).toEqual([]);

    const secrets = await store.readSecrets();
    expect(secrets).toEqual({});
    expect(Object.isFrozen(secrets)).toBe(true);

    const secretsFilePath = path.join(configRoot, SECRETS_FILE_NAME);
    expect(fs.existsSync(secretsFilePath)).toBe(false);
  });

  test('putSecret creates secrets.local.json atomically without lingering tmp files', async () => {
    const store = await createSecretStore(configRoot);
    await store.putSecret('JENKINS_PASSWORD', 'super-secret-value-123');

    const secretsFilePath = path.join(configRoot, SECRETS_FILE_NAME);
    expect(fs.existsSync(secretsFilePath)).toBe(true);

    const fileContent = fs.readFileSync(secretsFilePath, 'utf8');
    const parsed = JSON.parse(fileContent);
    expect(parsed).toEqual({ JENKINS_PASSWORD: 'super-secret-value-123' });

    // Verify no temporary swap/tmp files remain in configRoot
    const dirEntries = fs.readdirSync(configRoot);
    const tmpFiles = dirEntries.filter((f) => f.includes('.tmp') || f.startsWith('.secrets.local.json'));
    expect(tmpFiles).toHaveLength(0);
  });

  test('verifies 0o600 file mode on POSIX platforms', async () => {
    const store = await createSecretStore(configRoot);
    await store.putSecret('API_KEY', 'test-key-val');

    const secretsFilePath = path.join(configRoot, SECRETS_FILE_NAME);
    const stat = fs.statSync(secretsFilePath);

    if (process.platform !== 'win32') {
      // In POSIX systems, mode must be strictly rw------- (0o600)
      const mode = stat.mode & 0o777;
      expect(mode).toBe(0o600);
    } else {
      // On Windows, verify file is created and has nonzero size
      expect(stat.isFile()).toBe(true);
      expect(stat.size).toBeGreaterThan(0);
    }
  });

  test('rejects invalid key names including traversal and non-identifiers', async () => {
    const invalidKeys = [
      'traversal/key',
      '../TRAVERSAL',
      '../../etc/passwd',
      'non-identifier-with-dashes',
      'has spaces in key',
      '123_STARTS_WITH_NUMBER',
      'INVALID.DOTS',
      '@SPECIAL_CHARS!',
      '__proto__',
      'prototype',
      'constructor',
      '',
    ];

    const store = await createSecretStore(configRoot);

    for (const key of invalidKeys) {
      expect(isValidSecretKey(key)).toBe(false);
      expect(() => assertValidSecretKey(key)).toThrow(/invalid secret key name/i);

      await expect(
        store.putSecret(key, 'value'),
      ).rejects.toThrow(/invalid secret key name/i);
    }
  });

  test('rejects non-string values without leaking secret value in error', async () => {
    const store = await createSecretStore(configRoot);
    const secretValue = 'sensitive-leak-value-999';

    // @ts-expect-error - testing runtime type validation
    await expect(store.putSecret('VALID_KEY', 12345)).rejects.toThrow(
      /must be a string/i,
    );

    // @ts-expect-error - testing runtime type validation
    await expect(store.putSecret('VALID_KEY', null)).rejects.toThrow(
      /must be a string/i,
    );

    // @ts-expect-error - testing runtime type validation
    await expect(store.putSecret('VALID_KEY', { secret: secretValue })).rejects.toThrow(
      /must be a string/i,
    );

    try {
      // @ts-expect-error - testing runtime type validation
      await store.putSecret('VALID_KEY', { value: secretValue });
    } catch (err: unknown) {
      expect((err as Error).message).not.toContain(secretValue);
    }
  });

  test('concurrent writes serialize cleanly and preserve all keys', async () => {
    const store = await createSecretStore(configRoot);
    const writeCount = 25;

    const promises = Array.from({ length: writeCount }, (_, i) => {
      const key = `CONCURRENT_VAR_${String(i).padStart(2, '0')}`;
      return store.putSecret(key, `val-${i}`);
    });

    await Promise.all(promises);

    const names = await store.listSecretNames();
    expect(names).toHaveLength(writeCount);

    const secrets = await store.readSecrets();
    for (let i = 0; i < writeCount; i++) {
      const key = `CONCURRENT_VAR_${String(i).padStart(2, '0')}`;
      expect(secrets[key]).toBe(`val-${i}`);
    }

    // Keys in disk file must be alphabetized
    const onDisk = JSON.parse(fs.readFileSync(path.join(configRoot, SECRETS_FILE_NAME), 'utf8'));
    const diskKeys = Object.keys(onDisk);
    expect(diskKeys).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  test('supports selective deletion and bulk operations', async () => {
    const store = await createSecretStore(configRoot);

    await store.putSecrets({
      ALPHA: '1',
      BETA: '2',
      GAMMA: '3',
      DELTA: '4',
    });

    let names = await store.listSecretNames();
    expect(names).toEqual(['ALPHA', 'BETA', 'DELTA', 'GAMMA']);

    await store.deleteSecret('BETA');
    names = await store.listSecretNames();
    expect(names).toEqual(['ALPHA', 'DELTA', 'GAMMA']);

    await store.deleteSecrets(['ALPHA', 'DELTA']);
    names = await store.listSecretNames();
    expect(names).toEqual(['GAMMA']);

    const secrets = await store.readSecrets();
    expect(secrets).toEqual({ GAMMA: '3' });
  });
});
