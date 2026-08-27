import { NextResponse } from "next/server";
import {
  placesProvider,
  resolvePlace,
  suggestAddresses,
} from "@/lib/inspired-closets-google-places";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const placeId = searchParams.get("placeId")?.trim() ?? "";

  if (placeId) {
    const parts = await resolvePlace(placeId);
    if (!parts) {
      return NextResponse.json({ ok: false, error: "Address not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, parts, provider: placesProvider() });
  }

  if (query.length < 3) {
    return NextResponse.json({ ok: true, suggestions: [], provider: placesProvider() });
  }

  const suggestions = await suggestAddresses(query);
  return NextResponse.json({ ok: true, suggestions, provider: placesProvider() });
}
