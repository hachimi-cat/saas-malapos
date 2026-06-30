/**
 * Indonesia administrative regions data — sourced from emsifa/api-wilayah-indonesia.
 * Served as static JSON from emsifa.com (HTTPS, CORS-enabled).
 *
 * Hierarchy: province → regency (kabupaten/kota) → district (kecamatan) → village (kelurahan).
 * IDs are string-typed numeric codes that chain: regency starts with province id, etc.
 * Names are UPPERCASE in the source — we title-case for display.
 */

const BASE = 'https://www.emsifa.com/api-wilayah-indonesia/api';

export interface Region {
  id: string;
  name: string;
}

function titleCase(name: string): string {
  return name
    .toLowerCase()
    .split(' ')
    .map((w) => w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w)
    .join(' ');
}

async function fetchRegion(url: string): Promise<Region[]> {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`emsifa ${res.status}`);
  const data = (await res.json()) as Array<{ id: string; name: string }>;
  return data.map((r) => ({ id: r.id, name: titleCase(r.name) }));
}

export async function fetchProvinces(): Promise<Region[]> {
  return fetchRegion(`${BASE}/provinces.json`);
}

export async function fetchRegencies(provinceId: string): Promise<Region[]> {
  return fetchRegion(`${BASE}/regencies/${provinceId}.json`);
}

export async function fetchDistricts(regencyId: string): Promise<Region[]> {
  return fetchRegion(`${BASE}/districts/${regencyId}.json`);
}

export async function fetchVillages(districtId: string): Promise<Region[]> {
  return fetchRegion(`${BASE}/villages/${districtId}.json`);
}

/**
 * Case-insensitive fuzzy name match. Google's addressComponents may return
 * "DKI Jakarta" while emsifa has "Dki Jakarta"; ignore accents/punctuation too.
 */
export function findRegionByName(regions: Region[], name: string | undefined): Region | null {
  if (!name) return null;
  const normalize = (s: string) => s.toLowerCase()
    .replace(/\bkota\b/g, '')
    .replace(/\bkabupaten\b/g, '')
    .replace(/\bkab\.?\b/g, '')
    .replace(/\bprovinsi\b/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const target = normalize(name);
  return regions.find((r) => normalize(r.name) === target)
      ?? regions.find((r) => normalize(r.name).includes(target) || target.includes(normalize(r.name)))
      ?? null;
}
