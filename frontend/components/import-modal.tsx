"use client";
import { Button, Field, fieldClass } from "./controls";
import { ChangeEvent, useState } from "react";
import { api, json } from "../lib/api";
import { csvToTickets } from "../lib/csv";
import type { Group } from "../lib/types";
import { Modal } from "./modal";
import { useToast } from "./toast";
import { ErrorNote } from "./ui";

type Result = { created: number; errors: { row: number; error: string }[] };

export function ImportModal({ groups, defaultGroupId, onClose, onDone }: { groups: Group[]; defaultGroupId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [groupId, setGroupId] = useState(defaultGroupId);
  const [parsed, setParsed] = useState<ReturnType<typeof csvToTickets> | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) return setError("Choose a file under 1 MB.");
    setError("");
    setParsed(csvToTickets(await file.text()));
  }

  async function submit() {
    if (!parsed?.rows.length) return;
    setBusy(true);
    const totals: Result = { created: 0, errors: [] };
    try {
      for (let i = 0; i < parsed.rows.length; i += 200) {
        const batch = parsed.rows.slice(i, i + 200);
        const res = await api<Result>("/tickets/import", { method: "POST", body: json({ groupId: groupId || null, rows: batch }) });
        totals.created += res.created;
        totals.errors.push(...res.errors.map((e) => ({ ...e, row: e.row + i })));
      }
      setResult(totals);
      toast(`Imported ${totals.created} tickets`);
      onDone();
    } catch (e) { setError((e as Error).message); }
    setBusy(false);
  }

  return (
    <Modal title="Import tickets from CSV" eyebrow="Import" onClose={onClose}>
      <div className="grid gap-5">
        <p className="rounded-lg bg-info-soft px-4 py-3 text-[13px]">Use a header row with <strong>Title</strong> and optionally Description, Priority, Status and Due date. Exports from Campfire can be re-imported.</p>
        <Field label="Group">
          <select className={fieldClass} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">No group (private)</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </Field>
        <Field label="CSV file"><input className={`${fieldClass} file:mr-3 file:rounded file:border-0 file:bg-soft file:px-3 file:py-1 file:text-sm file:font-semibold`} type="file" accept=".csv,text/csv" onChange={pick} /></Field>
        {parsed?.error && <ErrorNote message={parsed.error} />}
        {parsed && !parsed.error && <p className="font-medium">{parsed.rows.length} tickets ready to import{parsed.skipped ? `, ${parsed.skipped} rows skipped (no title)` : ""}.</p>}
        {result && <div className="rounded-lg bg-success-soft px-4 py-3 text-sm">Created {result.created}. {result.errors.length ? `${result.errors.length} rows failed: ${result.errors.slice(0, 3).map((e) => `row ${e.row} (${e.error})`).join(", ")}` : "No errors."}</div>}
        <ErrorNote message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button disabled={busy || !parsed?.rows.length || !!result} onClick={() => void submit()}>{busy ? "Importing…" : "Import"}</Button>
        </div>
      </div>
    </Modal>
  );
}
