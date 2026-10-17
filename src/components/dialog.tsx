"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function Dialog({ title, onClose, footer, children }: { title: string; onClose: () => void; footer?: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const f = d?.querySelector<HTMLElement>("input,select,textarea");
    if (f && !matchMedia("(max-width:820px)").matches) f.focus();
  }, []);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose}>
      <div className="dh"><h2>{title}</h2><button className="btn ghost sm" onClick={onClose} aria-label="Close">✕</button></div>
      <div className="dbody">{children}</div>
      <div className="df">{footer}</div>
    </dialog>
  );
}

export function ConfirmDialog({ title, message, okLabel, danger, onOk, onClose }: { title: string; message: ReactNode; okLabel: string; danger?: boolean; onOk: () => void; onClose: () => void }) {
  return (
    <Dialog title={title} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Keep</button>
      <button className={`btn ${danger ? "danger" : "primary"}`} onClick={() => { onClose(); onOk(); }}>{okLabel}</button>
    </>}>
      <p style={{ margin: 0 }}>{message}</p>
    </Dialog>
  );
}

export function ErrorBox({ msg }: { msg: string }) {
  return msg ? <div className="err">{msg}</div> : null;
}
