"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = useState<any>(null);
  const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

  useEffect(() => {
    if (!id) return;
    fetch(`${api}/api/v1/content-items/${id}`)
      .then((r) => r.json())
      .then(setItem)
      .catch(() => setItem({ error: "not found" }));
  }, [id, api]);

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
