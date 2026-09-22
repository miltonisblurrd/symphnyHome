import { NextResponse } from "next/server";
import { getSupabaseAdmin, isDbConfigured } from "@/db/client";

export const runtime = "nodejs";

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files: Array<{ name: string; bytes: Buffer }>): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const local = Buffer.alloc(30);
    const sum = crc32(file.bytes);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(file.bytes.length, 18);
    local.writeUInt32LE(file.bytes.length, 22);
    parts.push(local, name, file.bytes);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(sum, 16);
    cen.writeUInt32LE(file.bytes.length, 20);
    cen.writeUInt32LE(file.bytes.length, 24);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += local.length + name.length + file.bytes.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuf, end]);
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const { id } = await ctx.params;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("ic_shipment_claims").select("photo_url").eq("id", id).maybeSingle();
  if (error || !data) {
    return NextResponse.json({ ok: false, error: error?.message ?? "Claim not found." }, { status: 404 });
  }
  let urls: string[] = [];
  try {
    const parsed = JSON.parse(String(data.photo_url ?? "[]"));
    urls = Array.isArray(parsed) ? parsed.map(String) : data.photo_url ? [String(data.photo_url)] : [];
  } catch {
    urls = data.photo_url ? [String(data.photo_url)] : [];
  }
  const files: Array<{ name: string; bytes: Buffer }> = [];
  for (let i = 0; i < urls.length; i += 1) {
    try {
      const response = await fetch(urls[i]);
      if (!response.ok) continue;
      files.push({ name: `photo-${i + 1}.jpg`, bytes: Buffer.from(await response.arrayBuffer()) });
    } catch {
      /* skip a photo that will not download */
    }
  }
  if (files.length === 0) {
    return NextResponse.json({ ok: false, error: "No photos on this claim." }, { status: 404 });
  }
  const zip = zipStore(files);
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="claim-${id.slice(0, 8)}.zip"`,
    },
  });
}
