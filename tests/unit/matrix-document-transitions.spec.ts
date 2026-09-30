import { expect, test } from '@playwright/test';
import {
  addJobColumn,
  addProjectMatrixDraft,
  cloneProjectMatrixDraft,
  computePrimaryJobUrl,
  generateJobColumnId,
  removeJobColumn,
  renameJobColumn,
  toggleProjectJobSelection,
  updateJobCell,
} from '../../src/reporting/control-page/hooks/matrix-document-transitions.js';
import type { ProjectConfigDocumentV1 } from '../../src/reporting/control-page/types/index.js';
function createSampleMatrixDoc(): ProjectConfigDocumentV1 {
  return {
    schemaVersion: 1,
    projectGroups: [
      { id: 'group-core', name: 'Core Services' },
    ],
    jobColumns: [
      { id: 'report', name: 'Report Job' },
      { id: 'build', name: 'Build Job' },
    ],
    projects: [
      {
        id: 'proj-alpha',
        name: 'Alpha Project',
        groupId: 'group-core',
        loginUrl: 'https://jenkins.example.com/login',
        jobUrl: 'https://jenkins.example.com/job/alpha-report',
        jobs: {
          report: 'https://jenkins.example.com/job/alpha-report',
          build: 'https://jenkins.example.com/job/alpha-build',
        },
        selectedJobColumns: ['report', 'build'],
        enabled: true,
        runType: 'report',
      },
      {
        id: 'proj-beta',
        name: 'Beta Project',
        loginUrl: 'https://jenkins.example.com/login',
        jobUrl: 'https://jenkins.example.com/job/beta-report',
        jobs: {
          report: 'https://jenkins.example.com/job/beta-report',
          build: '',
        },
        selectedJobColumns: ['report'],
        enabled: false,
        runType: 'auto-build',
      },
    ],
  };
}

