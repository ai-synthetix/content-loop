"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getToken, authHeaders, apiUrl } from "../lib/auth";

type Item = { id: string; title?: string; status?: string; slug?: string };
type Project = { id: string; name?: string; slug?: string };

export default function Page() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    Promise.all([
      fetch(apiUrl("/api/v1/content-items/"), { headers: { ...authHeaders() } }).then(r => {
        if (r.status === 401) { router.replace("/login"); throw new Error("unauthorized"); }
        return r.json();
      }),
      fetch(apiUrl("/api/v1/projects/"), { headers: { ...authHeaders() } }).then(r => r.json()).catch(() => ({ items: [] })),
    ])
      .then(([dItems, dProjects]) => {
        setItems(dItems.items || []);
        setProjects(dProjects.items || []);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) return <p>Loading…</p>;
  if (err) return <p style={{ color: "#ff6b6b" }}>Error: {err}</p>;

  return (
    <div>
      <h1 style={{ fontSize: 22 }}>Review Queue</h1>
      <p style={{ opacity: 0.7, fontSize: 12 }}>GET /api/v1/content-items (owner filtered) — projects linked to channels via Settings → Channels.</p>

      {projects.length > 0 && (
        <div style={{ marginTop: 16, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 10, padding: 12 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 13 }}>Your projects</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {projects.map(p => (
              <Link key={p.id} href={`/projects/${p.id}`} style={{ background: "#16202e", border: "1px solid #2a3a52", borderRadius: 20, padding: "6px 12px", color: "#8fb8ff", textDecoration: "none", fontSize: 13 }}>
                {p.name || p.slug || p.id.slice(0, 8)}…
              </Link>
            ))}
          </div>
          <p style={{ fontSize: 11, opacity: 0.5, margin: "8px 0 0" }}>Open a project to assign channels (Telegram / FamilyOS).</p>
        </div>
      )}

      {items.length === 0 ? (
        <p style={{ opacity: 0.6, marginTop: 16 }}>No items yet. Create one via API: POST /api/v1/content-items</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
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
