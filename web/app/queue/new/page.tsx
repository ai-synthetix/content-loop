"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getToken, authHeaders, apiUrl, clearToken } from "../../../lib/auth";
import { useActiveProject } from "../../../lib/activeProject";

type Project = { id: string; name?: string; slug?: string };

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u00C0-\u024F\u0400-\u04FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "untitled";
}

export default function NewQueueItemPage() {
  const router = useRouter();
  const { activeId } = useActiveProject();
  const [projects, setProjects] = useState<Project[]>([]);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);
  const [brief, setBrief] = useState("");
  const [projectId, setProjectId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const fetchProjects = useCallback(async () => {
    setLoadingProjects(true);
    try {
      const r = await fetch(apiUrl("/api/v1/projects/"), { headers: { ...authHeaders() } });
      if (r.status === 401) { clearToken(); router.replace("/login"); return; }
      const d = await r.json().catch(() => ({ items: [] }));
      const list: Project[] = d.items || d || [];
      setProjects(Array.isArray(list) ? list : []);
    } finally {
      setLoadingProjects(false);
    }
  }, [router]);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    fetchProjects();
  }, [fetchProjects, router]);

  useEffect(() => {
    if (activeId && !projectId) setProjectId(activeId);
  }, [activeId, projectId]);

  function onTitleChange(v: string) {
    setTitle(v);
    if (!slugDirty) setSlug(slugify(v));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    if (!title.trim()) { setFormErr("Title is required"); return; }
    const pid = projectId || activeId || "";
    if (!pid) { setFormErr("Project is required — select one or create at /projects"); return; }
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
          project_id: pid,
          status: "idea",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `create failed ${res.status}`);
      const id = data.id as string;
      if (id) {
        try {
          const r2 = await fetch(apiUrl(`/api/v1/content-items/${id}/brief`), {
            method: "POST", headers: { ...authHeaders() },
          });
          if (!r2.ok) {
            await fetch(apiUrl(`/api/v1/content-items/${id}/generate`), {
              method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
              body: JSON.stringify({}),
            }).catch(() => {});
          }
        } catch {}
        try {
          await fetch(apiUrl(`/api/v1/content-items/${id}/generate`), {
            method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({}),
          }).catch(() => {});
        } catch {}
        router.push(`/items/${id}`);
        return;
      }
      router.push("/queue");
    } catch (e: any) {
      setFormErr(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      {/* breadcrumbs */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#8FA0B8", marginBottom: 16 }}>
        <Link href="/queue" style={{ color: "#8FB8FF", textDecoration: "none" }}>Queue</Link>
        <span style={{ opacity: 0.5 }}>→</span>
        <span style={{ color: "#cfe0ff", fontWeight: 600 }}>New item</span>
      </div>

      <div style={{ background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 18, padding: 24, boxShadow: "0 12px 40px rgba(0,0,0,.35)" }}>
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 20, color: "#cfe0ff", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg,#3D8DFF,#6DCBF4)", display: "grid", placeItems: "center", fontSize: 16 }}>＋</span>
            New Content Item
          </h1>
          <p style={{ margin: "8px 0 0", color: "#8FA0B8", fontSize: 12 }}>
            Создаст запись со статусом <code style={{ background: "#0B1420", border: "1px solid #1E2F44", padding: "1px 6px", borderRadius: 6, color: "#8FB8FF" }}>idea</code> и автоматически сгенерирует brief.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#8FA0B8" }}>Title *</span>
            <input value={title} onChange={e => onTitleChange(e.target.value)} placeholder="Например: Как выбрать район в Паттайе" required
              style={{ background: "#0B1420", border: "1px solid #1E2F44", borderRadius: 10, padding: "10px 12px", color: "#eee", outline: "none" }} />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#8FA0B8" }}>Slug</span>
            <input value={slug} onChange={e => { setSlug(e.target.value); setSlugDirty(true); }} placeholder="auto from title"
              style={{ background: "#0B1420", border: "1px solid #1E2F44", borderRadius: 10, padding: "10px 12px", color: "#eee", outline: "none" }} />
            <span style={{ fontSize: 11, opacity: 0.45, color: "#8FA0B8" }}>auto-generated, editable</span>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#8FA0B8" }}>Brief</span>
            <textarea value={brief} onChange={e => setBrief(e.target.value)} rows={4} placeholder="Кратко о чем материал, тезисы, аудитория…"
              style={{ background: "#0B1420", border: "1px solid #1E2F44", borderRadius: 10, padding: "10px 12px", color: "#eee", outline: "none", resize: "vertical" }} />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#8FA0B8" }}>Project *</span>
            {loadingProjects ? (
              <div style={{ background: "#0B1420", border: "1px solid #1E2F44", borderRadius: 10, padding: 12, color: "#8FA0B8", fontSize: 12 }}>Loading projects…</div>
            ) : projects.length === 0 ? (
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
            <Link href="/queue" style={{ background: "#1a2636", border: "1px solid #2a3a52", color: "#8FA0B8", borderRadius: 10, padding: "10px 16px", textDecoration: "none", fontSize: 13 }}>Cancel</Link>
            <button type="submit" disabled={submitting} style={{ background: submitting ? "#2a4a7a" : "linear-gradient(135deg,#3D8DFF,#6DCBF4)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, cursor: submitting ? "wait" : "pointer", opacity: submitting ? 0.7 : 1 }}>
              {submitting ? "Creating…" : "Create & generate brief"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
