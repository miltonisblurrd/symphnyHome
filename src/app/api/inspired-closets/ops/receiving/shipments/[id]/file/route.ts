import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";
import { missingReceivingTable } from "@/lib/inspired-closets-ops-receiving";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function cleanName(name: string | null | undefined): string {
  const base = String(name ?? "packing-slip.pdf").replace(/^.*[\\/]/, "").trim();
  return base.replace(/[^\w.#()-]+/g, "_") || "packing-slip.pdf";
}

async function readPdf(input: {
  storage_path?: string | null;
  public_url?: string | null;
}): Promise<Buffer | null> {
  const supabase = getSupabaseAdmin();
  if (input.storage_path) {
    const { data, error } = await supabase.storage.from("ic-field-media").download(input.storage_path);
    if (!error && data) return Buffer.from(await data.arrayBuffer());
  }
  if (input.public_url) {
    try {
      const response = await fetch(input.public_url);
      if (response.ok) return Buffer.from(await response.arrayBuffer());
    } catch {
      return null;
    }
  }
  return null;
}

export async function GET(request: Request, ctx: Ctx) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const { id } = await ctx.params;
  const wantDownload = new URL(request.url).searchParams.get("download") === "1";
  const requested = new URL(request.url).searchParams.get("path");
  const supabase = getSupabaseAdmin();
  const { data: ship, error } = await supabase
    .from("ic_shipments")
    .select("source_filename, storage_path, public_url, parse_quality, deleted_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) {
    if (missingReceivingTable(error.message)) {
      return NextResponse.json({ ok: false, error: "Receiving is not set up." }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!ship) {
    return NextResponse.json({ ok: false, error: "Shipment not found." }, { status: 404 });
  }

  const quality =
    ship.parse_quality && typeof ship.parse_quality === "object" && !Array.isArray(ship.parse_quality)
      ? (ship.parse_quality as Record<string, unknown>)
      : {};
  const lists = Array.isArray(quality.packing_lists) ? quality.packing_lists : [];
  const files = [
    {
      filename: ship.source_filename as string | null,
      storage_path: ship.storage_path as string | null,
      public_url: ship.public_url as string | null,
    },
    ...lists
      .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
      .map((row) => ({
        filename: typeof row.source_filename === "string" ? row.source_filename : null,
        storage_path: typeof row.storage_path === "string" ? row.storage_path : null,
        public_url: typeof row.public_url === "string" ? row.public_url : null,
      })),
  ];
  const picked =
    (requested
      ? files.find((file) => file.storage_path === requested || file.public_url === requested)
      : null) ?? files[0];
  if (!picked) {
    return NextResponse.json({ ok: false, error: "No slip PDF stored." }, { status: 404 });
  }

  const bytes = await readPdf(picked);
  if (!bytes) {
    return NextResponse.json({ ok: false, error: "Could not read the slip PDF." }, { status: 404 });
  }

  const filename = cleanName(picked.filename);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${wantDownload ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
