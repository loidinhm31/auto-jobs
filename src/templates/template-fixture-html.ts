import type { ArtifactLink } from './template-fixture-types.js';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function escapedPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>');
}

export function elementTags(html: string, name: string): string[] {
  return html.match(new RegExp(`<${name}\\b[\\s\\S]*?>`, 'giu')) ?? [];
}

export function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'iu').exec(tag);
  return match?.[2];
}

export function parseAbsoluteUrl(raw: string, base: URL | undefined, label: string): URL {
  let url: URL;
  try {
    url = new URL(decodeHtmlEntities(raw), base);
  } catch {
    throw new Error(`Template ${label} URL is malformed`);
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.hash.length > 0
  ) {
    throw new Error(`Template ${label} URL is unsafe`);
  }
  return url;
}

export function parseCanonicalUrl(html: string, label: string): URL {
  const tags = elementTags(html, 'link').filter((tag) =>
    (attribute(tag, 'rel') ?? '').split(/\s+/u).some((value) => value.toLowerCase() === 'canonical'),
  );
  if (tags.length !== 1) throw new Error(`Template ${label} must contain exactly one canonical URL`);
  const rawHref = attribute(tags[0]!, 'href');
  if (rawHref === undefined) throw new Error(`Template ${label} canonical URL is missing`);
  return parseAbsoluteUrl(rawHref, undefined, `${label} canonical`);
}

export function anchorUrls(html: string, base: URL, label: string): URL[] {
  const urls: URL[] = [];
  for (const tag of elementTags(html, 'a')) {
    const rawHref = attribute(tag, 'href');
    if (rawHref === undefined) continue;
    try {
      urls.push(parseAbsoluteUrl(rawHref, base, label));
    } catch {
      // Ignore malformed unrelated links; required route selection fails closed below.
    }
  }
  return urls;
}

export function rewriteHrefAttributes(
  html: string,
  base: URL,
  rewrite: (url: URL) => string | undefined,
): string {
  return html.replace(
    /(\bhref\s*=\s*)(["'])([\s\S]*?)\2/giu,
    (whole: string, prefix: string, quote: string, rawHref: string) => {
      let url: URL;
      try {
        url = parseAbsoluteUrl(rawHref, base, 'link');
      } catch {
        return whole;
      }
      const replacement = rewrite(url);
      return replacement === undefined ? whole : `${prefix}${quote}${escapeHtml(replacement)}${quote}`;
    },
  );
}

export function rewriteFormAction(
  html: string,
  savedAction: URL,
  target: string,
  formLabel = 'login form',
): string {
  let replacements = 0;
  const rewritten = html.replace(
    /(<form\b[\s\S]*?\baction\s*=\s*)(["'])([\s\S]*?)\2/iu,
    (whole: string, prefix: string, quote: string, rawAction: string) => {
      let action: URL;
      try {
        action = parseAbsoluteUrl(rawAction, savedAction, `${formLabel} action`);
      } catch {
        return whole;
      }
      if (action.toString() !== savedAction.toString()) return whole;
      replacements += 1;
      return `${prefix}${quote}${escapeHtml(target)}${quote}`;
    },
  );
  if (replacements !== 1) throw new Error(`Template ${formLabel} action could not be rewritten exactly once`);
  return rewritten;
}

export function rewriteSonarqubeLoginForm(html: string, targetAction: string): string {
  let formReplaced = false;
  let rewritten = html.replace(/<form\b([^>]*)>/iu, (_whole, attrs) => {
    formReplaced = true;
    const cleanAttrs = attrs.replace(/\b(?:action|method)\s*=\s*(["'])[\s\S]*?\1/giu, '').trim();
    return `<form ${cleanAttrs} method="POST" action="${escapeHtml(targetAction)}">`;
  });
  if (!formReplaced) throw new Error('Template SonarQube login form could not be rewritten');
  rewritten = rewritten.replace(
    /<button([^>]*\btype=["']submit["'][^>]*?)\bdisabled(?:=""|="disabled")?([^>]*)>/giu,
    '<button$1$2>',
  );
  return rewritten;
}

export function exactlyOneQueryValue(url: URL, key: string): string | undefined {
  const values = url.searchParams.getAll(key);
  if (values.length !== 1) return undefined;
  const value = values[0]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

export function remapOrigin(url: URL, origin: string): string {
  const target = new URL(origin);
  target.pathname = url.pathname;
  target.search = url.search;
  target.hash = url.hash;
  return target.toString();
}

export function selectSingleUrl(values: readonly URL[], label: string): URL {
  const unique = new Map<string, URL>();
  for (const value of values) unique.set(value.toString(), value);
  if (unique.size !== 1) throw new Error(`Template ${label} must resolve to exactly one URL after deduplication`);
  return unique.values().next().value!;
}

export function artifactLink(url: URL, origin: string, filename: string): ArtifactLink | undefined {
  if (url.origin !== origin || url.search.length > 0 || url.hash.length > 0) return undefined;
  const canonicalPathname = url.pathname.replace(/\/(?:\*fingerprint\*|\*view\*)\/?$/iu, '');
  const marker = '/artifact/';
  const markerIndex = canonicalPathname.lastIndexOf(marker);
  if (markerIndex < 0 || canonicalPathname.slice(markerIndex + marker.length) !== filename) return undefined;
  const canonicalUrl = new URL(url);
  canonicalUrl.pathname = canonicalPathname;
  return { url: canonicalUrl, context: canonicalPathname.slice(0, markerIndex), filename };
}

export function selectArtifactLink(
  urls: readonly URL[],
  origin: string,
  filename: string,
  label: string,
): ArtifactLink {
  const candidates = urls
    .map((url) => artifactLink(url, origin, filename))
    .filter((candidate): candidate is ArtifactLink => candidate !== undefined);
  const selected = selectSingleUrl(
    candidates.map((candidate) => candidate.url),
    label,
  );
  return candidates.find((candidate) => candidate.url.toString() === selected.toString())!;
}

export function isExactFixtureUrl(candidate: URL, expected: string): boolean {
  const target = new URL(expected);
  return (
    candidate.origin === target.origin &&
    candidate.pathname === target.pathname &&
    candidate.search === target.search &&
    candidate.hash === target.hash
  );
}
