'use client';

/**
 * LocationForm — full Indonesia-aware location picker.
 *
 * Features:
 *   1. Google Places Autocomplete (debounced, no search button, live dropdown)
 *   2. Interactive map with draggable pin — click/drag to fine-tune coords
 *   3. Cascading searchable dropdowns: Province → Regency → District → Village
 *      (emsifa/api-wilayah-indonesia — 38 provinces, ~514 cities, ~7k districts,
 *      ~83k villages — searchable combobox each)
 *   4. Street-address textarea with explicit "do not include admin levels" hint
 *   5. Postal + latitude + longitude fields (numeric inputs)
 *   6. Selecting a Google place auto-populates EVERY field: parses address
 *      components → matches against emsifa names → selects the cascading
 *      dropdowns by ID → drops the pin.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider, Map, AdvancedMarker, useMap, useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { MapPin, Search, Loader2, AlertCircle } from 'lucide-react';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  fetchProvinces, fetchRegencies, fetchDistricts, fetchVillages, findRegionByName,
  type Region,
} from '@/lib/indonesia-regions';
import { fetchAutocomplete, newSessionToken, type PlaceSuggestion } from '@/lib/google-places';

export interface LocationValue {
  address: string;
  province: string | null;
  city: string | null;
  district: string | null;
  village: string | null;
  postal: string | null;
  lat: number | null;
  lng: number | null;
  note: string | null;
}

export interface LocationFormProps {
  value: LocationValue;
  onChange: (next: LocationValue) => void;
  className?: string;
}

const DEFAULT_CENTER = { lat: -6.2088, lng: 106.8456 }; // Jakarta

export function LocationForm({ value, onChange, className }: LocationFormProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
  if (!apiKey) {
    return (
      <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Map picker disabled — <code>NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> not set.</span>
      </div>
    );
  }
  return (
    <APIProvider apiKey={apiKey} libraries={['places', 'geocoding', 'marker']}>
      <LocationFormInner value={value} onChange={onChange} className={className} />
    </APIProvider>
  );
}

function LocationFormInner({ value, onChange, className }: LocationFormProps) {
  const geocodingLib = useMapsLibrary('geocoding');
  const geocoder = useMemo(() => (geocodingLib ? new geocodingLib.Geocoder() : null), [geocodingLib]);

  // ─── Google Places search state (Places API New via REST) ─────────
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const sessionTokenRef = useRef<string>(newSessionToken());
  const searchRef = useRef<HTMLDivElement>(null);

  // Hide suggestions on click outside the search widget.
  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (!searchRef.current?.contains(e.target as Node)) setSearchOpen(false);
    }
    if (searchOpen) document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [searchOpen]);

  useEffect(() => {
    if (!query || query.trim().length < 3) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await fetchAutocomplete(query, { sessionToken: sessionTokenRef.current });
        setSuggestions(results);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // ─── Cascading region dropdowns ────────────────────────────────────
  const [provinces, setProvinces] = useState<Region[]>([]);
  const [regencies, setRegencies] = useState<Region[]>([]);
  const [districts, setDistricts] = useState<Region[]>([]);
  const [villages, setVillages] = useState<Region[]>([]);
  const [loadingProvinces, setLoadingProvinces] = useState(true);
  const [loadingRegencies, setLoadingRegencies] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingVillages, setLoadingVillages] = useState(false);

  // Selected IDs (distinct from display names in `value.*`)
  const [provinceId, setProvinceId] = useState<string | null>(null);
  const [regencyId, setRegencyId] = useState<string | null>(null);
  const [districtId, setDistrictId] = useState<string | null>(null);
  const [villageId, setVillageId] = useState<string | null>(null);

  // Load provinces on mount.
  useEffect(() => {
    fetchProvinces()
      .then(setProvinces)
      .finally(() => setLoadingProvinces(false));
  }, []);

  // Hydrate IDs from names on first render (when loading existing data from DB).
  useEffect(() => {
    if (value.province && provinces.length > 0 && !provinceId) {
      const p = findRegionByName(provinces, value.province);
      if (p) setProvinceId(p.id);
    }
  }, [provinces, value.province, provinceId]);

  useEffect(() => {
    if (!provinceId) { setRegencies([]); return; }
    setLoadingRegencies(true);
    fetchRegencies(provinceId)
      .then(setRegencies)
      .finally(() => setLoadingRegencies(false));
  }, [provinceId]);

  useEffect(() => {
    if (value.city && regencies.length > 0 && !regencyId) {
      const r = findRegionByName(regencies, value.city);
      if (r) setRegencyId(r.id);
    }
  }, [regencies, value.city, regencyId]);

  useEffect(() => {
    if (!regencyId) { setDistricts([]); return; }
    setLoadingDistricts(true);
    fetchDistricts(regencyId)
      .then(setDistricts)
      .finally(() => setLoadingDistricts(false));
  }, [regencyId]);

  useEffect(() => {
    if (value.district && districts.length > 0 && !districtId) {
      const d = findRegionByName(districts, value.district);
      if (d) setDistrictId(d.id);
    }
  }, [districts, value.district, districtId]);

  useEffect(() => {
    if (!districtId) { setVillages([]); return; }
    setLoadingVillages(true);
    fetchVillages(districtId)
      .then(setVillages)
      .finally(() => setLoadingVillages(false));
  }, [districtId]);

  useEffect(() => {
    if (value.village && villages.length > 0 && !villageId) {
      const v = findRegionByName(villages, value.village);
      if (v) setVillageId(v.id);
    }
  }, [villages, value.village, villageId]);

  // ─── Auto-populate from Google place pick ──────────────────────────
  const onSelectPlace = useCallback(async (placeId: string, description: string) => {
    setSuggestions([]);
    setSearchOpen(false);
    setQuery(description);
    if (!geocoder) return;
    geocoder.geocode({ placeId }, async (results, status) => {
      if (status !== 'OK' || !results?.[0]) return;
      const r = results[0];
      const loc = r.geometry.location;
      const lat = loc.lat();
      const lng = loc.lng();

      // Parse address components into our admin levels.
      const comp = (type: string): string | undefined =>
        r.address_components?.find((c) => c.types.includes(type))?.long_name;

      const provinceName = comp('administrative_area_level_1');
      const cityName = comp('administrative_area_level_2');
      const districtName = comp('administrative_area_level_3') ?? comp('administrative_area_level_4');
      const villageName = comp('administrative_area_level_4') ?? comp('sublocality_level_1') ?? comp('sublocality');
      const postal = comp('postal_code');
      // Street number + route — the "address" line minus all admin levels.
      const streetNumber = comp('street_number');
      const route = comp('route');
      const street = [streetNumber, route].filter(Boolean).join(' ').trim();
      const address = street || r.formatted_address?.split(',')[0].trim() || '';

      onChange({
        address,
        province: provinceName ?? null,
        city: cityName ?? null,
        district: districtName ?? null,
        village: villageName ?? null,
        postal: postal ?? null,
        lat, lng,
        note: value.note,
      });

      // Now resolve names → IDs in the cascade. We load each level if needed.
      if (provinceName) {
        const provs = provinces.length > 0 ? provinces : await fetchProvinces();
        if (provinces.length === 0) setProvinces(provs);
        const p = findRegionByName(provs, provinceName);
        if (p) {
          setProvinceId(p.id);
          if (cityName) {
            const regs = await fetchRegencies(p.id);
            setRegencies(regs);
            const reg = findRegionByName(regs, cityName);
            if (reg) {
              setRegencyId(reg.id);
              if (districtName) {
                const dists = await fetchDistricts(reg.id);
                setDistricts(dists);
                const dist = findRegionByName(dists, districtName);
                if (dist) {
                  setDistrictId(dist.id);
                  if (villageName) {
                    const vils = await fetchVillages(dist.id);
                    setVillages(vils);
                    const vil = findRegionByName(vils, villageName);
                    if (vil) setVillageId(vil.id);
                  }
                }
              }
            }
          }
        }
      }
    });
    // Rotate the session token after a selection — Google bills per-session.
    sessionTokenRef.current = newSessionToken();
  }, [geocoder, onChange, provinces, value.note]);

  // ─── Manual dropdown selection resets dependent levels + emits change ───
  function onPickProvince(id: string | null) {
    setProvinceId(id);
    setRegencyId(null); setDistrictId(null); setVillageId(null);
    setRegencies([]); setDistricts([]); setVillages([]);
    const name = provinces.find((p) => p.id === id)?.name ?? null;
    onChange({ ...value, province: name, city: null, district: null, village: null });
  }
  function onPickRegency(id: string | null) {
    setRegencyId(id);
    setDistrictId(null); setVillageId(null);
    setDistricts([]); setVillages([]);
    const name = regencies.find((r) => r.id === id)?.name ?? null;
    onChange({ ...value, city: name, district: null, village: null });
  }
  function onPickDistrict(id: string | null) {
    setDistrictId(id);
    setVillageId(null);
    setVillages([]);
    const name = districts.find((d) => d.id === id)?.name ?? null;
    onChange({ ...value, district: name, village: null });
  }
  function onPickVillage(id: string | null) {
    setVillageId(id);
    const name = villages.find((v) => v.id === id)?.name ?? null;
    onChange({ ...value, village: name });
  }

  // ─── Map click / drag → reverse geocode ───────────────────────────
  function onMapPinChange(lat: number, lng: number) {
    if (!geocoder) { onChange({ ...value, lat, lng }); return; }
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status === 'OK' && results?.[0]) {
        const r = results[0];
        const postal = r.address_components?.find((c) => c.types.includes('postal_code'))?.long_name;
        onChange({ ...value, lat, lng, postal: postal ?? value.postal });
      } else {
        onChange({ ...value, lat, lng });
      }
    });
  }

  const center = value.lat != null && value.lng != null
    ? { lat: value.lat, lng: value.lng }
    : DEFAULT_CENTER;

  return (
    <div className={className ?? 'space-y-4'}>
      {/* ─── Search ──────────────────────────────────────────── */}
      <div className="relative" ref={searchRef}>
        <label className="mb-1 block text-xs font-medium">Search address or place</label>
        <div className="flex items-center gap-2 rounded border border-border bg-background px-3 py-2">
          {searching
            ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            : <Search className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchOpen(true)}
            placeholder="e.g. Jl. Parkit No. 48, Bengkulu"
            className="w-full bg-transparent text-sm focus:outline-none"
            aria-label="Address search"
          />
        </div>
        {searchOpen && suggestions.length > 0 && (
          <ul role="listbox" className="absolute left-0 right-0 top-full z-10 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
            {suggestions.map((s) => (
              <li key={s.placeId}>
                <button
                  type="button"
                  onClick={() => onSelectPlace(s.placeId, s.fullText || s.mainText)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <div className="font-medium">{s.mainText}</div>
                  {s.secondaryText && <div className="text-xs text-muted-foreground">{s.secondaryText}</div>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Picking a result fills street, province, city, kecamatan, kelurahan, postal code, and map pin.
        </p>
      </div>

      {/* ─── Address textarea ──────────────────────────────────── */}
      <div>
        <label htmlFor="street" className="mb-1 block text-xs font-medium">
          Street address <span className="text-red-500">*</span>
        </label>
        <textarea
          id="street" rows={2}
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
          placeholder="e.g. Jl. Parkit No. 48, RT 03 RW 05 — do NOT include province, city, kecamatan, or kelurahan (fill those below)"
          className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          required
        />
      </div>

      {/* ─── Admin hierarchy dropdowns ─────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2">
        <SearchableSelect
          label="Province"
          value={provinceId}
          options={provinces.map((p) => ({ value: p.id, label: p.name }))}
          onChange={onPickProvince}
          placeholder={loadingProvinces ? 'Loading…' : 'Select province'}
          loading={loadingProvinces}
          required
        />
        <SearchableSelect
          label="City / Regency"
          value={regencyId}
          options={regencies.map((r) => ({ value: r.id, label: r.name }))}
          onChange={onPickRegency}
          placeholder={!provinceId ? 'Select province first' : loadingRegencies ? 'Loading…' : 'Select city'}
          disabled={!provinceId || loadingRegencies}
          loading={loadingRegencies}
          required
        />
        <SearchableSelect
          label="District (Kecamatan)"
          value={districtId}
          options={districts.map((d) => ({ value: d.id, label: d.name }))}
          onChange={onPickDistrict}
          placeholder={!regencyId ? 'Select city first' : loadingDistricts ? 'Loading…' : 'Select district'}
          disabled={!regencyId || loadingDistricts}
          loading={loadingDistricts}
          required
        />
        <SearchableSelect
          label="Sub-district (Kelurahan)"
          value={villageId}
          options={villages.map((v) => ({ value: v.id, label: v.name }))}
          onChange={onPickVillage}
          placeholder={!districtId ? 'Select district first' : loadingVillages ? 'Loading…' : 'Select sub-district'}
          disabled={!districtId || loadingVillages}
          loading={loadingVillages}
          required
        />
      </div>

      {/* ─── Courier note ──────────────────────────────────────── */}
      <div>
        <label htmlFor="origin-note" className="mb-1 block text-xs font-medium">
          Notes for courier <span className="text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="origin-note" rows={2}
          value={value.note ?? ''}
          onChange={(e) => onChange({ ...value, note: e.target.value || null })}
          placeholder="e.g. across warung nasi Bu Yem, next to car wash, gate has green paint"
          className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Landmark hints shown to the pickup courier — helps them find the spot fast.
        </p>
      </div>

      {/* ─── Postal + lat/lng ──────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="postal" className="mb-1 block text-xs font-medium">Postal code</label>
          <input
            id="postal" type="text" value={value.postal ?? ''}
            onChange={(e) => onChange({ ...value, postal: e.target.value || null })}
            placeholder="40111"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <NumericField
          label="Latitude" value={value.lat} placeholder="-6.2088"
          onChange={(n) => onMapPinChange(n, value.lng ?? DEFAULT_CENTER.lng)}
        />
        <NumericField
          label="Longitude" value={value.lng} placeholder="106.8456"
          onChange={(n) => onMapPinChange(value.lat ?? DEFAULT_CENTER.lat, n)}
        />
      </div>

      {/* ─── Map ────────────────────────────────────────────────── */}
      <div>
        <label className="mb-1 block text-xs font-medium">Map — click or drag the pin to adjust</label>
        <div className="h-64 w-full overflow-hidden rounded-lg border border-border">
          <Map
            defaultCenter={center}
            defaultZoom={value.lat != null ? 15 : 11}
            mapId="fulkruma-location-form"
            gestureHandling="greedy"
            clickableIcons={false}
            onClick={(e) => {
              if (e.detail.latLng) onMapPinChange(e.detail.latLng.lat, e.detail.latLng.lng);
            }}
          >
            <RecenterOnValue lat={value.lat} lng={value.lng} />
            {value.lat != null && value.lng != null && (
              <AdvancedMarker
                position={{ lat: value.lat, lng: value.lng }}
                draggable
                onDragEnd={(e) => {
                  const p = e.latLng;
                  if (p) onMapPinChange(p.lat(), p.lng());
                }}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                  <MapPin className="h-4 w-4" />
                </div>
              </AdvancedMarker>
            )}
          </Map>
        </div>
      </div>
    </div>
  );
}

function RecenterOnValue({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (!map || lat == null || lng == null) return;
    map.panTo({ lat, lng });
    if ((map.getZoom() ?? 10) < 13) map.setZoom(15);
  }, [map, lat, lng]);
  return null;
}

function NumericField({ label, value, placeholder, onChange }: {
  label: string; value: number | null; placeholder?: string; onChange: (n: number) => void;
}) {
  const [text, setText] = useState(value != null ? String(value) : '');
  useEffect(() => { setText(value != null ? String(value) : ''); }, [value]);
  return (
    <div>
      <label className="mb-1 block text-xs font-medium">{label}</label>
      <input
        type="text" inputMode="decimal" value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = Number(text);
          if (!Number.isNaN(n) && n !== 0) onChange(n);
        }}
        placeholder={placeholder}
        className="w-full rounded border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      />
    </div>
  );
}
