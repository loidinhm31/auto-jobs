import { ConfigError } from '../config-errors.js';
import {
  canonicalizeBaseUrl,
  containsPathTraversal,
  isWithinBasePath,
} from './url-policy.js';

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/u;

/** Resolve a relative artifact/config path without leaving the Jenkins base context. */
export function resolveSafeRelativeUrl(
  baseUrl: string,
  relativePath: string,
  fieldName = 'relative path',
): string {
  const input = relativePath.trim();
  if (
    input.length === 0 ||
    CONTROL_CHARS.test(input) ||
    input.startsWith('//') ||
    /^[a-z][a-z\d+.-]*:/iu.test(input) ||
    containsPathTraversal(input.split(/[?#]/u, 1)[0] ?? '')
  ) {
    throw new ConfigError([`${fieldName} must stay within the base context`]);
  }
  const canonicalBase = canonicalizeBaseUrl(baseUrl);
  const resolved = new URL(input.replace(/^\/+/, ''), `${canonicalBase}/`);
  const result = resolved.toString();
  if (!isWithinBasePath(result, canonicalBase)) {
    throw new ConfigError([`${fieldName} escapes the base context`]);
  }
  return result;
}
