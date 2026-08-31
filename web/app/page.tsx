"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Item = { id: string; title?: string; status?: string; slug?: string };

export default function Page() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const api = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

  useEffect(() => {
    fetch(`${api}/api/v1/content-items/`)
      .then((r) => r.json())
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [api]);

  if (loading) return <p>Loading…</p>;

  return (
    <div>
      <h1 style={{ fontSize: 22 }}>Review Queue</h1>
      <p style={{ opacity: 0.7 }}>Stub list — GET /api/v1/content-items</p>
      {items.length === 0 ? (
        <p style={{ opacity: 0.6 }}>No items yet. Create one via API: POST /api/v1/content-items</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #333" }}>
              <th>Title</th>
              <th>Status</th>
              <th>ID</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} style={{ borderBottom: "1px solid #222" }}>
                <td><Link href={`/items/${it.id}`} style={{ color: "#7eb8ff" }}>{it.title || it.slug || it.id}</Link></td>
                <td><span style={{ background: "#222", padding: "2px 8px", borderRadius: 10, fontSize: 12 }}>{it.status || "—"}</span></td>
                <td style={{ fontSize: 12, opacity: 0.6 }}>{it.id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
