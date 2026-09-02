import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { expect, test } from '@playwright/test';

import {
  installTemplateReportRoutes,
  loadTemplateReportFixture,
  templateResponse,
} from '../../src/templates/template-report-fixture.js';

test.describe('template build fixture', () => {
  test('loads checked-in template fixture with build routes and DOM artifacts', async () => {
    const fixture = await loadTemplateReportFixture({});

    expect(fixture.buildPageUrl).toBe(
      'https://templates.invalid/job/Container%20Platform/job/ID/job/job-id/job/Service%20Name/job/Build/job/Build%20ID%20Service%20Name/job/release%252Fsit/build?delay=0sec',
    );
    expect(fixture.buildActionUrl).toBe(
      'https://templates.invalid/job/Container%20Platform/job/ID/job/job-id/job/Service%20Name/job/Build/job/Build%20ID%20Service%20Name/job/release%252Fsit/build',
    );

    expect(fixture.jenkinsHtml).toContain(fixture.buildPageUrl);
    expect(fixture.buildHtml).toContain(`action="${fixture.buildActionUrl}"`);
    expect(fixture.buildHtml).toContain('id="bottom-sticker"');
    expect(fixture.buildHtml).toContain('jenkins-button--primary');
    expect(fixture.buildHtml).toContain('Build</button>');

    const response = templateResponse(new URL(fixture.buildPageUrl), fixture);
    expect(response).toBeDefined();
    expect(response?.contentType).toBe('text/html; charset=utf-8');
    expect(response?.body).toBe(fixture.buildHtml);
  });

  test('routes POST to buildActionUrl with 303 redirect to jobUrl', async ({ page }) => {
    const fixture = await loadTemplateReportFixture({});
    const recorder = await installTemplateReportRoutes(page.context(), fixture);

    await page.goto(fixture.loginUrl);
    await page.locator('form').evaluate((form: HTMLFormElement) => form.submit());
    await page.waitForURL(fixture.jobUrl);

    await page.goto(fixture.buildPageUrl);
    const responsePromise = page.waitForResponse((res) => res.url() === fixture.buildActionUrl);
    await page.locator('#bottom-sticker button[type="submit"]').click();
    const postResponse = await responsePromise;

    expect(postResponse.status()).toBe(303);
    expect(postResponse.headers()['location']).toBe(fixture.jobUrl);
    expect(recorder.misses).toHaveLength(0);
  });

  test('rejects drifted build parameters link in job template', async () => {
    const roots: string[] = [];
    const copyTemplates = (suffix: string): string => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), `build-fixture-drift-${suffix}-`));
      fs.cpSync(path.resolve('templates'), path.join(root, 'templates'), { recursive: true });
      roots.push(root);
      return path.join(root, 'templates');
    };

    try {
      const missingLinkRoot = copyTemplates('missing-link');
      const jobFile = path.join(missingLinkRoot, 'jenkins-template', 'template.html');
      const jobHtml = fs.readFileSync(jobFile, 'utf8');
      fs.writeFileSync(jobFile, jobHtml.replace('Build with Parameters', 'Custom Build Text'));
      await expect(loadTemplateReportFixture({ TEMPLATES_DIR: missingLinkRoot })).rejects.toThrow(
        /Build with Parameters/iu,
      );

      const foreignOriginRoot = copyTemplates('foreign-origin');
      const foreignJobFile = path.join(foreignOriginRoot, 'jenkins-template', 'template.html');
      fs.writeFileSync(
        foreignJobFile,
        jobHtml.replace(
          'href="https://jenkins-example.example-domain.com/job/Container%20Platform/job/ID/job/job-id/job/Service%20Name/job/Build/job/Build%20ID%20Service%20Name/job/release%252Fsit/build?delay=0sec"',
          'href="https://evil-jenkins.example.com/job/Container%20Platform/job/ID/job/job-id/job/Service%20Name/job/Build/job/Build%20ID%20Service%20Name/job/release%252Fsit/build?delay=0sec"',
        ),
      );
      await expect(loadTemplateReportFixture({ TEMPLATES_DIR: foreignOriginRoot })).rejects.toThrow(
        /origin/iu,
      );
      const wrongPathRoot = copyTemplates('wrong-path');
      const wrongPathFile = path.join(wrongPathRoot, 'jenkins-template', 'template.html');
      fs.writeFileSync(
        wrongPathFile,
        jobHtml.replace('/release%252Fsit/build?delay=0sec', '/release%252Fsit/wrong-action?delay=0sec'),
      );
      await expect(loadTemplateReportFixture({ TEMPLATES_DIR: wrongPathRoot })).rejects.toThrow(
        /action path/iu,
      );
    } finally {
      for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects drifted build template canonical, form, sticker, and button', async () => {
    const roots: string[] = [];
    const copyTemplates = (suffix: string): string => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), `build-template-drift-${suffix}-`));
      fs.cpSync(path.resolve('templates'), path.join(root, 'templates'), { recursive: true });
      roots.push(root);
      return path.join(root, 'templates');
    };

    try {
      const canonicalRoot = copyTemplates('canonical');
      const buildFile = path.join(canonicalRoot, 'jenkins-template', 'template-build.html');
      const buildHtml = fs.readFileSync(buildFile, 'utf8');
      fs.writeFileSync(buildFile, buildHtml.replace('delay=0sec', 'delay=999sec'));
      await expect(loadTemplateReportFixture({ TEMPLATES_DIR: canonicalRoot })).rejects.toThrow(
        /canonical URL/iu,
      );

      const getFormRoot = copyTemplates('get-form');
      const getFormFile = path.join(getFormRoot, 'jenkins-template', 'template-build.html');
      fs.writeFileSync(getFormFile, buildHtml.replace('method="POST"', 'method="GET"'));
      await expect(loadTemplateReportFixture({ TEMPLATES_DIR: getFormRoot })).rejects.toThrow(
        /POST form/iu,
      );

      const stickerRoot = copyTemplates('sticker');
      const stickerFile = path.join(stickerRoot, 'jenkins-template', 'template-build.html');
      fs.writeFileSync(stickerFile, buildHtml.replace('id="bottom-sticker"', 'id="other-sticker"'));
      await expect(loadTemplateReportFixture({ TEMPLATES_DIR: stickerRoot })).rejects.toThrow(
        /bottom-sticker/iu,
      );

      const buttonClassRoot = copyTemplates('button-class');
      const buttonClassFile = path.join(buttonClassRoot, 'jenkins-template', 'template-build.html');
      fs.writeFileSync(
        buttonClassFile,
        buildHtml.replace('jenkins-!-build-color', 'jenkins-!-wrong-color'),
      );
      await expect(loadTemplateReportFixture({ TEMPLATES_DIR: buttonClassRoot })).rejects.toThrow(
        /missing required class/iu,
      );

      const buttonTextRoot = copyTemplates('button-text');
      const buttonTextFile = path.join(buttonTextRoot, 'jenkins-template', 'template-build.html');
      fs.writeFileSync(buttonTextFile, buildHtml.replace('>Build</button>', '>Submit</button>'));
      await expect(loadTemplateReportFixture({ TEMPLATES_DIR: buttonTextRoot })).rejects.toThrow(
        /button text must be "Build"/iu,
      );
    } finally {
      for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('rejects an oversized 9th template file', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'build-fixture-oversized-'));
    try {
      const templatesDir = path.join(root, 'templates');
      fs.cpSync(path.resolve('templates'), templatesDir, { recursive: true });
      const buildFile = path.join(templatesDir, 'jenkins-template', 'template-build.html');
      fs.appendFileSync(buildFile, `<!-- ${'x'.repeat(4 * 1024 * 1024 + 10)} -->`);
      await expect(loadTemplateReportFixture({ TEMPLATES_DIR: templatesDir })).rejects.toThrow(
        /per-file and total fixture budgets/iu,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
