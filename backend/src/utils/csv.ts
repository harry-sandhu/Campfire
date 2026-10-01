/** Cells that spreadsheets would treat as formulas are prefixed with a quote so exports cannot run code. */
const safe = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
};

export const toCsv = (header: string[], rows: unknown[][]) => [header, ...rows].map((row) => row.map(safe).join(",")).join("\r\n") + "\r\n";
