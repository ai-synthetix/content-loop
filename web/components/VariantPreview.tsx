"use client";
import { useState } from "react";

function badgeStyle(ch: string) {
  const k = (ch || "").toLowerCase();
  if (k === "telegram") return { bg: "#0a1f3a", fg: "#7eb8ff", border: "#1e3a5f", label: "telegram" };
  if (k === "familyos") return { bg: "#0f2e1a", fg: "#6fdc8c", border: "#1f4a2b", label: "familyos" };
  if (k === "generic") return { bg: "#1e293b", fg: "#94a3b8", border: "#334155", label: "generic" };
  return { bg: "#222", fg: "#aaa", border: "#333", label: ch || "unknown" };
}

function tryParseJSON(s: string): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function prettyPayload(payload: any): string {
  if (payload == null) return "";
  if (typeof payload === "string") {
    const p = tryParseJSON(payload);
    if (p) return JSON.stringify(p, null, 2);
    return payload;
  }
  try { return JSON.stringify(payload, null, 2); } catch { return String(payload); }
}

export function VariantCard({ v }: { v: any }) {
  const ch = v.channel || v.type || "unknown";
  const bs = badgeStyle(ch);
  const rendered = v.rendered_body || v.renderedBody || v.body || "";
  const payloadStr = prettyPayload(v.payload ?? v.payload_json ?? v.data);
  const [showPayload, setShowPayload] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(text: string, which: string) {
    try { await navigator.clipboard.writeText(text); setCopied(which); setTimeout(()=>setCopied(null), 1500); } catch {}
  }

  return (
    <div style={{ background: "#0b111a", border: "1px solid #1e2f44", borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <span style={{ background: bs.bg, color: bs.fg, border: `1px solid ${bs.border}`, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700, letterSpacing: 0.3 }}>{bs.label}</span>
        <span style={{ fontSize: 11, opacity: 0.5, fontFamily: "monospace" }}>{v.id ? String(v.id).slice(0,8)+"…" : ""} v#{v.content_version_id ? String(v.content_version_id).slice(0,8) : ""}</span>
      </div>

      <div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color:"#cfe0ff", textTransform:"uppercase", letterSpacing:0.5 }}>Rendered body</span>
          <button onClick={()=>copy(rendered, "body")} style={{ background:"#1a2636", border:"1px solid #2a3a52", color:"#cfe0ff", borderRadius:6, padding:"4px 8px", fontSize:11, cursor:"pointer" }}>{copied==="body" ? "✓ Copied" : "Copy"}</button>
        </div>
        <pre style={{ background:"#0a0e14", border:"1px solid #1e2f44", borderRadius:8, padding:10, fontSize:12, lineHeight:1.5, overflow:"auto", whiteSpace:"pre-wrap", wordBreak:"break-word", maxHeight:320, margin:0 }}>{rendered || <span style={{opacity:0.5}}>— empty —</span> as any}</pre>
      </div>

      <div>
        <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color:"#8FA0B8", textTransform:"uppercase", letterSpacing:0.5 }}>Payload JSON</span>
          <button onClick={()=>setShowPayload(!showPayload)} style={{ background:"#111a27", border:"1px solid #1e2f44", color:"#8FA0B8", borderRadius:6, padding:"3px 8px", fontSize:11, cursor:"pointer" }}>{showPayload ? "Hide" : "Show"} JSON</button>
          {showPayload && <button onClick={()=>copy(payloadStr, "payload")} style={{ background:"#1a2636", border:"1px solid #2a3a52", color:"#cfe0ff", borderRadius:6, padding:"3px 8px", fontSize:11, cursor:"pointer" }}>{copied==="payload" ? "✓ Copied" : "Copy JSON"}</button>}
        </div>
        {showPayload && (
          <pre style={{ background:"#0a0e14", border:"1px solid #1e2f44", borderRadius:8, padding:10, fontSize:11, overflow:"auto", maxHeight:240, margin:0 }}>{payloadStr || "—"}</pre>
        )}
      </div>
    </div>
  );
}

export function VariantsGrid({ variants }: { variants: any[] }) {
  if (!variants || variants.length === 0) return <div style={{ fontSize:12, opacity:0.6, padding:8, border:"1px dashed #2a3a52", borderRadius:8 }}>No variants yet — generate first.</div>;
  return (
    <div style={{ display:"grid", gap:12 }}>
      {variants.map((v:any, i:number)=>(<VariantCard key={v.id || i} v={v} />))}
    </div>
  );
}

export function PrettyJSON({ data, title, collapsible=true }: { data:any; title?: string; collapsible?:boolean }) {
  const [open, setOpen] = useState(!collapsible);
  const jsonStr = (()=>{ try{ return JSON.stringify(data, null, 2);} catch{ return String(data); }})();
  return (
    <div style={{ background:"#0b111a", border:"1px solid #1e2f44", borderRadius:10, padding:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        {title && <span style={{ fontSize:11, fontWeight:700, color:"#cfe0ff" }}>{title}</span>}
        {collapsible && <button onClick={()=>setOpen(!open)} style={{ background:"#111a27", border:"1px solid #1e2f44", color:"#8FA0B8", borderRadius:6, padding:"3px 8px", fontSize:11, cursor:"pointer" }}>{open?"Hide":"Show"} JSON</button>}
        {!collapsible && <span style={{ fontSize:11, opacity:0.5 }}>{jsonStr.length} chars</span>}
      </div>
      {open && <pre style={{ marginTop:8, background:"#0a0e14", border:"1px solid #1e2f44", borderRadius:8, padding:10, fontSize:11, overflow:"auto", maxHeight:300, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{jsonStr}</pre>}
    </div>
  );
}
