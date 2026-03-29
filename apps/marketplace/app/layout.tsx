import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-display" });

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
    <html lang="en" className={`dark ${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="bg-[#0c0c0e] text-gray-100 antialiased">
        <nav className="sticky top-0 z-50 border-b border-[#1e1e22] bg-[#0c0c0e]/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
            <Link href="/" className="flex items-center gap-2.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 32 32"
                className="size-7 shrink-0"
              >
                <rect width="32" height="32" rx="6" fill="#0d0d12" />
                <text
                  x="16"
                  y="22"
                  textAnchor="middle"
                  fontFamily="system-ui, sans-serif"
                  fontWeight="700"
                  fontSize="16"
                  fill="#8b7aff"
                >
                  hk
                </text>
              </svg>
              <span className="font-display font-bold tracking-tight">
                Harness Kit
              </span>
              <span className="text-xs font-medium text-violet-400">
                Marketplace
              </span>
            </Link>
            <div className="flex items-center gap-6 text-sm text-gray-400">
              <Link
                href="/plugins"
                className="cursor-pointer transition-colors hover:text-gray-100"
              >
                Plugins
              </Link>
              <Link
                href="/profiles"
                className="cursor-pointer transition-colors hover:text-gray-100"
              >
                Profiles
              </Link>
              <a
                href="https://github.com/harnessprotocol/harness-kit"
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer transition-colors hover:text-gray-100"
              >
                GitHub
              </a>
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-7xl px-6 py-12">{children}</main>
        <footer className="relative mt-12 border-t border-[#1e1e22]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
          <div className="mx-auto max-w-5xl px-6 py-12">
            <div className="grid gap-8 sm:grid-cols-3">
              {/* Brand */}
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 32 32"
                    className="size-6 shrink-0"
                  >
                    <rect width="32" height="32" rx="6" fill="#0d0d12" />
                    <text
                      x="16"
                      y="22"
                      textAnchor="middle"
                      fontFamily="system-ui, sans-serif"
                      fontWeight="700"
                      fontSize="16"
                      fill="#8b7aff"
                    >
                      hk
                    </text>
                  </svg>
                  <span className="font-display font-semibold text-gray-100">
                    Harness Kit
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-gray-400">
                  Skills, agents, and configuration for Claude Code.
                </p>
              </div>

              {/* Resources */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-gray-100">
                  Resources
                </h3>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li>
                    <Link
                      href="/plugins"
                      className="cursor-pointer transition-colors hover:text-gray-100"
                    >
                      Plugins
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/profiles"
                      className="cursor-pointer transition-colors hover:text-gray-100"
                    >
                      Profiles
                    </Link>
                  </li>
                  <li>
                    <a
                      href="https://github.com/harnessprotocol/harness-kit"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cursor-pointer transition-colors hover:text-gray-100"
                    >
                      GitHub
                    </a>
                  </li>
                </ul>
              </div>

              {/* Legal */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-gray-100">
                  Legal
                </h3>
                <ul className="space-y-2 text-sm text-gray-400">
                  <li>
                    <a
                      href="https://github.com/harnessprotocol/harness-kit/blob/main/LICENSE"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cursor-pointer transition-colors hover:text-gray-100"
                    >
                      Apache-2.0 License
                    </a>
                  </li>
                  <li>
                    <a
                      href="https://harnessprotocol.ai"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cursor-pointer transition-colors hover:text-gray-100"
                    >
                      Harness Protocol
                    </a>
                  </li>
                </ul>
              </div>
            </div>

            <div className="mt-8 border-t border-[#1e1e22] pt-6 text-center text-xs text-gray-500">
              © {new Date().getFullYear()} Harness Kit Contributors
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
