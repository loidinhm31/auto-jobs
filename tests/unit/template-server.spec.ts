import * as http from 'node:http';

import { expect, test } from '@playwright/test';

import { createTemplateServer } from '../../src/templates/template-server.js';

test.describe('template-server', () => {
  test('starts on loopback with ephemeral port and serves all GET endpoints with correct content types', async () => {
    const server = await createTemplateServer({ host: '127.0.0.1', port: 0 });
    try {
      expect(server.port).toBeGreaterThan(0);
      expect(server.url).toBe(`http://127.0.0.1:${server.port}/`);

      const get = async (url: string) => {
        const response = await fetch(url);
        return {
          status: response.status,
          contentType: response.headers.get('content-type'),
          body: await response.text(),
        };
      };

      const loginRes = await get(server.fixture.loginUrl);
      expect(loginRes.status).toBe(200);
      expect(loginRes.contentType).toContain('text/html');
      expect(loginRes.body).toContain('Jenkins');

      const jobRes = await get(server.fixture.jobUrl);
      expect(jobRes.status).toBe(200);
      expect(jobRes.contentType).toContain('text/html');
      expect(jobRes.body).toBe(server.fixture.jenkinsHtml);

      const buildRes = await get(server.fixture.buildPageUrl);
      expect(buildRes.status).toBe(200);
      expect(buildRes.contentType).toContain('text/html');
      expect(buildRes.body).toBe(server.fixture.buildHtml);

      const snykHtmlRes = await get(server.fixture.snykReportUrl);
      expect(snykHtmlRes.status).toBe(200);
      expect(snykHtmlRes.contentType).toContain('text/html');
      expect(snykHtmlRes.body).toBe(server.fixture.snykHtml);

      const snykJsonRes = await get(server.fixture.snykSummaryUrl);
      expect(snykJsonRes.status).toBe(200);
      expect(snykJsonRes.contentType).toContain('application/json');
      const snykJson = JSON.parse(snykJsonRes.body) as { severity_counts?: { critical?: number } };
      expect(snykJson.severity_counts?.critical).toBeDefined();

      const sonarLoginRes = await get(server.fixture.sonarqubeLoginUrl);
      expect(sonarLoginRes.status).toBe(200);
      expect(sonarLoginRes.contentType).toContain('text/html');
      expect(sonarLoginRes.body).toBe(server.fixture.sonarqubeLoginHtml);

      const sonarOverallRes = await get(server.fixture.sonarqubeOverallUrl);
      expect(sonarOverallRes.status).toBe(200);
      expect(sonarOverallRes.contentType).toContain('text/html');
      expect(sonarOverallRes.body).toBe(server.fixture.sonarqubeOverallHtml);

      const sonarIssuesRes = await get(server.fixture.sonarqubeIssuesUrl);
      expect(sonarIssuesRes.status).toBe(200);
      expect(sonarIssuesRes.contentType).toContain('text/html');
      expect(sonarIssuesRes.body).toBe(server.fixture.sonarqubeIssuesHtml);
    } finally {
      await server.close();
    }
  });

  test('supports HEAD requests with matching headers and empty body', async () => {
    const server = await createTemplateServer({ host: '127.0.0.1', port: 0 });
    try {
      const headJob = await fetch(server.fixture.jobUrl, { method: 'HEAD' });
      expect(headJob.status).toBe(200);
      expect(headJob.headers.get('content-type')).toContain('text/html');
      expect(await headJob.text()).toBe('');

      const headSummary = await fetch(server.fixture.snykSummaryUrl, { method: 'HEAD' });
      expect(headSummary.status).toBe(200);
      expect(headSummary.headers.get('content-type')).toContain('application/json');
      expect(await headSummary.text()).toBe('');
    } finally {
      await server.close();
    }
  });

  test('handles POST redirects for login, build, and SonarQube authentication', async () => {
    const server = await createTemplateServer({ host: '127.0.0.1', port: 0 });
    try {
      const postNoRedirect = async (url: string) => {
        return fetch(url, { method: 'POST', redirect: 'manual' });
      };

      // Jenkins login POST
      const loginActionRes = await postNoRedirect(server.fixture.loginActionUrl);
      expect(loginActionRes.status).toBe(302);
      expect(loginActionRes.headers.get('location')).toBe(server.fixture.jobUrl);

      // Jenkins login fallback /j_spring_security_check
      const fallbackLoginRes = await postNoRedirect(`${server.url}j_spring_security_check`);
      expect(fallbackLoginRes.status).toBe(302);
      expect(fallbackLoginRes.headers.get('location')).toBe(server.fixture.jobUrl);

      // Jenkins build action POST
      const buildActionRes = await postNoRedirect(server.fixture.buildActionUrl);
      expect(buildActionRes.status).toBe(302);
      expect(buildActionRes.headers.get('location')).toBe(server.fixture.jobUrl);

      // SonarQube login action POST
      const sonarLoginRes = await postNoRedirect(server.fixture.sonarqubeLoginActionUrl);
      expect(sonarLoginRes.status).toBe(302);
      expect(sonarLoginRes.headers.get('location')).toBe(server.fixture.sonarqubeHomeUrl);
    } finally {
      await server.close();
    }
  });

  test('guards SonarQube home page until authenticated, then allows access', async () => {
    const server = await createTemplateServer({ host: '127.0.0.1', port: 0 });
    try {
      // 1. Unauthenticated: visiting SonarQube home yields login HTML
      const unauthRes = await fetch(server.fixture.sonarqubeHomeUrl);
      expect(unauthRes.status).toBe(200);
      expect(await unauthRes.text()).toBe(server.fixture.sonarqubeLoginHtml);

      // 2. Unauthenticated HEAD request to home yields login headers and empty body
      const unauthHead = await fetch(server.fixture.sonarqubeHomeUrl, { method: 'HEAD' });
      expect(unauthHead.status).toBe(200);
      expect(await unauthHead.text()).toBe('');

      // 3. Authenticate via POST /sessions/new
      const authPost = await fetch(server.fixture.sonarqubeLoginActionUrl, {
        method: 'POST',
        redirect: 'manual',
      });
      expect(authPost.status).toBe(302);
      expect(authPost.headers.get('location')).toBe(server.fixture.sonarqubeHomeUrl);

      // 4. Authenticated: visiting SonarQube home yields home HTML
      const authRes = await fetch(server.fixture.sonarqubeHomeUrl);
      expect(authRes.status).toBe(200);
      expect(await authRes.text()).toBe(server.fixture.sonarqubeHomeHtml);

      // 5. Reset auth state returns to unauthenticated guard
      server.resetAuthState();
      const resetRes = await fetch(server.fixture.sonarqubeHomeUrl);
      expect(resetRes.status).toBe(200);
      expect(await resetRes.text()).toBe(server.fixture.sonarqubeLoginHtml);
    } finally {
      await server.close();
    }
  });

  test('returns 404 for unrecognized GET and POST routes', async () => {
    const server = await createTemplateServer({ host: '127.0.0.1', port: 0 });
    try {
      const get404 = await fetch(`${server.url}nonexistent/resource`);
      expect(get404.status).toBe(404);

      const post404 = await fetch(`${server.url}unknown/action`, {
        method: 'POST',
        redirect: 'manual',
      });
      expect(post404.status).toBe(404);
    } finally {
      await server.close();
    }
  });

  test('returns 405 for unsupported HTTP methods', async () => {
    const server = await createTemplateServer({ host: '127.0.0.1', port: 0 });
    try {
      const putRes = await fetch(server.fixture.jobUrl, { method: 'PUT' });
      expect(putRes.status).toBe(405);

      const deleteRes = await fetch(server.fixture.jobUrl, { method: 'DELETE' });
      expect(deleteRes.status).toBe(405);
    } finally {
      await server.close();
    }
  });

  test('handles malformed URLs with 400 Bad Request', async () => {
    const server = await createTemplateServer({ host: '127.0.0.1', port: 0 });
    try {
      const statusCode = await new Promise<number>((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: server.port,
            path: '/%%invalid-url%%',
            method: 'GET',
          },
          (res) => {
            res.resume();
            res.once('end', () => resolve(res.statusCode ?? 0));
          },
        );
        req.once('error', reject);
        req.end();
      });
      expect(statusCode).toBe(400);
    } finally {
      await server.close();
    }
  });

  test('validates host and port configurations, rejecting non-loopback unless explicit', async () => {
    await expect(createTemplateServer({ host: '' })).rejects.toThrow('Template server host must be a non-empty host');
    await expect(createTemplateServer({ host: 'host with spaces' })).rejects.toThrow('Template server host must be a non-empty host');
    await expect(createTemplateServer({ port: -1 })).rejects.toThrow('Template server port must be between 0 and 65535');
    await expect(createTemplateServer({ port: 70_000 })).rejects.toThrow('Template server port must be between 0 and 65535');
    await expect(createTemplateServer({ port: 4174.5 })).rejects.toThrow('Template server port must be between 0 and 65535');

    // Non-loopback host without allowLan must throw
    await expect(createTemplateServer({ host: '192.168.1.100' })).rejects.toThrow(
      'Non-loopback template server binding requires explicit allowLan',
    );
  });

  test('supports graceful shutdown and idempotent close()', async () => {
    const server = await createTemplateServer({ host: '127.0.0.1', port: 0 });
    const port = server.port;

    // Multiple close calls should resolve cleanly without throwing
    await Promise.all([server.close(), server.close()]);

    // Connection should be refused after close
    await expect(
      new Promise<void>((resolve, reject) => {
        const req = http.request({ hostname: '127.0.0.1', port, path: '/', method: 'GET' });
        req.once('response', () => {
          req.destroy();
          resolve();
        });
        req.once('error', reject);
        req.end();
      }),
    ).rejects.toThrow();
  });
});
