"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getToken, authHeaders, apiUrl, clearToken } from "../../lib/auth";
import { useActiveProject } from "../../lib/activeProject";
import { StatusBadge } from "../../components/StatusBadge";
import { Skeleton, CardSkeleton } from "../../components/Skeleton";
import { GenerationProgress, type Job } from "../../components/GenerationStatus";
import { PipelineStepper } from "../../components/PipelineStepper";

// — pipeline meta: single source of truth for top bar + per-item stepper (icons attached)
const PIPELINE_STEPS = [
  { k: "idea", label: "Idea", icon: "💡", bg: "#143054", border: "#2a5a8a" },
  { k: "brief_ready", label: "Brief", icon: "📋", bg: "#101f36", border: "#2a3a52" },
  { k: "drafting", label: "Draft", icon: "✍️", bg: "#1e1a08", border: "#4a3d16" },
  { k: "review_ready", label: "Review", icon: "👁️", bg: "#231a0a", border: "#5a3420" },
  { k: "approved", label: "Approved", icon: "✅", bg: "#123825", border: "#2a6b3a" },
  { k: "published", label: "Publish", icon: "📡", bg: "#0f2a4d", border: "#2a4a7a" },
  { k: "measuring", label: "Measure", icon: "📊", bg: "#2e1e08", border: "#6b3d16" },
  { k: "reflected", label: "Reflected", icon: "💭", bg: "#1a1633", border: "#3a2a5a" },
] as const;

function pipelineIndexForStatus(status: string): number {
  const s = (status || "").toLowerCase();
  if (s === "idea") return 0;
  if (s === "brief_ready") return 1;
  if (s === "drafting" || s === "queued") return 2;
  if (s === "review_ready") return 3;
  if (s === "approved" || s === "changes_requested" || s === "rejected" || s === "scheduled") return 4;
  if (s === "publishing" || s === "published" || s === "partially_published" || s === "failed") return 5;
  if (s === "measuring") return 6;
  if (s === "reflected") return 7;
  return 0;
}

