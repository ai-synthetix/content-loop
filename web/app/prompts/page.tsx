"use client";
import { useEffect, useState } from "react";
import { apiUrl, authHeaders, getToken } from "../../lib/auth";
import { useRouter } from "next/navigation";

type Prompt = { key: string; label: string; prompt: string };

export default function PromptsPage() {
  const router = useRouter();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [phrases, setPhrases] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    if (!t) { router.replace("/login"); return; }
    fetch(apiUrl("/api/v1/prompts"), { headers: { ...authHeaders() } })
      .then(async r => {
        if (r.status === 401) { router.replace("/login"); throw new Error("unauthorized"); }
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then(d => { setPrompts(d.prompts || []); setPhrases(d.ai_phrases || []); setNote(d.note || ""); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [router]);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 1500); });
  }

  if (loading) return <div style={{ padding: 20, opacity: 0.6 }}>Loading prompts…</div>;
  if (err) return <div style={{ padding: 20, color: "#ff8a8a" }}>Failed: {err}</div>;

  return (
    <div style={{ maxWidth: 980 }}>
      <h1 style={{ fontSize: 22, margin: "0 0 6px", display: "flex", alignItems: "center", gap: 10 }}><span style={{ width: 32, height: 32, borderRadius: 10, background: "linear-gradient(135deg,#3D8DFF,#6DCBF4)", display: "grid", placeItems: "center", fontSize: 16 }}>📝</span>Prompts</h1>
      <p style={{ fontSize: 12, color: "#5a6b86", margin: "0 0 14px" }}>Все захардкоженные промпты проекта — live из бэкенда. Только чтение, дальше вынесем в админку per-project.</p>
      {note && <div style={{ background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 10, padding: "10px 12px", fontSize: 11, color: "#8FA0B8", marginBottom: 14 }}>{note}</div>}

      <div style={{ display: "grid", gap: 14 }}>
        {prompts.map(p => (
          <div key={p.key} style={{ background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#0b1420", borderBottom: "1px solid #1e2f44" }}>
              <div><span style={{ fontSize: 12, fontWeight: 700, color: "#cfe0ff" }}>{p.label}</span> <span style={{ fontSize: 11, color: "#5a6b86", marginLeft: 8 }}>{p.key}</span></div>
              <button onClick={() => copy(p.prompt, p.key)} style={{ background: copied === p.key ? "#1f4a2b" : "#1a2636", border: "1px solid #2a3a52", color: copied === p.key ? "#6fdc8c" : "#8fb8ff", borderRadius: 8, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>{copied === p.key ? "Скопировано" : "Copy"}</button>
            </div>
            <pre style={{ margin: 0, padding: 14, fontSize: 12, lineHeight: 1.6, color: "#dbe7ff", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 380, overflow: "auto" }}>{p.prompt}</pre>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 18, background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#cfe0ff", marginBottom: 8 }}>Blocked AI clichés (CleanAIisms — {phrases.length})</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {phrases.map(ph => <span key={ph} style={{ background: "#1a2636", border: "1px solid #2a3a52", color: "#8FA0B8", borderRadius: 20, padding: "3px 8px", fontSize: 11 }}>{ph}</span>)}
        </div>
        <div style={{ fontSize: 11, color: "#5a6b86", marginTop: 8 }}>Вырезаются из ответа модели пост-обработкой. Дальше расширятся через project.policy.banned_phrases.</div>
      </div>
    </div>
  );
}
