"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken, apiUrl, authHeaders, clearToken } from "../../../lib/auth";
import { StatusBadge } from "../../../components/StatusBadge";
import { PipelineStepper } from "../../../components/PipelineStepper";
import { Skeleton, CardSkeleton } from "../../../components/Skeleton";

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<any>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [review, setReview] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);

  function on401() { clearToken(); router.replace("/login"); }

  useEffect(() => {
    if (!id) return;
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    setLoading(true);
    fetch(apiUrl(`/api/v1/content-items/${id}`), { headers: { ...authHeaders() } })
      .then((r) => {
        if (r.status === 401) { on401(); throw new Error("unauthorized"); }
        if (!r.ok) throw new Error(`load failed ${r.status}`);
        return r.json();
      })
      .then(setItem)
      .catch((e) => { if (e.message !== "unauthorized") setErr(e.message); setItem({ _error: true }); })
      .finally(() => setLoading(false));
    fetch(apiUrl("/api/v1/channels/"), { headers: { ...authHeaders() } })
      .then(r => {
        if (r.status === 401) { on401(); throw new Error("unauthorized"); }
        return r.json();
      })
      .then(d => {
        const items = d.items || [];
        setChannels(items);
      }).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!item?.project_id || channels.length === 0) return;
    const forProject = channels.filter((c: any) => c.project_id === item.project_id).map((c: any) => c.id);
    if (forProject.length) setSelectedChannels(forProject);
  }, [item, channels]);

  async function doGenerate() {
    setGenerating(true); setGenError(null); setGenResult(null);
    try {
      const r = await fetch(apiUrl(`/api/v1/content-items/${id}/generate`), { method: "POST", headers: { ...authHeaders() } });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { on401(); return; }
      if (!r.ok) throw new Error(d.error || `generate failed ${r.status}`);
      setGenResult(d);
      try {
        const r2 = await fetch(apiUrl(`/api/v1/content-items/${id}/review`), { headers: { ...authHeaders() } });
        if (r2.ok) setReview(await r2.json());
        const r3 = await fetch(apiUrl(`/api/v1/content-items/${id}`), { headers: { ...authHeaders() } });
        if (r3.ok) setItem(await r3.json());
      } catch {}
    } catch (e: any) { setGenError(e.message); }
    finally { setGenerating(false); }
  }

  async function loadReview() {
    try {
      const r = await fetch(apiUrl(`/api/v1/content-items/${id}/review`), { headers: { ...authHeaders() } });
      if (r.status === 401) { on401(); return; }
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || String(r.status));
      setReview(d); setErr(null);
    } catch (e: any) { setErr(e.message); }
  }

  if (loading) return <div style={{ display: "grid", gap: 12 }}><CardSkeleton /><Skeleton style={{ height: 120 }} /></div>;
  if (err && !item) return <div style={{ background: "rgba(255,60,60,.12)", border: "1px solid rgba(255,60,60,.3)", padding: 16, borderRadius: 12, color: "#ff8a8a" }}><strong>Failed to load item</strong><div style={{ fontSize: 12, marginTop: 6 }}>{err}</div><button onClick={() => location.reload()} style={{ marginTop: 10, background: "#1a2636", border: "1px solid #2a3a52", color: "#cfe0ff", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>Retry</button></div>;
  if (!item || item._error) return <div style={{ background: "rgba(255,60,60,.12)", border: "1px solid rgba(255,60,60,.3)", padding: 16, borderRadius: 12, color: "#ff8a8a" }}>Item not found or failed to load.<button onClick={() => location.reload()} style={{ marginLeft: 10, background: "#1a2636", border: "1px solid #2a3a52", color: "#cfe0ff", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>Retry</button></div>;

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

      {/* Generation error with retry */}
      {genError && (
        <div style={{ marginTop: 12, background: "rgba(255,60,60,.12)", border: "1px solid rgba(255,60,60,.3)", padding: 12, borderRadius: 10, color: "#ff8a8a" }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Generation failed</div>
          <div style={{ fontSize: 12, marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{genError}</div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>Check API logs (OPENCODE_API_KEY / AI_MODEL) and try again.</div>
          <button onClick={doGenerate} disabled={generating} style={{ marginTop: 10, background: generating ? "#2a4a7a" : "#b4232a", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: generating ? "wait" : "pointer" }}>{generating ? "Retrying…" : "Retry generate"}</button>
        </div>
      )}

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
        <button onClick={doGenerate} disabled={generating} style={{ ...btn, opacity: generating ? 0.6 : 1, background: "#3D8DFF", borderColor: "#3D8DFF", color: "#fff" }}>{generating ? "Generating…" : "Generate (retryable)"}</button>
        <button onClick={loadReview} style={btn}>Review</button>
        <button onClick={() => alert("approve stub — use PATCH /api/v1/content-items/{id} with status: approved")} style={btn}>Approve</button>
        <button onClick={() => alert("changes_requested stub")} style={btn}>Request changes</button>
        <button onClick={() => alert("reject stub")} style={btn}>Reject</button>
      </div>
      {err && !genError && <p style={{ color: "#ff6b6b", marginTop: 12 }}>Error: {err} <button onClick={() => setErr(null)} style={{ marginLeft: 8, background: "#1a2636", border: "1px solid #2a3a52", color: "#cfe0ff", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11 }}>Dismiss</button></p>}
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