type Item = { id: string; title?: string; status?: string; slug?: string; project_id?: string; created_at?: string };
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
  const { activeId } = useActiveProject();
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
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    const r = await fetch(apiUrl("/api/v1/projects/"), { headers: { ...authHeaders() } });
    if (r.status === 401) { clearToken(); router.replace("/login"); throw new Error("unauthorized"); }
    const d = await r.json().catch(() => ({ items: [] }));
    const list: Project[] = d.items || d || [];
    setProjects(Array.isArray(list) ? list : []);
    return Array.isArray(list) ? list : [];
  }, [router]);

  const fetchItems = useCallback(async () => {
    const r = await fetch(apiUrl("/api/v1/content-items/"), { headers: { ...authHeaders() } });
    if (r.status === 401) { clearToken(); router.replace("/login"); throw new Error("unauthorized"); }
    const d = await r.json();
    setItems(d.items || []);
    return (d.items || []) as Item[];
  }, [router]);

  // Single fetch on mount only — no per-item generation-status polling on Queue
  useEffect(() => {
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    Promise.all([fetchItems(), fetchProjects()])
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [router, fetchItems, fetchProjects]);

  // sync new-item projectId with activeId
  useEffect(() => {
    if (activeId && !projectId) setProjectId(activeId);
    else if (activeId && projectId !== activeId) {
      // when active project changes, default new item to it (but don't override if user already picked different)
      // we update only if modal not open to avoid surprising user
      if (!showModal) setProjectId(activeId);
    }
  }, [activeId, projectId, showModal]);

  useEffect(() => {
    if (showModal && activeId && !projectId) setProjectId(activeId);
  }, [showModal, activeId, projectId]);

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
      setJobs((prev) => ({ ...prev, [contentItemId]: { id: "temp", content_item_id: contentItemId, owner_user_id: "", status: "pending", step: "plan_topic", progress: 5 } }));
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
      }
      await fetchItems();
      setShowModal(false);
      setTitle(""); setSlug(""); setSlugDirty(false); setBrief("");
    } catch (e: any) {
      setFormErr(e.message);
    } finally { setSubmitting(false); }
  }

  // filtered by active project + status
  const filteredByProject = (list: Item[]) => list.filter(it => !activeId || (it as any).project_id === activeId);
  const statusFiltered = (list: Item[]) => list.filter(it => filterStatus === "all" || it.status === filterStatus);
  const visibleItems = statusFiltered(filteredByProject(items));
  const pipelineBase = filteredByProject(items);

  if (loading) return <div style={{ display: "grid", gap: 10 }}><Skeleton style={{ height: 28, width: 180 }} /><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>;
  if (err) return <div style={{ background: "rgba(255,60,60,.12)", border: "1px solid rgba(255,60,60,.3)", padding: 16, borderRadius: 12, color: "#ff8a8a" }}><strong>Failed to load</strong><div style={{ fontSize: 12, marginTop: 6 }}>{err}</div><div style={{ marginTop: 12, display: "flex", gap: 8 }}><button onClick={() => location.reload()} style={{ background: "#1a2636", border: "1px solid #2a3a52", color: "#cfe0ff", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>Retry</button><button onClick={() => { clearToken(); router.replace("/login"); }} style={{ background: "#33151a", border: "1px solid #5a2a33", color: "#ff8a8a", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>Re-login</button></div></div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0, display: "flex", alignItems: "center", gap: 10 }}><span style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg,#3D8DFF,#6DCBF4)", display: "grid", placeItems: "center", fontSize: 16 }}>🌀</span>Queue</h1>
          <p style={{ opacity: 0.6, fontSize: 12, margin: "6px 0 0" }}>{items.length} items · pipeline <span style={{ color: "#8FB8FF" }}>idea → brief → draft → review → published → reflected</span>{activeId ? <span style={{ opacity: 0.8 }}> · проект: <strong style={{ color: "#cfe0ff" }}>{projects.find(p=>p.id===activeId)?.name || activeId.slice(0,8)}</strong></span> : null}</p>
        </div>
        <button
          onClick={() => { setFormErr(null); setShowModal(true); if (projects.length===0) fetchProjects().catch(()=>{}); if (activeId) setProjectId(activeId); }}
          style={{ background: "linear-gradient(135deg,#3D8DFF,#6DCBF4)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", boxShadow: "0 4px 16px rgba(61,141,255,.35)" }}
        >
          + New item
        </button>
      </div>

      {/* banner if no active project */}
      {!activeId && (
        <div style={{ marginTop: 14, background: "rgba(255,184,77,.12)", border: "1px solid rgba(255,184,77,.3)", color: "#ffcf7a", borderRadius: 12, padding: "12px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
          <div style={{ fontSize: 13 }}>
            <strong>Выберите проект</strong> — активный проект не выбран. Данные показываются без фильтра. Выберите проект в шапке или <Link href="/projects" style={{ color: "#ffcf7a", textDecoration: "underline" }}>создайте новый</Link>.
          </div>
          <Link href="/projects" style={{ background: "#1a2636", border: "1px solid #2a3a52", color: "#8fb8ff", borderRadius: 8, padding: "6px 12px", textDecoration: "none", fontSize: 12, fontWeight: 700 }}>К проектам →</Link>
        </div>
      )}

      {/* filters — status only, project comes from ActiveProject context */}
      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 10, padding: "6px 10px" }}>
          <span style={{ fontSize: 11, color: "#8FA0B8", fontWeight: 600 }}>Status</span>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ background: "#0B1420", border: "1px solid #1e2f44", borderRadius: 8, padding: "6px 10px", color: "#eee", fontSize: 12, outline: "none" }}>
            <option value="all">All statuses</option>
            <option value="idea">idea</option><option value="brief_ready">brief_ready</option><option value="drafting">drafting</option><option value="review_ready">review_ready</option><option value="approved">approved</option><option value="published">published</option><option value="measuring">measuring</option><option value="reflected">reflected</option>
          </select>
        </div>
        {filterStatus !== "all" && <button onClick={() => setFilterStatus("all")} style={{ background: "#1a2636", border: "1px solid #2a3a52", color: "#8FB8FF", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>Reset</button>}
        <span style={{ fontSize: 11, opacity: 0.45, marginLeft: "auto" }}>{`${visibleItems.length}/${pipelineBase.length} shown${activeId ? "" : ` · ${items.length} total`}`}</span>
      </div>

      {/* pipeline summary — clickable filter (icons stay on top, but also filter by click) */}
      <div style={{ marginTop: 12, background: "linear-gradient(135deg,#0f1620 0%,#111d2e 100%)", border: "1px solid #1e2f44", borderRadius: 14, padding: "14px 14px 10px", overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 0, minWidth: 640 }}>
          {PIPELINE_STEPS.map((s, i, arr) => {
            const c = pipelineBase.filter(it => it.status === s.k).length;
            const count = s.k === "drafting" ? pipelineBase.filter(it => it.status === "drafting" || it.status === "queued").length
              : s.k === "published" ? pipelineBase.filter(it => ["publishing","published","partially_published","failed"].includes(it.status || "")).length
              : c;
            const has = count > 0;
            const isSelected = filterStatus === s.k;
            return (
              <div key={s.k} style={{ display: "flex", alignItems: "center", gap: 0, flex: 1 }}>
                <button
                  onClick={() => setFilterStatus(prev => prev === s.k ? "all" : s.k)}
                  title={isSelected ? `Remove ${s.label} filter` : `Filter by ${s.label} (${count})`}
                  style={{ flex: 1, textAlign: "center", minWidth: 72, background: isSelected ? "#162a44" : "transparent", border: isSelected ? "1px solid #3D8DFF" : "1px solid transparent", borderRadius: 12, padding: "4px 2px 6px", cursor: "pointer", transition: "all .15s" }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 12, background: isSelected ? "#1e3a5a" : s.bg, border: `1px solid ${isSelected ? "#3D8DFF" : has ? s.border : "#1e2f44"}`, display: "grid", placeItems: "center", margin: "0 auto 6px", fontSize: 16, opacity: has || isSelected ? 1 : 0.6, boxShadow: isSelected ? "0 0 14px rgba(61,141,255,.55)" : has ? `0 0 10px ${s.border}55` : "none" }}>{s.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: has || isSelected ? 700 : 500, color: isSelected ? "#8FB8FF" : has ? "#cfe0ff" : "#5a6b86" }}>{s.label}</div>
                  <div style={{ marginTop: 4, display: "inline-block", background: isSelected ? "#3D8DFF" : has ? "#162a44" : "#0b111a", border: `1px solid ${isSelected ? "#3D8DFF" : has ? "#2a4a7a" : "#1e2f44"}`, color: isSelected ? "#fff" : has ? "#7eb8ff" : "#5a6b86", borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 700, minWidth: 22 }}>{count}</div>
                </button>
                {i < arr.length - 1 && <div style={{ color: isSelected ? "#3D8DFF" : has ? "#2a4a7a" : "#1e2f44", fontSize: 12, margin: "0 2px", marginTop: -18 }}>→</div>}
              </div>
            );
          })}
        </div>
        {filterStatus !== "all" && <div style={{ marginTop: 8, textAlign: "center", fontSize: 11, color: "#8FB8FF" }}>Filtering by <strong>{PIPELINE_STEPS.find(s=>s.k===filterStatus)?.label ?? filterStatus}</strong> · <button onClick={()=>setFilterStatus("all")} style={{ background:"none", border:"none", color:"#6DCBF4", cursor:"pointer", textDecoration:"underline", fontSize:11, padding:0 }}>clear</button></div>}
      </div>

      {items.length === 0 ? (
        <div style={{ marginTop: 16, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 18, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "#cfe0ff", marginBottom: 6 }}>No items yet</div>
          <p style={{ opacity: 0.6, fontSize: 12, margin: "0 0 12px" }}>Create your first item (+ New item) or learn the flow in the guide.</p>
          <Link href="/guide" style={{ background: "linear-gradient(135deg,#3D8DFF,#6DCBF4)", color: "#fff", borderRadius: 10, padding: "8px 14px", textDecoration: "none", fontWeight: 700, fontSize: 13, display: "inline-block" }}>Open Guide →</Link>
        </div>
      ) : visibleItems.length === 0 ? (
        <div style={{ marginTop: 16, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 18, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "#cfe0ff", marginBottom: 6 }}>No items for this filter</div>
          <p style={{ opacity: 0.6, fontSize: 12, margin: "0 0 12px" }}>{activeId ? "В активном проекте нет элементов с таким статусом." : "Нет элементов."} Попробуй сбросить фильтр или создать новый.</p>
        </div>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          {visibleItems.map((it) => {
            const job = jobs[it.id] || null;
            const showJob = job && (job.status === "pending" || job.status === "running" || job.status === "failed");
            const isActive = job?.status === "pending" || job?.status === "running";
            return (
              <Link key={it.id} href={`/items/${it.id}`} style={{ textDecoration: "none", background: "linear-gradient(135deg,#0f1620 0%,#121e2e 100%)", border: "1px solid #1e2f44", borderRadius: 12, padding: 14, display: "block", transition: "border-color .15s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ color: "#cfe0ff", fontWeight: 600, fontSize: 13 }}>{it.title || it.slug || it.id.slice(0, 8)}</span>
                      {(it as any).project_id && <span style={{ background: "#162a44", border: "1px solid #1e3a5a", color: "#8fb8ff", borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>{projects.find(p=>p.id===(it as any).project_id)?.name || (it as any).project_id.slice(0, 6)}</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#5a6b86", marginTop: 4, display: "flex", gap: 8 }}>{it.slug && <span>/{it.slug}</span>} <span style={{ opacity: 0.4 }}>·</span> <span>{it.id.slice(0, 8)}…</span></div>
                  </div>
                  <StatusBadge status={it.status || ""} size={11} />
                </div>
                {/* per-item pipeline — icons attached to item (fix detached icons) */}
                <div style={{ marginTop: 10, background: "#0b111a", borderRadius: 10, padding: "8px 6px 6px", border: "1px solid #0f1f33", overflowX: "auto" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                    {PIPELINE_STEPS.map((st, i) => {
                      const idx = pipelineIndexForStatus(it.status || "idea");
                      const active = i === idx;
                      const done = i < idx;
                      return (
                        <div key={st.k} style={{ display: "flex", alignItems: "center", gap: 0, flex: 1, minWidth: 0 }}>
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 32, opacity: done || active ? 1 : 0.45 }}>
                            <div
                              title={`${st.label}${active ? " — current" : done ? " — done" : ""}`}
                              style={{
                                width: active ? 26 : 20,
                                height: active ? 26 : 20,
                                borderRadius: 999,
                                display: "grid",
                                placeItems: "center",
                                fontSize: active ? 12 : 10,
                                background: done ? "#1f4a2b" : active ? st.bg : "#1a2636",
                                color: done ? "#6fdc8c" : active ? "#fff" : "#5a6b86",
                                border: `1px solid ${active ? st.border : done ? "#2a5a3a" : "#1e2f44"}`,
                                boxShadow: active ? `0 0 10px ${st.border}88` : "none",
                              }}
                            >
                              {done ? "✓" : st.icon}
                            </div>
                            <div style={{ fontSize: 9, fontWeight: active ? 700 : 500, color: active ? "#cfe0ff" : done ? "#8FA0B8" : "#5a6b86", whiteSpace: "nowrap" }}>{st.label}</div>
                            <div style={{ width: active ? 18 : done ? 14 : 6, height: 2, borderRadius: 1, background: active ? "#3D8DFF" : done ? "#2a5a3a" : "#1e2f44", marginTop: 1 }} />
                          </div>
                          {i < PIPELINE_STEPS.length - 1 && <div style={{ width: 8, height: 1, background: i < idx ? "#2a5a3a" : "#1e2f44", margin: "0 1px", marginBottom: 14, flexShrink: 0 }} />}
                        </div>
                      );
                    })}
                  </div>
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
                    {isActive && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 6 }}>generating — open item to see live progress — {job.step} {job.progress}%</div>}
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
