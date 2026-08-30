import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/admin";
import { TLE_EMAILS } from "@/lib/email/tle-emails";
import { hasDb, q } from "@/lib/db";
import { sendEmail } from "@/lib/resend";
import { record } from "@/lib/audit";

/**
 * Send one catalogue email to the person asking for it.
 *
 * James, 30 Aug: "in the admin section under emails, we should be able to click
 * into these emails... and then be able to send it to myself."
 *
 * ── It can only ever send to YOU ──────────────────────────────────────────
 *
 * The recipient is not a parameter. It is read from the session, so there is no
 * request anybody can craft that makes this mail a landlord — not a typo, not a
 * copied curl, not a future caller passing a field through from a form.
 *
 * That matters more than it looks. This is a button that renders any template
 * in the catalogue and sends it, which is one parameter away from being the
 * exact thing lib/email-policy exists to prevent. Taking the address from the
 * session rather than the body means the internal-only rule cannot be argued
 * with here; it is structural.
 *
 * ── Why it needs no new domain ────────────────────────────────────────────
 *
 * Staff addresses are precisely who the OS domain is FOR. So test sends work
 * today, with no waiting on the public Lettings Experts domain — the thing that
 * is blocked is mailing a real landlord, which this deliberately cannot do.
 *
 * ── The subject says TEST ─────────────────────────────────────────────────
 *
 * A rendered template landing in a colleague's inbox looking exactly like the
 * real thing is how somebody acts on an email nobody sent them. The prefix
 * makes it unmistakable, and it is added here rather than trusted to whoever
 * presses the button.
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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const me = await requireOwner(req);
  if (!me) return new NextResponse(null, { status: 404 });

  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  const entry = TLE_EMAILS.find((e) => e.id === id);
  if (!entry) return NextResponse.json({ ok: false, error: "No such email." }, { status: 404 });

  /* Rendered exactly as the preview does — including anything edited in the
     builder — so what lands in the inbox is what was on screen. A test that
     sends the version in code while the screen shows an edited one is worse
     than no test at all. */
  const index = TLE_EMAILS.indexOf(entry);
  const saved = entry.doc ? await override(index) : null;

  let subject: string;
  let html: string;
  try {
    ({ subject, html } = entry.render(
      saved ? ({ ...entry.doc!, ...saved } as typeof entry.doc) : undefined
    ));
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `That template failed to render: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 500 }
    );
  }

  try {
    await sendEmail({
      to: me.email,
      subject: `[Test] ${subject}`,
      html,
    });
  } catch (e) {
    /* The send path throws with a sentence that says which lock stopped it —
       no key, sending locked, external recipient. Passed through rather than
       flattened, because "it didn't send" is not something anybody can act on. */
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "That didn't send." },
      { status: 200 }
    );
  }

  await record({
    kind: "email_test_sent",
    actorId: me.id,
    actorEmail: me.email,
    subjectEmail: me.email,
    detail: `${entry.name}${saved ? " (edited version)" : ""}`,
  });

  return NextResponse.json({ ok: true, to: me.email, subject });
}
