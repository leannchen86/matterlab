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
  metadataBase: new URL('https://mattershift-lab-sim.leann86920.chatgpt.site'),
  title: 'MatterLab — Virtual Materials Laboratory',
  description: 'A virtual materials lab for exploring equipment, experiments, and scientific decisions.',
  openGraph: {
    title: 'MatterLab — Virtual Materials Laboratory',
    description: 'A virtual lab for experimental thinking.',
    images: [{ url: '/og.png', width: 1672, height: 941, alt: 'MatterLab virtual materials laboratory' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MatterLab — Virtual Materials Laboratory',
    description: 'A virtual lab for experimental thinking.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
