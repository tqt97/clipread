import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('user can create, search and bookmark a transcript', async ({ page }) => {
  await page.route('**/api/transcript', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        document: {
          sourceUrl: 'https://www.youtube.com/watch?v=demo',
          platform: 'youtube',
          title: 'Video demo ClipRead',
          author: 'ClipRead',
          language: 'vi',
          segments: [
            { text: 'Worker local giúp xử lý transcript nhanh.', offset: 0, duration: 3, lang: 'vi' },
            { text: 'Nội dung này có thể tìm kiếm và đánh dấu.', offset: 4, duration: 3, lang: 'vi' },
          ],
        },
      }),
    });
  });

  await page.goto('/');
  await expect(page.locator('main')).toHaveAttribute('data-hydrated', 'true');
  await page.getByLabel('Đường dẫn video').fill('https://www.youtube.com/watch?v=demo');
  const extractButton = page.getByRole('button', { name: 'Biến thành bài đọc' });
  await expect(extractButton).toBeEnabled();
  await extractButton.click();

  await expect(page.getByRole('heading', { name: 'Video demo ClipRead' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tóm tắt' })).toBeVisible();

  await page.getByRole('button', { name: 'Caption gốc' }).click();
  await page.getByRole('search').getByLabel('Tìm trong transcript').fill('worker');
  await expect(page.getByRole('search').getByText('1 kết quả')).toBeVisible();

  await page.getByRole('button', { name: 'Đánh dấu bookmark' }).first().click();
  await expect(page.locator('.reader-card').getByRole('button', { name: 'Bỏ bookmark' })).toBeVisible();
});

test('user sees a friendly provider error', async ({ page }) => {
  await page.route('**/api/transcript', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'YOUTUBE_RATE_LIMITED', error: 'upstream detail' }),
    });
  });

  await page.goto('/');
  await expect(page.locator('main')).toHaveAttribute('data-hydrated', 'true');
  await page.getByLabel('Đường dẫn video').fill('https://www.youtube.com/watch?v=limited');
  const extractButton = page.getByRole('button', { name: 'Biến thành bài đọc' });
  await expect(extractButton).toBeEnabled();
  await extractButton.click();

  const errorPanel = page.locator('.error-panel');
  await expect(errorPanel).toContainText('YouTube đang giới hạn truy cập');
  await expect(errorPanel).not.toContainText('upstream detail');
  await expect(errorPanel.getByRole('button', { name: 'Thử lại' })).toBeVisible();
});

test('user can stop polling a queued worker job', async ({ page }) => {
  await page.route('**/api/transcript', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ jobId: 'queued-demo', status: 'queued', stage: 'queued' }),
    });
  });
  await page.route('**/api/transcript/jobs/queued-demo', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ jobId: 'queued-demo', status: 'queued', stage: 'queued' }),
    });
  });

  await page.goto('/');
  await page.getByLabel('Đường dẫn video').fill('https://www.tiktok.com/@demo/video/1');
  await page.getByRole('button', { name: 'Biến thành bài đọc' }).click();
  await expect(page.getByRole('button', { name: 'Dừng theo dõi' })).toBeVisible();
  await page.getByRole('button', { name: 'Dừng theo dõi' }).click();
  await expect(page.getByRole('status')).toContainText('Đã dừng theo dõi job');
});

test('user sees a queue-full error instead of a generic worker error', async ({ page }) => {
  await page.route('**/api/transcript', async (route) => {
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'QUEUE_FULL', error: 'queue detail' }),
    });
  });

  await page.goto('/');
  await page.getByLabel('Đường dẫn video').fill('https://www.tiktok.com/@demo/video/2');
  await page.getByRole('button', { name: 'Biến thành bài đọc' }).click();
  await expect(page.locator('.error-panel')).toContainText('Worker đang quá tải');
  await expect(page.locator('.error-panel')).not.toContainText('queue detail');
});

test('homepage has no critical accessibility violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).analyze();
  const criticalOrSerious = results.violations.filter(
    (violation) => violation.impact === 'critical' || violation.impact === 'serious',
  );
  expect(criticalOrSerious).toEqual([]);
});

test('mobile homepage keeps the input flow usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.getByLabel('Đường dẫn video')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Biến thành bài đọc' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Một link vào. Một bài đọc ra.' })).toBeVisible();
});

test('long transcript keeps a bounded caption DOM window', async ({ page }) => {
  const segments = Array.from({ length: 2_000 }, (_, index) => ({
    text: `Đoạn transcript số ${index} nói về worker local.`,
    offset: index * 3,
    duration: 3,
    lang: 'vi',
  }));
  await page.route('**/api/transcript', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        document: {
          sourceUrl: 'https://www.youtube.com/watch?v=long-demo',
          platform: 'youtube',
          title: 'Transcript dài',
          language: 'vi',
          segments,
        },
      }),
    });
  });

  await page.goto('/');
  await page.getByLabel('Đường dẫn video').fill('https://www.youtube.com/watch?v=long-demo');
  await page.getByRole('button', { name: 'Biến thành bài đọc' }).click();
  await page.getByRole('button', { name: 'Caption gốc' }).click();

  await expect(page.locator('.virtual-caption-list')).toBeVisible();
  await expect.poll(() => page.locator('.caption-row').count()).toBeLessThan(100);
});
