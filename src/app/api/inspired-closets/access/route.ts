import { NextResponse } from "next/server";
import {
  INSPIRED_CLOSETS_ACCESS_COOKIE,
  createInspiredClosetsAccessToken,
  getExpectedInspiredClosetsAccessToken,
  isInspiredClosetsAccessEnabled,
} from "@/lib/inspired-closets-access";

export async function POST(request: Request) {
  if (!isInspiredClosetsAccessEnabled()) {
    return NextResponse.json(
      { error: "Prototype access is not configured." },
      { status: 503 },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: string };
    password = body.password?.trim() ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const token = await createInspiredClosetsAccessToken(password);
  if (!token) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: INSPIRED_CLOSETS_ACCESS_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  return response;
}

export async function GET(request: Request) {
  if (!isInspiredClosetsAccessEnabled()) {
    return NextResponse.json({ enabled: false, authorized: true });
  }

  const cookie = request.headers.get("cookie") ?? "";
  const token = await getExpectedInspiredClosetsAccessToken();
  const authorized = Boolean(token && cookie.includes(`${INSPIRED_CLOSETS_ACCESS_COOKIE}=${token}`));
  return NextResponse.json({ enabled: true, authorized });
}
