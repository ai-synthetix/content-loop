"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setToken, apiUrl } from "../../lib/auth";

declare global { interface Window { google?: any; } }

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

  useEffect(() => {
    if (!clientId) return;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      if (!window.google) return;
      window.google.accounts.id.initialize({ client_id: clientId, callback: handleCredential });
      const el = document.getElementById("gsi-btn");
      if (el) window.google.accounts.id.renderButton(el, { theme: "outline", size: "large", width: 320, shape: "pill" });
    };
    document.body.appendChild(script);
    return () => { try { document.body.removeChild(script); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function handleCredential(resp: { credential: string }) {
    setLoading(true); setError(null);
    try {
      const res = await fetch(apiUrl("/auth/google"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: resp.credential }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "auth failed");
      setToken(data.token);
      router.push("/");
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }

  return (
    <div style={{ minHeight: "calc(100vh - 57px)", display: "grid", placeItems: "center", padding: 24, background: "radial-gradient(800px 400px at 50% -10%, rgba(61,141,255,.18), transparent), #080C12" }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#111824", border: "1px solid #1E2F44", borderRadius: 18, padding: 28, boxShadow: "0 12px 40px rgba(0,0,0,.45)" }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#3D8DFF,#6DCBF4)", display: "grid", placeItems: "center", fontWeight: 800, color: "#fff", marginBottom: 14 }}>≋</div>
        <h1 style={{ margin: 0, fontSize: 22, letterSpacing: "-.02em" }}>Вход в Content Loop</h1>
        <p style={{ margin: "6px 0 18px", color: "#8FA0B8", fontSize: 13, lineHeight: 1.5 }}>Войди через Google — мы создадим твой workspace. Все материалы привязаны к твоему аккаунту.</p>
        {!clientId && <div style={{ background: "#2a1d00", border: "1px solid #4a3400", padding: "10px 12px", borderRadius: 10, fontSize: 12, marginBottom: 14 }}>NEXT_PUBLIC_GOOGLE_CLIENT_ID не задан — добавь в .env и пересобери web.</div>}
        <div id="gsi-btn" style={{ minHeight: 44, display: "grid", placeItems: "center", background: "#0B1420", border: "1px solid #1E2F44", borderRadius: 12, padding: 12 }} />
        {loading && <div style={{ marginTop: 12, fontSize: 13, color: "#8FA0B8", textAlign: "center" }}>Входим…</div>}
        {error && <div style={{ marginTop: 12, background: "rgba(255,90,90,.1)", border: "1px solid rgba(255,90,90,.25)", color: "#FF8A8A", padding: "10px 12px", borderRadius: 10, fontSize: 12 }}>{error}</div>}
        <div style={{ marginTop: 16, fontSize: 11, color: "#5E7188", textAlign: "center" }}>Нажимая вход, ты соглашаешься, что модель <code style={{ background: "#0B1420", border: "1px solid #1E2F44", padding: "1px 5px", borderRadius: 6 }}>kimi-k2.5</code> настроена глобально.</div>
      </div>
    </div>
  );
}
