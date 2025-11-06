// app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'LoopPilot', description: 'Auth scaffold' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900">
        <main className="mx-auto max-w-md p-6">{children}</main>
      </body>
    </html>
  );
}
