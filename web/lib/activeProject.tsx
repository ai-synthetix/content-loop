"use client";
import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

const LS_KEY = "activeProjectId";

type Ctx = {
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  setActive: (id: string | null) => void;
  clear: () => void;
};

const ActiveProjectContext = createContext<Ctx | null>(null);

export function ActiveProjectProvider({ children }: { children: React.ReactNode }) {
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // hydrate from localStorage
  useEffect(() => {
    try {
      const v = localStorage.getItem(LS_KEY);
      if (v) setActiveIdState(v);
    } catch {}
    setHydrated(true);
  }, []);

  // sync to localStorage when activeId changes (after hydration)
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (activeId) localStorage.setItem(LS_KEY, activeId);
      else localStorage.removeItem(LS_KEY);
      window.dispatchEvent(new CustomEvent("activeProjectChanged", { detail: activeId }));
    } catch {}
  }, [activeId, hydrated]);

  // listen cross-tab / manual changes
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === LS_KEY) setActiveIdState(e.newValue);
    }
    function onCustom(e: Event) {
      const ce = e as CustomEvent;
      // avoid loop: only sync if different
      if (ce.detail !== undefined && ce.detail !== activeId) {
        // we already set via state; no need to react
      }
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("activeProjectChanged", onCustom as EventListener);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("activeProjectChanged", onCustom as EventListener);
    };
  }, [activeId]);

  const setActiveId = useCallback((id: string | null) => {
    setActiveIdState(id);
  }, []);

  const clear = useCallback(() => setActiveIdState(null), []);

  const value: Ctx = { activeId, setActiveId, setActive: setActiveId, clear };
  return <ActiveProjectContext.Provider value={value}>{children}</ActiveProjectContext.Provider>;
}

export function useActiveProject(): Ctx {
  const ctx = useContext(ActiveProjectContext);
  if (!ctx) throw new Error("useActiveProject must be used within ActiveProjectProvider");
  return ctx;
}

export default ActiveProjectContext;
