import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reportingOutput = resolve(projectRoot, '.runner-build', 'reporting');
const controlOutput = resolve(reportingOutput, 'control-page');

await mkdir(reportingOutput, { recursive: true });
await mkdir(controlOutput, { recursive: true });

await copyFile(
  resolve(projectRoot, 'src', 'reporting', 'report.css'),
  resolve(reportingOutput, 'report.css'),
);

const controlAssets = ['control-page.html', 'control-page.css', 'control-page.js'];
for (const asset of controlAssets) {
  await copyFile(
    resolve(projectRoot, 'src', 'reporting', 'control-page', asset),
    resolve(controlOutput, asset),
  );
}
