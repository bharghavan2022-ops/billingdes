"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";

export interface ComboOption { key: string; content: ReactNode; add?: boolean; pick: () => void }

/** A text input with a searchable dropdown (arrow keys, Enter, Esc; Tab picks the highlighted item when `tabPicks`). */
export function ComboInput({ value, onValueChange, options, tabPicks, ...rest }: {
  value: string; onValueChange: (v: string) => void; options: () => ComboOption[]; tabPicks?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const ref = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 300 });
  const opts = open ? options() : [];
  useEffect(() => { if (open) document.querySelector("#combo .opt.on")?.scrollIntoView({ block: "nearest" }); }, [idx, open]);

  const place = () => {
    const r = ref.current!.getBoundingClientRect();
    const width = Math.max(r.width, 300), h = 320;
    const below = innerHeight - r.bottom;
    setPos({
      left: Math.max(8, Math.min(r.left, innerWidth - width - 8)),
      width,
      top: below < h + 12 && r.top > h + 12 ? r.top - h - 4 : r.bottom + 4,
    });
  };
  const show = () => { place(); setIdx(0); setOpen(true); };
  const choose = (o?: ComboOption) => { setOpen(false); o?.pick(); };

  return (
    <>
      <input
        {...rest}
        ref={ref}
        value={value}
        autoComplete="off"
        onFocus={show}
        onBlur={() => setOpen(false)}
        onChange={(e) => { onValueChange(e.target.value); show(); }}
        onKeyDown={(e) => {
          if (!open || !opts.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setIdx((idx + 1) % opts.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((idx - 1 + opts.length) % opts.length); }
          else if (e.key === "Enter") { e.preventDefault(); choose(opts[idx]); }
          else if (e.key === "Escape") setOpen(false);
          else if (e.key === "Tab" && tabPicks && value.trim() && opts[idx] && !opts[idx].add) { e.preventDefault(); choose(opts[idx]); }
        }}
      />
      {open && opts.length > 0 && (
        <div id="combo" role="listbox" style={{ display: "block", left: pos.left, top: pos.top, width: pos.width }}
          onMouseDown={(e) => e.preventDefault()}>
          {opts.map((o, i) => (
            <div key={o.key} role="option" aria-selected={i === idx} className={`opt ${o.add ? "add" : ""} ${i === idx ? "on" : ""}`} onMouseDown={() => choose(o)}>
              {o.content}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
