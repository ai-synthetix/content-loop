"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken, apiUrl, authHeaders, clearToken } from "../../../lib/auth";
import { Skeleton, CardSkeleton } from "../../../components/Skeleton";

type Channel = { id: string; type: string; name: string; project_id?: string | null; status: string };

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<any>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }

    const [prRes, chRes] = await Promise.all([
      fetch(apiUrl(`/api/v1/projects/${id}`), { headers: { ...authHeaders() } }),
      fetch(apiUrl("/api/v1/channels/"), { headers: { ...authHeaders() } }),
    ]);
    if (prRes.status === 401 || chRes.status === 401) { clearToken(); router.replace("/login"); return; }
    const pr = await prRes.json();
    const ch = await chRes.json();
    setProject(pr);
    const items: Channel[] = ch.items || [];
    setChannels(items);
    const s = new Set<string>();
    items.forEach(c => { if (c.project_id === id) s.add(c.id); });
    setAssigned(s);
  }

  useEffect(() => { if (id) load(); }, [id]);

  async function toggle(channelId: string, checked: boolean) {
    setMsg(null);
    try {
      const body: any = {};
      if (checked) body.project_id = id;
      else body.project_id = null;
      const r = await fetch(apiUrl(`/api/v1/channels/${channelId}`), { method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(body) });
      const d = await r.json();
      if (r.status === 401) { clearToken(); router.replace("/login"); return; }
      if (!r.ok) throw new Error(d.error || String(r.status));
      const ns = new Set(assigned);
      if (checked) ns.add(channelId); else ns.delete(channelId);
      setAssigned(ns);
      setMsg(checked ? "Channel linked to project" : "Channel unlinked");
      setChannels(prev => prev.map(c => c.id === channelId ? { ...c, project_id: checked ? String(id) : null } : c));
    } catch (e: any) { setMsg(e.message); }
  }

  if (!project) return <div style={{display:"grid",gap:12}}><CardSkeleton /></div>;

  return (
    <div>
      <h1 style={{ fontSize: 22 }}>{project.name || project.slug || id}</h1>
      <pre style={{ background: "#111", padding: 12, borderRadius: 8, overflow: "auto", fontSize: 12 }}>{JSON.stringify(project, null, 2)}</pre>

      <div style={{ marginTop: 20, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 16 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Channels for this project</h3>
        <p style={{ opacity: 0.6, fontSize: 12, marginTop: 0 }}>Select which of your channels belong to this project. Channel <code>project_id</code> will be updated.</p>
        {msg && <div style={{ fontSize: 12, color: "#8fb8ff", marginBottom: 8 }}>{msg}</div>}
        {channels.length === 0 ? <p style={{ opacity: 0.6, fontSize: 12 }}>No channels yet — <a href="/settings/channels" style={{ color: "#7eb8ff" }}>create one</a>.</p> :
          <div style={{ display: "grid", gap: 8 }}>
            {channels.map(c => (
              <label key={c.id} style={{ display: "flex", gap: 10, alignItems: "center", background: assigned.has(c.id) ? "rgba(61,141,255,.12)" : "#0b111a", border: `1px solid ${assigned.has(c.id) ? "#2a4a7a" : "#1e2f44"}`, borderRadius: 8, padding: "10px 12px", cursor: "pointer" }}>
                <input type="checkbox" checked={assigned.has(c.id)} onChange={e => toggle(c.id, e.target.checked)} />
                <span style={{ fontWeight: 600 }}>{c.name}</span>
                <span style={{ background: "#1d3a5a", color: "#8fb8ff", padding: "1px 7px", borderRadius: 20, fontSize: 11 }}>{c.type}</span>
                <span style={{ opacity: 0.5, fontSize: 11 }}>{c.id.slice(0, 8)}…</span>
                {c.project_id && c.project_id !== id && <span style={{ color: "#ffcc66", fontSize: 11 }}>bound to other project {c.project_id.slice(0, 6)}…</span>}
              </label>
            ))}
          </div>
        }
      </div>
    </div>
  );
}
