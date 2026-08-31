"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken, apiUrl, authHeaders } from "../../../lib/auth";
import { StatusBadge } from "../../../components/StatusBadge";
import { PipelineStepper } from "../../../components/PipelineStepper";

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<any>(null);
  const [review, setReview] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);

  useEffect(() => {
    if (!id) return;
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    fetch(apiUrl(`/api/v1/content-items/${id}`), { headers: { ...authHeaders() } })
      .then((r) => {
        if (r.status === 401) { router.replace("/login"); throw new Error("unauthorized"); }
        return r.json();
      })
      .then(setItem)
      .catch(() => setItem({ error: "not found" }));
    // load channels
    fetch(apiUrl("/api/v1/channels/"), { headers: { ...authHeaders() } })
      .then(r => r.json())
      .then(d => {
        const items = d.items || [];
        setChannels(items);
        // preselect channels bound to item's project
        if (item?.project_id) {
          const forProject = items.filter((c: any) => c.project_id === item.project_id).map((c: any) => c.id);
          if (forProject.length) setSelectedChannels(forProject);
        }
      }).catch(() => {});
  }, [id, router]);

  // reload channels if item project becomes known
  useEffect(() => {
    if (!item?.project_id || channels.length === 0) return;
    const forProject = channels.filter((c: any) => c.project_id === item.project_id).map((c: any) => c.id);
    if (forProject.length) setSelectedChannels(forProject);
  }, [item, channels]);

  async function doGenerate() {
    setGenerating(true); setErr(null); setGenResult(null);
    try {
      const r = await fetch(apiUrl(`/api/v1/content-items/${id}/generate`), { method: "POST", headers: { ...authHeaders() } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `status ${r.status}`);
      setGenResult(d);
      const r2 = await fetch(apiUrl(`/api/v1/content-items/${id}/review`), { headers: { ...authHeaders() } });
      if (r2.ok) setReview(await r2.json());
      const r3 = await fetch(apiUrl(`/api/v1/content-items/${id}`), { headers: { ...authHeaders() } });
      if (r3.ok) setItem(await r3.json());
    } catch (e: any) { setErr(e.message); }
    finally { setGenerating(false); }
  }

  async function loadReview() {
    try {
      const r = await fetch(apiUrl(`/api/v1/content-items/${id}/review`), { headers: { ...authHeaders() } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || String(r.status));
      setReview(d);
    } catch (e: any) { setErr(e.message); }
  }

  if (!item) return <p>Loading…</p>;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>{item.title || item.slug || id}</h1>
        <StatusBadge status={item.status || ""} />
      </div>
      {item.project_id && <p style={{ fontSize: 12, opacity: 0.6 }}>Project: <a href={`/projects/${item.project_id}`} style={{ color: "#7eb8ff" }}>{item.project_id}</a></p>}
      <div style={{ marginTop: 10, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 12 }}>
        <PipelineStepper status={item.status || "idea"} />
      </div>
      <pre style={{ background: "#111", padding: 12, borderRadius: 8, overflow: "auto", fontSize: 12, marginTop: 12 }}>{JSON.stringify(item, null, 2)}</pre>

      {channels.length > 0 && (
        <div style={{ marginTop: 16, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 10, padding: 12 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 13 }}>Channels for publishing</h3>
          <p style={{ fontSize: 11, opacity: 0.6, margin: "0 0 8px" }}>Select channels to publish this item. Channels are per-user and bound to project <code>{item.project_id || "—"}</code>. Manage in <a href="/settings/channels" style={{ color: "#7eb8ff" }}>Settings → Channels</a>.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {channels.map((c: any) => (
              <label key={c.id} style={{ display: "flex", gap: 6, alignItems: "center", background: selectedChannels.includes(c.id) ? "rgba(61,141,255,.18)" : "#0b111a", border: `1px solid ${selectedChannels.includes(c.id) ? "#2a4a7a" : "#1e2f44"}`, borderRadius: 20, padding: "6px 10px", cursor: "pointer", fontSize: 12 }}>
                <input type="checkbox" checked={selectedChannels.includes(c.id)} onChange={e => {
                  if (e.target.checked) setSelectedChannels([...selectedChannels, c.id]);
                  else setSelectedChannels(selectedChannels.filter(x => x !== c.id));
                }} />
                {c.name} <span style={{ opacity: 0.6 }}>({c.type})</span>
              </label>
            ))}
          </div>
          {selectedChannels.length > 0 && <p style={{ fontSize: 11, opacity: 0.5, marginTop: 8 }}>Selected: {selectedChannels.join(", ").slice(0, 80)}</p>}
        </div>
      )}

      <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={doGenerate} disabled={generating} style={{ ...btn, opacity: generating ? 0.6 : 1 }}>{generating ? "Generating…" : "Generate"}</button>
        <button onClick={loadReview} style={btn}>Review</button>
        <button onClick={() => alert("approve stub")} style={btn}>Approve</button>
        <button onClick={() => alert("changes_requested stub")} style={btn}>Request changes</button>
        <button onClick={() => alert("reject stub")} style={btn}>Reject</button>
      </div>
      {err && <p style={{ color: "#ff6b6b", marginTop: 12 }}>Error: {err}</p>}
      {genResult && (
        <div style={{ marginTop: 16, background: "#111", padding: 12, borderRadius: 8 }}>
          <h3 style={{ margin: "0 0 8px" }}>Generate result</h3>
          {genResult.dedup_warning && <p style={{ color: "#ffcc00" }}>⚠ {genResult.dedup_warning}</p>}
          <p style={{ fontSize: 12, opacity: 0.7 }}>Verification: {genResult.verification?.passed ? "passed" : "failed"} — {JSON.stringify(genResult.verification)}</p>
          <pre style={{ fontSize: 11, overflow: "auto" }}>{JSON.stringify(genResult, null, 2)}</pre>
        </div>
      )}
      {review && (
        <div style={{ marginTop: 16, background: "#111", padding: 12, borderRadius: 8 }}>
          <h3 style={{ margin: "0 0 8px" }}>Review bundle</h3>
          <pre style={{ fontSize: 11, overflow: "auto" }}>{JSON.stringify(review, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
const btn: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid #333", background: "#1a1a1a", color: "#eee", cursor: "pointer" };
