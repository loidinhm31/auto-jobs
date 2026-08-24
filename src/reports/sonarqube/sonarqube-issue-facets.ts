import type { SonarFacetValue, SonarIssueFacets } from '../../result-types.js';

export const MAX_SONAR_FACETS = 64;
export const MAX_SONAR_FACET_LABEL = 128;
export const MAX_SONAR_FACET_COUNT = 10_000_000;

export interface SonarFacetCandidate {
  label: unknown;
  count: unknown;
}

export interface SonarFacetNormalization {
  facets: SonarIssueFacets;
  warnings: string[];
}

function normalizeCount(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 && value <= MAX_SONAR_FACET_COUNT ? value : undefined;
  }
  if (typeof value !== 'string' || !/^\d{1,8}$/u.test(value.trim())) return undefined;
  const count = Number(value.trim());
  return Number.isSafeInteger(count) && count <= MAX_SONAR_FACET_COUNT ? count : undefined;
}

function normalizeGroup(
  candidates: readonly SonarFacetCandidate[],
  label: string,
  warnings: string[],
): SonarFacetValue[] {
  const values: SonarFacetValue[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (typeof candidate.label !== 'string') {
      warnings.push(`SonarQube ${label} facet label is invalid`);
      continue;
    }
    const text = candidate.label.trim().slice(0, MAX_SONAR_FACET_LABEL);
    const count = normalizeCount(candidate.count);
    if (text.length === 0 || count === undefined) {
      warnings.push(`SonarQube ${label} facet entry is invalid`);
      continue;
    }
    if (seen.has(text.toLowerCase())) {
      warnings.push(`duplicate SonarQube ${label} facet was ignored`);
      continue;
    }
    if (values.length >= MAX_SONAR_FACETS) {
      warnings.push(`SonarQube ${label} facets exceeded the ${MAX_SONAR_FACETS}-item limit`);
      break;
    }
    seen.add(text.toLowerCase());
    values.push({ label: text, count });
  }
  return values;
}

export function normalizeSonarIssueFacets(input: {
  types: readonly SonarFacetCandidate[];
  severities: readonly SonarFacetCandidate[];
}): SonarFacetNormalization {
  const warnings: string[] = [];
  const facets: SonarIssueFacets = {
    types: normalizeGroup(input.types, 'Type', warnings),
    severities: normalizeGroup(input.severities, 'Severity', warnings),
  };
  return { facets, warnings: [...new Set(warnings)] };
}

export function sanitizeSonarIssueFacets(
  facets: SonarIssueFacets,
  sanitize: (value: string) => string,
): SonarIssueFacets {
  return {
    types: facets.types.slice(0, MAX_SONAR_FACETS).map((item) => ({
      label: sanitize(item.label).slice(0, MAX_SONAR_FACET_LABEL), count: item.count,
    })),
    severities: facets.severities.slice(0, MAX_SONAR_FACETS).map((item) => ({
      label: sanitize(item.label).slice(0, MAX_SONAR_FACET_LABEL), count: item.count,
    })),
  };
}
