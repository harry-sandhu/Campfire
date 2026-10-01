/** Campfire mark: three nested flames resting on crossed logs. Colours come from theme tokens so it suits light and dark. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M16 2.5c1.2 4.6 7.6 7.6 7.6 14.2A7.6 7.6 0 0 1 8.4 16.7c0-3.2 1.7-5.4 3.8-7.5.3 2.2 1.3 3.4 2.8 3.7C14.4 9.4 14.9 5.7 16 2.5z" fill="var(--logo-flame)" />
      <path d="M16 11.5c.9 3 4 4.4 4 7.7a4 4 0 0 1-8 0c0-2 1.1-3.4 2.3-4.5.4 1.2 1 1.7 1.7 1.8-.3-1.7-.1-3.5 0-5z" fill="var(--logo-mid)" />
      <path d="M16 18c.5 1.5 2 2.1 2 3.7a2 2 0 0 1-4 0c0-1 .6-1.8 1.2-2.3.2.6.5.8.8.9-.1-.8-.1-1.6 0-2.3z" fill="var(--logo-core)" />
      <path d="M5 27.2 25.6 22" stroke="var(--logo-wood)" strokeWidth="3" strokeLinecap="round" />
      <path d="M6.4 22 27 27.2" stroke="var(--logo-wood)" strokeWidth="3" strokeLinecap="round" opacity="0.85" />
    </svg>
  );
}
