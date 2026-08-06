import { NextRequest, NextResponse } from "next/server";

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(req: NextRequest) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  const expected = process.env.OS_ACCESS_CODE;

  // No code configured → dev, gate open; the middleware never sends anyone here.
  if (!expected) return NextResponse.json({ ok: true });

  if (!code || code.trim() !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("os-key", await sha256(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30, // a month — long enough for the preview period
    path: "/",
  });
  return res;
}
