"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { saveChanges } from "@/app/actions";
import { fillCatalogueBlanks, migrate, resetNumbering } from "@/lib/billing/data";
import { chunkChanges, diffAgainst, snapshotOf, type Snapshot } from "@/lib/billing/rows";
import { download } from "@/lib/billing/export";
import type { BillingData } from "@/lib/billing/types";

/** Plain-language reasons for a failed save, with what to do about it. */
export function friendlySaveError(msg: string): string {
  if (/signed out|jwt|not authenticated|refresh token/i.test(msg)) return "Your sign-in has expired. Sign in again in another tab, then press Retry here. Do not refresh this page.";
  if (/invoices_user_id_no_key|duplicate key|unique/i.test(msg)) return "The database still refuses a repeated invoice number or item code. Run the latest supabase/schema.sql in the Supabase SQL Editor, then press Retry.";
  if (/column .* does not exist|could not find .* column|schema cache/i.test(msg)) return "The database is missing newer columns. Run the latest supabase/schema.sql in the Supabase SQL Editor, then press Retry.";
  if (/fetch failed|network|failed to fetch|timeout/i.test(msg)) return "Could not reach the server. Check the internet connection; the bills will be saved automatically when it returns.";
  return msg;
}

export interface Recovered { changes: number; bills: number }

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
  /** Press "Retry" after fixing the cause of a failed save. */
  retry: () => void;
  /** Downloads everything in this browser as a backup file. */
  backup: () => void;
  /** Unsaved work found from an earlier visit that never reached the database. */
  recovered: Recovered | null;
  restoreRecovered: () => void;
  discardRecovered: () => void;
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
  const key = "billing-unsaved:" + email;
  const localTimer = useRef<ReturnType<typeof setTimeout>>();
  const [recovered, setRecovered] = useState<Recovered | null>(null);
  const recoveredData = useRef<BillingData | null>(null);
  /** Keep a copy of what has not been saved yet in this browser, so a failed save never loses bills. */
  const keepLocal = useCallback((d: BillingData | null) => {
    if (recoveredData.current) return; // an earlier unsaved copy is waiting for a decision; do not overwrite it
    try {
      if (d) localStorage.setItem(key, JSON.stringify(d)); else localStorage.removeItem(key);
    } catch { /* storage full or blocked: the in-memory copy still works */ }
  }, [key]);
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
      if (!dirty.current) { clearTimeout(localTimer.current); keepLocal(null); }
      if (dirty.current) { setSaveState("saving"); timer.current = setTimeout(flush, 300); } else setSaveState("saved");
    } else {
      dirty.current = true;
      setSaveState("error"); setSaveError(friendlySaveError(failure));
      keepLocal(latest.current);
      timer.current = setTimeout(flush, 15000);
    }
  }, [keepLocal]);

  const commit = useCallback((next: BillingData) => {
    latest.current = next;
    dirty.current = true;
    setDb(next);
    setSaveState("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 800);
    clearTimeout(localTimer.current);
    localTimer.current = setTimeout(() => keepLocal(latest.current), 400);
  }, [flush, keepLocal]);

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

  // Work kept from an earlier visit that never reached the database: offer to bring it back.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const local = migrate(JSON.parse(raw) as BillingData);
      const { count } = diffAgainst(saved.current!, local);
      if (count === 0) { localStorage.removeItem(key); return; }
      const have = new Set(latest.current.invoices.map((i) => i.id));
      recoveredData.current = local;
      setRecovered({ changes: count, bills: local.invoices.filter((i) => !have.has(i.id)).length });
    } catch { /* unreadable copy: ignore it */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const restoreRecovered = useCallback(() => {
    const d = recoveredData.current;
    recoveredData.current = null; setRecovered(null);
    if (d) commit(d);
  }, [commit]);
  const discardRecovered = useCallback(() => { recoveredData.current = null; setRecovered(null); keepLocal(null); }, [keepLocal]);
  const retry = useCallback(() => { dirty.current = true; setSaveState("saving"); flush(); }, [flush]);
  const backup = useCallback(() => {
    download("billing-backup-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(latest.current, null, 1), "application/json");
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

  const value = useMemo<Ctx>(() => ({ db, update, replace: commit, toast, saveState, saveError, email, retry, backup, recovered, restoreRecovered, discardRecovered }),
    [db, update, commit, toast, saveState, saveError, email, retry, backup, recovered, restoreRecovered, discardRecovered]);
  return (
    <BillingCtx.Provider value={value}>
      {children}
      <div id="toast" role="status" className={toastOn ? "show" : ""}>{toastMsg}</div>
    </BillingCtx.Provider>
  );
}
