"use client";
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en"><body style={{ fontFamily: "system-ui", background: "#0a0a0a", color: "#eee", margin: 0, padding: 24 }}>
      <h2>App crashed</h2><p style={{ opacity: 0.7, fontSize: 13 }}>{error.message}</p>
      <button onClick={reset} style={{ background: "#3D8DFF", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer" }}>Reload</button>
    </body></html>
  );
}
