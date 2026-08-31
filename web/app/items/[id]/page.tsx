"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken, apiUrl, authHeaders } from "../../../lib/auth";

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [genResult, setGenResult] = useState<any>(null);
  const [review, setReview] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

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
  }, [id, router]);

  async function doGenerate() {
    setGenerating(true); setErr(null); setGenResult(null);
    try {
      const r = await fetch(apiUrl(`/api/v1/content-items/${id}/generate`), { method: "POST", headers: { ...authHeaders() } });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || `status ${r.status}`);
      setGenResult(d);
      // refresh item + review
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
      <h1 style={{ fontSize: 20 }}>{item.title || item.slug || id}</h1>
      <pre style={{ background: "#111", padding: 12, borderRadius: 8, overflow: "auto", fontSize: 12 }}>{JSON.stringify(item, null, 2)}</pre>
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
