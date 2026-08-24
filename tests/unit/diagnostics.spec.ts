import { expect, test } from '@playwright/test';

import { boundedDiagnostics, pushDiagnostic } from '../../src/workflow/diagnostics.js';

test('caps diagnostic history and each persisted observation', () => {
  const values: string[] = [];
  for (let index = 0; index < 40; index += 1) pushDiagnostic(values, `${index}-${'x'.repeat(700)}`);
  expect(values).toHaveLength(32);
  expect(values[0]).toMatch(/^8-/u);
  expect(values.every((value) => value.length <= 500)).toBe(true);
  expect(boundedDiagnostics(values)).toHaveLength(32);
});
