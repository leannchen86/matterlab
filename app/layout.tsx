import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://leannchen86.github.io/matterlab/'),
  title: 'MatterLab | Virtual Materials Laboratory',
  description: 'A virtual materials lab for exploring equipment, experiments, and scientific decisions.',
  openGraph: {
    title: 'MatterLab | Virtual Materials Laboratory',
    description: 'A virtual lab for experimental thinking.',
    images: [{ url: 'https://leannchen86.github.io/matterlab/og.png', width: 1672, height: 941, alt: 'MatterLab virtual materials laboratory' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MatterLab | Virtual Materials Laboratory',
    description: 'A virtual lab for experimental thinking.',
    images: ['https://leannchen86.github.io/matterlab/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ backgroundColor: '#e7ded1' }}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        style={{ backgroundColor: '#e7ded1' }}
      >
        {children}
      </body>
    </html>
  );
}
