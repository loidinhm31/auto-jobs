const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '=': '&#61;',
};

function escape(value: string): string {
  return value.replace(/[&<>"'=]/gu, (character) => HTML_ENTITIES[character] ?? character);
}

/** Escape captured text before placing it in an HTML text node. */
export function escapeHtmlText(value: string): string {
  return escape(value);
}

/** Escape captured text before placing it in an HTML attribute. */
export function escapeHtmlAttribute(value: string): string {
  return escape(value);
}
