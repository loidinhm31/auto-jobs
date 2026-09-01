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

export function validateJenkinsUrl(candidateUrl: string, baseUrl: string): string {
  return assertAllowedUrl(candidateUrl, baseUrl, [], 'Jenkins URL');
}
