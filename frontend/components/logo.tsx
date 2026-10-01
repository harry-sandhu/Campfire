/** Flat flame mark: two solid shapes, no gradients. */
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M16 3c1 5 7 8 7 14a7 7 0 0 1-14 0c0-3 1.5-5 3.5-7 .3 2 1.2 3 2.5 3.3C14.5 9 15 6 16 3z" fill="var(--logo-flame, #d9622b)" />
      <path d="M16 16c.7 2.5 3 3.6 3 6a3 3 0 0 1-6 0c0-1.6.9-2.7 1.8-3.5.3 1 .8 1.3 1.3 1.4-.2-1.4-.1-2.8-.1-3.9z" fill="var(--logo-core, #f6d9a6)" />
    </svg>
  );
}
