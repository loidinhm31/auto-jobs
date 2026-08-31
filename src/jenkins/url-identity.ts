import { assertAllowedUrl } from '../security/url-policy.js';

export function normalizedPathname(url: string): string {
  return new URL(url).pathname.replace(/\/+$/u, '');
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
