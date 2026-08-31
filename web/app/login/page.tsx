"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setToken, apiUrl } from "../../lib/auth";

declare global {
  interface Window {
    google?: any;
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [manualToken, setManualToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";

  useEffect(() => {
    if (!clientId) return;
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => {
      if (!window.google) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredential,
      });
      const el = document.getElementById("gsi-btn");
      if (el) window.google.accounts.id.renderButton(el, { theme: "filled_black", size: "large", width: 280 });
    };
    document.body.appendChild(script);
    return () => {
      try { document.body.removeChild(script); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function handleCredential(resp: { credential: string }) {
    await exchange(resp.credential);
  }

  async function exchange(idToken: string) {
    setError(null);
    try {
      const res = await fetch(apiUrl("/auth/google"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: idToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "auth failed");
      setToken(data.token);
      router.push("/");
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div style={{ maxWidth: 480, margin: "40px auto", padding: 24, background: "#111", borderRadius: 12, border: "1px solid #222" }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Sign in</h1>
      <p style={{ opacity: 0.7, fontSize: 13, marginBottom: 16 }}>
        Use Google Sign-In. JWT is stored in localStorage and sent as Bearer for /api/v1/*.
      </p>
      {clientId ? (
        <div id="gsi-btn" style={{ minHeight: 44, marginBottom: 16 }} />
      ) : (
        <p style={{ background: "#2a1d00", padding: 10, borderRadius: 8, fontSize: 12 }}>
          NEXT_PUBLIC_GOOGLE_CLIENT_ID not set — paste a Google id_token below (get from GIS playground) or set env and rebuild web.
        </p>
      )}
      {error && <p style={{ color: "#ff6b6b", fontSize: 13 }}>{error}</p>}
      <div style={{ marginTop: 16, borderTop: "1px solid #222", paddingTop: 16 }}>
        <p style={{ fontSize: 12, opacity: 0.6 }}>Manual id_token exchange (debug)</p>
        <textarea value={manualToken} onChange={(e) => setManualToken(e.target.value)} placeholder="paste id_token" rows={3} style={{ width: "100%", background: "#0a0a0a", color: "#eee", border: "1px solid #333", borderRadius: 8, padding: 8, fontSize: 12 }} />
        <button onClick={() => exchange(manualToken.trim())} disabled={!manualToken.trim()} style={{ marginTop: 8, padding: "8px 14px", borderRadius: 8, border: "1px solid #333", background: "#1a1a1a", color: "#eee", cursor: "pointer", opacity: manualToken.trim() ? 1 : 0.5 }}>Exchange &amp; sign in</button>
      </div>
    </div>
  );
}
