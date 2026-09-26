export interface MockNode {
  readonly nodeType: number;
  readonly nodeValue?: string | null;
  readonly tagName?: string;
  readonly textContent?: string;
  readonly classList?: { contains: (cls: string) => boolean };
  readonly getAttribute?: (name: string) => string | null;
  readonly querySelector?: (selector: string) => MockElement | null;
  readonly querySelectorAll?: (selector: string) => MockElement[];
  readonly children?: MockElement[];
  readonly childNodes?: MockNode[];
  parentElement?: MockElement | null;
}

export interface MockElement extends MockNode {
  readonly nodeType: 1;
  readonly tagName: string;
  readonly classList: { contains: (cls: string) => boolean };
  readonly getAttribute: (name: string) => string | null;
  readonly querySelector: (selector: string) => MockElement | null;
  readonly querySelectorAll: (selector: string) => MockElement[];
  readonly children: MockElement[];
  readonly childNodes: MockNode[];
  parentElement: MockElement | null;
}

export function textNode(text: string): MockNode {
  return {
    nodeType: 3,
    nodeValue: text,
    textContent: text,
    parentElement: null,
  };
}

export function elem(
  tag: string,
  attrs: Record<string, string> = {},
  children: Array<MockNode | string> = [],
): MockElement {
  const childNodes: MockNode[] = children.map((c) => (typeof c === 'string' ? textNode(c) : c));
  const childElements = childNodes.filter((c): c is MockElement => c.nodeType === 1);

  const classes = (attrs['class'] ?? '').split(/\s+/).filter(Boolean);

  const element: MockElement = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    parentElement: null,
    classList: {
      contains: (cls: string) => classes.includes(cls),
    },
    getAttribute: (name: string) => attrs[name] ?? null,
    get textContent(): string {
      return childNodes.map((c) => c.textContent ?? '').join('');
    },
    querySelector: (selector: string) => {
      const all = element.querySelectorAll(selector);
      return all.length > 0 ? all[0]! : null;
    },
    querySelectorAll: (selector: string): MockElement[] => {
      const results: MockElement[] = [];

      function matches(el: MockElement): boolean {
        const tagLower = el.tagName.toLowerCase();
        if (selector === 'h1' || selector === 'h2' || selector === 'h3' || selector === 'h4') return tagLower === selector;
        if (selector === 'img') return tagLower === 'img';
        if (selector === 'dt' || selector === 'dd') return tagLower === selector;
        if (selector === 'h1, h2, h3, h4, h5, h6') {
          return /^h[1-6]$/.test(tagLower);
        }
        if (selector === 'img') return tagLower === 'img';
        if (selector === 'caption') return tagLower === 'caption';
        if (selector === 'figcaption') return tagLower === 'figcaption';
        if (selector === 'thead th') {
          return tagLower === 'th' && el.parentElement?.tagName.toLowerCase() === 'tr' && el.parentElement.parentElement?.tagName.toLowerCase() === 'thead';
        }
        if (selector === 'tbody tr') {
          return tagLower === 'tr' && el.parentElement?.tagName.toLowerCase() === 'tbody';
        }
        if (selector === 'tr') return tagLower === 'tr';
        if (selector === 'th, td') return tagLower === 'th' || tagLower === 'td';
        if (selector === ':scope > li') return tagLower === 'li' && el.parentElement === element;
        if (selector === ':scope > div') return tagLower === 'div' && el.parentElement === element;
        if (selector.startsWith('.')) return el.classList.contains(selector.slice(1));
        return false;
      }

      function search(curr: MockElement) {
        for (const ch of curr.children) {
          if (matches(ch)) results.push(ch);
          search(ch);
        }
      }
      search(element);
      return results;
    },
    children: childElements,
    childNodes,
  };

  for (const child of childNodes) {
    child.parentElement = element;
  }

  return element;
}
