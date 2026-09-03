"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getToken, authHeaders, apiUrl, clearToken } from "../../../lib/auth";
import { TableSkeleton, Skeleton } from "../../../components/Skeleton";

type Project = {
  id: string;
  name: string;
  slug: string;
  languages?: any;
  policy?: any;
  channels?: any;
  owner_user_id?: string;
  created_at?: string;
  updated_at?: string;
};

function slugify(s: string) {
  return s
    .toLowerCase().trim()
    .replace(/[^a-z0-9\u00C0-\u024F\u0400-\u04FF]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 80) || "untitled";
}

const inp: React.CSSProperties = { background: "#0B1420", border: "1px solid #1E2F44", borderRadius: 10, padding: "10px 12px", color: "#eee", outline: "none", width: "100%" };
const btnPrimary: React.CSSProperties = { background: "linear-gradient(135deg,#3D8DFF,#6DCBF4)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, cursor: "pointer" };
const btnGhost: React.CSSProperties = { background: "#1a2636", border: "1px solid #2a3a52", color: "#8FA0B8", borderRadius: 10, padding: "10px 16px", cursor: "pointer" };
const cardStyle: React.CSSProperties = { background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 16 };

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [editObj, setEditObj] = useState<Project | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Project | null>(null);

  // create form
  const [cName, setCName] = useState("");
  const [cSlug, setCSlug] = useState("");
  const [cSlugDirty, setCSlugDirty] = useState(false);
  const [cLangs, setCLangs] = useState("ru, en");
  const [cPolicy, setCPolicy] = useState("{}");
  const [cErr, setCErr] = useState<string | null>(null);
  const [cSaving, setCSaving] = useState(false);

  // edit form
  const [eName, setEName] = useState("");
  const [eSlug, setESlug] = useState("");
  const [eLangs, setELangs] = useState("");
  const [ePolicy, setEPolicy] = useState("");
  const [eErr, setEErr] = useState<string | null>(null);
  const [eSaving, setESaving] = useState(false);

  async function load() {
    setErr(null);
    try {
      const token = getToken();
      if (!token) { router.replace("/login"); return; }
      const r = await fetch(apiUrl("/api/v1/projects/"), { headers: { ...authHeaders() } });
      if (r.status === 401) { clearToken(); router.replace("/login"); throw new Error("unauthorized"); }
      const d = await r.json().catch(() => ({ items: [] }));
      if (!r.ok) throw new Error(d.error || `failed ${r.status}`);
      const list: Project[] = d.items || [];
      setProjects(list);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setCName(""); setCSlug(""); setCSlugDirty(false); setCLangs("ru, en"); setCPolicy("{}"); setCErr(null);
    setShowCreate(true);
  }
  function onCName(v: string) { setCName(v); if (!cSlugDirty) setCSlug(slugify(v)); }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCErr(null);
    if (!cName.trim()) { setCErr("Name is required"); return; }
    const slug = cSlug.trim() ? slugify(cSlug) : slugify(cName);
    let langs: any = [];
    try {
      const trimmed = cLangs.trim();
      if (trimmed.startsWith("[")) langs = JSON.parse(trimmed);
      else langs = trimmed.split(",").map(s => s.trim()).filter(Boolean);
      if (langs.length === 0) langs = ["ru"];
    } catch { setCErr("Languages must be JSON array or comma separated (e.g. ru, en)"); return; }
    let policy: any = {};
    try { policy = cPolicy.trim() ? JSON.parse(cPolicy) : {}; } catch { setCErr("Policy must be valid JSON object"); return; }
    setCSaving(true);
    try {
      const r = await fetch(apiUrl("/api/v1/projects/"), {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ name: cName.trim(), slug, languages: langs, channels: [], policy }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `create failed ${r.status}`);
      setShowCreate(false);
      await load();
    } catch (ex: any) { setCErr(ex.message); }
    finally { setCSaving(false); }
  }

  function openEdit(p: Project) {
    setEditObj(p);
    setEName(p.name || "");
    setESlug(p.slug || "");
    let langsStr = "";
    try {
      const l = typeof p.languages === "string" ? JSON.parse(p.languages) : p.languages;
      langsStr = Array.isArray(l) ? l.join(", ") : String(l || "");
    } catch { langsStr = String(p.languages || ""); }
    setELangs(langsStr || "ru");
    let polStr = "{}";
    try {
      const pol = typeof p.policy === "string" ? JSON.parse(p.policy) : p.policy;
      polStr = JSON.stringify(pol || {}, null, 2);
    } catch { polStr = String(p.policy || "{}"); }
    setEPolicy(polStr);
    setEErr(null);
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editObj) return;
    setEErr(null);
    if (!eName.trim()) { setEErr("Name is required"); return; }
    const slug = eSlug.trim() ? slugify(eSlug) : slugify(eName);
    let langs: any = [];
    try {
      const t = eLangs.trim();
      if (t.startsWith("[")) langs = JSON.parse(t);
      else langs = t.split(",").map(s => s.trim()).filter(Boolean);
      if (langs.length === 0) langs = ["ru"];
    } catch { setEErr("Languages must be JSON array or comma separated"); return; }
    let policy: any = {};
    try { policy = ePolicy.trim() ? JSON.parse(ePolicy) : {}; } catch { setEErr("Policy must be valid JSON"); return; }
    setESaving(true);
    try {
      const r = await fetch(apiUrl(`/api/v1/projects/${editObj.id}`), {
        method: "PATCH", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ name: eName.trim(), slug, languages: langs, policy }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `update failed ${r.status}`);
      setEditObj(null);
      await load();
    } catch (ex: any) { setEErr(ex.message); }
    finally { setESaving(false); }
  }

  async function handleDelete() {
    if (!deleteConfirm) return;
    try {
      const r = await fetch(apiUrl(`/api/v1/projects/${deleteConfirm.id}`), { method: "DELETE", headers: { ...authHeaders() } });
      if (!r.ok && r.status !== 204) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || `delete failed ${r.status}`);
      }
      setDeleteConfirm(null);
      await load();
    } catch (ex: any) { setErr(ex.message); }
  }

  if (loading) return <div style={{ display:"grid", gap:10 }}><Skeleton style={{height:28,width:180}}/><TableSkeleton rows={4}/></div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Projects</h1>
          <p style={{ opacity: 0.6, fontSize: 12, margin: "4px 0 0" }}>Own projects — used as <code>project_id</code> for content items and channel binding.</p>
        </div>
        <button onClick={openCreate} style={btnPrimary}>+ New project</button>
      </div>

      {err && <div style={{ marginTop: 12, background: "rgba(255,60,60,.12)", border: "1px solid rgba(255,60,60,.3)", padding: "10px 12px", borderRadius: 10, color: "#ff8a8a", fontSize: 13 }}>{err}</div>}

      {projects.length === 0 ? (
        <div style={{ ...cardStyle, marginTop: 16, textAlign: "center", padding: 32 }}>
          <p style={{ opacity: 0.6, fontSize: 14, margin: 0 }}>No projects yet.</p>
          <p style={{ opacity: 0.45, fontSize: 12, margin: "6px 0 0" }}>Create a project to start creating content items.</p>
          <button onClick={openCreate} style={{ ...btnPrimary, marginTop: 16 }}>Create first project</button>
        </div>
      ) : (
        <div style={{ marginTop: 16, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #1e2f44", background: "#0b111a" }}>
                <th style={{ padding: "10px 12px" }}>Name</th>
                <th style={{ padding: "10px 12px" }}>Slug</th>
                <th style={{ padding: "10px 12px" }}>Languages</th>
                <th style={{ padding: "10px 12px" }}>ID</th>
                <th style={{ padding: "10px 12px" }}></th>
              </tr>
            </thead>
            <tbody>
              {projects.map(p => {
                const langsDisp = (() => {
                  try {
                    const v = typeof p.languages === "string" ? JSON.parse(p.languages) : p.languages;
                    return Array.isArray(v) ? v.join(", ") : String(v || "—");
                  } catch { return String(p.languages || "—"); }
                })();
                return (
                  <tr key={p.id} style={{ borderBottom: "1px solid #1a2636" }}>
                    <td style={{ padding: "10px 12px" }}><Link href={`/settings/projects/${p.id}`} style={{ color: "#8fb8ff", textDecoration: "none", fontWeight: 600 }}>{p.name}</Link></td>
                    <td style={{ padding: "10px 12px", opacity: 0.7 }}><code style={{ background: "#0b111a", padding: "2px 6px", borderRadius: 6, border: "1px solid #1e2f44" }}>{p.slug}</code></td>
                    <td style={{ padding: "10px 12px", opacity: 0.7 }}>{langsDisp}</td>
                    <td style={{ padding: "10px 12px", opacity: 0.4, fontSize: 11 }}>{p.id.slice(0, 8)}…</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={() => openEdit(p)} style={{ ...btnGhost, padding: "6px 10px", fontSize: 12, marginRight: 6 }}>Edit</button>
                      <button onClick={() => setDeleteConfirm(p)} style={{ ...btnGhost, padding: "6px 10px", fontSize: 12, borderColor: "#5a2a2a", color: "#ff8a8a" }}>Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowCreate(false); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", zIndex: 50, padding: 20 }}>
          <div style={{ width: "100%", maxWidth: 560, background: "#111824", border: "1px solid #1E2F44", borderRadius: 18, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>New project</h2>
              <button onClick={() => setShowCreate(false)} style={{ background: "#1a2636", border: "1px solid #2a3a52", color: "#8FA0B8", borderRadius: 8, width: 32, height: 32, cursor: "pointer" }}>✕</button>
            </div>
            <form onSubmit={handleCreate} style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: "#8FA0B8" }}>Name *</span><input value={cName} onChange={e => onCName(e.target.value)} placeholder="My Project" required style={inp} /></label>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: "#8FA0B8" }}>Slug *</span><input value={cSlug} onChange={e => { setCSlug(e.target.value); setCSlugDirty(true); }} placeholder="auto from name" style={inp} /><span style={{ fontSize: 11, opacity: 0.45 }}>lowercase alphanumeric + hyphens (2-80 chars)</span></label>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: "#8FA0B8" }}>Languages</span><input value={cLangs} onChange={e => setCLangs(e.target.value)} placeholder="ru, en or JSON array" style={inp} /><span style={{ fontSize: 11, opacity: 0.45 }}>comma separated or JSON array like ["ru","en"]</span></label>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: "#8FA0B8" }}>Policy (JSON)</span><textarea value={cPolicy} onChange={e => setCPolicy(e.target.value)} rows={4} style={{ ...inp, fontFamily: "monospace", fontSize: 12 }} /></label>
              {cErr && <div style={{ background: "rgba(255,90,90,.1)", border: "1px solid rgba(255,90,90,.25)", color: "#FF8A8A", padding: "10px 12px", borderRadius: 10, fontSize: 12 }}>{cErr}</div>}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
                <button type="button" onClick={() => setShowCreate(false)} style={btnGhost}>Cancel</button>
                <button type="submit" disabled={cSaving} style={{ ...btnPrimary, opacity: cSaving ? 0.6 : 1 }}>{cSaving ? "Creating…" : "Create"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editObj && (
        <div onClick={e => { if (e.target === e.currentTarget) setEditObj(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", zIndex: 50, padding: 20 }}>
          <div style={{ width: "100%", maxWidth: 560, background: "#111824", border: "1px solid #1E2F44", borderRadius: 18, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Edit project</h2>
              <button onClick={() => setEditObj(null)} style={{ background: "#1a2636", border: "1px solid #2a3a52", color: "#8FA0B8", borderRadius: 8, width: 32, height: 32, cursor: "pointer" }}>✕</button>
            </div>
            <form onSubmit={handleEdit} style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: "#8FA0B8" }}>Name *</span><input value={eName} onChange={e => setEName(e.target.value)} required style={inp} /></label>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: "#8FA0B8" }}>Slug *</span><input value={eSlug} onChange={e => setESlug(e.target.value)} style={inp} /></label>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: "#8FA0B8" }}>Languages</span><input value={eLangs} onChange={e => setELangs(e.target.value)} style={inp} /></label>
              <label style={{ display: "grid", gap: 6 }}><span style={{ fontSize: 12, color: "#8FA0B8" }}>Policy (JSON)</span><textarea value={ePolicy} onChange={e => setEPolicy(e.target.value)} rows={4} style={{ ...inp, fontFamily: "monospace", fontSize: 12 }} /></label>
              {eErr && <div style={{ background: "rgba(255,90,90,.1)", border: "1px solid rgba(255,90,90,.25)", color: "#FF8A8A", padding: "10px 12px", borderRadius: 10, fontSize: 12 }}>{eErr}</div>}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
                <button type="button" onClick={() => setEditObj(null)} style={btnGhost}>Cancel</button>
                <button type="submit" disabled={eSaving} style={{ ...btnPrimary, opacity: eSaving ? 0.6 : 1 }}>{eSaving ? "Saving…" : "Save"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", zIndex: 50, padding: 20 }}>
          <div style={{ width: "100%", maxWidth: 440, background: "#111824", border: "1px solid #1E2F44", borderRadius: 18, padding: 24 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Delete project?</h2>
            <p style={{ opacity: 0.7, fontSize: 13, margin: "8px 0 0" }}>Will delete <strong>{deleteConfirm.name}</strong> (<code>{deleteConfirm.slug}</code>). Content items referencing this project will block deletion (FK RESTRICT). Make sure no items remain.</p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setDeleteConfirm(null)} style={btnGhost}>Cancel</button>
              <button onClick={handleDelete} style={{ background: "#b4232a", color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontWeight: 700, cursor: "pointer" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
