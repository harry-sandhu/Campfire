"use client";
import { useEffect, useId, useRef, useState } from "react";

export type FilterOption = { value: string; label: string };

/**
 * A filter that takes one or more options and can be flipped to "is not".
 * Example: Status, is not, Completed + Closed shows every ticket that is neither completed nor closed.
 */
export function MultiFilter({ name, allLabel, options, values, negate, onChange, className = "" }: {
  name: string;
  /** shown when nothing is picked, e.g. "All statuses" */
  allLabel: string;
  options: FilterOption[];
  values: string[];
  negate: boolean;
  onChange: (values: string[], negate: boolean) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const known = values.filter((v) => options.some((o) => o.value === v));
  const names = known.map((v) => options.find((o) => o.value === v)!.label);
  const summary = !known.length ? allLabel : `${negate ? "Not " : ""}${names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ")}`;
  const toggle = (value: string) => onChange(known.includes(value) ? known.filter((v) => v !== value) : [...known, value], negate);

  return (
    <div ref={box} className={`relative ${className}`}>
      <button type="button" aria-haspopup="true" aria-expanded={open} aria-label={`${name} filter: ${summary}`} data-active={known.length ? "true" : undefined}
        className={`inline-flex h-9 max-w-[260px] items-center gap-1.5 truncate rounded-lg border bg-card px-3 text-[13px] font-semibold transition hover:border-line-strong ${known.length ? (negate ? "border-danger text-ink" : "border-accent text-ink") : "border-line text-muted"}`}
        onClick={() => setOpen(!open)}>
        <span className="truncate">{summary}</span>
        <span aria-hidden className="text-muted">▾</span>
      </button>
      {open && (
        <div role="group" aria-labelledby={id} className="absolute left-0 z-30 mt-1 w-64 rounded-lg border border-line bg-card p-3 shadow-lg">
          <div id={id} className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{name}</div>
          <div className="mb-2 inline-flex w-full rounded-lg border border-line-strong bg-soft p-0.5" role="group" aria-label={`${name}: is or is not`}>
            {([[false, "Is"], [true, "Is not"]] as const).map(([flag, text]) => (
              <button key={text} type="button" aria-pressed={negate === flag} className={`h-8 flex-1 rounded-md border-0 text-[13px] font-semibold transition ${negate === flag ? "bg-card text-ink shadow-sm" : "bg-transparent text-muted hover:text-ink"}`} onClick={() => onChange(known, flag)}>{text}</button>
            ))}
          </div>
          <ul className="max-h-60 overflow-auto">
            {options.map((o) => (
              <li key={o.value}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[13px] hover:bg-soft">
                  <input type="checkbox" checked={known.includes(o.value)} onChange={() => toggle(o.value)} />
                  <span className="truncate">{o.label}</span>
                </label>
              </li>
            ))}
          </ul>
          <button type="button" className="mt-2 border-0 bg-transparent p-0 text-[13px] font-semibold text-accent underline disabled:text-muted disabled:no-underline" disabled={!known.length && !negate} onClick={() => onChange([], false)}>Clear</button>
        </div>
      )}
    </div>
  );
}

/** `a,b` in the web address to a list, and back. */
export const listParam = (value: string | null) => (value ?? "").split(",").map((x) => x.trim()).filter(Boolean);
