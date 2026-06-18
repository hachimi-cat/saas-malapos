/*
 * Malapos logomark — a sales receipt with a torn (zigzag) bottom and a
 * few line items: the universal point-of-sale motif (matches the violet
 * receipt tile in app/icon.svg). Stroke-based so it inherits currentColor
 * (violet --primary in chrome, white on dark surfaces). Honors `size` in
 * px so it works inside the portal-ui Sidebar, which sizes nav icons via
 * the lucide `size` prop.
 */
export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* receipt body with a torn bottom edge */}
      <path d="M6 3h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3L6 20V3Z" />
      {/* line items */}
      <path d="M9 7.5h6" />
      <path d="M9 11h6" />
      <path d="M9 14.5h3.5" />
    </svg>
  );
}
