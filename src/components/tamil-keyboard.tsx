"use client";

import { useEffect, useRef, useState } from "react";

const ROWS: { label: string; keys: string[] }[] = [
  { label: "Vowels", keys: ["அ", "ஆ", "இ", "ஈ", "உ", "ஊ", "எ", "ஏ", "ஐ", "ஒ", "ஓ", "ஔ", "ஃ"] },
  { label: "Consonants", keys: ["க", "ங", "ச", "ஞ", "ட", "ண", "த", "ந", "ப", "ம", "ய", "ர", "ல", "வ", "ழ", "ள", "ற", "ன"] },
  { label: "Grantha", keys: ["ஜ", "ஷ", "ஸ", "ஹ", "க்ஷ", "ஸ்ரீ"] },
  { label: "Vowel signs", keys: ["ா", "ி", "ீ", "ு", "ூ", "ெ", "ே", "ை", "ொ", "ோ", "ௌ", "்"] },
  { label: "Numbers", keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "/", "-", ".", ","] },
];

/** Puts `text` into an input at the caret, in a way React's onChange sees. */
function insert(el: HTMLInputElement | HTMLTextAreaElement, text: string, back = false) {
  const start = el.selectionStart ?? el.value.length, end = el.selectionEnd ?? start;
  let next = el.value, caret = start;
  if (back) {
    if (start !== end) { next = el.value.slice(0, start) + el.value.slice(end); caret = start; }
    else if (start > 0) {
      // remove one whole Tamil character, including a vowel sign or pulli attached to it
      const before = Array.from(new Intl.Segmenter("ta", { granularity: "grapheme" }).segment(el.value.slice(0, start)));
      const last = before[before.length - 1]?.segment.length ?? 1;
      next = el.value.slice(0, start - last) + el.value.slice(end); caret = start - last;
    }
  } else { next = el.value.slice(0, start) + text + el.value.slice(end); caret = start + text.length; }
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.setSelectionRange(caret, caret);
}

/**
 * A floating Tamil keyboard. It appears whenever a field marked data-tamil gets focus, can be dragged away,
 * and types into that field at the cursor without taking focus from it.
 */
export function TamilKeyboard() {
  const [target, setTarget] = useState<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [closed, setClosed] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    const onIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.matches?.("input[data-tamil], textarea[data-tamil]")) { setTarget(t as HTMLInputElement); setClosed(false); }
      else if (!box.current?.contains(t)) setTarget(null);
    };
    document.addEventListener("focusin", onIn);
    return () => document.removeEventListener("focusin", onIn);
  }, []);

  const shown = !!target && !closed;
  // Leave room under the page so the fields at the bottom can be scrolled above the keyboard.
  useEffect(() => {
    if (!shown || pos) return;
    const h = box.current?.offsetHeight ?? 0;
    document.body.style.paddingBottom = h + 24 + "px";
    return () => { document.body.style.paddingBottom = ""; };
  }, [shown, pos]);

  if (!target || closed) return null;
  const type = (k: string) => insert(target, k);
  const style = pos ? { left: pos.x, top: pos.y, transform: "none" } : undefined;

  return (
    <div ref={box} className="tkb" style={style} role="group" aria-label="Tamil keyboard" onMouseDown={(e) => e.preventDefault()}>
      <div className="tkb-bar"
        onPointerDown={(e) => { const r = box.current!.getBoundingClientRect(); drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (drag.current) setPos({ x: Math.max(0, Math.min(innerWidth - 120, e.clientX - drag.current.dx)), y: Math.max(0, Math.min(innerHeight - 60, e.clientY - drag.current.dy)) }); }}
        onPointerUp={() => { drag.current = null; }}>
        <span>தமிழ் · Tamil keyboard <small>(drag to move)</small></span>
        <button type="button" className="tkb-x" aria-label="Close keyboard" onPointerDown={(e) => e.stopPropagation()} onClick={() => setClosed(true)}>✕</button>
      </div>
      <div className="tkb-body">
        {ROWS.map((r) => (
          <div key={r.label} className="tkb-row">{r.keys.map((k) => (
            <button key={k} type="button" className={`tkb-k${r.label === "Vowel signs" ? " sign" : ""}`} onClick={() => type(k)}>{r.label === "Vowel signs" ? "க" + k : k}</button>
          ))}</div>
        ))}
        <div className="tkb-row">
          <button type="button" className="tkb-k wide" onClick={() => type(" ")}>Space</button>
          <button type="button" className="tkb-k wide" onClick={() => insert(target, "", true)}>⌫ Back</button>
        </div>
      </div>
    </div>
  );
}
