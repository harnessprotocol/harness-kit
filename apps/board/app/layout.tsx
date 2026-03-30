import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from './components/Sidebar';
import { ThemeInit } from './components/ThemeInit';

export const metadata: Metadata = {
  title: 'Harness Board',
  description: 'Lightweight Kanban board with Claude ↔ web UI real-time sync',
};

/** Inline script to apply theme before first paint (avoids flash) */
const themeScript = `
(function(){
  var t = localStorage.getItem("harness-kit-theme") || "system";
  var dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) document.documentElement.classList.add("dark");
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <ThemeInit />
        <Sidebar />
        <main style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
