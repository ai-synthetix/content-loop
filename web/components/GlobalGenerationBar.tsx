"use client";
import { useEffect, useState } from "react";
import { apiUrl, authHeaders, getToken } from "../lib/auth";
import type { Job } from "./GenerationStatus";

export function GlobalGenerationBar() {
  const [active, setActive] = useState<{ id: string; job: Job }[]>([]);

  useEffect(() => {
    if (!getToken()) return;
    let alive = true;
    async function tick() {
      try {
        const r = await fetch(apiUrl("/api/v1/content-items/"), { headers: { ...authHeaders() } });
        if (!r.ok) return;
        const d = await r.json();
        const items: { id: string }[] = d.items || [];
        const results: { id: string; job: Job }[] = [];
        for (const it of items.slice(0, 20)) {
          try {
            const jr = await fetch(apiUrl(`/api/v1/content-items/${it.id}/generation-status`), { headers: { ...authHeaders() } });
            if (!jr.ok) continue;
            const j = (await jr.json()) as Job;
            if (typeof j.progress === "string") j.progress = parseInt(j.progress as any, 10) || 0;
            if (j.status === "pending" || j.status === "running") results.push({ id: it.id, job: j });
          } catch {}
        }
        if (alive) setActive(results);
      } catch {}
    }
    tick();
    const iv = window.setInterval(tick, 3000);
    return () => { alive = false; window.clearInterval(iv); };
  }, []);

  if (active.length === 0) return null;
  return (
    <div
      style={{
        background: "rgba(61,141,255,.10)",
        borderBottom: "1px solid rgba(61,141,255,.2)",
        padding: "8px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        fontSize: 12,
        color: "#8fb8ff",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <span>
        <strong>{active.length}</strong> generation{active.length > 1 ? "s" : ""} in progress — {active.map((a) => `${a.job.step} ${a.job.progress}%`).join(" · ")}
      </span>
      <a href="/" style={{ color: "#cfe0ff", textDecoration: "underline", fontSize: 11 }}>open Queue →</a>
    </div>
  );
}
