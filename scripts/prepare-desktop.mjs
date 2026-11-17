/* global console, process */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const standalone = path.join(root, '.next', 'standalone');
const bundle = path.join(root, 'desktop', 'bundle');
const modelTarget = path.join(bundle, 'runtime', 'models', 'base.pt');

const copyDirectory = async (source, destination) => {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(source, destination, { recursive: true });
};

try {
  await fs.access(path.join(standalone, 'server.js'));
  await copyDirectory(standalone, path.join(bundle, 'next-server'));
  await copyDirectory(path.join(root, '.next', 'static'), path.join(bundle, 'next-server', '.next', 'static'));

  try {
    await fs.access(path.join(root, 'public'));
    await copyDirectory(path.join(root, 'public'), path.join(bundle, 'next-server', 'public'));
  } catch {
    // public/ is optional.
  }

  await fs.mkdir(path.join(bundle, 'runtime'), { recursive: true });
  try {
    const modelStat = await fs.stat(modelTarget);
    if (modelStat.size < 1_000_000) throw new Error('model file is too small');
  } catch {
    const candidates = [
      process.env.WHISPER_MODEL_PATH,
      path.join(os.homedir(), '.cache', 'whisper', 'base.pt'),
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'whisper', 'base.pt') : undefined,
    ].filter(Boolean);
    let copied = false;
    for (const candidate of candidates) {
      try {
        const stat = await fs.stat(candidate);
        if (stat.size >= 1_000_000) {
          await fs.mkdir(path.dirname(modelTarget), { recursive: true });
          await fs.copyFile(candidate, modelTarget);
          console.log(`Copied Whisper model from ${candidate}`);
          copied = true;
          break;
        }
      } catch {
        // Try the next known Whisper cache location.
      }
    }
    if (!copied) {
      throw new Error(
        'Thiếu Whisper model base.pt. Chạy `python scripts/ensure-whisper-model.py` trước khi build desktop.',
      );
    }
  }
  await fs.writeFile(
    path.join(bundle, 'index.html'),
    '<!doctype html><html><body><p>ClipRead đang khởi động...</p></body></html>\n',
  );
  console.log(`Prepared Next standalone bundle at ${path.relative(root, bundle)}`);
} catch (error) {
  console.error('Không thể chuẩn bị desktop bundle. Hãy chạy npm run build trước.');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
