import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/admin";
import { TLE_EMAILS } from "@/lib/email/tle-emails";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";

/**
 * Edited copy is stored in os_email_templates under a campaign id of
 * CATALOG. It cannot go through /api/email-templates: that route's
 * knownStep() guard deliberately refuses any campaign not declared in code,
 * so copy stored against a made-up id would be stranded. Same table, own
 * door, and this one is owner-only because these emails go out under the
 * company's name rather than one agent's.
 */
const CATALOG = "email-catalog";

async function override(index: number) {
  if (!hasDb()) return null;
  const rows = await q<{ subject: string; blocks: Record<string, unknown>[] }>(
    `SELECT subject, blocks FROM os_email_templates WHERE campaign_id = $1 AND step_index = $2`,
    [CATALOG, index]
  ).catch(() => []);
  const row = rows[0];
  if (!row || !Array.isArray(row.blocks) || row.blocks.length === 0) return null;
  return { subject: row.subject, blocks: row.blocks };
}

/**
 * The email catalogue, rendered.
 *
 * Owner-only, and 404 rather than 403 for the same reason as the rest of the
 * admin API: a 403 confirms the route exists.
 *
 * Two shapes on purpose. The LIST is metadata only, because rendering nine
 * full HTML documents to draw a list of titles is a quarter of a megabyte
 * nobody reads. One email's HTML comes back only when somebody opens it.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireOwner(req))) return new NextResponse(null, { status: 404 });

  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const entry = TLE_EMAILS.find((e) => e.id === id);
    if (!entry) return NextResponse.json({ ok: false, error: "No such email." }, { status: 404 });
    const index = TLE_EMAILS.indexOf(entry);
    const saved = entry.doc ? await override(index) : null;
    try {
      const { subject, html } = entry.render(
        saved ? ({ ...entry.doc!, ...saved } as typeof entry.doc) : undefined
      );
      return NextResponse.json({
        ok: true,
        id: entry.id,
        name: entry.name,
        subject,
        html,
        index,
        /* The document as it stands, so the builder opens on what is on
           screen rather than on the version in code. */
        doc: entry.doc ? (saved ?? { subject: entry.doc.subject, blocks: entry.doc.blocks }) : null,
        edited: Boolean(saved),
      });
    } catch (e) {
      /* A template that throws must say WHICH one and why. The catalogue is
         the last place an email is looked at before it goes to a partner, so
         a silent blank preview here is worse than an error on the page. */
      return NextResponse.json(
        {
          ok: false,
          error: `"${entry.name}" failed to render: ${e instanceof Error ? e.message : "unknown"}`,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    rows: TLE_EMAILS.map((e) => ({
      id: e.id,
      group: e.group,
      name: e.name,
      audience: e.audience,
      trigger: e.trigger,
      fires: e.fires,
      to: e.to,
      draft: Boolean(e.draft),
      editable: Boolean(e.doc),
      summary: e.summary,
    })),
  });
}

/** Save Francesca's edit. Owner-only, same as reading. */
export async function PUT(req: NextRequest) {
  const me = await requireOwner(req);
  if (!me) return new NextResponse(null, { status: 404 });

  const body = (await req.json().catch(() => null)) as {
    campaignId?: string;
    stepIndex?: number;
    subject?: string;
    blocks?: Record<string, unknown>[];
  } | null;

  const index = Number(body?.stepIndex);
  const entry = TLE_EMAILS[index];
  if (!Number.isInteger(index) || !entry?.doc) {
    return NextResponse.json({ error: "That isn't an editable email." }, { status: 400 });
  }
  if (!Array.isArray(body?.blocks)) {
    return NextResponse.json({ error: "Blocks must be a list." }, { status: 400 });
  }
  if (!hasDb()) {
    return NextResponse.json({ saved: false, reason: "No database on this environment." });
  }

  await q(
    `INSERT INTO os_email_templates (id, campaign_id, step_index, subject, blocks, updated_by)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (campaign_id, step_index) DO UPDATE
       SET subject = EXCLUDED.subject,
           blocks = EXCLUDED.blocks,
           updated_at = NOW(),
           updated_by = EXCLUDED.updated_by`,
    [uid(), CATALOG, index, body?.subject ?? "", JSON.stringify(body.blocks), me.id]
  );
  return NextResponse.json({ saved: true });
}

/** Back to the words in code. The only undo anyone actually needs. */
export async function DELETE(req: NextRequest) {
  if (!(await requireOwner(req))) return new NextResponse(null, { status: 404 });
  const index = Number(req.nextUrl.searchParams.get("step"));
  if (!Number.isInteger(index)) {
    return NextResponse.json({ error: "Which one?" }, { status: 400 });
  }
  if (!hasDb()) return NextResponse.json({ saved: false, reason: "No database here." });
  await q(`DELETE FROM os_email_templates WHERE campaign_id = $1 AND step_index = $2`, [
    CATALOG,
    index,
  ]);
  return NextResponse.json({ saved: true, reverted: true });
}
