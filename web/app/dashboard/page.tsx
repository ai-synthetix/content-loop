"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getToken, apiUrl, authHeaders, clearToken } from "../../lib/auth";
import { Skeleton } from "../../components/Skeleton";

type Item = { id: string; status?: string; title?: string; slug?: string; updated_at?: string; created_at?: string; brief?: string | Record<string, unknown> | null };
type Pub = { id: string; content_item_id?: string; status?: string; published_at?: string; created_at?: string };
type Snap = { id: string; publication_id?: string; captured_at?: string; created_at?: string; metrics?: any };
type Refl = { id: string; content_item_id?: string; created_at?: string };

export default function Dashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [pubs, setPubs] = useState<Pub[]>([]);
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [refls, setRefls] = useState<Refl[]>([]);

  function on401() { clearToken(); router.replace("/login"); }

  useEffect(() => {
    const t = getToken();
    if (!t) { router.replace("/login"); return; }
    (async () => {
      try {
        const [rItems, rPubs, rSnaps, rRefls] = await Promise.all([
          fetch(apiUrl("/api/v1/content-items/"), { headers: { ...authHeaders() } }),
          fetch(apiUrl("/api/v1/publications/"), { headers: { ...authHeaders() } }),
          fetch(apiUrl("/api/v1/metric-snapshots/"), { headers: { ...authHeaders() } }),
          fetch(apiUrl("/api/v1/reflections/"), { headers: { ...authHeaders() } }),
        ]);
        if (rItems.status === 401 || rPubs.status === 401 || rSnaps.status === 401 || rRefls.status === 401) { on401(); return; }
        const dItems = await rItems.json().catch(() => ({}));
        const dPubs = await rPubs.json().catch(() => ({}));
        const dSnaps = await rSnaps.json().catch(() => ({}));
        const dRefls = await rRefls.json().catch(() => ({}));
        setItems(dItems.items || (Array.isArray(dItems) ? dItems : []));
        setPubs(dPubs.items || dPubs.publications || (Array.isArray(dPubs) ? dPubs : []));
        setSnaps(dSnaps.items || dSnaps.snapshots || dSnaps.metrics || (Array.isArray(dSnaps) ? dSnaps : []));
        setRefls(dRefls.items || dRefls.reflections || (Array.isArray(dRefls) ? dRefls : []));
      } catch (e: any) { setErr(e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div style={{ display: "grid", gap: 12 }}><Skeleton style={{ height: 28, width: 200 }} /><Skeleton style={{ height: 120 }} /><Skeleton style={{ height: 120 }} /></div>;
  if (err) return <div style={{ background: "rgba(255,60,60,.12)", border: "1px solid rgba(255,60,60,.3)", padding: 16, borderRadius: 12, color: "#ff8a8a" }}>Failed to load dashboard: {err} <button onClick={() => location.reload()} style={{ marginLeft: 10, background: "#1a2636", border: "1px solid #2a3a52", color: "#cfe0ff", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>Retry</button></div>;

  const total = items.length;
  const statusMap: Record<string, number> = {};
  items.forEach(it => { const s = (it.status || "unknown").toLowerCase(); statusMap[s] = (statusMap[s] || 0) + 1; });
  const publishedLast7d = pubs.filter(p => {
    const d = p.published_at || p.created_at;
    if (!d) return false;
    const t = new Date(d).getTime();
    if (isNaN(t)) return false;
    return Date.now() - t < 7 * 24 * 3600 * 1000 && (p.status === "published" || !!p.published_at);
  }).length;
  const pubsWithMetrics = new Set(snaps.map(s => s.publication_id).filter(Boolean)).size;
  const metricsCoverage = pubs.length ? Math.round(pubsWithMetrics / pubs.length * 100) : 0;

  // Closed loops: items where brief JSON contains from_reflection_id
  function isClosedLoop(it: Item): boolean {
    const b: unknown = (it as any).brief;
    if (b == null) return false;
    try {
      const raw = typeof b === "string" ? b : JSON.stringify(b);
      if (raw.includes("from_reflection_id")) return true;
      try {
        const obj = typeof b === "string" ? JSON.parse(b) : b;
        if (obj && typeof obj === "object" && "from_reflection_id" in (obj as Record<string, unknown>)) return true;
      } catch { /* ignore parse error, substring already checked */ }
      return false;
    } catch { return false; }
  }
  const closedLoops = items.filter(isClosedLoop);
  const closedLoopsCount = closedLoops.length;
  const closedLoopsLast3 = [...closedLoops]
    .sort((a, b) => {
      const at = new Date(a.updated_at || a.created_at || 0).getTime();
      const bt = new Date(b.updated_at || b.created_at || 0).getTime();
      return bt - at;
    })
    .slice(0, 3);

  const card: React.CSSProperties = { background: "linear-gradient(135deg,#0f1620 0%,#16202e 100%)", border: "1px solid #1e2f44", borderRadius: 14, padding: 16, boxShadow: "0 4px 16px rgba(0,0,0,0.25)" };
  const label: React.CSSProperties = { fontSize: 10, color: "#8FA0B8", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 };
  const value: React.CSSProperties = { fontSize: 28, fontWeight: 800, color: "#dbe7ff", marginTop: 8 };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Dashboard</h1>
        <Link href="/" style={{ color: "#8fb8ff", fontSize: 13 }}>← Queue</Link>
      </div>
      <p style={{ fontSize: 12, opacity: 0.6, margin: "6px 0 0" }}>Overview from content-items, publications, metric-snapshots, reflections.</p>

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
        <div style={{ ...card, borderTop: "2px solid #3D8DFF" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 16 }}>📄</span><div style={label}>Total items</div></div>
          <div style={value}>{total}</div>
          <Link href="/" style={{ fontSize: 11, color: "#7eb8ff" }}>View items →</Link>
        </div>
        <div style={{ ...card, borderTop: "2px solid #22c55e" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 16 }}>📡</span><div style={label}>Published last 7d</div></div>
          <div style={value}>{publishedLast7d}</div>
          <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>{pubs.length} total publications</div>
        </div>
        <div style={{ ...card, borderTop: "2px solid #f59e0b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 16 }}>📊</span><div style={label}>Metrics coverage</div></div>
          <div style={value}>{metricsCoverage}%</div>
          <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>{pubsWithMetrics}/{pubs.length} pubs with snapshots · {snaps.length} snapshots</div>
        </div>
        <div style={{ ...card, borderTop: "2px solid #8b5cf6" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 16 }}>💭</span><div style={label}>Reflections</div></div>
          <div style={value}>{refls.length}</div>
          <div style={{ fontSize: 11, opacity: 0.5, marginTop: 4 }}>Learnings captured</div>
        </div>
        <div style={{ ...card, background: "linear-gradient(135deg,#1e1a33 0%,#2a1f4d 100%)", border: "1px solid #3a2a5a", borderTop: "2px solid #b4a0ff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 16 }}>🔄</span><div style={{ ...label, color: "#b4a0ff" }}>Closed loops</div></div>
          <div style={{ ...value, color: "#e9ddff" }}>{closedLoopsCount}</div>
          <div style={{ fontSize: 11, color: "#9a85d6", marginTop: 4 }}>brief contains from_reflection_id</div>
          {closedLoopsLast3.length > 0 ? (
            <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
              {closedLoopsLast3.map(it => (
                <Link key={it.id} href={`/items/${it.id}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "6px 8px", background: "rgba(22,17,42,0.8)", border: "1px solid #3a2a5a", borderRadius: 8, textDecoration: "none", color: "#d8ccff", fontSize: 12 }}>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title || it.slug || it.id.slice(0, 8)}</span>
                  <span style={{ color: "#8b5cf6", whiteSpace: "nowrap", fontSize: 11 }}>→</span>
                </Link>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 11, opacity: 0.45, marginTop: 10, color: "#9a85d6" }}>No closed loops yet</div>
          )}
        </div>
      </div>

      <div style={{ ...card, marginTop: 16 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 13 }}>Status breakdown</h3>
        {Object.keys(statusMap).length === 0 ? <div style={{ fontSize: 12, opacity: 0.5 }}>No items</div> : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(statusMap).sort((a,b)=>b[1]-a[1]).map(([st, n]) => (
              <span key={st} style={{ background: "#0b111a", border: "1px solid #1e2f44", borderRadius: 20, padding: "6px 12px", fontSize: 12, color: "#cfe0ff" }}>
                {st} <strong style={{ color: "#7eb8ff", marginLeft: 6 }}>{n}</strong>
              </span>
            ))}
          </div>
        )}
        <div style={{ marginTop: 12, display: "grid", gap: 6, maxHeight: 220, overflow: "auto" }}>
          {items.slice(0, 8).map(it => (
            <Link key={it.id} href={`/items/${it.id}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 10px", background: "#0b111a", border: "1px solid #1e2f44", borderRadius: 8, textDecoration: "none", color: "#cfe0ff", fontSize: 12 }}>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title || it.slug || it.id.slice(0, 8)}</span>
              <span style={{ fontSize: 11, opacity: 0.6, whiteSpace: "nowrap" }}>{it.status || "—"}</span>
            </Link>
          ))}
          {items.length > 8 && <div style={{ fontSize: 11, opacity: 0.5, textAlign: "center" }}>+ {items.length - 8} more — <Link href="/" style={{ color: "#7eb8ff" }}>view queue</Link></div>}
        </div>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        <div style={card}>
          <h3 style={{ margin: "0 0 8px", fontSize: 13 }}>Recent publications</h3>
          {pubs.length === 0 ? <div style={{ fontSize: 11, opacity: 0.5 }}>No publications</div> : pubs.slice(0,5).map(p => (
            <div key={p.id} style={{ fontSize: 11, padding: "6px 0", borderBottom: "1px solid #0b111a", display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontFamily: "monospace", opacity: 0.7 }}>{p.id.slice(0,8)}…</span>
              <span style={{ opacity: 0.6 }}>{p.status || "—"} {p.published_at ? new Date(p.published_at).toLocaleDateString() : ""}</span>
              {p.content_item_id && <Link href={`/items/${p.content_item_id}`} style={{ color: "#7eb8ff" }}>item →</Link>}
            </div>
          ))}
        </div>
        <div style={card}>
          <h3 style={{ margin: "0 0 8px", fontSize: 13 }}>Recent reflections</h3>
          {refls.length === 0 ? <div style={{ fontSize: 11, opacity: 0.5 }}>No reflections</div> : refls.slice(0,5).map(r => (
            <div key={r.id} style={{ fontSize: 11, padding: "6px 0", borderBottom: "1px solid #0b111a" }}>
              <div style={{ opacity: 0.8 }}>{r.id.slice(0,8)}… {r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}</div>
              {r.content_item_id && <Link href={`/items/${r.content_item_id}`} style={{ color: "#7eb8ff", fontSize: 11 }}>view item →</Link>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
