/**
 * Address autocomplete for Des intake.
 * Google Places when INSPIRED_CLOSETS_GOOGLE_MAPS_API_KEY is set;
 * otherwise Photon (OpenStreetMap) so the walkthrough still fills street/city/state/zip.
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
  provider: "google" | "osm";
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

function mapsKey(): string | null {
  return process.env.INSPIRED_CLOSETS_GOOGLE_MAPS_API_KEY?.trim() || null;
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

type GooglePrediction = {
  description?: string;
  place_id?: string;
};

type GoogleComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

function component(
  parts: GoogleComponent[],
  type: string,
  short = false,
): string {
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

async function googleAutocomplete(query: string): Promise<PlaceSuggestion[] | null> {
  const key = mapsKey();
  if (!key) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", query);
  url.searchParams.set("types", "address");
  url.searchParams.set("components", "country:us");
  url.searchParams.set("location", `${LAS_VEGAS.lat},${LAS_VEGAS.lng}`);
  url.searchParams.set("radius", "80000");
  url.searchParams.set("key", key);
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    status?: string;
    predictions?: GooglePrediction[];
  };
  if (payload.status !== "OK" && payload.status !== "ZERO_RESULTS") return null;
  return (payload.predictions ?? [])
    .filter((p) => p.place_id && p.description)
    .map((p) => ({
      id: `g:${p.place_id}`,
      label: p.description as string,
      provider: "google" as const,
    }));
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
  if (payload.status !== "OK" || !payload.result?.address_components) return null;
  return partsFromGoogle(payload.result.address_components);
}

type PhotonProps = {
  osm_id?: number;
  name?: string;
  street?: string;
  housenumber?: string;
  city?: string;
  locality?: string;
  district?: string;
  postcode?: string;
  state?: string;
  country?: string;
};

function partsFromPhoton(props: PhotonProps): AddressParts {
  const street =
    streetLine(props.housenumber, props.street) || (props.name ?? "").trim();
  return {
    street,
    city: props.city || props.locality || props.district || "",
    state: toStateAbbr(props.state),
    zip: props.postcode ?? "",
    country: props.country || "United States",
  };
}

function photonLabel(props: PhotonProps, parts: AddressParts): string {
  const line = [parts.street, [parts.city, parts.state].filter(Boolean).join(", "), parts.zip]
    .filter(Boolean)
    .join(", ");
  return line || props.name || "Address";
}

async function photonAutocomplete(query: string): Promise<PlaceSuggestion[]> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "6");
  url.searchParams.set("lat", String(LAS_VEGAS.lat));
  url.searchParams.set("lon", String(LAS_VEGAS.lng));
  url.searchParams.set("lang", "en");
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "InspiredClosetsOS/1.0 (www.symphny.xyz)" },
  });
  if (!response.ok) return [];
  const payload = (await response.json()) as {
    features?: Array<{ properties?: PhotonProps }>;
  };
  const seen = new Set<string>();
  const suggestions: PlaceSuggestion[] = [];
  for (const feature of payload.features ?? []) {
    const props = feature.properties ?? {};
    const parts = partsFromPhoton(props);
    if (!parts.street) continue;
    const label = photonLabel(props, parts);
    if (seen.has(label)) continue;
    seen.add(label);
    suggestions.push({
      id: `o:${props.osm_id ?? label}`,
      label,
      provider: "osm",
      parts,
    });
  }
  return suggestions.slice(0, 6);
}

export async function suggestAddresses(query: string): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  try {
    const google = await googleAutocomplete(trimmed);
    if (google && google.length > 0) return google;
    if (google && google.length === 0 && mapsKey()) return [];
  } catch {
    /* fall through to Photon */
  }
  try {
    return await photonAutocomplete(trimmed);
  } catch {
    return [];
  }
}

export async function resolvePlace(id: string): Promise<AddressParts | null> {
  if (id.startsWith("g:")) {
    return googleDetails(id.slice(2));
  }
  return null;
}

export function placesProvider(): "google" | "osm" {
  return mapsKey() ? "google" : "osm";
}
