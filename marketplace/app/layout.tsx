import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Harness Kit Marketplace",
  description:
    "Skills, agents, and configuration for Claude Code — browse, search, and install plugins.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.className} bg-[#0a0a0a] text-gray-100 antialiased`}
      >
        <nav className="sticky top-0 z-50 border-b border-[#2a2a2a] bg-[#0a0a0a]/80 backdrop-blur-sm">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <a href="/" className="text-lg font-semibold tracking-tight">
              Harness Kit
            </a>
            <div className="flex items-center gap-6 text-sm text-gray-400">
              <a
                href="/plugins"
                className="transition-colors hover:text-gray-100"
              >
                Plugins
              </a>
              <a
                href="/profiles"
                className="transition-colors hover:text-gray-100"
              >
                Profiles
              </a>
              <a
                href="https://github.com/harnessprotocol/harness-kit"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-gray-100"
              >
                GitHub
              </a>
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-7xl px-6 py-12">{children}</main>
        <Script
          defer
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon={`{"token": "REPLACE_WITH_CF_TOKEN"}`}
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
