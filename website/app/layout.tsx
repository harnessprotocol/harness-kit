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
  title: {
    template: '%s | Harness Kit',
    default: 'Harness Kit',
  },
  description: 'A harness-agnostic framework for AI coding tools.',
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
