"use client";
import { useEffect, useRef } from "react";

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
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} ref={dialog}>
        <div className="modal-head">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2>{title}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = "Confirm", onConfirm, onClose }: { title: string; message: string; confirmLabel?: string; onConfirm: () => void | Promise<void>; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">{message}</p>
      <div className="modal-actions">
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="danger" onClick={async () => { await onConfirm(); onClose(); }}>{confirmLabel}</button>
      </div>
    </Modal>
  );
}
