"use client";
import { useEffect, useRef, useState } from "react";
import type { Person } from "../lib/types";
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
    <div className="picker" ref={box}>
      <button type="button" className="picker-trigger secondary" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-label={label} onClick={() => { setOpen(!open); setQuery(""); }}>
        <span className="picker-value">{selected.length ? <><AvatarStack people={selected} max={4} /> <span>{selected.length === 1 ? selected[0].name : `${selected.length} people`}</span></> : <span className="muted">{empty}</span>}</span>
        <ChevronIcon />
      </button>
      {open && (
        <div className="picker-panel">
          <input type="search" autoFocus aria-label="Search people" placeholder="Search people…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <ul className="picker-list" role="listbox" aria-multiselectable="true" aria-label={label}>
            {shown.map((p) => {
              const on = value.includes(p.id);
              return (
                <li key={p.id} role="option" aria-selected={on}>
                  <button type="button" className="picker-option" onClick={() => toggle(p.id)}><Avatar name={p.name} size={22} /><span>{p.name}</span>{on && <span className="tick"><CheckIcon /></span>}</button>
                </li>
              );
            })}
            {!shown.length && <li className="muted note">No one matches.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
