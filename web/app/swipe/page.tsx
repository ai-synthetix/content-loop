"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getToken, authHeaders, apiUrl, clearToken } from "../../lib/auth";
import { useActiveProject } from "../../lib/activeProject";

type SwipeOption = {
  id: string;
  text: string;
  score?: number;
  voted?: boolean;
};

type Batch = {
  id: string;
  layer?: string;
  status?: string;
  round?: number;
};

export default function SwipePage() {
  const router = useRouter();
  const { activeId } = useActiveProject();

  const [mode, setMode] = useState<"vs" | "like">("vs");
  const [batch, setBatch] = useState<Batch | null>(null);
  const [options, setOptions] = useState<SwipeOption[]>([]);
  const [votedIds, setVotedIds] = useState<string[]>([]);
  const [pair, setPair] = useState<[string, string] | null>(null);
  const [likeIndex, setLikeIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [assembling, setAssembling] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [assembledCount, setAssembledCount] = useState<number | null>(null);
  const [nextLoading, setNextLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function on401() {
    clearToken();
    router.replace("/login");
  }

  const pickPair = useCallback((opts: SwipeOption[], voted: string[]) => {
    const rest = opts.filter((o) => !voted.includes(o.id));
    if (rest.length < 2) {
      setPair(null);
      return;
    }
    const shuffled = [...rest].sort(() => Math.random() - 0.5);
    setPair([shuffled[0].id, shuffled[1].id]);
  }, []);

  const fetchBatch = useCallback(async () => {
    if (!activeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const t = getToken();
      if (!t) {
        on401();
        return;
      }
      const r = await fetch(
        apiUrl(`/api/v1/projects/${activeId}/swipe-batches?status=open`),
        { headers: { ...authHeaders() } }
      );
      if (r.status === 401) {
        on401();
        return;
      }
      if (!r.ok) throw new Error(`batch ${r.status}`);
      const d = await r.json().catch(() => ({}));
      const b: Batch | null = d.batch ?? null;
      const opts: SwipeOption[] = d.options ?? [];
      setBatch(b);
      setOptions(Array.isArray(opts) ? opts : []);
      const preVoted: string[] = Array.isArray(opts)
        ? opts.filter((o) => o.voted).map((o) => o.id)
        : [];
      setVotedIds(preVoted);
      setCreatedId(null);
      setAssembledCount(null);
      setCheckedIds([]);
      setToast(null);
      setLikeIndex(0);
      if (b && opts.length >= 2) pickPair(opts, preVoted);
      else setPair(null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useEffect(() => {
    fetchBatch();
  }, [fetchBatch]);

  async function generate() {
    if (!activeId) return;
    setActing(true);
    setErr(null);
    try {
      const t = getToken();
      if (!t) {
        on401();
        return;
      }
      const r = await fetch(apiUrl(`/api/v1/projects/${activeId}/swipe-batches`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ layer: "hook", count: 5 }),
      });
      if (r.status === 401) {
        on401();
        return;
      }
      if (!r.ok) throw new Error(`generate ${r.status}`);
      const d = await r.json().catch(() => ({}));
      const b: Batch | null = d.batch ?? null;
      const opts: SwipeOption[] = d.options ?? [];
      if (b) {
        setBatch(b);
        setOptions(Array.isArray(opts) ? opts : []);
        setVotedIds([]);
        setCreatedId(null);
        setAssembledCount(null);
        setCheckedIds([]);
        setToast(null);
        setLikeIndex(0);
        if (opts.length >= 2) pickPair(opts, []);
      } else {
        await fetchBatch();
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(false);
    }
  }

  async function voteVs(winnerId: string, loserId: string) {
    if (!batch || acting) return;
    setActing(true);
    try {
      const r = await fetch(apiUrl(`/api/v1/swipe-batches/${batch.id}/vote`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ mode: "vs", winner_id: winnerId, loser_id: loserId }),
      });
      if (r.status === 401) {
        on401();
        return;
      }
      if (!r.ok) throw new Error(`vote ${r.status}`);
      const next = [...votedIds, winnerId, loserId];
      setVotedIds(next);
      pickPair(options, next);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(false);
    }
  }

  async function voteLike(optionId: string, decision: "like" | "dislike" | "skip") {
    if (!batch || acting) return;
    setActing(true);
    try {
      const r = await fetch(apiUrl(`/api/v1/swipe-batches/${batch.id}/vote`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ mode: "like", option_id: optionId, decision }),
      });
      if (r.status === 401) {
        on401();
        return;
      }
      if (!r.ok) throw new Error(`vote ${r.status}`);
      const next = [...votedIds, optionId];
      setVotedIds(next);
      setLikeIndex((i) => i + 1);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setActing(false);
    }
  }

  async function assemble() {
    if (!batch || checkedIds.length === 0) return;
    setAssembling(true);
    setErr(null);
    try {
      const r = await fetch(apiUrl(`/api/v1/swipe-batches/${batch.id}/assemble`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ option_ids: checkedIds }),
      });
      if (r.status === 401) {
        on401();
        return;
      }
      if (!r.ok) throw new Error(`assemble ${r.status}`);
      const d = await r.json().catch(() => ({}));
      const items = Array.isArray(d.items) ? d.items : d.item ? [d.item] : [];
      setAssembledCount(d.count ?? items.length);
      const id: string | undefined = d.item?.id ?? items[0]?.id;
      if (id) setCreatedId(id);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAssembling(false);
    }
  }

  async function nextRound() {
    if (!batch || nextLoading) return;
    setNextLoading(true);
    setErr(null);
    try {
      const r = await fetch(apiUrl(`/api/v1/swipe-batches/${batch.id}/next-round`), {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ count: 5 }),
      });
      if (r.status === 401) {
        on401();
        return;
      }
      if (!r.ok) throw new Error(`next-round ${r.status}`);
      const d = await r.json().catch(() => ({}));
      const b: Batch | null = d.batch ?? null;
      const opts: SwipeOption[] = d.options ?? [];
      if (b) {
        setBatch(b);
        setOptions(Array.isArray(opts) ? opts : []);
        setVotedIds([]);
        setCheckedIds([]);
        setCreatedId(null);
        setAssembledCount(null);
        setLikeIndex(0);
        if (opts.length >= 2) pickPair(opts, []);
        else setPair(null);
        const n = b.round ?? d.round ?? 1;
        setToast(`Раунд ${n}: эволюция от победителей`);
      } else {
        await fetchBatch();
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setNextLoading(false);
    }
  }

  const votedCount = votedIds.length;
  const total = options.length;
  const done = total > 0 && votedCount >= total;

  const ranked: SwipeOption[] = useMemo(() => {
    return [...options].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }, [options]);

  const winner: SwipeOption | null = ranked.length ? ranked[0] : null;

  const roundNum = batch?.round ?? 1;

  useEffect(() => {
    if (done && ranked.length && checkedIds.length === 0 && assembledCount === null) {
      setCheckedIds(ranked.slice(0, 3).map((o) => o.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  const pairOptions: [SwipeOption, SwipeOption] | null = useMemo(() => {
    if (!pair) return null;
    const a = options.find((o) => o.id === pair[0]);
    const b = options.find((o) => o.id === pair[1]);
    if (!a || !b) return null;
    return [a, b];
  }, [pair, options]);

  const likeOption: SwipeOption | null = useMemo(() => {
    const rest = options.filter((o) => !votedIds.includes(o.id));
    if (!rest.length) return null;
    return rest[Math.min(likeIndex, rest.length - 1)] ?? rest[0];
  }, [options, votedIds, likeIndex]);

  if (!activeId) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Свайп</h1>
        <p>Выберите активный проект.</p>
        <Link href="/queue">К очереди</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Свайп</h1>
        <p>Загрузка…</p>
      </div>
    );
  }

  if (err) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Свайп</h1>
        <p style={{ color: "red" }}>{err}</p>
        <button onClick={fetchBatch}>Повторить</button>
      </div>
    );
  }

  if (!batch || !options.length) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Свайп</h1>
        <p>Нет хуков</p>
        <button onClick={generate} disabled={acting}>
          {acting ? "Генерация…" : "Сгенерировать 5 хуков"}
        </button>{" "}
        <Link href="/queue">К очереди</Link>
      </div>
    );
  }

  if (done && winner) {
    return (
      <div style={{ padding: 24 }}>
        <h1>Свайп</h1>
        <span
          style={{
            display: "inline-block",
            background: "#162a44",
            border: "1px solid #2a5a8a",
            color: "#8fb8ff",
            borderRadius: 20,
            padding: "2px 10px",
            fontSize: 12,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          Раунд {roundNum}
        </span>
        {toast && (
          <div
            style={{
              background: "rgba(61,255,120,.12)",
              border: "1px solid rgba(61,255,120,.3)",
              color: "#6fdc8c",
              padding: "8px 10px",
              borderRadius: 10,
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            {toast}
          </div>
        )}
        <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          {ranked.map((o, i) => (
            <label
              key={o.id}
              style={{
                display: "flex",
                gap: 10,
                alignItems: "flex-start",
                border: "1px solid #ccc",
                borderRadius: 8,
                padding: 12,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={checkedIds.includes(o.id)}
                onChange={() =>
                  setCheckedIds((prev) =>
                    prev.includes(o.id)
                      ? prev.filter((id) => id !== o.id)
                      : [...prev, o.id]
                  )
                }
              />
              <span>
                <strong>
                  #{i + 1} {i === 0 ? "🏆" : ""}
                </strong>{" "}
                {o.text}{" "}
                <span style={{ opacity: 0.55, fontSize: 12 }}>
                  (score {o.score ?? 0})
                </span>
              </span>
            </label>
          ))}
        </div>
        {assembledCount !== null ? (
          <div style={{ marginBottom: 12 }}>
            Создано в очереди: {assembledCount} —{" "}
            <Link href="/queue">Открыть очередь →</Link>
          </div>
        ) : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={assemble}
            disabled={assembling || checkedIds.length === 0}
          >
            {assembling ? "Сборка…" : `В очередь (${checkedIds.length})`}
          </button>
          <button onClick={nextRound} disabled={nextLoading}>
            {nextLoading ? "Эволюция…" : "Следующий раунд"}
          </button>
        </div>{" "}
        <Link href="/queue">К очереди</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Свайп</h1>
      <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span
          style={{
            display: "inline-block",
            background: "#162a44",
            border: "1px solid #2a5a8a",
            color: "#8fb8ff",
            borderRadius: 20,
            padding: "2px 10px",
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          Раунд {roundNum}
        </span>
        {toast && <span style={{ fontSize: 12, color: "#6fdc8c" }}>{toast}</span>}
      </div>
      <div style={{ marginBottom: 12 }}>
        <button
          onClick={() => setMode("vs")}
          disabled={mode === "vs"}
          style={{ marginRight: 8 }}
        >
          VS
        </button>
        <button onClick={() => setMode("like")} disabled={mode === "like"}>
          Лайк
        </button>
        <span style={{ marginLeft: 16 }}>
          проголосовано {votedCount}/{total}
        </span>
      </div>

      {mode === "vs" ? (
        pairOptions ? (
          <div style={{ display: "flex", gap: 12 }}>
            {pairOptions.map((o) => (
              <button
                key={o.id}
                onClick={() =>
                  voteVs(o.id, pairOptions.find((x) => x.id !== o.id)!.id)
                }
                disabled={acting}
                style={{
                  flex: 1,
                  padding: 20,
                  border: "1px solid #ccc",
                  borderRadius: 8,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                {o.text}
              </button>
            ))}
          </div>
        ) : (
          <p>Нет пары для голосования.</p>
        )
      ) : likeOption ? (
        <div>
          <div
            style={{
              border: "1px solid #ccc",
              borderRadius: 8,
              padding: 20,
              marginBottom: 12,
            }}
          >
            {likeOption.text}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => voteLike(likeOption.id, "like")}
              disabled={acting}
            >
              👍
            </button>
            <button
              onClick={() => voteLike(likeOption.id, "dislike")}
              disabled={acting}
            >
              👎
            </button>
            <button
              onClick={() => voteLike(likeOption.id, "skip")}
              disabled={acting}
            >
              skip
            </button>
          </div>
        </div>
      ) : (
        <p>Нет карточек.</p>
      )}
      <div style={{ marginTop: 16 }}>
        <Link href="/queue">К очереди</Link>
      </div>
    </div>
  );
}
