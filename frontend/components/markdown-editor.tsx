"use client";
import { useState } from "react";
import { Markdown } from "./markdown";

/** Textarea with a Write/Preview toggle. Controlled, so callers can also drive it (for example mention pickers). */
export function MarkdownEditor({ value, onChange, rows = 5, placeholder, name, id }: { value: string; onChange: (value: string) => void; rows?: number; placeholder?: string; name?: string; id?: string }) {
  const [preview, setPreview] = useState(false);
  return (
    <div className="md-editor">
      <div className="md-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={!preview} className={!preview ? "on" : ""} onClick={() => setPreview(false)}>Write</button>
        <button type="button" role="tab" aria-selected={preview} className={preview ? "on" : ""} onClick={() => setPreview(true)}>Preview</button>
        <span className="muted md-hint">Markdown supported</span>
      </div>
      {preview ? <div className="md-preview">{value.trim() ? <Markdown>{value}</Markdown> : <p className="muted">Nothing to preview.</p>}</div>
        : <textarea id={id} name={name} rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={50000} />}
    </div>
  );
}
