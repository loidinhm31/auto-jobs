import { deflateSync } from 'node:zlib';

const WIDTH = 320;
const HEIGHT = 180;

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const label = Buffer.from(type, 'ascii');
  const result = Buffer.alloc(12 + data.length);
  result.writeUInt32BE(data.length, 0);
  label.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([label, data])), 8 + data.length);
  return result;
}

export function generatedReportImage(): Buffer {
  const pixels = Buffer.alloc(HEIGHT * (1 + WIDTH * 4));
  for (let y = 0; y < HEIGHT; y += 1) {
    const row = y * (1 + WIDTH * 4);
    pixels[row] = 0;
    for (let x = 0; x < WIDTH; x += 1) {
      const offset = row + 1 + x * 4;
      const header = y < 30;
      const sidebar = x < 48 && y >= 30;
      const bar = (x >= 76 && x < 120 && y >= 86 && y < 150) ||
        (x >= 136 && x < 180 && y >= 65 && y < 150) ||
        (x >= 196 && x < 240 && y >= 104 && y < 150);
      const color: [number, number, number] = header ? [30, 64, 175] : sidebar ? [226, 232, 240] : bar ? [14, 165, 164] : [248, 250, 252];
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(WIDTH, 0);
  header.writeUInt32BE(HEIGHT, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
