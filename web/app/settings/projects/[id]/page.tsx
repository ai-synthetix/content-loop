"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken, apiUrl, authHeaders, clearToken } from "../../../../lib/auth";
import { CardSkeleton } from "../../../../components/Skeleton";

type Channel = { id: string; type: string; name: string; project_id?: string | null; status: string };

const cardStyle: React.CSSProperties = { background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 16 };
const inp: React.CSSProperties = { background: "#0b1420", border: "1px solid #1e2f44", borderRadius: 10, padding: "10px 12px", color: "#eee", outline: "none", width: "100%", fontSize: 13 };
const btnPrimary: React.CSSProperties = { background: "#3D8DFF", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, cursor: "pointer" };

function renderMarkdown(md: string): string {
  let html = md
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3 style='margin:10px 0 6px;font-size:14px;color:#cfe0ff'>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2 style='margin:12px 0 8px;font-size:15px;color:#cfe0ff'>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1 style='margin:12px 0 8px;font-size:16px;color:#cfe0ff'>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong style='color:#cfe0ff'>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code style='background:#0b1420;padding:1px 5px;border-radius:4px;font-size:12px'>$1</code>")
    .replace(/^\s*-\s+(.+)$/gm, "<li style='margin-left:18px'>$1</li>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<a href='$2' target='_blank' style='color:#8fb8ff'>$1</a>");
  html = html.replace(/\n{2,}/g, "</p><p style='margin:8px 0'>").replace(/\n/g, "<br/>");
  html = "<p style='margin:8px 0'>" + html + "</p>";
  html = html.replace(/<p[^>]*><\/p>/g, "");
  html = html.replace(/(<li[^>]*>.*<\/li>)/g, "<ul style='margin:8px 0;padding:0'>$1</ul>");
  return html;
}

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
  const [eSaving, setESaving] = useState(false);
  const [eMsg, setEMsg] = useState<string | null>(null);
  const [eErr, setEErr] = useState<string | null>(null);

  // context markdown editor state
  const [ctx, setCtx] = useState("");
  const [ctxTab, setCtxTab] = useState<"edit" | "preview">("edit");
  const [ctxSaving, setCtxSaving] = useState(false);
  const [ctxErr, setCtxErr] = useState<string | null>(null);
  const [ctxMsg, setCtxMsg] = useState<string | null>(null);

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
    setCtx(p.context ?? p.Context ?? "");
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

  useEffect(() => { if (id) { load(); } }, [id]);

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
    setESaving(true);
    try {
      const r = await fetch(apiUrl(`/api/v1/projects/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ name: eName.trim(), slug: eSlug.trim(), languages: langs }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { clearToken(); router.replace("/login"); return; }
      if (!r.ok) throw new Error(d.error || `save failed ${r.status}`);
      setProject((prev: any) => ({ ...prev, ...d, name: eName.trim(), slug: eSlug.trim(), languages: langs }));
      if (d) {
        setProject(d);
        prefillFromProject(d);
      }
      setEMsg("Project saved");
    } catch (ex: any) { setEErr(ex.message); }
    finally { setESaving(false); }
  }

  async function handleSaveContext(e: React.FormEvent) {
    e.preventDefault();
    setCtxErr(null); setCtxMsg(null);
    setCtxSaving(true);
    try {
      const r = await fetch(apiUrl(`/api/v1/projects/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ context: ctx }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { clearToken(); router.replace("/login"); return; }
      if (!r.ok) throw new Error(d.error || `save failed ${r.status}`);
      setProject((prev: any) => ({ ...prev, context: ctx, ...d }));
      setCtxMsg("Context saved");
    } catch (ex: any) { setCtxErr(ex.message); }
    finally { setCtxSaving(false); }
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
        {eErr && <div style={{ background: "rgba(255,60,60,.12)", border: "1px solid rgba(255,60,60,.3)", padding: "8px 10px", borderRadius: 8, color: "#ff8a8a", fontSize: 12 }}>{eErr}</div>}
        {eMsg && <div style={{ background: "rgba(60,255,120,.10)", border: "1px solid rgba(60,255,120,.25)", padding: "8px 10px", borderRadius: 8, color: "#7CFF9E", fontSize: 12 }}>{eMsg}</div>}
        <div>
          <button type="submit" disabled={eSaving} style={{ ...btnPrimary, opacity: eSaving ? 0.6 : 1 }}>{eSaving ? "Saving…" : "Save"}</button>
        </div>
      </form>

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

      {/* Context markdown editor */}
      <div style={cardStyle}>
        <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Project context</h3>
        <p style={{ opacity: 0.6, fontSize: 12, marginTop: 0 }}>Markdown — цели, аудитория, тон, источники. Используется при генерации.</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <button type="button" onClick={() => setCtxTab("edit")} style={{ background: ctxTab === "edit" ? "#1d3a5a" : "#0B1420", border: `1px solid ${ctxTab === "edit" ? "#2a4a7a" : "#1e2f44"}`, color: ctxTab === "edit" ? "#cfe0ff" : "#8FA0B8", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Edit</button>
          <button type="button" onClick={() => setCtxTab("preview")} style={{ background: ctxTab === "preview" ? "#1d3a5a" : "#0B1420", border: `1px solid ${ctxTab === "preview" ? "#2a4a7a" : "#1e2f44"}`, color: ctxTab === "preview" ? "#cfe0ff" : "#8FA0B8", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Preview</button>
        </div>
        <form onSubmit={handleSaveContext} style={{ display: "grid", gap: 10 }}>
          {ctxTab === "edit" ? (
            <textarea
              value={ctx}
              onChange={e => setCtx(e.target.value)}
              rows={14}
              placeholder="Например:
# Цели
Привлечь инвесторов в Паттайю...

# Аудитория
...

# Тон
Эксперт-дружелюбный, без воды"
              style={{ ...inp, fontFamily: "monospace", fontSize: 12, minHeight: 220, resize: "vertical", lineHeight: 1.5 }}
            />
          ) : (
            <div style={{ background: "#0B1420", border: "1px solid #1e2f44", borderRadius: 10, padding: "16px 18px", minHeight: 220, maxHeight: 500, overflow: "auto", fontSize: 13, lineHeight: 1.7, color: "#dbe7ff" }}>
              {ctx.trim() ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(ctx) }} /> : <span style={{ opacity: 0.4 }}>Nothing to preview</span>}
            </div>
          )}
          {ctxErr && <div style={{ background: "rgba(255,60,60,.12)", border: "1px solid rgba(255,60,60,.3)", padding: "8px 10px", borderRadius: 8, color: "#ff8a8a", fontSize: 12 }}>{ctxErr}</div>}
          {ctxMsg && <div style={{ background: "rgba(60,255,120,.10)", border: "1px solid rgba(60,255,120,.25)", padding: "8px 10px", borderRadius: 8, color: "#7CFF9E", fontSize: 12 }}>{ctxMsg}</div>}
          <div>
            <button type="submit" disabled={ctxSaving} style={{ ...btnPrimary, opacity: ctxSaving ? 0.6 : 1 }}>{ctxSaving ? "Saving…" : "Save context"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
