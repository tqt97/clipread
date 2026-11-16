import type { Metadata } from 'next';
import './styles.css';

export const metadata: Metadata = {
  title: 'ClipRead — Biến video thành nội dung có thể đọc',
  description: 'Dán đường dẫn video, lấy caption khả dụng và xuất transcript sạch, dễ đọc.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  );
}
