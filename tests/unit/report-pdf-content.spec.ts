import { expect, test } from '@playwright/test';
import { extractReportPdfContent } from '../../src/reporting/control-page/utils/report-pdf-content.js';
import type {
  ReportPdfFigureBlock,
  ReportPdfHeadingBlock,
  ReportPdfListBlock,
  ReportPdfParagraphBlock,
  ReportPdfTableBlock,
} from '../../src/reporting/control-page/types/report-pdf-types.js';
import { elem } from './helpers/mock-dom-element.js';

test.describe('report-pdf-content: semantic DOM adapter', () => {
  test('extracts title, headings, badges, and anchor IDs in document order', () => {
    const root = elem('div', { id: 'project-report-surface' }, [
      elem('header', { class: 'report-header' }, [
        elem('p', { class: 'eyebrow' }, ['Offline vulnerability evidence']),
        elem('h1', {}, ['Service A vulnerability report']),
        elem('p', { class: 'lede' }, [
          'Project ', elem('code', {}, ['service-a']), ' · run ', elem('code', {}, ['run-1']), ' · ', elem('span', { class: 'state-badge state-found' }, ['found']),
        ]),
        elem('p', { class: 'quick-links' }, [
          elem('a', { href: '#jenkins-job' }, ['jenkins-job']), ' · ', elem('a', { href: '#artifacts' }, ['artifacts']),
        ]),
      ]),
      elem('main', {}, [
        elem('section', { id: 'jenkins-job' }, [
          elem('div', { class: 'section-heading' }, [
            elem('div', {}, [
              elem('p', { class: 'eyebrow' }, ['Jenkins']),
              elem('h2', { id: 'jenkins-heading' }, ['Jenkins build evidence']),
            ]),
            elem('span', { class: 'state-badge state-found' }, ['found']),
          ]),
          elem('p', { class: 'state-message' }, ['Captured build console.']),
        ]),
      ]),
      elem('footer', {}, [elem('p', {}, ['Generated from normalized schema-v3 evidence.'])]),
    ]);

    const content = extractReportPdfContent(root as unknown as HTMLElement);

    expect(content.title).toBe('Service A vulnerability report');
    expect(content.anchorIds).toContain('jenkins-job');

    const heading = content.blocks.find(
      (b): b is ReportPdfHeadingBlock => b.type === 'heading' && b.text === 'Jenkins build evidence',
    );
    expect(heading).toBeDefined();
    expect(heading?.level).toBe(2);
    expect(heading?.eyebrow).toBe('Jenkins');
    expect(heading?.badge?.text).toBe('found');

    const footer = content.blocks.find((b) => b.type === 'footer');
    expect(footer).toBeDefined();
  });

  test('extracts findings table with headers, rows, and external link annotations', () => {
    const root = elem('div', { id: 'project-report-surface' }, [
      elem('h1', {}, ['Vulnerability Report']),
      elem('table', { class: 'findings-table' }, [
        elem('caption', {}, ['Retained Snyk detailed findings']),
        elem('thead', {}, [
          elem('tr', {}, [
            elem('th', {}, ['ID']),
            elem('th', {}, ['Title']),
            elem('th', {}, ['Severity']),
            elem('th', {}, ['Module']),
            elem('th', {}, ['Remediation']),
            elem('th', {}, ['Paths']),
            elem('th', {}, ['References']),
          ]),
        ]),
        elem('tbody', {}, [
          elem('tr', {}, [
            elem('td', {}, ['SNYK-JS-001']),
            elem('td', {}, ['Prototype Pollution']),
            elem('td', {}, [elem('span', { class: 'severity severity-high' }, ['high'])]),
            elem('td', {}, ['lodash']),
            elem('td', {}, ['Upgrade to 4.17.21']),
            elem('td', {}, ['app > lodash']),
            elem('td', {}, [
              elem('a', { href: 'https://snyk.io/vuln/SNYK-JS-001' }, ['https://snyk.io/vuln/SNYK-JS-001']),
            ]),
          ]),
        ]),
      ]),
    ]);

    const content = extractReportPdfContent(root as unknown as HTMLElement);

    const tableBlock = content.blocks.find((b): b is ReportPdfTableBlock => b.type === 'table');
    expect(tableBlock).toBeDefined();
    expect(tableBlock?.variant).toBe('findings');
    expect(tableBlock?.caption).toBe('Retained Snyk detailed findings');
    expect(tableBlock?.headers).toEqual(['ID', 'Title', 'Severity', 'Module', 'Remediation', 'Paths', 'References']);
    expect(tableBlock?.rows).toHaveLength(1);

    const row = tableBlock!.rows[0]!;
    expect(row[0]?.text).toBe('SNYK-JS-001');
    expect(row[1]?.text).toBe('Prototype Pollution');
    expect(row[2]?.text).toBe('high');

    const refCell = row[6]!;
    const linkSpan = refCell.spans.find((s) => s.link?.isExternal);
    expect(linkSpan).toBeDefined();
    expect(linkSpan?.link?.href).toBe('https://snyk.io/vuln/SNYK-JS-001');
  });

  test('extracts figures with image source and caption links while skipping non-report UI', () => {
    const root = elem('div', { id: 'project-report-surface' }, [
      elem('div', { class: 'skip-link' }, ['Skip to content']),
      elem('div', { class: 'control-report-bar' }, ['Controls']),
      elem('h1', {}, ['Vulnerability Report']),
      elem('figure', { class: 'evidence-figure' }, [
        elem('img', { src: 'sonarqube-overall.png', alt: 'SonarQube Overall evidence screenshot' }),
        elem('figcaption', {}, [
          'SonarQube Overall evidence. ',
          elem('a', { class: 'source-link', href: 'https://sonar.example.com/dashboard?id=service-a' }, [
            'Open validated source',
          ]),
        ]),
      ]),
    ]);

    const content = extractReportPdfContent(root as unknown as HTMLElement);

    const figureBlock = content.blocks.find((b): b is ReportPdfFigureBlock => b.type === 'figure');
    expect(figureBlock).toBeDefined();
    expect(figureBlock?.src).toBe('sonarqube-overall.png');
    expect(figureBlock?.alt).toBe('SonarQube Overall evidence screenshot');

    const linkSpan = figureBlock?.captionSpans.find((s) => s.link?.isExternal);
    expect(linkSpan).toBeDefined();
    expect(linkSpan?.link?.href).toBe('https://sonar.example.com/dashboard?id=service-a');

    const paragraphs = content.blocks.filter((b): b is ReportPdfParagraphBlock => b.type === 'paragraph');
    const allText = paragraphs.flatMap((p) => p.spans.map((s) => s.text)).join(' ');
    expect(allText).not.toContain('Skip to content');
    expect(allText).not.toContain('Controls');
  });

  test('extracts lists with correct variant and items', () => {
    const root = elem('div', { id: 'project-report-surface' }, [
      elem('h1', {}, ['Vulnerability Report']),
      elem('ul', { class: 'warning-list' }, [
        elem('li', {}, ['Warning: Snyk token missing.']),
        elem('li', {}, ['Warning: SonarQube analysis timed out.']),
      ]),
      elem('ul', { class: 'provenance-list' }, [
        elem('li', {}, [
          elem('a', { href: 'https://snyk.example.com/project/1' }, ['https://snyk.example.com/project/1']),
          ' — Snyk project view',
        ]),
      ]),
    ]);

    const content = extractReportPdfContent(root as unknown as HTMLElement);

    const lists = content.blocks.filter((b): b is ReportPdfListBlock => b.type === 'list');
    expect(lists).toHaveLength(2);

    const warningList = lists.find((l) => l.variant === 'warning');
    expect(warningList).toBeDefined();
    expect(warningList?.items).toHaveLength(2);
    expect(warningList?.items[0]?.spans[0]?.text).toBe('Warning: Snyk token missing.');

    const provenanceList = lists.find((l) => l.variant === 'provenance');
    expect(provenanceList).toBeDefined();
    const linkSpan = provenanceList?.items[0]?.spans.find((s) => s.link?.isExternal);
    expect(linkSpan?.link?.href).toBe('https://snyk.example.com/project/1');
  });

  test('extracts definition lists (dl) with term and description metadata', () => {
    const root = elem('div', { id: 'project-report-surface' }, [
      elem('dl', { class: 'metadata-grid' }, [
        elem('div', {}, [
          elem('dt', {}, ['Job URL']),
          elem('dd', {}, [elem('a', { class: 'source-link', href: 'https://jenkins.example/job/service-a/' }, ['Open validated source'])]),
        ]),
        elem('div', {}, [elem('dt', {}, ['Observed']), elem('dd', {}, ['2026-09-24T10:00:00.000Z'])]),
      ]),
    ]);

    const content = extractReportPdfContent(root as unknown as HTMLElement);

    const dlBlock = content.blocks.find((b) => b.type === 'definition-list');
    expect(dlBlock).toBeDefined();
    if (dlBlock && dlBlock.type === 'definition-list') {
      expect(dlBlock.items).toHaveLength(2);
      expect(dlBlock.items[0]?.termSpans[0]?.text).toBe('Job URL');
      expect(dlBlock.items[0]?.descriptionSpans[0]?.link?.href).toBe('https://jenkins.example/job/service-a/');
      expect(dlBlock.items[1]?.termSpans[0]?.text).toBe('Observed');
      expect(dlBlock.items[1]?.descriptionSpans[0]?.text).toBe('2026-09-24T10:00:00.000Z');
    }
  });
});
