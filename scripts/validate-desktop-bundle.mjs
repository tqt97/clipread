/* global console, process */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executableSuffix = process.platform === 'win32' ? '.exe' : '';
const required = [
  'desktop/bundle/index.html',
  'desktop/bundle/next-server/server.js',
  `desktop/bundle/runtime/node${executableSuffix}`,
  `desktop/bundle/runtime/clipread-worker/clipread-worker${executableSuffix}`,
  `desktop/bundle/runtime/bin/yt-dlp${executableSuffix}`,
  `desktop/bundle/runtime/bin/ffmpeg${executableSuffix}`,
  'desktop/bundle/runtime/models/base.pt',
];

const missing = [];
const invalid = [];
for (const relative of required) {
  try {
    const stat = await fs.stat(path.join(root, relative));
    if (relative.endsWith('base.pt') && stat.size < 1_000_000) invalid.push(relative);
  } catch {
    missing.push(relative);
  }
}

if (missing.length) {
  console.error('Desktop bundle còn thiếu tài nguyên bắt buộc:');
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

if (invalid.length) {
  console.error('Desktop bundle có tài nguyên chưa hoàn chỉnh:');
  for (const item of invalid) console.error(`- ${item}`);
  process.exit(1);
}

console.log(`Desktop bundle hợp lệ (${required.length} tài nguyên bắt buộc).`);
