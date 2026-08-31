"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken, apiUrl, authHeaders, clearToken } from "../../../lib/auth";
import { StatusBadge } from "../../../components/StatusBadge";
import { PipelineStepper } from "../../../components/PipelineStepper";
import { Skeleton, CardSkeleton } from "../../../components/Skeleton";
import { GenerationProgress, type Job } from "../../../components/GenerationStatus";
import { VariantsGrid, PrettyJSON, VariantCard } from "../../../components/VariantPreview";

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [genError, setGenError] = useState<string | null>(null);
  const [review, setReview] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [approving, setApproving] = useState(false);
  const pollRef = useRef<number | null>(null);

  function on401() { clearToken(); router.replace("/login"); }

  async function fetchItem() {
    const r = await fetch(apiUrl(`/api/v1/content-items/${id}`), { headers: { ...authHeaders() } });
    if (r.status === 401) { on401(); throw new Error("unauthorized"); }
    if (!r.ok) throw new Error(`load failed ${r.status}`);
    const d = await r.json();
    setItem(d);
    return d;
  }

  async function fetchJob() {
    try {
      const r = await fetch(apiUrl(`/api/v1/content-items/${id}/generation-status`), { headers: { ...authHeaders() } });
      if (r.status === 404) { setJob(null); return null; }
      if (!r.ok) return null;
      const j = (await r.json()) as Job;
      if (typeof j.progress === "string") j.progress = parseInt(j.progress as any, 10) || 0;
      setJob(j);
      return j;
    } catch { return null; }
  }

  function startPolling() {
    if (pollRef.current) window.clearInterval(pollRef.current);
    fetchJob();
    const iv = window.setInterval(async () => {
      const j = await fetchJob();
      if (j && (j.status === "succeeded" || j.status === "failed")) {
        window.clearInterval(iv);
        pollRef.current = null;
        try {
          await fetchItem();
          const r2 = await fetch(apiUrl(`/api/v1/content-items/${id}/review`), { headers: { ...authHeaders() } });
          if (r2.ok) setReview(await r2.json());
        } catch {}
      }
    }, 2000);
    pollRef.current = iv as unknown as number;
  }

  useEffect(() => {
    if (!id) return;
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    setLoading(true);
    fetchItem()
      .catch((e) => { if (e.message !== "unauthorized") setErr(e.message); setItem({ _error: true }); })
      .finally(() => setLoading(false));
    fetchJob();
    fetch(apiUrl("/api/v1/channels/"), { headers: { ...authHeaders() } })
      .then(r => {
        if (r.status === 401) { on401(); throw new Error("unauthorized"); }
        return r.json();
      })
      .then(d => {
        const items = d.items || [];
        setChannels(items);
      }).catch(() => {});
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [id]);

  useEffect(() => {
    if (job && (job.status === "pending" || job.status === "running")) {
      startPolling();
    }
  }, [job?.id]);

  useEffect(() => {
    if (!item?.project_id || channels.length === 0) return;
    const forProject = channels.filter((c: any) => c.project_id === item.project_id).map((c: any) => c.id);
    if (forProject.length) setSelectedChannels(forProject);
  }, [item, channels]);

  async function doGenerate() {
    setGenError(null);
    try {
      const r = await fetch(apiUrl(`/api/v1/content-items/${id}/generate`), { method: "POST", headers: { ...authHeaders() } });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { on401(); return; }
      if (!r.ok && r.status !== 202) throw new Error(d.error || `generate failed ${r.status}`);
      const j = (d.job || d) as Job;
      if (j && j.id) {
        if (typeof j.progress === "string") j.progress = parseInt(j.progress as any, 10) || 0;
        setJob(j);
      } else if (d.job_id) {
        await fetchJob();
      }
      startPolling();
    } catch (e: any) { setGenError(e.message); }
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

  async function doApprove(decision: string) {
    setApproving(true);
    setErr(null);
    try {
      const r = await fetch(apiUrl(`/api/v1/content-items/${id}/approvals`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ decision }),
      });
      if (r.status === 401) { on401(); return; }
      const d = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(d.error || `approve failed ${r.status}`);
      // refresh item to show new status
      await fetchItem();
      await loadReview();
    } catch (e:any) { setErr(e.message); }
    finally { setApproving(false); }
  }

  if (loading) return <div style={{ display: "grid", gap: 12 }}><CardSkeleton /><Skeleton style={{ height: 120 }} /></div>;
  if (err && !item) return <div style={{ background: "rgba(255,60,60,.12)", border: "1px solid rgba(255,60,60,.3)", padding: 16, borderRadius: 12, color: "#ff8a8a" }}><strong>Failed to load item</strong><div style={{ fontSize: 12, marginTop: 6 }}>{err}</div><button onClick={() => location.reload()} style={{ marginTop: 10, background: "#1a2636", border: "1px solid #2a3a52", color: "#cfe0ff", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>Retry</button></div>;
  if (!item || item._error) return <div style={{ background: "rgba(255,60,60,.12)", border: "1px solid rgba(255,60,60,.3)", padding: 16, borderRadius: 12, color: "#ff8a8a" }}>Item not found or failed to load.<button onClick={() => location.reload()} style={{ marginLeft: 10, background: "#1a2636", border: "1px solid #2a3a52", color: "#cfe0ff", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>Retry</button></div>;

  const isActive = job?.status === "pending" || job?.status === "running";

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

      {job && (
        <div style={{ marginTop: 12, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 13 }}>Generation status</h3>
            <span style={{ fontSize: 11, opacity: 0.6 }}>{job.id.slice(0, 8)}…</span>
          </div>
          <GenerationProgress job={job} />
          {isActive && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>auto-polling every 2s — logs stream via progress</div>}
          {job.status === "failed" && (
            <button onClick={doGenerate} style={{ marginTop: 10, background: "#b4232a", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: "pointer" }}>Retry generate</button>
          )}
          {job.status === "succeeded" && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#6fdc8c" }}>Generation succeeded — content version created.</div>
          )}
        </div>
      )}

      {genError && (
        <div style={{ marginTop: 12, background: "rgba(255,60,60,.12)", border: "1px solid rgba(255,60,60,.3)", padding: 12, borderRadius: 10, color: "#ff8a8a" }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Generation failed</div>
          <div style={{ fontSize: 12, marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{genError}</div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>Check API logs (OPENCODE_API_KEY / AI_MODEL) and try again.</div>
          <button onClick={doGenerate} style={{ marginTop: 10, background: "#b4232a", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: "pointer" }}>Retry generate</button>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <PrettyJSON data={item} title="Content item JSON" collapsible />
      </div>

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
        <button onClick={doGenerate} style={{ ...btn, opacity: isActive ? 0.6 : 1, background: isActive ? "#2a4a7a" : "#3D8DFF", borderColor: "#3D8DFF", color: "#fff" }}>{isActive ? `${job?.step || "Generating"} ${job?.progress || 0}%` : "Generate (retryable)"}</button>
        <button onClick={loadReview} style={btn}>Review</button>
        <button onClick={() => doApprove("approved")} disabled={approving || item.status==="approved"} style={{ ...btn, opacity: approving||item.status==="approved" ? 0.6 : 1, background: item.status==="approved" ? "#1f4a2b" : "#1a2636" }}>{approving ? "Approving…" : item.status==="approved" ? "✓ Approved" : "Approve"}</button>
        <button onClick={() => doApprove("changes_requested")} disabled={approving} style={btn}>{approving ? "…" : "Request changes"}</button>
        <button onClick={() => doApprove("rejected")} disabled={approving} style={btn}>{approving ? "…" : "Reject"}</button>
      </div>
      {err && !genError && <p style={{ color: "#ff6b6b", marginTop: 12 }}>Error: {err} <button onClick={() => setErr(null)} style={{ marginLeft: 8, background: "#1a2636", border: "1px solid #2a3a52", color: "#cfe0ff", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11 }}>Dismiss</button></p>}
      {review && (
        <div style={{ marginTop: 16, display:"grid", gap:12 }}>
          <h3 style={{ margin: 0 }}>Review bundle</h3>
          {review.verification && (
            <div style={{ background:"#0f1620", border:"1px solid #1e2f44", borderRadius:10, padding:12 }}>
              <div style={{ fontSize:12, fontWeight:700 }}>Verification</div>
              <div style={{ fontSize:12, marginTop:4, color: review.verification.passed ? "#6fdc8c" : "#ff8a8a" }}>{review.verification.passed ? "✓ Passed" : "✗ Failed"} — length {review.verification.length}</div>
              {(review.verification.errors||[]).length>0 && <ul style={{ fontSize:11, color:"#ff8a8a", marginTop:6 }}>{review.verification.errors.map((e:string,i:number)=><li key={i}>{e}</li>)}</ul>}
              {(review.verification.warnings||[]).length>0 && <ul style={{ fontSize:11, color:"#ffcf66", marginTop:6 }}>{review.verification.warnings.map((e:string,i:number)=><li key={i}>{e}</li>)}</ul>}
            </div>
          )}
          {review.diff && (
            <PrettyJSON data={review.diff} title="Diff" collapsible />
          )}
          {review.variants && review.variants.length>0 ? (
            <div>
              <h4 style={{ fontSize:13, margin:"0 0 8px" }}>Variants — formatted preview</h4>
              <VariantsGrid variants={review.variants} />
            </div>
          ) : (
            <div style={{ fontSize:12, opacity:0.6 }}>No variants in review bundle yet.</div>
          )}
          <details style={{ background:"#111", padding:10, borderRadius:8 }}>
            <summary style={{ cursor:"pointer", fontSize:12, color:"#8FA0B8" }}>Raw review JSON (collapsed)</summary>
            <pre style={{ fontSize: 11, overflow: "auto", whiteSpace:"pre-wrap", wordBreak:"break-word", marginTop:8 }}>{JSON.stringify(review, null, 2)}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
const btn: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid #333", background: "#1a1a1a", color: "#eee", cursor: "pointer" };
