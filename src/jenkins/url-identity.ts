import { assertAllowedUrl, isWithinBasePath } from '../config.js';
import type { BuildReference, QueueReference } from '../types.js';

function pathname(url: string): string {
  return new URL(url).pathname.replace(/\/+$/u, '');
}

function parsePositiveSafeInteger(value: string): number | undefined {
  if (!/^\d+$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export function isExactJobUrl(candidateUrl: string, jobUrl: string): boolean {
  try {
    const candidate = new URL(candidateUrl);
    const expected = new URL(jobUrl);
    return candidate.origin === expected.origin && candidate.search === '' && candidate.hash === '' &&
      expected.search === '' && expected.hash === '' && pathname(candidateUrl) === pathname(jobUrl);
  } catch {
    return false;
  }
}

export function validateJenkinsUrl(candidateUrl: string, baseUrl: string): string {
  return assertAllowedUrl(candidateUrl, baseUrl, [], 'Jenkins URL');
}

export function parseQueueReference(
  candidateUrl: string,
  baseUrl: string,
): QueueReference | undefined {
  let safeUrl: string;
  try {
    safeUrl = validateJenkinsUrl(candidateUrl, baseUrl);
  } catch {
    return undefined;
  }
  const parsed = new URL(safeUrl);
  if (parsed.search || parsed.hash) return undefined;
  const contextPath = new URL(baseUrl).pathname.replace(/\/+$/u, '');
  const match = new RegExp(`^${escapeRegex(contextPath)}/queue/item/(\\d+)$`).exec(pathname(safeUrl));
  const id = match === null ? undefined : parsePositiveSafeInteger(match[1]!);
  return id === undefined ? undefined : { id, url: safeUrl };
}

export function parseBuildReference(
  candidateUrl: string,
  baseUrl: string,
  jobUrl: string,
): BuildReference | undefined {
  let safeUrl: string;
  try {
    safeUrl = validateJenkinsUrl(candidateUrl, baseUrl);
  } catch {
    return undefined;
  }
  const parsed = new URL(safeUrl);
  if (parsed.search || parsed.hash) return undefined;
  if (!isWithinBasePath(safeUrl, baseUrl)) return undefined;
  const match = new RegExp(`^${escapeRegex(pathname(jobUrl))}/(\\d+)$`).exec(pathname(safeUrl));
  const number = match === null ? undefined : parsePositiveSafeInteger(match[1]!);
  return number === undefined ? undefined : { number, url: safeUrl };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
