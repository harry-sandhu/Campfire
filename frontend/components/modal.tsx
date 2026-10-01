"use client";
import { useEffect, useRef } from "react";
import { Button, IconButton } from "./controls";
import { CloseIcon } from "./icons";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Accessible dialog: labelled, closes on Escape or backdrop click, traps Tab and restores focus on close. */
export function Modal({ title, eyebrow, onClose, wide, children }: { title: string; eyebrow?: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLElement>("input,select,textarea")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") return onClose();
      if (event.key !== "Tab" || !dialog.current) return;
      const items = Array.from(dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[var(--scrim)] p-4 backdrop-blur-[2px]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`max-h-[92vh] w-full animate-[pop_0.18s_ease-out] overflow-auto rounded-2xl border border-line-strong bg-card p-6 shadow-lg ${wide ? "max-w-3xl" : "max-w-lg"}`} role="dialog" aria-modal="true" aria-label={title} ref={dialog}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            {eyebrow && <span className="text-[11px] font-semibold uppercase tracking-widest text-muted">{eyebrow}</span>}
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          </div>
          <IconButton label="Close dialog" onClick={onClose} className="-mr-2 -mt-1"><CloseIcon /></IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = "Confirm", onConfirm, onClose }: { title: string; message: string; confirmLabel?: string; onConfirm: () => void | Promise<void>; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-muted">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="danger" onClick={async () => { await onConfirm(); onClose(); }}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}
