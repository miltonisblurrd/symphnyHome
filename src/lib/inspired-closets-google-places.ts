/**
 * Google Maps address lookup for Des intake.
 * Places Autocomplete + Place Details, with Geocoding so a full street
 * (e.g. 1541 Spotted Pony Drive) resolves to the Las Vegas match.
 */
export type AddressParts = {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

export type PlaceSuggestion = {
  id: string;
  label: string;
  provider: "google";
  parts?: AddressParts;
};

const LAS_VEGAS = { lat: 36.1699, lng: -115.1398 };
const STATE_ABBR: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
};

export function mapsKey(): string | null {
  return (
    process.env.INSPIRED_CLOSETS_GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    null
  );
}

function toStateAbbr(value: string | undefined | null): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return STATE_ABBR[trimmed.toLowerCase()] ?? trimmed;
}

function streetLine(number: string | undefined, route: string | undefined): string {
  return [number, route].filter(Boolean).join(" ").trim();
}

type GoogleComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

function component(parts: GoogleComponent[], type: string, short = false): string {
  const found = parts.find((c) => c.types?.includes(type));
  if (!found) return "";
  return (short ? found.short_name : found.long_name) ?? "";
}

function partsFromGoogle(components: GoogleComponent[]): AddressParts {
  const street = streetLine(
    component(components, "street_number"),
    component(components, "route"),
  );
  const city =
    component(components, "locality") ||
    component(components, "sublocality") ||
    component(components, "postal_town") ||
    component(components, "neighborhood") ||
    component(components, "administrative_area_level_2");
  return {
    street,
    city,
    state: toStateAbbr(component(components, "administrative_area_level_1", true)),
    zip: component(components, "postal_code"),
    country: component(components, "country") || "United States",
  };
}

function labelFromParts(parts: AddressParts, fallback: string): string {
  const line = [parts.street, [parts.city, parts.state].filter(Boolean).join(", "), parts.zip]
    .filter(Boolean)
    .join(", ");
  return line || fallback;
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/,?\s*usa$/, "").replace(/\s+/g, " ").trim();
}

type GooglePrediction = {
  description?: string;
  place_id?: string;
};

async function googleAutocompleteClassic(query: string): Promise<PlaceSuggestion[]> {
  const key = mapsKey();
  if (!key) return [];
  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", query);
  url.searchParams.set("types", "address");
  url.searchParams.set("components", "country:us");
  url.searchParams.set("location", `${LAS_VEGAS.lat},${LAS_VEGAS.lng}`);
  url.searchParams.set("radius", "80000");
  url.searchParams.set("language", "en");
  url.searchParams.set("region", "us");
  url.searchParams.set("key", key);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return [];
  const payload = (await response.json()) as {
    status?: string;
    predictions?: GooglePrediction[];
  };
  if (payload.status !== "OK" && payload.status !== "ZERO_RESULTS") return [];
  return (payload.predictions ?? [])
    .filter((p) => p.place_id && p.description)
    .map((p) => ({
      id: `g:${p.place_id}`,
      label: p.description as string,
      provider: "google" as const,
    }));
}

type NewPrediction = {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
    structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
  };
};

async function googleAutocompleteNew(query: string): Promise<PlaceSuggestion[]> {
  const key = mapsKey();
  if (!key) return [];
  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
    },
    body: JSON.stringify({
      input: query,
      includedRegionCodes: ["us"],
      languageCode: "en",
      locationBias: {
        circle: {
          center: { latitude: LAS_VEGAS.lat, longitude: LAS_VEGAS.lng },
          radius: 80000.0,
        },
      },
    }),
  });
  if (!response.ok) return [];
  const payload = (await response.json()) as { suggestions?: NewPrediction[] };
  return (payload.suggestions ?? [])
    .map((item) => {
      const pred = item.placePrediction;
      if (!pred?.placeId) return null;
      const main = pred.structuredFormat?.mainText?.text;
      const secondary = pred.structuredFormat?.secondaryText?.text;
      const label =
        main && secondary ? `${main}, ${secondary}` : pred.text?.text ?? main ?? "";
      if (!label) return null;
      return {
        id: `g:${pred.placeId}`,
        label,
        provider: "google" as const,
      };
    })
    .filter((row): row is PlaceSuggestion => Boolean(row));
}

async function googleGeocode(query: string): Promise<PlaceSuggestion | null> {
  const key = mapsKey();
  if (!key) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("components", "country:US");
  url.searchParams.set("bounds", "35.90,-115.55|36.45,-114.70");
  url.searchParams.set("region", "us");
  url.searchParams.set("language", "en");
  url.searchParams.set("key", key);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      place_id?: string;
      address_components?: GoogleComponent[];
      geometry?: { location?: { lat?: number; lng?: number } };
    }>;
  };
  if (payload.status !== "OK" || !payload.results?.length) return null;
  const ranked = [...payload.results].sort((a, b) => {
    const aNv = component(a.address_components ?? [], "administrative_area_level_1", true) === "NV";
    const bNv = component(b.address_components ?? [], "administrative_area_level_1", true) === "NV";
    if (aNv !== bNv) return aNv ? -1 : 1;
    return 0;
  });
  const best = ranked[0];
  if (!best?.place_id || !best.address_components) return null;
  const parts = partsFromGoogle(best.address_components);
  if (!parts.street) return null;
  return {
    id: `g:${best.place_id}`,
    label: labelFromParts(parts, best.formatted_address ?? parts.street),
    provider: "google",
    parts,
  };
}

async function googleDetails(placeId: string): Promise<AddressParts | null> {
  const key = mapsKey();
  if (!key) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "address_component,formatted_address");
  url.searchParams.set("key", key);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    status?: string;
    result?: { address_components?: GoogleComponent[] };
  };
  if (payload.status === "OK" && payload.result?.address_components) {
    return partsFromGoogle(payload.result.address_components);
  }

  const newer = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "addressComponents,formattedAddress",
    },
  });
  if (!newer.ok) return null;
  const body = (await newer.json()) as {
    formattedAddress?: string;
    addressComponents?: Array<{
      longText?: string;
      shortText?: string;
      types?: string[];
    }>;
  };
  if (!body.addressComponents?.length) return null;
  return partsFromGoogle(
    body.addressComponents.map((c) => ({
      long_name: c.longText,
      short_name: c.shortText,
      types: c.types,
    })),
  );
}

export async function suggestAddresses(query: string): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3 || !mapsKey()) return [];

  const [geocoded, classic, newer] = await Promise.all([
    googleGeocode(trimmed).catch(() => null),
    googleAutocompleteClassic(trimmed).catch(() => [] as PlaceSuggestion[]),
    googleAutocompleteNew(trimmed).catch(() => [] as PlaceSuggestion[]),
  ]);

  const merged: PlaceSuggestion[] = [];
  const seen = new Set<string>();
  for (const item of [geocoded, ...newer, ...classic]) {
    if (!item) continue;
    const key = item.id || normalizeLabel(item.label);
    if (seen.has(key) || seen.has(normalizeLabel(item.label))) continue;
    seen.add(key);
    seen.add(normalizeLabel(item.label));
    merged.push(item);
  }
  return merged.slice(0, 6);
}

export async function resolvePlace(id: string): Promise<AddressParts | null> {
  if (id.startsWith("g:")) return googleDetails(id.slice(2));
  return null;
}

export function placesProvider(): "google" | "none" {
  return mapsKey() ? "google" : "none";
}
