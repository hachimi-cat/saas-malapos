/** Format whole-IDR integers as "Rp 1.234.567" (id-ID grouping). */
export function rupiah(n: number): string {
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
}

/** Parse a loosely-typed rupiah input ("15.000", "15000", "Rp 15.000") to int. */
export function parseRupiah(s: string): number {
  const digits = s.replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}
