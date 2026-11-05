import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Navbar } from '@/components/Navbar';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Sofia — Personal AI Companion',
  description: 'Composed, dry-witted, quietly strict personal AI companion with Hermes AI and computer use.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-[#080205] text-rose-50 selection:bg-rose-600 selection:text-white relative overflow-x-hidden`}
      >
        {/* Ambient Dark Burgundy Glassy Orbs */}
        <div className="fixed -top-40 -left-40 w-96 h-96 bg-rose-950/40 rounded-full blur-[140px] pointer-events-none z-0" />
        <div className="fixed top-1/3 -right-40 w-[30rem] h-[30rem] bg-pink-950/30 rounded-full blur-[160px] pointer-events-none z-0" />
        <div className="fixed -bottom-40 left-1/3 w-[36rem] h-[36rem] bg-burgundy-950/35 rounded-full blur-[180px] pointer-events-none z-0" />

        <div className="relative z-10 flex flex-col min-h-screen">
          <Navbar />
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
