import { forwardRef } from "react";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

const base = "inline-flex font-semibold items-center justify-center gap-2 rounded-md border font-semibold leading-none whitespace-nowrap transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 active:translate-y-px";
const variants = {
  primary: "border-transparent bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "border-line-strong bg-card text-ink hover:bg-hover",
  ghost: "border-transparent bg-transparent text-muted hover:bg-hover hover:text-ink",
  danger: "border-transparent bg-danger text-card hover:brightness-95",
  subtle: "border-transparent bg-accent-soft text-accent hover:brightness-95",
} as const;
const sizes = { sm: "h-8 px-2.5 text-[13px]", md: "h-9 px-3.5 text-sm", lg: "h-11 px-5 text-[15px]" } as const;

export type ButtonVariant = keyof typeof variants;
export const buttonClass = (variant: ButtonVariant = "primary", size: keyof typeof sizes = "md", extra?: string) => cx(base, variants[variant], sizes[size], extra);

export const Button = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: keyof typeof sizes }>(
  ({ variant = "primary", size = "md", className, type = "button", ...rest }, ref) => <button ref={ref} type={type} className={buttonClass(variant, size, className)} {...rest} />,
);
Button.displayName = "Button";

export const IconButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(
  ({ label, className, type = "button", ...rest }, ref) => (
    <button ref={ref} type={type} aria-label={label} title={label} className={cx("relative inline-grid size-9 place-items-center rounded-md border-0 bg-transparent p-0 text-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent", className)} {...rest} />
  ),
);
IconButton.displayName = "IconButton";

export const fieldClass = "w-full rounded-md border border-line-strong bg-field px-3 py-2 text-sm text-ink placeholder:text-muted/80 transition focus:border-accent focus:outline-2 focus:outline-accent/40 focus:outline-offset-0";
export const menuItemClass = "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm font-medium text-ink transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:outline-none";
export const panelClass = "rounded-lg border border-line bg-card shadow-sm";
export const kbdClass = "rounded border border-b-2 border-line-strong bg-card px-1.5 font-mono text-xs font-normal text-muted";

export const labelClass = "grid gap-1.5 text-sm font-semibold text-ink";
export const hintClass = "text-[13px] text-muted";
/** Label wrapping a control, so clicking the text focuses the control. */
export const Field = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => <label className={cx(labelClass, className)}><span>{label}</span>{children}</label>;

export const rowClass = "flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 last:border-0";
export const textButtonClass = "rounded text-[13px] font-semibold text-accent hover:underline disabled:opacity-50";
export const Badge = ({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "accent" | "danger" | "success" }) => (
  <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold", tone === "neutral" && "bg-soft text-muted", tone === "accent" && "bg-accent-soft text-accent", tone === "danger" && "bg-danger-soft text-danger", tone === "success" && "bg-success-soft text-pine")}>{children}</span>
);

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string }[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={cx("-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors", value === t.id ? "border-flame text-ink" : "border-transparent text-muted hover:text-ink")}>{t.label}</button>
      ))}
    </div>
  );
}

export const thClass = "border-b border-line bg-soft/60 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-widest text-muted";
export const tdClass = "border-b border-line px-4 py-3 align-top text-sm";
