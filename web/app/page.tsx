"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getToken, authHeaders, apiUrl, clearToken } from "../lib/auth";
import { StatusBadge } from "../components/StatusBadge";
import { PipelineStepper } from "../components/PipelineStepper";
import { Skeleton, CardSkeleton } from "../components/Skeleton";
import { GenerationProgress, GlobalGenerationStatus, type Job } from "../components/GenerationStatus";

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
  const [jobs, setJobs] = useState<Record<string, Job>>({});

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
    if (r.status === 401) { clearToken(); router.replace("/login"); throw new Error("unauthorized"); }
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
    if (r.status === 401) { clearToken(); router.replace("/login"); throw new Error("unauthorized"); }
    const d = await r.json();
    setItems(d.items || []);
    return (d.items || []) as Item[];
  }, [router]);

  const fetchJobsForItems = useCallback(async (list: Item[]) => {
    const entries = await Promise.all(
      list.map(async (it) => {
        try {
          const r = await fetch(apiUrl(`/api/v1/content-items/${it.id}/generation-status`), { headers: { ...authHeaders() } });
          if (!r.ok) return null;
          const j = (await r.json()) as Job;
          if (typeof j.progress === "string") j.progress = parseInt(j.progress as any, 10) || 0;
          return [it.id, j] as const;
        } catch { return null; }
      })
    );
    const map: Record<string, Job> = {};
    for (const e of entries) if (e) map[e[0]] = e[1];
    setJobs(map);
    return map;
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    Promise.all([fetchItems().then((list) => fetchJobsForItems(list)), fetchProjects()])
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [router, fetchItems, fetchProjects, fetchJobsForItems]);

  // auto-poll every 2s while pending/running
  useEffect(() => {
    const activeIds = Object.entries(jobs).filter(([, j]) => j.status === "pending" || j.status === "running").map(([id]) => id);
    if (activeIds.length === 0) return;
    const id = window.setInterval(async () => {
      for (const cid of activeIds) {
        try {
          const r = await fetch(apiUrl(`/api/v1/content-items/${cid}/generation-status`), { headers: { ...authHeaders() } });
          if (!r.ok) continue;
          const j = (await r.json()) as Job;
          if (typeof j.progress === "string") j.progress = parseInt(j.progress as any, 10) || 0;
          setJobs((prev) => ({ ...prev, [cid]: j }));
          if (j.status === "succeeded" || j.status === "failed") {
            // refresh items to update pipeline status
            fetchItems().catch(() => {});
          }
        } catch {}
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [jobs, fetchItems]);

  function onTitleChange(v: string) {
    setTitle(v);
    if (!slugDirty) setSlug(slugify(v));
  }

  async function handleRetryGenerate(contentItemId: string, e?: React.MouseEvent) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    try {
      await fetch(apiUrl(`/api/v1/content-items/${contentItemId}/generate`), {
        method: "POST", headers: { ...authHeaders() },
      });
      // optimistic pending
      setJobs((prev) => ({ ...prev, [contentItemId]: { id: "temp", content_item_id: contentItemId, owner_user_id: "", status: "pending", step: "plan_topic", progress: 5 } }));
      // fetch fresh status shortly
      setTimeout(async () => {
        try {
          const r = await fetch(apiUrl(`/api/v1/content-items/${contentItemId}/generation-status`), { headers: { ...authHeaders() } });
          if (r.ok) {
            const j = (await r.json()) as Job;
            if (typeof j.progress === "string") j.progress = parseInt(j.progress as any, 10) || 0;
            setJobs((prev) => ({ ...prev, [contentItemId]: j }));
          }
        } catch {}
      }, 500);
    } catch {}
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
      }
      const list = await fetchItems();
      await fetchJobsForItems(list);
      setShowModal(false);
      setTitle(""); setSlug(""); setSlugDirty(false); setBrief("");
    } catch (e: any) {
      setFormErr(e.message);
    } finally { setSubmitting(false); }
  }

  if (loading) return <div style={{ display: "grid", gap: 10 }}><Skeleton style={{ height: 28, width: 180 }} /><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>;
  if (err) return <div style={{ background: "rgba(255,60,60,.12)", border: "1px solid rgba(255,60,60,.3)", padding: 16, borderRadius: 12, color: "#ff8a8a" }}><strong>Failed to load</strong><div style={{ fontSize: 12, marginTop: 6 }}>{err}</div><div style={{ marginTop: 12, display: "flex", gap: 8 }}><button onClick={() => location.reload()} style={{ background: "#1a2636", border: "1px solid #2a3a52", color: "#cfe0ff", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>Retry</button><button onClick={() => { clearToken(); router.replace("/login"); }} style={{ background: "#33151a", border: "1px solid #5a2a33", color: "#ff8a8a", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>Re-login</button></div></div>;

  const activeJobIds = Object.entries(jobs).filter(([, j]) => j.status === "pending" || j.status === "running").map(([id]) => id);

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

      <GlobalGenerationStatus visibleItems={activeJobIds} />

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
          {items.map((it) => {
            const job = jobs[it.id] || null;
            const showJob = job && (job.status === "pending" || job.status === "running" || job.status === "failed");
            const isActive = job?.status === "pending" || job?.status === "running";
            return (
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
                {showJob && (
                  <div style={{ marginTop: 10, background: "#0b111a", border: "1px solid #1e2f44", borderRadius: 10, padding: 10 }} onClick={(e) => e.preventDefault()}>
                    <GenerationProgress job={job} compact />
                    {job?.status === "failed" && (
                      <button
                        onClick={(e) => handleRetryGenerate(it.id, e)}
                        style={{ marginTop: 8, background: "#b4232a", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontWeight: 700, cursor: "pointer", fontSize: 11 }}
                      >
                        Retry generate
                      </button>
                    )}
                    {isActive && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>auto-refresh every 2s — {job.step} {job.progress}%</div>}
                  </div>
                )}
              </Link>
            );
          })}
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
