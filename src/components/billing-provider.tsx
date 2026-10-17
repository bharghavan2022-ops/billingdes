"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { saveData } from "@/app/actions";
import { migrate } from "@/lib/billing/data";
import type { BillingData } from "@/lib/billing/types";

type SaveState = "saved" | "saving" | "error";
interface Ctx {
  db: BillingData;
  /** Runs `fn` on a copy of the data, then stores the result and syncs it to Supabase. */
  update: (fn: (db: BillingData) => void) => void;
  replace: (db: BillingData) => void;
  toast: (msg: string) => void;
  saveState: SaveState;
  saveError: string;
  email: string;
}
const BillingCtx = createContext<Ctx | null>(null);

export function useBilling() {
  const c = useContext(BillingCtx);
  if (!c) throw new Error("useBilling must be used inside BillingProvider");
  return c;
}

export function BillingProvider({ initial, email, children }: { initial: BillingData; email: string; children: ReactNode }) {
  const [db, setDb] = useState<BillingData>(() => migrate(initial));
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const [toastOn, setToastOn] = useState(false);
  const latest = useRef(db);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    setSaveState("saving");
    const r = await saveData(latest.current);
    if (r.ok) { setSaveState(dirty.current ? "saving" : "saved"); setSaveError(""); }
    else { dirty.current = true; setSaveState("error"); setSaveError(r.error || "Could not save"); }
  }, []);

  const commit = useCallback((next: BillingData) => {
    next.meta.savedAt = Date.now();
    latest.current = next;
    dirty.current = true;
    setDb(next);
    setSaveState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
  }, [flush]);

  const update = useCallback((fn: (d: BillingData) => void) => {
    const next = structuredClone(latest.current);
    fn(next);
    commit(next);
  }, [commit]);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg); setToastOn(true);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastOn(false), 2600);
  }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const value = useMemo<Ctx>(() => ({ db, update, replace: commit, toast, saveState, saveError, email }), [db, update, commit, toast, saveState, saveError, email]);
  return (
    <BillingCtx.Provider value={value}>
      {children}
      <div id="toast" role="status" className={toastOn ? "show" : ""}>{toastMsg}</div>
    </BillingCtx.Provider>
  );
}
