"use client";
import { useEffect, useState } from "react";

type Theme = "dark" | "light";

function getPreferred(): Theme {
  try {
    const saved = localStorage.getItem("theme") as Theme | null;
    if (saved === "dark" || saved === "light") return saved;
  } catch {}
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  return "dark";
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = getPreferred();
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {}
  }

  // 28px pill per spec
  const isLight = theme === "light";
  return (
    <button
      onClick={toggle}
      aria-label={isLight ? "Switch to dark theme" : "Switch to light theme"}
      title={isLight ? "Switch to dark" : "Switch to light"}
      style={{
        width: 28,
        height: 28,
        borderRadius: 999,
        border: "1px solid var(--border, #333)",
        background: "var(--toggle-bg, #1a1a1a)",
        color: "var(--fg, #eee)",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
        padding: 0,
        lineHeight: 1,
        fontSize: 14,
      }}
    >
      {/* avoid hydration mismatch: render placeholder until mounted */}
      {!mounted ? (
        <span aria-hidden style={{ fontSize: 13 }}>○</span>
      ) : isLight ? (
        // sun icon
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l1.41-1.41M18.36 6.64l1.41-1.41" />
        </svg>
      ) : (
        // moon icon
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
