import type { IncomingMessage, ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

import { CONTROL_CSP } from './report-server-constants.js';

export function parseHeader(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0]?.trim();
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

export function writeControlSecurityHeaders(response: ServerResponse): void {
  response.setHeader('cache-control', 'no-store');
  response.setHeader('content-security-policy', CONTROL_CSP);
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('cross-origin-resource-policy', 'same-origin');
  response.setHeader('permissions-policy', 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()');
}

export function validateHostHeader(request: IncomingMessage, expectedHost: string, expectedPort: number): boolean {
  const rawHost = parseHeader(request, 'host');
  if (rawHost === undefined || rawHost.length === 0 || rawHost.length > 255) return false;
  if (/[\u0000-\u0020\u007f]/u.test(rawHost)) return false;

  const normalizedExpectedHost = expectedHost.includes(':') && !expectedHost.startsWith('[')
    ? `[${expectedHost}]`
    : expectedHost;
  const standardExpected = `${normalizedExpectedHost}:${expectedPort}`.toLowerCase();
  const rawLower = rawHost.toLowerCase();

  if (rawLower === standardExpected) return true;
  if (expectedPort === 80 && (rawLower === normalizedExpectedHost.toLowerCase() || rawLower === `${normalizedExpectedHost}:80`.toLowerCase())) return true;
  if (expectedPort === 443 && (rawLower === normalizedExpectedHost.toLowerCase() || rawLower === `${normalizedExpectedHost}:443`.toLowerCase())) return true;

  return false;
}

export function validateOriginHeader(request: IncomingMessage, expectedHost: string, expectedPort: number): boolean {
  const rawOrigin = parseHeader(request, 'origin');
  if (rawOrigin === undefined) return false;
  try {
    const parsed = new URL(rawOrigin);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const originHost = parsed.hostname;
    const originPort = parsed.port ? Number(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80);

    const matchHost = originHost.toLowerCase() === expectedHost.toLowerCase() ||
      (expectedHost === '127.0.0.1' && originHost === 'localhost') ||
      (expectedHost === 'localhost' && originHost === '127.0.0.1');

    return matchHost && originPort === expectedPort;
  } catch {
    return false;
  }
}

export function validateFetchMetadata(request: IncomingMessage): boolean {
  const secFetchSite = parseHeader(request, 'sec-fetch-site');
  if (secFetchSite !== undefined && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return false;
  }
  const secFetchMode = parseHeader(request, 'sec-fetch-mode');
  if (secFetchMode !== undefined && secFetchMode !== 'cors' && secFetchMode !== 'same-origin' && secFetchMode !== 'navigate') {
    return false;
  }
  return true;
}

export function validateCsrfToken(request: IncomingMessage, expectedToken: string): boolean {
  const tokenHeader = parseHeader(request, 'x-csrf-token');
  if (tokenHeader === undefined || tokenHeader.length === 0) return false;
  const actualBuf = Buffer.from(tokenHeader, 'utf8');
  const expectedBuf = Buffer.from(expectedToken, 'utf8');
  if (actualBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(actualBuf, expectedBuf);
}

export function validateMutationRequest(
  request: IncomingMessage,
  expectedHost: string,
  expectedPort: number,
  expectedCsrfToken: string,
): { valid: true } | { valid: false; status: 403 | 415; message: string } {
  if (!validateHostHeader(request, expectedHost, expectedPort)) {
    return { valid: false, status: 403, message: 'invalid Host header' };
  }
  if (!validateOriginHeader(request, expectedHost, expectedPort)) {
    return { valid: false, status: 403, message: 'invalid or missing Origin header' };
  }
  if (!validateFetchMetadata(request)) {
    return { valid: false, status: 403, message: 'invalid Sec-Fetch-* metadata' };
  }
  if (!validateCsrfToken(request, expectedCsrfToken)) {
    return { valid: false, status: 403, message: 'invalid or missing CSRF token' };
  }
  const contentType = parseHeader(request, 'content-type');
  const isBodylessDelete = request.method === 'DELETE' &&
    (request.headers['content-length'] === undefined || request.headers['content-length'] === '0') &&
    contentType === undefined;
  if (!isBodylessDelete && (contentType === undefined || !contentType.toLowerCase().startsWith('application/json'))) {
    return { valid: false, status: 415, message: 'Content-Type must be application/json' };
  }
  return { valid: true };
}
