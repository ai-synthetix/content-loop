"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getToken, apiUrl, authHeaders } from "../../../../lib/auth";
import { useActiveProject } from "../../../../lib/activeProject";

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9\u00C0-\u024F\u0400-\u04FF]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "untitled";
}
const inp: React.CSSProperties = { background: "#0B1420", border: "1px solid #1E2F44", borderRadius: 10, padding: "10px 12px", color: "#eee", outline: "none", width: "100%" };
const labelStyle: React.CSSProperties = { fontSize: 12, color: "#8FA0B8", fontWeight: 600 };

export default function NewProjectPage() {
  const router = useRouter();
  const { setActiveId } = useActiveProject();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugDirty, setSlugDirty] = useState(false);
  const [langs, setLangs] = useState("ru, en");
  const [policy, setPolicy] = useState('{\n  "tone": "эксперт-дружелюбный",\n  "banned_phrases": [],\n  "examples": []\n}');
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function onName(v: string) { setName(v); if (!slugDirty) setSlug(slugify(v)); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!name.trim()) { setErr("Название обязательно"); return; }
    const finalSlug = slug.trim() ? slugify(slug) : slugify(name);
    if (!finalSlug || finalSlug.length < 2) { setErr("Slug 2-80 символов, только латиница/цифры/дефис"); return; }
    let langsArr: any = [];
    try {
      const t = langs.trim();
      if (t.startsWith("[")) langsArr = JSON.parse(t);
      else langsArr = t.split(",").map(s => s.trim()).filter(Boolean);
      if (langsArr.length === 0) langsArr = ["ru"];
    } catch { setErr("Языки — через запятую или JSON массив"); return; }
    let policyObj: any = {};
    try { policyObj = policy.trim() ? JSON.parse(policy) : {}; } catch { setErr("Policy — валидный JSON объект"); return; }

    setSaving(true);
    try {
      const token = getToken();
      if (!token) { router.replace("/login"); return; }
      const r = await fetch(apiUrl("/api/v1/projects/"), {
        method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ name: name.trim(), slug: finalSlug, languages: langsArr, channels: [], policy: policyObj }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || `create failed ${r.status}`);
      const id = d.id || d.project?.id;
      if (id) setActiveId(id);
      router.push(id ? `/settings/projects/${id}` : "/settings/projects");
    } catch (ex: any) { setErr(ex.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "#5a6b86", marginBottom: 12 }}>
        <Link href="/settings/projects" style={{ color: "#8fb8ff", textDecoration: "none" }}>← Projects</Link>
        <span style={{ opacity: 0.3 }}>/</span>
        <span style={{ color: "#cfe0ff", fontWeight: 600 }}>Новый проект</span>
      </div>
      <h1 style={{ fontSize: 22, margin: "0 0 6px" }}>Новый проект</h1>
      <p style={{ fontSize: 12, color: "#5a6b86", margin: "0 0 16px" }}>Проект — контекст для контента: языки, каналы, policy и источники. После создания — анализ AI и генераторы для свайпов.</p>

      <form onSubmit={handleSubmit} style={{ background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 14, padding: 20, display: "grid", gap: 16 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={labelStyle}>Название *</span>
          <input value={name} onChange={e => onName(e.target.value)} placeholder="Например: PattayaDOM" required style={inp} />
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={labelStyle}>Slug *</span>
          <input value={slug} onChange={e => { setSlug(e.target.value); setSlugDirty(true); }} placeholder="auto из названия" style={inp} />
          <span style={{ fontSize: 11, opacity: 0.45 }}>2-80 символов, только a-z 0-9 и дефис</span>
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={labelStyle}>Языки</span>
          <input value={langs} onChange={e => setLangs(e.target.value)} placeholder="ru, en" style={inp} />
          <span style={{ fontSize: 11, opacity: 0.45 }}>через запятую или JSON ["ru","en"]</span>
        </label>
        <label style={{ display: "grid", gap: 6 }}>
          <span style={labelStyle}>Policy (JSON)</span>
          <textarea value={policy} onChange={e => setPolicy(e.target.value)} rows={8} style={{ ...inp, fontFamily: "monospace", fontSize: 12, resize: "vertical" }} />
          <span style={{ fontSize: 11, opacity: 0.45 }}>tone / banned_phrases / examples — влияет на генерацию</span>
        </label>

        {err && <div style={{ background: "rgba(255,90,90,.1)", border: "1px solid rgba(255,90,90,.25)", color: "#FF8A8A", padding: "10px 12px", borderRadius: 10, fontSize: 12 }}>{err}</div>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
          <Link href="/settings/projects" style={{ background: "#1a2636", border: "1px solid #2a3a52", color: "#8FA0B8", borderRadius: 10, padding: "10px 16px", textDecoration: "none", fontSize: 13 }}>Отмена</Link>
          <button type="submit" disabled={saving} style={{ background: saving ? "#2a4a7a" : "linear-gradient(135deg,#3D8DFF,#6DCBF4)", color: "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontWeight: 700, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}>
            {saving ? "Создаётся…" : "Создать проект"}
          </button>
        </div>
      </form>

      <div style={{ marginTop: 12, fontSize: 11, color: "#5a6b86", background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 10, padding: "10px 12px" }}>
        После создания — откроется страница проекта: добавь источники и запусти анализ AI.
      </div>
    </div>
  );
}
