import {
  attribute,
  decodeHtmlEntities,
  elementTags,
  parseAbsoluteUrl,
  parseCanonicalUrl,
} from './template-fixture-html.js';

export function extractSidePanelBuildLink(jenkinsHtml: string, jenkinsCanonical: URL): URL {
  const sidePanelMatch =
    /<div\b[^>]*\bid=["']side-panel["'][^>]*>([\s\S]*?)<div\b[^>]*\bid=["']main-panel["']/iu.exec(
      jenkinsHtml,
    );
  if (!sidePanelMatch) throw new Error('Jenkins job template side-panel landmark is missing');
  const anchors = sidePanelMatch[1]!.match(/<a\b[\s\S]*?<\/a>/giu) ?? [];
  const buildAnchors = anchors.filter((anchor) => {
    const text = decodeHtmlEntities(anchor.replace(/<[^>]+>/gu, '')).trim();
    return text.includes('Build with Parameters');
  });
  if (buildAnchors.length !== 1) {
    throw new Error('Jenkins job template must contain exactly one Build with Parameters link in the side panel');
  }
  const rawHref = attribute(buildAnchors[0]!, 'href');
  if (rawHref === undefined) throw new Error('Jenkins job template build parameters link is missing an href');
  const buildUrl = parseAbsoluteUrl(rawHref, jenkinsCanonical, 'Jenkins build parameters');
  if (buildUrl.origin !== jenkinsCanonical.origin) {
    throw new Error('Jenkins build parameters link origin is not the approved saved origin');
  }
  const expectedPrefix = jenkinsCanonical.pathname.replace(/\/+$/u, '');
  if (buildUrl.pathname !== `${expectedPrefix}/build` && buildUrl.pathname !== `${expectedPrefix}/build/`) {
    throw new Error('Jenkins build parameters link action path does not match the job path');
  }
  const delayValues = buildUrl.searchParams.getAll('delay');
  if (
    buildUrl.searchParams.size > 1 ||
    (buildUrl.searchParams.size === 1 && (delayValues.length !== 1 || delayValues[0] !== '0sec'))
  ) {
    throw new Error('Jenkins build parameters link contains unexpected query parameters');
  }
  return buildUrl;
}

export function validateBuildTemplate(
  buildHtmlRaw: string,
  savedBuildUrl: URL,
): { buildCanonical: URL; buildAction: URL } {
  const buildCanonical = parseCanonicalUrl(buildHtmlRaw, 'Jenkins build');
  if (buildCanonical.toString() !== savedBuildUrl.toString()) {
    throw new Error('Jenkins build template canonical URL does not match the saved job build URL');
  }
  const postForms = elementTags(buildHtmlRaw, 'form').filter(
    (tag) => (attribute(tag, 'method') ?? 'get').trim().toLowerCase() === 'post',
  );
  if (postForms.length !== 1) throw new Error('Jenkins build template must contain exactly one POST form');
  const rawAction = attribute(postForms[0]!, 'action');
  if (rawAction === undefined) throw new Error('Jenkins build template POST form action is missing');
  const buildAction = parseAbsoluteUrl(rawAction, buildCanonical, 'Jenkins build action');
  if (buildAction.origin !== buildCanonical.origin) throw new Error('Jenkins build form action origin changed');
  const expectedPrefix = savedBuildUrl.pathname.replace(/\/(?:build\/?|\?.*)?$/iu, '');
  if (buildAction.pathname.replace(/\/+$/u, '') !== `${expectedPrefix}/build` || buildAction.search || buildAction.hash) {
    throw new Error('Jenkins build form action does not match the exact job build path');
  }
  const stickerMatch = /<div\b[^>]*\bid=["']bottom-sticker["'][^>]*>([\s\S]*?)<\/div>/iu.exec(buildHtmlRaw);
  if (!stickerMatch) throw new Error('Jenkins build template must contain a #bottom-sticker container');
  const stickerButtons = stickerMatch[1]!.match(/<button\b[\s\S]*?<\/button>/giu) ?? [];
  if (stickerButtons.length !== 1) {
    throw new Error('Jenkins build template #bottom-sticker must contain exactly one submit button');
  }
  const buttonTag = stickerButtons[0]!;
  if (attribute(buttonTag, 'type')?.toLowerCase() !== 'submit') {
    throw new Error('Jenkins build button must have type="submit"');
  }
  const tokenSet = new Set((attribute(buttonTag, 'class') ?? '').split(/\s+/u).filter(Boolean));
  for (const cls of ['jenkins-button', 'jenkins-button--primary', 'jenkins-!-build-color']) {
    if (!tokenSet.has(cls)) throw new Error(`Jenkins build button is missing required class: ${cls}`);
  }
  if (decodeHtmlEntities(buttonTag.replace(/<[^>]+>/gu, '')).trim() !== 'Build') {
    throw new Error('Jenkins build button text must be "Build"');
  }
  return { buildCanonical, buildAction };
}
