/**
 * Engagement rate is stored as a fraction (0.045 = 4.5%). Display it as a
 * percentage, capped at "100%+" — small accounts can pull more likes +
 * comments than they have followers (reach from Explore / non-followers),
 * so the raw ratio can exceed 100% and read as a broken stat.
 *
 * Ported from saas-ripllo for the marketplace creator-profile components.
 */
export function formatEngagementRate(
  rate: number | null | undefined,
  decimals = 1,
): string {
  if (rate == null) return '—';
  const pct = rate * 100;
  if (pct > 100) return '100%+';
  return `${pct.toFixed(decimals)}%`;
}
