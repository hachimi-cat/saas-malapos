/**
 * Places API (New) REST client — the Legacy autocomplete endpoint is not
 * enabled on our GCP project, so we can't use `google.maps.places.AutocompleteService`.
 * Docs: https://developers.google.com/maps/documentation/places/web-service/place-autocomplete
 *
 * The key is referrer-restricted, so these calls must originate from the
 * browser on an allowlisted origin (storlaunch.forjio.com, localhost:3000, …).
 */

export interface PlaceSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
  fullText: string;
}

function apiKey(): string {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';
}

export async function fetchAutocomplete(
  input: string,
  options: { sessionToken?: string; country?: string } = {},
): Promise<PlaceSuggestion[]> {
  const key = apiKey();
  if (!key || input.trim().length < 3) return [];
  const body: Record<string, unknown> = {
    input,
    includedRegionCodes: [options.country ?? 'id'],
  };
  if (options.sessionToken) body.sessionToken = options.sessionToken;

  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    suggestions?: Array<{
      placePrediction?: {
        placeId: string;
        text?: { text?: string };
        structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
      };
    }>;
  };
  return (data.suggestions ?? [])
    .filter((s) => s.placePrediction?.placeId)
    .map((s) => ({
      placeId: s.placePrediction!.placeId,
      mainText: s.placePrediction!.structuredFormat?.mainText?.text ?? s.placePrediction!.text?.text ?? '',
      secondaryText: s.placePrediction!.structuredFormat?.secondaryText?.text ?? '',
      fullText: s.placePrediction!.text?.text ?? '',
    }));
}

/**
 * Generate a session token — Google rate-limits + bills autocomplete-to-details
 * transactions as a single session. UUID v4 is fine; format doesn't matter.
 */
export function newSessionToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
