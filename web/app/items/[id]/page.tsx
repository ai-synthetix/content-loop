"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken, apiUrl, authHeaders } from "../../../lib/auth";

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<any>(null);

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

  if (!item) return <p>Loading…</p>;
  return (
    <div>
      <h1 style={{ fontSize: 20 }}>{item.title || item.slug || id}</h1>
      <pre style={{ background: "#111", padding: 12, borderRadius: 8, overflow: "auto", fontSize: 12 }}>{JSON.stringify(item, null, 2)}</pre>
      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button onClick={() => alert("approve stub")} style={btn}>Approve</button>
        <button onClick={() => alert("changes_requested stub")} style={btn}>Request changes</button>
        <button onClick={() => alert("reject stub")} style={btn}>Reject</button>
      </div>
    </div>
  );
}
const btn: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid #333", background: "#1a1a1a", color: "#eee", cursor: "pointer" };
