import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const ASSET_DIR = path.join(currentDir, 'control-page');

let htmlTemplate: string | undefined;
let cssContent: string | undefined;
let jsContent: string | undefined;

export async function loadControlAssets(): Promise<{ html: string; css: string; js: string }> {
  if (htmlTemplate === undefined) {
    htmlTemplate = await fsp.readFile(path.join(ASSET_DIR, 'control-page.html'), 'utf8');
  }
  if (cssContent === undefined) {
    cssContent = await fsp.readFile(path.join(ASSET_DIR, 'control-page.css'), 'utf8');
  }
  if (jsContent === undefined) {
    jsContent = await fsp.readFile(path.join(ASSET_DIR, 'control-page.js'), 'utf8');
  }
  return { html: htmlTemplate, css: cssContent, js: jsContent };
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function renderControlPageHtml(csrfToken: string): Promise<string> {
  const { html } = await loadControlAssets();
  return html.replace('__CSRF_TOKEN_PLACEHOLDER__', escapeHtml(csrfToken));
}

export async function getControlCss(): Promise<string> {
  const { css } = await loadControlAssets();
  return css;
}

export async function getControlJs(): Promise<string> {
  const { js } = await loadControlAssets();
  return js;
}
