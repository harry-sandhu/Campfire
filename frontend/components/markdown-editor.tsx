"use client";
import { useState } from "react";
import { Markdown } from "./markdown";

/** Textarea with a Write/Preview toggle. Controlled, so callers can also drive it (for example mention pickers). */
export function MarkdownEditor({ value, onChange, rows = 5, placeholder, name, id }: { value: string; onChange: (value: string) => void; rows?: number; placeholder?: string; name?: string; id?: string }) {
  const [preview, setPreview] = useState(false);
  const tab = (on: boolean) => `h-7 rounded-md border-0 px-3 text-xs font-semibold transition ${on ? "bg-card text-ink shadow-sm" : "bg-transparent text-muted hover:text-ink"}`;
  return (
    <div className="overflow-hidden rounded-lg border border-line-strong bg-field focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
      <div className="flex items-center gap-1 border-b border-line bg-soft px-2 py-1.5" role="tablist">
        <button type="button" role="tab" aria-selected={!preview} className={tab(!preview)} onClick={() => setPreview(false)}>Write</button>
        <button type="button" role="tab" aria-selected={preview} className={tab(preview)} onClick={() => setPreview(true)}>Preview</button>
        <span className="ml-auto text-[11px] text-muted">Markdown supported</span>
      </div>
      {preview ? <div className="min-h-24 p-3">{value.trim() ? <Markdown>{value}</Markdown> : <p className="text-muted">Nothing to preview.</p>}</div>
        : <textarea className="block w-full resize-y border-0 bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none" id={id} name={name} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={50000} />}
    </div>
  );
}
