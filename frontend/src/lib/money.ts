/** Format whole-IDR integers as "Rp 1.234.567" (id-ID grouping). */
export function rupiah(n: number): string {
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
}

/** Format US cents as "$7" / "$7.50". USD is cents, IDR is whole rupiah —
 *  every formatter has to know which (the two differ ~160x). */
export function usd(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Parse a loosely-typed rupiah input ("15.000", "15000", "Rp 15.000") to int. */
export function parseRupiah(s: string): number {
  const digits = s.replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}
