"use client";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { getToken, clearToken, apiUrl, authHeaders } from "../lib/auth";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { useActiveProject } from "../lib/activeProject";
export function Header() {
  const [email, setEmail] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [projects, setProjects] = useState<{id:string,name?:string,slug?:string}[]>([]);
  const { activeId, setActiveId } = useActiveProject();
  const [projOpen, setProjOpen] = useState(false);
  const projRef = useRef<HTMLDivElement>(null);
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
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
      if (projRef.current && !projRef.current.contains(e.target as Node)) {
        setProjOpen(false);
      }
    }
    if (settingsOpen || projOpen) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [settingsOpen, projOpen]);
  useEffect(() => {
    const t = getToken();
    if (!t) return;
    fetch(apiUrl("/api/v1/projects/"), { headers: { ...authHeaders() } }).then(r=>r.ok?r.json():{items:[]}).then(d=>{
      const list = d.items || d || [];
      const arr = Array.isArray(list)?list:[];
      setProjects(arr);
      if (!activeId && arr.length>0) setActiveId(arr[0].id);
    }).catch(()=>{});
  }, [activeId, setActiveId]);
  function logout() { clearToken(); setEmail(null); window.dispatchEvent(new Event("auth-changed")); router.push("/login"); }
  const activeName = projects.find(p=>p.id===activeId)?.name || projects.find(p=>p.id===activeId)?.slug || (activeId?activeId.slice(0,8):"");
  return (
    <header style={{ padding: "12px 20px", borderBottom: "1px solid var(--border, #222)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg, #0a0a0a)" }}>
      <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
        <Link href="/" style={{ color: "var(--fg, #eee)", textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#3D8DFF,#6DCBF4)", display: "grid", placeItems: "center", fontSize: 14 }}>🌀</span><strong style={{ fontSize: 16, letterSpacing: -0.3 }}>SwipeLoop</strong></Link>
        {/* active project selector */}
        <div ref={projRef} style={{ position: "relative" }}>
          <button onClick={()=>setProjOpen(v=>!v)} style={{ display:"flex", alignItems:"center", gap:6, background:"#0f1620", border:"1px solid var(--border, #222)", color:"var(--fg, #eee)", borderRadius:8, padding:"6px 10px", fontSize:12, cursor:"pointer", minWidth:120 }}>
            <span style={{ opacity:0.6, fontSize:10 }}>Проект:</span> <span style={{ fontWeight:700, color:"#cfe0ff", maxWidth:120, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{activeName || "— выбрать —"}</span> <span style={{ fontSize:10, opacity:0.7, transform: projOpen?"rotate(180deg)":"rotate(0deg)", transition:"transform .15s" }}>▾</span>
          </button>
          {projOpen && (
            <div style={{ position:"absolute", top:"calc(100% + 8px)", left:0, minWidth:220, background:"#16202e", border:"1px solid #1e2f44", borderRadius:10, padding:6, display:"grid", gap:2, boxShadow:"0 8px 24px rgba(0,0,0,.4)", zIndex:50 }}>
              {projects.length===0 ? <div style={{ padding:"8px 10px", fontSize:12, color:"#5a6b86" }}>Нет проектов</div> : projects.map(p=>(
                <button key={p.id} onClick={()=>{ setActiveId(p.id); setProjOpen(false); }} style={{ textAlign:"left", background: activeId===p.id?"#1e3a5a":"transparent", border:"1px solid "+(activeId===p.id?"#3D8DFF":"transparent"), color: activeId===p.id?"#8fb8ff":"#cfe0ff", borderRadius:7, padding:"7px 10px", fontSize:13, cursor:"pointer" }}>{p.name || p.slug || p.id.slice(0,8)} {activeId===p.id?"✓":""}</button>
              ))}
              <div style={{ height:1, background:"#1e2f44", margin:"4px 0" }} />
              <Link href="/settings/projects" onClick={()=>setProjOpen(false)} style={{ color:"#8fb8ff", textDecoration:"none", padding:"7px 10px", borderRadius:7, fontSize:13, display:"block", textAlign:"center", border:"1px solid #1e2f44" }}>+ Новый проект</Link>
            </div>
          )}
        </div>
        <nav style={{ display: "flex", gap: 12, fontSize: 13, alignItems: "center" }}>
          <Link href="/" style={{ color: "var(--link, #8fb8ff)", textDecoration: "none" }}>Dashboard</Link>
          <Link href="/queue" style={{ color: "var(--link, #8fb8ff)", textDecoration: "none" }}>Queue</Link>
          <Link href="/swipe" style={{ color: "var(--link, #8fb8ff)", textDecoration: "none" }}>Swipe</Link>
          <div
            ref={settingsRef}
            style={{ position: "relative" }}
            onMouseEnter={() => setSettingsOpen(true)}
            onMouseLeave={() => setSettingsOpen(false)}
          >
            <button
              onClick={() => setSettingsOpen((v) => !v)}
              style={{ background: "transparent", border: "none", color: "var(--link, #8fb8ff)", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: "2px 4px" }}
              aria-haspopup="menu"
              aria-expanded={settingsOpen}
            >
              Settings <span style={{ fontSize: 10, opacity: 0.8, transform: settingsOpen ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block", transition: "transform .15s" }}>▾</span>
            </button>
            {settingsOpen && (
              <div
                role="menu"
                style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, minWidth: 160, background: "#16202e", border: "1px solid #1e2f44", borderRadius: 10, padding: 6, display: "grid", gap: 2, boxShadow: "0 8px 24px rgba(0,0,0,.4)", zIndex: 40 }}
              >
                <Link href="/settings/projects" onClick={() => setSettingsOpen(false)} role="menuitem" style={{ color: "#cfe0ff", textDecoration: "none", padding: "7px 10px", borderRadius: 7, fontSize: 13, display: "block" }}>Projects</Link>
                <Link href="/settings/channels" onClick={() => setSettingsOpen(false)} role="menuitem" style={{ color: "#cfe0ff", textDecoration: "none", padding: "7px 10px", borderRadius: 7, fontSize: 13, display: "block" }}>Channels</Link>
                <Link href="/settings/prompts" onClick={() => setSettingsOpen(false)} role="menuitem" style={{ color: "#cfe0ff", textDecoration: "none", padding: "7px 10px", borderRadius: 7, fontSize: 13, display: "block" }}>Prompts</Link>
                <Link href="/settings/guide" onClick={() => setSettingsOpen(false)} role="menuitem" style={{ color: "#cfe0ff", textDecoration: "none", padding: "7px 10px", borderRadius: 7, fontSize: 13, display: "block" }}>Guide</Link>
              </div>
            )}
          </div>
        </nav>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13 }}>
        <ThemeToggle />
        {email ? <span style={{ opacity: 0.7 }}>{email}</span> : <Link href="/login" style={{ color: "var(--link-strong, #7eb8ff)" }}>Sign in</Link>}
        {email && <button onClick={logout} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border, #333)", background: "var(--toggle-bg, #1a1a1a)", color: "var(--fg, #eee)", cursor: "pointer" }}>Logout</button>}
      </div>
    </header>
  );
}
