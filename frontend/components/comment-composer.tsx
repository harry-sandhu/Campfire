"use client";
import { useRef, useState } from "react";
import type { Person } from "../lib/types";

/** Comment box with @mention suggestions. Only mentions still present in the text are sent. */
export function CommentComposer({ people, onSubmit }: { people: Person[]; onSubmit: (body: string, mentionIds: string[]) => Promise<void> }) {
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<Person[]>([]);
  const [suggest, setSuggest] = useState<{ query: string; start: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  const matches = suggest ? people.filter((p) => p.name.toLowerCase().includes(suggest.query.toLowerCase())).slice(0, 6) : [];

  function onChange(value: string, caret: number) {
    setBody(value);
    const before = value.slice(0, caret);
    const match = before.match(/(?:^|\s)@([\w .'-]{0,30})$/);
    setSuggest(match ? { query: match[1], start: caret - match[1].length - 1 } : null);
  }

  function pick(person: Person) {
    if (!suggest) return;
    const caret = field.current?.selectionStart ?? body.length;
    const next = `${body.slice(0, suggest.start)}@${person.name} ${body.slice(caret)}`;
    setBody(next);
    setMentions((m) => (m.some((x) => x.id === person.id) ? m : [...m, person]));
    setSuggest(null);
    field.current?.focus();
  }

  async function submit() {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      await onSubmit(body, mentions.filter((m) => body.includes(`@${m.name}`)).map((m) => m.id));
      setBody("");
      setMentions([]);
    } finally { setBusy(false); }
  }

  return (
    <div className="composer">
      <textarea ref={field} rows={3} value={body} aria-label="New comment" placeholder="Write a comment… use @ to mention someone. Markdown supported." maxLength={10000}
        onChange={(e) => onChange(e.target.value, e.target.selectionStart)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void submit(); } if (e.key === "Escape") setSuggest(null); }} />
      {matches.length > 0 && (
        <ul className="mention-list" role="listbox" aria-label="Mention suggestions">
          {matches.map((p) => <li key={p.id} role="option" aria-selected={false}><button type="button" className="ghost" onMouseDown={(e) => { e.preventDefault(); pick(p); }}>{p.name}</button></li>)}
        </ul>
      )}
      <div className="composer-foot"><small className="muted">Ctrl+Enter to send</small><button type="button" disabled={busy || !body.trim()} onClick={() => void submit()}>{busy ? "Sending…" : "Comment"}</button></div>
    </div>
  );
}
