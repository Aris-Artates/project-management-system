// Placeholder mark: three stacked bars climbing to the right.
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      <rect x="7" y="19" width="10" height="4" rx="2" fill="var(--on-brand)" />
      <rect x="11" y="13" width="12" height="4" rx="2" fill="var(--on-brand)" opacity="0.85" />
      <rect x="15" y="7" width="10" height="4" rx="2" fill="var(--ember)" />
    </svg>
  );
}
