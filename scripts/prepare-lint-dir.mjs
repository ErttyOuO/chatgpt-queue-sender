import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'extension');
const runtimeEntries = [
  'manifest.json', 'i18n.js', 'background.js', 'content.js', 'content.css',
  '_locales', 'icons', 'popup', 'export',
];

await fs.rm(path.join(root, 'dist'), { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
for (const entry of runtimeEntries) {
  await fs.cp(path.join(root, entry), path.join(out, entry), { recursive: true });
}
console.log(out);
