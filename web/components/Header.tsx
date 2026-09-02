"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getToken, clearToken, apiUrl, authHeaders } from "../lib/auth";
import { useRouter } from "next/navigation";
export function Header() {
  const [email, setEmail] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    function fetchMe() {
      const t = getToken();
      if (!t) { setEmail(null); return; }
      fetch(apiUrl("/me"), { headers: { ...authHeaders() } })
        .then((r) => {
          if (r.status === 401) { clearToken(); setEmail(null); return null; }
          return r.ok ? r.json() : null;
        })
        .then((d) => { if (d?.email) setEmail(d.email); else if (d === null) setEmail(null); })
        .catch(() => {});
    }
    fetchMe();
    const onAuth = () => fetchMe();
    const onFocus = () => fetchMe();
    const onStorage = (e: StorageEvent) => { if (e.key === "content_loop_jwt") fetchMe(); };
    window.addEventListener("auth-changed", onAuth);
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("auth-changed", onAuth);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  function logout() { clearToken(); setEmail(null); window.dispatchEvent(new Event("auth-changed")); router.push("/login"); }
  return (
    <header style={{ padding: "12px 20px", borderBottom: "1px solid #222", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
        <Link href="/" style={{ color: "#eee", textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#3D8DFF,#6DCBF4)", display: "grid", placeItems: "center", fontSize: 14 }}>🌀</span><strong style={{ fontSize: 16, letterSpacing: -0.3 }}>SwipeLoop</strong></Link>
        <nav style={{ display: "flex", gap: 12, fontSize: 13 }}>
          <Link href="/" style={{ color: "#8fb8ff", textDecoration: "none" }}>Dashboard</Link>
          <Link href="/queue" style={{ color: "#8fb8ff", textDecoration: "none" }}>Queue</Link>
          <Link href="/projects" style={{ color: "#8fb8ff", textDecoration: "none" }}>Projects</Link>
          <Link href="/settings/channels" style={{ color: "#8fb8ff", textDecoration: "none" }}>Channels</Link>
          <Link href="/prompts" style={{ color: "#8fb8ff", textDecoration: "none" }}>Prompts</Link>
          <Link href="/guide" style={{ color: "#8fb8ff", textDecoration: "none" }}>Guide</Link>
        </nav>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13 }}>
        {email ? <span style={{ opacity: 0.7 }}>{email}</span> : <Link href="/login" style={{ color: "#7eb8ff" }}>Sign in</Link>}
        {email && <button onClick={logout} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #333", background: "#1a1a1a", color: "#eee", cursor: "pointer" }}>Logout</button>}
      </div>
    </header>
  );
}
