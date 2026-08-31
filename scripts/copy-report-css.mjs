import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = resolve(projectRoot, '.runner-build', 'reporting');

await mkdir(outputDirectory, { recursive: true });
await copyFile(
  resolve(projectRoot, 'src', 'reporting', 'report.css'),
  resolve(outputDirectory, 'report.css'),
);