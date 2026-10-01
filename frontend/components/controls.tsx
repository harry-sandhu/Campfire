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
