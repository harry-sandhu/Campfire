"use client";
import { useEffect, useRef, useState } from "react";
import type { Person } from "../lib/types";
import { fieldClass } from "./controls";
import { CheckIcon, ChevronIcon } from "./icons";
import { Avatar, AvatarStack } from "./ui";

/** Searchable multi-select for people, with avatars. Fully keyboard operable: it is a button that opens a list of checkable options. */
export function PersonPicker({ people, value, onChange, label = "Assign people", empty = "Nobody", disabled }: { people: Person[]; value: string[]; onChange: (ids: string[]) => void; label?: string; empty?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key, true); };
  }, [open]);

  const selected = people.filter((p) => value.includes(p.id));
  const shown = people.filter((p) => !query || `${p.name} ${p.email}`.toLowerCase().includes(query.toLowerCase()));
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="relative" ref={box}>
      <button type="button" className="flex min-h-9 w-full items-center justify-between gap-2 rounded-md border border-line-strong bg-field px-2.5 py-1 text-left text-sm font-medium text-ink transition hover:bg-hover disabled:opacity-60" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => { setOpen(!open); setQuery(""); }}>
        <span className="inline-flex min-w-0 items-center gap-2 overflow-hidden">{selected.length ? <><AvatarStack people={selected} max={4} /> <span className="truncate">{selected.length === 1 ? selected[0].name : `${selected.length} people`}</span></> : <span className="text-muted">{empty}</span>}</span>
        <ChevronIcon />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+4px)] z-40 min-w-60 animate-[pop_0.14s_ease-out] rounded-xl border border-line-strong bg-card p-2 shadow-lg">
          <input className={`${fieldClass} h-9`} type="search" autoFocus aria-label="Search people" placeholder="Search people…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <ul className="mt-1.5 max-h-56 list-none overflow-auto p-0" role="listbox" aria-multiselectable="true" aria-label={label}>
            {shown.map((p) => {
              const on = value.includes(p.id);
              return (
                <li key={p.id} role="option" aria-selected={on}>
                  <button type="button" className="flex w-full items-center gap-2 rounded-md border-0 bg-transparent px-2 py-1.5 text-left text-sm font-medium text-ink hover:bg-hover" onClick={() => toggle(p.id)}><Avatar name={p.name} size={24} /><span>{p.name}</span>{on && <span className="ml-auto text-accent"><CheckIcon /></span>}</button>
                </li>
              );
            })}
            {!shown.length && <li className="px-2 py-2 text-[13px] text-muted">No one matches.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
