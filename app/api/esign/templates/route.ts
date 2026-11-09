import { NextResponse } from "next/server";
import { esignTemplates } from "@/lib/rex-esign";
import { rexConfigured } from "@/lib/rex";

/**
 * TLE's contract templates, live from REX.
 *
 * Read rather than stored: a template's DocuSign id changes whenever the
 * document is re-uploaded, and a stale copy in our own database would send
 * last year's terms of business without anybody noticing. REX is the source.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* Two minutes (9 Nov 2026): every listing page asked REX for the same
   template list on opening - over half a second each time, 239 times last
   week. A re-upload still shows within two minutes, which is the same
   allowance the listing itself is shown with. An empty or failed read is
   never kept. */
const HOLD_MS = 2 * 60 * 1000;
const G = globalThis as { __osEsignTemplates?: { at: number; p: Promise<Awaited<ReturnType<typeof esignTemplates>>> } };

export async function GET() {
  if (!rexConfigured()) {
    return NextResponse.json({ ok: false, error: "REX isn't connected here." }, { status: 503 });
  }
  const held = G.__osEsignTemplates;
  if (!held || Date.now() - held.at > HOLD_MS) {
    const entry = { at: Date.now(), p: esignTemplates() };
    G.__osEsignTemplates = entry;
    entry.p.then(
      (t) => { if (!t.length && G.__osEsignTemplates === entry) G.__osEsignTemplates = undefined; },
      () => { if (G.__osEsignTemplates === entry) G.__osEsignTemplates = undefined; }
    );
  }
  return NextResponse.json({ ok: true, templates: await G.__osEsignTemplates!.p.catch(() => []) });
}
