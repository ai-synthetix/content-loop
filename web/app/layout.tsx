import type { Metadata } from "next";
import { Header } from "../components/Header";
import { ErrorBoundary } from "../components/ErrorBoundary";

export const metadata: Metadata = {
  title: { default: "Content Loop", template: "%s — Content Loop" },
  description: "Content Loop — editorial pipeline from idea to reflected learnings. Human gates, AI drafts, pluggable channels.",
  metadataBase: new URL("http://localhost:3000"),
  openGraph: { title: "Content Loop", description: "Editorial pipeline: idea → brief → draft → review → publish → measure → reflect.", type: "website" },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
      </head>
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#0a0a0a", color: "#eee" }}>
        <Header />
        <main style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
      </body>
    </html>
  );
}