test.describe('Phase 03: Pure Matrix Transitions & Immutability', () => {
  test.describe('computePrimaryJobUrl', () => {
    test('returns first nonblank URL in column declaration order', () => {
      const columns = [{ id: 'col1', name: 'Col 1' }, { id: 'col2', name: 'Col 2' }];
      expect(computePrimaryJobUrl({ col1: 'https://a.com', col2: 'https://b.com' }, columns)).toBe('https://a.com');
      expect(computePrimaryJobUrl({ col1: '', col2: 'https://b.com' }, columns)).toBe('https://b.com');
      expect(computePrimaryJobUrl({ col1: '   ', col2: 'https://b.com' }, columns)).toBe('https://b.com');
    });

    test('preserves verbatim URL string without trimming if nonblank', () => {
      const columns = [{ id: 'col1', name: 'Col 1' }];
      expect(computePrimaryJobUrl({ col1: '  https://a.com/job/  ' }, columns)).toBe('  https://a.com/job/  ');
    });

    test('returns empty string when no column is nonblank or jobs undefined', () => {
      const columns = [{ id: 'col1', name: 'Col 1' }];
      expect(computePrimaryJobUrl({}, columns)).toBe('');
      expect(computePrimaryJobUrl(undefined, columns)).toBe('');
      expect(computePrimaryJobUrl({ col1: '   ' }, columns)).toBe('');
    });
  });

  test.describe('generateJobColumnId', () => {
    test('generates progressive unique lowercase IDs', () => {
      expect(generateJobColumnId([])).toBe('job');
      expect(generateJobColumnId(['job'])).toBe('job-2');
      expect(generateJobColumnId(['job', 'job-2'])).toBe('job-3');
      expect(generateJobColumnId([{ id: 'job', name: 'Job' }, { id: 'job-3', name: 'Job 3' }])).toBe('job-2');
    });
  });

  test.describe('addJobColumn', () => {
    test('adds column to jobColumns, initializes all project rows with empty string, preserves selections and metadata', () => {
      const doc = createSampleMatrixDoc();
      const updated = addJobColumn(doc, { id: 'deploy', name: 'Deploy' });

      expect(updated.jobColumns?.length).toBe(3);
      expect(updated.jobColumns?.[2]).toEqual({ id: 'deploy', name: 'Deploy' });
      expect(updated.projectGroups).toEqual(doc.projectGroups);

      // Verify each project has empty cell for new column and original selection unchanged
      expect(updated.projects[0]?.jobs?.deploy).toBe('');
      expect(updated.projects[0]?.selectedJobColumns).toEqual(['report', 'build']);
      expect(updated.projects[0]?.groupId).toBe('group-core');
      expect(updated.projects[1]?.jobs?.deploy).toBe('');
      expect(updated.projects[1]?.selectedJobColumns).toEqual(['report']);
    });

    test('returns original document reference on duplicate ID or invalid ID', () => {
      const doc = createSampleMatrixDoc();
      expect(addJobColumn(doc, { id: 'report', name: 'Report 2' })).toBe(doc);
      expect(addJobColumn(doc, { id: 'REPORT', name: 'Report Upper' })).toBe(doc);
      expect(addJobColumn(doc, { id: 'invalid_id!', name: 'Symbols' })).toBe(doc);
      expect(addJobColumn(doc, { id: '', name: 'Empty' })).toBe(doc);
    });

    test('returns original document reference when at max columns capacity', () => {
      const doc = createSampleMatrixDoc();
      const fiftyColumns = Array.from({ length: 50 }, (_, i) => ({ id: `col-${i}`, name: `Col ${i}` }));
      const maxDoc: ProjectConfigDocumentV1 = { ...doc, jobColumns: fiftyColumns };
      expect(addJobColumn(maxDoc, { id: 'overflow', name: 'Overflow' })).toBe(maxDoc);
    });
  });

  test.describe('renameJobColumn', () => {
    test('updates column name without altering column IDs, URL keys, or rows', () => {
      const doc = createSampleMatrixDoc();
      const updated = renameJobColumn(doc, 'report', 'Vulnerability Scan');

      expect(updated.jobColumns?.find((c) => c.id === 'report')?.name).toBe('Vulnerability Scan');
      expect(updated.projects[0]?.jobs?.report).toBe('https://jenkins.example.com/job/alpha-report');
      expect(updated.projects[0]?.selectedJobColumns).toEqual(['report', 'build']);
      expect(updated.projectGroups).toEqual(doc.projectGroups);
    });

    test('returns original document reference on identical name, missing ID, or empty name', () => {
      const doc = createSampleMatrixDoc();
      expect(renameJobColumn(doc, 'report', 'Report Job')).toBe(doc);
      expect(renameJobColumn(doc, 'nonexistent', 'Name')).toBe(doc);
      expect(renameJobColumn(doc, 'report', '   ')).toBe(doc);
    });
  });

  test.describe('removeJobColumn', () => {
    test('removes column from jobColumns, strips jobs key and selection from all rows, recalculates primary mirror', () => {
      const doc = createSampleMatrixDoc();
      const updated = removeJobColumn(doc, 'report');

      expect(updated).not.toBeNull();
      expect(updated!.jobColumns?.length).toBe(1);
      expect(updated!.jobColumns?.[0]?.id).toBe('build');

      // Alpha row: report removed, build remains; build is now primary mirror
      expect('report' in (updated!.projects[0]?.jobs ?? {})).toBe(false);
      expect(updated!.projects[0]?.selectedJobColumns).toEqual(['build']);
      expect(updated!.projects[0]?.jobUrl).toBe('https://jenkins.example.com/job/alpha-build');
      expect(updated!.projects[0]?.groupId).toBe('group-core');

      // Beta row: report removed, build was empty; primary mirror is now empty
      expect('report' in (updated!.projects[1]?.jobs ?? {})).toBe(false);
      expect(updated!.projects[1]?.selectedJobColumns).toEqual([]);
      expect(updated!.projects[1]?.jobUrl).toBe('');
    });

    test('returns null when removing sole remaining column (requires at least 1 column)', () => {
      const singleColDoc: ProjectConfigDocumentV1 = {
        schemaVersion: 1,
        jobColumns: [{ id: 'sole', name: 'Sole Column' }],
        projects: [
          {
            id: 'p1',
            name: 'P1',
            loginUrl: 'https://jenkins.example.com/login',
            jobUrl: 'https://jenkins.example.com/job/p1',
            jobs: { sole: 'https://jenkins.example.com/job/p1' },
            selectedJobColumns: ['sole'],
          },
        ],
      };
      expect(removeJobColumn(singleColDoc, 'sole')).toBeNull();
    });

    test('returns original document reference when columnId does not exist', () => {
      const doc = createSampleMatrixDoc();
      expect(removeJobColumn(doc, 'nonexistent')).toBe(doc);
    });
  });

  test.describe('updateJobCell', () => {
    test('updates cell URL, recalculates primary mirror, preserves structural sharing for untouched rows', () => {
      const doc = createSampleMatrixDoc();
      const updated = updateJobCell(doc, 0, 'report', 'https://jenkins.example.com/job/alpha-updated');

      expect(updated.projects[0]?.jobs?.report).toBe('https://jenkins.example.com/job/alpha-updated');
      expect(updated.projects[0]?.jobUrl).toBe('https://jenkins.example.com/job/alpha-updated');
      // Untouched row retains strict reference equality
      expect(updated.projects[1]).toBe(doc.projects[1]);
    });

    test('returns original document reference on identical cell value (no-op immutability)', () => {
      const doc = createSampleMatrixDoc();
      const currentUrl = doc.projects[0]?.jobs?.report!;
      expect(updateJobCell(doc, 0, 'report', currentUrl)).toBe(doc);
    });

    test('returns original document reference on out of bounds project index', () => {
      const doc = createSampleMatrixDoc();
      expect(updateJobCell(doc, 99, 'report', 'https://foo.com')).toBe(doc);
    });
  });

  test.describe('toggleProjectJobSelection', () => {
    test('toggles selection on target project and preserves structural sharing for untouched rows', () => {
      const doc = createSampleMatrixDoc();
      // Select build on proj-beta (index 1)
      const step1 = toggleProjectJobSelection(doc, 1, 'build', true);
      expect(step1.projects[1]?.selectedJobColumns).toEqual(['report', 'build']);
      expect(step1.projects[0]).toBe(doc.projects[0]);

      // Deselect report on proj-beta
      const step2 = toggleProjectJobSelection(step1, 1, 'report', false);
      expect(step2.projects[1]?.selectedJobColumns).toEqual(['build']);
      expect(step2.projects[0]).toBe(doc.projects[0]);
    });

    test('returns original document reference when selection state is already identical (no-op)', () => {
      const doc = createSampleMatrixDoc();
      // proj-alpha already has 'report' selected
      expect(toggleProjectJobSelection(doc, 0, 'report', true)).toBe(doc);
      // proj-beta already has 'build' deselected
      expect(toggleProjectJobSelection(doc, 1, 'build', false)).toBe(doc);
    });

    test('returns original document reference on out of bounds project index', () => {
      const doc = createSampleMatrixDoc();
      expect(toggleProjectJobSelection(doc, 99, 'report', true)).toBe(doc);
    });
  });

  test.describe('addProjectMatrixDraft', () => {
    test('adds new project with declared column keys initialized to empty, selection reset to []', () => {
      const doc = createSampleMatrixDoc();
      const result = addProjectMatrixDraft(doc);

      expect(result).not.toBeNull();
      expect(result!.projectId).toBe('new-project');
      expect(result!.document.projects.length).toBe(3);

      const added = result!.document.projects[2]!;
      expect(added.id).toBe('new-project');
      expect(added.name).toBe('New Project');
      expect(added.jobs).toEqual({ report: '', build: '' });
      expect(added.selectedJobColumns).toEqual([]);
      expect(added.enabled).toBe(true);
    });

    test('handles ID collisions gracefully by incrementing suffix', () => {
      const doc = createSampleMatrixDoc();
      const docWithExisting = {
        ...doc,
        projects: [...doc.projects, { ...doc.projects[0]!, id: 'new-project' }],
      };
      const result = addProjectMatrixDraft(docWithExisting);
      expect(result?.projectId).toBe('new-project-2');
    });

    test('returns null when at 50 project limit', () => {
      const fiftyProjects = Array.from({ length: 50 }, (_, i) => ({
        ...createSampleMatrixDoc().projects[0]!,
        id: `p-${i}`,
      }));
      const fullDoc = { ...createSampleMatrixDoc(), projects: fiftyProjects };
      expect(addProjectMatrixDraft(fullDoc)).toBeNull();
    });
  });

  test.describe('cloneProjectMatrixDraft', () => {
    test('copies declared column URLs, resets selectedJobColumns to [], disables clone, removes groupId', () => {
      const doc = createSampleMatrixDoc();
      const source = doc.projects[0]!;
      const result = cloneProjectMatrixDraft(doc, source);

      expect(result).not.toBeNull();
      expect(result!.projectId).toBe('proj-alpha-copy');
      expect(result!.document.projects.length).toBe(3);

      const cloned = result!.document.projects[2]!;
      expect(cloned.id).toBe('proj-alpha-copy');
      expect(cloned.name).toBe('Alpha Project (copy)');
      expect(cloned.enabled).toBe(false);
      expect('groupId' in cloned).toBe(false);
      expect(cloned.jobs).toEqual({
        report: 'https://jenkins.example.com/job/alpha-report',
        build: 'https://jenkins.example.com/job/alpha-build',
      });
      // Selection MUST be reset to [] so clone never implicitly executes
      expect(cloned.selectedJobColumns).toEqual([]);
    });

    test('returns null when at 50 project limit', () => {
      const fiftyProjects = Array.from({ length: 50 }, (_, i) => ({
        ...createSampleMatrixDoc().projects[0]!,
        id: `p-${i}`,
      }));
      const fullDoc = { ...createSampleMatrixDoc(), projects: fiftyProjects };
      expect(cloneProjectMatrixDraft(fullDoc, fiftyProjects[0]!)).toBeNull();
    });
  });
});
