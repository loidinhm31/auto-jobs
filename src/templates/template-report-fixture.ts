import type { ProjectConfigDocumentV1, RunType } from '../config/config-types.js';
import { parseBrowserName, parsePositiveInteger } from '../config-values.js';
import { MAX_TEMPLATE_TOTAL_BYTES } from './template-fixture-file-io.js';
import {
  loadTemplateReportFixture,
  TEMPLATE_REPORT_ORIGIN,
} from './template-fixture-loader.js';
import {
  installTemplateReportRoutes,
  templateResponse,
} from './template-fixture-routes.js';
import type {
  TemplateReportFixture,
  TemplateResponse,
  TemplateRouteMiss,
  TemplateRouteRecorder,
} from './template-fixture-types.js';

export {
  MAX_TEMPLATE_TOTAL_BYTES,
  TEMPLATE_REPORT_ORIGIN,
  installTemplateReportRoutes,
  loadTemplateReportFixture,
  templateResponse,
};
export type {
  TemplateReportFixture,
  TemplateResponse,
  TemplateRouteMiss,
  TemplateRouteRecorder,
};

export function templateProjectDocument(
  env: NodeJS.ProcessEnv,
  fixture: TemplateReportFixture,
  runType: RunType = 'report',
): ProjectConfigDocumentV1 {
  const projectId = env['PROJECT_ID']?.trim() || 'template-reports';
  const projectName = env['PROJECT_NAME']?.trim() || 'Template reports';
  const artifactDir = env['ARTIFACT_DIR']?.trim() || 'reports';
  const origin = new URL(fixture.jobUrl).origin;
  const timeoutMs = parsePositiveInteger(
    env['TEMPLATE_TIMEOUT_MS']?.trim() || '300000',
    'TEMPLATE_TIMEOUT_MS',
  );
  return {
    schemaVersion: 1,
    projects: [
      {
        id: projectId,
        name: projectName,
        enabled: true,
        runType,
        loginUrl: fixture.loginUrl,
        jobUrl: fixture.jobUrl,
        timeoutMs,
        browser: parseBrowserName(env['PLAYWRIGHT_BROWSER']?.trim()),
        artifactDir,
        credentials: {
          usernameVariable: 'TEMPLATE_FIXTURE_USERNAME',
          passwordVariable: 'TEMPLATE_FIXTURE_PASSWORD',
        },
        sourceOrigins: { jenkins: [origin], snyk: [origin], sonarqube: [origin] },
        snyk: {
          allowedOrigins: [origin],
        },
        sonarqube: {
          allowedOrigins: [origin],
          projectId: fixture.sonarqubeProjectId,
        },
      },
    ],
  };
}
