"use client";
export function Skeleton({ style }: { style?: React.CSSProperties }) {
  return <div style={{ background: "linear-gradient(90deg,#0f1620 25%,#16202e 50%,#0f1620 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite", borderRadius: 8, ...style }} />;
}
export function CardSkeleton() {
  return <div style={{ background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 16 }}><Skeleton style={{ height: 18, width: "60%", marginBottom: 10 }} /><Skeleton style={{ height: 12, width: "90%", marginBottom: 6 }} /><Skeleton style={{ height: 12, width: "40%" }} /></div>;
}
export function TableSkeleton({ rows = 3 }: { rows?: number }) {
  return <div style={{ display: "grid", gap: 8 }}>{Array.from({ length: rows }).map((_, i) => <Skeleton key={i} style={{ height: 44, borderRadius: 10 }} />)}</div>;
}
