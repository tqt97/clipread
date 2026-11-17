import { strict as assert } from 'node:assert';

const baseUrl = process.env.CLIPREAD_BASE_URL;
if (!baseUrl) throw new Error('Thiếu CLIPREAD_BASE_URL');

const cases = [
  ['youtube', process.env.SMOKE_YOUTUBE_URL],
  ['tiktok', process.env.SMOKE_TIKTOK_URL],
  ['facebook', process.env.SMOKE_FACEBOOK_URL],
] as const;

for (const [name, url] of cases) {
  if (!url) {
    console.log(`[skip] ${name}: chưa cấu hình URL public smoke`);
    continue;
  }
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/transcript`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url, language: 'auto' }),
  });
  const payload = await response.json().catch(() => ({}));
  assert.ok(response.status < 500, `${name}: HTTP ${response.status}`);
  console.log(`[${response.status}] ${name}: ${payload.code || 'accepted'}`);
}
