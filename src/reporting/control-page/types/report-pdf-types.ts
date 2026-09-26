export interface ReportPdfLinkSpan {
  readonly text: string;
  readonly href: string;
  readonly isExternal: boolean;
}

export interface ReportPdfTextSpan {
  readonly text: string;
  readonly isBold?: boolean | undefined;
  readonly isCode?: boolean | undefined;
  readonly isBadge?: boolean | undefined;
  readonly badgeVariant?: string | undefined;
  readonly link?: ReportPdfLinkSpan | undefined;
}

export interface ReportPdfHeadingBlock {
  readonly type: 'heading';
  readonly level: number;
  readonly text: string;
  readonly anchorId?: string | undefined;
  readonly eyebrow?: string | undefined;
  readonly badge?: { readonly text: string; readonly variant?: string | undefined } | undefined;
}

export interface ReportPdfParagraphBlock {
  readonly type: 'paragraph';
  readonly spans: readonly ReportPdfTextSpan[];
  readonly anchorId?: string | undefined;
  readonly variant?:
    | 'normal'
    | 'eyebrow'
    | 'lede'
    | 'state-message'
    | 'security-note'
    | 'empty-state'
    | 'muted'
    | 'quick-links'
    | undefined;
}

export interface ReportPdfListItem {
  readonly spans: readonly ReportPdfTextSpan[];
}

export interface ReportPdfListBlock {
  readonly type: 'list';
  readonly ordered: boolean;
  readonly items: readonly ReportPdfListItem[];
  readonly anchorId?: string | undefined;
  readonly variant?: 'warning' | 'provenance' | 'artifact' | 'normal' | undefined;
}

export interface ReportPdfDefinitionItem {
  readonly termSpans: readonly ReportPdfTextSpan[];
  readonly descriptionSpans: readonly ReportPdfTextSpan[];
}

export interface ReportPdfDefinitionListBlock {
  readonly type: 'definition-list';
  readonly items: readonly ReportPdfDefinitionItem[];
  readonly anchorId?: string | undefined;
}

export interface ReportPdfTableCell {
  readonly text: string;
  readonly spans: readonly ReportPdfTextSpan[];
  readonly isHeader?: boolean | undefined;
  readonly colSpan?: number | undefined;
}

export interface ReportPdfTableBlock {
  readonly type: 'table';
  readonly caption?: string | undefined;
  readonly headers: readonly string[];
  readonly rows: ReadonlyArray<ReadonlyArray<ReportPdfTableCell>>;
  readonly anchorId?: string | undefined;
  readonly variant?: 'findings' | 'compact' | 'standard' | undefined;
}

export interface ReportPdfFigureBlock {
  readonly type: 'figure';
  readonly src: string;
  readonly alt: string;
  readonly captionSpans: readonly ReportPdfTextSpan[];
  readonly anchorId?: string | undefined;
}

export interface ReportPdfFooterBlock {
  readonly type: 'footer';
  readonly spans: readonly ReportPdfTextSpan[];
}

export type ReportPdfBlock =
  | ReportPdfHeadingBlock
  | ReportPdfParagraphBlock
  | ReportPdfListBlock
  | ReportPdfDefinitionListBlock
  | ReportPdfTableBlock
  | ReportPdfFigureBlock
  | ReportPdfFooterBlock;

export interface ExtractedReportPdfContent {
  readonly title: string;
  readonly blocks: readonly ReportPdfBlock[];
  readonly anchorIds: readonly string[];
}
