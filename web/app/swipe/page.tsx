"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getToken, authHeaders, apiUrl, clearToken } from "../../lib/auth";
import { StatusBadge } from "../../components/StatusBadge";
import { Skeleton } from "../../components/Skeleton";

type Item = {
  id: string;
  title?: string;
  slug?: string;
  status?: string;
  project_id?: string;
  brief?: unknown;
  created_at?: string;
  excerpt?: string | null;
  body_markdown?: string | null;
};
type Project = { id: string; name?: string; slug?: string };

function briefExcerpt(item: Item): string | null {
  if ((item as any).excerpt) return String((item as any).excerpt).slice(0, 220);
  const b: any = (item as any).brief;
  if (!b) return null;
  if (typeof b === "string") return b.slice(0, 220);
  if (typeof b === "object") {
    if (b.raw && typeof b.raw === "string") return b.raw.slice(0, 220);
    if (b.text && typeof b.text === "string") return b.text.slice(0, 220);
    try {
      const s = JSON.stringify(b);
      if (s.length < 300) return s.slice(0, 220);
      if (b.title) return String(b.title).slice(0, 220);
    } catch {}
  }
  return null;
}

export default function SwipePage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // filters
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // mode
  const [mode, setMode] = useState<"vs" | "like">("vs");

  // like mode state
  const [likeIndex, setLikeIndex] = useState(0);

  // vs mode pair
  const [pair, setPair] = useState<[number, number] | null>(null);

  // animation & feedback
  const [anim, setAnim] = useState<"left" | "right" | "none">("none");
  const [animVs, setAnimVs] = useState<"a" | "b" | "none">("none");
  const [toast, setToast] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [doneCount, setDoneCount] = useState(0);

  function on401() {
    clearToken();
    router.replace("/login");
  }

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const t = getToken();
      if (!t) {
        on401();
        return;
      }
      const [rItems, rProjects] = await Promise.all([
        fetch(apiUrl("/api/v1/content-items/"), { headers: { ...authHeaders() } }),
        fetch(apiUrl("/api/v1/projects/"), { headers: { ...authHeaders() } }),
      ]);
      if (rItems.status === 401 || rProjects.status === 401) {
        on401();
        throw new Error("unauthorized");
      }
      if (!rItems.ok) throw new Error(`items ${rItems.status}`);
      const dItems = await rItems.json().catch(() => ({}));
      const dProjects = await rProjects.json().catch(() => ({}));
      const list: Item[] = dItems.items || (Array.isArray(dItems) ? dItems : []);
      setItems(Array.isArray(list) ? list : []);
      const plist: Project[] = dProjects.items || (Array.isArray(dProjects) ? dProjects : []);
      setProjects(Array.isArray(plist) ? plist : []);
    } catch (e: any) {
      if (e.message !== "unauthorized") setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (filterProject !== "all" && (it as any).project_id !== filterProject) return false;
      if (filterStatus !== "all" && (it.status || "").toLowerCase() !== filterStatus) return false;
      return true;
    });
  }, [items, filterProject, filterStatus]);

  // reset indexes when filter/mode changes
  useEffect(() => {
    setLikeIndex(0);
    setPair(null);
  }, [filterProject, filterStatus, mode]);

  // pick random pair when filtered changes or after action
  useEffect(() => {
    if (mode !== "vs") return;
    if (filtered.length < 2) {
      setPair(null);
      return;
    }
    if (pair === null) {
      // pick 2 distinct random
      const a = Math.floor(Math.random() * filtered.length);
      let b = Math.floor(Math.random() * filtered.length);
      if (b === a) b = (b + 1) % filtered.length;
      setPair([a, b]);
    } else {
      // validate existing pair still in bounds
      const [a, b] = pair;
      if (a >= filtered.length || b >= filtered.length || a === b) {
        const a2 = Math.floor(Math.random() * filtered.length);
        let b2 = Math.floor(Math.random() * filtered.length);
        if (b2 === a2) b2 = (b2 + 1) % filtered.length;
        setPair([a2, b2]);
      }
    }
  }, [filtered.length, mode, pair, filtered]);

  function pickNewPair(excludeIds?: string[]) {
    if (filtered.length < 2) {
      setPair(null);
      return;
    }
    // filter out recently seen? just random
    let attempts = 0;
    while (attempts < 20) {
      const a = Math.floor(Math.random() * filtered.length);
      let b = Math.floor(Math.random() * filtered.length);
      if (b === a) b = (b + 1) % filtered.length;
      const idA = filtered[a]?.id;
      const idB = filtered[b]?.id;
      if (excludeIds && (excludeIds.includes(idA) || excludeIds.includes(idB))) {
        attempts++;
        continue;
      }
      setPair([a, b]);
      return;
    }
    const a = Math.floor(Math.random() * filtered.length);
    let b = Math.floor(Math.random() * filtered.length);
    if (b === a) b = (b + 1) % filtered.length;
    setPair([a, b]);
  }

  async function doApproval(id: string, decision: "approved" | "rejected" | "changes_requested") {
    const r = await fetch(apiUrl(`/api/v1/content-items/${id}/approvals`), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ decision }),
    });
    if (r.status === 401) {
      on401();
      throw new Error("unauthorized");
    }
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || `approval failed ${r.status}`);
    return d;
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }

  // Like/Dislike actions with animation
  async function handleLikeAction(decision: "approved" | "rejected" | "changes_requested") {
    if (acting) return;
    const cur = filtered[likeIndex];
    if (!cur) return;
    const dir: "left" | "right" = decision === "approved" ? "right" : decision === "rejected" ? "left" : "left";
    setAnim(dir);
    setActing(true);
    try {
      await doApproval(cur.id, decision);
      setDoneCount((c) => c + 1);
      // update local status
      setItems((prev) => prev.map((it) => (it.id === cur.id ? { ...it, status: decision } : it)));
      showToast(
        decision === "approved" ? `👍 Approved: ${cur.title || cur.slug}` : decision === "rejected" ? `👎 Rejected: ${cur.title || cur.slug}` : `🔄 Changes requested`
      );
      // advance after animation
      setTimeout(() => {
        setLikeIndex((i) => Math.min(i + 1, filtered.length));
        setAnim("none");
        setActing(false);
      }, 260);
    } catch (e: any) {
      setErr(e.message);
      setAnim("none");
      setActing(false);
    }
  }

  // A vs B : pick winner
  async function handleVsChoose(winnerSide: "a" | "b") {
    if (acting || !pair) return;
    const [ia, ib] = pair;
    const a = filtered[ia];
    const b = filtered[ib];
    if (!a || !b) return;
    const winner = winnerSide === "a" ? a : b;
    const loser = winnerSide === "a" ? b : a;
    setAnimVs(winnerSide);
    setActing(true);
    try {
      // winner approved, loser rejected — sequential
      await doApproval(winner.id, "approved");
      await doApproval(loser.id, "rejected");
      setDoneCount((c) => c + 2);
      setItems((prev) =>
        prev.map((it) => {
          if (it.id === winner.id) return { ...it, status: "approved" };
          if (it.id === loser.id) return { ...it, status: "rejected" };
          return it;
        })
      );
      showToast(`✅ ${winner.title || winner.slug} · ❌ ${loser.title || loser.slug}`);
      setTimeout(() => {
        setAnimVs("none");
        setActing(false);
        // pick new pair excluding those two ids (they will be filtered out if status filter excludes approved/rejected? but we keep showing? we want to skip them.
        // Since we mutated status, filtered will exclude them if status filter is idea/brief_ready etc. So just pick new.
        pickNewPair([winner.id, loser.id]);
      }, 320);
    } catch (e: any) {
      setErr(e.message);
      setAnimVs("none");
      setActing(false);
    }
  }

  async function handleVsSkip() {
    if (!pair) return;
    pickNewPair();
  }

  function projectName(pid?: string) {
    if (!pid) return "—";
    const p = projects.find((pr) => pr.id === pid);
    return p?.name || p?.slug || pid.slice(0, 6);
  }

  const progressPct = filtered.length ? Math.min(100, Math.round((Math.min(likeIndex, filtered.length) / filtered.length) * 100)) : 0;
  const vsProgressPct = filtered.length ? Math.round((doneCount / Math.max(filtered.length, doneCount + filtered.length - doneCount)) * 100) : 0;

  if (loading) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <Skeleton style={{ height: 28, width: 200 }} />
        <Skeleton style={{ height: 44 }} />
        <Skeleton style={{ height: 320 }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto" }}>
      {/* header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 22, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg,#3D8DFF,#6DCBF4)", display: "grid", placeItems: "center", fontSize: 16 }}>⚡</span>
            Swipe
          </h1>
          <p style={{ opacity: 0.6, fontSize: 12, margin: "6px 0 0" }}>
            {mode === "vs" ? "А vs Б — выбери лучший, второй отклонится" : "Лайк/Дизлайк — свайп по одному"}
            <span style={{ opacity: 0.4 }}> · {filtered.length} в выборке · {doneCount} решений</span>
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ display: "flex", background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 3, gap: 3 }}>
            <button
              onClick={() => setMode("vs")}
              style={{
                padding: "8px 14px",
                borderRadius: 9,
                border: "none",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                background: mode === "vs" ? "linear-gradient(135deg,#3D8DFF,#6DCBF4)" : "transparent",
                color: mode === "vs" ? "#fff" : "#8FA0B8",
                boxShadow: mode === "vs" ? "0 2px 10px rgba(61,141,255,.35)" : "none",
              }}
            >
              А vs Б
            </button>
            <button
              onClick={() => setMode("like")}
              style={{
                padding: "8px 14px",
                borderRadius: 9,
                border: "none",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                background: mode === "like" ? "linear-gradient(135deg,#3D8DFF,#6DCBF4)" : "transparent",
                color: mode === "like" ? "#fff" : "#8FA0B8",
                boxShadow: mode === "like" ? "0 2px 10px rgba(61,141,255,.35)" : "none",
              }}
            >
              Лайк / Дизлайк
            </button>
          </div>
        </div>
      </div>

      {/* filters */}
      <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 10, padding: "6px 10px" }}>
          <span style={{ fontSize: 11, color: "#8FA0B8", fontWeight: 600 }}>Project</span>
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            style={{ background: "#0B1420", border: "1px solid #1e2f44", borderRadius: 8, padding: "6px 10px", color: "#eee", fontSize: 12, outline: "none", minWidth: 140 }}
          >
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.slug || p.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 10, padding: "6px 10px" }}>
          <span style={{ fontSize: 11, color: "#8FA0B8", fontWeight: 600 }}>Status</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ background: "#0B1420", border: "1px solid #1e2f44", borderRadius: 8, padding: "6px 10px", color: "#eee", fontSize: 12, outline: "none" }}
          >
            <option value="all">All statuses</option>
            <option value="idea">idea</option>
            <option value="brief_ready">brief_ready</option>
            <option value="drafting">drafting</option>
            <option value="review_ready">review_ready</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
            <option value="changes_requested">changes_requested</option>
          </select>
        </div>
        {(filterProject !== "all" || filterStatus !== "all") && (
          <button
            onClick={() => {
              setFilterProject("all");
              setFilterStatus("all");
            }}
            style={{ background: "#1a2636", border: "1px solid #2a3a52", color: "#8FB8FF", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
          >
            Reset
          </button>
        )}
        <span style={{ fontSize: 11, opacity: 0.45, marginLeft: "auto" }}>
          {filtered.length}/{items.length} shown
        </span>
      </div>

      {/* progress */}
      {mode === "like" ? (
        <div style={{ marginTop: 12, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: "#8FA0B8", fontWeight: 600, whiteSpace: "nowrap" }}>
            {filtered.length ? `${Math.min(likeIndex + 1, filtered.length)}/${filtered.length}` : "0/0"}
          </span>
          <div style={{ flex: 1, height: 6, background: "#0b111a", borderRadius: 99, overflow: "hidden", border: "1px solid #1a2a42" }}>
            <div style={{ width: `${progressPct}%`, height: "100%", background: "linear-gradient(90deg,#3D8DFF,#6DCBF4)", transition: "width .3s" }} />
          </div>
          <span style={{ fontSize: 11, color: "#5a6b86" }}>{progressPct}%</span>
        </div>
      ) : (
        <div style={{ marginTop: 12, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 11, color: "#8FA0B8", fontWeight: 600 }}>{doneCount} решений</span>
          <div style={{ flex: 1, height: 6, background: "#0b111a", borderRadius: 99, overflow: "hidden", border: "1px solid #1a2a42" }}>
            <div style={{ width: `${Math.min(100, vsProgressPct)}%`, height: "100%", background: "linear-gradient(90deg,#3D8DFF,#6DCBF4)", transition: "width .3s" }} />
          </div>
          <button
            onClick={handleVsSkip}
            disabled={acting || filtered.length < 2}
            style={{ background: "#1a2636", border: "1px solid #2a3a52", color: "#cfe0ff", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: acting ? "wait" : "pointer", opacity: acting ? 0.6 : 1 }}
          >
            🔀 Перемешать
          </button>
        </div>
      )}

      {err && (
        <div style={{ marginTop: 12, background: "rgba(255,60,60,.12)", border: "1px solid rgba(255,60,60,.3)", padding: 12, borderRadius: 10, color: "#ff8a8a", fontSize: 12 }}>
          {err} <button onClick={() => setErr(null)} style={{ marginLeft: 8, background: "transparent", border: "1px solid #5a2a33", color: "#ff8a8a", borderRadius: 6, padding: "2px 8px", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", background: "#162a44", border: "1px solid #2a4a7a", color: "#dbe7ff", padding: "10px 16px", borderRadius: 12, fontSize: 13, fontWeight: 600, boxShadow: "0 8px 24px rgba(0,0,0,.4)", zIndex: 50 }}>{toast}</div>
      )}

      {/* empty */}
      {filtered.length === 0 ? (
        <div style={{ marginTop: 16, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 14, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🗂️</div>
          <div style={{ fontSize: 14, color: "#cfe0ff", fontWeight: 700 }}>Нет элементов</div>
          <p style={{ opacity: 0.6, fontSize: 12, margin: "6px auto 14px", maxWidth: 420 }}>По текущим фильтрам ничего не найдено — попробуй сбросить фильтры или добавить новые идеи.</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/queue" style={{ background: "linear-gradient(135deg,#3D8DFF,#6DCBF4)", color: "#fff", borderRadius: 10, padding: "8px 16px", textDecoration: "none", fontWeight: 700, fontSize: 13 }}>→ Queue</Link>
            <button
              onClick={() => {
                setFilterProject("all");
                setFilterStatus("all");
              }}
              style={{ background: "#1a2636", border: "1px solid #2a3a52", color: "#cfe0ff", borderRadius: 10, padding: "8px 16px", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
            >
              Сбросить фильтры
            </button>
          </div>
        </div>
      ) : mode === "like" ? (
        // LIKE / DISLIKE single card
        (() => {
          if (likeIndex >= filtered.length) {
            return (
              <div style={{ marginTop: 16, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 14, padding: 24, textAlign: "center" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>🎉</div>
                <div style={{ fontSize: 14, color: "#cfe0ff", fontWeight: 700 }}>Готово!</div>
                <p style={{ opacity: 0.6, fontSize: 12, margin: "6px 0 14px" }}>Ты просмотрел все {filtered.length} элементов в этой выборке.</p>
                <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                  <button
                    onClick={() => setLikeIndex(0)}
                    style={{ background: "#1a2636", border: "1px solid #2a3a52", color: "#8FB8FF", borderRadius: 10, padding: "8px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}
                  >
                    ↺ Сначала
                  </button>
                  <Link href="/queue" style={{ background: "linear-gradient(135deg,#3D8DFF,#6DCBF4)", color: "#fff", borderRadius: 10, padding: "8px 16px", textDecoration: "none", fontWeight: 700, fontSize: 13 }}>
                    Queue →
                  </Link>
                </div>
              </div>
            );
          }
          const cur = filtered[likeIndex];
          const excerpt = briefExcerpt(cur);
          return (
            <div style={{ marginTop: 16, display: "grid", placeItems: "center" }}>
              <div
                style={{
                  width: "100%",
                  maxWidth: 520,
                  background: "#0f1620",
                  border: "1px solid #1e2f44",
                  borderRadius: 16,
                  padding: 18,
                  boxShadow: "0 8px 24px rgba(0,0,0,.35)",
                  transform: anim === "left" ? "translateX(-40%) rotate(-6deg) scale(0.96)" : anim === "right" ? "translateX(40%) rotate(6deg) scale(0.96)" : "translateX(0) rotate(0) scale(1)",
                  opacity: anim !== "none" ? 0 : 1,
                  transition: "transform .26s ease, opacity .26s ease",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <StatusBadge status={cur.status || ""} size={11} />
                    <span style={{ background: "#162a44", border: "1px solid #1e3a5a", color: "#8fb8ff", borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{projectName((cur as any).project_id)}</span>
                  </div>
                  <span style={{ fontSize: 10, color: "#5a6b86", whiteSpace: "nowrap" }}>{cur.id.slice(0, 8)}…</span>
                </div>
                <Link href={`/items/${cur.id}`} style={{ textDecoration: "none", display: "block", marginTop: 12 }}>
                  <div style={{ color: "#e6f0ff", fontWeight: 800, fontSize: 18, lineHeight: 1.25 }}>{cur.title || "Untitled"}</div>
                  {cur.slug && <div style={{ color: "#5a6b86", fontSize: 11, marginTop: 6, fontFamily: "monospace" }}>/{cur.slug}</div>}
                </Link>
                {excerpt ? (
                  <div style={{ marginTop: 12, background: "#0b111a", border: "1px solid #1a2a42", borderRadius: 10, padding: 10, color: "#8FA0B8", fontSize: 12, lineHeight: 1.5 }}>{excerpt}{excerpt.length >= 220 ? "…" : ""}</div>
                ) : (
                  <div style={{ marginTop: 12, color: "#5a6b86", fontSize: 12, fontStyle: "italic", opacity: 0.7 }}>нет описания — открой карточку</div>
                )}
                <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Link href={`/items/${cur.id}`} style={{ fontSize: 11, color: "#6DCBF4", textDecoration: "none", border: "1px solid #1e3a5a", background: "#0b111a", padding: "4px 8px", borderRadius: 20 }}>open →</Link>
                </div>
              </div>

              <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
                <button
                  onClick={() => handleLikeAction("rejected")}
                  disabled={acting}
                  title="Rejected (←)"
                  style={{ width: 64, height: 64, borderRadius: 999, background: "#33151a", border: "1px solid #5a2a33", color: "#ff8a8a", fontSize: 22, cursor: acting ? "wait" : "pointer", display: "grid", placeItems: "center", boxShadow: "0 4px 16px rgba(0,0,0,.25)", opacity: acting ? 0.6 : 1 }}
                >
                  👎
                </button>
                <button
                  onClick={() => handleLikeAction("changes_requested")}
                  disabled={acting}
                  title="Changes requested"
                  style={{ width: 56, height: 56, borderRadius: 999, background: "#1a2333", border: "1px solid #2a3a52", color: "#ffb86a", fontSize: 18, cursor: acting ? "wait" : "pointer", display: "grid", placeItems: "center", alignSelf: "center", opacity: acting ? 0.6 : 1 }}
                >
                  🔄
                </button>
                <button
                  onClick={() => handleLikeAction("approved")}
                  disabled={acting}
                  title="Approved (→)"
                  style={{ width: 64, height: 64, borderRadius: 999, background: "#0e2e1a", border: "1px solid #1f4a2b", color: "#6fdc8c", fontSize: 22, cursor: acting ? "wait" : "pointer", display: "grid", placeItems: "center", boxShadow: "0 4px 16px rgba(0,0,0,.25)", opacity: acting ? 0.6 : 1 }}
                >
                  👍
                </button>
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, color: "#5a6b86" }}>← 👎 rejected</span>
                <span style={{ opacity: 0.3, fontSize: 11 }}>·</span>
                <span style={{ fontSize: 11, color: "#5a6b86" }}>🔄 changes</span>
                <span style={{ opacity: 0.3, fontSize: 11 }}>·</span>
                <span style={{ fontSize: 11, color: "#5a6b86" }}>approved 👍 →</span>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <button
                  onClick={() => setLikeIndex((i) => Math.min(i + 1, filtered.length))}
                  style={{ background: "transparent", border: "1px solid #1e2f44", color: "#8FA0B8", borderRadius: 8, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
                >
                  Пропустить →
                </button>
                <Link href="/queue" style={{ fontSize: 12, color: "#5a6b86", textDecoration: "none", padding: "6px 8px" }}>
                  Queue
                </Link>
              </div>
            </div>
          );
        })()
      ) : (
        // A vs B
        (() => {
          if (!pair) {
            return (
              <div style={{ marginTop: 16, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 14, padding: 24, textAlign: "center" }}>
                <div style={{ color: "#8FA0B8", fontSize: 12 }}>Нужно минимум 2 элемента — добавь фильтры или создай новые.</div>
                <Link href="/queue" style={{ marginTop: 10, display: "inline-block", color: "#8FB8FF", fontSize: 13, textDecoration: "none" }}>→ Queue</Link>
              </div>
            );
          }
          const [ia, ib] = pair;
          const a = filtered[ia];
          const b = filtered[ib];
          if (!a || !b) return null;
          const cardStyle = (side: "a" | "b"): React.CSSProperties => {
            const isWinnerAnim = animVs === side;
            const isLoserAnim = animVs !== "none" && animVs !== side;
            return {
              background: "#0f1620",
              border: `1px solid ${isWinnerAnim ? "#2a6b3a" : isLoserAnim ? "#5a2a33" : "#1e2f44"}`,
              borderRadius: 16,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              minHeight: 280,
              flex: 1,
              minWidth: 0,
              transform: isWinnerAnim ? "scale(1.02) translateY(-2px)" : isLoserAnim ? "scale(0.97) opacity(0.85)" : "scale(1)",
              opacity: isLoserAnim ? 0.6 : 1,
              boxShadow: isWinnerAnim ? "0 8px 24px rgba(34,197,94,.18)" : "0 8px 24px rgba(0,0,0,.25)",
              transition: "transform .28s ease, opacity .28s ease, border-color .28s ease, box-shadow .28s ease",
            };
          };
          function renderCard(item: Item, side: "a" | "b") {
            const excerpt = briefExcerpt(item);
            return (
              <div style={cardStyle(side)}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 999,
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 800,
                      fontSize: 13,
                      color: "#fff",
                      background: side === "a" ? "linear-gradient(135deg,#3D8DFF,#6DCBF4)" : "linear-gradient(135deg,#ff7a45,#ffbf2e)",
                      flexShrink: 0,
                    }}
                  >
                    {side.toUpperCase()}
                  </span>
                  <StatusBadge status={item.status || ""} size={11} />
                </div>
                <Link href={`/items/${item.id}`} style={{ textDecoration: "none", flex: 1 }}>
                  <div style={{ color: "#e6f0ff", fontWeight: 800, fontSize: 15, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 3 as any, WebkitBoxOrient: "vertical" as any, overflow: "hidden" }}>
                    {item.title || "Untitled"}
                  </div>
                  {item.slug && <div style={{ color: "#5a6b86", fontSize: 10, marginTop: 6, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>/{item.slug}</div>}
                  <div style={{ marginTop: 6, fontSize: 10, color: "#8FA0B8", background: "#162a44", border: "1px solid #1e3a5a", borderRadius: 20, padding: "2px 8px", display: "inline-block", fontWeight: 600 }}>{projectName((item as any).project_id)}</div>
                </Link>
                {excerpt ? (
                  <div style={{ background: "#0b111a", border: "1px solid #1a2a42", borderRadius: 10, padding: 9, color: "#8FA0B8", fontSize: 11, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 4 as any, WebkitBoxOrient: "vertical" as any, overflow: "hidden" }}>
                    {excerpt}{excerpt.length >= 220 ? "…" : ""}
                  </div>
                ) : (
                  <div style={{ color: "#5a6b86", fontSize: 11, fontStyle: "italic", opacity: 0.6 }}>нет описания</div>
                )}
                <button
                  onClick={() => handleVsChoose(side)}
                  disabled={acting}
                  style={{
                    marginTop: "auto",
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "none",
                    background: side === "a" ? "linear-gradient(135deg,#3D8DFF,#6DCBF4)" : "linear-gradient(135deg,#ff7a45,#ffb84d)",
                    color: "#fff",
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: acting ? "wait" : "pointer",
                    opacity: acting ? 0.7 : 1,
                    boxShadow: "0 4px 16px rgba(0,0,0,.25)",
                  }}
                >
                  {side === "a" ? "← Выбрать А" : "Выбрать Б →"}
                </button>
                <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                  <Link href={`/items/${item.id}`} style={{ fontSize: 10, color: "#6DCBF4", textDecoration: "none" }}>open →</Link>
                </div>
              </div>
            );
          }
          return (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "stretch", flexWrap: "wrap" }}>
                {renderCard(a, "a")}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, minWidth: 40 }}>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 999,
                      background: "#1a2636",
                      border: "1px solid #2a3a52",
                      display: "grid",
                      placeItems: "center",
                      color: "#8FB8FF",
                      fontWeight: 800,
                      fontSize: 13,
                    }}
                  >
                    VS
                  </div>
                  <div style={{ fontSize: 10, color: "#5a6b86", fontWeight: 600 }}>А vs Б</div>
                  <div style={{ fontSize: 10, color: "#5a6b86", textAlign: "center" }}>
                    победитель → 👍<br />проигравший → 👎
                  </div>
                </div>
                {renderCard(b, "b")}
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                <button
                  onClick={handleVsSkip}
                  disabled={acting}
                  style={{ background: "#1a2636", border: "1px solid #2a3a52", color: "#8FA0B8", borderRadius: 8, padding: "8px 14px", fontSize: 12, cursor: acting ? "wait" : "pointer" }}
                >
                  Пропустить
                </button>
                <span style={{ fontSize: 11, color: "#5a6b86", padding: "8px 0" }}>выбор: победитель approved, проигравший rejected</span>
              </div>
            </div>
          );
        })()
      )}

      <div style={{ marginTop: 18, display: "flex", gap: 8, justifyContent: "center", fontSize: 11, color: "#5a6b86" }}>
        <Link href="/queue" style={{ color: "#8FB8FF", textDecoration: "none" }}>
          ← Queue
        </Link>
        <span style={{ opacity: 0.3 }}>·</span>
        <Link href="/" style={{ color: "#8FB8FF", textDecoration: "none" }}>
          Dashboard
        </Link>
      </div>
    </div>
  );
}
