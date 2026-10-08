import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isDbConfigured } from "@/db/client";
import { IC_STAFF_ID_COOKIE, IC_STAFF_ROLE_COOKIE } from "@/lib/inspired-closets-ops-field";
import { isInventoryRole } from "@/lib/inspired-closets-ops-roles";
import { loadWarehouseTodo } from "@/lib/inspired-closets-ops-warehouse-todo";

export const runtime = "nodejs";

async function gate(): Promise<NextResponse | null> {
  const jar = await cookies();
  const role = jar.get(IC_STAFF_ROLE_COOKIE)?.value ?? null;
  if (isInventoryRole(role)) {
    return NextResponse.json(
      { ok: false, error: "Your login is limited to Inventory and Receiving." },
      { status: 403 },
    );
  }
  if (!jar.get(IC_STAFF_ID_COOKIE)?.value) {
    return NextResponse.json({ ok: false, error: "Sign in to use the warehouse." }, { status: 401 });
  }
  return null;
}

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ ok: false, error: "Database not configured." }, { status: 503 });
  }
  const denied = await gate();
  if (denied) return denied;
  const result = await loadWarehouseTodo();
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, hint: result.hint },
      { status: result.status },
    );
  }
  return NextResponse.json(result);
}
