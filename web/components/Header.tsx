"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getToken, clearToken, apiUrl, authHeaders } from "../lib/auth";
import { useRouter } from "next/navigation";
export function Header() {
  const [email, setEmail] = useState<string | null>(null);
  const router = useRouter();
  useEffect(() => {
    const t = getToken();
    if (!t) return;
    fetch(apiUrl("/me"), { headers: { ...authHeaders() } })
      .then((r) => {
        if (r.status === 401) { clearToken(); return null; }
        return r.ok ? r.json() : null;
      })
      .then((d) => { if (d?.email) setEmail(d.email); })
      .catch(() => {});
  }, []);
  function logout() { clearToken(); setEmail(null); router.push("/login"); }
  return (
    <header style={{ padding: "12px 20px", borderBottom: "1px solid #222", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
        <Link href="/" style={{ color: "#eee", textDecoration: "none" }}><strong>Content Loop</strong></Link>
        <nav style={{ display: "flex", gap: 12, fontSize: 13 }}>
          <Link href="/" style={{ color: "#8fb8ff", textDecoration: "none" }}>Queue</Link>
          <Link href="/projects" style={{ color: "#8fb8ff", textDecoration: "none" }}>Projects</Link>
          <Link href="/settings/channels" style={{ color: "#8fb8ff", textDecoration: "none" }}>Channels</Link>
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
