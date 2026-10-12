import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";

/**
 * GET /api/gifs?q=<words> - GIFs for the team chat (12 Oct 2026), from GIPHY.
 * No words: what is trending. Rated G only, it is a workplace. The key stays
 * on the server (GIPHY_API_KEY); without it the picker says GIFs are not
 * switched on rather than failing quietly.
 *
 * What goes back is only what the picker draws: a small preview to choose
 * from and the address that is sent (lib/chat-gif checks it on the way in).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type GiphyImage = { url?: string; webp?: string; width?: string; height?: string };
type GiphyGif = { id: string; title?: string; images?: { fixed_width?: GiphyImage; fixed_width_small?: GiphyImage } };

/* Trending changes slowly; one read every few minutes serves everybody. */
let trending: { at: number; gifs: Gif[] } | null = null;
type Gif = { id: string; title: string; preview: string; url: string; width: number; height: number };

const tidy = (u: string | undefined) => (u ? u.split("?")[0]! : "");

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const key = process.env.GIPHY_API_KEY;
  if (!key) return NextResponse.json({ ok: false, error: "GIFs are not switched on yet." }, { status: 503 });

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 50);
  if (!q && trending && Date.now() - trending.at < 5 * 60_000) return NextResponse.json({ ok: true, gifs: trending.gifs });

  const url = q
    ? `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&limit=24&rating=g&lang=en`
    : `https://api.giphy.com/v1/gifs/trending?api_key=${encodeURIComponent(key)}&limit=24&rating=g`;
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { data?: GiphyGif[] };
    const gifs: Gif[] = (j.data ?? [])
      .map((g) => {
        const fw = g.images?.fixed_width ?? {};
        const small = g.images?.fixed_width_small ?? fw;
        return {
          id: g.id,
          title: g.title ?? "",
          preview: tidy(small.webp || small.url),
          url: tidy(fw.url),
          width: Number(fw.width) || 200,
          height: Number(fw.height) || 150,
        };
      })
      .filter((g) => g.url && g.preview);
    if (!q) trending = { at: Date.now(), gifs };
    return NextResponse.json({ ok: true, gifs });
  } catch {
    return NextResponse.json({ ok: false, error: "GIFs could not be fetched just now." }, { status: 502 });
  }
}
