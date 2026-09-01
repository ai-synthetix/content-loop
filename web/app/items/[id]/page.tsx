"use client";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { getToken, apiUrl, authHeaders, clearToken } from "../../../lib/auth";
import { StatusBadge } from "../../../components/StatusBadge";
import { PipelineStepper } from "../../../components/PipelineStepper";
import { Skeleton, CardSkeleton } from "../../../components/Skeleton";
import { GenerationProgress, type Job } from "../../../components/GenerationStatus";
import { VariantsGrid, PrettyJSON, VariantCard } from "../../../components/VariantPreview";

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [genError, setGenError] = useState<string | null>(null);
  const [review, setReview] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [approving, setApproving] = useState(false);
  const pollRef = useRef<number | null>(null);

  // publish
  const [publishing, setPublishing] = useState(false);
  const [publishResults, setPublishResults] = useState<any[] | null>(null);
  const [publishErr, setPublishErr] = useState<string | null>(null);

  // publications list
  const [publications, setPublications] = useState<any[]>([]);
  const [pubLoading, setPubLoading] = useState(false);
  const [pubErr, setPubErr] = useState<string | null>(null);

  // metrics per publication
  const [metricsByPub, setMetricsByPub] = useState<Record<string, any[]>>({});
  const [metricForms, setMetricForms] = useState<Record<string, { views: string; reactions: string; comments: string; err: string | null; ok: string | null; saving: boolean }>>({});
  // collect metrics now per publication
  const [collectByPub, setCollectByPub] = useState<Record<string, { saving: boolean; err: string | null; ok: string | null; last: any | null }>>({});

  // edit version
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);
  const [editOk, setEditOk] = useState<string | null>(null);

  // reflections
  const [reflections, setReflections] = useState<any[]>([]);
  const [reflForm, setReflForm] = useState({ observation: "", confidence: "medium", possible_causes: "", next_test: "", do_not_conclude: "" });
  const [reflSaving, setReflSaving] = useState(false);
  const [reflErr, setReflErr] = useState<string | null>(null);
  const [reflOk, setReflOk] = useState<string | null>(null);

  // create next idea from reflection (close the loop)
  const [nextIdea, setNextIdea] = useState<Record<string, { loading: boolean; err: string | null; ok: any | null }>>({});
  const [globalNextIdea, setGlobalNextIdea] = useState<{ loading: boolean; err: string | null; ok: any | null }>({ loading: false, err: null, ok: null });

  function on401() { clearToken(); router.replace("/login"); }

  async function fetchItem() {
    const r = await fetch(apiUrl(`/api/v1/content-items/${id}`), { headers: { ...authHeaders() } });
    if (r.status === 401) { on401(); throw new Error("unauthorized"); }
    if (!r.ok) throw new Error(`load failed ${r.status}`);
    const d = await r.json();
    setItem(d);
    return d;
  }

  async function fetchJob() {
    try {
      const r = await fetch(apiUrl(`/api/v1/content-items/${id}/generation-status`), { headers: { ...authHeaders() } });
      if (r.status === 404) { setJob(null); return null; }
      if (r.status === 401) { on401(); return null; }
      if (!r.ok) return null;
      const j = (await r.json()) as Job;
      if (typeof j.progress === "string") j.progress = parseInt(j.progress as any, 10) || 0;
      setJob(j);
      return j;
    } catch { return null; }
  }

  function startPolling() {
    if (pollRef.current) window.clearInterval(pollRef.current);
    fetchJob();
    const iv = window.setInterval(async () => {
      const j = await fetchJob();
      if (j && (j.status === "succeeded" || j.status === "failed")) {
        window.clearInterval(iv);
        pollRef.current = null;
        try {
          await fetchItem();
          const r2 = await fetch(apiUrl(`/api/v1/content-items/${id}/review`), { headers: { ...authHeaders() } });
          if (r2.ok) setReview(await r2.json());
        } catch {}
      }
    }, 2000);
    pollRef.current = iv as unknown as number;
  }

  async function fetchPublications() {
    setPubLoading(true); setPubErr(null);
    try {
      const r = await fetch(apiUrl(`/api/v1/publications/`), { headers: { ...authHeaders() } });
      if (r.status === 401) { on401(); return; }
      if (!r.ok) {
        // fallback: try without trailing slash
        const r2 = await fetch(apiUrl(`/api/v1/publications`), { headers: { ...authHeaders() } });
        if (r2.status === 401) { on401(); return; }
        if (!r2.ok) throw new Error(`publications ${r.status}`);
        const d2 = await r2.json().catch(() => ({}));
        const items2 = d2.items || d2.publications || (Array.isArray(d2) ? d2 : []);
        const filtered2 = Array.isArray(items2) ? items2.filter((p: any) => !p.content_item_id || p.content_item_id === id) : [];
        setPublications(filtered2);
        // fetch metrics for each
        filtered2.forEach((p: any) => fetchMetricsForPub(p.id));
        return;
      }
      const d = await r.json().catch(() => ({}));
      const items = d.items || d.publications || (Array.isArray(d) ? d : []);
      const filtered = Array.isArray(items) ? items.filter((p: any) => !p.content_item_id || p.content_item_id === id) : [];
      setPublications(filtered);
      filtered.forEach((p: any) => fetchMetricsForPub(p.id));
    } catch (e: any) {
      setPubErr(e.message);
    } finally { setPubLoading(false); }
  }

  async function fetchMetricsForPub(pubId: string) {
    try {
      const r = await fetch(apiUrl(`/api/v1/publications/${pubId}/metrics`), { headers: { ...authHeaders() } });
      if (r.status === 401) { on401(); return; }
      if (r.status === 404) { setMetricsByPub(prev => ({ ...prev, [pubId]: [] })); return; }
      if (!r.ok) return;
      const d = await r.json().catch(() => ({}));
      const items = d.items || d.snapshots || d.metrics || (Array.isArray(d) ? d : []);
      setMetricsByPub(prev => ({ ...prev, [pubId]: Array.isArray(items) ? items : [] }));
    } catch { /* ignore */ }
  }

  async function fetchReflections() {
    try {
      const r = await fetch(apiUrl(`/api/v1/content-items/${id}/reflections`), { headers: { ...authHeaders() } });
      if (r.status === 401) { on401(); return; }
      if (r.status === 404) { setReflections([]); return; }
      if (!r.ok) { setReflections([]); return; }
      const d = await r.json().catch(() => ({}));
      const items = d.items || d.reflections || (Array.isArray(d) ? d : []);
      setReflections(Array.isArray(items) ? items : []);
    } catch { setReflections([]); }
  }

  useEffect(() => {
    if (!id) return;
    const token = getToken();
    if (!token) { router.replace("/login"); return; }
    setLoading(true);
    fetchItem()
      .catch((e) => { if (e.message !== "unauthorized") setErr(e.message); setItem({ _error: true }); })
      .finally(() => setLoading(false));
    fetchJob();
    fetchPublications();
    fetchReflections();
    fetch(apiUrl("/api/v1/channels/"), { headers: { ...authHeaders() } })
      .then(r => {
        if (r.status === 401) { on401(); throw new Error("unauthorized"); }
        return r.json();
      })
      .then(d => {
        const items = d.items || [];
        setChannels(items);
      }).catch(() => {});
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [id]);

  useEffect(() => {
    if (job && (job.status === "pending" || job.status === "running")) {
      startPolling();
    }
  }, [job?.id]);

  useEffect(() => {
    if (!item?.project_id || channels.length === 0) return;
    const forProject = channels.filter((c: any) => c.project_id === item.project_id).map((c: any) => c.id);
    if (forProject.length) setSelectedChannels(forProject);
  }, [item, channels]);

  async function doGenerate() {
    setGenError(null);
    try {
      const r = await fetch(apiUrl(`/api/v1/content-items/${id}/generate`), { method: "POST", headers: { ...authHeaders() } });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { on401(); return; }
      if (!r.ok && r.status !== 202) throw new Error(d.error || `generate failed ${r.status}`);
      const j = (d.job || d) as Job;
      if (j && j.id) {
        if (typeof j.progress === "string") j.progress = parseInt(j.progress as any, 10) || 0;
        setJob(j);
      } else if (d.job_id) {
        await fetchJob();
      }
      startPolling();
    } catch (e: any) { setGenError(e.message); }
  }

  async function loadReview() {
    try {
      const r = await fetch(apiUrl(`/api/v1/content-items/${id}/review`), { headers: { ...authHeaders() } });
      if (r.status === 401) { on401(); return; }
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || String(r.status));
      setReview(d); setErr(null);
      // sync edit fields from latest_version
      const latest = d.latest_version || d.latest || d.Latest;
      if (latest) {
        setEditTitle(latest.title || "");
        setEditBody(latest.body_markdown || latest.bodyMarkdown || "");
      }
    } catch (e: any) { setErr(e.message); }
  }

  // keep edit fields in sync when review changes via polling / initial load
  useEffect(() => {
    if (!review) return;
    const latest = (review as any).latest_version || (review as any).latest || (review as any).Latest;
    if (latest) {
      if (!editTitle && latest.title) setEditTitle(latest.title);
      if (!editBody && latest.body_markdown) setEditBody(latest.body_markdown);
      // if already set, sync anyway when version changes (different id)
      // we detect version id change
      if (latest.title !== undefined && latest.title !== editTitle) {
        // only auto-sync if user hasn't diverged? simple: always sync on review change if version id differs
        // use a ref check: compare body lengths – easiest just set when review updates and fields empty or latest id changed
      }
    }
  }, [review]);

  async function doSaveVersion() {
    setEditSaving(true); setEditErr(null); setEditOk(null);
    try {
      // parse claims if needed? we keep existing claims from latest
      const latest = (review as any)?.latest_version || (review as any)?.latest;
      let claims: any = undefined;
      if (latest?.claims) {
        try {
          claims = typeof latest.claims === "string" ? JSON.parse(latest.claims) : latest.claims;
        } catch { claims = latest.claims; }
      }
      const excerpt = latest?.excerpt ?? null;
      const payload: any = {
        title: editTitle.trim(),
        body_markdown: editBody,
        excerpt: excerpt,
        claims: claims ?? [],
      };
      if (!payload.title) throw new Error("title is required");
      if (!payload.body_markdown || !payload.body_markdown.trim()) throw new Error("body_markdown is required");
      const r = await fetch(apiUrl(`/api/v1/content-items/${id}/versions`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (r.status === 401) { on401(); return; }
      const d = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(d.error || `save failed ${r.status}`);
      setEditOk(`saved v${d.version_no || d.versionNo || "?"} — review updated`);
      await fetchItem();
      await loadReview();
      setTimeout(()=> setEditOk(null), 3000);
    } catch (e:any) { setEditErr(e.message); }
    finally { setEditSaving(false); }
  }

  async function doApprove(decision: string) {
    setApproving(true);
    setErr(null);
    try {
      const r = await fetch(apiUrl(`/api/v1/content-items/${id}/approvals`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ decision }),
      });
      if (r.status === 401) { on401(); return; }
      const d = await r.json().catch(()=>({}));
      if (!r.ok) throw new Error(d.error || `approve failed ${r.status}`);
      await fetchItem();
      await loadReview();
    } catch (e:any) { setErr(e.message); }
    finally { setApproving(false); }
  }

  async function doPublish() {
    if (!selectedChannels.length) return;
    setPublishing(true); setPublishErr(null); setPublishResults(null);
    try {
      const r = await fetch(apiUrl(`/api/v1/publications`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ content_item_id: id, channel_ids: selectedChannels }),
      });
      if (r.status === 401) { on401(); return; }
      const d = await r.json().catch(() => ({}));
      if (r.status === 409) {
        throw new Error(d.error || "Conflict: item not approved (409)");
      }
      if (!r.ok && r.status !== 200 && r.status !== 201) {
        throw new Error(d.error || `publish failed ${r.status}`);
      }
      // success: d could be {items: [...]}, {publications: [...]}, array, or single
      let results: any[] = [];
      if (Array.isArray(d)) results = d;
      else if (Array.isArray(d.items)) results = d.items;
      else if (Array.isArray(d.publications)) results = d.publications;
      else if (Array.isArray(d.results)) results = d.results;
      else if (d.id) results = [d];
      else if (d.publication) results = [d.publication];
      else results = [d];
      setPublishResults(results);
      await fetchPublications();
      await fetchItem();
    } catch (e: any) { setPublishErr(e.message); }
    finally { setPublishing(false); }
  }

  async function submitMetrics(pubId: string) {
    const f = metricForms[pubId] || { views: "", reactions: "", comments: "", err: null, ok: null, saving: false };
    setMetricForms(prev => ({ ...prev, [pubId]: { ...f, saving: true, err: null, ok: null } }));
    try {
      const viewsNum = f.views === "" ? undefined : Number(f.views);
      const commentsNum = f.comments === "" ? undefined : Number(f.comments);
      if (f.views !== "" && Number.isNaN(viewsNum)) throw new Error("views must be a number");
      if (f.comments !== "" && Number.isNaN(commentsNum)) throw new Error("comments must be a number");
      let reactionsVal: any = undefined;
      if (f.reactions.trim() !== "") {
        try { reactionsVal = JSON.parse(f.reactions); }
        catch { throw new Error("reactions must be valid JSON"); }
      }
      const metrics: any = {};
      if (viewsNum !== undefined) metrics.views = viewsNum;
      if (commentsNum !== undefined) metrics.comments = commentsNum;
      if (reactionsVal !== undefined) metrics.reactions = reactionsVal;
      if (Object.keys(metrics).length === 0) throw new Error("provide at least one metric");

      // API expects POST /api/v1/publications/{pubId}/metrics with {metrics: {...}} or flat
      const body = { metrics, captured_at: new Date().toISOString() };
      const r = await fetch(apiUrl(`/api/v1/publications/${pubId}/metrics`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      if (r.status === 401) { on401(); return; }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `metrics failed ${r.status}`);
      setMetricForms(prev => ({ ...prev, [pubId]: { ...f, saving: false, ok: "saved", err: null } }));
      await fetchMetricsForPub(pubId);
      setTimeout(() => setMetricForms(prev => ({ ...prev, [pubId]: { ...prev[pubId], ok: null } })), 2500);
    } catch (e: any) {
      setMetricForms(prev => ({ ...prev, [pubId]: { ...prev[pubId], saving: false, err: e.message, ok: null } }));
    }
  }

  async function collectMetrics(pubId: string) {
    setCollectByPub(prev => ({ ...prev, [pubId]: { saving: true, err: null, ok: null, last: null } }));
    try {
      const r = await fetch(apiUrl(`/api/v1/publications/${pubId}/metrics/collect`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({}),
      });
      if (r.status === 401) { on401(); return; }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `collect failed ${r.status}`);
      setCollectByPub(prev => ({ ...prev, [pubId]: { saving: false, err: null, ok: "collected", last: d } }));
      await fetchMetricsForPub(pubId);
      setTimeout(() => setCollectByPub(prev => ({ ...prev, [pubId]: { ...prev[pubId], ok: null } })), 3000);
    } catch (e: any) {
      setCollectByPub(prev => ({ ...prev, [pubId]: { saving: false, err: e.message, ok: null, last: null } }));
    }
  }

  function getMilestone(snap: any): string {
    // direct fields
    if (snap.milestone && ["3h","24h","7d"].includes(snap.milestone)) return snap.milestone;
    if (snap.kind && ["3h","24h","7d"].includes(snap.kind)) return snap.kind;
    // metrics may be stringified JSON
    let m: any = snap.metrics;
    if (typeof m === "string") { try { m = JSON.parse(m); } catch { m = null; } }
    if (m) {
      if (m.milestone && ["3h","24h","7d"].includes(m.milestone)) return m.milestone;
      if (m.extra && m.extra.milestone && ["3h","24h","7d"].includes(m.extra.milestone)) return m.extra.milestone;
      if (m.source === "manual" || m.manual === true || m._collected_via === "manual") return "manual";
      if (m.extra && m.extra.manual === true) return "manual";
    }
    if (snap.source === "manual" || snap.manual === true) return "manual";
    return "manual";
  }
  function milestoneStyle(m: string): React.CSSProperties {
    if (m === "3h") return { background: "rgba(110,220,140,.16)", border: "1px solid #2a6a3a", color: "#6fdc8c", borderRadius: 20, padding: "1px 7px", fontSize: 10, fontWeight: 700 } as React.CSSProperties;
    if (m === "24h") return { background: "rgba(61,141,255,.16)", border: "1px solid #2a4a7a", color: "#7eb8ff", borderRadius: 20, padding: "1px 7px", fontSize: 10, fontWeight: 700 } as React.CSSProperties;
    if (m === "7d") return { background: "rgba(255,185,100,.16)", border: "1px solid #6b4a1a", color: "#ffb85c", borderRadius: 20, padding: "1px 7px", fontSize: 10, fontWeight: 700 } as React.CSSProperties;
    return { background: "rgba(140,140,140,.12)", border: "1px solid #3a3a3a", color: "#aaa", borderRadius: 20, padding: "1px 7px", fontSize: 10, fontWeight: 700 } as React.CSSProperties;
  }

  async function submitReflection() {
    setReflSaving(true); setReflErr(null); setReflOk(null);
    try {
      if (!reflForm.observation.trim()) throw new Error("observation is required");
      let causes: any = undefined;
      if (reflForm.possible_causes.trim()) {
        // try JSON first, fallback comma split
        const raw = reflForm.possible_causes.trim();
        try {
          const parsed = JSON.parse(raw);
          causes = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          causes = raw.split(",").map(s => s.trim()).filter(Boolean);
        }
      }
      const payload: any = {
        observation: reflForm.observation.trim(),
        confidence: reflForm.confidence,
        possible_causes: causes || [],
        next_test: reflForm.next_test.trim() || null,
        do_not_conclude: reflForm.do_not_conclude.trim() || null,
      };
      const r = await fetch(apiUrl(`/api/v1/content-items/${id}/reflections`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (r.status === 401) { on401(); return; }
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `reflection failed ${r.status}`);
      setReflOk("reflection saved");
      setReflForm({ observation: "", confidence: "medium", possible_causes: "", next_test: "", do_not_conclude: "" });
      await fetchReflections();
      setTimeout(() => setReflOk(null), 2500);
    } catch (e: any) { setReflErr(e.message); }
    finally { setReflSaving(false); }
  }

  function reflSlugify(s: string) {
    return s.toLowerCase().trim().replace(/[^a-z0-9\u00C0-\u024F\u0400-\u04FF]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "untitled";
  }

  async function createNextIdeaFromReflection(r: any, opts?: { global?: boolean }) {
    const isGlobal = !!opts?.global;
    const key = r?.id || "__global";
    if (!r?.id) {
      const msg = "reflection id missing";
      if (isGlobal) setGlobalNextIdea({ loading: false, err: msg, ok: null });
      else setNextIdea(prev => ({ ...prev, [key]: { loading: false, err: msg, ok: null } }));
      return;
    }
    if (!item?.project_id) {
      const msg = "project_id missing — item has no project";
      if (isGlobal) setGlobalNextIdea({ loading: false, err: msg, ok: null });
      else setNextIdea(prev => ({ ...prev, [key]: { loading: false, err: msg, ok: null } }));
      return;
    }
    const setBusy = (v: boolean) => {
      if (isGlobal) setGlobalNextIdea({ loading: v, err: null, ok: null });
      else setNextIdea(prev => ({ ...prev, [r.id]: { loading: v, err: null, ok: null } }));
    };
    setBusy(true);
    try {
      const rawTitle = (r.next_test && String(r.next_test).trim()) || (r.observation && String(r.observation).trim()) || "Next idea from reflection";
      const title = rawTitle.slice(0, 140);
      const slugBase = reflSlugify(title);
      const slug = `${slugBase}-${r.id.slice(0, 6)}`.slice(0, 90);
      const brief: any = {
        raw: `From reflection ${r.id}\nObservation: ${r.observation || ""}\nNext test: ${r.next_test || ""}`,
        from_reflection_id: r.id,
        source_reflection_id: r.id,
        source_item_id: id,
        observation: r.observation || null,
        next_test: r.next_test || null,
        confidence: r.confidence || null,
      };
      const payload: any = { title, slug, brief, project_id: item.project_id };
      const resp = await fetch(apiUrl(`/api/v1/content-items/`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });
      if (resp.status === 401) { on401(); throw new Error("unauthorized"); }
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(d.error || d.detail || `create failed ${resp.status}`);
      const created = d;
      if (isGlobal) setGlobalNextIdea({ loading: false, err: null, ok: created });
      else setNextIdea(prev => ({ ...prev, [r.id]: { loading: false, err: null, ok: created } }));
    } catch (e: any) {
      const msg = e.message || "failed";
      if (isGlobal) setGlobalNextIdea({ loading: false, err: msg, ok: null });
      else setNextIdea(prev => ({ ...prev, [r.id]: { loading: false, err: msg, ok: null } }));
    }
  }

  if (loading) return <div style={{ display: "grid", gap: 12 }}><CardSkeleton /><Skeleton style={{ height: 120 }} /></div>;
  if (err && !item) return <div style={{ background: "rgba(255,60,60,.12)", border: "1px solid rgba(255,60,60,.3)", padding: 16, borderRadius: 12, color: "#ff8a8a" }}><strong>Failed to load item</strong><div style={{ fontSize: 12, marginTop: 6 }}>{err}</div><button onClick={() => location.reload()} style={{ marginTop: 10, background: "#1a2636", border: "1px solid #2a3a52", color: "#cfe0ff", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>Retry</button></div>;
  if (!item || item._error) return <div style={{ background: "rgba(255,60,60,.12)", border: "1px solid rgba(255,60,60,.3)", padding: 16, borderRadius: 12, color: "#ff8a8a" }}>Item not found or failed to load.<button onClick={() => location.reload()} style={{ marginLeft: 10, background: "#1a2636", border: "1px solid #2a3a52", color: "#cfe0ff", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>Retry</button></div>;

  const isActive = job?.status === "pending" || job?.status === "running";
  const canPublish = item.status === "approved" && selectedChannels.length > 0;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>{item.title || item.slug || id}</h1>
        <StatusBadge status={item.status || ""} />
      </div>
      {item.project_id && <p style={{ fontSize: 12, opacity: 0.6 }}>Project: <a href={`/projects/${item.project_id}`} style={{ color: "#7eb8ff" }}>{item.project_id}</a></p>}
      <div style={{ marginTop: 10, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 12 }}>
        <PipelineStepper status={item.status || "idea"} />
      </div>

      {job && (
        <div style={{ marginTop: 12, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ margin: 0, fontSize: 13 }}>Generation status</h3>
            <span style={{ fontSize: 11, opacity: 0.6 }}>{job.id.slice(0, 8)}…</span>
          </div>
          <GenerationProgress job={job} />
          {isActive && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 8 }}>auto-polling every 2s — logs stream via progress</div>}
          {job.status === "failed" && (
            <button onClick={doGenerate} style={{ marginTop: 10, background: "#b4232a", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: "pointer" }}>Retry generate</button>
          )}
          {job.status === "succeeded" && (
            <div style={{ marginTop: 8, fontSize: 11, color: "#6fdc8c" }}>Generation succeeded — content version created.</div>
          )}
        </div>
      )}

      {genError && (
        <div style={{ marginTop: 12, background: "rgba(255,60,60,.12)", border: "1px solid rgba(255,60,60,.3)", padding: 12, borderRadius: 10, color: "#ff8a8a" }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Generation failed</div>
          <div style={{ fontSize: 12, marginTop: 4, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{genError}</div>
          <div style={{ fontSize: 11, opacity: 0.7, marginTop: 6 }}>Check API logs (OPENCODE_API_KEY / AI_MODEL) and try again.</div>
          <button onClick={doGenerate} style={{ marginTop: 10, background: "#b4232a", color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: "pointer" }}>Retry generate</button>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <PrettyJSON data={item} title="Content item JSON" collapsible />
      </div>

      {channels.length > 0 && (
        <div style={{ marginTop: 16, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 10, padding: 12 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 13 }}>Channels for publishing</h3>
          <p style={{ fontSize: 11, opacity: 0.6, margin: "0 0 8px" }}>Select channels to publish this item. Channels are per-user and bound to project <code>{item.project_id || "—"}</code>. Manage in <a href="/settings/channels" style={{ color: "#7eb8ff" }}>Settings → Channels</a>.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {channels.map((c: any) => (
              <label key={c.id} style={{ display: "flex", gap: 6, alignItems: "center", background: selectedChannels.includes(c.id) ? "rgba(61,141,255,.18)" : "#0b111a", border: `1px solid ${selectedChannels.includes(c.id) ? "#2a4a7a" : "#1e2f44"}`, borderRadius: 20, padding: "6px 10px", cursor: "pointer", fontSize: 12 }}>
                <input type="checkbox" checked={selectedChannels.includes(c.id)} onChange={e => {
                  if (e.target.checked) setSelectedChannels([...selectedChannels, c.id]);
                  else setSelectedChannels(selectedChannels.filter(x => x !== c.id));
                }} />
                {c.name} <span style={{ opacity: 0.6 }}>({c.type})</span>
              </label>
            ))}
          </div>
          {selectedChannels.length > 0 && <p style={{ fontSize: 11, opacity: 0.5, marginTop: 8 }}>Selected: {selectedChannels.join(", ").slice(0, 80)}</p>}
        </div>
      )}
      <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={doGenerate} style={{ ...btn, opacity: isActive ? 0.6 : 1, background: isActive ? "#2a4a7a" : "#3D8DFF", borderColor: "#3D8DFF", color: "#fff" }}>{isActive ? `${job?.step || "Generating"} ${job?.progress || 0}%` : "Generate (retryable)"}</button>
        <button onClick={loadReview} style={btn}>Review</button>
        <button onClick={() => doApprove("approved")} disabled={approving || item.status==="approved"} style={{ ...btn, opacity: approving||item.status==="approved" ? 0.6 : 1, background: item.status==="approved" ? "#1f4a2b" : "#1a2636" }}>{approving ? "Approving…" : item.status==="approved" ? "✓ Approved" : "Approve"}</button>
        <button onClick={() => doApprove("changes_requested")} disabled={approving} style={btn}>{approving ? "…" : "Request changes"}</button>
        <button onClick={() => doApprove("rejected")} disabled={approving} style={btn}>{approving ? "…" : "Reject"}</button>
        {canPublish && (
          <button onClick={doPublish} disabled={publishing} style={{ ...btn, background: "#3D8DFF", borderColor: "#3D8DFF", color: "#fff", opacity: publishing ? 0.6 : 1, cursor: publishing ? "not-allowed" : "pointer" }}>
            {publishing ? "Publishing…" : "Publish"}
          </button>
        )}
      </div>
      {!canPublish && item.status !== "approved" && <p style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>Publish is available only when status is <code>approved</code> and at least one channel is selected.</p>}
      {item.status === "approved" && selectedChannels.length === 0 && <p style={{ fontSize: 11, opacity: 0.5, marginTop: 6 }}>Select at least one channel to publish.</p>}

      {publishErr && <div style={{ marginTop: 10, background: "rgba(255,60,60,.12)", border: "1px solid rgba(255,60,60,.3)", padding: 10, borderRadius: 8, color: "#ff8a8a", fontSize: 12 }}>{publishErr}</div>}
      {publishResults && (
        <div style={{ marginTop: 12, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 10, padding: 12 }}>
          <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>Publish results</h4>
          <div style={{ display: "grid", gap: 8 }}>
            {publishResults.map((r: any, i: number) => (
              <div key={r.id || r.idempotency_key || i} style={{ background: "#0b111a", border: "1px solid #1e2f44", borderRadius: 8, padding: 10, fontSize: 12 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ background: "#1a2740", border: "1px solid #2a3a52", borderRadius: 6, padding: "2px 8px", fontSize: 11 }}>{r.adapter || r.channel || r.type || "—"}</span>
                  {r.status && <span style={{ fontSize: 11, opacity: 0.7 }}>status: {r.status}</span>}
                  {r.idempotency_key && <span style={{ fontSize: 11, opacity: 0.5, wordBreak: "break-all" }}>key: {r.idempotency_key}</span>}
                </div>
                <div style={{ marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {r.external_id && <span>external_id: <code style={{ background: "#111a2a", padding: "1px 6px", borderRadius: 4 }}>{r.external_id}</code></span>}
                  {r.url && <a href={r.url} target="_blank" rel="noreferrer" style={{ color: "#7eb8ff", wordBreak: "break-all" }}>{r.url}</a>}
                </div>
                {r.error && <div style={{ marginTop: 6, color: "#ff8a8a", fontSize: 11 }}>{r.error}</div>}
                {r.id && <div style={{ marginTop: 4, fontSize: 11, opacity: 0.5 }}>id: {r.id}</div>}
              </div>
            ))}
            {publishResults.length === 0 && <div style={{ fontSize: 12, opacity: 0.6 }}>No results returned. Check publications list below.</div>}
          </div>
        </div>
      )}

      {err && !genError && <p style={{ color: "#ff6b6b", marginTop: 12 }}>Error: {err} <button onClick={() => setErr(null)} style={{ marginLeft: 8, background: "#1a2636", border: "1px solid #2a3a52", color: "#cfe0ff", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 11 }}>Dismiss</button></p>}
      {review && (
        <div style={{ marginTop: 16, display:"grid", gap:12 }}>
          <h3 style={{ margin: 0 }}>Review bundle</h3>
          {review.verification && (
            <div style={{ background:"#0f1620", border:"1px solid #1e2f44", borderRadius:10, padding:12 }}>
              <div style={{ fontSize:12, fontWeight:700 }}>Verification</div>
              <div style={{ fontSize:12, marginTop:4, color: review.verification.passed ? "#6fdc8c" : "#ff8a8a" }}>{review.verification.passed ? "✓ Passed" : "✗ Failed"} — length {review.verification.length}</div>
              {(review.verification.errors||[]).length>0 && <ul style={{ fontSize:11, color:"#ff8a8a", marginTop:6 }}>{review.verification.errors.map((e:string,i:number)=><li key={i}>{e}</li>)}</ul>}
              {(review.verification.warnings||[]).length>0 && <ul style={{ fontSize:11, color:"#ffcf66", marginTop:6 }}>{review.verification.warnings.map((e:string,i:number)=><li key={i}>{e}</li>)}</ul>}
            </div>
          )}
          {review.diff && (
            <PrettyJSON data={review.diff} title="Diff" collapsible />
          )}
          {review.variants && review.variants.length>0 ? (
            <div>
              <h4 style={{ fontSize:13, margin:"0 0 8px" }}>Variants — formatted preview</h4>
              <VariantsGrid variants={review.variants} />
            </div>
          ) : (
            <div style={{ fontSize:12, opacity:0.6 }}>No variants in review bundle yet.</div>
          )}
          <details style={{ background:"#111", padding:10, borderRadius:8 }}>
            <summary style={{ cursor:"pointer", fontSize:12, color:"#8FA0B8" }}>Raw review JSON (collapsed)</summary>
            <pre style={{ fontSize: 11, overflow: "auto", whiteSpace:"pre-wrap", wordBreak:"break-word", marginTop:8 }}>{JSON.stringify(review, null, 2)}</pre>
          </details>
        </div>
      )}

      {/* Edit section — below Review bundle */}
      {review && (review.latest_version || review.latest) && (
        <div style={{ marginTop: 16, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 14 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 14, color: "#dbe7ff" }}>Edit</h3>
          <p style={{ fontSize: 11, opacity: 0.6, margin: "0 0 12px", color: "#8FA0B8" }}>Edit the latest version and save as a new version (v{(review.latest_version || review.latest)?.version_no ?? "?" } → v{((review.latest_version || review.latest)?.version_no ?? 0) + 1}). Status will reset to <code style={{ background:"#0b111a", padding:"1px 6px", borderRadius:4, border:"1px solid #1e2f44" }}>review_ready</code>.</p>
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ fontSize: 12, color: "#8FA0B8", display: "grid", gap: 6 }}>Title
              <input
                value={editTitle}
                onChange={e=> setEditTitle(e.target.value)}
                placeholder="Title"
                style={{ background: "#070d16", border: "1px solid #1e2f44", borderRadius: 8, padding: "10px 12px", color: "#dbe7ff", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" }}
              />
            </label>
            <label style={{ fontSize: 12, color: "#8FA0B8", display: "grid", gap: 6 }}>Body markdown
              <textarea
                value={editBody}
                onChange={e=> setEditBody(e.target.value)}
                placeholder="Body markdown…"
                rows={14}
                style={{ background: "#070d16", border: "1px solid #1e2f44", borderRadius: 8, padding: "10px 12px", color: "#dbe7ff", fontSize: 12, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", outline: "none", width: "100%", boxSizing: "border-box", resize: "vertical", lineHeight: 1.5 }}
              />
            </label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={doSaveVersion} disabled={editSaving} style={{ background: editSaving ? "#2a4a7a" : "#3D8DFF", border: "1px solid #3D8DFF", color: "#fff", borderRadius: 8, padding: "8px 16px", fontWeight: 700, fontSize: 13, cursor: editSaving ? "not-allowed" : "pointer", opacity: editSaving ? 0.7 : 1 }}> {editSaving ? "Saving…" : "Save new version"}</button>
              <button onClick={() => { const latest=(review.latest_version||review.latest); if(latest){ setEditTitle(latest.title||""); setEditBody(latest.body_markdown||""); } setEditErr(null); setEditOk(null); }} style={{ ...btn, padding:"8px 12px", fontSize:12, background:"#0b111a", borderColor:"#1e2f44" }}>Reset</button>
              {editOk && <span style={{ fontSize: 12, color: "#6fdc8c" }}>{editOk}</span>}
              {editErr && <span style={{ fontSize: 12, color: "#ff8a8a", wordBreak:"break-word" }}>{editErr}</span>}
            </div>
            <div style={{ fontSize: 11, color: "#5a6d8a" }}>{editBody.length} chars — will create version_no = max+1 with is_approved=0</div>
          </div>
        </div>
      )}
      {review && !(review.latest_version || review.latest) && (
        <div style={{ marginTop: 16, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 14 }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 14, color: "#dbe7ff" }}>Edit</h3>
          <p style={{ fontSize: 11, opacity: 0.6, color: "#8FA0B8" }}>No versions yet — generate first, then you can edit the latest version here. Saving creates a new version and resets status to <code>review_ready</code>.</p>
        </div>
      )}

      {/* Publications section */}
      <div style={{ marginTop: 24, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 14 }}>Publications</h3>
          <button onClick={fetchPublications} disabled={pubLoading} style={{ ...btn, padding: "6px 10px", fontSize: 12, opacity: pubLoading ? 0.6 : 1 }}>{pubLoading ? "Loading…" : "Refresh"}</button>
        </div>
        {pubErr && <div style={{ marginTop: 8, color: "#ff8a8a", fontSize: 12 }}>{pubErr}</div>}
        {pubLoading && publications.length === 0 ? (
          <div style={{ marginTop: 10 }}><Skeleton style={{ height: 60 }} /></div>
        ) : publications.length === 0 ? (
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.6 }}>No publications yet. Approve the item and click Publish.</div>
        ) : (
          <div style={{ marginTop: 12, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #1e2f44", color: "#8FA0B8" }}>
                  <th style={{ padding: "6px 8px" }}>ID</th>
                  <th style={{ padding: "6px 8px" }}>Adapter / Channel</th>
                  <th style={{ padding: "6px 8px" }}>Status</th>
                  <th style={{ padding: "6px 8px" }}>External</th>
                  <th style={{ padding: "6px 8px" }}>Published at</th>
                </tr>
              </thead>
              <tbody>
                {publications.map((p: any) => (
                  <tr key={p.id} style={{ borderBottom: "1px solid #0b111a" }}>
                    <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 11, wordBreak: "break-all" }}>{p.id.slice(0, 8)}…<span style={{ opacity: 0.5 }}>{p.id.slice(8, 12)}</span></td>
                    <td style={{ padding: "8px" }}>{p.adapter || p.channel || p.type || "—"}{p.channel_variant_id ? <span style={{ opacity: 0.5, fontSize: 10, display: "block" }}>{p.channel_variant_id.slice(0, 8)}…</span> : null}</td>
                    <td style={{ padding: "8px" }}><span style={{ background: p.status === "published" ? "#0e2e1a" : p.status === "failed" ? "#33151a" : "#1a2740", border: `1px solid ${p.status === "published" ? "#1f4a2b" : p.status === "failed" ? "#5a2a33" : "#2a3a52"}`, color: p.status === "published" ? "#6fdc8c" : p.status === "failed" ? "#ff8a8a" : "#8cb4ff", borderRadius: 20, padding: "2px 8px", fontSize: 11 }}>{p.status || "—"}</span></td>
                    <td style={{ padding: "8px", maxWidth: 260 }}>
                      {p.external_id && <code style={{ background: "#0b111a", padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>{p.external_id}</code>}
                      {p.url && <div><a href={p.url} target="_blank" rel="noreferrer" style={{ color: "#7eb8ff", fontSize: 11, wordBreak: "break-all" }}>{p.url}</a></div>}
                      {!p.external_id && !p.url && <span style={{ opacity: 0.5 }}>—</span>}
                      {p.idempotency_key && <div style={{ fontSize: 10, opacity: 0.4, wordBreak: "break-all", marginTop: 2 }}>{p.idempotency_key}</div>}
                    </td>
                    <td style={{ padding: "8px", fontSize: 11, opacity: 0.7, whiteSpace: "nowrap" }}>{p.published_at ? new Date(p.published_at).toLocaleString() : p.created_at ? new Date(p.created_at).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* metric forms per publication */}
            <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
              {publications.map((p: any) => {
                const form = metricForms[p.id] || { views: "", reactions: "", comments: "", err: null, ok: null, saving: false };
                const snaps = metricsByPub[p.id] || [];
                return (
                  <div key={`metrics-${p.id}`} style={{ background: "#0b111a", border: "1px solid #1e2f44", borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <h4 style={{ margin: 0, fontSize: 12 }}>Metrics — {p.adapter || p.id.slice(0, 8)}</h4>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => fetchMetricsForPub(p.id)} style={{ ...btn, padding: "4px 8px", fontSize: 11, background: "#111a2a" }}>Refresh</button>
                        <button onClick={() => collectMetrics(p.id)} disabled={(collectByPub[p.id]?.saving)} style={{ ...btn, padding: "4px 10px", fontSize: 11, background: "#3D8DFF", borderColor: "#3D8DFF", color: "#fff", opacity: (collectByPub[p.id]?.saving) ? 0.6 : 1 }}>{(collectByPub[p.id]?.saving) ? "Collecting…" : "Collect metrics now"}</button>
                      </div>
                    </div>
                    {(collectByPub[p.id]?.ok || collectByPub[p.id]?.err) && (
                      <div style={{ marginTop: 8, fontSize: 11, padding: "6px 8px", borderRadius: 6, background: collectByPub[p.id]?.err ? "rgba(255,60,60,.12)" : "rgba(110,220,140,.12)", border: `1px solid ${collectByPub[p.id]?.err ? "rgba(255,60,60,.3)" : "rgba(110,220,140,.3)"}`, color: collectByPub[p.id]?.err ? "#ff8a8a" : "#6fdc8c" }}>
                        {collectByPub[p.id]?.err ? collectByPub[p.id]?.err : collectByPub[p.id]?.ok}
                      </div>
                    )}
                    {collectByPub[p.id]?.last && (
                      <div style={{ marginTop: 8, background: "#0f1620", border: "1px solid #2a6a3a", borderRadius: 8, padding: 8, fontSize: 11 }}>
                        <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4, color: "#6fdc8c" }}>Collected snapshot</div>
                        <div style={{ fontSize: 10, opacity: 0.6 }}>{collectByPub[p.id]?.last.captured_at ? new Date(collectByPub[p.id].last.captured_at).toLocaleString() : collectByPub[p.id].last.created_at ? new Date(collectByPub[p.id].last.created_at).toLocaleString() : ""} — ID {(collectByPub[p.id].last.id||"").slice(0,8)}…</div>
                        <pre style={{ marginTop: 6, background: "#070d16", padding: 8, borderRadius: 6, overflow: "auto", fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{JSON.stringify(collectByPub[p.id].last.metrics || collectByPub[p.id].last, null, 2)}</pre>
                      </div>
                    )}

                    {snaps.length > 0 ? (
                      <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                        {snaps.map((s: any) => {
                          const ms = getMilestone(s);
                          return (
                          <div key={s.id || s.captured_at || Math.random()} style={{ background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 8, padding: 8, fontSize: 11 }}>
                            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", opacity: 0.95 }}>
                              <span style={milestoneStyle(ms)}>{ms}</span>
                              <span>ID: {(s.id || "").slice(0, 8)}…</span>
                              <span>captured: {s.captured_at ? new Date(s.captured_at).toLocaleString() : s.created_at ? new Date(s.created_at).toLocaleString() : "—"}</span>
                            </div>
                            <pre style={{ marginTop: 6, background: "#070d16", padding: 8, borderRadius: 6, overflow: "auto", fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{JSON.stringify(s.metrics || s, null, 2)}</pre>
                          </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ marginTop: 8, fontSize: 11, opacity: 0.5 }}>No metric snapshots yet.</div>
                    )}

                    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <label style={{ fontSize: 11, opacity: 0.8 }}>Views<input value={form.views} onChange={e => setMetricForms(prev => ({ ...prev, [p.id]: { ...form, views: e.target.value } }))} placeholder="e.g. 1234" style={inputStyle} /></label>
                        <label style={{ fontSize: 11, opacity: 0.8 }}>Comments<input value={form.comments} onChange={e => setMetricForms(prev => ({ ...prev, [p.id]: { ...form, comments: e.target.value } }))} placeholder="e.g. 12" style={inputStyle} /></label>
                      </div>
                      <label style={{ fontSize: 11, opacity: 0.8 }}>Reactions (JSON)<textarea value={form.reactions} onChange={e => setMetricForms(prev => ({ ...prev, [p.id]: { ...form, reactions: e.target.value } }))} placeholder='e.g. {"like":10,"share":2} or 42' rows={2} style={{ ...inputStyle, resize: "vertical" }} /></label>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <button onClick={() => submitMetrics(p.id)} disabled={form.saving} style={{ ...btn, background: "#3D8DFF", borderColor: "#3D8DFF", color: "#fff", opacity: form.saving ? 0.6 : 1, padding: "6px 12px", fontSize: 12 }}>{form.saving ? "Saving…" : "Save metrics"}</button>
                        <button onClick={() => collectMetrics(p.id)} disabled={!!collectByPub[p.id]?.saving} style={{ ...btn, background: "#0b111a", borderColor: "#1e2f44", color: "#7eb8ff", padding: "6px 12px", fontSize: 12, opacity: collectByPub[p.id]?.saving ? 0.6 : 1 }}>{collectByPub[p.id]?.saving ? "Collecting…" : "Collect metrics now"}</button>
                        {form.ok && <span style={{ fontSize: 11, color: "#6fdc8c" }}>{form.ok}</span>}
                        {form.err && <span style={{ fontSize: 11, color: "#ff8a8a" }}>{form.err}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Reflections section */}
      <div style={{ marginTop: 24, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 14 }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Reflections</h3>
        <p style={{ fontSize: 11, opacity: 0.6, margin: "0 0 10px" }}>Abstract reflection for the item. Capture observation, confidence and next test. Linked to metrics above.</p>

        {reflections.length > 0 && (
          <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
            {reflections.map((r: any) => {
              const st = r.id ? nextIdea[r.id] : undefined;
              const created = st?.ok;
              const newId = created?.id || created?.content_item_id || created?.item_id;
              return (
              <div key={r.id || r.created_at} style={{ background: "#0b111a", border: "1px solid #1e2f44", borderRadius: 8, padding: 10, fontSize: 12 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ background: "#1a2740", border: "1px solid #2a3a52", borderRadius: 6, padding: "2px 8px", fontSize: 11 }}>confidence: {r.confidence || "—"}</span>
                  <span style={{ fontSize: 10, opacity: 0.5 }}>{r.created_at ? new Date(r.created_at).toLocaleString() : ""}</span>
                  {r.id && <span style={{ fontSize: 10, opacity: 0.4, fontFamily: "monospace" }}>{r.id.slice(0, 8)}…</span>}
                </div>
                <div style={{ marginTop: 6 }}><strong>Observation:</strong> {r.observation}</div>
                {r.possible_causes && <div style={{ marginTop: 4, fontSize: 11, opacity: 0.8 }}><strong>Possible causes:</strong> {Array.isArray(r.possible_causes) ? r.possible_causes.join(", ") : typeof r.possible_causes === "string" ? r.possible_causes : JSON.stringify(r.possible_causes)}</div>}
                {r.next_test && <div style={{ marginTop: 4, fontSize: 11 }}><strong>Next test:</strong> {r.next_test}</div>}
                {r.do_not_conclude && <div style={{ marginTop: 4, fontSize: 11, color: "#ffcf66" }}><strong>Do not conclude:</strong> {r.do_not_conclude}</div>}
                <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button onClick={() => createNextIdeaFromReflection(r)} disabled={!!st?.loading} style={{ background: st?.loading ? "#4c2a8a" : "linear-gradient(135deg,#7c3aed,#a78bfa)", border: "1px solid #8b5cf6", color: "#fff", borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 12, cursor: st?.loading ? "wait" : "pointer", opacity: st?.loading ? 0.7 : 1, boxShadow: "0 2px 10px rgba(124,58,237,.35)" }}>{st?.loading ? "Creating…" : "Create next idea from this reflection"}</button>
                  {st?.err && <span style={{ fontSize: 11, color: "#ff8a8a" }}>{st.err}</span>}
                  {created && newId && <a href={`/items/${newId}`} style={{ fontSize: 11, color: "#c4b5fd", background: "rgba(124,58,237,.15)", border: "1px solid rgba(124,58,237,.4)", borderRadius: 6, padding: "4px 8px", textDecoration: "none" }}>View new idea → {String(newId).slice(0, 8)}…</a>}
                  {created && !newId && <span style={{ fontSize: 11, color: "#6fdc8c" }}>Created ✓ — {JSON.stringify(created).slice(0, 80)}</span>}
                </div>
              </div>
              );
            })}
          </div>
        )}
        {reflections.length === 0 && <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 12 }}>No reflections yet.</div>}
        {/* global create next idea - purple accent */}
        {reflections.length > 0 && (
          <div style={{ marginBottom: 14, background: "rgba(124,58,237,.08)", border: "1px solid rgba(124,58,237,.30)", borderRadius: 10, padding: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => {
                const latest = reflections[0] || reflections[reflections.length - 1];
                if (latest) createNextIdeaFromReflection(latest, { global: true });
              }}
              disabled={!!globalNextIdea.loading || reflections.length === 0}
              style={{ background: globalNextIdea.loading ? "#4c2a8a" : "linear-gradient(135deg,#7c3aed,#a78bfa)", border: "1px solid #8b5cf6", color: "#fff", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 12, cursor: globalNextIdea.loading ? "wait" : "pointer", opacity: globalNextIdea.loading ? 0.7 : 1, boxShadow: "0 2px 10px rgba(124,58,237,.35)" }}
            >{globalNextIdea.loading ? "Creating…" : "Create next idea from this reflection"} <span style={{ opacity: 0.8, fontWeight: 400 }}>(latest)</span></button>
            <span style={{ fontSize: 11, opacity: 0.6 }}>Closes the loop — creates idea from latest reflection (title = next_test or observation, brief contains from_reflection_id)</span>
            {globalNextIdea.err && <span style={{ fontSize: 11, color: "#ff8a8a" }}>{globalNextIdea.err}</span>}
            {globalNextIdea.ok && (() => { const nid = (globalNextIdea.ok as any)?.id || (globalNextIdea.ok as any)?.content_item_id; return nid ? <a href={`/items/${nid}`} style={{ fontSize: 11, color: "#c4b5fd", background: "rgba(124,58,237,.15)", border: "1px solid rgba(124,58,237,.4)", borderRadius: 6, padding: "4px 8px", textDecoration: "none" }}>View new idea → {String(nid).slice(0, 8)}…</a> : <span style={{ fontSize: 11, color: "#6fdc8c" }}>Created ✓</span>; })()}
          </div>
        )}

        <div style={{ display: "grid", gap: 10, background: "#0b111a", border: "1px solid #1e2f44", borderRadius: 10, padding: 12 }}>
          <label style={{ fontSize: 11, opacity: 0.9, display: "grid", gap: 4 }}>Observation *<textarea value={reflForm.observation} onChange={e => setReflForm(prev => ({ ...prev, observation: e.target.value }))} placeholder="What did you observe from metrics?" rows={3} style={{ ...inputStyle, resize: "vertical" }} /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ fontSize: 11, display: "grid", gap: 4 }}>Confidence
              <select value={reflForm.confidence} onChange={e => setReflForm(prev => ({ ...prev, confidence: e.target.value }))} style={inputStyle}>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </label>
            <label style={{ fontSize: 11, display: "grid", gap: 4 }}>Possible causes (comma-separated or JSON)
              <input value={reflForm.possible_causes} onChange={e => setReflForm(prev => ({ ...prev, possible_causes: e.target.value }))} placeholder="e.g. hook, timing, format" style={inputStyle} />
            </label>
          </div>
          <label style={{ fontSize: 11, display: "grid", gap: 4 }}>Next test<input value={reflForm.next_test} onChange={e => setReflForm(prev => ({ ...prev, next_test: e.target.value }))} placeholder="Hypothesis to test next" style={inputStyle} /></label>
          <label style={{ fontSize: 11, display: "grid", gap: 4 }}>Do not conclude<input value={reflForm.do_not_conclude} onChange={e => setReflForm(prev => ({ ...prev, do_not_conclude: e.target.value }))} placeholder="What not to infer yet" style={inputStyle} /></label>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={submitReflection} disabled={reflSaving} style={{ ...btn, background: "#3D8DFF", borderColor: "#3D8DFF", color: "#fff", opacity: reflSaving ? 0.6 : 1 }}>{reflSaving ? "Saving…" : "Add reflection"}</button>
            <button onClick={fetchReflections} style={{ ...btn, padding: "6px 10px", fontSize: 12, background: "#111a2a" }}>Refresh</button>
            {reflOk && <span style={{ fontSize: 11, color: "#6fdc8c" }}>{reflOk}</span>}
            {reflErr && <span style={{ fontSize: 11, color: "#ff8a8a", wordBreak: "break-word" }}>{reflErr}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
const btn: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid #333", background: "#1a1a1a", color: "#eee", cursor: "pointer" };
const inputStyle: React.CSSProperties = { background: "#070d16", border: "1px solid #1e2f44", borderRadius: 8, padding: "8px 10px", color: "#dbe7ff", fontSize: 12, outline: "none", width: "100%", boxSizing: "border-box" };
