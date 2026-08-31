export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0, background: "#0a0a0a", color: "#eee" }}>
        <header style={{ padding: "12px 20px", borderBottom: "1px solid #222" }}>
          <strong>Content Loop</strong> — Review Queue
        </header>
        <main style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>{children}</main>
      </body>
    </html>
  );
}
