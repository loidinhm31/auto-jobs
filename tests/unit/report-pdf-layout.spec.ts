import { expect, test } from '@playwright/test';
import { jsPDF } from 'jspdf';
import type { ExtractedReportPdfContent } from '../../src/reporting/control-page/types/report-pdf-types.js';
import { registerReportPdfFonts } from '../../src/reporting/control-page/utils/report-pdf-fonts.js';
import { layoutReportPdfDocument } from '../../src/reporting/control-page/utils/report-pdf-layout.js';

test.describe('report-pdf-layout: document pagination and rendering', () => {
  const dummy1x1Png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const mockImageLoader = async () => ({ dataUrl: dummy1x1Png, width: 400, height: 300, format: 'PNG' as const });

  test('lays out complete report content with headings, tables, figures and footers', async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    registerReportPdfFonts(doc);

    const content: ExtractedReportPdfContent = {
      title: 'Service A vulnerability report',
      anchorIds: ['jenkins-job', 'snyk-test-report', 'artifacts'],
      blocks: [
        {
          type: 'heading',
          level: 1,
          text: 'Service A vulnerability report',
          eyebrow: 'Offline vulnerability evidence',
          badge: { text: 'found' },
        },
        {
          type: 'paragraph',
          variant: 'lede',
          spans: [
            { text: 'Project ' },
            { text: 'service-a', isCode: true },
            { text: ' · run ' },
            { text: '20260926_000000', isCode: true },
          ],
        },
        {
          type: 'paragraph',
          variant: 'quick-links',
          spans: [
            { text: 'jenkins-job', link: { text: 'jenkins-job', href: '#jenkins-job', isExternal: false } },
            { text: ' · ' },
            { text: 'snyk-test-report', link: { text: 'snyk-test-report', href: '#snyk-test-report', isExternal: false } },
          ],
        },
        {
          type: 'heading',
          level: 2,
          text: 'Jenkins build evidence',
          anchorId: 'jenkins-job',
          badge: { text: 'found' },
        },
        {
          type: 'paragraph',
          variant: 'state-message',
          spans: [{ text: 'Captured build console evidence.' }],
        },
        {
          type: 'definition-list',
          items: [
            {
              termSpans: [{ text: 'Job URL' }],
              descriptionSpans: [
                {
                  text: 'https://jenkins.example/job/service-a/',
                  link: {
                    text: 'https://jenkins.example/job/service-a/',
                    href: 'https://jenkins.example/job/service-a/',
                    isExternal: true,
                  },
                },
              ],
            },
            {
              termSpans: [{ text: 'Observed' }],
              descriptionSpans: [{ text: '2026-09-24T10:00:00.000Z' }],
            },
          ],
        },
        {
          type: 'figure',
          src: 'jenkins-console.png',
          alt: 'Jenkins build console',
          captionSpans: [{ text: 'Jenkins console captured at build time.' }],
        },
        {
          type: 'heading',
          level: 2,
          text: 'Snyk test report',
          anchorId: 'snyk-test-report',
          badge: { text: 'found' },
        },
        {
          type: 'table',
          variant: 'compact',
          caption: 'Snyk severity totals',
          headers: ['Severity', 'Count'],
          rows: [
            [
              { text: 'high', spans: [{ text: 'high' }] },
              { text: '2', spans: [{ text: '2' }] },
            ],
            [
              { text: 'medium', spans: [{ text: 'medium' }] },
              { text: '5', spans: [{ text: '5' }] },
            ],
          ],
        },
        {
          type: 'table',
          variant: 'findings',
          caption: 'Retained Snyk detailed findings',
          headers: ['ID', 'Title', 'Severity', 'Module', 'Remediation', 'Paths', 'References'],
          rows: [
            [
              { text: 'SNYK-JS-001', spans: [{ text: 'SNYK-JS-001' }] },
              { text: 'Prototype Pollution', spans: [{ text: 'Prototype Pollution' }] },
              { text: 'high', spans: [{ text: 'high', isBadge: true }] },
              { text: 'lodash', spans: [{ text: 'lodash' }] },
              { text: 'Upgrade to 4.17.21', spans: [{ text: 'Upgrade to 4.17.21' }] },
              { text: 'app > lodash', spans: [{ text: 'app > lodash' }] },
              {
                text: 'https://snyk.io/vuln/SNYK-JS-001',
                spans: [
                  {
                    text: 'https://snyk.io/vuln/SNYK-JS-001',
                    link: {
                      text: 'https://snyk.io/vuln/SNYK-JS-001',
                      href: 'https://snyk.io/vuln/SNYK-JS-001',
                      isExternal: true,
                    },
                  },
                ],
              },
            ],
          ],
        },
        {
          type: 'heading',
          level: 2,
          text: 'Artifacts and warnings',
          anchorId: 'artifacts',
        },
        {
          type: 'list',
          ordered: false,
          variant: 'warning',
          items: [{ spans: [{ text: 'Warning: Sample warning text.' }] }],
        },
        {
          type: 'footer',
          spans: [{ text: 'Generated from normalized schema-v3 evidence. No vendor HTML embedded.' }],
        },
      ],
    };

    await layoutReportPdfDocument(doc, content, mockImageLoader);

    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);

    const pdfOutput = doc.output();
    expect(pdfOutput.startsWith('%PDF-')).toBe(true);
    expect(pdfOutput.length).toBeGreaterThan(5000);

    // PDF contains link annotations for external URLs and internal anchors
    expect(pdfOutput).toContain('/Subtype /Link');
    expect(pdfOutput).toContain('https://snyk.io/vuln/SNYK-JS-001');
  });

  test('triggers page break when content overflows page height', async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    registerReportPdfFonts(doc);

    const paragraphs = Array.from({ length: 50 }, (_, i) => ({
      type: 'paragraph' as const,
      variant: 'normal' as const,
      spans: [
        {
          text: `Paragraph ${i + 1}: Vulnerability evidence detailed text explaining security issues in depth with extra lines to fill the page budget.`,
        },
      ],
    }));

    const content: ExtractedReportPdfContent = {
      title: 'Overflow Test',
      anchorIds: [],
      blocks: paragraphs,
    };

    await layoutReportPdfDocument(doc, content, mockImageLoader);

    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });
});
