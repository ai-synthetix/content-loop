"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken, apiUrl, authHeaders, clearToken } from "../../../lib/auth";
import { CardSkeleton } from "../../../components/Skeleton";

type Channel = { id: string; type: string; name: string; project_id?: string | null; status: string };
type Source = { id: string; url: string; title?: string | null; created_at?: string };

const cardStyle: React.CSSProperties = { background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 16 };
const inp: React.CSSProperties = { background: "#0b1420", border: "1px solid #1e2f44", borderRadius: 10, padding: "10px 12px", color: "#eee", outline: "none", width: "100%", fontSize: 13 };
const btnPrimary: React.CSSProperties = { background: "#3D8DFF", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, cursor: "pointer" };
const btnGhost: React.CSSProperties = { background: "#1a2636", border: "1px solid #2a3a52", color: "#8FA0B8", borderRadius: 10, padding: "8px 14px", cursor: "pointer", fontSize: 12 };

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<any>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  // edit form state
  const [eName, setEName] = useState("");
  const [eSlug, setESlug] = useState("");
  const [eLangs, setELangs] = useState("");
  const [ePolicy, setEPolicy] = useState("");
  const [eSaving, setESaving] = useState(false);
  const [eMsg, setEMsg] = useState<string | null>(null);
  const [eErr, setEErr] = useState<string | null>(null);

  // sources state
  const [sources, setSources] = useState<Source[]>([]);
  const [sUrl, setSUrl] = useState("");
  const [sTitle, setSTitle] = useState("");
  const [sSaving, setSSaving] = useState(false);
  const [sErr, setSErr] = useState<string | null>(null);
  const [sMsg, setSMsg] = useState<string | null>(null);
  const [sLoading, setSLoading] = useState(true);

  function prefillFromProject(p: any) {
    setEName(p.name || "");
    setESlug(p.slug || "");
    try {
      const l = typeof p.languages === "string" ? JSON.parse(p.languages) : p.languages;
      if (Array.isArray(l)) setELangs(l.join(", "));
      else if (typeof l === "string") setELangs(l);
      else if (l) setELangs(String(l));
      else setELangs("");
    } catch {
      setELangs(String(p.languages || ""));
    }
    try {
      const pol = typeof p.policy === "string" ? JSON.parse(p.policy) : p.policy;
      setEPolicy(JSON.stringify(pol ?? {}, null, 2));
    } catch {
      setEPolicy(String(p.policy ?? "{}"));
    }
  }

  async function loadSources() {
    const token = getToken();
    if (!token) return;
    setSLoading(true);
    try {
      const r = await fetch(apiUrl(`/api/v1/projects/${id}/sources`), { headers: { ...authHeaders() } });
      if (r.status === 401) { clearToken(); router.replace("/login"); return; }
      const d = await r.json().catch(() => ({ items: [] }));
      if (!r.ok) throw new Error(d.error || `failed ${r.status}`);
      setSources(d.items || d.sources || []);
    } catch (e: any) {
      setSErr(e.message);
    } finally {
      setSLoading(false);
    }
  }

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
    prefillFromProject(pr);
    const items: Channel[] = ch.items || [];
    setChannels(items);
    const s = new Set<string>();
    items.forEach(c => { if (c.project_id === id) s.add(c.id); });
    setAssigned(s);
  }

  useEffect(() => { if (id) { load(); loadSources(); } }, [id]);

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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setEErr(null); setEMsg(null);
    if (!eName.trim()) { setEErr("Name is required"); return; }
    let langs: any = [];
    try {
      const t = eLangs.trim();
      if (!t) langs = [];
      else if (t.startsWith("[")) langs = JSON.parse(t);
      else langs = t.split(",").map(s => s.trim()).filter(Boolean);
    } catch { setEErr("Languages must be comma separated or JSON array"); return; }
    let policy: any = {};
    try {
      policy = ePolicy.trim() ? JSON.parse(ePolicy) : {};
    } catch { setEErr("Policy must be valid JSON"); return; }
    setESaving(true);
    try {
      const r = await fetch(apiUrl(`/api/v1/projects/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ name: eName.trim(), slug: eSlug.trim(), languages: langs, policy }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { clearToken(); router.replace("/login"); return; }
      if (!r.ok) throw new Error(d.error || `save failed ${r.status}`);
      setProject((prev: any) => ({ ...prev, ...d, name: eName.trim(), slug: eSlug.trim(), languages: langs, policy }));
      if (d) {
        setProject(d);
        prefillFromProject(d);
      }
      setEMsg("Project saved");
    } catch (ex: any) { setEErr(ex.message); }
    finally { setESaving(false); }
  }

  async function handleAddSource(e: React.FormEvent) {
    e.preventDefault();
    setSErr(null); setSMsg(null);
    if (!sUrl.trim()) { setSErr("URL is required"); return; }
    setSSaving(true);
    try {
      const body: any = { url: sUrl.trim() };
      if (sTitle.trim()) body.title = sTitle.trim();
      const r = await fetch(apiUrl(`/api/v1/projects/${id}/sources`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { clearToken(); router.replace("/login"); return; }
      if (!r.ok) throw new Error(d.error || `add failed ${r.status}`);
      setSUrl(""); setSTitle("");
      setSMsg("Source added");
      await loadSources();
    } catch (ex: any) { setSErr(ex.message); }
    finally { setSSaving(false); }
  }

  async function handleDeleteSource(sourceId: string) {
    setSErr(null); setSMsg(null);
    try {
      const r = await fetch(apiUrl(`/api/v1/projects/${id}/sources/${sourceId}`), {
        method: "DELETE",
        headers: { ...authHeaders() },
      });
      if (r.status === 401) { clearToken(); router.replace("/login"); return; }
      if (!r.ok && r.status !== 204) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `delete failed ${r.status}`);
      }
      setSources(prev => prev.filter(s => s.id !== sourceId));
      setSMsg("Source deleted");
    } catch (ex: any) { setSErr(ex.message); }
  }

  if (!project) return <div style={{display:"grid",gap:12}}><CardSkeleton /></div>;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1 style={{ fontSize: 22, margin: 0 }}>{project.name || project.slug || id}</h1>

      {/* Edit form */}
      <form onSubmit={handleSave} style={{ ...cardStyle, display: "grid", gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Edit project</h3>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#8FA0B8" }}>Name</span>
          <input value={eName} onChange={e => setEName(e.target.value)} placeholder="Project name" style={inp} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#8FA0B8" }}>Slug</span>
          <input value={eSlug} onChange={e => setESlug(e.target.value)} placeholder="project-slug" style={inp} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#8FA0B8" }}>Languages (comma separated)</span>
          <input value={eLangs} onChange={e => setELangs(e.target.value)} placeholder="ru, en" style={inp} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, color: "#8FA0B8" }}>Policy (JSON)</span>
          <textarea value={ePolicy} onChange={e => setEPolicy(e.target.value)} rows={6} style={{ ...inp, fontFamily: "monospace", fontSize: 12 }} placeholder='{"tone":"neutral"}' />
        </label>
        {eErr && <div style={{ background: "rgba(255,60,60,.12)", border: "1px solid rgba(255,60,60,.3)", padding: "8px 10px", borderRadius: 8, color: "#ff8a8a", fontSize: 12 }}>{eErr}</div>}
        {eMsg && <div style={{ background: "rgba(60,255,120,.10)", border: "1px solid rgba(60,255,120,.25)", padding: "8px 10px", borderRadius: 8, color: "#7CFF9E", fontSize: 12 }}>{eMsg}</div>}
        <div>
          <button type="submit" disabled={eSaving} style={{ ...btnPrimary, opacity: eSaving ? 0.6 : 1 }}>{eSaving ? "Saving…" : "Save"}</button>
        </div>
      </form>

      <pre style={{ background: "#0f1620", padding: 12, borderRadius: 8, overflow: "auto", fontSize: 11, border: "1px solid #1e2f44", margin: 0 }}>{JSON.stringify(project, null, 2)}</pre>

      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Channels for this project</h3>
        <p style={{ opacity: 0.6, fontSize: 12, marginTop: 0 }}>Select which of your channels belong to this project. Channel <code>project_id</code> will be updated.</p>
        {msg && <div style={{ fontSize: 12, color: "#8fb8ff", marginBottom: 8 }}>{msg}</div>}
        {channels.length === 0 ? <p style={{ opacity: 0.6, fontSize: 12 }}>No channels yet — <a href="/settings/channels" style={{ color: "#7eb8ff" }}>create one</a>.</p> :
          <div style={{ display: "grid", gap: 8 }}>
            {channels.map(c => (
              <label key={c.id} style={{ display: "flex", gap: 10, alignItems: "center", background: assigned.has(c.id) ? "rgba(61,141,255,.12)" : "#0b1420", border: `1px solid ${assigned.has(c.id) ? "#2a4a7a" : "#1e2f44"}`, borderRadius: 8, padding: "10px 12px", cursor: "pointer" }}>
                <input type="checkbox" checked={assigned.has(c.id)} onChange={e => toggle(c.id, e.target.checked)} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                <span style={{ background: "#1d3a5a", color: "#8fb8ff", padding: "1px 7px", borderRadius: 20, fontSize: 11 }}>{c.type}</span>
                <span style={{ opacity: 0.5, fontSize: 11 }}>{c.id.slice(0, 8)}…</span>
                {c.project_id && c.project_id !== id && <span style={{ color: "#ffcc66", fontSize: 11 }}>bound to other project {c.project_id.slice(0, 6)}…</span>}
              </label>
            ))}
          </div>
        }
      </div>

      {/* Sources block */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Sources</h3>
        <p style={{ opacity: 0.6, fontSize: 12, marginTop: 0 }}>External URLs used as context for this project.</p>
        {sErr && <div style={{ background: "rgba(255,60,60,.12)", border: "1px solid rgba(255,60,60,.3)", padding: "8px 10px", borderRadius: 8, color: "#ff8a8a", fontSize: 12, marginBottom: 8 }}>{sErr}</div>}
        {sMsg && <div style={{ background: "rgba(60,255,120,.10)", border: "1px solid rgba(60,255,120,.25)", padding: "8px 10px", borderRadius: 8, color: "#7CFF9E", fontSize: 12, marginBottom: 8 }}>{sMsg}</div>}
        {sLoading ? <div style={{ opacity: 0.6, fontSize: 12 }}>Loading sources…</div> : sources.length === 0 ? <p style={{ opacity: 0.6, fontSize: 12, margin: "8px 0" }}>No sources yet.</p> : (
          <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
            {sources.map(s => (
              <div key={s.id} style={{ display: "flex", gap: 10, alignItems: "center", background: "#0b1420", border: "1px solid #1e2f44", borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, wordBreak: "break-all", color: "#8fb8ff" }}><a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "#8fb8ff", textDecoration: "none" }}>{s.url}</a></div>
                  {s.title && <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{s.title}</div>}
                </div>
                <button onClick={() => handleDeleteSource(s.id)} style={{ ...btnGhost, borderColor: "#5a2a2a", color: "#ff8a8a", whiteSpace: "nowrap" }}>Delete</button>
              </div>
            ))}
          </div>
        )}
        <form onSubmit={handleAddSource} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ flex: "2 1 220px", display: "grid", gap: 4 }}>
            <span style={{ fontSize: 11, color: "#8FA0B8" }}>URL *</span>
            <input value={sUrl} onChange={e => setSUrl(e.target.value)} placeholder="https://example.com/page" style={inp} />
          </label>
          <label style={{ flex: "1 1 160px", display: "grid", gap: 4 }}>
            <span style={{ fontSize: 11, color: "#8FA0B8" }}>Title (optional)</span>
            <input value={sTitle} onChange={e => setSTitle(e.target.value)} placeholder="My source" style={inp} />
          </label>
          <button type="submit" disabled={sSaving} style={{ ...btnPrimary, opacity: sSaving ? 0.6 : 1, height: 38 }}>{sSaving ? "Adding…" : "Add"}</button>
        </form>
      </div>
    </div>
  );
}
