"use client";
import { useEffect, useRef, useState } from "react";

/** Small anchored menu that closes on outside click or Escape. The trigger gets the correct aria attributes. */
export function Popover({ trigger, children, align = "right", label }: { trigger: (props: { open: boolean; toggle: () => void; "aria-haspopup": "true"; "aria-expanded": boolean }) => React.ReactNode; children: (close: () => void) => React.ReactNode; align?: "left" | "right"; label?: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);

  return (
    <div className="popover" ref={box}>
      {trigger({ open, toggle: () => setOpen((o) => !o), "aria-haspopup": "true", "aria-expanded": open })}
      {open && <div className={`popover-panel ${align}`} role="menu" aria-label={label}>{children(() => setOpen(false))}</div>}
    </div>
  );
}
