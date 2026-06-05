import './global.css';
import { RootProvider } from 'fumadocs-ui/provider/next';
import { Inter } from 'next/font/google';
import type { ReactNode } from 'react';

// Linear uses Inter Variable for every role (display + body). The geometric
// cv01/ss03 features and weight 510/590 are applied in global.css.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
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

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans antialiased">
        <RootProvider
          theme={{
            defaultTheme: 'dark',
            attribute: 'class',
          }}
          search={{
            options: { type: 'static' },
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
