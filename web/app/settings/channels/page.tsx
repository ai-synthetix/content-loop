"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getToken, authHeaders, apiUrl } from "../../../lib/auth";

type Channel = {
  id: string;
  type: string;
  name: string;
  project_id?: string | null;
  status: string;
  config?: Record<string, any>;
  created_at?: string;
};

export default function ChannelsPage() {
  const router = useRouter();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string; slug: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<"telegram" | "familyos" | "generic">("telegram");
  const [formName, setFormName] = useState("");
  const [formProjectId, setFormProjectId] = useState("");
  const [formCfg, setFormCfg] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, any> | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const token = getToken();
      if (!token) { router.replace("/login"); return; }
      const [cr, pr] = await Promise.all([
        fetch(apiUrl("/api/v1/channels/"), { headers: { ...authHeaders() } }),
        fetch(apiUrl("/api/v1/projects/"), { headers: { ...authHeaders() } }),
      ]);
      if (cr.status === 401 || pr.status === 401) { router.replace("/login"); throw new Error("unauthorized"); }
      const d = await cr.json();
      if (!cr.ok) throw new Error(d.error || String(cr.status));
      setChannels(d.items || []);
      const pd = await pr.json().catch(() => ({ items: [] }));
      setProjects((pd.items || []).map((p: any) => ({ id: p.id, name: p.name, slug: p.slug })));
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    let cfg: any = {};
    try { cfg = formCfg ? JSON.parse(formCfg) : {}; } catch { setErr("config must be valid JSON"); return; }
    const body = { type: formType, name: formName || formType, project_id: formProjectId || undefined, config: cfg };
    try {
      const r = await fetch(apiUrl("/api/v1/channels/"), { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || String(r.status));
      setShowForm(false); setFormCfg(""); setFormName(""); setFormProjectId("");
      load();
    } catch (e: any) { setErr(e.message); }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete channel?")) return;
    try {
      const r = await fetch(apiUrl(`/api/v1/channels/${id}`), { method: "DELETE", headers: { ...authHeaders() } });
      if (!r.ok && r.status !== 204) { const d = await r.json(); throw new Error(d.error || String(r.status)); }
      load();
    } catch (e: any) { setErr(e.message); }
  }

  async function handleTest(id: string) {
    setTestingId(id); setTestResult(null);
    try {
      const r = await fetch(apiUrl(`/api/v1/channels/${id}/test`), { method: "POST", headers: { ...authHeaders() } });
      const d = await r.json();
      setTestResult({ id, ...d });
    } catch (e: any) { setTestResult({ id, error: e.message, ok: false }); }
    finally { setTestingId(null); }
  }

  const placeholder = formType === "telegram"
    ? '{\n  "bot_token": "123:AAH...\",\n  "channel_id": "@my_channel"\n}'
    : formType === "familyos"
      ? '{\n  "base_url": "https://pattayadom.example.com",\n  "api_key": "secret",\n  "mapping": {"title":"title"} \n}'
      : '{\n  "base_url": "https://example.com/api",\n  "api_key": "secret"\n}';

  if (loading) return <p>Loading channels…</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Channels</h1>
        <button onClick={() => setShowForm(!showForm)} style={btn}>{showForm ? "Cancel" : "+ Add channel"}</button>
      </div>
      <p style={{ opacity: 0.6, fontSize: 13, marginTop: 0 }}>Per-user channels — config stored encrypted (AES-GCM). Telegram: <code>bot_token</code> + <code>channel_id</code>. FamilyOS/generic: <code>base_url</code> + <code>api_key</code>.</p>
      {err && <div style={{ background: "rgba(255,60,60,.12)", border: "1px solid rgba(255,60,60,.3)", padding: "8px 12px", borderRadius: 8, color: "#ff8a8a", fontSize: 13, marginBottom: 12 }}>{err}</div>}

      {showForm && (
        <form onSubmit={handleCreate} style={{ background: "#111a24", border: "1px solid #1e2f44", borderRadius: 12, padding: 16, marginBottom: 16, display: "grid", gap: 12 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <label style={labelStyle}>Type
              <select value={formType} onChange={e => setFormType(e.target.value as any)} style={inputStyle}>
                <option value="telegram">telegram</option>
                <option value="familyos">familyos</option>
                <option value="generic">generic</option>
              </select>
            </label>
            <label style={labelStyle}>Name
              <input value={formName} onChange={e => setFormName(e.target.value)} placeholder={`${formType} channel`} style={inputStyle} />
            </label>
            <label style={labelStyle}>Project (optional)
              <select value={formProjectId} onChange={e => setFormProjectId(e.target.value)} style={inputStyle}>
                <option value="">— no project —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name} ({p.slug})</option>)}
              </select>
            </label>
          </div>
          <label style={labelStyle}>Config JSON (encrypted at rest)
            <textarea value={formCfg} onChange={e => setFormCfg(e.target.value)} placeholder={placeholder} rows={5} style={{ ...inputStyle, fontFamily: "monospace", fontSize: 12 }} />
          </label>
          <div><button type="submit" style={{ ...btn, background: "#3d8dff", borderColor: "#3d8dff", color: "#fff" }}>Create channel</button></div>
        </form>
      )}

      {channels.length === 0 ? <p style={{ opacity: 0.6, fontSize: 13 }}>No channels yet. Add Telegram or FamilyOS above.</p> : (
        <div style={{ display: "grid", gap: 12 }}>
          {channels.map(c => (
            <div key={c.id} style={{ background: "#0f1620", border: "1px solid #1e2f44", borderRadius: 12, padding: 14, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong>{c.name}</strong>
                  <span style={{ background: c.type === "telegram" ? "#1d3a5a" : c.type === "familyos" ? "#1a3a2a" : "#2a2a3a", color: "#8fb8ff", padding: "2px 8px", borderRadius: 20, fontSize: 11 }}>{c.type}</span>
                  <span style={{ background: c.status === "active" ? "#14301e" : "#331a1a", color: c.status === "active" ? "#6fdc8c" : "#ff8a8a", padding: "2px 8px", borderRadius: 20, fontSize: 11 }}>{c.status}</span>
                  <span style={{ opacity: 0.5, fontSize: 11 }}>{c.id.slice(0, 8)}…</span>
                </div>
                {c.project_id && <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>project: {projects.find(p=>p.id===c.project_id)?.name || c.project_id} <span style={{ opacity: 0.5 }}>({c.project_id.slice(0,8)}…)</span></div>}
                <pre style={{ margin: "8px 0 0", background: "#0b111a", border: "1px solid #1e2f44", borderRadius: 8, padding: 8, fontSize: 11, overflow: "auto" }}>{JSON.stringify(c.config || {}, null, 2)}</pre>
              </div>
              <div style={{ display: "flex", gap: 8, flexDirection: "column", alignItems: "flex-end" }}>
                <button onClick={() => handleTest(c.id)} disabled={testingId === c.id} style={{ ...btn, opacity: testingId === c.id ? 0.6 : 1, minWidth: 90 }}>{testingId === c.id ? "Testing…" : "Test"}</button>
                <button onClick={() => handleDelete(c.id)} style={{ ...btn, borderColor: "#5a2a2a", color: "#ff8a8a" }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {testResult && (
        <div style={{ marginTop: 16, background: testResult.ok ? "rgba(60,180,90,.12)" : "rgba(255,90,60,.12)", border: `1px solid ${testResult.ok ? "rgba(60,180,90,.3)" : "rgba(255,90,60,.3)"}`, borderRadius: 10, padding: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Test result for {testResult.id.slice(0, 8)}… {testResult.ok ? "✓ ok" : "✗ failed"}</div>
          <pre style={{ fontSize: 11, overflow: "auto", margin: 0 }}>{JSON.stringify(testResult, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

const btn: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid #2a3a52", background: "#16202e", color: "#cfe0ff", cursor: "pointer", fontSize: 13 };
const inputStyle: React.CSSProperties = { display: "block", marginTop: 6, padding: "8px 10px", borderRadius: 8, border: "1px solid #2a3a52", background: "#0b111a", color: "#cfe0ff", minWidth: 180, width: "100%" };
const labelStyle: React.CSSProperties = { fontSize: 12, opacity: 0.9, flex: 1, minWidth: 160 };
