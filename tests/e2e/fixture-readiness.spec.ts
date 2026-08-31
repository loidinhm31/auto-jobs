import { expect, test } from '@playwright/test';

import { phase3Config } from './fixtures.js';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test('local Jenkins exposes login and the JCasC-seeded Pipeline job', async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);

  const config = phase3Config();
  const loginUrl = config.loginUrl;

  await expect
    .poll(
      async () => {
        try {
          return (await request.get(loginUrl, { timeout: 5_000 })).status();
        } catch {
          return 0;
        }
      },
      {
        timeout: 120_000,
        intervals: [250, 500, 1_000, 2_500],
        message: 'Jenkins login endpoint did not become ready',
      },
    )
    .toBe(200);

  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('heading', { name: /sign in to jenkins/i }),
  ).toBeVisible();

  await page.getByLabel('Username').fill(config.username);
  await page.getByLabel('Password').fill(config.password);
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page).not.toHaveURL(/\/login(?:[/?#]|$)/u);
  await page.goto(
    config.jobUrl,
  );
  await expect(
    page.getByRole('heading', { name: /playwright-vulnerability-report/i }),
  ).toBeVisible();
});
