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
    if (!batch) return;
    setAssembling(true);
    setErr(null);
    try {
      const r = await fetch(apiUrl(`/api/v1/swipe-batches/${batch.id}/assemble`), {
        method: "POST",
        headers: { ...authHeaders() },
      });
      if (r.status === 401) {
        on401();
        return;
      }
      if (!r.ok) throw new Error(`assemble ${r.status}`);
      const d = await r.json().catch(() => ({}));
      const id: string | undefined = d.item?.id;
      if (id) setCreatedId(id);
      else router.push("/queue");
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAssembling(false);
    }
  }

  const votedCount = votedIds.length;
  const total = options.length;
  const done = total > 0 && votedCount >= total;

  const winner: SwipeOption | null = useMemo(() => {
    if (!options.length) return null;
    const ranked = [...options].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return ranked[0];
  }, [options]);

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
        <div
          style={{
            border: "1px solid #ccc",
            borderRadius: 8,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <strong>Победитель:</strong>
          <p>{winner.text}</p>
        </div>
        {createdId ? (
          <Link href={`/items/${createdId}`}>Открыть черновик</Link>
        ) : (
          <button onClick={assemble} disabled={assembling}>
            {assembling ? "Сборка…" : "Собрать черновик"}
          </button>
        )}{" "}
        <Link href="/queue">К очереди</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Свайп</h1>
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
