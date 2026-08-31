"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getToken, authHeaders, apiUrl } from "../lib/auth";

type Item = { id: string; title?: string; status?: string; slug?: string };

export default function Page() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    fetch(apiUrl("/api/v1/content-items/"), { headers: { ...authHeaders() } })
      .then((r) => {
        if (r.status === 401) { router.replace("/login"); throw new Error("unauthorized"); }
        return r.json();
      })
      .then((d) => setItems(d.items || []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <p>Loading…</p>;
  if (err) return <p style={{ color: "#ff6b6b" }}>Error: {err}</p>;

  return (
    <div>
      <h1 style={{ fontSize: 22 }}>Review Queue</h1>
      <p style={{ opacity: 0.7 }}>GET /api/v1/content-items (owner filtered)</p>
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
