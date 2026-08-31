"use client";
import { useEffect, useState } from "react";
import { getToken } from "../lib/auth";
import type { Job } from "./GenerationStatus";

// Previously this bar polled every 3s fetching generation-status for each item (up to 20 requests per tick).
// Now disabled on Queue/global — no per-item polling. Live polling lives only on /items/[id] page.
// Keep component mounted but idle; future batch endpoint GET /generation-jobs?ids= can re-enable with single request.
export function GlobalGenerationBar() {
  const [active] = useState<{ id: string; job: Job }[]>([]);

  useEffect(() => {
    if (!getToken()) return;
    // No auto-poll: intentionally no fetch here.
    // If you need live global status, use a future batch endpoint, not N per-item requests.
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
