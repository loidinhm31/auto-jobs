import * as zlib from 'node:zlib';

export interface ParsedPdfLink {
  readonly rect: number[];
  readonly url: string;
}

export interface ParsedPdfPage {
  readonly mediaBox: number[];
}

export interface ParsedPdfImage {
  readonly width: number;
  readonly height: number;
}

export interface ParsedPdf {
  readonly header: string;
  readonly pageCount: number;
  readonly pages: readonly ParsedPdfPage[];
  readonly images: readonly ParsedPdfImage[];
  readonly links: readonly ParsedPdfLink[];
  readonly extractedTexts: readonly string[];
}

export function parsePdf(pdfBuffer: Buffer): ParsedPdf {
  const binaryString = pdfBuffer.toString('latin1');
  const streams: string[] = [];

  // Parse streams (supporting compressed FlateDecode streams)
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRegex.exec(binaryString)) !== null) {
    const raw = match[1] ?? '';
    let decompressed: string;
    try {
      decompressed = zlib.inflateSync(Buffer.from(raw, 'latin1')).toString('latin1');
    } catch {
      decompressed = raw;
    }
    streams.push(decompressed);
  }

  const combined = binaryString + '\n' + streams.join('\n');

  // Parse ToUnicode CMaps
  const cmap = new Map<number, string>();
  const bfcharRegex = /beginbfchar([\s\S]*?)endbfchar/g;
  while ((match = bfcharRegex.exec(combined)) !== null) {
    const block = match[1] ?? '';
    const lines = block.trim().split(/\r?\n/);
    for (const line of lines) {
      const parts = line.trim().match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/);
      if (parts && parts[1] && parts[2]) {
        const cid = parseInt(parts[1], 16);
        const ucs = parseInt(parts[2], 16);
        cmap.set(cid, String.fromCodePoint(ucs));
      }
    }
  }

  // Parse bfrange CMaps if present
  const bfrangeRegex = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((match = bfrangeRegex.exec(combined)) !== null) {
    const block = match[1] ?? '';
    const lines = block.trim().split(/\r?\n/);
    for (const line of lines) {
      const parts = line.trim().match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>/);
      if (parts && parts[1] && parts[2] && parts[3]) {
        const startCid = parseInt(parts[1], 16);
        const endCid = parseInt(parts[2], 16);
        let startUcs = parseInt(parts[3], 16);
        for (let cid = startCid; cid <= endCid; cid++) {
          cmap.set(cid, String.fromCodePoint(startUcs));
          startUcs++;
        }
      }
    }
  }

  function decodeCidHex(hexStr: string): string {
    let decoded = '';
    for (let i = 0; i < hexStr.length; i += 4) {
      const cid = parseInt(hexStr.slice(i, i + 4), 16);
      decoded += cmap.get(cid) ?? '';
    }
    return decoded;
  }

  // Extract text from hex strings in text operators: <hex> Tj, <hex> ', <hex> "
  const extractedTexts: string[] = [];
  const hexTextRegex = /<([0-9a-fA-F]+)>\s*(?:Tj|'|")/g;
  while ((match = hexTextRegex.exec(combined)) !== null) {
    const hex = match[1] ?? '';
    const decoded = decodeCidHex(hex);
    if (decoded.length > 0) extractedTexts.push(decoded);
  }

  // Extract text from TJ arrays containing hex strings e.g. [ <hex> 120 <hex> ] TJ
  const hexArrayRegex = /\[\s*((?:<[0-9a-fA-F]+>|[-0-9.\s])+)\s*\]\s*TJ/g;
  while ((match = hexArrayRegex.exec(combined)) !== null) {
    const arrayContent = match[1] ?? '';
    const itemRegex = /<([0-9a-fA-F]+)>/g;
    let itemMatch: RegExpExecArray | null;
    let fullWord = '';
    while ((itemMatch = itemRegex.exec(arrayContent)) !== null) {
      const itemHex = itemMatch[1] ?? '';
      fullWord += decodeCidHex(itemHex);
    }
    if (fullWord.length > 0) extractedTexts.push(fullWord);
  }

  // Extract literal text strings e.g. (text) Tj
  const literalTextRegex = /\(([^)]+)\)\s*(?:Tj|'|")/g;
  while ((match = literalTextRegex.exec(combined)) !== null) {
    const lit = match[1] ?? '';
    if (lit.length > 0) extractedTexts.push(lit);
  }

  // Extract link annotations
  const linkRegex = /\/Subtype\s*\/Link[\s\S]*?\/Rect\s*\[([^\]]+)\][\s\S]*?\/URI\s*(?:\(([^)]+)\)|<([0-9a-fA-F]+)>)/g;
  const links: ParsedPdfLink[] = [];
  while ((match = linkRegex.exec(binaryString)) !== null) {
    const rectStr = match[1] ?? '';
    const rect = rectStr.trim().split(/\s+/).map(Number);
    const rawUrl = match[2];
    const hexUrl = match[3];
    const url = rawUrl ?? (hexUrl ? Buffer.from(hexUrl, 'hex').toString('utf8') : '');
    links.push({ rect, url });
  }

  // Extract page boxes
  const pageRegex = /\/Type\s*\/Page\b[\s\S]*?\/MediaBox\s*\[([^\]]+)\]/g;
  const pages: ParsedPdfPage[] = [];
  while ((match = pageRegex.exec(binaryString)) !== null) {
    const boxStr = match[1] ?? '';
    const box = boxStr.trim().split(/\s+/).map(Number);
    pages.push({ mediaBox: box });
  }

  // Extract embedded images
  const imageRegex = /\/Subtype\s*\/Image\b[\s\S]*?\/Width\s+(\d+)[\s\S]*?\/Height\s+(\d+)/g;
  const images: ParsedPdfImage[] = [];
  while ((match = imageRegex.exec(binaryString)) !== null) {
    images.push({ width: Number(match[1]), height: Number(match[2]) });
  }

  return {
    header: pdfBuffer.subarray(0, 8).toString('ascii'),
    pageCount: pages.length,
    pages,
    images,
    links,
    extractedTexts,
  };
}
