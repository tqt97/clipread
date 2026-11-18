/* global Buffer, console, fetch, process */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtime = path.join(root, 'desktop', 'bundle', 'runtime');
const temp = path.join(os.tmpdir(), 'clipread-desktop-runtime');
const nodeVersion = process.env.NODE_RUNTIME_VERSION || '22.14.0';
const workerBuildVersion = 'worker-v2-pinned-whisper-no-console';

const run = (command, args, options = {}) => execFileSync(command, args, { stdio: 'inherit', ...options });
const exists = async (file) => {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
};

const download = async (url, destination) => {
  if (await exists(destination)) return;
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, Buffer.from(await response.arrayBuffer()));
};

const copyExecutable = async (source, destination) => {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.copyFile(source, destination);
  if (process.platform !== 'win32') await fs.chmod(destination, 0o755);
};

const findFile = async (directory, filename) => {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const current = path.join(directory, entry.name);
    if (entry.isFile() && entry.name === filename) return current;
    if (entry.isDirectory()) {
      const found = await findFile(current, filename);
      if (found) return found;
    }
  }
  return null;
};

const prepareNode = async () => {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const target = path.join(runtime, `node${suffix}`);
  if (await exists(target)) return;
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const platform = process.platform === 'win32' ? 'win' : 'darwin';
  const archiveName = `node-v${nodeVersion}-${platform}-${arch}.${platform === 'win32' ? 'zip' : 'tar.gz'}`;
  const archive = path.join(temp, archiveName);
  const extracted = path.join(temp, `node-v${nodeVersion}-${platform}-${arch}`);
  await download(`https://nodejs.org/dist/v${nodeVersion}/${archiveName}`, archive);
  await fs.rm(extracted, { recursive: true, force: true });
  await fs.mkdir(temp, { recursive: true });
  run('tar', ['-xf', archive, '-C', temp]);
  const source = process.platform === 'win32' ? path.join(extracted, 'node.exe') : path.join(extracted, 'bin', 'node');
  await copyExecutable(source, target);
};

const prepareYtdlp = async () => {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const target = path.join(runtime, 'bin', `yt-dlp${suffix}`);
  if (await exists(target)) return;
  const asset = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp_macos';
  const downloadTarget = path.join(temp, asset);
  await download(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${asset}`, downloadTarget);
  await copyExecutable(downloadTarget, target);
};

const prepareFfmpeg = async () => {
  const suffix = process.platform === 'win32' ? '.exe' : '';
  const target = path.join(runtime, 'bin', `ffmpeg${suffix}`);
  if (await exists(target)) return;
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (process.platform === 'darwin') {
    let brewPath;
    try {
      brewPath = execFileSync('brew', ['--prefix', 'ffmpeg'], { encoding: 'utf8' }).trim();
    } catch {
      throw new Error('Thiếu FFmpeg. Cài Homebrew rồi chạy `brew install ffmpeg`, sau đó build lại.');
    }
    await copyExecutable(path.join(brewPath, 'bin', 'ffmpeg'), target);
    return;
  }
  if (process.platform === 'win32') {
    const archive = path.join(temp, 'ffmpeg-win64.zip');
    const extracted = path.join(temp, 'ffmpeg-win64');
    await download(
      'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip',
      archive,
    );
    await fs.rm(extracted, { recursive: true, force: true });
    await fs.mkdir(extracted, { recursive: true });
    run('tar', ['-xf', archive, '-C', extracted]);
    const source = await findFile(extracted, 'ffmpeg.exe');
    if (!source) throw new Error('Không tìm thấy ffmpeg.exe trong archive Windows.');
    await copyExecutable(source, target);
    return;
  }
  throw new Error(`Không hỗ trợ tự động chuẩn bị FFmpeg trên ${process.platform}.`);
};

const pythonCandidates = () => {
  if (process.env.PYTHON) return [process.env.PYTHON];
  return process.platform === 'win32' ? ['py', 'python'] : ['python3.12', 'python3.11', 'python3', 'python'];
};

const supportedPythonCommand = () => {
  for (const command of pythonCandidates()) {
    try {
      const version = execFileSync(
        command,
        ['-c', 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")'],
        {
          encoding: 'utf8',
        },
      ).trim();
      const [major, minor] = version.split('.').map(Number);
      if (major === 3 && minor >= 9 && minor < 13) return command;
    } catch {
      // Try the next Python command available on PATH.
    }
  }
  throw new Error('Desktop worker cần Python 3.11 hoặc 3.12. Python 3.13+ không có wheel ổn định cho macOS Intel.');
};
const venvPython = () =>
  process.platform === 'win32'
    ? path.join(root, 'worker', '.venv-desktop', 'Scripts', 'python.exe')
    : path.join(root, 'worker', '.venv-desktop', 'bin', 'python');

const prepareWorker = async () => {
  const executable = process.platform === 'win32' ? 'clipread-worker.exe' : 'clipread-worker';
  const target = path.join(runtime, 'clipread-worker', executable);
  const marker = path.join(runtime, 'clipread-worker', '.build-version');
  if (await exists(target)) {
    const markerValue = await fs.readFile(marker, 'utf8').catch(() => '');
    if (markerValue !== workerBuildVersion) {
      console.warn('Using existing worker runtime; Python 3.11/3.12 is only required when rebuilding it.');
    }
    return;
  }
  const basePython = supportedPythonCommand();
  const venv = path.join(root, 'worker', '.venv-desktop');
  if (!(await exists(venvPython()))) run(basePython, ['-m', 'venv', venv]);
  run(venvPython(), ['-m', 'pip', 'install', '--upgrade', 'pip']);
  run(venvPython(), ['-m', 'pip', 'install', '-r', path.join(root, 'worker', 'requirements.txt'), 'pyinstaller']);
  run(venvPython(), [path.join(root, 'scripts', 'ensure-whisper-model.py')]);
  run(
    venvPython(),
    [
      '-m',
      'PyInstaller',
      '--noconfirm',
      '--clean',
      '--onedir',
      '--name',
      'clipread-worker',
      '--paths',
      root,
      '--collect-all',
      'whisper',
      '--collect-all',
      'tiktoken',
      '--noconsole',
      path.join(root, 'worker', 'entrypoint.py'),
    ],
    { cwd: root },
  );
  await fs.rm(path.join(runtime, 'clipread-worker'), { recursive: true, force: true });
  await fs.cp(path.join(root, 'dist', 'clipread-worker'), path.join(runtime, 'clipread-worker'), { recursive: true });
  await fs.writeFile(marker, workerBuildVersion);
};

try {
  await fs.mkdir(runtime, { recursive: true });
  await prepareNode();
  await prepareYtdlp();
  await prepareFfmpeg();
  await prepareWorker();
  console.log('Desktop runtime đã được chuẩn bị theo platform hiện tại.');
} catch (error) {
  console.error('Không thể tự chuẩn bị desktop runtime.');
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
