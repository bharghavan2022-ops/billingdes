"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { saveChanges } from "@/app/actions";
import { fillCatalogueBlanks, migrate, resetNumbering } from "@/lib/billing/data";
import { chunkChanges, diffAgainst, snapshotOf, type Snapshot } from "@/lib/billing/rows";
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
  const saved = useRef<Snapshot | null>(null);
  if (saved.current === null) saved.current = snapshotOf(db).snap;
  const inflight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  /** Saves only the rows that changed since the last successful save. */
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (!dirty.current || inflight.current) return;
    inflight.current = true;
    dirty.current = false;
    setSaveState("saving");
    let failure = "";
    try {
      const { changes, next, count } = diffAgainst(saved.current!, latest.current);
      if (count > 0) {
        for (const piece of chunkChanges(changes)) {
          const r = await saveChanges(piece);
          if (!r.ok) { failure = r.error || "Could not save"; break; }
        }
        if (!failure) saved.current = next;
      }
    } catch (e) {
      failure = e instanceof Error ? e.message : "Could not reach the server";
    }
    inflight.current = false;
    if (!failure) {
      setSaveError("");
      if (dirty.current) { setSaveState("saving"); timer.current = setTimeout(flush, 300); } else setSaveState("saved");
    } else {
      dirty.current = true;
      setSaveState("error"); setSaveError(failure);
      timer.current = setTimeout(flush, 15000);
    }
  }, []);

  const commit = useCallback((next: BillingData) => {
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

  // Standard items loaded by an earlier version have no HSN, GST or rate: fill the blanks once, without overwriting anything.
  useEffect(() => {
    const probe = structuredClone(latest.current);
    if (fillCatalogueBlanks(probe) > 0 || !probe.meta.numbersReset) update((d) => { fillCatalogueBlanks(d); resetNumbering(d); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
