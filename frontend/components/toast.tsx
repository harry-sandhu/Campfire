"use client";
import { createContext, useCallback, useContext, useState } from "react";

type Action = { label: string; run: () => void | Promise<void> };
type Toast = { id: number; message: string; kind: "success" | "error"; action?: Action };
type Push = (message: string, kind?: Toast["kind"], action?: Action) => void;

const ToastContext = createContext<Push>(() => undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);
  const push = useCallback<Push>((message, kind = "success", action) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, kind, action }]);
    // Toasts with an Undo stay a little longer so there is time to react.
    setTimeout(() => dismiss(id), action ? 8000 : 4000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="fixed bottom-24 left-3 right-3 z-[60] grid gap-2 md:bottom-6 md:left-auto md:right-6" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`flex max-w-sm animate-[pop_0.18s_ease-out] items-center justify-between gap-4 rounded-lg px-4 py-3 text-sm shadow-lg ${toast.kind === "error" ? "bg-danger text-card" : "bg-coal text-[#f3ebdd]"}`}>
            <span>{toast.message}</span>
            {toast.action && <button type="button" className="rounded px-1 font-semibold text-amber underline-offset-2 hover:underline" onClick={async () => { dismiss(toast.id); await toast.action!.run(); }}>{toast.action.label}</button>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
