"use client";
import React from "react";
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; msg: string }> {
  constructor(p: any) { super(p); this.state = { hasError: false, msg: "" }; }
  static getDerivedStateFromError(e: Error) { return { hasError: true, msg: e.message }; }
  componentDidCatch(e: Error) { console.error(e); }
  render() {
    if (this.state.hasError) return <div style={{ background: "rgba(255,60,60,.1)", border: "1px solid rgba(255,60,60,.3)", padding: 16, borderRadius: 12, color: "#ff8a8a" }}><strong>Something went wrong</strong><div style={{ fontSize: 12, marginTop: 6, opacity: 0.8 }}>{this.state.msg}</div><button onClick={() => this.setState({ hasError: false, msg: "" })} style={{ marginTop: 10, background: "#1a2636", border: "1px solid #2a3a52", color: "#cfe0ff", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>Retry</button></div>;
    return this.props.children;
  }
}
