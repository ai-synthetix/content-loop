import type { Metadata } from "next";
import { Header } from "../components/Header";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { GlobalGenerationBar } from "../components/GlobalGenerationBar";

export const metadata: Metadata = {
  title: { default: "SwipeLoop", template: "%s — SwipeLoop" },
  description: "SwipeLoop — Tinder for content. Swipe ideas & drafts, publish through pluggable channels.",
  metadataBase: new URL("http://localhost:3000"),
  openGraph: { title: "SwipeLoop", description: "Tinder for content: swipe A vs B, like/dislike drafts. Editorial pipeline idea → publish → measure → reflect.", type: "website" },
  robots: { index: true, follow: true },
  icons: { icon: "/icon.svg" },
};

const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark')t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

const themeVars = `
:root{--bg:#0a0a0a;--fg:#eee;--border:#222;--link:#8fb8ff;--link-strong:#7eb8ff;--muted:#9aa3b2;--toggle-bg:#1a1a1a;--card:#141414;--panel:#111;}
[data-theme="light"]{--bg:#f8f9fb;--fg:#111827;--border:#e5e7eb;--link:#2563eb;--link-strong:#1d4ed8;--muted:#6b7280;--toggle-bg:#ffffff;--card:#ffffff;--panel:#f3f4f6;}
html{color-scheme:dark}
html[data-theme="light"]{color-scheme:light}
*{scrollbar-color:var(--border) transparent}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
        <style>{themeVars}</style>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "var(--bg)", color: "var(--fg)" }}>
        <GlobalGenerationBar />
        <Header />
        <main style={{ padding: 20, maxWidth: 1320, margin: "0 auto" }}>
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </body>
    </html>
  );
}
