"use client";
export type BadgeStatus =
  | "idea"
  | "brief_ready"
  | "drafting"
  | "review_ready"
  | "approved"
  | "rejected"
  | "changes_requested"
  | "scheduled"
  | "publishing"
  | "published"
  | "partially_published"
  | "failed"
  | "measuring"
  | "reflected"
  | string;

const MAP: Record<string, { label: string; bg: string; fg: string; dot: string; border: string }> = {
  idea: { label: "idea", bg: "#1a2740", fg: "#8cb4ff", dot: "#3D8DFF", border: "#2a3a52" },
  brief_ready: { label: "brief ready", bg: "#1a2740", fg: "#8cb4ff", dot: "#3D8DFF", border: "#2a3a52" },
  drafting: { label: "drafting", bg: "#2a220a", fg: "#ffcf66", dot: "#ffbf2e", border: "#4a3d16" },
  review_ready: { label: "review ready", bg: "#2e1f0a", fg: "#ff9d5c", dot: "#ff7a1a", border: "#5a3420" },
  approved: { label: "approved", bg: "#0e2e1a", fg: "#6fdc8c", dot: "#22c55e", border: "#1f4a2b" },
  rejected: { label: "rejected", bg: "#33151a", fg: "#ff8a8a", dot: "#ef4444", border: "#5a2a33" },
  changes_requested: { label: "changes requested", bg: "#331e12", fg: "#ff9d66", dot: "#ff6b35", border: "#5a3a22" },
  scheduled: { label: "scheduled", bg: "#1a233a", fg: "#93b8ff", dot: "#5B8DEF", border: "#2a3a5a" },
  publishing: { label: "publishing", bg: "#1a233a", fg: "#93b8ff", dot: "#5B8DEF", border: "#2a3a5a" },
  published: { label: "published", bg: "#0e2e1a", fg: "#6fdc8c", dot: "#22c55e", border: "#1f4a2b" },
  partially_published: { label: "partial", bg: "#2a2a0a", fg: "#ffcf66", dot: "#eab308", border: "#4a4a1a" },
  failed: { label: "failed", bg: "#33151a", fg: "#ff8a8a", dot: "#ef4444", border: "#5a2a33" },
  measuring: { label: "measuring", bg: "#1e293b", fg: "#94a3b8", dot: "#64748b", border: "#334155" },
  reflected: { label: "reflected", bg: "#1e1a33", fg: "#b4a0ff", dot: "#8b5cf6", border: "#3a2a5a" },
};

export function StatusBadge({ status, size = 12 }: { status: string; size?: number }) {
  const key = (status || "").toLowerCase();
  const c = MAP[key] || { label: status || "—", bg: "#222", fg: "#aaa", dot: "#555", border: "#333" };
  return (
    <span
      title={status}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: size,
        fontWeight: 600,
        letterSpacing: 0.2,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: 999, background: c.dot, display: "inline-block", boxShadow: `0 0 6px ${c.dot}` }} />
      {c.label}
    </span>
  );
}
