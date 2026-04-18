import './global.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { Inter, Space_Grotesk } from 'next/font/google';
import type { ReactNode } from 'react';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display',
});

export const metadata = {
  metadataBase: new URL('https://harnesskit.ai'),
  title: {
    template: '%s | Harness Kit',
    default: 'Harness Kit — Configure all your AI coding harnesses',
  },
  description: 'A harness-agnostic framework for AI coding tools.',
  openGraph: {
    title: 'Harness Kit — Configure all your AI coding harnesses',
    description: 'A harness-agnostic framework for AI coding tools.',
    url: 'https://harnesskit.ai',
    siteName: 'Harness Kit',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Harness Kit — Configure all your AI coding harnesses',
    description: 'A harness-agnostic framework for AI coding tools.',
  },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <RootProvider
          theme={{
            defaultTheme: 'dark',
            attribute: 'class',
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
