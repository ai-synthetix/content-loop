"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getToken, authHeaders, apiUrl } from "../lib/auth";
import { StatusBadge } from "../components/StatusBadge";
import { PipelineStepper } from "../components/PipelineStepper";

type Item = { id: string; title?: string; status?: string; slug?: string };
type Project = { id: string; name?: string; slug?: string };

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u00C0-\u024F\u0400-\u04FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";
}

export default function Page() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // modal state
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);
  const [brief, setBrief] = useState("");
  const [projectId, setProjectId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    const r = await fetch(apiUrl("/api/v1/projects/"), { headers: { ...authHeaders() } });
    if (r.status === 401) { router.replace("/login"); throw new Error("unauthorized"); }
    const d = await r.json().catch(() => ({ items: [] }));
    const list: Project[] = d.items || d || [];
    setProjects(Array.isArray(list) ? list : []);
    if (list.length > 0 && !projectId) {
      const first = (list as Project[])[0];
      if (first?.id) setProjectId(first.id);
    }
    return list;
  }, [router, projectId]);

  const fetchItems = useCallback(async () => {
    const r = await fetch(apiUrl("/api/v1/content-items/"), { headers: { ...authHeaders() } });
    if (r.status === 401) { router.replace("/login"); throw new Error("unauthorized"); }
    const d = await r.json();
    setItems(d.items || []);
  }, [router]);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    Promise.all([fetchItems(), fetchProjects()])
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [router, fetchItems, fetchProjects]);

  function onTitleChange(v: string) {
    setTitle(v);
    if (!slugDirty) setSlug(slugify(v));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    if (!title.trim()) { setFormErr("Title is required"); return; }
    if (!projectId) { setFormErr("Project is required — select one or create at /projects"); return; }
    const finalSlug = slug.trim() ? slugify(slug) : slugify(title);
    setSubmitting(true);
    try {
      const res = await fetch(apiUrl("/api/v1/content-items/"), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          title: title.trim(),
          slug: finalSlug,
          brief: { raw: brief.trim() },
          project_id: projectId,
          status: "idea",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `create failed ${res.status}`);
      const id = data.id as string;
      if (id) {
        // auto build brief / generate (best-effort, don't block on failure)
        try {
          const r2 = await fetch(apiUrl(`/api/v1/content-items/${id}/brief`), {
            method: "POST", headers: { ...authHeaders() },
          });
          if (!r2.ok) {
            // fallback to generate full pipeline
            await fetch(apiUrl(`/api/v1/content-items/${id}/generate`), {
              method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
              body: JSON.stringify({}),
            }).catch(() => {});
          }
        } catch {}
        try {
          // also kick generate in background (if brief endpoint already did scaffold, generate will draft)
          await fetch(apiUrl(`/api/v1/content-items/${id}/generate`), {
            method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({}),
          }).catch(() => {});
        } catch {}
      }
      await fetchItems();
      setShowModal(false);
      setTitle(""); setSlug(""); setSlugDirty(false); setBrief("");
    } catch (e: any) {
      setFormErr(e.message);
    } finally { setSubmitting(false); }
  }

  if (loading) return <p>Loading…</p>;
  if (err) return <p style={{ color: "#ff6b6b" }}>Error: {err}</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0 }}>Review Queue</h1>
          <p style={{ opacity: 0.7, fontSize: 12, margin: "4px 0 0" }}>GET /api/v1/content-items (owner filtered) — projects linked to channels via Settings → Channels.</p>
        </div>
        <button
          onClick={() => { setFormErr(null); setShowModal(true); if (projects.length===0) fetchProjects().catch(()=>{}); }}
          style={{ background: "linear-gradient(135deg,#3D8DFF,#6DCBF4)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 4px 16px rgba(61,141,255,.35)" }}
        >
          + New item
        </button>
      </div>

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
        <div style={{ marginTop: 16, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 18, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "#cfe0ff", marginBottom: 6 }}>No items yet</div>
          <p style={{ opacity: 0.6, fontSize: 12, margin: "0 0 12px" }}>Create your first item (+ New item) or learn the flow in the guide.</p>
          <Link href="/guide" style={{ background: "linear-gradient(135deg,#3D8DFF,#6DCBF4)", color: "#fff", borderRadius: 10, padding: "8px 14px", textDecoration: "none", fontWeight: 700, fontSize: 13, display: "inline-block" }}>Open Guide →</Link>
        </div>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          {items.map((it) => (
            <Link key={it.id} href={`/items/${it.id}`} style={{ textDecoration: "none", background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 14, display: "block" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: "#cfe0ff", fontWeight: 600, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title || it.slug || it.id}</div>
                  <div style={{ fontSize: 11, color: "#5a6b86", marginTop: 2 }}>{it.id}</div>
                </div>
                <StatusBadge status={it.status || ""} size={11} />
              </div>
              <div style={{ marginTop: 10 }}>
                <PipelineStepper status={it.status || "idea"} compact />
              </div>
            </Link>
          ))}
        </div>
      )}

      {showModal && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.55)", backdropFilter: "blur(6px)", display: "grid", placeItems: "center", zIndex: 50, padding: 20 }}
        >
          <div style={{ width: "100%", maxWidth: 520, background: "#111824", border: "1px solid #1E2F44", borderRadius: 18, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,.55)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>New content item</h2>
              <button onClick={() => setShowModal(false)} style={{ background: "#1a2636", border: "1px solid #2a3a52", color: "#8FA0B8", borderRadius: 8, width: 32, height: 32, cursor: "pointer" }}>✕</button>
            </div>
            <p style={{ margin: "0 0 14px", color: "#8FA0B8", fontSize: 12 }}>Создаст запись со статусом <code style={{ background: "#0B1420", border: "1px solid #1E2F44", padding: "1px 6px", borderRadius: 6 }}>idea</code> и автоматически сгенерирует brief.</p>

            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#8FA0B8" }}>Title *</span>
                <input value={title} onChange={e => onTitleChange(e.target.value)} placeholder="Например: Как выбрать район в Паттайе" required
                  style={{ background: "#0B1420", border: "1px solid #1E2F44", borderRadius: 10, padding: "10px 12px", color: "#eee", outline: "none" }} />
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#8FA0B8" }}>Slug</span>
                <input value={slug} onChange={e => { setSlug(e.target.value); setSlugDirty(true); }} placeholder="auto from title"
                  style={{ background: "#0B1420", border: "1px solid #1E2F44", borderRadius: 10, padding: "10px 12px", color: "#eee", outline: "none" }} />
                <span style={{ fontSize: 11, opacity: 0.45 }}>auto-generated, editable</span>
              </label>
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#8FA0B8" }}>Brief</span>
                <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={4} placeholder="Кратко о чем материал, тезисы, аудитория…"
                  style={{ background: "#0B1420", border: "1px solid #1E2F44", borderRadius: 10, padding: "10px 12px", color: "#eee", outline: "none", resize: "vertical" }} />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12, color: "#8FA0B8" }}>Project *</span>
                {projects.length === 0 ? (
                  <div style={{ background: "#0B1420", border: "1px solid #3a2d00", borderRadius: 10, padding: 12 }}>
                    <div style={{ fontSize: 12, color: "#ffb84d", marginBottom: 8 }}>No projects yet — create one first.</div>
                    <Link href="/projects" style={{ background: "#1a2636", border: "1px solid #2a3a52", color: "#8fb8ff", borderRadius: 8, padding: "8px 12px", textDecoration: "none", fontSize: 13, display: "inline-block" }}>Go to Projects →</Link>
                  </div>
                ) : (
                  <select value={projectId} onChange={e => setProjectId(e.target.value)} required
                    style={{ background: "#0B1420", border: "1px solid #1E2F44", borderRadius: 10, padding: "10px 12px", color: "#eee", outline: "none" }}>
                    <option value="" disabled>— select project —</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name || p.slug || p.id.slice(0, 8)}</option>
                    ))}
                  </select>
                )}
                {projects.length > 0 && <Link href="/projects" style={{ fontSize: 11, color: "#8fb8ff", textDecoration: "none" }}>Manage projects →</Link>}
              </label>

              {formErr && <div style={{ background: "rgba(255,90,90,.1)", border: "1px solid rgba(255,90,90,.25)", color: "#FF8A8A", padding: "10px 12px", borderRadius: 10, fontSize: 12 }}>{formErr}</div>}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ background: "#1a2636", border: "1px solid #2a3a52", color: "#8FA0B8", borderRadius: 10, padding: "10px 16px", cursor: "pointer" }}>Cancel</button>
                <button type="submit" disabled={submitting} style={{ background: submitting ? "#2a4a7a" : "linear-gradient(135deg,#3D8DFF,#6DCBF4)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, cursor: submitting ? "wait" : "pointer", opacity: submitting ? 0.7 : 1 }}>
                  {submitting ? "Creating…" : "Create & generate brief"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
