"use client";
import { StatusBadge } from "./StatusBadge";

type Step = { key: string; label: string; hint: string };

const STEPS: Step[] = [
  { key: "idea", label: "Idea", hint: "Title + raw brief" },
  { key: "brief", label: "Brief", hint: "audience, intent, claims" },
  { key: "draft", label: "Draft", hint: "canonical markdown" },
  { key: "review", label: "Review", hint: "human gate" },
  { key: "approved", label: "Approved", hint: "ready to publish" },
  { key: "publish", label: "Publish", hint: "per-channel delivery" },
  { key: "measuring", label: "Measuring", hint: "views, reactions" },
  { key: "reflected", label: "Reflected", hint: "learnings → next test" },
];

function stepIndexForStatus(status: string): number {
  const s = (status || "").toLowerCase();
  if (s === "idea") return 0;
  if (s === "brief_ready") return 1;
  if (s === "drafting") return 2;
  if (s === "review_ready") return 3;
  if (s === "approved" || s === "changes_requested" || s === "rejected" || s === "scheduled") return 4;
  if (s === "publishing" || s === "published" || s === "partially_published" || s === "failed") return 5;
  if (s === "measuring") return 6;
  if (s === "reflected") return 7;
  return 0;
}

export function PipelineStepper({ status, compact = false }: { status: string; compact?: boolean }) {
  const idx = stepIndexForStatus(status);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto", padding: "6px 0" }}>
      {STEPS.map((st, i) => {
        const active = i === idx;
        const done = i < idx;
        return (
          <div key={st.key} style={{ display: "flex", alignItems: "center", gap: 0 }}>
            <div
              title={`${st.label}: ${st.hint}`}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                minWidth: compact ? 64 : 86,
                opacity: done ? 1 : active ? 1 : 0.45,
              }}
            >
              <div
                style={{
                  width: active ? 28 : 22,
                  height: active ? 28 : 22,
                  borderRadius: 999,
                  display: "grid",
                  placeItems: "center",
                  fontSize: active ? 11 : 10,
                  fontWeight: 700,
                  background: done ? "#1f4a2b" : active ? "#3D8DFF" : "#1a2636",
                  color: done ? "#6fdc8c" : active ? "#fff" : "#7a8aa3",
                  border: `1px solid ${active ? "#6DCBF4" : done ? "#2a5a3a" : "#1e2f44"}`,
                  boxShadow: active ? "0 0 12px rgba(61,141,255,.45)" : "none",
                }}
              >
                {done ? "✓" : i + 1}
              </div>
              <div style={{ fontSize: compact ? 10 : 11, fontWeight: active ? 700 : 500, color: active ? "#cfe0ff" : "#8FA0B8", textAlign: "center" }}>
                {st.label}
              </div>
              {!compact && <div style={{ fontSize: 10, color: "#5a6b86", textAlign: "center", lineHeight: 1.1 }}>{st.hint}</div>}
            </div>
            {i < STEPS.length - 1 && (
              <div
                style={{
                  width: compact ? 16 : 22,
                  height: 2,
                  background: i < idx ? "#2a5a3a" : "#1e2f44",
                  margin: "0 2px",
                  marginBottom: compact ? 14 : 22,
                  borderRadius: 2,
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Detailed horizontal timeline used on Guide page
export function PipelineDiagram() {
  return (
    <div style={{ background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 14, padding: 16, overflowX: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 0, minWidth: 760 }}>
        {STEPS.map((st, i) => (
          <div key={st.key} style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <div style={{ flex: 1, textAlign: "center" }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  background: i === 3 ? "#2e1f0a" : i >= 4 && i <= 5 ? "#0e2e1a" : "#0b1420",
                  border: `1px solid ${i === 3 ? "#ff7a1a" : i >= 4 && i <= 5 ? "#1f4a2b" : "#1e2f44"}`,
                  display: "grid",
                  placeItems: "center",
                  margin: "0 auto 8px",
                  fontSize: 14,
                }}
              >
                {["💡", "📋", "✍️", "👁️", "✅", "📡", "📊", "💭"][i]}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#cfe0ff" }}>{st.label}</div>
              <div style={{ fontSize: 11, color: "#8FA0B8" }}>{st.hint}</div>
              <div style={{ fontSize: 10, color: "#5a6b86", marginTop: 4 }}>
                {["human seeds", "AI scaffolds", "AI drafts (human editable)", "human approves", "human decision", "adapters per channel", "auto + manual", "LLM hypotheses / human"][i]}
              </div>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ color: "#2a3a52", fontSize: 14, padding: "0 6px", marginTop: 8 }}>→</div>
            )}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11, color: "#8FA0B8" }}>
        <span style={{ background: "#1a2740", border: "1px solid #2a3a52", borderRadius: 20, padding: "4px 10px" }}>Human gate at Review</span>
        <span style={{ background: "#0e2e1a", border: "1px solid #1f4a2b", borderRadius: 20, padding: "4px 10px" }}>Channel-state is independent</span>
        <span style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 20, padding: "4px 10px" }}>Idempotency key prevents double-post</span>
      </div>
    </div>
  );
}
