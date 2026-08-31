"use client";
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div style={{ background: "rgba(255,60,60,.1)", border: "1px solid rgba(255,60,60,.3)", padding: 20, borderRadius: 12, color: "#ff8a8a" }}>
      <h2 style={{ margin: 0, fontSize: 16 }}>Something went wrong</h2>
      <p style={{ fontSize: 12, opacity: 0.85, wordBreak: "break-word" }}>{error.message || "Unknown error"}</p>
      <button onClick={reset} style={{ background: "#1a2636", border: "1px solid #2a3a52", color: "#cfe0ff", borderRadius: 8, padding: "8px 14px", cursor: "pointer" }}>Try again</button>
    </div>
  );
}
