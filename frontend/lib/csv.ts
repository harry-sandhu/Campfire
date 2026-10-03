/** Minimal RFC 4180 parser: quoted fields, escaped quotes and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

const alias: Record<string, string> = { title: "title", name: "title", summary: "title", description: "description", details: "description", priority: "priority", status: "status", "due date": "dueDate", due: "dueDate", duedate: "dueDate" };
const PRIORITIES = ["NO_PRIORITY", "LOW", "MEDIUM", "HIGH", "URGENT"];
const STATUSES = ["OPEN", "IN_PROGRESS", "IN_REVIEW", "WAITING", "BLOCKED", "COMPLETED", "CLOSED"];
const normalise = (value: string, allowed: string[]) => { const v = value.trim().toUpperCase().replace(/[\s-]+/g, "_"); return allowed.includes(v) ? v : undefined; };

/** Turns CSV text into import rows by matching header names (title, description, priority, status, due date). */
export function csvToTickets(text: string) {
  const [header, ...body] = parseCsv(text);
  if (!header) return { rows: [], skipped: 0, error: "The file is empty." };
  const columns = header.map((h) => alias[h.trim().toLowerCase()]);
  if (!columns.includes("title")) return { rows: [], skipped: 0, error: 'The first row must contain a "Title" column.' };
  let skipped = 0;
  const rows = body.flatMap((cells) => {
    const record: Record<string, string> = {};
    columns.forEach((key, index) => { if (key && cells[index] !== undefined) record[key] = cells[index]; });
    if (!record.title?.trim()) { skipped++; return []; }
    const date = record.dueDate ? new Date(record.dueDate) : null;
    return [{ title: record.title.trim(), description: record.description ?? "", priority: normalise(record.priority ?? "", PRIORITIES), status: normalise(record.status ?? "", STATUSES), dueDate: date && !isNaN(date.getTime()) ? date.toISOString() : null }];
  });
  return { rows, skipped, error: "" };
}
