import { assertAllowedUrl } from '../security/url-policy.js';

export function normalizedPathname(url: string): string {
  return new URL(url).pathname.replace(/\/+$/u, '');
}
export function decodeJenkinsJobSegment(value: string): string {
  let decoded = value;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return decoded;
      decoded = next;
    } catch {
      return decoded;
    }
  }
  return decoded;
}

export function jenkinsJobPathSegments(jobUrl: string): string[] {
  const pathnameSegments = new URL(jobUrl).pathname.split('/').filter(Boolean);
  const jobSegments: string[] = [];
  for (let index = 0; index < pathnameSegments.length; index += 1) {
    if (pathnameSegments[index] !== 'job') continue;
    const rawName = pathnameSegments[index + 1];
    if (rawName === undefined) continue;
    jobSegments.push(decodeJenkinsJobSegment(rawName));
    index += 1;
  }
  return jobSegments;
}

export function isExactJobUrl(candidateUrl: string, jobUrl: string): boolean {
  try {
    const candidate = new URL(candidateUrl);
    const expected = new URL(jobUrl);
    return candidate.origin === expected.origin &&
      candidate.search === '' &&
      candidate.hash === '' &&
      expected.search === '' &&
      expected.hash === '' &&
      normalizedPathname(candidateUrl) === normalizedPathname(jobUrl);
  } catch {
    return false;
  }
}

export interface JenkinsJobActionUrlOptions {
  readonly allowDelay?: boolean;
  readonly actionName?: string;
}

export function isExactJenkinsJobActionUrl(
  candidateUrl: string,
  jobUrl: string,
  options: JenkinsJobActionUrlOptions = {},
): boolean {
  try {
    const candidate = new URL(candidateUrl);
    const expected = new URL(jobUrl);
    if (candidate.origin !== expected.origin) return false;
    if (candidate.username !== '' || candidate.password !== '') return false;
    if (candidate.hash !== '') return false;
    if (expected.hash !== '' || expected.search !== '') return false;

    const action = (options.actionName ?? 'build').replace(/^\/+|\/+$/gu, '');
    const expectedJobPath = normalizedPathname(jobUrl);
    const expectedActionPath = `${expectedJobPath}/${action}`;
    const candidatePath = normalizedPathname(candidateUrl);
    if (candidatePath !== expectedActionPath) return false;

    const expectedSegments = jenkinsJobPathSegments(jobUrl);
    const candidateSegments = jenkinsJobPathSegments(candidateUrl);
    if (expectedSegments.length !== candidateSegments.length) return false;
    for (let i = 0; i < expectedSegments.length; i += 1) {
      if (expectedSegments[i] !== candidateSegments[i]) return false;
    }

    if (candidate.search === '') return true;
    if (options.allowDelay === true && candidate.search === '?delay=0sec') return true;
    return false;
  } catch {
    return false;
  }
}

export function validateJenkinsJobActionUrl(
  candidateUrl: string,
  jobUrl: string,
  baseUrl: string,
  options: JenkinsJobActionUrlOptions = {},
): string {
  const allowed = assertAllowedUrl(candidateUrl, baseUrl, [], 'Jenkins job action URL');
  if (!isExactJenkinsJobActionUrl(allowed, jobUrl, options)) {
    throw new Error(`URL '${candidateUrl}' is not the exact Jenkins job action URL for '${jobUrl}'`);
  }
  return allowed;
}

export function validateJenkinsUrl(candidateUrl: string, baseUrl: string): string {
  return assertAllowedUrl(candidateUrl, baseUrl, [], 'Jenkins URL');
}
