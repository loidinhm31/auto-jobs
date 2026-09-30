import { expect, test } from '@playwright/test';
import React from 'react';
import { renderToString } from 'react-dom/server';

import type {
  JobColumnInput,
  ProjectConfigDocumentV1,
  ProjectConfigInput,
} from '../../src/reporting/control-page/types/index.js';
import { JobColumnHeader } from '../../src/reporting/control-page/components/molecules/job-column-header.js';
import { ProjectJobCell } from '../../src/reporting/control-page/components/molecules/project-job-cell.js';
import { ProjectJobSelection } from '../../src/reporting/control-page/components/molecules/project-job-selection.js';
import { MatrixRowSettings } from '../../src/reporting/control-page/components/molecules/matrix-row-settings.js';
import { ProjectsJobMatrix } from '../../src/reporting/control-page/components/organisms/projects-job-matrix.js';

const sampleColumn: JobColumnInput = {
  id: 'build-job',
  name: 'Build Job',
};

const sampleProject: ProjectConfigInput = {
  id: 'proj-service',
  name: 'Service API',
  loginUrl: 'https://jenkins.example.com/login',
  jobUrl: 'https://jenkins.example.com/job/service',
  jobs: {
    'build-job': 'https://jenkins.example.com/job/service',
  },
  selectedJobColumns: ['build-job'],
  enabled: true,
};

test.describe('Matrix UI Molecules & Organisms Unit Tests', () => {
  test.describe('JobColumnHeader', () => {
    test('renders column heading and action buttons', () => {
      const html = renderToString(
        React.createElement(JobColumnHeader, {
          column: sampleColumn,
          columnIndex: 0,
          totalColumns: 2,
          onRename: () => { },
          onRemove: () => { },
        }),
      );

      expect(html).toContain('Build Job');
      expect(html).toContain('id="btn-rename-col-build-job"');
      expect(html).toContain('id="btn-remove-col-build-job"');
    });

    test('hides remove button when totalColumns is 1 (cannot delete sole column)', () => {
      const html = renderToString(
        React.createElement(JobColumnHeader, {
          column: sampleColumn,
          columnIndex: 0,
          totalColumns: 1,
          onRename: () => { },
          onRemove: () => { },
        }),
      );

      expect(html).toContain('Build Job');
      expect(html).toContain('id="btn-rename-col-build-job"');
      expect(html).not.toContain('id="btn-remove-col-build-job"');
    });
  });

  test.describe('ProjectJobCell', () => {
    test('renders input with accessible label, stable id, and external link when valid', () => {
      const html = renderToString(
        React.createElement(ProjectJobCell, {
          projectId: 'proj-service',
          projectName: 'Service API',
          columnId: 'build-job',
          columnName: 'Build Job',
          url: 'https://jenkins.example.com/job/service',
          isPrimary: true,
          onChange: () => { },
        }),
      );

      expect(html).toContain('id="cell-proj-service-build-job"');
      expect(html).toContain('aria-label="Service API - Build Job URL"');
      expect(html).toContain('value="https://jenkins.example.com/job/service"');
      expect(html).toContain('href="https://jenkins.example.com/job/service"');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
      expect(html).toContain('Primary URL');
    });

    test('renders error message when error prop is present', () => {
      const html = renderToString(
        React.createElement(ProjectJobCell, {
          projectId: 'proj-service',
          projectName: 'Service API',
          columnId: 'build-job',
          columnName: 'Build Job',
          url: 'invalid-url',
          error: 'Must be a valid HTTP(S) URL',
          onChange: () => { },
        }),
      );

      expect(html).toContain('aria-invalid="true"');
      expect(html).toContain('id="error-proj-service-build-job"');
      expect(html).toContain('Must be a valid HTTP(S) URL');
    });
  });

  test.describe('ProjectJobSelection', () => {
    test('renders checkboxes with labels and indicators for each declared column', () => {
      const columns: JobColumnInput[] = [
        { id: 'col-1', name: 'Col 1' },
        { id: 'col-2', name: 'Col 2' },
      ];
      const jobs = {
        'col-1': 'https://jenkins.example.com/job/1',
        'col-2': '', // empty -> should show skip indicator
      };

      const html = renderToString(
        React.createElement(ProjectJobSelection, {
          projectId: 'proj-1',
          projectName: 'Project One',
          columns,
          jobs,
          selectedColumnIds: ['col-1', 'col-2'],
          onToggleColumn: () => { },
        }),
      );

      expect(html).toContain('id="checkbox-select-proj-1-col-1"');
      expect(html).toContain('id="checkbox-select-proj-1-col-2"');
      expect(html).toContain('Col 1');
      expect(html).toContain('Col 2');
      // Col 2 is empty and selected -> skip indicator should appear
      expect(html).toContain('id="skip-hint-proj-1-col-2"');
      expect(html).toContain('empty');
    });
  });

  test.describe('MatrixRowSettings', () => {
    test('renders project settings element with expected props', () => {
      const element = React.createElement(MatrixRowSettings, {
        isOpen: true,
        project: sampleProject,
        projectIndex: 0,
        onClose: () => { },
        onSave: () => { },
      });

      expect(element).toBeDefined();
      expect(element.type).toBe(MatrixRowSettings);
      expect(element.props.isOpen).toBe(true);
      expect(element.props.project.id).toBe('proj-service');
    });
  });

  test.describe('ProjectsJobMatrix', () => {
    test('renders complete semantic table with toolbar, columns, and rows', () => {
      const document: ProjectConfigDocumentV1 = {
        schemaVersion: 1,
        jobColumns: [
          { id: 'report-col', name: 'Report Job' },
          { id: 'build-col', name: 'Build Job' },
        ],
        projects: [
          sampleProject,
          {
            id: 'proj-web',
            name: 'Web Frontend',
            loginUrl: 'https://jenkins.example.com/login',
            jobUrl: 'https://jenkins.example.com/job/web',
            jobs: { 'report-col': 'https://jenkins.example.com/job/web' },
            selectedJobColumns: ['report-col'],
            enabled: false,
          },
        ],
      };

      const html = renderToString(
        React.createElement(ProjectsJobMatrix, {
          document,
        }),
      );

      expect(html).toContain('id="projects-job-matrix"');
      expect(html).toContain('id="btn-add-project"');
      expect(html).toContain('id="btn-add-column"');
      expect(html).toContain('id="btn-open-defaults"');
      expect(html).toContain('id="badge-project-count"');
      expect(html).toContain('2 Projects');
      expect(html).toContain('id="badge-column-count"');
      expect(html).toContain('2 Columns');

      // Table elements
      expect(html).toContain('<table');
      expect(html).toContain('<thead');
      expect(html).toContain('<tbody');
      expect(html).toContain('data-project-id="proj-service"');
      expect(html).toContain('data-project-id="proj-web"');
      expect(html).toContain('id="input-project-id-proj-service"');
      expect(html).toContain('id="input-project-name-proj-service"');
      expect(html).toContain('id="checkbox-enabled-proj-service"');
      expect(html).toContain('id="btn-project-settings-proj-service"');
      expect(html).toContain('id="btn-clone-project-proj-service"');
      expect(html).toContain('id="btn-remove-project-proj-service"');
    });

    test('renders empty state when document is null', () => {
      const html = renderToString(
        React.createElement(ProjectsJobMatrix, {
          document: null,
        }),
      );

      expect(html).toContain('No configuration loaded');
    });
  });
});
