"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { apiUrl, authHeaders } from "../lib/auth";

export type Job = {
  id: string;
  content_item_id: string;
  owner_user_id: string;
  status: "pending" | "running" | "succeeded" | "failed" | string;
  step: string;
  progress: number;
  error?: string | null;
  created_at?: string;
  updated_at?: string;
};

const STEP_LABEL: Record<string, string> = {
  plan_topic: "plan_topic",
  build_brief: "build_brief",
  draft: "draftCanonical",
  draftCanonical: "draftCanonical",
  render: "render",
  verify: "verify",
};

function stepText(step: string, progress: number) {
  const label = STEP_LABEL[step] || step;
  return `${label} ${progress}%`;
}

const STATUS_COLOR: Record<string, { bg: string; fg: string; border: string }> = {
  pending: { bg: "#1a2740", fg: "#8cb4ff", border: "#2a3a52" },
  queued: { bg: "#1e293b", fg: "#94a3b8", border: "#334155" },
  running: { bg: "#2a220a", fg: "#ffcf66", border: "#4a3d16" },
  succeeded: { bg: "#0e2e1a", fg: "#6fdc8c", border: "#1f4a2b" },
  failed: { bg: "#33151a", fg: "#ff8a8a", border: "#5a2a33" },
};

export function GenerationBadge({ job }: { job: Job | null }) {
  if (!job) return null;
  const c = STATUS_COLOR[job.status] || STATUS_COLOR.pending;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: c.bg,
        color: c.fg,
        border: `1px solid ${c.border}`,
        padding: "3px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: c.fg,
          display: "inline-block",
          boxShadow: job.status === "running" ? "0 0 6px currentColor" : "none",
        }}
      />
      {job.status}
    </span>
  );
}

export function GenerationProgress({ job, compact = false }: { job: Job | null; compact?: boolean }) {
  if (!job) return null;
  const pct = Math.max(0, Math.min(100, Number(job.progress) || 0));
  const running = job.status === "pending" || job.status === "running" || job.status === "queued";
  return (
    <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: compact ? 11 : 12, color: "#cfe0ff", fontWeight: 600 }}>{stepText(job.step, pct)}</span>
        <GenerationBadge job={job} />
      </div>
      <div
        style={{
          height: compact ? 6 : 8,
          background: "#1a2636",
          borderRadius: 999,
          overflow: "hidden",
          border: "1px solid #1e2f44",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: job.status === "failed" ? "#ef4444" : job.status === "succeeded" ? "#22c55e" : "linear-gradient(90deg,#3D8DFF,#6DCBF4)",
            transition: "width .4s ease",
            boxShadow: running ? "0 0 8px rgba(61,141,255,.6)" : "none",
          }}
        />
      </div>
      {job.error && (
        <div
          style={{
            background: "rgba(255,60,60,.12)",
            border: "1px solid rgba(255,60,60,.3)",
            color: "#ff8a8a",
            padding: 8,
            borderRadius: 8,
            fontSize: 11,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {job.error}
        </div>
      )}
    </div>
  );
}

export function useGenerationPoll(contentItemId: string | null, enabled: boolean = true) {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<number | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!contentItemId) return;
    try {
      const r = await fetch(apiUrl(`/api/v1/content-items/${contentItemId}/generation-status`), {
        headers: { ...authHeaders() },
      });
      if (r.status === 404) {
        setJob(null);
        return;
      }
      if (!r.ok) return;
      const d = (await r.json()) as Job;
      // normalize progress as int
      if (typeof d.progress === "string") d.progress = parseInt(d.progress as any, 10) || 0;
      setJob(d);
      return d;
    } catch {
      // ignore
    }
  }, [contentItemId]);

  useEffect(() => {
    if (!enabled || !contentItemId) return;
    setLoading(true);
    fetchStatus().finally(() => setLoading(false));
    const id = window.setInterval(async () => {
      const j = await fetchStatus();
      if (j && (j.status === "succeeded" || j.status === "failed")) {
        window.clearInterval(id);
        timer.current = null;
      }
    }, 2000);
    timer.current = id as unknown as number;
    return () => window.clearInterval(id);
  }, [contentItemId, enabled, fetchStatus]);

  // helper to know if should keep polling
  const isActive = job ? job.status === "pending" || job.status === "running" : false;

  return { job, loading, fetchStatus, isActive, setJob };
}

export function GlobalGenerationStatus({ visibleItems }: { visibleItems?: string[] }) {
  // Global banner showing count of active jobs. Polls every 5s using list endpoint not available,
  // so we rely on localStorage or just show placeholder if visibleItems provided via props.
  // For now, simple static banner that lists pending items passed in.
  if (!visibleItems || visibleItems.length === 0) return null;
  return (
    <div
      style={{
        background: "rgba(61,141,255,.12)",
        border: "1px solid rgba(61,141,255,.25)",
        color: "#8fb8ff",
        padding: "8px 12px",
        borderRadius: 10,
        fontSize: 12,
        marginBottom: 12,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span>
        <strong>{visibleItems.length}</strong> generation{visibleItems.length > 1 ? "s" : ""} running…
      </span>
      <span style={{ opacity: 0.7, fontSize: 11 }}>auto-refresh every 2s</span>
    </div>
  );
}
