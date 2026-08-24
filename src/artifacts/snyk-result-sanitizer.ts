import { redactText } from '../config-errors.js';
import type {
  SnykFinding,
  SnykSourceEvidence,
  SnykSummary,
  SourceEvidence,
} from '../result-types.js';
import { assertSafeReferenceUrl } from '../security/url-policy.js';
import {
  MAX_CAPTURE_URL_LENGTH,
  MAX_SNYK_FINDINGS,
  MAX_SNYK_PATHS,
  MAX_SNYK_REFERENCES,
  MAX_SNYK_TEXT_LENGTH,
} from './result-validation.js';

type TextSanitizer = (value: string) => string;
const defaultSanitizer: TextSanitizer = (value) => redactText(value);

function safeReference(value: string, sanitize: TextSanitizer): string | undefined {
  try {
    const url = assertSafeReferenceUrl(sanitize(value));
    return url.length <= MAX_CAPTURE_URL_LENGTH ? url : undefined;
  } catch {
    return undefined;
  }
}

function safeFinding(value: SnykFinding, sanitize: TextSanitizer): SnykFinding {
  const references = value.references === undefined
    ? undefined
    : value.references.map((item) => safeReference(item, sanitize)).filter((item): item is string => item !== undefined).slice(0, MAX_SNYK_REFERENCES);
  return {
    ...value,
    ...(value.id === undefined ? {} : { id: sanitize(value.id).slice(0, 256) }),
    ...(value.title === undefined ? {} : { title: sanitize(value.title).slice(0, 512) }),
    ...(value.module === undefined ? {} : { module: sanitize(value.module).slice(0, 512) }),
    ...(value.description === undefined ? {} : { description: sanitize(value.description).slice(0, MAX_SNYK_TEXT_LENGTH) }),
    ...(value.remediation === undefined ? {} : { remediation: sanitize(value.remediation).slice(0, MAX_SNYK_TEXT_LENGTH) }),
    ...(value.paths === undefined ? {} : { paths: value.paths.slice(0, MAX_SNYK_PATHS).map((item) => sanitize(item).slice(0, MAX_SNYK_TEXT_LENGTH)) }),
    ...(references === undefined ? {} : { references }),
  };
}

function safeSummary(value: SnykSummary, sanitize: TextSanitizer): SnykSummary {
  return {
    counts: value.counts,
    detail: value.detail,
    ...(value.metadata === undefined ? {} : { metadata: {
      ...(value.metadata.scannedPath === undefined ? {} : { scannedPath: sanitize(value.metadata.scannedPath).slice(0, MAX_SNYK_TEXT_LENGTH) }),
      ...(value.metadata.packageManager === undefined ? {} : { packageManager: sanitize(value.metadata.packageManager).slice(0, 512) }),
      ...(value.metadata.dependencyCount === undefined ? {} : { dependencyCount: value.metadata.dependencyCount }),
      ...(value.metadata.dependencyPathCount === undefined ? {} : { dependencyPathCount: value.metadata.dependencyPathCount }),
    } }),
  };
}

export function safeSnykSource(
  value: SnykSourceEvidence,
  safeSource: (source: SourceEvidence) => SourceEvidence,
  sanitize: TextSanitizer = defaultSanitizer,
): SnykSourceEvidence {
  return {
    ...safeSource(value),
    ...(value.summary === undefined ? {} : { summary: safeSummary(value.summary, sanitize) }),
    ...(value.findings === undefined ? {} : { findings: value.findings.slice(0, MAX_SNYK_FINDINGS).map((finding) => safeFinding(finding, sanitize)) }),
  };
}
